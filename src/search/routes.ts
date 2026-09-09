import { Router } from 'express';
import { searchApplicationDocuments } from './search.js';
import { resolveAuthority } from '../authorities.js';

export const documentSearchRouter = Router();

documentSearchRouter.get('/api/applications/:ref/documents/search', async (req, res) => {
  try {
    const reference = req.params.ref;
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    if (!query.trim()) {
      res.json({ hits: [] });
      return;
    }

    const rawAuthority = typeof req.query.authority === 'string' ? req.query.authority : undefined;
    let authorityId: string | undefined;
    if (rawAuthority) {
      try {
        authorityId = resolveAuthority(rawAuthority).id;
      } catch (e) {
        // Unknown authority: fall back to searching all authorities.
      }
    }

    const hits = await searchApplicationDocuments(reference, authorityId, query);
    res.json({ hits });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
