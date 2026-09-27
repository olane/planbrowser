// Evaluate the insights heuristic against the human-curated expectations in
// scripts/samples.expected.json.
//
//   npm run build
//   node scripts/insights-eval.mjs [reference ...] [--deep]
//
// With no references it evaluates every sample that has expectations. Exits
// non-zero if an expected image is missing, an expected-absent image leaks into
// the results, or an expect-empty sample produced a gallery. This is the
// regression guard for heuristic changes; it is not run in CI (it needs
// downloaded samples).

import fs from 'fs';
import path from 'path';
import { generateInsights } from '../dist/insights/generate.js';

const root = process.env.DOWNLOADS_DIR
  ? path.resolve(process.env.DOWNLOADS_DIR)
  : path.join(process.cwd(), 'downloads');

const args = process.argv.slice(2);
const deep = args.includes('--deep');
const filters = args.filter((a) => a !== '--deep');

const expectedPath = path.join(process.cwd(), 'scripts', 'samples.expected.json');
const { samples: expectations } = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'));

function normalise(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findApplication(reference) {
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

function matchImage(image, spec) {
  const hay = normalise(`${image.localFilename} ${image.label ?? ''}`);
  if (!hay.includes(normalise(spec.doc))) return false;
  if (spec.page !== undefined && image.page !== spec.page) return false;
  if (spec.kind !== undefined && image.kind !== spec.kind) return false;
  return true;
}

const references = filters.length ? filters : Object.keys(expectations);
let failed = false;

for (const reference of references) {
  const spec = expectations[reference];
  if (!spec) {
    console.log(`? ${reference}: no expectations, skipped`);
    continue;
  }
  const found = findApplication(reference);
  if (!found) {
    console.log(`? ${reference}: not downloaded, skipped`);
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
  const pool = insights?.found ?? insights?.images ?? [];
  const expect = spec.expect ?? [];
  const hits = expect.filter((e) => pool.some((i) => matchImage(i, e)));
  const misses = expect.filter((e) => !pool.some((i) => matchImage(i, e)));
  const leaks = (spec.expectAbsent ?? []).filter((e) => pool.some((i) => matchImage(i, e)));
  const emptyFail = spec.expectEmpty === true && pool.length > 0;
  const ok = !misses.length && !leaks.length && !emptyFail;
  if (!ok) failed = true;

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(
    `${ok ? '✓' : '✗'} ${reference}: ${hits.length}/${expect.length} expected, ` +
      `${pool.length} found, ${secs}s${deep ? ' [deep]' : ''}`
  );
  for (const e of misses) console.log(`    MISS  ${e.kind ?? 'any'} ${e.doc}${e.page ? ` p${e.page}` : ''}${e.note ? ` — ${e.note}` : ''}`);
  for (const e of leaks) console.log(`    LEAK  ${e.kind ?? 'any'} ${e.doc}${e.page ? ` p${e.page}` : ''} — ${e.reason ?? 'should not appear'}`);
  if (emptyFail) console.log(`    LEAK  expected no images, found ${pool.length}`);
}

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed ? 1 : 0);
