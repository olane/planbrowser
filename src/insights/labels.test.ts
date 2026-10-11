import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  mergeLabels,
  mergeReviewLabels,
  readLabels,
  readReviewLabels,
  readReviewStore,
  removeLabels,
  removeReviewLabels,
  reviewsFile,
  sanitizeLabels,
  sanitizePageRefs
} from './labels.js';

let dir: string;
let file: string;
let reviews: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-insight-labels-'));
  file = path.join(dir, 'samples.expected.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ samples: { 'A/1': { expect: [{ doc: 'kept', kind: 'plan' }] } } }, null, 2)
  );
  process.env.INSIGHTS_TRUTH = file;
  reviews = path.join(dir, 'insights-reviews.json');
  process.env.INSIGHTS_REVIEWS = reviews;
});

afterEach(() => {
  delete process.env.INSIGHTS_TRUTH;
  delete process.env.INSIGHTS_REVIEWS;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('insight labels', () => {
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

  it('removes a verdict without touching the others', () => {
    mergeLabels('A/1', [
      { file: 'd.pdf', page: 1, verdict: 'good', kind: 'plan' },
      { file: 'd.pdf', page: 2, verdict: 'bad' }
    ]);
    expect(removeLabels('A/1', [{ file: 'd.pdf', page: 1 }])).toEqual([
      { file: 'd.pdf', page: 2, verdict: 'bad' }
    ]);
    expect(readLabels('A/1')).toEqual([{ file: 'd.pdf', page: 2, verdict: 'bad' }]);
  });

  it('keeps review labels in a separate store, leaving the truth untouched', () => {
    mergeReviewLabels('A/1', [
      { file: 'd.pdf', page: 1, verdict: 'good', kind: 'render' },
      { file: 'd.pdf', page: 2, verdict: 'bad' }
    ]);
    expect(readReviewLabels('A/1')).toEqual([
      { file: 'd.pdf', page: 1, verdict: 'good', kind: 'render' },
      { file: 'd.pdf', page: 2, verdict: 'bad' }
    ]);
    expect(readLabels('A/1')).toEqual([]);
    expect(readReviewStore().samples?.['A/1']?.labels).toHaveLength(2);
  });

  it('removes review labels without rewriting them into the truth', () => {
    mergeReviewLabels('A/1', [
      { file: 'd.pdf', page: 1, verdict: 'good' },
      { file: 'd.pdf', page: 2, verdict: 'bad' }
    ]);
    expect(removeReviewLabels('A/1', [{ file: 'd.pdf', page: 1 }])).toEqual([
      { file: 'd.pdf', page: 2, verdict: 'bad' }
    ]);
    expect(readReviewLabels('A/1')).toEqual([{ file: 'd.pdf', page: 2, verdict: 'bad' }]);
    expect(readLabels('A/1')).toEqual([]);
  });

  it('resolves the review store from INSIGHTS_REVIEWS', () => {
    expect(reviewsFile()).toBe(reviews);
  });

  it('sanitizes untrusted page references', () => {
    expect(sanitizePageRefs('nope')).toBeNull();
    expect(
      sanitizePageRefs([
        { file: 'a.pdf', page: 1, verdict: 'good' },
        { file: 'a.pdf', page: 0 },
        { file: '', page: 3 },
        { file: 'a.pdf', page: 2.5 }
      ])
    ).toEqual([{ file: 'a.pdf', page: 1 }]);
  });

  it('sanitizes untrusted labels', () => {
    expect(sanitizeLabels('nope')).toBeNull();
    expect(
      sanitizeLabels([
        { file: 'a.pdf', page: 1, verdict: 'good', kind: 'render', rank: 'high' },
        { file: 'a.pdf', page: 0, verdict: 'good' },
        { file: 'a.pdf', page: 2, verdict: 'maybe' },
        { file: '', page: 3, verdict: 'bad' },
        { file: 'a.pdf', page: 4, verdict: 'bad', kind: 'bogus' },
        { file: 'a.pdf', page: 5, verdict: 'good', kind: 'plan', rank: 'bogus' },
        { file: 'a.pdf', page: 6, verdict: 'bad', rank: 'high' }
      ])
    ).toEqual([
      { file: 'a.pdf', page: 1, verdict: 'good', kind: 'render', rank: 'high' },
      { file: 'a.pdf', page: 4, verdict: 'bad' },
      { file: 'a.pdf', page: 5, verdict: 'good', kind: 'plan' },
      { file: 'a.pdf', page: 6, verdict: 'bad' }
    ]);
  });
});
