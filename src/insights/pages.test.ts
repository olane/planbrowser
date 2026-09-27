import { describe, it, expect } from 'vitest';
import { LARGE_IMAGE_AREA, pageImageScore, selectDocumentPages, type ScannedPage } from './pages.js';

function page(overrides: Partial<ScannedPage>): ScannedPage {
  return { page: 1, textLength: 100, imageCount: 0, largestImageArea: 0, ...overrides };
}

describe('pageImageScore', () => {
  it('only scores pages carrying a large embedded image', () => {
    expect(pageImageScore(page({ largestImageArea: 0 }))).toBe(0);
    expect(pageImageScore(page({ largestImageArea: LARGE_IMAGE_AREA - 1 }))).toBe(0);
    expect(pageImageScore(page({ imageCount: 1, largestImageArea: LARGE_IMAGE_AREA }))).toBeGreaterThan(0);
  });
});

describe('selectDocumentPages', () => {
  it('takes from the front for known drawing/photo documents', () => {
    expect(selectDocumentPages('plan', 10, [], 3)).toEqual([1, 2, 3]);
  });

  it('picks the most image-rich pages for statement/appendix documents', () => {
    const scanned = [
      page({ page: 1, textLength: 300 }),
      page({ page: 2, textLength: 2000 }),
      page({ page: 3, textLength: 900, imageCount: 1, largestImageArea: 1_800_000 }),
      page({ page: 4, textLength: 1000, imageCount: 3, largestImageArea: 2_000_000 }),
      page({ page: 5, textLength: 800 })
    ];
    expect(selectDocumentPages(undefined, 5, scanned, 2)).toEqual([3, 4]);
  });

  it('returns nothing when no page has a large image', () => {
    expect(selectDocumentPages(undefined, 3, [page({}), page({ page: 2 })], 4)).toEqual([]);
  });
});
