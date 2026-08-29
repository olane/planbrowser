<template>
  <div class="space-y-8">

    <!-- Downloaded Applications -->
    <section>
      <h2 class="text-xl font-semibold mb-4">Downloaded Applications</h2>
      <div v-if="loadingApps" class="text-gray-500">Loading...</div>
      <div v-else-if="downloadedApps.length === 0" class="text-gray-500">No applications downloaded yet.</div>
      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="app in downloadedApps" :key="app.reference" class="bg-white p-4 rounded shadow border border-gray-200">
          <div class="flex justify-between items-start mb-1">
            <h3 class="font-bold text-lg">{{ app.reference }}</h3>
            <span v-if="app.furtherInformation?.['Application Type']" class="text-xs text-gray-500 whitespace-nowrap">{{ app.furtherInformation['Application Type'] }}</span>
          </div>
          <p class="text-sm text-gray-600 mb-2 truncate">{{ app.address }}</p>
          <p class="text-xs text-gray-500 mb-2">Synced: {{ timeAgo(app.scrapedAt) }}</p>
          <div class="flex justify-between items-center mt-2">
            <span :class="['inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset', statusBadgeClass(app)]">{{ statusLabel(app) }}</span>
            <router-link :to="`/app/${encodeURIComponent(app.reference)}`" class="text-sm text-blue-600 hover:underline">View details</router-link>
          </div>
        </div>
      </div>
    </section>

    <hr class="border-gray-200" />

    <!-- Search & Download -->
    <section>
      <h2 class="text-xl font-semibold mb-4">Search PlanIt API</h2>
      <form @submit.prevent="searchPlanIt" class="mb-6">
        <div class="flex gap-4 items-end">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
            <input v-model="searchForm.postcode" required type="text" placeholder="e.g. CB1 2JW" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Radius (km)</label>
            <input v-model="searchForm.radius" required type="number" step="0.1" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <button type="submit" :disabled="isSearching" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {{ isSearching ? 'Searching...' : 'Search' }}
          </button>
        </div>

        <details class="mt-4">
          <summary class="text-sm text-blue-600 cursor-pointer hover:underline select-none">Advanced filters</summary>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-3 p-4 bg-gray-50 rounded-md border border-gray-200">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Keyword</label>
              <input v-model="searchForm.search" type="text" placeholder='e.g. "solar panel" or photovoltaic' class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Developer / Agent</label>
              <input v-model="searchForm.developer" type="text" placeholder="e.g. company name" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Application type</label>
              <MultiSelect v-model="searchForm.app_type" :options="APP_TYPES" placeholder="Any type" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Decision status</label>
              <MultiSelect v-model="searchForm.app_state" :options="APP_STATES" placeholder="Any status" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Development size</label>
              <MultiSelect v-model="searchForm.app_size" :options="APP_SIZES" placeholder="Any size" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Recent (days)</label>
              <input v-model="searchForm.recent" type="number" min="0" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start date from</label>
              <input v-model="searchForm.start_date" type="date" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start date to</label>
              <input v-model="searchForm.end_date" type="date" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Last changed (days)</label>
              <input v-model="searchForm.changed" type="number" min="0" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Changed from</label>
              <input v-model="searchForm.changed_start" type="date" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Changed to</label>
              <input v-model="searchForm.changed_end" type="date" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Decided (days)</label>
              <input v-model="searchForm.decided" type="number" min="0" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Decided from</label>
              <input v-model="searchForm.decided_start" type="date" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Decided to</label>
              <input v-model="searchForm.decided_end" type="date" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Data changed (days)</label>
              <input v-model="searchForm.different" type="number" min="0" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Data changed from</label>
              <input v-model="searchForm.different_start" type="date" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Data changed to</label>
              <input v-model="searchForm.different_end" type="date" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
            </div>
          </div>
        </details>
      </form>

      <div v-if="searchError" class="mb-6 p-4 text-sm text-red-700 bg-red-50 rounded-md border border-red-200">
        {{ searchError }}
      </div>

      <div v-if="searchResults.length > 0">
        <h3 class="font-medium text-lg mb-3">Results</h3>
        <div ref="mapWrapRef">
          <SearchResultsMap v-if="resultsWithLocations.length > 0" ref="mapRef" :results="searchResults" class="mb-6" @select="scrollToResult" />
        </div>
        <div class="space-y-4">
          <div v-for="res in searchResults" :key="res.uid" :ref="(el) => setResultRef(res.uid, el)" class="bg-white p-4 rounded shadow border border-gray-200 flex justify-between items-start gap-4">
            <div>
              <div class="font-bold">{{ res.uid }}<span v-if="res.app_type" class="ml-2 text-xs font-normal text-gray-500">({{ res.app_type }})</span></div>
              <div class="text-sm text-gray-600">{{ res.description }}</div>
              <div v-if="res.address" class="text-xs text-gray-500 mt-1">{{ res.address }}</div>
              <div class="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                <span>{{ res.app_state }}</span>
                <span v-if="res.start_date">· {{ timeAgo(res.start_date) }}</span>
              </div>
            </div>
            <div class="flex flex-col items-end gap-2 shrink-0">
              <router-link v-if="isDownloaded(res.uid)" :to="`/app/${encodeURIComponent(res.uid)}`" class="whitespace-nowrap bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-sm hover:bg-blue-200">
                View
              </router-link>
              <button v-else @click="downloadApp(res.uid)" :disabled="getQueueStatus(res.uid) !== 'none'" class="whitespace-nowrap bg-green-600 text-white px-3 py-1 rounded-md text-sm hover:bg-green-700 disabled:opacity-50">
                {{ getQueueStatusText(res.uid) }}
              </button>
              <button v-if="hasLocation(res)" @click="showOnMap(res.uid)" class="text-xs text-blue-600 hover:underline">Show on map</button>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="hasSearched" class="text-gray-500">
        No results found.
      </div>
    </section>

    <hr class="border-gray-200" />

    <!-- Direct Lookup -->
    <section>
      <h2 class="text-xl font-semibold mb-4">Direct Reference Lookup</h2>
      <form @submit.prevent="lookupReference" class="flex flex-col gap-4 mb-6">
        <div class="flex gap-4 items-end">
        <div class="flex-1 max-w-sm">
          <label class="block text-sm font-medium text-gray-700 mb-1">Application Reference</label>
          <input v-model="directReference" required type="text" placeholder="e.g. 24/02737/FUL" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
        </div>
        <button type="submit" :disabled="isLookingUp" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
          {{ isLookingUp ? 'Fetching...' : 'Fetch' }}
        </button>
        </div>
        <div v-if="lookupError" class="p-4 text-sm text-red-700 bg-red-50 rounded-md border border-red-200">
          {{ lookupError }}
        </div>
      </form>
    </section>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { timeAgo, statusLabel, statusBadgeClass } from '../utils'
import type { ApplicationMeta, PlanItRecord, QueueItem, SearchFilters } from '../../../src/types.js'
import * as api from '../api'
import { useRouter } from 'vue-router'
import MultiSelect from '../components/MultiSelect.vue'
import SearchResultsMap from '../components/SearchResultsMap.vue'

const router = useRouter()

const APP_TYPES = ['Full', 'Outline', 'Amendment', 'Conditions', 'Heritage', 'Trees', 'Advertising', 'Telecoms', 'Other']
const APP_STATES = ['Undecided', 'Permitted', 'Conditions', 'Rejected', 'Withdrawn', 'Referred', 'Unresolved', 'Other']
const APP_SIZES = ['Large', 'Medium', 'Small']

const searchError = ref('')
const downloadedApps = ref<ApplicationMeta[]>([])
const loadingApps = ref(true)

const searchForm = ref({
  postcode: '',
  radius: '2',
  search: '',
  developer: '',
  app_type: '',
  app_state: '',
  app_size: '',
  recent: '',
  start_date: '',
  end_date: '',
  changed: '',
  changed_start: '',
  changed_end: '',
  decided: '',
  decided_start: '',
  decided_end: '',
  different: '',
  different_start: '',
  different_end: ''
})
const isSearching = ref(false)
const hasSearched = ref(false)
const searchResults = ref<PlanItRecord[]>([])
const queueItems = ref<QueueItem[]>([])
let pollInterval: any = null

const resultsWithLocations = computed(() => searchResults.value.filter(hasLocation))

const hasLocation = (r: PlanItRecord) => {
  const lat = typeof r.location_y === 'number' ? r.location_y : r.location?.coordinates?.[1]
  const lon = typeof r.location_x === 'number' ? r.location_x : r.location?.coordinates?.[0]
  return typeof lat === 'number' && typeof lon === 'number'
}

const mapRef = ref<InstanceType<typeof SearchResultsMap> | null>(null)
const mapWrapRef = ref<HTMLElement | null>(null)
const showOnMap = (uid: string) => {
  mapWrapRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  mapRef.value?.focus(uid)
}

const resultRefs = new Map<string, HTMLElement>()
const setResultRef = (uid: string, el: unknown) => {
  if (el instanceof HTMLElement) resultRefs.set(uid, el)
  else resultRefs.delete(uid)
}
const scrollToResult = (uid: string) => {
  const el = resultRefs.get(uid)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('ring-2', 'ring-blue-500')
  setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500'), 2000)
}

const directReference = ref('')
const isLookingUp = ref(false)
const lookupError = ref('')


const fetchQueue = async () => {
  try {
    const queue = await api.fetchQueue()
    
    // If we have items that just completed, we might need to refresh apps
    const previousCompleted = queueItems.value.filter(q => q.status === 'completed').map(q => q.id)
    const currentCompleted = queue.filter(q => q.status === 'completed').map(q => q.id)
    
    queueItems.value = queue
    
    if (currentCompleted.some(id => !previousCompleted.includes(id))) {
      fetchApps()
    }
  } catch (e) {
    console.error('Failed to fetch queue', e)
  }
}


const getQueueStatus = (reference: string) => {
  const item = queueItems.value.find(q => q.reference === reference && (q.status === 'pending' || q.status === 'in_progress'))
  if (item) return item.status
  return 'none'
}

const getQueueStatusText = (reference: string) => {
  const status = getQueueStatus(reference)
  if (status === 'pending') return 'Queued'
  if (status === 'in_progress') return 'Downloading...'
  return 'Download'
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

const isDownloaded = (reference: string) => {
  return downloadedApps.value.some(app => app.reference === reference)
}

const lookupReference = async () => {
  if (!directReference.value) return
  const refValue = directReference.value.trim().toUpperCase()
  
  if (isDownloaded(refValue)) {
    router.push(`/app/${encodeURIComponent(refValue)}`)
    return
  }
  
  isLookingUp.value = true
  lookupError.value = ''
  
  try {
    await api.downloadApplication(refValue)
    await fetchQueue()
    // It will be added to the queue, don't redirect yet
    directReference.value = ''
  } catch (e: any) {
    console.error(e)
    lookupError.value = e.message || 'Failed to fetch application'
  } finally {
    isLookingUp.value = false
  }
}

const searchPlanIt = async () => {
  if (!searchForm.value.postcode) return
  
  searchForm.value.postcode = searchForm.value.postcode.toUpperCase()
  
  isSearching.value = true
  hasSearched.value = false
  searchError.value = ''
  
  try {
    const filterKeys: (keyof SearchFilters)[] = [
      'search', 'developer', 'app_type', 'app_state', 'app_size',
      'recent', 'start_date', 'end_date',
      'changed', 'changed_start', 'changed_end',
      'decided', 'decided_start', 'decided_end',
      'different', 'different_start', 'different_end'
    ]
    const filters: SearchFilters = {}
    for (const key of filterKeys) {
      const value = searchForm.value[key]
      if (value) {
        filters[key] = value
      }
    }
    const data = await api.searchPlanIt(searchForm.value.postcode, searchForm.value.radius, filters)
    searchResults.value = data.records || []
    hasSearched.value = true
  } catch (e: any) {
    console.error(e)
    searchError.value = e.message || 'Failed to search'
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}

const downloadApp = async (reference: string) => {
  try {
    await api.downloadApplication(reference)
    await fetchQueue()
  } catch (e: any) {
    console.error(e)
  }
}

onMounted(() => {
  document.title = 'PlanBrowser | Home'
  fetchApps()
  fetchQueue()
  pollInterval = setInterval(fetchQueue, 2000)
})

import { onUnmounted } from 'vue'
onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})
</script>
