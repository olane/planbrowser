import fs from 'fs';
import { getDocumentProxy, extractText, renderPageAsImage } from 'unpdf';

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
