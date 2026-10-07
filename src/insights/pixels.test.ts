import { describe, it, expect } from 'vitest';
import { analysePixels, hammingDistance, perceptualHash } from './pixels.js';

function solid(width: number, height: number, r: number, g: number, b: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe('analysePixels', () => {
  it('reports a blank white page as no ink', () => {
    const stats = analysePixels(solid(10, 10, 255, 255, 255), 10, 10);
    expect(stats.inkRatio).toBe(0);
    expect(stats.colorfulness).toBe(0);
    expect(stats.distinctColors).toBe(1);
  });

  it('reports a black page as fully inked and grey', () => {
    const stats = analysePixels(solid(10, 10, 0, 0, 0), 10, 10);
    expect(stats.inkRatio).toBe(1);
    expect(stats.grayscale).toBe(1);
    expect(stats.colorfulness).toBe(0);
  });

  it('reports colourfulness for a saturated page', () => {
    const stats = analysePixels(solid(10, 10, 255, 0, 0), 10, 10);
    expect(stats.colorfulness).toBeCloseTo(1, 5);
    expect(stats.grayscale).toBe(0);
    expect(stats.dominantColorRatio).toBe(1);
    expect(stats.phash).toHaveLength(16);
  });

  it('detects edges between light and dark regions', () => {
    const width = 10;
    const height = 10;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = x < width / 2 ? 255 : 0;
        const i = (y * width + x) * 4;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const stats = analysePixels(data, width, height);
    expect(stats.edgeDensity).toBeGreaterThan(0);
    expect(stats.inkRatio).toBeGreaterThan(0.4);
  });
});

describe('perceptual hash', () => {
  it('returns an identical hash for identical pixels', () => {
    const pixels = solid(10, 10, 128, 128, 128);
    expect(perceptualHash(pixels, 10, 10)).toBe(perceptualHash(pixels, 10, 10));
  });

  it('measures hamming distance in bits', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1);
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64);
  });
});
