// Locate the text nearest a page's largest embedded image, so a page's own
// caption can disambiguate a render from a photo. Pure and synchronous so it is
// unit-testable; `render.ts` supplies the pdf.js operator list and text items.

export interface TextItem {
  str: string;
  // PDF user space, origin bottom-left.
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number | undefined;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// The subset of pdf.js operator codes needed to track image placements.
export interface ImageOps {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintImageMaskXObject: number;
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function boxArea(box: Box): number {
  return Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);
}

function bounds(points: [number, number][]): Box {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

const asMatrix = (value: unknown): Matrix => {
  const v = Array.isArray(value) ? value : [];
  return [Number(v[0]), Number(v[1]), Number(v[2]), Number(v[3]), Number(v[4]), Number(v[5])] as Matrix;
};

// Walk a pdf.js operator list, tracking the current transformation matrix, and
// return the bounding box of every painted image. Images are drawn into the unit
// square, so their extent is the transformed [0,1] x [0,1].
export function imageBoxes(fnArray: number[], argsArray: unknown[], ops: ImageOps): Box[] {
  const boxes: Box[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = IDENTITY;

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];
    switch (fn) {
      case ops.save:
        stack.push(ctm);
        break;
      case ops.restore:
        ctm = stack.pop() ?? IDENTITY;
        break;
      case ops.transform:
        ctm = multiply(ctm, asMatrix(args));
        break;
      case ops.paintFormXObjectBegin: {
        stack.push(ctm);
        const matrix = Array.isArray(args) ? args[0] : undefined;
        if (matrix) ctm = multiply(ctm, asMatrix(matrix));
        break;
      }
      case ops.paintFormXObjectEnd:
        ctm = stack.pop() ?? ctm;
        break;
      case ops.paintImageXObject:
      case ops.paintInlineImageXObject:
      case ops.paintImageMaskXObject: {
        boxes.push(
          bounds([apply(ctm, 0, 0), apply(ctm, 1, 0), apply(ctm, 1, 1), apply(ctm, 0, 1)])
        );
        break;
      }
      default:
        break;
    }
  }
  return boxes;
}

function itemBox(item: TextItem): Box {
  const height = item.height > 0 ? item.height : (item.fontSize ?? 8) * 0.7;
  return { x0: item.x, y0: item.y, x1: item.x + item.width, y1: item.y + height };
}

// Join the text within `gap` of `box` (overlapping or just outside), nearest
// first. For a full-bleed image that is the whole page; for an inset figure it
// is the surrounding caption/labels.
export function captionForBox(
  items: TextItem[],
  box: Box,
  pageHeight: number,
  gap = pageHeight * 0.05
): string {
  const scored: { text: string; distance: number; x: number; y: number }[] = [];
  for (const item of items) {
    const text = (item.str ?? '').trim();
    if (!text) continue;
    const b = itemBox(item);
    const dx = Math.max(box.x0 - b.x1, b.x0 - box.x1, 0);
    const dy = Math.max(box.y0 - b.y1, b.y0 - box.y1, 0);
    if (dx > 0) continue; // no horizontal overlap at all
    if (dy > gap) continue;
    scored.push({ text, distance: dy, x: b.x0, y: b.y0 });
  }
  scored.sort((a, b) => a.distance - b.distance || b.y - a.y || a.x - b.x);
  return scored
    .map((s) => s.text)
    .join(' ')
    .slice(0, 800);
}
