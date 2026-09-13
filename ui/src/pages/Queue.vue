<template>
  <div :class="$style.page">
    <section>
      <div :class="$style.header">
        <h2 :class="$style.title">Download Queue</h2>
        <button v-if="queueItems.length > 0" @click="clearCompletedQueue" :class="$style.clear">Clear completed</button>
      </div>

      <div v-if="queueItems.length === 0" :class="$style.muted">
        No active or pending downloads.
      </div>

      <div v-else :class="$style.list">
        <div v-for="item in queueItems" :key="item.id" :class="$style.item">
          <div :class="$style.info">
            <router-link v-if="item.status === 'completed' || item.status === 'in_progress' || item.status === 'pending'" :to="`/app/${encodeURIComponent(item.reference)}`" :class="$style.refLink">
              {{ item.reference }}
            </router-link>
            <div v-else :class="$style.ref">{{ item.reference }}</div>
            <div :class="$style.meta">
              <span v-if="authorityName(item.authorityId)">{{ authorityName(item.authorityId) }} • </span>
              Enqueued: {{ timeAgo(item.enqueuedAt) }}
              <span v-if="item.completedAt"> • Finished: {{ timeAgo(item.completedAt) }}</span>
            </div>
          </div>
          <div :class="$style.statusCol">
            <span v-if="item.status === 'pending'" :class="[ui.toneYellow, $style.badge]">Pending</span>
            <span v-else-if="item.status === 'in_progress'" :class="[ui.toneBlue, $style.badge]">Downloading...</span>
            <span v-else-if="item.status === 'completed'" :class="[ui.toneGreen, $style.badge]">Completed</span>
            <span v-else-if="item.status === 'failed'" :class="[ui.toneRed, $style.badge]">Failed</span>
            <div v-if="item.status === 'in_progress' && item.progress" :class="$style.progress">{{ progressText(item.progress) }}</div>
            <div v-if="item.error" :class="$style.error" :title="item.error">{{ item.error }}</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { authorityName } from '../../../src/authorities.js'
import { onMounted } from 'vue'
import { timeAgo, progressText } from '../utils'
import * as api from '../api'
import { queueItems, refreshQueue } from '../queueStore'
import ui from '../styles/primitives.module.css'

const clearCompletedQueue = async () => {
  try {
    await api.clearQueue()
    await refreshQueue()
  } catch (e) {
    console.error(e)
  }
}

onMounted(() => {
  document.title = 'PlanBrowser | Queue'
  refreshQueue()
})
</script>

<style module>
.page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.title {
  font-size: 1.25rem;
  line-height: 1.75rem;
  font-weight: 600;
}

.clear {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-gray-500);
  cursor: pointer;
  background: none;
  border: none;
}

.clear:hover {
  color: var(--color-gray-700);
}

.muted {
  color: var(--color-gray-500);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.item {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  column-gap: 1rem;
  row-gap: 0.5rem;
  padding: 0.75rem;
  background: #fff;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.info {
  min-width: 0;
}

.refLink {
  font-weight: 500;
  color: var(--color-blue-600);
}

.refLink:hover {
  text-decoration: underline;
}

.ref {
  font-weight: 500;
}

.meta {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.statusCol {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
}

.progress {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.error {
  margin-top: 0.25rem;
  max-width: 20rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-red-600);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
