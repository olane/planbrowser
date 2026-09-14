import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { downloadApplication, searchPlanIt } from './scraper.js';
import { getApplications, getApplication } from './storage.js';
import { downloadQueue } from './queue.js';
import { resolveAuthority, DEFAULT_AUTHORITY_ID } from './authorities.js';
import { setFlags, readActivity, setDocFlags } from './userData.js';
import { getDownloadsDir, getUiDistDir } from './config.js';
import { SEARCH_FILTER_KEYS, SORT_FIELDS } from './types.js';
import { selectSyncApps } from './decision.js';
import { documentSearchRouter } from './search/routes.js';
import { listSavedSearches, getSavedSearch, saveSearch, deleteSavedSearch, recordSearchRun } from './savedSearches.js';
import type { SearchFilters, SortSpec, ApplicationFlags, DocumentFlags, QueueItem, ApplicationMeta } from './types.js';

function enqueueApplications(apps: ApplicationMeta[]): QueueItem[] {
  return apps.map((a) => downloadQueue.enqueue(a.reference, a.authorityId || DEFAULT_AUTHORITY_ID));
}

// Keep only known filter keys with a non-empty string value, so callers can pass
// arbitrary query/body objects without leaking unknown or blank entries into a
// saved search.
function sanitizeFilters(input: unknown): SearchFilters {
  const filters: SearchFilters = {};
  if (input && typeof input === 'object') {
    for (const key of SEARCH_FILTER_KEYS) {
      const value = (input as Record<string, unknown>)[key];
      if (typeof value === 'string' && value !== '') {
        filters[key] = value;
      }
    }
  }
  return filters;
}

// Validate a sort field/order pair against the whitelist, defaulting to newest
// first by start_date when absent or invalid.
function sanitizeSort(input: unknown): SortSpec {
  const field = (input as Record<string, unknown> | undefined)?.field;
  const order = (input as Record<string, unknown> | undefined)?.order;
  if (typeof field !== 'string' || !(SORT_FIELDS as readonly string[]).includes(field)) {
    return { field: 'start_date', order: 'desc' };
  }
  return { field: field as SortSpec['field'], order: order === 'asc' ? 'asc' : 'desc' };
}


export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/search', async (req, res) => {
    try {
      const postcode = req.query.postcode as string;
      const radius = (req.query.radius as string) || '2';
      if (!postcode) {
        return res.status(400).json({ error: 'Postcode is required' });
      }
      const filters = sanitizeFilters(req.query);
      const sort = sanitizeSort({ field: req.query.sort, order: req.query.order });
      const data = await searchPlanIt(postcode, radius, filters, sort);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/download', (req, res) => {
    try {
      const { reference, authority } = req.body;
      if (!reference) {
        return res.status(400).json({ error: 'Reference is required' });
      }
      const resolved = resolveAuthority(authority);
      const item = downloadQueue.enqueue(reference, resolved.id);
      res.json({ success: true, item, authority: resolved });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/queue', (req, res) => {
    res.json(downloadQueue.getQueue());
  });

  app.post('/api/queue/clear', (req, res) => {
    downloadQueue.clearCompleted();
    res.json({ success: true });
  });

  app.get('/api/applications', (req, res) => {
    try {
      const apps = getApplications();
      res.json(apps);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/applications/:ref', (req, res) => {
    try {
      const ref = req.params.ref;
      const body = req.body ?? {};
      let authorityId: string | undefined;
      if (typeof body.authority === 'string' && body.authority) {
        try {
          authorityId = resolveAuthority(body.authority).id;
        } catch (e) {
          return res.status(400).json({ error: (e as Error).message });
        }
      }
      const flags: Partial<ApplicationFlags> = {};
      if (typeof body.starred === 'boolean') flags.starred = body.starred;
      if (typeof body.archived === 'boolean') flags.archived = body.archived;
      const updated = setFlags(ref, authorityId, flags);
      res.json({ success: true, flags: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/documents', (req, res) => {
    try {
      const body = req.body ?? {};
      const { reference, filename } = body;
      if (typeof reference !== 'string' || !reference) {
        return res.status(400).json({ error: 'Reference is required' });
      }
      if (typeof filename !== 'string' || !filename) {
        return res.status(400).json({ error: 'Filename is required' });
      }
      let authorityId: string | undefined;
      if (typeof body.authority === 'string' && body.authority) {
        try {
          authorityId = resolveAuthority(body.authority).id;
        } catch (e) {
          return res.status(400).json({ error: (e as Error).message });
        }
      }
      const flags: Partial<DocumentFlags> = {};
      if (typeof body.starred === 'boolean') flags.starred = body.starred;
      if (typeof body.note === 'string') flags.note = body.note;
      const updated = setDocFlags(reference, authorityId, filename, flags);
      res.json({ success: true, flags: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/feed', (req, res) => {
    try {
      const events = readActivity();
      const appsById = new Map(
        getApplications().map((a) => [`${a.authorityId || DEFAULT_AUTHORITY_ID}/${a.reference}`, a])
      );
      res.json(
        events.map((e) => ({
          ...e,
          application: appsById.get(`${e.authorityId || DEFAULT_AUTHORITY_ID}/${e.reference}`) ?? null
        }))
      );
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sync', (req, res) => {
    try {
      const body = req.body ?? {};
      const starred = body.starred === true;
      const awaitingDecision = body.awaitingDecision === true;
      const all = body.all === true;
      const apps = selectSyncApps(getApplications(), { starred, awaitingDecision, all });
      const items = enqueueApplications(apps);
      res.json({ success: true, queued: items.length, items });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/sync-starred', (req, res) => {
    try {
      const items = enqueueApplications(selectSyncApps(getApplications(), { starred: true, awaitingDecision: false }));
      res.json({ success: true, queued: items.length, items });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/saved-searches', (req, res) => {
    try {
      res.json(listSavedSearches());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/saved-searches', (req, res) => {
    try {
      const body = req.body ?? {};
      const postcode = typeof body.postcode === 'string' ? body.postcode : '';
      if (!postcode) {
        return res.status(400).json({ error: 'Postcode is required' });
      }
      const radius = typeof body.radius === 'string' && body.radius ? body.radius : '2';
      const saved = saveSearch({ postcode, radius, filters: sanitizeFilters(body.filters), sort: sanitizeSort(body.sort) });
      res.json(saved);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/saved-searches/:id', (req, res) => {
    try {
      const deleted = deleteSavedSearch(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Saved search not found' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/saved-searches/:id/run', async (req, res) => {
    try {
      const search = getSavedSearch(req.params.id);
      if (!search) {
        return res.status(404).json({ error: 'Saved search not found' });
      }
      const data = await searchPlanIt(search.postcode, search.radius, search.filters, search.sort);
      const records = Array.isArray(data.records) ? data.records : [];
      const references = records.map((r: { uid: string }) => r.uid);
      const previousReferences = search.lastReferences ?? [];
      recordSearchRun(search.id, references);
      res.json({ records, previousReferences, total: data.total });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/applications/:ref', (req, res) => {
    try {
      const ref = req.params.ref;
      const rawAuthority = typeof req.query.authority === 'string' ? req.query.authority : undefined;
      let authorityId: string | undefined;
      if (rawAuthority) {
        try {
          authorityId = resolveAuthority(rawAuthority).id;
        } catch (e) {
          // Unknown authority filter: fall back to searching all authorities
        }
      }
      const app = getApplication(ref, authorityId);
      if (app) {
        res.json(app);
      } else {
        res.status(404).json({ error: 'Application not found' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Search a single application's documents by content
  app.use(documentSearchRouter);

  // Serve static documents
  app.use('/api/documents', express.static(getDownloadsDir()));

  // Serve the built web UI when present. In local dev the Vite dev server
  // serves the UI and proxies /api here (and never hits this for non-API
  // routes), so this is harmless. It is what makes both the Docker container
  // and the Electron app serve their own copy of the UI.
  if (fs.existsSync(getUiDistDir())) {
    app.use(express.static(getUiDistDir()));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      // Use a root-relative sendFile: an absolute path through sendFile is
      // treated as a dotfile and rejected when the app lives under a hidden
      // directory (e.g. ~/.paseo/worktrees/...), which would 404 every route.
      res.sendFile('index.html', { root: getUiDistDir() });
    });
  }

  return app;
}
