<template>
  <div>
    <div class="mb-4 flex items-center justify-between">
      <router-link to="/" class="text-sm text-blue-600 hover:underline">&larr; Back to all applications</router-link>
      <button v-if="app" @click="syncApp" :disabled="syncing" class="text-sm bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md shadow-sm disabled:opacity-50">
        {{ syncing ? 'Syncing...' : 'Sync / Update' }}
      </button>
    </div>

    <div v-if="loading" class="text-gray-500">Loading...</div>
    <div v-else-if="error" class="text-red-600">{{ error }}</div>
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

      <div class="mt-8">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8" aria-label="Tabs">
            <button v-if="keyDocs.length > 0" @click="activeTab = 'key-documents'" :class="[activeTab === 'key-documents' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm']">
              Key Documents ({{ keyDocs.length }})
            </button>
            <button @click="activeTab = 'documents'" :class="[activeTab === 'documents' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm']">
              Documents ({{ filteredDocs?.length || 0 }})
            </button>
            <button v-if="app.hasComments" @click="activeTab = 'comments'" :class="[activeTab === 'comments' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300', 'whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm']">
              Comments ({{ commentsList.length > 0 ? commentsList.length : (commentsError ? '!' : '...') }})
            </button>
          </nav>
        </div>

        <div class="pt-6">
          <div v-show="activeTab === 'key-documents'" v-if="keyDocs.length > 0">
            <ul class="divide-y divide-gray-100">
              <li v-for="doc in keyDocs" :key="doc.localFilename" class="py-3 flex justify-between gap-x-6">
                <div class="min-w-0 flex-auto">
                  <p class="text-sm font-medium text-gray-900 truncate flex items-center gap-2" :title="doc.description">
                    <span :class="{'line-through text-gray-500': doc.isSuperseded}">{{ doc.description || doc.documentType }}</span>
                    <span v-if="doc.replaces && doc.replaces.length > 0" class="inline-flex items-center rounded-md bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-inset ring-green-600/20">Updated</span>
                  </p>
                  <p class="mt-1 flex text-xs text-gray-500">
                    <span class="mr-2">{{ doc.datePublished }}</span>
                    <span class="mr-2 font-medium" :class="{'text-red-600': doc.isSuperseded}">{{ doc.documentType }}</span>
                  </p>
                  <p v-if="doc.supersededBy" class="mt-1 text-xs text-blue-600">
                    Superseded by: <a :href="doc.supersededBy.url" target="_blank" class="hover:underline">{{ doc.supersededBy.datePublished }} version</a>
                  </p>
                  <div v-if="doc.replaces && doc.replaces.length > 0" class="mt-1 text-xs text-gray-500">
                    Replaces: 
                    <span v-for="(old, idx) in doc.replaces" :key="old.localFilename">
                      <a :href="old.url" target="_blank" class="hover:underline text-gray-400">{{ old.datePublished }} version</a><span v-if="Number(idx) < doc.replaces.length - 1">, </span>
                    </span>
                  </div>
                </div>
                <div class="flex items-center">
                  <a :href="`/api/documents/${encodeURIComponent(app.reference.replace(/\//g, '-'))}/${encodeURIComponent(doc.localFilename)}`" target="_blank" class="text-sm text-blue-600 hover:underline shrink-0">Open ({{ doc.localFilename.split('.').pop()?.toUpperCase() }})</a>
                </div>
              </li>
            </ul>
          </div>

          <div v-show="activeTab === 'documents'">
            <div class="flex items-center justify-end mb-3 border-b pb-2" v-if="docTypesWithCounts.length > 1">
              <select v-model="selectedDocType" class="text-sm border-gray-300 rounded-md py-1 pl-2 pr-8 focus:ring-blue-500 focus:border-blue-500">
                <option v-for="t in docTypesWithCounts" :key="t.value" :value="t.value">{{ t.label }} ({{ t.count }})</option>
              </select>
            </div>
          
          <ul class="divide-y divide-gray-100">
            <li v-for="doc in filteredDocs" :key="doc.localFilename" class="py-3 flex justify-between gap-x-6">
              <div class="min-w-0 flex-auto">
                <p class="text-sm font-medium text-gray-900 truncate flex items-center gap-2" :title="doc.description">
                  <span :class="{'line-through text-gray-500': doc.isSuperseded}">{{ doc.description || doc.documentType }}</span>
                  <span v-if="doc.replaces && doc.replaces.length > 0" class="inline-flex items-center rounded-md bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-inset ring-green-600/20">Updated</span>
                </p>
                <p class="mt-1 flex text-xs text-gray-500">
                  <span class="mr-2">{{ doc.datePublished }}</span>
                  <span class="mr-2 font-medium" :class="{'text-red-600': doc.isSuperseded}">{{ doc.documentType }}</span>
                </p>
                <p v-if="doc.supersededBy" class="mt-1 text-xs text-blue-600">
                  Superseded by: <a :href="doc.supersededBy.url" target="_blank" class="hover:underline">{{ doc.supersededBy.datePublished }} version</a>
                </p>
                <div v-if="doc.replaces && doc.replaces.length > 0" class="mt-1 text-xs text-gray-500">
                  Replaces: 
                  <span v-for="(old, idx) in doc.replaces" :key="old.localFilename">
                    <a :href="old.url" target="_blank" class="hover:underline text-gray-400">{{ old.datePublished }} version</a><span v-if="Number(idx) < doc.replaces.length - 1">, </span>
                  </span>
                </div>
              </div>
              <div class="flex items-center">
                <a :href="`/api/documents/${encodeURIComponent(app.reference.replace(/\//g, '-'))}/${encodeURIComponent(doc.localFilename)}`" target="_blank" class="text-sm text-blue-600 hover:underline shrink-0">Open ({{ doc.localFilename.split('.').pop()?.toUpperCase() }})</a>
              </div>
            </li>
          </ul>
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
import type { ApplicationMeta, Comment, EnhancedDocument } from '../../src/types.js'
import { useRoute } from 'vue-router'

const route = useRoute()
const app = ref<ApplicationMeta | null>(null)
const loading = ref(true)
const error = ref('')

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
const selectedStance = ref('All')
const syncing = ref(false)

const syncApp = async () => {
  if (!app.value) return
  syncing.value = true
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: app.value.reference })
    })
    if (res.ok) {
      // Reload the page data
      const refParam = route.params.ref as string
      const fetchRes = await fetch(`/api/applications/${encodeURIComponent(refParam)}`)
      if (fetchRes.ok) {
        app.value = await fetchRes.json()
        if (app.value.hasComments) {
          const safeRef = encodeURIComponent(app.value.reference.replace(/\//g, '-'))
          const commentRes = await fetch(`/api/documents/${safeRef}/comments.json`)
          if (commentRes.ok) {
            const data = await commentRes.json()
            commentsList.value = data.map((c: Comment) => ({ ...c, expanded: false }))
          }
        }
      }
      if (keyDocs.value.length > 0 && activeTab.value === 'documents') {
        activeTab.value = 'key-documents'
      }
    } else {
      const err = await res.json()
      alert(`Sync failed: ${err.error}`)
    }
  } catch (e) {
    console.error(e)
    alert('Sync failed due to network error')
  } finally {
    syncing.value = false
  }
}

const enhancedAppDocuments = computed<EnhancedDocument[]>(() => {
  if (!app.value?.documents) return []
  const docs: EnhancedDocument[] = app.value.documents.map((d) => ({
    ...d,
    url: `/api/documents/${encodeURIComponent(app.value!.reference.replace(/\//g, '-'))}/${encodeURIComponent(d.localFilename)}`,
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
    const res = await fetch(`/api/applications/${encodeURIComponent(refParam)}`)
    if (res.ok) {
      app.value = await res.json()
      document.title = `PlanBrowser | ${app.value.reference}`
      
      if (app.value.hasComments) {
        const safeRef = encodeURIComponent(app.value.reference.replace(/\//g, '-'))
        const commentRes = await fetch(`/api/documents/${safeRef}/comments.json`)
        if (commentRes.ok) {
          const data = await commentRes.json()
          commentsList.value = data.map((c: Comment) => ({ ...c, expanded: false }))
        } else {
          commentsError.value = 'Failed to load comments.'
        }
      }

      if (keyDocs.value.length > 0 && activeTab.value === 'documents') {
        activeTab.value = 'key-documents'
      }
    } else {
      const data = await res.json()
      error.value = data.error || 'Failed to load'
    }
  } catch (e) {
    console.error(e)
    error.value = 'Failed to load'
  } finally {
    loading.value = false
  }
})
</script>
