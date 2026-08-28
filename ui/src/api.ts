import type { ApplicationMeta, PlanItResponse, Comment } from '../../src/types.js';

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

export async function searchPlanIt(postcode: string, radius: string): Promise<PlanItResponse> {
  const res = await fetch(`/api/search?postcode=${encodeURIComponent(postcode)}&radius=${encodeURIComponent(radius)}`);
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
