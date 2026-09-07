import { describe, it, expect } from 'vitest';
import { resolvePortalUrl } from './scraper.js';

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
