<template>
  <div class="space-y-8">
    <section>
      <h2 class="text-xl font-semibold mb-4">Archived Applications</h2>
      <div v-if="loading" class="text-gray-500">Loading...</div>
      <div v-else-if="archivedApps.length === 0" class="text-gray-500">No archived applications.</div>
      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ApplicationCard v-for="app in archivedApps" :key="app.reference" :app="app" @changed="fetchApps" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { ApplicationMeta } from '../../../src/types.js'
import * as api from '../api'
import ApplicationCard from '../components/ApplicationCard.vue'

const apps = ref<ApplicationMeta[]>([])
const loading = ref(true)

const archivedApps = computed(() => apps.value.filter((a) => a.archived))

const fetchApps = async () => {
  try {
    apps.value = await api.fetchApplications()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  document.title = 'PlanBrowser | Archived'
  fetchApps()
})
</script>
