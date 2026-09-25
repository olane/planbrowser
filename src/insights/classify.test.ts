import { describe, it, expect } from 'vitest';
import { classifyPage, isPhotographic, titleFromText } from './classify.js';
import type { PagePixelStats } from './pixels.js';

function stats(overrides: Partial<PagePixelStats>): PagePixelStats {
  return {
    width: 1600,
    height: 1130,
    sampleWidth: 160,
    sampleHeight: 113,
    inkRatio: 0.1,
    colorfulness: 0.02,
    distinctColors: 120,
    grayscale: 0.95,
    edgeDensity: 0.04,
    ...overrides
  };
}

const photographic = stats({ inkRatio: 0.8, colorfulness: 0.32, distinctColors: 3000, grayscale: 0.1, edgeDensity: 0.14 });
const lineArt = stats({ inkRatio: 0.08, colorfulness: 0.01, distinctColors: 40, grayscale: 0.99, edgeDensity: 0.05 });

describe('isPhotographic', () => {
  it('detects photographic pages', () => {
    expect(isPhotographic(photographic)).toBe(true);
    expect(isPhotographic(lineArt)).toBe(false);
  });
});

describe('titleFromText', () => {
  it('picks a title-block line containing a drawing keyword', () => {
    expect(titleFromText('REV\nPROPOSED ELEVATIONS\nSCALE 1:100')).toBe('PROPOSED ELEVATIONS');
  });

  it('prefers a line mentioning proposed or drawing', () => {
    expect(titleFromText('SITE PLAN\nPROPOSED SITE PLAN')).toBe('PROPOSED SITE PLAN');
  });

  it('returns undefined when no drawing keyword is present', () => {
    expect(titleFromText('This is a planning statement about the site.')).toBeUndefined();
  });
});

describe('classifyPage', () => {
  it('keeps an explicit elevation keyword on a line drawing', () => {
    const result = classifyPage(
      { documentType: 'Drawings', description: 'PROPOSED ELEVATIONS' },
      'PROPOSED (Elevations)',
      lineArt,
      { score: 8, kind: 'elevation' }
    );
    expect(result.kind).toBe('elevation');
  });

  it('infers a render for a photographic page with no keyword', () => {
    const result = classifyPage(
      { documentType: 'Application Information', description: 'S20064-ETS26082813240' },
      '',
      photographic,
      { score: 1 }
    );
    expect(result.kind).toBe('render');
  });

  it('keeps a coloured site plan as a map despite photographic stats', () => {
    const result = classifyPage(
      { documentType: 'Drawings', description: 'PROPOSED SITE PLAN' },
      'PROPOSED (Site Plan)',
      photographic,
      { score: 8, kind: 'map' }
    );
    expect(result.kind).toBe('map');
  });

  it('labels using the document description', () => {
    const result = classifyPage(
      { documentType: 'Drawings', description: 'BUILDING A NORTH WEST ELEVATION' },
      '',
      photographic,
      { score: 8, kind: 'elevation' }
    );
    expect(result.label).toBe('BUILDING A NORTH WEST ELEVATION');
  });

  it('penalises existing-only drawings', () => {
    const existing = classifyPage(
      { documentType: 'Drawings', description: 'EXISTING GROUND FLOOR PLAN' },
      '',
      lineArt,
      { score: 8, kind: 'plan' }
    );
    const proposed = classifyPage(
      { documentType: 'Drawings', description: 'PROPOSED GROUND FLOOR PLAN' },
      '',
      lineArt,
      { score: 8, kind: 'plan' }
    );
    expect(existing.score).toBeLessThan(proposed.score);
  });
});
