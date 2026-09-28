import { describe, it, expect } from 'vitest';
import {
  documentPrior,
  isDesignVisualDoc,
  isReferenceVolume,
  isSuperseded,
  kindFromText,
  normalise,
  visualKindFromText
} from './keywords.js';

describe('kindFromText', () => {
  it('recognises a site plan as a plan', () => {
    expect(kindFromText('PROPOSED (Site Plan)')).toBe('plan');
  });
  it('recognises a site location plan as a map', () => {
    expect(kindFromText('EXISTING SITE LOCATION PLAN')).toBe('map');
  });
  it('recognises a block plan as a map', () => {
    expect(kindFromText('LOCATION AND BLOCK PLAN')).toBe('map');
  });
  it('recognises a general arrangement as a plan', () => {
    expect(kindFromText('PROPOSED GENERAL ARRANGEMENT')).toBe('plan');
  });
  it('recognises elevations', () => {
    expect(kindFromText('BUILDING A NORTH WEST ELEVATION')).toBe('elevation');
  });
  it('recognises sections', () => {
    expect(kindFromText('PROPOSED SECTIONS THROUGH TOP FLOOR')).toBe('section');
  });
  it('recognises floor plans', () => {
    expect(kindFromText('PROPOSED GROUND FLOOR PLAN')).toBe('plan');
  });
  it('prefers render over photo for photomontage', () => {
    expect(kindFromText('PHOTOMONTAGE VIEW 5')).toBe('render');
  });
  it('recognises photographs', () => {
    expect(kindFromText('TREE PHOTO')).toBe('photo');
  });
  it('returns undefined when nothing matches', () => {
    expect(kindFromText('S20064-ETS26082813240')).toBeUndefined();
  });
});

describe('visualKindFromText', () => {
  it('reads a render from its caption', () => {
    expect(visualKindFromText("Artist's impression of the proposed park")).toBe('render');
    expect(visualKindFromText('Proposed CGI view from the east')).toBe('render');
    expect(visualKindFromText('Photomontage viewpoint 3')).toBe('render');
  });
  it('reads a photo from its caption or photosheet apparatus', () => {
    expect(visualKindFromText('Existing view along Oxford Road')).toBe('photo');
    expect(visualKindFromText('Season Autumn Direction of view 200 degrees')).toBe('photo');
    expect(visualKindFromText('Single Image VP 30')).toBe('photo');
  });
  it('does not decide on orientation words alone', () => {
    expect(visualKindFromText('existing tree groups, landmark building')).toBeUndefined();
    expect(visualKindFromText('the masterplan seeks a permeable neighbourhood')).toBeUndefined();
  });
});

describe('normalise', () => {
  it('repairs entities and separators', () => {
    expect(normalise('DESIGN &amp; ACCESS-STATEMENT')).toBe('design and access statement');
  });
});

describe('isSuperseded', () => {
  it('flags superseded documents', () => {
    expect(isSuperseded({ documentType: 'Drawings', description: 'SUPERSEDED SITE PLAN' })).toBe(true);
    expect(isSuperseded({ documentType: 'Drawings', description: 'PROPOSED SITE PLAN' })).toBe(false);
  });
});

describe('isDesignVisualDoc', () => {
  it('accepts design statements and visual documents', () => {
    expect(isDesignVisualDoc({ documentType: 'Design and Access Statement', description: 'DESIGN & ACCESS STATEMENT' })).toBe(true);
    expect(isDesignVisualDoc({ documentType: 'Application Information', description: 'LANDSCAPE AND VISUAL IMPACT ASSESSMENT' })).toBe(true);
  });
  it('rejects appendix/figure/report volumes', () => {
    expect(isDesignVisualDoc({ documentType: 'Drawings', description: 'APPENDIX 02-FIGURES' })).toBe(false);
    expect(isDesignVisualDoc({ documentType: 'Application Survey / Assessment / Statement', description: 'TRANSPORT ASSESSMENT' })).toBe(false);
  });
});

describe('isReferenceVolume', () => {
  it('flags appendices, figure books and schedules', () => {
    expect(isReferenceVolume({ documentType: 'Drawings', description: 'APPENDIX 02-FIGURES' })).toBe(true);
    expect(isReferenceVolume({ documentType: 'Application Information', description: 'LVIA APPENDIX 01 METHODOLOGY' })).toBe(true);
  });
  it('does not flag ordinary drawings', () => {
    expect(isReferenceVolume({ documentType: 'Drawings', description: 'PROPOSED SITE PLAN' })).toBe(false);
  });
});

describe('documentPrior', () => {
  it('ranks drawings highly', () => {
    const prior = documentPrior({ documentType: 'Drawings', description: 'PROPOSED SITE PLAN' });
    expect(prior.score).toBeGreaterThan(0);
    expect(prior.kind).toBe('plan');
  });
  it('pushes comments down', () => {
    const comment = documentPrior({ documentType: 'Consultee Comments', description: 'Environment Agency' });
    const drawing = documentPrior({ documentType: 'Drawings', description: 'PROPOSED ELEVATIONS' });
    expect(comment.score).toBeLessThan(drawing.score);
  });
  it('does not boost an appendix of figures as if it were a visual', () => {
    const appendix = documentPrior({ documentType: 'Drawings', description: 'APPENDIX 02-FIGURES' });
    const drawing = documentPrior({ documentType: 'Drawings', description: 'PROPOSED SITE PLAN' });
    expect(appendix.score).toBeLessThan(drawing.score);
  });
  it('keeps the kind when a reference volume names photos', () => {
    const photos = documentPrior({ documentType: 'Photographs', description: 'APPENDIX 03-PHOTOS AND AVRS (VP10-12)' });
    expect(photos.kind).toBe('photo');
  });
  it('penalises superseded documents hard', () => {
    const superseded = documentPrior({ documentType: 'Drawings', description: 'SUPERSEDED PROPOSED SITE PLAN' });
    const current = documentPrior({ documentType: 'Drawings', description: 'PROPOSED SITE PLAN' });
    expect(superseded.score).toBeLessThan(current.score - 5);
  });
});
