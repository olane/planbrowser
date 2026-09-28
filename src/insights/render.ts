import fs from 'fs';
import { getDocumentProxy, getResolvedPDFJS, extractText, extractImages, renderPageAsImage } from 'unpdf';
import { captionForBox, imageBoxes, boxArea, type Box, type ImageOps, type TextItem } from './caption.js';

export type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

interface RawTextItem {
  str?: unknown;
  transform?: unknown;
  width?: unknown;
  height?: unknown;
}

export function isPdf(filename: string): boolean {
  return /\.pdf$/i.test(filename);
}

export async function openPdf(filePath: string): Promise<PdfDocument> {
  const data = new Uint8Array(fs.readFileSync(filePath));
  // verbosity: 0 silences pdf.js warnings for malformed fonts.
  return getDocumentProxy(data, { verbosity: 0 });
}

// Per-page text (title blocks etc.). Merged text is not enough: a document can
// hold many pages of very different kinds, and we reason per page.
export async function extractPageTexts(pdf: PdfDocument): Promise<string[]> {
  const result = await extractText(pdf, { mergePages: false });
  const text = result.text;
  return Array.isArray(text) ? text : [text];
}

export interface PageImageStats {
  // Number of embedded raster images on the page.
  count: number;
  // Largest embedded image by pixel area. A full-bleed render is one huge
  // image; a vector plan has many tiny symbol/hatch images (or none at all).
  largestArea: number;
}

// Summarise a page's embedded raster images without rasterising the page. This
// is the cheap signal that finds a render sitting on page 12 of a statement,
// which sequential page rendering would miss.
export async function analysePageImages(pdf: PdfDocument, page: number): Promise<PageImageStats> {
  let images;
  try {
    images = await extractImages(pdf, page);
  } catch {
    return { count: 0, largestArea: 0 };
  }
  let largestArea = 0;
  for (const image of images) {
    const area = (image.width || 0) * (image.height || 0);
    if (area > largestArea) largestArea = area;
  }
  return { count: images.length, largestArea };
}

let cachedOps: Promise<ImageOps> | undefined;

// pdf.js operator codes, resolved lazily once for the render/photo caption pass.
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

function largestBox(boxes: Box[]): Box | undefined {
  let largest: Box | undefined;
  for (const box of boxes) if (!largest || boxArea(box) > boxArea(largest)) largest = box;
  return largest;
}

// The text nearest the page's largest embedded image. Used to disambiguate a
// render from a photo using the image's own caption rather than the document
// name. Returns '' when the page has no embedded image or no nearby text.
export async function extractPageCaption(pdf: PdfDocument, page: number): Promise<string> {
  try {
    const [ops, pdfPage] = await Promise.all([resolvedOps(), pdf.getPage(page)]);
    const [opList, textContent] = await Promise.all([
      pdfPage.getOperatorList(),
      pdfPage.getTextContent()
    ]);
    const box = largestBox(imageBoxes(opList.fnArray as number[], opList.argsArray, ops));
    if (!box) return '';
    const items: TextItem[] = [];
    for (const raw of textContent.items as RawTextItem[]) {
      if (typeof raw.str !== 'string') continue;
      const transform = Array.isArray(raw.transform) ? raw.transform : [];
      const height = Number(raw.height) || 0;
      items.push({
        str: raw.str,
        x: Number(transform[4]) || 0,
        y: Number(transform[5]) || 0,
        width: Number(raw.width) || 0,
        height,
        fontSize: height || undefined
      });
    }
    const viewport = pdfPage.getViewport({ scale: 1 });
    return captionForBox(items, box, viewport.height);
  } catch {
    return '';
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
