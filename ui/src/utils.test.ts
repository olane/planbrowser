import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { timeAgo, statusLabel, progressText, statusBadgeClass, isKeyDocument, partNumber, partLabel, multipartBase, multipartUnit, groupDocuments } from './utils';

const NOW = new Date('2026-01-15T12:00:00.000Z');

function isoAgo(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('timeAgo', () => {
  it('handles missing and invalid dates', () => {
    expect(timeAgo(undefined)).toBe('Unknown');
    expect(timeAgo('not-a-date')).toBe('Unknown');
  });

  it('describes very recent dates', () => {
    expect(timeAgo(isoAgo(10_000))).toBe('Just now');
    expect(timeAgo(isoAgo(45_000))).toBe('45 seconds ago');
  });

  it('describes minutes and hours', () => {
    expect(timeAgo(isoAgo(90_000))).toBe('1 minute ago');
    expect(timeAgo(isoAgo(5 * 60_000))).toBe('5 minutes ago');
    expect(timeAgo(isoAgo(90 * 60_000))).toBe('1 hour ago');
    expect(timeAgo(isoAgo(3 * 3_600_000))).toBe('3 hours ago');
  });

  it('describes days and falls back to a date for older entries', () => {
    expect(timeAgo(isoAgo(25 * 3_600_000))).toBe('Yesterday');
    expect(timeAgo(isoAgo(3 * 86_400_000))).toBe('3 days ago');
    expect(timeAgo(isoAgo(10 * 86_400_000))).toMatch(/\d{4}/);
  });
});

describe('statusLabel', () => {
  it('infers permitted from the decision', () => {
    const app = { status: 'Decided', furtherInformation: { Decision: 'Granted' } };
    expect(statusLabel(app)).toBe('Permitted');
    expect(statusLabel({ status: 'Decided', furtherInformation: { Decision: 'Approved' } })).toBe('Permitted');
  });

  it('infers refused from the decision', () => {
    expect(statusLabel({ status: 'Decided', furtherInformation: { Decision: 'Refused' } })).toBe('Refused');
  });

  it('falls back to the raw status otherwise', () => {
    expect(statusLabel({ status: 'Pending' })).toBe('Pending');
    expect(statusLabel({ status: 'Decided', furtherInformation: {} })).toBe('Decided');
  });
});

describe('progressText', () => {
  it('renders just the message when there is no total', () => {
    expect(progressText({ message: 'Working' })).toBe('Working');
  });

  it('renders a fraction when a total is present', () => {
    expect(progressText({ message: 'Working', current: 2, total: 5 })).toBe('Working (2/5)');
    expect(progressText({ message: 'Working', total: 5 })).toBe('Working (0/5)');
  });
});

describe('statusBadgeClass', () => {
  it('colours refused red and permitted green', () => {
    expect(statusBadgeClass({ status: 'Decided', furtherInformation: { Decision: 'Refused' } })).toContain('red');
    expect(statusBadgeClass({ status: 'Decided', furtherInformation: { Decision: 'Granted' } })).toContain('green');
  });

  it('defaults to blue', () => {
    expect(statusBadgeClass({ status: 'Pending' })).toContain('blue');
  });
});

describe('isKeyDocument', () => {
  it('matches on the document type', () => {
    expect(isKeyDocument({ documentType: 'Design and Access Statement', description: 'DESIGN AND ACCESS STATEMENT PART 1' })).toBe(true);
  });

  it('matches on the description/name when the type is generic', () => {
    expect(isKeyDocument({ documentType: 'Application Information', description: 'DESIGN & ACCESS STATEMENT PART 2' })).toBe(true);
  });

  it('matches on the local filename', () => {
    expect(isKeyDocument({ documentType: 'Drawings', description: '24032_01_...', localFilename: '18 May 2026 - Drawings - DESIGN AND ACCESS STATEMENT PART 4.pdf' })).toBe(true);
  });

  it('treats & and &amp; as "and"', () => {
    expect(isKeyDocument({ documentType: 'Application Information', description: 'DESIGN & ACCESS STATEMENT PART 3' })).toBe(true);
    expect(isKeyDocument({ documentType: 'Application Information', description: 'DESIGN &amp; ACCESS STATEMENT PART 4' })).toBe(true);
  });

  it('rejects ordinary documents', () => {
    expect(isKeyDocument({ documentType: 'Drawings', description: 'PROPOSED SITE PLAN' })).toBe(false);
    expect(isKeyDocument({ documentType: 'Application Information', description: 'FEE CALCULATION' })).toBe(false);
  });
});

describe('partNumber', () => {
  it('parses a trailing part number', () => {
    expect(partNumber('DESIGN AND ACCESS STATEMENT PART 2')).toBe(2);
    expect(partNumber('Transport Assessment part 12')).toBe(12);
  });

  it('matches PT abbreviations', () => {
    expect(partNumber('ENVIRONMENTAL STATEMENT PT 3')).toBe(3);
  });

  it('parses sheet numbers with an of-total', () => {
    expect(partNumber('BUILDING A ELEVATIONS - SHEET 1 OF 2')).toBe(1);
    expect(partNumber('BUILDING A ELEVATIONS - SHEET 2 OF 2')).toBe(2);
  });

  it('parses a bare N of M', () => {
    expect(partNumber('ARCHAEOLOGICAL DESK BASED ASSESSMENT 1 OF 2')).toBe(1);
  });

  it('returns null without a numbered part', () => {
    expect(partNumber('PROPOSED SITE PLAN')).toBeNull();
    expect(partNumber(undefined)).toBeNull();
  });

  it('ignores bare trailing numbers that are not parts', () => {
    expect(partNumber('PLANNING STATEMENT PAGE 61')).toBeNull();
    expect(partNumber('TREE SURVEY 2026')).toBeNull();
  });
});

describe('partLabel', () => {
  it('returns the trailing part marker verbatim', () => {
    expect(partLabel('DESIGN AND ACCESS STATEMENT PART 2')).toBe('PART 2');
    expect(partLabel('Design and Access Statement part 1')).toBe('part 1');
  });

  it('returns the sheet marker verbatim', () => {
    expect(partLabel('BUILDING A ELEVATIONS - SHEET 1 OF 2')).toBe('SHEET 1 OF 2');
  });

  it('returns null without a part', () => {
    expect(partLabel('PROPOSED SITE PLAN')).toBeNull();
  });
});

describe('multipartUnit', () => {
  it('distinguishes sheets from parts from repeated names', () => {
    expect(multipartUnit('BUILDING A ELEVATIONS - SHEET 1 OF 2')).toBe('sheet');
    expect(multipartUnit('DESIGN AND ACCESS STATEMENT PART 1')).toBe('part');
    expect(multipartUnit('ARCHAEOLOGICAL DESK BASED ASSESSMENT 1 OF 2')).toBe('part');
    expect(multipartUnit('SITE PLAN')).toBe('document');
  });
});

describe('multipartBase', () => {
  it('strips the trailing part marker', () => {
    expect(multipartBase('DESIGN AND ACCESS STATEMENT PART 2')).toBe('DESIGN AND ACCESS STATEMENT');
  });

  it('strips a trailing sheet marker and its separator', () => {
    expect(multipartBase('BUILDING A ELEVATIONS - SHEET 1 OF 2')).toBe('BUILDING A ELEVATIONS');
    expect(multipartBase('PROPOSED ELEVATIONS SHEET 2 OF 3')).toBe('PROPOSED ELEVATIONS');
  });

  it('strips a bare N of M', () => {
    expect(multipartBase('ARCHAEOLOGICAL DESK BASED ASSESSMENT 1 OF 2')).toBe('ARCHAEOLOGICAL DESK BASED ASSESSMENT');
  });

  it('returns null for unnumbered descriptions', () => {
    expect(multipartBase('DESIGN AND ACCESS STATEMENT')).toBeNull();
    expect(multipartBase(undefined)).toBeNull();
  });

  it('returns null for bare trailing numbers that are not parts', () => {
    expect(multipartBase('PLANNING STATEMENT PAGE 61')).toBeNull();
    expect(multipartBase('TREE SURVEY 2026')).toBeNull();
  });
});

describe('groupDocuments', () => {
  const doc = (description: string) => ({ description });

  it('groups numbered siblings under the base title in numeric order', () => {
    const docs = [
      doc('SITE PLAN'),
      doc('TRANSPORT ASSESSMENT PART 2'),
      doc('TRANSPORT ASSESSMENT PART 10'),
      doc('TRANSPORT ASSESSMENT PART 1'),
    ];
    expect(groupDocuments(docs)).toEqual([
      { kind: 'doc', doc: docs[0] },
      { kind: 'group', title: 'TRANSPORT ASSESSMENT', parts: [docs[3], docs[1], docs[2]] },
    ]);
  });

  it('keeps an isolated part as a plain row', () => {
    const docs = [doc('DESIGN AND ACCESS STATEMENT PART 1')];
    expect(groupDocuments(docs)).toEqual([{ kind: 'doc', doc: docs[0] }]);
  });

  it('is case-insensitive when matching bases', () => {
    const docs = [
      doc('Design and Access Statement part 1'),
      doc('DESIGN AND ACCESS STATEMENT PART 2'),
    ];
    const entries = groupDocuments(docs);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('group');
    if (entries[0].kind === 'group') {
      expect(entries[0].title).toBe('Design and Access Statement');
      expect(entries[0].parts).toHaveLength(2);
    }
  });

  it('groups in the position of the first member and preserves document order elsewhere', () => {
    const docs = [
      doc('A'),
      doc('HERITAGE STATEMENT PART 2'),
      doc('B'),
      doc('HERITAGE STATEMENT PART 1'),
      doc('C'),
    ];
    const entries = groupDocuments(docs);
    expect(entries.map((e) => (e.kind === 'group' ? `group:${e.title}` : e.doc.description))).toEqual([
      'A',
      'group:HERITAGE STATEMENT',
      'B',
      'C',
    ]);
    if (entries[1].kind === 'group') {
      expect(entries[1].parts.map((p) => p.description)).toEqual([
        'HERITAGE STATEMENT PART 1',
        'HERITAGE STATEMENT PART 2',
      ]);
    }
  });

  it('does not merge distinct-but-similar titles', () => {
    const docs = [doc('SECONDARY GLAZING EXISTING PART 1'), doc('SECONDARY GLAZING PROPOSED PART 2')];
    expect(groupDocuments(docs).every((e) => e.kind === 'doc')).toBe(true);
  });

  it('groups sheets sharing a title under the base name', () => {
    const docs = [
      doc('BUILDING A ELEVATIONS - SHEET 1 OF 2'),
      doc('BUILDING A ELEVATIONS - SHEET 2 OF 2'),
    ];
    expect(groupDocuments(docs)).toEqual([
      { kind: 'group', title: 'BUILDING A ELEVATIONS', parts: [docs[0], docs[1]] },
    ]);
  });

  it('orders sheets numerically across an of-total', () => {
    const docs = [
      doc('BUILDING D ELEVATIONS - SHEET 10 OF 10'),
      doc('BUILDING D ELEVATIONS - SHEET 2 OF 10'),
      doc('BUILDING D ELEVATIONS - SHEET 1 OF 10'),
    ];
    const entries = groupDocuments(docs);
    expect(entries).toHaveLength(1);
    if (entries[0].kind === 'group') {
      expect(entries[0].parts.map((p) => p.description)).toEqual([
        'BUILDING D ELEVATIONS - SHEET 1 OF 10',
        'BUILDING D ELEVATIONS - SHEET 2 OF 10',
        'BUILDING D ELEVATIONS - SHEET 10 OF 10',
      ]);
    }
  });

  it('groups bare N of M documents sharing a base', () => {
    const docs = [
      doc('ARCHAEOLOGICAL DESK BASED ASSESSMENT 1 OF 2'),
      doc('ARCHAEOLOGICAL DESK BASED ASSESSMENT 2 OF 2'),
    ];
    expect(groupDocuments(docs)).toEqual([
      { kind: 'group', title: 'ARCHAEOLOGICAL DESK BASED ASSESSMENT', parts: [docs[0], docs[1]] },
    ]);
  });

  it('does not group documents merely ending in a number', () => {
    const docs = [doc('SITE INVESTIGATION REPORT 1'), doc('TREE SURVEY 2026')];
    expect(groupDocuments(docs).every((e) => e.kind === 'doc')).toBe(true);
  });

  it('groups documents that repeat the same name', () => {
    const docs = [
      doc('135 OXFORD ROAD'),
      doc('107 OXFORD ROAD'),
      doc('135 OXFORD ROAD'),
      doc('135 OXFORD ROAD'),
    ];
    expect(groupDocuments(docs)).toEqual([
      { kind: 'group', title: '135 OXFORD ROAD', parts: [docs[0], docs[2], docs[3]] },
      { kind: 'doc', doc: docs[1] },
    ]);
  });

  it('keeps a unique plain name as a single row', () => {
    const docs = [doc('ECOLOGY')];
    expect(groupDocuments(docs)).toEqual([{ kind: 'doc', doc: docs[0] }]);
  });

  it('groups a SUPERSEDED copy with its current document', () => {
    const docs = [
      doc('SUPERSEDED TREE SURVEY'),
      doc('TREE SURVEY'),
    ];
    expect(groupDocuments(docs)).toEqual([
      { kind: 'group', title: 'TREE SURVEY', parts: [docs[0], docs[1]] },
    ]);
  });

  it('groups a SUPERSEDED sheet copy with its current sheets', () => {
    const docs = [
      doc('BUILDING D ELEVATIONS - SHEET 1 OF 2'),
      doc('SUPERSEDED BUILDING D ELEVATIONS - SHEET 2 OF 2'),
      doc('BUILDING D ELEVATIONS - SHEET 2 OF 2'),
    ];
    const entries = groupDocuments(docs);
    expect(entries).toEqual([
      { kind: 'group', title: 'BUILDING D ELEVATIONS', parts: [docs[0], docs[1], docs[2]] },
    ]);
  });

  it('does not merge a superseded name with an unrelated one', () => {
    const docs = [doc('SUPERSEDED TREE SURVEY'), doc('TREE SURVEY AND AIA')];
    expect(groupDocuments(docs).every((e) => e.kind === 'doc')).toBe(true);
  });
});
