import { describe, it, expect, vi } from 'vitest';
import { runReport } from '../src/ga4/client.js';
import type { Env } from '../src/index.js';

function fakeKV(seed?: Record<string,string>) {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async () => {}, list: async () => ({ keys: [] }) };
}

const env = () => ({ DATA: fakeKV(), DASH: fakeKV({ 'ga4:token': 'TOK' }), ADMIN_USER:'a', ADMIN_PASSWORD:'b', SESSION_SECRET:'s', GA4_PROPERTY_ID: '312598868' } as Env);

const sampleResp = {
  rows: [
    { dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '120' }, { value: '90' }] },
    { dimensionValues: [{ value: 'Social' }], metricValues: [{ value: '80' }, { value: '60' }] },
  ],
};

describe('runReport', () => {
  it('POSTs to the property runReport URL with bearer and parses rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => sampleResp });
    const rows = await runReport(env(), { key: 'channel', dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions','totalUsers'] }, { start: '2024-01-01', end: '2024-12-31' }, fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/312598868:runReport');
    expect(init.headers.authorization).toBe('Bearer TOK');
    const body = JSON.parse(init.body);
    expect(body.dateRanges[0]).toEqual({ startDate: '2024-01-01', endDate: '2024-12-31' });
    expect(body.dimensions).toEqual([{ name: 'sessionDefaultChannelGroup' }]);
    expect(body.metrics).toEqual([{ name: 'sessions' }, { name: 'totalUsers' }]);
    expect(rows).toEqual([
      { dims: ['Organic Search'], mets: [120, 90] },
      { dims: ['Social'], mets: [80, 60] },
    ]);
  });
  it('serves from cache on 2nd call (no fetch)', async () => {
    const e = env();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => sampleResp });
    const spec = { key: 'channel', dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions'] };
    await runReport(e, spec, { start: '2024-01-01', end: '2024-12-31' }, fetchMock as unknown as typeof fetch);
    const fetch2 = vi.fn();
    await runReport(e, spec, { start: '2024-01-01', end: '2024-12-31' }, fetch2 as unknown as typeof fetch);
    expect(fetch2).not.toHaveBeenCalled();
  });
  it('handles empty rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const rows = await runReport(env(), { key: 'x', dimensions: ['d'], metrics: ['m'] }, { start: '2024-01-01', end: '2024-01-31' }, fetchMock as unknown as typeof fetch);
    expect(rows).toEqual([]);
  });
});
