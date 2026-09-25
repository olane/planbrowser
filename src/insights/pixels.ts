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
  // Fraction of pixels that are effectively grey.
  grayscale: number;
  // Fraction of neighbouring pixel pairs with a strong luminance step.
  edgeDensity: number;
}

const SAMPLE_WIDTH = 160;
const BACKGROUND_LUM = 0.92;
const GREY_SPREAD = 18 / 255;
const EDGE_STEP = 0.25;

// Pure core (no image decoding) so it can be unit-tested with synthetic pixels.
export function analysePixels(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number): PagePixelStats {
  const total = width * height;
  let ink = 0;
  let grey = 0;
  let spreadSum = 0;
  const colors = new Set<number>();

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
    colors.add(((r >> 5) << 10) | ((g >> 5) << 5) | (b >> 5));
  }

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
    distinctColors: colors.size,
    grayscale: total ? grey / total : 0,
    edgeDensity: pairs ? edges / pairs : 0
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
