import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getFlags, setFlags, getDocFlags, setDocFlags, readActivity, recordActivity } from './userData.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planbrowser-userdata-'));
  process.env.DOWNLOADS_DIR = tmpDir;
});

afterEach(() => {
  delete process.env.DOWNLOADS_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('application flags', () => {
  it('returns defaults when nothing is set', () => {
    expect(getFlags('24/0001/FUL', 'cambridge')).toEqual({ starred: false, archived: false });
  });

  it('persists starred with a starredAt timestamp', () => {
    const updated = setFlags('24/0001/FUL', 'cambridge', { starred: true });
    expect(updated.starred).toBe(true);
    expect(updated.starredAt).toBeDefined();

    const read = getFlags('24/0001/FUL', 'cambridge');
    expect(read.starred).toBe(true);
    expect(read.starredAt).toBe(updated.starredAt);
  });

  it('clears starredAt when unstarred', () => {
    setFlags('24/0001/FUL', 'cambridge', { starred: true });
    const updated = setFlags('24/0001/FUL', 'cambridge', { starred: false });
    expect(updated.starred).toBe(false);
    expect(updated.starredAt).toBeUndefined();
  });

  it('persists archived with an archivedAt timestamp', () => {
    const updated = setFlags('24/0001/FUL', 'cambridge', { archived: true });
    expect(updated.archived).toBe(true);
    expect(updated.archivedAt).toBeDefined();
  });

  it('clears archivedAt when unarchived', () => {
    setFlags('24/0001/FUL', 'cambridge', { archived: true });
    const updated = setFlags('24/0001/FUL', 'cambridge', { archived: false });
    expect(updated.archivedAt).toBeUndefined();
  });
});

describe('document flags', () => {
  it('returns defaults when nothing is set', () => {
    expect(getDocFlags('24/0001/FUL', 'cambridge', 'a.pdf')).toEqual({ starred: false, note: '' });
  });

  it('sets noteUpdatedAt only when the note actually changes', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
      const first = setDocFlags('24/0001/FUL', 'cambridge', 'a.pdf', { note: 'check this' });
      expect(first.noteUpdatedAt).toBe('2024-01-01T00:00:00.000Z');

      vi.setSystemTime(new Date('2024-01-01T00:00:01.000Z'));
      const second = setDocFlags('24/0001/FUL', 'cambridge', 'a.pdf', { note: 'check this' });
      expect(second.noteUpdatedAt).toBe(first.noteUpdatedAt);

      vi.setSystemTime(new Date('2024-01-02T00:00:00.000Z'));
      const third = setDocFlags('24/0001/FUL', 'cambridge', 'a.pdf', { note: 'different' });
      expect(third.noteUpdatedAt).toBe('2024-01-02T00:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('activity feed', () => {
  it('records new events at the front and persists them', () => {
    const first = recordActivity({ reference: '24/0001/FUL', authorityId: 'cambridge', message: 'Application added', changes: [] });
    const second = recordActivity({ reference: '24/0002/FUL', authorityId: 'cambridge', message: 'Application updated', changes: [] });

    expect(first.id).toBeDefined();
    expect(first.happenedAt).toBeDefined();

    const events = readActivity();
    expect(events.length).toBe(2);
    expect(events[0].reference).toBe('24/0002/FUL');
    expect(events[1].reference).toBe('24/0001/FUL');
  });

  it('returns an empty list when no activity exists', () => {
    expect(readActivity()).toEqual([]);
  });
});
