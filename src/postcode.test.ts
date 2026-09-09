import { describe, it, expect } from 'vitest';
import { normalizePostcode, extractPostcode } from './postcode.js';

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

describe('extractPostcode', () => {
  it('extracts the postcode from the end of a scraped address', () => {
    expect(extractPostcode('Corpus Christi College Trumpington Street Cambridge Cambridgeshire CB2 1RH')).toBe('CB2 1RH');
    expect(extractPostcode('12-18 Hoxton Street London N1 6NG')).toBe('N1 6NG');
    expect(extractPostcode('Flat 4 22 Kings Road Wigan WN1 1XX')).toBe('WN1 1XX');
  });

  it('handles lowercase and missing internal spaces', () => {
    expect(extractPostcode('corpus christi college cambridge cb2 1rh')).toBe('CB2 1RH');
    expect(extractPostcode('land adjacent to willow farm cb43ph')).toBe('CB4 3PH');
  });

  it('finds a postcode that is not the very last token', () => {
    expect(extractPostcode('12 High Street CB2 1RH near the church')).toBe('CB2 1RH');
  });

  it('returns null when no postcode is present', () => {
    expect(extractPostcode('Some random address without a postcode')).toBeNull();
    expect(extractPostcode('')).toBeNull();
    expect(extractPostcode('   ')).toBeNull();
  });

  it('rejects strings that only resemble part of a postcode', () => {
    expect(extractPostcode('outbuilding at plot 7')).toBeNull();
    expect(extractPostcode('flat 1')).toBeNull();
  });
});
