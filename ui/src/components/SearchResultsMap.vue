<template>
  <div class="relative">
    <div ref="mapEl" class="w-full h-96 rounded-md border border-gray-200 z-0"></div>
    <div v-if="legendTypes.length" class="absolute right-3 top-3 z-[1000] rounded-md border border-gray-200 bg-white/90 px-2.5 py-2 text-xs shadow-sm">
      <div class="font-medium text-gray-700 mb-1">Type</div>
      <div v-for="t in legendTypes" :key="t" class="flex items-center gap-1.5 py-0.5">
        <span class="inline-block h-3 w-3 rounded-full" :style="{ background: appTypeColor(t) }"></span>
        <span class="text-gray-600">{{ t }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { PlanItRecord } from '../../../src/types.js'

const props = defineProps<{ results: PlanItRecord[] }>()
const emit = defineEmits<{ select: [uid: string] }>()

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

const APP_TYPE_ORDER = ['Full', 'Outline', 'Amendment', 'Conditions', 'Heritage', 'Trees', 'Advertising', 'Telecoms', 'Other']

const APP_TYPE_COLORS: Record<string, string> = {
  Full: '#2563eb',
  Outline: '#7c3aed',
  Amendment: '#ea580c',
  Conditions: '#0d9488',
  Heritage: '#b45309',
  Trees: '#16a34a',
  Advertising: '#db2777',
  Telecoms: '#0891b2',
  Other: '#6b7280'
}

const appTypeColor = (t?: string) => (t ? APP_TYPE_COLORS[t] : undefined) || '#6b7280'

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

const legendTypes = computed(() => {
  const seen = new Set<string>()
  for (const r of props.results) {
    if (r.app_type && !seen.has(r.app_type)) seen.add(r.app_type)
  }
  const present = [...seen]
  present.sort((a, b) => {
    const ia = APP_TYPE_ORDER.indexOf(a)
    const ib = APP_TYPE_ORDER.indexOf(b)
    return (ia === -1 ? APP_TYPE_ORDER.length : ia) - (ib === -1 ? APP_TYPE_ORDER.length : ib)
  })
  return present
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
    const popupContent = `<div class="text-sm">
      <div class="font-medium">${escapeHtml(p.rec.uid)}</div>
      <div class="text-gray-600">${escapeHtml(truncate(p.rec.description || ''))}</div>
      <div class="text-gray-500 mb-1">${escapeHtml([p.rec.app_type, p.rec.app_state].filter(Boolean).join(' | '))}</div>
      <button class="jump-link text-blue-600 hover:underline">Show in results</button>
    </div>`
    const marker = L.marker([p.lat, p.lon], { icon: p.rec.uid === activeUid ? activePinIcon : pinIcon(appTypeColor(p.rec.app_type)) }).addTo(markerLayer)
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
    markersByUid.get(activeUid)?.setIcon(pinIcon(appTypeColor(prev?.rec.app_type)))
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

onBeforeUnmount(() => {
  map?.remove()
  map = null
  markerLayer = null
})
</script>

<style>
.search-result-pin {
  background: transparent;
  border: none;
}
</style>
