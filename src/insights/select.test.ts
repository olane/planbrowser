import { describe, it, expect } from 'vitest';
import { selectImages } from './select.js';
import type { InsightImage } from '../types.js';

function image(overrides: Partial<InsightImage>): InsightImage {
  return {
    id: 'a'.repeat(40),
    kind: 'plan',
    label: 'PLAN',
    localFilename: 'doc.pdf',
    page: 1,
    imageFile: `${'a'.repeat(40)}.png`,
    width: 1600,
    height: 1130,
    score: 50,
    ...overrides
  };
}

describe('selectImages', () => {
  it('dedupes by content id, keeping the highest score', () => {
    const out = selectImages([image({ score: 10 }), image({ score: 90 })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.score).toBe(90);
  });

  it('caps the number of images per kind', () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      image({ id: i.toString(16).padStart(40, '0'), kind: 'plan', localFilename: `plan-${i}.pdf`, score: 100 - i })
    );
    const out = selectImages(candidates, { caps: { plan: 3 } });
    expect(out.filter((i) => i.kind === 'plan')).toHaveLength(3);
  });

  it('respects the overall cap', () => {
    const candidates = Array.from({ length: 20 }, (_, i) =>
      image({ id: i.toString(16).padStart(40, '0'), kind: 'render', localFilename: `render-${i}.pdf`, score: 100 - i })
    );
    const out = selectImages(candidates, { total: 5 });
    expect(out).toHaveLength(5);
  });

  it('limits images from a single document', () => {
    const candidates = Array.from({ length: 6 }, (_, i) =>
      image({ id: i.toString(16).padStart(40, '0'), kind: 'plan', localFilename: 'one.pdf', score: 100 - i })
    );
    const out = selectImages(candidates, { maxPerDocument: 2 });
    expect(out).toHaveLength(2);
  });

  it('orders renders before plans before other', () => {
    const out = selectImages([
      image({ id: '1'.repeat(40), kind: 'other', score: 200 }),
      image({ id: '2'.repeat(40), kind: 'render', score: 10 }),
      image({ id: '3'.repeat(40), kind: 'plan', score: 10 })
    ]);
    expect(out.map((i) => i.kind)).toEqual(['render', 'plan', 'other']);
  });
});
