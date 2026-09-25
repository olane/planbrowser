import type { InsightImage, InsightImageKind } from '../types.js';

export const KIND_ORDER: InsightImageKind[] = ['render', 'map', 'elevation', 'plan', 'section', 'photo', 'other'];

export const DEFAULT_KIND_CAPS: Record<InsightImageKind, number> = {
  render: 8,
  map: 4,
  elevation: 6,
  plan: 8,
  section: 4,
  photo: 8,
  other: 3
};

export const DEFAULT_TOTAL_CAP = 24;

export interface SelectOptions {
  caps?: Partial<Record<InsightImageKind, number>>;
  total?: number;
  // Keep the gallery diverse: at most this many images from any one document.
  maxPerDocument?: number;
}

// Collapse duplicates (same content hash) keeping the strongest occurrence, then
// cap per kind, per document and overall, preferring proposed over existing and
// higher scores.
export function selectImages(candidates: InsightImage[], opts: SelectOptions = {}): InsightImage[] {
  const byId = new Map<string, InsightImage>();
  for (const c of candidates) {
    const existing = byId.get(c.id);
    if (!existing || c.score > existing.score) byId.set(c.id, c);
  }

  const caps = { ...DEFAULT_KIND_CAPS, ...opts.caps };
  const total = opts.total ?? DEFAULT_TOTAL_CAP;
  const maxPerDocument = opts.maxPerDocument ?? 3;

  const sorted = [...byId.values()].sort((a, b) => b.score - a.score);
  const counts: Partial<Record<InsightImageKind, number>> = {};
  const perDocument: Record<string, number> = {};
  const chosen: InsightImage[] = [];
  for (const candidate of sorted) {
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
  return chosen;
}
