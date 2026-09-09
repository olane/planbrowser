import fs from 'fs';
import path from 'path';

// Extracted text for an application's documents, cached to disk so each file is
// parsed once. Each entry records the file's mtime/size so a file that changes
// (e.g. re-downloaded or replaced) is re-extracted rather than served stale text.
export interface CachedDocumentText {
  text: string;
  mtimeMs: number;
  size: number;
}

interface SearchTextFile {
  version: number;
  documents: Record<string, CachedDocumentText>;
}

function cachePath(dir: string): string {
  return path.join(dir, 'search-text.json');
}

export function readSearchText(dir: string): SearchTextFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath(dir), 'utf-8'));
    if (parsed && typeof parsed === 'object' && parsed.documents && typeof parsed.documents === 'object') {
      const documents: Record<string, CachedDocumentText> = {};
      for (const [filename, raw] of Object.entries(parsed.documents as Record<string, unknown>)) {
        if (typeof raw === 'string') {
          // Legacy entry recorded without a stat: re-extract once.
          documents[filename] = { text: raw, mtimeMs: -1, size: -1 };
        } else if (raw && typeof raw === 'object') {
          const entry = raw as { text?: unknown; mtimeMs?: unknown; size?: unknown };
          if (typeof entry.text === 'string') {
            documents[filename] = {
              text: entry.text,
              mtimeMs: typeof entry.mtimeMs === 'number' ? entry.mtimeMs : -1,
              size: typeof entry.size === 'number' ? entry.size : -1
            };
          }
        }
      }
      return { version: parsed.version ?? 1, documents };
    }
  } catch (e) {
    // Missing or unreadable cache: start fresh.
  }
  return { version: 1, documents: {} };
}

export function writeSearchText(dir: string, file: SearchTextFile): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const target = cachePath(dir);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(file, null, 2));
  fs.renameSync(tmp, target);
}
