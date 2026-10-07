// Ground truth for the insights heuristic, shared by the eval, the contact
// sheet and the label merger. See scripts/samples.expected.json.
//
// Two kinds of truth per sample:
// - `expect` / `expectAbsent` / `expectEmpty`: hard assertions. `doc` is matched
//   as a normalised substring of the image's filename + label; `page` and `kind`
//   are optional. An `expect` entry with `"highlight": true` must be in the
//   curated highlights, not just somewhere in `found`.
// - `labels`: per-page verdicts made in the review tool
//   (`{ file, page, verdict: "good" | "bad", kind?, rank? }`, `file` = exact
//   localFilename). They drive the soft metrics: precision, recall and kind
//   accuracy, for both the highlights and everything found. `rank` is an
//   optional `"high"`/`"low"` priority on a good page; the rank metric reports
//   how many high/low pages reached the highlights.

import fs from 'fs';
import path from 'path';

export const root = process.env.DOWNLOADS_DIR
  ? path.resolve(process.env.DOWNLOADS_DIR)
  : path.join(process.cwd(), 'downloads');

export const truthPath = path.join(process.cwd(), 'scripts', 'samples.expected.json');
export const manifestPath = path.join(process.cwd(), 'scripts', 'samples.json');

export function loadTruth() {
  return JSON.parse(fs.readFileSync(truthPath, 'utf-8'));
}

export function loadManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

export function normalise(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function findApplication(reference) {
  if (!fs.existsSync(root)) return null;
  for (const authority of fs.readdirSync(root)) {
    const dir = path.join(root, authority, reference.replace(/\//g, '-'));
    const metaPath = path.join(dir, 'metadata.json');
    if (!fs.existsSync(metaPath)) continue;
    try {
      return { meta: JSON.parse(fs.readFileSync(metaPath, 'utf-8')), dir };
    } catch {
      return null;
    }
  }
  return null;
}

export function matchImage(image, spec) {
  const hay = normalise(`${image.localFilename} ${image.label ?? ''}`);
  if (!hay.includes(normalise(spec.doc))) return false;
  if (spec.page !== undefined && image.page !== spec.page) return false;
  if (spec.kind !== undefined && image.kind !== spec.kind) return false;
  return true;
}

export const pageKey = (file, page) => `${file}#${page}`;

const ratio = (num, den) => (den ? num / den : undefined);

// Score one generated result against a sample's truth. Returns the hard
// failures (misses, leaks) and the label-based soft metrics.
export function scoreSample(insights, spec) {
  const found = insights?.found ?? insights?.images ?? [];
  const images = insights?.images ?? [];
  const expect = spec.expect ?? [];

  const misses = expect.filter((e) => !found.some((i) => matchImage(i, e)));
  const notHighlighted = expect.filter((e) => e.highlight && !images.some((i) => matchImage(i, e)));
  const leaks = (spec.expectAbsent ?? []).filter((e) => found.some((i) => matchImage(i, e)));
  const emptyFail = spec.expectEmpty === true && found.length > 0;

  const labels = new Map((spec.labels ?? []).map((l) => [pageKey(l.file, l.page), l]));
  const labelOf = (image) => labels.get(pageKey(image.localFilename, image.page));
  const tally = (set) => {
    let good = 0;
    let bad = 0;
    let unlabelled = 0;
    let kindRight = 0;
    let kindJudged = 0;
    for (const image of set) {
      const label = labelOf(image);
      if (!label) unlabelled++;
      else if (label.verdict === 'good') {
        good++;
        if (label.kind) {
          kindJudged++;
          if (label.kind === image.kind) kindRight++;
        }
      } else bad++;
    }
    return { good, bad, unlabelled, precision: ratio(good, good + bad), kindAccuracy: ratio(kindRight, kindJudged) };
  };
  const goodLabels = [...labels.values()].filter((l) => l.verdict === 'good');
  const inSet = (set) => (l) => set.some((i) => i.localFilename === l.file && i.page === l.page);
  const missedGood = goodLabels.filter((l) => !inSet(found)(l));

  // Rank labels are a reviewer's priority among good pages: a `high` page should
  // reach the highlights, a `low` one may be capped away without penalty.
  const highTotal = goodLabels.filter((l) => l.rank === 'high').length;
  const lowTotal = goodLabels.filter((l) => l.rank === 'low').length;
  const ranks = (set) => {
    const inSetLabels = goodLabels.filter(inSet(set));
    return {
      high: inSetLabels.filter((l) => l.rank === 'high').length,
      low: inSetLabels.filter((l) => l.rank === 'low').length
    };
  };

  return {
    found: found.length,
    highlights: images.length,
    expectHits: expect.length - misses.length,
    expectTotal: expect.length,
    highlightHits: expect.filter((e) => images.some((i) => matchImage(i, e))).length,
    misses,
    notHighlighted,
    leaks,
    emptyFail,
    ok: !misses.length && !notHighlighted.length && !leaks.length && !emptyFail,
    labels: {
      total: labels.size,
      good: goodLabels.length,
      foundTally: tally(found),
      highlightTally: tally(images),
      recallFound: ratio(goodLabels.length - missedGood.length, goodLabels.length),
      recallHighlights: ratio(goodLabels.filter(inSet(images)).length, goodLabels.length),
      missedGood,
      badHighlights: images.filter((i) => labelOf(i)?.verdict === 'bad'),
      rank: {
        highTotal,
        lowTotal,
        highlightsHigh: ranks(images).high,
        highlightsLow: ranks(images).low,
        foundHigh: ranks(found).high,
        foundLow: ranks(found).low
      }
    }
  };
}

export const pct = (value) => (value === undefined ? '—' : `${Math.round(value * 100)}%`);
