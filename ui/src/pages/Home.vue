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
            <button v-else @click="downloadApp(res.uid)" :disabled="downloading[res.uid]" class="whitespace-nowrap bg-green-600 text-white px-3 py-1 rounded-md text-sm hover:bg-green-700 disabled:opacity-50">
              {{ downloading[res.uid] ? 'Downloading...' : 'Download' }}
            </button>
          </div>
        </div>
      </div>
      <div v-else-if="hasSearched" class="text-gray-500">
        No results found.
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const isSearching = ref(false)
const hasSearched = ref(false)
const searchError = ref('')
const downloadedApps = ref<any[]>([])
const loadingApps = ref(true)

const searchForm = ref({ postcode: '', radius: '2' })
const isSearching = ref(false)
const hasSearched = ref(false)
const searchResults = ref<any[]>([])
const downloading = ref<Record<string, boolean>>({})

const fetchApps = async () => {
  try {
    const res = await fetch('/api/applications')
    if (res.ok) {
      downloadedApps.value = await res.json()
    }
  } catch (e) {
    console.error(e)
  } finally {
    loadingApps.value = false
  }
}

const isDownloaded = (reference: string) => {
  return downloadedApps.value.some(app => app.reference === reference)
}

const searchPlanIt = async () => {
  if (!searchForm.value.postcode) return
  
  searchForm.value.postcode = searchForm.value.postcode.toUpperCase()
  
  isSearching.value = true
  hasSearched.value = false
  searchError.value = ''
  
  try {
    const res = await fetch(`/api/search?postcode=${encodeURIComponent(searchForm.value.postcode)}&radius=${encodeURIComponent(searchForm.value.radius)}`)
    if (res.ok) {
      const data = await res.json()
      searchResults.value = data.records || []
      hasSearched.value = true
    } else {
      const err = await res.json()
      searchError.value = err.error || 'Failed to search'
      searchResults.value = []
    }
  } catch (e: any) {
    console.error(e)
    searchError.value = e.message || 'Network error occurred'
    searchResults.value = []
  } finally {
    isSearching.value = false
  }
}

const downloadApp = async (reference: string) => {
  downloading.value[reference] = true
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference })
    })
    if (res.ok) {
      await fetchApps() // refresh the downloaded list
      router.push(`/app/${encodeURIComponent(reference)}`)
    } else {
      const err = await res.json()
      alert(`Failed to download: ${err.error}`)
    }
  } catch (e) {
    console.error(e)
    alert('Failed to download')
  } finally {
    downloading.value[reference] = false
  }
}

onMounted(() => {
  fetchApps()
})
</script>
