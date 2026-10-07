// Cache-first downloader for the real sample applications used to ground and
// evaluate the insights heuristics. The samples are large and copyrighted, so
// they are deliberately not in the repo (`downloads/` is gitignored); this
// script fetches them on demand instead.
//
//   npm run build          # the script imports from dist/
//   node scripts/fetch-samples.mjs [reference ...]
//
// Any application already present under downloads/<authority>/<ref>/ is left
// alone (even a partial one is resumed by the scraper). Pass --force to
// re-scrape, or --list to print the manifest without downloading.
//
// The scraper needs a browser. For the Node (non-Electron) path install
// Playwright's Chromium (`npx playwright install chromium`); on a bare Debian
// sandbox it additionally needs the extracted shared libraries and a
// fontconfig file described in docs/insights.md.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getApplicationDir } from '../dist/storage.js';
import { downloadApplication } from '../dist/scraper.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'samples.json'), 'utf-8'));

const args = process.argv.slice(2);
const force = args.includes('--force');
const listOnly = args.includes('--list');
const filters = args.filter((a) => !a.startsWith('--'));

if (listOnly) {
  for (const s of manifest) console.log(`${s.reference}  (${s.authorityId})  ${s.shape}`);
  process.exit(0);
}

const samples = filters.length
  ? manifest.filter((s) => filters.includes(s.reference))
  : manifest;

if (samples.length === 0) {
  console.error(`No samples matched: ${filters.join(', ')}`);
  process.exit(1);
}

const cached = [];
const fetched = [];
const failed = [];

for (const sample of samples) {
  const dir = getApplicationDir(sample.reference, sample.authorityId);
  const metaPath = path.join(dir, 'metadata.json');

  if (!force && fs.existsSync(metaPath)) {
    console.log(`cached  ${sample.reference}  (${sample.shape})`);
    cached.push(sample);
    continue;
  }

  console.log(`fetch   ${sample.reference}  (${sample.shape})`);
  try {
    await downloadApplication(sample.reference, sample.authorityId, (message) => {
      process.stdout.write(`        ${message}\n`);
    });
    if (!fs.existsSync(metaPath)) {
      throw new Error('scrape finished but metadata.json was not written');
    }
    fetched.push(sample);
  } catch (err) {
    console.error(`        ERROR: ${err.message}`);
    failed.push(sample);
  }
}

console.log(
  `\n${samples.length} sample(s): ${cached.length} cached, ${fetched.length} fetched, ${failed.length} failed`
);
if (failed.length) {
  for (const s of failed) console.error(`  failed: ${s.reference} (${s.authorityId})`);
  process.exit(1);
}
