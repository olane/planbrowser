import type { DocumentMeta, InsightImageKind } from '../types.js';
import { kindFromText, isDesignVisualDoc, isSuperseded, normalise, type DocumentPrior } from './keywords.js';
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

// Pull a readable title out of a page's (often title-block) text, so pages of a
// mixed document don't all share the document's generic description.
export function titleFromText(text: string): string | undefined {
  if (!text) return undefined;
  const lines = text
    .split(/\r?\n|[ ]{3,}/)
    .map((line) => line.trim())
    .filter(Boolean);
  const keyword = /(site plan|location plan|block plan|floor plan|roof plan|basement plan|elevation|section|layout|master ?plan|general arrangement|render|visual|photomontage|parameter plan)/i;
  // Legend/key/scale chrome shares drawing words but is not the drawing title.
  const chrome = /legend|key plan|scale|revision|notes?|north|title block|drawing schedule/i;
  const candidates = lines.filter(
    (line) => line.length >= 4 && line.length <= 90 && keyword.test(line) && !chrome.test(line)
  );
  if (candidates.length === 0) return undefined;
  candidates.sort(
    (a, b) => Number(/(proposed|drawing)/i.test(b)) - Number(/(proposed|drawing)/i.test(a))
  );
  return candidates[0];
}

// A photographic page fills the frame with broad tones; a line drawing is mostly
// white with thin strokes. Coloured flat-fill plans sit in between, so this is
// only used to infer a kind when no explicit keyword exists.
export function isPhotographic(stats: PagePixelStats): boolean {
  const colourful = stats.inkRatio > 0.45 && stats.colorfulness > 0.15 && stats.edgeDensity > 0.05;
  return colourful || isFullBleed(stats);
}

// An image that covers essentially the whole sheet, with many distinct tones and
// no dominant flat colour. CGI renders are often muted (dawn/dusk palettes), so
// colourfulness alone misses them; this catches them whether or not the page
// text mentions a drawing word like "masterplan".
export function isFullBleed(stats: PagePixelStats): boolean {
  return stats.inkRatio > 0.82 && stats.dominantColorRatio < 0.5 && stats.distinctColors >= 30;
}

// A cover/title page built from a single flat brand colour (common at the front
// of appendices): most of the page is one colour bucket and there are very few
// distinct colours. These match "photographic" on ink/colour but carry no content.
export function isFlatGraphic(stats: PagePixelStats): boolean {
  return stats.inkRatio > 0.5 && stats.dominantColorRatio > 0.5 && stats.distinctColors < 40;
}

// A page of running prose (statement, report, slide) rather than a drawing. Real
// drawings have short, fragmented labels; prose has several long lines. Text
// alone is not enough (drawings carry notes), so require weak drawing structure.
export function isProsePage(text: string, stats: PagePixelStats): boolean {
  if (!text) return false;
  const longLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 60).length;
  return longLines >= 3 && stats.edgeDensity < 0.16;
}

export interface ClassifyOptions {
  // True when the page carries a large embedded raster (from the pre-scan). A
  // statement page can mix body text with a render/photo figure; this keeps such
  // a page from being dismissed as prose.
  hasLargeImage?: boolean;
}

export function classifyPage(
  doc: InsightDocument,
  text: string,
  stats: PagePixelStats,
  prior: DocumentPrior,
  options: ClassifyOptions = {}
): PageClassification {
  const docType = normalise(doc.documentType || '');
  const docHay = normalise([doc.description, doc.documentType, doc.localFilename].join(' '));
  const textHay = normalise(text);
  // A document's own name is only a reliable kind prior when it is actually a
  // drawing/photograph or its type is missing. A statement that happens to
  // mention "masterplan" must not turn every one of its pages into a plan.
  const drawingType = /drawing|photograph/.test(docType);
  const docKind = drawingType || docType === '' ? prior.kind : undefined;
  const prose = isProsePage(text, stats);
  // Only read a page's own title text as a drawing kind when the page is not
  // running prose and the document is drawing-like or untyped. Administrative
  // pages are full of generic words like "plan" and "section".
  const textKind = !prose && (drawingType || docType === '') ? kindFromText(text) : undefined;
  const keywordKind = docKind ?? textKind;

  const docLabel = (doc.description || doc.documentType || 'Drawing').trim();

  // Reject pages that carry no visual content: flat brand covers and pages of
  // prose. Trusted drawing documents (whose pages are often note-heavy) are
  // exempt from the prose test.
  if (isFlatGraphic(stats)) return { kind: 'other', score: 0, label: docLabel };
  const photographic = isPhotographic(stats);
  const fullBleed = isFullBleed(stats);
  // A page is visual if it looks photographic or holds a large embedded image
  // with real tonal content. The latter catches figures/texture in statements
  // (a render or photo inset beside body copy), without letting flat decorative
  // graphics through.
  const visual = photographic || (options.hasLargeImage === true && stats.distinctColors >= 50);
  if (!visual && !drawingType && prose) return { kind: 'other', score: 0, label: docLabel };

  let kind: InsightImageKind = keywordKind ?? 'other';
  // A document that names photos/viewpoints resolves an otherwise-unknown
  // visual to `photo`; a design/statement document to `render`.
  const docVisual: 'photo' | undefined = /photo|viewpoint|avr/.test(docHay) ? 'photo' : undefined;
  const visualStatement = isDesignVisualDoc(doc);

  if (photographic) {
    // A photographic page (a broad-toned image filling the frame) is a
    // render/photo even with no keyword; this is the only reliable signal for
    // image-based drawings whose text was converted to curves.
    if (fullBleed) {
      // A full-bleed image is a render/photo even if the page text mentions a
      // plan word (a render page captioned "the masterplan").
      kind = docVisual ?? 'render';
    } else if (keywordKind === 'render' || keywordKind === 'photo') {
      kind = keywordKind;
    } else if (!keywordKind || keywordKind === 'other') {
      kind = docVisual ?? 'render';
    }
    // An explicit plan/map/elevation/section keyword is kept even if the page is
    // photographic: a rendered elevation is still an elevation, and a coloured
    // site plan is still a plan.
  } else if (visual && kind === 'other') {
    // A non-photographic embedded figure (large image, few tones) is only a
    // render when the document is a design/statement one that legitimately
    // holds scheme visuals. An appendix of maps or a report diagram is not: drop
    // it rather than let it masquerade as a render.
    const inferred = docVisual ?? (visualStatement ? 'render' : undefined);
    if (!inferred) return { kind: 'other', score: 0, label: docLabel };
    kind = inferred;
  }

  const existing = /\bexisting\b/.test(docHay) || /\bexisting\b/.test(textHay);
  const proposed = /\bproposed\b/.test(docHay) || /\bproposed\b/.test(textHay);

  // A plain text page (statement, form, letter) is not a visual: drop it rather
  // than padding the gallery with "other". Ambiguous drawing pages and
  // photographic pages are kept.
  if (kind === 'other' && !drawingType && !photographic) {
    return { kind, score: 0, label: docLabel };
  }

  let score = KIND_BASE[kind];
  score += stats.edgeDensity * 25;
  score += Math.min(stats.inkRatio, 0.9) * 8;
  if (proposed) score += 6;
  // "Existing" deprioritises an existing-condition drawing, but a render or
  // photo that merely mentions existing trees should not be penalised.
  if (existing && !proposed && kind !== 'render' && kind !== 'photo') score -= 45;
  if (isSuperseded(doc)) score -= 50;

  const label = textKind && !fullBleed ? (titleFromText(text) ?? docLabel) : docLabel;
  return { kind, score, label: label || docLabel };
}
