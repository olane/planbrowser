import fs from 'fs';
import path from 'path';
import type { ApplicationInsights, Comment, DocumentMeta, InsightImage } from '../types.js';
import { resolveApplicationMeta } from '../storage.js';
import { profileDocument, type DocumentProfile } from './keywords.js';
import { classifyPage } from './classify.js';
import { selectImages, KIND_ORDER } from './select.js';
import { selectDocumentPages, LARGE_IMAGE_AREA, type ScannedPage } from './pages.js';
import { pageTitleScore } from './title.js';
import { insightsLog } from './log.js';
import { buildSummary, tallyComments } from './summary.js';
import { isPdf, type PageScan } from './render.js';
import { FeatureStore, type DocumentHandle, type FeatureWork } from './features.js';
import { INSIGHTS_VERSION, assetPath, pruneAssets, readInsights, writeInsights } from './cache.js';

// The pipeline: rank documents by name, choose pages, gather page facts (from
// the feature cache where possible), interpret them and select the gallery.
// Background job/state handling lives in jobs.ts.

// Bump when interpretation changes (classify/select/page choice); cached
// insights then refresh in the background, reusing all cached page facts.
export const STRATEGY = { id: 'heuristic', version: 12 };

const THUMB_WIDTH = 1400;

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
  prescanPagesTotal: 240
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
  prescanPagesTotal: 1500
};

// One interpreted page, for tooling (contact sheet, eval): accepted and
// rejected pages alike, with the classifier's reason.
export interface PageTrace {
  localFilename: string;
  page: number;
  kind: InsightImage['kind'];
  score: number;
  reason: string;
  imageFile: string;
}

export interface GenerateOptions {
  force?: boolean;
  // Scan more documents and pages. Slower, but finds visuals a quick run misses.
  deep?: boolean;
  trace?: (entry: PageTrace) => void;
  // Cache misses the run incurred (PDFs opened, pages scanned/rendered), for
  // tooling that checks the page-facts cache (`insights-eval --cache-check`).
  onWork?: (work: FeatureWork) => void;
}

export function documentList(meta: { documents?: DocumentMeta[] }): DocumentMeta[] {
  const seen = new Set<string>();
  return (meta.documents ?? []).filter((d) => {
    if (!d.localFilename || seen.has(d.localFilename)) return false;
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
  if (a.length !== b.length) return false;
  const key = (s: { filename: string; mtimeMs: number; size: number }) => `${s.filename}:${s.mtimeMs}:${s.size}`;
  const set = new Set(a.map(key));
  return b.every((s) => set.has(key(s)));
}

// Cached insights are current when the same strategy produced them from the
// same source files.
export function isCurrent(insights: ApplicationInsights, source: ApplicationInsights['source']): boolean {
  return (
    insights.strategy.id === STRATEGY.id &&
    insights.strategy.version === STRATEGY.version &&
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

// Pre-scan a document's pages for the embedded-image signal without rasterising
// them. Every page is checked (a statement mixes body text with figures, so
// text length is not a safe filter); `takeBudget` meters pages across the run.
async function scanDocumentPages(
  handle: DocumentHandle,
  textLengths: number[],
  maxPages: number,
  takeBudget: () => boolean
): Promise<{ scanned: ScannedPage[]; scans: Map<number, PageScan> }> {
  const limit = Math.min(Math.max(textLengths.length, 1), maxPages);
  const scanned: ScannedPage[] = [];
  const scans = new Map<number, PageScan>();
  for (let page = 1; page <= limit; page++) {
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

export async function generateInsights(
  reference: string,
  authorityId?: string,
  opts: GenerateOptions = {}
): Promise<ApplicationInsights | null> {
  const resolved = resolveApplicationMeta(reference, authorityId);
  if (!resolved) return null;
  const { meta, dir } = resolved;

  const docs = documentList(meta);
  const source = sourceSignature(dir, docs);
  const depth: 'quick' | 'deep' = opts.deep ? 'deep' : 'quick';
  const budget = opts.deep ? DEEP_BUDGET : QUICK_BUDGET;

  if (!opts.force) {
    const cached = readInsights(dir);
    if (cached && isCurrent(cached, source) && (cached.depth ?? 'quick') === depth) return cached;
  }

  const store = new FeatureStore(dir, { captionMinArea: LARGE_IMAGE_AREA });

  const rankedAll: { doc: DocumentMeta; profile: DocumentProfile }[] = docs
    .map((doc) => ({ doc, profile: profileDocument(doc) }))
    .filter((x) => x.profile.prior.score > 0)
    .sort((a, b) => b.profile.prior.score - a.profile.prior.score);
  const ranked = rankedAll.slice(0, budget.maxDocs);

  const candidates: InsightImage[] = [];
  let pagesRendered = 0;
  let photoPagesRendered = 0;
  let documentsAnalysed = 0;
  let prescanPages = 0;
  const startedAt = Date.now();
  const takePrescanBudget = (): boolean => {
    if (prescanPages >= budget.prescanPagesTotal) return false;
    prescanPages++;
    return true;
  };

  insightsLog(`${reference}: ${docs.length} documents, ${depth} scan of up to ${ranked.length}`);

  for (const { doc, profile } of ranked) {
    if (pagesRendered >= budget.maxPages) break;
    if (!isPdf(doc.localFilename)) continue;
    const { prior } = profile;

    const isPhotoDoc = prior.kind === 'photo';
    // Visual-impact photo appendices add little once the photo budget is spent,
    // and would otherwise crowd out plans and renders.
    if (isPhotoDoc && photoPagesRendered >= budget.photoPageQuota) continue;
    // Named drawings/photos, and drawing-typed files with a cryptic name (a
    // drawing number), carry their visual on their front/titled pages. Other
    // documents are pre-scanned for embedded figures, but only if their name
    // looks visual at all (transport/geo reports would be scanned for nothing).
    const frontPages = Boolean(prior.kind) || (profile.drawing && !profile.visualName);
    if (!frontPages && !profile.visualName) continue;

    const handle = store.document(doc.localFilename);
    if (!handle) continue;

    try {
      const lines = await handle.lines();
      if (handle.failed) continue;
      documentsAnalysed++;

      // Known drawing/photo documents put their visual on their titled pages;
      // everything else is scanned for large embedded images so a render buried
      // in a statement is still found.
      const { scanned, scans } = frontPages
        ? { scanned: [], scans: new Map<number, PageScan>() }
        : await scanDocumentPages(
            handle,
            lines.map((page) => page.reduce((sum, line) => sum + line.str.length + 1, 0)),
            budget.prescanPagesPerDoc,
            takePrescanBudget
          );
      const pageCap = frontPages ? budget.pagesPerDoc : profile.designAndAccess ? budget.dasPages : budget.visualDocPages;
      const titleScores = frontPages ? lines.map(pageTitleScore) : [];
      const pages = selectDocumentPages(frontPages, lines.length, scanned, pageCap, titleScores);
      if (pages.length === 0) continue;

      const renderedPages: number[] = [];
      let docImages = 0;
      for (const page of pages) {
        if (pagesRendered >= budget.maxPages) break;
        if (isPhotoDoc && photoPagesRendered >= budget.photoPageQuota) break;
        // Budget on render *attempts*, not just accepted pages, so a document
        // full of non-visual pages cannot push us far past maxPages.
        pagesRendered++;
        if (isPhotoDoc) photoPagesRendered++;
        renderedPages.push(page);

        const render = await handle.render(page, THUMB_WIDTH);
        if (!render) continue;
        const scan = scans.get(page);
        const hasLargeImage = (scan?.largestImageArea ?? 0) >= LARGE_IMAGE_AREA;
        const classification = classifyPage(profile, lines[page - 1] ?? [], render.pixels, {
          hasLargeImage,
          // The caption beside an embedded figure distinguishes a render from a
          // photo when the document name does not.
          caption: hasLargeImage ? scan?.caption : ''
        });
        opts.trace?.({
          localFilename: doc.localFilename,
          page,
          kind: classification.kind,
          score: Math.round(classification.score),
          reason: classification.reason,
          imageFile: render.imageFile
        });
        if (classification.score <= 0) continue;

        docImages++;
        candidates.push({
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
          reason: classification.reason
        });
      }
      insightsLog(
        `${reference}: ${doc.description || doc.localFilename} — pages [${renderedPages.join(', ')}] → ${docImages} image(s)`
      );
    } finally {
      await handle.close();
      store.save(false);
    }
  }

  const selection = selectImages(candidates);
  const images = selection.images;
  const found = selection.deduped;

  // Every found image needs its thumbnail on disk. A cached page whose asset
  // was pruned earlier (it was not in the gallery then) is re-rendered here.
  for (const image of found) {
    if (fs.existsSync(assetPath(dir, image.imageFile))) continue;
    const handle = store.document(image.localFilename);
    const imageFile = await handle?.ensureAsset(image.page, THUMB_WIDTH);
    await handle?.close();
    if (imageFile) {
      image.imageFile = imageFile;
      image.id = imageFile.replace(/\.png$/, '');
    }
  }
  store.save();
  // Keep every distinct candidate's thumbnail (not just the curated highlights)
  // so the UI can offer "show all found"; unreferenced assets are pruned.
  pruneAssets(dir, new Set(found.map((image) => image.imageFile)));

  const insights: ApplicationInsights = {
    version: INSIGHTS_VERSION,
    strategy: STRATEGY,
    generatedAt: new Date().toISOString(),
    source,
    summary: buildSummary(meta, docs),
    images,
    found,
    depth,
    comments: tallyComments(readComments(dir)),
    coverage: {
      images: KIND_ORDER.map((kind) => ({
        kind,
        selected: images.filter((image) => image.kind === kind).length,
        available: selection.available[kind]
      })).filter((entry) => entry.available > 0),
      // The render/document/photo budget cuts candidates off, so "available" is
      // only a lower bound when any cap was reached.
      partial:
        pagesRendered >= budget.maxPages ||
        rankedAll.length > budget.maxDocs ||
        photoPagesRendered >= budget.photoPageQuota,
      documentsAnalysed,
      documentsTotal: docs.length
    }
  };
  writeInsights(dir, insights);
  const { work } = store;
  opts.onWork?.({ ...work });
  insightsLog(
    `${reference}: done — ${images.length} highlights (${found.length} found) from ${documentsAnalysed} documents in ` +
      `${((Date.now() - startedAt) / 1000).toFixed(0)}s (rendered ${work.rendered}, scanned ${work.scanned}, ` +
      `opened ${work.opened} PDFs; the rest from cache)`
  );
  return insights;
}
