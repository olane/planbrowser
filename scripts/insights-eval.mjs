// Evaluate the insights heuristic against the ground truth in
// scripts/samples.expected.json (see scripts/insights-truth.mjs for the format).
//
//   npm run build
//   node scripts/insights-eval.mjs [reference ...] [--deep]
//
// With no references it evaluates every sample that has ground truth. Exits
// non-zero on a hard failure: an expected image is missing (or missing from the
// highlights when marked `highlight`), an expected-absent image leaks, or an
// expect-empty sample produced a gallery. Label-based precision/recall is
// reported but does not fail the run.
//
// Page facts are cached per application (insights/features.json), so after the
// first run this re-interprets without re-rendering: seconds, not minutes. It
// is not run in CI (it needs downloaded samples).

import { generateInsights } from '../dist/insights/generate.js';
import { findApplication, loadManifest, loadTruth, pct, scoreSample } from './insights-truth.mjs';

const args = process.argv.slice(2);
const deep = args.includes('--deep');
const filters = args.filter((a) => !a.startsWith('--'));

const { samples: truth } = loadTruth();
const references = filters.length ? filters : Object.keys(truth);
let failed = false;
const totals = { good: 0, bad: 0, hGood: 0, hBad: 0, labelledGood: 0, missedGood: 0 };

for (const reference of references) {
  const spec = truth[reference];
  if (!spec) {
    console.log(`? ${reference}: no ground truth, skipped`);
    continue;
  }
  const found = findApplication(reference);
  if (!found) {
    console.log(`? ${reference}: not downloaded, skipped (npm run samples)`);
    continue;
  }

  const started = Date.now();
  let insights;
  try {
    insights = await generateInsights(reference, found.meta.authorityId, { force: true, deep });
  } catch (err) {
    console.log(`✗ ${reference}: generation failed — ${err.message}`);
    failed = true;
    continue;
  }
  const s = scoreSample(insights, spec);
  if (!s.ok) failed = true;
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  const l = s.labels;
  console.log(
    `${s.ok ? '✓' : '✗'} ${reference}: expected ${s.expectHits}/${s.expectTotal} found, ` +
      `${s.highlightHits}/${s.expectTotal} in highlights · ${s.highlights} highlights / ${s.found} found · ${secs}s${deep ? ' [deep]' : ''}`
  );
  if (l.total) {
    console.log(
      `    labels (${l.total}): precision highlights ${pct(l.highlightTally.precision)}, found ${pct(l.foundTally.precision)} · ` +
        `recall highlights ${pct(l.recallHighlights)}, found ${pct(l.recallFound)} · kind accuracy ${pct(l.foundTally.kindAccuracy)} · ` +
        `${l.foundTally.unlabelled} found unlabelled`
    );
    totals.good += l.foundTally.good;
    totals.bad += l.foundTally.bad;
    totals.hGood += l.highlightTally.good;
    totals.hBad += l.highlightTally.bad;
    totals.labelledGood += l.good;
    totals.missedGood += l.missedGood.length;
  }
  for (const e of s.misses) console.log(`    MISS  ${e.kind ?? 'any'} ${e.doc}${e.page ? ` p${e.page}` : ''}${e.note ? ` — ${e.note}` : ''}`);
  for (const e of s.notHighlighted) console.log(`    NOT IN HIGHLIGHTS  ${e.kind ?? 'any'} ${e.doc}${e.page ? ` p${e.page}` : ''}`);
  for (const e of s.leaks) console.log(`    LEAK  ${e.kind ?? 'any'} ${e.doc}${e.page ? ` p${e.page}` : ''} — ${e.reason ?? 'should not appear'}`);
  if (s.emptyFail) console.log(`    LEAK  expected no images, found ${s.found}`);
  for (const i of l.badHighlights) console.log(`    BAD HIGHLIGHT  ${i.kind} ${i.localFilename} p${i.page} — ${i.reason ?? ''}`);
  for (const m of l.missedGood) console.log(`    MISSED GOOD  ${m.kind ?? 'any'} ${m.file} p${m.page}`);
}

if (totals.good + totals.bad) {
  console.log(
    `\nAll labelled samples: precision highlights ${pct(totals.hGood / (totals.hGood + totals.hBad || 1))}, ` +
      `found ${pct(totals.good / (totals.good + totals.bad))} · recall found ${pct((totals.labelledGood - totals.missedGood) / (totals.labelledGood || 1))}`
  );
}

const unlabelled = loadManifest()
  .map((s) => s.reference)
  .filter((ref) => !truth[ref]);
if (unlabelled.length) console.log(`\nNo ground truth yet: ${unlabelled.join(', ')} (label them in the contact sheet)`);

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed ? 1 : 0);
