<template>
  <div class="bg-white p-4 rounded shadow border border-gray-200 min-w-0">
    <div class="flex flex-wrap justify-between items-start gap-x-4 gap-y-1 mb-1">
      <h3 class="font-bold text-lg flex items-center gap-2 min-w-0">
        <button v-if="!readonly" @click="toggleStar" :title="app.starred ? 'Remove from favourites' : 'Add to favourites'" class="cursor-pointer text-gray-400 hover:text-yellow-500 disabled:opacity-50 shrink-0">
          <svg v-if="app.starred" class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"></path></svg>
        </button>
        <router-link :to="`/app/${encodeURIComponent(app.reference)}`" class="text-blue-600 underline underline-offset-2 hover:text-blue-800 break-all min-w-0">{{ app.reference }}</router-link>
        <span v-if="app.archived" class="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-inset ring-gray-500/20 shrink-0">Archived</span>
      </h3>
      <div class="flex items-center gap-2 flex-wrap">
        <span v-if="app.authorityId && app.authorityId !== DEFAULT_AUTHORITY_ID" class="text-xs text-gray-400 whitespace-nowrap">{{ authorityName(app.authorityId) }}</span>
        <span v-if="app.furtherInformation?.['Application Type']" class="text-xs text-gray-500 whitespace-nowrap">{{ app.furtherInformation['Application Type'] }}</span>
      </div>
    </div>
    <p class="text-sm text-gray-600 mb-1 truncate">{{ app.address }}</p>
    <p class="text-sm text-gray-500 mb-1 truncate" :title="app.description">{{ app.description }}</p>
    <p class="text-xs text-gray-500 mb-2">Synced: {{ timeAgo(app.scrapedAt) }}</p>
    <div class="flex flex-wrap justify-between items-center gap-x-4 gap-y-2 mt-2">
      <span :class="['inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset', statusBadgeClass(app)]">{{ statusLabel(app) }}</span>
      <div class="flex items-center gap-1" v-if="!readonly">
        <button @click="toggleArchive" class="cursor-pointer text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50" :disabled="saving">
          {{ app.archived ? 'Restore' : 'Archive' }}
        </button>
        <button @click="syncApp" :disabled="isQueued || isSyncing || syncingLocal" :title="syncButtonTitle"
          :class="['shrink-0 cursor-pointer rounded-md p-1.5 -mr-1 hover:bg-gray-100 disabled:opacity-60 disabled:hover:bg-transparent', syncButtonColor]">
          <svg v-if="isFailed" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          <svg v-else-if="isQueued" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <svg v-else :class="{ 'animate-spin': isSyncing || syncingLocal }" class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
        </button>
      </div>
    </div>
    <div v-if="$slots.extra" class="mt-3 pt-3 border-t border-gray-100">
      <slot name="extra" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { timeAgo, statusLabel, statusBadgeClass } from '../utils'
import type { ApplicationMeta } from '../../../src/types.js'
import { DEFAULT_AUTHORITY_ID, authorityName } from '../../../src/authorities.js'
import { refreshQueue } from '../queueStore'
import * as api from '../api'

const props = defineProps<{ app: ApplicationMeta; queueStatus?: string; readonly?: boolean }>()

const emit = defineEmits<{ (e: 'changed'): void }>()

const saving = ref(false)
const syncingLocal = ref(false)

const isQueued = computed(() => props.queueStatus === 'pending')
const isSyncing = computed(() => props.queueStatus === 'in_progress')
const isFailed = computed(() => props.queueStatus === 'failed')

const syncButtonTitle = computed(() => {
  if (isQueued.value) return 'Queued for sync'
  if (isSyncing.value) return 'Syncing…'
  if (isFailed.value) return 'Sync failed — click to retry'
  return 'Sync this application'
})

const syncButtonColor = computed(() => {
  if (isFailed.value) return 'text-red-600 hover:text-red-700'
  if (isQueued.value) return 'text-blue-500'
  if (isSyncing.value) return 'text-blue-600'
  return 'text-gray-400 hover:text-blue-600'
})

const authorityId = () => props.app.authorityId

async function toggleStar() {
  saving.value = true
  try {
    await api.setApplicationFlags(props.app.reference, { starred: !props.app.starred }, authorityId())
    emit('changed')
  } catch (e) {
    console.error(e)
  } finally {
    saving.value = false
  }
}

async function toggleArchive() {
  if (!props.app.archived) {
    const ok = window.confirm(`Archive "${props.app.reference}"? It will be hidden from the main list.`)
    if (!ok) return
  }
  saving.value = true
  try {
    await api.setApplicationFlags(props.app.reference, { archived: !props.app.archived }, authorityId())
    emit('changed')
  } catch (e) {
    console.error(e)
  } finally {
    saving.value = false
  }
}

async function syncApp() {
  if (isQueued.value || isSyncing.value) return
  syncingLocal.value = true
  try {
    await api.downloadApplication(props.app.reference, props.app.authorityId)
    await refreshQueue()
  } catch (e) {
    console.error(e)
  } finally {
    syncingLocal.value = false
  }
}
</script>
