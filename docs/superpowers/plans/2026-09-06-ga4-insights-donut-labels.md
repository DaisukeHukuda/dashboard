# GA4インサイト拡充＋ドーナツ引き出し線＋年/月ラベル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全トレンドグラフのX軸を年/月表記に、流入チャネルのドーナツを引き出し線＋日本語名に、GA4インサイトを前期比較つき6グループに拡充する。

**Architecture:** `line.ts` は bucket から描画時にラベル生成（年境界で年付き）。`ga4/labels.ts` に日本語名マップ。`donut.ts` は3%未満合算＋引き出し線レイアウト。GA4は前期間の3レポートを追加取得し `buildGa4Insights` が `InsightGroup[]` を返す。表示は `renderInsightGroups` を共通化。

**Tech Stack:** TypeScript / Cloudflare Workers / vitest。スペック: `docs/superpowers/specs/2026-09-06-ga4-insights-donut-labels-design.md`

## Global Constraints
- 外部ライブラリ追加禁止 / UI文言は日本語 / `DATA` KV read-only
- GA4 前期取得は `period.kind !== 'all'` のときのみ。月別YoYは last24・366日超custom・all では省略
- 各タスクは `npm run typecheck && npm test` 全件 green 後にコミット（main直・日本語メッセージ）

---

### Task 1: X軸ラベルの年/月表記（`src/charts/line.ts`）

**Files:** Modify `src/charts/line.ts` / Test `test/charts.test.ts`

- [ ] **Step 1: 失敗するテストを書く**（`test/charts.test.ts`。`renderTrendChart` の既存 import を使用）
```ts
describe('renderTrendChart axis labels (year/month)', () => {
  const pt = (bucket: string, label = bucket) => ({ bucket, label, bookings: 1, revenue: 100 });
  const labels = (svg: string) => [...svg.matchAll(/text-anchor="middle">([^<]*)<\/text>/g)].map(m => m[1]);
  it('月次は先頭と年の変わり目に年を付ける', () => {
    const svg = renderTrendChart([pt('2025-11'), pt('2025-12'), pt('2026-01'), pt('2026-02')]);
    expect(labels(svg)).toEqual(['2025/11', '12', '2026/1', '2']);
  });
  it('週次（label===bucket）は年/月/日 → 月/日', () => {
    const svg = renderTrendChart([pt('2026-08-10'), pt('2026-08-17')]);
    expect(labels(svg)).toEqual(['2026/8/10', '8/17']);
  });
  it('日次（labelが整形済み）はそのまま', () => {
    const svg = renderTrendChart([pt('2026-08-01', '8/1'), pt('2026-08-02', '8/2')]);
    expect(labels(svg)).toEqual(['8/1', '8/2']);
  });
  it('間引き後の並びで年境界を判定する', () => {
    const pts = Array.from({ length: 24 }, (_, i) => { const y = 2024 + Math.floor(i / 12); const m = (i % 12) + 1; return pt(`${y}-${String(m).padStart(2, '0')}`); });
    const l = labels(renderTrendChart(pts)); // labelEvery=2 → 12ラベル
    expect(l[0]).toBe('2024/1');
    expect(l).toContain('2025/1');
    expect(l.filter(x => x.includes('/')).length).toBe(2);
  });
});
```
- [ ] **Step 2: RED確認** `npx vitest run test/charts.test.ts`
- [ ] **Step 3: 実装**（`src/charts/line.ts` のラベル描画ループを置換）
```ts
  const labelEvery = Math.ceil(n / 12) || 1;
  let lastYear = '';
  points.forEach((p, i) => {
    if (i % labelEvery !== 0) return;
    const x = left + i * step + step / 2;
    let text = p.label;
    const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(p.bucket);
    if (iso && p.label === p.bucket) {
      const [, y, m, d] = iso;
      const showYear = y !== lastYear;
      const md = d ? `${Number(m)}/${Number(d)}` : `${Number(m)}`;
      text = showYear ? `${y}/${md}` : md;
      lastYear = y;
    }
    s += `<text x="${x.toFixed(1)}" y="${H - 8}" font-size="10" fill="#6b7280" text-anchor="middle">${escXml(text)}</text>`;
  });
```
（既存の `p.label.replace(/^\d{4}-/, '')` 行は削除。他の描画は不変）
- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`（既存テストで `>08<` 等を期待するものは新形式に更新し理由を報告）
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: トレンドグラフのX軸を年/月表記に（年境界で年付き）"`

---

### Task 2: チャネル日本語名＋ドーナツ引き出し線

**Files:** Create `src/ga4/labels.ts` / Modify `src/charts/donut.ts` / Test `test/ga4-labels.test.ts`（新規）, `test/charts2.test.ts`（renderDonut テストがある方）

**Interfaces（Produces）:** `channelNameJa(label: string): string`・`regionNameJa(label: string): string`・`pageNameJa(path: string): string`（`/`→「トップページ」、他は原文）。`renderDonut(rows: NameValue[]): string`（シグネチャ不変・見た目変更）。

- [ ] **Step 1: 失敗するテストを書く**
`test/ga4-labels.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { channelNameJa, regionNameJa, pageNameJa } from '../src/ga4/labels.js';
describe('ga4 labels', () => {
  it('channelNameJa', () => {
    expect(channelNameJa('Organic Search')).toBe('自然検索');
    expect(channelNameJa('direct')).toBe('直接アクセス');
    expect(channelNameJa('Organic Social')).toBe('SNS');
    expect(channelNameJa('Paid Social')).toBe('SNS広告');
    expect(channelNameJa('Referral')).toBe('他サイトのリンク');
    expect(channelNameJa('Unassigned')).toBe('不明');
    expect(channelNameJa('(not set)')).toBe('不明');
    expect(channelNameJa('Something New')).toBe('Something New');
  });
  it('regionNameJa', () => {
    expect(regionNameJa('Tokyo')).toBe('東京'); expect(regionNameJa('Tochigi')).toBe('栃木'); expect(regionNameJa('Kanagawa')).toBe('神奈川');
    expect(regionNameJa('Hokkaido')).toBe('北海道'); expect(regionNameJa('California')).toBe('California');
  });
  it('pageNameJa', () => { expect(pageNameJa('/')).toBe('トップページ'); expect(pageNameJa('/course')).toBe('/course'); });
});
```
`renderDonut` テスト（既存ファイルに追加）:
```ts
describe('renderDonut callouts', () => {
  it('引き出し線と日本語ラベル、3%未満は「その他」', () => {
    const svg = renderDonut([
      { label: 'Organic Search', sessions: 60 }, { label: 'Direct', sessions: 25 },
      { label: 'Organic Social', sessions: 12 }, { label: 'Email', sessions: 2 }, { label: 'Display', sessions: 1 },
    ]);
    expect(svg).toContain('自然検索 60%');
    expect(svg).toContain('直接アクセス 25%');
    expect(svg).toContain('その他 3%');
    expect(svg).not.toContain('メール');
    expect((svg.match(/<polyline/g) ?? []).length).toBe(4); // 4スライス=4本
    expect(svg).not.toContain('<rect'); // 凡例廃止
  });
  it('データなし', () => { expect(renderDonut([])).toContain('データなし'); });
});
```
- [ ] **Step 2: RED確認**
- [ ] **Step 3: 実装**
`src/ga4/labels.ts`:
```ts
const CHANNELS: Record<string, string> = {
  'organic search': '自然検索', 'direct': '直接アクセス', 'organic social': 'SNS', 'paid social': 'SNS広告',
  'referral': '他サイトのリンク', 'paid search': '有料検索', 'display': 'ディスプレイ広告', 'email': 'メール',
  'organic video': '動画', 'paid video': '動画広告', 'cross-network': '広告（複数媒体）', 'affiliates': 'アフィリエイト',
  'organic shopping': 'ショッピング', 'paid shopping': 'ショッピング広告', 'audio': '音声', 'sms': 'SMS',
  'mobile push notifications': 'プッシュ通知', 'unassigned': '不明', '(not set)': '不明',
};
export function channelNameJa(label: string): string {
  const k = label.trim().toLowerCase();
  return Object.hasOwn(CHANNELS, k) ? CHANNELS[k] : label;
}
const REGIONS: Record<string, string> = {
  hokkaido: '北海道', aomori: '青森', iwate: '岩手', miyagi: '宮城', akita: '秋田', yamagata: '山形', fukushima: '福島',
  ibaraki: '茨城', tochigi: '栃木', gunma: '群馬', saitama: '埼玉', chiba: '千葉', tokyo: '東京', kanagawa: '神奈川',
  niigata: '新潟', toyama: '富山', ishikawa: '石川', fukui: '福井', yamanashi: '山梨', nagano: '長野', gifu: '岐阜',
  shizuoka: '静岡', aichi: '愛知', mie: '三重', shiga: '滋賀', kyoto: '京都', osaka: '大阪', hyogo: '兵庫', nara: '奈良',
  wakayama: '和歌山', tottori: '鳥取', shimane: '島根', okayama: '岡山', hiroshima: '広島', yamaguchi: '山口',
  tokushima: '徳島', kagawa: '香川', ehime: '愛媛', kochi: '高知', fukuoka: '福岡', saga: '佐賀', nagasaki: '長崎',
  kumamoto: '熊本', oita: '大分', miyazaki: '宮崎', kagoshima: '鹿児島', okinawa: '沖縄',
};
export function regionNameJa(label: string): string {
  const k = label.trim().toLowerCase().replace(/\s*(prefecture|-ken|-fu|-to)$/i, '');
  return Object.hasOwn(REGIONS, k) ? REGIONS[k] : label;
}
export function pageNameJa(path: string): string { return path === '/' ? 'トップページ' : path; }
```
`src/charts/donut.ts` を書き換え（引き出し線・日本語名・その他合算・凡例廃止）:
```ts
import type { NameValue } from '../ga4/reports.js';
import { svgOpen, svgClose, escXml } from './svg.js';
import { channelNameJa } from '../ga4/labels.js';

const COLORS = ['#1e3a5f', '#3b6ea5', '#6aa0d8', '#9ac0e8', '#c7d2e0', '#8fa3bf', '#4a5b78', '#2c3e50'];
const MIN_FRAC = 0.03;

export function renderDonut(rows: NameValue[]): string {
  const W = 520, H = 200, cx = 260, cy = 100, rOuter = 70, rInner = 40, elbow = rOuter + 14, labelX = 34;
  const total = rows.reduce((s, r) => s + r.sessions, 0);
  let s = svgOpen(W, H);
  if (total <= 0) return s + `<text x="10" y="100" font-size="12" fill="#6b7280">データなし</text>` + svgClose();
  // 3%未満を「その他」に合算
  const major = rows.filter(r => r.sessions / total >= MIN_FRAC);
  const minorSum = rows.filter(r => r.sessions / total < MIN_FRAC).reduce((a, r) => a + r.sessions, 0);
  const slices = [...major.map(r => ({ name: channelNameJa(r.label), raw: r.label, sessions: r.sessions })),
    ...(minorSum > 0 ? [{ name: 'その他', raw: 'その他', sessions: minorSum }] : [])];
  // 角度計算
  let a0 = -Math.PI / 2;
  const geo = slices.map((sl, i) => { const frac = sl.sessions / total; const a1 = a0 + frac * Math.PI * 2; const mid = (a0 + a1) / 2; const g = { ...sl, i, frac, a0, a1, mid }; a0 = a1; return g; });
  const p = (ang: number, rad: number) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)] as const;
  // ラベル縦位置（左右別にソートして14px以上離す）
  const place = (side: 'L' | 'R') => {
    const items = geo.filter(g => (Math.cos(g.mid) >= 0) === (side === 'R')).map(g => ({ g, y: p(g.mid, elbow)[1] })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < items.length; k++) if (items[k].y < items[k - 1].y + 14) items[k].y = items[k - 1].y + 14;
    const over = items.length ? items[items.length - 1].y - (H - 8) : 0;
    if (over > 0) items.forEach(it => { it.y -= over; });
    return new Map(items.map(it => [it.g.i, it.y]));
  };
  const ys = new Map([...place('L'), ...place('R')]);
  for (const g of geo) {
    const large = g.frac > 0.5 ? 1 : 0;
    const f = (pt: readonly [number, number]) => `${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`;
    const d = `M ${f(p(g.a0, rOuter))} A ${rOuter} ${rOuter} 0 ${large} 1 ${f(p(g.a1, rOuter))} L ${f(p(g.a1, rInner))} A ${rInner} ${rInner} 0 ${large} 0 ${f(p(g.a0, rInner))} Z`;
    s += `<path d="${d}" fill="${COLORS[g.i % COLORS.length]}"><title>${escXml(g.raw)}: ${g.sessions}</title></path>`;
    const right = Math.cos(g.mid) >= 0;
    const [ax, ay] = p(g.mid, rOuter); const [ex] = p(g.mid, elbow); const ly = ys.get(g.i) ?? ay;
    const tx = right ? W - labelX : labelX;
    s += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${ly.toFixed(1)} ${(right ? tx - 4 : tx + 4).toFixed(1)},${ly.toFixed(1)}" fill="none" stroke="#9ca3af" stroke-width="1"/>`;
    s += `<text x="${tx}" y="${(ly + 4).toFixed(1)}" font-size="11" fill="#1f2937" text-anchor="${right ? 'end' : 'start'}">${escXml(g.name)} ${Math.round(g.frac * 100)}%</text>`;
  }
  return s + svgClose();
}
```
（`labelX` はラベル端の余白。右側ラベルは `text-anchor="end"` で右端揃え、左側は `start`。テストの「その他 3%」は 2+1=3/100 → 3%）
- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`（既存の donut テストが `<rect`（凡例）や英語ラベルを期待していれば更新）
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 流入チャネルのドーナツを引き出し線＋日本語名に（3%未満はその他）"`

---

### Task 3: GA4インサイト拡充（前期取得・6グループ・共通描画）

**Files:** Modify `src/ga4/insights.ts`（全面）, `src/handlers.ts`, `src/ga4/section.ts`, `src/pages.ts`（`renderInsightGroups` export）, `src/metrics/insights.ts`（型 export 済みなら不要）／Test `test/ga4-insights.test.ts`（全面）, `test/ga4-section.test.ts`, `test/ga4-home.test.ts`, `test/dashboard.test.ts`（必要なら）

**Interfaces（Produces）:**
- `buildGa4Insights(input: { period: Period; channels: NameValue[]; prevChannels: NameValue[] | null; sourceMedium: NameValue[]; prevSourceMedium: NameValue[] | null; devices: NameValue[]; regions: NameValue[]; topPages: NameValue[]; overlay: TrafficPoint[]; prevOverlay: TrafficPoint[] | null }): InsightGroup[]`（prev が `null` ＝比較なし）
- `TrafficData.insights: InsightGroup[]`
- `renderInsightGroups(groups: InsightGroup[]): string`（pages.ts から export。既存の insightList 生成をこの関数に置き換え）

- [ ] **Step 1: 失敗するテストを書く**（`test/ga4-insights.test.ts` を全面書き換え）
```ts
import { describe, it, expect } from 'vitest';
import { buildGa4Insights } from '../src/ga4/insights.js';
import { resolvePeriod } from '../src/period.js';
const nv = (label: string, sessions: number) => ({ label, sessions });
const base = {
  period: resolvePeriod('2025', '2026-09-06'),
  channels: [nv('Organic Search', 60), nv('Direct', 20), nv('Organic Social', 20)],
  prevChannels: [nv('Organic Search', 50), nv('Direct', 30), nv('Organic Social', 10)],
  sourceMedium: [nv('google / organic', 60), nv('l.instagram.com / referral', 20), nv('asoview.com / referral', 10), nv('(direct) / (none)', 10)],
  prevSourceMedium: [nv('google / organic', 50), nv('l.instagram.com / referral', 10), nv('(direct) / (none)', 30)],
  devices: [nv('mobile', 80), nv('desktop', 20)],
  regions: [nv('Tokyo', 50), nv('Tochigi', 30), nv('Saitama', 20)],
  topPages: [nv('/', 50), nv('/course', 30), nv('/access', 20)],
  overlay: [
    { bucket: '2025-05', sessions: 100, bookings: 2 }, { bucket: '2025-06', sessions: 200, bookings: 4 }, { bucket: '2025-07', sessions: 300, bookings: 9 },
  ],
  prevOverlay: [
    { bucket: '2024-05', sessions: 100, bookings: 2 }, { bucket: '2024-06', sessions: 100, bookings: 2 }, { bucket: '2024-07', sessions: 100, bookings: 1 },
  ],
};
const text = (g: ReturnType<typeof buildGa4Insights>, t: string) => g.find(x => x.title === t)!.items.map(i => i.text + (i.hint ? ' ' + i.hint : '')).join('\n');
const titles = (g: ReturnType<typeof buildGa4Insights>) => g.map(x => x.title);

describe('buildGa4Insights', () => {
  it('6グループが出る', () => {
    expect(titles(buildGa4Insights(base))).toEqual(['訪問の勢い', 'チャネル構成', '参照元', '訪問→参加', 'デバイス・地域', '人気ページ']);
  });
  it('訪問の勢い: 合計・前期比・最も伸びた/落ちた月', () => {
    const t = text(buildGa4Insights(base), '訪問の勢い');
    expect(t).toContain('サイト訪問 600（前年比 +100%）');
    expect(t).toContain('最も伸びた月: 2025年7月（+200%）');
    expect(t).toContain('最も落ちた月: 2025年5月（±0%）');
    expect(t).toContain('→ 集客は拡大傾向');
  });
  it('チャネル構成: 最大チャネルとSNS成長hint', () => {
    const t = text(buildGa4Insights(base), 'チャネル構成');
    expect(t).toContain('最大は自然検索 60%（前期 56%・+4pt）');
    expect(t).toContain('自然検索 60%・SNS 20%・直接アクセス 20%');
    expect(t).toContain('→ 検索経由への依存が高い');
  });
  it('参照元: Instagram・アソビュー', () => {
    const t = text(buildGa4Insights(base), '参照元');
    expect(t).toContain('Instagram経由の訪問 20%（前期 11%）');
    expect(t).toContain('アソビュー経由 10%');
    expect(t).toContain('→ Instagramが集客に効き始めている');
  });
  it('訪問→参加: 訪問100件あたり参加と改善hint', () => {
    const t = text(buildGa4Insights(base), '訪問→参加');
    expect(t).toContain('訪問100件あたり参加 2.5件（前期 1.7件）');
    expect(t).toContain('→ 訪問から参加への転換が改善');
  });
  it('デバイス・地域', () => {
    const t = text(buildGa4Insights(base), 'デバイス・地域');
    expect(t).toContain('スマホ 80%');
    expect(t).toContain('東京 50%・栃木 30%・埼玉 20%');
    expect(t).toContain('→ スマホでの見やすさが最優先');
  });
  it('人気ページ', () => {
    expect(text(buildGa4Insights(base), '人気ページ')).toContain('トップページ 50%・/course 30%・/access 20%');
  });
  it('prev が null なら比較・勢いの月別を省略', () => {
    const g = buildGa4Insights({ ...base, prevChannels: null, prevSourceMedium: null, prevOverlay: null });
    const t = text(g, '訪問の勢い');
    expect(t).toContain('サイト訪問 600');
    expect(t).not.toContain('前年比');
    expect(t).not.toContain('最も伸びた月');
    expect(text(g, 'チャネル構成')).not.toContain('前期');
  });
  it('last24 では月別YoYを省略するが前期比は出す', () => {
    const g = buildGa4Insights({ ...base, period: resolvePeriod('last24', '2026-09-06') });
    const t = text(g, '訪問の勢い');
    expect(t).toContain('前24ヶ月比');
    expect(t).not.toContain('最も伸びた月');
  });
});
```
- [ ] **Step 2: RED確認**
- [ ] **Step 3: 実装**
`src/ga4/insights.ts` 全面:
```ts
import type { NameValue } from './reports.js';
import type { TrafficPoint } from '../metrics/traffic.js';
import { summarizeOverlay } from '../metrics/traffic.js';
import type { InsightGroup, InsightItem } from '../metrics/insights.js';
import { type Period, comparisonLabel, spanDays } from '../period.js';
import { channelNameJa, regionNameJa, pageNameJa } from './labels.js';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signedPct = (ratio: number) => { const d = Math.round((ratio - 1) * 100); return d === 0 ? '±0%' : `${d > 0 ? '+' : ''}${d}%`; };
const signedPt = (d: number) => { const r = Math.round(d); return r === 0 ? '±0pt' : `${r > 0 ? '+' : ''}${r}pt`; };
const jaMonth = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月`;
const sum = (rows: NameValue[]) => rows.reduce((a, r) => a + r.sessions, 0);
const share = (rows: NameValue[], pred: (label: string) => boolean) => { const t = sum(rows); return t > 0 ? rows.filter(r => pred(r.label)).reduce((a, r) => a + r.sessions, 0) / t : 0; };
const isIg = (l: string) => /(^|\.)instagram\.com\b|^instagram\b/i.test(l.split(' / ')[0].trim());
const isAsoview = (l: string) => /(^|\.)asoview\.com\b/i.test(l.split(' / ')[0].trim());
const ch = (l: string, ...names: string[]) => names.includes(channelNameJa(l));

export function buildGa4Insights(input: { period: Period; channels: NameValue[]; prevChannels: NameValue[] | null; sourceMedium: NameValue[]; prevSourceMedium: NameValue[] | null; devices: NameValue[]; regions: NameValue[]; topPages: NameValue[]; overlay: TrafficPoint[]; prevOverlay: TrafficPoint[] | null }): InsightGroup[] {
  const { period, channels, prevChannels, sourceMedium, prevSourceMedium, devices, regions, topPages, overlay, prevOverlay } = input;
  const cmp = comparisonLabel(period);
  const groups: InsightGroup[] = [];
  const cur = summarizeOverlay(overlay); const prev = prevOverlay ? summarizeOverlay(prevOverlay) : null;
  const skipMonthly = period.kind === 'last24' || period.kind === 'all' || (period.kind === 'custom' && spanDays(period) > 366);

  // 1. 訪問の勢い
  { const items: InsightItem[] = [];
    if (cur.sessions > 0) {
      const ratio = prev && prev.sessions > 0 ? cur.sessions / prev.sessions : null;
      items.push({ text: `サイト訪問 ${cur.sessions.toLocaleString('ja-JP')}${ratio !== null ? `（${cmp} ${signedPct(ratio)}）` : ''}`,
        hint: ratio === null ? undefined : ratio >= 1.1 ? '→ 集客は拡大傾向' : ratio <= 0.9 ? '→ 集客は縮小傾向' : undefined });
      if (prevOverlay && !skipMonthly && overlay.length >= 3) {
        const pm = new Map(prevOverlay.map(p => [p.bucket, p.sessions]));
        const yoy = overlay.map(o => { const [y, m] = o.bucket.split('-'); const pv = pm.get(`${Number(y) - 1}-${m}`) ?? 0; return { b: o.bucket, r: pv > 0 ? o.sessions / pv : null }; }).filter(x => x.r !== null) as { b: string; r: number }[];
        if (yoy.length >= 2) { const best = yoy.reduce((a, b) => (b.r > a.r ? b : a)); const worst = yoy.reduce((a, b) => (b.r < a.r ? b : a)); items.push({ text: `前年同月比で最も伸びた月: ${jaMonth(best.b)}（${signedPct(best.r)}）／最も落ちた月: ${jaMonth(worst.b)}（${signedPct(worst.r)}）` }); }
        else if (yoy.length === 1) items.push({ text: `前年同月比: ${jaMonth(yoy[0].b)}（${signedPct(yoy[0].r)}）` });
      }
    }
    if (items.length) groups.push({ title: '訪問の勢い', items }); }

  // 2. チャネル構成
  { const total = sum(channels);
    if (total > 0) { const items: InsightItem[] = [];
      const top = [...channels].sort((a, b) => b.sessions - a.sessions)[0]; const topShare = top.sessions / total;
      const prevTop = prevChannels && sum(prevChannels) > 0 ? share(prevChannels, l => channelNameJa(l) === channelNameJa(top.label)) : null;
      items.push({ text: `最大は${channelNameJa(top.label)} ${pct(topShare)}${prevTop !== null ? `（前期 ${pct(prevTop)}・${signedPt((topShare - prevTop) * 100)}）` : ''}` });
      const org = share(channels, l => ch(l, '自然検索')); const sns = share(channels, l => ch(l, 'SNS', 'SNS広告')); const dir = share(channels, l => ch(l, '直接アクセス'));
      const prevSns = prevChannels && sum(prevChannels) > 0 ? share(prevChannels, l => ch(l, 'SNS', 'SNS広告')) : null;
      items.push({ text: `自然検索 ${pct(org)}・SNS ${pct(sns)}・直接アクセス ${pct(dir)}`, hint: org >= 0.5 ? '→ 検索経由への依存が高い' : (prevSns !== null && (sns - prevSns) * 100 >= 3) ? '→ SNSからの流入が伸びている' : undefined });
      groups.push({ title: 'チャネル構成', items }); } }

  // 3. 参照元
  { if (sum(sourceMedium) > 0) { const items: InsightItem[] = [];
      const ig = share(sourceMedium, isIg); const prevIg = prevSourceMedium && sum(prevSourceMedium) > 0 ? share(prevSourceMedium, isIg) : null; const aso = share(sourceMedium, isAsoview);
      const dPt = prevIg !== null ? (ig - prevIg) * 100 : null;
      items.push({ text: `Instagram経由の訪問 ${pct(ig)}${prevIg !== null ? `（前期 ${pct(prevIg)}）` : ''}・アソビュー経由 ${pct(aso)}`,
        hint: dPt !== null && dPt >= 3 ? '→ Instagramが集客に効き始めている' : dPt !== null && dPt <= -3 ? '→ Instagram経由の訪問が減っている' : undefined });
      groups.push({ title: '参照元', items }); } }

  // 4. 訪問→参加
  { if (cur.per100 !== null) { const f = (v: number) => v.toFixed(1);
      const hint = prev && prev.per100 !== null && prev.per100 > 0 ? (cur.per100 / prev.per100 >= 1.1 ? '→ 訪問から参加への転換が改善' : cur.per100 / prev.per100 <= 0.9 ? '→ 訪問は来ているが参加につながりにくくなっている' : '→ 大きな変化なし') : undefined;
      groups.push({ title: '訪問→参加', items: [{ text: `訪問100件あたり参加 ${f(cur.per100)}件${prev && prev.per100 !== null ? `（前期 ${f(prev.per100)}件）` : ''}`, hint }] }); } }

  // 5. デバイス・地域
  { const dt = sum(devices); const rt = sum(regions);
    if (dt > 0 || rt > 0) { const items: InsightItem[] = [];
      const mobile = dt > 0 ? share(devices, l => l.toLowerCase() === 'mobile') : null;
      const top3 = [...regions].sort((a, b) => b.sessions - a.sessions).slice(0, 3);
      const regTxt = rt > 0 ? top3.map(r => `${regionNameJa(r.label)} ${pct(r.sessions / rt)}`).join('・') : '';
      const tochigi = rt > 0 ? share(regions, l => regionNameJa(l) === '栃木') : 0; const tokyoTop = top3.length > 0 && regionNameJa(top3[0].label) === '東京';
      const hint = mobile !== null && mobile >= 0.7 ? '→ スマホでの見やすさが最優先' : tochigi >= 0.3 ? '→ 県内からの閲覧が多い' : tokyoTop ? '→ 首都圏からの閲覧が主' : undefined;
      items.push({ text: `${mobile !== null ? `スマホ ${pct(mobile)}` : ''}${mobile !== null && regTxt ? '。地域は ' : ''}${regTxt}`, hint });
      groups.push({ title: 'デバイス・地域', items }); } }

  // 6. 人気ページ
  { const pt = sum(topPages);
    if (pt > 0) { const top3 = [...topPages].sort((a, b) => b.sessions - a.sessions).slice(0, 3);
      groups.push({ title: '人気ページ', items: [{ text: top3.map(p => `${pageNameJa(p.label)} ${pct(p.sessions / pt)}`).join('・') }] }); } }

  return groups;
}
```
（`InsightGroup`/`InsightItem` が `src/metrics/insights.ts` から export されていることを確認。テストの数値: 訪問合計 600 vs 前期 300 → +100%。月別: 5月 100/100=±0%, 6月 200/100=+100%, 7月 300/100=+200%。チャネル前期 Organic 50/90=56%。IG 前期 10/90=11%。per100 cur=15/600*100=2.5, prev=5/300*100=1.7）

`src/handlers.ts`: GA4ブロックで前期取得を追加:
```ts
      const comparable = period.kind !== 'all';
      const prevP = priorPeriod(period);
      const prevRange = { start: prevP.start, end: clampEnd(prevP.end, today) };
      const [ch, sm, tp, dv, rg, ds, pch, psm, pds] = await Promise.all([
        runReport(env, CHANNEL_SPEC, range), runReport(env, SOURCE_MEDIUM_SPEC, range), runReport(env, TOP_PAGES_SPEC, range),
        runReport(env, DEVICE_SPEC, range), runReport(env, REGION_SPEC, range), runReport(env, DAILY_SESSIONS_SPEC, range),
        comparable ? runReport(env, CHANNEL_SPEC, prevRange) : Promise.resolve(null),
        comparable ? runReport(env, SOURCE_MEDIUM_SPEC, prevRange) : Promise.resolve(null),
        comparable ? runReport(env, DAILY_SESSIONS_SPEC, prevRange) : Promise.resolve(null),
      ]);
      const channels = toNameValues(ch), devices = toNameValues(dv), regions = toNameValues(rg), topPages = toNameValues(tp), sourceMedium = toNameValues(sm);
      const overlay = computeTrafficOverlay(all, period, toDailySessions(ds));
      const prevOverlay = pds ? computeTrafficOverlay(all, prevP, toDailySessions(pds)) : null;
      traffic = { channels, sourceMedium, topPages, devices, regions, overlay,
        insights: buildGa4Insights({ period, channels, prevChannels: pch ? toNameValues(pch) : null, sourceMedium, prevSourceMedium: psm ? toNameValues(psm) : null, devices, regions, topPages, overlay, prevOverlay }),
        connected: true };
```
（`priorPeriod`・`clampEnd`・`today` は既存 import/変数を利用。`Promise.resolve(null)` の型は `Ga4Row[] | null` になるよう `runReport` の戻り型に合わせる）

`src/pages.ts`: `renderInsightGroups(groups)` を export（現在の `insightList` 生成ロジックを関数化し、戦略インサイトカードで使用）。
`src/ga4/section.ts`: `TrafficData.insights: InsightGroup[]`、先頭カードを `<div class="card"><h2>Web流入（GA4）インサイト<span class="p-note">対象: ${periodNote}</span></h2>${renderInsightGroups(d.insights)}</div>`（`renderInsightGroups` を `../pages.js` から import）。
テスト更新: `test/ga4-section.test.ts`・`test/ga4-home.test.ts` のフィクスチャ `insights` を `InsightGroup[]`（例 `[{ title: 'テスト', items: [{ text: 'x' }] }]` または `[]`）に。
- [ ] **Step 4: GREEN確認** `npm run typecheck && npx vitest run`
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: GA4インサイトを前期比較つき6グループに拡充（前期3レポート追加取得）"`

---

### Task 4: 仕上げ検証（コントローラ実施）
- [ ] 全体テスト green・ローカルcurl（月次ラベル `2025/…` 形式、GA4未接続表示の不変）・Opus最終レビュー → 修正 → ユーザー承認後デプロイ
