import { downloadApplication } from './scraper.js';
import { DEFAULT_AUTHORITY_ID } from './authorities.js';

import type { QueueItem } from './types.js';


class DownloadQueue {
  private queue: QueueItem[] = [];
  private isProcessing = false;

  enqueue(reference: string, authorityId: string = DEFAULT_AUTHORITY_ID) {
    const existing = this.queue.find(item => item.reference === reference && item.authorityId === authorityId && (item.status === 'pending' || item.status === 'in_progress'));
    if (existing) {
      return existing; // Already in queue
    }

    const item: QueueItem = {
      id: Math.random().toString(36).substring(2, 9),
      reference,
      authorityId,
      status: 'pending',
      enqueuedAt: new Date().toISOString()
    };
    this.queue.push(item);
    
    // Start processing asynchronously
    setImmediate(() => this.process());
    
    return item;
  }

  getQueue() {
    return this.queue;
  }
  
  clearCompleted() {
    this.queue = this.queue.filter(item => item.status !== 'completed' && item.status !== 'failed');
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (true) {
      const item = this.queue.find(q => q.status === 'pending');
      if (!item) break;

      item.status = 'in_progress';
      item.startedAt = new Date().toISOString();

      try {
        await downloadApplication(item.reference, item.authorityId, (message, current, total) => {
          item.progress = {
            message,
            ...(current !== undefined ? { current } : {}),
            ...(total !== undefined ? { total } : {})
          };
        });
        item.status = 'completed';
        delete item.progress;
      } catch (err: any) {
        item.status = 'failed';
        item.error = err.message;
        delete item.progress;
      } finally {
        item.completedAt = new Date().toISOString();
      }

      // Add a 5-second delay between processing items to avoid rate limiting
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 5000);
      await promise;
    }

    this.isProcessing = false;
  }
}

export const downloadQueue = new DownloadQueue();
