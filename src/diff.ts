import type { ApplicationMeta, ChangeEntry, DocumentMeta } from './types.js';

export interface MetaDiff {
  changes: ChangeEntry[];
  message: string;
  newDocuments: DocumentMeta[];
}

export function diffMeta(previous: ApplicationMeta | null, meta: ApplicationMeta): MetaDiff {
  if (!previous) {
    return { changes: [], message: 'Application added', newDocuments: [] };
  }
  const changes: ChangeEntry[] = [];
  if (previous.status && meta.status && previous.status !== meta.status) {
    changes.push({ field: 'Status', before: previous.status, after: meta.status });
  }
  if (previous.address && meta.address && previous.address !== meta.address) {
    changes.push({ field: 'Address', before: previous.address, after: meta.address });
  }
  if (previous.description && meta.description && previous.description !== meta.description) {
    changes.push({ field: 'Proposal', before: previous.description, after: meta.description });
  }
  const prevDocNames = new Set(previous.documents.map((d) => d.localFilename));
  const newDocs = meta.documents.filter((d) => !prevDocNames.has(d.localFilename));
  if (newDocs.length > 0) {
    changes.push({ field: 'Documents', after: `${newDocs.length} new document${newDocs.length === 1 ? '' : 's'}` });
  }
  if (!previous.hasComments && meta.hasComments) {
    changes.push({ field: 'Comments', after: 'Comments are now available' });
  }
  const prevDates = previous.importantDates ?? {};
  const newDates = meta.importantDates ?? {};
  for (const [key, value] of Object.entries(newDates)) {
    const before = prevDates[key];
    if (before && before !== value) {
      changes.push({ field: key, before, after: value });
    }
  }
  return {
    changes,
    message: changes.length > 0 ? 'Application updated' : 'No changes detected',
    newDocuments: newDocs
  };
}
