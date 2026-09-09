import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { searchApplicationDocuments } from './search.js';
import { extractDocumentText } from './extract.js';
import { saveApplicationMeta } from '../storage.js';
import type { ApplicationMeta } from '../types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planbrowser-search-'));
  process.env.DOWNLOADS_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.DOWNLOADS_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function meta(reference: string): ApplicationMeta {
  return {
    reference,
    authorityId: 'cambridge',
    address: '1 High Street',
    description: 'Erection of a shed',
    status: 'Pending',
    dates: {},
    documents: [],
    hasComments: false,
    scrapedAt: '2024-01-01T00:00:00.000Z'
  };
}

// A minimal but valid one-page PDF with the given text, so extraction can be
// exercised without committing a binary fixture.
function minimalPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const parts = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  parts.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${parts.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${parts.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function writeDoc(reference: string, filename: string, contents: Buffer): void {
  const dir = path.join(tmpDir, 'cambridge', reference.replace(/\//g, '-'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), contents);
}

describe('extractDocumentText', () => {
  it('returns null for unsupported file types', async () => {
    await expect(extractDocumentText('/tmp/whatever.doc')).resolves.toBeNull();
    await expect(extractDocumentText('/tmp/whatever.jpg')).resolves.toBeNull();
  });

  it('extracts text from a PDF', async () => {
    const file = path.join(tmpDir, 'sample.pdf');
    fs.writeFileSync(file, minimalPdf('Hello searchable world'));
    await expect(extractDocumentText(file)).resolves.toBe('Hello searchable world');
  });
});

describe('searchApplicationDocuments', () => {
  it('returns an empty list for an unknown reference', async () => {
    await expect(searchApplicationDocuments('99/99999/NOPE', 'cambridge', 'foo')).resolves.toEqual([]);
  });

  it('returns an empty list for a blank query', async () => {
    await expect(searchApplicationDocuments('24/00123/FUL', 'cambridge', '   ')).resolves.toEqual([]);
  });

  it('extracts PDFs lazily, caches, and returns ranked hits with snippets', async () => {
    const app = meta('24/00123/FUL');
    app.documents = [
      { localFilename: 'Plan.pdf', datePublished: '01 Jan 2026', documentType: 'Drawings', description: 'Site Plan' },
      { localFilename: 'Report.pdf', datePublished: '02 Jan 2026', documentType: 'Reports', description: 'Ecology Report' }
    ];
    saveApplicationMeta('24/00123/FUL', app, 'cambridge');
    writeDoc('24/00123/FUL', 'Plan.pdf', minimalPdf('No trees here'));
    writeDoc('24/00123/FUL', 'Report.pdf', minimalPdf('This report discusses trees and more trees and even more trees'));

    const hits = await searchApplicationDocuments('24/00123/FUL', 'cambridge', 'trees');
    // Ranked by occurrence count: the report (3 matches) precedes the plan (1).
    expect(hits.map((h) => h.localFilename)).toEqual(['Report.pdf', 'Plan.pdf']);
    expect(hits[0]!.snippet.match).toBe('trees');
    expect(hits[0]!.snippet.before).toBe('This report discusses ');

    // The cache is now on disk, so a second search does not re-extract.
    const cache = JSON.parse(fs.readFileSync(path.join(tmpDir, 'cambridge', '24-00123-FUL', 'search-text.json'), 'utf-8'));
    expect(cache.documents['Report.pdf'].text).toContain('trees');
    expect(cache.documents['Plan.pdf'].text).toBe('No trees here');
  });

  it('uses a fresh cache entry instead of re-extracting', async () => {
    const app = meta('24/00123/FUL');
    app.documents = [{ localFilename: 'Doc.pdf', datePublished: '01 Jan 2026', documentType: 'Reports', description: 'Doc' }];
    saveApplicationMeta('24/00123/FUL', app, 'cambridge');
    const dir = path.join(tmpDir, 'cambridge', '24-00123-FUL');
    const filePath = path.join(dir, 'Doc.pdf');
    fs.writeFileSync(filePath, minimalPdf('actual file text'));
    const stat = fs.statSync(filePath);
    fs.writeFileSync(path.join(dir, 'search-text.json'), JSON.stringify({
      version: 1,
      documents: { 'Doc.pdf': { text: 'contains the needle right here', mtimeMs: stat.mtimeMs, size: stat.size } }
    }));

    const hits = await searchApplicationDocuments('24/00123/FUL', 'cambridge', 'needle');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.snippet.match).toBe('needle');
    // The on-disk text does not contain the cached text, proving the cache was
    // trusted rather than re-extracting.
    expect(await searchApplicationDocuments('24/00123/FUL', 'cambridge', 'actual')).toEqual([]);
  });

  it('re-extracts a file whose contents change after it was cached', async () => {
    const app = meta('24/00123/FUL');
    app.documents = [{ localFilename: 'Doc.pdf', datePublished: '01 Jan 2026', documentType: 'Reports', description: 'Doc' }];
    saveApplicationMeta('24/00123/FUL', app, 'cambridge');
    writeDoc('24/00123/FUL', 'Doc.pdf', minimalPdf('first version'));

    expect((await searchApplicationDocuments('24/00123/FUL', 'cambridge', 'first')).map((h) => h.localFilename)).toEqual(['Doc.pdf']);
    expect(await searchApplicationDocuments('24/00123/FUL', 'cambridge', 'second')).toEqual([]);

    // Replace the file with new content under the same filename.
    writeDoc('24/00123/FUL', 'Doc.pdf', minimalPdf('second version'));

    expect((await searchApplicationDocuments('24/00123/FUL', 'cambridge', 'second')).map((h) => h.localFilename)).toEqual(['Doc.pdf']);
    expect(await searchApplicationDocuments('24/00123/FUL', 'cambridge', 'first')).toEqual([]);
  });

  it('skips absent files and caches unsupported types as empty', async () => {
    const app = meta('24/00123/FUL');
    app.documents = [
      { localFilename: 'Missing.pdf', datePublished: '01 Jan 2026', documentType: 'Drawings', description: 'Gone' },
      { localFilename: 'Letter.doc', datePublished: '02 Jan 2026', documentType: 'Comments', description: 'Legacy' }
    ];
    saveApplicationMeta('24/00123/FUL', app, 'cambridge');
    // Only the unsupported .doc is present on disk.
    writeDoc('24/00123/FUL', 'Letter.doc', Buffer.from('whatever'));

    const hits = await searchApplicationDocuments('24/00123/FUL', 'cambridge', 'anything');
    expect(hits).toEqual([]);

    const cache = JSON.parse(fs.readFileSync(path.join(tmpDir, 'cambridge', '24-00123-FUL', 'search-text.json'), 'utf-8'));
    expect(cache.documents['Missing.pdf']).toBeUndefined();
    expect(cache.documents['Letter.doc'].text).toBe('');
  });
});
