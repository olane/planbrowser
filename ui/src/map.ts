import L from 'leaflet';

// Shared Leaflet setup for the maps (search results, downloaded/archived
// applications, and the viewer's location tab). The pin SVG and the base map
// were copy-pasted across those components; keeping them here keeps the pin
// geometry, colours and tile layer consistent.

// A teardrop pin as an inline-SVG divIcon. `className` scopes the Leaflet
// wrapper element (its own background/border are cleared in each component's
// global style).
export function pinIcon(color: string, className: string, stroke = '#1f2937'): L.DivIcon {
  return L.divIcon({
    className,
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42"><path d="M15 1C7.3 1 1 7.3 1 15c0 9.6 14 26 14 26s14-16.4 14-26C29 7.3 22.7 1 15 1z" fill="${color}" stroke="${stroke}" stroke-width="1"/><circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -36],
  });
}

// A map with the OpenStreetMap base layer on the default Cambridge view. Callers
// fit bounds to their own markers afterwards.
export function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, { scrollWheelZoom: false }).setView([52.2, 0.12], 12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  return map;
}

export function escapeHtml(s: string): string {
  return s.replaceAll(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&#39;', '"': '&quot;' })[c] as string,
  );
}

// Trim a string to at most `words` whitespace-separated words, appending an
// ellipsis when anything was cut.
export function truncate(s: string | undefined, words: number): string {
  const parts = (s || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '';
  }
  const cut = parts.slice(0, words).join(' ');
  return parts.length > words ? `${cut}…` : cut;
}
