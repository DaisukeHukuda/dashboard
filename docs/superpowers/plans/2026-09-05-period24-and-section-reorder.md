# 直近24ヶ月＋セクション並び替え Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 期間セレクタに「直近24ヶ月」を追加し、ダッシュボードの10セクションを↑↓ボタンで並び替えてサーバー側（DASH KV）に保存できるようにする。

**Architecture:** SSR（Cloudflare Worker・外部ライブラリなし）を維持。並び順は `DASH` KV の `ui:sectionOrder` に保存し、`handleHome` が読み込んで SSR 時に適用（ちらつきなし）。並び替えUIはインラインJSでDOM移動し、「完了」で `POST /api/section-order`。24ヶ月は `Period.kind 'last24'` を追加し、KPI比較は「前24ヶ月」（`priorPeriod`）、トレンド前年重ねは非表示にする。

**Tech Stack:** TypeScript / Cloudflare Workers / vitest。スペック: `docs/superpowers/specs/2026-09-05-period24-and-section-reorder-design.md`

## Global Constraints

- 外部ライブラリ追加禁止（グラフ・JSとも自前実装）
- `DATA` KV は read-only（書き込みは `DASH` のみ）
- UI文言は日本語
- 各タスクは `npm run typecheck && npm test` が全件 green になってからコミット
- コミットは main 直コミット・メッセージは日本語（既存慣習）
- テストのフェイクKVは `test/routing.test.ts` の `fakeKV()` パターンを踏襲

---

### Task 1: Period に last24 を追加

**Files:**
- Modify: `src/period.ts`
- Test: `test/period.test.ts`

**Interfaces:**
- Produces: `Period.kind` に `'last24'` が増える。`resolvePeriod('last24', today)`。新関数 `priorPeriod(p: Period): Period`（last24 は -24ヶ月、他は -12ヶ月シフト）。既存 `priorYear` は変更しない（trend の前年マップで引き続き使用）。

- [ ] **Step 1: 失敗するテストを書く**

`test/period.test.ts` の `describe('resolvePeriod', …)` 内に追加:

```ts
  it('last24 spans 24 months back from today', () => {
    const p = resolvePeriod('last24', '2026-09-05');
    expect(p.kind).toBe('last24');
    expect(p.start).toBe('2024-09-06');
    expect(p.end).toBe('2026-09-05');
    expect(p.label).toBe('直近24ヶ月');
  });
```

ファイル末尾に追加（import に `priorPeriod` を追記: `import { resolvePeriod, priorYear, priorPeriod, inPeriod, filterPeriod } from '../src/period.js';`）:

```ts
describe('priorPeriod', () => {
  it('last24 は 24ヶ月シフト（現行窓と重ならない）', () => {
    const p = resolvePeriod('last24', '2026-09-05');
    const q = priorPeriod(p);
    expect(q.start).toBe('2022-09-06');
    expect(q.end).toBe('2024-09-05');
  });
  it('last12 は priorYear と同じ窓', () => {
    const p = resolvePeriod('last12', '2026-09-05');
    const q = priorPeriod(p);
    expect(q.start).toBe(priorYear(p).start);
    expect(q.end).toBe(priorYear(p).end);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/period.test.ts`
Expected: FAIL（`priorPeriod` が未エクスポート／last24 が last12 扱いで start 不一致）

- [ ] **Step 3: 最小実装**

`src/period.ts`:

kind の型を変更:

```ts
export interface Period { start: string; end: string; label: string; kind: 'last12' | 'last24' | 'year' | 'all'; }
```

`resolvePeriod` の `if (param === 'all')` ブロックの直後に追加:

```ts
  if (param === 'last24') {
    const start = addDaysToYmd(addMonthsToYmd(today, -24), 1);
    return { start, end: today, label: '直近24ヶ月', kind: 'last24' };
  }
```

`priorYear` の下に追加:

```ts
// 窓の長さぶん過去へずらした比較期間。last24 は -24ヶ月（-12だと現行窓と重複し比較にならない）。
export function priorPeriod(p: Period): Period {
  const months = p.kind === 'last24' ? 24 : 12;
  return {
    start: addMonthsToYmd(p.start, -months),
    end: addMonthsToYmd(p.end, -months),
    label: `${p.label}（前期間）`,
    kind: p.kind,
  };
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run typecheck && npx vitest run test/period.test.ts`
Expected: PASS（typecheck も green）

- [ ] **Step 5: コミット**

```bash
git add src/period.ts test/period.test.ts
git commit -m "feat: 期間に直近24ヶ月(last24)とpriorPeriodを追加"
```

---

### Task 2: KPI比較とトレンド前年重ねを last24 に対応

**Files:**
- Modify: `src/metrics/kpi.ts`（`priorYear` → `priorPeriod`）
- Modify: `src/metrics/trend.ts`（last24 で前年重ねを全null）
- Test: `test/kpi.test.ts`, `test/trend.test.ts`

**Interfaces:**
- Consumes: Task 1 の `priorPeriod(p: Period): Period`
- Produces: 挙動変更のみ（シグネチャ不変）。`computeKpi` は last24 のとき前24ヶ月と比較。`priorYearSeries` は `period.kind === 'last24'` のとき全 `null`。

- [ ] **Step 1: 失敗するテストを書く**

`test/kpi.test.ts` の describe 内に追加（既存のレコード生成ヘルパがあればそれを使い、無ければ以下のローカルヘルパをテスト内に定義）:

```ts
  it('last24 は前24ヶ月と比較する（現行窓と重複しない）', () => {
    const h24 = (date: string, amount: number): HistoryRecord =>
      ({ date, course: 'A', pax: 1, amount, status: '完了', phoneHash: 'x' } as HistoryRecord);
    const recs = [
      h24('2026-08-01', 10000), // 現行24ヶ月内
      h24('2025-09-01', 20000), // 現行24ヶ月内（-12ヶ月シフトだと誤って比較側に入る位置）
      h24('2023-01-01', 5000),  // 前24ヶ月内
    ];
    const p = resolvePeriod('last24', '2026-09-05');
    const k = computeKpi(recs, p);
    expect(k.revenue).toBe(30000);
    expect(k.yoyRevenue).toBe(6); // 30000 / 5000
  });
```

（import が無ければ `import { resolvePeriod } from '../src/period.js';` と `import type { HistoryRecord } from '../src/types.js';` を追加。`as HistoryRecord` は status 等がリテラル型の場合の型合わせ。既存のレコード生成ヘルパがファイルにあるならそちらを使ってよい。）

`test/trend.test.ts` の describe 内に追加:

```ts
  it('last24 では前年重ねを描かない（全null）', () => {
    const recs = [
      { date: '2026-08-01', course: 'A', pax: 1, amount: 1000, status: '完了', phoneHash: 'x' },
      { date: '2025-08-01', course: 'A', pax: 1, amount: 1000, status: '完了', phoneHash: 'x' },
    ] as HistoryRecord[];
    const p = resolvePeriod('last24', '2026-09-05');
    const points = computeTrend(recs, p, 'month');
    const prior = priorYearSeries(recs, p, 'month', points);
    expect(prior.length).toBe(points.length);
    expect(prior.every(v => v === null)).toBe(true);
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/kpi.test.ts test/trend.test.ts`
Expected: FAIL（kpi: yoyRevenue が 6 にならない／trend: null でない月がある）

- [ ] **Step 3: 最小実装**

`src/metrics/kpi.ts`: import を変更し、比較期間を差し替え:

```ts
import { type Period, filterPeriod, priorPeriod } from '../period.js';
```

```ts
  const prev = filterPeriod(all, priorPeriod(period));
```

（`priorYear` の import は kpi.ts から削除）

`src/metrics/trend.ts` の `priorYearSeries` 冒頭、`if (gran !== 'month')` の直後に追加:

```ts
  if (period.kind === 'last24') return points.map(() => null); // 24ヶ月窓は前年を自身に含むため重ねない
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run typecheck && npx vitest run`
Expected: 全件 PASS（既存の last12/year のKPI・トレンドのテストが回帰していないこと）

- [ ] **Step 5: コミット**

```bash
git add src/metrics/kpi.ts src/metrics/trend.ts test/kpi.test.ts test/trend.test.ts
git commit -m "feat: last24のKPI比較を前24ヶ月に・トレンド前年重ねを非表示に"
```

---

### Task 3: 期間セレクタと比較ラベルのUI対応

**Files:**
- Modify: `src/pages.ts`（`periodSelect` に選択肢追加・KPIカードの比較ラベル切替）
- Test: `test/dashboard.test.ts`

**Interfaces:**
- Consumes: Task 1 の `kind 'last24'`
- Produces: UI変更のみ。`renderDashboard` のシグネチャ不変。

- [ ] **Step 1: 失敗するテストを書く**

`test/dashboard.test.ts` に追加。このファイルには `renderDashboard` に渡す `DashboardData` のフィクスチャが既にある（ファイル冒頭を確認して変数名を合わせること）。フィクスチャを `base` と仮定:

```ts
  it('直近24ヶ月の選択肢と前24ヶ月比ラベル', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('last24', '2026-09-05') });
    expect(html).toContain('>直近24ヶ月<');
    expect(html).toContain('前24ヶ月比');
    expect(html).not.toContain('>前年比'); // KPIカードのサブラベルが切り替わっていること（インサイト等の文中は対象外のため素の「前年比」では判定しない）
  });
  it('last12 では従来どおり前年比ラベル', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('last12', '2026-09-05') });
    expect(html).toContain('前年比');
  });
```

（`resolvePeriod` の import が無ければ追加）

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/dashboard.test.ts`
Expected: FAIL（「直近24ヶ月」「前24ヶ月比」が無い）

- [ ] **Step 3: 最小実装**

`src/pages.ts` の `periodSelect` 内、`${opt('last12', …)}` の次の行に追加:

```ts
${opt('last24', '直近24ヶ月', cur === 'last24')}
```

`renderDashboard` の KPI カード生成を比較ラベル可変に変更:

```ts
  const cmp = d.period.kind === 'last24' ? '前24ヶ月比' : '前年比';
  const kpis = [
    kpiCard('予約件数', `${k.bookings}件`, `${cmp} ${yoyLabel(k.yoyBookings)}`),
    kpiCard('売上', yen(k.revenue), `${cmp} ${yoyLabel(k.yoyRevenue)}`),
    kpiCard('客単価', yen(k.avgPerBooking)),
    kpiCard('参加人数', `${k.pax}名`),
    kpiCard('リピート率', `${Math.round(k.repeatRate * 100)}%`, `新規${k.newCount} / リピート${k.repeatCount}`),
  ].join('');
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run typecheck && npx vitest run`
Expected: 全件 PASS

- [ ] **Step 5: コミット**

```bash
git add src/pages.ts test/dashboard.test.ts
git commit -m "feat: 期間セレクタに直近24ヶ月・KPI比較ラベルを前24ヶ月比に切替"
```

---

### Task 4: sections モジュール（ID定義・並び順マージ・検証）

**Files:**
- Create: `src/sections.ts`
- Test: `test/sections.test.ts`（新規）

**Interfaces:**
- Produces:
  - `SECTION_IDS: readonly ['kpi','insights','trend','heatmap','weather','cohort','course','source','ga4','ig']`
  - `type SectionId = typeof SECTION_IDS[number]`
  - `DEFAULT_ORDER: SectionId[]`（SECTION_IDS と同順）
  - `applyOrder(saved: unknown): SectionId[]` — 保存値（未検証）から表示順を決める純関数
  - `isValidOrder(order: unknown): order is SectionId[]` — 全10IDの完全な並べ替えか
  - `SECTION_ORDER_KEY = 'ui:sectionOrder'`（KVキー）

- [ ] **Step 1: 失敗するテストを書く**

Create `test/sections.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SECTION_IDS, DEFAULT_ORDER, applyOrder, isValidOrder } from '../src/sections.js';

describe('sections', () => {
  it('SECTION_IDS は10ブロック', () => {
    expect(SECTION_IDS).toEqual(['kpi','insights','trend','heatmap','weather','cohort','course','source','ga4','ig']);
  });

  describe('applyOrder', () => {
    it('保存なし・不正・空は既定順', () => {
      expect(applyOrder(null)).toEqual(DEFAULT_ORDER);
      expect(applyOrder('broken')).toEqual(DEFAULT_ORDER);
      expect(applyOrder([])).toEqual(DEFAULT_ORDER);
      expect(applyOrder([123, {}])).toEqual(DEFAULT_ORDER);
    });
    it('完全な保存順はそのまま使う', () => {
      const rev = [...DEFAULT_ORDER].reverse();
      expect(applyOrder(rev)).toEqual(rev);
    });
    it('未知IDは無視し重複は除去する', () => {
      const withJunk = ['zzz', ...DEFAULT_ORDER, 'kpi'];
      expect(applyOrder(withJunk)).toEqual(DEFAULT_ORDER);
    });
    it('保存に無い既定ID（将来の新セクション相当）は既定順の直前IDの直後に入る', () => {
      const savedWithoutWeather = DEFAULT_ORDER.filter(id => id !== 'weather').reverse();
      const result = applyOrder(savedWithoutWeather);
      // weather は既定順で heatmap の直後
      expect(result.indexOf('weather')).toBe(result.indexOf('heatmap') + 1);
      expect(result.length).toBe(DEFAULT_ORDER.length);
    });
  });

  describe('isValidOrder', () => {
    it('全10IDの並べ替えのみ許可', () => {
      expect(isValidOrder([...DEFAULT_ORDER].reverse())).toBe(true);
      expect(isValidOrder(DEFAULT_ORDER.slice(1))).toBe(false);          // 不足
      expect(isValidOrder([...DEFAULT_ORDER, 'kpi'])).toBe(false);       // 重複・過多
      expect(isValidOrder([...DEFAULT_ORDER.slice(0, 9), 'zzz'])).toBe(false); // 未知ID
      expect(isValidOrder('kpi')).toBe(false);                            // 非配列
    });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/sections.test.ts`
Expected: FAIL（モジュールが存在しない）

- [ ] **Step 3: 実装**

Create `src/sections.ts`:

```ts
// ダッシュボードの並び替え可能セクション。並び順は DASH KV に保存する。
export const SECTION_IDS = ['kpi', 'insights', 'trend', 'heatmap', 'weather', 'cohort', 'course', 'source', 'ga4', 'ig'] as const;
export type SectionId = (typeof SECTION_IDS)[number];
export const DEFAULT_ORDER: SectionId[] = [...SECTION_IDS];
export const SECTION_ORDER_KEY = 'ui:sectionOrder';

const KNOWN = new Set<string>(SECTION_IDS);

// 保存値（未検証のJSON parse結果）から表示順を決める。
// 1) 既知IDのみ・重複除去で基礎順を作る（削除済みセクションのIDは無視）
// 2) 保存に無い既定ID（保存後に追加された新セクション）は、既定順の直前IDの直後へ挿入
// 3) 保存なし・不正・空は既定順
export function applyOrder(saved: unknown): SectionId[] {
  if (!Array.isArray(saved)) return [...DEFAULT_ORDER];
  const base: SectionId[] = [];
  for (const id of saved) {
    if (typeof id === 'string' && KNOWN.has(id) && !base.includes(id as SectionId)) base.push(id as SectionId);
  }
  if (base.length === 0) return [...DEFAULT_ORDER];
  for (let i = 0; i < DEFAULT_ORDER.length; i++) {
    const id = DEFAULT_ORDER[i];
    if (base.includes(id)) continue;
    const prev = i > 0 ? base.indexOf(DEFAULT_ORDER[i - 1]) : -1;
    base.splice(prev + 1, 0, id);
  }
  return base;
}

// POST body の検証: 全IDの完全な並べ替え（過不足・重複・未知IDなし）のみ許可
export function isValidOrder(order: unknown): order is SectionId[] {
  return Array.isArray(order)
    && order.length === SECTION_IDS.length
    && new Set(order).size === order.length
    && order.every(id => typeof id === 'string' && KNOWN.has(id));
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run typecheck && npx vitest run test/sections.test.ts`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/sections.ts test/sections.test.ts
git commit -m "feat: セクション並び順のマージ・検証ロジック(sections.ts)"
```

---

### Task 5: SSRで保存順を適用（DashboardData・handleHome・data-sec ラップ）

**Files:**
- Modify: `src/pages.ts`（`DashboardData` に `sectionOrder` 追加・本文をセクション辞書化して順に描画）
- Modify: `src/handlers.ts`（`handleHome` が DASH KV から並び順を読む）
- Test: `test/dashboard.test.ts`

**Interfaces:**
- Consumes: Task 4 の `SectionId` / `DEFAULT_ORDER` / `applyOrder` / `SECTION_ORDER_KEY`
- Produces: `DashboardData.sectionOrder: SectionId[]`（必須フィールド）。HTMLは各ブロックを `<section class="sec" data-sec="<id>">…</section>` で包む。既存の見出し・中身は不変。

- [ ] **Step 1: 失敗するテストを書く**

`test/dashboard.test.ts`: まず既存フィクスチャ（`base` 相当）に `sectionOrder: DEFAULT_ORDER` を追加する（import: `import { DEFAULT_ORDER } from '../src/sections.js';`）。その上でテストを追加:

```ts
  it('sectionOrder の順に data-sec が並ぶ', () => {
    const order = [...DEFAULT_ORDER].reverse();
    const html = renderDashboard({ ...base, sectionOrder: order });
    const ids = [...html.matchAll(/data-sec="([a-z0-9]+)"/g)].map(m => m[1]);
    expect(ids).toEqual(order);
  });
  it('既定順では kpi が先頭', () => {
    const html = renderDashboard({ ...base, sectionOrder: [...DEFAULT_ORDER] });
    const ids = [...html.matchAll(/data-sec="([a-z0-9]+)"/g)].map(m => m[1]);
    expect(ids).toEqual(DEFAULT_ORDER);
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/dashboard.test.ts`
Expected: FAIL（`sectionOrder` が型に無い／data-sec が出力されない）

- [ ] **Step 3: 実装**

`src/pages.ts`:

import追加:

```ts
import { type SectionId } from './sections.js';
```

`DashboardData` に追加:

```ts
  sectionOrder: SectionId[];
```

`renderDashboard` の本文組み立てを変更。既存の `const body = …` テンプレート内に直書きされている各カードを、辞書 `sections` に移す（**各カードのHTML文字列は現状のまま移動するだけ。文言・構造は変えない**）:

```ts
  const sections: Record<SectionId, string> = {
    kpi: `<div class="card"><h2>KPI サマリー</h2><div style="display:flex;gap:10px;flex-wrap:wrap">${kpis}</div></div>`,
    insights: `<div class="card"><h2>戦略インサイト</h2><ul style="margin:0;padding-left:18px;font-size:14px">${insightList}</ul></div>`,
    trend: `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
<h2 style="margin:0">売上・予約トレンド（棒=売上 / 線=件数）</h2>
<span>${gToggle('month', '月次')} ${gToggle('week', '週次')}</span></div>
${renderTrendChart(d.trend, d.trendPrior)}</div>`,
    heatmap: `<div class="card"><h2>季節 × 曜日ヒートマップ</h2>
<form method="get" style="margin-bottom:8px">
<input type="hidden" name="period" value="${d.period.kind === 'year' ? d.period.start.slice(0, 4) : d.period.kind}">
<select name="course" onchange="this.form.submit()">${courseOpts}</select>
</form>${renderHeatmap(d.heatmap)}</div>`,
    weather: `<div class="card"><h2>天候相関</h2>${renderWeatherBlock(d.weather)}</div>`,
    cohort: `<div class="card"><h2>リピーター・コホート再訪率（初回月別・全期間）</h2>${renderCohortGrid(d.cohorts)}</div>`,
    course: `<div class="card"><h2>コース別内訳</h2>${renderCourseBars(d.courseRows)}</div>`,
    source: `<div class="card"><h2>流入経路（お客様の自己申告）</h2>
<p style="font-size:12px;color:var(--muted);margin:0 0 8px">予約時アンケート「ご予約の経緯」を分類したもの。sync 更新前の履歴は「不明」と表示されます。</p>
${renderCourseBars(d.sourceRows)}</div>`,
    ga4: renderTrafficSection(d.traffic),
    ig: renderSocialSection(d.social),
  };
  const orderedSections = d.sectionOrder
    .map(id => `<section class="sec" data-sec="${id}">${sections[id]}</section>`)
    .join('\n');
```

`const body = …` は期間セレクタカードの後を `${orderedSections}` に置き換える:

```ts
  const body = `<header>Sup! Sup! マーケ分析ダッシュボード <a href="/logout" style="color:#cbd5e1;font-size:12px;float:right">ログアウト</a></header>
<main>
<div class="card" style="display:flex;justify-content:space-between;align-items:center">${periodSelect(d.period)}<span style="font-size:12px;color:var(--muted)">${esc(d.period.label)}</span></div>

${orderedSections}
</main>`;
```

`src/handlers.ts`:

import追加:

```ts
import { applyOrder, SECTION_ORDER_KEY } from './sections.js';
```

`handleHome` 内、`renderDashboard` に渡すデータ組み立ての前に追加（KV障害時も既定順で描画を続行）:

```ts
  let sectionOrder = applyOrder(null);
  try {
    const rawOrder = await env.DASH.get(SECTION_ORDER_KEY);
    if (rawOrder) sectionOrder = applyOrder(JSON.parse(rawOrder));
  } catch { /* 並び順が読めなくても既定順で表示する */ }
```

`renderDashboard({ … })` の引数に `sectionOrder,` を追加。

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run typecheck && npx vitest run`
Expected: 全件 PASS（既存 dashboard/routing/smoke テストの回帰なし。data-sec 追加で文字列一致が壊れる既存テストがあれば、**見た目の変更ではないためテスト側の期待値を更新**する）

- [ ] **Step 5: コミット**

```bash
git add src/pages.ts src/handlers.ts test/dashboard.test.ts
git commit -m "feat: 保存された並び順でセクションをSSR（data-secラップ）"
```

---

### Task 6: POST /api/section-order（保存API）

**Files:**
- Modify: `src/handlers.ts`（`handleSectionOrder` 追加）
- Modify: `src/index.ts`（認証内ルート追加・未認証APIは401 JSON）
- Test: `test/routing.test.ts`

**Interfaces:**
- Consumes: Task 4 の `isValidOrder` / `SECTION_ORDER_KEY`、Task 5 のSSR適用（保存→再表示の統合テストで使用）
- Produces: `handleSectionOrder(req: Request, env: Env): Promise<Response>`。`POST /api/section-order` body `{"order": SectionId[]}` → 200 `{"ok":true}` / 400 `{"ok":false}`。未認証の `/api/*` は 401 JSON。

- [ ] **Step 1: 失敗するテストを書く**

`test/routing.test.ts` の describe 内に追加（`DEFAULT_ORDER` を import: `import { DEFAULT_ORDER, SECTION_ORDER_KEY } from '../src/sections.js';`）:

```ts
  it('未認証の /api/section-order は 401', async () => {
    const res = await worker.fetch(new Request('https://x/api/section-order', {
      method: 'POST', body: JSON.stringify({ order: [...DEFAULT_ORDER] }),
    }), env);
    expect(res.status).toBe(401);
  });

  it('並び順を保存し、次の表示に反映される', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily: { time: [], weathercode: [], temperature_2m_max: [], precipitation_sum: [] } }) }));
    const form = new URLSearchParams({ username: 'admin', password: 'pw' });
    const login = await worker.fetch(new Request('https://x/login', { method: 'POST', body: form }), env);
    const cookie = cookieOf(login);

    const saved = [...DEFAULT_ORDER].reverse();
    const post = await worker.fetch(new Request('https://x/api/section-order', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ order: saved }),
    }), env);
    expect(post.status).toBe(200);
    expect(await post.json()).toEqual({ ok: true });

    const home = await worker.fetch(new Request('https://x/', { headers: { cookie } }), env);
    const text = await home.text();
    const ids = [...text.matchAll(/data-sec="([a-z0-9]+)"/g)].map(m => m[1]);
    expect(ids).toEqual(saved);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
```

**注意**: この統合テストは同一 `env`（モジュールスコープ）を再利用するため、保存テストがKVに書いた値が他テストの表示順に影響しないよう、**保存系テストの最後に `await env.DASH.delete(SECTION_ORDER_KEY);` を入れて後始末**する。

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/routing.test.ts`
Expected: FAIL（401でなく200ログインページ／404 など）

- [ ] **Step 3: 実装**

`src/handlers.ts` に追加（import に `isValidOrder` を追記: `import { applyOrder, isValidOrder, SECTION_ORDER_KEY } from './sections.js';`）:

```ts
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export async function handleSectionOrder(req: Request, env: Env): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false }, 400); }
  const order = (body as { order?: unknown } | null)?.order;
  if (!isValidOrder(order)) return json({ ok: false }, 400);
  await env.DASH.put(SECTION_ORDER_KEY, JSON.stringify(order));
  return json({ ok: true });
}
```

`src/index.ts`:

import変更:

```ts
import { handleLogin, handleLogout, handleHome, handleSectionOrder } from './handlers.js';
```

認証チェックまわりを変更（`if (!user) …` を差し替え、認証内ルートを追加）:

```ts
  const token = getCookie(req, 'sess');
  const user = token ? await verifySession(token, env.SESSION_SECRET) : null;
  if (!user && path.startsWith('/api/')) {
    return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { 'content-type': 'application/json; charset=utf-8' } });
  }
  if (!user) return html(loginPage());

  if (path === '/' && method === 'GET') return handleHome(url, env, user.username);
  if (path === '/api/section-order' && method === 'POST') return handleSectionOrder(req, env);
  return new Response('not found', { status: 404 });
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run typecheck && npx vitest run`
Expected: 全件 PASS

- [ ] **Step 5: コミット**

```bash
git add src/handlers.ts src/index.ts test/routing.test.ts
git commit -m "feat: POST /api/section-order（並び順の保存API・未認証APIは401）"
```

---

### Task 7: 並び替えモードUI（↑↓ボタン・完了/キャンセル・インラインJS）

**Files:**
- Modify: `src/pages.ts`（layoutのCSS追加・ヘッダーボタン・secツール・編集バー・インラインJS）
- Test: `test/dashboard.test.ts`

**Interfaces:**
- Consumes: Task 5 の `<section class="sec" data-sec>` 構造、Task 6 の `POST /api/section-order`
- Produces: UIのみ。並び替えモードは `body.reorder` クラスで制御。

- [ ] **Step 1: 失敗するテストを書く**

`test/dashboard.test.ts` に追加:

```ts
  it('並び替えUI（ボタン・編集バー・保存JS）を含む', () => {
    const html = renderDashboard({ ...base, sectionOrder: [...DEFAULT_ORDER] });
    expect(html).toContain('id="reorderBtn"');
    expect(html).toContain('id="reorderBar"');
    expect(html).toContain('id="reorderSave"');
    expect(html).toContain('id="reorderCancel"');
    expect(html).toContain('/api/section-order');
    expect(html).toContain('data-dir="-1"'); // ↑ボタン
    expect(html).toContain('data-dir="1"');  // ↓ボタン
  });
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run test/dashboard.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装**

`src/pages.ts`:

(1) `layout` の `<style>` 内（既存CSSの末尾）に追加:

```css
.sec-tools{display:none;gap:8px;margin:0 0 8px}
body.reorder .sec-tools{display:flex}
.sec-tools button{min-height:44px;min-width:80px;font-size:14px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
.sec-tools button:disabled{opacity:.3}
#reorderBar{position:sticky;top:0;z-index:10;display:flex;gap:10px;align-items:center}
#reorderBar button{min-height:44px;min-width:88px;font-size:14px;border-radius:8px;border:1px solid var(--line)}
#reorderSave{background:var(--accent);color:#fff;border:none}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;z-index:20}
```

(2) `renderDashboard` のヘッダーを変更（並び替えボタン追加）:

```ts
  const body = `<header>Sup! Sup! マーケ分析ダッシュボード <span style="float:right;display:flex;gap:12px;align-items:center"><button type="button" id="reorderBtn" style="background:none;border:1px solid #cbd5e1;color:#cbd5e1;font-size:12px;border-radius:6px;padding:2px 8px;cursor:pointer">並び替え</button><a href="/logout" style="color:#cbd5e1;font-size:12px">ログアウト</a></span></header>
```

(3) 期間セレクタカードの直後（`${orderedSections}` の前）に編集バーを追加:

```ts
<div id="reorderBar" class="card" hidden>並び順を編集中：各ブロックの「↑ 上へ」「↓ 下へ」で移動 <button type="button" id="reorderSave">完了</button> <button type="button" id="reorderCancel">キャンセル</button></div>
```

(4) 各セクションにツールを挿入（Task 5 の `orderedSections` を変更）:

```ts
  const secTools = `<div class="sec-tools"><button type="button" class="mv" data-dir="-1">↑ 上へ</button><button type="button" class="mv" data-dir="1">↓ 下へ</button></div>`;
  const orderedSections = d.sectionOrder
    .map(id => `<section class="sec" data-sec="${id}">${secTools}${sections[id]}</section>`)
    .join('\n');
```

(5) `</main>` の直前にインラインJSを追加:

```ts
<script>
(function(){
  var btn=document.getElementById('reorderBtn');
  var bar=document.getElementById('reorderBar');
  if(!btn||!bar)return;
  function refresh(){
    var secs=[].slice.call(document.querySelectorAll('section.sec'));
    secs.forEach(function(s,i){
      var up=s.querySelector('[data-dir="-1"]');
      var dn=s.querySelector('[data-dir="1"]');
      if(up)up.disabled=(i===0);
      if(dn)dn.disabled=(i===secs.length-1);
    });
  }
  btn.addEventListener('click',function(){
    document.body.classList.add('reorder');bar.hidden=false;btn.hidden=true;refresh();
    window.scrollTo({top:0});
  });
  document.getElementById('reorderCancel').addEventListener('click',function(){location.reload();});
  document.addEventListener('click',function(e){
    var t=e.target;
    var b=(t&&t.closest)?t.closest('.mv'):null;
    if(!b||b.disabled)return;
    var sec=b.closest('section.sec');
    var dir=Number(b.getAttribute('data-dir'));
    var prev=sec.previousElementSibling,next=sec.nextElementSibling;
    if(dir<0&&prev&&prev.classList.contains('sec'))sec.parentNode.insertBefore(sec,prev);
    if(dir>0&&next&&next.classList.contains('sec'))sec.parentNode.insertBefore(next,sec);
    refresh();
    sec.scrollIntoView({block:'nearest'});
  });
  document.getElementById('reorderSave').addEventListener('click',function(){
    var order=[].slice.call(document.querySelectorAll('section.sec')).map(function(s){return s.getAttribute('data-sec');});
    fetch('/api/section-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({order:order})})
      .then(function(r){
        if(!r.ok)throw new Error('save failed');
        document.body.classList.remove('reorder');bar.hidden=true;btn.hidden=false;
        var toast=document.createElement('div');toast.className='toast';toast.textContent='並び順を保存しました';
        document.body.appendChild(toast);setTimeout(function(){toast.remove();},2500);
      })
      .catch(function(){alert('保存に失敗しました。通信環境を確認して再度お試しください');});
  });
})();
</script>
```

（テンプレートリテラル内に `${…}` を含まないプレーンなJSなのでエスケープ不要。`body` テンプレートに直接埋め込む。）

- [ ] **Step 4: テストが通ることを確認**

Run: `npm run typecheck && npx vitest run`
Expected: 全件 PASS

- [ ] **Step 5: コミット**

```bash
git add src/pages.ts test/dashboard.test.ts
git commit -m "feat: セクション並び替えモードUI（↑↓・完了/キャンセル・保存トースト）"
```

---

### Task 8: 仕上げ検証（全体回帰・ローカルE2E）

**Files:**
- なし（検証のみ。必要な修正が出た場合のみ該当ファイル）

- [ ] **Step 1: 全体テスト**

Run: `npm run typecheck && npm test`
Expected: 全スイート green（既存95件＋今回追加分）

- [ ] **Step 2: ローカルE2E（`npx wrangler dev --local`）**

1. `.dev.vars` の資格情報でログイン（無ければ `ADMIN_USER=admin` / `ADMIN_PASSWORD=pw` 等を `.dev.vars` に設定。**コミットしない**）
2. 期間セレクタに「直近24ヶ月」が出る・選ぶとKPIサブラベルが「前24ヶ月比」・トレンドに前年系列が無いことを確認
3. 「並び替え」→ ↑↓で順番変更 → 「完了」→ トースト表示 → リロードで順番維持を確認
4. curl でAPI検証:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8787/api/section-order -d '{"order":[]}'
# 期待: 401（未認証）
```

- [ ] **Step 3: 完了報告**

実装コミット一覧と検証結果をまとめ、メインセッションのレビュー（コードレビュー＋デプロイ承認）へ引き継ぐ。**デプロイはユーザー承認後**（`npx wrangler deploy`）。
