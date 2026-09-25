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
import type { ApplicationMeta, ApplicationLocation } from '../../../src/types.js'
import { statusLabel, statusBadgeTone } from '../utils'
import MapLegend from './MapLegend.vue'
import { useMapColorMode } from '../useMapColorMode'
import {
  APP_TYPE_COLORS,
  APP_TYPE_ORDER,
  OUTCOME_COLORS,
  OUTCOME_ORDER,
  appTypeColor,
  appTypeFromReference,
  normaliseAppType,
  normaliseOutcome,
  outcomeColor,
  presentBuckets,
  legendFor,
  type LegendEntry
} from '../mapColours'
import ui from '../styles/primitives.module.css'

const props = defineProps<{ apps: ApplicationMeta[] }>()
const emit = defineEmits<{ select: [reference: string] }>()

const styles = useCssModule()

const mapEl = ref<HTMLDivElement | null>(null)
let map: L.Map | null = null
let markerLayer: L.LayerGroup | null = null
let polygonLayer: L.LayerGroup | null = null

// Convert stored [lon, lat] rings into Leaflet's [lat, lon] nested arrays.
const locationPolygons = (loc: ApplicationLocation): L.LatLngExpression[][][] =>
  (loc.polygons ?? []).map((poly) => poly.map((ring) => ring.map(([lon, lat]) => [lat, lon] as [number, number])))

const escapeHtml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' }[c] as string))

const truncate = (s: string | undefined, words = 8) => {
  const parts = (s || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const cut = parts.slice(0, words).join(' ')
  return parts.length > words ? cut + '…' : cut
}

const locatedApps = () => props.apps.filter((a) => a.location)

const { colorMode, setColorMode } = useMapColorMode('planbrowser.mapColorMode.apps', 'outcome')

// Prefer the scraped "Application Type"; fall back to the reference suffix
// (e.g. "…/FUL") when the portal didn't expose it.
const appTypeValue = (app: ApplicationMeta) =>
  app.furtherInformation?.['Application Type'] || appTypeFromReference(app.reference)

const markerFill = (app: ApplicationMeta) =>
  colorMode.value === 'type' ? appTypeColor(appTypeValue(app)) : outcomeColor(statusLabel(app))

const legendEntries = computed<LegendEntry[]>(() => {
  if (colorMode.value === 'type') {
    const buckets = presentBuckets(props.apps.map(appTypeValue), normaliseAppType, APP_TYPE_ORDER)
    return legendFor(buckets, APP_TYPE_COLORS)
  }
  const buckets = presentBuckets(props.apps.map((a) => statusLabel(a)), normaliseOutcome, OUTCOME_ORDER)
  return legendFor(buckets, OUTCOME_COLORS)
})

const pinIcon = (color: string) => L.divIcon({
  className: 'application-pin',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42"><path d="M15 1C7.3 1 1 7.3 1 15c0 9.6 14 26 14 26s14-16.4 14-26C29 7.3 22.7 1 15 1z" fill="${color}" stroke="#1f2937" stroke-width="1"/><circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>`,
  iconSize: [30, 42],
  iconAnchor: [15, 42],
  popupAnchor: [0, -36]
})

const toneClass = { red: ui.toneRed, green: ui.toneGreen, blue: ui.toneBlue }

const popupContent = (app: ApplicationMeta) => {
  const loc = app.location!
  return `<div class="${styles.popup}">
    <div class="${styles.popupRef}">${escapeHtml(app.reference)}</div>
    <div class="${styles.popupAddress}">${escapeHtml(app.address || '')}</div>
    <div class="${styles.popupDesc}">${escapeHtml(truncate(app.description))}</div>
    <div class="${styles.popupFooter}">
      <span class="${styles.popupBadge} ${toneClass[statusBadgeTone(app)]}">${escapeHtml(statusLabel(app))}</span>
      <button class="open-link ${styles.popupLink}">View</button>
    </div>
    <div class="${styles.popupCoords}">${loc.center.lat.toFixed(5)}, ${loc.center.lon.toFixed(5)}</div>
  </div>`
}

let markersByRef = new Map<string, L.Marker>()
let polygonsByRef = new Map<string, L.Polygon[]>()

const polygonStyle = (app: ApplicationMeta): L.PathOptions => {
  const color = markerFill(app)
  return { color, weight: 2, fillColor: color, fillOpacity: 0.2 }
}

const bindInteractions = (layer: L.Layer, app: ApplicationMeta) => {
  layer.bindPopup(popupContent(app))
  layer.on('popupopen', (e: L.PopupEvent) => {
    const link = e.popup.getElement()?.querySelector('.open-link') as HTMLElement | null
    if (link) link.onclick = () => emit('select', app.reference)
  })
}

const renderMarkers = () => {
  if (!map || !markerLayer || !polygonLayer) return
  markerLayer.clearLayers()
  polygonLayer.clearLayers()
  markersByRef = new Map()
  polygonsByRef = new Map()
  const apps = locatedApps()
  if (apps.length === 0) return
  const bounds = L.latLngBounds([])
  for (const app of apps) {
    const loc = app.location!
    bounds.extend([loc.center.lat, loc.center.lon] as L.LatLngExpression)
    const polygons = locationPolygons(loc)
    if (polygons.length > 0) {
      for (const rings of polygons) {
        const polygon = L.polygon(rings, polygonStyle(app)).addTo(polygonLayer)
        bindInteractions(polygon, app)
        for (const ring of rings) {
          for (const latlng of ring) bounds.extend(latlng)
        }
        const list = polygonsByRef.get(app.reference) ?? []
        list.push(polygon)
        polygonsByRef.set(app.reference, list)
      }
      // The boundary supersedes the centroid pin; the polygon carries the popup.
      continue
    }
    const marker = L.marker([loc.center.lat, loc.center.lon], { icon: pinIcon(markerFill(app)) }).addTo(markerLayer)
    markersByRef.set(app.reference, marker)
    bindInteractions(marker, app)
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
  polygonLayer = L.layerGroup().addTo(map)
  markerLayer = L.layerGroup().addTo(map)
  renderMarkers()
})

watch(() => props.apps, () => renderMarkers(), { deep: true })

// Recolour in place so switching mode doesn't re-fit/reset the current view.
watch(colorMode, () => {
  for (const app of locatedApps()) {
    markersByRef.get(app.reference)?.setIcon(pinIcon(markerFill(app)))
    const color = markerFill(app)
    for (const polygon of polygonsByRef.get(app.reference) ?? []) {
      polygon.setStyle({ color, fillColor: color })
    }
  }
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
  markerLayer = null
  polygonLayer = null
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
  min-width: 200px;
}

.popupRef {
  font-weight: 600;
  overflow-wrap: break-word;
}

.popupAddress {
  color: var(--color-gray-700);
}

.popupDesc {
  color: var(--color-gray-500);
}

.popupFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.375rem;
}

.popupBadge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  line-height: 1rem;
  font-weight: 500;
}

.popupLink {
  flex-shrink: 0;
  color: var(--color-blue-600);
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
}

.popupLink:hover {
  text-decoration: underline;
}

.popupCoords {
  margin-top: 0.25rem;
  font-size: 10px;
  color: var(--color-gray-400);
}
</style>

<style>
.application-pin {
  background: transparent;
  border: none;
}
</style>
