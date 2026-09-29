import { Router } from 'express';
import path from 'path';
import crypto from 'crypto';
import { resolveAuthority } from '../authorities.js';
import { resolveApplicationMeta } from '../storage.js';
import { getInsightsState, startInsights } from './jobs.js';
import { insightsDir, isValidAssetFile, writeAsset } from './cache.js';
import { labelsAvailable, mergeLabels, readLabels, sanitizeLabels } from './labels.js';
import { closePdf, openPdf, renderPageToPng } from './render.js';
import { THUMB_WIDTH } from './generate.js';

export const insightsRouter = Router();

function resolveAuthorityId(raw: unknown): string | undefined {
  if (typeof raw === 'string' && raw) {
    try {
      return resolveAuthority(raw).id;
    } catch {
      // Unknown authority: fall back to searching all authorities.
    }
  }
  return undefined;
}

insightsRouter.get('/api/applications/:ref/insights', (req, res) => {
  const authorityId = resolveAuthorityId(req.query.authority);
  const state = getInsightsState(req.params.ref, authorityId);
  if (!state) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }
  if (state.status === 'ready' && state.insights) {
    res.json({ status: 'ready', insights: state.insights });
    return;
  }
  if (state.status === 'error') {
    res.json({ status: 'error', error: state.error });
    return;
  }
  // `running` may carry the previous result so the UI can keep it on screen
  // while a deep scan or background refresh proceeds.
  res.json({ status: state.status, ...(state.insights ? { insights: state.insights } : {}) });
});

// Generation is CPU-heavy (it may render dozens of pages), so this kicks it off
// in the background and returns immediately; the UI polls the GET above.
insightsRouter.post('/api/applications/:ref/insights', (req, res) => {
  const authorityId = resolveAuthorityId(req.body?.authority ?? req.query.authority);
  const found = resolveApplicationMeta(req.params.ref, authorityId);
  if (!found) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }
  startInsights(req.params.ref, authorityId, { force: true, deep: req.body?.deep === true });
  res.json({ status: 'running' });
});

// Serve a generated thumbnail. Only content-addressed asset names are accepted,
// and the path is resolved relative to the app's insights directory.
insightsRouter.get('/api/applications/:ref/insights/images/:file', (req, res) => {
  const authorityId = resolveAuthorityId(req.query.authority);
  const found = resolveApplicationMeta(req.params.ref, authorityId);
  if (!found) {
    res.status(404).end();
    return;
  }
  const file = req.params.file;
  if (!isValidAssetFile(file)) {
    res.status(400).end();
    return;
  }
  res.sendFile(file, { root: insightsDir(found.dir) });
});

// Review labels: page verdicts made in the review tool, written into the eval
// ground truth. Local development only — `labelsAvailable` is false in a
// packaged build (no scripts/), so these 404 there.
insightsRouter.get('/api/applications/:ref/insights/labels', (req, res) => {
  if (!labelsAvailable()) {
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

insightsRouter.post('/api/applications/:ref/insights/labels', (req, res) => {
  if (!labelsAvailable()) {
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
// show rejected pages whose assets were pruned from the gallery. Local
// development only. `file` must be one of the application's own documents, so
// it cannot escape into the downloads tree. Rendered fresh rather than through
// the feature cache: the review grid requests many images at once, and writing
// features.json per request would race.
insightsRouter.get('/api/applications/:ref/insights/review/image', async (req, res) => {
  if (!labelsAvailable()) {
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
