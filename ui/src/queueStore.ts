import { ref, computed } from 'vue'
import type { QueueItem, InsightsQueueItem } from '../../src/types.js'
import * as api from './api'

export const queueItems = ref<QueueItem[]>([])
export const insightsQueueItems = ref<InsightsQueueItem[]>([])

export const activeDownloadCount = computed(() =>
  queueItems.value.filter((q) => q.status === 'pending' || q.status === 'in_progress').length
)

export const activeInsightsCount = computed(() =>
  insightsQueueItems.value.filter((q) => q.status === 'pending' || q.status === 'in_progress').length
)

// The total shown on the Queue nav item; the queues themselves are independent.
export const activeQueueCount = computed(() => activeDownloadCount.value + activeInsightsCount.value)

export async function refreshQueue() {
  try {
    queueItems.value = await api.fetchQueue()
  } catch (e) {
    console.error('Failed to fetch download queue', e)
  }
  try {
    insightsQueueItems.value = await api.fetchInsightsQueue()
  } catch (e) {
    console.error('Failed to fetch insights queue', e)
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
