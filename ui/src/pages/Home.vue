<template>
  <div class="space-y-8">
    <!-- Downloaded Applications -->
    <section>
      <h2 class="text-xl font-semibold mb-4">Downloaded Applications</h2>
      <div v-if="loadingApps" class="text-gray-500">Loading...</div>
      <div v-else-if="downloadedApps.length === 0" class="text-gray-500">No applications downloaded yet.</div>
      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="app in downloadedApps" :key="app.reference" class="bg-white p-4 rounded shadow border border-gray-200">
          <h3 class="font-bold text-lg mb-1">{{ app.reference }}</h3>
          <p class="text-sm text-gray-600 mb-2 truncate">{{ app.address }}</p>
          <div class="flex justify-between items-center mt-4">
            <span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">{{ app.status }}</span>
            <router-link :to="`/app/${encodeURIComponent(app.reference)}`" class="text-sm text-blue-600 hover:underline">View details</router-link>
          </div>
        </div>
      </div>
    </section>

    <hr class="border-gray-200" />

    <!-- Search & Download -->
    <section>
      <h2 class="text-xl font-semibold mb-4">Search PlanIt API</h2>
      <form @submit.prevent="searchPlanIt" class="flex gap-4 items-end mb-6">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
          <input v-model="searchForm.postcode" required type="text" placeholder="e.g. CB1 2JW" class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Radius (km)</label>
          <input v-model="searchForm.radius" required type="number" step="0.1" class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
        </div>
        <button type="submit" :disabled="isSearching" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
          {{ isSearching ? 'Searching...' : 'Search' }}
        </button>
      </form>

      <div v-if="searchError" class="mb-6 p-4 text-sm text-red-700 bg-red-50 rounded-md border border-red-200">
        {{ searchError }}
      </div>

      <div v-if="searchResults.length > 0">
        <h3 class="font-medium text-lg mb-3">Results</h3>
        <div class="space-y-4">
          <div v-for="res in searchResults" :key="res.uid" class="bg-white p-4 rounded shadow border border-gray-200 flex justify-between items-start gap-4">
            <div>
              <div class="font-bold">{{ res.uid }}</div>
              <div class="text-sm text-gray-600">{{ res.description }}</div>
              <div class="text-xs text-gray-500 mt-1">{{ res.name }} - {{ res.app_state }}</div>
            </div>
            <router-link v-if="isDownloaded(res.uid)" :to="`/app/${encodeURIComponent(res.uid)}`" class="whitespace-nowrap bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-sm hover:bg-blue-200">
              View
            </router-link>
            <div v-else class="flex flex-col items-end">
              <button @click="downloadApp(res.uid)" :disabled="downloading[res.uid]" class="whitespace-nowrap bg-green-600 text-white px-3 py-1 rounded-md text-sm hover:bg-green-700 disabled:opacity-50">
                {{ downloading[res.uid] ? 'Downloading...' : 'Download' }}
              </button>
              <div v-if="downloadErrors[res.uid]" class="text-xs text-red-600 mt-1">{{ downloadErrors[res.uid] }}</div>
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
          <input v-model="directReference" required type="text" placeholder="e.g. 24/02737/FUL" class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm px-3 py-2 border" />
        </div>
        <button type="submit" :disabled="isLookingUp" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50">
          {{ isLookingUp ? 'Fetching...' : 'Fetch' }}
        </button>
        </div>
        <div v-if="lookupError" class="p-4 text-sm text-red-700 bg-red-50 rounded-md border border-red-200">
          {{ lookupError }}
        </div>
      </form>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { ApplicationMeta, PlanItRecord } from '../../src/types.js'
import * as api from '../api'
import { useRouter } from 'vue-router'

const router = useRouter()

const searchError = ref('')
const downloadedApps = ref<ApplicationMeta[]>([])
const loadingApps = ref(true)

const searchForm = ref({ postcode: '', radius: '2' })
const isSearching = ref(false)
const hasSearched = ref(false)
const searchResults = ref<PlanItRecord[]>([])
const downloading = ref<Record<string, boolean>>({})
const downloadErrors = ref<Record<string, string>>({})

const directReference = ref('')
const isLookingUp = ref(false)
const lookupError = ref('')

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
    await fetchApps()
    router.push(`/app/${encodeURIComponent(refValue)}`)
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
    const data = await api.searchPlanIt(searchForm.value.postcode, searchForm.value.radius)
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
  downloading.value[reference] = true
  downloadErrors.value[reference] = ''
  try {
    await api.downloadApplication(reference)
    await fetchApps() // refresh the downloaded list
    router.push(`/app/${encodeURIComponent(reference)}`)
  } catch (e: any) {
    console.error(e)
    downloadErrors.value[reference] = e.message || 'Failed to download'
  } finally {
    downloading.value[reference] = false
  }
}

onMounted(() => {
  document.title = 'PlanBrowser | Home'
  fetchApps()
})
</script>
