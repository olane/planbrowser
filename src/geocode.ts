import type { ApplicationLocation } from './types.js';
import { extractPostcode } from './postcode.js';

// Free, keyless UK postcode lookup used as a fallback when an authority's map
// server yields no site geometry. A postcode only resolves to a centroid, so
// this is intentionally approximate and never preferred over scraped geometry.
const POSTCODES_IO_URL = 'https://api.postcodes.io/postcodes';

export interface PostcodeCoordinates {
  latitude: number;
  longitude: number;
}

async function requestPostcode(postcode: string, fetchFn: typeof fetch = fetch): Promise<PostcodeCoordinates | null> {
  try {
    const res = await fetchFn(`${POSTCODES_IO_URL}/${encodeURIComponent(postcode)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: { latitude?: number | null; longitude?: number | null } };
    const { latitude, longitude } = body.result ?? {};
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
    return { latitude, longitude };
  } catch {
    // Offline, the service is down, or the response is malformed. Best-effort
    // fallback: return nothing and let the caller keep "no location".
    return null;
  }
}

// Resolve a scraped application address to a location by geocoding the postcode
// embedded in it. Returns null when the address has no recognisable postcode or
// the lookup fails, so callers can treat it as a pure best-effort fallback.
export async function locationFromAddress(address: string, fetchFn: typeof fetch = fetch): Promise<ApplicationLocation | null> {
  const postcode = extractPostcode(address);
  if (!postcode) return null;
  const coords = await requestPostcode(postcode, fetchFn);
  if (!coords) return null;
  return {
    center: { lat: coords.latitude, lon: coords.longitude },
    // A postcode lookup has no site geometry, so collapse the bbox to the
    // resolved point. Downstream consumers pad tiny bboxes before rendering, so
    // they treat this as a point marker rather than a fabricated area.
    bbox: {
      minLon: coords.longitude,
      maxLon: coords.longitude,
      minLat: coords.latitude,
      maxLat: coords.latitude
    },
    source: 'postcode'
  };
}
