import { describe, it, expect } from 'vitest';
import { getDocumentProxy } from 'unpdf';
import { extractPageLines, groupLines, scanPage } from './render.js';
import { buildPdf, photoFill } from './__fixtures__/pdf.js';

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

describe('pdf extraction', () => {
  const pdf = buildPdf([
    { texts: [{ x: 600, y: 40, size: 14, str: 'PROPOSED SITE PLAN' }, { x: 40, y: 40, size: 8, str: 'Location plan 1:1250' }] },
    {
      image: { x: 0, y: 0, w: 421, h: 595, pxW: 1200, pxH: 800, fill: photoFill },
      texts: [{ x: 20, y: 610, size: 10, str: 'unrelated header' }, { x: 440, y: 300, size: 10, str: 'far away' }]
    }
  ]);

  it('extracts per-page lines with font sizes', async () => {
    const pages = await extractPageLines(await getDocumentProxy(new Uint8Array(pdf)));
    expect(pages[0]).toEqual([
      { str: 'PROPOSED SITE PLAN', size: 14 },
      { str: 'Location plan 1:1250', size: 8 }
    ]);
  });

  it('reads image size from the operator list', async () => {
    const doc = await getDocumentProxy(new Uint8Array(pdf));
    expect(await scanPage(doc, 1, 1)).toEqual({ imageCount: 0, largestImageArea: 0, caption: '' });
    const scan = await scanPage(doc, 2, 1);
    expect(scan.imageCount).toBe(1);
    expect(scan.largestImageArea).toBe(1200 * 800);
    // Text beside the image is its caption; text far from it is not.
    expect(scan.caption).not.toContain('far away');
  });
});
