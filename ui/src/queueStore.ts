import { ref, computed } from 'vue';
import type { QueueItem } from '../../src/types.js';
import * as api from './api';

export const queueItems = ref<QueueItem[]>([]);

export const activeQueueCount = computed(
  () => queueItems.value.filter((q) => q.status === 'pending' || q.status === 'in_progress').length,
);

export async function refreshQueue() {
  try {
    queueItems.value = await api.fetchQueue();
  } catch (e) {
    console.error('Failed to fetch queue', e);
  }
}

// The live queue status for one application, or 'none' when it is not queued.
// Failed items are surfaced so a card can offer a retry.
export function getQueueStatus(reference: string): QueueItem['status'] | 'none' {
  const item = queueItems.value.find(
    (q) => q.reference === reference && (q.status === 'pending' || q.status === 'in_progress' || q.status === 'failed'),
  );
  return item ? item.status : 'none';
}
