<template>
  <div :class="$style.page">
    <!-- Search & Download -->
    <section>
      <h2 :class="$style.title">Search PlanIt API</h2>
      <form @submit.prevent="searchPlanIt" :class="$style.form">
        <div :class="$style.row">
          <div :class="$style.colFluid">
            <label :class="$style.label">Postcode</label>
            <input v-model="searchForm.postcode" required type="text" placeholder="e.g. CB1 2JW" :class="ui.input" />
          </div>
          <div :class="$style.colRadius">
            <label :class="$style.label">Radius (km)</label>
            <input v-model="searchForm.radius" required type="number" step="0.1" :class="ui.input" />
          </div>
          <button type="submit" :disabled="isSearching" :class="[ui.btn, ui.btnPrimary, $style.submit]">
            {{ isSearching ? 'Searching...' : 'Search' }}
          </button>
        </div>

        <details :class="$style.details">
          <summary :class="$style.summary">Advanced filters</summary>
          <div :class="$style.filters">
            <div>
              <label :class="$style.label">Keyword</label>
              <input v-model="searchForm.search" type="text" placeholder='e.g. "solar panel" or photovoltaic' :class="ui.input" />
            </div>
            <div>
              <label :class="$style.label">Developer / Agent</label>
              <input v-model="searchForm.developer" type="text" placeholder="e.g. company name" :class="ui.input" />
            </div>
            <div>
              <label :class="$style.label">Application type</label>
              <MultiSelect v-model="searchForm.app_type" :options="APP_TYPES" placeholder="Any type" />
            </div>
            <div>
              <label :class="$style.label">Decision status</label>
              <MultiSelect v-model="searchForm.app_state" :options="APP_STATES" placeholder="Any status" />
            </div>
            <div>
              <label :class="$style.label">Development size</label>
              <MultiSelect v-model="searchForm.app_size" :options="APP_SIZES" placeholder="Any size" />
            </div>
            <div :class="$style.dateSection">
              <p :class="$style.dateHeading">Date filters</p>
              <div :class="$style.dateGrid">
                <div v-for="group in timeGroups" :key="group.key" :class="$style.dateCard">
                  <div :class="$style.dateHeader">
                    <label :class="$style.label">{{ group.label }}</label>
                    <select v-model="timeModes[group.key]" :class="[ui.select, $style.dateMode]">
                      <option value="range">Date range</option>
                      <option value="recent">Last N days</option>
                    </select>
                  </div>
                  <div v-if="timeModes[group.key] === 'recent'">
                    <input v-model="searchForm[group.recentKey]" type="number" min="0" placeholder="Days (0 = today)" :class="ui.input" />
                  </div>
                  <div v-else :class="$style.rangeFields">
                    <div>
                      <label :class="$style.subLabel">From</label>
                      <input v-model="searchForm[group.fromKey]" type="date" :class="ui.input" />
                    </div>
                    <div>
                      <label :class="$style.subLabel">To</label>
                      <input v-model="searchForm[group.toKey]" type="date" :class="ui.input" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </details>
      </form>

      <div v-if="searchError" :class="$style.errorBanner">
        {{ searchError }}
      </div>

      <div v-if="searchResults.length > 0">
        <h3 :class="$style.resultsTitle">Results</h3>
        <div ref="mapWrapRef">
          <SearchResultsMap v-if="resultsWithLocations.length > 0" ref="mapRef" :results="searchResults" :class="$style.resultsMap" @select="scrollToResult" />
        </div>
        <div :class="$style.resultsList">
          <div v-for="res in searchResults" :key="res.uid" :ref="(el) => setResultRef(res.uid, el)" :class="$style.resultCard">
            <div :class="$style.resultBody">
              <div :class="$style.resultUid">{{ res.uid }}<span v-if="res.app_type" :class="$style.resultType">({{ res.app_type }})</span></div>
              <div :class="$style.resultDesc">{{ res.description }}</div>
              <div v-if="res.address" :class="$style.resultAddress">{{ res.address }}</div>
              <div :class="$style.resultStateRow">
                <span>{{ res.app_state }}</span>
                <span v-if="res.start_date">· {{ timeAgo(res.start_date) }}</span>
              </div>
            </div>
            <div :class="$style.resultActions">
              <router-link v-if="isDownloaded(res.uid)" :to="`/app/${encodeURIComponent(res.uid)}`" :class="$style.viewLink">
                View
              </router-link>
              <button v-else-if="canDownload(res)" @click="downloadApp(res.uid, res.area_name)" :disabled="['pending', 'in_progress'].includes(getQueueStatus(res.uid))" :class="[ui.btn, ui.btnSuccess, $style.downloadButton]">
                {{ getQueueStatusText(res.uid) }}
              </button>
              <span v-else :class="$style.notIdox" title="This planning authority does not run an Idox Public Access portal, so planbrowser cannot download its documents.">Not on Idox portal</span>
              <div v-if="getQueueError(res.uid)" :class="$style.resultError">{{ getQueueError(res.uid) }}</div>
              <div v-else-if="downloadErrors[res.uid]" :class="$style.resultError">{{ downloadErrors[res.uid] }}</div>
              <button v-if="hasLocation(res)" @click="showOnMap(res.uid)" :class="$style.showOnMap">Show on map</button>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="hasSearched" :class="$style.muted">
        No results found.
      </div>
    </section>

    <hr :class="$style.rule" />

    <!-- Direct Lookup -->
    <section>
      <h2 :class="$style.title">Direct Reference Lookup</h2>
      <form @submit.prevent="lookupReference" :class="$style.lookupForm">
        <div :class="$style.row">
        <div :class="[$style.colFixed]">
          <label :class="$style.label">Application Reference</label>
          <input v-model="directReference" required type="text" placeholder="e.g. 24/02737/FUL" :class="ui.input" />
        </div>
        <div :class="[$style.colFixed]">
          <label :class="$style.label">Authority (default: cambridge)</label>
          <input v-model="directAuthority" list="authority-list" type="text" placeholder="cambridge" :class="ui.input" />
          <datalist id="authority-list">
            <option v-for="a in AUTHORITIES" :key="a.id" :value="a.id">{{ a.name }}</option>
          </datalist>
        </div>
        <button type="submit" :disabled="isLookingUp" :class="[ui.btn, ui.btnPrimary, $style.submit]">
          {{ isLookingUp ? 'Fetching...' : 'Fetch' }}
        </button>
        </div>
        <div v-if="lookupMessage" :class="$style.successBanner">
          {{ lookupMessage }}
        </div>
        <div v-if="lookupError" :class="$style.errorBannerPlain">
          {{ lookupError }}
        </div>
      </form>
    </section>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, computed, watch, useCssModule } from 'vue'
import { timeAgo, progressText } from '../utils'
import type { ApplicationMeta, PlanItRecord, SearchFilters } from '../../../src/types.js'
import { queueItems, refreshQueue } from '../queueStore'
import { AUTHORITIES, DEFAULT_AUTHORITY_ID, isKnownAuthority } from '../../../src/authorities.js'
import { normalizePostcode } from '../../../src/postcode.js'
import * as api from '../api'
import { useRouter } from 'vue-router'
import MultiSelect from '../components/MultiSelect.vue'
import SearchResultsMap from '../components/SearchResultsMap.vue'
import ui from '../styles/primitives.module.css'

const router = useRouter()
const styles = useCssModule()

const APP_TYPES = ['Full', 'Outline', 'Amendment', 'Conditions', 'Heritage', 'Trees', 'Advertising', 'Telecoms', 'Other']
const APP_STATES = ['Undecided', 'Permitted', 'Conditions', 'Rejected', 'Withdrawn', 'Referred', 'Unresolved', 'Other']
const APP_SIZES = ['Large', 'Medium', 'Small']

const searchError = ref('')
const searchResults = ref<PlanItRecord[]>([])
const isSearching = ref(false)
const hasSearched = ref(false)

// Track which downloaded applications already exist so results flip between a
// "Download" button and a "View" link.
const downloadedApps = ref<ApplicationMeta[]>([])
const isDownloaded = (reference: string) => downloadedApps.value.some(app => app.reference === reference)

const fetchApps = async () => {
  try {
    downloadedApps.value = await api.fetchApplications()
  } catch (e) {
    console.error(e)
  }
}

watch(queueItems, (items, oldItems) => {
  const previousCompleted = new Set((oldItems ?? []).filter(q => q.status === 'completed').map(q => q.id))
  const currentCompleted = items.filter(q => q.status === 'completed').map(q => q.id)
  if (currentCompleted.some(id => !previousCompleted.has(id))) {
    fetchApps()
  }
})

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
  el.classList.add(styles.resultHighlight)
  setTimeout(() => el.classList.remove(styles.resultHighlight), 2000)
}

const directReference = ref('')
const directAuthority = ref('')
const isLookingUp = ref(false)
const lookupError = ref('')
const lookupMessage = ref('')

const fetchQueue = async () => {
  await refreshQueue()
}

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

  searchForm.value.postcode = normalizePostcode(searchForm.value.postcode)

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
  document.title = 'PlanBrowser | Search'
  fetchApps()
  fetchQueue()
})
</script>

<style module>
.page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.title {
  font-size: 1.25rem;
  line-height: 1.75rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.form {
  margin-bottom: 1.5rem;
}

.row {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

@media (min-width: 640px) {
  .row {
    flex-direction: row;
    align-items: flex-end;
  }
}

.colFluid {
  width: 100%;
}

@media (min-width: 640px) {
  .colFluid {
    flex: 1 1 0%;
  }
}

.colRadius {
  width: 100%;
}

@media (min-width: 640px) {
  .colRadius {
    width: 8rem;
  }
}

.colFixed {
  flex: 1 1 0%;
  max-width: 24rem;
  width: 100%;
}

.label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  color: var(--color-gray-700);
}

.subLabel {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.submit {
  flex-shrink: 0;
}

.details {
  margin-top: 1rem;
}

.summary {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-blue-600);
  cursor: pointer;
  user-select: none;
}

.summary:hover {
  text-decoration: underline;
}

.filters {
  display: grid;
  gap: 1rem;
  margin-top: 0.75rem;
  padding: 1rem;
  background: var(--color-gray-50);
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
}

@media (min-width: 640px) {
  .filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .filters {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.dateSection {
  margin-top: 0.5rem;
}

@media (min-width: 640px) {
  .dateSection {
    grid-column: span 2 / span 2;
  }
}

@media (min-width: 1024px) {
  .dateSection {
    grid-column: span 4 / span 4;
  }
}

.dateHeading {
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  color: var(--color-gray-700);
}

.dateGrid {
  display: grid;
  gap: 1rem;
}

@media (min-width: 640px) {
  .dateGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .dateGrid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.dateCard {
  padding: 0.75rem;
  background: #fff;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
}

.dateHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.dateMode {
  font-size: 0.75rem;
  line-height: 1rem;
  padding: 0.25rem 1.5rem 0.25rem 0.375rem;
}

.rangeFields {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.errorBanner {
  margin-bottom: 1.5rem;
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-red-700);
  background: var(--color-red-50);
  border: 1px solid var(--color-red-200);
  border-radius: var(--radius-md);
}

.errorBannerPlain {
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-red-700);
  background: var(--color-red-50);
  border: 1px solid var(--color-red-200);
  border-radius: var(--radius-md);
}

.successBanner {
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-green-700);
  background: var(--color-green-50);
  border: 1px solid var(--color-green-200);
  border-radius: var(--radius-md);
}

.resultsTitle {
  margin-bottom: 0.75rem;
  font-size: 1.125rem;
  line-height: 1.75rem;
  font-weight: 500;
}

.resultsMap {
  margin-bottom: 1.5rem;
}

.resultsList {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.resultCard {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem;
  background: #fff;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.resultHighlight {
  box-shadow: 0 0 0 2px var(--color-blue-500);
}

.resultBody {
  min-width: 0;
}

.resultUid {
  font-weight: 700;
  overflow-wrap: break-word;
}

.resultType {
  margin-left: 0.5rem;
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 400;
  color: var(--color-gray-500);
}

.resultDesc {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-gray-600);
  overflow-wrap: break-word;
}

.resultAddress {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.resultStateRow {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.resultActions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
  flex-shrink: 0;
}

.viewLink {
  padding: 0.25rem 0.75rem;
  background: var(--color-blue-100);
  color: var(--color-blue-700);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  line-height: 1.25rem;
  white-space: nowrap;
}

.viewLink:hover {
  background: var(--color-blue-200);
}

.downloadButton {
  padding: 0.25rem 0.75rem;
  white-space: nowrap;
}

.notIdox {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-400);
  white-space: nowrap;
}

.resultError {
  max-width: 240px;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-red-600);
  text-align: right;
}

.showOnMap {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-blue-600);
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
}

.showOnMap:hover {
  text-decoration: underline;
}

.muted {
  color: var(--color-gray-500);
}

.rule {
  border-color: var(--color-gray-200);
}

.lookupForm {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
</style>
