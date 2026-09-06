# フォロワー自動記録＋推移チャート＋IGインサイト拡充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** フォロワー数を Cron で毎日記録し、増減が読める専用チャートとミニKPIで表示し、Instagram インサイトを5グループの数字＋示唆に拡充する。

**Architecture:** Worker に `scheduled` を追加（`wrangler.toml` triggers）。`followers.ts` はクールダウンキーを接頭辞外へ移し、日付キーのみ採用。`charts/followers.ts`（日付比例x・ズームy・差分棒）と `ig/followerStats.ts`。`ig/insights.ts` は `InsightGroup[]` を返し `renderInsightGroups` で描画。

**Tech Stack:** TypeScript / Cloudflare Workers / vitest。スペック: `docs/superpowers/specs/2026-09-06-ig-followers-cron-and-insights-design.md`

## Global Constraints
- 外部ライブラリ追加禁止 / UI文言は日本語 / `DATA` KV read-only
- Cron は `0 16 * * *`（JST 01:00）。IG Secrets 未設定なら何もしない
- 各タスクは `npm run typecheck && npm test` 全件 green 後にコミット（main直・日本語メッセージ）

---

### Task 1: Cron 自動記録とクールダウンキー分離

**Files:** Modify `wrangler.toml`, `src/index.ts`, `src/ig/followers.ts` / Test `test/ig-followers.test.ts`, `test/routing.test.ts`（scheduled）

**Interfaces（Produces）:** `export default { fetch, scheduled }`。`FOLLOWERS_COOLDOWN_KEY = 'ig:followers-cooldown'`。`getFollowerSeries` は `^\d{4}-\d{2}-\d{2}$` のキーのみ。

- [ ] **Step 1: 失敗するテストを書く**
`test/ig-followers.test.ts` に追加:
```ts
  it('getFollowerSeries は日付形式以外のキー（cooldown等）を無視する', async () => {
    const env = makeEnv(); // 既存のenv生成ヘルパ名に合わせる
    await env.DASH.put('ig:followers:2026-09-05', '100');
    await env.DASH.put('ig:followers:cooldown', '1'); // 旧キー形式が残っていても混入しない
    await env.DASH.put('ig:followers-cooldown', '1');
    expect(await getFollowerSeries(env)).toEqual([{ date: '2026-09-05', count: 100 }]);
  });
  it('クールダウンキーは記録接頭辞の外にある', () => {
    expect(FOLLOWERS_COOLDOWN_KEY.startsWith('ig:followers:')).toBe(false);
  });
```
`test/routing.test.ts` に追加:
```ts
  it('scheduled はIG設定時にフォロワーを記録し、未設定なら何もしない', async () => {
    const envIg: Env = { DATA: fakeKV(), DASH: fakeKV(), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret', IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '17841000000000000' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ followers_count: 4321 }) }));
    const waited: Promise<unknown>[] = [];
    await worker.scheduled({} as never, envIg, { waitUntil: (p: Promise<unknown>) => { waited.push(p); } } as never);
    await Promise.all(waited);
    const keys = (await envIg.DASH.list({ prefix: 'ig:followers:' })).keys.map(k => k.name);
    expect(keys.length).toBe(1);
    const noIg: Env = { DATA: fakeKV(), DASH: fakeKV(), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret' };
    const w2: Promise<unknown>[] = [];
    await worker.scheduled({} as never, noIg, { waitUntil: (p: Promise<unknown>) => { w2.push(p); } } as never);
    expect(w2.length).toBe(0);
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  });
```
（`fakeKV().list` が prefix を無視して空を返す実装なら、テスト用に prefix フィルタを実装する形へ更新してよい）
- [ ] **Step 2: RED確認**
- [ ] **Step 3: 実装**
`wrangler.toml` 末尾:
```toml
[triggers]
crons = ["0 16 * * *"]  # JST 01:00 にフォロワー数を自動記録
```
`src/ig/followers.ts`: `export const FOLLOWERS_COOLDOWN_KEY = 'ig:followers-cooldown';`。`getFollowerSeries` のループで `const date = k.name.slice(PREFIX.length); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;`。
`src/index.ts`:
```ts
import { ensureFollowerSnapshot } from './ig/followers.js';
// …
export default {
  async fetch(req: Request, env: Env): Promise<Response> { /* 既存 */ },
  async scheduled(_controller: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<void> {
    if (!(env.IG_ACCESS_TOKEN && env.IG_USER_ID)) return;
    ctx.waitUntil(ensureFollowerSnapshot(env)); // 失敗はensure内で握る（クールダウン）
  },
};
```
- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: フォロワー数をCronで毎日自動記録・クールダウンキーの接頭辞衝突を修正"`

---

### Task 2: フォロワー統計と専用チャート・セクション表示

**Files:** Create `src/ig/followerStats.ts`, `src/charts/followers.ts` / Modify `src/ig/section.ts` / Test `test/ig-follower-stats.test.ts`, `test/followers-chart.test.ts`, `test/ig-section.test.ts`

**Interfaces（Produces）:**
- `summarizeFollowers(points: {date,count}[]): { current: number | null; startDate: string | null; sinceStart: number | null; perDay: number | null; last30: number | null }`
- `renderFollowerChart(points: {date,count}[]): string`

- [ ] **Step 1: 失敗するテストを書く**
`test/ig-follower-stats.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { summarizeFollowers } from '../src/ig/followerStats.js';
describe('summarizeFollowers', () => {
  it('増減・1日平均・直近30日', () => {
    const s = summarizeFollowers([{ date: '2026-07-18', count: 3788 }, { date: '2026-08-16', count: 3800 }, { date: '2026-09-05', count: 3840 }, { date: '2026-09-06', count: 3851 }]);
    expect(s.current).toBe(3851); expect(s.startDate).toBe('2026-07-18'); expect(s.sinceStart).toBe(63);
    expect(s.perDay).toBeCloseTo(63 / 50, 2); // 7/18→9/6 = 50日
    expect(s.last30).toBe(51); // 9/6の30日以内で最古=8/16(3800) → 3851-3800
  });
  it('1点なら current のみ', () => {
    expect(summarizeFollowers([{ date: '2026-09-06', count: 10 }])).toEqual({ current: 10, startDate: '2026-09-06', sinceStart: null, perDay: null, last30: null });
  });
  it('空は全null', () => { expect(summarizeFollowers([]).current).toBeNull(); });
});
```
`test/followers-chart.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderFollowerChart } from '../src/charts/followers.js';
describe('renderFollowerChart', () => {
  const pts = [{ date: '2026-07-18', count: 3788 }, { date: '2026-08-16', count: 3800 }, { date: '2026-09-06', count: 3851 }];
  it('x は日付比例・y はズーム・差分棒', () => {
    const svg = renderFollowerChart(pts);
    const xs = [...svg.matchAll(/<circle cx="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(xs.length).toBe(3);
    // 7/18→8/16 = 29日, 8/16→9/6 = 21日 → 中点は全幅の 29/50 位置
    expect((xs[1] - xs[0]) / (xs[2] - xs[0])).toBeCloseTo(29 / 50, 2);
    expect(svg).not.toContain('>0<'); // y軸目盛に0が出ない（ズーム）
    expect(svg).toContain('title>2026-09-06'); // 点のtitle
    expect((svg.match(/class="diff-bar"/g) ?? []).length).toBe(2); // 差分棒は点数-1
    expect(svg).toContain('+51'); expect(svg).toContain('+12');
  });
  it('1点以下は案内文', () => { expect(renderFollowerChart([{ date: '2026-09-06', count: 1 }])).toContain('まだ蓄積が1日分'); expect(renderFollowerChart([])).toContain('まだ蓄積が'); });
});
```
`test/ig-section.test.ts`（接続済みフィクスチャに followers 2点以上を与えて）: 見出し `フォロワー推移`、`毎日1:00に自動記録`、ミニKPI「現在」「蓄積開始からの増減」「直近30日の増減」、`class="diff-bar"` を含む。
- [ ] **Step 2: RED確認**
- [ ] **Step 3: 実装**
`src/ig/followerStats.ts`:
```ts
import { daysBetweenYmd, addDaysToYmd } from '../util.js';
export interface FollowerStats { current: number | null; startDate: string | null; sinceStart: number | null; perDay: number | null; last30: number | null }
export function summarizeFollowers(points: { date: string; count: number }[]): FollowerStats {
  if (points.length === 0) return { current: null, startDate: null, sinceStart: null, perDay: null, last30: null };
  const p = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = p[0], last = p[p.length - 1];
  if (p.length === 1) return { current: last.count, startDate: first.date, sinceStart: null, perDay: null, last30: null };
  const days = daysBetweenYmd(first.date, last.date);
  const sinceStart = last.count - first.count;
  const cutoff = addDaysToYmd(last.date, -30);
  const inWin = p.filter(x => x.date >= cutoff);
  const last30 = inWin.length >= 2 ? last.count - inWin[0].count : null;
  return { current: last.count, startDate: first.date, sinceStart, perDay: days > 0 ? sinceStart / days : null, last30 };
}
```
`src/charts/followers.ts`:
```ts
import { svgOpen, svgClose, escXml } from './svg.js';
import { axisLabels } from './axis.js';
import { daysBetweenYmd } from '../util.js';
export function renderFollowerChart(points: { date: string; count: number }[]): string {
  const p = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (p.length <= 1) return `<p style="font-size:13px;color:var(--muted)">まだ蓄積が${p.length}日分です（毎日1:00に自動記録されます）。</p>`;
  const W = 720, H = 260, top = 16, left = 56, right = 12, diffH = 40, bottom = 30;
  const plotH = H - top - bottom - diffH - 8; const plotW = W - left - right;
  const span = Math.max(1, daysBetweenYmd(p[0].date, p[p.length - 1].date));
  const xOf = (d: string) => left + (daysBetweenYmd(p[0].date, d) / span) * plotW;
  const counts = p.map(x => x.count); const min = Math.min(...counts), max = Math.max(...counts);
  const range = max - min; const pad = range === 0 ? 10 : Math.max(5, Math.ceil(range * 0.15));
  const lo = min - pad, hi = max + pad;
  const yOf = (v: number) => top + plotH - ((v - lo) / (hi - lo)) * plotH;
  let s = svgOpen(W, H);
  for (let g = 0; g <= 4; g++) { const v = Math.round(lo + ((hi - lo) * g) / 4); const y = yOf(v); s += `<line x1="${left}" x2="${W - right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb"/><text x="${left - 6}" y="${(y + 3).toFixed(1)}" font-size="9" fill="#6b7280" text-anchor="end">${v.toLocaleString('ja-JP')}</text>`; }
  s += `<polyline points="${p.map(x => `${xOf(x.date).toFixed(1)},${yOf(x.count).toFixed(1)}`).join(' ')}" fill="none" stroke="#db2777" stroke-width="2"/>`;
  for (const x of p) s += `<circle cx="${xOf(x.date).toFixed(1)}" cy="${yOf(x.count).toFixed(1)}" r="3" fill="#db2777"><title>${escXml(x.date)}: ${x.count.toLocaleString('ja-JP')}人</title></circle>`;
  // 差分棒（下段）
  const base = top + plotH + 8 + diffH / 2; const maxAbs = Math.max(1, ...p.slice(1).map((x, i) => Math.abs(x.count - p[i].count)));
  s += `<line x1="${left}" x2="${W - right}" y1="${base}" y2="${base}" stroke="#e5e7eb"/>`;
  for (let i = 1; i < p.length; i++) { const d = p[i].count - p[i - 1].count; const h = (Math.abs(d) / maxAbs) * (diffH / 2); const x = xOf(p[i].date); const color = d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#9ca3af'; const y = d >= 0 ? base - h : base; s += `<rect class="diff-bar" x="${(x - 3).toFixed(1)}" y="${y.toFixed(1)}" width="6" height="${Math.max(1, h).toFixed(1)}" fill="${color}"><title>${escXml(p[i].date)}: ${d > 0 ? '+' : ''}${d}</title></rect>`; }
  const labels = axisLabels(p.map(x => ({ bucket: x.date, label: x.date })), Math.ceil(p.length / 10) || 1);
  labels.forEach((t, i) => { if (t === null) return; s += `<text x="${xOf(p[i].date).toFixed(1)}" y="${H - 10}" font-size="10" fill="#6b7280" text-anchor="middle">${escXml(t)}</text>`; });
  return s + svgClose();
}
```
`src/ig/section.ts`: フォロワーカードを
```ts
const fs = summarizeFollowers(d.followers);
const signed = (n: number | null) => n === null ? '—' : `${n > 0 ? '+' : ''}${n.toLocaleString('ja-JP')}`;
const mini = (label: string, value: string) => `<div style="flex:1;min-width:120px;background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:8px 10px"><div style="font-size:11px;color:var(--muted)">${esc(label)}</div><div style="font-size:18px;font-weight:700">${esc(value)}</div></div>`;
`<div class="card"><h2>フォロワー推移<span class="p-note">毎日1:00に自動記録（9/6以前は閲覧日のみ）</span></h2>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${mini('現在', fs.current === null ? '—' : `${fs.current.toLocaleString('ja-JP')}人`)}${mini('蓄積開始からの増減', signed(fs.sinceStart))}${mini('直近30日の増減', signed(fs.last30))}</div>
${renderFollowerChart(d.followers)}</div>`
```
に置換（`renderTrendChart(followerTp)` と `followerTp` は削除）。
- [ ] **Step 4: GREEN確認**
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: フォロワー推移を専用チャート（日付比例・ズーム・前回比棒）とミニKPIに"`

---

### Task 3: Instagram インサイトの拡充

**Files:** Modify `src/ig/insights.ts`（全面）, `src/ig/section.ts`, `src/handlers.ts` / Test `test/ig-insights.test.ts`（全面）, `test/ig-section.test.ts`, `test/ig-home.test.ts`（フィクスチャ）

**Interfaces（Produces）:**
```ts
buildIgInsights(input: { period: Period; followers: {date,count}[]; reach: IgSeriesPoint[]; posts: IgPostRow[]; media: IgMedia[]; overlay: SocialPoint[] }): InsightGroup[]
```
`SocialData.insights: InsightGroup[]`。section は `renderInsightGroups`。handlers は `media`（25件・`IgMedia[]`）と `period` を渡す（現在 `media: { timestamp: string }[]` 型なら `IgMedia[]` に広げる）。

- [ ] **Step 1: 失敗するテストを書く**（`test/ig-insights.test.ts` 全面）
```ts
import { describe, it, expect } from 'vitest';
import { buildIgInsights } from '../src/ig/insights.js';
import { resolvePeriod } from '../src/period.js';
const period = resolvePeriod('2026', '2026-09-06');
const post = (id: string, ts: string, mediaType: string, reach: number, likes: number, saved: number, caption = 'c' + id) =>
  ({ id, caption, timestamp: ts, mediaType, permalink: '', reach, likes, comments: 0, saved, engagement: likes + saved });
const base = {
  period,
  followers: [{ date: '2026-07-18', count: 3788 }, { date: '2026-09-06', count: 3851 }],
  reach: Array.from({ length: 10 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, value: i < 5 ? 100 : 200 })),
  posts: [post('1', '2026-08-01T00:00:00+0900', 'VIDEO', 1000, 50, 40, '湖のリール'), post('2', '2026-08-10T00:00:00+0900', 'IMAGE', 500, 30, 5), post('3', '2026-08-20T00:00:00+0900', 'IMAGE', 500, 20, 5)],
  media: [
    { id: '1', caption: '湖のリール', timestamp: '2026-08-01T00:00:00+0900', mediaType: 'VIDEO', permalink: '' },
    { id: '2', caption: '', timestamp: '2026-08-10T00:00:00+0900', mediaType: 'IMAGE', permalink: '' },
    { id: '3', caption: '', timestamp: '2026-08-20T00:00:00+0900', mediaType: 'IMAGE', permalink: '' },
    { id: '4', caption: '', timestamp: '2026-07-05T00:00:00+0900', mediaType: 'CAROUSEL_ALBUM', permalink: '' },
  ],
  overlay: [{ bucket: '2026-05', posts: 1, bookings: 20 }, { bucket: '2026-06', posts: 4, bookings: 40 }, { bucket: '2026-07', posts: 1, bookings: 22 }, { bucket: '2026-08', posts: 5, bookings: 44 }],
};
const text = (g: ReturnType<typeof buildIgInsights>, t: string) => g.find(x => x.title === t)!.items.map(i => i.text + (i.hint ? ' ' + i.hint : '')).join('\n');
const titles = (g: ReturnType<typeof buildIgInsights>) => g.map(x => x.title);
describe('buildIgInsights', () => {
  it('5グループ', () => { expect(titles(buildIgInsights(base))).toEqual(['フォロワー', 'リーチ', '投稿', '投稿×参加', '投稿タイプ']); });
  it('フォロワー: 増減・1日平均・hint', () => {
    const t = text(buildIgInsights(base), 'フォロワー');
    expect(t).toContain('現在 3,851人。蓄積開始（2026-07-18）から +63人（1日あたり +1.3）');
    expect(t).toContain('→ 緩やかに増加');
  });
  it('リーチ: 合計・平均・最大日・後半伸び', () => {
    const t = text(buildIgInsights(base), 'リーチ');
    expect(t).toContain('直近10日 計1,500（1日平均 150）');
    expect(t).toContain('最大は 8/6（200）');
    expect(t).toContain('→ 直近の投稿が届いている');
  });
  it('投稿: 件数・保存率・最高投稿', () => {
    const t = text(buildIgInsights(base), '投稿');
    expect(t).toContain('期間内の投稿 4件');
    expect(t).toContain('保存率 2.5%'); // (40+5+5)/(1000+500+500)
    expect(t).toContain('最高は「湖のリール」');
  });
  it('投稿×参加: 多い月と少ない月', () => {
    const t = text(buildIgInsights(base), '投稿×参加');
    expect(t).toContain('投稿が多い月の参加は平均 42件、少ない月は 21件');
    expect(t).toContain('→ 投稿量と参加に相関の傾向');
  });
  it('投稿タイプ: 内訳と平均リーチ', () => {
    const t = text(buildIgInsights(base), '投稿タイプ');
    expect(t).toContain('画像 2・動画（リール）1・カルーセル 1');
    expect(t).toContain('平均リーチ: 動画（リール） 1,000 / 画像 500');
    expect(t).toContain('→ 動画（リール）が最も届いている');
  });
  it('データ不足なら省略', () => {
    const g = buildIgInsights({ ...base, followers: [{ date: '2026-09-06', count: 5 }], reach: [], posts: [], media: [], overlay: [] });
    expect(text(g, 'フォロワー')).toBe('現在 5人');
    expect(titles(g)).toEqual(['フォロワー']);
  });
});
```
- [ ] **Step 2: RED確認**
- [ ] **Step 3: 実装**（`src/ig/insights.ts` 全面。数式・文言はテストに一致させる。要点:）
- フォロワー: `summarizeFollowers` を使用。perDay 表示は小数1桁 `+1.3`。hint 閾値: ≥1→増加／≤−0.5→減少／他→ほぼ横ばい。
- リーチ: `n = reach.length`（≥4）。合計・平均（四捨五入）・最大日 `M/D`。前半＝先頭 floor(n/2)、後半＝残り。
- 投稿: 期間内 media 件数。週あたりは（期間内最古投稿日〜period.end の日数 ≥ 7 のとき）`（週 X.X件）` を件数の後に付ける。保存率 = Σsaved/Σreach（reach>0 の posts）小数1桁%。最高投稿 = engagement 最大（posts[0] が降順なら先頭）。
- 投稿×参加: overlay 月 ≥4。中央値 = posts をソートした中央（偶数は上位側 index n/2 の値）。多い群 = posts ≥ 中央値、少ない群 = 未満。両群非空のとき平均（四捨五入）。hint 閾値 A ≥ B×1.2。
- 投稿タイプ: `typeJa = { IMAGE:'画像', VIDEO:'動画（リール）', CAROUSEL_ALBUM:'カルーセル' }`。内訳は media 全件を件数降順で `・` 連結。平均リーチは posts（reach>0）を種別平均、2種以上のとき降順 ` / ` 連結、hint は最大の種別。
- `section.ts`: インサイトカードを `${renderInsightGroups(d.insights)}` に。`SocialData.insights: InsightGroup[]`。
- `handlers.ts`: IG ブロックで `buildIgInsights({ period, followers, reach, posts, media, overlay })`（`media` は `toMediaList` 等既存の変換結果 `IgMedia[]` を保持して渡す）。
- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`（ig-home/ig-section フィクスチャの `insights` を `InsightGroup[]` に）
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: Instagramインサイトを5グループの数字＋示唆に拡充"`

---

### Task 4: 仕上げ検証（コントローラ）
- [ ] 全体テスト green・ローカルで IG 未接続表示が不変・`wrangler deploy --dry-run` で triggers が認識されること・Opus最終レビュー → 修正 → デバイス表修正と合わせてユーザー承認後デプロイ
