<template>
  <li class="py-3 flex justify-between gap-x-6">
    <div class="min-w-0 flex-auto">
      <p class="text-sm font-medium text-gray-900 truncate flex items-center gap-2" :title="doc.description">
        <span :class="{'line-through text-gray-500': doc.isSuperseded}">{{ doc.description || doc.documentType }}</span>
        <span v-if="doc.replaces && doc.replaces.length > 0" class="inline-flex items-center rounded-md bg-green-50 px-1.5 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-inset ring-green-600/20">Updated</span>
      </p>
      <p class="mt-1 flex text-xs text-gray-500">
        <span class="mr-2">{{ doc.datePublished }}</span>
        <span class="mr-2 font-medium" :class="{'text-red-600': doc.isSuperseded}">{{ doc.documentType }}</span>
        <span v-if="starred" class="inline-flex items-center text-yellow-500" title="Favourited">&#9733;</span>
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

      <div v-if="note || editing" class="mt-2">
        <div v-if="!editing" class="text-xs text-gray-600">
          <span class="font-medium text-gray-500">Note:</span>
          <span class="whitespace-pre-line">{{ note }}</span>
        </div>
        <div v-else>
          <textarea v-model="draft" rows="4" class="mt-1 block w-full rounded-md border-gray-300 text-sm px-3 py-2 border focus:border-blue-500 focus:ring-blue-500" placeholder="Add a note..."></textarea>
          <div class="mt-1 flex gap-2">
            <button @click="saveNote" :disabled="saving" class="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Save</button>
            <button @click="cancelEdit" class="text-xs text-gray-500 px-2 py-1 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      </div>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <button @click="toggleStar" :disabled="saving" :title="starred ? 'Remove from favourites' : 'Add to favourites'" class="cursor-pointer text-gray-400 hover:text-yellow-500 disabled:opacity-50">
        <svg v-if="starred" class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"></path></svg>
      </button>
      <button @click="startEdit" :disabled="saving" :title="note ? 'Edit note' : 'Add note'" class="cursor-pointer text-gray-400 hover:text-gray-700 disabled:opacity-50">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
      </button>
      <a :href="doc.url" target="_blank" class="text-sm text-blue-600 hover:underline shrink-0">Open ({{ ext }})</a>
    </div>
  </li>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { EnhancedDocument } from '../../../src/types.js'
import * as api from '../api'

const props = defineProps<{
  doc: EnhancedDocument
  reference: string
  authorityId?: string
}>()

const emit = defineEmits<{ (e: 'changed', payload: { starred: boolean; note: string }): void }>()

const starred = ref(!!props.doc.starred)
const note = ref(props.doc.note || '')
const draft = ref('')
const editing = ref(false)
const saving = ref(false)

const ext = computed(() => props.doc.localFilename.split('.').pop()?.toUpperCase() || 'FILE')

async function toggleStar() {
  saving.value = true
  try {
    const flags = await api.setDocumentFlags(props.reference, props.doc.localFilename, { starred: !starred.value }, props.authorityId)
    starred.value = flags.starred
    emit('changed', { starred: flags.starred, note: note.value })
  } catch (e) {
    console.error(e)
  } finally {
    saving.value = false
  }
}

function startEdit() {
  draft.value = note.value
  editing.value = true
}

function cancelEdit() {
  editing.value = false
}

async function saveNote() {
  saving.value = true
  try {
    const flags = await api.setDocumentFlags(props.reference, props.doc.localFilename, { note: draft.value }, props.authorityId)
    note.value = flags.note
    editing.value = false
    emit('changed', { starred: starred.value, note: flags.note })
  } catch (e) {
    console.error(e)
  } finally {
    saving.value = false
  }
}
</script>
