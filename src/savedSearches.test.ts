import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { listSavedSearches, getSavedSearch, saveSearch, deleteSavedSearch, recordSearchRun } from './savedSearches.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planbrowser-saved-'));
  process.env.DOWNLOADS_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.DOWNLOADS_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('saved searches', () => {
  it('returns an empty list when nothing is saved', () => {
    expect(listSavedSearches()).toEqual([]);
  });

  it('saves a search with the newest first and persists it', () => {
    const first = saveSearch({ postcode: 'CB1 2JW', radius: '2', filters: { app_state: 'Undecided' } });
    const second = saveSearch({ postcode: 'CB2 1AB', radius: '5', filters: {} });

    expect(first.id).toBeDefined();
    expect(first.createdAt).toBeDefined();

    const list = listSavedSearches();
    expect(list.map((s) => s.postcode)).toEqual(['CB2 1AB', 'CB1 2JW']);
    expect(getSavedSearch(first.id)?.filters).toEqual({ app_state: 'Undecided' });
  });

  it('deletes a saved search', () => {
    const saved = saveSearch({ postcode: 'CB1 2JW', radius: '2', filters: {} });
    expect(deleteSavedSearch(saved.id)).toBe(true);
    expect(listSavedSearches()).toEqual([]);
    expect(deleteSavedSearch(saved.id)).toBe(false);
  });

  it('records a run with its references and timestamp', () => {
    const saved = saveSearch({ postcode: 'CB1 2JW', radius: '2', filters: {} });
    const updated = recordSearchRun(saved.id, ['24/0001/FUL', '24/0002/FUL']);

    expect(updated?.lastRunAt).toBeDefined();
    expect(updated?.lastReferences).toEqual(['24/0001/FUL', '24/0002/FUL']);
    expect(getSavedSearch(saved.id)?.lastReferences).toEqual(['24/0001/FUL', '24/0002/FUL']);
  });

  it('returns undefined when recording a run for an unknown id', () => {
    expect(recordSearchRun('nope', ['24/0001/FUL'])).toBeUndefined();
  });
});
