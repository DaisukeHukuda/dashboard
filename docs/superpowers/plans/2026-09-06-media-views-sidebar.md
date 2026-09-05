# メディア別ビュー切替＋媒体色分け Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 左サイドバー（スマホは上部タブ）で「予約分析/Webサイト/Instagram/すべて」の4ビューを切り替え、カードにメディア色を付け、非表示ビューの外部API取得をスキップする。

**Architecture:** ビュー状態はURLクエリ `?view=`（SSR・既定bookings）。`sections.ts` にメディア対応とビュー絞り込みの純関数を追加し、`handleHome` が view を解決して GA4/IG 取得をゲート、`renderDashboard` が絞り込み描画＋サイドバー＋`data-media` を出力。並び替えUIは all ビューのみ。

**Tech Stack:** TypeScript / Cloudflare Workers / vitest。スペック: `docs/superpowers/specs/2026-09-06-media-views-sidebar-design.md`

## Global Constraints

- 外部ライブラリ追加禁止 / UI文言は日本語 / `DATA` KV read-only
- ビューID: `'bookings' | 'web' | 'sns' | 'all'`・既定 `bookings`・不正値は `bookings`
- メディア色: booking=`#1e3a5f` / web=`#16a34a` / sns=`#db2777`
- 各タスクは `npm run typecheck && npm test` 全件green後にコミット（main直・日本語メッセージ）

---

### Task 1: sections.ts にビュー/メディア定義

**Files:**
- Modify: `src/sections.ts`
- Test: `test/sections.test.ts`

**Interfaces:**
- Produces:
  - `type MediaId = 'booking' | 'web' | 'sns'`
  - `MEDIA_OF: Record<SectionId, MediaId>`（kpi/insights/trend/heatmap/cohort/course/source→'booking', ga4→'web', ig→'sns'）
  - `type ViewId = 'bookings' | 'web' | 'sns' | 'all'`
  - `resolveView(param: string | null): ViewId`（不正/nullは 'bookings'）
  - `sectionsForView(order: SectionId[], view: ViewId): SectionId[]`（allは全件・他はメディアで絞り込み・入力順維持）

- [ ] **Step 1: 失敗するテストを書く**

`test/sections.test.ts` に追加（importに `MEDIA_OF, resolveView, sectionsForView` を追記）:

```ts
describe('views', () => {
  it('resolveView は不正値・nullで bookings', () => {
    expect(resolveView(null)).toBe('bookings');
    expect(resolveView('zzz')).toBe('bookings');
    expect(resolveView('web')).toBe('web');
    expect(resolveView('sns')).toBe('sns');
    expect(resolveView('all')).toBe('all');
  });
  it('sectionsForView は保存順を維持して絞り込む', () => {
    const custom = [...DEFAULT_ORDER].reverse();
    expect(sectionsForView(custom, 'all')).toEqual(custom);
    expect(sectionsForView(custom, 'web')).toEqual(['ga4']);
    expect(sectionsForView(custom, 'sns')).toEqual(['ig']);
    expect(sectionsForView(custom, 'bookings')).toEqual(custom.filter(id => MEDIA_OF[id] === 'booking'));
    expect(sectionsForView(custom, 'bookings')).toHaveLength(7);
  });
});
```

- [ ] **Step 2: RED確認** Run: `npx vitest run test/sections.test.ts` → FAIL（未エクスポート）

- [ ] **Step 3: 実装**

`src/sections.ts` 末尾に追加:

```ts
// メディア分類（サイドバーの色・カード左ボーダー・ビュー絞り込みに使用）
export type MediaId = 'booking' | 'web' | 'sns';
export const MEDIA_OF: Record<SectionId, MediaId> = {
  kpi: 'booking', insights: 'booking', trend: 'booking', heatmap: 'booking',
  cohort: 'booking', course: 'booking', source: 'booking',
  ga4: 'web', ig: 'sns',
};

// 表示ビュー。URLクエリ ?view= で切替（既定=予約分析）
export type ViewId = 'bookings' | 'web' | 'sns' | 'all';
const VIEW_IDS: readonly string[] = ['bookings', 'web', 'sns', 'all'];

export function resolveView(param: string | null): ViewId {
  return VIEW_IDS.includes(param ?? '') ? (param as ViewId) : 'bookings';
}

export function sectionsForView(order: SectionId[], view: ViewId): SectionId[] {
  if (view === 'all') return order;
  const media: MediaId = view === 'bookings' ? 'booking' : view === 'web' ? 'web' : 'sns';
  return order.filter(id => MEDIA_OF[id] === media);
}
```

- [ ] **Step 4: GREEN確認** Run: `npm run typecheck && npx vitest run` → 全件PASS
- [ ] **Step 5: コミット** `git add src/sections.ts test/sections.test.ts && git commit -m "feat: ビュー/メディア定義とビュー絞り込み(sections.ts)"`

---

### Task 2: handleHome の view 解決と外部取得ゲーティング

**Files:**
- Modify: `src/handlers.ts`, `src/pages.ts`（`DashboardData.view` 追加のみ）
- Test: `test/routing.test.ts`, `test/dashboard.test.ts`（フィクスチャに `view` 追加）

**Interfaces:**
- Consumes: Task 1 の `resolveView` / `ViewId`
- Produces: `DashboardData.view: ViewId`（必須）。GA4取得は `view==='web'||view==='all'` のときのみ・IG取得は `view==='sns'||view==='all'` のときのみ（かつ従来どおりSecrets設定時のみ）。

- [ ] **Step 1: 失敗するテストを書く**

`test/dashboard.test.ts`: フィクスチャ（base）に `view: 'all' as const,` を追加（既存テストは all 前提で従来の全件描画を維持）。

`test/routing.test.ts` に追加（`vi` はimport済み。IG Secretsを持つ env を関数内で作る）:

```ts
  it('view=bookings ではIGの外部fetchが発生せず、view=sns では発生する', async () => {
    const envIg: Env = { DATA: fakeKV(), DASH: fakeKV(), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret', IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '17841000000000000' };
    const form = new URLSearchParams({ username: 'admin', password: 'pw' });
    const login = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), envIg);
    const cookie = cookieOf(login);
    const spy = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', spy);
    const home1 = await worker.fetch(new Request('https://x/?view=bookings', { headers: { cookie } }), envIg);
    expect(home1.status).toBe(200);
    expect(spy).not.toHaveBeenCalled(); // 予約分析ビューは外部API 0回
    const home2 = await worker.fetch(new Request('https://x/?view=sns', { headers: { cookie } }), envIg);
    expect(home2.status).toBe(200);
    expect(spy).toHaveBeenCalled(); // IGビューでは取得を試みる（失敗しても未接続表示で200）
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('view未指定は予約分析（7ブロック・ga4/igなし）', async () => {
    const form = new URLSearchParams({ username: 'admin', password: 'pw' });
    const login = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), env);
    const cookie = cookieOf(login);
    const home = await worker.fetch(new Request('https://x/', { headers: { cookie } }), env);
    const text = await home.text();
    const ids = [...text.matchAll(/data-sec="([a-z0-9]+)"/g)].map(m => m[1]);
    expect(ids).toHaveLength(7);
    expect(ids).not.toContain('ga4');
    expect(ids).not.toContain('ig');
  });
```

**注意**: 既存の routing テスト（保存→反映のdata-sec全9件チェック等）は view 既定変更で7件になり壊れるため、該当リクエストURLを `https://x/?view=all` に更新する（理由: 既定ビュー変更に伴うテスト前提の更新）。

- [ ] **Step 2: RED確認** Run: `npx vitest run test/routing.test.ts` → FAIL

- [ ] **Step 3: 実装**

`src/pages.ts`: import に `type ViewId` を追加し、`DashboardData` に `view: ViewId;` を追加（描画側の絞り込みは Task 3。ここでは型のみ）。

`src/handlers.ts`:
- import に `resolveView` を追加（`./sections.js` から）
- `handleHome` 冒頭付近に `const view = resolveView(url.searchParams.get('view'));`
- GA4ブロックの条件 `if (env.GA4_SA_JSON_B64 && env.GA4_PROPERTY_ID) {` → `if ((view === 'web' || view === 'all') && env.GA4_SA_JSON_B64 && env.GA4_PROPERTY_ID) {`
- IGブロックの条件（`env.IG_ACCESS_TOKEN && env.IG_USER_ID` の判定箇所）→ 先頭に `(view === 'sns' || view === 'all') && ` を追加
- `renderDashboard({ … })` に `view,` を追加

- [ ] **Step 4: GREEN確認** Run: `npm run typecheck && npx vitest run` → 全件PASS
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: viewパラメータ解決とGA4/IG取得のビュー別ゲーティング"`

---

### Task 3: サイドバー/タブUI・ビュー絞り込み描画・媒体色

**Files:**
- Modify: `src/pages.ts`
- Test: `test/dashboard.test.ts`

**Interfaces:**
- Consumes: Task 1 の `MEDIA_OF` / `sectionsForView`、Task 2 の `DashboardData.view`
- Produces: HTML構造が `<header>…</header><div class="shell"><nav class="side">…</nav><main>…</main></div>` に変わる。`<section class="sec" data-sec data-media>`。並び替えボタン/バーは view==='all' のみ。

- [ ] **Step 1: 失敗するテストを書く**

`test/dashboard.test.ts` に追加:

```ts
  it('bookingsビューは7ブロックのみ・並び替えUIなし', () => {
    const html = renderDashboard({ ...base, view: 'bookings' });
    const ids = [...html.matchAll(/data-sec="([a-z0-9]+)"/g)].map(m => m[1]);
    expect(ids).toHaveLength(7);
    expect(html).not.toContain('id="reorderBtn"');
    expect(html).not.toContain('id="reorderBar"');
  });
  it('allビューは9ブロック＋並び替えUIあり', () => {
    const html = renderDashboard({ ...base, view: 'all' });
    expect([...html.matchAll(/data-sec="/g)]).toHaveLength(9);
    expect(html).toContain('id="reorderBtn"');
  });
  it('サイドバー: 4リンク・現在ビューがactive・periodを引き継ぐ', () => {
    const html = renderDashboard({ ...base, view: 'web', period: resolvePeriod('last24', '2026-09-05') });
    expect(html).toContain('class="side"');
    expect(html).toMatch(/<a[^>]*href="\/\?view=web[^"]*"[^>]*class="[^"]*active/);
    expect(html).toContain('view=bookings');
    expect(html).toContain('view=sns');
    expect(html).toContain('view=all');
    expect((html.match(/period=last24/g) ?? []).length).toBeGreaterThanOrEqual(4); // 4リンクすべてが期間を引き継ぐ
  });
  it('data-media が付与される', () => {
    const html = renderDashboard({ ...base, view: 'all' });
    expect(html).toContain('data-sec="kpi" data-media="booking"');
    expect(html).toContain('data-sec="ga4" data-media="web"');
    expect(html).toContain('data-sec="ig" data-media="sns"');
  });
  it('期間フォームとコースフォームが view を引き継ぐ', () => {
    const html = renderDashboard({ ...base, view: 'web' });
    expect((html.match(/name="view" value="web"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
```

（`data-sec="kpi" data-media="booking"` の属性順は実装と一致させる。gToggle の view 引き継ぎは bookings ビューのテストで `expect(html).toContain('view=bookings')` が実質カバー）

- [ ] **Step 2: RED確認** Run: `npx vitest run test/dashboard.test.ts` → FAIL

- [ ] **Step 3: 実装**

`src/pages.ts`:

(1) import に `MEDIA_OF, sectionsForView, type ViewId` を追加。

(2) layout CSS に追加:

```css
:root{--m-booking:#1e3a5f;--m-web:#16a34a;--m-sns:#db2777}
.shell{display:flex;align-items:flex-start}
.side{width:180px;flex:none;position:sticky;top:0;padding:12px 8px}
.side a{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;text-decoration:none;color:var(--ink);font-size:14px;min-height:44px}
.side a.active{background:#fff;font-weight:700;border:1px solid var(--line)}
.dot{width:10px;height:10px;border-radius:50%;flex:none}
main{flex:1;min-width:0}
section[data-media="booking"] .card{border-left:4px solid var(--m-booking)}
section[data-media="web"] .card{border-left:4px solid var(--m-web)}
section[data-media="sns"] .card{border-left:4px solid var(--m-sns)}
@media(max-width:899px){
.shell{display:block}
.side{display:flex;width:auto;position:sticky;top:0;z-index:15;background:var(--bg);overflow-x:auto;padding:8px;gap:4px;border-bottom:1px solid var(--line)}
.side a{white-space:nowrap;min-height:40px;padding:8px 10px}
body.reorder #reorderBar{top:56px}
}
```

（既存 `main{max-width:…}` 等の指定がある場合は `.shell` 配下でも崩れないよう既存値を維持したまま上記を追記）

(3) `renderDashboard` 内、`periodSelect(d.period)` 呼び出しは `periodSelect(d.period, d.view)` に変更し、`periodSelect` を:

```ts
function periodSelect(period: Period, view: ViewId): string {
```

にして form 内に `<input type="hidden" name="view" value="${view}">` を追加。

(4) ヒートマップの course フォーム（sections辞書 heatmap 内）にも `<input type="hidden" name="view" value="${d.view}">` を追加。

(5) `gToggle` の URLSearchParams に `params.set('view', d.view);` を追加。

(6) サイドバー生成（renderDashboard 内）:

```ts
  const viewQuery = (v: ViewId) => {
    const p = new URLSearchParams();
    p.set('view', v);
    p.set('period', d.period.kind === 'year' ? d.period.start.slice(0, 4) : d.period.kind);
    if (d.selectedCourse) p.set('course', d.selectedCourse);
    if (d.granularity !== 'month') p.set('g', d.granularity);
    return `/?${p.toString()}`;
  };
  const navItem = (v: ViewId, label: string, dotColor: string) =>
    `<a href="${viewQuery(v)}" class="${d.view === v ? 'active' : ''}"><span class="dot" style="background:${dotColor}"></span>${label}</a>`;
  const sideNav = `<nav class="side">
${navItem('bookings', '予約分析', 'var(--m-booking)')}
${navItem('web', 'Webサイト', 'var(--m-web)')}
${navItem('sns', 'Instagram', 'var(--m-sns)')}
${navItem('all', 'すべて', '#6b7280')}
</nav>`;
```

(7) セクション絞り込み＋data-media（既存 `orderedSections` を変更）:

```ts
  const visible = sectionsForView(d.sectionOrder, d.view);
  const orderedSections = visible
    .map(id => `<section class="sec" data-sec="${id}" data-media="${MEDIA_OF[id]}">${secTools}${sections[id]}</section>`)
    .join('\n');
```

(8) 並び替えUIの all 限定: ヘッダーの `<button id="reorderBtn">…</button>` と `<div id="reorderBar">…</div>` を `d.view === 'all' ? '…' : ''` の条件付き文字列にする（インラインJSは変更不要。`if(!btn||!bar)return;` ガードにより他ビューでは何もしない）。

(9) body 全体を shell 構造に:

```ts
  const body = `<header>…（既存のまま・reorderBtn部分のみ条件付き）…</header>
<div class="shell">
${sideNav}
<main>
（既存の period カード〜orderedSections〜script。reorderBar は条件付き）
</main>
</div>`;
```

- [ ] **Step 4: GREEN確認** Run: `npm run typecheck && npx vitest run` → 全件PASS
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: メディア別ビュー切替サイドバーと媒体色分け表示"`

---

### Task 4: 仕上げ検証（コントローラ実施）

- [ ] `npm run typecheck && npm test` 全件green（件数記録）
- [ ] `npx wrangler dev --local` E2E: ログイン → (a) 既定で7ブロック・サイドバーに4項目 (b) `?view=web`/`?view=sns`/`?view=all` の data-sec 構成 (c) ビュー切替リンクが period を引き継ぐ (d) allのみ並び替えUI (e) カード左ボーダーの媒体色 (f) 予約分析ビューの応答が体感高速（外部API 0回）
- [ ] ブラウザ（Browser pane）で PC幅/スマホ幅の両方のナビ表示を目視確認
- [ ] レポート後、ユーザー承認を得てデプロイ
