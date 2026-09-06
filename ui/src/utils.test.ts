import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { timeAgo, statusLabel, progressText, statusBadgeClass } from './utils';

const NOW = new Date('2026-01-15T12:00:00.000Z');

function isoAgo(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('timeAgo', () => {
  it('handles missing and invalid dates', () => {
    expect(timeAgo(undefined)).toBe('Unknown');
    expect(timeAgo('not-a-date')).toBe('Unknown');
  });

  it('describes very recent dates', () => {
    expect(timeAgo(isoAgo(10_000))).toBe('Just now');
    expect(timeAgo(isoAgo(45_000))).toBe('45 seconds ago');
  });

  it('describes minutes and hours', () => {
    expect(timeAgo(isoAgo(90_000))).toBe('1 minute ago');
    expect(timeAgo(isoAgo(5 * 60_000))).toBe('5 minutes ago');
    expect(timeAgo(isoAgo(90 * 60_000))).toBe('1 hour ago');
    expect(timeAgo(isoAgo(3 * 3_600_000))).toBe('3 hours ago');
  });

  it('describes days and falls back to a date for older entries', () => {
    expect(timeAgo(isoAgo(25 * 3_600_000))).toBe('Yesterday');
    expect(timeAgo(isoAgo(3 * 86_400_000))).toBe('3 days ago');
    expect(timeAgo(isoAgo(10 * 86_400_000))).toMatch(/\d{4}/);
  });
});

describe('statusLabel', () => {
  it('infers permitted from the decision', () => {
    const app = { status: 'Decided', furtherInformation: { Decision: 'Granted' } };
    expect(statusLabel(app)).toBe('Permitted');
    expect(statusLabel({ status: 'Decided', furtherInformation: { Decision: 'Approved' } })).toBe('Permitted');
  });

  it('infers refused from the decision', () => {
    expect(statusLabel({ status: 'Decided', furtherInformation: { Decision: 'Refused' } })).toBe('Refused');
  });

  it('falls back to the raw status otherwise', () => {
    expect(statusLabel({ status: 'Pending' })).toBe('Pending');
    expect(statusLabel({ status: 'Decided', furtherInformation: {} })).toBe('Decided');
  });
});

describe('progressText', () => {
  it('renders just the message when there is no total', () => {
    expect(progressText({ message: 'Working' })).toBe('Working');
  });

  it('renders a fraction when a total is present', () => {
    expect(progressText({ message: 'Working', current: 2, total: 5 })).toBe('Working (2/5)');
    expect(progressText({ message: 'Working', total: 5 })).toBe('Working (0/5)');
  });
});

describe('statusBadgeClass', () => {
  it('colours refused red and permitted green', () => {
    expect(statusBadgeClass({ status: 'Decided', furtherInformation: { Decision: 'Refused' } })).toContain('red');
    expect(statusBadgeClass({ status: 'Decided', furtherInformation: { Decision: 'Granted' } })).toContain('green');
  });

  it('defaults to blue', () => {
    expect(statusBadgeClass({ status: 'Pending' })).toContain('blue');
  });
});
