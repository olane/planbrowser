<template>
  <div :class="$style.page">
    <section>
      <h2 :class="$style.title">Activity Feed</h2>
      <div v-if="loading" :class="$style.muted">Loading...</div>
      <div v-else-if="events.length === 0" :class="$style.muted">No activity yet. Changes to synced applications will appear here.</div>
      <div v-else :class="$style.list">
        <div v-for="event in events" :key="event.id">
          <!-- Full application card with the changes shown inside it -->
          <ApplicationCard v-if="event.application" :app="event.application" readonly>
            <template #extra>
              <div :class="$style.extraHeader">
                <h3 :class="$style.extraTitle">{{ event.message }}</h3>
                <span :class="$style.time">{{ timeAgo(event.happenedAt) }}</span>
              </div>
              <ul v-if="(event.changes ?? []).length > 0" :class="$style.changes">
                <li v-for="(change, idx) in event.changes" :key="idx" :class="$style.change">
                  <span :class="$style.changeField">{{ change.field }}:</span>
                  <template v-if="change.before && change.after">
                    <span :class="$style.changeBefore">{{ change.before }}</span>
                    <span :class="$style.changeArrow"> &rarr; </span>
                    <span>{{ change.after }}</span>
                  </template>
                  <span v-else>{{ change.after || change.before }}</span>
                </li>
              </ul>
              <p v-else :class="$style.noChanges">No detailed changes recorded.</p>
              <ul v-if="event.newDocuments && event.newDocuments.length > 0" :class="$style.newDocs">
                <li v-for="doc in event.newDocuments" :key="doc.localFilename" :class="$style.newDoc">
                  <span :class="[ui.toneGreen, $style.newBadge]">New</span>
                  <a :href="documentUrl(event, doc)" target="_blank" :class="$style.docLink">{{ doc.description || doc.documentType || doc.localFilename }}</a>
                  <div :class="$style.docMeta">{{ doc.datePublished }}<template v-if="doc.documentType"> &middot; {{ doc.documentType }}</template></div>
                </li>
              </ul>
            </template>
          </ApplicationCard>

          <!-- Fallback: the application is no longer downloaded -->
          <div v-else :class="$style.card">
            <div :class="$style.cardHeader">
              <div>
                <div :class="$style.cardMetaRow">
                  <span :class="$style.cardRef">{{ event.reference }}</span>
                  <span v-if="authorityName(event.authorityId) && event.authorityId !== DEFAULT_AUTHORITY_ID" :class="$style.cardAuthority">{{ authorityName(event.authorityId) }}</span>
                  <span :class="$style.cardTime">{{ timeAgo(event.happenedAt) }}</span>
                  <span :class="$style.cardGone">(no longer downloaded)</span>
                </div>
                <p :class="$style.cardMessage">{{ event.message }}</p>
              </div>
            </div>
            <ul v-if="(event.changes ?? []).length > 0" :class="$style.cardChanges">
              <li v-for="(change, idx) in event.changes" :key="idx" :class="$style.change">
                <span :class="$style.changeField">{{ change.field }}:</span>
                <template v-if="change.before && change.after">
                  <span :class="$style.changeBefore">{{ change.before }}</span>
                  <span :class="$style.changeArrow"> &rarr; </span>
                  <span>{{ change.after }}</span>
                </template>
                <span v-else>{{ change.after || change.before }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { ActivityEvent, DocumentMeta } from '../../../src/types.js'
import { DEFAULT_AUTHORITY_ID, authorityName } from '../../../src/authorities.js'
import { timeAgo } from '../utils'
import ApplicationCard from '../components/ApplicationCard.vue'
import * as api from '../api'
import ui from '../styles/primitives.module.css'

const events = ref<ActivityEvent[]>([])
const loading = ref(true)

const documentUrl = (event: ActivityEvent, doc: DocumentMeta) =>
  api.documentUrl(event.reference, event.authorityId, doc.localFilename)

const fetchFeed = async () => {
  try {
    events.value = await api.fetchFeed()
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  document.title = 'PlanBrowser | Feed'
  fetchFeed()
})
</script>

<style module>
.page {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.title {
  font-size: 1.25rem;
  line-height: 1.75rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.muted {
  color: var(--color-gray-500);
}

.list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.extraHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.extraTitle {
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 600;
  color: var(--color-gray-900);
  overflow-wrap: break-word;
}

.time {
  flex-shrink: 0;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
  white-space: nowrap;
}

.changes {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.change {
  color: var(--color-gray-600);
}

.changeField {
  font-weight: 500;
  color: var(--color-gray-800);
}

.changeBefore {
  text-decoration: line-through;
  color: var(--color-gray-400);
}

.changeArrow {
  color: var(--color-gray-400);
}

.noChanges {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.newDocs {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-gray-200);
}

.newDoc {
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.newBadge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.375rem;
  margin-right: 0.375rem;
  border-radius: var(--radius-md);
  font-size: 10px;
  font-weight: 500;
}

.docLink {
  color: var(--color-blue-600);
  word-break: break-all;
}

.docLink:hover {
  text-decoration: underline;
}

.docMeta {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.card {
  background: #fff;
  padding: 1rem;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.cardHeader {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.cardMetaRow {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.cardRef {
  font-weight: 500;
  color: var(--color-gray-800);
  word-break: break-all;
}

.cardAuthority {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-400);
}

.cardTime {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.cardGone {
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-400);
}

.cardMessage {
  margin-top: 0.25rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-gray-700);
}

.cardChanges {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
}
</style>
