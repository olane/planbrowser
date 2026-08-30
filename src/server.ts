import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { downloadApplication, searchPlanIt } from './scraper.js';
import { getApplications, getApplication } from './storage.js';
import { downloadQueue } from './queue.js';
import { resolveAuthority, DEFAULT_AUTHORITY_ID } from './authorities.js';
import { setFlags, readActivity } from './userData.js';
import type { SearchFilters, ApplicationFlags } from './types.js';

const app = express();
app.use(cors());
app.use(express.json());

const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');

const FILTER_KEYS = [
  'search',
  'developer',
  'app_type',
  'app_state',
  'app_size',
  'recent',
  'start_date',
  'end_date',
  'changed',
  'changed_start',
  'changed_end',
  'decided',
  'decided_start',
  'decided_end',
  'different',
  'different_start',
  'different_end'
] as const;

app.get('/api/search', async (req, res) => {
  try {
    const postcode = req.query.postcode as string;
    const radius = (req.query.radius as string) || '2';
    if (!postcode) {
      return res.status(400).json({ error: 'Postcode is required' });
    }
    const filters: SearchFilters = {};
    for (const key of FILTER_KEYS) {
      const value = req.query[key];
      if (typeof value === 'string' && value !== '') {
        filters[key] = value;
      }
    }
    const data = await searchPlanIt(postcode, radius, filters);
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

app.get('/api/feed', (req, res) => {
  try {
    res.json(readActivity());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sync-starred', (req, res) => {
  try {
    const starred = getApplications().filter((a) => a.starred);
    const items = starred.map((a) => downloadQueue.enqueue(a.reference, a.authorityId || DEFAULT_AUTHORITY_ID));
    res.json({ success: true, queued: items.length, items });
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

// Serve static documents
app.use('/api/documents', express.static(DOWNLOADS_DIR));

// Serve the built web UI in production (i.e. the Docker container). In local
// dev the Vite dev server serves the UI and proxies /api here, so this is
// skipped when NODE_ENV is not "production".
if (process.env.NODE_ENV === 'production') {
  const UI_DIST = path.join(process.cwd(), 'ui', 'dist');
  app.use(express.static(UI_DIST));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(UI_DIST, 'index.html'));
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
