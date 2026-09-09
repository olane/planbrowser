<template>
  <ul class="divide-y divide-gray-100">
    <li v-if="hasGroups" class="py-1.5 flex justify-end">
      <button type="button" class="text-xs font-medium text-gray-500 hover:text-gray-700" @click="toggleAll">
        {{ allOpen ? 'Collapse all' : 'Expand all' }}
      </button>
    </li>
    <template v-for="entry in entries" :key="entryKey(entry)">
      <li v-if="entry.kind === 'group'">
        <div class="flex justify-between gap-x-6 py-3">
          <div
            role="button"
            tabindex="0"
            class="min-w-0 flex-auto cursor-pointer select-none"
            :aria-expanded="isOpen(entry.title)"
            @click="toggle(entry.title)"
            @keydown.enter.prevent="toggle(entry.title)"
            @keydown.space.prevent="toggle(entry.title)"
          >
            <p class="text-sm font-medium text-gray-900 flex items-start gap-2">
              <span class="min-w-0">{{ entry.title }}</span>
              <span class="mt-0.5 inline-flex items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10 shrink-0">{{ groupCountLabel(entry) }}</span>
            </p>
            <p v-if="groupDate(entry) || groupType(entry)" class="mt-1 flex text-xs text-gray-500">
              <span class="mr-2">{{ groupDate(entry) }}</span>
              <span class="mr-2 font-medium">{{ groupType(entry) }}</span>
            </p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              @click="toggleGroupStar(entry)"
              :disabled="savingGroup"
              :title="groupAllStarred(entry) ? 'Remove all parts from favourites' : (groupSomeStarred(entry) ? 'Favourite remaining parts' : 'Favourite all parts')"
              class="cursor-pointer text-gray-400 hover:text-yellow-500 disabled:opacity-50"
            >
              <svg v-if="groupAllStarred(entry)" class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
              <svg v-else-if="groupSomeStarred(entry)" class="w-5 h-5 text-yellow-200" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"></path></svg>
            </button>
            <button
              type="button"
              class="cursor-pointer text-gray-400 hover:text-gray-700"
              :aria-expanded="isOpen(entry.title)"
              :aria-label="isOpen(entry.title) ? 'Collapse group' : 'Expand group'"
              @click="toggle(entry.title)"
            >
              <svg :class="['w-4 h-4 transition-transform', isOpen(entry.title) ? '' : '-rotate-90']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
          </div>
        </div>
        <ul v-if="isOpen(entry.title)" class="divide-y divide-gray-100 border-l border-gray-200 ml-3 pl-3">
          <DocumentRow
            v-for="part in entry.parts"
            :key="part.localFilename"
            :doc="part"
            :reference="reference"
            :authority-id="authorityId"
            :label="partLabel(part.description) || undefined"
            :snippet="snippetFor(part.localFilename)"
            @changed="forwardChanged(part, $event)"
          />
        </ul>
      </li>
      <DocumentRow
        v-else
        :doc="entry.doc"
        :reference="reference"
        :authority-id="authorityId"
        :snippet="snippetFor(entry.doc.localFilename)"
        @changed="forwardChanged(entry.doc, $event)"
      />
    </template>
  </ul>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { EnhancedDocument, DocumentSnippet } from '../../../src/types.js'
import { groupDocuments, multipartUnit, partLabel, type DocumentListEntry } from '../utils'
import DocumentRow from './DocumentRow.vue'
import * as api from '../api'

const props = defineProps<{
  docs: EnhancedDocument[]
  reference: string
  authorityId?: string
  // Force every group open. Used when the surrounding list is filtered/searched,
  // so matching parts are visible rather than hidden behind collapsed headers.
  expandAll?: boolean
  // Matched content context per localFilename, shown on matching rows.
  snippets?: Record<string, DocumentSnippet>
}>()

const emit = defineEmits<{
  (e: 'changed', doc: EnhancedDocument, payload: { starred: boolean; note: string }): void
}>()

const entries = computed<DocumentListEntry<EnhancedDocument>[]>(() => groupDocuments(props.docs))

const snippetFor = (filename: string): DocumentSnippet | undefined => props.snippets?.[filename]

const openTitles = reactive(new Set<string>())
const isOpen = (title: string) => openTitles.has(title)
const toggle = (title: string) => {
  if (openTitles.has(title)) openTitles.delete(title)
  else openTitles.add(title)
}

// Keep filtered lists fully visible, including groups that stream in later.
watch([() => props.expandAll, entries], ([yes]) => {
  if (yes) {
    entries.value.forEach((e) => {
      if (e.kind === 'group') openTitles.add(e.title)
    })
  }
}, { immediate: true })

const hasGroups = computed(() => entries.value.some((e) => e.kind === 'group'))
const allOpen = computed(() => entries.value.filter((e) => e.kind === 'group').every((e) => e.kind === 'group' && isOpen(e.title)))
const toggleAll = () => {
  const groups = entries.value.filter((e) => e.kind === 'group') as { kind: 'group'; title: string; parts: EnhancedDocument[] }[]
  if (allOpen.value) {
    groups.forEach((g) => openTitles.delete(g.title))
  } else {
    groups.forEach((g) => openTitles.add(g.title))
  }
}

const entryKey = (entry: DocumentListEntry<EnhancedDocument>) =>
  entry.kind === 'group' ? `group:${entry.title}` : entry.doc.localFilename

// The collapsed group header is styled like a normal document entry, so mirror
// the date/category of its first part (parts are ordered numerically).
const groupDate = (entry: DocumentListEntry<EnhancedDocument>): string | undefined =>
  entry.kind === 'group' ? entry.parts[0]?.datePublished : undefined

const groupType = (entry: DocumentListEntry<EnhancedDocument>): string | undefined =>
  entry.kind === 'group' ? entry.parts[0]?.documentType : undefined

// Header pill, e.g. "17 parts" or "2 sheets", matching whatever the group is.
const groupCountLabel = (entry: DocumentListEntry<EnhancedDocument>): string => {
  if (entry.kind !== 'group') return ''
  const unit = multipartUnit(entry.parts[0]?.description)
  const n = entry.parts.length
  return `${n} ${unit}${n === 1 ? '' : 's'}`
}

// Favouriting a group applies to every part it contains. The header star shows
// all / some / none favourited and toggles the whole group in one click.
const groupStarredCount = (entry: DocumentListEntry<EnhancedDocument>): number =>
  entry.kind === 'group' ? entry.parts.filter((p) => p.starred).length : 0

const groupAllStarred = (entry: DocumentListEntry<EnhancedDocument>): boolean =>
  entry.kind === 'group' && entry.parts.length > 0 && groupStarredCount(entry) === entry.parts.length

const groupSomeStarred = (entry: DocumentListEntry<EnhancedDocument>): boolean =>
  entry.kind === 'group' && !groupAllStarred(entry) && groupStarredCount(entry) > 0

const savingGroup = ref(false)

async function toggleGroupStar(entry: DocumentListEntry<EnhancedDocument>) {
  if (entry.kind !== 'group' || savingGroup.value) return
  const next = groupAllStarred(entry) ? false : true
  savingGroup.value = true
  try {
    await Promise.all(entry.parts.map(async (part) => {
      try {
        const flags = await api.setDocumentFlags(props.reference, part.localFilename, { starred: next }, props.authorityId)
        forwardChanged(part, { starred: flags.starred, note: part.note || '' })
      } catch (e) {
        console.error(e)
      }
    }))
  } finally {
    savingGroup.value = false
  }
}

const forwardChanged = (doc: EnhancedDocument, payload: { starred: boolean; note: string }) =>
  emit('changed', doc, payload)
</script>
