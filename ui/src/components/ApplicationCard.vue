<template>
  <div class="bg-white p-4 rounded shadow border border-gray-200">
    <div class="flex justify-between items-start mb-1">
      <h3 class="font-bold text-lg flex items-center gap-2">
        <button @click="toggleStar" :title="app.starred ? 'Remove from favourites' : 'Add to favourites'" class="cursor-pointer text-gray-400 hover:text-yellow-500 disabled:opacity-50" :disabled="saving">
          <svg v-if="app.starred" class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"></path></svg>
        </button>
        <router-link :to="`/app/${encodeURIComponent(app.reference)}`" class="hover:underline">{{ app.reference }}</router-link>
        <span v-if="app.archived" class="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-inset ring-gray-500/20">Archived</span>
      </h3>
      <div class="flex items-center gap-2">
        <span v-if="app.authorityId && app.authorityId !== DEFAULT_AUTHORITY_ID" class="text-xs text-gray-400 whitespace-nowrap">{{ authorityName(app.authorityId) }}</span>
        <span v-if="app.furtherInformation?.['Application Type']" class="text-xs text-gray-500 whitespace-nowrap">{{ app.furtherInformation['Application Type'] }}</span>
      </div>
    </div>
    <p class="text-sm text-gray-600 mb-2 truncate">{{ app.address }}</p>
    <p v-if="queueStatus === 'pending' || queueStatus === 'in_progress'" class="text-xs text-blue-600 mb-2">
      {{ queueStatus === 'pending' ? 'Queued for sync' : 'Syncing...' }}
    </p>
    <p v-else class="text-xs text-gray-500 mb-2">Synced: {{ timeAgo(app.scrapedAt) }}</p>
    <div class="flex justify-between items-center mt-2">
      <span :class="['inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset', statusBadgeClass(app)]">{{ statusLabel(app) }}</span>
      <div class="flex items-center gap-3">
        <button @click="toggleArchive" class="cursor-pointer text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50" :disabled="saving">
          {{ app.archived ? 'Restore' : 'Archive' }}
        </button>
        <router-link :to="`/app/${encodeURIComponent(app.reference)}`" class="text-sm text-blue-600 hover:underline">View details</router-link>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { timeAgo, statusLabel, statusBadgeClass } from '../utils'
import type { ApplicationMeta } from '../../../src/types.js'
import { DEFAULT_AUTHORITY_ID, authorityName } from '../../../src/authorities.js'
import * as api from '../api'

const props = defineProps<{ app: ApplicationMeta; queueStatus?: string }>()

const emit = defineEmits<{ (e: 'changed'): void }>()

const saving = ref(false)

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
</script>
