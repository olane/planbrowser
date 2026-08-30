<template>
  <div class="space-y-8">
    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold">Download Queue</h2>
        <button v-if="queueItems.length > 0" @click="clearCompletedQueue" class="text-sm text-gray-500 hover:text-gray-700">Clear completed</button>
      </div>
      
      <div v-if="queueItems.length === 0" class="text-gray-500">
        No active or pending downloads.
      </div>

      <div v-else class="space-y-3">
        <div v-for="item in queueItems" :key="item.id" class="bg-white p-3 rounded shadow-sm border border-gray-200 flex justify-between items-center">
          <div>
            <router-link v-if="item.status === 'completed'" :to="`/app/${encodeURIComponent(item.reference)}`" class="font-medium text-blue-600 hover:underline">{{ item.reference }}</router-link>
            <div v-else class="font-medium">{{ item.reference }}</div>
            <div class="text-xs text-gray-500">
              <span v-if="authorityName(item.authorityId)">{{ authorityName(item.authorityId) }} • </span>
              Enqueued: {{ timeAgo(item.enqueuedAt) }}
              <span v-if="item.completedAt"> • Finished: {{ timeAgo(item.completedAt) }}</span>
            </div>
          </div>
          <div class="flex flex-col items-end">
            <span v-if="item.status === 'pending'" class="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">Pending</span>
            <span v-else-if="item.status === 'in_progress'" class="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">Downloading...</span>
            <span v-else-if="item.status === 'completed'" class="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">Completed</span>
            <span v-else-if="item.status === 'failed'" class="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/10">Failed</span>
            <div v-if="item.error" class="text-xs text-red-600 mt-1 max-w-xs truncate" :title="item.error">{{ item.error }}</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { QueueItem } from '../../../src/types.js'
import { authorityName } from '../../../src/authorities.js'
import { ref, onMounted, onUnmounted } from 'vue'
import { timeAgo } from '../utils'
import * as api from '../api'

const queueItems = ref<QueueItem[]>([])
let pollInterval: any = null


const fetchQueue = async () => {
  try {
    queueItems.value = await api.fetchQueue()
  } catch (e) {
    console.error('Failed to fetch queue', e)
  }
}

const clearCompletedQueue = async () => {
  try {
    await api.clearQueue()
    await fetchQueue()
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  document.title = 'PlanBrowser | Queue'
  fetchQueue()
  pollInterval = setInterval(fetchQueue, 2000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})
</script>
