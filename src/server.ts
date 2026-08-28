import express from 'express';
import cors from 'cors';
import path from 'path';
import { downloadApplication, searchPlanIt } from './scraper.js';
import { getApplications, getApplication } from './storage.js';
import { downloadQueue } from './queue.js';

const app = express();
app.use(cors());
app.use(express.json());

const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');

app.get('/api/search', async (req, res) => {
  try {
    const postcode = req.query.postcode as string;
    const radius = (req.query.radius as string) || '2';
    if (!postcode) {
      return res.status(400).json({ error: 'Postcode is required' });
    }
    const data = await searchPlanIt(postcode, radius);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/download', (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }
    const item = downloadQueue.enqueue(reference);
    res.json({ success: true, item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
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

app.get('/api/applications/:ref', (req, res) => {
  try {
    const ref = req.params.ref;
    const app = getApplication(ref);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
