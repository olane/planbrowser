import { describe, expect, it } from 'vitest';
import { InsightsQueue } from './queue.js';
import type { ApplicationInsights, InsightsProgress } from '../types.js';

const progress = (processed: number, total: number): InsightsProgress => ({
  phase: 'scanning',
  documentsAnalysed: processed,
  documentsProcessed: processed,
  documentsTotal: total,
  pagesRendered: processed
});

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for the queue');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('InsightsQueue', () => {
  it('enqueues a new item as pending with a quick scan', () => {
    const queue = new InsightsQueue({ autoStart: false });
    const item = queue.enqueue('24/0001/FUL', 'cambridge');
    expect(item.status).toBe('pending');
    expect(item.depth).toBe('quick');
    expect(queue.getQueue()).toHaveLength(1);
  });

  it('deduplicates by reference and upgrades a pending scan to deep', () => {
    const queue = new InsightsQueue({ autoStart: false });
    const first = queue.enqueue('24/0001/FUL', 'cambridge');
    const second = queue.enqueue('24/0001/FUL', 'fenland', { deep: true });
    expect(second.id).toBe(first.id);
    expect(second.depth).toBe('deep');
    expect(queue.getQueue()).toHaveLength(1);
  });

  it('runs one scan at a time', async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const queue = new InsightsQueue({
      generate: async (reference, _authority, options) => {
        active++;
        maxActive = Math.max(maxActive, active);
        order.push(reference);
        options?.onProgress?.(progress(0, 1));
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return null;
      }
    });

    queue.enqueue('24/0001/FUL');
    queue.enqueue('24/0002/FUL');
    await waitFor(() => queue.getQueue().every((item) => item.status === 'completed'));

    expect(order).toEqual(['24/0001/FUL', '24/0002/FUL']);
    expect(maxActive).toBe(1);
  });

  it('records failures, exposes them, and retries', async () => {
    let fail = true;
    const queue = new InsightsQueue({
      generate: async () => {
        if (fail) throw new Error('boom');
        return null;
      }
    });

    const item = queue.enqueue('24/0001/FUL');
    await waitFor(() => item.status === 'failed');
    expect(item.error).toBe('boom');
    expect(queue.getFailure('24/0001/FUL')).toBe('boom');

    fail = false;
    queue.retry(item.id);
    await waitFor(() => item.status === 'completed');
    expect(item.error).toBeUndefined();
    expect(queue.getFailure('24/0001/FUL')).toBeUndefined();
  });

  it('cancels a running scan cooperatively', async () => {
    const queue = new InsightsQueue({
      generate: (_reference, _authority, options) =>
        new Promise<ApplicationInsights | null>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const error = new Error('cancelled');
            error.name = 'AbortError';
            reject(error);
          });
        })
    });

    const item = queue.enqueue('24/0001/FUL');
    await waitFor(() => item.status === 'in_progress');
    queue.cancel(item.id);
    await waitFor(() => item.status === 'cancelled');
    expect(item.cancelledAt).toBeDefined();
    expect(queue.getActive('24/0001/FUL')).toBeUndefined();
  });

  it('orders in-progress first, then pending, then finished by enqueue time', () => {
    const queue = new InsightsQueue({ autoStart: false });
    const first = queue.enqueue('24/0001/FUL');
    const second = queue.enqueue('24/0002/FUL');
    const third = queue.enqueue('24/0003/FUL');
    const fourth = queue.enqueue('24/0004/FUL');

    first.enqueuedAt = '2024-01-01T00:00:01.000Z';
    second.enqueuedAt = '2024-01-01T00:00:02.000Z';
    third.enqueuedAt = '2024-01-01T00:00:03.000Z';
    fourth.enqueuedAt = '2024-01-01T00:00:04.000Z';

    second.status = 'in_progress';
    third.status = 'completed';
    fourth.status = 'failed';

    expect(queue.getQueue().map((item) => item.reference)).toEqual([
      '24/0002/FUL',
      '24/0001/FUL',
      '24/0003/FUL',
      '24/0004/FUL'
    ]);
  });

  it('re-queues cancelled items without duplicating them', () => {
    const queue = new InsightsQueue({ autoStart: false });
    const item = queue.enqueue('24/0001/FUL');
    queue.cancel(item.id);

    const requeued = queue.requeue(item.id);
    expect(requeued?.status).toBe('pending');
    expect(requeued?.cancelledAt).toBeUndefined();

    const again = queue.enqueue('24/0001/FUL');
    expect(again.id).toBe(item.id);
    expect(queue.getQueue()).toHaveLength(1);
  });

  it('clearFinished drops finished items but keeps the failure for retry', async () => {
    const queue = new InsightsQueue({
      generate: async () => {
        throw new Error('boom');
      }
    });
    const item = queue.enqueue('24/0001/FUL');
    await waitFor(() => item.status === 'failed');

    queue.clearFinished();
    expect(queue.getQueue()).toHaveLength(0);
    expect(queue.getFailure('24/0001/FUL')).toBe('boom');
  });
});
