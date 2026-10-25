import type { ApplicationInsights, InsightsQueueItem } from '../types.js';
import { generateInsights, type GenerateOptions } from './generate.js';

type GenerateFn = (
  reference: string,
  authorityId?: string,
  opts?: GenerateOptions,
) => Promise<ApplicationInsights | null>;

interface InsightsQueueOptions {
  // Start processing as soon as an item is enqueued. Tests that only exercise
  // the bookkeeping (or that drive the runner themselves) disable this.
  autoStart?: boolean;
  // Overridable for tests; the real queue always runs the pipeline.
  generate?: GenerateFn;
}

interface EnqueueOptions {
  deep?: boolean;
  // Regenerate even when the cache is current (a manual "Regenerate").
  force?: boolean;
}

// A serial queue for insights generation. Generation is CPU-heavy, so runs are
// never overlapped; the queue also owns the live progress and partial snapshots
// for each reference. It is deliberately separate from the download queue: a
// future "scan everything downloaded" feature can call `enqueue` from the
// download completion path without coupling the two.
export class InsightsQueue {
  private items: InsightsQueueItem[] = [];
  // Partial results streamed while a run is in flight, kept out of the queue
  // items so they never leak into API responses.
  private snapshots = new Map<string, ApplicationInsights>();
  private failures = new Map<string, string>();
  // References whose next run must bypass the current cache.
  private forced = new Set<string>();
  // Requests made while a scan was already running, applied once it settles.
  private followUps = new Map<string, { deep: boolean; force: boolean }>();
  // References the user cancelled, which suppresses automatic stale-cache
  // refreshes until they explicitly start a scan again.
  private suppressed = new Set<string>();
  private isProcessing = false;
  private currentRunId = 0;
  private currentAbort: AbortController | undefined;
  private readonly autoStart: boolean;
  private readonly generate: GenerateFn;

  constructor(options: InsightsQueueOptions = {}) {
    this.autoStart = options.autoStart ?? true;
    this.generate = options.generate ?? generateInsights;
  }

  enqueue(reference: string, authorityId?: string, options: EnqueueOptions = {}): InsightsQueueItem {
    let item = this.items.find((entry) => entry.reference === reference);
    if (options.force) {
      this.suppressed.delete(reference);
    }

    if (item && item.status === 'in_progress') {
      // A run is already underway. A manual request joins it, and any upgrade
      // (more depth or a forced regenerate) runs as a follow-up afterwards.
      const upgrade = (options.deep === true && item.depth !== 'deep') || options.force === true;
      if (upgrade) {
        const followUp = this.followUps.get(reference);
        this.followUps.set(reference, {
          deep: item.depth === 'deep' || Boolean(options.deep) || Boolean(followUp?.deep),
          force: Boolean(options.force) || Boolean(followUp?.force),
        });
      }
      this.failures.delete(reference);
      return item;
    }

    if (item && item.status === 'pending') {
      if (options.deep) {
        item.depth = 'deep';
      }
    } else if (item) {
      this.resetToPending(item);
      if (options.deep !== undefined) {
        item.depth = options.deep ? 'deep' : 'quick';
      }
    } else {
      item = {
        id: Math.random().toString(36).substring(2, 9),
        reference,
        ...(authorityId ? { authorityId } : {}),
        depth: options.deep ? 'deep' : 'quick',
        status: 'pending',
        enqueuedAt: new Date().toISOString(),
      };
      this.items.push(item);
    }

    if (authorityId) {
      item.authorityId = authorityId;
    }
    if (options.force) {
      this.forced.add(reference);
    }
    this.failures.delete(reference);
    this.snapshots.delete(reference);
    this.kick();
    return item;
  }

  getQueue(): InsightsQueueItem[] {
    const statusOrder: Record<InsightsQueueItem['status'], number> = {
      in_progress: 0,
      pending: 1,
      completed: 2,
      failed: 2,
      cancelled: 2,
    };
    return [...this.items].sort((a, b) => {
      const byStatus = statusOrder[a.status] - statusOrder[b.status];
      if (byStatus !== 0) {
        return byStatus;
      }
      return a.enqueuedAt.localeCompare(b.enqueuedAt);
    });
  }

  // The item currently queued or running for a reference, if any.
  getActive(reference: string): InsightsQueueItem | undefined {
    return this.items.find(
      (item) => item.reference === reference && (item.status === 'pending' || item.status === 'in_progress'),
    );
  }

  getSnapshot(reference: string): ApplicationInsights | undefined {
    return this.snapshots.get(reference);
  }

  getFailure(reference: string): string | undefined {
    return this.failures.get(reference);
  }

  // True after the user cancelled a scan, until they start one explicitly.
  // Automatic stale-cache refreshes must leave the stale cache alone meanwhile.
  isSuppressed(reference: string): boolean {
    return this.suppressed.has(reference);
  }

  retry(id: string): InsightsQueueItem | undefined {
    const item = this.items.find((entry) => entry.id === id);
    if (!item || item.status !== 'failed') {
      return undefined;
    }
    this.resetToPending(item);
    this.forced.add(item.reference);
    this.suppressed.delete(item.reference);
    this.failures.delete(item.reference);
    this.snapshots.delete(item.reference);
    this.kick();
    return item;
  }

  // Cancel a pending or in-progress scan. In-flight work is aborted
  // cooperatively (the pipeline checks the signal between documents/pages); its
  // partial result is discarded and the previous complete cache is untouched.
  cancel(id: string): InsightsQueueItem | undefined {
    const item = this.items.find((entry) => entry.id === id);
    if (!item || (item.status !== 'pending' && item.status !== 'in_progress')) {
      return undefined;
    }

    const wasInProgress = item.status === 'in_progress';
    item.status = 'cancelled';
    item.cancelledAt = new Date().toISOString();
    delete item.error;
    delete item.progress;
    this.forced.delete(item.reference);
    this.failures.delete(item.reference);
    this.snapshots.delete(item.reference);
    this.followUps.delete(item.reference);
    this.suppressed.add(item.reference);

    if (wasInProgress) {
      this.currentRunId++;
      this.currentAbort?.abort();
      this.currentAbort = undefined;
    }
    return item;
  }

  requeue(id: string): InsightsQueueItem | undefined {
    const item = this.items.find((entry) => entry.id === id);
    if (!item || item.status !== 'cancelled') {
      return undefined;
    }
    this.resetToPending(item);
    this.forced.add(item.reference);
    this.suppressed.delete(item.reference);
    this.failures.delete(item.reference);
    this.snapshots.delete(item.reference);
    this.kick();
    return item;
  }

  clearFinished(): void {
    this.items = this.items.filter(
      (item) => item.status !== 'completed' && item.status !== 'failed' && item.status !== 'cancelled',
    );
  }

  private resetToPending(item: InsightsQueueItem): void {
    item.status = 'pending';
    delete item.error;
    delete item.progress;
    delete item.startedAt;
    delete item.completedAt;
    delete item.cancelledAt;
    item.enqueuedAt = new Date().toISOString();
  }

  private kick(): void {
    if (this.autoStart) {
      setImmediate(() => this.process());
    }
  }

  private async process(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    try {
      while (true) {
        // Match the order the UI shows: earliest enqueued pending item first.
        const item = this.getQueue().find((entry) => entry.status === 'pending');
        if (!item) {
          break;
        }

        const runId = ++this.currentRunId;
        const abort = new AbortController();
        this.currentAbort = abort;
        const ref = item.reference;

        item.status = 'in_progress';
        item.startedAt = new Date().toISOString();
        delete item.error;

        try {
          await this.generate(ref, item.authorityId, {
            force: this.forced.has(ref),
            deep: item.depth === 'deep',
            signal: abort.signal,
            onProgress: (progress) => {
              if (this.currentRunId === runId && item.status === 'in_progress') {
                item.progress = progress;
              }
            },
            onSnapshot: (snapshot) => {
              if (this.currentRunId !== runId) {
                return;
              }
              this.snapshots.set(ref, snapshot);
              if (snapshot.progress) {
                item.progress = snapshot.progress;
              }
            },
          });
          if (this.currentRunId === runId && item.status === 'in_progress') {
            item.status = 'completed';
            delete item.progress;
          }
        } catch (err: unknown) {
          if (this.currentRunId === runId && item.status === 'in_progress') {
            if (abort.signal.aborted) {
              item.status = 'cancelled';
              item.cancelledAt = new Date().toISOString();
              delete item.progress;
            } else {
              const message = err instanceof Error ? err.message : String(err);
              item.status = 'failed';
              item.error = message;
              this.failures.set(ref, message);
              delete item.progress;
            }
          }
        } finally {
          if (this.currentRunId === runId) {
            item.completedAt = new Date().toISOString();
            this.currentAbort = undefined;
            this.forced.delete(ref);
            this.snapshots.delete(ref);

            // A request made while this run was in flight (Scan more or
            // Regenerate) is honoured now, in the queue's normal order.
            const followUp = this.followUps.get(ref);
            if (followUp) {
              this.followUps.delete(ref);
              this.resetToPending(item);
              item.depth = followUp.deep ? 'deep' : 'quick';
              if (followUp.force) {
                this.forced.add(ref);
              }
              this.failures.delete(ref);
            }
          }
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export const insightsQueue = new InsightsQueue();
