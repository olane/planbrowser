import type { SearchFilters, SortSpec } from './types.js';
import { normalizePostcode } from './postcode.js';

// Query the PlanIt API (https://www.planit.org.uk/api/) for planning
// applications near a postcode. Unlike the Idox portal scraping in scraper.ts,
// this is a plain JSON API, which is why it lives in its own module.
export async function searchPlanIt(postcode: string, radius: string, filters: SearchFilters = {}, sort?: SortSpec) {
  const field = sort?.field ?? 'start_date';
  const order = sort?.order ?? 'desc';
  const sortParam = `${order === 'desc' ? '-' : ''}${field}`;
  const params = new URLSearchParams({
    pcode: normalizePostcode(postcode),
    krad: radius,
    pg_sz: '50',
    sort: sortParam
  });
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  const res = await fetch(`https://www.planit.org.uk/api/applics/json?${params.toString()}`, {
    headers: {
      'User-Agent': 'planbrowser/1.0 (https://github.com/olane/planbrowser)'
    }
  });
  if (!res.ok) {
    throw new Error(`PlanIt API returned ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data;
}
