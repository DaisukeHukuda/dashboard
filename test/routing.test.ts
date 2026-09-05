import { describe, it, expect, vi } from 'vitest';
import worker, { type Env } from '../src/index.js';
import { DEFAULT_ORDER, SECTION_ORDER_KEY } from '../src/sections.js';

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
    list: async ({ prefix = '' }: { prefix?: string } = {}) => ({ keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }),
  };
}
const env: Env = { DATA: fakeKV(), DASH: fakeKV(), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret' };

function cookieOf(res: Response): string {
  const sc = res.headers.get('set-cookie') ?? '';
  return sc.split(';')[0];
}

describe('routing', () => {
  it('shows login page when unauthenticated', async () => {
    const res = await worker.fetch(new Request('https://x/'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('ログイン');
  });
  it('rejects bad credentials', async () => {
    const form = new URLSearchParams({ username: 'admin', password: 'wrong' });
    const res = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), env);
    expect(res.status).toBe(401);
  });
  it('logs in and reaches dashboard with the session cookie', async () => {
    const form = new URLSearchParams({ username: 'admin', password: 'pw' });
    const login = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), env);
    expect(login.status).toBe(302);
    const cookie = cookieOf(login);
    expect(cookie).toContain('sess=');
    const home = await worker.fetch(new Request('https://x/', { headers: { cookie } }), env);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('ダッシュボード');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('未認証の /api/section-order は 401', async () => {
    const res = await worker.fetch(new Request('https://x/api/section-order', {
      method: 'POST', body: JSON.stringify({ order: [...DEFAULT_ORDER] }),
    }), env);
    expect(res.status).toBe(401);
  });

  it('並び順を保存し、次の表示に反映される', async () => {
    const form = new URLSearchParams({ username: 'admin', password: 'pw' });
    const login = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), env);
    const cookie = cookieOf(login);

    const saved = [...DEFAULT_ORDER].reverse();
    const post = await worker.fetch(new Request('https://x/api/section-order', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ order: saved }),
    }), env);
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({ ok: true });

    const home = await worker.fetch(new Request('https://x/?view=all', { headers: { cookie } }), env);
    const text = await home.text();
    const ids = [...text.matchAll(/data-sec="([a-z0-9]+)"/g)].map(m => m[1]);
    expect(ids).toEqual(saved);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await env.DASH.delete(SECTION_ORDER_KEY);
  });

  it('不正な並び順は 400 で保存しない', async () => {
    const form = new URLSearchParams({ username: 'admin', password: 'pw' });
    const login = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), env);
    const cookie = cookieOf(login);
    for (const bad of [
      { order: DEFAULT_ORDER.slice(1) },            // 不足
      { order: [...DEFAULT_ORDER, 'kpi'] },         // 重複
      { order: 'kpi' },                             // 非配列
      {},                                           // orderなし
    ]) {
      const res = await worker.fetch(new Request('https://x/api/section-order', {
        method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(bad),
      }), env);
      expect(res.status).toBe(400);
    }
    const notJson = await worker.fetch(new Request('https://x/api/section-order', {
      method: 'POST', headers: { cookie }, body: 'not-json',
    }), env);
    expect(notJson.status).toBe(400);
  });

  it('view=bookings でもフォロワー日次スナップショットは1日1回記録され、セクション取得は発生しない。view=sns ではセクション取得も発生する', async () => {
    const envIg: Env = { DATA: fakeKV(), DASH: fakeKV(), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret', IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '17841000000000000' };
    const form = new URLSearchParams({ username: 'admin', password: 'pw' });
    const login = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), envIg);
    const cookie = cookieOf(login);
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ followers_count: 1234 }) });
    vi.stubGlobal('fetch', spy);

    const home1 = await worker.fetch(new Request('https://x/?view=bookings', { headers: { cookie } }), envIg);
    expect(home1.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1); // 予約分析ビューでもフォロワースナップショットのみ1回取得
    const keys = (await envIg.DASH.list({ prefix: 'ig:followers:' })).keys;
    expect(keys.length).toBe(1); // DASHに ig:followers: キーが書かれる

    const home2 = await worker.fetch(new Request('https://x/?view=bookings', { headers: { cookie } }), envIg);
    expect(home2.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1); // 同日デデュープで追加fetch 0回

    const home3 = await worker.fetch(new Request('https://x/?view=sns', { headers: { cookie } }), envIg);
    expect(home3.status).toBe(200);
    expect(spy.mock.calls.length).toBeGreaterThan(1); // IGビューではセクションデータの追加fetchが発生

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('GA4 Secretsのみのenvでも view=bookings ではGA4の外部fetchが発生しない', async () => {
    const envGa4: Env = {
      DATA: fakeKV(), DASH: fakeKV(), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret',
      GA4_SA_JSON_B64: 'dummy-base64', GA4_PROPERTY_ID: '000000',
      // IG Secretsは入れない（C1のフォロワースナップショットfetchと混ざらないようにするため）
    };
    const form = new URLSearchParams({ username: 'admin', password: 'pw' });
    const login = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), envGa4);
    const cookie = cookieOf(login);
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    const home = await worker.fetch(new Request('https://x/?view=bookings', { headers: { cookie } }), envGa4);
    expect(home.status).toBe(200);
    expect(spy).not.toHaveBeenCalled(); // 予約分析ビューはGA4取得を試みない

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
