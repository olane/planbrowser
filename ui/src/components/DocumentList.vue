<template>
  <ul :class="$style.list">
    <li v-if="hasGroups" :class="$style.expandRow">
      <button type="button" :class="$style.expandButton" @click="toggleAll">
        {{ allOpen ? 'Collapse all' : 'Expand all' }}
      </button>
    </li>
    <template v-for="entry in entries" :key="entryKey(entry)">
      <li v-if="entry.kind === 'group'">
        <div :class="$style.groupHeader">
          <div
            role="button"
            tabindex="0"
            :class="$style.groupToggle"
            :aria-expanded="isOpen(entry.title)"
            @click="toggle(entry.title)"
            @keydown.enter.prevent="toggle(entry.title)"
            @keydown.space.prevent="toggle(entry.title)"
          >
            <p :class="$style.groupTitle">
              <span :class="$style.groupTitleText">{{ entry.title }}</span>
              <span :class="[ui.toneGray, $style.countPill]">{{ groupCountLabel(entry) }}</span>
            </p>
            <p v-if="groupDate(entry) || groupType(entry)" :class="$style.groupMeta">
              <span :class="$style.groupMetaItem">{{ groupDate(entry) }}</span>
              <span :class="[$style.groupMetaItem, $style.groupMetaStrong]">{{ groupType(entry) }}</span>
            </p>
          </div>
          <div :class="$style.groupActions">
            <button
              type="button"
              @click="toggleGroupStar(entry)"
              :disabled="savingGroup"
              :title="groupAllStarred(entry) ? 'Remove all parts from favourites' : (groupSomeStarred(entry) ? 'Favourite remaining parts' : 'Favourite all parts')"
              :class="$style.starButton"
            >
              <svg v-if="groupAllStarred(entry)" :class="[$style.icon, $style.starAll]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
              <svg v-else-if="groupSomeStarred(entry)" :class="[$style.icon, $style.starSome]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
              <svg v-else :class="$style.icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"></path></svg>
            </button>
            <button
              type="button"
              :class="$style.chevronButton"
              :aria-expanded="isOpen(entry.title)"
              :aria-label="isOpen(entry.title) ? 'Collapse group' : 'Expand group'"
              @click="toggle(entry.title)"
            >
              <svg :class="[$style.chevronIcon, isOpen(entry.title) ? '' : $style.chevronCollapsed]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
              </svg>
            </button>
          </div>
        </div>
        <ul v-if="isOpen(entry.title)" :class="$style.parts">
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
import ui from '../styles/primitives.module.css'

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

<style module>
.list > li + li,
.parts > li + li {
  border-top: 1px solid var(--color-gray-100);
}

.expandRow {
  display: flex;
  justify-content: flex-end;
  padding: 0.375rem 0;
}

.expandButton {
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
  color: var(--color-gray-500);
  cursor: pointer;
  background: none;
  border: none;
}

.expandButton:hover {
  color: var(--color-gray-700);
}

.groupHeader {
  display: flex;
  justify-content: space-between;
  column-gap: 1.5rem;
  padding: 0.75rem 0;
}

.groupToggle {
  min-width: 0;
  flex: 1 1 auto;
  cursor: pointer;
  user-select: none;
}

.groupTitle {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  color: var(--color-gray-900);
}

.groupTitleText {
  min-width: 0;
}

.countPill {
  flex-shrink: 0;
  margin-top: 0.125rem;
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-md);
  font-size: 10px;
  font-weight: 500;
}

.groupMeta {
  display: flex;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.groupMetaItem {
  margin-right: 0.5rem;
}

.groupMetaStrong {
  font-weight: 500;
}

.groupActions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.starButton {
  cursor: pointer;
  color: var(--color-gray-400);
  background: none;
  border: none;
  padding: 0;
}

.starButton:hover {
  color: var(--color-yellow-500);
}

.starButton:disabled {
  opacity: 0.5;
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}

.starAll {
  color: var(--color-yellow-400);
}

.starSome {
  color: var(--color-yellow-200);
}

.chevronButton {
  cursor: pointer;
  color: var(--color-gray-400);
  background: none;
  border: none;
  padding: 0;
}

.chevronButton:hover {
  color: var(--color-gray-700);
}

.chevronIcon {
  width: 1rem;
  height: 1rem;
  transition: transform 150ms;
}

.chevronCollapsed {
  transform: rotate(-90deg);
}

.parts {
  margin-left: 0.75rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--color-gray-200);
}
</style>
