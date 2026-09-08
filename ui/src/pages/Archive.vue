<template>
  <div class="space-y-8">
    <section>
      <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 class="text-xl font-semibold">Archived Applications</h2>
        <button v-if="mappedCount > 0" @click="showAppsMap = !showAppsMap" :title="showAppsMap ? 'Hide the map' : 'Show archived applications on a map'" class="cursor-pointer text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md shadow-sm flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
          <span>{{ showAppsMap ? 'Hide map' : `View map (${mappedCount})` }}</span>
        </button>
      </div>
      <div v-if="showAppsMap && mappedApps.length > 0" class="mb-6">
        <ApplicationsMap :apps="mappedApps" @select="openAppFromMap" />
      </div>
      <div v-if="loading" class="text-gray-500">Loading...</div>
      <div v-else-if="archivedApps.length === 0" class="text-gray-500">No archived applications.</div>
      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ApplicationCard v-for="app in archivedApps" :key="app.reference" :app="app" :queue-status="getQueueStatus(app.reference)" @changed="fetchApps" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { ApplicationMeta } from '../../../src/types.js'
import * as api from '../api'
import ApplicationCard from '../components/ApplicationCard.vue'
import ApplicationsMap from '../components/ApplicationsMap.vue'
import { queueItems } from '../queueStore'
import { useRouter } from 'vue-router'

const router = useRouter()
const apps = ref<ApplicationMeta[]>([])
const loading = ref(true)

const archivedApps = computed(() => apps.value.filter((a) => a.archived))

const showAppsMap = ref(false)
const mappedApps = computed(() => archivedApps.value.filter((a) => a.location))
const mappedCount = computed(() => mappedApps.value.length)
const openAppFromMap = (reference: string) => router.push(`/app/${encodeURIComponent(reference)}`)

// If the last mapped application disappears while the map is open, collapse the
// map rather than leaving it showing stale content.
watch(mappedCount, (count) => {
  if (count === 0) showAppsMap.value = false
})

const getQueueStatus = (reference: string) => {
  const item = queueItems.value.find(q => q.reference === reference && (q.status === 'pending' || q.status === 'in_progress' || q.status === 'failed'))
  if (item) return item.status
  return 'none'
}

watch(queueItems, (items, oldItems) => {
  const previousCompleted = new Set((oldItems ?? []).filter(q => q.status === 'completed').map(q => q.id))
  const currentCompleted = items.filter(q => q.status === 'completed').map(q => q.id)
  if (currentCompleted.some(id => !previousCompleted.has(id))) {
    fetchApps()
  }
})

const fetchApps = async () => {
  try {
    apps.value = await api.fetchApplications()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  document.title = 'PlanBrowser | Archived'
  fetchApps()
})
</script>
