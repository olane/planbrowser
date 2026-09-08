<template>
  <div ref="mapEl" class="w-full h-96 rounded-md border border-gray-200 z-0"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { ApplicationMeta } from '../../../src/types.js'
import { statusLabel, statusBadgeClass } from '../utils'

const props = defineProps<{ apps: ApplicationMeta[] }>()
const emit = defineEmits<{ select: [reference: string] }>()

const mapEl = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let markerLayer: L.LayerGroup | null = null

const escapeHtml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' }[c] as string))

const truncate = (s: string | undefined, words = 8) => {
  const parts = (s || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const cut = parts.slice(0, words).join(' ')
  return parts.length > words ? cut + '…' : cut
}

const locatedApps = () => props.apps.filter((a) => a.location)

const pinColor = (app: ApplicationMeta) => {
  const label = statusLabel(app).toLowerCase()
  if (label.includes('refus')) return '#dc2626'
  if (label.includes('permit') || label.includes('grant')) return '#16a34a'
  return '#2563eb'
}

const pinIcon = (color: string) => L.divIcon({
  className: 'application-pin',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42"><path d="M15 1C7.3 1 1 7.3 1 15c0 9.6 14 26 14 26s14-16.4 14-26C29 7.3 22.7 1 15 1z" fill="${color}" stroke="#1f2937" stroke-width="1"/><circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>`,
  iconSize: [30, 42],
  iconAnchor: [15, 42],
  popupAnchor: [0, -36]
})

const popupContent = (app: ApplicationMeta) => {
  const loc = app.location!
  return `<div class="text-sm min-w-[200px]">
    <div class="font-semibold break-words">${escapeHtml(app.reference)}</div>
    <div class="text-gray-700">${escapeHtml(app.address || '')}</div>
    <div class="text-gray-500">${escapeHtml(truncate(app.description))}</div>
    <div class="mt-1.5 flex items-center justify-between gap-2">
      <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(app)}">${escapeHtml(statusLabel(app))}</span>
      <button class="open-link text-blue-600 hover:underline shrink-0">View</button>
    </div>
    <div class="mt-1 text-[10px] text-gray-400">${loc.center.lat.toFixed(5)}, ${loc.center.lon.toFixed(5)}</div>
  </div>`
}

const renderMarkers = () => {
  if (!map || !markerLayer) return
  markerLayer.clearLayers()
  const apps = locatedApps()
  if (apps.length === 0) return
  const bounds = L.latLngBounds(apps.map((a) => [a.location!.center.lat, a.location!.center.lon] as L.LatLngExpression))
  for (const app of apps) {
    const loc = app.location!
    const marker = L.marker([loc.center.lat, loc.center.lon], { icon: pinIcon(pinColor(app)) }).addTo(markerLayer)
    marker.bindPopup(popupContent(app))
    marker.on('popupopen', (e) => {
      const link = e.popup.getElement()?.querySelector('.open-link') as HTMLElement | null
      if (link) link.onclick = () => emit('select', app.reference)
    })
  }
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
}

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

watch(() => props.apps, () => renderMarkers(), { deep: true })

onBeforeUnmount(() => {
  map?.remove()
  map = null
  markerLayer = null
})
</script>

<style>
.application-pin {
  background: transparent;
  border: none;
}
</style>
