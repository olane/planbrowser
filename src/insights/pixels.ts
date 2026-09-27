import { createCanvas, loadImage } from '@napi-rs/canvas';

// Cheap visual statistics for a rendered page thumbnail. These complement the
// text/keyword signals: line drawings are mostly white with thin dark strokes,
// while renders and photographs fill the frame with broad, colourful tones.
export interface PagePixelStats {
  width: number;
  height: number;
  sampleWidth: number;
  sampleHeight: number;
  // Fraction of pixels darker than the near-white background.
  inkRatio: number;
  // Mean channel spread (max-min)/255: 0 = grey, 1 = fully saturated.
  colorfulness: number;
  // Distinct quantised colours in the sample (coarse 5-bit-per-channel buckets).
  distinctColors: number;
  // Fraction of sampled pixels in the single most common colour bucket. A cover
  // or title page built from one flat brand colour scores very high.
  dominantColorRatio: number;
  // Fraction of pixels that are effectively grey.
  grayscale: number;
  // Fraction of neighbouring pixel pairs with a strong luminance step.
  edgeDensity: number;
  // 64-bit difference hash (16 hex chars) for near-duplicate detection.
  phash: string;
}

const SAMPLE_WIDTH = 160;
const BACKGROUND_LUM = 0.92;
const GREY_SPREAD = 18 / 255;
const EDGE_STEP = 0.25;

// A 64-bit difference hash over a 9x8 grayscale reduction of the sample. Small
// per-page differences (a few words on a repeated cover sheet) leave it nearly
// unchanged, so near-duplicates collapse even when their bytes differ.
export function perceptualHash(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number): string {
  const gridWidth = 9;
  const gridHeight = 8;
  const gray = new Float64Array(gridWidth * gridHeight);
  for (let gy = 0; gy < gridHeight; gy++) {
    const y0 = Math.floor((gy * height) / gridHeight);
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * height) / gridHeight));
    for (let gx = 0; gx < gridWidth; gx++) {
      const x0 = Math.floor((gx * width) / gridWidth);
      const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * width) / gridWidth));
      let sum = 0;
      let count = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        for (let x = x0; x < x1 && x < width; x++) {
          const i = (y * width + x) * 4;
          sum += (0.2126 * (pixels[i] ?? 0) + 0.7152 * (pixels[i + 1] ?? 0) + 0.0722 * (pixels[i + 2] ?? 0)) / 255;
          count++;
        }
      }
      gray[gy * gridWidth + gx] = count ? sum / count : 0;
    }
  }
  let bits = '';
  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth - 1; gx++) {
      const left = gray[gy * gridWidth + gx] ?? 0;
      const right = gray[gy * gridWidth + gx + 1] ?? 0;
      bits += left < right ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

// Number of differing bits between two difference hashes (0 = identical).
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i++) {
    let xor = parseInt(a[i] ?? '0', 16) ^ parseInt(b[i] ?? '0', 16);
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

// Pure core (no image decoding) so it can be unit-tested with synthetic pixels.
export function analysePixels(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number): PagePixelStats {
  const total = width * height;
  let ink = 0;
  let grey = 0;
  let spreadSum = 0;
  const colorCounts = new Map<number, number>();

  for (let i = 0; i < total; i++) {
    const r = pixels[i * 4] ?? 0;
    const g = pixels[i * 4 + 1] ?? 0;
    const b = pixels[i * 4 + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const spread = (max - min) / 255;
    spreadSum += spread;
    if (lum < BACKGROUND_LUM) ink++;
    if (spread <= GREY_SPREAD) grey++;
    const bucket = ((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5);
    colorCounts.set(bucket, (colorCounts.get(bucket) ?? 0) + 1);
  }

  let dominant = 0;
  for (const count of colorCounts.values()) if (count > dominant) dominant = count;

  let edges = 0;
  let pairs = 0;
  const lumAt = (x: number, y: number): number => {
    const i = (y * width + x) * 4;
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const here = lumAt(x, y);
      if (x + 1 < width) {
        pairs++;
        if (Math.abs(here - lumAt(x + 1, y)) > EDGE_STEP) edges++;
      }
      if (y + 1 < height) {
        pairs++;
        if (Math.abs(here - lumAt(x, y + 1)) > EDGE_STEP) edges++;
      }
    }
  }

  return {
    width,
    height,
    sampleWidth: width,
    sampleHeight: height,
    inkRatio: total ? ink / total : 0,
    colorfulness: total ? spreadSum / total : 0,
    distinctColors: colorCounts.size,
    dominantColorRatio: total ? dominant / total : 0,
    grayscale: total ? grey / total : 0,
    edgeDensity: pairs ? edges / pairs : 0,
    phash: perceptualHash(pixels, width, height)
  };
}

// Decode a rendered PNG, downsample it for speed, and compute the stats.
export async function analysePagePng(png: Buffer): Promise<PagePixelStats> {
  const img = await loadImage(png);
  const width = img.width || 1;
  const height = img.height || 1;
  const sampleWidth = Math.max(1, Math.min(SAMPLE_WIDTH, width));
  const sampleHeight = Math.max(1, Math.round((height / width) * sampleWidth));
  const canvas = createCanvas(sampleWidth, sampleHeight);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
  const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
  const stats = analysePixels(data, sampleWidth, sampleHeight);
  return { ...stats, width, height };
}
