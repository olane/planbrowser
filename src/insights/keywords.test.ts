import { describe, it, expect } from 'vitest';
import {
  kindFromText,
  kindsFromText,
  profileDocument,
  normalise,
  visualKindFromText
} from './keywords.js';

const priorOf = (doc: { documentType?: string; description?: string; localFilename?: string }) =>
  profileDocument(doc).prior;

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

describe('profileDocument.superseded', () => {
  it('flags superseded documents', () => {
    expect(profileDocument({ documentType: 'Drawings', description: 'SUPERSEDED SITE PLAN' }).superseded).toBe(true);
    expect(profileDocument({ documentType: 'Drawings', description: 'PROPOSED SITE PLAN' }).superseded).toBe(false);
  });
});

describe('profileDocument.designVisual', () => {
  it('accepts design statements and visual documents', () => {
    expect(profileDocument({ documentType: 'Design and Access Statement', description: 'DESIGN & ACCESS STATEMENT' }).designVisual).toBe(true);
    expect(profileDocument({ documentType: 'Application Information', description: 'LANDSCAPE AND VISUAL IMPACT ASSESSMENT' }).designVisual).toBe(true);
  });
  it('rejects appendix/figure/report volumes', () => {
    expect(profileDocument({ documentType: 'Drawings', description: 'APPENDIX 02-FIGURES' }).designVisual).toBe(false);
    expect(profileDocument({ documentType: 'Application Survey / Assessment / Statement', description: 'TRANSPORT ASSESSMENT' }).designVisual).toBe(false);
  });
});

describe('profileDocument.referenceVolume', () => {
  it('flags appendices, figure books and schedules', () => {
    expect(profileDocument({ documentType: 'Drawings', description: 'APPENDIX 02-FIGURES' }).referenceVolume).toBe(true);
    expect(profileDocument({ documentType: 'Application Information', description: 'LVIA APPENDIX 01 METHODOLOGY' }).referenceVolume).toBe(true);
  });
  it('does not flag ordinary drawings', () => {
    expect(profileDocument({ documentType: 'Drawings', description: 'PROPOSED SITE PLAN' }).referenceVolume).toBe(false);
  });
});

describe('document prior', () => {
  it('ranks drawings highly', () => {
    const prior = priorOf({ documentType: 'Drawings', description: 'PROPOSED SITE PLAN' });
    expect(prior.score).toBeGreaterThan(0);
    expect(prior.kind).toBe('plan');
  });
  it('pushes comments down', () => {
    const comment = priorOf({ documentType: 'Consultee Comments', description: 'Environment Agency' });
    const drawing = priorOf({ documentType: 'Drawings', description: 'PROPOSED ELEVATIONS' });
    expect(comment.score).toBeLessThan(drawing.score);
  });
  it('does not boost an appendix of figures as if it were a visual', () => {
    const appendix = priorOf({ documentType: 'Drawings', description: 'APPENDIX 02-FIGURES' });
    const drawing = priorOf({ documentType: 'Drawings', description: 'PROPOSED SITE PLAN' });
    expect(appendix.score).toBeLessThan(drawing.score);
  });
  it('keeps the kind when a reference volume names photos', () => {
    const photos = priorOf({ documentType: 'Photographs', description: 'APPENDIX 03-PHOTOS AND AVRS (VP10-12)' });
    expect(photos.kind).toBe('photo');
  });
  it('penalises superseded documents hard', () => {
    const superseded = priorOf({ documentType: 'Drawings', description: 'SUPERSEDED PROPOSED SITE PLAN' });
    const current = priorOf({ documentType: 'Drawings', description: 'PROPOSED SITE PLAN' });
    expect(superseded.score).toBeLessThan(current.score - 5);
  });
  it('opens a visual-sounding document that names no kind', () => {
    expect(priorOf({ documentType: 'Application Information', description: 'Image Board' }).score).toBeGreaterThan(0);
  });
});

describe('keyword fixes', () => {
  it("matches artist's impression after normalisation", () => {
    expect(kindFromText("Artist's impression of the square")).toBe('render');
    expect(priorOf({ documentType: 'Supporting Documents', description: "Artist's Impression" }).score).toBeGreaterThan(0);
  });
  it('matches plural photos', () => {
    expect(kindFromText('Site Photos')).toBe('photo');
  });
  it('does not read legal/statutory sections as drawing sections', () => {
    expect(kindFromText('Section 106 heads of terms')).toBeUndefined();
    expect(kindFromText('Section 73 variation of condition 2')).toBeUndefined();
    expect(kindFromText('PROPOSED SECTION A-A')).toBe('section');
  });
});

describe('kindsFromText', () => {
  it('lists every kind a drawing pack names', () => {
    expect(kindsFromText('Proposed plans and elevations')).toEqual(['elevation', 'plan']);
    expect(kindsFromText('Proposed floor plans and elevations')).toEqual(['elevation', 'plan']);
  });
});

describe('profileDocument', () => {
  it('computes the name facts once', () => {
    const profile = profileDocument({ documentType: 'Design and Access Statement', description: 'DESIGN & ACCESS STATEMENT' });
    expect(profile.designAndAccess).toBe(true);
    expect(profile.designVisual).toBe(true);
    expect(profile.drawing).toBe(false);
    expect(profile.visualName).toBe(true);
    expect(profile.prior.score).toBeGreaterThan(5);
  });
  it('flags admin files by description/filename', () => {
    expect(profileDocument({ documentType: 'Application Information', description: 'Application Form' }).admin).toBe(true);
  });
});
