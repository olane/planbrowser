import { describe, it, expect } from 'vitest';
import { parseWfsCoords, coordsToLocation, escapeXml } from './geometry.js';

describe('parseWfsCoords', () => {
  it('returns no coordinates for empty input', () => {
    expect(parseWfsCoords('')).toEqual([]);
  });

  it('returns no coordinates when the response reports no matches', () => {
    expect(parseWfsCoords('<foo numberReturned="0"/>')).toEqual([]);
    expect(parseWfsCoords('<foo numberMatched="0"/>')).toEqual([]);
  });

  it('parses a single gml:pos', () => {
    const xml = '<gml:pos>540000 250000</gml:pos>';
    expect(parseWfsCoords(xml)).toEqual([[540000, 250000]]);
  });

  it('parses a gml:posList of multiple coordinate pairs', () => {
    const xml = '<gml:posList>1 2 3 4 5 6</gml:posList>';
    expect(parseWfsCoords(xml)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('ignores a trailing unpaired coordinate', () => {
    const xml = '<gml:pos>1 2 3</gml:pos>';
    expect(parseWfsCoords(xml)).toEqual([[1, 2]]);
  });
});

describe('coordsToLocation', () => {
  it('projects a single OSGB36 coordinate to WGS84', () => {
    const loc = coordsToLocation([[400000, 100000]]);
    expect(loc.center.lat).toBeGreaterThan(49);
    expect(loc.center.lat).toBeLessThan(61);
    expect(loc.center.lon).toBeGreaterThan(-9);
    expect(loc.center.lon).toBeLessThan(2);
    // A single point collapses the bounding box to the centre.
    expect(loc.bbox.minLat).toBeCloseTo(loc.center.lat);
    expect(loc.bbox.maxLat).toBeCloseTo(loc.center.lat);
    expect(loc.bbox.minLon).toBeCloseTo(loc.center.lon);
    expect(loc.bbox.maxLon).toBeCloseTo(loc.center.lon);
  });

  it('computes a bounding box spanning all points', () => {
    const west = coordsToLocation([[400000, 100000]]).center.lon;
    const east = coordsToLocation([[500000, 100000]]).center.lon;
    const loc = coordsToLocation([[400000, 100000], [500000, 100000]]);
    expect(loc.bbox.minLon).toBeCloseTo(west);
    expect(loc.bbox.maxLon).toBeCloseTo(east);
    expect(loc.bbox.minLon).toBeLessThan(loc.bbox.maxLon);
  });
});

describe('escapeXml', () => {
  it('escapes all special characters', () => {
    expect(escapeXml('<>&\'"')).toBe('&lt;&gt;&amp;&apos;&quot;');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeXml('24/00123/FUL')).toBe('24/00123/FUL');
  });
});
