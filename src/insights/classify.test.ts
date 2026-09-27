import { describe, it, expect } from 'vitest';
import { classifyPage, isFlatGraphic, isFullBleed, isPhotographic, isProsePage, titleFromText } from './classify.js';
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
    dominantColorRatio: 0.3,
    grayscale: 0.95,
    edgeDensity: 0.04,
    phash: '0'.repeat(16),
    ...overrides
  };
}

const photographic = stats({ inkRatio: 0.8, colorfulness: 0.32, distinctColors: 3000, grayscale: 0.1, edgeDensity: 0.14 });
const lineArt = stats({ inkRatio: 0.08, colorfulness: 0.01, distinctColors: 40, grayscale: 0.99, edgeDensity: 0.05 });
const cover = stats({ inkRatio: 0.89, colorfulness: 0.62, distinctColors: 15, dominantColorRatio: 0.75, grayscale: 0.23, edgeDensity: 0.066 });
// A muted full-bleed CGI render: covers the sheet, many tones, no flat colour.
const fullBleed = stats({ inkRatio: 0.97, colorfulness: 0.05, distinctColors: 90, dominantColorRatio: 0.2, grayscale: 0.4, edgeDensity: 0.08 });

describe('isPhotographic', () => {
  it('detects photographic pages', () => {
    expect(isPhotographic(photographic)).toBe(true);
    expect(isPhotographic(lineArt)).toBe(false);
  });

  it('detects muted full-bleed renders', () => {
    expect(isPhotographic(fullBleed)).toBe(true);
    expect(isFullBleed(fullBleed)).toBe(true);
  });
});

describe('isFlatGraphic', () => {
  it('detects a flat brand-coloured cover page', () => {
    expect(isFlatGraphic(cover)).toBe(true);
    expect(isFlatGraphic(photographic)).toBe(false);
    expect(isFlatGraphic(lineArt)).toBe(false);
  });
});

describe('isProsePage', () => {
  it('flags several long lines when the page is not line-structured', () => {
    const prose = 'This is a long sentence that runs well beyond sixty characters in length.\nAnd another long sentence also comfortably over sixty characters long.\nA third long sentence that is also more than sixty characters long indeed.';
    expect(isProsePage(prose, lineArt)).toBe(true);
    expect(isProsePage('PROPOSED ELEVATIONS\nSCALE 1:100\nREV A', lineArt)).toBe(false);
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

  it('keeps a coloured location plan as a map despite photographic stats', () => {
    const result = classifyPage(
      { documentType: 'Drawings', description: 'PROPOSED SITE LOCATION PLAN' },
      'PROPOSED (Site Location Plan)',
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

  it('does not turn prose pages of a name-keyworded document into plans', () => {
    const prose =
      'A dynamic and inclusive academic community with a powerful heritage.\nThe above commitment is demonstrated in the statistics below and elsewhere.\nCommunity as our foundation, supporting excellence and a sense of purpose.';
    const result = classifyPage(
      { documentType: 'Application Information', description: 'COLLEGES ESTATE MASTERPLAN VISION' },
      prose,
      lineArt,
      { score: 5, kind: 'plan' }
    );
    expect(result.score).toBe(0);
  });

  it('drops a flat appendix cover even when the document mentions photographs', () => {
    const result = classifyPage(
      { documentType: 'Photographs', description: 'APPENDIX 03-PHOTOSHEETS AND AVRS VP30-34' },
      'CAMBRIDGE SCIENCE PARK Appendix 03: Photosheets and AVRs (Viewpoints 30-34)',
      cover,
      { score: 4, kind: 'photo' }
    );
    expect(result.score).toBe(0);
  });

  it('classifies a muted full-bleed statement figure as a render', () => {
    const result = classifyPage(
      { documentType: 'Application Information', description: 'DESIGN AND ACCESS STATEMENT' },
      '',
      fullBleed,
      { score: 4 }
    );
    expect(result.kind).toBe('render');
  });

  it('does not let prose mentioning a plan word override a full-bleed render', () => {
    const result = classifyPage(
      { documentType: 'Drawings', description: 'DESIGN AND ACCESS STATEMENT PART 4' },
      '4.2.2 The masterplan seeks to create a permeable neighbourhood, improving connectivity between the site and its surrounding context through a network of routes.',
      fullBleed,
      { score: 4 }
    );
    expect(result.kind).toBe('render');
  });

  it('does not penalise a render that mentions existing features', () => {
    const result = classifyPage(
      { documentType: 'Application Information', description: 'DESIGN AND ACCESS STATEMENT' },
      'A new neighbourhood with existing tree groups retained.',
      fullBleed,
      { score: 4 }
    );
    expect(result.score).toBeGreaterThan(100);
  });

  it('keeps a statement figure (large embedded image) that is not full-bleed', () => {
    const figure = stats({ inkRatio: 0.35, colorfulness: 0.03, distinctColors: 80, dominantColorRatio: 0.6, grayscale: 0.8, edgeDensity: 0.1 });
    const kept = classifyPage(
      { documentType: 'Design and Access Statement', description: 'DESIGN & ACCESS STATEMENT' },
      'Some body text describing the existing streetscape.',
      figure,
      { score: 6.5 },
      { hasLargeImage: true }
    );
    expect(kept.kind).toBe('render');
    expect(kept.score).toBeGreaterThan(0);

    const dropped = classifyPage(
      { documentType: 'Design and Access Statement', description: 'DESIGN & ACCESS STATEMENT' },
      'Some body text describing the existing streetscape.',
      figure,
      { score: 6.5 }
    );
    expect(dropped.score).toBe(0);
  });
});
