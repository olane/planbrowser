import fs from 'fs';
import path from 'path';
import type { InsightImageKind, InsightLabel } from '../types.js';
import { atomicWrite } from './cache.js';

// The review UI (a special URL on the viewer) writes page verdicts into the
// eval's hand-curated ground truth (see scripts/insights-truth.mjs), so they
// feed straight into `npm run insights:eval`. This is a local-development tool:
// it is only enabled when the repo's ground-truth file exists. A packaged build
// has no `scripts/`, and an override is available for tests.
export function truthFile(): string {
  return process.env.INSIGHTS_TRUTH
    ? path.resolve(process.env.INSIGHTS_TRUTH)
    : path.join(process.cwd(), 'scripts', 'samples.expected.json');
}

export function labelsAvailable(): boolean {
  return fs.existsSync(truthFile());
}

// Whether the review/dev endpoints are enabled. Off explicitly with
// INSIGHTS_REVIEW=0 (packaged builds), on explicitly with INSIGHTS_REVIEW=1
// (tests or a dev server outside a checkout), and otherwise on when the repo's
// ground-truth file is present. The review tool writes that file, so it must
// never be reachable outside a development checkout.
export function reviewEnabled(): boolean {
  if (process.env.INSIGHTS_REVIEW === '0') return false;
  if (process.env.INSIGHTS_REVIEW === '1') return true;
  return labelsAvailable();
}

const KINDS: InsightImageKind[] = ['render', 'plan', 'elevation', 'section', 'map', 'photo', 'other'];

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
    const { file, page, verdict, kind } = entry as Record<string, unknown>;
    if (typeof file !== 'string' || !file) continue;
    if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) continue;
    if (verdict !== 'good' && verdict !== 'bad') continue;
    const label: InsightLabel = { file, page, verdict };
    // A kind only makes sense for a page judged worth showing.
    if (verdict === 'good' && typeof kind === 'string' && (KINDS as string[]).includes(kind)) {
      label.kind = kind as InsightImageKind;
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

export function readLabels(reference: string): InsightLabel[] {
  try {
    const truth = JSON.parse(fs.readFileSync(truthFile(), 'utf-8')) as TruthFile;
    return truth.samples?.[reference]?.labels ?? [];
  } catch {
    return [];
  }
}

// Merge verdicts for one sample, replacing any prior verdict for the same page.
export function mergeLabels(reference: string, incoming: InsightLabel[]): InsightLabel[] {
  const truth = JSON.parse(fs.readFileSync(truthFile(), 'utf-8')) as TruthFile;
  const samples = (truth.samples ??= {});
  const spec = (samples[reference] ??= {});
  const byKey = new Map((spec.labels ?? []).map((label) => [pageKey(label), label]));
  for (const label of incoming) byKey.set(pageKey(label), label);
  spec.labels = [...byKey.values()].sort((a, b) => a.file.localeCompare(b.file) || a.page - b.page);
  atomicWrite(truthFile(), `${formatTruth(truth)}\n`);
  return spec.labels;
}

// Drop the verdicts for the given pages, e.g. when a reviewer unselects a rating.
export function removeLabels(
  reference: string,
  pages: { file: string; page: number }[]
): InsightLabel[] {
  const truth = JSON.parse(fs.readFileSync(truthFile(), 'utf-8')) as TruthFile;
  const samples = (truth.samples ??= {});
  const spec = (samples[reference] ??= {});
  const drop = new Set(pages.map(pageKey));
  spec.labels = (spec.labels ?? []).filter((label) => !drop.has(pageKey(label)));
  atomicWrite(truthFile(), `${formatTruth(truth)}\n`);
  return spec.labels;
}

// Keep the file's hand-written style: one line per flat entry.
function formatTruth(truth: TruthFile): string {
  return JSON.stringify(truth, null, 2).replace(
    /\{\n\s+([^{}\[\]]*?)\n\s*\}/g,
    (_, body: string) => `{ ${body.replace(/,\n\s+/g, ', ')} }`
  );
}
