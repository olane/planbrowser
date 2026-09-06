import * as cheerio from 'cheerio';
import proj4 from 'proj4';
import type { ApplicationLocation } from './types.js';

proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs');

export function parseWfsCoords(xml: string): Array<[number, number]> {
  if (!xml || xml.includes('numberReturned="0"') || xml.includes('numberMatched="0"')) {
    return [];
  }
  const $ = cheerio.load(xml, { xmlMode: true });
  const coords: Array<[number, number]> = [];
  $('gml\\:pos, gml\\:posList').each((_, el) => {
    const parts = $(el).text().trim().split(/\s+/).map(Number);
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const x = parts[i];
      const y = parts[i + 1];
      if (typeof x === 'number' && typeof y === 'number') {
        coords.push([x, y]);
      }
    }
  });
  return coords;
}

export function coordsToLocation(coords: Array<[number, number]>): ApplicationLocation {
  let sumX = 0;
  let sumY = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of coords) {
    sumX += x;
    sumY += y;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const centerX = sumX / coords.length;
  const centerY = sumY / coords.length;
  const [centerLon, centerLat] = proj4('EPSG:27700', 'EPSG:4326', [centerX, centerY]);
  const [minLon, minLat] = proj4('EPSG:27700', 'EPSG:4326', [minX, minY]);
  const [maxLon, maxLat] = proj4('EPSG:27700', 'EPSG:4326', [maxX, maxY]);
  return {
    center: { lat: centerLat, lon: centerLon },
    bbox: { minLon, minLat, maxLon, maxLat }
  };
}

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
}
