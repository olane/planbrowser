import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { analysePagePng, type PagePixelStats } from './pixels.js';
import { closePdf, extractPageLines, openPdf, renderPageToPng, scanPage, type PageScan, type PdfDocument } from './render.js';
import { assetPath, atomicWrite, insightsDir, writeAsset } from './cache.js';
import type { PageLine } from './title.js';

// Page facts: everything expensive we learn about a page (its text lines, the
// embedded-image scan and caption, the rendered thumbnail's pixel statistics).
// They are strategy-independent, so they are cached per application and reused
// across strategy changes, eval runs and deep scans. Only the interpretation
// (classify/select) reruns; a warm cache opens no PDFs at all.
//
// Bump FEATURES_VERSION when *extraction* changes (text grouping, scan, pixel
// stats). Interpretation changes bump STRATEGY.version in generate.ts instead.
export const FEATURES_VERSION = 1;

export interface PageRender {
  // Content-addressed thumbnail under insights/ (may have been pruned; it is
  // re-rendered on demand).
  imageFile: string;
  pixels: PagePixelStats;
}

export interface DocumentFeatures {
  mtimeMs: number;
  size: number;
  // Text lines per page (index 0 = page 1). Absent until first needed.
  pages?: PageLine[][];
  scans: Record<string, PageScan>;
  // Keyed by `${page}@${width}`.
  renders: Record<string, PageRender>;
}

interface FeatureFile {
  version: number;
  documents: Record<string, DocumentFeatures>;
}

function featuresFile(appDir: string): string {
  return path.join(insightsDir(appDir), 'features.json');
}

function readFeatureFile(appDir: string): FeatureFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(featuresFile(appDir), 'utf-8')) as FeatureFile;
    if (parsed && parsed.version === FEATURES_VERSION && parsed.documents && typeof parsed.documents === 'object') {
      return parsed;
    }
  } catch {
    // Missing or unreadable cache.
  }
  return { version: FEATURES_VERSION, documents: {} };
}

// Work actually done (cache misses), for logging and tests.
export interface FeatureWork {
  opened: number;
  textExtracted: number;
  scanned: number;
  rendered: number;
}

export interface CaptionPolicy {
  // Only read a caption for pages carrying an image at least this large.
  captionMinArea: number;
}

// Per-application page-facts store. Open a document with `document()`, ask it
// for facts, and `close()` it; call `save()` to persist (it is also saved
// periodically so a long run keeps its progress).
export class FeatureStore {
  readonly work: FeatureWork = { opened: 0, textExtracted: 0, scanned: 0, rendered: 0 };
  private readonly file: FeatureFile;
  private dirty = false;
  private lastSave = Date.now();

  constructor(
    private readonly appDir: string,
    private readonly policy: CaptionPolicy
  ) {
    this.file = readFeatureFile(appDir);
  }

  // Facts for one document, or null when the file is missing. Stale entries
  // (the file changed on disk) are discarded.
  document(localFilename: string): DocumentHandle | null {
    const filePath = path.join(this.appDir, localFilename);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return null;
    }
    let entry = this.file.documents[localFilename];
    if (!entry || entry.mtimeMs !== stat.mtimeMs || entry.size !== stat.size) {
      entry = { mtimeMs: stat.mtimeMs, size: stat.size, scans: {}, renders: {} };
      this.file.documents[localFilename] = entry;
      this.dirty = true;
    }
    return new DocumentHandle(this, this.appDir, filePath, entry, this.policy);
  }

  markDirty(): void {
    this.dirty = true;
  }

  // Persist if something changed and a few seconds have passed (or always, when
  // `force`). Rewriting the whole file after every page would be quadratic.
  save(force = true): void {
    if (!this.dirty) return;
    if (!force && Date.now() - this.lastSave < 5000) return;
    atomicWrite(featuresFile(this.appDir), JSON.stringify(this.file));
    // Superseded by features.json (page text used to be cached on its own).
    fs.rmSync(path.join(insightsDir(this.appDir), 'page-text.json'), { force: true });
    this.dirty = false;
    this.lastSave = Date.now();
  }
}

export class DocumentHandle {
  private pdf: PdfDocument | undefined;
  // True when the PDF could not be opened; facts then come back empty.
  failed = false;

  constructor(
    private readonly store: FeatureStore,
    private readonly appDir: string,
    private readonly filePath: string,
    private readonly entry: DocumentFeatures,
    private readonly policy: CaptionPolicy
  ) {}

  private async open(): Promise<PdfDocument | undefined> {
    if (this.pdf || this.failed) return this.pdf;
    try {
      this.pdf = await openPdf(this.filePath);
      this.store.work.opened++;
    } catch {
      this.failed = true;
    }
    return this.pdf;
  }

  async lines(): Promise<PageLine[][]> {
    if (this.entry.pages) return this.entry.pages;
    const pdf = await this.open();
    if (!pdf) return [];
    let pages: PageLine[][];
    try {
      pages = await extractPageLines(pdf);
    } catch {
      pages = [];
    }
    this.store.work.textExtracted++;
    this.entry.pages = pages;
    this.store.markDirty();
    return pages;
  }

  async scan(page: number): Promise<PageScan> {
    const cached = this.entry.scans[String(page)];
    if (cached) return cached;
    const pdf = await this.open();
    const scan = pdf
      ? await scanPage(pdf, page, this.policy.captionMinArea)
      : { imageCount: 0, largestImageArea: 0, largestImageCoverage: 0, caption: '' };
    this.store.work.scanned++;
    this.entry.scans[String(page)] = scan;
    this.store.markDirty();
    return scan;
  }

  // Render facts for a page (thumbnail + pixel stats), rendering only on a
  // cache miss. Returns null when the page cannot be rendered.
  async render(page: number, width: number): Promise<PageRender | null> {
    const key = `${page}@${width}`;
    const cached = this.entry.renders[key];
    if (cached) return cached;
    const fresh = await this.renderFresh(page, width);
    if (!fresh) return null;
    this.entry.renders[key] = fresh;
    this.store.markDirty();
    return fresh;
  }

  // Make sure a page's thumbnail exists on disk (it may have been pruned while
  // the page was not in the gallery). Returns the asset filename, which can
  // change if the re-render is not byte-identical.
  async ensureAsset(page: number, width: number): Promise<string | null> {
    const render = await this.render(page, width);
    if (!render) return null;
    if (fs.existsSync(assetPath(this.appDir, render.imageFile))) return render.imageFile;
    const fresh = await this.renderFresh(page, width);
    if (!fresh) return null;
    this.entry.renders[`${page}@${width}`] = { ...render, imageFile: fresh.imageFile };
    this.store.markDirty();
    return fresh.imageFile;
  }

  private async renderFresh(page: number, width: number): Promise<PageRender | null> {
    const pdf = await this.open();
    if (!pdf) return null;
    try {
      const png = await renderPageToPng(pdf, page, width);
      const pixels = await analysePagePng(png);
      const imageFile = `${crypto.createHash('sha1').update(png).digest('hex')}.png`;
      writeAsset(this.appDir, imageFile, png);
      this.store.work.rendered++;
      return { imageFile, pixels };
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.pdf) await closePdf(this.pdf).catch(() => {});
    this.pdf = undefined;
  }
}
