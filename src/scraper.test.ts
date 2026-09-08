import { describe, it, expect } from 'vitest';
import { resolvePortalUrl, extractDocId } from './scraper.js';

describe('resolvePortalUrl', () => {
  const resultsUrl = 'https://apps.example.gov.uk/online-applications/advancedSearchResults.do?action=firstPage';
  const summaryUrl = 'https://apps.example.gov.uk/online-applications/applicationDetails.do?activeTab=summary&keyVal=ABC123';
  const detailsUrl = 'https://apps.example.gov.uk/online-applications/applicationDetails.do?activeTab=details&keyVal=ABC123';

  it('prefers the activeTab=summary applicationDetails.do link over the results URL', () => {
    const hrefs = [
      'https://apps.example.gov.uk/online-applications/applicationDetails.do?activeTab=printPreview&keyVal=ABC123',
      detailsUrl,
      summaryUrl
    ];
    expect(resolvePortalUrl(resultsUrl, hrefs)).toBe(summaryUrl);
  });

  it('falls back to any applicationDetails.do link when no summary link exists', () => {
    expect(resolvePortalUrl(resultsUrl, [detailsUrl])).toBe(detailsUrl);
  });

  it('returns the current URL when no applicationDetails.do links are present', () => {
    expect(resolvePortalUrl(resultsUrl, [])).toBe(resultsUrl);
    expect(resolvePortalUrl(resultsUrl, ['https://apps.example.gov.uk/online-applications/search.do?action=advanced'])).toBe(resultsUrl);
  });

  it('returns the current URL when it is already the canonical details page', () => {
    expect(resolvePortalUrl(summaryUrl, [detailsUrl])).toBe(summaryUrl);
  });

  it('does not match other Idox action URLs', () => {
    const hrefs = [
      'https://apps.example.gov.uk/online-applications/search.do?action=advanced',
      'https://apps.example.gov.uk/online-applications/applicationDetails.do' // no keyVal
    ];
    expect(resolvePortalUrl(resultsUrl, hrefs)).toBe(resultsUrl);
  });
});

describe('extractDocId', () => {
  it('extracts the trailing document id from a file URL', () => {
    expect(extractDocId('https://apps.example.gov.uk/online-applications/files/BACB909D55C320FAB8781A01380A9A33/pdf/25_04484_FUL-AMENDMENT_SUMMARY-7414944.pdf')).toBe('7414944');
    expect(extractDocId('https://apps.example.gov.uk/online-applications/files/A67C5E6A04394BF94850F1AE9325ED4B/25_04484_FUL-UPDATED_METRIC-9486039.xlsx')).toBe('9486039');
  });

  it('extracts the id from a bulk-zip member path', () => {
    expect(extractDocId('BACB909D55C320FAB8781A01380A9A33/AMENDMENT_SUMMARY-7414944.pdf')).toBe('7414944');
    expect(extractDocId('135_OXFORD_ROAD-9506047.pdf')).toBe('9506047');
  });

  it('returns undefined when there is no trailing id', () => {
    expect(extractDocId('')).toBeUndefined();
    expect(extractDocId('https://apps.example.gov.uk/online-applications/applicationDetails.do?keyVal=T5XMRUDXG6T00')).toBeUndefined();
    expect(extractDocId('AMENDMENT_SUMMARY.pdf')).toBeUndefined();
  });
});
