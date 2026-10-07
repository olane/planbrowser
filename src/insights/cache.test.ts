import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  INSIGHTS_VERSION,
  isValidAssetFile,
  pruneAssets,
  readInsights,
  writeAsset,
  writeInsights
} from './cache.js';
import type { ApplicationInsights } from '../types.js';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-insights-cache-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function insights(overrides: Partial<ApplicationInsights> = {}): ApplicationInsights {
  return {
    version: INSIGHTS_VERSION,
    strategy: { id: 'test', version: 1 },
    generatedAt: new Date(0).toISOString(),
    source: [],
    summary: { headline: '', points: [], metrics: {} },
    images: [],
    comments: { support: 0, object: 0, neutral: 0, total: 0 },
    ...overrides
  };
}

describe('isValidAssetFile', () => {
  const valid = `${'a'.repeat(40)}.png`;
  it('accepts a 40-char sha1 PNG name', () => {
    expect(isValidAssetFile(valid)).toBe(true);
  });
  it('rejects traversal and non-asset names', () => {
    for (const name of ['../../metadata.json', '..%2fmetadata.json', 'foo.png', `${'a'.repeat(39)}.png`, `${'a'.repeat(40)}.jpg`, 'insights.json']) {
      expect(isValidAssetFile(name)).toBe(false);
    }
  });
});

describe('insights cache', () => {
  it('round-trips and rejects a mismatched version', () => {
    writeInsights(dir, insights());
    expect(readInsights(dir)?.version).toBe(INSIGHTS_VERSION);

    writeInsights(dir, insights({ version: INSIGHTS_VERSION + 1 }));
    expect(readInsights(dir)).toBeNull();
  });
});

describe('pruneAssets', () => {
  it('removes thumbnails not referenced by the current insights', () => {
    const keep = `${'1'.repeat(40)}.png`;
    const drop = `${'2'.repeat(40)}.png`;
    writeAsset(dir, keep, Buffer.from('a'));
    writeAsset(dir, drop, Buffer.from('b'));
    pruneAssets(dir, new Set([keep]));
    const files = fs.readdirSync(path.join(dir, 'insights'));
    expect(files).toContain(keep);
    expect(files).not.toContain(drop);
  });
});
