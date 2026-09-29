import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { labelsAvailable, mergeLabels, readLabels, sanitizeLabels } from './labels.js';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-insight-labels-'));
  file = path.join(dir, 'samples.expected.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ samples: { 'A/1': { expect: [{ doc: 'kept', kind: 'plan' }] } } }, null, 2)
  );
  process.env.INSIGHTS_TRUTH = file;
});

afterEach(() => {
  delete process.env.INSIGHTS_TRUTH;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('insight labels', () => {
  it('reports availability from the truth file', () => {
    expect(labelsAvailable()).toBe(true);
    process.env.INSIGHTS_TRUTH = path.join(dir, 'missing.json');
    expect(labelsAvailable()).toBe(false);
  });

  it('merges labels, replacing a prior verdict for the same page', () => {
    mergeLabels('A/1', [{ file: 'd.pdf', page: 2, verdict: 'good', kind: 'render' }]);
    mergeLabels('A/1', [
      { file: 'd.pdf', page: 2, verdict: 'bad' },
      { file: 'd.pdf', page: 3, verdict: 'good', kind: 'plan' }
    ]);
    expect(readLabels('A/1')).toEqual([
      { file: 'd.pdf', page: 2, verdict: 'bad' },
      { file: 'd.pdf', page: 3, verdict: 'good', kind: 'plan' }
    ]);
  });

  it('keeps the file style and unrelated fields', () => {
    mergeLabels('A/1', [{ file: 'd.pdf', page: 1, verdict: 'good', kind: 'map' }]);
    const raw = fs.readFileSync(file, 'utf-8');
    expect(raw).toContain('{ "doc": "kept", "kind": "plan" }');
    expect(raw.endsWith('\n')).toBe(true);
  });

  it('creates a sample entry that is not present yet', () => {
    mergeLabels('B/2', [{ file: 'x.pdf', page: 1, verdict: 'good', kind: 'photo' }]);
    expect(readLabels('B/2')).toEqual([{ file: 'x.pdf', page: 1, verdict: 'good', kind: 'photo' }]);
  });

  it('sanitizes untrusted labels', () => {
    expect(sanitizeLabels('nope')).toBeNull();
    expect(
      sanitizeLabels([
        { file: 'a.pdf', page: 1, verdict: 'good', kind: 'render' },
        { file: 'a.pdf', page: 0, verdict: 'good' },
        { file: 'a.pdf', page: 2, verdict: 'maybe' },
        { file: '', page: 3, verdict: 'bad' },
        { file: 'a.pdf', page: 4, verdict: 'bad', kind: 'bogus' }
      ])
    ).toEqual([
      { file: 'a.pdf', page: 1, verdict: 'good', kind: 'render' },
      { file: 'a.pdf', page: 4, verdict: 'bad' }
    ]);
  });
});
