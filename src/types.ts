export interface DocumentMeta {
  localFilename: string;
  datePublished: string;
  documentType: string;
  description: string;
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
  happenedAt: string;
}
export interface Comment {
  address: string;
  stance: string;
  date: string;
  text: string;
  expanded?: boolean;
}

export interface SearchFilters {
  search?: string;
  developer?: string;
  app_type?: string;
  app_state?: string;
  app_size?: string;
  recent?: string;
  start_date?: string;
  end_date?: string;
  changed?: string;
  changed_start?: string;
  changed_end?: string;
  decided?: string;
  decided_start?: string;
  decided_end?: string;
  different?: string;
  different_start?: string;
  different_end?: string;
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
