import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { ApplicationInsights, Comment, DocumentMeta, InsightImage } from '../types.js';
import { resolveApplicationMeta } from '../storage.js';
import { documentPrior, type DocumentPrior } from './keywords.js';
import { classifyPage } from './classify.js';
import { analysePagePng } from './pixels.js';
import { selectImages } from './select.js';
import { buildSummary, tallyComments } from './summary.js';
import { extractPageTexts, isPdf, openPdf, renderPageToPng } from './render.js';
import { INSIGHTS_VERSION, readInsights, readPageText, writeAsset, writeInsights, writePageText } from './cache.js';

export const STRATEGY = { id: 'heuristic', version: 1 };

// Cost caps: rendering is the expensive step. We rank documents by prior and
// only render up to these limits, then cache everything.
const MAX_DOCS = 40;
const MAX_PAGES = 36;
const MAX_PAGES_PER_DOC = 8;
const THUMB_WIDTH = 1400;

export interface GenerateOptions {
  force?: boolean;
}

// Generation is CPU-heavy, so the API starts it in the background and the UI
// polls. This tracks in-flight work per application to avoid duplicate runs.
const inFlight = new Map<string, Promise<ApplicationInsights | null>>();

function jobKey(reference: string, authorityId?: string): string {
  return `${authorityId ?? '*'}/${reference}`;
}

export function isGenerating(reference: string, authorityId?: string): boolean {
  return inFlight.has(jobKey(reference, authorityId));
}

export function startInsights(reference: string, authorityId?: string, opts: GenerateOptions = {}): void {
  const key = jobKey(reference, authorityId);
  if (inFlight.has(key)) return;
  const promise = generateInsights(reference, authorityId, opts)
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
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

  const seen = new Set<string>();
  const docs = (meta.documents ?? []).filter((d) => {
    if (!d.localFilename || seen.has(d.localFilename)) return false;
    seen.add(d.localFilename);
    return true;
  });

  const source = sourceSignature(dir, docs);

  if (!opts.force) {
    const cached = readInsights(dir);
    if (
      cached &&
      cached.strategy.id === STRATEGY.id &&
      cached.strategy.version === STRATEGY.version &&
      sameSource(cached.source, source)
    ) {
      return cached;
    }
  }

  const pageTextCache = readPageText(dir);
  let pageTextDirty = false;

  const ranked = docs
    .map((doc) => ({ doc, prior: documentPrior(doc) }))
    .filter((x) => x.prior.score > 0)
    .sort((a, b) => b.prior.score - a.prior.score)
    .slice(0, MAX_DOCS);

  const candidates: InsightImage[] = [];
  let pagesDone = 0;

  for (const { doc, prior } of ranked) {
    if (pagesDone >= MAX_PAGES) break;
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
    const budget = Math.min(MAX_PAGES_PER_DOC, MAX_PAGES - pagesDone, pageCount);
    for (let page = 1; page <= budget; page++) {
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
        score: Math.round(classification.score)
      });
      pagesDone++;
    }
  }

  if (pageTextDirty) writePageText(dir, pageTextCache);

  const images = selectImages(candidates);
  const insights: ApplicationInsights = {
    version: INSIGHTS_VERSION,
    strategy: STRATEGY,
    generatedAt: new Date().toISOString(),
    source,
    summary: buildSummary(meta),
    images,
    comments: tallyComments(readComments(dir))
  };
  writeInsights(dir, insights);
  return insights;
}
