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

let lastBody: string = '';
function createFetchWithCapture(response: unknown) {
  return vi.fn().mockImplementation((_url: string, init: RequestInit) => {
    lastBody = String(init.body);
    return Promise.resolve({ ok: true, json: async () => response });
  });
}

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
    expect(body.orderBys).toEqual([{ metric: { metricName: 'sessions' }, desc: true }]);
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
  it('dimensionFilter があれば inListFilter を送り、キャッシュキーに値を含む', async () => {
    const e = env();
    const spec = { key: 'sourceSeries', dimensions: ['date', 'sessionSourceMedium'], metrics: ['sessions'], limit: 100000, dimensionFilter: { fieldName: 'sessionSourceMedium', values: ['google / organic', '(direct) / (none)'] } };
    const fetchMock = createFetchWithCapture(sampleResp);
    await runReport(e, spec, { start: '2026-01-01', end: '2026-01-31' }, fetchMock as unknown as typeof fetch);
    const body = JSON.parse(lastBody);
    expect(body.dimensionFilter).toEqual({ filter: { fieldName: 'sessionSourceMedium', inListFilter: { values: ['google / organic', '(direct) / (none)'] } } });
    // キャッシュキーは値を生連結せず短いハッシュにする（KVキー上限512バイト対策）。
    // shortHash はハッシュ元文字列に対する純粋関数なので、同じアルゴリズムをここで再現して照合する。
    function shortHash(s: string): string {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      return h.toString(16).padStart(8, '0');
    }
    const expectedKey = `ga4:sourceSeries:2026-01-01:2026-01-31:f${shortHash('google / organic (direct) / (none)')}`;
    expect(await e.DASH.get(expectedKey)).not.toBeNull();
    expect(expectedKey.startsWith('ga4:sourceSeries:2026-01-01:2026-01-31:f')).toBe(true);
    expect(expectedKey.length).toBeLessThan(64);
  });
});
