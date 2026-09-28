import { describe, it, expect } from 'vitest';
import { imagePlacements, captionForBox, boxArea, type ImageOps, type TextItem } from './caption.js';

const imageBoxes = (fn: number[], args: unknown[], ops: ImageOps) => imagePlacements(fn, args, ops).map((p) => p.box);

const OPS: ImageOps = {
  save: 1,
  restore: 2,
  transform: 3,
  paintFormXObjectBegin: 4,
  paintFormXObjectEnd: 5,
  paintImageXObject: 6,
  paintInlineImageXObject: 7,
  paintImageMaskXObject: 8
};

function item(str: string, x: number, y: number, width = 40, height = 10): TextItem {
  return { str, x, y, width, height };
}

describe('imagePlacements', () => {
  it('applies the current transform to the unit-square image', () => {
    const boxes = imageBoxes([OPS.transform, OPS.paintImageXObject], [[2, 0, 0, 2, 10, 20], []], OPS);
    expect(boxes).toEqual([{ x0: 10, y0: 20, x1: 12, y1: 22 }]);
  });

  it('restores the matrix after a save/restore block', () => {
    const fn = [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore, OPS.paintImageXObject];
    const args = [[], [5, 0, 0, 5, 0, 0], [], [], []];
    const boxes = imageBoxes(fn, args, OPS);
    expect(boxes).toEqual([
      { x0: 0, y0: 0, x1: 5, y1: 5 },
      { x0: 0, y0: 0, x1: 1, y1: 1 }
    ]);
  });

  it('picks the largest image area', () => {
    expect(boxArea({ x0: 0, y0: 0, x1: 2, y1: 2 })).toBe(4);
    expect(boxArea({ x0: 0, y0: 0, x1: 1, y1: 3 })).toBe(3);
  });
});

describe('captionForBox', () => {
  const pageHeight = 800;

  it('joins the text beside and below the image, ignoring the far side', () => {
    const box = { x0: 100, y0: 300, x1: 500, y1: 600 };
    const items = [
      item('artist impression of the proposed scheme', 110, 270),
      item('unrelated header', 110, 780),
      item('off to the side', 700, 400)
    ];
    expect(captionForBox(items, box, pageHeight)).toBe('artist impression of the proposed scheme');
  });

  it('returns the whole page for a full-bleed image', () => {
    const box = { x0: 0, y0: 0, x1: 600, y1: 800 };
    const items = [item('proposed', 10, 700), item('existing view', 10, 100)];
    expect(captionForBox(items, box, pageHeight)).toBe('proposed existing view');
  });
});
