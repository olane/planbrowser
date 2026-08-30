import fs from 'fs';
import path from 'path';
import type { ActivityEvent, ApplicationFlags } from './types.js';
import { DEFAULT_AUTHORITY_ID } from './authorities.js';

const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');
const STATE_FILE = path.join(DOWNLOADS_DIR, '_state.json');
const ACTIVITY_FILE = path.join(DOWNLOADS_DIR, '_activity.json');

interface StateFile {
  version: number;
  apps: Record<string, ApplicationFlags>;
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
