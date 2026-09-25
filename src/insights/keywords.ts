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
// render rather than a photo, and "site plan" to a map rather than a plan.
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
      /site (?:location )?(?:plan|layout)/,
      /location (?:plan|map)/,
      /block plan/,
      /boundary (?:plan|map)/,
      /site location/,
      /location and block plan/
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
      /floor plan/,
      /(?:ground|first|second|third|fourth|fifth|sixth|lower|upper|basement|attic|loft) floor/,
      /roof plan/,
      /layout plan/,
      /parameter plan/,
      /master ?plan/,
      /framework plan/,
      /land use/,
      /development zone/,
      /access and movement/,
      /maximum heights/,
      /green and blue/
    ]
  }
];

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

  if (/render|visual|photomontage|cgi|artist impression|appendix|figure/.test(normalise(hay))) score += 2;

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
