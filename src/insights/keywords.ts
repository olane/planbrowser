import type { DocumentMeta, InsightImageKind } from '../types.js';

// Keyword-driven, deterministic priors. Names and portal tags are deliberately
// treated as weak evidence (see docs/insights.md): they rank candidates, they do
// not gate them. Page contents refine the decision later.

export interface DocumentPrior {
  score: number;
  kind?: InsightImageKind;
}

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
      /artist'?s? impression/,
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
      /photo\b/,
      /photosheet/,
      /\bavrs?\b/,
      /viewpoint/,
      /verified view/,
      /photomontage/ // caught by render first, kept as fallback
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
    patterns: [/\bsections?\b/, /section through/, /cross section/]
  },
  {
    kind: 'plan',
    patterns: [
      /site (?:plan|layout)/,
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
  const hay = normalise(text);
  if (!hay) return undefined;
  for (const { kind, patterns } of KIND_MATCHERS) {
    if (patterns.some((re) => re.test(hay))) return kind;
  }
  return undefined;
}

const KIND_WEIGHT: Record<InsightImageKind, number> = {
  render: 5,
  map: 4,
  elevation: 4,
  plan: 3.5,
  section: 3,
  photo: 2,
  other: 0
};

export function isSuperseded(doc: Pick<DocumentMeta, 'documentType' | 'description' | 'localFilename'>): boolean {
  return /superseded/.test(normalise([doc.documentType, doc.description, doc.localFilename].join(' ')));
}

// The Design & Access Statement is usually the best single summary of a scheme
// for a casual reader, so it is worth scanning and showing even when it is not
// typed as a drawing.
export function isDesignAndAccess(
  doc: Pick<DocumentMeta, 'documentType' | 'description' | 'localFilename'>
): boolean {
  return /design (and|&) access/.test(normalise([doc.documentType, doc.description, doc.localFilename].join(' ')));
}

// A document that legitimately contains design visuals of the proposal (a
// render, photomontage or figure of the scheme). This is the positive evidence
// that lets a mystery embedded image be called a render: an appendix of maps or
// a report's diagram is not a design visual, so it must not be promoted.
export function isDesignVisualDoc(
  doc: Pick<DocumentMeta, 'documentType' | 'description' | 'localFilename'>
): boolean {
  return /design (and|&) access|design (?:statement|code)|landscape and visual|visual impact|photomontage|artist s? impression|render|visuali[sz]|master ?plan|illustrat|exhibition|street scene|palette|aerial/.test(
    normalise([doc.documentType, doc.description, doc.localFilename].filter(Boolean).join(' '))
  );
}

// Supporting/reference volumes: appendices, figure books and schedules. These
// are usually maps, diagrams and data. They can still hold named photos or
// renders, but an *unnamed* visual in one is far more likely to be a reference
// diagram than one of the scheme's own renders.
export function isReferenceVolume(
  doc: Pick<DocumentMeta, 'documentType' | 'description' | 'localFilename'>
): boolean {
  return /\bappendi(?:x|ces)\b|\bfigures?\b|\bschedules?\b/.test(
    normalise([doc.documentType, doc.description, doc.localFilename].filter(Boolean).join(' '))
  );
}

// A document-level prior used to choose which files to open first. Positive
// means "likely to contain a visual worth showing"; comment/correspondence
// documents are pushed down.
export function documentPrior(doc: Pick<DocumentMeta, 'documentType' | 'description' | 'localFilename'>): DocumentPrior {
  const type = normalise(doc.documentType || '');
  const hay = [doc.documentType, doc.description, doc.localFilename].filter(Boolean).join(' ');
  const kind = kindFromText(hay);

  let score = 0;
  if (kind) score += KIND_WEIGHT[kind];

  if (/drawing/.test(type)) score += 4;
  else if (/photograph/.test(type)) score += 3;
  else if (/design and access/.test(type)) score += 1.5;
  else if (/survey|assessment|statement/.test(type)) score += 0.5;
  else if (/application information/.test(type)) score += 0.5;
  else if (/comment|correspondence|notification|attachment summary|officer/.test(type)) score -= 3;

  if (/render|visual|photomontage|cgi|artist impression/.test(normalise(hay))) score += 2;

  // Prioritise the Design & Access Statement regardless of how the portal typed
  // it (it is sometimes filed under Drawings).
  if (isDesignAndAccess(doc)) score += 5;

  // Appendix/figure volumes are supporting reference, not the scheme's own
  // design visuals. Without a visual kind they mostly contribute diagrams and
  // maps, so do not let them crowd out real drawings.
  if (!kind && isReferenceVolume(doc)) score -= 2;

  // Administratively-named files (forms, fee letters, validation notices, …)
  // are almost never visual and otherwise ride the generic "Application
  // Information" type into the gallery.
  const adminHay = normalise([doc.description, doc.localFilename].join(' '));
  if (
    /application form|fee calculation|invalid|validation|acknowledg|agreement|covering letter|press notice|site notice|notification list|attachment summary|correspondence|consultee|third party|agent|neighbour|decision notice|officer report/.test(
      adminHay
    )
  ) {
    score -= 6;
  }

  if (isSuperseded(doc)) score -= 8;

  const prior: DocumentPrior = { score };
  if (kind) prior.kind = kind;
  return prior;
}
