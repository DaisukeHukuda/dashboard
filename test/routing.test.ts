import { describe, it, expect, vi } from 'vitest';
import worker, { type Env } from '../src/index.js';

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
    list: async () => ({ keys: [] }),
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
    // handleHome が天候取得を試みるため、ネットワークに出ないようスタブする
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily: { time: [], weathercode: [], temperature_2m_max: [], precipitation_sum: [] } }) }));
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
});
