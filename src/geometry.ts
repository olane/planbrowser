import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import proj4 from 'proj4';
import type { ApplicationLocation, LocationPolygon } from './types.js';

proj4.defs('EPSG:27700', '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs');

export type Coordinate = [number, number];

export interface WfsGeometry {
  polygons: LocationPolygon[];
  points: Coordinate[];
}

// Split a GML coordinate string ("x y", or "x y z ...") into 2D [x, y] pairs.
// `dimension` comes from the element's srsDimension and defaults to 2D.
function pairList(text: string, dimension: number): Coordinate[] {
  const nums = text.trim().split(/\s+/).map(Number);
  const pairs: Coordinate[] = [];
  for (let i = 0; i + 1 < nums.length; i += dimension) {
    const x = nums[i];
    const y = nums[i + 1];
    if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
      pairs.push([x, y]);
    }
  }
  return pairs;
}

// GML declares the coordinate dimension on the position element itself or on an
// ancestor (e.g. gml:MultiSurface). Default to 2D for x/y layers.
function declaredDimension(el: cheerio.Cheerio<AnyNode>): number {
  const own = el.attr('srsDimension');
  const inherited = own ?? el.parents('[srsDimension]').first().attr('srsDimension');
  const dim = inherited ? Number.parseInt(inherited, 10) : NaN;
  return Number.isInteger(dim) && dim >= 2 ? dim : 2;
}

// Read one gml:LinearRing (or a gml:exterior/gml:interior wrapper containing one)
// into a list of [x, y] pairs.
function ringFrom($: cheerio.CheerioAPI, el: cheerio.Cheerio<AnyNode>): Coordinate[] {
  const posList = el.find('gml\\:posList').first();
  if (posList.length > 0) {
    return pairList(posList.text(), declaredDimension(posList));
  }
  const points: Coordinate[] = [];
  el.find('gml\\:pos').each((_, pos) => {
    const pair = pairList($(pos).text(), declaredDimension($(pos)))[0];
    if (pair) points.push(pair);
  });
  return points;
}

export function parseWfsGeometry(xml: string): WfsGeometry {
  const result: WfsGeometry = { polygons: [], points: [] };
  if (!xml || xml.includes('numberReturned="0"') || xml.includes('numberMatched="0"')) {
    return result;
  }
  const $ = cheerio.load(xml, { xmlMode: true });

  $('gml\\:Polygon').each((_, poly) => {
    const rings: LocationPolygon = [];
    $(poly)
      .find('gml\\:exterior, gml\\:interior')
      .each((_, part) => {
        const wrapper = $(part);
        const ringEl = wrapper.find('gml\\:LinearRing').first();
        const ring = ringFrom($, ringEl.length > 0 ? ringEl : wrapper);
        if (ring.length >= 3) rings.push(ring);
      });
    if (rings.length === 0) {
      // Some servers emit a bare LinearRing without exterior/interior wrappers.
      const ring = ringFrom($, $(poly).find('gml\\:LinearRing').first());
      if (ring.length >= 3) rings.push(ring);
    }
    if (rings.length > 0) result.polygons.push(rings);
  });

  $('gml\\:Point').each((_, point) => {
    const pos = $(point).find('gml\\:pos').first();
    if (pos.length === 0) return;
    const pair = pairList(pos.text(), declaredDimension(pos))[0];
    if (pair) result.points.push(pair);
  });

  // Safety net for servers that emit bare gml:posList/gml:pos without a
  // Polygon or Point wrapper. Only runs when structured parsing found nothing.
  if (result.polygons.length === 0 && result.points.length === 0) {
    $('gml\\:posList').each((_, el) => {
      const ring = pairList($(el).text(), declaredDimension($(el)));
      if (ring.length >= 3) result.polygons.push([ring]);
    });
    $('gml\\:pos').each((_, el) => {
      const pair = pairList($(el).text(), declaredDimension($(el)))[0];
      if (pair) result.points.push(pair);
    });
  }

  return result;
}

export function coordsToLocation(coords: Coordinate[]): ApplicationLocation {
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

const projectCoordinate = ([x, y]: Coordinate): Coordinate => {
  const [lon, lat] = proj4('EPSG:27700', 'EPSG:4326', [x, y]);
  return [lon, lat];
};

// Build an application location from a parsed WFS response. Polygon geometry is
// projected to WGS84 and kept as rings; point-only layers just yield a centre.
export function geometryToLocation(geometry: WfsGeometry): ApplicationLocation | null {
  const flat: Coordinate[] = [];
  for (const poly of geometry.polygons) {
    for (const ring of poly) flat.push(...ring);
  }
  flat.push(...geometry.points);
  if (flat.length === 0) return null;

  const loc = coordsToLocation(flat);
  if (geometry.polygons.length > 0) {
    loc.polygons = geometry.polygons.map((poly) => poly.map((ring) => ring.map(projectCoordinate)));
  }
  return loc;
}

export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));
}
