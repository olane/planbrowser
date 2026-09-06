import { describe, it, expect } from 'vitest';
import { resolveAuthority, isKnownAuthority, getAuthority, authorityName, DEFAULT_AUTHORITY_ID } from './authorities.js';

describe('resolveAuthority', () => {
  it('falls back to the default authority for empty input', () => {
    expect(resolveAuthority(undefined).id).toBe(DEFAULT_AUTHORITY_ID);
    expect(resolveAuthority(null).id).toBe(DEFAULT_AUTHORITY_ID);
    expect(resolveAuthority('').id).toBe(DEFAULT_AUTHORITY_ID);
    expect(resolveAuthority('   ').id).toBe(DEFAULT_AUTHORITY_ID);
  });

  it('resolves by id, ignoring case and surrounding whitespace', () => {
    expect(resolveAuthority('cambridge').id).toBe('cambridge');
    expect(resolveAuthority('  CAMBRIDGE ').id).toBe('cambridge');
  });

  it('resolves by display name', () => {
    expect(resolveAuthority('Greater Cambridge').id).toBe('cambridge');
    expect(resolveAuthority('greater cambridge').id).toBe('cambridge');
  });

  it('resolves by alias', () => {
    expect(resolveAuthority('South Cambridgeshire').id).toBe('cambridge');
    expect(resolveAuthority('North Yorkshire').id).toBe('craven');
  });

  it('throws for an unknown authority', () => {
    expect(() => resolveAuthority('not-a-real-authority')).toThrow(/Unknown planning authority/);
  });
});

describe('isKnownAuthority', () => {
  it('returns false for empty input', () => {
    expect(isKnownAuthority(undefined)).toBe(false);
    expect(isKnownAuthority('')).toBe(false);
    expect(isKnownAuthority('   ')).toBe(false);
  });

  it('returns true for id, name, and alias', () => {
    expect(isKnownAuthority('cambridge')).toBe(true);
    expect(isKnownAuthority('Greater Cambridge')).toBe(true);
    expect(isKnownAuthority('South Cambridgeshire')).toBe(true);
  });

  it('returns false for an unknown authority', () => {
    expect(isKnownAuthority('nope')).toBe(false);
  });
});

describe('getAuthority', () => {
  it('returns the matching authority', () => {
    expect(getAuthority('cambridge').name).toBe('Greater Cambridge');
  });

  it('throws for an unknown id', () => {
    expect(() => getAuthority('nope')).toThrow(/Unknown authority id/);
  });
});

describe('authorityName', () => {
  it('returns undefined when no id is given', () => {
    expect(authorityName()).toBeUndefined();
  });

  it('returns the display name for a known id', () => {
    expect(authorityName('cambridge')).toBe('Greater Cambridge');
  });

  it('returns undefined for an unknown id', () => {
    expect(authorityName('nope')).toBeUndefined();
  });
});
