<template>
  <div :class="$style.root">
    <div ref="mapEl" :class="$style.map"></div>
    <MapLegend :mode="colorMode" :entries="legendEntries" @update:mode="setColorMode" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, useCssModule } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PlanItRecord } from '../../../src/types.js'
import MapLegend from './MapLegend.vue'
import { useMapColorMode } from '../useMapColorMode'
import {
  APP_TYPE_COLORS,
  APP_TYPE_ORDER,
  OUTCOME_COLORS,
  OUTCOME_ORDER,
  appTypeColor,
  normaliseAppType,
  normaliseOutcome,
  outcomeColor,
  presentBuckets,
  legendFor,
  type LegendEntry
} from '../mapColours'

const props = defineProps<{ results: PlanItRecord[] }>()
const emit = defineEmits<{ select: [uid: string] }>()

const styles = useCssModule()

const mapEl = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let markerLayer: L.LayerGroup | null = null

const escapeHtml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' }[c] as string))

const truncate = (s: string, words = 6) => {
  const parts = s.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const cut = parts.slice(0, words).join(' ')
  return parts.length > words ? cut + '…' : cut
}

const { colorMode, setColorMode } = useMapColorMode('planbrowser.mapColorMode.search', 'type')

const markerFill = (rec: PlanItRecord) =>
  colorMode.value === 'type' ? appTypeColor(rec.app_type) : outcomeColor(rec.app_state)

const pinIcon = (fill: string) => L.divIcon({
  className: 'search-result-pin',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42"><path d="M15 1C7.3 1 1 7.3 1 15c0 9.6 14 26 14 26s14-16.4 14-26C29 7.3 22.7 1 15 1z" fill="${fill}" stroke="#1f2937" stroke-width="1"/><circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>`,
  iconSize: [30, 42],
  iconAnchor: [15, 42],
  popupAnchor: [0, -36]
})

const activePinIcon = L.divIcon({
  className: 'search-result-pin',
  html: '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42"><path d="M15 1C7.3 1 1 7.3 1 15c0 9.6 14 26 14 26s14-16.4 14-26C29 7.3 22.7 1 15 1z" fill="#dc2626" stroke="#991b1b" stroke-width="1"/><circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>',
  iconSize: [30, 42],
  iconAnchor: [15, 42],
  popupAnchor: [0, -36]
})

const legendEntries = computed<LegendEntry[]>(() => {
  if (colorMode.value === 'type') {
    const buckets = presentBuckets(props.results.map((r) => r.app_type), normaliseAppType, APP_TYPE_ORDER)
    return legendFor(buckets, APP_TYPE_COLORS)
  }
  const buckets = presentBuckets(props.results.map((r) => r.app_state), normaliseOutcome, OUTCOME_ORDER)
  return legendFor(buckets, OUTCOME_COLORS)
})

const points = computed(() => {
  const pts: { lat: number; lon: number; rec: PlanItRecord }[] = []
  for (const r of props.results) {
    const lat = typeof r.location_y === 'number' ? r.location_y : r.location?.coordinates?.[1]
    const lon = typeof r.location_x === 'number' ? r.location_x : r.location?.coordinates?.[0]
    if (typeof lat === 'number' && typeof lon === 'number') {
      pts.push({ lat, lon, rec: r })
    }
  }
  return pts
})

let markersByUid = new Map<string, L.Marker>()
let activeUid: string | null = null

const renderMarkers = () => {
  if (!map || !markerLayer) return
  markerLayer.clearLayers()
  markersByUid = new Map()
  if (points.value.length === 0) return
  const bounds = L.latLngBounds(points.value.map(p => [p.lat, p.lon] as L.LatLngExpression))
  for (const p of points.value) {
    const popupContent = `<div class="${styles.popup}">
      <div class="${styles.popupUid}">${escapeHtml(p.rec.uid)}</div>
      <div class="${styles.popupDesc}">${escapeHtml(truncate(p.rec.description || ''))}</div>
      <div class="${styles.popupMeta}">${escapeHtml([p.rec.app_type, p.rec.app_state].filter(Boolean).join(' | '))}</div>
      <button class="jump-link ${styles.popupLink}">Show in results</button>
    </div>`
    const marker = L.marker([p.lat, p.lon], { icon: p.rec.uid === activeUid ? activePinIcon : pinIcon(markerFill(p.rec)) }).addTo(markerLayer)
    markersByUid.set(p.rec.uid, marker)
    marker.bindPopup(popupContent)
    marker.on('popupopen', (e) => {
      const link = e.popup.getElement()?.querySelector('.jump-link') as HTMLElement | null
      if (link) link.onclick = () => emit('select', p.rec.uid)
    })
  }
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
}

const focus = (uid: string) => {
  if (!map) return
  const marker = markersByUid.get(uid)
  const point = points.value.find(p => p.rec.uid === uid)
  if (!marker || !point) return
  if (activeUid && activeUid !== uid) {
    const prev = points.value.find(p => p.rec.uid === activeUid)
    markersByUid.get(activeUid)?.setIcon(pinIcon(prev ? markerFill(prev.rec) : appTypeColor()))
  }
  activeUid = uid
  marker.setIcon(activePinIcon)
  map.flyTo([point.lat, point.lon], Math.max(map.getZoom(), 16), { duration: 0.6 })
  marker.openPopup()
}

defineExpose({ focus })

onMounted(() => {
  if (!mapEl.value) return
  map = L.map(mapEl.value, { scrollWheelZoom: false }).setView([52.2, 0.12], 12)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map)
  markerLayer = L.layerGroup().addTo(map)
  renderMarkers()
})

watch(() => props.results, () => renderMarkers())

// Recolour in place so switching mode doesn't re-fit/reset the current view.
watch(colorMode, () => {
  for (const p of points.value) {
    if (p.rec.uid === activeUid) continue
    markersByUid.get(p.rec.uid)?.setIcon(pinIcon(markerFill(p.rec)))
  }
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
  markerLayer = null
})
</script>

<style module>
.root {
  position: relative;
}

.map {
  width: 100%;
  height: 24rem;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  z-index: 0;
}

.popup {
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.popupUid {
  font-weight: 500;
}

.popupDesc {
  color: var(--color-gray-600);
}

.popupMeta {
  margin-bottom: 0.25rem;
  color: var(--color-gray-500);
}

.popupLink {
  color: var(--color-blue-600);
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
}

.popupLink:hover {
  text-decoration: underline;
}
</style>

<style>
.search-result-pin {
  background: transparent;
  border: none;
}
</style>
