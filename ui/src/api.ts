import type { ApplicationMeta, PlanItResponse, Comment, QueueItem, SearchFilters } from '../../src/types.js';

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

export async function downloadApplication(reference: string): Promise<void> {
  const res = await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to download application');
  }
}

export async function fetchComments(reference: string): Promise<Comment[]> {
  const safeRef = encodeURIComponent(reference.replace(/\//g, '-'));
  const res = await fetch(`/api/documents/${safeRef}/comments.json`);
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
