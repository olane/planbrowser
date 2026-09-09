import { describe, it, expect, vi } from 'vitest';
import { locationFromAddress } from './geocode.js';

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

function stubFetch(handler: (url: string) => Response | Promise<Response>): FetchFn & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string): Promise<Response> => {
    calls.push(url);
    return await handler(url);
  }) as FetchFn;
  return Object.assign(fn, { calls });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('locationFromAddress', () => {
  it('resolves a postcode from the address to a point location', async () => {
    const fetch = stubFetch(() => jsonResponse({ result: { latitude: 52.2037, longitude: 0.1178 } }));
    const loc = await locationFromAddress('Corpus Christi College Trumpington Street Cambridge Cambridgeshire CB2 1RH', fetch);
    expect(loc).not.toBeNull();
    expect(loc!.center).toEqual({ lat: 52.2037, lon: 0.1178 });
    expect(loc!.source).toBe('postcode');
    expect(fetch.calls[0]).toContain('api.postcodes.io/postcodes/');
    expect(fetch.calls[0]).toContain('CB2%201RH');
  });

  it('canonicalises the postcode (spacing and case) before requesting', async () => {
    const fetch = stubFetch(() => jsonResponse({ result: { latitude: 52.5, longitude: -2.1 } }));
    await locationFromAddress('willow farm cb43ph', fetch);
    expect(fetch.calls[0]).toContain('CB4%203PH');
  });

  it('returns null without calling the service when the address has no postcode', async () => {
    const fetch = stubFetch(() => jsonResponse({ result: { latitude: 1, longitude: 2 } }));
    expect(await locationFromAddress('some address with no postcode', fetch)).toBeNull();
    expect(fetch.calls).toHaveLength(0);
  });

  it('returns null when the postcode is not found', async () => {
    const fetch = stubFetch(() => jsonResponse({ status: 404, error: 'Postcode not found' }, 404));
    expect(await locationFromAddress('1 High Street CB2 1RH', fetch)).toBeNull();
  });

  it('returns null when the response has no usable coordinates', async () => {
    const noResult = stubFetch(() => jsonResponse({ result: null }));
    expect(await locationFromAddress('1 High Street CB2 1RH', noResult)).toBeNull();
    const missingCoords = stubFetch(() => jsonResponse({ result: { latitude: null, longitude: null } }));
    expect(await locationFromAddress('1 High Street CB2 1RH', missingCoords)).toBeNull();
  });

  it('returns null when the lookup throws (e.g. offline)', async () => {
    const fetch = stubFetch(() => Promise.reject(new Error('network down')));
    expect(await locationFromAddress('1 High Street CB2 1RH', fetch)).toBeNull();
  });
});
