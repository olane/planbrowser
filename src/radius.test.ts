import { describe, it, expect } from 'vitest';
import { normalizeRadius } from './radius.js';

describe('normalizeRadius', () => {
  it('keeps a numeric radius instead of falling back to the default', () => {
    expect(normalizeRadius(4)).toBe(4);
  });

  it('accepts a numeric string from query params', () => {
    expect(normalizeRadius('4')).toBe(4);
  });

  it('keeps decimal radii as numbers', () => {
    expect(normalizeRadius(4.7)).toBe(4.7);
  });

  it('falls back to the default for missing or invalid values', () => {
    expect(normalizeRadius(undefined)).toBe(2);
    expect(normalizeRadius('')).toBe(2);
    expect(normalizeRadius(Number.NaN)).toBe(2);
    expect(normalizeRadius(0)).toBe(2);
  });
});
