import type { InsightImageKind } from '../types.js';

// A page's embedded-image signal, gathered cheaply (no page rasterisation).
export interface ScannedPage {
  page: number;
  textLength: number;
  imageCount: number;
  largestImageArea: number;
}

// An embedded image must cover at least this many pixels to count as a
// full-page render/photo (roughly a 1000x700 image).
export const LARGE_IMAGE_AREA = 1000 * 700;

export function pageImageScore(page: ScannedPage): number {
  if (page.largestImageArea < LARGE_IMAGE_AREA) return 0;
  const countScore = Math.min(page.imageCount, 3) * 10;
  const areaScore = Math.min(page.largestImageArea / 1_000_000, 4) * 10;
  return countScore + areaScore;
}

// Which pages of a document to rasterise.
// - A known drawing/photograph document puts its visual on the first page(s),
//   and vector plans carry no embedded images at all, so take from the front.
// - A statement/appendix document is scanned for large embedded images, so a
//   render on page 12 is found without rendering the eleven before it.
export function selectDocumentPages(
  priorKind: InsightImageKind | undefined,
  pageCount: number,
  scanned: ScannedPage[],
  cap: number
): number[] {
  const pages = Math.max(pageCount, 1);
  if (priorKind) {
    const out: number[] = [];
    for (let page = 1; page <= pages && out.length < cap; page++) out.push(page);
    return out;
  }
  return scanned
    .map((page) => ({ page: page.page, score: pageImageScore(page) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.page - b.page)
    .slice(0, Math.max(cap, 0))
    .map((entry) => entry.page)
    .sort((a, b) => a - b);
}
