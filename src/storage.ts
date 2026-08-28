import fs from 'fs';
import path from 'path';
import type { ApplicationMeta, Comment } from './types.js';

const DOWNLOADS_DIR = path.join(process.cwd(), 'downloads');

export function getApplications(): ApplicationMeta[] {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    return [];
  }
  const dirs = fs.readdirSync(DOWNLOADS_DIR);
  return dirs.map(dir => {
    const metaPath = path.join(DOWNLOADS_DIR, dir, 'metadata.json');
    if (fs.existsSync(metaPath)) {
      try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as ApplicationMeta;
      } catch (e) {
        return null;
      }
    }
    return null;
  }).filter(Boolean) as ApplicationMeta[];
}

export function getApplication(reference: string): ApplicationMeta | null {
  const safeRef = reference.replace(/\//g, '-');
  const metaPath = path.join(DOWNLOADS_DIR, safeRef, 'metadata.json');
  if (fs.existsSync(metaPath)) {
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as ApplicationMeta;
    } catch (e) {
      return null;
    }
  }
  return null;
}

export function saveApplicationMeta(reference: string, meta: ApplicationMeta): void {
  const safeRef = reference.replace(/\//g, '-');
  const outDir = path.join(DOWNLOADS_DIR, safeRef);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(path.join(outDir, 'metadata.json'), JSON.stringify(meta, null, 2));
}

export function saveComments(reference: string, comments: Comment[]): void {
  const safeRef = reference.replace(/\//g, '-');
  const outDir = path.join(DOWNLOADS_DIR, safeRef);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(path.join(outDir, 'comments.json'), JSON.stringify(comments, null, 2));
}
