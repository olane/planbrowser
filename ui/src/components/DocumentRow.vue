<template>
  <li :class="$style.row">
    <div :class="$style.main">
      <p :class="$style.titleLine">
        <span :class="[$style.titleText, doc.isSuperseded && $style.superseded]">{{ label || doc.description || doc.documentType }}</span>
        <span v-if="doc.replaces && doc.replaces.length > 0" :class="$style.updatedBadge">Updated</span>
      </p>
      <p :class="$style.metaLine">
        <span :class="$style.metaItem">{{ doc.datePublished }}</span>
        <span :class="[$style.metaItem, $style.docType, doc.isSuperseded && $style.docTypeSuperseded]">{{ doc.documentType }}</span>
        <span v-if="starred" :class="$style.star" title="Favourited">&#9733;</span>
      </p>
      <p v-if="doc.supersededBy" :class="$style.supersededBy">
        Superseded by: <a :href="doc.supersededBy.url" target="_blank" :class="$style.link">{{ doc.supersededBy.datePublished }} version</a>
      </p>
      <p v-if="snippet" :class="$style.snippet">
        …{{ snippet.before }}<mark :class="$style.mark">{{ snippet.match }}</mark>{{ snippet.after }}…
      </p>
      <div v-if="doc.replaces && doc.replaces.length > 0" :class="$style.replaces">
        Replaces:
        <span v-for="(old, idx) in doc.replaces" :key="old.localFilename">
          <a :href="old.url" target="_blank" :class="$style.oldLink">{{ old.datePublished }} version</a><span v-if="Number(idx) < doc.replaces.length - 1">, </span>
        </span>
      </div>

      <div v-if="note || editing" :class="$style.noteWrap">
        <div v-if="!editing" :class="$style.noteView">
          <span :class="$style.noteLabel">Note:</span>
          <span :class="$style.noteText">{{ note }}</span>
        </div>
        <div v-else>
          <textarea v-model="draft" rows="4" :class="$style.textarea" placeholder="Add a note..."></textarea>
          <div :class="$style.noteActions">
            <button @click="saveNote" :disabled="saving" :class="$style.saveButton">Save</button>
            <button @click="cancelEdit" :class="$style.cancelButton">Cancel</button>
          </div>
        </div>
      </div>
    </div>
    <div :class="$style.actions">
      <button @click="toggleStar" :disabled="saving" :title="starred ? 'Remove from favourites' : 'Add to favourites'" :class="[$style.iconButton, $style.starButton]">
        <svg v-if="starred" :class="[$style.icon, $style.starActive]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
        <svg v-else :class="$style.icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"></path></svg>
      </button>
      <button @click="startEdit" :disabled="saving" :title="note ? 'Edit note' : 'Add note'" :class="[$style.iconButton, $style.noteButton]">
        <svg :class="$style.icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"></path></svg>
      </button>
      <a :href="doc.url" target="_blank" :class="$style.openLink">Open ({{ ext }})</a>
    </div>
  </li>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { EnhancedDocument, DocumentSnippet } from '../../../src/types.js'
import * as api from '../api'

const props = defineProps<{
  doc: EnhancedDocument
  reference: string
  authorityId?: string
  // Short override for the main title, e.g. "PART 2" when rendered inside a
  // multi-part group whose header already shows the full parent title.
  label?: string
  // Matched content context, shown when the document matched a content search.
  snippet?: DocumentSnippet
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

<style module>
.row {
  display: flex;
  justify-content: space-between;
  column-gap: 1.5rem;
  padding: 0.75rem 0;
}

.main {
  min-width: 0;
  flex: 1 1 auto;
}

.titleLine {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  color: var(--color-gray-900);
}

.titleText {
  min-width: 0;
}

.superseded {
  text-decoration: line-through;
  color: var(--color-gray-500);
}

.updatedBadge {
  flex-shrink: 0;
  margin-top: 0.125rem;
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-md);
  background: var(--color-green-50);
  color: var(--color-green-700);
  font-size: 10px;
  font-weight: 500;
  box-shadow: inset 0 0 0 1px rgb(22 163 74 / 0.2);
}

.metaLine {
  display: flex;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.metaItem {
  margin-right: 0.5rem;
}

.docType {
  font-weight: 500;
}

.docTypeSuperseded {
  color: var(--color-red-600);
}

.star {
  display: inline-flex;
  align-items: center;
  color: var(--color-yellow-500);
}

.supersededBy {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-blue-600);
}

.link:hover {
  text-decoration: underline;
}

.snippet {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-600);
  overflow-wrap: break-word;
}

.mark {
  background: var(--color-yellow-100);
}

.replaces {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.oldLink {
  color: var(--color-gray-400);
}

.oldLink:hover {
  text-decoration: underline;
}

.noteWrap {
  margin-top: 0.5rem;
}

.noteView {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-600);
}

.noteLabel {
  font-weight: 500;
  color: var(--color-gray-500);
}

.noteText {
  white-space: pre-line;
}

.textarea {
  display: block;
  width: 100%;
  margin-top: 0.25rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.textarea:focus {
  border-color: var(--color-blue-500);
  outline: 2px solid var(--color-blue-500);
  outline-offset: -1px;
}

.noteActions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.saveButton {
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: var(--radius);
  background: var(--color-blue-600);
  color: #fff;
  font-size: 0.75rem;
  line-height: 1rem;
  cursor: pointer;
}

.saveButton:hover {
  background: var(--color-blue-700);
}

.saveButton:disabled {
  opacity: 0.5;
}

.cancelButton {
  padding: 0.25rem 0.5rem;
  border: none;
  background: none;
  color: var(--color-gray-500);
  font-size: 0.75rem;
  line-height: 1rem;
  cursor: pointer;
}

.cancelButton:hover {
  color: var(--color-gray-700);
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.iconButton {
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  color: var(--color-gray-400);
}

.iconButton:disabled {
  opacity: 0.5;
}

.starButton:hover {
  color: var(--color-yellow-500);
}

.noteButton:hover {
  color: var(--color-gray-700);
}

.icon {
  width: 1.25rem;
  height: 1.25rem;
}

.starActive {
  color: var(--color-yellow-400);
}

.openLink {
  flex-shrink: 0;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-blue-600);
}

.openLink:hover {
  text-decoration: underline;
}
</style>
