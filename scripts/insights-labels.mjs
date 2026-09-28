// Merge labels downloaded from the contact sheet into the eval ground truth.
//
//   node scripts/insights-labels.mjs ~/Downloads/labels.json
//
// Labels are keyed by sample + file + page; a new verdict for the same page
// replaces the old one. Samples without an entry yet are created.

import fs from 'fs';
import { loadTruth, pageKey, truthPath } from './insights-truth.mjs';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/insights-labels.mjs <labels.json>');
  process.exit(1);
}

const incoming = JSON.parse(fs.readFileSync(file, 'utf-8')).samples ?? {};
const truth = loadTruth();
let added = 0;
let replaced = 0;

for (const [reference, labels] of Object.entries(incoming)) {
  const spec = (truth.samples[reference] ??= {});
  const byKey = new Map((spec.labels ?? []).map((l) => [pageKey(l.file, l.page), l]));
  for (const label of labels) {
    const key = pageKey(label.file, label.page);
    if (byKey.has(key)) replaced++;
    else added++;
    byKey.set(key, label);
  }
  spec.labels = [...byKey.values()].sort((a, b) => a.file.localeCompare(b.file) || a.page - b.page);
}

// Keep the file's style: one line per flat entry ({ doc, page, kind } etc.).
const json = JSON.stringify(truth, null, 2).replace(/\{\n\s+([^{}\[\]]*?)\n\s*\}/g, (_, body) => `{ ${body.replace(/,\n\s+/g, ', ')} }`);
fs.writeFileSync(truthPath, `${json}\n`);
console.log(`Merged labels into ${truthPath}: ${added} added, ${replaced} replaced.`);
