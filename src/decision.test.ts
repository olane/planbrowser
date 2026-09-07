import { describe, it, expect } from 'vitest';
import { isAwaitingDecision, selectSyncApps } from './decision.js';
import type { ApplicationMeta } from './types.js';

function app(overrides: Partial<ApplicationMeta> = {}): ApplicationMeta {
  return {
    reference: '24/00001/FUL',
    address: '1 High Street',
    description: 'Erection of a shed',
    status: 'Awaiting decision',
    dates: {},
    documents: [],
    hasComments: false,
    scrapedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  };
}

describe('isAwaitingDecision', () => {
  it('treats live statuses as awaiting decision', () => {
    expect(isAwaitingDecision(app({ status: 'Awaiting decision' }))).toBe(true);
    expect(isAwaitingDecision(app({ status: 'Pending Consideration' }))).toBe(true);
    expect(isAwaitingDecision(app({ status: 'Registered' }))).toBe(true);
    expect(isAwaitingDecision(app({ status: 'Undecided' }))).toBe(true);
    expect(isAwaitingDecision(app({ status: '' }))).toBe(true);
  });

  it('treats decided/refused/withdrawn statuses as no longer awaiting', () => {
    expect(isAwaitingDecision(app({ status: 'Decided', furtherInformation: { Decision: 'Refused Permission' } }))).toBe(false);
    expect(isAwaitingDecision(app({ status: 'Decided', furtherInformation: { Decision: 'Approved' } }))).toBe(false);
    expect(isAwaitingDecision(app({ status: 'Withdrawn', furtherInformation: { Decision: 'Withdrawn' } }))).toBe(false);
  });

  it('treats a recorded decision as resolved even with an ambiguous status', () => {
    expect(isAwaitingDecision(app({ furtherInformation: { Decision: 'Approved' } }))).toBe(false);
  });

  it('ignores placeholder decision values', () => {
    expect(isAwaitingDecision(app({ furtherInformation: { Decision: '-' } }))).toBe(true);
    expect(isAwaitingDecision(app({ furtherInformation: { Decision: 'n/a' } }))).toBe(true);
    expect(isAwaitingDecision(app({ furtherInformation: { Decision: 'Not Available' } }))).toBe(true);
  });
});

describe('selectSyncApps', () => {
  const awaiting = app({ reference: '24/0001/FUL', status: 'Awaiting decision' });
  const awaitingStarred = app({ reference: '24/0002/FUL', status: 'Awaiting decision', starred: true });
  const decidedStarred = app({ reference: '24/0003/FUL', status: 'Decided', furtherInformation: { Decision: 'Approved' }, starred: true });
  const decided = app({ reference: '24/0004/FUL', status: 'Decided', furtherInformation: { Decision: 'Refused Permission' } });
  const archivedAwaitingStarred = app({ reference: '24/0005/FUL', status: 'Awaiting decision', starred: true, archived: true });
  const apps = [awaiting, awaitingStarred, decidedStarred, decided, archivedAwaitingStarred];

  it('selects starred only when only starred is ticked', () => {
    expect(selectSyncApps(apps, { starred: true, awaitingDecision: false })).toEqual([awaitingStarred, decidedStarred]);
  });

  it('selects awaiting-decision only when only awaitingDecision is ticked', () => {
    expect(selectSyncApps(apps, { starred: false, awaitingDecision: true })).toEqual([awaiting, awaitingStarred]);
  });

  it('selects the intersection when both are ticked', () => {
    expect(selectSyncApps(apps, { starred: true, awaitingDecision: true })).toEqual([awaitingStarred]);
  });

  it('selects nothing when no scope is ticked', () => {
    expect(selectSyncApps(apps, { starred: false, awaitingDecision: false })).toEqual([]);
  });

  it('never selects archived applications', () => {
    expect(selectSyncApps(apps, { all: true, starred: false, awaitingDecision: false })).toEqual([awaiting, awaitingStarred, decidedStarred, decided]);
    expect(selectSyncApps(apps, { starred: true, awaitingDecision: false })).not.toContain(archivedAwaitingStarred);
  });

  it('selects every active application when all is set, regardless of other criteria', () => {
    expect(selectSyncApps(apps, { all: true, starred: true, awaitingDecision: true })).toEqual([awaiting, awaitingStarred, decidedStarred, decided]);
  });
});
