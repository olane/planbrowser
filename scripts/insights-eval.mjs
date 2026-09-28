// Evaluate the insights heuristic against the ground truth in
// scripts/samples.expected.json (see scripts/insights-truth.mjs for the format).
//
//   npm run build
//   node scripts/insights-eval.mjs [reference ...] [--deep] [--cache-check]
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
//
// --cache-check also verifies the page-facts cache on each sample: a cold run
// (features.json removed) and a warm run must give identical results, the warm
// run must open no PDFs, and a pruned thumbnail must be re-rendered on demand.
// The cold run re-renders everything, so this is slow.

import fs from 'fs';
import path from 'path';
import { isDeepStrictEqual } from 'util';
import { generateInsights } from '../dist/insights/generate.js';
import { findApplication, loadManifest, loadTruth, pct, scoreSample } from './insights-truth.mjs';

const args = process.argv.slice(2);
const deep = args.includes('--deep');
const cacheCheck = args.includes('--cache-check');
const filters = args.filter((a) => !a.startsWith('--'));

// Returns the problems found (none when the cache behaves) and a work summary.
async function checkCache(reference, authorityId, dir) {
  const problems = [];
  const run = async () => {
    let work;
    const insights = await generateInsights(reference, authorityId, { force: true, deep, onWork: (w) => (work = w) });
    return { insights, work };
  };
  fs.rmSync(path.join(dir, 'insights', 'features.json'), { force: true });
  const cold = await run();
  const warm = await run();
  if (warm.work.opened !== 0) problems.push(`warm run opened ${warm.work.opened} PDFs (expected 0)`);
  if (!isDeepStrictEqual(cold.insights?.found, warm.insights?.found)) problems.push('warm `found` differs from cold');
  if (!isDeepStrictEqual(cold.insights?.images, warm.insights?.images)) problems.push('warm highlights differ from cold');

  const victim = warm.insights?.found?.[0];
  if (victim) {
    fs.rmSync(path.join(dir, 'insights', victim.imageFile), { force: true });
    const again = await run();
    const image = again.insights?.found?.find((i) => i.localFilename === victim.localFilename && i.page === victim.page);
    if (!image || !fs.existsSync(path.join(dir, 'insights', image.imageFile))) problems.push('pruned thumbnail was not re-rendered');
    if (again.work.rendered !== 1) problems.push(`re-rendering one pruned thumbnail rendered ${again.work.rendered} pages`);
  }
  const work = (w) => `opened ${w.opened}, scanned ${w.scanned}, rendered ${w.rendered}`;
  return { problems, summary: `cold ${work(cold.work)} · warm ${work(warm.work)}` };
}

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
  const cache = cacheCheck ? await checkCache(reference, found.meta.authorityId, found.dir) : undefined;
  if (cache?.problems.length) failed = true;
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
  if (cache) console.log(`    cache: ${cache.summary}`);
  for (const p of cache?.problems ?? []) console.log(`    CACHE  ${p}`);
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
