<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <router-link to="/" class="text-sm text-blue-600 hover:underline">&larr; Back to all applications</router-link>
      <div class="flex items-center gap-4">
        <span v-if="app" class="text-sm text-gray-500">Last Synced: {{ timeAgo(app.scrapedAt) }}</span>
        <button v-if="app" @click="toggleStar" :disabled="savingFlags" :title="app.starred ? 'Remove from favourites' : 'Add to favourites'" class="cursor-pointer text-gray-400 hover:text-yellow-500 disabled:opacity-50">
          <svg v-if="app.starred" class="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
          <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"></path></svg>
        </button>
        <button v-if="app" @click="toggleArchive" :disabled="savingFlags" class="cursor-pointer text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md shadow-sm disabled:opacity-50">
          {{ app.archived ? 'Restore' : 'Archive' }}
        </button>
        <button v-if="app" @click="syncApp" :disabled="syncing" class="text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md shadow-sm disabled:opacity-50">
          {{ syncing ? 'Syncing...' : 'Sync / Update' }}
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-gray-500">Loading...</div>
    <div v-else-if="error" class="text-red-600">{{ error }}</div>
    <div v-if="syncError" class="mb-4 p-4 text-sm text-red-700 bg-red-50 rounded-md border border-red-200">
      {{ syncError }}
    </div>
    <div v-if="syncMessage" class="mb-4 p-4 text-sm text-green-700 bg-green-50 rounded-md border border-green-200">
      {{ syncMessage }}
    </div>
    <div v-else-if="app" class="bg-white p-6 rounded shadow border border-gray-200">
      <div class="grid md:grid-cols-2 gap-8 mb-8">
        <div>
          <h2 class="text-2xl font-bold mb-2">{{ app.reference }}</h2>
          <p class="text-lg text-gray-700 mb-2">{{ app.address }}</p>
          <p class="text-gray-600">{{ app.description }}</p>
          <div class="mt-4">
            <span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">{{ app.status }}</span>
          </div>
        </div>

        <div>
          <h3 class="text-lg font-semibold mb-3 border-b pb-2">Key Dates</h3>
          <dl class="divide-y divide-gray-100">
            <div v-for="(value, key) in app.dates" :key="key" class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="text-sm font-medium text-gray-900">{{ key }}</dt>
              <dd class="text-sm text-gray-700 sm:col-span-2 sm:mt-0">{{ value }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Additional Metadata -->
      <div v-if="app.furtherInformation" class="mb-8 p-4 bg-gray-50 rounded border border-gray-100">
        <h3 class="text-lg font-semibold mb-3 border-b border-gray-200 pb-2 text-gray-800">Additional Details</h3>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div v-if="app.furtherInformation?.['Application Type']">
            <dt class="text-xs font-medium text-gray-500 uppercase tracking-wider">Application Type</dt>
            <dd class="text-sm text-gray-900 mt-1">{{ app.furtherInformation['Application Type'] }}</dd>
          </div>
          <div v-if="app.furtherInformation?.['Case Officer']">
            <dt class="text-xs font-medium text-gray-500 uppercase tracking-wider">Case Officer</dt>
            <dd class="text-sm text-gray-900 mt-1">{{ app.furtherInformation['Case Officer'] }}</dd>
          </div>
          <div v-if="app.furtherInformation?.['Ward']">
            <dt class="text-xs font-medium text-gray-500 uppercase tracking-wider">Ward</dt>
            <dd class="text-sm text-gray-900 mt-1">{{ app.furtherInformation['Ward'] }}</dd>
          </div>
          <div v-if="app.importantDates?.['Determination Deadline']">
            <dt class="text-xs font-medium text-gray-500 uppercase tracking-wider">Determination Deadline</dt>
            <dd class="text-sm text-gray-900 mt-1">{{ app.importantDates['Determination Deadline'] }}</dd>
          </div>
          <div v-if="app.importantDates?.['Actual Committee Date']">
            <dt class="text-xs font-medium text-gray-500 uppercase tracking-wider">Meeting Date</dt>
            <dd class="text-sm text-gray-900 mt-1">
              {{ app.importantDates['Actual Committee Date'] }}
            </dd>
          </div>
          <div v-if="app.furtherInformation?.['Decision']">
            <dt class="text-xs font-medium text-gray-500 uppercase tracking-wider">Decision</dt>
            <dd class="text-sm text-gray-900 mt-1">{{ app.furtherInformation['Decision'] }}</dd>
          </div>
          <div v-if="app.importantDates?.['Decision Issued Date']">
            <dt class="text-xs font-medium text-gray-500 uppercase tracking-wider">Decision Date</dt>
            <dd class="text-sm text-gray-900 mt-1">{{ app.importantDates['Decision Issued Date'] }}</dd>
          </div>
        </div>
      </div>

      <div class="mt-8">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8" aria-label="Tabs">
            <button v-if="keyDocs.length > 0" @click="activeTab = 'key-documents'" :class="[activeTab === 'key-documents' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm']">
              Key Documents ({{ keyDocs.length }})
            </button>
            <button @click="activeTab = 'favourites'" :class="[activeTab === 'favourites' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm']">
              Favourites ({{ favouriteDocs.length }})
            </button>
            <button @click="activeTab = 'documents'" :class="[activeTab === 'documents' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm']">
              Documents ({{ filteredDocs?.length || 0 }})
            </button>
            <button v-if="app.hasComments" @click="activeTab = 'comments'" :class="[activeTab === 'comments' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm']">
              Comments ({{ commentsList.length > 0 ? commentsList.length : (commentsError ? '!' : '...') }})
            </button>
            <button v-if="app.location" @click="activeTab = 'location'" :class="[activeTab === 'location' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm']">
              Location
            </button>
          </nav>
        </div>

        <div class="pt-6">
          <div v-show="activeTab === 'key-documents'" v-if="keyDocs.length > 0">
            <ul class="divide-y divide-gray-100">
              <DocumentRow v-for="doc in keyDocs" :key="doc.localFilename" :doc="doc" :reference="app.reference" :authority-id="app.authorityId" @changed="onDocChanged(doc, $event)" />
            </ul>
          </div>

          <div v-show="activeTab === 'favourites'">
            <div v-if="favouriteDocs.length > 0">
              <ul class="divide-y divide-gray-100">
                <DocumentRow v-for="doc in favouriteDocs" :key="doc.localFilename" :doc="doc" :reference="app.reference" :authority-id="app.authorityId" @changed="onDocChanged(doc, $event)" />
              </ul>
            </div>
            <div v-else class="text-sm text-gray-500 py-4 text-center">No favourite documents. Star a document to collect it here.</div>
          </div>

          <div v-show="activeTab === 'documents'">
            <div class="flex items-center justify-end mb-3 border-b pb-2" v-if="docTypesWithCounts.length > 1">
              <select v-model="selectedDocType" class="text-sm border-gray-300 rounded-md py-1 pl-2 pr-8 focus:ring-blue-500 focus:border-blue-500">
                <option v-for="t in docTypesWithCounts" :key="t.value" :value="t.value">{{ t.label }} ({{ t.count }})</option>
              </select>
            </div>
          
          <ul class="divide-y divide-gray-100">
            <DocumentRow v-for="doc in filteredDocs" :key="doc.localFilename" :doc="doc" :reference="app.reference" :authority-id="app.authorityId" @changed="onDocChanged(doc, $event)" />
          </ul>
          </div>

          <div v-show="activeTab === 'location'" v-if="app.location">
            <div class="rounded-md overflow-hidden border border-gray-200">
              <iframe
                :src="osmEmbedUrl"
                class="w-full"
                style="height: 480px"
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
                title="Application location map"
              ></iframe>
            </div>
            <p class="mt-3 text-xs text-gray-500">
              Approximate site location. Coordinates: {{ app.location.center.lat.toFixed(6) }}, {{ app.location.center.lon.toFixed(6) }}
              &middot; <a :href="osmLinkUrl" target="_blank" rel="noopener" class="text-blue-600 hover:underline">Open in OpenStreetMap</a>
            </p>
          </div>

          <div v-show="activeTab === 'comments'" v-if="app.hasComments">
            <div v-if="commentsList.length > 0">
              <div class="flex items-center justify-end mb-3 border-b pb-2" v-if="commentStancesWithCounts.length > 1">
                <select v-model="selectedStance" class="text-sm border-gray-300 rounded-md py-1 pl-2 pr-8 focus:ring-blue-500 focus:border-blue-500">
                  <option v-for="t in commentStancesWithCounts" :key="t.value" :value="t.value">{{ t.label }} ({{ t.count }})</option>
                </select>
              </div>
              <div v-if="filteredComments.length > 0" class="mt-2 space-y-4">
                <div v-for="(comment, idx) in filteredComments" :key="idx" class="bg-gray-50 rounded border text-sm overflow-hidden">
                <div class="flex flex-col p-3 cursor-pointer hover:bg-gray-50 transition-colors" @click="comment.expanded = !comment.expanded">
                  <div class="flex justify-between items-start mb-2">
                    <div class="font-medium text-gray-900 pr-4">{{ comment.address }}</div>
                    <div class="flex items-center gap-3 shrink-0">
                      <div class="text-xs text-gray-500 whitespace-nowrap">{{ comment.date }}</div>
                      <svg :class="['w-4 h-4 text-gray-400 transition-transform', comment.expanded ? 'rotate-180' : '']" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                  </div>
                  <div v-if="comment.stance">
                    <span :class="['inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset', getStanceClass(comment.stance)]">{{ comment.stance }}</span>
                  </div>
                </div>
                <div v-show="comment.expanded" class="p-3 pt-0 border-t border-gray-200">
                  <div class="text-gray-700 whitespace-pre-wrap mt-3">{{ comment.text }}</div>
                </div>
              </div>
              </div>
              <div v-else class="text-sm text-gray-500 py-4 text-center">No comments match the selected filter.</div>
            </div>
            <div v-else-if="commentsError" class="text-sm text-red-600">{{ commentsError }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { timeAgo } from '../utils'
import type { ApplicationMeta, Comment, EnhancedDocument } from '../../../src/types.js'
import * as api from '../api'
import DocumentRow from '../components/DocumentRow.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const app = ref<ApplicationMeta | null>(null)
const loading = ref(true)
const syncError = ref('')
const syncMessage = ref('')
const error = ref('')
const syncing = ref(false)
const selectedStance = ref('All')

const docPrefix = computed(() => api.docUrlPrefix(app.value?.authorityId))

const commentsList = ref<Comment[]>([])
const activeTab = ref('documents')
const commentsError = ref('')
const getStanceClass = (stance?: string) => {
  if (!stance) return 'bg-gray-100 text-gray-600 ring-gray-500/10'
  const lower = stance.toLowerCase()
  if (lower.includes('object')) return 'bg-red-50 text-red-700 ring-red-600/10'
  if (lower.includes('support')) return 'bg-green-50 text-green-700 ring-green-600/20'
  if (lower.includes('neutral')) return 'bg-yellow-50 text-yellow-800 ring-yellow-600/20'
  return 'bg-gray-100 text-gray-600 ring-gray-500/10'
}
const selectedDocType = ref('All')

const osmEmbedUrl = computed(() => {
  const loc = app.value?.location
  if (!loc) return ''
  const { center, bbox } = loc
  let minLon = bbox.minLon
  let minLat = bbox.minLat
  let maxLon = bbox.maxLon
  let maxLat = bbox.maxLat
  const padLon = (maxLon - minLon) * 0.5 || 0.002
  const padLat = (maxLat - minLat) * 0.5 || 0.001
  minLon -= padLon
  maxLon += padLon
  minLat -= padLat
  maxLat += padLat
  const bboxStr = `${minLon},${minLat},${maxLon},${maxLat}`
  const marker = `${center.lat},${center.lon}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bboxStr)}&layer=mapnik&marker=${encodeURIComponent(marker)}`
})

const osmLinkUrl = computed(() => {
  const loc = app.value?.location
  if (!loc) return ''
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(loc.center.lat)}&mlon=${encodeURIComponent(loc.center.lon)}#map=17/${encodeURIComponent(loc.center.lat)}/${encodeURIComponent(loc.center.lon)}`
})
const syncApp = async () => {
  if (!app.value) return
  syncing.value = true
  syncError.value = ''
  syncMessage.value = ''
  try {
    await api.downloadApplication(app.value.reference, app.value.authorityId)
    syncMessage.value = 'Sync queued. Check the Queue page for progress.'
  } catch (err: any) {
    syncError.value = err.message || 'Failed to sync'
  } finally {
    syncing.value = false
  }
}

const savingFlags = ref(false)

const toggleStar = async () => {
  if (!app.value) return
  savingFlags.value = true
  try {
    const flags = await api.setApplicationFlags(app.value.reference, { starred: !app.value.starred }, app.value.authorityId)
    app.value.starred = flags.starred
  } catch (e) {
    console.error(e)
  } finally {
    savingFlags.value = false
  }
}

const toggleArchive = async () => {
  if (!app.value) return
  if (!app.value.archived) {
    const ok = window.confirm(`Archive "${app.value.reference}"? It will be hidden from the main list.`)
    if (!ok) return
  }
  savingFlags.value = true
  try {
    const flags = await api.setApplicationFlags(app.value.reference, { archived: !app.value.archived }, app.value.authorityId)
    app.value.archived = flags.archived
  } catch (e) {
    console.error(e)
  } finally {
    savingFlags.value = false
  }
}

const enhancedAppDocuments = computed<EnhancedDocument[]>(() => {
  if (!app.value?.documents) return []
  const docs: EnhancedDocument[] = app.value.documents.map((d) => ({
    ...d,
    url: `/api/documents/${docPrefix.value}${encodeURIComponent(app.value!.reference.replace(/\//g, '-'))}/${encodeURIComponent(d.localFilename)}`,
    isSuperseded: d.documentType.toLowerCase().includes('superseded'),
    supersededBy: null,
    replaces: []
  }))

  // Find relationships based on matching descriptions
  docs.forEach((doc) => {
    if (doc.isSuperseded && doc.description) {
      // Find newer active document with same description
      const active = docs.find((d) => !d.isSuperseded && d.description?.toLowerCase() === doc.description.toLowerCase())
      if (active) {
        doc.supersededBy = active
        active.replaces.push(doc)
      }
    }
  })
  return docs
})

const isKeyDoc = (doc: EnhancedDocument) => {
  const text = `${doc.documentType || ''} ${doc.description || ''}`.toLowerCase()
  return [
    'design and access',
    'planning statement',
    'heritage statement',
    'decision notice',
    'officer report',
    'delegated report',
    'committee report',
    'appeal decision'
  ].some(keyword => text.includes(keyword))
}

const keyDocs = computed(() => {
  if (!enhancedAppDocuments.value.length) return []
  return enhancedAppDocuments.value.filter(isKeyDoc)
})

const favouriteDocs = computed(() => {
  if (!enhancedAppDocuments.value.length) return []
  return enhancedAppDocuments.value.filter((d) => d.starred)
})

const onDocChanged = (doc: EnhancedDocument, payload: { starred: boolean; note: string }) => {
  if (!app.value) return
  const raw = app.value.documents.find((d) => d.localFilename === doc.localFilename)
  if (raw) {
    raw.starred = payload.starred
    raw.note = payload.note
  }
}

const docTypesWithCounts = computed(() => {
  if (!enhancedAppDocuments.value.length) return []
  const counts: Record<string, number> = { 'All': enhancedAppDocuments.value.length }
  enhancedAppDocuments.value.forEach((d) => {
    const type = d.documentType
    if (type) counts[type] = (counts[type] || 0) + 1
  })
  const types = Array.from(new Set(enhancedAppDocuments.value.map((d) => d.documentType).filter(Boolean))).sort() as string[]
  
  return [
    { value: 'All', label: 'All', count: counts['All'] },
    ...types.map(t => ({ value: t, label: t, count: counts[t] }))
  ]
})

const commentStancesWithCounts = computed(() => {
  if (!commentsList.value.length) return []
  const counts: Record<string, number> = { 'All': commentsList.value.length }
  commentsList.value.forEach(c => {
    const stance = c.stance || 'None'
    counts[stance] = (counts[stance] || 0) + 1
  })
  
  const stances = Array.from(new Set(commentsList.value.map(c => c.stance || 'None'))).sort() as string[]
  return [
    { value: 'All', label: 'All', count: counts['All'] },
    ...stances.map(s => ({ value: s, label: s, count: counts[s] }))
  ]
})

const filteredComments = computed(() => {
  if (selectedStance.value === 'All') return commentsList.value
  return commentsList.value.filter(c => (c.stance || 'None') === selectedStance.value)
})

const filteredDocs = computed(() => {
  if (!enhancedAppDocuments.value.length) return []
  if (selectedDocType.value === 'All') return enhancedAppDocuments.value
  return enhancedAppDocuments.value.filter((d) => d.documentType === selectedDocType.value)
})

onMounted(async () => {
  const refParam = route.params.ref as string
  try {
    app.value = await api.fetchApplication(refParam)
    document.title = `PlanBrowser | ${app.value.reference}`
    
    if (app.value.hasComments) {
      try {
        const data = await api.fetchComments(app.value.reference, app.value.authorityId)
        commentsList.value = data.map((c: Comment) => ({ ...c, expanded: false }))
      } catch (err) {
        commentsError.value = 'Failed to load comments.'
      }
    }

    if (keyDocs.value.length > 0 && activeTab.value === 'documents') {
      activeTab.value = 'key-documents'
    }
  } catch (e: any) {
    console.error(e)
    error.value = e.message || 'Failed to load'
  } finally {
    loading.value = false
  }
})
</script>
