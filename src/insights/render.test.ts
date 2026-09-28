import { describe, it, expect } from 'vitest';
import { groupLines } from './render.js';

describe('groupLines', () => {
  it('joins items on one baseline and splits separate cells', () => {
    const lines = groupLines([
      { str: 'PROPOSED', x: 600, y: 40, width: 60, height: 10, fontSize: 10 },
      { str: 'SITE PLAN', x: 663, y: 40, width: 60, height: 10, fontSize: 10 },
      { str: 'Location plan 1:1250', x: 40, y: 40, width: 90, height: 8, fontSize: 8 },
      { str: 'Rev A', x: 600, y: 20, width: 30, height: 8, fontSize: 8 }
    ]);
    expect(lines).toEqual([
      { str: 'PROPOSED SITE PLAN', size: 10 },
      { str: 'Location plan 1:1250', size: 8 },
      { str: 'Rev A', size: 8 }
    ]);
  });
});
