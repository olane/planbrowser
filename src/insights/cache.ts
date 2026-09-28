import fs from 'fs';
import path from 'path';
import type { ApplicationInsights } from '../types.js';

export const INSIGHTS_VERSION = 2;

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

export function atomicWrite(filePath: string, data: string | Buffer): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

export function readInsights(appDir: string): ApplicationInsights | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(insightsFile(appDir), 'utf-8')) as ApplicationInsights;
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.version === INSIGHTS_VERSION &&
      parsed.strategy &&
      Array.isArray(parsed.images)
    ) {
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

// Remove content-addressed thumbnails that the current insights.json no longer
// references, so the directory does not grow across regenerations/syncs.
export function pruneAssets(appDir: string, keep: Set<string>): void {
  const dir = insightsDir(appDir);
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!isValidAssetFile(name) || keep.has(name)) continue;
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      // Best-effort cleanup.
    }
  }
}
