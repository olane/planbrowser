import { describe, it, expect } from 'vitest';
import { sanitizeFilters } from './app.js';

describe('sanitizeFilters', () => {
  it('keeps string filter values', () => {
    expect(sanitizeFilters({ postcode: 'CB1 2JW', app_state: 'Undecided' })).toEqual({ app_state: 'Undecided' });
  });

  it('coerces numeric filter values from number inputs to strings', () => {
    expect(sanitizeFilters({ recent: 30 })).toEqual({ recent: '30' });
  });

  it('drops blank, unknown, and non-numeric values', () => {
    expect(sanitizeFilters({ recent: '', unknown: 'x', app_size: true })).toEqual({});
  });
});
