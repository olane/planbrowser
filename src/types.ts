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

export interface ApplicationLocation {
  center: { lat: number; lon: number };
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number };
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
