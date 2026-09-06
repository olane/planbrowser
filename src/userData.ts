import fs from 'fs';
import path from 'path';
import type { ActivityEvent, ApplicationFlags, DocumentFlags } from './types.js';
import { DEFAULT_AUTHORITY_ID } from './authorities.js';
import { getDownloadsDir } from './config.js';
import { safeReference } from './refs.js';

function statePath(): string {
  return path.join(getDownloadsDir(), '_state.json');
}

function activityPath(): string {
  return path.join(getDownloadsDir(), '_activity.json');
}

function docStatePath(): string {
  return path.join(getDownloadsDir(), '_documents.json');
}

interface StateFile {
  version: number;
  apps: Record<string, ApplicationFlags>;
}

interface DocStateFile {
  version: number;
  docs: Record<string, DocumentFlags>;
}

function appKey(reference: string, authorityId?: string): string {
  return `${authorityId || DEFAULT_AUTHORITY_ID}/${reference}`;
}

function ensureDir(): void {
  if (!fs.existsSync(getDownloadsDir())) {
    fs.mkdirSync(getDownloadsDir(), { recursive: true });
  }
}

// State files are read on every request, so cache the parsed contents in
// memory and invalidate on write (or when the downloads directory changes).
let cachedDir: string | undefined;
let stateCache: StateFile | undefined;
let docStateCache: DocStateFile | undefined;
let activityCache: ActivityEvent[] | undefined;

function refreshCaches(): void {
  const dir = getDownloadsDir();
  if (cachedDir !== dir) {
    cachedDir = dir;
    stateCache = undefined;
    docStateCache = undefined;
    activityCache = undefined;
  }
}

function readState(): StateFile {
  refreshCaches();
  if (stateCache) return stateCache;
  try {
    if (fs.existsSync(statePath())) {
      const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf-8'));
      if (parsed && typeof parsed === 'object' && parsed.apps) {
        stateCache = parsed as StateFile;
        return stateCache;
      }
    }
  } catch (e) {
    console.error('Failed to read state file, starting fresh:', e);
  }
  stateCache = { version: 1, apps: {} };
  return stateCache;
}

function writeState(state: StateFile): void {
  ensureDir();
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2));
  stateCache = state;
}

export function getFlags(reference: string, authorityId?: string): ApplicationFlags {
  const state = readState();
  return state.apps[appKey(reference, authorityId)] ?? { starred: false, archived: false };
}

export function setFlags(reference: string, authorityId: string | undefined, flags: Partial<ApplicationFlags>): ApplicationFlags {
  const state = readState();
  const key = appKey(reference, authorityId);
  const existing = state.apps[key] ?? { starred: false, archived: false };
  const updated: ApplicationFlags = { ...existing, ...flags };

  if (flags.starred === true && !existing.starred) {
    updated.starredAt = new Date().toISOString();
  } else if (flags.starred === false) {
    delete updated.starredAt;
  }
  if (flags.archived === true && !existing.archived) {
    updated.archivedAt = new Date().toISOString();
  } else if (flags.archived === false) {
    delete updated.archivedAt;
  }

  state.apps[key] = updated;
  writeState(state);
  return updated;
}

function docKey(reference: string, authorityId: string | undefined, filename: string): string {
  return `${authorityId || DEFAULT_AUTHORITY_ID}/${safeReference(reference)}/${filename}`;
}

function readDocState(): DocStateFile {
  refreshCaches();
  if (docStateCache) return docStateCache;
  try {
    if (fs.existsSync(docStatePath())) {
      const parsed = JSON.parse(fs.readFileSync(docStatePath(), 'utf-8'));
      if (parsed && typeof parsed === 'object' && parsed.docs) {
        docStateCache = parsed as DocStateFile;
        return docStateCache;
      }
    }
  } catch (e) {
    console.error('Failed to read document state file, starting fresh:', e);
  }
  docStateCache = { version: 1, docs: {} };
  return docStateCache;
}

function writeDocState(state: DocStateFile): void {
  ensureDir();
  fs.writeFileSync(docStatePath(), JSON.stringify(state, null, 2));
  docStateCache = state;
}

export function getDocFlags(reference: string, authorityId: string | undefined, filename: string): DocumentFlags {
  const state = readDocState();
  return state.docs[docKey(reference, authorityId, filename)] ?? { starred: false, note: '' };
}

export function setDocFlags(reference: string, authorityId: string | undefined, filename: string, flags: Partial<DocumentFlags>): DocumentFlags {
  const state = readDocState();
  const key = docKey(reference, authorityId, filename);
  const existing = state.docs[key] ?? { starred: false, note: '' };
  const updated: DocumentFlags = { ...existing, ...flags };

  if (flags.starred === true && !existing.starred) {
    updated.starredAt = new Date().toISOString();
  } else if (flags.starred === false) {
    delete updated.starredAt;
  }
  if (flags.note !== undefined && flags.note !== existing.note) {
    updated.noteUpdatedAt = new Date().toISOString();
  }

  state.docs[key] = updated;
  writeDocState(state);
  return updated;
}

export function readActivity(): ActivityEvent[] {
  refreshCaches();
  if (activityCache) return activityCache;
  try {
    if (fs.existsSync(activityPath())) {
      const parsed = JSON.parse(fs.readFileSync(activityPath(), 'utf-8'));
      if (Array.isArray(parsed)) {
        activityCache = parsed as ActivityEvent[];
        return activityCache;
      }
    }
  } catch (e) {
    console.error('Failed to read activity file, starting fresh:', e);
  }
  activityCache = [];
  return activityCache;
}

export function recordActivity(event: Omit<ActivityEvent, 'id' | 'happenedAt'>): ActivityEvent {
  const events = readActivity();
  const full: ActivityEvent = {
    ...event,
    id: Math.random().toString(36).substring(2, 10),
    happenedAt: new Date().toISOString()
  };
  events.unshift(full);
  ensureDir();
  fs.writeFileSync(activityPath(), JSON.stringify(events, null, 2));
  activityCache = events;
  return full;
}
