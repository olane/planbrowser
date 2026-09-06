import { describe, it, expect } from 'vitest';
import { DownloadQueue } from './queue.js';
import type { QueueItem } from './types.js';

describe('DownloadQueue', () => {
  it('enqueues a new item as pending', () => {
    const queue = new DownloadQueue({ autoStart: false });
    const item = queue.enqueue('24/0001/FUL', 'cambridge');
    expect(item.status).toBe('pending');
    expect(queue.getQueue()).toHaveLength(1);
  });

  it('does not enqueue a duplicate pending item', () => {
    const queue = new DownloadQueue({ autoStart: false });
    const first = queue.enqueue('24/0001/FUL', 'cambridge');
    const second = queue.enqueue('24/0001/FUL', 'cambridge');
    expect(second.id).toBe(first.id);
    expect(queue.getQueue()).toHaveLength(1);
  });

  it('treats the same reference under different authorities as distinct', () => {
    const queue = new DownloadQueue({ autoStart: false });
    queue.enqueue('24/0001/FUL', 'cambridge');
    queue.enqueue('24/0001/FUL', 'fenland');
    expect(queue.getQueue()).toHaveLength(2);
  });

  it('defaults the authority to cambridge', () => {
    const queue = new DownloadQueue({ autoStart: false });
    const item = queue.enqueue('24/0001/FUL');
    expect(item.authorityId).toBe('cambridge');
  });

  it('clearCompleted removes only completed and failed items', () => {
    const queue = new DownloadQueue({ autoStart: false });
    queue.enqueue('24/0001/FUL', 'cambridge');
    queue.enqueue('24/0002/FUL', 'cambridge');
    queue.enqueue('24/0003/FUL', 'cambridge');

    const items = queue.getQueue() as QueueItem[];
    items[0]!.status = 'completed';
    items[1]!.status = 'failed';
    // items[2] stays pending

    queue.clearCompleted();
    expect(queue.getQueue().map((i) => i.reference)).toEqual(['24/0003/FUL']);
  });
});
