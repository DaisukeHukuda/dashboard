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

  it('period=YYYY-MM と custom がURLから解決され、期間ラベルに反映される', async () => {
    const form = new URLSearchParams({ username: 'admin', password: 'pw' });
    const login = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), env);
    const cookie = cookieOf(login);
    const m = await (await worker.fetch(new Request('https://x/?period=2026-08', { headers: { cookie } }), env)).text();
    expect(m).toContain('2026年8月');
    const c = await (await worker.fetch(new Request('https://x/?period=custom&from=2026-04-01&to=2026-06-30', { headers: { cookie } }), env)).text();
    expect(c).toContain('2026-04-01〜2026-06-30');
    const bad = await (await worker.fetch(new Request('https://x/?period=custom&from=2026-06-30&to=2026-04-01', { headers: { cookie } }), env)).text();
    expect(bad).toContain('直近12ヶ月');
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

  it('GA4 SA鍵が正しく設定されたenvでも view=bookings ではGA4の外部fetchが発生せず、view=web では発生する', async () => {
    // 署名まで到達できる本物のRSA鍵からSA JSONを合成する（test/ga4-auth.test.ts のPEM合成手法を流用）。
    // 'dummy-base64' のような壊れたSA JSONだと atob() が例外を投げ、gateを消してもfetch前に落ちて
    // テストが実質無効化される（ゲートの有無を区別できない）ため、正規にparseできる鍵を使う。
    const pair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['sign', 'verify'],
    ) as CryptoKeyPair;
    const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey) as ArrayBuffer);
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8)).replace(/(.{64})/g, '$1\n')}\n-----END PRIVATE KEY-----\n`;
    const saJson = JSON.stringify({ client_email: 'svc@p.iam.gserviceaccount.com', private_key: pem });

    const envGa4: Env = {
      DATA: fakeKV(), DASH: fakeKV(), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret',
      GA4_SA_JSON_B64: btoa(saJson), GA4_PROPERTY_ID: '000000',
      // IG Secretsは入れない（フォロワースナップショットfetchと混ざらないようにするため）
    };
    const form = new URLSearchParams({ username: 'admin', password: 'pw' });
    const login = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), envGa4);
    const cookie = cookieOf(login);
    const spy = vi.fn().mockResolvedValue({ ok: false, status: 401 }); // 署名は本物だがトークン取得自体は失敗させ、外部通信はここで止める
    vi.stubGlobal('fetch', spy);

    const home1 = await worker.fetch(new Request('https://x/?view=bookings', { headers: { cookie } }), envGa4);
    expect(home1.status).toBe(200);
    expect(spy).not.toHaveBeenCalled(); // 予約分析ビューはGA4取得を試みない（ゲートを消すとここが落ちる）

    const home2 = await worker.fetch(new Request('https://x/?view=web', { headers: { cookie } }), envGa4);
    expect(home2.status).toBe(200); // トークン取得失敗時もGA4未接続表示にフォールバックして200を返す
    expect(spy).toHaveBeenCalled(); // Webビューでは実際にGA4取得を試みる（ゲートが過剰だとここが落ちる）

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
