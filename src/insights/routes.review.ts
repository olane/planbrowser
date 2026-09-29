import { Router } from 'express';
import path from 'path';
import crypto from 'crypto';
import { resolveApplicationMeta } from '../storage.js';
import { insightsDir, writeAsset } from './cache.js';
import { mergeLabels, readLabels, reviewEnabled, sanitizeLabels } from './labels.js';
import { closePdf, openPdf, renderPageToPng } from './render.js';
import { THUMB_WIDTH } from './generate.js';
import { resolveAuthorityId } from './routes.js';

// Local-development review tooling (docs/insights.md). It writes the eval ground
// truth and re-renders rejected pages, so every route is gated by
// `reviewEnabled()` and 404s outside a development checkout.
export const reviewRouter = Router();

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
    res.json({ labels: readLabels(found.meta.reference) });
  } catch {
    res.status(500).json({ error: 'Ground-truth file is unreadable' });
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
  const parsed = sanitizeLabels(req.body?.labels);
  if (!parsed) {
    res.status(400).json({ error: 'labels must be an array' });
    return;
  }
  // Only this application's own documents, matching the image endpoint.
  const known = new Set((found.meta.documents ?? []).map((doc) => doc.localFilename));
  const labels = parsed.filter((label) => known.has(label.file));
  try {
    res.json({ labels: mergeLabels(found.meta.reference, labels) });
  } catch {
    res.status(500).json({ error: 'Ground-truth file is unreadable' });
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
