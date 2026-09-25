import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateInsights, getInsightsState } from './generate.js';
import type { ApplicationMeta } from '../types.js';

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
      { localFilename: 'plan.txt', datePublished: '01 Jan 2026', documentType: 'Drawings', description: 'PROPOSED SITE PLAN' }
    ],
    hasComments: false,
    scrapedAt: new Date(0).toISOString()
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
    await new Promise((resolve) => setTimeout(resolve, 5));
    fs.writeFileSync(path.join(dir, 'plan.txt'), 'changed content that alters size and mtime');
    const second = await generateInsights(REFERENCE);
    expect(second?.generatedAt).not.toBe(first?.generatedAt);
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
});
