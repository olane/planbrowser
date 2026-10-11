import fs from 'fs';
import path from 'path';
import { getDownloadsDir } from '../config.js';
import type { InsightImageKind, InsightLabel, InsightRank } from '../types.js';
import { atomicWrite } from './cache.js';
import { KIND_ORDER } from './kinds.js';

// The review UI collects page verdicts. They used to be written straight into
// the checked-in eval ground truth; they now land in a separate store
// (`reviewsFile()`) so a deployed instance can gather feedback without mutating
// the repo's `scripts/samples.expected.json`. `npm run insights:labels --
// <download>` folds a downloaded store back into that ground truth, which then
// feeds `npm run insights:eval`. See scripts/insights-truth.mjs.
export function truthFile(): string {
  return process.env.INSIGHTS_TRUTH
    ? path.resolve(process.env.INSIGHTS_TRUTH)
    : path.join(process.cwd(), 'scripts', 'samples.expected.json');
}

// Where the review UI persists verdicts. It lives on the persistent downloads
// volume so feedback survives redeploys; override for tests.
export function reviewsFile(): string {
  return process.env.INSIGHTS_REVIEWS
    ? path.resolve(process.env.INSIGHTS_REVIEWS)
    : path.join(getDownloadsDir(), 'insights-reviews.json');
}

const RANKS: InsightRank[] = ['high', 'low'];

interface TruthSample {
  labels?: InsightLabel[];
  [key: string]: unknown;
}

interface TruthFile {
  samples?: Record<string, TruthSample>;
  [key: string]: unknown;
}

const pageKey = (label: { file: string; page: number }): string => `${label.file}#${label.page}`;

// Validate untrusted request input into labels. Returns null when the shape is
// wrong; individual malformed entries are dropped.
export function sanitizeLabels(input: unknown): InsightLabel[] | null {
  if (!Array.isArray(input)) return null;
  const out: InsightLabel[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const { file, page, verdict, kind, rank } = entry as Record<string, unknown>;
    if (typeof file !== 'string' || !file) continue;
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) continue;
    if (verdict !== 'good' && verdict !== 'bad') continue;
    const label: InsightLabel = { file, page, verdict };
    // A kind and a rank only make sense for a page judged worth showing.
    if (verdict === 'good') {
      if (typeof kind === 'string' && (KIND_ORDER as readonly string[]).includes(kind)) {
        label.kind = kind as InsightImageKind;
      }
      if (typeof rank === 'string' && (RANKS as string[]).includes(rank)) {
        label.rank = rank as InsightRank;
      }
    }
    out.push(label);
  }
  return out;
}

// Validate untrusted request input into page references for a removal.
export function sanitizePageRefs(input: unknown): { file: string; page: number }[] | null {
  if (!Array.isArray(input)) return null;
  const out: { file: string; page: number }[] = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;
    const { file, page } = entry as Record<string, unknown>;
    if (typeof file !== 'string' || !file) continue;
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) continue;
    out.push({ file, page });
  }
  return out;
}

function loadStore(file: string): TruthFile {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as TruthFile;
  } catch {
    return { samples: {} };
  }
}

function readFrom(file: string, reference: string): InsightLabel[] {
  return loadStore(file).samples?.[reference]?.labels ?? [];
}

// Merge verdicts for one sample, replacing any prior verdict for the same page.
function mergeInto(file: string, reference: string, incoming: InsightLabel[]): InsightLabel[] {
  const truth = loadStore(file);
  const samples = (truth.samples ??= {});
  const spec = (samples[reference] ??= {});
  const byKey = new Map((spec.labels ?? []).map((label) => [pageKey(label), label]));
  for (const label of incoming) byKey.set(pageKey(label), label);
  spec.labels = [...byKey.values()].sort((a, b) => a.file.localeCompare(b.file) || a.page - b.page);
  atomicWrite(file, `${formatTruth(truth)}\n`);
  return spec.labels;
}

// Drop the verdicts for the given pages, e.g. when a reviewer unselects a rating.
function removeFrom(
  file: string,
  reference: string,
  pages: { file: string; page: number }[]
): InsightLabel[] {
  const truth = loadStore(file);
  const samples = (truth.samples ??= {});
  const spec = (samples[reference] ??= {});
  const drop = new Set(pages.map(pageKey));
  spec.labels = (spec.labels ?? []).filter((label) => !drop.has(pageKey(label)));
  atomicWrite(file, `${formatTruth(truth)}\n`);
  return spec.labels;
}

// Ground-truth labels (scripts/samples.expected.json), used by the label merger.
export function readLabels(reference: string): InsightLabel[] {
  return readFrom(truthFile(), reference);
}

export function mergeLabels(reference: string, incoming: InsightLabel[]): InsightLabel[] {
  return mergeInto(truthFile(), reference, incoming);
}

// Labels collected in the review UI (reviewsFile()).
export function readReviewLabels(reference: string): InsightLabel[] {
  return readFrom(reviewsFile(), reference);
}

export function mergeReviewLabels(reference: string, incoming: InsightLabel[]): InsightLabel[] {
  return mergeInto(reviewsFile(), reference, incoming);
}

export function removeReviewLabels(
  reference: string,
  pages: { file: string; page: number }[]
): InsightLabel[] {
  return removeFrom(reviewsFile(), reference, pages);
}

// The whole review store, for download. Shape matches truthFile(): each sample
// carries a `labels` array.
export function readReviewStore(): TruthFile {
  return loadStore(reviewsFile());
}

// Keep the file's hand-written style: one line per flat entry.
function formatTruth(truth: TruthFile): string {
  return JSON.stringify(truth, null, 2).replace(
    /\{\n\s+([^{}\[\]]*?)\n\s*\}/g,
    (_, body: string) => `{ ${body.replace(/,\n\s+/g, ', ')} }`
  );
}
