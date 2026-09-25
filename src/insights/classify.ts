import type { DocumentMeta, InsightImageKind } from '../types.js';
import { kindFromText, isSuperseded, normalise, type DocumentPrior } from './keywords.js';
import type { PagePixelStats } from './pixels.js';

export interface PageClassification {
  kind: InsightImageKind;
  score: number;
  label: string;
}

const KIND_BASE: Record<InsightImageKind, number> = {
  render: 100,
  map: 90,
  elevation: 82,
  plan: 78,
  section: 62,
  photo: 55,
  other: 25
};

export type InsightDocument = Pick<DocumentMeta, 'documentType' | 'description' | 'localFilename'>;

// A photographic page fills the frame with broad tones; a line drawing is mostly
// white with thin strokes. Coloured flat-fill plans sit in between, so this is
// only used to infer a kind when no explicit keyword exists.
export function isPhotographic(stats: PagePixelStats): boolean {
  return stats.inkRatio > 0.45 && stats.colorfulness > 0.15 && stats.edgeDensity > 0.05;
}

export function classifyPage(
  doc: InsightDocument,
  text: string,
  stats: PagePixelStats,
  prior: DocumentPrior
): PageClassification {
  const docType = normalise(doc.documentType || '');
  const docHay = normalise([doc.description, doc.documentType, doc.localFilename].join(' '));
  const textHay = normalise(text);
  const docKind = prior.kind;
  // Only trust a page's title text for a visual kind when the document itself is
  // drawing-like. Administrative pages (forms, letters) are full of generic
  // words like "plan" and "section" that would otherwise cause false positives.
  const drawingDoc = /drawing/.test(docType) || docKind !== undefined;
  const textKind = drawingDoc ? kindFromText(text) : undefined;
  const keywordKind = docKind ?? textKind;

  let kind: InsightImageKind = keywordKind ?? 'other';

  if (isPhotographic(stats)) {
    if (keywordKind === 'render' || keywordKind === 'photo') {
      kind = keywordKind;
    } else if (!keywordKind || keywordKind === 'other') {
      kind = /photo|viewpoint|avr/.test(docHay) ? 'photo' : 'render';
    }
    // An explicit plan/map/elevation/section keyword is kept even if the page is
    // photographic: a rendered elevation is still an elevation, and a coloured
    // site plan is still a plan.
  }

  const existing = /\bexisting\b/.test(docHay) || /\bexisting\b/.test(textHay);
  const proposed = /\bproposed\b/.test(docHay) || /\bproposed\b/.test(textHay);

  // A plain text page (statement, form, letter) is not a visual: drop it rather
  // than padding the gallery with "other". Ambiguous drawing pages and
  // photographic pages are kept.
  if (kind === 'other' && !drawingDoc && !isPhotographic(stats)) {
    return { kind, score: 0, label: (doc.description || doc.documentType || 'Drawing').trim() };
  }

  let score = KIND_BASE[kind];
  score += stats.edgeDensity * 25;
  score += Math.min(stats.inkRatio, 0.9) * 8;
  if (proposed) score += 6;
  if (existing && !proposed) score -= 30;
  if (isSuperseded(doc)) score -= 50;

  const label = (doc.description || doc.documentType || 'Drawing').trim();
  return { kind, score, label };
}
