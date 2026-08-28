import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { downloadApplication, searchPlanIt } from './scraper.js';

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

app.post('/api/download', async (req, res) => {
  try {
    const { reference } = req.body;
    if (!reference) {
      return res.status(400).json({ error: 'Reference is required' });
    }
    const meta = await downloadApplication(reference);
    res.json({ success: true, meta });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/applications', (req, res) => {
  try {
    if (!fs.existsSync(DOWNLOADS_DIR)) {
      return res.json([]);
    }
    const dirs = fs.readdirSync(DOWNLOADS_DIR);
    const apps = dirs.map(dir => {
      const metaPath = path.join(DOWNLOADS_DIR, dir, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        try {
          return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch (e) {
          return null;
        }
      }
      return null;
    }).filter(Boolean);
    res.json(apps);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/applications/:ref', (req, res) => {
  try {
    const ref = req.params.ref.replace(/\//g, '-');
    const metaPath = path.join(DOWNLOADS_DIR, ref, 'metadata.json');
    if (fs.existsSync(metaPath)) {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      res.json(data);
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
