import { describe, it, expect } from 'vitest';
import { parseWfsGeometry, geometryToLocation, coordsToLocation, escapeXml } from './geometry.js';

const polygonXml = `<wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0" xmlns:gml="http://www.opengis.net/gml/3.2" numberReturned="1">
  <wfs:member>
    <ms:Planning_Application_Polygons>
      <ms:SHAPE>
        <gml:MultiSurface>
          <gml:surfaceMember>
            <gml:Polygon gml:id="p1">
              <gml:exterior>
                <gml:LinearRing>
                  <gml:posList>400000 100000 400100 100000 400100 100100 400000 100100 400000 100000</gml:posList>
                </gml:LinearRing>
              </gml:exterior>
              <gml:interior>
                <gml:LinearRing>
                  <gml:posList>400020 100020 400040 100020 400040 100040 400020 100040 400020 100020</gml:posList>
                </gml:LinearRing>
              </gml:interior>
            </gml:Polygon>
          </gml:surfaceMember>
        </gml:MultiSurface>
      </ms:SHAPE>
    </ms:Planning_Application_Polygons>
  </wfs:member>
</wfs:FeatureCollection>`;

describe('parseWfsGeometry', () => {
  it('returns nothing for empty input', () => {
    expect(parseWfsGeometry('')).toEqual({ polygons: [], points: [] });
  });

  it('returns nothing when the response reports no matches', () => {
    expect(parseWfsGeometry('<foo numberReturned="0"/>')).toEqual({ polygons: [], points: [] });
    expect(parseWfsGeometry('<foo numberMatched="0"/>')).toEqual({ polygons: [], points: [] });
  });

  it('parses a gml:Point into a point', () => {
    const xml = '<gml:Point><gml:pos>540000 250000</gml:pos></gml:Point>';
    expect(parseWfsGeometry(xml)).toEqual({ polygons: [], points: [[540000, 250000]] });
  });

  it('parses a polygon exterior and interior ring', () => {
    const geom = parseWfsGeometry(polygonXml);
    expect(geom.polygons).toHaveLength(1);
    const [polygon] = geom.polygons;
    expect(polygon).toHaveLength(2);
    expect(polygon![0]).toHaveLength(5);
    expect(polygon![1]).toHaveLength(5);
    expect(geom.points).toEqual([]);
  });

  it('parses multiple surface members as separate polygons', () => {
    const xml = `<gml:MultiSurface>
      <gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>400000 100000 400100 100000 400100 100100 400000 100000</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember>
      <gml:surfaceMember><gml:Polygon><gml:exterior><gml:LinearRing><gml:posList>500000 200000 500100 200000 500100 200100 500000 200000</gml:posList></gml:LinearRing></gml:exterior></gml:Polygon></gml:surfaceMember>
    </gml:MultiSurface>`;
    expect(parseWfsGeometry(xml).polygons).toHaveLength(2);
  });

  it('honours srsDimension=3 by dropping the z value', () => {
    const xml = '<gml:LinearRing><gml:posList srsDimension="3">1 2 3 4 5 6 7 8 9</gml:posList></gml:LinearRing>';
    const geom = parseWfsGeometry(xml);
    expect(geom.polygons).toEqual([[[[1, 2], [4, 5], [7, 8]]]]);
  });

  it('ignores a trailing unpaired coordinate', () => {
    const xml = '<gml:LinearRing><gml:posList>1 2 3 4 5 6 7</gml:posList></gml:LinearRing>';
    expect(parseWfsGeometry(xml).polygons).toEqual([[[[1, 2], [3, 4], [5, 6]]]]);
  });
});

describe('geometryToLocation', () => {
  it('projects polygon rings to WGS84 and keeps the point centre', () => {
    const loc = geometryToLocation(parseWfsGeometry(polygonXml));
    expect(loc).not.toBeNull();
    expect(loc!.polygons).toHaveLength(1);
    const ring = loc!.polygons![0]![0]!;
    expect(ring).toHaveLength(5);
    for (const [lon, lat] of ring) {
      expect(lat).toBeGreaterThan(49);
      expect(lat).toBeLessThan(61);
      expect(lon).toBeGreaterThan(-9);
      expect(lon).toBeLessThan(2);
    }
    expect(loc!.bbox.minLon).toBeLessThan(loc!.bbox.maxLon);
    expect(loc!.bbox.minLat).toBeLessThan(loc!.bbox.maxLat);
  });

  it('returns a point-only location without polygons', () => {
    const loc = geometryToLocation(parseWfsGeometry('<gml:Point><gml:pos>540000 250000</gml:pos></gml:Point>'));
    expect(loc).not.toBeNull();
    expect(loc!.polygons).toBeUndefined();
    expect(loc!.center.lat).toBeGreaterThan(49);
  });

  it('returns null when there is no geometry', () => {
    expect(geometryToLocation(parseWfsGeometry(''))).toBeNull();
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
