# 参照元／人気ページの期間内推移グラフ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GA4「参照元/メディア Top」「人気ページ Top」に上位5件＋その他の推移折れ線グラフを追加する。

**Architecture:** GA4クライアントに `dimensionFilter` を追加し、上位5件だけの日次行を第2段で取得。`metrics/series.ts` が月/週/日にバケット集計（その他＝合計−上位）。`charts/multiline.ts` が複数折れ線を描画（X軸ラベル規則は `charts/axis.ts` に共通化）。`TrafficData.sourceSeries/pageSeries` を section が描画。

**Tech Stack:** TypeScript / Cloudflare Workers / vitest。スペック: `docs/superpowers/specs/2026-09-06-ga4-source-page-series-design.md`

## Global Constraints
- 外部ライブラリ追加禁止 / UI文言は日本語 / `DATA` KV read-only
- 第2段取得は上位ラベルが1件以上のときのみ・各 `.catch(() => null)`・GA4ゲートの内側
- 各タスクは `npm run typecheck && npm test` 全件 green 後にコミット（main直・日本語メッセージ）

---

### Task 1: GA4クライアントの dimensionFilter とスペック

**Files:** Modify `src/ga4/types.ts`, `src/ga4/client.ts`, `src/ga4/reports.ts` / Test `test/ga4-client.test.ts`, `test/ga4-reports.test.ts`

**Interfaces（Produces）:**
- `Ga4ReportSpec.dimensionFilter?: { fieldName: string; values: string[] }`
- `sourceSeriesSpec(values: string[]): Ga4ReportSpec`（key `'sourceSeries'`）／`pageSeriesSpec(values: string[]): Ga4ReportSpec`（key `'pageSeries'`）／`DAILY_PAGEVIEWS_SPEC`（key `'dailyPageviews'`）
- `toKeyedDaily(rows: Ga4Row[]): { date: string; key: string; value: number }[]`（dims[0]=YYYYMMDD→YYYY-MM-DD, dims[1]=key, mets[0]=value）

- [ ] **Step 1: 失敗するテストを書く**
`test/ga4-client.test.ts` に追加（既存の fetch スタブ/env の作り方に合わせる）:
```ts
  it('dimensionFilter があれば inListFilter を送り、キャッシュキーに値を含む', async () => {
    // 既存テストの env/fetchスタブ生成ヘルパを使う。spec:
    const spec = { key: 'sourceSeries', dimensions: ['date', 'sessionSourceMedium'], metrics: ['sessions'], limit: 100000, dimensionFilter: { fieldName: 'sessionSourceMedium', values: ['google / organic', '(direct) / (none)'] } };
    await runReport(env, spec, { start: '2026-01-01', end: '2026-01-31' }, fetchStub);
    const body = JSON.parse(lastRequestBody());
    expect(body.dimensionFilter).toEqual({ filter: { fieldName: 'sessionSourceMedium', inListFilter: { values: ['google / organic', '(direct) / (none)'] } } });
    expect(await env.DASH.get('ga4:sourceSeries:2026-01-01:2026-01-31:google / organic|(direct) / (none)')).not.toBeNull();
  });
```
`test/ga4-reports.test.ts` に追加:
```ts
  it('sourceSeriesSpec / pageSeriesSpec / toKeyedDaily', () => {
    const s = sourceSeriesSpec(['a / b']);
    expect(s.dimensions).toEqual(['date', 'sessionSourceMedium']); expect(s.dimensionFilter).toEqual({ fieldName: 'sessionSourceMedium', values: ['a / b'] });
    const p = pageSeriesSpec(['/']);
    expect(p.dimensions).toEqual(['date', 'pagePath']); expect(p.metrics).toEqual(['screenPageViews']);
    expect(toKeyedDaily([{ dims: ['20260801', 'a / b'], mets: [5] }])).toEqual([{ date: '2026-08-01', key: 'a / b', value: 5 }]);
  });
```
- [ ] **Step 2: RED確認**
- [ ] **Step 3: 実装**
`types.ts`: `export interface Ga4ReportSpec { key: string; dimensions: string[]; metrics: string[]; limit?: number; dimensionFilter?: { fieldName: string; values: string[] }; }`
`client.ts`: cacheKey を `` `ga4:${spec.key}:${range.start}:${range.end}${spec.dimensionFilter ? ':' + spec.dimensionFilter.values.join('|') : ''}` `` に。body に `...(spec.dimensionFilter ? { dimensionFilter: { filter: { fieldName: spec.dimensionFilter.fieldName, inListFilter: { values: spec.dimensionFilter.values } } } } : {})` を追加。
`reports.ts`:
```ts
export const DAILY_PAGEVIEWS_SPEC: Ga4ReportSpec = { key: 'dailyPageviews', dimensions: ['date'], metrics: ['screenPageViews'], limit: 100000 };
export function sourceSeriesSpec(values: string[]): Ga4ReportSpec {
  return { key: 'sourceSeries', dimensions: ['date', 'sessionSourceMedium'], metrics: ['sessions'], limit: 100000, dimensionFilter: { fieldName: 'sessionSourceMedium', values } };
}
export function pageSeriesSpec(values: string[]): Ga4ReportSpec {
  return { key: 'pageSeries', dimensions: ['date', 'pagePath'], metrics: ['screenPageViews'], limit: 100000, dimensionFilter: { fieldName: 'pagePath', values } };
}
export function toKeyedDaily(rows: Ga4Row[]): { date: string; key: string; value: number }[] {
  return rows.map(r => { const d = r.dims[0] ?? ''; const date = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d; return { date, key: r.dims[1] ?? '', value: r.mets[0] ?? 0 }; });
}
```
- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: GA4クライアントにdimensionFilterと推移取得用スペックを追加"`

---

### Task 2: 系列集計 `metrics/series.ts`

**Files:** Create `src/metrics/series.ts` / Modify `src/metrics/trend.ts`（`weekStart` を export） / Test `test/series.test.ts`

**Interfaces（Produces）:**
```ts
export interface SeriesData { buckets: string[]; series: { name: string; values: number[] }[] }
export function buildSeries(rows: { date: string; key: string; value: number }[], period: Period, gran: Granularity, topKeys: string[], totals: { date: string; value: number }[] | null, nameOf: (key: string) => string): SeriesData
```

- [ ] **Step 1: 失敗するテストを書く**（`test/series.test.ts` 新規）
```ts
import { describe, it, expect } from 'vitest';
import { buildSeries } from '../src/metrics/series.js';
import { resolvePeriod } from '../src/period.js';
const id = (k: string) => k;
describe('buildSeries', () => {
  it('月次: 上位順に系列化し、その他=合計−上位', () => {
    const p = resolvePeriod('2026', '2026-09-06');
    const rows = [
      { date: '2026-05-01', key: 'A', value: 10 }, { date: '2026-05-20', key: 'A', value: 5 },
      { date: '2026-05-02', key: 'B', value: 3 }, { date: '2026-06-01', key: 'B', value: 7 },
    ];
    const totals = [{ date: '2026-05-01', value: 20 }, { date: '2026-05-20', value: 5 }, { date: '2026-05-02', value: 3 }, { date: '2026-06-01', value: 9 }, { date: '2026-07-01', value: 4 }];
    const s = buildSeries(rows, p, 'month', ['A', 'B'], totals, id);
    expect(s.buckets).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(s.series).toEqual([
      { name: 'A', values: [15, 0, 0] }, { name: 'B', values: [3, 7, 0] }, { name: 'その他', values: [10, 2, 4] },
    ]);
  });
  it('日次は期間内全日をゼロ埋め', () => {
    const p = resolvePeriod('2026-08', '2026-09-06');
    const s = buildSeries([{ date: '2026-08-03', key: 'A', value: 2 }], p, 'day', ['A'], null, id);
    expect(s.buckets.length).toBe(31); expect(s.buckets[0]).toBe('2026-08-01'); expect(s.series[0].values[2]).toBe(2); expect(s.series.length).toBe(1);
  });
  it('週次は月曜始まりバケット', () => {
    const p = resolvePeriod('2026-08', '2026-09-06');
    const s = buildSeries([{ date: '2026-08-05', key: 'A', value: 1 }, { date: '2026-08-06', key: 'A', value: 1 }], p, 'week', ['A'], null, id);
    expect(s.buckets).toEqual(['2026-08-03']); expect(s.series[0].values).toEqual([2]);
  });
  it('その他が全期間0なら追加しない・名前変換', () => {
    const p = resolvePeriod('2026', '2026-09-06');
    const s = buildSeries([{ date: '2026-05-01', key: 'a / b', value: 4 }], p, 'month', ['a / b'], [{ date: '2026-05-01', value: 4 }], k => k.toUpperCase());
    expect(s.series).toEqual([{ name: 'A / B', values: [4] }]);
  });
  it('rows空・totals null は空', () => {
    expect(buildSeries([], resolvePeriod('2026', '2026-09-06'), 'month', [], null, id)).toEqual({ buckets: [], series: [] });
  });
});
```
- [ ] **Step 2: RED確認**
- [ ] **Step 3: 実装**
`trend.ts`: `function weekStart` → `export function weekStart`。
`src/metrics/series.ts`:
```ts
import type { Period } from '../period.js';
import { inPeriod } from '../period.js';
import { addDaysToYmd, ymOf } from '../util.js';
import { type Granularity, weekStart } from './trend.js';

export interface SeriesData { buckets: string[]; series: { name: string; values: number[] }[] }

export function buildSeries(rows: { date: string; key: string; value: number }[], period: Period, gran: Granularity, topKeys: string[], totals: { date: string; value: number }[] | null, nameOf: (key: string) => string): SeriesData {
  const bucketOf = (d: string) => gran === 'month' ? ymOf(d) : gran === 'week' ? weekStart(d) : d;
  const inRows = rows.filter(r => inPeriod(r.date, period));
  const inTotals = (totals ?? []).filter(t => inPeriod(t.date, period));
  let buckets: string[];
  if (gran === 'day') { buckets = []; for (let d = period.start; d <= period.end; d = addDaysToYmd(d, 1)) buckets.push(d); }
  else { buckets = [...new Set([...inRows.map(r => bucketOf(r.date)), ...inTotals.map(t => bucketOf(t.date))])].sort(); }
  if (buckets.length === 0 || topKeys.length === 0) return { buckets: [], series: [] };
  const idx = new Map(buckets.map((b, i) => [b, i]));
  const series = topKeys.map(k => ({ name: nameOf(k), values: buckets.map(() => 0) }));
  const byKey = new Map(topKeys.map((k, i) => [k, i]));
  for (const r of inRows) { const si = byKey.get(r.key); const bi = idx.get(bucketOf(r.date)); if (si !== undefined && bi !== undefined) series[si].values[bi] += r.value; }
  if (totals) {
    const other = buckets.map(() => 0);
    for (const t of inTotals) { const bi = idx.get(bucketOf(t.date)); if (bi !== undefined) other[bi] += t.value; }
    for (let i = 0; i < buckets.length; i++) other[i] = Math.max(0, other[i] - series.reduce((a, s) => a + s.values[i], 0));
    if (other.some(v => v > 0)) series.push({ name: 'その他', values: other });
  }
  return { buckets, series };
}
```
- [ ] **Step 4: GREEN確認**
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 参照元/ページ推移の系列集計(series.ts)"`

---

### Task 3: 複数折れ線チャート＋X軸ラベル共通化

**Files:** Create `src/charts/axis.ts`, `src/charts/multiline.ts` / Modify `src/charts/line.ts`（axis.ts を使う）, `src/ga4/sourceLabel.ts`（`sourceShortName` 追加） / Test `test/multiline.test.ts`（新規）, `test/ga4-source-label.test.ts`, `test/charts.test.ts`（回帰）

**Interfaces（Produces）:**
- `axisLabels(items: { bucket: string; label: string }[], every: number): (string | null)[]`（描画するindexにラベル、他は null。年付き規則は line.ts と同一）
- `renderMultiLine(data: SeriesData): string`
- `sourceShortName(label: string): string`

- [ ] **Step 1: 失敗するテストを書く**
`test/ga4-source-label.test.ts` に追加:
```ts
describe('sourceShortName', () => {
  const cases: [string, string][] = [
    ['google / organic', 'Google検索'], ['yahoo / organic', 'Yahoo!検索'], ['(direct) / (none)', '直接アクセス'],
    ['l.instagram.com / referral', 'Instagram'], ['m.facebook.com / referral', 'Facebook'], ['asoview.com / referral', 'アソビュー'],
    ['example.jp / referral', 'example.jp'], ['google / cpc', 'Google広告'], ['(not set)', '不明'], ['foo / bar', 'foo / bar'],
  ];
  for (const [i, o] of cases) it(`${i} → ${o}`, () => expect(sourceShortName(i)).toBe(o));
});
```
`test/multiline.test.ts`（新規）:
```ts
import { describe, it, expect } from 'vitest';
import { renderMultiLine } from '../src/charts/multiline.js';
describe('renderMultiLine', () => {
  const data = { buckets: ['2025-11', '2025-12', '2026-01'], series: [{ name: 'Google検索', values: [10, 20, 30] }, { name: 'A&B', values: [5, 5, 5] }, { name: 'その他', values: [1, 2, 3] }] };
  it('系列ごとに折れ線と凡例、X軸は年/月規則', () => {
    const svg = renderMultiLine(data);
    expect((svg.match(/<polyline/g) ?? []).length).toBe(3);
    expect(svg).toContain('Google検索'); expect(svg).toContain('A&amp;B');
    expect(svg).toContain('>2025/11<'); expect(svg).toContain('>12<'); expect(svg).toContain('>2026/1<');
    expect(svg).toContain('stroke-dasharray'); // その他は破線
  });
  it('データなし', () => { expect(renderMultiLine({ buckets: [], series: [] })).toContain('データなし'); });
});
```
- [ ] **Step 2: RED確認**
- [ ] **Step 3: 実装**
`src/charts/axis.ts`:
```ts
// X軸ラベル: 描画対象(index % every === 0)のみ生成。ISO bucket かつ label===bucket なら「先頭と年境界に年付き」形式、それ以外は label をそのまま。
export function axisLabels(items: { bucket: string; label: string }[], every: number): (string | null)[] {
  let lastYear = '';
  return items.map((p, i) => {
    if (i % every !== 0) return null;
    const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(p.bucket);
    if (!(iso && p.label === p.bucket)) return p.label;
    const [, y, m, d] = iso; const md = d ? `${Number(m)}/${Number(d)}` : `${Number(m)}`;
    const text = y !== lastYear ? `${y}/${md}` : md; lastYear = y; return text;
  });
}
```
`line.ts`: 既存のラベルループを `const labels = axisLabels(points, labelEvery);` → `points.forEach((p, i) => { const t = labels[i]; if (t === null) return; … escXml(t) … })` に置換（出力不変。既存テストで確認）。
`sourceLabel.ts` に追加:
```ts
export function sourceShortName(label: string): string {
  const [rawSource = '', rawMedium = ''] = label.split(' / ');
  const source = rawSource.trim(); const medium = rawMedium.trim().toLowerCase(); const s = source.toLowerCase();
  if (s === '(not set)') return '不明';
  if (s === '(direct)' || medium === '(none)') return '直接アクセス';
  const engine = Object.hasOwn(SEARCH_ENGINES, s) ? SEARCH_ENGINES[s] : null;
  if (medium === 'organic') return `${engine ?? source}検索`;
  if (medium === 'cpc' || medium === 'ppc' || medium.startsWith('paid')) return `${engine ?? source}広告`;
  const sns = SNS.find(k => k.match.test(s)); if (sns) return sns.name;
  const site = KNOWN_SITES.find(k => k.match.test(s)); if (site) return site.name.replace(/（.*）$/, '');
  if (medium === 'referral') return source;
  return label;
}
```
（`SEARCH_ENGINES`/`SNS`/`KNOWN_SITES` は同ファイル既存定義を使用）
`src/charts/multiline.ts`:
```ts
import type { SeriesData } from '../metrics/series.js';
import { svgOpen, svgClose, escXml, scaleY } from './svg.js';
import { axisLabels } from './axis.js';
const COLORS = ['#1e3a5f', '#16a34a', '#db2777', '#f59e0b', '#7c3aed', '#0891b2'];
export function renderMultiLine(data: SeriesData): string {
  const W = 720, H = 260, top = 34, bottom = 36, left = 44, right = 12;
  const n = data.buckets.length;
  if (n === 0 || data.series.length === 0) return svgOpen(W, 60) + `<text x="10" y="35" font-size="12" fill="#6b7280">データなし</text>` + svgClose();
  const plotW = W - left - right, plotH = H - top - bottom;
  const max = Math.max(1, ...data.series.flatMap(s => s.values));
  const xOf = (i: number) => n === 1 ? left + plotW / 2 : left + (i * plotW) / (n - 1);
  let s = svgOpen(W, H);
  // グリッドと目盛
  for (let g = 0; g <= 4; g++) { const v = (max * g) / 4; const y = scaleY(v, max, top, plotH); s += `<line x1="${left}" x2="${W - right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb"/><text x="${left - 6}" y="${(y + 3).toFixed(1)}" font-size="9" fill="#6b7280" text-anchor="end">${Math.round(v).toLocaleString('ja-JP')}</text>`; }
  // 系列
  data.series.forEach((ser, si) => {
    const other = ser.name === 'その他';
    const color = other ? '#9ca3af' : COLORS[si % COLORS.length];
    const pts = ser.values.map((v, i) => `${xOf(i).toFixed(1)},${scaleY(v, max, top, plotH).toFixed(1)}`).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"${other ? ' stroke-dasharray="4 3"' : ''}/>`;
    ser.values.forEach((v, i) => { s += `<circle cx="${xOf(i).toFixed(1)}" cy="${scaleY(v, max, top, plotH).toFixed(1)}" r="2.5" fill="${color}"><title>${escXml(data.buckets[i])} ${escXml(ser.name)}: ${v.toLocaleString('ja-JP')}</title></circle>`; });
    // 凡例
    const lx = left + si * 118; s += `<rect x="${lx}" y="8" width="10" height="10" fill="${color}"/><text x="${lx + 14}" y="17" font-size="11" fill="#1f2937">${escXml(ser.name.slice(0, 12))}</text>`;
  });
  // X軸ラベル
  const every = Math.ceil(n / 12) || 1;
  const labels = axisLabels(data.buckets.map(b => ({ bucket: b, label: b })), every);
  labels.forEach((t, i) => { if (t === null) return; s += `<text x="${xOf(i).toFixed(1)}" y="${H - 10}" font-size="10" fill="#6b7280" text-anchor="middle">${escXml(t)}</text>`; });
  return s + svgClose();
}
```
- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`（line.ts のリファクタで既存ラベルテストが不変であること）
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 複数折れ線チャートとX軸ラベル規則の共通化、参照元の短縮名"`

---

### Task 4: handlers の第2段取得と section 表示

**Files:** Modify `src/handlers.ts`, `src/ga4/section.ts` / Test `test/ga4-section.test.ts`, `test/routing.test.ts` または `test/ga4-home.test.ts`

**Interfaces（Produces）:** `TrafficData.sourceSeries: SeriesData | null; pageSeries: SeriesData | null`。GA4未接続や取得失敗時は null。

- [ ] **Step 1: 失敗するテストを書く**
`test/ga4-section.test.ts`:
```ts
  it('sourceSeries/pageSeries があれば表の上に推移グラフ、null なら表のみ', () => {
    const series = { buckets: ['2026-05', '2026-06'], series: [{ name: 'Google検索', values: [10, 12] }] };
    const withS = renderTrafficSection({ ...connectedFixture, sourceSeries: series, pageSeries: series }, 'x');
    expect((withS.match(/<polyline/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(withS).toContain('上位5件＋その他');
    const noS = renderTrafficSection({ ...connectedFixture, sourceSeries: null, pageSeries: null }, 'x');
    expect(noS).not.toContain('<polyline');
  });
```
handlers の検証（`test/ga4-home.test.ts` の GA4接続スタブ基盤があればそれで／無ければ前タスクで作った runReport 呼び出し回数スタブを流用）:
```ts
  it('接続時は上位5件の推移を第2段で取得し、上位0件なら取得しない', …) // sourceMedium が空のとき sourceSeriesSpec の呼び出しが無いこと、あるとき dimensionFilter.values が上位5件（sessions降順）であること
```
- [ ] **Step 2: RED確認**
- [ ] **Step 3: 実装**
`src/handlers.ts` GA4ブロック（第1段の `Promise.all` の後）:
```ts
      const top5 = (rows: NameValue[]) => [...rows].sort((a, b) => b.sessions - a.sessions).slice(0, 5).map(r => r.label);
      const srcTop = top5(sourceMedium), pageTop = top5(topPages);
      const [srcRows, pageRows, dailyPv] = await Promise.all([
        srcTop.length ? runReport(env, sourceSeriesSpec(srcTop), range).catch(() => null) : Promise.resolve(null),
        pageTop.length ? runReport(env, pageSeriesSpec(pageTop), range).catch(() => null) : Promise.resolve(null),
        pageTop.length ? runReport(env, DAILY_PAGEVIEWS_SPEC, range).catch(() => null) : Promise.resolve(null),
      ]);
      const dailyTotals = toDailySessions(ds).map(d => ({ date: d.date, value: d.sessions }));
      const sourceSeries = srcRows ? buildSeries(toKeyedDaily(srcRows), period, gran, srcTop, dailyTotals, sourceShortName) : null;
      const pageSeries = pageRows ? buildSeries(toKeyedDaily(pageRows), period, gran, pageTop, dailyPv ? toDailySessions(dailyPv).map(d => ({ date: d.date, value: d.sessions })) : null, pageNameJa) : null;
```
（`toDailySessions` は `{date, sessions}` を返す既存関数を流用。import: `sourceSeriesSpec, pageSeriesSpec, DAILY_PAGEVIEWS_SPEC, toKeyedDaily` from reports、`buildSeries` from metrics/series、`sourceShortName` from ga4/sourceLabel、`pageNameJa` from ga4/labels、`NameValue` type）。`traffic = { …, sourceSeries, pageSeries, … }`。`emptyTraffic` にも `sourceSeries: null, pageSeries: null`。
`src/ga4/section.ts`: `TrafficData` にフィールド追加。参照元カード:
```ts
const seriesBlock = (sd: SeriesData | null, granLabel: string) => sd ? `<p style="font-size:11px;color:var(--muted);margin:0 0 4px">上位5件＋その他・${granLabel}の推移</p>${renderMultiLine(sd)}` : '';
```
`renderTrafficSection(d, periodNote, granLabel = '月次')` の第3引数（省略可）で粒度名を受け、`<div class="card"><h2>参照元/メディア Top…</h2>${seriesBlock(d.sourceSeries, granLabel)}${nvTable(...)}</div>`、人気ページも同様。pages.ts の呼び出しで `granLabel` に `{month:'月次',week:'週次',day:'日次'}[d.granularity]` を渡す。
- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 参照元/人気ページに上位5件＋その他の推移グラフを追加"`

---

### Task 5: 仕上げ検証（コントローラ）
- [ ] 全体テスト green・GA4未接続のローカルでは表のみ表示が不変・Opus最終レビュー → 修正 → 前回分と合わせてユーザー承認後デプロイ
