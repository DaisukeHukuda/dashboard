# Phase 3 実装計画 — Instagram 連携（骨組み：TDD＋モック）

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development で1タスクずつ実行。

**Goal:** dashboard に Instagram Graph API 連携を加え、フォロワー推移・リーチ・投稿別エンゲージメント・投稿×予約の重ね描き・SNSインサイトを表示する。ライブ接続はユーザーのFBアプリ＋トークン後。コードはTDD＋モックで完成。

**Architecture:** dashboard Worker が Graph API を直接叩く（長期トークンを env に格納）。フォロワーは日次スナップショットを DASH KV に蓄積。IG未設定/失敗時は「Instagram未接続」でPhase 1/2は退行しない。

**Tech Stack:** 既存 dashboard（TS / Cloudflare Worker / vitest）。追加依存なし。

## Global Constraints
- Cloudflare Worker ランタイム＝Web標準 fetch/URLSearchParams のみ。JST。日本語UI。noUnusedLocals/Parameters。
- 既存テスト（現在77）を壊さない。IG の env は**オプショナル**（未設定でも Phase 1/2 は動く）。
- Graph API ベース: `https://graph.facebook.com/v21.0`。トークンは env `IG_ACCESS_TOKEN`、アカウントIDは env `IG_USER_ID`。
- **トークンをキャッシュキー・HTML・ログに出さない**（クエリ文字列にのみ付与）。
- 外部 fetch は注入可能にしてテストはモック。ライブIGは叩かない。GA4 fetch と同様 `AbortSignal.timeout(8000)`。
- スコープ: フォロワー推移 / リーチ・インプレッション / 投稿別エンゲージメント / 投稿×予約重ね描き / SNSインサイト。投稿サムネ無し。トークン自動延長無し（手動）。

## ファイル構成
- `src/ig/types.ts` — IG関連の型
- `src/ig/client.ts` — Graph API GET ラッパ（トークン付与・DASH KVキャッシュ・fetch注入・timeout）
- `src/ig/reports.ts` — insights/media/media-insights のレスポンス整形（純）
- `src/ig/followers.ts` — フォロワー日次スナップショットの読み書き（DASH KV）
- `src/metrics/social.ts` — 投稿×予約 の月次重ね描き（純）
- `src/ig/insights.ts` — SNS版 決定論インサイト（純）
- `src/ig/section.ts` — Instagramカード群の描画（未接続フォールバック付き）
- `src/handlers.ts` / `src/index.ts` / `src/pages.ts` — env拡張・IG取得(try/catch)・home 組み込み

---

## Task 1: Graph API クライアント

**Files:**
- Create: `src/ig/types.ts`
- Create: `src/ig/client.ts`
- Modify: `src/index.ts`（Env に IG の任意フィールド追加）
- Test: `test/ig-client.test.ts`

**Interfaces:**
- Produces:
  - `igGet(env: Env, path: string, params: Record<string,string>, fetchImpl?: typeof fetch, cacheTtl?: number): Promise<unknown>`
  - Env に `IG_ACCESS_TOKEN?: string; IG_USER_ID?: string;`

- [ ] **Step 1: 失敗するテストを書く**

`test/ig-client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { igGet } from '../src/ig/client.js';
import type { Env } from '../src/index.js';

function fakeKV(seed?: Record<string,string>) {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async () => {}, list: async () => ({ keys: [] }) };
}
const env = () => ({ DATA: fakeKV(), DASH: fakeKV(), ADMIN_USER:'a', ADMIN_PASSWORD:'b', SESSION_SECRET:'s', IG_ACCESS_TOKEN: 'TKN', IG_USER_ID: '17841400000000000' } as Env);

describe('igGet', () => {
  it('GETs graph API with token in query (not in cache key) and parses+caches', async () => {
    const e = env();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: '1', followers_count: 1234 }) });
    const out = await igGet(e, '17841400000000000', { fields: 'followers_count' }, fetchMock as unknown as typeof fetch) as { followers_count: number };
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('https://graph.facebook.com/v21.0/17841400000000000?');
    expect(url).toContain('fields=followers_count');
    expect(url).toContain('access_token=TKN');
    expect(out.followers_count).toBe(1234);
    // 2回目はキャッシュ（fetchされない）。キャッシュキーにトークンは含めない
    const fetch2 = vi.fn();
    await igGet(e, '17841400000000000', { fields: 'followers_count' }, fetch2 as unknown as typeof fetch);
    expect(fetch2).not.toHaveBeenCalled();
  });
  it('throws on non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(igGet(env(), 'x', {}, fetchMock as unknown as typeof fetch)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 失敗を確認** — `npm test -- ig-client` → FAIL

- [ ] **Step 3: types.ts を実装**

`src/ig/types.ts`:
```ts
export interface IgMedia { id: string; caption: string; timestamp: string; mediaType: string; permalink: string; }
export interface IgPostRow extends IgMedia { reach: number; likes: number; comments: number; saved: number; engagement: number; }
export interface IgSeriesPoint { date: string; value: number; }
```

- [ ] **Step 4: Env 拡張＋client.ts を実装**

`src/index.ts` の `Env` に追記（既存必須は不変）:
```ts
  IG_ACCESS_TOKEN?: string;
  IG_USER_ID?: string;
```
（既に GA4_* が任意で入っている場所の隣に追加。）

`src/ig/client.ts`:
```ts
import type { Env } from '../index.js';

const BASE = 'https://graph.facebook.com/v21.0';

export async function igGet(
  env: Env, path: string, params: Record<string, string>,
  fetchImpl: typeof fetch = fetch, cacheTtl = 3 * 3600,
): Promise<unknown> {
  const paramStr = new URLSearchParams(params).toString();
  const cacheKey = `ig:${path}:${paramStr}`; // トークンは含めない
  const cached = await env.DASH.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const qs = new URLSearchParams({ ...params, access_token: env.IG_ACCESS_TOKEN ?? '' });
  const resp = await fetchImpl(`${BASE}/${path}?${qs.toString()}`, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`ig api failed: HTTP ${resp.status}`);
  const j = await resp.json();
  await env.DASH.put(cacheKey, JSON.stringify(j), { expirationTtl: cacheTtl });
  return j;
}
```

- [ ] **Step 5: 通ることを確認** — `npm test && npm run typecheck` → PASS

- [ ] **Step 6: コミット** — `feat(ig): Graph API GETラッパ（トークン付与・KVキャッシュ・timeout）、Env拡張`

---

## Task 2: レスポンス整形（insights/media）

**Files:**
- Create: `src/ig/reports.ts`
- Test: `test/ig-reports.test.ts`

**Interfaces:**
- Consumes: `IgMedia`/`IgSeriesPoint`/`IgPostRow`（types）
- Produces:
  - `parseInsightSeries(json: unknown, metric: string): IgSeriesPoint[]`（insights の data[name==metric].values[] → {date=end_time の日付, value}）
  - `parseMediaList(json: unknown): IgMedia[]`
  - `parseMediaInsights(json: unknown): { reach: number; likes: number; comments: number; saved: number }`
  - `buildPostRows(media: IgMedia[], insightsById: Record<string, { reach:number; likes:number; comments:number; saved:number }>): IgPostRow[]`（engagement=likes+comments+saved、engagement降順）

- [ ] **Step 1: 失敗するテストを書く**

`test/ig-reports.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseInsightSeries, parseMediaList, parseMediaInsights, buildPostRows } from '../src/ig/reports.js';

describe('parseInsightSeries', () => {
  it('extracts the named metric daily series', () => {
    const json = { data: [
      { name: 'reach', period: 'day', values: [ { value: 100, end_time: '2024-07-10T07:00:00+0000' }, { value: 120, end_time: '2024-07-11T07:00:00+0000' } ] },
      { name: 'impressions', period: 'day', values: [ { value: 200, end_time: '2024-07-10T07:00:00+0000' } ] },
    ] };
    expect(parseInsightSeries(json, 'reach')).toEqual([
      { date: '2024-07-10', value: 100 }, { date: '2024-07-11', value: 120 },
    ]);
  });
  it('returns [] for missing metric', () => {
    expect(parseInsightSeries({ data: [] }, 'reach')).toEqual([]);
  });
});

describe('parseMediaList', () => {
  it('maps media fields', () => {
    const json = { data: [ { id: 'm1', caption: 'hello', timestamp: '2024-07-10T09:00:00+0000', media_type: 'IMAGE', permalink: 'https://insta/p/1' } ] };
    expect(parseMediaList(json)).toEqual([
      { id: 'm1', caption: 'hello', timestamp: '2024-07-10T09:00:00+0000', mediaType: 'IMAGE', permalink: 'https://insta/p/1' },
    ]);
  });
});

describe('parseMediaInsights', () => {
  it('reads reach/likes/comments/saved from insights data', () => {
    const json = { data: [
      { name: 'reach', values: [{ value: 500 }] },
      { name: 'likes', values: [{ value: 40 }] },
      { name: 'comments', values: [{ value: 5 }] },
      { name: 'saved', values: [{ value: 12 }] },
    ] };
    expect(parseMediaInsights(json)).toEqual({ reach: 500, likes: 40, comments: 5, saved: 12 });
  });
});

describe('buildPostRows', () => {
  it('joins media with insights and sorts by engagement desc', () => {
    const media = [
      { id: 'm1', caption: 'a', timestamp: '2024-07-10T09:00:00+0000', mediaType: 'IMAGE', permalink: 'p1' },
      { id: 'm2', caption: 'b', timestamp: '2024-07-11T09:00:00+0000', mediaType: 'IMAGE', permalink: 'p2' },
    ];
    const ins = {
      m1: { reach: 100, likes: 10, comments: 1, saved: 2 },  // eng 13
      m2: { reach: 200, likes: 30, comments: 3, saved: 5 },  // eng 38
    };
    const rows = buildPostRows(media, ins);
    expect(rows.map(r => r.id)).toEqual(['m2', 'm1']);
    expect(rows[0].engagement).toBe(38);
  });
});
```

- [ ] **Step 2: 失敗を確認** — `npm test -- ig-reports` → FAIL

- [ ] **Step 3: reports.ts を実装**

`src/ig/reports.ts`:
```ts
import type { IgMedia, IgSeriesPoint, IgPostRow } from './types.js';

interface InsightData { data?: { name: string; values?: { value: number; end_time?: string }[] }[]; }

export function parseInsightSeries(json: unknown, metric: string): IgSeriesPoint[] {
  const d = (json as InsightData).data ?? [];
  const found = d.find(x => x.name === metric);
  if (!found) return [];
  return (found.values ?? []).map(v => ({
    date: (v.end_time ?? '').slice(0, 10),
    value: v.value ?? 0,
  }));
}

interface MediaListJson { data?: { id: string; caption?: string; timestamp: string; media_type: string; permalink: string }[]; }

export function parseMediaList(json: unknown): IgMedia[] {
  return ((json as MediaListJson).data ?? []).map(m => ({
    id: m.id, caption: m.caption ?? '', timestamp: m.timestamp, mediaType: m.media_type, permalink: m.permalink,
  }));
}

export function parseMediaInsights(json: unknown): { reach: number; likes: number; comments: number; saved: number } {
  const d = (json as InsightData).data ?? [];
  const val = (name: string) => d.find(x => x.name === name)?.values?.[0]?.value ?? 0;
  return { reach: val('reach'), likes: val('likes'), comments: val('comments'), saved: val('saved') };
}

export function buildPostRows(
  media: IgMedia[], insightsById: Record<string, { reach: number; likes: number; comments: number; saved: number }>,
): IgPostRow[] {
  return media.map(m => {
    const ins = insightsById[m.id] ?? { reach: 0, likes: 0, comments: 0, saved: 0 };
    return { ...m, ...ins, engagement: ins.likes + ins.comments + ins.saved };
  }).sort((a, b) => b.engagement - a.engagement);
}
```

- [ ] **Step 4: 通ることを確認** — `npm test -- ig-reports && npm run typecheck` → PASS

- [ ] **Step 5: コミット** — `feat(ig): insights/media レスポンス整形`

---

## Task 3: フォロワー日次スナップショット

**Files:**
- Create: `src/ig/followers.ts`
- Test: `test/ig-followers.test.ts`

**Interfaces:**
- Consumes: `Env`
- Produces:
  - `recordFollowerSnapshot(env: Env, count: number, today: string): Promise<void>`（`ig:followers:${today}` が無ければ保存。TTL無し＝履歴保持）
  - `getFollowerSeries(env: Env): Promise<{ date: string; count: number }[]>`（`ig:followers:` prefix を list→昇順）

- [ ] **Step 1: 失敗するテストを書く**

`test/ig-followers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { recordFollowerSnapshot, getFollowerSeries } from '../src/ig/followers.js';
import type { Env } from '../src/index.js';

// list(prefix) をちゃんと実装した fakeKV
function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
    list: async ({ prefix }: { prefix: string }) => ({ keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }),
  };
}
const env = (dash = fakeKV()) => ({ DATA: fakeKV(), DASH: dash, ADMIN_USER:'a', ADMIN_PASSWORD:'b', SESSION_SECRET:'s' } as Env);

describe('follower snapshots', () => {
  it('records once per day and reads back a sorted series', async () => {
    const dash = fakeKV();
    const e = env(dash);
    await recordFollowerSnapshot(e, 1000, '2024-07-11');
    await recordFollowerSnapshot(e, 9999, '2024-07-11'); // 同日は上書きしない
    await recordFollowerSnapshot(e, 1010, '2024-07-10');
    const series = await getFollowerSeries(e);
    expect(series).toEqual([{ date: '2024-07-10', count: 1010 }, { date: '2024-07-11', count: 1000 }]);
  });
  it('returns [] when no snapshots', async () => {
    expect(await getFollowerSeries(env())).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認** — `npm test -- ig-followers` → FAIL

- [ ] **Step 3: followers.ts を実装**

`src/ig/followers.ts`:
```ts
import type { Env } from '../index.js';

const PREFIX = 'ig:followers:';

export async function recordFollowerSnapshot(env: Env, count: number, today: string): Promise<void> {
  const key = `${PREFIX}${today}`;
  const existing = await env.DASH.get(key);
  if (existing !== null) return; // その日の最初の値を保持
  await env.DASH.put(key, String(count));
}

export async function getFollowerSeries(env: Env): Promise<{ date: string; count: number }[]> {
  const { keys } = await env.DASH.list({ prefix: PREFIX });
  const out: { date: string; count: number }[] = [];
  for (const k of keys) {
    const v = await env.DASH.get(k.name);
    if (v !== null) out.push({ date: k.name.slice(PREFIX.length), count: Number(v) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
```

- [ ] **Step 4: 通ることを確認** — `npm test -- ig-followers && npm run typecheck` → PASS

- [ ] **Step 5: コミット** — `feat(ig): フォロワー日次スナップショット（DASH KV蓄積）`

---

## Task 4: 投稿×予約 重ね描きメトリクス

**Files:**
- Create: `src/metrics/social.ts`
- Test: `test/social.test.ts`

**Interfaces:**
- Consumes: `HistoryRecord`、`Period`、`filterPeriod`、`inPeriod`、`ymOf`、`IgMedia`（timestamp を使う）
- Produces:
  - `interface SocialPoint { bucket: string; posts: number; bookings: number }`
  - `computeSocialOverlay(all: HistoryRecord[], period: Period, media: { timestamp: string }[]): SocialPoint[]`（月次で投稿数と予約数を合算・昇順。timestamp の日付は JST 'YYYY-MM-DD' に落として判定）

- [ ] **Step 1: 失敗するテストを書く**

`test/social.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeSocialOverlay } from '../src/metrics/social.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string): HistoryRecord => ({ date, course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' });

describe('computeSocialOverlay', () => {
  it('aligns post counts and bookings by month', () => {
    const p = resolvePeriod('2024', '2025-01-01');
    const all = [r('2024-06-05'), r('2024-06-20'), r('2024-07-02')];
    const media = [
      { timestamp: '2024-06-10T09:00:00+0900' },
      { timestamp: '2024-06-28T12:00:00+0900' },
      { timestamp: '2024-07-01T08:00:00+0900' },
      { timestamp: '2023-06-01T00:00:00+0900' }, // 期間外は無視
    ];
    expect(computeSocialOverlay(all, p, media)).toEqual([
      { bucket: '2024-06', posts: 2, bookings: 2 },
      { bucket: '2024-07', posts: 1, bookings: 1 },
    ]);
  });
});
```

- [ ] **Step 2: 失敗を確認** — `npm test -- social` → FAIL

- [ ] **Step 3: social.ts を実装**

`src/metrics/social.ts`:
```ts
import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod, inPeriod } from '../period.js';
import { ymOf } from '../util.js';

export interface SocialPoint { bucket: string; posts: number; bookings: number; }

// ISO timestamp（+0900等）を JST 'YYYY-MM-DD' へ
function jstDateOfIso(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts.slice(0, 10);
  const j = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`;
}

export function computeSocialOverlay(
  all: HistoryRecord[], period: Period, media: { timestamp: string }[],
): SocialPoint[] {
  const map = new Map<string, { posts: number; bookings: number }>();
  const get = (b: string) => map.get(b) ?? { posts: 0, bookings: 0 };

  for (const r of filterPeriod(all, period)) {
    const b = ymOf(r.date); const cur = get(b); cur.bookings += 1; map.set(b, cur);
  }
  for (const m of media) {
    const date = jstDateOfIso(m.timestamp);
    if (!inPeriod(date, period)) continue;
    const b = ymOf(date); const cur = get(b); cur.posts += 1; map.set(b, cur);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([bucket, v]) => ({ bucket, posts: v.posts, bookings: v.bookings }));
}
```

- [ ] **Step 4: 通ることを確認** — `npm test -- social && npm run typecheck` → PASS

- [ ] **Step 5: コミット** — `feat(ig): 投稿×予約 月次重ね描きメトリクス`

---

## Task 5: SNSインサイト

**Files:**
- Create: `src/ig/insights.ts`
- Test: `test/ig-insights.test.ts`

**Interfaces:**
- Consumes: `IgSeriesPoint`（フォロワー系列を {date,count} で渡す）、`IgPostRow`、`SocialPoint`
- Produces: `buildIgInsights(input: { followers: { date: string; count: number }[]; posts: IgPostRow[]; overlay: SocialPoint[] }): string[]`

- [ ] **Step 1: 失敗するテストを書く**

`test/ig-insights.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildIgInsights } from '../src/ig/insights.js';
import type { IgPostRow } from '../src/ig/types.js';

const post = (over: Partial<IgPostRow>): IgPostRow => ({ id: 'm', caption: 'c', timestamp: '2024-07-10T09:00:00+0900', mediaType: 'IMAGE', permalink: 'p', reach: 0, likes: 0, comments: 0, saved: 0, engagement: 0, ...over });

describe('buildIgInsights', () => {
  it('reports follower change and top post', () => {
    const out = buildIgInsights({
      followers: [{ date: '2024-06-01', count: 1000 }, { date: '2024-07-01', count: 1080 }],
      posts: [post({ caption: '最高のSUP日和', engagement: 50, reach: 500 }), post({ engagement: 10 })],
      overlay: [{ bucket: '2024-06', posts: 4, bookings: 10 }],
    });
    expect(out.some(s => s.includes('フォロワー'))).toBe(true);
    expect(out.some(s => s.includes('+80') || s.includes('80'))).toBe(true);
    expect(out.some(s => s.includes('エンゲージ'))).toBe(true);
  });
  it('is safe with empty data', () => {
    expect(buildIgInsights({ followers: [], posts: [], overlay: [] })).toEqual([]);
  });
});
```

- [ ] **Step 2: 失敗を確認** — `npm test -- ig-insights` → FAIL

- [ ] **Step 3: insights.ts を実装**

`src/ig/insights.ts`:
```ts
import type { IgPostRow } from './types.js';
import type { SocialPoint } from '../metrics/social.js';

export function buildIgInsights(input: {
  followers: { date: string; count: number }[]; posts: IgPostRow[]; overlay: SocialPoint[];
}): string[] {
  const out: string[] = [];
  const f = input.followers;
  if (f.length >= 2) {
    const diff = f[f.length - 1].count - f[0].count;
    const sign = diff >= 0 ? `+${diff}` : `${diff}`;
    out.push(`フォロワーは蓄積開始から ${sign}（${f[0].count} → ${f[f.length - 1].count}）。`);
  } else if (f.length === 1) {
    out.push(`フォロワー ${f[0].count}（推移は本日以降、日次で蓄積されます）。`);
  }
  if (input.posts.length > 0) {
    const top = input.posts[0]; // engagement 降順済み
    const cap = top.caption ? `「${top.caption.slice(0, 20)}」` : '(キャプションなし)';
    out.push(`最もエンゲージメントが高い投稿は ${cap}（いいね${top.likes}/コメント${top.comments}/保存${top.saved}）。`);
    const avg = Math.round(input.posts.reduce((s, p) => s + p.engagement, 0) / input.posts.length);
    out.push(`直近投稿の平均エンゲージメントは ${avg}。`);
  }
  return out;
}
```

- [ ] **Step 4: 通ることを確認** — `npm test -- ig-insights && npm run typecheck` → PASS

- [ ] **Step 5: コミット** — `feat(ig): SNS版 決定論インサイト`

---

## Task 6: Instagramセクション描画

**Files:**
- Create: `src/ig/section.ts`
- Test: `test/ig-section.test.ts`

**Interfaces:**
- Consumes: `IgSeriesPoint`/`IgPostRow`/`SocialPoint`、`esc`（pages.ts）、`renderTrendChart`（line.ts）
- Produces:
  - `interface SocialData { followers: { date:string; count:number }[]; reach: IgSeriesPoint[]; posts: IgPostRow[]; overlay: SocialPoint[]; insights: string[]; connected: boolean }`
  - `renderSocialSection(d: SocialData): string`（connected=false→「Instagram未接続」カードのみ）

- [ ] **Step 1: 失敗するテストを書く**

`test/ig-section.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderSocialSection } from '../src/ig/section.js';

const base = { followers: [], reach: [], posts: [], overlay: [], insights: [] };

describe('renderSocialSection', () => {
  it('shows not-connected notice when connected=false', () => {
    const html = renderSocialSection({ ...base, connected: false });
    expect(html).toContain('Instagram');
    expect(html).toContain('未接続');
  });
  it('renders follower/engagement/overlay cards when connected', () => {
    const html = renderSocialSection({
      ...base, connected: true,
      followers: [{ date: '2024-06-01', count: 1000 }, { date: '2024-07-01', count: 1080 }],
      posts: [{ id: 'm1', caption: 'SUP日和', timestamp: '2024-07-10T09:00:00+0900', mediaType: 'IMAGE', permalink: 'p', reach: 500, likes: 40, comments: 5, saved: 12, engagement: 57 }],
      overlay: [{ bucket: '2024-06', posts: 4, bookings: 10 }],
      insights: ['フォロワーは蓄積開始から +80（1000 → 1080）。'],
    });
    expect(html).toContain('フォロワー推移');
    expect(html).toContain('投稿別エンゲージメント');
    expect(html).toContain('投稿 × 予約');
    expect(html).toContain('SUP日和');
  });
});
```

- [ ] **Step 2: 失敗を確認** — `npm test -- ig-section` → FAIL

- [ ] **Step 3: section.ts を実装**

`src/ig/section.ts`:
```ts
import type { IgSeriesPoint, IgPostRow } from './types.js';
import type { SocialPoint } from '../metrics/social.js';
import { esc } from '../pages.js';
import { renderTrendChart } from '../charts/line.js';

export interface SocialData {
  followers: { date: string; count: number }[];
  reach: IgSeriesPoint[];
  posts: IgPostRow[];
  overlay: SocialPoint[];
  insights: string[];
  connected: boolean;
}

// {date,value}[] を折れ線用の TrendPoint（bookings=線）に載せる簡易再利用
function seriesChart(points: { date: string; value: number }[]): string {
  const tp = points.map(p => ({ bucket: p.date, label: p.date, bookings: p.value, revenue: 0 }));
  return renderTrendChart(tp);
}

export function renderSocialSection(d: SocialData): string {
  if (!d.connected) {
    return `<div class="card"><h2>Instagram（SNS）</h2><p style="font-size:13px;color:var(--muted)">Instagramは未接続です。Facebookアプリの長期トークン（IG_ACCESS_TOKEN）とIG_USER_IDの設定後に表示されます。</p></div>`;
  }
  const followerTp = d.followers.map(f => ({ bucket: f.date, label: f.date, bookings: f.count, revenue: 0 }));
  const overlayTp = d.overlay.map(o => ({ bucket: o.bucket, label: o.bucket, bookings: o.bookings, revenue: o.posts }));
  const postRows = d.posts.slice(0, 10).map(p =>
    `<tr><td style="padding:2px 10px">${esc((p.caption || '(なし)').slice(0, 24))}</td><td style="padding:2px 10px;text-align:right">${p.reach}</td><td style="padding:2px 10px;text-align:right">${p.likes}</td><td style="padding:2px 10px;text-align:right">${p.comments}</td><td style="padding:2px 10px;text-align:right">${p.saved}</td></tr>`
  ).join('');
  const insights = d.insights.map(s => `<li style="margin:4px 0">${esc(s)}</li>`).join('');
  return `<div class="card"><h2>Instagram（SNS）インサイト</h2><ul style="margin:0;padding-left:18px;font-size:14px">${insights}</ul></div>
<div class="card"><h2>フォロワー推移（蓄積開始以降）</h2>${followerTp.length ? renderTrendChart(followerTp) : '<p style="font-size:13px;color:var(--muted)">まだ蓄積がありません（本日以降）。</p>'}</div>
<div class="card"><h2>リーチ推移</h2>${seriesChart(d.reach)}</div>
<div class="card"><h2>投稿 × 予約（棒=投稿数 / 線=予約件数）</h2>${renderTrendChart(overlayTp)}</div>
<div class="card"><h2>投稿別エンゲージメント Top</h2>
<table style="font-size:13px;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:2px 10px">投稿</th><th style="padding:2px 10px">リーチ</th><th style="padding:2px 10px">いいね</th><th style="padding:2px 10px">コメント</th><th style="padding:2px 10px">保存</th></tr></thead><tbody>${postRows}</tbody></table></div>`;
}
```

- [ ] **Step 4: 通ることを確認** — `npm test -- ig-section && npm run typecheck` → PASS

- [ ] **Step 5: コミット** — `feat(ig): Instagramセクション描画（未接続フォールバック付き）`

---

## Task 7: home への配線（IG取得＋フォールバック）

**Files:**
- Modify: `src/handlers.ts`
- Modify: `src/pages.ts`
- Test: `test/ig-home.test.ts`

**Interfaces:**
- Consumes: 全 IG モジュール、`Env`
- Produces: `handleHome` が IG データを取得（`env.IG_ACCESS_TOKEN && env.IG_USER_ID` 未設定 or 失敗なら connected:false）し、`renderDashboard` の末尾に `renderSocialSection` を差し込む。DashboardData に `social: SocialData` 追加。

- [ ] **Step 1: 失敗するテストを書く**

`test/ig-home.test.ts`:
```ts
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
});
```

- [ ] **Step 2: 失敗を確認** — `npm test -- ig-home` → FAIL

- [ ] **Step 3: handlers.ts に IG 取得を追加**

`src/handlers.ts` の import に追加:
```ts
import { igGet } from './ig/client.js';
import { parseInsightSeries, parseMediaList, parseMediaInsights, buildPostRows } from './ig/reports.js';
import { recordFollowerSnapshot, getFollowerSeries } from './ig/followers.js';
import { computeSocialOverlay } from './metrics/social.js';
import { buildIgInsights } from './ig/insights.js';
import type { SocialData } from './ig/section.js';
```

`handleHome` 内、GA4 の traffic 構築の後あたりに追加（未設定/失敗は connected:false）:
```ts
  const emptySocial: SocialData = { followers: [], reach: [], posts: [], overlay: [], insights: [], connected: false };
  let social: SocialData = emptySocial;
  if (env.IG_ACCESS_TOKEN && env.IG_USER_ID) {
    try {
      const uid = env.IG_USER_ID;
      const today = jstToday();
      // アカウント: フォロワー数＋日次スナップショット
      const acct = await igGet(env, uid, { fields: 'followers_count' }) as { followers_count?: number };
      if (typeof acct.followers_count === 'number') await recordFollowerSnapshot(env, acct.followers_count, today);
      const followers = await getFollowerSeries(env);
      // リーチ（期間指定）
      const reachJson = await igGet(env, `${uid}/insights`, { metric: 'reach', period: 'day', since: period.start, until: period.end });
      const reach = parseInsightSeries(reachJson, 'reach');
      // 投稿一覧＋上位のinsights
      const mediaJson = await igGet(env, `${uid}/media`, { fields: 'id,caption,timestamp,media_type,permalink', limit: '25' });
      const media = parseMediaList(mediaJson);
      const insightsById: Record<string, { reach: number; likes: number; comments: number; saved: number }> = {};
      for (const m of media.slice(0, 12)) {
        try {
          const mi = await igGet(env, `${m.id}/insights`, { metric: 'reach,likes,comments,saved' });
          insightsById[m.id] = parseMediaInsights(mi);
        } catch { /* 個別投稿の失敗は無視 */ }
      }
      const posts = buildPostRows(media, insightsById);
      const overlay = computeSocialOverlay(all, period, media);
      social = { followers, reach, posts, overlay, insights: buildIgInsights({ followers, posts, overlay }), connected: true };
    } catch { social = emptySocial; }
  }
```
そして `renderDashboard({...})` に `social` を渡す（Step 4 で引数追加）。

- [ ] **Step 4: pages.ts に IG セクションを差し込む**

`src/pages.ts`:
- import 追加: `import { renderSocialSection, type SocialData } from './ig/section.js';`
- `DashboardData` に `social: SocialData;` を追加。
- `renderDashboard` の body で、GA4 セクション `${renderTrafficSection(d.traffic)}` の直後に `${renderSocialSection(d.social)}` を追加。
- handlers.ts の `renderDashboard({...})` 引数に `social,` を追加。

- [ ] **Step 5: 通ることを確認** — `npm test && npm run typecheck` → 全PASS

- [ ] **Step 6: コミット** — `feat(ig): home にInstagramセクションを配線（未設定/失敗はフォールバック）`

---

## セルフレビュー観点（実装後）
- Env の IG フィールドは任意（既存テストが Env を IG 無しで構築でき退行しない）。
- ライブ IG は一切叩かない（全テストで fetch 注入 or グローバル stub）。
- IG 取得の失敗（トークン失効・API失敗・個別投稿失敗）は home の try/catch で connected:false に落ち、Phase 1/2 は常に描画。
- トークンはキャッシュキー・HTML・ログに出さない（client のキャッシュキーは params のみ、section は数値/キャプションのみ描画）。
- フォロワースナップショットは日次1回（同日は上書きしない）。
- Worker ランタイム前提（Web標準のみ）。
