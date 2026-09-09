import fs from 'fs';
import path from 'path';
import type { DocumentSearchHit, DocumentSnippet } from '../types.js';
import { resolveApplicationMeta } from '../storage.js';
import { extractDocumentText } from './extract.js';
import { readSearchText, writeSearchText } from './searchTextCache.js';

// Characters of context kept on either side of a match for the snippet.
const SNIPPET_CONTEXT = 60;

function snippet(text: string, query: string): DocumentSnippet | null {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return null;
  return {
    before: text.slice(Math.max(0, idx - SNIPPET_CONTEXT), idx),
    match: text.slice(idx, idx + query.length),
    after: text.slice(idx + query.length, idx + query.length + SNIPPET_CONTEXT + 40)
  };
}

function countOccurrences(text: string, query: string): number {
  const needle = query.toLowerCase();
  const haystack = text.toLowerCase();
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

// Searches a single application's documents by content, extracting and caching
// their text lazily on first use. Results are ranked by how often the query
// appears. Returns [] when the application is unknown or the query is blank.
export async function searchApplicationDocuments(
  reference: string,
  authorityId: string | undefined,
  query: string
): Promise<DocumentSearchHit[]> {
  const q = query.trim();
  if (!q) return [];

  const resolved = resolveApplicationMeta(reference, authorityId);
  if (!resolved) return [];

  const { meta, dir } = resolved;
  const documents = meta.documents || [];
  if (documents.length === 0) return [];

  const cache = readSearchText(dir);
  let dirty = false;

  // Ensure every document has cached text before searching, so extraction is a
  // one-time cost paid on the first query rather than during download. A cached
  // entry is only trusted while the file's mtime/size is unchanged, so replaced
  // files are re-extracted.
  for (const doc of documents) {
    const filePath = path.join(dir, doc.localFilename);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch (e) {
      // File not on disk yet (e.g. a download still in progress): skip it and
      // let a later search pick it up once it lands.
      continue;
    }
    const cached = cache.documents[doc.localFilename];
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) continue;

    let text = '';
    try {
      text = (await extractDocumentText(filePath)) ?? '';
    } catch (e) {
      text = '';
    }
    cache.documents[doc.localFilename] = { text, mtimeMs: stat.mtimeMs, size: stat.size };
    dirty = true;
  }

  if (dirty) writeSearchText(dir, cache);

  const ranked: { hit: DocumentSearchHit; matches: number }[] = [];
  for (const doc of documents) {
    const text = cache.documents[doc.localFilename]?.text ?? '';
    if (!text) continue;
    const match = snippet(text, q);
    if (!match) continue;
    ranked.push({
      matches: countOccurrences(text, q),
      hit: {
        localFilename: doc.localFilename,
        documentType: doc.documentType,
        description: doc.description,
        datePublished: doc.datePublished,
        snippet: match
      }
    });
  }

  ranked.sort((a, b) => b.matches - a.matches);
  return ranked.map((r) => r.hit);
}
