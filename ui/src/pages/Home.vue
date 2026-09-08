<template>
  <div class="space-y-8">
    <!-- Downloaded Applications -->
    <section>
      <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div class="flex items-center gap-3 flex-wrap">
          <h2 class="text-xl font-semibold">Downloaded Applications</h2>
          <button v-if="mappedCount > 0" @click="showAppsMap = !showAppsMap" :title="showAppsMap ? 'Hide the map' : 'Show downloaded applications on a map'" class="cursor-pointer text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md shadow-sm flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"/></svg>
            <span>{{ showAppsMap ? 'Hide map' : 'View map' }}</span>
          </button>
        </div>
        <div class="flex items-center gap-2 flex-wrap justify-end">
          <div v-if="hasSyncCandidates || activeQueueCount > 0" class="flex items-center gap-2 flex-wrap justify-end">
            <template v-if="!queueBusy">
              <button v-if="everythingCount > 0" @click="runScopeSync({ all: true })" :disabled="queueing" title="Re-scrape every downloaded application" class="cursor-pointer text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md shadow-sm disabled:opacity-50 disabled:cursor-default">
                Sync everything ({{ everythingCount }})
              </button>
              <button v-if="starredCount > 0" @click="runScopeSync({ starred: true })" :disabled="queueing" title="Re-scrape your starred applications" class="cursor-pointer text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md shadow-sm disabled:opacity-50 disabled:cursor-default">
                Sync starred ({{ starredCount }})
              </button>
              <button v-if="awaitingDecisionCount > 0" @click="runScopeSync({ awaitingDecision: true })" :disabled="queueing" title="Re-scrape applications that have no decision recorded yet" class="cursor-pointer text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md shadow-sm disabled:opacity-50 disabled:cursor-default">
                Sync awaiting decision ({{ awaitingDecisionCount }})
              </button>
            </template>
            <button v-else @click="router.push('/queue')" title="View the queue" class="flex items-center gap-2 text-sm bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-md shadow-sm cursor-pointer">
              <svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              <span>Syncing {{ activeQueueCount }} left — view queue</span>
            </button>
          </div>
        </div>
      </div>
      <div v-if="syncError" class="mb-2 text-sm text-red-700">{{ syncError }}</div>
      <div v-if="showAppsMap && mappedApps.length > 0" class="mb-6">
        <ApplicationsMap :apps="mappedApps" @select="openAppFromMap" />
        <p v-if="unmappedCount > 0" class="mt-2 text-xs text-gray-500">
          {{ unmappedCount }} {{ unmappedCount === 1 ? 'application has' : 'applications have' }} no location {{ unmappedCount === 1 ? 'and isn\u2019t' : "and aren\u2019t" }} shown on the map.
        </p>
      </div>
      <div v-if="loadingApps" class="text-gray-500">Loading...</div>
      <div v-else-if="activeApps.length === 0" class="text-gray-500">No active applications. Archived applications are on the Archived page.</div>
      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ApplicationCard v-for="app in activeApps" :key="app.reference" :app="app" :queue-status="getQueueStatus(app.reference)" @changed="fetchApps" />
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import type { ApplicationMeta } from '../../../src/types.js'
import { isAwaitingDecision } from '../../../src/decision.js'
import type { SyncScope } from '../../../src/decision.js'
import { queueItems, refreshQueue, activeQueueCount } from '../queueStore'
import * as api from '../api'
import { useRouter } from 'vue-router'
import ApplicationsMap from '../components/ApplicationsMap.vue'
import ApplicationCard from '../components/ApplicationCard.vue'

const router = useRouter()

const downloadedApps = ref<ApplicationMeta[]>([])
const loadingApps = ref(true)

const activeApps = computed(() =>
  downloadedApps.value
    .filter((a) => !a.archived)
    .sort((a, b) => Number(!!b.starred) - Number(!!a.starred))
)

const showAppsMap = ref(false)
const mappedApps = computed(() => activeApps.value.filter((a) => a.location))
const mappedCount = computed(() => mappedApps.value.length)
const unmappedCount = computed(() => activeApps.value.length - mappedApps.value.length)
const openAppFromMap = (reference: string) => router.push(`/app/${encodeURIComponent(reference)}`)

// If the last mapped application disappears while the map is open (e.g. it was
// archived), collapse the map rather than leaving it showing stale content.
watch(mappedCount, (count) => {
  if (count === 0) showAppsMap.value = false
})

const queueing = ref(false)
const syncError = ref('')

const awaitingDecisionCount = computed(() => downloadedApps.value.filter((a) => !a.archived && isAwaitingDecision(a)).length)
const starredCount = computed(() => downloadedApps.value.filter((a) => !a.archived && a.starred).length)
const everythingCount = computed(() => downloadedApps.value.filter((a) => !a.archived).length)
const hasSyncCandidates = computed(() => everythingCount.value > 0 || activeQueueCount.value > 0)
const queueBusy = computed(() => activeQueueCount.value > 0 && !queueing.value)

const runScopeSync = async (scope: SyncScope) => {
  if (queueing.value) return
  queueing.value = true
  syncError.value = ''
  try {
    await api.syncApplications(scope)
    await fetchQueue()
  } catch (e: any) {
    console.error(e)
    syncError.value = e.message || 'Failed to sync applications'
  } finally {
    queueing.value = false
  }
}

const fetchQueue = async () => {
  await refreshQueue()
}

watch(queueItems, (items, oldItems) => {
  const previousCompleted = new Set((oldItems ?? []).filter(q => q.status === 'completed').map(q => q.id))
  const currentCompleted = items.filter(q => q.status === 'completed').map(q => q.id)
  if (currentCompleted.some(id => !previousCompleted.has(id))) {
    fetchApps()
    return
  }
  // While anything is queued or in progress, its metadata is being written to
  // disk progressively, so re-list so partially-downloaded applications (and
  // their growing document lists) appear as soon as they land.
  if (activeQueueCount.value > 0) {
    fetchApps()
  }
})

const getQueueStatus = (reference: string) => {
  const item = queueItems.value.find(q => q.reference === reference && (q.status === 'pending' || q.status === 'in_progress' || q.status === 'failed'))
  if (item) return item.status
  return 'none'
}

const fetchApps = async () => {
  try {
    downloadedApps.value = await api.fetchApplications()
  } catch (e) {
    console.error(e)
  } finally {
    loadingApps.value = false
  }
}

onMounted(() => {
  document.title = 'PlanBrowser | Downloaded'
  fetchApps()
  fetchQueue()
})
</script>
