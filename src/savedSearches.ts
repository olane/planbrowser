import fs from 'fs';
import path from 'path';
import type { SavedSearch, SearchFilters } from './types.js';
import { getDownloadsDir } from './config.js';

function searchesPath(): string {
  return path.join(getDownloadsDir(), '_savedSearches.json');
}

function ensureDir(): void {
  if (!fs.existsSync(getDownloadsDir())) {
    fs.mkdirSync(getDownloadsDir(), { recursive: true });
  }
}

interface SavedSearchesFile {
  version: number;
  searches: SavedSearch[];
}

function readSearches(): SavedSearch[] {
  try {
    if (fs.existsSync(searchesPath())) {
      const parsed = JSON.parse(fs.readFileSync(searchesPath(), 'utf-8'));
      if (parsed && Array.isArray(parsed.searches)) {
        return parsed.searches as SavedSearch[];
      }
    }
  } catch (e) {
    console.error('Failed to read saved searches, starting fresh:', e);
  }
  return [];
}

function writeSearches(searches: SavedSearch[]): void {
  ensureDir();
  const file: SavedSearchesFile = { version: 1, searches };
  fs.writeFileSync(searchesPath(), JSON.stringify(file, null, 2));
}

export function listSavedSearches(): SavedSearch[] {
  return readSearches();
}

export function getSavedSearch(id: string): SavedSearch | undefined {
  return readSearches().find((s) => s.id === id);
}

export function saveSearch(input: { postcode: string; radius: string; filters: SearchFilters }): SavedSearch {
  const searches = readSearches();
  const search: SavedSearch = {
    id: Math.random().toString(36).substring(2, 10),
    postcode: input.postcode,
    radius: input.radius,
    filters: input.filters,
    createdAt: new Date().toISOString()
  };
  searches.unshift(search);
  writeSearches(searches);
  return search;
}

export function deleteSavedSearch(id: string): boolean {
  const searches = readSearches();
  const next = searches.filter((s) => s.id !== id);
  if (next.length === searches.length) return false;
  writeSearches(next);
  return true;
}

export function recordSearchRun(id: string, references: string[]): SavedSearch | undefined {
  const searches = readSearches();
  const search = searches.find((s) => s.id === id);
  if (!search) return undefined;
  search.lastRunAt = new Date().toISOString();
  search.lastReferences = references;
  writeSearches(searches);
  return search;
}
