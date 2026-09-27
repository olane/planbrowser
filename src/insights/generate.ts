import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ApplicationInsights, Comment, DocumentMeta, InsightImage } from '../types.js';
import { resolveApplicationMeta } from '../storage.js';
import { documentPrior, type DocumentPrior } from './keywords.js';
import { classifyPage } from './classify.js';
import { analysePagePng } from './pixels.js';
import { selectImages, KIND_ORDER } from './select.js';
import { buildSummary, tallyComments } from './summary.js';
import { extractPageTexts, isPdf, openPdf, renderPageToPng, closePdf } from './render.js';
import {
  INSIGHTS_VERSION,
  pruneAssets,
  readInsights,
  readPageText,
  writeAsset,
  writeInsights,
  writePageText
} from './cache.js';

export const STRATEGY = { id: 'heuristic', version: 3 };

// Cost caps: rendering is the expensive step. We rank documents by prior and
// only render up to these limits, then cache everything.
const MAX_DOCS = 40;
const MAX_PAGES = 36;
const MAX_PAGES_PER_DOC = 8;
const THUMB_WIDTH = 1400;

export interface GenerateOptions {
  force?: boolean;
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
    startInsights(reference, authorityId, { force: false });
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

  if (!opts.force) {
    const cached = readInsights(dir);
    if (cached && sameStrategy(cached) && sameSource(cached.source, source)) {
      return cached;
    }
  }

  const pageTextCache = readPageText(dir);
  let pageTextDirty = false;

  const rankedAll = docs
    .map((doc) => ({ doc, prior: documentPrior(doc) }))
    .filter((x) => x.prior.score > 0)
    .sort((a, b) => b.prior.score - a.prior.score);
  const ranked = rankedAll.slice(0, MAX_DOCS);

  const candidates: InsightImage[] = [];
  let pagesRendered = 0;
  let documentsAnalysed = 0;

  for (const { doc, prior } of ranked) {
    if (pagesRendered >= MAX_PAGES) break;
    if (!isPdf(doc.localFilename)) continue;
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

      const pageCount = Math.max(texts.length, 1);
      const budget = Math.min(MAX_PAGES_PER_DOC, MAX_PAGES - pagesRendered, pageCount);
      for (let page = 1; page <= budget; page++) {
        // Budget on render *attempts*, not just accepted pages, so a document
        // full of non-visual pages cannot push us far past MAX_PAGES.
        pagesRendered++;
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
        const classification = classifyPage(doc, texts[page - 1] ?? '', stats, prior);
        if (classification.score <= 0) continue;

        const id = crypto.createHash('sha1').update(png).digest('hex');
        const imageFile = `${id}.png`;
        writeAsset(dir, imageFile, png);
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
    } finally {
      await closePdf(pdf).catch(() => {});
    }
  }

  if (pageTextDirty) writePageText(dir, pageTextCache);

  const selection = selectImages(candidates);
  const images = selection.images;
  // Drop thumbnails that were rendered but not selected (and any stale ones
  // from earlier runs), so the insights directory tracks insights.json.
  pruneAssets(dir, new Set(images.map((image) => image.imageFile)));

  const insights: ApplicationInsights = {
    version: INSIGHTS_VERSION,
    strategy: STRATEGY,
    generatedAt: new Date().toISOString(),
    source,
    summary: buildSummary(meta, docs),
    images,
    comments: tallyComments(readComments(dir)),
    coverage: {
      images: KIND_ORDER.map((kind) => ({
        kind,
        selected: images.filter((image) => image.kind === kind).length,
        available: selection.available[kind]
      })).filter((entry) => entry.available > 0),
      // The render/document budget cuts candidates off the top, so "available"
      // is only a lower bound when either cap was reached.
      partial: pagesRendered >= MAX_PAGES || rankedAll.length > MAX_DOCS,
      documentsAnalysed,
      documentsTotal: docs.length
    }
  };
  writeInsights(dir, insights);
  return insights;
}
