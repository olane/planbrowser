import type { InsightImageKind } from '../types.js';

// The single source of kind metadata: display order, scores and caps. These were
// previously spread across classify.ts, keywords.ts and select.ts, where they
// could drift apart; keep them together.

// Display order, best first. Gallery groups and ranking both use it.
export const KIND_ORDER: InsightImageKind[] = ['render', 'map', 'elevation', 'plan', 'section', 'photo', 'other'];

// Base score of a classified page, before content bonuses/penalties. `render`
// outranks a map, which outranks a plain plan; `other` is a weak fallback.
export const KIND_BASE: Record<InsightImageKind, number> = {
  render: 100,
  map: 90,
  elevation: 82,
  plan: 78,
  section: 62,
  photo: 55,
  other: 25
};

// Weak weight of a kind named in a *document* name, used only to rank which
// files to open first. Deliberately flatter than KIND_BASE.
export const KIND_PRIOR_WEIGHT: Record<InsightImageKind, number> = {
  render: 5,
  map: 4,
  elevation: 4,
  plan: 3.5,
  section: 3,
  photo: 2,
  other: 0
};

// Curated gallery caps per kind (the highlights, before `found`).
export const DEFAULT_KIND_CAPS: Record<InsightImageKind, number> = {
  render: 8,
  map: 4,
  elevation: 6,
  plan: 8,
  section: 4,
  photo: 6,
  other: 3
};
