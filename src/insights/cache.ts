import fs from 'fs';
import path from 'path';
import type { ApplicationInsights } from '../types.js';

export const INSIGHTS_VERSION = 1;
const PAGE_TEXT_VERSION = 1;

export interface PageTextEntry {
  mtimeMs: number;
  size: number;
  pages: string[];
}

export interface PageTextCache {
  version: number;
  documents: Record<string, PageTextEntry>;
}

export function insightsDir(appDir: string): string {
  return path.join(appDir, 'insights');
}

export function insightsFile(appDir: string): string {
  return path.join(insightsDir(appDir), 'insights.json');
}

// Extracted thumbnails are content-addressed by a 40-char sha1, so only that
// shape is ever accepted as a filename (path traversal guard for the route).
const ASSET_FILE_RE = /^[a-f0-9]{40}\.png$/;

export function isValidAssetFile(name: string): boolean {
  return ASSET_FILE_RE.test(name);
}

export function assetPath(appDir: string, imageFile: string): string {
  if (!isValidAssetFile(imageFile)) throw new Error(`Invalid asset filename: ${imageFile}`);
  return path.join(insightsDir(appDir), imageFile);
}

function atomicWrite(filePath: string, data: string | Buffer): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

export function readInsights(appDir: string): ApplicationInsights | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(insightsFile(appDir), 'utf-8')) as ApplicationInsights;
    if (parsed && typeof parsed === 'object' && parsed.strategy && Array.isArray(parsed.images)) {
      return parsed;
    }
  } catch {
    // Missing or unreadable cache.
  }
  return null;
}

export function writeInsights(appDir: string, insights: ApplicationInsights): void {
  atomicWrite(insightsFile(appDir), JSON.stringify(insights, null, 2));
}

export function writeAsset(appDir: string, imageFile: string, data: Buffer): void {
  const target = assetPath(appDir, imageFile);
  if (fs.existsSync(target)) return;
  atomicWrite(target, data);
}

export function readPageText(appDir: string): PageTextCache {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(insightsDir(appDir), 'page-text.json'), 'utf-8'));
    if (parsed && typeof parsed === 'object' && parsed.documents && typeof parsed.documents === 'object') {
      return { version: parsed.version ?? PAGE_TEXT_VERSION, documents: parsed.documents as Record<string, PageTextEntry> };
    }
  } catch {
    // Missing or unreadable cache.
  }
  return { version: PAGE_TEXT_VERSION, documents: {} };
}

export function writePageText(appDir: string, cache: PageTextCache): void {
  atomicWrite(path.join(insightsDir(appDir), 'page-text.json'), JSON.stringify(cache, null, 2));
}
