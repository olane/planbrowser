import type { ApplicationInsights, InsightsProgress } from '../types.js';
import { resolveApplicationMeta } from '../storage.js';
import { readInsights } from './cache.js';
import { documentList, isCurrent, sourceSignature, type GenerateOptions } from './generate.js';
import { insightsQueue } from './queue.js';

type InsightsStatus = 'none' | 'running' | 'ready' | 'error';

interface InsightsState {
  status: InsightsStatus;
  insights?: ApplicationInsights;
  // Live counters for an in-flight run, so the UI can show real progress.
  progress?: InsightsProgress;
  error?: string;
}

// Queue a generation. The queue deduplicates by reference, so a request while a
// run is in flight simply joins it (and a pending deep request upgrades it).
export function startInsights(reference: string, authorityId?: string, opts: GenerateOptions = {}): void {
  insightsQueue.enqueue(reference, authorityId, {
    ...(opts.deep !== undefined ? { deep: opts.deep } : {}),
    ...(opts.force !== undefined ? { force: opts.force } : {}),
  });
}

// Current state for the API: returns a ready result only when the cache is
// fresh. A stale cache (documents changed on sync, or a strategy bump) is
// refreshed in the background so the viewer reflects the sync without the user
// having to regenerate manually. A missing cache is left for the user to start.
export function getInsightsState(reference: string, authorityId?: string): InsightsState | null {
  const resolved = resolveApplicationMeta(reference, authorityId);
  if (!resolved) {
    return null;
  }
  const { meta, dir } = resolved;
  const source = sourceSignature(dir, documentList(meta));
  const cached = readInsights(dir);

  // A generation queued or in flight (a "scan more" deep run, or an automatic
  // refresh) must be reported as running even when a fresh cache already exists.
  // Reading the cache first would otherwise report `ready` and stop the UI
  // polling while the scan continues in the background. The existing complete
  // result (or the partial snapshot streamed so far) is returned alongside the
  // live counters, so the UI streams images in and shows real progress.
  const active = insightsQueue.getActive(reference);
  if (active) {
    const snapshot = insightsQueue.getSnapshot(reference);
    const insights = cached ?? snapshot;
    const progress = active.progress ?? snapshot?.progress;
    return { status: 'running', ...(insights ? { insights } : {}), ...(progress ? { progress } : {}) };
  }

  if (cached && isCurrent(cached, source)) {
    return { status: 'ready', insights: cached };
  }

  const failure = insightsQueue.getFailure(reference);
  if (failure) {
    return { status: 'error', error: failure };
  }

  if (cached) {
    // Preserve the depth of the cached result on an automatic refresh.
    startInsights(reference, authorityId, { force: false, deep: cached.depth === 'deep' });
    return { status: 'running', insights: cached };
  }
  return { status: 'none' };
}
