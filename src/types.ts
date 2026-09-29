export interface DocumentMeta {
  localFilename: string;
  datePublished: string;
  documentType: string;
  description: string;
  // Idox's per-document id, scraped from the row's file URL / bulk-zip member
  // (e.g. ".../files/<hash>/pdf/<REF>-<NAME>-7414943.pdf" -> "7414943"). This is
  // the real identity of a document: two rows with the same id are the same file,
  // while two rows that merely render the same date/type/description may still be
  // genuinely different documents. Recorded so re-scrapes can match by id rather
  // than by the generated local filename.
  docId?: string;
  starred?: boolean;
  note?: string;
}

export interface DocumentFlags {
  starred: boolean;
  note: string;
  starredAt?: string;
  noteUpdatedAt?: string;
}

export interface AuthorityMapConfig {
  wfsUrl: string;
  layers: string[];
  refField: string;
}

export interface AuthorityConfig {
  id: string;
  name: string;
  aliases?: string[];
  baseUrl: string;
  map?: AuthorityMapConfig;
}

// Where an application's location came from. 'wfs' is exact site geometry
// scraped from an authority's map server; 'postcode' is a centroid resolved from
// the address postcode, so it is approximate (street/sector level at best).
export type LocationSource = 'wfs' | 'postcode';

export interface ApplicationLocation {
  center: { lat: number; lon: number };
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  source?: LocationSource;
}

export interface ApplicationMeta {
  reference: string;
  authorityId?: string;
  address: string;
  description: string;
  status: string;
  dates: Record<string, string>;
  documents: DocumentMeta[];
  hasComments: boolean;
  scrapedAt: string;
  portalUrl?: string;
  furtherInformation?: Record<string, string>;
  importantDates?: Record<string, string>;
  location?: ApplicationLocation;
  starred?: boolean;
  archived?: boolean;

}

export interface ApplicationFlags {
  starred: boolean;
  archived: boolean;
  starredAt?: string;
  archivedAt?: string;
}

export interface ChangeEntry {
  field: string;
  before?: string;
  after?: string;
}

export interface ActivityEvent {
  id: string;
  reference: string;
  authorityId: string;
  message: string;
  changes: ChangeEntry[];
  newDocuments?: DocumentMeta[];
  happenedAt: string;
  // The application metadata at the time the feed was read, attached by the
  // API so the UI can render the event alongside a full application card.
  // Null when the application is no longer downloaded.
  application?: ApplicationMeta | null;
}
export interface Comment {
  address: string;
  stance: string;
  date: string;
  text: string;
  expanded?: boolean;
}

// The matched context returned by a document content search, split so the UI
// can render the matching term with a highlight without resorting to v-html.
export interface DocumentSnippet {
  before: string;
  match: string;
  after: string;
}

export interface DocumentSearchHit {
  localFilename: string;
  documentType: string;
  description: string;
  datePublished: string;
  snippet: DocumentSnippet;
}

export const SEARCH_FILTER_KEYS = [
  'search',
  'developer',
  'app_type',
  'app_state',
  'app_size',
  'recent',
  'start_date',
  'end_date',
  'changed',
  'changed_start',
  'changed_end',
  'decided',
  'decided_start',
  'decided_end',
  'different',
  'different_start',
  'different_end'
] as const;

export type SearchFilterKey = (typeof SEARCH_FILTER_KEYS)[number];

export type SearchFilters = Partial<Record<SearchFilterKey, string>>;

// Fields the PlanIt API can sort search results on. `distance` is only
// populated for proximity searches (postcode/radius), which is the only kind
// planbrowser runs, so it is a safe option here.
export const SORT_FIELDS = [
  'start_date',
  'decided_date',
  'last_changed',
  'last_different',
  'distance',
  'address',
  'postcode',
  'app_type',
  'app_state'
] as const;

export type SortField = (typeof SORT_FIELDS)[number];
export type SortOrder = 'asc' | 'desc';

export interface SortSpec {
  field: SortField;
  order: SortOrder;
}

export interface PlanItRecord {
  uid: string;
  name: string;
  address?: string;
  app_state: string;
  description: string;
  url: string;
  location_x?: number;
  location_y?: number;
  location?: { type: string; coordinates: [number, number] };
  [key: string]: any;
}

export interface PlanItResponse {
  records: PlanItRecord[];
  total?: number;
  from?: number;
  to?: number;
  [key: string]: any;
}

export interface EnhancedDocument extends DocumentMeta {
  url: string;
  isSuperseded: boolean;
  supersededBy: EnhancedDocument | null;
  replaces: EnhancedDocument[];
}

export interface QueueItem {
  id: string;
  reference: string;
  authorityId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;
  progress?: {
    message: string;
    current?: number;
    total?: number;
  };
}

export interface SavedSearch {
  id: string;
  postcode: string;
  radius: string;
  filters: SearchFilters;
  sort?: SortSpec;
  createdAt: string;
  // When the saved search was last re-run, and the set of application
  // references returned by that run. Used to highlight results that are new
  // since the previous run.
  lastRunAt?: string;
  lastReferences?: string[];
}

// --- Application insights -------------------------------------------------
// Automatically-derived summary and the most relevant images/plans/renders
// for an application. Produced by a strategy (see src/insights/) and cached
// on disk next to metadata.json as insights.json.

export type InsightImageKind =
  | 'render'
  | 'plan'
  | 'elevation'
  | 'section'
  | 'map'
  | 'photo'
  | 'other';

export interface InsightImage {
  // Content hash of the stored thumbnail; also the asset's filename stem.
  id: string;
  kind: InsightImageKind;
  label: string;
  localFilename: string;
  page: number;
  imageFile: string;
  width: number;
  height: number;
  score: number;
  // Difference hash of the page, for collapsing near-duplicate images.
  phash?: string;
  // Why the classifier chose this kind (debug; shown in the contact sheet).
  reason?: string;
}

// A page-level verdict made in the review UI (docs/insights.md). The eval's
// ground truth stores these; `kind` is only meaningful for a good verdict.
export interface InsightLabel {
  file: string;
  page: number;
  verdict: 'good' | 'bad';
  kind?: InsightImageKind;
}

// One interpreted page, accepted or rejected, with the classifier's reason. The
// review UI uses these to surface pages the heuristic dropped (false negatives).
export interface InsightPage {
  localFilename: string;
  page: number;
  kind: InsightImageKind;
  score: number;
  reason: string;
  // Content hash of the page's thumbnail at generation time; the asset may since
  // have been pruned, in which case the review endpoint re-renders it on demand.
  imageFile: string;
}

export interface InsightSummary {
  headline: string;
  points: string[];
  metrics: Record<string, string>;
}

export interface InsightCommentTally {
  support: number;
  object: number;
  neutral: number;
  total: number;
}

export interface InsightKindSummary {
  kind: InsightImageKind;
  // How many images of this kind were kept in `images`.
  selected: number;
  // Distinct candidates of this kind after dedupe but before the selection caps,
  // i.e. how many were "found" in the analysed pages.
  available: number;
}

export interface InsightsCoverage {
  // Per-kind selected vs available, so the UI can say "showing 6 of 11".
  images: InsightKindSummary[];
  // True when analysis itself was capped (document/page render budget), so even
  // `available` is a lower bound and not every document was scanned.
  partial: boolean;
  documentsAnalysed: number;
  documentsTotal: number;
}

export interface ApplicationInsights {
  version: number;
  // Which strategy produced this, so changing strategy/version invalidates the
  // cached insights without touching the (reusable) rendered artifacts.
  strategy: { id: string; version: number };
  generatedAt: string;
  // mtime/size of each source document at generation time, for cache validity.
  source: { filename: string; mtimeMs: number; size: number }[];
  summary: InsightSummary;
  // Curated highlights (capped, diverse) shown by default.
  images: InsightImage[];
  // Every distinct candidate found in the analysed pages, before the selection
  // caps. Lets the UI offer "show all found". Optional for older caches.
  found?: InsightImage[];
  // Which budget the generation used. `deep` scans more documents/pages.
  depth?: 'quick' | 'deep';
  comments: InsightCommentTally;
  // Optional for caches written before coverage tracking.
  coverage?: InsightsCoverage;
  // Every page the interpreter rendered, accepted or rejected. Optional for
  // caches written before it existed; the review UI regenerates to get it.
  pages?: InsightPage[];
}
