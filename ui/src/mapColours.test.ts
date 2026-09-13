import { describe, it, expect } from 'vitest';
import {
  APP_TYPE_COLORS,
  APP_TYPE_ORDER,
  OUTCOME_COLORS,
  OUTCOME_ORDER,
  appTypeColor,
  appTypeFromReference,
  legendFor,
  normaliseAppType,
  normaliseOutcome,
  outcomeColor,
  presentBuckets
} from './mapColours';

describe('normaliseAppType', () => {
  it('passes through PlanIt app_type values', () => {
    for (const type of APP_TYPE_ORDER) {
      expect(normaliseAppType(type)).toBe(type);
    }
  });

  it('maps raw Idox application types onto the shared buckets', () => {
    expect(normaliseAppType('Full Planning Application')).toBe('Full');
    expect(normaliseAppType('Householder Application')).toBe('Full');
    expect(normaliseAppType('Outline Application')).toBe('Outline');
    expect(normaliseAppType('Approval of Reserved Matters')).toBe('Outline');
    expect(normaliseAppType('Non-Material Amendment')).toBe('Amendment');
    expect(normaliseAppType('Variation of Condition')).toBe('Conditions');
    expect(normaliseAppType('Listed Building Consent')).toBe('Heritage');
    expect(normaliseAppType('Works to Trees')).toBe('Trees');
    expect(normaliseAppType('Advertisement Consent')).toBe('Advertising');
    expect(normaliseAppType('Telecommunications Installation')).toBe('Telecoms');
    expect(normaliseAppType('Something Unusual')).toBe('Other');
    expect(normaliseAppType(undefined)).toBe('Other');
  });

  it('colours every bucket', () => {
    expect(appTypeColor('Full')).toBe(APP_TYPE_COLORS.Full);
    expect(appTypeColor('unknown')).toBe(APP_TYPE_COLORS.Other);
  });
});

describe('appTypeFromReference', () => {
  it('reads the trailing type code', () => {
    expect(appTypeFromReference('24/00123/FUL')).toBe('Full');
    expect(appTypeFromReference('DC/24/00123/OUT')).toBe('Outline');
    expect(appTypeFromReference('24/00123/LBC')).toBe('Heritage');
    expect(appTypeFromReference('24/00123/TPO')).toBe('Trees');
  });

  it('falls back to Other when there is no known code', () => {
    expect(appTypeFromReference('24/00123/XYZ')).toBe('Other');
    expect(appTypeFromReference(undefined)).toBe('Other');
  });
});

describe('normaliseOutcome', () => {
  it('maps PlanIt app_state values', () => {
    expect(normaliseOutcome('Permitted')).toBe('Permitted');
    expect(normaliseOutcome('Conditions')).toBe('Permitted');
    expect(normaliseOutcome('Rejected')).toBe('Refused');
    expect(normaliseOutcome('Withdrawn')).toBe('Withdrawn');
    expect(normaliseOutcome('Undecided')).toBe('Pending');
    expect(normaliseOutcome('Unresolved')).toBe('Pending');
    expect(normaliseOutcome('Referred')).toBe('Other');
  });

  it('maps downloaded application status labels', () => {
    expect(normaliseOutcome('Refused')).toBe('Refused');
    expect(normaliseOutcome('Permitted')).toBe('Permitted');
    expect(normaliseOutcome('Awaiting decision')).toBe('Pending');
    expect(normaliseOutcome('')).toBe('Pending');
    expect(normaliseOutcome('Decided')).toBe('Other');
  });

  it('colours every bucket', () => {
    expect(outcomeColor('Rejected')).toBe(OUTCOME_COLORS.Refused);
    expect(outcomeColor('decided')).toBe(OUTCOME_COLORS.Other);
  });
});

describe('presentBuckets', () => {
  it('returns present buckets in canonical order', () => {
    const buckets = presentBuckets(['Trees', undefined, 'Full', 'Trees'], normaliseAppType, APP_TYPE_ORDER);
    expect(buckets).toEqual(['Full', 'Trees', 'Other']);
  });

  it('orders outcomes canonically', () => {
    expect(presentBuckets(['Rejected', 'Permitted'], normaliseOutcome, OUTCOME_ORDER)).toEqual([
      'Permitted',
      'Refused'
    ]);
  });
});

describe('legendFor', () => {
  it('pairs labels with their colours', () => {
    expect(legendFor(['Full', 'Other'], APP_TYPE_COLORS)).toEqual([
      { label: 'Full', color: APP_TYPE_COLORS.Full },
      { label: 'Other', color: APP_TYPE_COLORS.Other }
    ]);
  });
});
