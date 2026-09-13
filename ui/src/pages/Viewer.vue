<template>
  <div>
    <div :class="$style.topBar">
      <router-link to="/" :class="$style.backLink">&larr; Back to all applications</router-link>
      <div :class="$style.topActions">
        <span v-if="app" :class="$style.synced">Last Synced: {{ timeAgo(app.scrapedAt) }}</span>
        <button v-if="app" @click="toggleStar" :disabled="savingFlags" :title="app.starred ? 'Remove from favourites' : 'Add to favourites'" :class="$style.starButton">
          <svg v-if="app.starred" :class="[$style.starIcon, $style.starActive]" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path></svg>
          <svg v-else :class="$style.starIcon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"></path></svg>
        </button>
        <button v-if="app" @click="toggleArchive" :disabled="savingFlags" :class="[ui.btn, ui.btnOutline]">
          {{ app.archived ? 'Restore' : 'Archive' }}
        </button>
        <button v-if="app" @click="syncApp" :disabled="syncing" :class="[ui.btn, ui.btnOutline]">
          {{ syncing ? 'Syncing...' : 'Sync / Update' }}
        </button>
        <a v-if="app?.portalUrl" :href="app.portalUrl" target="_blank" rel="noopener" :class="[ui.btn, ui.btnOutline]">
          View on portal
        </a>
      </div>
    </div>

    <div v-if="loading" :class="$style.muted">Loading...</div>
    <template v-else>
      <div v-if="isDownloading" :class="$style.downloadBanner">
        <svg :class="$style.downloadSpinner" viewBox="0 0 24 24" fill="none"><circle :class="$style.spinnerTrack" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path :class="$style.spinnerHead" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
        <span>
          Download in progress — details, comments and documents appear here as they're saved.
          <span v-if="downloadProgress" :class="$style.progressStrong">({{ progressText(downloadProgress) }})</span>
        </span>
      </div>
      <div v-if="waitingForDownload" :class="$style.waiting">Waiting for the download to start — this page will populate automatically as details are saved.</div>
      <div v-else-if="error" :class="$style.errorText">{{ error }}</div>
      <div v-if="syncError" :class="$style.errorBanner">
        {{ syncError }}
      </div>
      <div v-if="syncMessage" :class="$style.successBanner">
        {{ syncMessage }}
      </div>
      <div v-if="app" :class="$style.card">
      <div :class="$style.summaryGrid">
        <div>
          <h2 :class="$style.appTitle">{{ app.reference }}</h2>
          <p :class="$style.appAddress">{{ app.address }}</p>
          <p :class="$style.appDesc">{{ app.description }}</p>
          <div :class="$style.statusWrap">
            <span :class="[ui.toneBlue, $style.statusBadge]">{{ app.status }}</span>
          </div>
        </div>

        <div>
          <h3 :class="$style.sectionTitleBorder">Key Dates</h3>
          <dl :class="$style.datesList">
            <div v-for="(value, key) in app.dates" :key="key" :class="$style.dateRow">
              <dt :class="$style.dateTerm">{{ key }}</dt>
              <dd :class="$style.dateValue">{{ value }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div v-if="app.furtherInformation" :class="$style.furtherBox">
        <h3 :class="$style.furtherTitle">Additional Details</h3>
        <div :class="$style.furtherGrid">
          <div v-if="app.furtherInformation?.['Application Type']">
            <dt :class="$style.furtherTerm">Application Type</dt>
            <dd :class="$style.furtherValue">{{ app.furtherInformation['Application Type'] }}</dd>
          </div>
          <div v-if="app.furtherInformation?.['Case Officer']">
            <dt :class="$style.furtherTerm">Case Officer</dt>
            <dd :class="$style.furtherValue">{{ app.furtherInformation['Case Officer'] }}</dd>
          </div>
          <div v-if="app.furtherInformation?.['Ward']">
            <dt :class="$style.furtherTerm">Ward</dt>
            <dd :class="$style.furtherValue">{{ app.furtherInformation['Ward'] }}</dd>
          </div>
          <div v-if="app.importantDates?.['Determination Deadline']">
            <dt :class="$style.furtherTerm">Determination Deadline</dt>
            <dd :class="$style.furtherValue">{{ app.importantDates['Determination Deadline'] }}</dd>
          </div>
          <div v-if="app.importantDates?.['Actual Committee Date']">
            <dt :class="$style.furtherTerm">Meeting Date</dt>
            <dd :class="$style.furtherValue">
              {{ app.importantDates['Actual Committee Date'] }}
            </dd>
          </div>
          <div v-if="app.furtherInformation?.['Decision']">
            <dt :class="$style.furtherTerm">Decision</dt>
            <dd :class="$style.furtherValue">{{ app.furtherInformation['Decision'] }}</dd>
          </div>
          <div v-if="app.importantDates?.['Decision Issued Date']">
            <dt :class="$style.furtherTerm">Decision Date</dt>
            <dd :class="$style.furtherValue">{{ app.importantDates['Decision Issued Date'] }}</dd>
          </div>
        </div>
      </div>

      <div :class="$style.tabsWrap">
        <div :class="$style.tabBar">
          <nav :class="$style.tabs" aria-label="Tabs">
            <button v-if="keyDocs.length > 0" @click="activeTab = 'key-documents'" :class="[tabClass('key-documents'), $style.tab]">
              Key Documents ({{ keyDocs.length }})
            </button>
            <button @click="activeTab = 'favourites'" :class="[tabClass('favourites'), $style.tab]">
              Favourites ({{ favouriteDocs.length }})
            </button>
            <button @click="activeTab = 'documents'" :class="[tabClass('documents'), $style.tab]">
              Documents ({{ enhancedAppDocuments.length }})
            </button>
            <button v-if="app.hasComments" @click="activeTab = 'comments'" :class="[tabClass('comments'), $style.tab]">
              Comments ({{ commentsList.length > 0 ? commentsList.length : (commentsError ? '!' : '...') }})
            </button>
            <button v-if="app.location" @click="activeTab = 'location'" :class="[tabClass('location'), $style.tab]">
              Location
            </button>
          </nav>
        </div>

        <div :class="$style.tabContent">
          <div v-show="activeTab === 'key-documents'" v-if="keyDocs.length > 0">
            <DocumentList :docs="keyDocs" :reference="app.reference" :authority-id="app.authorityId" @changed="onDocChanged" />
          </div>

          <div v-show="activeTab === 'favourites'">
            <div v-if="favouriteDocs.length > 0">
              <DocumentList :docs="favouriteDocs" :reference="app.reference" :authority-id="app.authorityId" @changed="onDocChanged" />
            </div>
            <div v-else :class="$style.emptyCentre">No favourite documents. Star a document to collect it here.</div>
          </div>

          <div v-show="activeTab === 'documents'">
            <div :class="$style.docsToolbar">
              <div :class="$style.docsToolbarLeft">
                <div :class="$style.searchWrap">
                  <svg :class="$style.searchIcon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"></path></svg>
                  <input v-model="docSearch" type="text" placeholder="Search documents..." :class="$style.docSearch" />
                  <button v-if="docSearch" @click="docSearch = ''" :aria-label="'Clear document search'" :class="$style.clearSearch" title="Clear search">
                    <svg :class="$style.clearIcon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
                <label :class="$style.contentsLabel" title="Also search inside document contents (PDFs, Word files), not just names and metadata">
                  <input v-model="searchContents" type="checkbox" :class="$style.checkbox" />
                  <span>Contents</span>
                </label>
              </div>
              <select v-if="docTypesWithCounts.length > 1" v-model="selectedDocType" :class="[ui.select, $style.filterSelect]">
                <option v-for="t in docTypesWithCounts" :key="t.value" :value="t.value">{{ t.label }} ({{ t.count }})</option>
              </select>
            </div>

            <div v-if="searchingContent" :class="$style.searchingNote">Searching document contents…</div>

            <DocumentList v-if="filteredDocs.length > 0" :docs="filteredDocs" :reference="app.reference" :authority-id="app.authorityId" :expand-all="docFilterActive" :snippets="contentSnippets" @changed="onDocChanged" />
            <div v-else-if="!searchingContent" :class="$style.emptyCentre">No documents match your search.</div>
          </div>

          <div v-show="activeTab === 'location'" v-if="app.location">
            <div :class="$style.mapFrame">
              <iframe
                :src="osmEmbedUrl"
                :class="$style.iframe"
                style="height: 480px"
                loading="lazy"
                referrerpolicy="no-referrer-when-downgrade"
                title="Application location map"
              ></iframe>
            </div>
            <p :class="$style.locationNote">
              Approximate site location. Coordinates: {{ app.location.center.lat.toFixed(6) }}, {{ app.location.center.lon.toFixed(6) }}
              &middot; <a :href="osmLinkUrl" target="_blank" rel="noopener" :class="$style.link">Open in OpenStreetMap</a>
            </p>
          </div>

          <div v-show="activeTab === 'comments'" v-if="app.hasComments">
            <div v-if="commentsList.length > 0">
              <div :class="$style.docsToolbar">
                <div :class="$style.searchWrap">
                  <svg :class="$style.searchIcon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"></path></svg>
                  <input v-model="commentSearch" type="text" placeholder="Search comments..." :class="$style.docSearch" />
                  <button v-if="commentSearch" @click="commentSearch = ''" :aria-label="'Clear comment search'" :class="$style.clearSearch" title="Clear search">
                    <svg :class="$style.clearIcon" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path></svg>
                  </button>
                </div>
                <select v-if="commentStancesWithCounts.length > 1" v-model="selectedStance" :class="[ui.select, $style.filterSelect]">
                  <option v-for="t in commentStancesWithCounts" :key="t.value" :value="t.value">{{ t.label }} ({{ t.count }})</option>
                </select>
              </div>
              <div v-if="filteredComments.length > 0" :class="$style.commentsWrap">
                <ul :class="$style.commentsList">
                  <li v-for="(comment, idx) in filteredComments" :key="idx" :class="$style.comment">
                    <div :class="$style.commentHeader">
                      <div :class="$style.commentBody">
                        <div :class="$style.commentToggle" @click="comment.expanded = !comment.expanded">
                          <p :class="$style.commentTitle">
                            <span :class="$style.commentAddress"><Highlight :text="comment.address" :query="commentSearch" /></span>
                            <span v-if="comment.stance" :class="[getStanceClass(comment.stance), $style.stanceBadge]"><Highlight :text="comment.stance" :query="commentSearch" /></span>
                          </p>
                          <p :class="$style.commentMeta">
                            <span :class="$style.commentMetaItem"><Highlight :text="comment.date" :query="commentSearch" /></span>
                          </p>
                        </div>
                        <div v-show="comment.expanded || hasCommentSearch" :class="$style.commentTextWrap">
                          <div :class="$style.commentText"><Highlight :text="comment.text" :query="commentSearch" /></div>
                        </div>
                      </div>
                      <div :class="$style.commentActions">
                        <button type="button" :class="$style.commentChevronButton" :aria-expanded="comment.expanded || hasCommentSearch" @click="comment.expanded = !comment.expanded">
                          <svg :class="[$style.commentChevron, comment.expanded || hasCommentSearch ? '' : $style.commentChevronCollapsed]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </button>
                      </div>
                    </div>
                  </li>
                </ul>
              </div>
              <div v-else :class="$style.emptyCentre">No comments match your search.</div>
            </div>
            <div v-else-if="commentsError" :class="$style.commentsError">{{ commentsError }}</div>
          </div>
        </div>
      </div>
    </div>
    </template>
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, computed, watch, useCssModule } from 'vue'
import { timeAgo, progressText, isKeyDocument } from '../utils'
import type { ApplicationMeta, Comment, EnhancedDocument, DocumentSearchHit, DocumentSnippet } from '../../../src/types.js'
import * as api from '../api'
import DocumentList from '../components/DocumentList.vue'
import Highlight from '../components/Highlight.vue'
import { useRoute } from 'vue-router'
import { queueItems } from '../queueStore'
import ui from '../styles/primitives.module.css'

const route = useRoute()
const styles = useCssModule()
const refParam = computed(() => route.params.ref as string)
const app = ref<ApplicationMeta | null>(null)
const loading = ref(true)
const syncError = ref('')
const syncMessage = ref('')
const error = ref('')
const syncing = ref(false)
const selectedStance = ref('All')

// While the application is queued or being downloaded, its metadata is written
// to disk progressively (details, then comments, then documents), so poll the
// API while the queue item is live to stream content into this page.
const downloadingItem = computed(() =>
  queueItems.value.find(q => q.reference === refParam.value && (q.status === 'pending' || q.status === 'in_progress'))
)
const isDownloading = computed(() => !!downloadingItem.value)
const downloadProgress = computed(() => downloadingItem.value?.progress)
const waitingForDownload = computed(() => !app.value && isDownloading.value)

const docPrefix = computed(() => api.docUrlPrefix(app.value?.authorityId))

const commentsList = ref<Comment[]>([])
const activeTab = ref('documents')
const commentsError = ref('')
const docSearch = ref('')
const commentSearch = ref('')
// Matched content context per localFilename, populated by the debounced content
// search and shown on matching document rows.
const contentSnippets = ref<Record<string, DocumentSnippet>>({})
const searchingContent = ref(false)
const searchContents = ref(true)
const getStanceClass = (stance?: string) => {
  if (!stance) return ui.toneGray
  const lower = stance.toLowerCase()
  if (lower.includes('object')) return ui.toneRed
  if (lower.includes('support')) return ui.toneGreen
  if (lower.includes('neutral')) return ui.toneYellow
  return ui.toneGray
}
const selectedDocType = ref('All')

const docFilterActive = computed(() => docSearch.value.trim() !== '' || selectedDocType.value !== 'All')

const tabClass = (tab: string) => (activeTab.value === tab ? styles.tabActive : styles.tabInactive)

const osmEmbedUrl = computed(() => {
  const loc = app.value?.location
  if (!loc) return ''
  const { center, bbox } = loc
  let minLon = bbox.minLon
  let minLat = bbox.minLat
  let maxLon = bbox.maxLon
  let maxLat = bbox.maxLat
  const padLon = (maxLon - minLon) * 0.5 || 0.002
  const padLat = (maxLat - minLat) * 0.5 || 0.001
  minLon -= padLon
  maxLon += padLon
  minLat -= padLat
  maxLat += padLat
  const bboxStr = `${minLon},${minLat},${maxLon},${maxLat}`
  const marker = `${center.lat},${center.lon}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bboxStr)}&layer=mapnik&marker=${encodeURIComponent(marker)}`
})

const osmLinkUrl = computed(() => {
  const loc = app.value?.location
  if (!loc) return ''
  return `https://www.openstreetmap.org/?mlat=${encodeURIComponent(loc.center.lat)}&mlon=${encodeURIComponent(loc.center.lon)}#map=17/${encodeURIComponent(loc.center.lat)}/${encodeURIComponent(loc.center.lon)}`
})
const syncApp = async () => {
  if (!app.value) return
  syncing.value = true
  syncError.value = ''
  syncMessage.value = ''
  try {
    await api.downloadApplication(app.value.reference, app.value.authorityId)
    syncMessage.value = 'Sync queued. Check the Queue page for progress.'
  } catch (err: any) {
    syncError.value = err.message || 'Failed to sync'
  } finally {
    syncing.value = false
  }
}

const savingFlags = ref(false)

const toggleStar = async () => {
  if (!app.value) return
  savingFlags.value = true
  try {
    const flags = await api.setApplicationFlags(app.value.reference, { starred: !app.value.starred }, app.value.authorityId)
    app.value.starred = flags.starred
  } catch (e) {
    console.error(e)
  } finally {
    savingFlags.value = false
  }
}

const toggleArchive = async () => {
  if (!app.value) return
  if (!app.value.archived) {
    const ok = window.confirm(`Archive "${app.value.reference}"? It will be hidden from the main list.`)
    if (!ok) return
  }
  savingFlags.value = true
  try {
    const flags = await api.setApplicationFlags(app.value.reference, { archived: !app.value.archived }, app.value.authorityId)
    app.value.archived = flags.archived
  } catch (e) {
    console.error(e)
  } finally {
    savingFlags.value = false
  }
}

const enhancedAppDocuments = computed<EnhancedDocument[]>(() => {
  if (!app.value?.documents) return []
  // The portal (and therefore metadata.json) can list the same file more than
  // once. Collapse duplicates by filename so every rendered row has a unique
  // key — duplicate keys in a v-for break Vue's diffing and leave stale rows.
  const seen = new Set<string>()
  const unique = app.value.documents.filter((d) => {
    if (!d.localFilename || seen.has(d.localFilename)) return false
    seen.add(d.localFilename)
    return true
  })
  const docs: EnhancedDocument[] = unique.map((d) => ({
    ...d,
    url: `/api/documents/${docPrefix.value}${encodeURIComponent(app.value!.reference.replace(/\//g, '-'))}/${encodeURIComponent(d.localFilename)}`,
    isSuperseded: d.documentType.toLowerCase().includes('superseded'),
    supersededBy: null,
    replaces: []
  }))

  // Find relationships based on matching descriptions
  docs.forEach((doc) => {
    if (doc.isSuperseded && doc.description) {
      // Find newer active document with same description
      const active = docs.find((d) => !d.isSuperseded && d.description?.toLowerCase() === doc.description.toLowerCase())
      if (active) {
        doc.supersededBy = active
        active.replaces.push(doc)
      }
    }
  })
  return docs
})

const keyDocs = computed(() => {
  if (!enhancedAppDocuments.value.length) return []
  return enhancedAppDocuments.value.filter((d) => isKeyDocument(d))
})

const favouriteDocs = computed(() => {
  if (!enhancedAppDocuments.value.length) return []
  return enhancedAppDocuments.value.filter((d) => d.starred)
})

const onDocChanged = (doc: EnhancedDocument, payload: { starred: boolean; note: string }) => {
  if (!app.value) return
  const raw = app.value.documents.find((d) => d.localFilename === doc.localFilename)
  if (raw) {
    raw.starred = payload.starred
    raw.note = payload.note
  }
}

const docTypesWithCounts = computed(() => {
  if (!enhancedAppDocuments.value.length) return []
  const counts: Record<string, number> = { 'All': enhancedAppDocuments.value.length }
  enhancedAppDocuments.value.forEach((d) => {
    const type = d.documentType
    if (type) counts[type] = (counts[type] || 0) + 1
  })
  const types = Array.from(new Set(enhancedAppDocuments.value.map((d) => d.documentType).filter(Boolean))).sort() as string[]
  
  return [
    { value: 'All', label: 'All', count: counts['All'] },
    ...types.map(t => ({ value: t, label: t, count: counts[t] }))
  ]
})

const commentStancesWithCounts = computed(() => {
  if (!commentsList.value.length) return []
  const counts: Record<string, number> = { 'All': commentsList.value.length }
  commentsList.value.forEach(c => {
    const stance = c.stance || 'None'
    counts[stance] = (counts[stance] || 0) + 1
  })
  
  const stances = Array.from(new Set(commentsList.value.map(c => c.stance || 'None'))).sort() as string[]
  return [
    { value: 'All', label: 'All', count: counts['All'] },
    ...stances.map(s => ({ value: s, label: s, count: counts[s] }))
  ]
})

const hasCommentSearch = computed(() => commentSearch.value.trim() !== '')

const filteredComments = computed(() => {
  let list = commentsList.value
  if (selectedStance.value !== 'All') {
    list = list.filter(c => (c.stance || 'None') === selectedStance.value)
  }
  const q = commentSearch.value.trim().toLowerCase()
  if (q) {
    list = list.filter(c => {
      const haystack = `${c.address} ${c.date} ${c.stance} ${c.text}`.toLowerCase()
      return haystack.includes(q)
    })
  }
  return list
})

const filteredDocs = computed(() => {
  if (!enhancedAppDocuments.value.length) return []
  let docs = enhancedAppDocuments.value
  if (selectedDocType.value !== 'All') {
    docs = docs.filter((d) => d.documentType === selectedDocType.value)
  }
  const q = docSearch.value.trim().toLowerCase()
  if (q) {
    docs = docs.filter((d) => {
      const haystack = `${d.description || ''} ${d.documentType || ''} ${d.localFilename || ''} ${d.datePublished || ''} ${d.note || ''}`.toLowerCase()
      return haystack.includes(q) || Object.prototype.hasOwnProperty.call(contentSnippets.value, d.localFilename)
    })
  }
  return docs
})

// Content search is debounced and server-side (PDFs are extracted on first
// search), so it runs after the instant metadata filter and merges its results
// into the same list.
let contentSearchTimer: ReturnType<typeof setTimeout> | null = null
const runContentSearch = async (query: string) => {
  if (!app.value || !searchContents.value) return
  searchingContent.value = true
  try {
    const hits: DocumentSearchHit[] = await api.searchDocuments(app.value.reference, query, app.value.authorityId)
    // Ignore stale responses if the user has since changed the query or toggled
    // content search off.
    if (!searchContents.value || docSearch.value.trim() !== query) return
    const snippets: Record<string, DocumentSnippet> = {}
    for (const hit of hits) snippets[hit.localFilename] = hit.snippet
    contentSnippets.value = snippets
  } catch (e) {
    console.error(e)
  } finally {
    searchingContent.value = false
  }
}

watch([docSearch, searchContents], () => {
  if (contentSearchTimer) clearTimeout(contentSearchTimer)
  const query = docSearch.value.trim()
  if (!query || !searchContents.value) {
    contentSnippets.value = {}
    searchingContent.value = false
    return
  }
  contentSearchTimer = setTimeout(() => runContentSearch(query), 300)
})

const commentKey = (c: { address: string; date: string; stance: string }) =>
  `${c.address}|${c.date}|${c.stance}`

const loadComments = async () => {
  if (!app.value?.hasComments) {
    commentsList.value = []
    commentsError.value = ''
    return
  }
  try {
    const data = await api.fetchComments(app.value.reference, app.value.authorityId)
    // Re-fetching comments (while a download streams in) must not collapse
    // comments the user has already expanded, so keep their state by content.
    const expandedByKey = new Map<string, boolean>()
    for (const c of commentsList.value) {
      expandedByKey.set(commentKey(c), !!c.expanded)
    }
    commentsList.value = data.map((c: Comment) => ({
      ...c,
      expanded: expandedByKey.get(commentKey(c)) ?? false
    }))
    commentsError.value = ''
  } catch (err) {
    commentsError.value = 'Failed to load comments.'
  }
}

let fetchInFlight = false
const fetchApp = async () => {
  const refNow = refParam.value
  if (fetchInFlight || !refNow) return
  fetchInFlight = true
  try {
    const fresh = await api.fetchApplication(refNow)
    const firstLoad = app.value === null
    app.value = fresh
    error.value = ''
    document.title = `PlanBrowser | ${fresh.reference}`
    await loadComments()
    if (firstLoad && keyDocs.value.length > 0 && activeTab.value === 'documents') {
      activeTab.value = 'key-documents'
    }
  } catch (e: any) {
    console.error(e)
    // While the app is queued/downloading the metadata may simply not be on
    // disk yet; leave the error blank and let the next poll retry.
    if (!isDownloading.value) {
      error.value = e.message || 'Failed to load'
    }
  } finally {
    loading.value = false
    fetchInFlight = false
  }
}

// The queue is polled globally, so watch it and re-fetch this application
// whenever it is (or has just been) downloaded — that streams the progressively
// committed metadata into the page and grabs the final state on completion.
let lastWasDownloading = false
watch(queueItems, async () => {
  const nowDownloading = isDownloading.value
  if (nowDownloading || lastWasDownloading) {
    lastWasDownloading = nowDownloading
    await fetchApp()
  } else {
    lastWasDownloading = nowDownloading
  }
})

// If the user navigates from one application to another without leaving the
// viewer, reset and load the new reference rather than showing stale content.
watch(refParam, () => {
  if (!refParam.value) return
  app.value = null
  error.value = ''
  commentsList.value = []
  commentsError.value = ''
  docSearch.value = ''
  contentSnippets.value = {}
  searchingContent.value = false
  lastWasDownloading = false
  loading.value = true
  fetchApp()
})

onMounted(async () => {
  document.title = 'PlanBrowser'
  await fetchApp()
  lastWasDownloading = isDownloading.value
})
</script>

<style module>
.muted {
  color: var(--color-gray-500);
}

.topBar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  column-gap: 1rem;
  row-gap: 0.5rem;
  margin-bottom: 1rem;
}

.backLink {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-blue-600);
}

.backLink:hover {
  text-decoration: underline;
}

.topActions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.synced {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-gray-500);
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

.starIcon {
  width: 1.5rem;
  height: 1.5rem;
}

.starActive {
  color: var(--color-yellow-400);
}

.downloadBanner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-blue-700);
  background: var(--color-blue-50);
  border: 1px solid var(--color-blue-200);
  border-radius: var(--radius-md);
}

.downloadSpinner {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  animation: spin 1s linear infinite;
}

.spinnerTrack {
  opacity: 0.25;
}

.spinnerHead {
  opacity: 0.75;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.progressStrong {
  font-weight: 500;
}

.waiting {
  margin-bottom: 1rem;
  color: var(--color-gray-500);
}

.errorText {
  color: var(--color-red-600);
}

.errorBanner {
  margin-bottom: 1rem;
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-red-700);
  background: var(--color-red-50);
  border: 1px solid var(--color-red-200);
  border-radius: var(--radius-md);
}

.successBanner {
  margin-bottom: 1rem;
  padding: 1rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-green-700);
  background: var(--color-green-50);
  border: 1px solid var(--color-green-200);
  border-radius: var(--radius-md);
}

.card {
  padding: 1.5rem;
  background: #fff;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.summaryGrid {
  display: grid;
  gap: 2rem;
  margin-bottom: 2rem;
}

@media (min-width: 768px) {
  .summaryGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.appTitle {
  margin-bottom: 0.5rem;
  font-size: 1.5rem;
  line-height: 2rem;
  font-weight: 700;
}

.appAddress {
  margin-bottom: 0.5rem;
  font-size: 1.125rem;
  line-height: 1.75rem;
  color: var(--color-gray-700);
}

.appDesc {
  color: var(--color-gray-600);
}

.statusWrap {
  margin-top: 1rem;
}

.statusBadge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
}

.sectionTitleBorder {
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  font-size: 1.125rem;
  line-height: 1.75rem;
  font-weight: 600;
  border-bottom: 1px solid var(--color-gray-200);
}

.datesList > div + div {
  border-top: 1px solid var(--color-gray-100);
}

.dateRow {
  padding: 0.75rem 0.5rem;
}

@media (min-width: 640px) {
  .dateRow {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }
}

.dateTerm {
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  color: var(--color-gray-900);
}

.dateValue {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-gray-700);
}

@media (min-width: 640px) {
  .dateValue {
    grid-column: span 2 / span 2;
    margin-top: 0;
  }
}

.furtherBox {
  margin-bottom: 2rem;
  padding: 1rem;
  background: var(--color-gray-50);
  border: 1px solid var(--color-gray-100);
  border-radius: var(--radius);
}

.furtherTitle {
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  font-size: 1.125rem;
  line-height: 1.75rem;
  font-weight: 600;
  color: var(--color-gray-800);
  border-bottom: 1px solid var(--color-gray-200);
}

.furtherGrid {
  display: grid;
  gap: 1rem;
}

@media (min-width: 768px) {
  .furtherGrid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 1024px) {
  .furtherGrid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.furtherTerm {
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
  color: var(--color-gray-500);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.furtherValue {
  margin-top: 0.25rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-gray-900);
}

.tabsWrap {
  margin-top: 2rem;
}

.tabBar {
  border-bottom: 1px solid var(--color-gray-200);
}

.tabs {
  display: flex;
  gap: 2rem;
  margin-bottom: -1px;
  overflow-x: auto;
}

.tab {
  padding: 1rem 0.25rem;
  border-bottom: 2px solid transparent;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  background: none;
}

.tabActive {
  border-bottom-color: var(--color-blue-500);
  color: var(--color-blue-600);
}

.tabInactive {
  color: var(--color-gray-500);
}

.tabInactive:hover {
  color: var(--color-gray-700);
  border-bottom-color: var(--color-gray-300);
}

.tabContent {
  padding-top: 1.5rem;
}

.emptyCentre {
  padding: 1rem 0;
  text-align: center;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-gray-500);
}

.docsToolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  column-gap: 1rem;
  row-gap: 0.5rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--color-gray-200);
}

.docsToolbarLeft {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.searchWrap {
  position: relative;
}

.searchIcon {
  position: absolute;
  left: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1rem;
  height: 1rem;
  color: var(--color-gray-400);
  pointer-events: none;
}

.docSearch {
  width: 100%;
  padding: 0.375rem 2rem 0.375rem 2rem;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  line-height: 1.25rem;
}

@media (min-width: 640px) {
  .docSearch {
    width: 18rem;
  }
}

.docSearch:focus {
  border-color: var(--color-blue-500);
}

.clearSearch {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-gray-400);
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
}

.clearSearch:hover {
  color: var(--color-gray-600);
}

.clearIcon {
  height: 1rem;
  width: 1rem;
}

.contentsLabel {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-gray-700);
  cursor: pointer;
  user-select: none;
}

.checkbox {
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius);
  accent-color: var(--color-blue-600);
}

.filterSelect {
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
  padding-left: 0.5rem;
}

.searchingNote {
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-400);
}

.mapFrame {
  overflow: hidden;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
}

.iframe {
  width: 100%;
}

.locationNote {
  margin-top: 0.75rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.link {
  color: var(--color-blue-600);
}

.link:hover {
  text-decoration: underline;
}

.commentsWrap {
  margin-top: 0.5rem;
}

.commentsList > li + li {
  border-top: 1px solid var(--color-gray-100);
}

.comment {
  padding: 0.75rem 0;
}

.commentHeader {
  display: flex;
  justify-content: space-between;
  column-gap: 1.5rem;
}

.commentBody {
  min-width: 0;
  flex: 1 1 auto;
}

.commentToggle {
  cursor: pointer;
}

.commentTitle {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  font-weight: 500;
  color: var(--color-gray-900);
}

.commentAddress {
  min-width: 0;
}

.stanceBadge {
  flex-shrink: 0;
  margin-top: 0.125rem;
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
}

.commentMeta {
  display: flex;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  line-height: 1rem;
  color: var(--color-gray-500);
}

.commentMetaItem {
  margin-right: 0.5rem;
}

.commentTextWrap {
  margin-top: 0.75rem;
  margin-left: 1rem;
  padding-left: 0.75rem;
  border-left: 2px solid var(--color-gray-200);
}

.commentText {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-gray-700);
  font-style: italic;
  white-space: pre-wrap;
}

.commentActions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.commentChevronButton {
  cursor: pointer;
  color: var(--color-gray-400);
  background: none;
  border: none;
  padding: 0;
}

.commentChevronButton:hover {
  color: var(--color-gray-700);
}

.commentChevron {
  width: 1rem;
  height: 1rem;
  transition: transform 150ms;
}

.commentChevronCollapsed {
  transform: rotate(-90deg);
}

.commentsError {
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: var(--color-red-600);
}
</style>
