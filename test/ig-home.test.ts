import { describe, it, expect, vi } from 'vitest';
import worker, { type Env } from '../src/index.js';
import { createSession } from '../src/auth.js';
import type { HistoryRecord } from '../src/types.js';

function fakeKV(seed?: Record<string,string>) {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async (k: string) => { m.delete(k); }, list: async ({ prefix }: { prefix: string }) => ({ keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }) };
}
const history: HistoryRecord[] = [{ date: '2024-06-08', course: 'A', pax: 2, amount: 12000, status: '参加済', phoneHash: 'p1' }];

describe('home IG wiring', () => {
  it('shows Instagram not-connected notice when env missing (Phase 1 still renders)', async () => {
    const env: Env = { DATA: fakeKV({ 'history:latest': JSON.stringify(history) }), DASH: fakeKV(), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily: { time: [], weathercode: [], temperature_2m_max: [], precipitation_sum: [] } }) }));
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const cookie = `sess=${await createSession({ username: 'admin', exp }, 'secret')}`;
    const res = await worker.fetch(new Request('https://x/?period=all', { headers: { cookie } }), env);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('KPI');            // Phase 1 健在
    expect(html).toContain('Instagram');       // IG セクション
    expect(html).toContain('未接続');           // フォールバック
    vi.unstubAllGlobals();
  });

  // reach（アカウント全体）insightsのみ成否を切り替えられるfetchスタブ。
  // URLをパスで判別: 天候(open-meteo) / アカウントreach(insights かつ metric=reach&) /
  // media一覧(/media?) / 投稿別insights(m1/insights) / アカウント基本情報(fields=followers_count)
  function stubIgFetch(reachOk: boolean) {
    return vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('open-meteo')) {
        return { ok: true, json: async () => ({ daily: { time: [], weathercode: [], temperature_2m_max: [], precipitation_sum: [] } }) };
      }
      if (url.includes('/insights') && url.includes('metric=reach&')) {
        if (!reachOk) return { ok: false, status: 400 };
        return { ok: true, json: async () => ({ data: [{ name: 'reach', period: 'day', values: [{ value: 100, end_time: '2024-07-10T07:00:00+0000' }] }] }) };
      }
      if (url.includes('/media?')) {
        return { ok: true, json: async () => ({ data: [{ id: 'm1', caption: 'SUP日和', timestamp: '2024-07-10T09:00:00+0900', media_type: 'IMAGE', permalink: 'p' }] }) };
      }
      if (url.includes('m1/insights')) {
        return { ok: true, json: async () => ({ data: [{ name: 'reach', values: [{ value: 500 }] }, { name: 'likes', values: [{ value: 40 }] }, { name: 'comments', values: [{ value: 5 }] }, { name: 'saved', values: [{ value: 12 }] }] }) };
      }
      if (url.includes('fields=followers_count')) {
        return { ok: true, json: async () => ({ followers_count: 1234 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
  }

  function igEnv(): Env {
    return { DATA: fakeKV({ 'history:latest': JSON.stringify(history) }), DASH: fakeKV(), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret', IG_ACCESS_TOKEN: 'tok', IG_USER_ID: 'acct1' };
  }

  it('renders the connected IG section when all sub-fetches succeed', async () => {
    const env = igEnv();
    vi.stubGlobal('fetch', stubIgFetch(true));
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const cookie = `sess=${await createSession({ username: 'admin', exp }, 'secret')}`;
    const res = await worker.fetch(new Request('https://x/?period=all', { headers: { cookie } }), env);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('フォロワー推移');
    expect(html).toContain('投稿別エンゲージメント');
    expect(html).toContain('SUP日和');
    expect(html).not.toContain('Instagramは未接続');
    vi.unstubAllGlobals();
  });

  it('keeps IG connected (followers/posts still render) when only the reach fetch fails', async () => {
    const env = igEnv();
    vi.stubGlobal('fetch', stubIgFetch(false));
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const cookie = `sess=${await createSession({ username: 'admin', exp }, 'secret')}`;
    const res = await worker.fetch(new Request('https://x/?period=all', { headers: { cookie } }), env);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('投稿別エンゲージメント');
    expect(html).toContain('SUP日和');
    expect(html).not.toContain('Instagramは未接続');
    vi.unstubAllGlobals();
  });
});
