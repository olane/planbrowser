export interface DocumentMeta {
  localFilename: string;
  datePublished: string;
  documentType: string;
  description: string;
}

export interface ApplicationMeta {
  reference: string;
  address: string;
  description: string;
  status: string;
  dates: Record<string, string>;
  documents: DocumentMeta[];
  hasComments: boolean;
  scrapedAt: string;
}

export interface Comment {
  address: string;
  stance: string;
  date: string;
  text: string;
  expanded?: boolean;
}

export interface PlanItRecord {
  uid: string;
  name: string;
  app_state: string;
  description: string;
  url: string;
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
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
  enqueuedAt: string;
  startedAt?: string;
  completedAt?: string;
}
