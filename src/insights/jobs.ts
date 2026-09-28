import type { ApplicationInsights } from '../types.js';
import { resolveApplicationMeta } from '../storage.js';
import { readInsights } from './cache.js';
import { documentList, generateInsights, isCurrent, sourceSignature, type GenerateOptions } from './generate.js';

export type InsightsStatus = 'none' | 'running' | 'ready' | 'error';

export interface InsightsState {
  status: InsightsStatus;
  insights?: ApplicationInsights;
  error?: string;
}

// Generation is CPU-heavy, so the API starts it in the background and the UI
// polls. Track in-flight work and the last failure per application. The key is
// the reference alone (not the authority), so an application cannot be
// generated twice in parallel via two different authority spellings.
const inFlight = new Map<string, Promise<ApplicationInsights | null>>();
const lastError = new Map<string, string>();

export function startInsights(reference: string, authorityId?: string, opts: GenerateOptions = {}): void {
  if (inFlight.has(reference)) return;
  lastError.delete(reference);
  const promise = generateInsights(reference, authorityId, opts)
    .catch((err: unknown) => {
      lastError.set(reference, err instanceof Error ? err.message : String(err));
      return null;
    })
    .finally(() => inFlight.delete(reference));
  inFlight.set(reference, promise);
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
  // the scan continues in the background. The existing result is returned
  // alongside so it can stay on screen instead of being replaced by a spinner.
  if (inFlight.has(reference)) {
    return { status: 'running', ...(cached ? { insights: cached } : {}) };
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
