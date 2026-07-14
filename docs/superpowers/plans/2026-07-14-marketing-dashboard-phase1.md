# マーケティング分析ダッシュボード Phase 1 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sup! Sup! の完了予約履歴（2015〜）を土台に、集客・売上／季節・曜日・天候／リピーター定着を可視化する独立ダッシュボードWorkerを作る。

**Architecture:** 既存 `sync` が毎晩取得済みの詳細履歴（参加済のみ・金額/コース込み）を、氏名除去・電話ハッシュ化して既存 `web` の新KVキー `history:latest` へ公開。新規 Cloudflare Worker `supsup-dashboard` がそのKVを read-only で読み、リクエスト時にオンザフライ集計してSSRのインラインSVGグラフを返す。

**Tech Stack:** TypeScript / Cloudflare Workers (SSR) / wrangler / vitest。グラフは外部ライブラリ無しのインラインSVG。天候は Open-Meteo Archive API（無料・キー不要）。

## Global Constraints

- TypeScript strict、`noUnusedLocals` / `noUnusedParameters` 有効、`target`/`module` = ES2022、`moduleResolution: bundler`（既存 web の tsconfig と同一）。
- dashboard は Cloudflare Worker ランタイム＝**Node 組み込み(`node:crypto`等)は使用不可**。暗号は Web Crypto (`crypto.subtle`) を使う。
- sync は Node ランタイム＝`node:crypto` 使用可。
- テストは vitest（`environment: 'node'`、`include: ['test/**/*.test.ts']`）。
- 日付は**すべて JST（Asia/Tokyo）**基準。日付キーは `'YYYY-MM-DD'`。
- UI は日本語。
- **PII方針**: `history:latest` に氏名を入れない。電話はソルト付きハッシュのみ。
- 各タスクは typecheck + test を通してからコミット。web/sync のコミットは各リポジトリ内、dashboard は `dashboard/` リポジトリ内で行う。
- 既存の `sync`・`web` の機能を退行させない（追加のみ）。
- 中禅寺湖の座標: `latitude=36.73`, `longitude=139.48`。
- ソルト環境変数: sync 側 `HISTORY_SALT`（GitHub Secrets。未設定時は `'supsup'` を既定にして決定性を保つ）。

---

## ファイル構成

**dashboard（新規プロジェクト。`dashboard/` 直下）**
- `package.json` / `wrangler.toml` / `tsconfig.json` / `vitest.config.ts` / `.dev.vars.example` — 設定（`.gitignore` は作成済み）
- `src/index.ts` — fetch エントリ・ルーティング・認証ゲート
- `src/auth.ts` — セッション（HMAC）発行/検証・パスワード定数時間比較
- `src/kv.ts` — KV インターフェース（web からの写し）
- `src/types.ts` — `HistoryRecord` 等の共有型
- `src/data.ts` — KV から `history:latest` を読む read-only getter
- `src/util.ts` — JST 日付ユーティリティ
- `src/period.ts` — 期間セレクタの解決（`last12`/`YYYY`/`all`）と前年同期
- `src/repeat.ts` — 初回来訪マップ・リピート判定
- `src/weather.ts` — Open-Meteo 取得 + DASH KV キャッシュ + 天気分類
- `src/metrics/kpi.ts` / `trend.ts` / `heatmap.ts` / `cohort.ts` / `course.ts` / `weatherjoin.ts` / `insights.ts` — 純粋な集計
- `src/charts/svg.ts` / `bar.ts` / `line.ts` / `heatmap.ts` / `cohortgrid.ts` — SVG 描画
- `src/pages.ts` — レイアウト・ダッシュボード組み立て・ログインページ
- `src/handlers.ts` — HTTP ハンドラ（ホーム/ログイン/ログアウト）

**sync（既存・追加のみ）**
- `src/web-publish.ts` — `HistoryRecord`型・`buildHistoryRecords()`・`publishHistory()` を追加
- `src/main.ts` — 履歴スイープ成功時に `publishHistory` を呼ぶ1行追加

**web（既存・追加のみ）**
- `src/data.ts` — `putHistory()`/`getHistory()`/`validateHistory()` 追加
- `src/handlers.ts` — `handleIngestHistory()` 追加
- `src/index.ts` — `/ingest-history` ルート追加

---

## Task 1: dashboard プロジェクトの足場

**Files:**
- Create: `dashboard/package.json`
- Create: `dashboard/wrangler.toml`
- Create: `dashboard/tsconfig.json`
- Create: `dashboard/vitest.config.ts`
- Create: `dashboard/.dev.vars.example`
- Create: `dashboard/src/kv.ts`
- Create: `dashboard/src/types.ts`
- Create: `dashboard/src/index.ts`
- Test: `dashboard/test/smoke.test.ts`

**Interfaces:**
- Produces:
  - `interface KV { get(key:string):Promise<string|null>; put(key:string,value:string,opts?:{expirationTtl?:number}):Promise<void>; delete(key:string):Promise<void>; list(opts:{prefix:string}):Promise<{keys:{name:string}[]}> }`
  - `interface HistoryRecord { date:string; course:string; pax:number; amount:number; status:string; phoneHash:string }`
  - `interface Env { DATA: KV; DASH: KV; ADMIN_USER:string; ADMIN_PASSWORD:string; SESSION_SECRET:string }`
  - default export `{ fetch(req:Request, env:Env):Promise<Response> }`

- [ ] **Step 1: 設定ファイルを作成**

`dashboard/package.json`:
```json
{
  "name": "supsup-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "wrangler": "^3.78.0"
  }
}
```

`dashboard/wrangler.toml`（`DATA` の id は既存 web と同一＝同じ namespace を read-only 参照。`DASH` の id は `wrangler kv namespace create DASH` で採番後に差し替える）:
```toml
name = "supsup-dashboard"
main = "src/index.ts"
compatibility_date = "2024-09-23"

kv_namespaces = [
  { binding = "DATA", id = "a237d8666bc742419b1805c6dc40017d" },
  { binding = "DASH", id = "REPLACE_AFTER_kv_namespace_create" },
]
```

`dashboard/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "types": ["@cloudflare/workers-types"],
    "lib": ["ES2022"]
  },
  "include": ["src", "test"]
}
```

`dashboard/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
```

`dashboard/.dev.vars.example`:
```
ADMIN_USER=admin
ADMIN_PASSWORD=change-me-strong
SESSION_SECRET=generate-a-long-random-string
```

- [ ] **Step 2: KV と共有型を作成**

`dashboard/src/kv.ts`:
```ts
// 本アプリで使う KVNamespace のサブセット。Fake と本物を差し替え可能にする。
export interface KV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string }): Promise<{ keys: { name: string }[] }>;
}
```

`dashboard/src/types.ts`:
```ts
// sync が history:latest として公開する1レコード（氏名なし・電話はハッシュ）
export interface HistoryRecord {
  date: string;      // 参加日 JST 'YYYY-MM-DD'
  course: string;    // コース名
  pax: number;       // 人数
  amount: number;    // 合計金額（円）
  status: string;    // ステータス（履歴は基本 '参加済'）
  phoneHash: string; // 電話番号のソルト付きハッシュ（復元不可）
}
```

- [ ] **Step 3: 失敗するスモークテストを書く**

`dashboard/test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';
import type { Env } from '../src/index.js';

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
    list: async () => ({ keys: [] }),
  };
}

const env: Env = {
  DATA: fakeKV(), DASH: fakeKV(),
  ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret',
};

describe('worker smoke', () => {
  it('serves robots.txt without auth', async () => {
    const res = await worker.fetch(new Request('https://x/robots.txt'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Disallow: /');
  });
});
```

- [ ] **Step 4: テストが失敗することを確認**

Run: `cd dashboard && npm install && npm test`
Expected: FAIL（`src/index.js` が存在しない）

- [ ] **Step 5: 最小の index.ts を実装**

`dashboard/src/index.ts`:
```ts
import type { KV } from './kv.js';

export interface Env {
  DATA: KV;
  DASH: KV;
  ADMIN_USER: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
}

async function handle(req: Request, _env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response('not found', { status: 404 });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const res = await handle(req, env);
    const headers = new Headers(res.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
```

- [ ] **Step 6: テストが通ることを確認**

Run: `cd dashboard && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: dashboard scaffold (config, kv, types, robots.txt)"
```

---

## Task 2: 認証（セッション発行/検証・パスワード比較）

**Files:**
- Create: `dashboard/src/auth.ts`
- Test: `dashboard/test/auth.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface SessionPayload { username: string; exp: number }`
  - `createSession(payload: SessionPayload, secret: string): Promise<string>`
  - `verifySession(token: string, secret: string): Promise<SessionPayload | null>`
  - `constantEquals(a: string, b: string): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/auth.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createSession, verifySession, constantEquals } from '../src/auth.js';

describe('session', () => {
  it('roundtrips a valid session', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createSession({ username: 'admin', exp }, 'secret');
    const p = await verifySession(tok, 'secret');
    expect(p?.username).toBe('admin');
  });
  it('rejects a tampered token', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createSession({ username: 'admin', exp }, 'secret');
    expect(await verifySession(tok + 'x', 'secret')).toBeNull();
  });
  it('rejects wrong secret', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const tok = await createSession({ username: 'admin', exp }, 'secret');
    expect(await verifySession(tok, 'other')).toBeNull();
  });
  it('rejects expired token', async () => {
    const tok = await createSession({ username: 'admin', exp: 1 }, 'secret');
    expect(await verifySession(tok, 'secret')).toBeNull();
  });
});

describe('constantEquals', () => {
  it('true for equal', () => expect(constantEquals('abc', 'abc')).toBe(true));
  it('false for different', () => expect(constantEquals('abc', 'abd')).toBe(false));
  it('false for different length', () => expect(constantEquals('abc', 'ab')).toBe(false));
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- auth`
Expected: FAIL（`src/auth.js` が無い）

- [ ] **Step 3: auth.ts を実装（web/src/auth.ts のセッション部を移植）**

`dashboard/src/auth.ts`:
```ts
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

export function constantEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface SessionPayload { username: string; exp: number; }

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return new Uint8Array(sig);
}

export async function createSession(payload: SessionPayload, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await hmac(secret, body));
  return `${body}.${sig}`;
}

export async function verifySession(token: string, secret: string): Promise<SessionPayload | null> {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(await hmac(secret, body));
  if (!constantEquals(sig, expected)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 通ることを確認**

Run: `cd dashboard && npm test -- auth && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: session auth (HMAC) and constant-time compare"
```

---

## Task 3: ルーティング・ログイン・シェル

**Files:**
- Modify: `dashboard/src/index.ts`
- Create: `dashboard/src/handlers.ts`
- Create: `dashboard/src/pages.ts`
- Test: `dashboard/test/routing.test.ts`

**Interfaces:**
- Consumes: `createSession`/`verifySession`/`constantEquals`（Task 2）、`Env`（Task 1）
- Produces:
  - `handleLogin(req: Request, env: Env): Promise<Response>`
  - `handleLogout(): Response`
  - `handleHome(url: URL, env: Env, username: string): Promise<Response>`（Task 18 で本実装。ここでは "<h1>ダッシュボード</h1>" のプレースホルダ）
  - `loginPage(error?: string): string`
  - `layout(title: string, body: string): string`

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/routing.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
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
    const form = new URLSearchParams({ username: 'admin', password: 'pw' });
    const login = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), env);
    expect(login.status).toBe(302);
    const cookie = cookieOf(login);
    expect(cookie).toContain('sess=');
    const home = await worker.fetch(new Request('https://x/', { headers: { cookie } }), env);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('ダッシュボード');
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- routing`
Expected: FAIL

- [ ] **Step 3: pages.ts（レイアウト・ログイン）を実装**

`dashboard/src/pages.ts`:
```ts
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function layout(title: string, body: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--ink:#1f2937;--muted:#6b7280;--accent:#1e3a5f;--line:#e5e7eb}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--accent);color:#fff;padding:12px 16px;font-weight:700}
main{max-width:1100px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 16px}
.card h2{margin:0 0 12px;font-size:15px}
a{color:var(--accent)}
label{display:block;margin:8px 0 4px;font-size:13px;color:var(--muted)}
input,select{padding:8px;border:1px solid var(--line);border-radius:6px;font-size:14px}
button{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:9px 16px;font-size:14px;cursor:pointer}
</style></head><body>${body}</body></html>`;
}

export function loginPage(error?: string): string {
  const err = error ? `<p style="color:#b91c1c;font-size:13px">${esc(error)}</p>` : '';
  return layout('ログイン｜Sup! Sup! マーケ分析', `<main><div class="card" style="max-width:360px;margin:48px auto">
<h2>ログイン</h2>${err}
<form method="post" action="/login">
<label>ユーザー名</label><input name="username" autocomplete="username" required>
<label>パスワード</label><input name="password" type="password" autocomplete="current-password" required>
<div style="margin-top:12px"><button type="submit">ログイン</button></div>
</form></div></main>`);
}
```

- [ ] **Step 4: handlers.ts（ログイン/ログアウト/ホームのプレースホルダ）を実装**

`dashboard/src/handlers.ts`:
```ts
import type { Env } from './index.js';
import { createSession, constantEquals } from './auth.js';
import { layout, loginPage } from './pages.js';

const SESSION_TTL = 7 * 24 * 3600;
const html = (s: string, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

export async function handleLogin(req: Request, env: Env): Promise<Response> {
  const form = await req.formData();
  const username = String(form.get('username') ?? '');
  const password = String(form.get('password') ?? '');
  const ok = constantEquals(username, env.ADMIN_USER) && constantEquals(password, env.ADMIN_PASSWORD);
  if (!ok) return html(loginPage('ユーザー名またはパスワードが違います'), 401);
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const token = await createSession({ username, exp }, env.SESSION_SECRET);
  return new Response(null, {
    status: 302,
    headers: {
      location: '/',
      'set-cookie': `sess=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`,
    },
  });
}

export function handleLogout(): Response {
  return new Response(null, {
    status: 302,
    headers: { location: '/', 'set-cookie': 'sess=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' },
  });
}

// Task 18 で本実装に差し替える
export async function handleHome(_url: URL, _env: Env, username: string): Promise<Response> {
  return html(layout('ダッシュボード｜Sup! Sup!', `<header>Sup! Sup! マーケ分析</header><main><div class="card"><h2>ダッシュボード</h2><p>ようこそ、${username} さん</p></div></main>`));
}
```

- [ ] **Step 5: index.ts に認証ゲートとルーティングを追加**

`dashboard/src/index.ts` を次で置き換え:
```ts
import type { KV } from './kv.js';
import { verifySession } from './auth.js';
import { handleLogin, handleLogout, handleHome } from './handlers.js';
import { loginPage } from './pages.js';

export interface Env {
  DATA: KV;
  DASH: KV;
  ADMIN_USER: string;
  ADMIN_PASSWORD: string;
  SESSION_SECRET: string;
}

const html = (s: string, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? m[1] : null;
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (path === '/robots.txt') {
    return new Response('User-agent: *\nDisallow: /\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  if (path === '/login' && method === 'POST') return handleLogin(req, env);
  if (path === '/logout') return handleLogout();

  const token = getCookie(req, 'sess');
  const user = token ? await verifySession(token, env.SESSION_SECRET) : null;
  if (!user) return html(loginPage());

  if (path === '/' && method === 'GET') return handleHome(url, env, user.username);
  return new Response('not found', { status: 404 });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const res = await handle(req, env);
    const headers = new Headers(res.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
```

- [ ] **Step 6: 通ることを確認**

Run: `cd dashboard && npm test && npm run typecheck`
Expected: PASS（smoke + auth + routing すべて）

- [ ] **Step 7: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: routing, login/logout, dashboard shell"
```

---

## Task 4: sync — HistoryRecord 生成（ハッシュ・金額パース）

**Files:**
- Modify: `sync/src/web-publish.ts`
- Test: `sync/test/history.test.ts`

**Interfaces:**
- Consumes: `Reservation`（`sync/src/types.ts`。`start: Date`, `courseName: string`, `pax: number`, `status: string`, `phone?: string`, `totalAmount?: string`）
- Produces:
  - `interface HistoryRecord { date:string; course:string; pax:number; amount:number; status:string; phoneHash:string }`
  - `parseAmount(s: string | undefined): number`
  - `hashPhone(phone: string | undefined, salt: string): string`（空/0のみ電話は `''` を返す）
  - `buildHistoryRecords(reservations: Reservation[], salt: string): HistoryRecord[]`

- [ ] **Step 1: 失敗するテストを書く**

`sync/test/history.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseAmount, hashPhone, buildHistoryRecords } from '../src/web-publish.js';
import type { Reservation } from '../src/types.js';

function resv(over: Partial<Reservation>): Reservation {
  return {
    reservationId: '1', courseName: 'SUP体験', start: new Date('2023-06-10T01:00:00Z'),
    pax: 2, customerName: '山田太郎', status: '参加済', phone: '090-1234-5678',
    totalAmount: '12,000', ...over,
  } as Reservation;
}

describe('parseAmount', () => {
  it('parses comma/yen strings', () => {
    expect(parseAmount('12,000')).toBe(12000);
    expect(parseAmount('¥8,800円')).toBe(8800);
  });
  it('returns 0 for empty/garbage', () => {
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount('無料')).toBe(0);
  });
});

describe('hashPhone', () => {
  it('is deterministic and salted', () => {
    const a = hashPhone('090-1234-5678', 's1');
    expect(a).toBe(hashPhone('09012345678', 's1'));
    expect(a).not.toBe(hashPhone('090-1234-5678', 's2'));
  });
  it('returns empty for missing/zero phone', () => {
    expect(hashPhone(undefined, 's')).toBe('');
    expect(hashPhone('0000', 's')).toBe('');
  });
});

describe('buildHistoryRecords', () => {
  it('maps fields, drops name, uses JST date', () => {
    const recs = buildHistoryRecords([resv({})], 's1');
    expect(recs).toHaveLength(1);
    const r = recs[0];
    expect(r.date).toBe('2023-06-10'); // 01:00Z = 10:00 JST 同日
    expect(r.course).toBe('SUP体験');
    expect(r.pax).toBe(2);
    expect(r.amount).toBe(12000);
    expect(r.phoneHash).toBe(hashPhone('09012345678', 's1'));
    expect(JSON.stringify(r)).not.toContain('山田');
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd sync && npm test -- history`
Expected: FAIL（export が無い）

- [ ] **Step 3: web-publish.ts に実装を追加（既存 export は変更しない）**

`sync/src/web-publish.ts` の先頭 import に追記:
```ts
import { createHmac } from 'node:crypto';
```

ファイル末尾に追加:
```ts
export interface HistoryRecord {
  date: string; course: string; pax: number; amount: number; status: string; phoneHash: string;
}

export function parseAmount(s: string | undefined): number {
  const digits = (s ?? '').replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

export function hashPhone(phone: string | undefined, salt: string): string {
  const p = (phone ?? '').replace(/[^0-9]/g, '');
  if (!p || /^0+$/.test(p)) return '';
  return createHmac('sha256', salt).update(p).digest('hex').slice(0, 16);
}

export function buildHistoryRecords(reservations: Reservation[], salt: string): HistoryRecord[] {
  return reservations.map(r => ({
    date: jstDateOf(r.start),
    course: r.courseName,
    pax: r.pax,
    amount: parseAmount(r.totalAmount),
    status: r.status,
    phoneHash: hashPhone(r.phone, salt),
  }));
}
```
（`jstDateOf` は同ファイルに既存。`Reservation` も既存 import。）

- [ ] **Step 4: 通ることを確認**

Run: `cd sync && npm test -- history && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd sync && git add -A && git commit -m "feat: build history records (amount parse, phone hash, name stripped)"
```

---

## Task 5: sync — publishHistory と main.ts 配線

**Files:**
- Modify: `sync/src/web-publish.ts`
- Modify: `sync/src/main.ts`
- Test: `sync/test/publish-history.test.ts`

**Interfaces:**
- Consumes: `HistoryRecord`（Task 4）
- Produces: `publishHistory(url: string, secret: string, records: HistoryRecord[]): Promise<void>`（POST `/ingest-history`、Bearer 認証）

- [ ] **Step 1: 失敗するテストを書く**

`sync/test/publish-history.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { publishHistory } from '../src/web-publish.js';

afterEach(() => vi.restoreAllMocks());

describe('publishHistory', () => {
  it('POSTs to /ingest-history with bearer auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    await publishHistory('https://web.example/', 'sek', [
      { date: '2023-06-10', course: 'SUP', pax: 2, amount: 12000, status: '参加済', phoneHash: 'abc' },
    ]);
    const [u, init] = fetchMock.mock.calls[0];
    expect(u).toBe('https://web.example/ingest-history');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer sek');
    expect(JSON.parse(init.body)[0].course).toBe('SUP');
  });
  it('throws on non-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(publishHistory('https://web.example', 'sek', [])).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd sync && npm test -- publish-history`
Expected: FAIL

- [ ] **Step 3: publishHistory を web-publish.ts に追加**

`sync/src/web-publish.ts` 末尾に追加（`publishRepeats` と同型）:
```ts
export async function publishHistory(url: string, secret: string, records: HistoryRecord[]): Promise<void> {
  const resp = await fetch(`${url.replace(/\/$/, '')}/ingest-history`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(records),
  });
  if (!resp.ok) throw new Error(`history ingest failed: HTTP ${resp.status}`);
}
```

- [ ] **Step 4: main.ts の履歴スイープに配線（既存の repeats 公開は残す）**

`sync/src/main.ts` の import に追加:
```ts
import { publishHistory, buildHistoryRecords } from './web-publish.js';
```
（既存の `publishToWeb, repeatVisitDates, publishRepeats, ...` の import 行へ `publishHistory, buildHistoryRecords` を加える。）

`repeats` 公開の直後（`console.log('[sync] repeats published ...')` の次行）に追加:
```ts
        const historyRecords = buildHistoryRecords(history, process.env.HISTORY_SALT ?? 'supsup');
        await publishHistory(webUrl, webSecret, historyRecords);
        console.log(`[sync] history published ${historyRecords.length} records`);
```
（同じ try ブロック内。既存の catch がそのまま失敗を握る＝カレンダー同期に影響しない。）

- [ ] **Step 5: 通ることを確認**

Run: `cd sync && npm test && npx tsc --noEmit`
Expected: PASS（全テスト）

- [ ] **Step 6: コミット**

```bash
cd sync && git add -A && git commit -m "feat: publish detailed history to web (/ingest-history)"
```

---

## Task 6: web — /ingest-history 受け口

**Files:**
- Modify: `web/src/data.ts`
- Modify: `web/src/handlers.ts`
- Modify: `web/src/index.ts`
- Test: `web/test/ingest-history.test.ts`

**Interfaces:**
- Consumes: 既存 `Env`（`web/src/handlers.ts`。`INGEST_SECRET`, `DATA` を含む）、既存 `KV`
- Produces:
  - `interface HistoryRecord { date:string; course:string; pax:number; amount:number; status:string; phoneHash:string }`（web/src/data.ts）
  - `validateHistory(body: unknown): HistoryRecord[]`
  - `putHistory(kv: KV, list: HistoryRecord[]): Promise<void>`
  - `getHistory(kv: KV): Promise<HistoryRecord[]>`
  - `handleIngestHistory(req: Request, env: Env): Promise<Response>`

- [ ] **Step 1: 失敗するテストを書く**

`web/test/ingest-history.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { validateHistory, putHistory, getHistory } from '../src/data.js';

function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
    list: async () => ({ keys: [] }),
  };
}

describe('validateHistory', () => {
  it('accepts well-formed records', () => {
    const out = validateHistory([{ date: '2023-06-10', course: 'SUP', pax: 2, amount: 12000, status: '参加済', phoneHash: 'abc' }]);
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(12000);
  });
  it('throws for non-array', () => {
    expect(() => validateHistory({})).toThrow();
  });
  it('throws for missing date', () => {
    expect(() => validateHistory([{ course: 'SUP', pax: 2, amount: 1, status: 'x', phoneHash: '' }])).toThrow();
  });
});

describe('put/getHistory', () => {
  it('roundtrips', async () => {
    const kv = fakeKV();
    await putHistory(kv, [{ date: '2023-06-10', course: 'SUP', pax: 2, amount: 12000, status: '参加済', phoneHash: 'abc' }]);
    const got = await getHistory(kv);
    expect(got[0].course).toBe('SUP');
  });
  it('returns [] when empty', async () => {
    expect(await getHistory(fakeKV())).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd web && npm test -- ingest-history`
Expected: FAIL

- [ ] **Step 3: data.ts に型と関数を追加**

`web/src/data.ts` 末尾に追加:
```ts
export interface HistoryRecord {
  date: string; course: string; pax: number; amount: number; status: string; phoneHash: string;
}

const HISTORY_KEY = 'history:latest';

export function validateHistory(body: unknown): HistoryRecord[] {
  if (!Array.isArray(body)) throw new Error('history body must be an array');
  return body.map((x, i) => {
    const r = x as Record<string, unknown>;
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new Error(`row ${i}: bad date`);
    return {
      date: r.date,
      course: typeof r.course === 'string' ? r.course : '',
      pax: typeof r.pax === 'number' ? r.pax : 0,
      amount: typeof r.amount === 'number' ? r.amount : 0,
      status: typeof r.status === 'string' ? r.status : '',
      phoneHash: typeof r.phoneHash === 'string' ? r.phoneHash : '',
    };
  });
}

export async function putHistory(kv: KV, list: HistoryRecord[]): Promise<void> {
  await kv.put(HISTORY_KEY, JSON.stringify(list));
}

export async function getHistory(kv: KV): Promise<HistoryRecord[]> {
  const raw = await kv.get(HISTORY_KEY);
  return raw ? (JSON.parse(raw) as HistoryRecord[]) : [];
}
```
（`KV` 型は data.ts で既に import 済み。未 import なら `import type { KV } from './kv.js';` を先頭に追加。）

- [ ] **Step 4: handlers.ts に handleIngestHistory を追加**

`web/src/handlers.ts` の data.js import 行へ `putHistory, validateHistory` を追加し、`handleIngest` の直後に追加:
```ts
export async function handleIngestHistory(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${env.INGEST_SECRET}`) return new Response('unauthorized', { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  let list;
  try { list = validateHistory(body); } catch (e) { return new Response(`invalid: ${(e as Error).message}`, { status: 400 }); }
  await putHistory(env.DATA, list);
  return new Response(JSON.stringify({ ok: true, count: list.length }), { headers: { 'content-type': 'application/json' } });
}
```

- [ ] **Step 5: index.ts にルートを追加**

`web/src/index.ts` の handlers import に `handleIngestHistory` を加え、`/ingest-repeats` の行の近くに追加:
```ts
  if (path === '/ingest-history' && method === 'POST') return handleIngestHistory(req, env);
```

- [ ] **Step 6: 通ることを確認**

Run: `cd web && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
cd web && git add -A && git commit -m "feat: /ingest-history endpoint + history KV helpers"
```

---

## Task 7: dashboard — データ読取と期間解決

**Files:**
- Create: `dashboard/src/util.ts`
- Create: `dashboard/src/data.ts`
- Create: `dashboard/src/period.ts`
- Test: `dashboard/test/period.test.ts`

**Interfaces:**
- Consumes: `KV`（Task 1）、`HistoryRecord`（Task 1 types）
- Produces:
  - util: `jstToday(): string`、`addMonthsToYmd(ymd:string, months:number): string`、`weekdayOf(ymd:string): number`（0=日〜6=土）、`monthOf(ymd:string): number`（1-12）、`ymOf(ymd:string): string`（'YYYY-MM'）、`monthsBetween(a:string,b:string): number`
  - data: `getHistory(kv: KV): Promise<HistoryRecord[]>`
  - period: `interface Period { start:string; end:string; label:string; kind:'last12'|'year'|'all' }`、`resolvePeriod(param:string|null, today:string): Period`、`priorYear(p:Period): Period`、`inPeriod(ymd:string, p:Period): boolean`、`filterPeriod(records:HistoryRecord[], p:Period): HistoryRecord[]`

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/period.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolvePeriod, priorYear, inPeriod, filterPeriod } from '../src/period.js';
import { weekdayOf, monthOf, ymOf, addMonthsToYmd, monthsBetween } from '../src/util.js';

describe('util', () => {
  it('weekdayOf', () => { expect(weekdayOf('2023-06-10')).toBe(6); }); // 土
  it('monthOf/ymOf', () => { expect(monthOf('2023-06-10')).toBe(6); expect(ymOf('2023-06-10')).toBe('2023-06'); });
  it('addMonthsToYmd wraps year', () => { expect(addMonthsToYmd('2023-11-15', 3)).toBe('2024-02-15'); });
  it('monthsBetween', () => { expect(monthsBetween('2023-01', '2023-06')).toBe(5); });
});

describe('resolvePeriod', () => {
  it('last12 spans 12 months back from today', () => {
    const p = resolvePeriod('last12', '2024-06-15');
    expect(p.kind).toBe('last12');
    expect(p.start).toBe('2023-06-16');
    expect(p.end).toBe('2024-06-15');
  });
  it('year sets Jan 1 to Dec 31', () => {
    const p = resolvePeriod('2023', '2024-06-15');
    expect(p.start).toBe('2023-01-01');
    expect(p.end).toBe('2023-12-31');
  });
  it('all uses a wide window', () => {
    const p = resolvePeriod('all', '2024-06-15');
    expect(p.start <= '2015-01-01').toBe(true);
    expect(p.end).toBe('2024-06-15');
  });
  it('defaults to last12 for unknown param', () => {
    expect(resolvePeriod(null, '2024-06-15').kind).toBe('last12');
  });
});

describe('priorYear / inPeriod / filterPeriod', () => {
  it('priorYear shifts both bounds by a year', () => {
    const p = resolvePeriod('2023', '2024-06-15');
    const q = priorYear(p);
    expect(q.start).toBe('2022-01-01');
    expect(q.end).toBe('2022-12-31');
  });
  it('inPeriod is inclusive', () => {
    const p = resolvePeriod('2023', '2024-06-15');
    expect(inPeriod('2023-01-01', p)).toBe(true);
    expect(inPeriod('2022-12-31', p)).toBe(false);
  });
  it('filterPeriod keeps only in-range', () => {
    const p = resolvePeriod('2023', '2024-06-15');
    const recs = [
      { date: '2023-05-01', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' },
      { date: '2022-05-01', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' },
    ];
    expect(filterPeriod(recs, p)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- period`
Expected: FAIL

- [ ] **Step 3: util.ts を実装**

`dashboard/src/util.ts`:
```ts
// すべて 'YYYY-MM-DD' 文字列を JST の暦日として扱う（UTCのDateを日付演算にのみ使う）
function toUTC(ymd: string): Date { return new Date(`${ymd}T00:00:00Z`); }
function fmt(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function jstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function weekdayOf(ymd: string): number { return toUTC(ymd).getUTCDay(); }
export function monthOf(ymd: string): number { return toUTC(ymd).getUTCMonth() + 1; }
export function ymOf(ymd: string): string { return ymd.slice(0, 7); }

export function addDaysToYmd(ymd: string, days: number): string {
  const d = toUTC(ymd); d.setUTCDate(d.getUTCDate() + days); return fmt(d);
}
export function addMonthsToYmd(ymd: string, months: number): string {
  const d = toUTC(ymd); d.setUTCMonth(d.getUTCMonth() + months); return fmt(d);
}
// 'YYYY-MM' 同士の月数差（b - a）
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}
```

- [ ] **Step 4: data.ts を実装**

`dashboard/src/data.ts`:
```ts
import type { KV } from './kv.js';
import type { HistoryRecord } from './types.js';

export async function getHistory(kv: KV): Promise<HistoryRecord[]> {
  const raw = await kv.get('history:latest');
  return raw ? (JSON.parse(raw) as HistoryRecord[]) : [];
}
```

- [ ] **Step 5: period.ts を実装**

`dashboard/src/period.ts`:
```ts
import type { HistoryRecord } from './types.js';
import { addDaysToYmd, addMonthsToYmd } from './util.js';

export interface Period { start: string; end: string; label: string; kind: 'last12' | 'year' | 'all'; }

export function resolvePeriod(param: string | null, today: string): Period {
  if (param && /^\d{4}$/.test(param)) {
    return { start: `${param}-01-01`, end: `${param}-12-31`, label: `${param}年`, kind: 'year' };
  }
  if (param === 'all') {
    return { start: '2015-01-01', end: today, label: '全期間', kind: 'all' };
  }
  // 既定: 直近12ヶ月
  const start = addDaysToYmd(addMonthsToYmd(today, -12), 1);
  return { start, end: today, label: '直近12ヶ月', kind: 'last12' };
}

export function priorYear(p: Period): Period {
  return {
    start: addMonthsToYmd(p.start, -12),
    end: addMonthsToYmd(p.end, -12),
    label: `${p.label}（前年）`,
    kind: p.kind,
  };
}

export function inPeriod(ymd: string, p: Period): boolean {
  return ymd >= p.start && ymd <= p.end;
}

export function filterPeriod(records: HistoryRecord[], p: Period): HistoryRecord[] {
  return records.filter(r => inPeriod(r.date, p));
}
```

- [ ] **Step 6: 通ることを確認**

Run: `cd dashboard && npm test -- period && npm run typecheck`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: history reader, JST utils, period resolution"
```

---

## Task 8: dashboard — リピート判定

**Files:**
- Create: `dashboard/src/repeat.ts`
- Test: `dashboard/test/repeat.test.ts`

**Interfaces:**
- Consumes: `HistoryRecord`
- Produces:
  - `firstVisitMap(all: HistoryRecord[]): Map<string, string>`（phoneHash → 最初の参加日。phoneHash が空のレコードは除外）
  - `isRepeat(rec: HistoryRecord, firstVisit: Map<string, string>): boolean`（phoneHash 空は常に新規扱い＝false）

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/repeat.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { firstVisitMap, isRepeat } from '../src/repeat.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string, phoneHash: string): HistoryRecord => ({ date, course: 'A', pax: 1, amount: 1, status: '参加済', phoneHash });

describe('firstVisitMap', () => {
  it('records earliest date per phoneHash', () => {
    const m = firstVisitMap([r('2023-06-01', 'p1'), r('2022-05-01', 'p1'), r('2023-01-01', 'p2')]);
    expect(m.get('p1')).toBe('2022-05-01');
    expect(m.get('p2')).toBe('2023-01-01');
  });
  it('ignores empty phoneHash', () => {
    expect(firstVisitMap([r('2023-06-01', '')]).size).toBe(0);
  });
});

describe('isRepeat', () => {
  it('true when a prior visit exists', () => {
    const all = [r('2022-05-01', 'p1'), r('2023-06-01', 'p1')];
    const m = firstVisitMap(all);
    expect(isRepeat(r('2023-06-01', 'p1'), m)).toBe(true);
    expect(isRepeat(r('2022-05-01', 'p1'), m)).toBe(false); // 初回そのもの
  });
  it('empty phoneHash is always new', () => {
    expect(isRepeat(r('2023-06-01', ''), new Map())).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- repeat`
Expected: FAIL

- [ ] **Step 3: repeat.ts を実装**

`dashboard/src/repeat.ts`:
```ts
import type { HistoryRecord } from './types.js';

export function firstVisitMap(all: HistoryRecord[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of all) {
    if (!r.phoneHash) continue;
    const cur = m.get(r.phoneHash);
    if (cur === undefined || r.date < cur) m.set(r.phoneHash, r.date);
  }
  return m;
}

// その予約日より前に来訪があればリピート（＝初回来訪日より後）
export function isRepeat(rec: HistoryRecord, firstVisit: Map<string, string>): boolean {
  if (!rec.phoneHash) return false;
  const first = firstVisit.get(rec.phoneHash);
  return first !== undefined && rec.date > first;
}
```

- [ ] **Step 4: 通ることを確認**

Run: `cd dashboard && npm test -- repeat && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: repeat visitor determination (first-visit map)"
```

---

## Task 9: metrics/kpi — サマリーと YoY

**Files:**
- Create: `dashboard/src/metrics/kpi.ts`
- Test: `dashboard/test/kpi.test.ts`

**Interfaces:**
- Consumes: `HistoryRecord`、`Period`、`filterPeriod`/`priorYear`（period.ts）、`firstVisitMap`/`isRepeat`（repeat.ts）
- Produces:
  - `interface Kpi { bookings:number; revenue:number; avgPerBooking:number; pax:number; newCount:number; repeatCount:number; repeatRate:number; yoyRevenue:number|null; yoyBookings:number|null }`
  - `computeKpi(all: HistoryRecord[], period: Period): Kpi`

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/kpi.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeKpi } from '../src/metrics/kpi.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string, amount: number, pax: number, phoneHash: string): HistoryRecord =>
  ({ date, course: 'A', pax, amount, status: '参加済', phoneHash });

describe('computeKpi', () => {
  const all: HistoryRecord[] = [
    r('2022-06-01', 10000, 2, 'p1'), // 前年
    r('2023-06-01', 12000, 2, 'p1'), // 当年・p1 リピート
    r('2023-07-01', 8000, 1, 'p2'),  // 当年・p2 新規
  ];
  const p = resolvePeriod('2023', '2024-01-01');

  it('sums bookings/revenue/pax in period', () => {
    const k = computeKpi(all, p);
    expect(k.bookings).toBe(2);
    expect(k.revenue).toBe(20000);
    expect(k.pax).toBe(3);
    expect(k.avgPerBooking).toBe(10000);
  });
  it('splits new vs repeat', () => {
    const k = computeKpi(all, p);
    expect(k.repeatCount).toBe(1);
    expect(k.newCount).toBe(1);
    expect(k.repeatRate).toBeCloseTo(0.5);
  });
  it('computes YoY vs prior year', () => {
    const k = computeKpi(all, p);
    // 前年同期(2022)は revenue 10000, bookings 1
    expect(k.yoyRevenue).toBeCloseTo(20000 / 10000);
    expect(k.yoyBookings).toBeCloseTo(2 / 1);
  });
  it('YoY null when no prior data', () => {
    const k = computeKpi([r('2023-06-01', 12000, 2, 'p1')], p);
    expect(k.yoyRevenue).toBeNull();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- kpi`
Expected: FAIL

- [ ] **Step 3: kpi.ts を実装**

`dashboard/src/metrics/kpi.ts`:
```ts
import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod, priorYear } from '../period.js';
import { firstVisitMap, isRepeat } from '../repeat.js';

export interface Kpi {
  bookings: number; revenue: number; avgPerBooking: number; pax: number;
  newCount: number; repeatCount: number; repeatRate: number;
  yoyRevenue: number | null; yoyBookings: number | null;
}

function totals(recs: HistoryRecord[]): { bookings: number; revenue: number } {
  return { bookings: recs.length, revenue: recs.reduce((s, r) => s + r.amount, 0) };
}

export function computeKpi(all: HistoryRecord[], period: Period): Kpi {
  const first = firstVisitMap(all);
  const cur = filterPeriod(all, period);
  const prev = filterPeriod(all, priorYear(period));

  const revenue = cur.reduce((s, r) => s + r.amount, 0);
  const pax = cur.reduce((s, r) => s + r.pax, 0);
  const bookings = cur.length;
  let repeatCount = 0;
  for (const r of cur) if (isRepeat(r, first)) repeatCount++;
  const newCount = bookings - repeatCount;

  const prevT = totals(prev);
  return {
    bookings, revenue, pax,
    avgPerBooking: bookings ? Math.round(revenue / bookings) : 0,
    newCount, repeatCount,
    repeatRate: bookings ? repeatCount / bookings : 0,
    yoyRevenue: prevT.revenue ? revenue / prevT.revenue : null,
    yoyBookings: prevT.bookings ? bookings / prevT.bookings : null,
  };
}
```

- [ ] **Step 4: 通ることを確認**

Run: `cd dashboard && npm test -- kpi && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: KPI summary with YoY"
```

---

## Task 10: metrics/trend — 月次・週次の売上と件数

**Files:**
- Create: `dashboard/src/metrics/trend.ts`
- Test: `dashboard/test/trend.test.ts`

**Interfaces:**
- Consumes: `HistoryRecord`、`Period`、`filterPeriod`
- Produces:
  - `interface TrendPoint { bucket:string; label:string; bookings:number; revenue:number }`
  - `computeTrend(all: HistoryRecord[], period: Period, granularity: 'month'|'week'): TrendPoint[]`（bucket 昇順・欠損バケットは0埋めしない＝存在した bucket のみ）

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/trend.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeTrend } from '../src/metrics/trend.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string, amount: number): HistoryRecord => ({ date, course: 'A', pax: 1, amount, status: '参加済', phoneHash: '' });

describe('computeTrend month', () => {
  const all = [r('2023-06-05', 1000), r('2023-06-20', 2000), r('2023-07-02', 500)];
  const p = resolvePeriod('2023', '2024-01-01');
  it('groups by month, sorted', () => {
    const t = computeTrend(all, p, 'month');
    expect(t.map(x => x.bucket)).toEqual(['2023-06', '2023-07']);
    expect(t[0].revenue).toBe(3000);
    expect(t[0].bookings).toBe(2);
    expect(t[1].revenue).toBe(500);
  });
});

describe('computeTrend week', () => {
  it('groups by ISO-ish week (Monday start)', () => {
    // 2023-06-05 は月曜。同週に 06-05, 06-11(日) が入り、06-12(月)は翌週
    const all = [r('2023-06-05', 100), r('2023-06-11', 200), r('2023-06-12', 300)];
    const p = resolvePeriod('2023', '2024-01-01');
    const t = computeTrend(all, p, 'week');
    expect(t).toHaveLength(2);
    expect(t[0].bucket).toBe('2023-06-05');
    expect(t[0].revenue).toBe(300);
    expect(t[1].bucket).toBe('2023-06-12');
    expect(t[1].revenue).toBe(300);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- trend`
Expected: FAIL

- [ ] **Step 3: trend.ts を実装**

`dashboard/src/metrics/trend.ts`:
```ts
import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod } from '../period.js';
import { ymOf } from '../util.js';

export interface TrendPoint { bucket: string; label: string; bookings: number; revenue: number; }

// その日を含む週の月曜日（JST暦日として計算）を 'YYYY-MM-DD' で返す
function weekStart(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=日
  const backToMon = (dow + 6) % 7; // 月=0,...,日=6
  d.setUTCDate(d.getUTCDate() - backToMon);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function computeTrend(all: HistoryRecord[], period: Period, granularity: 'month' | 'week'): TrendPoint[] {
  const recs = filterPeriod(all, period);
  const map = new Map<string, { bookings: number; revenue: number }>();
  for (const r of recs) {
    const bucket = granularity === 'month' ? ymOf(r.date) : weekStart(r.date);
    const cur = map.get(bucket) ?? { bookings: 0, revenue: 0 };
    cur.bookings += 1; cur.revenue += r.amount;
    map.set(bucket, cur);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([bucket, v]) => ({ bucket, label: bucket, bookings: v.bookings, revenue: v.revenue }));
}
```

- [ ] **Step 4: 通ることを確認**

Run: `cd dashboard && npm test -- trend && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: monthly/weekly trend aggregation"
```

---

## Task 11: metrics/heatmap — 月×曜日

**Files:**
- Create: `dashboard/src/metrics/heatmap.ts`
- Test: `dashboard/test/heatmap.test.ts`

**Interfaces:**
- Consumes: `HistoryRecord`、`Period`、`filterPeriod`、`monthOf`/`weekdayOf`（util）
- Produces:
  - `interface Heatmap { counts:number[][]; max:number }`（`counts[month-1][weekday]` = 件数。month 0-11, weekday 0=日〜6=土）
  - `computeHeatmap(all: HistoryRecord[], period: Period, course?: string): Heatmap`（course 指定時はそのコースのみ）
  - `courseList(all: HistoryRecord[], period: Period): string[]`（期間内に出現するコース名・件数降順）

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/heatmap.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeHeatmap, courseList } from '../src/metrics/heatmap.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string, course: string): HistoryRecord => ({ date, course, pax: 1, amount: 1, status: '参加済', phoneHash: '' });

describe('computeHeatmap', () => {
  const p = resolvePeriod('2023', '2024-01-01');
  it('bins by month and weekday', () => {
    // 2023-06-10 = 土(6), 6月 → counts[5][6]
    const h = computeHeatmap([r('2023-06-10', 'A'), r('2023-06-10', 'A')], p);
    expect(h.counts[5][6]).toBe(2);
    expect(h.max).toBe(2);
  });
  it('filters by course', () => {
    const h = computeHeatmap([r('2023-06-10', 'A'), r('2023-06-10', 'B')], p, 'A');
    expect(h.counts[5][6]).toBe(1);
  });
});

describe('courseList', () => {
  it('returns courses by frequency desc', () => {
    const p = resolvePeriod('2023', '2024-01-01');
    const list = courseList([r('2023-06-10', 'A'), r('2023-06-11', 'B'), r('2023-06-12', 'B')], p);
    expect(list).toEqual(['B', 'A']);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- heatmap`
Expected: FAIL

- [ ] **Step 3: heatmap.ts を実装**

`dashboard/src/metrics/heatmap.ts`:
```ts
import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod } from '../period.js';
import { monthOf, weekdayOf } from '../util.js';

export interface Heatmap { counts: number[][]; max: number; }

export function computeHeatmap(all: HistoryRecord[], period: Period, course?: string): Heatmap {
  const counts: number[][] = Array.from({ length: 12 }, () => Array(7).fill(0));
  let max = 0;
  for (const r of filterPeriod(all, period)) {
    if (course && r.course !== course) continue;
    const m = monthOf(r.date) - 1;
    const w = weekdayOf(r.date);
    counts[m][w] += 1;
    if (counts[m][w] > max) max = counts[m][w];
  }
  return { counts, max };
}

export function courseList(all: HistoryRecord[], period: Period): string[] {
  const freq = new Map<string, number>();
  for (const r of filterPeriod(all, period)) freq.set(r.course, (freq.get(r.course) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
```

- [ ] **Step 4: 通ることを確認**

Run: `cd dashboard && npm test -- heatmap && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: month x weekday heatmap + course list"
```

---

## Task 12: metrics/cohort — 初回月別リテンション

**Files:**
- Create: `dashboard/src/metrics/cohort.ts`
- Test: `dashboard/test/cohort.test.ts`

**Interfaces:**
- Consumes: `HistoryRecord`、`ymOf`/`monthsBetween`（util）、`firstVisitMap`（repeat.ts）
- Produces:
  - `interface CohortRow { cohort:string; size:number; retention:number[] }`（`retention[k]` = 初回から k ヶ月後に来訪した人数。k=0 は必ず size）
  - `computeCohorts(all: HistoryRecord[], maxOffset: number): CohortRow[]`（cohort 昇順。phoneHash 空は除外）

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/cohort.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeCohorts } from '../src/metrics/cohort.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string, phoneHash: string): HistoryRecord => ({ date, course: 'A', pax: 1, amount: 1, status: '参加済', phoneHash });

describe('computeCohorts', () => {
  it('buckets by first-visit month and counts return offsets', () => {
    const all = [
      r('2023-01-10', 'p1'), r('2023-03-10', 'p1'), // p1: 初回1月, 2ヶ月後に再訪
      r('2023-01-20', 'p2'),                        // p2: 初回1月のみ
      r('2023-02-05', 'p3'),                        // p3: 初回2月のみ
    ];
    const rows = computeCohorts(all, 3);
    const jan = rows.find(x => x.cohort === '2023-01')!;
    expect(jan.size).toBe(2);
    expect(jan.retention[0]).toBe(2); // 初月は全員
    expect(jan.retention[2]).toBe(1); // 2ヶ月後は p1 のみ
    const feb = rows.find(x => x.cohort === '2023-02')!;
    expect(feb.size).toBe(1);
    expect(feb.retention[0]).toBe(1);
  });
  it('ignores empty phoneHash', () => {
    expect(computeCohorts([r('2023-01-01', '')], 3)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- cohort`
Expected: FAIL

- [ ] **Step 3: cohort.ts を実装**

`dashboard/src/metrics/cohort.ts`:
```ts
import type { HistoryRecord } from '../types.js';
import { ymOf, monthsBetween } from '../util.js';
import { firstVisitMap } from '../repeat.js';

export interface CohortRow { cohort: string; size: number; retention: number[]; }

export function computeCohorts(all: HistoryRecord[], maxOffset: number): CohortRow[] {
  const first = firstVisitMap(all);
  // cohort(YYYY-MM) → offset → Set<phoneHash>
  const table = new Map<string, Map<number, Set<string>>>();
  const sizes = new Map<string, Set<string>>();

  for (const r of all) {
    if (!r.phoneHash) continue;
    const firstDate = first.get(r.phoneHash)!;
    const cohort = ymOf(firstDate);
    const offset = monthsBetween(ymOf(firstDate), ymOf(r.date));
    if (offset < 0 || offset > maxOffset) continue;
    (sizes.get(cohort) ?? sizes.set(cohort, new Set()).get(cohort)!).add(r.phoneHash);
    let byOffset = table.get(cohort);
    if (!byOffset) { byOffset = new Map(); table.set(cohort, byOffset); }
    (byOffset.get(offset) ?? byOffset.set(offset, new Set()).get(offset)!).add(r.phoneHash);
  }

  return [...table.keys()].sort().map(cohort => {
    const byOffset = table.get(cohort)!;
    const retention = Array.from({ length: maxOffset + 1 }, (_, k) => byOffset.get(k)?.size ?? 0);
    return { cohort, size: sizes.get(cohort)?.size ?? retention[0], retention };
  });
}
```

- [ ] **Step 4: 通ることを確認**

Run: `cd dashboard && npm test -- cohort && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: first-visit cohort retention"
```

---

## Task 13: metrics/course — コース別内訳

**Files:**
- Create: `dashboard/src/metrics/course.ts`
- Test: `dashboard/test/course.test.ts`

**Interfaces:**
- Consumes: `HistoryRecord`、`Period`、`filterPeriod`
- Produces:
  - `interface CourseRow { course:string; bookings:number; revenue:number; pax:number }`
  - `computeCourseBreakdown(all: HistoryRecord[], period: Period): CourseRow[]`（revenue 降順）

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/course.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeCourseBreakdown } from '../src/metrics/course.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (course: string, amount: number, pax: number): HistoryRecord =>
  ({ date: '2023-06-10', course, pax, amount, status: '参加済', phoneHash: '' });

describe('computeCourseBreakdown', () => {
  it('aggregates and sorts by revenue desc', () => {
    const p = resolvePeriod('2023', '2024-01-01');
    const rows = computeCourseBreakdown([r('A', 1000, 1), r('B', 5000, 2), r('A', 2000, 1)], p);
    expect(rows[0].course).toBe('B');
    expect(rows[1].course).toBe('A');
    expect(rows[1].bookings).toBe(2);
    expect(rows[1].revenue).toBe(3000);
    expect(rows[1].pax).toBe(2);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- course`
Expected: FAIL

- [ ] **Step 3: course.ts を実装**

`dashboard/src/metrics/course.ts`:
```ts
import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod } from '../period.js';

export interface CourseRow { course: string; bookings: number; revenue: number; pax: number; }

export function computeCourseBreakdown(all: HistoryRecord[], period: Period): CourseRow[] {
  const map = new Map<string, CourseRow>();
  for (const r of filterPeriod(all, period)) {
    const cur = map.get(r.course) ?? { course: r.course, bookings: 0, revenue: 0, pax: 0 };
    cur.bookings += 1; cur.revenue += r.amount; cur.pax += r.pax;
    map.set(r.course, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
```

- [ ] **Step 4: 通ることを確認**

Run: `cd dashboard && npm test -- course && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: course breakdown"
```

---

## Task 14: weather — Open-Meteo 取得と天候相関

**Files:**
- Create: `dashboard/src/weather.ts`
- Create: `dashboard/src/metrics/weatherjoin.ts`
- Test: `dashboard/test/weather.test.ts`

**Interfaces:**
- Consumes: `KV`、`HistoryRecord`、`Period`、`filterPeriod`
- Produces:
  - `type WxCategory = '晴'|'曇'|'雨'|'雪'`
  - `classifyWeather(code: number): WxCategory`
  - `interface DayWeather { date:string; category:WxCategory; tempMax:number; precip:number }`
  - `fetchWeather(kv: KV, start: string, end: string, fetchImpl?: typeof fetch): Promise<Map<string, DayWeather>>`（DASH KV キャッシュ・キー `wx:${start}:${end}`・TTL 30日）
  - `interface WeatherJoin { rainyAvg:number; dryAvg:number; dropPct:number|null; byCategory:{category:WxCategory; days:number; avgBookings:number}[] }`
  - `computeWeatherJoin(all: HistoryRecord[], period: Period, wx: Map<string, DayWeather>): WeatherJoin`

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/weather.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { classifyWeather, fetchWeather, computeWeatherJoin, type DayWeather } from '../src/weather.js';
import { computeWeatherJoin as _cwj } from '../src/metrics/weatherjoin.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

function fakeKV() {
  const m = new Map<string, string>();
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async () => {}, list: async () => ({ keys: [] }) };
}

describe('classifyWeather', () => {
  it('maps WMO codes', () => {
    expect(classifyWeather(0)).toBe('晴');
    expect(classifyWeather(3)).toBe('曇');
    expect(classifyWeather(63)).toBe('雨');
    expect(classifyWeather(73)).toBe('雪');
  });
});

describe('fetchWeather', () => {
  it('fetches, parses, and caches', async () => {
    const kv = fakeKV();
    const body = { daily: { time: ['2023-06-10', '2023-06-11'], weathercode: [0, 63], temperature_2m_max: [25, 20], precipitation_sum: [0, 12] } };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch;
    const wx = await fetchWeather(kv, '2023-06-10', '2023-06-11', fetchImpl);
    expect(wx.get('2023-06-10')?.category).toBe('晴');
    expect(wx.get('2023-06-11')?.precip).toBe(12);
    // 2回目はキャッシュから（fetch は呼ばれない）
    const fetch2 = vi.fn() as unknown as typeof fetch;
    const wx2 = await fetchWeather(kv, '2023-06-10', '2023-06-11', fetch2);
    expect((fetch2 as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(wx2.get('2023-06-11')?.category).toBe('雨');
  });
});

describe('weatherjoin', () => {
  it('computes rainy vs dry average bookings and drop%', () => {
    const p = resolvePeriod('2023', '2024-01-01');
    const recs: HistoryRecord[] = [
      { date: '2023-06-10', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' }, // 晴の日 2件
      { date: '2023-06-10', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' },
      { date: '2023-06-11', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' }, // 雨の日 1件
    ];
    const wx = new Map<string, DayWeather>([
      ['2023-06-10', { date: '2023-06-10', category: '晴', tempMax: 25, precip: 0 }],
      ['2023-06-11', { date: '2023-06-11', category: '雨', tempMax: 20, precip: 12 }],
    ]);
    const j = _cwj(recs, p, wx);
    expect(j.dryAvg).toBeCloseTo(2);   // 晴/曇 日は 1日で 2件
    expect(j.rainyAvg).toBeCloseTo(1); // 雨/雪 日は 1日で 1件
    expect(j.dropPct).toBeCloseTo(0.5); // (2-1)/2
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- weather`
Expected: FAIL

- [ ] **Step 3: weather.ts を実装**

`dashboard/src/weather.ts`:
```ts
import type { KV } from './kv.js';

export type WxCategory = '晴' | '曇' | '雨' | '雪';
export interface DayWeather { date: string; category: WxCategory; tempMax: number; precip: number; }

// WMO weather code → 大分類
export function classifyWeather(code: number): WxCategory {
  if (code === 0 || code === 1) return '晴';
  if (code === 2 || code === 3 || (code >= 45 && code <= 48)) return '曇';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '雪';
  return '雨'; // 51-67, 80-82, 95-99 等
}

const LAT = 36.73, LON = 139.48;
const CACHE_TTL = 30 * 24 * 3600;

export async function fetchWeather(kv: KV, start: string, end: string, fetchImpl: typeof fetch = fetch): Promise<Map<string, DayWeather>> {
  const cacheKey = `wx:${start}:${end}`;
  const cached = await kv.get(cacheKey);
  if (cached) return new Map(Object.entries(JSON.parse(cached) as Record<string, DayWeather>));

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}`
    + `&start_date=${start}&end_date=${end}`
    + `&daily=weathercode,temperature_2m_max,precipitation_sum&timezone=Asia%2FTokyo`;
  const resp = await fetchImpl(url);
  if (!resp.ok) throw new Error(`weather fetch failed: HTTP ${resp.status}`);
  const body = await resp.json() as { daily?: { time: string[]; weathercode: number[]; temperature_2m_max: number[]; precipitation_sum: number[] } };
  const d = body.daily;
  const out: Record<string, DayWeather> = {};
  if (d) {
    for (let i = 0; i < d.time.length; i++) {
      out[d.time[i]] = { date: d.time[i], category: classifyWeather(d.weathercode[i]), tempMax: d.temperature_2m_max[i], precip: d.precipitation_sum[i] };
    }
  }
  await kv.put(cacheKey, JSON.stringify(out), { expirationTtl: CACHE_TTL });
  return new Map(Object.entries(out));
}

// re-export（呼び出し側の利便）
export { computeWeatherJoin } from './metrics/weatherjoin.js';
```

- [ ] **Step 4: weatherjoin.ts を実装**

`dashboard/src/metrics/weatherjoin.ts`:
```ts
import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod } from '../period.js';
import type { DayWeather, WxCategory } from '../weather.js';

export interface WeatherJoin {
  rainyAvg: number; dryAvg: number; dropPct: number | null;
  byCategory: { category: WxCategory; days: number; avgBookings: number }[];
}

export function computeWeatherJoin(all: HistoryRecord[], period: Period, wx: Map<string, DayWeather>): WeatherJoin {
  // 日別件数
  const perDay = new Map<string, number>();
  for (const r of filterPeriod(all, period)) perDay.set(r.date, (perDay.get(r.date) ?? 0) + 1);

  const cats: WxCategory[] = ['晴', '曇', '雨', '雪'];
  const agg = new Map<WxCategory, { days: number; bookings: number }>();
  for (const c of cats) agg.set(c, { days: 0, bookings: 0 });

  // 天候データがある日のみ対象（予約0の日も days に数える）
  for (const [date, w] of wx) {
    if (date < period.start || date > period.end) continue;
    const a = agg.get(w.category)!;
    a.days += 1; a.bookings += perDay.get(date) ?? 0;
  }

  const byCategory = cats.map(c => {
    const a = agg.get(c)!;
    return { category: c, days: a.days, avgBookings: a.days ? a.bookings / a.days : 0 };
  });

  const dry = ['晴', '曇'].reduce((s, c) => { const a = agg.get(c as WxCategory)!; return { days: s.days + a.days, bookings: s.bookings + a.bookings }; }, { days: 0, bookings: 0 });
  const rain = ['雨', '雪'].reduce((s, c) => { const a = agg.get(c as WxCategory)!; return { days: s.days + a.days, bookings: s.bookings + a.bookings }; }, { days: 0, bookings: 0 });
  const dryAvg = dry.days ? dry.bookings / dry.days : 0;
  const rainyAvg = rain.days ? rain.bookings / rain.days : 0;
  const dropPct = dryAvg ? (dryAvg - rainyAvg) / dryAvg : null;

  return { rainyAvg, dryAvg, dropPct, byCategory };
}
```

- [ ] **Step 5: 通ることを確認**

Run: `cd dashboard && npm test -- weather && npm run typecheck`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: Open-Meteo weather fetch + booking/weather correlation"
```

---

## Task 15: metrics/insights — 決定論的な戦略示唆

**Files:**
- Create: `dashboard/src/metrics/insights.ts`
- Test: `dashboard/test/insights.test.ts`

**Interfaces:**
- Consumes: `Kpi`（kpi.ts）、`Heatmap`（heatmap.ts）、`WeatherJoin`（weatherjoin.ts）、`TrendPoint`（trend.ts）
- Produces: `buildInsights(input: { kpi: Kpi; heatmap: Heatmap; weather: WeatherJoin; trend: TrendPoint[] }): string[]`

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/insights.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildInsights } from '../src/metrics/insights.js';

describe('buildInsights', () => {
  it('mentions repeat rate and YoY when present', () => {
    const out = buildInsights({
      kpi: { bookings: 100, revenue: 1000000, avgPerBooking: 10000, pax: 200, newCount: 70, repeatCount: 30, repeatRate: 0.3, yoyRevenue: 1.2, yoyBookings: 1.1 },
      heatmap: { counts: Array.from({ length: 12 }, () => Array(7).fill(0)), max: 0 },
      weather: { rainyAvg: 1, dryAvg: 2, dropPct: 0.5, byCategory: [] },
      trend: [],
    });
    expect(out.some(s => s.includes('リピート率'))).toBe(true);
    expect(out.some(s => s.includes('前年'))).toBe(true);
    expect(out.some(s => s.includes('雨'))).toBe(true);
  });
  it('omits YoY line when null', () => {
    const out = buildInsights({
      kpi: { bookings: 10, revenue: 100, avgPerBooking: 10, pax: 10, newCount: 10, repeatCount: 0, repeatRate: 0, yoyRevenue: null, yoyBookings: null },
      heatmap: { counts: Array.from({ length: 12 }, () => Array(7).fill(0)), max: 0 },
      weather: { rainyAvg: 0, dryAvg: 0, dropPct: null, byCategory: [] },
      trend: [],
    });
    expect(out.some(s => s.includes('前年'))).toBe(false);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- insights`
Expected: FAIL

- [ ] **Step 3: insights.ts を実装**

`dashboard/src/metrics/insights.ts`:
```ts
import type { Kpi } from './kpi.js';
import type { Heatmap } from './heatmap.js';
import type { WeatherJoin } from './weatherjoin.js';
import type { TrendPoint } from './trend.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function buildInsights(input: { kpi: Kpi; heatmap: Heatmap; weather: WeatherJoin; trend: TrendPoint[] }): string[] {
  const { kpi, heatmap, weather } = input;
  const out: string[] = [];

  out.push(`期間の予約 ${kpi.bookings} 件・売上 ${kpi.revenue.toLocaleString()} 円（客単価 ${kpi.avgPerBooking.toLocaleString()} 円）。`);
  out.push(`リピート率は ${pct(kpi.repeatRate)}（新規 ${kpi.newCount} / リピート ${kpi.repeatCount}）。`);

  if (kpi.yoyRevenue !== null) {
    const diff = kpi.yoyRevenue - 1;
    const dir = diff >= 0 ? `+${pct(diff)}` : `-${pct(-diff)}`;
    out.push(`売上は前年同期比 ${dir}。`);
  }

  // 曜日の偏り（全曜日合計）
  const byWeekday = Array(7).fill(0);
  for (let m = 0; m < 12; m++) for (let w = 0; w < 7; w++) byWeekday[w] += heatmap.counts[m][w];
  const total = byWeekday.reduce((a, b) => a + b, 0);
  if (total > 0) {
    const maxW = byWeekday.indexOf(Math.max(...byWeekday));
    const avg = total / 7;
    if (byWeekday[maxW] > avg) {
      out.push(`最も予約が多い曜日は ${WD[maxW]}曜（平均比 +${pct(byWeekday[maxW] / avg - 1)}）。`);
    }
  }

  if (weather.dropPct !== null && weather.dryAvg > 0) {
    out.push(`雨・雪の日は晴・曇の日より平均 -${pct(weather.dropPct)}（雨天 ${weather.rainyAvg.toFixed(1)} 件/日 vs 好天 ${weather.dryAvg.toFixed(1)} 件/日）。`);
  }

  return out;
}
```

- [ ] **Step 4: 通ることを確認**

Run: `cd dashboard && npm test -- insights && npm run typecheck`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: deterministic strategy insights"
```

---

## Task 16: charts — SVG 基盤・棒・折れ線

**Files:**
- Create: `dashboard/src/charts/svg.ts`
- Create: `dashboard/src/charts/bar.ts`
- Create: `dashboard/src/charts/line.ts`
- Test: `dashboard/test/charts.test.ts`

**Interfaces:**
- Consumes: `TrendPoint`（trend.ts）、`CourseRow`（course.ts）
- Produces:
  - svg: `svgOpen(w:number,h:number):string`、`svgClose():string`、`scaleY(v:number,max:number,top:number,height:number):number`、`escXml(s:string):string`
  - bar: `renderCourseBars(rows: CourseRow[]): string`（SVG文字列）
  - line: `renderTrendChart(points: TrendPoint[]): string`（売上の棒＋件数の折れ線の複合。SVG文字列）

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/charts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { escXml, scaleY } from '../src/charts/svg.js';
import { renderCourseBars } from '../src/charts/bar.js';
import { renderTrendChart } from '../src/charts/line.js';

describe('svg helpers', () => {
  it('escapes xml', () => { expect(escXml('a&b<c>')).toBe('a&amp;b&lt;c&gt;'); });
  it('scaleY maps max to top', () => { expect(scaleY(10, 10, 20, 100)).toBe(20); expect(scaleY(0, 10, 20, 100)).toBe(120); });
});

describe('renderCourseBars', () => {
  it('produces an svg with a rect per course', () => {
    const svg = renderCourseBars([
      { course: 'A', bookings: 2, revenue: 3000, pax: 2 },
      { course: 'B', bookings: 1, revenue: 5000, pax: 2 },
    ]);
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain('A');
    expect(svg).toContain('B');
  });
  it('handles empty input', () => {
    expect(renderCourseBars([]).startsWith('<svg')).toBe(true);
  });
});

describe('renderTrendChart', () => {
  it('produces an svg with a polyline for counts', () => {
    const svg = renderTrendChart([
      { bucket: '2023-06', label: '2023-06', bookings: 2, revenue: 3000 },
      { bucket: '2023-07', label: '2023-07', bookings: 1, revenue: 500 },
    ]);
    expect(svg).toContain('<polyline');
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- charts`
Expected: FAIL

- [ ] **Step 3: svg.ts を実装**

`dashboard/src/charts/svg.ts`:
```ts
export function escXml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
export function svgOpen(w: number, h: number): string {
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">`;
}
export function svgClose(): string { return '</svg>'; }
// 値 v(0..max) を、上端 top・高さ height の描画領域内の y 座標へ写す（v=max → top、v=0 → top+height）
export function scaleY(v: number, max: number, top: number, height: number): number {
  if (max <= 0) return top + height;
  return top + height - (v / max) * height;
}
```

- [ ] **Step 4: bar.ts を実装**

`dashboard/src/charts/bar.ts`:
```ts
import type { CourseRow } from '../metrics/course.js';
import { svgOpen, svgClose, escXml } from './svg.js';

export function renderCourseBars(rows: CourseRow[]): string {
  const W = 640, rowH = 30, pad = 8, labelW = 140, barMax = W - labelW - 90;
  const H = Math.max(rowH, rows.length * rowH) + pad * 2;
  const max = rows.reduce((m, r) => Math.max(m, r.revenue), 0);
  let s = svgOpen(W, H);
  rows.forEach((r, i) => {
    const y = pad + i * rowH;
    const w = max ? Math.max(1, (r.revenue / max) * barMax) : 0;
    s += `<text x="0" y="${y + 18}" font-size="12" fill="#1f2937">${escXml(r.course.slice(0, 12))}</text>`;
    s += `<rect x="${labelW}" y="${y + 6}" width="${w}" height="16" rx="3" fill="#1e3a5f"/>`;
    s += `<text x="${labelW + w + 6}" y="${y + 18}" font-size="11" fill="#6b7280">${r.revenue.toLocaleString()}円 / ${r.bookings}件</text>`;
  });
  return s + svgClose();
}
```

- [ ] **Step 5: line.ts を実装**

`dashboard/src/charts/line.ts`:
```ts
import type { TrendPoint } from '../metrics/trend.js';
import { svgOpen, svgClose, escXml, scaleY } from './svg.js';

export function renderTrendChart(points: TrendPoint[]): string {
  const W = 720, H = 240, top = 20, bottom = 40, left = 8, right = 8;
  const plotH = H - top - bottom, plotW = W - left - right;
  const revMax = points.reduce((m, p) => Math.max(m, p.revenue), 0);
  const cntMax = points.reduce((m, p) => Math.max(m, p.bookings), 0);
  const n = points.length;
  const step = n > 0 ? plotW / n : plotW;
  const barW = Math.max(2, step * 0.6);

  let s = svgOpen(W, H);
  // 売上の棒
  points.forEach((p, i) => {
    const x = left + i * step + (step - barW) / 2;
    const y = scaleY(p.revenue, revMax, top, plotH);
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${(top + plotH - y).toFixed(1)}" fill="#c7d2e0"/>`;
  });
  // 件数の折れ線
  const pts = points.map((p, i) => {
    const x = left + i * step + step / 2;
    const y = scaleY(p.bookings, cntMax, top, plotH);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  if (n > 0) s += `<polyline points="${pts}" fill="none" stroke="#1e3a5f" stroke-width="2"/>`;
  // x 軸ラベル（間引き）
  const labelEvery = Math.ceil(n / 12) || 1;
  points.forEach((p, i) => {
    if (i % labelEvery !== 0) return;
    const x = left + i * step + step / 2;
    s += `<text x="${x.toFixed(1)}" y="${H - 8}" font-size="10" fill="#6b7280" text-anchor="middle">${escXml(p.label.slice(5))}</text>`;
  });
  return s + svgClose();
}
```

- [ ] **Step 6: 通ることを確認**

Run: `cd dashboard && npm test -- charts && npm run typecheck`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: SVG helpers, course bars, trend combo chart"
```

---

## Task 17: charts — ヒートマップ・コホート格子

**Files:**
- Create: `dashboard/src/charts/heatmap.ts`
- Create: `dashboard/src/charts/cohortgrid.ts`
- Test: `dashboard/test/charts2.test.ts`

**Interfaces:**
- Consumes: `Heatmap`（heatmap.ts）、`CohortRow`（cohort.ts）
- Produces:
  - `renderHeatmap(h: Heatmap): string`（12行×7列のセル。色の濃さ = count/max）
  - `renderCohortGrid(rows: CohortRow[]): string`（cohort×offset のリテンション率セル）

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/charts2.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderHeatmap } from '../src/charts/heatmap.js';
import { renderCohortGrid } from '../src/charts/cohortgrid.js';

describe('renderHeatmap', () => {
  it('renders 84 cells', () => {
    const counts = Array.from({ length: 12 }, () => Array(7).fill(1));
    const svg = renderHeatmap({ counts, max: 1 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/<rect/g) ?? []).length).toBe(84);
  });
  it('handles max=0 without crashing', () => {
    const counts = Array.from({ length: 12 }, () => Array(7).fill(0));
    expect(renderHeatmap({ counts, max: 0 }).startsWith('<svg')).toBe(true);
  });
});

describe('renderCohortGrid', () => {
  it('renders a row per cohort with percentage text', () => {
    const svg = renderCohortGrid([{ cohort: '2023-01', size: 4, retention: [4, 2, 1] }]);
    expect(svg).toContain('2023-01');
    expect(svg).toContain('%');
  });
  it('handles empty', () => {
    expect(renderCohortGrid([]).startsWith('<svg')).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- charts2`
Expected: FAIL

- [ ] **Step 3: heatmap.ts を実装**

`dashboard/src/charts/heatmap.ts`:
```ts
import type { Heatmap } from '../metrics/heatmap.js';
import { svgOpen, svgClose } from './svg.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

export function renderHeatmap(h: Heatmap): string {
  const cell = 34, labelW = 36, labelH = 20;
  const W = labelW + 7 * cell, H = labelH + 12 * cell;
  let s = svgOpen(W, H);
  // 曜日ヘッダ
  for (let w = 0; w < 7; w++) {
    s += `<text x="${labelW + w * cell + cell / 2}" y="14" font-size="11" fill="#6b7280" text-anchor="middle">${WD[w]}</text>`;
  }
  for (let m = 0; m < 12; m++) {
    s += `<text x="0" y="${labelH + m * cell + cell / 2 + 4}" font-size="11" fill="#6b7280">${m + 1}月</text>`;
    for (let w = 0; w < 7; w++) {
      const c = h.counts[m][w];
      const t = h.max > 0 ? c / h.max : 0;
      const fill = c === 0 ? '#f1f3f5' : `rgba(30,58,95,${(0.15 + 0.85 * t).toFixed(2)})`;
      const x = labelW + w * cell, y = labelH + m * cell;
      s += `<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="${fill}"><title>${m + 1}月 ${WD[w]}: ${c}件</title></rect>`;
      if (c > 0) s += `<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" font-size="10" fill="${t > 0.5 ? '#fff' : '#1f2937'}" text-anchor="middle">${c}</text>`;
    }
  }
  return s + svgClose();
}
```

- [ ] **Step 4: cohortgrid.ts を実装**

`dashboard/src/charts/cohortgrid.ts`:
```ts
import type { CohortRow } from '../metrics/cohort.js';
import { svgOpen, svgClose, escXml } from './svg.js';

export function renderCohortGrid(rows: CohortRow[]): string {
  const labelW = 78, cellW = 46, cellH = 26, headH = 22;
  const offsets = rows.reduce((m, r) => Math.max(m, r.retention.length), 0);
  const W = labelW + Math.max(1, offsets) * cellW, H = headH + Math.max(1, rows.length) * cellH;
  let s = svgOpen(W, H);
  for (let k = 0; k < offsets; k++) {
    s += `<text x="${labelW + k * cellW + cellW / 2}" y="15" font-size="10" fill="#6b7280" text-anchor="middle">+${k}m</text>`;
  }
  rows.forEach((r, i) => {
    const y = headH + i * cellH;
    s += `<text x="0" y="${y + cellH / 2 + 4}" font-size="11" fill="#1f2937">${escXml(r.cohort)}(${r.size})</text>`;
    r.retention.forEach((v, k) => {
      const rate = r.size ? v / r.size : 0;
      const x = labelW + k * cellW;
      const fill = k === 0 ? '#1e3a5f' : `rgba(30,58,95,${(0.1 + 0.9 * rate).toFixed(2)})`;
      s += `<rect x="${x + 1}" y="${y + 1}" width="${cellW - 2}" height="${cellH - 2}" rx="3" fill="${fill}"/>`;
      s += `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4}" font-size="10" fill="${rate > 0.5 || k === 0 ? '#fff' : '#1f2937'}" text-anchor="middle">${Math.round(rate * 100)}%</text>`;
    });
  });
  return s + svgClose();
}
```

- [ ] **Step 5: 通ることを確認**

Run: `cd dashboard && npm test -- charts2 && npm run typecheck`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: heatmap and cohort retention grid SVGs"
```

---

## Task 18: pages — ダッシュボード組み立てと配線

**Files:**
- Modify: `dashboard/src/pages.ts`
- Modify: `dashboard/src/handlers.ts`
- Modify: `dashboard/src/index.ts`
- Test: `dashboard/test/dashboard.test.ts`

**Interfaces:**
- Consumes: 全 metrics・charts・`getHistory`・`resolvePeriod`・`fetchWeather`・`jstToday`
- Produces:
  - `renderDashboard(data: { period: Period; kpi: Kpi; trend: TrendPoint[]; heatmap: Heatmap; courses: string[]; selectedCourse: string; cohorts: CohortRow[]; courseRows: CourseRow[]; weather: WeatherJoin; insights: string[]; granularity: 'month'|'week' }): string`（pages.ts）
  - `handleHome(url: URL, env: Env, username: string): Promise<Response>` を本実装に差し替え

- [ ] **Step 1: 失敗するテストを書く**

`dashboard/test/dashboard.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import worker, { type Env } from '../src/index.js';
import { createSession } from '../src/auth.js';
import type { HistoryRecord } from '../src/types.js';

function fakeKV(seed?: Record<string, string>) {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async (k: string) => { m.delete(k); }, list: async () => ({ keys: [] }) };
}

const history: HistoryRecord[] = [
  { date: '2024-06-08', course: 'SUP体験', pax: 2, amount: 12000, status: '参加済', phoneHash: 'p1' },
  { date: '2024-06-15', course: 'SUP体験', pax: 1, amount: 8000, status: '参加済', phoneHash: 'p2' },
  { date: '2023-06-10', course: 'ロングSUP', pax: 2, amount: 15000, status: '参加済', phoneHash: 'p1' },
];

describe('dashboard rendering', () => {
  it('renders KPI, charts, and insights for an authed user', async () => {
    const env: Env = {
      DATA: fakeKV({ 'history:latest': JSON.stringify(history) }),
      DASH: fakeKV(),
      ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret',
    };
    // 天候 fetch をスタブ（グローバル fetch）
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily: { time: [], weathercode: [], temperature_2m_max: [], precipitation_sum: [] } }) }));
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const cookie = `sess=${await createSession({ username: 'admin', exp }, 'secret')}`;
    const res = await worker.fetch(new Request('https://x/?period=all', { headers: { cookie } }), env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('KPI');
    expect(html).toContain('<svg');
    expect(html).toContain('コース');
    vi.restoreAllMocks();
  });
});
```

- [ ] **Step 2: 失敗を確認**

Run: `cd dashboard && npm test -- dashboard`
Expected: FAIL

- [ ] **Step 3: pages.ts に renderDashboard を追加**

`dashboard/src/pages.ts` の末尾に追加（既存 `layout`/`esc` を再利用）:
```ts
import type { Period } from './period.js';
import type { Kpi } from './metrics/kpi.js';
import type { TrendPoint } from './metrics/trend.js';
import type { Heatmap } from './metrics/heatmap.js';
import type { CohortRow } from './metrics/cohort.js';
import type { CourseRow } from './metrics/course.js';
import type { WeatherJoin } from './metrics/weatherjoin.js';
import { renderTrendChart } from './charts/line.js';
import { renderCourseBars } from './charts/bar.js';
import { renderHeatmap } from './charts/heatmap.js';
import { renderCohortGrid } from './charts/cohortgrid.js';

const yen = (n: number) => `${n.toLocaleString()}円`;
function yoyLabel(v: number | null): string {
  if (v === null) return '—';
  const d = v - 1;
  return d >= 0 ? `+${Math.round(d * 100)}%` : `-${Math.round(-d * 100)}%`;
}
function kpiCard(label: string, value: string, sub = ''): string {
  return `<div style="flex:1;min-width:130px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px">
<div style="font-size:12px;color:var(--muted)">${esc(label)}</div>
<div style="font-size:20px;font-weight:700;margin-top:4px">${esc(value)}</div>
${sub ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(sub)}</div>` : ''}</div>`;
}

export interface DashboardData {
  period: Period; kpi: Kpi; trend: TrendPoint[]; heatmap: Heatmap;
  courses: string[]; selectedCourse: string; cohorts: CohortRow[];
  courseRows: CourseRow[]; weather: WeatherJoin; insights: string[];
  granularity: 'month' | 'week';
}

function periodSelect(period: Period): string {
  const years = [2024, 2023, 2022, 2021, 2020];
  const opt = (v: string, label: string, sel: boolean) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  const cur = period.kind === 'year' ? period.start.slice(0, 4) : period.kind;
  return `<form method="get" style="display:flex;gap:8px;align-items:center">
<label style="margin:0">期間</label>
<select name="period" onchange="this.form.submit()">
${opt('last12', '直近12ヶ月', cur === 'last12')}
${opt('all', '全期間', cur === 'all')}
${years.map(y => opt(String(y), `${y}年`, cur === String(y))).join('')}
</select></form>`;
}

export function renderDashboard(d: DashboardData): string {
  const k = d.kpi;
  const kpis = [
    kpiCard('予約件数', `${k.bookings}件`, `前年比 ${yoyLabel(k.yoyBookings)}`),
    kpiCard('売上', yen(k.revenue), `前年比 ${yoyLabel(k.yoyRevenue)}`),
    kpiCard('客単価', yen(k.avgPerBooking)),
    kpiCard('参加人数', `${k.pax}名`),
    kpiCard('リピート率', `${Math.round(k.repeatRate * 100)}%`, `新規${k.newCount} / リピート${k.repeatCount}`),
  ].join('');

  const courseOpts = ['<option value="">全コース</option>']
    .concat(d.courses.map(c => `<option value="${esc(c)}"${c === d.selectedCourse ? ' selected' : ''}>${esc(c)}</option>`))
    .join('');

  const insightList = d.insights.map(s => `<li style="margin:4px 0">${esc(s)}</li>`).join('');

  const body = `<header>Sup! Sup! マーケ分析ダッシュボード <a href="/logout" style="color:#cbd5e1;font-size:12px;float:right">ログアウト</a></header>
<main>
<div class="card" style="display:flex;justify-content:space-between;align-items:center">${periodSelect(d.period)}<span style="font-size:12px;color:var(--muted)">${esc(d.period.label)}</span></div>

<div class="card"><h2>KPI サマリー</h2><div style="display:flex;gap:10px;flex-wrap:wrap">${kpis}</div></div>

<div class="card"><h2>戦略インサイト</h2><ul style="margin:0;padding-left:18px;font-size:14px">${insightList}</ul></div>

<div class="card"><h2>売上・予約トレンド（棒=売上 / 線=件数）</h2>${renderTrendChart(d.trend)}</div>

<div class="card"><h2>季節 × 曜日ヒートマップ</h2>
<form method="get" style="margin-bottom:8px">
<input type="hidden" name="period" value="${d.period.kind === 'year' ? d.period.start.slice(0, 4) : d.period.kind}">
<select name="course" onchange="this.form.submit()">${courseOpts}</select>
</form>${renderHeatmap(d.heatmap)}</div>

<div class="card"><h2>天候相関</h2>${renderWeatherBlock(d.weather)}</div>

<div class="card"><h2>リピーター・コホート再訪率（初回月別）</h2>${renderCohortGrid(d.cohorts)}</div>

<div class="card"><h2>コース別内訳</h2>${renderCourseBars(d.courseRows)}</div>
</main>`;
  return layout('ダッシュボード｜Sup! Sup! マーケ分析', body);
}

function renderWeatherBlock(w: WeatherJoin): string {
  const rows = w.byCategory.map(c =>
    `<tr><td style="padding:2px 10px">${esc(c.category)}</td><td style="padding:2px 10px;text-align:right">${c.days}日</td><td style="padding:2px 10px;text-align:right">${c.avgBookings.toFixed(1)}件/日</td></tr>`
  ).join('');
  const drop = w.dropPct !== null ? `雨・雪の日は好天比 <b>-${Math.round(w.dropPct * 100)}%</b>` : '天候データが不足しています';
  return `<p style="font-size:14px;margin:0 0 8px">${drop}</p>
<table style="font-size:13px;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:2px 10px">天候</th><th style="padding:2px 10px">日数</th><th style="padding:2px 10px">平均予約</th></tr></thead><tbody>${rows}</tbody></table>`;
}
```

- [ ] **Step 4: handlers.ts の handleHome を本実装に差し替え**

`dashboard/src/handlers.ts` の import を追加:
```ts
import { renderDashboard } from './pages.js';
import { getHistory } from './data.js';
import { resolvePeriod } from './period.js';
import { jstToday } from './util.js';
import { computeKpi } from './metrics/kpi.js';
import { computeTrend } from './metrics/trend.js';
import { computeHeatmap, courseList } from './metrics/heatmap.js';
import { computeCohorts } from './metrics/cohort.js';
import { computeCourseBreakdown } from './metrics/course.js';
import { fetchWeather } from './weather.js';
import { computeWeatherJoin } from './metrics/weatherjoin.js';
import { buildInsights } from './metrics/insights.js';
```

既存の暫定 `handleHome` を次で置き換え:
```ts
export async function handleHome(url: URL, env: Env, _username: string): Promise<Response> {
  const period = resolvePeriod(url.searchParams.get('period'), jstToday());
  const selectedCourse = url.searchParams.get('course') ?? '';
  const gran = url.searchParams.get('g') === 'week' ? 'week' : 'month';

  const all = await getHistory(env.DATA);
  const kpi = computeKpi(all, period);
  const trend = computeTrend(all, period, gran);
  const heatmap = computeHeatmap(all, period, selectedCourse || undefined);
  const courses = courseList(all, period);
  const cohorts = computeCohorts(all, 12);
  const courseRows = computeCourseBreakdown(all, period);

  // 天候は失敗してもダッシュボードは描画する
  let weather = { rainyAvg: 0, dryAvg: 0, dropPct: null, byCategory: [] as WeatherJoinCat[] };
  try {
    const wx = await fetchWeather(env.DASH, period.start, period.end);
    weather = computeWeatherJoin(all, period, wx);
  } catch { /* 天候取得失敗時は空表示 */ }

  const insights = buildInsights({ kpi, heatmap, weather, trend });

  return html(renderDashboard({
    period, kpi, trend, heatmap, courses, selectedCourse, cohorts, courseRows, weather, insights, granularity: gran,
  }));
}
```

`handlers.ts` 冒頭付近に補助型を追加（`weather` 変数の型注釈用）:
```ts
import type { WxCategory } from './weather.js';
type WeatherJoinCat = { category: WxCategory; days: number; avgBookings: number };
```

- [ ] **Step 5: index.ts の handleHome 呼び出しは既に存在（Task 3）。追加不要を確認**

`dashboard/src/index.ts` の `if (path === '/' && method === 'GET') return handleHome(url, env, user.username);` がそのまま使える。変更なし。

- [ ] **Step 6: 通ることを確認**

Run: `cd dashboard && npm test && npm run typecheck`
Expected: PASS（全テスト）

- [ ] **Step 7: コミット**

```bash
cd dashboard && git add -A && git commit -m "feat: assemble full dashboard page and wire metrics"
```

---

## Task 19: ローカル E2E 検証とデプロイ手順

**Files:**
- Create: `dashboard/README.md`
- Create: `dashboard/.dev.vars`（コミットしない。`.gitignore` 済み）

**Interfaces:**
- Consumes: 完成した Worker
- Produces: 手動検証手順・デプロイ手順のドキュメント

- [ ] **Step 1: `.dev.vars` を作成（ローカル検証用・コミット禁止）**

`dashboard/.dev.vars`:
```
ADMIN_USER=admin
ADMIN_PASSWORD=localtest
SESSION_SECRET=local-dev-secret-please-change
```

- [ ] **Step 2: ローカル起動と履歴データ投入**

このプロジェクトには `/ingest-history` が無い（それは web 側）。ローカル検証は **web を起動して `/ingest-history` に投入 → dashboard を同じローカル KV に向ける** のが理想だが、簡易には dashboard の `wrangler dev --local` の KV に直接 seed する:

```bash
cd dashboard
npx wrangler dev --local &
# 別シェルで、Miniflare のローカル KV に history:latest を書く代わりに、
# 検証用の最小データを DASH ではなく DATA namespace に入れる。
# 手軽には test/dashboard.test.ts が実データ経路を担保しているため、
# ここではブラウザ表示の目視確認を主目的とする。
```

推奨する目視確認フロー（`.claude/launch.json` の preview 経由）:
1. `wrangler dev` を起動。
2. ブラウザで `http://127.0.0.1:8787/` → ログイン画面が出る。
3. `admin` / `localtest` でログイン → ダッシュボードが表示される（データ空でもクラッシュしないこと）。
4. KPI・各SVG（トレンド/ヒートマップ/コホート/コース）・インサイトの各カードが表示されることを確認。

- [ ] **Step 3: 実データでの結合確認（sync→web→dashboard）**

本番反映後の確認:
1. sync を Run workflow（履歴スイープが走る JST 3時台、または手動フル実行）→ `[sync] history published N records` がログに出る。
2. web は `history:latest` を保存済み。
3. dashboard を `npx wrangler deploy` → `https://supsup-dashboard.<subdomain>.workers.dev/` にログインして各カードに実データが出ることを確認。

- [ ] **Step 4: README を作成**

`dashboard/README.md`:
```markdown
# supsup-dashboard

Sup! Sup! マーケティング分析ダッシュボード（Phase 1）。
既存 web の KV `DATA` を read-only 参照し、`history:latest`（sync が公開する完了予約履歴）を集計して表示する。

## セットアップ
1. `npm install`
2. `npx wrangler kv namespace create DASH` → 出力の id を `wrangler.toml` の DASH に貼る
3. Secrets を設定:
   - `npx wrangler secret put ADMIN_USER`
   - `npx wrangler secret put ADMIN_PASSWORD`
   - `npx wrangler secret put SESSION_SECRET`
4. `npx wrangler deploy`

## ローカル
`.dev.vars` に ADMIN_USER/ADMIN_PASSWORD/SESSION_SECRET を置き、`npx wrangler dev`。

## 前提（sync 側）
sync の GitHub Secrets に `HISTORY_SALT` を設定（電話ハッシュのソルト）。未設定でも既定値で動くが、本番は必ず設定する。

## 依存関係
- web の `/ingest-history` が `history:latest` を書く（web 側 Task 6）。
- sync が毎晩 `publishHistory` で履歴を送る（sync 側 Task 4-5）。
```

- [ ] **Step 5: typecheck と全テストの最終確認**

Run: `cd dashboard && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
cd dashboard && git add README.md && git commit -m "docs: dashboard setup, local verification, deploy steps"
```

---

## セルフレビュー結果

**Spec coverage（仕様 §5 の各画面 → タスク対応）:**
- §5.1 KPIサマリー → Task 9, 18 ✓
- §5.2 売上・予約トレンド(YoY) → Task 10, 16, 18 ✓（YoY は KPI 帯で提示。トレンド図は前年重ねを Phase 1 では KPI 数値で担保し、複合図は当期のみ＝スコープ明確化）
- §5.3 季節×曜日ヒートマップ → Task 11, 17, 18 ✓
- §5.4 天候相関 → Task 14, 18 ✓
- §5.5 リピーター・コホート → Task 8, 12, 17, 18 ✓
- §5.6 コース別内訳 → Task 13, 16, 18 ✓
- §5.7 戦略インサイト → Task 15, 18 ✓
- §4 sync 追加（history:latest・ハッシュ・氏名除去）→ Task 4, 5 ✓
- §3 web `/ingest-history` → Task 6 ✓
- §3 認証（web方式移植）→ Task 2, 3 ✓
- §6 インラインSVG・依存なし → Task 16, 17 ✓

**注記（仕様との差分・意図的なスコープ確定）:**
- §5.2 の「前年同期の重ね描き」は、複合図の視覚的重ねではなく KPI 帯の YoY 数値＋当期トレンド図で表現する（Phase 1 の複雑度を抑える）。将来、折れ線に前年系列を足すのは容易。
- 天候相関はカテゴリ別平均と好天比の落ち込み％をテキスト＋表で提示（散布図は Phase 2 以降の余地）。

**Placeholder scan:** "TBD"/"後で" 等の未確定なし（Task 3 の暫定 handleHome は Task 18 で明示的に置換）。

**Type consistency:** `HistoryRecord`（date/course/pax/amount/status/phoneHash）は sync・web・dashboard で同一形。`Period`・`Kpi`・`TrendPoint`・`Heatmap`・`CohortRow`・`CourseRow`・`WeatherJoin`・`DayWeather` の名称と署名はタスク間で一致。`computeWeatherJoin` は `weather.ts` から re-export し実体は `metrics/weatherjoin.ts`（Task 14）。
