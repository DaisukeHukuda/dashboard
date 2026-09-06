# GA4セクション読みやすさ改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「認知→予約」カードを説明文＋ミニKPI付きの「サイト訪問と予約の推移」に作り替え、「参照元/メディア Top」の各行に日本語の解説を付ける。

**Architecture:** 純関数2つ（`describeSourceMedium` / `summarizeOverlay`）を追加し、`src/ga4/section.ts` の描画で使う。チャート描画・データ取得は不変。

**Tech Stack:** TypeScript / Cloudflare Workers / vitest。スペック: `docs/superpowers/specs/2026-09-06-ga4-readability-design.md`

## Global Constraints

- 外部ライブラリ追加禁止 / UI文言は日本語
- 訪問100件あたり予約件数 = `bookings / sessions * 100`（小数1桁）。sessions=0 は `null`（表示「—」）
- 「最も効率が良かった月」は sessions ≥ 30 の月のみ対象
- 各タスクは `npm run typecheck && npm test` 全件 green 後にコミット（main直・日本語メッセージ）

---

### Task 1: describeSourceMedium と参照元テーブルの解説表示

**Files:**
- Create: `src/ga4/sourceLabel.ts`
- Modify: `src/ga4/section.ts`（`nvTable` に解説関数の任意引数）
- Test: `test/ga4-source-label.test.ts`（新規）, `test/ga4-section.test.ts`

**Interfaces:**
- Produces: `describeSourceMedium(label: string): string`

- [ ] **Step 1: 失敗するテストを書く**

Create `test/ga4-source-label.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describeSourceMedium } from '../src/ga4/sourceLabel.js';

describe('describeSourceMedium', () => {
  const cases: [string, string][] = [
    ['google / organic', 'Google検索の検索結果から（広告ではない自然検索）'],
    ['yahoo / organic', 'Yahoo!検索の検索結果から（広告ではない自然検索）'],
    ['bing / organic', 'Bing検索の検索結果から（広告ではない自然検索）'],
    ['(direct) / (none)', 'URL直接入力・ブックマーク・LINEなどアプリ内リンク（参照元が取れない流入）'],
    ['l.instagram.com / referral', 'Instagramのプロフィールや投稿のリンクから'],
    ['instagram / social', 'Instagramのプロフィールや投稿のリンクから'],
    ['m.facebook.com / referral', 'Facebookのプロフィールや投稿のリンクから'],
    ['t.co / referral', 'X（旧Twitter）のプロフィールや投稿のリンクから'],
    ['asoview.com / referral', 'アソビュー（予約サイト）からのリンク'],
    ['google / cpc', 'Google広告のクリック'],
    ['example.jp / referral', '他サイト（example.jp）のリンクから'],
    ['newsletter / email', 'メール内のリンクから'],
    ['someapp / social', 'SNS（someapp）のリンクから'],
    ['(not set)', '計測できなかった流入'],
    ['foo / bar', 'foo / bar からの流入'],
  ];
  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => { expect(describeSourceMedium(input)).toBe(expected); });
  }
});
```

`test/ga4-section.test.ts` の接続済みレンダリングテストに追加（フィクスチャの `sourceMedium` に `{ label: 'google / organic', sessions: 10 }` が無ければ追加してから）:

```ts
    expect(html).toContain('Google検索の検索結果から');
```

- [ ] **Step 2: RED確認** Run: `npx vitest run test/ga4-source-label.test.ts test/ga4-section.test.ts` → FAIL

- [ ] **Step 3: 実装**

Create `src/ga4/sourceLabel.ts`:

```ts
// GA4 の sessionSourceMedium（例 "google / organic"）を、経営者が読める短い日本語にする。
const SEARCH_ENGINES: Record<string, string> = { google: 'Google', yahoo: 'Yahoo!', bing: 'Bing', duckduckgo: 'DuckDuckGo', baidu: 'Baidu', ecosia: 'Ecosia' };

const SNS: { match: RegExp; name: string }[] = [
  { match: /^instagram$|instagram\.com$/, name: 'Instagram' },
  { match: /^facebook$|facebook\.com$/, name: 'Facebook' },
  { match: /^t\.co$|twitter\.com$|^x\.com$/, name: 'X（旧Twitter）' },
  { match: /youtube\.com$|^youtube$/, name: 'YouTube' },
  { match: /^line$|line\.me$/, name: 'LINE' },
];

const KNOWN_SITES: { match: RegExp; name: string }[] = [
  { match: /asoview\.com$/, name: 'アソビュー（予約サイト）' },
  { match: /jalan\.net$/, name: 'じゃらん' },
  { match: /tripadvisor/, name: 'トリップアドバイザー' },
];

export function describeSourceMedium(label: string): string {
  const [rawSource = '', rawMedium = ''] = label.split(' / ');
  const source = rawSource.trim();
  const medium = rawMedium.trim().toLowerCase();
  const s = source.toLowerCase();

  if (s === '(not set)') return '計測できなかった流入';
  if (s === '(direct)' || medium === '(none)') return 'URL直接入力・ブックマーク・LINEなどアプリ内リンク（参照元が取れない流入）';
  if (medium === 'organic') return `${SEARCH_ENGINES[s] ?? source}検索の検索結果から（広告ではない自然検索）`;
  if (medium === 'cpc' || medium === 'ppc' || medium.startsWith('paid')) return `${SEARCH_ENGINES[s] ?? source}広告のクリック`;
  if (medium === 'email') return 'メール内のリンクから';

  const sns = SNS.find(k => k.match.test(s));
  if (sns) return `${sns.name}のプロフィールや投稿のリンクから`;
  if (medium === 'social') return `SNS（${source}）のリンクから`;

  const site = KNOWN_SITES.find(k => k.match.test(s));
  if (site) return `${site.name}からのリンク`;
  if (medium === 'referral') return `他サイト（${source}）のリンクから`;
  return `${source} / ${rawMedium.trim()} からの流入`;
}
```

`src/ga4/section.ts`:
- import 追加: `import { describeSourceMedium } from './sourceLabel.js';`
- `nvTable` を解説関数対応に:

```ts
function nvTable(rows: NameValue[], head: string, describe?: (label: string) => string): string {
  const body = rows.map(r => {
    const note = describe ? `<div style="font-size:11px;color:var(--muted);margin-top:1px">${esc(describe(r.label))}</div>` : '';
    return `<tr><td style="padding:4px 10px">${esc(r.label.slice(0, 30))}${note}</td><td style="padding:4px 10px;text-align:right;vertical-align:top">${r.sessions}</td></tr>`;
  }).join('');
  return `<table style="font-size:13px;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:2px 10px">${esc(head)}</th><th style="padding:2px 10px">セッション</th></tr></thead><tbody>${body}</tbody></table>`;
}
```

- 参照元テーブルの呼び出しを `nvTable(d.sourceMedium, '参照元/メディア', describeSourceMedium)` に変更（他の nvTable 呼び出しは第3引数なし＝従来どおり）。

- [ ] **Step 4: GREEN確認** Run: `npm run typecheck && npx vitest run` → 全件PASS
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 参照元/メディアに日本語の解説を表示"`

---

### Task 2: 「サイト訪問と予約の推移」カード（説明文＋ミニKPI）

**Files:**
- Modify: `src/metrics/traffic.ts`（`summarizeOverlay` 追加）, `src/ga4/section.ts`
- Test: `test/traffic.test.ts`, `test/ga4-section.test.ts`

**Interfaces:**
- Produces: `summarizeOverlay(points: TrafficPoint[]): { sessions: number; bookings: number; per100: number | null; best: { bucket: string; per100: number } | null }`

- [ ] **Step 1: 失敗するテストを書く**

`test/traffic.test.ts` に追加（import に `summarizeOverlay` を追記）:

```ts
describe('summarizeOverlay', () => {
  it('合計と訪問100件あたり予約件数、最良月（訪問30件以上）を返す', () => {
    const s = summarizeOverlay([
      { bucket: '2026-05', sessions: 100, bookings: 3 }, // 3.0
      { bucket: '2026-06', sessions: 50, bookings: 2 },  // 4.0 ← best
      { bucket: '2026-07', sessions: 10, bookings: 5 },  // 50.0 だが30件未満なので除外
    ]);
    expect(s.sessions).toBe(160);
    expect(s.bookings).toBe(10);
    expect(s.per100).toBeCloseTo(6.25, 2);
    expect(s.best).toEqual({ bucket: '2026-06', per100: 4 });
  });
  it('sessions=0 なら per100 と best は null', () => {
    const s = summarizeOverlay([{ bucket: '2026-05', sessions: 0, bookings: 2 }]);
    expect(s.per100).toBeNull();
    expect(s.best).toBeNull();
  });
  it('空配列でも壊れない', () => {
    expect(summarizeOverlay([])).toEqual({ sessions: 0, bookings: 0, per100: null, best: null });
  });
});
```

`test/ga4-section.test.ts` の接続済みテストに追加（フィクスチャの overlay が `sessions: 200, bookings: 4` の1点なら per100=2.0。フィクスチャの値に合わせて期待値を書く）:

```ts
    expect(html).toContain('サイト訪問と予約の推移');
    expect(html).toContain('訪問100件あたり');
    expect(html).toContain('予約完了はアソビュー側');
```

- [ ] **Step 2: RED確認** Run: `npx vitest run test/traffic.test.ts test/ga4-section.test.ts` → FAIL

- [ ] **Step 3: 実装**

`src/metrics/traffic.ts` 末尾に追加:

```ts
export interface OverlaySummary {
  sessions: number; bookings: number;
  per100: number | null;                       // 訪問100件あたり予約件数（sessions=0はnull）
  best: { bucket: string; per100: number } | null; // 訪問30件以上の月で最も効率が良かった月
}

const MIN_SESSIONS_FOR_BEST = 30;

export function summarizeOverlay(points: TrafficPoint[]): OverlaySummary {
  const sessions = points.reduce((a, p) => a + p.sessions, 0);
  const bookings = points.reduce((a, p) => a + p.bookings, 0);
  const per100 = sessions > 0 ? (bookings / sessions) * 100 : null;
  let best: OverlaySummary['best'] = null;
  for (const p of points) {
    if (p.sessions < MIN_SESSIONS_FOR_BEST) continue;
    const v = (p.bookings / p.sessions) * 100;
    if (!best || v > best.per100) best = { bucket: p.bucket, per100: v };
  }
  return { sessions, bookings, per100, best };
}
```

`src/ga4/section.ts`:
- import 追加: `import { summarizeOverlay } from '../metrics/traffic.js';`
- `renderTrafficSection` 内、`const trend = …` の後に:

```ts
  const sum = summarizeOverlay(d.overlay);
  const fmt1 = (v: number | null) => v === null ? '—' : v.toFixed(1);
  const mini = (label: string, value: string) =>
    `<div style="flex:1;min-width:120px;background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:8px 10px"><div style="font-size:11px;color:var(--muted)">${esc(label)}</div><div style="font-size:18px;font-weight:700">${esc(value)}</div></div>`;
  const bestLine = sum.best
    ? `<p style="font-size:12px;color:var(--muted);margin:6px 0 0">最も効率が良かった月: ${esc(sum.best.bucket)}（訪問100件あたり ${fmt1(sum.best.per100)}件）</p>`
    : '';
  const overlayCard = `<div class="card"><h2>サイト訪問と予約の推移（棒=サイト訪問数 / 線=予約件数）</h2>
<p style="font-size:13px;color:var(--muted);margin:0 0 10px">棒はWebサイトへの訪問数（GA4セッション）、線は同じ月の予約件数。訪問が増えているのに予約が伸びない月は、サイトの中身や予約導線に改善余地があるサインです。※予約完了はアソビュー側で行われるためGA4では追跡できず、厳密な因果ではなく目安です。</p>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${mini('サイト訪問数', sum.sessions.toLocaleString('ja-JP'))}${mini('予約件数', `${sum.bookings}件`)}${mini('訪問100件あたりの予約件数', `${fmt1(sum.per100)}件`)}</div>
${renderTrendChart(trend)}${bestLine}</div>`;
```

- 既存の `<div class="card"><h2>認知→予約（棒=セッション / 線=予約件数）</h2>${renderTrendChart(trend)}</div>` を `${overlayCard}` に置き換える。

- [ ] **Step 4: GREEN確認** Run: `npm run typecheck && npx vitest run` → 全件PASS（既存テストで「認知→予約」文言を期待するものがあれば新見出しに更新）
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: サイト訪問と予約の推移カードに説明文とミニKPIを追加"`

---

### Task 3: 仕上げ検証（コントローラ実施）
- [ ] `npm run typecheck && npm test` 全件green
- [ ] ローカルE2Eは GA4 未接続のため不可 → 単体テストと本番デプロイ後の目視で確認（Webサイトビュー）
- [ ] レビュー後、ユーザー承認を得てデプロイ
