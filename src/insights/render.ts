import fs from 'fs';
import { getDocumentProxy, extractText, extractImages, renderPageAsImage } from 'unpdf';

export type PdfDocument = Awaited<ReturnType<typeof getDocumentProxy>>;

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
