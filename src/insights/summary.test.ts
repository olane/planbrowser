import { describe, it, expect } from 'vitest';
import { buildSummary, derivePoints, extractMetrics, tallyComments } from './summary.js';
import type { ApplicationMeta, Comment } from '../types.js';

function meta(overrides: Partial<ApplicationMeta>): ApplicationMeta {
  return {
    reference: '24/00001/FUL',
    address: '1 Test Street',
    description: '',
    status: 'Awaiting decision',
    dates: {},
    documents: [],
    hasComments: false,
    scrapedAt: new Date(0).toISOString(),
    ...overrides
  };
}

describe('extractMetrics', () => {
  it('pulls dwellings, storeys and floorspace from prose', () => {
    const metrics = extractMetrics(
      'Demolition of existing buildings and erection of 120 dwellings with 4500 sqm of commercial floorspace in a 5 storey building.'
    );
    expect(metrics['Dwellings']).toBe('120');
    expect(metrics['Storeys']).toBe('5');
    expect(metrics['Floorspace']).toBe('4500 m²');
  });

  it('does not invent metrics from unrelated numbers', () => {
    const metrics = extractMetrics('Erection of a single storey rear extension.');
    expect(metrics['Dwellings']).toBeUndefined();
    expect(metrics['Storeys']).toBe('1');
  });
});

describe('derivePoints', () => {
  it('derives proposal tags from the description', () => {
    const points = derivePoints(
      meta({ description: 'Outline planning application for the demolition of the existing building and redevelopment with a new build.' })
    );
    expect(points).toContain('Outline application');
    expect(points).toContain('Demolition');
    expect(points).toContain('New build');
  });
});

describe('buildSummary', () => {
  it('uses the description as the headline and includes application type', () => {
    const summary = buildSummary(
      meta({ description: 'Two storey rear extension.', furtherInformation: { 'Application Type': 'Householder' } })
    );
    expect(summary.headline).toBe('Two storey rear extension.');
    expect(summary.points[0]).toBe('Application type: Householder');
    expect(summary.metrics['Storeys']).toBe('2');
  });
});

describe('tallyComments', () => {
  it('counts stances', () => {
    const comments: Comment[] = [
      { address: 'a', stance: 'Objection', date: '', text: '' },
      { address: 'b', stance: 'Support', date: '', text: '' },
      { address: 'c', stance: 'Neutral', date: '', text: '' },
      { address: 'd', stance: '', date: '', text: '' }
    ];
    expect(tallyComments(comments)).toEqual({ support: 1, object: 1, neutral: 2, total: 4 });
  });
});
