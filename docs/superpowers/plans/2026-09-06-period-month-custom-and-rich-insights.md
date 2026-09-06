# 期間の月指定・任意期間＋戦略インサイト拡充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 期間を「月」「任意の開始〜終了」で指定できるようにし（比較期間・粒度も整合）、戦略インサイトを6グループの「数字＋示唆」に拡充する。

**Architecture:** `period.ts` に kind `month`/`custom`・`periodQuery`・`comparisonLabel`・一般化した `priorPeriod` を追加し、全ての直列化箇所を `periodQuery` に統一。`trend.ts` に `day` 粒度と既定/許容粒度。`insights.ts` を `InsightGroup[]` 出力に書き換え（前期間の各集計を内部で再計算）。UIは `<details>` 内のネイティブ月/日付ピッカー。

**Tech Stack:** TypeScript / Cloudflare Workers / vitest。スペック: `docs/superpowers/specs/2026-09-06-period-month-custom-and-rich-insights-design.md`

## Global Constraints

- 外部ライブラリ追加禁止 / UI文言は日本語 / `DATA` KV read-only
- 不正な期間指定は既定（直近12ヶ月）にフォールバック。`g` が許容外なら既定粒度
- 期間日数の閾値: 粒度は **≤92日で day 既定**、比較は **custom で >366日なら期間長シフト**
- インサイトの比較は必ず `priorPeriod(period)`。比較データが無い行は省略。hint は施策提案を含まない
- 各タスクは `npm run typecheck && npm test` 全件 green 後にコミット（main直・日本語メッセージ）

---

### Task 1: period.ts の拡張（month/custom・periodQuery・comparisonLabel・priorPeriod一般化）

**Files:**
- Modify: `src/period.ts`, `src/util.ts`
- Test: `test/period.test.ts`

**Interfaces（Produces）:**
- `type PeriodKind = 'last12'|'last24'|'year'|'all'|'month'|'custom'`
- `resolvePeriod(param: string|null, today: string, from?: string|null, to?: string|null): Period`
- `periodQuery(p: Period): Record<string,string>`（`{period}` または custom で `{period:'custom', from, to}`）
- `spanDays(p: Period): number`（両端含む日数）
- `priorPeriod(p)`（一般化）・`comparisonLabel(p): string`
- `util.ts`: `daysBetweenYmd(a: string, b: string): number`（b−a 日数）・`isValidYmd(s: string): boolean`・`lastDayOfMonth(ym: string): string`

- [ ] **Step 1: 失敗するテストを書く**（`test/period.test.ts` に追加。import に `periodQuery, spanDays, comparisonLabel` を追記し、`isValidYmd, lastDayOfMonth, daysBetweenYmd` を `../src/util.js` から import）

```ts
describe('util date helpers', () => {
  it('lastDayOfMonth', () => { expect(lastDayOfMonth('2026-02')).toBe('2026-02-28'); expect(lastDayOfMonth('2024-02')).toBe('2024-02-29'); expect(lastDayOfMonth('2026-08')).toBe('2026-08-31'); });
  it('isValidYmd', () => { expect(isValidYmd('2026-02-30')).toBe(false); expect(isValidYmd('2026-02-28')).toBe(true); expect(isValidYmd('2026-13-01')).toBe(false); expect(isValidYmd('abc')).toBe(false); });
  it('daysBetweenYmd', () => { expect(daysBetweenYmd('2026-01-01', '2026-01-31')).toBe(30); });
});

describe('resolvePeriod month/custom', () => {
  it('YYYY-MM は月初〜月末', () => {
    const p = resolvePeriod('2026-08', '2026-09-06');
    expect(p).toEqual({ start: '2026-08-01', end: '2026-08-31', label: '2026年8月', kind: 'month' });
  });
  it('不正な月は既定', () => { expect(resolvePeriod('2026-13', '2026-09-06').kind).toBe('last12'); });
  it('custom は from〜to', () => {
    const p = resolvePeriod('custom', '2026-09-06', '2026-04-01', '2026-06-30');
    expect(p).toEqual({ start: '2026-04-01', end: '2026-06-30', label: '2026-04-01〜2026-06-30', kind: 'custom' });
  });
  it('custom の不正は既定にフォールバック', () => {
    expect(resolvePeriod('custom', '2026-09-06', '2026-06-30', '2026-04-01').kind).toBe('last12'); // from>to
    expect(resolvePeriod('custom', '2026-09-06', '2026-02-30', '2026-03-01').kind).toBe('last12'); // 実在しない日
    expect(resolvePeriod('custom', '2026-09-06', null, '2026-03-01').kind).toBe('last12');        // 欠落
    expect(resolvePeriod('custom', '2026-09-06', '2026/04/01', '2026-06-30').kind).toBe('last12'); // 形式
  });
});

describe('periodQuery / spanDays / comparisonLabel / priorPeriod', () => {
  it('periodQuery', () => {
    expect(periodQuery(resolvePeriod('last24', '2026-09-06'))).toEqual({ period: 'last24' });
    expect(periodQuery(resolvePeriod('2025', '2026-09-06'))).toEqual({ period: '2025' });
    expect(periodQuery(resolvePeriod('2026-08', '2026-09-06'))).toEqual({ period: '2026-08' });
    expect(periodQuery(resolvePeriod('custom', '2026-09-06', '2026-04-01', '2026-06-30'))).toEqual({ period: 'custom', from: '2026-04-01', to: '2026-06-30' });
  });
  it('spanDays は両端含む', () => { expect(spanDays(resolvePeriod('2026-08', '2026-09-06'))).toBe(31); });
  it('month は前年同月', () => {
    const q = priorPeriod(resolvePeriod('2026-08', '2026-09-06'));
    expect(q.start).toBe('2025-08-01'); expect(q.end).toBe('2025-08-31');
    expect(comparisonLabel(resolvePeriod('2026-08', '2026-09-06'))).toBe('前年同月比');
  });
  it('custom ≤366日 は -12ヶ月・>366日 は期間長シフト', () => {
    const short = resolvePeriod('custom', '2026-09-06', '2026-04-01', '2026-06-30');
    expect(priorPeriod(short).start).toBe('2025-04-01'); expect(priorPeriod(short).end).toBe('2025-06-30');
    expect(comparisonLabel(short)).toBe('前年同期間比');
    const long = resolvePeriod('custom', '2026-09-06', '2024-01-01', '2025-12-31'); // 731日
    expect(priorPeriod(long).end).toBe('2023-12-31');
    expect(priorPeriod(long).start).toBe('2022-01-01');
    expect(comparisonLabel(long)).toBe('前期間比');
  });
  it('既存 kind のラベル', () => {
    expect(comparisonLabel(resolvePeriod('last12', '2026-09-06'))).toBe('前年比');
    expect(comparisonLabel(resolvePeriod('last24', '2026-09-06'))).toBe('前24ヶ月比');
  });
});
```

- [ ] **Step 2: RED確認** `npx vitest run test/period.test.ts`

- [ ] **Step 3: 実装**

`src/util.ts` に追加:

```ts
export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 翌月0日=当月末
  return `${ym}-${String(last).padStart(2, '0')}`;
}
export function daysBetweenYmd(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}
```

`src/period.ts`:

```ts
import type { HistoryRecord } from './types.js';
import { addDaysToYmd, addMonthsToYmd, daysBetweenYmd, isValidYmd, lastDayOfMonth } from './util.js';

export type PeriodKind = 'last12' | 'last24' | 'year' | 'all' | 'month' | 'custom';
export interface Period { start: string; end: string; label: string; kind: PeriodKind; }

export function resolvePeriod(param: string | null, today: string, from?: string | null, to?: string | null): Period {
  if (param && /^\d{4}$/.test(param)) {
    return { start: `${param}-01-01`, end: `${param}-12-31`, label: `${param}年`, kind: 'year' };
  }
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const m = Number(param.slice(5, 7));
    if (m >= 1 && m <= 12) {
      return { start: `${param}-01`, end: lastDayOfMonth(param), label: `${Number(param.slice(0, 4))}年${m}月`, kind: 'month' };
    }
  }
  if (param === 'custom' && from && to && isValidYmd(from) && isValidYmd(to) && from <= to) {
    return { start: from, end: to, label: `${from}〜${to}`, kind: 'custom' };
  }
  if (param === 'all') {
    return { start: '2015-01-01', end: today, label: '全期間', kind: 'all' };
  }
  if (param === 'last24') {
    const start = addDaysToYmd(addMonthsToYmd(today, -24), 1);
    return { start, end: today, label: '直近24ヶ月', kind: 'last24' };
  }
  const start = addDaysToYmd(addMonthsToYmd(today, -12), 1);
  return { start, end: today, label: '直近12ヶ月', kind: 'last12' };
}

// URLクエリ用の直列化（全フォーム/リンクはこれを使う）
export function periodQuery(p: Period): Record<string, string> {
  if (p.kind === 'year') return { period: p.start.slice(0, 4) };
  if (p.kind === 'month') return { period: p.start.slice(0, 7) };
  if (p.kind === 'custom') return { period: 'custom', from: p.start, to: p.end };
  return { period: p.kind };
}

export function spanDays(p: Period): number { return daysBetweenYmd(p.start, p.end) + 1; }

export function priorYear(p: Period): Period { /* 既存のまま */ }

// 比較期間。month/短いcustom/last12/year/all は -12ヶ月（前年同期）、last24 は -24ヶ月、366日超の custom は期間長ぶん過去へ。
export function priorPeriod(p: Period): Period {
  if (p.kind === 'custom' && spanDays(p) > 366) {
    const n = spanDays(p);
    return { start: addDaysToYmd(p.start, -n), end: addDaysToYmd(p.end, -n), label: `${p.label}（前期間）`, kind: p.kind };
  }
  const months = p.kind === 'last24' ? 24 : 12;
  return { start: addMonthsToYmd(p.start, -months), end: addMonthsToYmd(p.end, -months), label: `${p.label}（前期間）`, kind: p.kind };
}

export function comparisonLabel(p: Period): string {
  if (p.kind === 'last24') return '前24ヶ月比';
  if (p.kind === 'month') return '前年同月比';
  if (p.kind === 'custom') return spanDays(p) > 366 ? '前期間比' : '前年同期間比';
  return '前年比';
}
```

（`inPeriod`/`filterPeriod`/`priorYear` は既存のまま）

- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`（`kind` 直書き比較箇所は型エラーにならない＝この時点で他ファイルは未変更でOK）
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 期間に月指定・任意期間を追加しperiodQuery/comparisonLabelを導入"`

---

### Task 2: トレンド日次粒度と handleHome のクエリ解決

**Files:**
- Modify: `src/metrics/trend.ts`, `src/handlers.ts`, `src/pages.ts`（`DashboardData.granularity` の型のみ）
- Test: `test/trend.test.ts`, `test/routing.test.ts`

**Interfaces（Produces）:**
- `type Granularity = 'month' | 'week' | 'day'`（trend.ts から export）
- `computeTrend(all, period, granularity: Granularity)`（day: bucket=YYYY-MM-DD, label=`M/D`）
- `defaultGranularity(p): Granularity`（spanDays ≤ 92 → 'day'）・`allowedGranularities(p): Granularity[]`（≤92: ['day','week','month'] / それ以外 ['month','week']）
- `resolveGranularity(param: string|null, p: Period): Granularity`（許容外/未指定→既定）
- handleHome: `resolvePeriod(get('period'), today, get('from'), get('to'))`・`gran = resolveGranularity(get('g'), period)`

- [ ] **Step 1: 失敗するテストを書く**

`test/trend.test.ts` に追加（import に `defaultGranularity, allowedGranularities, resolveGranularity` 追記）:

```ts
describe('day granularity', () => {
  it('day は日付バケット・M/Dラベル', () => {
    const recs = [
      { date: '2026-08-01', course: 'A', pax: 1, amount: 1000, status: '完了', phoneHash: 'x' },
      { date: '2026-08-01', course: 'A', pax: 1, amount: 1000, status: '完了', phoneHash: 'y' },
      { date: '2026-08-15', course: 'A', pax: 1, amount: 500, status: '完了', phoneHash: 'z' },
    ] as HistoryRecord[];
    const pts = computeTrend(recs, resolvePeriod('2026-08', '2026-09-06'), 'day');
    expect(pts).toEqual([
      { bucket: '2026-08-01', label: '8/1', bookings: 2, revenue: 2000 },
      { bucket: '2026-08-15', label: '8/15', bookings: 1, revenue: 500 },
    ]);
  });
  it('既定粒度と許容粒度', () => {
    const month = resolvePeriod('2026-08', '2026-09-06');
    expect(defaultGranularity(month)).toBe('day');
    expect(allowedGranularities(month)).toEqual(['day', 'week', 'month']);
    const y = resolvePeriod('2025', '2026-09-06');
    expect(defaultGranularity(y)).toBe('month');
    expect(allowedGranularities(y)).toEqual(['month', 'week']);
  });
  it('resolveGranularity は許容外なら既定', () => {
    const y = resolvePeriod('2025', '2026-09-06');
    expect(resolveGranularity('day', y)).toBe('month');
    expect(resolveGranularity('week', y)).toBe('week');
    expect(resolveGranularity(null, resolvePeriod('2026-08', '2026-09-06'))).toBe('day');
  });
});
```

`test/routing.test.ts` に追加（既存のログインヘルパ流儀で）:

```ts
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
```

- [ ] **Step 2: RED確認** `npx vitest run test/trend.test.ts test/routing.test.ts`

- [ ] **Step 3: 実装**

`src/metrics/trend.ts`:

```ts
import { type Period, filterPeriod, priorYear, spanDays } from '../period.js';
export type Granularity = 'month' | 'week' | 'day';
export function computeTrend(all: HistoryRecord[], period: Period, granularity: Granularity): TrendPoint[] {
  const recs = filterPeriod(all, period);
  const map = new Map<string, { bookings: number; revenue: number }>();
  for (const r of recs) {
    const bucket = granularity === 'month' ? ymOf(r.date) : granularity === 'week' ? weekStart(r.date) : r.date;
    const cur = map.get(bucket) ?? { bookings: 0, revenue: 0 };
    cur.bookings += 1; cur.revenue += r.amount;
    map.set(bucket, cur);
  }
  const label = (b: string) => granularity === 'day' ? `${Number(b.slice(5, 7))}/${Number(b.slice(8, 10))}` : b;
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([bucket, v]) => ({ bucket, label: label(bucket), bookings: v.bookings, revenue: v.revenue }));
}
export function defaultGranularity(p: Period): Granularity { return spanDays(p) <= 92 ? 'day' : 'month'; }
export function allowedGranularities(p: Period): Granularity[] { return spanDays(p) <= 92 ? ['day', 'week', 'month'] : ['month', 'week']; }
export function resolveGranularity(param: string | null, p: Period): Granularity {
  const allowed = allowedGranularities(p);
  return param && (allowed as string[]).includes(param) ? (param as Granularity) : defaultGranularity(p);
}
```
`priorYearSeries` のシグネチャの `gran` も `Granularity` に（`gran !== 'month'` で全null＝日次も同様）。

`src/handlers.ts`:
```ts
  const period = resolvePeriod(url.searchParams.get('period'), jstToday(), url.searchParams.get('from'), url.searchParams.get('to'));
  const gran = resolveGranularity(url.searchParams.get('g'), period);
```
（import に `resolveGranularity` 追加）

`src/pages.ts`: `DashboardData.granularity: Granularity`（import type from trend.js）。`periodSelect`/`gToggle` の `'month' | 'week'` 型注釈も `Granularity` に。

- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: トレンドに日次粒度・期間に応じた既定/許容粒度・from/to解決"`

---

### Task 3: 期間UI（月/任意期間フォーム・年の自動生成）と直列化の統一

**Files:**
- Modify: `src/pages.ts`
- Test: `test/dashboard.test.ts`

**Interfaces:** `renderDashboard` シグネチャ不変。HTML: `<details class="period-more">` に2フォーム。全リンク/フォームは `periodQuery(d.period)` を使用。

- [ ] **Step 1: 失敗するテストを書く**（`test/dashboard.test.ts`。`resolvePeriod` は import 済み想定）

```ts
  it('月・期間指定フォームと年の自動生成', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('last12', '2026-09-06') });
    expect(html).toContain('月・期間を指定');
    expect(html).toContain('type="month"');
    expect(html).toContain('type="date"');
    expect(html).toContain('>2026年<');
    expect(html).toContain('>2017年<');
  });
  it('月指定中はセレクタ先頭に現在期間・detailsがopen・入力に現在値', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('2026-08', '2026-09-06'), granularity: 'day' });
    expect(html).toMatch(/<option value="2026-08" selected>2026年8月<\/option>/);
    expect(html).toContain('<details class="period-more" open>');
    expect(html).toContain('type="month" name="period" value="2026-08"');
  });
  it('custom 指定は from/to が全リンク・フォームに引き継がれる', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('custom', '2026-09-06', '2026-04-01', '2026-06-30'), granularity: 'day' });
    expect((html.match(/period=custom&from=2026-04-01&to=2026-06-30/g) ?? []).length).toBeGreaterThanOrEqual(4); // サイドバー4リンク
    expect(html).toContain('name="from" value="2026-04-01"');
    expect(html).toContain('name="to" value="2026-06-30"');
    expect(html).toContain('前年同期間比');
  });
  it('短い期間では日次トグルが出る・長い期間では出ない', () => {
    const short = renderDashboard({ ...base, period: resolvePeriod('2026-08', '2026-09-06'), granularity: 'day' });
    expect(short).toContain('>日次<');
    const long = renderDashboard({ ...base, period: resolvePeriod('last12', '2026-09-06'), granularity: 'month' });
    expect(long).not.toContain('>日次<');
  });
```

- [ ] **Step 2: RED確認** `npx vitest run test/dashboard.test.ts`

- [ ] **Step 3: 実装**（`src/pages.ts`）

import: `import { type Period, periodQuery, comparisonLabel } from './period.js';`（既存 import に追記）、`import { jstToday } from './util.js';`、`import { type Granularity, allowedGranularities } from './metrics/trend.js';`

ヘルパ（module内）:
```ts
const hiddenInputs = (obj: Record<string, string>) => Object.entries(obj).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('');
```

`periodSelect` を書き換え:
```ts
function periodSelect(period: Period, view: ViewId, selectedCourse: string, granularity: Granularity): string {
  const thisYear = Number(jstToday().slice(0, 4));
  const years: number[] = []; for (let y = thisYear; y >= 2017; y--) years.push(y);
  const opt = (v: string, label: string, sel: boolean) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  const pq = periodQuery(period);
  const cur = pq.period;
  const common = { view, ...(selectedCourse ? { course: selectedCourse } : {}) };
  const isSpecial = period.kind === 'month' || period.kind === 'custom';
  const special = isSpecial ? opt(cur, period.label, true) : '';
  const extra = period.kind === 'custom' ? hiddenInputs({ from: period.start, to: period.end }) : '';
  return `<form method="get" style="display:flex;gap:8px;align-items:center">
${hiddenInputs({ ...common, g: granularity })}${extra}
<label style="margin:0">期間</label>
<select name="period" onchange="this.form.submit()">
${special}${opt('last12', '直近12ヶ月', cur === 'last12')}
${opt('last24', '直近24ヶ月', cur === 'last24')}
${opt('all', '全期間', cur === 'all')}
${years.map(y => opt(String(y), `${y}年`, cur === String(y))).join('')}
</select></form>
<details class="period-more"${isSpecial ? ' open' : ''}>
<summary style="font-size:12px;color:var(--accent);cursor:pointer;margin-top:6px">月・期間を指定</summary>
<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:13px">
<form method="get" style="display:flex;gap:6px;align-items:center">${hiddenInputs(common)}<label style="margin:0">月</label><input type="month" name="period" value="${period.kind === 'month' ? period.start.slice(0, 7) : ''}" required><button type="submit">表示</button></form>
<form method="get" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${hiddenInputs({ ...common, period: 'custom' })}<label style="margin:0">期間</label><input type="date" name="from" value="${period.kind === 'custom' ? period.start : ''}" required>〜<input type="date" name="to" value="${period.kind === 'custom' ? period.end : ''}" required><button type="submit">表示</button></form>
</div></details>`;
}
```
（既存の呼び出しは `periodSelect(d.period, d.view, d.selectedCourse, d.granularity)` のまま。期間カードのラベル `esc(d.period.label)` はそのまま）

`renderDashboard` 内:
- `const cmp = comparisonLabel(d.period);`（従来の三項演算子を置換）
- `gToggle` を許容粒度で生成:
```ts
  const gToggle = (g: Granularity, label: string) => {
    const params = new URLSearchParams({ ...periodQuery(d.period), view: d.view, g });
    if (d.selectedCourse) params.set('course', d.selectedCourse);
    const active = d.granularity === g;
    return `<a href="/?${params.toString()}" style="…既存スタイル…">${esc(label)}</a>`;
  };
  const gLabels: Record<Granularity, string> = { month: '月次', week: '週次', day: '日次' };
  const gToggles = allowedGranularities(d.period).map(g => gToggle(g, gLabels[g])).join(' ');
```
トレンドカードの `<span>${gToggle('month','月次')} ${gToggle('week','週次')}</span>` → `<span>${gToggles}</span>`。
- ヒートマップのコースフォーム: `<input type="hidden" name="period" …>` を `${hiddenInputs(periodQuery(d.period))}` に置換（`g` の hidden は既存どおり）。
- `viewQuery`: `p.set('period', …)` を `for (const [k, v] of Object.entries(periodQuery(d.period))) p.set(k, v);` に置換。`g` は常に `p.set('g', d.granularity)`（既存の「monthなら省略」ロジックを廃止。handlerが許容外を既定に戻すため安全）。
- `src/pages.ts` 内の `d.period.kind === 'year' ? … : d.period.kind` 直書きが**残っていないこと**を grep で確認。

- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`（既存テストで `period=last12` の出現回数等を数えているものは必要に応じて更新）
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 月・任意期間の指定UIと年の自動生成、期間パラメータ直列化を統一"`

---

### Task 4: 戦略インサイトの拡充（metrics）

**Files:**
- Modify: `src/metrics/insights.ts`（全面書き換え）
- Test: `test/insights.test.ts`（既存テストは新構造に合わせて書き換え）

**Interfaces（Produces）:**
```ts
export interface InsightItem { text: string; hint?: string }
export interface InsightGroup { title: string; items: InsightItem[] }
export function buildInsights(input: { all: HistoryRecord[]; period: Period; kpi: Kpi; heatmap: Heatmap; trend: TrendPoint[]; courseRows: CourseRow[]; sourceRows: CourseRow[] }): InsightGroup[]
```
（`trend` は月次バケットである必要はない。内部で `computeTrend(all, period, 'month')` を再計算する）

- [ ] **Step 1: 失敗するテストを書く**（`test/insights.test.ts` を新構造で書き直す。ヘルパ `rec(date, amount, course, phone, source?)` を定義し HistoryRecord を生成。`source` は `'アソビュー' | 'Instagram' | '未回答' | '不明' | …`）

```ts
import { describe, it, expect } from 'vitest';
import { buildInsights } from '../src/metrics/insights.js';
import { resolvePeriod } from '../src/period.js';
import { computeKpi } from '../src/metrics/kpi.js';
import { computeHeatmap } from '../src/metrics/heatmap.js';
import { computeTrend } from '../src/metrics/trend.js';
import { computeCourseBreakdown } from '../src/metrics/course.js';
import { computeSourceBreakdown } from '../src/metrics/source.js';
import type { HistoryRecord } from '../src/types.js';

const rec = (date: string, amount: number, course = 'A', phone = 'p', source = 'アソビュー'): HistoryRecord =>
  ({ date, course, pax: 2, amount, status: '完了', phoneHash: phone, source } as HistoryRecord);

function build(all: HistoryRecord[], periodParam: string) {
  const period = resolvePeriod(periodParam, '2026-09-06');
  return buildInsights({
    all, period, kpi: computeKpi(all, period), heatmap: computeHeatmap(all, period),
    trend: computeTrend(all, period, 'month'), courseRows: computeCourseBreakdown(all, period), sourceRows: computeSourceBreakdown(all, period),
  });
}
const titles = (g: ReturnType<typeof build>) => g.map(x => x.title);
const text = (g: ReturnType<typeof build>, title: string) => g.find(x => x.title === title)!.items.map(i => i.text + (i.hint ? ' ' + i.hint : '')).join('\n');

describe('buildInsights', () => {
  it('売上の要因: 前期比と要因分解、hintは件数要因が大きいとき客数', () => {
    // 2026年: 10件×10,000円 / 2025年（前年同期）: 5件×10,000円 → 件数要因 +50,000 / 単価要因 0
    const all = [
      ...Array.from({ length: 10 }, (_, i) => rec(`2026-05-${String(i + 1).padStart(2, '0')}`, 10000, 'A', `n${i}`)),
      ...Array.from({ length: 5 }, (_, i) => rec(`2025-05-${String(i + 1).padStart(2, '0')}`, 10000, 'A', `o${i}`)),
    ];
    const g = build(all, '2026');
    const t = text(g, '売上の要因');
    expect(t).toContain('売上 100,000円');
    expect(t).toContain('+100%');
    expect(t).toContain('件数増減で+50,000円');
    expect(t).toContain('客単価変化で±0円');
    expect(t).toContain('→ 変化は主に客数（件数）によるもの');
  });
  it('前期データが無いとき要因分解と勢い・リピート比較は省略される', () => {
    const all = [rec('2026-05-01', 10000), rec('2026-06-01', 10000)];
    const g = build(all, '2026');
    expect(text(g, '売上の要因')).not.toContain('内訳');
    expect(titles(g)).not.toContain('勢い'); // 月次バケット2つ＝3未満
  });
  it('曜日・季節: 土日比率とhint', () => {
    // 2026-08-01(土),02(日),03(月): 土日2/3
    const all = [rec('2026-08-01', 1000, 'A', 'a'), rec('2026-08-02', 1000, 'A', 'b'), rec('2026-08-03', 1000, 'A', 'c')];
    const t = text(build(all, '2026-08'), '曜日・季節');
    expect(t).toContain('土日の比率 67%');
    expect(t).toContain('→ 週末への依存度が高い');
  });
  it('コース: 最多コースのシェアと集中hint', () => {
    const all = [rec('2026-05-01', 1000, 'SUP体験', 'a'), rec('2026-05-02', 1000, 'SUP体験', 'b'), rec('2026-05-03', 3000, 'ツアー', 'c')];
    const t = text(build(all, '2026'), 'コース');
    expect(t).toContain('最多コースは「SUP体験」（件数67%・売上40%）');
    expect(t).toContain('→ 特定コースへの集中度が高い');
  });
  it('流入経路: 最多とInstagram・未回答', () => {
    const all = [rec('2026-05-01', 1000, 'A', 'a', 'アソビュー'), rec('2026-05-02', 1000, 'A', 'b', 'Instagram'), rec('2026-05-03', 1000, 'A', 'c', '未回答'), rec('2026-05-04', 1000, 'A', 'd', '不明')];
    const t = text(build(all, '2026'), '流入経路（自己申告）');
    expect(t).toContain('最多は「アソビュー」（25%）');
    expect(t).toContain('Instagram経由 25%');
    expect(t).toContain('未回答・不明 50%');
    expect(t).toContain('→ 未回答が多く');
  });
  it('リピート: 率と前期差・hint', () => {
    // 2026: 新規2 + リピート2（同じphoneが2025にも参加） / 2025: 新規2
    const all = [rec('2025-05-01', 1000, 'A', 'r1'), rec('2025-05-02', 1000, 'A', 'r2'), rec('2026-05-01', 1000, 'A', 'r1'), rec('2026-05-02', 1000, 'A', 'r2'), rec('2026-05-03', 1000, 'A', 'n1'), rec('2026-05-04', 1000, 'A', 'n2')];
    const t = text(build(all, '2026'), 'リピート');
    expect(t).toContain('リピート率 50%');
    expect(t).toContain('前期 0%');
    expect(t).toContain('+50pt');
  });
});
```

- [ ] **Step 2: RED確認** `npx vitest run test/insights.test.ts`

- [ ] **Step 3: 実装**（`src/metrics/insights.ts` 全面書き換え。以下の仕様を満たす。数式・文言は spec §2 とテストに一致させる）

```ts
import type { HistoryRecord } from '../types.js';
import { type Period, priorPeriod, priorYear, comparisonLabel } from '../period.js';
import { type Kpi, computeKpi } from './kpi.js';
import { type Heatmap, computeHeatmap } from './heatmap.js';
import { type TrendPoint, computeTrend } from './trend.js';
import { type CourseRow, computeCourseBreakdown } from './course.js';
import { computeSourceBreakdown } from './source.js';

export interface InsightItem { text: string; hint?: string }
export interface InsightGroup { title: string; items: InsightItem[] }

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const signedPct = (ratio: number) => { const d = Math.round((ratio - 1) * 100); return `${d >= 0 ? '+' : ''}${d}%`; };   // ratio=cur/prev
const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const signedYen = (n: number) => { const r = Math.round(n); return r === 0 ? '±0円' : `${r > 0 ? '+' : '-'}${Math.abs(r).toLocaleString('ja-JP')}円`; };
const jaMonth = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月`;

export function buildInsights(input: { all: HistoryRecord[]; period: Period; kpi: Kpi; heatmap: Heatmap; trend: TrendPoint[]; courseRows: CourseRow[]; sourceRows: CourseRow[] }): InsightGroup[] {
  const { all, period, kpi, heatmap, courseRows, sourceRows } = input;
  const prev = priorPeriod(period);
  const prevKpi = computeKpi(all, prev);
  const cmp = comparisonLabel(period);
  const groups: InsightGroup[] = [];

  // 1. 売上の要因
  { const items: InsightItem[] = [];
    if (prevKpi.revenue > 0) {
      items.push({ text: `売上 ${yen(kpi.revenue)}（${cmp} ${signedPct(kpi.revenue / prevKpi.revenue)}・${signedYen(kpi.revenue - prevKpi.revenue)}）。件数 ${kpi.bookings}件（${signedPct(prevKpi.bookings ? kpi.bookings / prevKpi.bookings : 1)}）・客単価 ${yen(kpi.avgPerBooking)}（前期 ${yen(prevKpi.avgPerBooking)}）` });
      if (prevKpi.bookings > 0) {
        const volume = (kpi.bookings - prevKpi.bookings) * prevKpi.avgPerBooking;
        const price = (kpi.avgPerBooking - prevKpi.avgPerBooking) * kpi.bookings;
        items.push({ text: `内訳: 件数増減で${signedYen(volume)}・客単価変化で${signedYen(price)}`, hint: Math.abs(volume) >= Math.abs(price) ? '→ 変化は主に客数（件数）によるもの' : '→ 変化は主に客単価によるもの' });
      }
    } else {
      items.push({ text: `売上 ${yen(kpi.revenue)}・件数 ${kpi.bookings}件・客単価 ${yen(kpi.avgPerBooking)}（比較できる前期間の実績なし）` });
    }
    groups.push({ title: '売上の要因', items }); }

  // 2. 勢い（月次バケット3以上）
  { const monthly = computeTrend(all, period, 'month');
    if (monthly.length >= 3) {
      const py = new Map(computeTrend(all, priorYear(period), 'month').map(p => [p.bucket, p.bookings]));
      const yoy = monthly.map(m => { const [y, mo] = m.bucket.split('-'); const pv = py.get(`${Number(y) - 1}-${mo}`) ?? 0; return { bucket: m.bucket, cur: m.bookings, prev: pv }; }).filter(x => x.prev >= 3);
      const items: InsightItem[] = [];
      if (yoy.length >= 1) {
        const best = yoy.reduce((a, b) => (b.cur / b.prev > a.cur / a.prev ? b : a));
        const worst = yoy.reduce((a, b) => (b.cur / b.prev < a.cur / a.prev ? b : a));
        items.push({ text: `前年同月比で最も伸びた月: ${jaMonth(best.bucket)}（${signedPct(best.cur / best.prev)}）／最も落ちた月: ${jaMonth(worst.bucket)}（${signedPct(worst.cur / worst.prev)}）` });
      }
      const last3 = monthly.slice(-3);
      const cur3 = last3.reduce((a, m) => a + m.bookings, 0);
      const prev3 = last3.reduce((a, m) => { const [y, mo] = m.bucket.split('-'); return a + (py.get(`${Number(y) - 1}-${mo}`) ?? 0); }, 0);
      if (prev3 > 0) {
        const r3 = cur3 / prev3; const overall = prevKpi.bookings > 0 ? kpi.bookings / prevKpi.bookings : null;
        const label = `${Number(last3[0].bucket.slice(5, 7))}〜${Number(last3[2].bucket.slice(5, 7))}月`;
        items.push({ text: `直近3ヶ月（${label}）は前年同期比 ${signedPct(r3)}`, hint: overall === null ? undefined : r3 >= overall ? '→ 足元の勢いは期間平均より強い' : '→ 足元は期間平均より鈍い' });
      }
      if (items.length) groups.push({ title: '勢い', items });
    } }

  // 3. 曜日・季節
  { const byW = Array(7).fill(0); for (let m = 0; m < 12; m++) for (let w = 0; w < 7; w++) byW[w] += heatmap.counts[m][w];
    const total = byW.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const items: InsightItem[] = [];
      const weekend = (byW[0] + byW[6]) / total;
      const ph = computeHeatmap(all, prev); const pByW = Array(7).fill(0); for (let m = 0; m < 12; m++) for (let w = 0; w < 7; w++) pByW[w] += ph.counts[m][w];
      const pTotal = pByW.reduce((a, b) => a + b, 0);
      const prevTxt = pTotal > 0 ? `（前期 ${pct((pByW[0] + pByW[6]) / pTotal)}）` : '';
      items.push({ text: `土日の比率 ${pct(weekend)}${prevTxt}`, hint: weekend >= 0.6 ? '→ 週末への依存度が高い' : '→ 平日にも一定の需要がある' });
      const maxW = byW.indexOf(Math.max(...byW)); const avg = total / 7;
      if (byW[maxW] > avg) items.push({ text: `最も予約が多い曜日は ${WD[maxW]}曜（平均比 +${pct(byW[maxW] / avg - 1)}）` });
      const monthly = computeTrend(all, period, 'month');
      if (monthly.length >= 3) { const peak = monthly.reduce((a, b) => (b.bookings > a.bookings ? b : a)); items.push({ text: `ピーク月は${jaMonth(peak.bucket)}（件数の${pct(peak.bookings / kpi.bookings)}）` }); }
      groups.push({ title: '曜日・季節', items });
    } }

  // 4. コース
  { if (courseRows.length > 0 && kpi.bookings > 0) {
      const items: InsightItem[] = [];
      const top = [...courseRows].sort((a, b) => b.bookings - a.bookings)[0];
      const bShare = top.bookings / kpi.bookings; const rShare = kpi.revenue > 0 ? top.revenue / kpi.revenue : 0;
      const hint = rShare >= bShare + 0.1 ? '→ 主力コースは単価も高く収益の柱' : bShare >= 0.6 ? '→ 特定コースへの集中度が高い' : undefined;
      items.push({ text: `最多コースは「${top.course}」（件数${pct(bShare)}・売上${pct(rShare)}）`, hint });
      const prevRows = new Map(computeCourseBreakdown(all, prev).map(r => [r.course, r.bookings]));
      const ratios = courseRows.filter(r => (prevRows.get(r.course) ?? 0) >= 3).map(r => ({ course: r.course, ratio: r.bookings / (prevRows.get(r.course) as number) }));
      if (ratios.length >= 1) {
        const up = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a)); const down = ratios.reduce((a, b) => (b.ratio < a.ratio ? b : a));
        items.push({ text: `${cmp}で最も伸びた: 「${up.course}」${signedPct(up.ratio)}／最も落ちた: 「${down.course}」${signedPct(down.ratio)}` });
      }
      groups.push({ title: 'コース', items });
    } }

  // 5. リピート
  { if (kpi.bookings > 0) {
      const items: InsightItem[] = [];
      if (prevKpi.bookings > 0) {
        const diffPt = Math.round((kpi.repeatRate - prevKpi.repeatRate) * 100);
        items.push({ text: `リピート率 ${pct(kpi.repeatRate)}（前期 ${pct(prevKpi.repeatRate)}・${diffPt >= 0 ? '+' : ''}${diffPt}pt）` });
        const newR = prevKpi.newCount > 0 ? kpi.newCount / prevKpi.newCount : null; const repR = prevKpi.repeatCount > 0 ? kpi.repeatCount / prevKpi.repeatCount : null;
        items.push({ text: `新規 ${kpi.newCount}件（${newR === null ? '前期0件' : cmp + ' ' + signedPct(newR)}）・リピート ${kpi.repeatCount}件（${repR === null ? '前期0件' : cmp + ' ' + signedPct(repR)}）`,
          hint: (newR !== null && newR < 1 && (repR ?? 1) >= 1) ? '→ リピーターが支え、新規獲得が課題' : (newR !== null && newR > 1) ? '→ 新規獲得が伸びている' : '→ 大きな変化なし' });
      } else {
        items.push({ text: `リピート率 ${pct(kpi.repeatRate)}（新規 ${kpi.newCount} / リピート ${kpi.repeatCount}）` });
      }
      groups.push({ title: 'リピート', items });
    } }

  // 6. 流入経路（自己申告）
  { if (sourceRows.length > 0 && kpi.bookings > 0) {
      const items: InsightItem[] = [];
      const top = [...sourceRows].sort((a, b) => b.bookings - a.bookings)[0];
      items.push({ text: `最多は「${top.course}」（${pct(top.bookings / kpi.bookings)}）` });
      const share = (rows: CourseRow[], name: string, total: number) => total > 0 ? (rows.find(r => r.course === name)?.bookings ?? 0) / total : 0;
      const prevRows = computeSourceBreakdown(all, prev);
      const ig = share(sourceRows, 'Instagram', kpi.bookings); const pIg = share(prevRows, 'Instagram', prevKpi.bookings);
      const unknown = share(sourceRows, '未回答', kpi.bookings) + share(sourceRows, '不明', kpi.bookings);
      items.push({ text: `Instagram経由 ${pct(ig)}${prevKpi.bookings > 0 ? `（前期 ${pct(pIg)}）` : ''}・未回答・不明 ${pct(unknown)}`,
        hint: unknown >= 0.3 ? '→ 未回答が多く、予約時の「経緯」の把握精度が分析の伸びしろ' : (prevKpi.bookings > 0 && ig > pIg) ? '→ Instagram経由が伸びている' : undefined });
      groups.push({ title: '流入経路（自己申告）', items });
    } }

  return groups;
}
```

- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run test/insights.test.ts`（他のテストは Task 5 の配線後に通る。`buildInsights` の呼び出し元 handlers.ts は型エラーになるため、**このタスク内で handlers.ts の呼び出しも新シグネチャに更新**する: `buildInsights({ all, period, kpi, heatmap, trend, courseRows, sourceRows })`。`DashboardData.insights` の型を `InsightGroup[]` に変更し、pages.ts の `insightList` は一旦 `d.insights.flatMap(g => g.items).map(i => …)` で従来と同じ `<li>` 描画にして typecheck を通す。表示の作り込みは Task 5）。`npm run typecheck && npx vitest run` 全件green（dashboard.test のフィクスチャ `insights` を `InsightGroup[]` 形式に更新）。
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 戦略インサイトを6グループの数字＋示唆に拡充"`

---

### Task 5: インサイトのグループ表示

**Files:**
- Modify: `src/pages.ts`
- Test: `test/dashboard.test.ts`

- [ ] **Step 1: 失敗するテストを書く**
```ts
  it('戦略インサイトはグループ見出し付きで、hintはmutedで表示', () => {
    const html = renderDashboard({ ...base, insights: [
      { title: '売上の要因', items: [{ text: '売上 100,000円', hint: '→ 変化は主に客数（件数）によるもの' }] },
      { title: 'リピート', items: [{ text: 'リピート率 50%' }] },
    ] });
    expect(html).toContain('<div class="ins-title">売上の要因</div>');
    expect(html).toContain('<div class="ins-title">リピート</div>');
    expect(html).toContain('<span class="ins-hint">→ 変化は主に客数（件数）によるもの</span>');
  });
```
- [ ] **Step 2: RED確認**
- [ ] **Step 3: 実装**（`src/pages.ts`）
  - CSS追加: `.ins-title{font-weight:700;font-size:13px;margin:8px 0 2px}.ins-hint{color:var(--muted);margin-left:6px}`
  - `insightList` を:
```ts
  const insightList = d.insights.map(g =>
    `<div class="ins-title">${esc(g.title)}</div><ul style="margin:0;padding-left:18px;font-size:14px">${g.items.map(i => `<li style="margin:4px 0">${esc(i.text)}${i.hint ? `<span class="ins-hint">${esc(i.hint)}</span>` : ''}</li>`).join('')}</ul>`
  ).join('');
```
  - insights セクションの `<ul …>${insightList}</ul>` を `<div>${insightList}</div>` に。
- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 戦略インサイトをグループ見出し＋示唆つきで表示"`

---

### Task 6: 仕上げ検証（コントローラ実施）
- [ ] 全体テスト green / `npx wrangler dev --local` で `?period=2026-08`・`?period=custom&from=…&to=…`・日次トグル・年一覧・インサイト表示を curl/ブラウザで確認
- [ ] Opus最終レビュー → 修正 → ユーザー承認後デプロイ
