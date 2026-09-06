import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getApplicationDir, getApplications, getApplication, saveApplicationMeta } from './storage.js';
import type { ApplicationMeta } from './types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planbrowser-storage-'));
  process.env.DOWNLOADS_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.DOWNLOADS_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function meta(reference: string, authorityId?: string): ApplicationMeta {
  return {
    reference,
    authorityId,
    address: '1 High Street',
    description: 'Erection of a shed',
    status: 'Pending',
    dates: {},
    documents: [],
    hasComments: false,
    scrapedAt: '2024-01-01T00:00:00.000Z'
  };
}

function writeMeta(relDir: string, value: ApplicationMeta): void {
  fs.mkdirSync(path.join(tmpDir, relDir), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, relDir, 'metadata.json'), JSON.stringify(value, null, 2));
}

describe('getApplicationDir', () => {
  it('namespaces by authority and normalises the reference', () => {
    expect(getApplicationDir('24/00123/FUL', 'cambridge')).toBe(
      path.join(tmpDir, 'cambridge', '24-00123-FUL')
    );
  });

  it('defaults to the cambridge authority', () => {
    expect(getApplicationDir('24/00123/FUL')).toBe(
      path.join(tmpDir, 'cambridge', '24-00123-FUL')
    );
  });
});

describe('saveApplicationMeta / getApplication', () => {
  it('round-trips metadata for a namespaced authority', () => {
    saveApplicationMeta('24/00123/FUL', meta('24/00123/FUL', 'cambridge'), 'cambridge');
    const app = getApplication('24/00123/FUL', 'cambridge');
    expect(app?.reference).toBe('24/00123/FUL');
    expect(app?.address).toBe('1 High Street');
  });

  it('finds an application without a known authority', () => {
    saveApplicationMeta('24/00123/FUL', meta('24/00123/FUL', 'cambridge'), 'cambridge');
    expect(getApplication('24/00123/FUL')?.reference).toBe('24/00123/FUL');
  });

  it('returns null for an unknown reference', () => {
    expect(getApplication('99/99999/NOPE')).toBeNull();
  });
});

describe('getApplications', () => {
  it('lists applications in the legacy flat layout', () => {
    writeMeta('24-0001-FUL', meta('24/0001/FUL'));
    const apps = getApplications();
    expect(apps.map((a) => a.reference)).toEqual(['24/0001/FUL']);
  });

  it('lists applications in the namespaced layout', () => {
    writeMeta(path.join('cambridge', '24-0001-FUL'), meta('24/0001/FUL', 'cambridge'));
    writeMeta(path.join('cambridge', '24-0002-FUL'), meta('24/0002/FUL', 'cambridge'));
    const apps = getApplications();
    expect(apps.map((a) => a.reference).sort()).toEqual(['24/0001/FUL', '24/0002/FUL']);
  });

  it('returns an empty list when there are no downloads', () => {
    expect(getApplications()).toEqual([]);
  });
});
