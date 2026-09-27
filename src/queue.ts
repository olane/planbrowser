import { downloadApplication } from './scraper.js';
import { DEFAULT_AUTHORITY_ID } from './authorities.js';

import type { QueueItem } from './types.js';

export interface DownloadQueueOptions {
  // Delay between finishing one application and starting the next, to avoid
  // rate limiting the target portal.
  delayMs?: number;
  // Start processing immediately when an item is enqueued. Disable in tests
  // that only exercise the queue's bookkeeping.
  autoStart?: boolean;
}

export class DownloadQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private delayMs: number;
  private autoStart: boolean;
  // Processing is serial, so there is at most one in-flight run. A unique id
  // per run lets a run that was cancelled (or superseded by a re-queue) detect
  // that it is stale and stop mutating its item once its download settles. The
  // controller aborts the in-flight browser work on cancel.
  private currentRunId = 0;
  private currentAbort: AbortController | undefined;

  constructor(options: DownloadQueueOptions = {}) {
    this.delayMs = options.delayMs ?? 5000;
    this.autoStart = options.autoStart ?? true;
  }

  enqueue(reference: string, authorityId: string = DEFAULT_AUTHORITY_ID) {
    const existing = this.queue.find(item => item.reference === reference && item.authorityId === authorityId && (item.status === 'pending' || item.status === 'in_progress' || item.status === 'cancelled'));
    if (existing) {
      if (existing.status === 'cancelled') {
        this.resetToPending(existing);
        this.kick();
      }
      return existing;
    }

    const item: QueueItem = {
      id: Math.random().toString(36).substring(2, 9),
      reference,
      authorityId,
      status: 'pending',
      enqueuedAt: new Date().toISOString()
    };
    this.queue.push(item);

    // Defer to a later tick so the new item is returned before processing starts.
    this.kick();

    return item;
  }

  getQueue() {
    const statusOrder: Record<QueueItem['status'], number> = {
      in_progress: 0,
      pending: 1,
      completed: 2,
      failed: 2,
      cancelled: 2
    };
    return [...this.queue].sort((a, b) => {
      const byStatus = statusOrder[a.status] - statusOrder[b.status];
      if (byStatus !== 0) return byStatus;
      return a.enqueuedAt.localeCompare(b.enqueuedAt);
    });
  }

  retry(id: string) {
    const item = this.queue.find(q => q.id === id);
    if (!item || item.status !== 'failed') {
      return undefined;
    }

    this.resetToPending(item);
    this.kick();
    return item;
  }

  // Cancel a pending or in-progress item. The item is kept (rather than removed)
  // so it can be re-queued if the cancellation was a mistake. In-flight work is
  // aborted; its eventual result is discarded via the run-id guard.
  cancel(id: string) {
    const item = this.queue.find(q => q.id === id);
    if (!item || (item.status !== 'pending' && item.status !== 'in_progress')) {
      return undefined;
    }

    const wasInProgress = item.status === 'in_progress';
    item.status = 'cancelled';
    item.cancelledAt = new Date().toISOString();
    delete item.error;
    delete item.progress;

    // Only the one in-flight run needs aborting; bump the run id so its eventual
    // result is ignored even if it does not reject.
    if (wasInProgress) {
      this.currentRunId++;
      this.currentAbort?.abort();
      this.currentAbort = undefined;
    }

    return item;
  }

  requeue(id: string) {
    const item = this.queue.find(q => q.id === id);
    if (!item || item.status !== 'cancelled') {
      return undefined;
    }

    this.resetToPending(item);
    this.kick();
    return item;
  }

  clearCompleted() {
    this.queue = this.queue.filter(item => item.status !== 'completed' && item.status !== 'failed' && item.status !== 'cancelled');
  }

  private resetToPending(item: QueueItem) {
    item.status = 'pending';
    delete item.error;
    delete item.progress;
    delete item.startedAt;
    delete item.completedAt;
    delete item.cancelledAt;
    item.enqueuedAt = new Date().toISOString();
  }

  private kick() {
    if (this.autoStart) {
      setImmediate(() => this.process());
    }
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (true) {
        const item = this.queue.find(q => q.status === 'pending');
        if (!item) break;

        const runId = ++this.currentRunId;
        const abort = new AbortController();
        this.currentAbort = abort;

        item.status = 'in_progress';
        item.startedAt = new Date().toISOString();
        delete item.error;

        try {
          await downloadApplication(item.reference, item.authorityId, (message, current, total) => {
            if (this.currentRunId !== runId) return;
            item.progress = {
              message,
              ...(current !== undefined ? { current } : {}),
              ...(total !== undefined ? { total } : {})
            };
          }, abort.signal);
          if (this.currentRunId === runId) {
            item.status = 'completed';
            delete item.progress;
          }
        } catch (err: any) {
          if (this.currentRunId === runId) {
            item.status = 'failed';
            item.error = err.message;
            delete item.progress;
          }
        } finally {
          if (this.currentRunId === runId) {
            item.completedAt = new Date().toISOString();
            this.currentAbort = undefined;
          }
        }

        // Always wait between items — including after a cancelled run — so the
        // portal is not hit back-to-back.
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, this.delayMs);
        await promise;
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export const downloadQueue = new DownloadQueue();
