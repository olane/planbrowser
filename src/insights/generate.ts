import fs from 'fs';
import path from 'path';
import type {
  ApplicationInsights,
  Comment,
  DocumentMeta,
  InsightImage,
  InsightPage,
  InsightsProgress,
} from '../types.js';
import { resolveApplicationMeta } from '../storage.js';
import { profileDocument, type DocumentProfile } from './keywords.js';
import { classifyPage } from './classify.js';
import { selectImages, type SelectionResult } from './select.js';
import { KIND_ORDER } from './kinds.js';
import { selectDocumentPages, LARGE_IMAGE_AREA, type ScannedPage } from './pages.js';
import { pageTitleScore } from './title.js';
import { insightsLog } from './log.js';
import { buildSummary, tallyComments } from './summary.js';
import { isPdf, type PageScan } from './render.js';
import { FeatureStore, type DocumentHandle } from './features.js';
import { INSIGHTS_VERSION, assetPath, pruneAssets, readInsights, writeInsights } from './cache.js';

// The pipeline: rank documents by name, choose pages, gather page facts (from
// the feature cache where possible), interpret them and select the gallery.
// Background job/state handling lives in jobs.ts.

// Bump when interpretation changes (classify/select/page choice); cached
// insights then refresh in the background, reusing all cached page facts.
export const STRATEGY = { id: 'heuristic', version: 14 };

export const THUMB_WIDTH = 1400;

// Cost caps: analysis is expensive on a cold cache. Documents are ranked by
// prior, then pages are chosen per document (a cheap embedded-image pre-scan
// finds renders that sit deep inside a statement) and rendered until these
// limits are hit. Budgets count pages *considered*, whether or not their facts
// were cached, so a warm and a cold run give the same result.
interface Budget {
  maxDocs: number;
  maxPages: number;
  // Known drawing/photo documents carry their visual on the first page or two.
  pagesPerDoc: number;
  // Statement/appendix documents can hold many distinct renders spread across
  // their pages, so give them a little more room.
  visualDocPages: number;
  // The Design & Access Statement is the closest thing to a human summary of
  // the scheme, but it mixes prose, plans, photos and renders.
  dasPages: number;
  // Visual-impact photo appendices must not monopolise the render budget.
  photoPageQuota: number;
  // Bounds for the embedded-image pre-scan.
  prescanPagesPerDoc: number;
  prescanPagesTotal: number;
}

const QUICK_BUDGET: Budget = {
  maxDocs: 40,
  maxPages: 40,
  pagesPerDoc: 4,
  visualDocPages: 8,
  dasPages: 14,
  photoPageQuota: 8,
  prescanPagesPerDoc: 40,
  prescanPagesTotal: 240,
};

// Deep scan: user-triggered, scans more documents and pages.
const DEEP_BUDGET: Budget = {
  maxDocs: 120,
  maxPages: 120,
  pagesPerDoc: 6,
  visualDocPages: 12,
  dasPages: 20,
  photoPageQuota: 16,
  prescanPagesPerDoc: 80,
  prescanPagesTotal: 1500,
};

// One interpreted page, for tooling (contact sheet, eval): accepted and
// rejected pages alike, with the classifier's reason.
export type PageTrace = InsightPage;

export interface GenerateOptions {
  force?: boolean;
  // Scan more documents and pages. Slower, but finds visuals a quick run misses.
  deep?: boolean;
  // Cooperative cancellation, checked between documents and pages. An aborted
  // run throws and never writes a complete cache.
  signal?: AbortSignal;
  trace?: (entry: PageTrace) => void;
  // Live counters, called after every page. Cheap; safe to call often.
  onProgress?: (progress: InsightsProgress) => void;
  // A partial result published while the run proceeds, throttled by the
  // pipeline. Carries `complete: false`; the caller decides what to do with it
  // (the server writes it to the cache so the UI can stream images in).
  onSnapshot?: (insights: ApplicationInsights) => void;
}

function abortIfCancelled(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  const error = new Error('Insights generation cancelled');
  error.name = 'AbortError';
  throw error;
}

// How often a partial snapshot is published during a run. Bounds the disk write
// cost while keeping the UI responsive; progress counters update on every page.
const SNAPSHOT_INTERVAL_MS = 2000;

export function documentList(meta: { documents?: DocumentMeta[] }): DocumentMeta[] {
  const seen = new Set<string>();
  return (meta.documents ?? []).filter((d) => {
    if (!d.localFilename || seen.has(d.localFilename)) {
      return false;
    }
    seen.add(d.localFilename);
    return true;
  });
}

export function sourceSignature(dir: string, docs: DocumentMeta[]): ApplicationInsights['source'] {
  const out: ApplicationInsights['source'] = [];
  for (const doc of docs) {
    try {
      const stat = fs.statSync(path.join(dir, doc.localFilename));
      out.push({ filename: doc.localFilename, mtimeMs: stat.mtimeMs, size: stat.size });
    } catch {
      // File not on disk (download still in progress): omit; cache will refresh later.
    }
  }
  return out;
}

function sameSource(a: ApplicationInsights['source'], b: ApplicationInsights['source']): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const key = (s: { filename: string; mtimeMs: number; size: number }) => `${s.filename}:${s.mtimeMs}:${s.size}`;
  const set = new Set(a.map(key));
  return b.every((s) => set.has(key(s)));
}

// Cached insights are current when the same strategy produced them from the
// same source files. A partial snapshot (an interrupted run) has `complete:
// false` and is never current, so it is regenerated rather than served.
export function isCurrent(insights: ApplicationInsights, source: ApplicationInsights['source']): boolean {
  return (
    insights.strategy.id === STRATEGY.id &&
    insights.strategy.version === STRATEGY.version &&
    insights.complete !== false &&
    sameSource(insights.source, source)
  );
}

function readComments(dir: string): Comment[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, 'comments.json'), 'utf-8'));
    return Array.isArray(parsed) ? (parsed as Comment[]) : [];
  } catch {
    return [];
  }
}

// Which pages of this document are worth looking at: a named drawing/photo
// document carries its visual on the titled front pages, everything else is
// pre-scanned for embedded figures. Photo documents have their own budget.
interface DocumentRole {
  frontPages: boolean;
  isPhotoDoc: boolean;
}

function documentRole(profile: DocumentProfile): DocumentRole {
  return {
    frontPages: Boolean(profile.prior.kind) || (profile.drawing && !profile.visualName),
    isPhotoDoc: profile.prior.kind === 'photo',
  };
}

// Rank the documents worth opening, best first. The Design & Access Statement
// leads regardless of its name-based prior: it is the closest thing to a human
// summary of the scheme and carries its own figures, so it must clear maxDocs.
// Everything else follows the weak name/type prior.
export function rankDocuments(docs: DocumentMeta[]): { doc: DocumentMeta; profile: DocumentProfile }[] {
  return docs
    .map((doc) => ({ doc, profile: profileDocument(doc) }))
    .filter((entry) => entry.profile.prior.score > 0)
    .sort(
      (a, b) =>
        Number(b.profile.designAndAccess) - Number(a.profile.designAndAccess) ||
        b.profile.prior.score - a.profile.prior.score,
    );
}

// The documents this run will actually consider: ranked, capped to the
// document budget, and limited to PDFs whose name/role makes scanning useful.
// Progress is reported against this list (not the application's whole document
// set), so it starts at a meaningful total and reaches it when the run ends.
function planDocuments(
  ranked: { doc: DocumentMeta; profile: DocumentProfile }[],
  budget: Budget
): { doc: DocumentMeta; profile: DocumentProfile }[] {
  return ranked.slice(0, budget.maxDocs).filter(({ doc, profile }) => {
    if (!isPdf(doc.localFilename)) return false;
    const { frontPages } = documentRole(profile);
    return frontPages || Boolean(profile.visualName);
  });
}

// Pre-scan a document's pages for the embedded-image signal without rasterising
// them. Every page is checked (a statement mixes body text with figures, so
// text length is not a safe filter); `takeBudget` meters pages across the run.
async function scanDocumentPages(
  handle: DocumentHandle,
  textLengths: number[],
  maxPages: number,
  takeBudget: () => boolean,
  signal: AbortSignal | undefined,
): Promise<{ scanned: ScannedPage[]; scans: Map<number, PageScan> }> {
  const limit = Math.min(Math.max(textLengths.length, 1), maxPages);
  const scanned: ScannedPage[] = [];
  const scans = new Map<number, PageScan>();
  for (let page = 1; page <= limit; page++) {
    abortIfCancelled(signal);
    let imageCount = 0;
    let largestImageArea = 0;
    if (takeBudget()) {
      const scan = await handle.scan(page);
      scans.set(page, scan);
      imageCount = scan.imageCount;
      largestImageArea = scan.largestImageArea;
    }
    scanned.push({ page, textLength: textLengths[page - 1] ?? 0, imageCount, largestImageArea });
  }
  return { scanned, scans };
}

// Mutable state shared across the whole run. `capped` records that a budget
// actually stopped us short, so `coverage.partial` does not fire merely because
// a run happened to use its last page.
interface RunCounters {
  pagesRendered: number;
  photoPagesRendered: number;
  documentsAnalysed: number;
  documentsProcessed: number;
  prescanPages: number;
  capped: boolean;
}

interface Analysis {
  reference: string;
  budget: Budget;
  store: FeatureStore;
  counters: RunCounters;
  candidates: InsightImage[];
  interpreted: InsightPage[];
  signal: AbortSignal | undefined;
  trace: ((entry: PageTrace) => void) | undefined;
  // Record how far through the current document's chosen pages we are.
  setPage: (page: number, total: number) => void;
  // Report live counters (called after every rendered page).
  report: () => void;
  // Publish a throttled partial snapshot (no-op when no sink is configured).
  snapshot: () => void;
}

function takePrescanBudget(counters: RunCounters, budget: Budget): boolean {
  if (counters.prescanPages >= budget.prescanPagesTotal) {
    return false;
  }
  counters.prescanPages++;
  return true;
}

// Analyse one document: pick its pages, gather page facts (cache-first), render
// and classify them, and collect the accepted images. Counters are advanced in
// place; the caller decides whether there is budget to reach the next document.
async function analyseDocument(doc: DocumentMeta, profile: DocumentProfile, run: Analysis): Promise<void> {
  abortIfCancelled(run.signal);
  const { frontPages, isPhotoDoc } = documentRole(profile);
  const { counters, budget, store } = run;

  const handle = store.document(doc.localFilename);
  if (!handle) {
    return;
  }

  try {
    const lines = await handle.lines();
    if (handle.failed) {
      return;
    }
    counters.documentsAnalysed++;

    // Known drawing/photo documents put their visual on their titled pages;
    // everything else is scanned for large embedded images so a render buried
    // in a statement is still found.
    const { scanned, scans } = frontPages
      ? { scanned: [], scans: new Map<number, PageScan>() }
      : await scanDocumentPages(
          handle,
          lines.map((page) => page.reduce((sum, line) => sum + line.str.length + 1, 0)),
          budget.prescanPagesPerDoc,
          () => takePrescanBudget(counters, budget),
          run.signal,
        );
    const pageCap = frontPages ? budget.pagesPerDoc : profile.designAndAccess ? budget.dasPages : budget.visualDocPages;
    const titleScores = frontPages ? lines.map(pageTitleScore) : [];
    const pages = selectDocumentPages(frontPages, lines.length, scanned, pageCap, titleScores);
    if (pages.length === 0) {
      return;
    }
    run.setPage(0, pages.length);

    const renderedPages: number[] = [];
    let docImages = 0;
    for (const page of pages) {
      abortIfCancelled(run.signal);
      if (counters.pagesRendered >= budget.maxPages) {
        counters.capped = true;
        break;
      }
      if (isPhotoDoc && counters.photoPagesRendered >= budget.photoPageQuota) {
        counters.capped = true;
        break;
      }
      // Budget on render *attempts*, not just accepted pages, so a document
      // full of non-visual pages cannot push us far past maxPages.
      counters.pagesRendered++;
      if (isPhotoDoc) {
        counters.photoPagesRendered++;
      }
      renderedPages.push(page);
      run.setPage(renderedPages.length, pages.length);
      run.report();

      const render = await handle.render(page, THUMB_WIDTH);
      if (!render) {
        continue;
      }
      const scan = scans.get(page);
      const hasLargeImage = (scan?.largestImageArea ?? 0) >= LARGE_IMAGE_AREA;
      const classification = classifyPage(profile, lines[page - 1] ?? [], render.pixels, {
        hasLargeImage,
        // The caption beside an embedded figure distinguishes a render from a
        // photo when the document name does not.
        caption: hasLargeImage ? scan?.caption : '',
      });
      const entry: InsightPage = {
        localFilename: doc.localFilename,
        page,
        kind: classification.kind,
        score: Math.round(classification.score),
        reason: classification.reason,
        imageFile: render.imageFile,
      };
      run.interpreted.push(entry);
      run.trace?.(entry);
      run.snapshot();
      if (classification.score <= 0) {
        continue;
      }

      docImages++;
      run.candidates.push({
        id: render.imageFile.replace(/\.png$/, ''),
        kind: classification.kind,
        label: classification.label,
        localFilename: doc.localFilename,
        page,
        imageFile: render.imageFile,
        width: render.pixels.width,
        height: render.pixels.height,
        score: Math.round(classification.score),
        phash: render.pixels.phash,
        reason: classification.reason,
      });
    }
    insightsLog(
      `${run.reference}: ${doc.description || doc.localFilename} — pages [${renderedPages.join(', ')}] → ${docImages} image(s)`,
    );
  } finally {
    await handle.close();
    store.save(false);
  }
}

export async function generateInsights(
  reference: string,
  authorityId?: string,
  opts: GenerateOptions = {},
): Promise<ApplicationInsights | null> {
  const resolved = resolveApplicationMeta(reference, authorityId);
  if (!resolved) {
    return null;
  }
  const { meta, dir } = resolved;

  const docs = documentList(meta);
  const source = sourceSignature(dir, docs);
  const depth: 'quick' | 'deep' = opts.deep ? 'deep' : 'quick';
  const budget = opts.deep ? DEEP_BUDGET : QUICK_BUDGET;

  if (!opts.force) {
    const cached = readInsights(dir);
    if (cached && isCurrent(cached, source) && (cached.depth ?? 'quick') === depth) {
      return cached;
    }
  }

  const store = new FeatureStore(dir, { captionMinArea: LARGE_IMAGE_AREA });

  const rankedAll = rankDocuments(docs);
  const planned = planDocuments(rankedAll, budget);

  const counters: RunCounters = {
    pagesRendered: 0,
    photoPagesRendered: 0,
    documentsAnalysed: 0,
    documentsProcessed: 0,
    prescanPages: 0,
    // Documents beyond maxDocs were never considered, so the run is partial.
    capped: rankedAll.length > budget.maxDocs,
  };
  // The candidates and interpreted pages gathered as the run proceeds. Held
  // here (rather than on `run`) so the snapshot closure below can read them.
  const candidates: InsightImage[] = [];
  const interpreted: InsightPage[] = [];

  const summary = buildSummary(meta, docs);
  const comments = tallyComments(readComments(dir));

  let phase: InsightsProgress['phase'] = 'scanning';
  let currentDocument: string | undefined;
  let currentPage: number | undefined;
  let currentDocumentPages: number | undefined;
  const liveProgress = (): InsightsProgress => ({
    phase,
    documentsAnalysed: counters.documentsAnalysed,
    documentsProcessed: counters.documentsProcessed,
    documentsTotal: planned.length,
    pagesRendered: counters.pagesRendered,
    ...(currentDocument ? { currentDocument } : {}),
    ...(currentPage !== undefined && currentDocumentPages !== undefined
      ? { currentPage, currentDocumentPages }
      : {}),
  });

  // Build an ApplicationInsights from the candidates gathered so far. Used for
  // both the throttled partial snapshots and the final result, so the two share
  // one shape and the UI renders either the same way.
  const buildInsights = (selection: SelectionResult, complete: boolean): ApplicationInsights => ({
    version: INSIGHTS_VERSION,
    strategy: STRATEGY,
    generatedAt: new Date().toISOString(),
    source,
    summary,
    images: selection.images,
    found: selection.deduped,
    depth,
    comments,
    // Accepted and rejected pages alike, for the review UI (false negatives).
    pages: interpreted,
    coverage: {
      images: KIND_ORDER.map((kind) => ({
        kind,
        selected: selection.images.filter((image) => image.kind === kind).length,
        available: selection.available[kind],
      })).filter((entry) => entry.available > 0),
      // True only when a budget actually cut candidates off; "available" is then
      // a lower bound and some documents were never scanned.
      partial: counters.capped,
      documentsAnalysed: counters.documentsAnalysed,
      documentsTotal: docs.length,
    },
    progress: liveProgress(),
    complete,
  });

  // A partial snapshot must not reference thumbnails that are not on disk yet: a
  // warm run can select a page whose asset was pruned by a previous run and is
  // only re-rendered at the end, which would show as a broken tile mid-scan.
  const snapshot = (): ApplicationInsights => {
    const selection = selectImages(candidates);
    const onDisk = (image: InsightImage) => fs.existsSync(assetPath(dir, image.imageFile));
    return buildInsights(
      { ...selection, images: selection.images.filter(onDisk), deduped: selection.deduped.filter(onDisk) },
      false,
    );
  };

  let lastSnapshotAt = 0;
  const report = (): void => opts.onProgress?.(liveProgress());
  const publishSnapshot = (): void => {
    if (!opts.onSnapshot) {
      return;
    }
    const now = Date.now();
    if (now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) {
      return;
    }
    lastSnapshotAt = now;
    opts.onSnapshot(snapshot());
  };

  const run: Analysis = {
    reference,
    budget,
    store,
    counters,
    candidates,
    interpreted,
    signal: opts.signal,
    trace: opts.trace,
    setPage: (page, total) => {
      currentPage = page;
      currentDocumentPages = total;
    },
    report,
    snapshot: publishSnapshot,
  };
  const startedAt = Date.now();

  insightsLog(`${reference}: ${docs.length} documents, ${depth} scan of ${planned.length}`);

  report();
  for (const { doc, profile } of planned) {
    abortIfCancelled(opts.signal);
    currentDocument = doc.description || doc.localFilename;
    report();

    const { isPhotoDoc } = documentRole(profile);
    if (counters.pagesRendered >= budget.maxPages) {
      counters.capped = true;
    } else if (isPhotoDoc && counters.photoPagesRendered >= budget.photoPageQuota) {
      // Visual-impact photo appendices add little once the photo budget is
      // spent, and would otherwise crowd out plans and renders.
      counters.capped = true;
    } else {
      await analyseDocument(doc, profile, run);
    }

    counters.documentsProcessed++;
    currentDocument = undefined;
    currentPage = undefined;
    currentDocumentPages = undefined;
    report();
  }

  phase = 'finalising';
  report();

  const selection = selectImages(candidates);
  const images = selection.images;
  const found = selection.deduped;

  // Every found image needs its thumbnail on disk. A cached page whose asset
  // was pruned earlier (it was not in the gallery then) is re-rendered here.
  for (const image of found) {
    abortIfCancelled(opts.signal);
    if (fs.existsSync(assetPath(dir, image.imageFile))) {
      continue;
    }
    const handle = store.document(image.localFilename);
    const imageFile = await handle?.ensureAsset(image.page, THUMB_WIDTH);
    await handle?.close();
    if (imageFile) {
      image.imageFile = imageFile;
      image.id = imageFile.replace(/\.png$/, '');
    }
  }
  abortIfCancelled(opts.signal);
  store.save();
  // Keep every distinct candidate's thumbnail (not just the curated highlights)
  // so the UI can offer "show all found"; unreferenced assets are pruned.
  pruneAssets(dir, new Set(found.map((image) => image.imageFile)));

  abortIfCancelled(opts.signal);
  const insights = buildInsights(selection, true);
  writeInsights(dir, insights);
  const { work } = store;
  insightsLog(
    `${reference}: done — ${images.length} highlights (${found.length} found) from ${counters.documentsAnalysed} documents in ` +
      `${((Date.now() - startedAt) / 1000).toFixed(0)}s (rendered ${work.rendered}, scanned ${work.scanned}, ` +
      `opened ${work.opened} PDFs; the rest from cache)`,
  );
  return insights;
}
