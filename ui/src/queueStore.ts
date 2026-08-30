import { ref, computed } from 'vue'
import type { QueueItem } from '../../src/types.js'
import * as api from './api'

export const queueItems = ref<QueueItem[]>([])

export const activeQueueCount = computed(() =>
  queueItems.value.filter((q) => q.status === 'pending' || q.status === 'in_progress').length
)

export async function refreshQueue() {
  try {
    queueItems.value = await api.fetchQueue()
  } catch (e) {
    console.error('Failed to fetch queue', e)
  }
}
