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
      <div class="mb-6">
        <h2 class="text-2xl font-bold mb-2">{{ app.reference }}</h2>
        <p class="text-lg text-gray-700 mb-2">{{ app.address }}</p>
        <p class="text-gray-600">{{ app.description }}</p>
        <div class="mt-4">
          <span class="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">{{ app.status }}</span>
        </div>
      </div>

      <div class="grid md:grid-cols-2 gap-8">
        <div>
          <h3 class="text-lg font-semibold mb-3 border-b pb-2">Key Dates</h3>
          <dl class="divide-y divide-gray-100">
            <div v-for="(value, key) in app.dates" :key="key" class="px-2 py-3 sm:grid sm:grid-cols-3 sm:gap-4">
              <dt class="text-sm font-medium text-gray-900">{{ key }}</dt>
              <dd class="text-sm text-gray-700 sm:col-span-2">{{ value }}</dd>
            </div>
          </dl>
        </div>

        <div>
          <div class="flex items-center justify-between mb-3 border-b pb-2">
            <h3 class="text-lg font-semibold">Documents ({{ filteredDocs?.length || 0 }})</h3>
            <select v-if="docTypes.length > 1" v-model="selectedDocType" class="text-sm border-gray-300 rounded-md py-1 pl-2 pr-8 focus:ring-blue-500 focus:border-blue-500">
              <option v-for="t in (docTypes as string[])" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          
          <ul class="divide-y divide-gray-100 max-h-96 overflow-y-auto pr-2">
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

          <div v-if="app.hasComments" class="mt-6 pt-4 border-t">
            <h3 class="text-lg font-semibold mb-3 border-b pb-2">Comments</h3>
            <div v-if="commentsList.length > 0" class="mt-2 max-h-96 overflow-y-auto space-y-4 pr-2">
              <div v-for="(comment, idx) in commentsList" :key="idx" class="bg-gray-50 p-3 rounded border text-sm">
                <div class="flex justify-between items-start mb-2">
                  <div class="font-medium text-gray-900">{{ comment.address }}</div>
                  <div class="text-xs text-gray-500 whitespace-nowrap ml-2">{{ comment.date }}</div>
                </div>
                <div v-if="comment.stance" class="mb-2">
                  <span class="inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{{ comment.stance }}</span>
                </div>
                <div class="text-gray-700 whitespace-pre-wrap">{{ comment.text }}</div>
              </div>
            </div>
            <div v-else-if="commentsError" class="text-sm text-red-600">{{ commentsError }}</div>
            <div v-else class="text-sm text-gray-500">Loading comments...</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const app = ref<any>(null)
const loading = ref(true)
const error = ref('')

const commentsList = ref<any[]>([])
const commentsError = ref('')
const selectedDocType = ref('All')
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
            commentsList.value = await commentRes.json()
          }
        }
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

const enhancedAppDocuments = computed(() => {
  if (!app.value?.documents) return []
  const docs = app.value.documents.map((d: any) => ({
    ...d,
    url: `/api/documents/${encodeURIComponent(app.value.reference.replace(/\//g, '-'))}/${encodeURIComponent(d.localFilename)}`,
    isSuperseded: d.documentType.toLowerCase().includes('superseded'),
    supersededBy: null,
    replaces: []
  }))

  // Find relationships based on matching descriptions
  docs.forEach((doc: any) => {
    if (doc.isSuperseded && doc.description) {
      // Find newer active document with same description
      const active = docs.find((d: any) => !d.isSuperseded && d.description?.toLowerCase() === doc.description.toLowerCase())
      if (active) {
        doc.supersededBy = active
        active.replaces.push(doc)
      }
    }
  })
  return docs
})

const docTypes = computed(() => {
  if (!enhancedAppDocuments.value.length) return ['All']
  const types = new Set(enhancedAppDocuments.value.map((d: any) => d.documentType).filter(Boolean))
  return ['All', ...Array.from(types)] as string[]
})

const filteredDocs = computed(() => {
  if (!enhancedAppDocuments.value.length) return []
  if (selectedDocType.value === 'All') return enhancedAppDocuments.value
  return enhancedAppDocuments.value.filter((d: any) => d.documentType === selectedDocType.value)
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
          commentsList.value = await commentRes.json()
        } else {
          commentsError.value = 'Failed to load comments.'
        }
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
