import type { ApplicationLocation } from './types.js';
import { extractPostcode, normalizePostcode } from './postcode.js';

// Free, keyless UK postcode lookup. A postcode only resolves to a centroid, so
// results are intentionally approximate and never preferred over scraped geometry.
const POSTCODES_IO_URL = 'https://api.postcodes.io/postcodes';

interface PostcodeCoordinates {
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

export interface PostcodePoint {
  lat: number;
  lon: number;
}

export async function geocodePostcode(postcode: string, fetchFn: typeof fetch = fetch): Promise<PostcodePoint | null> {
  const coords = await requestPostcode(normalizePostcode(postcode), fetchFn);
  if (!coords) return null;
  return { lat: coords.latitude, lon: coords.longitude };
}

// Resolve a scraped application address to a location by geocoding the postcode
// embedded in it. Returns null when the address has no recognisable postcode or
// the lookup fails, so callers can treat it as a pure best-effort fallback.
export async function locationFromAddress(address: string, fetchFn: typeof fetch = fetch): Promise<ApplicationLocation | null> {
  const postcode = extractPostcode(address);
  if (!postcode) return null;
  const coords = await geocodePostcode(postcode, fetchFn);
  if (!coords) return null;
  return {
    center: coords,
    // A postcode lookup has no site geometry, so collapse the bbox to the
    // resolved point. Downstream consumers pad tiny bboxes before rendering, so
    // they treat this as a point marker rather than a fabricated area.
    bbox: {
      minLon: coords.lon,
      maxLon: coords.lon,
      minLat: coords.lat,
      maxLat: coords.lat
    },
    source: 'postcode'
  };
}
