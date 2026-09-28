import { describe, it, expect } from 'vitest';
import { isDrawingRegister, pageTitleScore, titleCandidates, titleFromText, type PageLine } from './title.js';

const lines = (...strs: string[]): PageLine[] => strs.map((str) => ({ str, size: 0 }));

describe('titleCandidates', () => {
  it('ranks a qualified title above an inset heading', () => {
    const [first, second] = titleCandidates(lines('LOCATION PLAN 1:1250', 'PROPOSED FIRST FLOOR PLAN'));
    expect(first).toMatchObject({ text: 'PROPOSED FIRST FLOOR PLAN', kind: 'plan', strong: true });
    expect(second).toMatchObject({ kind: 'map', strong: false });
  });

  it('prefers the larger font among equally qualified lines', () => {
    const [first] = titleCandidates([
      { str: 'FRONT ELEVATION', size: 6 },
      { str: 'SIDE ELEVATION', size: 12 }
    ]);
    expect(first?.text).toBe('SIDE ELEVATION');
  });

  it('ignores notes, cross-references and chrome', () => {
    expect(titleCandidates(lines('Refer to elevations drawing 102', 'KEY PLAN', 'SCALE 1:100 SITE PLAN', 'NORTH POINT'))).toEqual([]);
  });

  it('keeps compass-named elevations', () => {
    expect(titleFromText('PROPOSED NORTH ELEVATION')).toBe('PROPOSED NORTH ELEVATION');
  });
});

describe('pageTitleScore', () => {
  it('scores qualified titles, plain titles and registers', () => {
    expect(pageTitleScore(lines('PROPOSED ROOF PLAN'))).toBe(2);
    expect(pageTitleScore(lines('ROOF PLAN'))).toBe(1);
    expect(pageTitleScore(lines('General notes'))).toBe(0);
    const register = lines(...Array.from({ length: 8 }, (_, i) => `PROPOSED ELEVATION ${i + 1}`));
    expect(isDrawingRegister(titleCandidates(register))).toBe(true);
    expect(pageTitleScore(register)).toBe(0);
  });
});
