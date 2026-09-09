import { describe, it, expect } from 'vitest';
import { normalizePostcode } from './postcode.js';

describe('normalizePostcode', () => {
  it('returns canonical spacing for a lowercase postcode', () => {
    expect(normalizePostcode('cb4 3ph')).toBe('CB4 3PH');
  });

  it('inserts the missing space between the outward and inward codes', () => {
    expect(normalizePostcode('CB43PH')).toBe('CB4 3PH');
    expect(normalizePostcode('cb1 2jw')).toBe('CB1 2JW');
  });

  it('handles a mix of stray internal whitespace', () => {
    expect(normalizePostcode('  CB4   3PH ')).toBe('CB4 3PH');
    expect(normalizePostcode('sw1a1aa')).toBe('SW1A 1AA');
    expect(normalizePostcode('dn55 1pt')).toBe('DN55 1PT');
    expect(normalizePostcode('ec1a 1bb')).toBe('EC1A 1BB');
  });

  it('leaves district-only postcodes unchanged apart from casing', () => {
    expect(normalizePostcode('cb4')).toBe('CB4');
    expect(normalizePostcode('sw18')).toBe('SW18');
  });

  it('collapses whitespace for non-postcode input', () => {
    expect(normalizePostcode('london')).toBe('LONDON');
    expect(normalizePostcode('')).toBe('');
    expect(normalizePostcode('   ')).toBe('');
  });
});
