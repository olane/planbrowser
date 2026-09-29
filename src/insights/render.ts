import fs from 'fs';
import { getDocumentProxy, getResolvedPDFJS, renderPageAsImage } from 'unpdf';
import { boxArea, captionForBox, imagePlacements, type ImageOps, type TextItem } from './caption.js';
import type { PageLine } from './title.js';

// pdf.js access: the only module that talks to the PDF library. Everything it
// returns is plain data, cached by `features.ts` and interpreted elsewhere.

export type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

interface RawTextItem {
  str?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
  hasEOL?: unknown;
}

export function isPdf(filename: string): boolean {
  return /\.pdf$/i.test(filename);
}

export async function openPdf(filePath: string): Promise<PdfDocument> {
  const data = new Uint8Array(fs.readFileSync(filePath));
  // verbosity: 0 silences pdf.js warnings for malformed fonts.
  return getDocumentProxy(data, { verbosity: 0 });
}

function toTextItems(items: RawTextItem[]): TextItem[] {
  const out: TextItem[] = [];
  for (const raw of items) {
    if (typeof raw.str !== 'string') continue;
    const t = Array.isArray(raw.transform) ? raw.transform.map(Number) : [];
    const height = Number(raw.height) || 0;
    // The glyph matrix's vertical scale is the font size in user space.
    const fontSize = Math.hypot(t[2] ?? 0, t[3] ?? 0) || height;
    out.push({
      str: raw.str,
      x: t[4] || 0,
      y: t[5] || 0,
      width: Number(raw.width) || 0,
      height,
      fontSize: fontSize || undefined
    });
  }
  return out;
}

// Group positioned text items into visual lines. Items on one baseline are
// joined with a space when there is a visible gap: pdf.js's own merged text
// glues neighbouring title-block cells together ("SITE PLANLocation plan").
export function groupLines(items: TextItem[]): PageLine[] {
  const lines: PageLine[] = [];
  let current: { str: string; size: number; y: number; right: number } | undefined;
  const flush = (): void => {
    const str = current?.str.replace(/\s+/g, ' ').trim();
    if (current && str) lines.push({ str, size: Math.round(current.size * 10) / 10 });
    current = undefined;
  };
  for (const item of items) {
    if (!item.str.trim()) continue;
    const size = item.fontSize ?? item.height ?? 0;
    const unit = Math.max(1, Math.min(size, current?.size ?? size));
    const gap = current ? item.x - current.right : 0;
    // Same baseline and near the previous item: the same line. A large gap (or
    // a jump backwards) is a separate title-block cell or label.
    if (current && Math.abs(item.y - current.y) <= unit * 0.5 && gap > -unit && gap < unit * 3) {
      const spaced = /\s$/.test(current.str) || /^\s/.test(item.str);
      current.str += !spaced && gap > Math.max(size, 1) * 0.15 ? ` ${item.str}` : item.str;
      current.size = Math.max(current.size, size);
      current.right = Math.max(current.right, item.x + item.width);
    } else {
      flush();
      current = { str: item.str, size, y: item.y, right: item.x + item.width };
    }
  }
  flush();
  return lines;
}

// Per-page text lines (title blocks etc.). Merged text is not enough: a
// document can hold many pages of very different kinds, and we reason per page.
export async function extractPageLines(pdf: PdfDocument): Promise<PageLine[][]> {
  const pages: PageLine[][] = [];
  for (let page = 1; page <= pdf.numPages; page++) {
    try {
      const content = await (await pdf.getPage(page)).getTextContent();
      pages.push(groupLines(toTextItems(content.items as RawTextItem[])));
    } catch {
      pages.push([]);
    }
  }
  return pages;
}

// A page's embedded-image signal, read from the operator list without
// rasterising the page or copying any image's pixels.
export interface PageScan {
  // Number of embedded raster images on the page.
  imageCount: number;
  // Largest embedded image by pixel area. A full-bleed render is one huge
  // image; a vector plan has many tiny symbol/hatch images (or none at all).
  largestImageArea: number;
  // Text nearest the largest placed image (its caption), when the page carries
  // an image of at least `captionMinArea` pixels; '' otherwise.
  caption: string;
}

let cachedOps: Promise<ImageOps> | undefined;

// pdf.js operator codes, resolved lazily once.
function resolvedOps(): Promise<ImageOps> {
  if (!cachedOps) {
    cachedOps = getResolvedPDFJS().then((pdfjs) => {
      const ops = (pdfjs as unknown as { OPS: Record<string, number | undefined> }).OPS;
      return {
        save: Number(ops.save),
        restore: Number(ops.restore),
        transform: Number(ops.transform),
        paintFormXObjectBegin: Number(ops.paintFormXObjectBegin),
        paintFormXObjectEnd: Number(ops.paintFormXObjectEnd),
        paintImageXObject: Number(ops.paintImageXObject),
        paintInlineImageXObject: Number(ops.paintInlineImageXObject),
        paintImageMaskXObject: Number(ops.paintImageMaskXObject)
      };
    });
  }
  return cachedOps;
}

const EMPTY_SCAN: PageScan = { imageCount: 0, largestImageArea: 0, caption: '' };

// One operator-list pass gives both the pre-scan signal (image count and size)
// and, for pages with a large image, the caption beside it.
export async function scanPage(pdf: PdfDocument, page: number, captionMinArea: number): Promise<PageScan> {
  try {
    const [ops, pdfPage] = await Promise.all([resolvedOps(), pdf.getPage(page)]);
    const opList = await pdfPage.getOperatorList();
    const placements = imagePlacements(opList.fnArray as number[], opList.argsArray, ops);
    const images = placements.filter((placement) => placement.pixelArea > 0);
    const largestImageArea = images.reduce((max, placement) => Math.max(max, placement.pixelArea), 0);
    let largest = placements[0];
    for (const placement of placements) if (boxArea(placement.box) > boxArea(largest!.box)) largest = placement;

    const viewport = pdfPage.getViewport({ scale: 1 });

    let caption = '';
    if (largest && largestImageArea >= captionMinArea) {
      const content = await pdfPage.getTextContent();
      caption = captionForBox(toTextItems(content.items as RawTextItem[]), largest.box, viewport.height);
    }
    return {
      imageCount: images.length,
      largestImageArea,
      caption
    };
  } catch {
    return EMPTY_SCAN;
  }
}

// Render a single page to a PNG at a target pixel width. Uses the pdf.js canvas
// already available through unpdf plus @napi-rs/canvas.
export async function renderPageToPng(pdf: PdfDocument, page: number, width: number): Promise<Buffer> {
  const buffer = await renderPageAsImage(pdf, page, {
    width,
    canvasImport: () => import('@napi-rs/canvas')
  });
  return Buffer.from(buffer);
}

// Release a document's resources. Generation opens many large PDFs in a
// long-lived server process, so callers should close each one when done.
export async function closePdf(pdf: PdfDocument): Promise<void> {
  const destroy = (pdf as unknown as { destroy?: () => Promise<void> }).destroy;
  if (typeof destroy === 'function') await destroy.call(pdf);
}
