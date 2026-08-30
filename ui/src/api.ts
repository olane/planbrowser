import type { ApplicationMeta, PlanItResponse, Comment, QueueItem, SearchFilters, ApplicationFlags, ActivityEvent, DocumentFlags } from '../../src/types.js';
import { DEFAULT_AUTHORITY_ID } from '../../src/authorities.js';

// Downloads are namespaced under downloads/<authorityId>/. Older metadata without an
// authorityId was migrated into the cambridge directory, hence the fallback.
export function docUrlPrefix(authorityId?: string): string {
  return `${authorityId || DEFAULT_AUTHORITY_ID}/`;
}

export async function fetchApplications(): Promise<ApplicationMeta[]> {
  const res = await fetch('/api/applications');
  if (!res.ok) throw new Error('Failed to fetch applications');
  return res.json();
}

export async function fetchApplication(reference: string): Promise<ApplicationMeta> {
  const res = await fetch(`/api/applications/${encodeURIComponent(reference)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to load application');
  }
  return res.json();
}

export async function searchPlanIt(postcode: string, radius: string, filters: SearchFilters = {}): Promise<PlanItResponse> {
  const params = new URLSearchParams({ postcode, radius });
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  const res = await fetch(`/api/search?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to search PlanIt');
  }
  return res.json();
}

export async function downloadApplication(reference: string, authority?: string): Promise<void> {
  const res = await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference, authority })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to download application');
  }
}

export async function fetchComments(reference: string, authorityId?: string): Promise<Comment[]> {
  const safeRef = encodeURIComponent(reference.replace(/\//g, '-'));
  const res = await fetch(`/api/documents/${docUrlPrefix(authorityId)}${safeRef}/comments.json`);
  if (!res.ok) throw new Error('Failed to load comments');
  return res.json();
}

export async function fetchQueue(): Promise<QueueItem[]> {
  const res = await fetch('/api/queue');
  if (!res.ok) throw new Error('Failed to fetch queue');
  return res.json();
}

export async function clearQueue(): Promise<void> {
  const res = await fetch('/api/queue/clear', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to clear queue');
}

export async function setApplicationFlags(reference: string, flags: Partial<ApplicationFlags>, authority?: string): Promise<ApplicationFlags> {
  const res = await fetch(`/api/applications/${encodeURIComponent(reference)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authority, ...flags })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update application');
  }
  const data = await res.json();
  return data.flags;
}

export async function fetchFeed(): Promise<ActivityEvent[]> {
  const res = await fetch('/api/feed');
  if (!res.ok) throw new Error('Failed to fetch activity feed');
  return res.json();
}

export async function syncStarred(): Promise<{ queued: number }> {
  const res = await fetch('/api/sync-starred', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to sync starred applications');
  }
  return res.json();
}

export async function setDocumentFlags(reference: string, filename: string, flags: Partial<DocumentFlags>, authority?: string): Promise<DocumentFlags> {
  const res = await fetch('/api/documents', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference, filename, authority, ...flags })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to update document');
  }
  const data = await res.json();
  return data.flags;
}
