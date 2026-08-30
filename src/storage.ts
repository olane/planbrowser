import fs from 'fs';
import path from 'path';
import type { ApplicationMeta, Comment } from './types.js';
import { DEFAULT_AUTHORITY_ID } from './authorities.js';
import { getFlags } from './userData.js';

const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');

export function getApplicationDir(reference: string, authorityId: string = DEFAULT_AUTHORITY_ID): string {
  const safeRef = reference.replace(/\//g, '-');
  return path.join(DOWNLOADS_DIR, authorityId, safeRef);
}

export function getApplications(): ApplicationMeta[] {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    return [];
  }
  const apps: ApplicationMeta[] = [];
  const topLevel = fs.readdirSync(DOWNLOADS_DIR);
  for (const dir of topLevel) {
    const appDir = path.join(DOWNLOADS_DIR, dir);
    if (!fs.statSync(appDir).isDirectory()) continue;
    const metaPath = path.join(appDir, 'metadata.json');
    if (fs.existsSync(metaPath)) {
      // Legacy flat layout: downloads/<reference>/
      const meta = readMeta(metaPath);
      if (meta) apps.push(withFlags(meta));
    } else {
      // Namespaced layout: downloads/<authorityId>/<reference>/
      for (const sub of fs.readdirSync(appDir)) {
        const subMeta = path.join(appDir, sub, 'metadata.json');
        if (fs.existsSync(subMeta)) {
          const meta = readMeta(subMeta);
          if (meta) apps.push(withFlags(meta));
        }
      }
    }
  }
  return apps;
}

function readMeta(metaPath: string): ApplicationMeta | null {
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as ApplicationMeta;
  } catch (e) {
    return null;
  }
}

function withFlags(meta: ApplicationMeta): ApplicationMeta {
  const flags = getFlags(meta.reference, meta.authorityId);
  return { ...meta, starred: flags.starred, archived: flags.archived };
}

export function getApplication(reference: string, authorityId?: string): ApplicationMeta | null {
  const safeRef = reference.replace(/\//g, '-');

  if (authorityId) {
    const meta = readMeta(path.join(getApplicationDir(reference, authorityId), 'metadata.json'));
    if (meta) return withFlags(meta);
  }

  // Legacy flat layout fallback
  const legacyMeta = readMeta(path.join(DOWNLOADS_DIR, safeRef, 'metadata.json'));
  if (legacyMeta) return withFlags(legacyMeta);

  // Search any authority namespaced directory for this reference
  if (!authorityId && fs.existsSync(DOWNLOADS_DIR)) {
    for (const dir of fs.readdirSync(DOWNLOADS_DIR)) {
      const appDir = path.join(DOWNLOADS_DIR, dir);
      if (!fs.statSync(appDir).isDirectory()) continue;
      if (!fs.existsSync(path.join(appDir, 'metadata.json'))) {
        const meta = readMeta(path.join(appDir, safeRef, 'metadata.json'));
        if (meta) return withFlags(meta);
      }
    }
  }
  return null;
}

export function saveApplicationMeta(reference: string, meta: ApplicationMeta, authorityId: string = DEFAULT_AUTHORITY_ID): void {
  const outDir = getApplicationDir(reference, authorityId);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(meta, null, 2));
}

export function saveComments(reference: string, comments: Comment[], authorityId: string = DEFAULT_AUTHORITY_ID): void {
  const outDir = getApplicationDir(reference, authorityId);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(path.join(outDir, 'comments.json'), JSON.stringify(comments, null, 2));
}
