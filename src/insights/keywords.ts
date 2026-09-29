import type { DocumentMeta, InsightImageKind } from '../types.js';
import { KIND_PRIOR_WEIGHT } from './kinds.js';

// Keyword-driven, deterministic priors. Names and portal tags are deliberately
// treated as weak evidence (see docs/insights.md): they rank candidates, they do
// not gate them. Page contents refine the decision later.

export interface DocumentPrior {
  score: number;
  kind?: InsightImageKind;
}

type NamedDocument = Pick<DocumentMeta, 'documentType' | 'description' | 'localFilename'>;

// Normalise a haystack for matching: lower-case, repair common HTML entities,
// and collapse separators to spaces so "SITE-PLAN" matches "site plan".
export function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ordered by specificity: the first match wins, so "photomontage" resolves to a
// render rather than a photo, and "site location plan" to a map rather than a
// plan.
//
// `map` means a *location/context* drawing only (where the site sits, its
// boundaries and designations). A plan of the development itself — including a
// "site plan" or "site layout" — is a `plan`.
const KIND_MATCHERS: { kind: InsightImageKind; patterns: RegExp[] }[] = [
  {
    kind: 'render',
    patterns: [
      /\brender(?:ed|ing|s)?\b/,
      /\bcgi\b/,
      // `normalise` turns "artist's" into "artist s".
      /\bartists? (?:s )?impression/,
      /photomontage/,
      /visuali[sz]ation/,
      /photoreal/,
      /axonometric/,
      /\b3d (?:view|visual|image)/,
      /aerial (?:view|image|visual)/
    ]
  },
  {
    kind: 'photo',
    patterns: [
      /photograph/,
      /\bphotos?\b/,
      /photosheet/,
      /\bavrs?\b/,
      /viewpoint/,
      /verified view/
    ]
  },
  {
    kind: 'map',
    patterns: [
      /location (?:plan|map)/,
      /site location/,
      /block plan/,
      /boundary (?:plan|map)/,
      /context (?:plan|map)/,
      /constraints? (?:plan|map)/,
      /designations? (?:plan|map)/,
      /\bkey diagram\b/,
      /\bos (?:map|extract)\b/
    ]
  },
  {
    kind: 'elevation',
    patterns: [/\belevations?\b/]
  },
  {
    kind: 'section',
    // Not "section 106" / "section 73" (legal agreements, variations).
    patterns: [/\bsections?\b(?! ?\d)/]
  },
  {
    kind: 'plan',
    patterns: [
      /site (?:plan|layout)/,
      // "Proposed plans", "plans and elevations": a drawing pack's floor plans.
      /\b(?:proposed|existing) plans?\b/,
      /\bplans and (?:elevations|sections)\b/,
      /general arrangement/,
      /floor plan/,
      /(?:ground|first|second|third|fourth|fifth|sixth|lower|upper|basement|attic|loft) floor/,
      /roof plan/,
      /layout plan/,
      /parameter plan/,
      /master ?plan/,
      /framework plan/,
      /indicative (?:layout|masterplan)/,
      /land use/,
      /development zone/,
      /access and movement/,
      /maximum heights/,
      /green and blue/
    ]
  }
];

// Captions that disambiguate a render from a photo, read from the text next to
// the image (or the whole page when it is a full-bleed visual). A render shows
// the proposal ("artist's impression", "CGI", "photomontage"); a photo records
// existing conditions ("viewpoint", "existing view") or carries the photomontage
// apparatus ("season", "direction of view"). Orientation words alone are not
// decisive — a render legend can mention "existing tree groups" — so they are
// only hints alongside an explicit render/photo word.
const RENDER_HINTS =
  /\b(?:artist s? impression|impression|render(?:ed|ing|s)?|cgi|computer generated|visuali[sz]ation|photomontage|photoreal|axonometric|3d (?:view|visual|image)|aerial (?:view|image|visual)|how (?:it|the scheme|the development) (?:will|would) look)\b/;
const PHOTO_HINTS =
  /\b(?:photograph(?:s|ic|y)?|photos?|photosheet|viewpoint|verified view|accurate visual representation|avrs?|existing (?:view|condition|photograph)|as existing|context (?:view|photograph)|site (?:photo|photograph)|season|direction of view|shortest distance|single image)\b/;

export function visualKindFromText(text: string): 'render' | 'photo' | undefined {
  const hay = normalise(text);
  if (!hay) return undefined;
  // An explicit render word wins even when the caption also says "viewpoint":
  // a photomontage is a proposed render, not a record photograph.
  if (RENDER_HINTS.test(hay)) return 'render';
  if (PHOTO_HINTS.test(hay)) return 'photo';
  return undefined;
}

// Classify a piece of text (usually a page's title block, or a document's
// name/type/description) into a visual kind, if it mentions one.
export function kindFromText(text: string): InsightImageKind | undefined {
  return kindsFromText(text)[0];
}

// Every kind a piece of text names, most specific first. A drawing pack called
// "Proposed plans and elevations" names two, so its pages can be told apart by
// their own titles.
export function kindsFromText(text: string): InsightImageKind[] {
  const hay = normalise(text);
  if (!hay) return [];
  return KIND_MATCHERS.filter(({ patterns }) => patterns.some((re) => re.test(hay))).map(({ kind }) => kind);
}

// The normalised name haystack for a document: type, description and filename.
export function documentHaystack(doc: NamedDocument): string {
  return normalise([doc.documentType, doc.description, doc.localFilename].filter(Boolean).join(' '));
}

const SUPERSEDED_RE = /superseded/;
// The Design & Access Statement is usually the best single summary of a scheme
// for a casual reader, so it is worth scanning and showing even when it is not
// typed as a drawing. (`normalise` has already turned "&" into "and".)
const DESIGN_AND_ACCESS_RE = /design and access/;
// A document that legitimately contains design visuals of the proposal (a
// render, photomontage or figure of the scheme). This is the positive evidence
// that lets a mystery embedded image be called a render: an appendix of maps or
// a report's diagram is not a design visual, so it must not be promoted.
const DESIGN_VISUAL_RE =
  /design and access|design (?:statement|code)|landscape and visual|visual impact|photomontage|artists? (?:s )?impression|render|visuali[sz]|master ?plan|illustrat|exhibition|street scene|palette|aerial/;
// Supporting/reference volumes: appendices, figure books and schedules. These
// are usually maps, diagrams and data. They can still hold named photos or
// renders, but an *unnamed* visual in one is far more likely to be a reference
// diagram than one of the scheme's own renders.
const REFERENCE_VOLUME_RE = /\bappendi(?:x|ces)\b|\bfigures?\b|\bschedules?\b/;
// Documents without a name keyword are only worth scanning page-by-page if they
// plausibly hold visuals; otherwise transport/geo/environmental reports would be
// scanned for nothing.
const VISUAL_NAME_RE =
  /design and access|\bfigures?\b|visual|landscape|render|photomontage|montage|illustrat|master ?plan|image|photo|cgi\b|3d |exhibition|street scene|palette|aerial/;
// A name that says the document holds photographs or viewpoints resolves an
// otherwise-unknown visual to `photo`.
const PHOTO_NAME_RE = /photo|viewpoint|avr/;
const RENDER_NAME_RE = /render|visual|photomontage|cgi|artists? (?:s )?impression/;
// Administratively-named files (forms, fee letters, validation notices, …) are
// almost never visual and otherwise ride the generic "Application Information"
// type into the gallery. Matched against description + filename only.
const ADMIN_RE =
  /application form|fee calculation|invalid|validation|acknowledg|agreement|covering letter|press notice|site notice|notification list|attachment summary|correspondence|consultee|third party|agent|neighbour|decision notice|officer report/;

// Everything the pipeline needs to know about a document from its name and
// portal type, computed once. Names are weak evidence: they choose which files
// to open first and supply a fallback kind, but page contents decide.
export interface DocumentProfile {
  // Label used when a page has no title of its own.
  label: string;
  // Normalised type / description / filename.
  hay: string;
  // Normalised portal document type.
  type: string;
  // Kinds the name mentions, most specific first.
  kinds: InsightImageKind[];
  // Typed as drawings or photographs by the portal.
  drawing: boolean;
  // No portal type at all.
  untyped: boolean;
  designAndAccess: boolean;
  designVisual: boolean;
  referenceVolume: boolean;
  superseded: boolean;
  admin: boolean;
  namesPhoto: boolean;
  namesRender: boolean;
  // Worth pre-scanning page-by-page for embedded figures.
  visualName: boolean;
  prior: DocumentPrior;
}

export function profileDocument(doc: NamedDocument): DocumentProfile {
  const hay = documentHaystack(doc);
  const type = normalise(doc.documentType || '');
  const kinds = kindsFromText(hay);
  const profile: Omit<DocumentProfile, 'prior'> = {
    label: (doc.description || doc.documentType || 'Drawing').trim() || 'Drawing',
    hay,
    type,
    kinds,
    drawing: /drawing|photograph/.test(type),
    untyped: type === '',
    designAndAccess: DESIGN_AND_ACCESS_RE.test(hay),
    designVisual: DESIGN_VISUAL_RE.test(hay),
    referenceVolume: REFERENCE_VOLUME_RE.test(hay),
    superseded: SUPERSEDED_RE.test(hay),
    admin: ADMIN_RE.test(normalise([doc.description, doc.localFilename].filter(Boolean).join(' '))),
    namesPhoto: PHOTO_NAME_RE.test(hay),
    namesRender: RENDER_NAME_RE.test(hay),
    visualName: VISUAL_NAME_RE.test(hay)
  };
  return { ...profile, prior: priorFromProfile(profile) };
}

// A document-level prior used to choose which files to open first. Positive
// means "likely to contain a visual worth showing"; comment/correspondence
// documents are pushed down.
function priorFromProfile(p: Omit<DocumentProfile, 'prior'>): DocumentPrior {
  const kind = p.kinds[0];

  let score = 0;
  if (kind) score += KIND_PRIOR_WEIGHT[kind];

  if (/drawing/.test(p.type)) score += 4;
  else if (/photograph/.test(p.type)) score += 3;
  else if (/design and access/.test(p.type)) score += 1.5;
  else if (/survey|assessment|statement/.test(p.type)) score += 0.5;
  else if (/application information/.test(p.type)) score += 0.5;
  else if (/comment|correspondence|notification|attachment summary|officer/.test(p.type)) score -= 3;

  if (p.namesRender) score += 2;

  // A visual-sounding name with no kind (an "Image Board", "Exhibition Panels")
  // still deserves a page scan; without this the `prior.score > 0` filter would
  // drop it before the pre-scan that was written for exactly these files.
  if (!kind && p.visualName) score += 1;

  // Prioritise the Design & Access Statement regardless of how the portal typed
  // it (it is sometimes filed under Drawings).
  if (p.designAndAccess) score += 5;

  // Appendix/figure volumes are supporting reference, not the scheme's own
  // design visuals. Without a visual kind they mostly contribute diagrams and
  // maps, so do not let them crowd out real drawings.
  if (!kind && p.referenceVolume) score -= 2;

  if (p.admin) score -= 6;
  if (p.superseded) score -= 8;

  const prior: DocumentPrior = { score };
  if (kind) prior.kind = kind;
  return prior;
}

