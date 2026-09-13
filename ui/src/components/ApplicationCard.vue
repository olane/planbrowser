<template>
  <div :class="$style.card">
    <div :class="$style.headerRow">
      <h3 :class="$style.title">
        <button v-if="!readonly" @click="toggleStar" :title="app.starred ? 'Remove from favourites' : 'Add to favourites'" :class="$style.starButton">
          <svg v-if="app.starred" :class="[$style.icon, $style.starActive]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
          <svg v-else :class="$style.icon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"></path></svg>
        </button>
        <router-link :to="`/app/${encodeURIComponent(app.reference)}`" :class="$style.appLink">{{ app.reference }}</router-link>
        <span v-if="app.archived" :class="$style.archivedBadge">Archived</span>
      </h3>
      <div :class="$style.meta">
        <span v-if="app.authorityId && app.authorityId !== DEFAULT_AUTHORITY_ID" :class="$style.authority">{{ authorityName(app.authorityId) }}</span>
        <span v-if="app.furtherInformation?.['Application Type']" :class="$style.appType">{{ app.furtherInformation['Application Type'] }}</span>
      </div>
    </div>
    <p :class="$style.address">{{ app.address }}</p>
    <p :class="$style.description" :title="app.description">{{ app.description }}</p>
    <p :class="$style.synced">Synced: {{ timeAgo(app.scrapedAt) }}</p>
    <div :class="$style.footer">
      <span :class="[$style.badge, badgeToneClass]">{{ statusLabel(app) }}</span>
      <div :class="$style.actionRow" v-if="!readonly">
        <button @click="toggleArchive" :class="$style.archiveButton" :disabled="saving">
          {{ app.archived ? 'Restore' : 'Archive' }}
        </button>
        <button @click="syncApp" :disabled="isQueued || isSyncing || syncingLocal" :title="syncButtonTitle"
          :class="[$style.syncButton, syncButtonColor]">
          <svg v-if="isFailed" :class="$style.syncIcon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
          <svg v-else-if="isQueued" :class="$style.syncIcon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <svg v-else :class="[isSyncing || syncingLocal ? $style.spin : '', $style.syncIcon]" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
        </button>
      </div>
    </div>
    <div v-if="$slots.extra" :class="$style.extra">
      <slot name="extra" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useCssModule } from 'vue'
import { timeAgo, statusLabel, statusBadgeTone } from '../utils'
import type { ApplicationMeta } from '../../../src/types.js'
import { DEFAULT_AUTHORITY_ID, authorityName } from '../../../src/authorities.js'
import { refreshQueue } from '../queueStore'
import * as api from '../api'

const props = defineProps<{ app: ApplicationMeta; queueStatus?: string; readonly?: boolean }>()

const emit = defineEmits<{ (e: 'changed'): void }>()

const styles = useCssModule()

const saving = ref(false)
const syncingLocal = ref(false)

const isQueued = computed(() => props.queueStatus === 'pending')
const isSyncing = computed(() => props.queueStatus === 'in_progress')
const isFailed = computed(() => props.queueStatus === 'failed')

const badgeToneClass = computed(() => ({
  red: styles.badgeRed,
  green: styles.badgeGreen,
  blue: styles.badgeBlue,
}[statusBadgeTone(props.app)]))

const syncButtonTitle = computed(() => {
  if (isQueued.value) return 'Queued for sync'
  if (isSyncing.value) return 'Syncing…'
  if (isFailed.value) return 'Sync failed — click to retry'
  return 'Sync this application'
})

const syncButtonColor = computed(() => {
  if (isFailed.value) return styles.syncFailed
  if (isQueued.value) return styles.syncQueued
  if (isSyncing.value) return styles.syncSyncing
  return styles.syncIdle
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

<style module>
.card {
  background: #fff;
  padding: 1rem;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  min-width: 0;
}

.headerRow {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  column-gap: 1rem;
  row-gap: 0.25rem;
  margin-bottom: 0.25rem;
}

.title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  font-size: 1.125rem;
  line-height: 1.75rem;
  font-weight: 700;
}

.starButton {
  flex-shrink: 0;
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

.starActive {
  color: var(--color-yellow-400);
}

.appLink {
  min-width: 0;
  color: var(--color-blue-600);
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
}

.appLink:hover {
  color: var(--color-blue-800);
}

.archivedBadge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-md);
  background: var(--color-gray-100);
  color: var(--color-gray-600);
  font-size: 10px;
  font-weight: 500;
  box-shadow: inset 0 0 0 1px rgb(107 114 128 / 0.2);
}

.meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.authority {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-400);
  white-space: nowrap;
}

.appType {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
  white-space: nowrap;
}

.address {
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-gray-600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.description {
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-gray-500);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.synced {
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  column-gap: 1rem;
  row-gap: 0.5rem;
  margin-top: 0.5rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
  box-shadow: inset 0 0 0 1px currentColor;
}

.badgeRed {
  background: var(--color-red-50);
  color: var(--color-red-700);
  box-shadow: inset 0 0 0 1px rgb(220 38 38 / 0.1);
}

.badgeGreen {
  background: var(--color-green-50);
  color: var(--color-green-700);
  box-shadow: inset 0 0 0 1px rgb(22 163 74 / 0.2);
}

.badgeBlue {
  background: var(--color-blue-50);
  color: var(--color-blue-700);
  box-shadow: inset 0 0 0 1px rgb(29 78 216 / 0.1);
}

.actionRow {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.archiveButton {
  cursor: pointer;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
  background: none;
  border: none;
  padding: 0;
}

.archiveButton:hover {
  color: var(--color-gray-700);
}

.archiveButton:disabled {
  opacity: 0.5;
}

.syncButton {
  flex-shrink: 0;
  cursor: pointer;
  padding: 0.375rem;
  margin-right: -0.25rem;
  border: none;
  background: none;
  border-radius: var(--radius-md);
}

.syncButton:hover {
  background: var(--color-gray-100);
}

.syncButton:disabled {
  opacity: 0.6;
}

.syncButton:disabled:hover {
  background: transparent;
}

.syncIcon {
  width: 1rem;
  height: 1rem;
}

.syncFailed {
  color: var(--color-red-600);
}

.syncFailed:hover {
  color: var(--color-red-700);
}

.syncQueued {
  color: var(--color-blue-500);
}

.syncSyncing {
  color: var(--color-blue-600);
}

.syncIdle {
  color: var(--color-gray-400);
}

.syncIdle:hover {
  color: var(--color-blue-600);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.extra {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-gray-100);
}
</style>
