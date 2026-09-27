import type { InsightImage, InsightImageKind } from '../types.js';
import { hammingDistance } from './pixels.js';

export const KIND_ORDER: InsightImageKind[] = ['render', 'map', 'elevation', 'plan', 'section', 'photo', 'other'];

export const DEFAULT_KIND_CAPS: Record<InsightImageKind, number> = {
  render: 8,
  map: 4,
  elevation: 6,
  plan: 8,
  section: 4,
  photo: 6,
  other: 3
};

export const DEFAULT_TOTAL_CAP = 24;

// Two difference hashes within this many bits are treated as the same image.
// Deliberately strict: repeated covers differ only by a little text (distance
// ~0), while genuinely distinct drawings of the same kind sit well above it.
const PHASH_DISTANCE = 6;

export interface SelectOptions {
  caps?: Partial<Record<InsightImageKind, number>>;
  total?: number;
  // Keep the gallery diverse: at most this many images from any one document.
  maxPerDocument?: number;
}

export interface SelectionResult {
  images: InsightImage[];
  // Distinct candidates per kind after dedupe but before the selection caps, so
  // callers can report "showing N of M" rather than implying the list is complete.
  available: Record<InsightImageKind, number>;
  // True when at least one deduped candidate was dropped by a cap.
  truncated: boolean;
}

function emptyCounts(): Record<InsightImageKind, number> {
  return Object.fromEntries(KIND_ORDER.map((kind) => [kind, 0])) as Record<InsightImageKind, number>;
}

// Collapse exact duplicates (same content hash, keep the strongest) and
// near-duplicates (perceptual hash within a few bits), highest score first.
function dedupe(candidates: InsightImage[]): InsightImage[] {
  const byId = new Map<string, InsightImage>();
  for (const c of candidates) {
    const existing = byId.get(c.id);
    if (!existing || c.score > existing.score) byId.set(c.id, c);
  }

  const sorted = [...byId.values()].sort((a, b) => b.score - a.score);
  const kept: InsightImage[] = [];
  const keptHashes: string[] = [];
  for (const candidate of sorted) {
    if (candidate.phash && keptHashes.some((hash) => hammingDistance(hash, candidate.phash as string) <= PHASH_DISTANCE)) {
      continue;
    }
    if (candidate.phash) keptHashes.push(candidate.phash);
    kept.push(candidate);
  }
  return kept;
}

// Dedupe, then cap per kind, per document and overall, preferring proposed over
// existing and higher scores. Returns the chosen images plus counts so callers
// can be honest about truncation.
export function selectImages(candidates: InsightImage[], opts: SelectOptions = {}): SelectionResult {
  const caps = { ...DEFAULT_KIND_CAPS, ...opts.caps };
  const total = opts.total ?? DEFAULT_TOTAL_CAP;
  const maxPerDocument = opts.maxPerDocument ?? 4;

  const deduped = dedupe(candidates);
  const available = emptyCounts();
  for (const candidate of deduped) available[candidate.kind]++;

  const counts: Partial<Record<InsightImageKind, number>> = {};
  const perDocument: Record<string, number> = {};
  const chosen: InsightImage[] = [];
  for (const candidate of deduped) {
    if (chosen.length >= total) break;
    const used = counts[candidate.kind] ?? 0;
    if (used >= (caps[candidate.kind] ?? 3)) continue;
    const docUsed = perDocument[candidate.localFilename] ?? 0;
    if (docUsed >= maxPerDocument) continue;
    counts[candidate.kind] = used + 1;
    perDocument[candidate.localFilename] = docUsed + 1;
    chosen.push(candidate);
  }

  chosen.sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || b.score - a.score
  );
  return { images: chosen, available, truncated: chosen.length < deduped.length };
}
