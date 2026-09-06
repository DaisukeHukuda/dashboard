import { describe, it, expect, vi } from 'vitest';
import worker, { type Env } from '../src/index.js';
import { createSession } from '../src/auth.js';
import type { HistoryRecord } from '../src/types.js';
import { resolvePeriod, priorPeriod } from '../src/period.js';
import { jstToday } from '../src/util.js';

function fakeKV(seed?: Record<string,string>) {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async (k: string) => { m.delete(k); }, list: async () => ({ keys: [] }) };
}
const history: HistoryRecord[] = [{ date: '2024-06-08', course: 'A', pax: 2, amount: 12000, status: '参加済', phoneHash: 'p1' }];

async function cookie() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `sess=${await createSession({ username: 'admin', exp }, 'secret')}`;
}

describe('home GA4 wiring', () => {
  it('shows GA4 not-connected notice when env is missing (Phase 1 still renders)', async () => {
    const env: Env = { DATA: fakeKV({ 'history:latest': JSON.stringify(history) }), DASH: fakeKV(), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret' };
    const res = await worker.fetch(new Request('https://x/?period=all&view=all', { headers: { cookie: await cookie() } }), env);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('KPI');       // Phase 1 健在
    expect(html).toContain('未接続');     // GA4 フォールバック
    vi.unstubAllGlobals();
  });

  it('B2: 前期3レポートが失敗しても当期の描画は続く（.catchで握る）', async () => {
    const today = jstToday();
    const period = resolvePeriod('last12', today);
    const prevP = priorPeriod(period);
    const env: Env = {
      DATA: fakeKV({ 'history:latest': JSON.stringify(history) }), DASH: fakeKV({ 'ga4:token': 'TOK' }),
      ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret',
      GA4_SA_JSON_B64: 'ZHVtbXk=', GA4_PROPERTY_ID: '000000',
    };
    const sampleJson = { rows: [{ dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '10' }] }] };
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { dateRanges: { startDate: string }[] };
      if (body.dateRanges[0].startDate === prevP.start) return { ok: false, status: 500, json: async () => ({}) }; // 前期は失敗
      return { ok: true, json: async () => sampleJson };
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await worker.fetch(new Request('https://x/?period=last12&view=web', { headers: { cookie: await cookie() } }), env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('自然検索'); // 当期のチャネルは描画される（前期失敗が伝播しない）
    expect(fetchMock).toHaveBeenCalledTimes(9); // 当期6＋前期3（失敗込み）
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('B2: period=all では前期を取得しない（runReportは6回のみ）', async () => {
    const env: Env = {
      DATA: fakeKV({ 'history:latest': JSON.stringify(history) }), DASH: fakeKV({ 'ga4:token': 'TOK' }),
      ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret',
      GA4_SA_JSON_B64: 'ZHVtbXk=', GA4_PROPERTY_ID: '000000',
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rows: [] }) });
    vi.stubGlobal('fetch', fetchMock);

    const res = await worker.fetch(new Request('https://x/?period=all&view=web', { headers: { cookie: await cookie() } }), env);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
