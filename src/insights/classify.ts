import type { InsightImageKind } from '../types.js';
import { kindFromText, normalise, visualKindFromText, type DocumentProfile } from './keywords.js';
import type { PagePixelStats } from './pixels.js';
import { linesFromText, linesToText, titleCandidates, type PageLine, type TitleCandidate } from './title.js';

export interface PageClassification {
  kind: InsightImageKind;
  score: number;
  label: string;
  // Why the page got this kind (or was rejected), for the contact sheet and
  // eval output. Not shown to end users.
  reason: string;
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
  // Text near the page's largest embedded image. Its own caption is the best
  // evidence for render-vs-photo when the document name is silent.
  caption?: string | undefined;
}

// One piece of evidence for a page's kind, and where it came from.
interface Evidence {
  kind: InsightImageKind;
  why: string;
  // The page title that supplied it, used as the page's label.
  title?: string;
}

const quote = (text: string): string => `"${text.length > 50 ? `${text.slice(0, 47)}...` : text}"`;

// The drawing kind a page's own title and its document's name agree on. Page
// content comes first (a drawing pack's pages differ), but a bare inset heading
// such as "LOCATION PLAN 1:1250" on a floor-plan sheet must not overrule a
// document that names a single kind. Precedence:
//   1. a qualified page title ("PROPOSED FIRST FLOOR PLAN")
//   2. the document name, when it names exactly one kind
//   3. an unqualified page title (one the document name also mentions, if any)
//   4. the document name's most specific kind
//   5. any drawing word in the page text
function namedKind(profile: DocumentProfile, titles: TitleCandidate[], text: string): Evidence | undefined {
  const fromTitle = (title: TitleCandidate, strength: string): Evidence => ({
    kind: title.kind,
    why: `${strength} page title ${quote(title.text)}`,
    title: title.text
  });
  const strong = titles.find((title) => title.strong);
  if (strong) return fromTitle(strong, 'qualified');
  const [docKind] = profile.kinds;
  if (docKind && profile.kinds.length === 1) return { kind: docKind, why: `document name (${docKind})` };
  const weak = titles.find((title) => profile.kinds.includes(title.kind)) ?? titles[0];
  if (weak) return fromTitle(weak, 'page title');
  if (docKind) return { kind: docKind, why: `document name (${profile.kinds.join('/')})` };
  const textKind = kindFromText(text);
  return textKind ? { kind: textKind, why: 'drawing word in page text' } : undefined;
}

const isVisualKind = (kind: InsightImageKind): boolean => kind === 'render' || kind === 'photo';

export function classifyPage(
  profile: DocumentProfile,
  page: string | PageLine[],
  stats: PagePixelStats,
  options: ClassifyOptions = {}
): PageClassification {
  const lines = typeof page === 'string' ? linesFromText(page) : page;
  const text = typeof page === 'string' ? page : linesToText(page);
  const reject = (why: string): PageClassification => ({ kind: 'other', score: 0, label: profile.label, reason: `rejected: ${why}` });

  // --- Appearance -----------------------------------------------------------
  if (isFlatGraphic(stats)) return reject('flat graphic (cover or divider)');
  const prose = isProsePage(text, stats);
  const photographic = isPhotographic(stats);
  const fullBleed = isFullBleed(stats);
  // A large embedded image with real tonal content: a render or photo inset
  // beside body copy, without letting flat decorative graphics through.
  const figure = options.hasLargeImage === true && stats.distinctColors >= 50;
  const appearance = [photographic && 'photographic', fullBleed && 'full-bleed', figure && 'embedded figure', prose && 'prose']
    .filter(Boolean)
    .join(', ');
  const because = (evidence: Evidence): string => `${evidence.kind} from ${evidence.why}${appearance ? ` [${appearance}]` : ''}`;
  // Trusted drawing documents (whose pages are often note-heavy) are exempt
  // from the prose test.
  if (!photographic && !figure && !profile.drawing && prose) return reject('prose page');

  // --- Evidence -------------------------------------------------------------
  // A document's name and its pages' drawing titles are only reliable for
  // actual drawings/photographs or untyped files: a statement that mentions
  // "masterplan", or an admin page full of "plan" and "section", must not
  // become a drawing. Page titles are ignored on prose pages.
  const trustNames = profile.drawing || profile.untyped;
  const titles = trustNames && !prose ? titleCandidates(lines) : [];
  const named = trustNames ? namedKind(profile, titles, prose ? '' : text) : undefined;
  // The image's own caption outranks the document name for render-vs-photo.
  const captionKind = options.caption ? visualKindFromText(options.caption) : undefined;
  const caption: Evidence | undefined = captionKind ? { kind: captionKind, why: `caption ${quote(options.caption ?? '')}` } : undefined;
  // An unnamed visual needs positive evidence before it is shown. A render may be
  // inferred in a design/statement document; in a reference volume (appendix,
  // figure book) an unnamed visual is more likely a map or diagram.
  const unnamedVisual = (allowRender: boolean): Evidence | undefined =>
    caption ??
    (profile.namesPhoto ? { kind: 'photo', why: 'document names photos/viewpoints' } : undefined) ??
    (allowRender ? { kind: 'render', why: profile.designVisual ? 'design document visual' : 'photographic page' } : undefined);

  // --- Resolution -----------------------------------------------------------
  let evidence = named;
  if (photographic) {
    if (named && isVisualKind(named.kind)) {
      evidence = caption ?? named;
    } else if (fullBleed || !named) {
      // A full-bleed image is a render/photo even if its text mentions a plan
      // word (a render captioned "the masterplan"); an unnamed photographic
      // page is the only signal for image-based drawings whose text is curves.
      evidence = unnamedVisual(profile.designVisual || !profile.referenceVolume);
      if (!evidence) return reject(`unnamed visual in a reference volume [${appearance}]`);
    }
    // Otherwise an explicit plan/map/elevation/section is kept: a rendered
    // elevation is still an elevation, and a coloured site plan is still a plan.
  } else if (figure && !named) {
    // A non-photographic embedded figure is only a render when a caption says so
    // or the document legitimately holds scheme visuals.
    evidence = unnamedVisual(profile.designVisual);
    if (!evidence) return reject(`embedded figure with no render/photo evidence [${appearance}]`);
  }

  // Ambiguous pages of a drawing document are kept as `other`; anything else
  // without a kind (a plain text page, a form, a letter) is dropped.
  if (!evidence) {
    if (profile.referenceVolume || (!profile.drawing && !photographic)) return reject(`no visual kind${appearance ? ` [${appearance}]` : ''}`);
    evidence = { kind: 'other', why: 'drawing document page' };
  }
  const kind = evidence.kind;

  // --- Score ----------------------------------------------------------------
  const textHay = normalise(text);
  const existing = /\bexisting\b/.test(profile.hay) || /\bexisting\b/.test(textHay);
  const proposed = /\bproposed\b/.test(profile.hay) || /\bproposed\b/.test(textHay);
  let score = KIND_BASE[kind];
  score += stats.edgeDensity * 25;
  score += Math.min(stats.inkRatio, 0.9) * 8;
  if (proposed) score += 6;
  // "Existing" deprioritises an existing-condition drawing, but a render or
  // photo that merely mentions existing trees should not be penalised.
  if (existing && !proposed && !isVisualKind(kind)) score -= 45;
  if (profile.superseded) score -= 50;

  // Label with the page's own title for this kind, if it has one. A full-bleed
  // page's text is usually body copy, not a title.
  const title = evidence.title ?? titles.find((candidate) => candidate.kind === kind)?.text;
  const label = title && !fullBleed ? title : profile.label;
  return { kind, score, label, reason: because(evidence) };
}
