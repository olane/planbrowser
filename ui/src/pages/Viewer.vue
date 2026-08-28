<template>
  <div>
    <div class="mb-4">
      <router-link to="/" class="text-sm text-blue-600 hover:underline">&larr; Back to all applications</router-link>
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
          <h3 class="text-lg font-semibold mb-3 border-b pb-2">Documents ({{ app.documents?.length || 0 }})</h3>
          <ul class="divide-y divide-gray-100 max-h-96 overflow-y-auto pr-2">
            <li v-for="doc in app.documents" :key="doc.localFilename" class="py-3 flex justify-between gap-x-6">
              <div class="min-w-0 flex-auto">
                <p class="text-sm font-medium text-gray-900 truncate" :title="doc.description">{{ doc.description || doc.documentType }}</p>
                <p class="mt-1 flex text-xs text-gray-500">
                  <span class="mr-2">{{ doc.datePublished }}</span>
                  <span>{{ doc.documentType }}</span>
                </p>
              </div>
              <div class="flex items-center">
                <a :href="`/api/documents/${encodeURIComponent(app.reference.replace(/\//g, '-'))}/${encodeURIComponent(doc.localFilename)}`" target="_blank" class="text-sm text-blue-600 hover:underline shrink-0">View PDF</a>
              </div>
            </li>
          </ul>

          <div v-if="app.hasComments" class="mt-6 pt-4 border-t">
            <h3 class="text-lg font-semibold mb-3">Comments</h3>
            <a :href="`/api/documents/${encodeURIComponent(app.reference.replace(/\//g, '-'))}/comments.txt`" target="_blank" class="inline-flex items-center rounded-md bg-gray-50 px-2 py-1 text-sm font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10 hover:bg-gray-100">
              View comments.txt
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const app = ref<any>(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  const refParam = route.params.ref as string
  try {
    const res = await fetch(`/api/applications/${encodeURIComponent(refParam)}`)
    if (res.ok) {
      app.value = await res.json()
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
