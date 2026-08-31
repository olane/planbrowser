import fs from 'fs';
import path from 'path';
import type { ActivityEvent, ApplicationFlags, DocumentFlags } from './types.js';
import { DEFAULT_AUTHORITY_ID } from './authorities.js';
import { DOWNLOADS_DIR } from './config.js';

const STATE_FILE = path.join(DOWNLOADS_DIR, '_state.json');
const ACTIVITY_FILE = path.join(DOWNLOADS_DIR, '_activity.json');
const DOC_STATE_FILE = path.join(DOWNLOADS_DIR, '_documents.json');

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
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
}

function readState(): StateFile {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object' && parsed.apps) {
        return parsed as StateFile;
      }
    }
  } catch (e) {
    console.error('Failed to read state file, starting fresh:', e);
  }
  return { version: 1, apps: {} };
}

function writeState(state: StateFile): void {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
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
  const safeRef = reference.replace(/\//g, '-');
  return `${authorityId || DEFAULT_AUTHORITY_ID}/${safeRef}/${filename}`;
}

function readDocState(): DocStateFile {
  try {
    if (fs.existsSync(DOC_STATE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DOC_STATE_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object' && parsed.docs) {
        return parsed as DocStateFile;
      }
    }
  } catch (e) {
    console.error('Failed to read document state file, starting fresh:', e);
  }
  return { version: 1, docs: {} };
}

function writeDocState(state: DocStateFile): void {
  ensureDir();
  fs.writeFileSync(DOC_STATE_FILE, JSON.stringify(state, null, 2));
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
  try {
    if (fs.existsSync(ACTIVITY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(ACTIVITY_FILE, 'utf-8'));
      if (Array.isArray(parsed)) {
        return parsed as ActivityEvent[];
      }
    }
  } catch (e) {
    console.error('Failed to read activity file, starting fresh:', e);
  }
  return [];
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
  fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(events, null, 2));
  return full;
}
