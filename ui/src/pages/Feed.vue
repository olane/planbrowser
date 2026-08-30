<template>
  <div class="space-y-8">
    <section>
      <h2 class="text-xl font-semibold mb-4">Activity Feed</h2>
      <div v-if="loading" class="text-gray-500">Loading...</div>
      <div v-else-if="events.length === 0" class="text-gray-500">No activity yet. Changes to synced applications will appear here.</div>
      <div v-else class="space-y-3">
        <div v-for="event in events" :key="event.id" class="bg-white p-4 rounded shadow-sm border border-gray-200">
          <div class="flex justify-between items-start gap-4">
            <div>
              <div class="flex items-center gap-2">
                <router-link :to="`/app/${encodeURIComponent(event.reference)}`" class="font-medium text-blue-600 hover:underline">{{ event.reference }}</router-link>
                <span v-if="authorityName(event.authorityId) && event.authorityId !== DEFAULT_AUTHORITY_ID" class="text-xs text-gray-400">{{ authorityName(event.authorityId) }}</span>
                <span class="text-xs text-gray-500">{{ timeAgo(event.happenedAt) }}</span>
              </div>
              <p class="text-sm text-gray-700 mt-1">{{ event.message }}</p>
            </div>
          </div>
          <ul v-if="event.changes.length > 0" class="mt-3 space-y-1 text-sm">
            <li v-for="(change, idx) in event.changes" :key="idx" class="text-gray-600">
              <span class="font-medium text-gray-800">{{ change.field }}:</span>
              <template v-if="change.before && change.after">
                <span class="line-through text-gray-400">{{ change.before }}</span>
                <span class="text-gray-400"> &rarr; </span>
                <span>{{ change.after }}</span>
              </template>
              <span v-else>{{ change.after || change.before }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { ActivityEvent } from '../../../src/types.js'
import { DEFAULT_AUTHORITY_ID, authorityName } from '../../../src/authorities.js'
import { timeAgo } from '../utils'
import * as api from '../api'

const events = ref<ActivityEvent[]>([])
const loading = ref(true)

const fetchFeed = async () => {
  try {
    events.value = await api.fetchFeed()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  document.title = 'PlanBrowser | Feed'
  fetchFeed()
})
</script>
