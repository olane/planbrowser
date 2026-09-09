export function timeAgo(dateStr: string | undefined): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Unknown';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 30) return 'Just now';
  if (diffInSeconds < 60) return `${diffInSeconds} seconds ago`;
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes === 1) return '1 minute ago';
  if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours === 1) return '1 hour ago';
  if (diffInHours < 24) return `${diffInHours} hours ago`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;

  // Fallback to a clean date format for older dates
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function statusLabel(app: { status?: string; furtherInformation?: Record<string, string> }): string {
  const status = app.status || '';
  const decision = app.furtherInformation?.['Decision'] || '';
  if (status.toLowerCase().includes('decided') && decision) {
    const d = decision.toLowerCase();
    if (d.includes('grant') || d.includes('permit') || d.includes('approv')) return 'Permitted';
    if (d.includes('refus')) return 'Refused';
  }
  return status;
}

export function progressText(progress: { message: string; current?: number; total?: number }): string {
  if (progress.total === undefined) return progress.message;
  return `${progress.message} (${progress.current ?? 0}/${progress.total})`;
}

export function statusBadgeClass(app: { status?: string; furtherInformation?: Record<string, string> }): string {
  const label = statusLabel(app).toLowerCase();
  if (label.includes('refus')) return 'bg-red-50 text-red-700 ring-red-600/10';
  if (label.includes('permit') || label.includes('grant')) return 'bg-green-50 text-green-700 ring-green-600/20';
  return 'bg-blue-50 text-blue-700 ring-blue-700/10';
}

// Documents are often uploaded in several numbered parts of a larger document,
// named in a few common ways:
//   "DESIGN AND ACCESS STATEMENT PART 2"        (PART / PT N)
//   "BUILDING A ELEVATIONS - SHEET 1 OF 2"      (SHEET / SH / SHT N [OF M])
//   "ARCHAEOLOGICAL DESK BASED ASSESSMENT 1 OF 2" (bare N OF M)
// A bare trailing number with no marker (a year, "PAGE 61", …) is deliberately
// NOT treated as a part, so unrelated documents are never grouped together.
const PART_SUFFIX_RE = /\b((?:PART|PT|SHEET|SH|SHT)\s+)?(\d+)(?:\s+OF\s+(\d+))?\s*$/i;

interface PartMatch {
  label: string;
  number: number;
}

function matchPart(description?: string): PartMatch | null {
  if (!description) return null;
  const trimmed = description.trim();
  const m = PART_SUFFIX_RE.exec(trimmed);
  if (!m) return null;
  if (!m[1] && !m[3]) return null;
  return { label: m[0].trim(), number: parseInt(m[2], 10) };
}

export function partNumber(description?: string): number | null {
  return matchPart(description)?.number ?? null;
}

// The part marker verbatim (e.g. "PART 2", "SHEET 1 OF 2", "1 OF 2") — used as
// the short row label inside a group.
export function partLabel(description?: string): string | null {
  return matchPart(description)?.label ?? null;
}

// The noun describing a numbered set (used in group headers, e.g. "4 parts" vs
// "2 sheets").
export function multipartUnit(description?: string): string {
  const label = partLabel(description)?.toLowerCase() ?? '';
  return label.includes('sheet') ? 'sheet' : 'part';
}

// The parent title with the trailing part marker stripped, or null when the
// description isn't a numbered part.
export function multipartBase(description?: string): string | null {
  if (!description) return null;
  const trimmed = description.trim();
  const m = PART_SUFFIX_RE.exec(trimmed);
  if (!m) return null;
  if (!m[1] && !m[3]) return null;
  return trimmed.slice(0, m.index).replace(/[\s\-–—:;,.]+$/g, '');
}

export interface DocumentGroup<T> {
  kind: 'group';
  title: string;
  parts: T[];
}

export interface DocumentSolo<T> {
  kind: 'doc';
  doc: T;
}

export type DocumentListEntry<T> = DocumentGroup<T> | DocumentSolo<T>;

// Re-orders a list of documents into entries, collapsing documents that share a
// base title and a trailing numbered marker (e.g. "DESIGN AND ACCESS STATEMENT
// PART 1".."PART 4", "…- SHEET 1 OF 2"/"SHEET 2 OF 2") under a single group.
// Only titles appearing more than once become groups, so an isolated "…PART 1"
// with no siblings stays a plain row.
export function groupDocuments<T extends { description?: string }>(docs: T[]): DocumentListEntry<T>[] {
  const counts = new Map<string, number>();
  const baseKey = (d: T) => {
    const base = multipartBase(d.description);
    return base ? base.toLowerCase() : null;
  };
  docs.forEach((d) => {
    const key = baseKey(d);
    if (key) counts.set(key, (counts.get(key) || 0) + 1);
  });

  const entries: DocumentListEntry<T>[] = [];
  const openGroups = new Map<string, DocumentGroup<T>>();
  docs.forEach((d) => {
    const key = baseKey(d);
    if (key && (counts.get(key) || 0) >= 2) {
      let group = openGroups.get(key);
      if (!group) {
        group = { kind: 'group', title: multipartBase(d.description)!, parts: [] };
        openGroups.set(key, group);
        entries.push(group);
      }
      group.parts.push(d);
    } else {
      entries.push({ kind: 'doc', doc: d });
    }
  });

  // Order parts numerically (PART 2 before PART 10) with a stable tie-break so
  // same-numbered duplicates keep their original (date) order.
  entries.forEach((entry) => {
    if (entry.kind !== 'group') return;
    entry.parts = entry.parts
      .map((doc, index) => ({ doc, index, n: partNumber(doc.description) ?? Infinity }))
      .sort((a, b) => a.n - b.n || a.index - b.index)
      .map((x) => x.doc);
  });

  return entries;
}

const KEY_DOC_KEYWORDS = [
  'design and access',
  'planning statement',
  'heritage statement',
  'decision notice',
  'officer report',
  'delegated report',
  'committee report',
  'appeal decision'
];

export function isKeyDocument(doc: { documentType?: string; description?: string; localFilename?: string }): boolean {
  // Match on the document type, its description (the name shown in the list)
  // and the stored filename, so documents that are only recognisable from
  // their name (e.g. "DESIGN & ACCESS STATEMENT PART 2" uploaded under a
  // generic type) still surface in Key Documents.
  const haystack = [doc.documentType, doc.description, doc.localFilename]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/&/g, 'and');
  return KEY_DOC_KEYWORDS.some((keyword) => haystack.includes(keyword));
}
