<template>
  <div :class="$style.page">
    <router-link :to="`/app/${encodeURIComponent(refParam)}`" :class="$style.backLink">&larr; Back to the application</router-link>

    <header :class="$style.header">
      <h1 :class="$style.title">Insights review</h1>
      <p v-if="app" :class="$style.meta">
        {{ app.reference }} · <a :href="`/app/${encodeURIComponent(refParam)}`" :class="$style.metaLink">{{ app.address }}</a>
      </p>
      <p :class="$style.intro">
        Rate each page the heuristic interpreted — including the ones it <b>rejected</b> — so missed
        pages can be flagged as false negatives. Labels save to <code>scripts/samples.expected.json</code>
        for <code>npm run insights:eval</code>.
      </p>
    </header>

    <p v-if="appError" :class="$style.error">{{ appError }}</p>

    <div v-if="status === 'loading'" :class="$style.muted">Loading…</div>
    <div v-else-if="status === 'running'" :class="$style.muted">
      Generating insights — this can take a minute on a cold cache.
    </div>
    <div v-else-if="status === 'error'">
      <p :class="$style.error">{{ error }}</p>
      <button type="button" @click="generate()">Retry</button>
    </div>
    <div v-else-if="status === 'none'">
      <p :class="$style.muted">No insights are cached for this application yet.</p>
      <button type="button" @click="generate()">Generate insights</button>
    </div>

    <template v-else-if="insights">
      <div :class="$style.toolbar">
        <span v-if="!insights.pages" :class="$style.warn">
          This cache predates per-page review.
          <button type="button" :class="$style.linkButton" @click="generate()">Regenerate</button>
          to list rejected pages.
        </span>
        <label :class="$style.toggle">
          <input type="checkbox" v-model="hideLabelled" /> Hide labelled
        </label>
        <span :class="$style.progress">{{ labelledCount }} labelled</span>
        <span v-if="saveState === 'saving'" :class="$style.saving">Saving…</span>
        <span v-else-if="saveState === 'saved'" :class="$style.saved">Saved</span>
        <span v-else-if="saveState === 'error'" :class="$style.error">{{ saveError }}</span>
        <span v-if="insights.coverage" :class="$style.coverage">
          Scanned {{ insights.coverage.documentsAnalysed }} of {{ insights.coverage.documentsTotal }} documents
          <button v-if="insights.depth !== 'deep'" type="button" :class="$style.linkButton" @click="generate(true)">Scan more</button>
        </span>
      </div>

      <section v-for="group in visibleGroups" :key="group.key" :class="$style.group">
        <h2 :class="$style.groupTitle">
          {{ group.title }} <span :class="$style.count">{{ group.pages.length }}</span>
          <span v-if="group.hint" :class="$style.hint">{{ group.hint }}</span>
        </h2>
        <div :class="$style.grid">
          <figure
            v-for="page in group.pages"
            :key="pageKey(page)"
            :class="[pageVerdict(page) === 'good' ? $style.good : pageVerdict(page) === 'bad' ? $style.bad : '']"
          >
            <a :href="api.documentPageUrl(refParam, app?.authorityId, page.localFilename, page.page)" target="_blank" rel="noopener" :class="$style.thumbLink">
              <img
                :src="thumbUrl(page)"
                :alt="`${page.localFilename} page ${page.page}`"
                loading="lazy"
                :class="$style.thumb"
              />
            </a>
            <figcaption :class="$style.caption">
              <div :class="$style.captionHead">
                <span :class="$style.kind">{{ kindLabel(page.kind) }}</span>
                <span :class="$style.score">score {{ page.score }}</span>
              </div>
              <div :class="$style.doc">{{ shortName(page.localFilename) }} · page {{ page.page }}</div>
              <div :class="$style.reason">{{ page.reason }}</div>
              <div :class="$style.controls">
                <button type="button" :class="pageVerdict(page) === 'good' ? $style.goodActive : $style.button" @click="rate(page, 'good')">Good</button>
                <button type="button" :class="pageVerdict(page) === 'bad' ? $style.badActive : $style.button" @click="rate(page, 'bad')">Bad</button>
                <select :class="$style.select" :value="pageKind(page)" @change="setKind(page, $event)">
                  <option v-for="kind in KINDS" :key="kind" :value="kind">{{ kindLabel(kind) }}</option>
                </select>
              </div>
            </figcaption>
          </figure>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { ApplicationMeta, ApplicationInsights, InsightImageKind, InsightLabel, InsightPage } from '../../../src/types.js'
import * as api from '../api'
import { useInsights } from '../composables/useInsights'

const route = useRoute()
const refParam = computed(() => route.params.ref as string)
const app = ref<ApplicationMeta | null>(null)
const appError = ref('')

const { insights, status, error, load, generate, reset } = useInsights(
  () => refParam.value,
  () => app.value?.authorityId
)

const KINDS: InsightImageKind[] = ['render', 'map', 'elevation', 'plan', 'section', 'photo', 'other']
const KIND_LABELS: Record<string, string> = {
  render: 'Render',
  map: 'Location plan',
  elevation: 'Elevation',
  plan: 'Plan',
  section: 'Section',
  photo: 'Photo',
  other: 'Other'
}
const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind

const pageKey = (page: { localFilename: string; page: number }) => `${page.localFilename}#${page.page}`
const shortName = (name: string) =>
  name.replace(/\.pdf$/i, '').replace(/^\d{1,2}\s+\w{3}\s+\d{4}\s*-\s*[^-]+-\s*/, '')

type ReviewLabel = { verdict: 'good' | 'bad'; kind?: InsightImageKind }
const labels = ref<Record<string, ReviewLabel>>({})
const saveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const saveError = ref('')
const hideLabelled = ref(false)

const labelledCount = computed(() => Object.keys(labels.value).length)
const pageVerdict = (page: InsightPage) => labels.value[pageKey(page)]?.verdict
const pageKind = (page: InsightPage): InsightImageKind => labels.value[pageKey(page)]?.kind ?? page.kind

const keysOf = (images: ApplicationInsights['images'] | undefined): Set<string> =>
  new Set((images ?? []).map((image) => `${image.localFilename}#${image.page}`))
const highlightKeys = computed(() => keysOf(insights.value?.images))
const foundKeys = computed(() => keysOf(insights.value?.found))

// Found/highlight pages still have their kept thumbnails; only rejected pages
// (whose assets were pruned) need the on-demand render endpoint.
const foundByKey = computed(() => {
  const map = new Map<string, ApplicationInsights['images'][number]>()
  for (const image of insights.value?.found ?? []) map.set(`${image.localFilename}#${image.page}`, image)
  return map
})
const thumbUrl = (page: InsightPage): string => {
  const image = foundByKey.value.get(pageKey(page))
  return image
    ? api.insightImageUrl(refParam.value, app.value?.authorityId, image.imageFile)
    : api.reviewImageUrl(refParam.value, app.value?.authorityId, page.localFilename, page.page)
}

const groups = computed(() => {
  const pages = insights.value?.pages ?? []
  const highlights: InsightPage[] = []
  const found: InsightPage[] = []
  const dropped: InsightPage[] = []
  const rejected: InsightPage[] = []
  for (const page of pages) {
    const key = pageKey(page)
    if (highlightKeys.value.has(key)) highlights.push(page)
    else if (foundKeys.value.has(key)) found.push(page)
    // A positive score that did not survive dedupe/caps is not a false negative.
    else if (page.score > 0) dropped.push(page)
    else rejected.push(page)
  }
  return [
    { key: 'highlights', title: 'Highlights', hint: '', pages: highlights },
    { key: 'found', title: 'Found, not in highlights', hint: 'dropped by the selection caps', pages: found },
    { key: 'dropped', title: 'Dropped (duplicate or cap)', hint: 'not a false negative', pages: dropped },
    { key: 'rejected', title: 'Rejected', hint: 'candidates for false negatives', pages: rejected }
  ]
})

// With "hide labelled" on, groups with nothing left to review disappear.
const visibleGroups = computed(() =>
  groups.value
    .map((group) => ({ ...group, pages: group.pages.filter((page) => !hideLabelled.value || !pageVerdict(page)) }))
    .filter((group) => group.pages.length > 0)
)

const loadLabels = async () => {
  try {
    const incoming = await api.fetchInsightLabels(refParam.value, app.value?.authorityId)
    const map: Record<string, ReviewLabel> = {}
    for (const label of incoming) {
      map[`${label.file}#${label.page}`] = { verdict: label.verdict, ...(label.kind ? { kind: label.kind } : {}) }
    }
    labels.value = map
  } catch {
    // Labelling unavailable (packaged build): leave controls inert.
  }
}

const persist = async (page: InsightPage) => {
  const entry = labels.value[pageKey(page)]
  if (!entry) return
  const label: InsightLabel = {
    file: page.localFilename,
    page: page.page,
    verdict: entry.verdict,
    ...(entry.verdict === 'good' && entry.kind ? { kind: entry.kind } : {})
  }
  saveState.value = 'saving'
  try {
    await api.saveInsightLabels(refParam.value, [label], app.value?.authorityId)
    saveState.value = 'saved'
    saveError.value = ''
  } catch (e: any) {
    saveState.value = 'error'
    saveError.value = e.message || 'Failed to save label'
  }
}

const rate = (page: InsightPage, verdict: 'good' | 'bad') => {
  const kind = labels.value[pageKey(page)]?.kind ?? page.kind
  labels.value[pageKey(page)] = verdict === 'good' ? { verdict, kind } : { verdict }
  void persist(page)
}

const setKind = (page: InsightPage, event: Event) => {
  const kind = (event.target as HTMLSelectElement).value as InsightImageKind
  const verdict = labels.value[pageKey(page)]?.verdict ?? 'good'
  labels.value[pageKey(page)] = { verdict, kind }
  void persist(page)
}

const loadApp = async () => {
  try {
    app.value = await api.fetchApplication(refParam.value)
    appError.value = ''
  } catch (e: any) {
    appError.value = e.message || 'Failed to load application'
  }
}

watch(refParam, async () => {
  if (!refParam.value) return
  reset()
  app.value = null
  labels.value = {}
  await loadApp()
  void load()
  void loadLabels()
})

onMounted(async () => {
  document.title = 'PlanBrowser | Review'
  await loadApp()
  void load()
  void loadLabels()
})
</script>

<style module>
.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
}

.backLink {
  font-size: 0.875rem;
  color: var(--color-blue-600);
}

.backLink:hover {
  text-decoration: underline;
}

.header {
  margin: 0.75rem 0 1.25rem;
}

.title {
  margin: 0;
  font-size: 1.5rem;
}

.meta {
  margin: 0.25rem 0;
  color: var(--color-gray-600);
}

.metaLink {
  color: var(--color-blue-600);
}

.intro {
  max-width: 70ch;
  margin: 0.5rem 0 0;
  color: var(--color-gray-600);
  font-size: 0.875rem;
}

.muted {
  color: var(--color-gray-500);
}

.error {
  color: var(--color-red-600, #dc2626);
}

.warn {
  color: var(--color-amber-700, #b45309);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 0.5rem 0;
  background: var(--color-gray-50, #f9fafb);
  border-bottom: 1px solid var(--color-gray-200);
  font-size: 0.8125rem;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
}

.progress {
  color: var(--color-gray-600);
}

.coverage {
  margin-left: auto;
  color: var(--color-gray-500);
}

.saved {
  color: var(--color-green-600, #16a34a);
}

.saving {
  color: var(--color-gray-500);
}

.linkButton {
  border: none;
  background: none;
  padding: 0;
  color: var(--color-blue-600);
  text-decoration: underline;
  cursor: pointer;
  font: inherit;
}

.group {
  margin-top: 1.5rem;
}

.groupTitle {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 1rem;
  margin: 0 0 0.5rem;
}

.count {
  color: var(--color-gray-500);
  font-weight: 400;
}

.hint {
  color: var(--color-gray-500);
  font-size: 0.75rem;
  font-weight: 400;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0.75rem;
}

.grid figure {
  margin: 0;
  border: 2px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #fff;
}

.good {
  border-color: var(--color-green-600, #16a34a) !important;
}

.bad {
  border-color: var(--color-red-600, #dc2626) !important;
}

.thumbLink {
  display: block;
}

.thumb {
  width: 100%;
  height: 170px;
  object-fit: contain;
  background: var(--color-gray-50, #f9fafb);
}

.caption {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.4rem;
  font-size: 0.72rem;
}

.captionHead {
  display: flex;
  justify-content: space-between;
  color: var(--color-gray-500);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.625rem;
}

.doc {
  color: var(--color-gray-800);
}

.reason {
  color: var(--color-gray-500);
}

.controls {
  display: flex;
  gap: 0.25rem;
  align-items: center;
  margin-top: 0.25rem;
}

.button,
.goodActive,
.badActive {
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  background: #fff;
  color: var(--color-gray-700);
  font-size: 0.6875rem;
  cursor: pointer;
}

.goodActive {
  border-color: var(--color-green-600, #16a34a);
  background: var(--color-green-600, #16a34a);
  color: #fff;
}

.badActive {
  border-color: var(--color-red-600, #dc2626);
  background: var(--color-red-600, #dc2626);
  color: #fff;
}

.select {
  padding: 0.125rem 0.25rem;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  background: #fff;
  color: var(--color-gray-700);
  font-size: 0.6875rem;
}
</style>
