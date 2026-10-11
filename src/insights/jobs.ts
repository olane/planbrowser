import type { ApplicationInsights, InsightsProgress } from '../types.js';
import { resolveApplicationMeta } from '../storage.js';
import { readInsights } from './cache.js';
import { documentList, generateInsights, isCurrent, sourceSignature, type GenerateOptions } from './generate.js';

export type InsightsStatus = 'none' | 'running' | 'ready' | 'error';

export interface InsightsState {
  status: InsightsStatus;
  insights?: ApplicationInsights;
  // Live counters for an in-flight run, so the UI can show real progress.
  progress?: InsightsProgress;
  error?: string;
}

// An in-flight generation, its latest counters and its partial result.
interface Running {
  progress?: InsightsProgress;
  // The most recent partial result, held in memory only. The on-disk cache
  // always holds the last *complete* result, so a scan in progress never
  // corrupts it, and a refresh can keep the previous result on screen (below)
  // while a fresh generation streams its images in.
  snapshot?: ApplicationInsights;
}

// Generation is CPU-heavy, so the API starts it in the background and the UI
// polls. Track in-flight work and the last failure per application. The key is
// the reference alone (not the authority), so an application cannot be
// generated twice in parallel via two different authority spellings.
const inFlight = new Map<string, Running>();
const lastError = new Map<string, string>();

export function startInsights(reference: string, authorityId?: string, opts: GenerateOptions = {}): void {
  if (inFlight.has(reference)) return;
  lastError.delete(reference);
  const running: Running = {};
  inFlight.set(reference, running);
  generateInsights(reference, authorityId, {
    ...opts,
    onProgress: (progress) => {
      running.progress = progress;
    },
    // Stream partial results as they are found; the GET below hands them to the
    // UI while the run continues. They are marked `complete: false` so they are
    // never mistaken for a finished result.
    onSnapshot: (insights) => {
      running.snapshot = insights;
    }
  })
    .catch((err: unknown) => {
      lastError.set(reference, err instanceof Error ? err.message : String(err));
    })
    .finally(() => inFlight.delete(reference));
}

// Current state for the API: returns a ready result only when the cache is
// fresh. A stale cache (documents changed on sync, or a strategy bump) is
// refreshed in the background so the viewer reflects the sync without the user
// having to regenerate manually. A missing cache is left for the user to start.
export function getInsightsState(reference: string, authorityId?: string): InsightsState | null {
  const resolved = resolveApplicationMeta(reference, authorityId);
  if (!resolved) return null;
  const { meta, dir } = resolved;
  const source = sourceSignature(dir, documentList(meta));
  const cached = readInsights(dir);

  // A generation in flight (a "scan more" deep run, or an automatic refresh)
  // must be reported as running even when a fresh cache already exists. Reading
  // the cache first would otherwise report `ready` and stop the UI polling while
  // the scan continues in the background. The existing complete result (or, for
  // a fresh generation, the partial snapshot streamed so far) is returned
  // alongside the live counters, so the UI streams images in and shows real
  // progress rather than a bare spinner.
  const running = inFlight.get(reference);
  if (running) {
    const insights = cached ?? running.snapshot;
    const progress = running.progress ?? running.snapshot?.progress;
    return { status: 'running', ...(insights ? { insights } : {}), ...(progress ? { progress } : {}) };
  }

  if (cached && isCurrent(cached, source)) return { status: 'ready', insights: cached };

  const previousError = lastError.get(reference);
  if (previousError) return { status: 'error', error: previousError };

  if (cached) {
    // Preserve the depth of the cached result on an automatic refresh.
    startInsights(reference, authorityId, { force: false, deep: cached.depth === 'deep' });
    return { status: 'running', insights: cached };
  }
  return { status: 'none' };
}
