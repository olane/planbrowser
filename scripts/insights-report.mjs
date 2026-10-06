// Runs the insights heuristic over downloaded sample applications and writes a
// contact sheet that doubles as the labelling tool for the eval ground truth.
//
//   npm run build
//   node scripts/insights-report.mjs [reference ...] [--deep]
//
// References are optional; with none it processes every downloaded application.
// Every rendered page is shown — highlights, the rest of `found`, and rejected
// pages — with the classifier's reason. Mark each tile good/bad (and correct
// its kind), then "Download labels" and merge them with
// `node scripts/insights-labels.mjs <downloaded labels.json>`.

import fs from 'fs';
import path from 'path';
import os from 'os';
import { generateInsights } from '../dist/insights/generate.js';
import { loadTruth, pageKey, pct, root, scoreSample } from './insights-truth.mjs';

const args = process.argv.slice(2);
const deep = args.includes('--deep');
const filters = args.filter((a) => !a.startsWith('--'));
const outDir = path.join(os.tmpdir(), 'planbrowser-insights-report');
const KINDS = ['render', 'map', 'elevation', 'plan', 'section', 'photo', 'other'];

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

const { samples: truth } = loadTruth();
const apps = findApplications();
const sections = [];
fs.mkdirSync(outDir, { recursive: true });

for (const { meta, dir } of apps) {
  const started = Date.now();
  process.stdout.write(`\n=== ${meta.reference} (${meta.documents?.length ?? 0} docs) ...\n`);
  // Copy each rendered page as it is interpreted: rejected pages' thumbnails
  // are pruned from the application's cache when generation finishes.
  const appOut = path.join(outDir, meta.reference.replace(/\//g, '-'));
  fs.mkdirSync(appOut, { recursive: true });
  const traces = [];
  let insights;
  try {
    insights = await generateInsights(meta.reference, meta.authorityId, {
      force: true,
      deep,
      trace: (entry) => {
        traces.push(entry);
        const src = path.join(dir, 'insights', entry.imageFile);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(appOut, entry.imageFile));
      }
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    continue;
  }
  const ms = Date.now() - started;
  if (!insights) {
    console.log('  no metadata');
    continue;
  }

  const spec = truth[meta.reference] ?? {};
  const score = scoreSample(insights, spec);
  const byKind = {};
  for (const img of insights.images) byKind[img.kind] = (byKind[img.kind] ?? 0) + 1;
  console.log(
    `  ${insights.images.length} highlights / ${insights.found?.length ?? 0} found, ${traces.length} pages interpreted in ` +
      `${(ms / 1000).toFixed(0)}s [${insights.depth ?? 'quick'}] ${JSON.stringify(byKind)}`
  );
  if (score.labels.total) {
    console.log(
      `  labels: precision highlights ${pct(score.labels.highlightTally.precision)}, found ${pct(score.labels.foundTally.precision)}`
    );
  }
  for (const img of insights.images) console.log(`    [${img.kind}] ${img.label} — ${img.localFilename} p${img.page} (${img.score}) ${img.reason ?? ''}`);

  const labels = new Map((spec.labels ?? []).map((l) => [pageKey(l.file, l.page), l]));
  const highlightKeys = new Set(insights.images.map((i) => pageKey(i.localFilename, i.page)));
  const foundByKey = new Map((insights.found ?? []).map((i) => [pageKey(i.localFilename, i.page), i]));
  const seen = new Set();
  const tiles = { highlights: [], found: [], rejected: [] };
  for (const t of traces) {
    const key = pageKey(t.localFilename, t.page);
    if (seen.has(key)) continue;
    seen.add(key);
    const image = foundByKey.get(key);
    const group = highlightKeys.has(key) ? 'highlights' : image ? 'found' : 'rejected';
    const kind = image?.kind ?? t.kind;
    const label = labels.get(key);
    const labelKind = label?.kind ?? kind;
    const labelRank = label?.rank ?? '';
    const src = `${path.basename(appOut)}/${t.imageFile}`;
    const caption = escape(`${image?.label ?? ''} — ${t.localFilename} p${t.page}`);
    tiles[group].push(`<figure class="tile ${label?.verdict ?? ''}" data-ref="${escape(meta.reference)}" data-file="${escape(t.localFilename)}" data-page="${t.page}">
  <img loading="lazy" src="${escape(src)}" alt="${caption}">
  <figcaption><b>${escape(kind)}</b> ${caption}<br><span class="reason">${escape(t.reason)} · score ${t.score}</span>
  <div class="controls">
    <label><input type="radio" name="${escape(key)}" value="good"${label?.verdict === 'good' ? ' checked' : ''}> good</label>
    <label><input type="radio" name="${escape(key)}" value="bad"${label?.verdict === 'bad' ? ' checked' : ''}> bad</label>
    <select class="kind">${KINDS.map((k) => `<option${k === labelKind ? ' selected' : ''}>${k}</option>`).join('')}</select>
    <select class="rank">
      <option value=""${labelRank === '' ? ' selected' : ''}>rank: —</option>
      <option value="high"${labelRank === 'high' ? ' selected' : ''}>rank: high</option>
      <option value="low"${labelRank === 'low' ? ' selected' : ''}>rank: low</option>
    </select>
  </div></figcaption>
</figure>`);
  }
  const metrics = Object.entries(insights.summary.metrics)
    .map(([k, v]) => `<span class="chip">${escape(k)}: ${escape(v)}</span>`)
    .join('');
  sections.push(`<section>
  <h2>${escape(meta.reference)} <small>${meta.documents?.length ?? 0} docs · ${insights.images.length} highlights · ${insights.found?.length ?? 0} found · ${(ms / 1000).toFixed(0)}s</small></h2>
  <p class="proposal">${escape(meta.description)}</p>
  <p>${metrics}</p>
  <h3>Highlights</h3><div class="grid">${tiles.highlights.join('\n')}</div>
  <details><summary>Also found (${tiles.found.length})</summary><div class="grid">${tiles.found.join('\n')}</div></details>
  <details><summary>Rejected (${tiles.rejected.length})</summary><div class="grid">${tiles.rejected.join('\n')}</div></details>
</section>`);
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Insights report</title>
<style>
body{font-family:system-ui,sans-serif;margin:2rem;color:#111}
header{position:sticky;top:0;background:#fff;padding:.5rem 0;border-bottom:1px solid #e5e7eb;z-index:1}
h2 small{font-weight:400;color:#666;font-size:.7em}
.proposal{color:#333;max-width:70ch}
.chip{display:inline-block;background:#eef2ff;border:1px solid #c7d2fe;border-radius:6px;padding:.1rem .4rem;margin:.15rem;font-size:.8rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem;margin:.5rem 0}
figure{margin:0;border:2px solid #e5e7eb;border-radius:8px;overflow:hidden}
figure.good{border-color:#16a34a}figure.bad{border-color:#dc2626}
figure img{width:100%;height:180px;object-fit:contain;background:#f9fafb}
figcaption{font-size:.72rem;padding:.4rem;color:#444}
.reason{color:#888}.controls{margin-top:.3rem;display:flex;gap:.5rem;align-items:center}
summary{cursor:pointer;margin:.5rem 0}
</style></head><body>
<header><b>Application insights report</b> · mark tiles good/bad, then
<button id="download">Download labels</button> and run <code>node scripts/insights-labels.mjs labels.json</code></header>
${sections.join('\n')}
<script>
document.addEventListener('change', (e) => {
  const tile = e.target.closest('.tile');
  if (!tile) return;
  const checked = tile.querySelector('input:checked');
  tile.classList.toggle('good', checked?.value === 'good');
  tile.classList.toggle('bad', checked?.value === 'bad');
});
document.getElementById('download').addEventListener('click', () => {
  const samples = {};
  for (const tile of document.querySelectorAll('.tile')) {
    const verdict = tile.querySelector('input:checked')?.value;
    if (!verdict) continue;
    const label = { file: tile.dataset.file, page: Number(tile.dataset.page), verdict };
    if (verdict === 'good') {
      label.kind = tile.querySelector('select.kind').value;
      const rank = tile.querySelector('select.rank').value;
      if (rank) label.rank = rank;
    }
    (samples[tile.dataset.ref] ??= []).push(label);
  }
  const blob = new Blob([JSON.stringify({ samples }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'labels.json' });
  a.click();
});
</script></body></html>`;

const out = path.join(outDir, 'index.html');
fs.writeFileSync(out, html);
console.log(`\nReport written to ${out}`);
