import { describe, it, expect } from 'vitest';
import { diffMeta } from './diff.js';
import type { ApplicationMeta, DocumentMeta } from './types.js';

function makeMeta(overrides: Partial<ApplicationMeta> = {}): ApplicationMeta {
  return {
    reference: '24/00123/FUL',
    authorityId: 'cambridge',
    address: '1 High Street',
    description: 'Erection of a shed',
    status: 'Pending consideration',
    dates: {},
    documents: [],
    hasComments: false,
    scrapedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  };
}

function doc(filename: string): DocumentMeta {
  return { localFilename: filename, datePublished: '2024-01-01', documentType: 'Plan', description: 'Plan' };
}

describe('diffMeta', () => {
  it('reports a new application with no changes', () => {
    const result = diffMeta(null, makeMeta());
    expect(result.message).toBe('Application added');
    expect(result.changes).toEqual([]);
    expect(result.newDocuments).toEqual([]);
  });

  it('detects a status change', () => {
    const result = diffMeta(makeMeta({ status: 'Pending' }), makeMeta({ status: 'Approved' }));
    expect(result.message).toBe('Application updated');
    expect(result.changes).toContainEqual({ field: 'Status', before: 'Pending', after: 'Approved' });
  });

  it('detects an address change', () => {
    const result = diffMeta(makeMeta({ address: '1 High Street' }), makeMeta({ address: '2 High Street' }));
    expect(result.changes).toContainEqual({ field: 'Address', before: '1 High Street', after: '2 High Street' });
  });

  it('detects a description change', () => {
    const result = diffMeta(makeMeta({ description: 'Shed' }), makeMeta({ description: 'Garage' }));
    expect(result.changes).toContainEqual({ field: 'Proposal', before: 'Shed', after: 'Garage' });
  });

  it('detects newly added documents by filename', () => {
    const previous = makeMeta({ documents: [doc('a.pdf')] });
    const next = makeMeta({ documents: [doc('a.pdf'), doc('b.pdf')] });
    const result = diffMeta(previous, next);
    expect(result.newDocuments.map((d) => d.localFilename)).toEqual(['b.pdf']);
    expect(result.changes).toContainEqual({ field: 'Documents', after: '1 new document' });
  });

  it('pluralises multiple new documents', () => {
    const previous = makeMeta({ documents: [doc('a.pdf')] });
    const next = makeMeta({ documents: [doc('a.pdf'), doc('b.pdf'), doc('c.pdf')] });
    const result = diffMeta(previous, next);
    expect(result.changes).toContainEqual({ field: 'Documents', after: '2 new documents' });
  });

  it('detects comments becoming available', () => {
    const result = diffMeta(makeMeta({ hasComments: false }), makeMeta({ hasComments: true }));
    expect(result.changes).toContainEqual({ field: 'Comments', after: 'Comments are now available' });
  });

  it('detects a change to an important date', () => {
    const previous = makeMeta({ importantDates: { 'Decision Date': '2024-01-01' } });
    const next = makeMeta({ importantDates: { 'Decision Date': '2024-02-01' } });
    const result = diffMeta(previous, next);
    expect(result.changes).toContainEqual({ field: 'Decision Date', before: '2024-01-01', after: '2024-02-01' });
  });

  it('reports no changes when nothing has changed', () => {
    const previous = makeMeta();
    const result = diffMeta(previous, makeMeta());
    expect(result.message).toBe('No changes detected');
    expect(result.changes).toEqual([]);
  });
});
