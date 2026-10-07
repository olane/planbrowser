// Merge labels downloaded from the contact sheet into the eval ground truth.
//
//   npm run insights:labels -- ~/Downloads/labels.json
//
// Labels are keyed by sample + file + page; a new verdict for the same page
// replaces the old one. Samples without an entry yet are created. The merging
// and file formatting live in src/insights/labels.ts, shared with the review
// tool, so there is one implementation.

import fs from 'fs';
import { mergeLabels, readLabels, truthFile } from '../dist/insights/labels.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/insights-labels.mjs <labels.json>');
  process.exit(1);
}

const incoming = JSON.parse(fs.readFileSync(file, 'utf-8')).samples ?? {};
let added = 0;
let replaced = 0;

for (const [reference, labels] of Object.entries(incoming)) {
  const before = new Set(readLabels(reference).map((label) => `${label.file}#${label.page}`));
  for (const label of labels) {
    if (before.has(`${label.file}#${label.page}`)) replaced++;
    else added++;
  }
  mergeLabels(reference, labels);
}

console.log(`Merged labels into ${truthFile()}: ${added} added, ${replaced} replaced.`);
