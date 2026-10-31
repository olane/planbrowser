import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateInsights, isCurrent, rankDocuments, STRATEGY } from './generate.js';
import { getInsightsState, startInsights } from './jobs.js';
import type { ApplicationInsights, ApplicationMeta, DocumentMeta, InsightsProgress } from '../types.js';

const REFERENCE = '24/00001/FUL';
let root: string;
let dir: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-insights-gen-'));
  process.env.DOWNLOADS_DIR = root;
  dir = path.join(root, 'cambridge', '24-00001-FUL');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plan.txt'), 'initial');
  const meta: ApplicationMeta = {
    reference: REFERENCE,
    authorityId: 'cambridge',
    address: '1 Test Street',
    description: 'Two storey rear extension.',
    status: 'Awaiting decision',
    dates: {},
    documents: [
      {
        localFilename: 'plan.txt',
        datePublished: '01 Jan 2026',
        documentType: 'Drawings',
        description: 'PROPOSED SITE PLAN',
      },
    ],
    hasComments: false,
    scrapedAt: new Date(0).toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'metadata.json'), JSON.stringify(meta));
});

afterEach(() => {
  delete process.env.DOWNLOADS_DIR;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('generateInsights caching', () => {
  it('reuses cached insights while source documents are unchanged', async () => {
    const first = await generateInsights(REFERENCE);
    const second = await generateInsights(REFERENCE);
    expect(second?.generatedAt).toBe(first?.generatedAt);
  });

  it('regenerates when a source document changes', async () => {
    const first = await generateInsights(REFERENCE);
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    fs.writeFileSync(path.join(dir, 'plan.txt'), 'changed content that alters size and mtime');
    const second = await generateInsights(REFERENCE);
    expect(second?.generatedAt).not.toBe(first?.generatedAt);
  });

  it('records the depth and the found candidate set', async () => {
    const quick = await generateInsights(REFERENCE);
    expect(quick?.depth).toBe('quick');
    expect(Array.isArray(quick?.found)).toBe(true);

    const deep = await generateInsights(REFERENCE, undefined, { force: true, deep: true });
    expect(deep?.depth).toBe('deep');
  });

  it('reports progress against the documents it plans to scan', async () => {
    const progress: InsightsProgress[] = [];
    await generateInsights(REFERENCE, undefined, {
      force: true,
      onProgress: (entry) => progress.push(entry),
    });

    // The only document is a .txt file, so the scan plan is empty even though
    // the application's coverage still reports that document separately.
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.every((entry) => entry.documentsTotal === 0)).toBe(true);
    expect(progress.at(-1)?.documentsProcessed).toBe(0);
    expect(progress.at(-1)?.phase).toBe('finalising');
  });
});

describe('rankDocuments', () => {
  const doc = (localFilename: string, documentType: string, description: string): DocumentMeta => ({
    localFilename,
    datePublished: '',
    documentType,
    description,
  });

  it('opens the Design & Access Statement first, ahead of renders and plans', () => {
    const ranked = rankDocuments([
      doc('render.pdf', 'Drawings', 'ARTIST IMPRESSION OF THE SCHEME'),
      doc('plan.pdf', 'Drawings', 'PROPOSED SITE PLAN'),
      doc('das.pdf', 'Design and Access Statement', 'DESIGN AND ACCESS STATEMENT'),
    ]);
    expect(ranked.map((entry) => entry.doc.localFilename)).toEqual(['das.pdf', 'render.pdf', 'plan.pdf']);
  });

  it('falls back to the name prior for everything else', () => {
    const ranked = rankDocuments([
      doc('plan.pdf', 'Drawings', 'PROPOSED SITE PLAN'),
      doc('report.pdf', 'Application Survey / Assessment / Statement', 'TRANSPORT ASSESSMENT'),
    ]);
    expect(ranked.map((entry) => entry.doc.localFilename)).toEqual(['plan.pdf', 'report.pdf']);
  });
});

describe('isCurrent', () => {
  const base = (overrides: Partial<ApplicationInsights> = {}): ApplicationInsights => ({
    version: 2,
    strategy: { ...STRATEGY },
    generatedAt: new Date(0).toISOString(),
    source: [],
    summary: { headline: '', points: [], metrics: {} },
    images: [],
    comments: { support: 0, object: 0, neutral: 0, total: 0 },
    ...overrides,
  });

  it('accepts a finished result from the current strategy', () => {
    expect(isCurrent(base(), [])).toBe(true);
    expect(isCurrent(base({ complete: true }), [])).toBe(true);
  });

  it('rejects a partial snapshot so an interrupted run is refreshed', () => {
    expect(isCurrent(base({ complete: false }), [])).toBe(false);
  });
});

describe('getInsightsState', () => {
  it('reports none before generation and ready after', async () => {
    expect(getInsightsState(REFERENCE)?.status).toBe('none');
    await generateInsights(REFERENCE);
    expect(getInsightsState(REFERENCE)?.status).toBe('ready');
  });

  it('kicks off a background refresh when the cache is stale', async () => {
    await generateInsights(REFERENCE);
    fs.writeFileSync(path.join(dir, 'plan.txt'), 'stale now, size differs');
    expect(getInsightsState(REFERENCE)?.status).toBe('running');
  });

  it('returns null for an unknown application', () => {
    expect(getInsightsState('99/99999/FUL')).toBeNull();
  });

  it('never serves an incomplete snapshot as ready', async () => {
    await generateInsights(REFERENCE);
    const file = path.join(dir, 'insights', 'insights.json');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as ApplicationInsights;
    fs.writeFileSync(file, JSON.stringify({ ...parsed, complete: false }));
    // An interrupted run reports as running (and is refreshed), not ready.
    expect(getInsightsState(REFERENCE)?.status).toBe('running');
    // Let the background refresh settle before the temp dir is removed.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });

  it('reports running with the cached result while a scan is in flight', async () => {
    await generateInsights(REFERENCE);
    startInsights(REFERENCE, undefined, { force: true, deep: true });
    const state = getInsightsState(REFERENCE);
    // The fresh quick cache must not mask the in-flight deep run...
    expect(state?.status).toBe('running');
    // ...and the previous result stays available so the UI need not blank out.
    expect(state?.insights).toBeTruthy();
    // Let the background job settle before the temp dir is removed.
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  });
});
