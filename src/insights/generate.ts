import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ApplicationInsights, Comment, DocumentMeta, InsightImage } from '../types.js';
import { resolveApplicationMeta } from '../storage.js';
import { documentPrior, isDesignAndAccess, normalise, type DocumentPrior } from './keywords.js';
import { classifyPage } from './classify.js';
import { analysePagePng } from './pixels.js';
import { selectImages, KIND_ORDER } from './select.js';
import { selectDocumentPages, LARGE_IMAGE_AREA, type ScannedPage } from './pages.js';
import { insightsLog } from './log.js';
import { buildSummary, tallyComments } from './summary.js';
import {
  analysePageImages,
  extractPageCaption,
  extractPageTexts,
  isPdf,
  openPdf,
  renderPageToPng,
  closePdf,
  type PdfDocument
} from './render.js';
import {
  INSIGHTS_VERSION,
  pruneAssets,
  readInsights,
  readPageText,
  writeAsset,
  writeInsights,
  writePageText
} from './cache.js';

export const STRATEGY = { id: 'heuristic', version: 11 };

// Cost caps: analysis is expensive. Documents are ranked by prior, then pages
// are chosen per document (a cheap embedded-image pre-scan finds renders that
// sit deep inside a statement) and rendered until these limits are hit.
const MAX_DOCS = 40;
const MAX_PAGES = 40;
// Known drawing/photo documents carry their visual on the first page or two.
const MAX_PAGES_PER_DOC = 4;
// Statement/appendix documents can hold many distinct renders spread across
// their pages, so give them a little more room.
const VISUAL_DOC_PAGES = 8;
// The Design & Access Statement is the closest thing to a human summary of the
// scheme, but it mixes prose, plans, photos and renders, so scan it properly.
const DAS_PAGES = 14;
// Visual-impact photo appendices must not monopolise the render budget; cap the
// total pages spent on `photo` documents and let the rest go to plans/renders.
const PHOTO_PAGE_QUOTA = 8;
// Bounds for the embedded-image pre-scan (it decodes images, so it is metered).
const PRESCAN_PAGES_PER_DOC = 40;
const PRESCAN_PAGES_TOTAL = 240;
// Only pre-scan documents that plausibly hold visuals. Without this, long
// transport/geo/environmental reports get scanned page-by-page for nothing.
const VISUAL_DOC_RE =
  /design and access|\bfigures?\b|visual|landscape|render|photomontage|montage|illustrat|master ?plan|image|photo|cgi\b|3d |exhibition|street scene|palette|aerial/i;
const THUMB_WIDTH = 1400;

// Deep scan: user-triggered, much more expensive, scans more documents and pages.
const DEEP_MAX_DOCS = 120;
const DEEP_MAX_PAGES = 120;

interface Budget {
  maxDocs: number;
  maxPages: number;
  pagesPerDoc: number;
  visualDocPages: number;
  dasPages: number;
  photoPageQuota: number;
  prescanPagesPerDoc: number;
  prescanPagesTotal: number;
}

const QUICK_BUDGET: Budget = {
  maxDocs: MAX_DOCS,
  maxPages: MAX_PAGES,
  pagesPerDoc: MAX_PAGES_PER_DOC,
  visualDocPages: VISUAL_DOC_PAGES,
  dasPages: DAS_PAGES,
  photoPageQuota: PHOTO_PAGE_QUOTA,
  prescanPagesPerDoc: PRESCAN_PAGES_PER_DOC,
  prescanPagesTotal: PRESCAN_PAGES_TOTAL
};

const DEEP_BUDGET: Budget = {
  maxDocs: DEEP_MAX_DOCS,
  maxPages: DEEP_MAX_PAGES,
  pagesPerDoc: 6,
  visualDocPages: 12,
  dasPages: 20,
  photoPageQuota: 16,
  prescanPagesPerDoc: 80,
  prescanPagesTotal: 1500
};

export interface GenerateOptions {
  force?: boolean;
  // Scan more documents and pages. Slower, but finds visuals a quick run misses.
  deep?: boolean;
}

export type InsightsStatus = 'none' | 'running' | 'ready' | 'error';

export interface InsightsState {
  status: InsightsStatus;
  insights?: ApplicationInsights;
  error?: string;
}

// Generation is CPU-heavy, so the API starts it in the background and the UI
// polls. Track in-flight work and the last failure per application. The key is
// the reference alone (not the authority), so an application cannot be
// generated twice in parallel via two different authority spellings.
const inFlight = new Map<string, Promise<ApplicationInsights | null>>();
const lastError = new Map<string, string>();

function jobKey(reference: string): string {
  return reference;
}

export function isGenerating(reference: string): boolean {
  return inFlight.has(jobKey(reference));
}

export function startInsights(reference: string, authorityId?: string, opts: GenerateOptions = {}): void {
  const key = jobKey(reference);
  if (inFlight.has(key)) return;
  lastError.delete(key);
  const promise = generateInsights(reference, authorityId, opts)
    .catch((err: unknown) => {
      lastError.set(key, err instanceof Error ? err.message : String(err));
      return null;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
}

function documentList(meta: { documents?: DocumentMeta[] }): DocumentMeta[] {
  const seen = new Set<string>();
  return (meta.documents ?? []).filter((d) => {
    if (!d.localFilename || seen.has(d.localFilename)) return false;
    seen.add(d.localFilename);
    return true;
  });
}

// Current state for the API: returns a ready result only when the cache is
// fresh. A stale cache (documents changed on sync, or a strategy bump) is
// refreshed in the background so the viewer reflects the sync without the user
// having to regenerate manually. A missing cache is left for the user to start.
export function getInsightsState(reference: string, authorityId?: string): InsightsState | null {
  const resolved = resolveApplicationMeta(reference, authorityId);
  if (!resolved) return null;
  const { meta, dir } = resolved;
  const source = sourceSignature(dir, documentList(meta));

  const cached = readInsights(dir);
  if (cached && sameStrategy(cached) && sameSource(cached.source, source)) {
    return { status: 'ready', insights: cached };
  }

  const key = jobKey(reference);
  if (inFlight.has(key)) return { status: 'running' };

  const previousError = lastError.get(key);
  if (previousError) return { status: 'error', error: previousError };

  if (cached) {
    // Preserve the depth of the cached result on an automatic refresh.
    startInsights(reference, authorityId, { force: false, deep: cached.depth === 'deep' });
    return { status: 'running' };
  }
  return { status: 'none' };
}

function sameStrategy(insights: ApplicationInsights): boolean {
  return insights.strategy.id === STRATEGY.id && insights.strategy.version === STRATEGY.version;
}

function sourceSignature(dir: string, docs: DocumentMeta[]): ApplicationInsights['source'] {
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
// text length is not a safe filter); `takeBudget` meters decoded pages across
// the whole run.
async function scanDocumentPages(
  pdf: PdfDocument,
  texts: string[],
  maxPages: number,
  takeBudget: () => boolean
): Promise<ScannedPage[]> {
  const pageCount = Math.max(texts.length, 1);
  const limit = Math.min(pageCount, maxPages);
  const scanned: ScannedPage[] = [];
  for (let page = 1; page <= limit; page++) {
    const text = texts[page - 1] ?? '';
    let imageCount = 0;
    let largestImageArea = 0;
    if (takeBudget()) {
      const stats = await analysePageImages(pdf, page);
      imageCount = stats.count;
      largestImageArea = stats.largestArea;
    }
    scanned.push({ page, textLength: text.length, imageCount, largestImageArea });
  }
  return scanned;
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
    if (cached && sameStrategy(cached) && sameSource(cached.source, source) && (cached.depth ?? 'quick') === depth) {
      return cached;
    }
  }

  const pageTextCache = readPageText(dir);
  let pageTextDirty = false;

  const rankedAll = docs
    .map((doc) => ({ doc, prior: documentPrior(doc) }))
    .filter((x) => x.prior.score > 0)
    .sort((a, b) => b.prior.score - a.prior.score);
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

  for (const { doc, prior } of ranked) {
    if (pagesRendered >= budget.maxPages) break;
    if (!isPdf(doc.localFilename)) continue;

    const isPhotoDoc = prior.kind === 'photo';
    // Visual-impact photo appendices add little once the photo budget is spent,
    // and would otherwise crowd out plans and renders.
    if (isPhotoDoc && photoPagesRendered >= budget.photoPageQuota) continue;

    // Documents without a name keyword are only worth scanning if they look
    // visual at all; otherwise (transport/geo/environmental reports) they would
    // be scanned page-by-page for nothing.
    if (!prior.kind && !VISUAL_DOC_RE.test(normalise([doc.description, doc.documentType, doc.localFilename].filter(Boolean).join(' ')))) {
      continue;
    }

    const filePath = path.join(dir, doc.localFilename);

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      continue;
    }

    let pdf;
    try {
      pdf = await openPdf(filePath);
    } catch {
      continue;
    }
    documentsAnalysed++;

    try {
      let texts: string[];
      const cachedText = pageTextCache.documents[doc.localFilename];
      if (cachedText && cachedText.mtimeMs === stat.mtimeMs && cachedText.size === stat.size) {
        texts = cachedText.pages;
      } else {
        try {
          texts = await extractPageTexts(pdf);
        } catch {
          texts = [];
        }
        pageTextCache.documents[doc.localFilename] = { mtimeMs: stat.mtimeMs, size: stat.size, pages: texts };
        pageTextDirty = true;
      }

      // Known drawing/photo documents put their visual on the first page(s);
      // everything else is scanned for large embedded images so a render buried
      // in a statement is still found.
      const scanned = prior.kind
        ? []
        : await scanDocumentPages(pdf, texts, budget.prescanPagesPerDoc, takePrescanBudget);
      const pageCap = prior.kind
        ? budget.pagesPerDoc
        : isDesignAndAccess(doc)
          ? budget.dasPages
          : budget.visualDocPages;
      const pages = selectDocumentPages(prior.kind, texts.length, scanned, pageCap);
      if (pages.length === 0) continue;

      const renderedPages: number[] = [];
      let docImages = 0;
      for (const page of pages) {
        if (pagesRendered >= budget.maxPages) break;
        if (isPhotoDoc && photoPagesRendered >= budget.photoPageQuota) break;
        // Budget on render *attempts*, not just accepted pages, so a document
        // full of non-visual pages cannot push us far past MAX_PAGES.
        pagesRendered++;
        if (isPhotoDoc) photoPagesRendered++;
        renderedPages.push(page);

        let png: Buffer;
        try {
          png = await renderPageToPng(pdf, page, THUMB_WIDTH);
        } catch {
          continue;
        }
        let stats;
        try {
          stats = await analysePagePng(png);
        } catch {
          continue;
        }
        const pageScan = scanned.find((entry) => entry.page === page);
        const hasLargeImage = (pageScan?.largestImageArea ?? 0) >= LARGE_IMAGE_AREA;
        // The caption beside an embedded figure distinguishes a render from a
        // photo when the document name does not.
        const caption = hasLargeImage ? await extractPageCaption(pdf, page) : '';
        const classification = classifyPage(doc, texts[page - 1] ?? '', stats, prior, {
          hasLargeImage,
          caption
        });
        if (classification.score <= 0) continue;

        const id = crypto.createHash('sha1').update(png).digest('hex');
        const imageFile = `${id}.png`;
        writeAsset(dir, imageFile, png);
        docImages++;
        candidates.push({
          id,
          kind: classification.kind,
          label: classification.label,
          localFilename: doc.localFilename,
          page,
          imageFile,
          width: stats.width,
          height: stats.height,
          score: Math.round(classification.score),
          phash: stats.phash
        });
      }
      insightsLog(
        `${reference}: ${doc.description || doc.localFilename} — pages [${renderedPages.join(', ')}] → ${docImages} image(s)`
      );
    } finally {
      await closePdf(pdf).catch(() => {});
    }
  }

  if (pageTextDirty) writePageText(dir, pageTextCache);

  const selection = selectImages(candidates);
  const images = selection.images;
  const found = selection.deduped;
  // Keep every distinct candidate's thumbnail (not just the curated highlights)
  // so the UI can offer "show all found"; stale/unreferenced assets are pruned.
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
  insightsLog(
    `${reference}: done — ${images.length} highlights (${found.length} found) from ${documentsAnalysed} documents in ${((Date.now() - startedAt) / 1000).toFixed(0)}s`
  );
  return insights;
}
