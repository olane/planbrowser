import fs from 'fs';
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';

// Collapse runs of whitespace into single spaces so the cached text is compact
// and stable to search (PDF extraction often fragments words across lines and
// spans).
function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

async function extractPdf(filePath: string): Promise<string> {
  const data = await fs.promises.readFile(filePath);
  // verbosity: 0 silences pdf.js "undefined function" warnings for Type3 fonts,
  // which would otherwise spam the server log during extraction.
  const pdf = await getDocumentProxy(new Uint8Array(data), { verbosity: 0 });
  const { text } = await extractText(pdf, { mergePages: true });
  return normalise(Array.isArray(text) ? text.join(' ') : text);
}

async function extractDocx(filePath: string): Promise<string> {
  const data = await fs.promises.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer: data });
  return normalise(result.value);
}

const EXTRACTORS: Record<string, (filePath: string) => Promise<string>> = {
  pdf: extractPdf,
  docx: extractDocx
};

// Returns a document's extracted text, or null when the file type is not
// supported (e.g. legacy .doc or images). Such documents simply aren't
// content-searchable. Extraction errors (e.g. a corrupt file) are left to the
// caller to catch, so a failed document can still be cached as empty.
export async function extractDocumentText(filePath: string): Promise<string | null> {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const extractor = EXTRACTORS[ext];
  if (!extractor) return null;
  return extractor(filePath);
}
