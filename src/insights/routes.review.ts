import { Router } from 'express';
import path from 'path';
import crypto from 'crypto';
import { resolveApplicationMeta } from '../storage.js';
import type { InsightLabel } from '../types.js';
import { insightsDir, writeAsset } from './cache.js';
import {
  mergeReviewLabels,
  readReviewLabels,
  readReviewStore,
  removeReviewLabels,
  reviewEnabled,
  sanitizeLabels,
  sanitizePageRefs
} from './labels.js';
import { closePdf, openPdf, renderPageToPng } from './render.js';
import { THUMB_WIDTH } from './generate.js';
import { resolveAuthorityId } from './routes.js';

// Review tooling (docs/insights.md). It collects page verdicts into the
// persistent review store and re-renders rejected pages, so every route is
// gated by `reviewEnabled()` and 404s on a plain packaged build.
export const reviewRouter = Router();

// Download every verdict collected so far, in the shape `npm run
// insights:labels` consumes: `{ samples: { <reference>: InsightLabel[] } }`.
// Point an agent at this URL to fold live feedback into the eval ground truth.
reviewRouter.get('/api/insights/reviews', (req, res) => {
  if (!reviewEnabled()) {
    res.status(404).json({ error: 'Review labelling is not available' });
    return;
  }
  const samples: Record<string, InsightLabel[]> = {};
  for (const [reference, spec] of Object.entries(readReviewStore().samples ?? {})) {
    const labels = spec.labels ?? [];
    if (labels.length) samples[reference] = labels;
  }
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="insights-reviews.json"');
  res.send(`${JSON.stringify({ samples }, null, 2)}\n`);
});

reviewRouter.get('/api/applications/:ref/insights/labels', (req, res) => {
  if (!reviewEnabled()) {
    res.status(404).json({ error: 'Review labelling is not available' });
    return;
  }
  const found = resolveApplicationMeta(req.params.ref, resolveAuthorityId(req.query.authority));
  if (!found) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }
  try {
    res.json({ labels: readReviewLabels(found.meta.reference) });
  } catch {
    res.status(500).json({ error: 'Review store is unreadable' });
  }
});

reviewRouter.post('/api/applications/:ref/insights/labels', (req, res) => {
  if (!reviewEnabled()) {
    res.status(404).json({ error: 'Review labelling is not available' });
    return;
  }
  const found = resolveApplicationMeta(
    req.params.ref,
    resolveAuthorityId(req.body?.authority ?? req.query.authority)
  );
  if (!found) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }
  const parsed = sanitizeLabels(req.body?.labels ?? []);
  const removals = sanitizePageRefs(req.body?.remove ?? []);
  if (!parsed || !removals) {
    res.status(400).json({ error: 'labels and remove must be arrays' });
    return;
  }
  // Only this application's own documents, matching the image endpoint.
  const known = new Set((found.meta.documents ?? []).map((doc) => doc.localFilename));
  const labels = parsed.filter((label) => known.has(label.file));
  const remove = removals.filter((ref) => known.has(ref.file));
  try {
    if (remove.length) removeReviewLabels(found.meta.reference, remove);
    const remaining = labels.length
      ? mergeReviewLabels(found.meta.reference, labels)
      : readReviewLabels(found.meta.reference);
    res.json({ labels: remaining });
  } catch {
    res.status(500).json({ error: 'Review store is unreadable' });
  }
});

// Render the thumbnail for any one page of a document, so the review UI can
// show rejected pages whose assets were pruned from the gallery. `file` must be
// one of the application's own documents, so it cannot escape into the
// downloads tree. Rendered fresh rather than through the feature cache: the
// review grid requests many images at once, and writing features.json per
// request would race.
reviewRouter.get('/api/applications/:ref/insights/review/image', async (req, res) => {
  if (!reviewEnabled()) {
    res.status(404).end();
    return;
  }
  const found = resolveApplicationMeta(req.params.ref, resolveAuthorityId(req.query.authority));
  if (!found) {
    res.status(404).end();
    return;
  }
  const file = typeof req.query.file === 'string' ? req.query.file : '';
  const page = Number(req.query.page);
  if (!file || path.basename(file) !== file || !Number.isInteger(page) || page < 1) {
    res.status(400).end();
    return;
  }
  if (!(found.meta.documents ?? []).some((doc) => doc.localFilename === file)) {
    res.status(404).end();
    return;
  }
  let png: Buffer;
  try {
    const pdf = await openPdf(path.join(found.dir, file));
    try {
      png = await renderPageToPng(pdf, page, THUMB_WIDTH);
    } finally {
      await closePdf(pdf).catch(() => {});
    }
  } catch {
    res.status(404).end();
    return;
  }
  const imageFile = `${crypto.createHash('sha1').update(png).digest('hex')}.png`;
  writeAsset(found.dir, imageFile, png);
  res.sendFile(imageFile, { root: insightsDir(found.dir) });
});
