<template>
  <div class="space-y-8">

    <!-- Downloaded Applications -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-semibold">Downloaded Applications</h2>
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
      <div v-if="syncError" class="mb-2 text-sm text-red-700">{{ syncError }}</div>
      <div v-if="loadingApps" class="text-gray-500">Loading...</div>
      <div v-else-if="activeApps.length === 0" class="text-gray-500">No active applications. Archived applications are on the Archived page.</div>
      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ApplicationCard v-for="app in activeApps" :key="app.reference" :app="app" :queue-status="getQueueStatus(app.reference)" @changed="fetchApps" />
      </div>
    </section>

    <hr class="border-gray-200" />

    <!-- Search & Download -->
    <section>
      <h2 class="text-xl font-semibold mb-4">Search PlanIt API</h2>
      <form @submit.prevent="searchPlanIt" class="mb-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div class="w-full sm:flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
            <input v-model="searchForm.postcode" required type="text" placeholder="e.g. CB1 2JW" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <div class="w-full sm:w-32">
            <label class="block text-sm font-medium text-gray-700 mb-1">Radius (km)</label>
            <input v-model="searchForm.radius" required type="number" step="0.1" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          </div>
          <button type="submit" :disabled="isSearching" class="shrink-0 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
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
            <div class="sm:col-span-2 lg:col-span-4 mt-2">
              <p class="text-sm font-medium text-gray-700 mb-2">Date filters</p>
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div v-for="group in timeGroups" :key="group.key" class="p-3 bg-white rounded-md border border-gray-200">
                  <div class="flex items-center justify-between gap-2 mb-2">
                    <label class="text-sm font-medium text-gray-700">{{ group.label }}</label>
                    <select v-model="timeModes[group.key]" class="rounded-md border-gray-300 bg-white text-xs px-1.5 py-1 border focus:border-blue-500 focus:ring-blue-500">
                      <option value="range">Date range</option>
                      <option value="recent">Last N days</option>
                    </select>
                  </div>
                  <div v-if="timeModes[group.key] === 'recent'">
                    <input v-model="searchForm[group.recentKey]" type="number" min="0" placeholder="Days (0 = today)" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                  </div>
                  <div v-else class="space-y-2">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">From</label>
                      <input v-model="searchForm[group.fromKey]" type="date" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">To</label>
                      <input v-model="searchForm[group.toKey]" type="date" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
                    </div>
                  </div>
                </div>
              </div>
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
            <div class="min-w-0">
              <div class="font-bold break-words">{{ res.uid }}<span v-if="res.app_type" class="ml-2 text-xs font-normal text-gray-500">({{ res.app_type }})</span></div>
              <div class="text-sm text-gray-600 break-words">{{ res.description }}</div>
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
              <button v-else-if="canDownload(res)" @click="downloadApp(res.uid, res.area_name)" :disabled="['pending', 'in_progress'].includes(getQueueStatus(res.uid))" class="whitespace-nowrap bg-green-600 text-white px-3 py-1 rounded-md text-sm hover:bg-green-700 disabled:opacity-50">
                {{ getQueueStatusText(res.uid) }}
              </button>
              <span v-else class="whitespace-nowrap text-xs text-gray-400" title="This planning authority does not run an Idox Public Access portal, so planbrowser cannot download its documents.">Not on Idox portal</span>
              <div v-if="getQueueError(res.uid)" class="text-xs text-red-600 max-w-[240px] text-right">{{ getQueueError(res.uid) }}</div>
              <div v-else-if="downloadErrors[res.uid]" class="text-xs text-red-600 max-w-[240px] text-right">{{ downloadErrors[res.uid] }}</div>
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
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div class="flex-1 max-w-sm w-full">
          <label class="block text-sm font-medium text-gray-700 mb-1">Application Reference</label>
          <input v-model="directReference" required type="text" placeholder="e.g. 24/02737/FUL" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
        </div>
        <div class="flex-1 max-w-sm w-full">
          <label class="block text-sm font-medium text-gray-700 mb-1">Authority (default: cambridge)</label>
          <input v-model="directAuthority" list="authority-list" type="text" placeholder="cambridge" class="block w-full rounded-md border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
          <datalist id="authority-list">
            <option v-for="a in AUTHORITIES" :key="a.id" :value="a.id">{{ a.name }}</option>
          </datalist>
        </div>
        <button type="submit" :disabled="isLookingUp" class="shrink-0 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
          {{ isLookingUp ? 'Fetching...' : 'Fetch' }}
        </button>
        </div>
        <div v-if="lookupMessage" class="p-4 text-sm text-green-700 bg-green-50 rounded-md border border-green-200">
          {{ lookupMessage }}
        </div>
        <div v-if="lookupError" class="p-4 text-sm text-red-700 bg-red-50 rounded-md border border-red-200">
          {{ lookupError }}
        </div>
      </form>
    </section>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { timeAgo, progressText } from '../utils'
import type { ApplicationMeta, PlanItRecord, SearchFilters } from '../../../src/types.js'
import { isAwaitingDecision } from '../../../src/decision.js'
import type { SyncScope } from '../../../src/decision.js'
import { queueItems, refreshQueue, activeQueueCount } from '../queueStore'
import { AUTHORITIES, DEFAULT_AUTHORITY_ID, isKnownAuthority } from '../../../src/authorities.js'
import * as api from '../api'
import { useRouter } from 'vue-router'
import MultiSelect from '../components/MultiSelect.vue'
import SearchResultsMap from '../components/SearchResultsMap.vue'
import ApplicationCard from '../components/ApplicationCard.vue'

const router = useRouter()

const APP_TYPES = ['Full', 'Outline', 'Amendment', 'Conditions', 'Heritage', 'Trees', 'Advertising', 'Telecoms', 'Other']
const APP_STATES = ['Undecided', 'Permitted', 'Conditions', 'Rejected', 'Withdrawn', 'Referred', 'Unresolved', 'Other']
const APP_SIZES = ['Large', 'Medium', 'Small']

const searchError = ref('')
const downloadedApps = ref<ApplicationMeta[]>([])
const loadingApps = ref(true)

const activeApps = computed(() =>
  downloadedApps.value
    .filter((a) => !a.archived)
    .sort((a, b) => Number(!!b.starred) - Number(!!a.starred))
)

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

const searchForm = ref({
  postcode: '',
  radius: '2',
  search: '',
  developer: '',
  app_type: '',
  app_state: '',
  app_size: '',
  recent: '365',
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

type TimeFieldKey = 'recent' | 'start_date' | 'end_date' | 'changed' | 'changed_start' | 'changed_end' | 'decided' | 'decided_start' | 'decided_end' | 'different' | 'different_start' | 'different_end'

interface TimeGroup {
  key: string
  label: string
  recentKey: TimeFieldKey
  fromKey: TimeFieldKey
  toKey: TimeFieldKey
}

const timeGroups: TimeGroup[] = [
  { key: 'start', label: 'Start date', recentKey: 'recent', fromKey: 'start_date', toKey: 'end_date' },
  { key: 'changed', label: 'Last changed', recentKey: 'changed', fromKey: 'changed_start', toKey: 'changed_end' },
  { key: 'decided', label: 'Decided date', recentKey: 'decided', fromKey: 'decided_start', toKey: 'decided_end' },
  { key: 'different', label: 'Data changed', recentKey: 'different', fromKey: 'different_start', toKey: 'different_end' }
]

const timeModes = ref<Record<string, 'recent' | 'range'>>({
  start: 'recent',
  changed: 'recent',
  decided: 'recent',
  different: 'recent'
})

const isSearching = ref(false)
const hasSearched = ref(false)
const searchResults = ref<PlanItRecord[]>([])

const resultsWithLocations = computed(() => searchResults.value.filter(hasLocation))

const canDownload = (res: PlanItRecord) => isKnownAuthority(res.area_name)

const downloadErrors = ref<Record<string, string>>({})

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
const directAuthority = ref('')
const isLookingUp = ref(false)
const lookupError = ref('')
const lookupMessage = ref('')


const fetchQueue = async () => {
  await refreshQueue()
}

watch(queueItems, (items, oldItems) => {
  const previousCompleted = new Set((oldItems ?? []).filter(q => q.status === 'completed').map(q => q.id))
  const currentCompleted = items.filter(q => q.status === 'completed').map(q => q.id)
  if (currentCompleted.some(id => !previousCompleted.has(id))) {
    fetchApps()
  }
})


const getQueueStatus = (reference: string) => {
  const item = queueItems.value.find(q => q.reference === reference && (q.status === 'pending' || q.status === 'in_progress' || q.status === 'failed'))
  if (item) return item.status
  return 'none'
}

const getQueueStatusText = (reference: string) => {
  const status = getQueueStatus(reference)
  if (status === 'pending') return 'Queued'
  if (status === 'in_progress') {
    const item = queueItems.value.find(q => q.reference === reference && q.status === 'in_progress')
    return item?.progress ? progressText(item.progress) : 'Downloading...'
  }
  if (status === 'failed') return 'Failed — retry'
  return 'Download'
}

const getQueueError = (reference: string) => {
  const item = queueItems.value.find(q => q.reference === reference && q.status === 'failed')
  return item?.error
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
  lookupMessage.value = ''
  
  try {
    await api.downloadApplication(refValue, directAuthority.value || DEFAULT_AUTHORITY_ID)
    await fetchQueue()
    lookupMessage.value = `${refValue} queued for download`
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
      'search', 'developer', 'app_type', 'app_state', 'app_size'
    ]
    const filters: SearchFilters = {}
    for (const key of filterKeys) {
      const value = searchForm.value[key]
      if (value) {
        filters[key] = value
      }
    }
    for (const group of timeGroups) {
      if (timeModes.value[group.key] === 'recent') {
        const value = searchForm.value[group.recentKey]
        if (value) filters[group.recentKey] = value
      } else {
        const from = searchForm.value[group.fromKey]
        const to = searchForm.value[group.toKey]
        if (from) filters[group.fromKey] = from
        if (to) filters[group.toKey] = to
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

const downloadApp = async (reference: string, authorityId?: string) => {
  try {
    await api.downloadApplication(reference, authorityId)
    delete downloadErrors.value[reference]
    await fetchQueue()
  } catch (e: any) {
    console.error(e)
    downloadErrors.value[reference] = e.message || 'Failed to queue download'
  }
}

onMounted(() => {
  document.title = 'PlanBrowser | Home'
  fetchApps()
  fetchQueue()
})
</script>
