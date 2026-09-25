import { Router } from 'express';
import { resolveAuthority } from '../authorities.js';
import { resolveApplicationMeta } from '../storage.js';
import { isGenerating, startInsights } from './generate.js';
import { insightsDir, isValidAssetFile, readInsights } from './cache.js';

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
  const found = resolveApplicationMeta(req.params.ref, authorityId);
  if (!found) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }
  const insights = readInsights(found.dir);
  if (insights) {
    res.json({ status: 'ready', insights });
    return;
  }
  if (isGenerating(req.params.ref, authorityId)) {
    res.json({ status: 'running' });
    return;
  }
  res.json({ status: 'none' });
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
  startInsights(req.params.ref, authorityId, { force: true });
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
