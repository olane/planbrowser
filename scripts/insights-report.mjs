// Runs the insights heuristic over downloaded sample applications and writes a
// contact sheet so the ranking can be eyeballed. Doubles as the evaluation
// harness described in docs/insights.md.
//
//   npm run build
//   node scripts/insights-report.mjs [reference ...]
//
// References are optional; with none it processes every downloaded application.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateInsights } from '../dist/insights/generate.js';

const root = process.env.DOWNLOADS_DIR
  ? path.resolve(process.env.DOWNLOADS_DIR)
  : path.join(process.cwd(), 'downloads');

const args = process.argv.slice(2);
const deep = args.includes('--deep');
const filters = args.filter((a) => a !== '--deep');

function findApplications() {
  const apps = [];
  if (!fs.existsSync(root)) return apps;
  for (const authority of fs.readdirSync(root)) {
    const authorityDir = path.join(root, authority);
    if (!fs.statSync(authorityDir).isDirectory()) continue;
    for (const entry of fs.readdirSync(authorityDir)) {
      const dir = path.join(authorityDir, entry);
      const metaPath = path.join(dir, 'metadata.json');
      if (!fs.existsSync(metaPath)) continue;
      let meta;
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch {
        continue;
      }
      if (filters.length && !filters.includes(meta.reference)) continue;
      apps.push({ meta, dir });
    }
  }
  return apps;
}

const escape = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const apps = findApplications();
const summaries = [];

for (const { meta, dir } of apps) {
  const started = Date.now();
  process.stdout.write(`\n=== ${meta.reference} (${meta.documents?.length ?? 0} docs) ...\n`);
  let insights;
  try {
    insights = await generateInsights(meta.reference, meta.authorityId, { force: true, deep });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    continue;
  }
  const ms = Date.now() - started;
  if (!insights) {
    console.log('  no metadata');
    continue;
  }

  const byKind = {};
  for (const img of insights.images) byKind[img.kind] = (byKind[img.kind] ?? 0) + 1;
  const foundCount = insights.found?.length ?? insights.images.length;
  console.log(
    `  ${insights.images.length} highlights / ${foundCount} found in ${(ms / 1000).toFixed(0)}s  ` +
      `[${insights.depth ?? 'quick'}]  ${JSON.stringify(byKind)}`
  );
  if (insights.coverage) {
    const cov = insights.coverage;
    console.log(
      `  coverage: partial=${cov.partial} docs=${cov.documentsAnalysed}/${cov.documentsTotal} ` +
        cov.images.map((c) => `${c.kind} ${c.selected}/${c.available}`).join('  ')
    );
  }
  console.log(`  metrics: ${JSON.stringify(insights.summary.metrics)}`);
  console.log(`  comments: ${JSON.stringify(insights.comments)}`);
  for (const img of insights.images) {
    console.log(`    [${img.kind}] ${img.label} — ${img.localFilename} p${img.page} (${img.score})`);
  }

  summaries.push({ meta, dir, insights, ms });
}

// Contact sheet
const rows = summaries
  .map(({ meta, dir, insights, ms }) => {
    const images = insights.images
      .map((img) => {
        const href = `file://${path.join(dir, 'insights', img.imageFile)}`;
        const doc = escape(`${img.label} — p${img.page} (${img.localFilename})`);
        return `<figure class="img"><img loading="lazy" src="${href}" alt="${doc}"><figcaption><b>${img.kind}</b> ${doc}<br><span class="score">score ${img.score}</span></figcaption></figure>`;
      })
      .join('\n');
    const metrics = Object.entries(insights.summary.metrics)
      .map(([k, v]) => `<span class="chip">${escape(k)}: ${escape(v)}</span>`)
      .join('');
    return `<section>
  <h2>${escape(meta.reference)} <small>${(meta.documents?.length ?? 0)} docs · ${insights.images.length} images · ${(ms / 1000).toFixed(0)}s</small></h2>
  <p class="proposal">${escape(meta.description)}</p>
  <p>${metrics}</p>
  <p class="comments">Comments: ${JSON.stringify(insights.comments)}</p>
  <div class="grid">${images}</div>
</section>`;
  })
  .join('\n');

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Insights report</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;color:#111}
h2 small{font-weight:400;color:#666;font-size:.7em}
.proposal{color:#333;max-width:70ch}
.chip{display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;border-radius:6px;padding:.1rem .4rem;margin:.15rem;font-size:.8rem}
.comments{color:#555;font-size:.85rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem}
figure{margin:0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
figure img{width:100%;height:180px;object-fit:contain;background:#f9fafb}
figcaption{font-size:.72rem;padding:.4rem;color:#444}
.score{color:#888}
</style></head><body><h1>Application insights report</h1>${rows}</body></html>`;

const out = path.join(os.tmpdir(), 'planbrowser-insights-report.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`\nReport written to ${out}`);
