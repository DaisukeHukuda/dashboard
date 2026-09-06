import { describe, it, expect } from 'vitest';
import { buildInsights } from '../src/metrics/insights.js';
import { resolvePeriod, type Period } from '../src/period.js';
import { computeKpi } from '../src/metrics/kpi.js';
import { computeHeatmap } from '../src/metrics/heatmap.js';
import { computeTrend } from '../src/metrics/trend.js';
import { computeCourseBreakdown } from '../src/metrics/course.js';
import { computeSourceBreakdown } from '../src/metrics/source.js';
import type { HistoryRecord } from '../src/types.js';

const rec = (date: string, amount: number, course = 'A', phone = 'p', source = 'アソビュー'): HistoryRecord =>
  ({ date, course, pax: 2, amount, status: '完了', phoneHash: phone, source } as HistoryRecord);

function buildP(all: HistoryRecord[], period: Period) {
  return buildInsights({
    all, period, kpi: computeKpi(all, period), heatmap: computeHeatmap(all, period),
    trend: computeTrend(all, period, 'month'), courseRows: computeCourseBreakdown(all, period), sourceRows: computeSourceBreakdown(all, period),
  });
}
function build(all: HistoryRecord[], periodParam: string) {
  return buildP(all, resolvePeriod(periodParam, '2026-09-06'));
}
// n件のレコードを ym（'YYYY-MM'）の1日から連番の日付で作る（30件を超える月には使わない）
const mk = (ym: string, n: number, seed: string, course = 'A', source = 'アソビュー') =>
  Array.from({ length: n }, (_, i) => rec(`${ym}-${String(i + 1).padStart(2, '0')}`, 1000, course, `${seed}${i}`, source));
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

  // ---- B1: 曜日・季節の母集団はコース絞り込みの影響を受けない ----
  it('B1: heatmap入力がコース絞り込み版でも曜日・季節の結果は同一（内部で全コース再計算）', () => {
    const all = [rec('2026-08-01', 1000, 'A', 'a'), rec('2026-08-02', 1000, 'B', 'b'), rec('2026-08-03', 1000, 'A', 'c'), rec('2026-08-04', 1000, 'B', 'd')];
    const period = resolvePeriod('2026-08', '2026-09-06');
    const args = { all, period, kpi: computeKpi(all, period), trend: computeTrend(all, period, 'month'), courseRows: computeCourseBreakdown(all, period), sourceRows: computeSourceBreakdown(all, period) };
    const full = buildInsights({ ...args, heatmap: computeHeatmap(all, period) });
    const filtered = buildInsights({ ...args, heatmap: computeHeatmap(all, period, 'A') });
    expect(text(full, '曜日・季節')).toBe(text(filtered, '曜日・季節'));
  });

  // ---- B2: 全期間では比較を出さない ----
  it('B2: period=all では前期比較を全グループで省略する', () => {
    const all = [...mk('2025-05', 5, 'o'), ...mk('2026-05', 10, 'n')];
    const g = build(all, 'all');
    const sales = text(g, '売上の要因');
    expect(sales).toContain('比較できる前期間の実績なし');
    expect(sales).not.toContain('内訳');
    expect(titles(g)).not.toContain('勢い');
    expect(text(g, '曜日・季節')).not.toContain('前期');
    expect(text(g, 'コース')).not.toContain('最も伸びた');
    expect(text(g, 'リピート')).not.toContain('前期');
    expect(text(g, '流入経路（自己申告）')).not.toContain('前期');
  });

  // ---- B3: 勢いグループの適用範囲 ----
  it('B3: last24・366日超のcustomでは勢いグループ自体を省略する', () => {
    const all = [
      ...mk('2024-03', 4, 'a'), ...mk('2024-06', 4, 'b'), ...mk('2024-10', 4, 'c'),
      ...mk('2025-03', 4, 'd'), ...mk('2025-06', 4, 'e'), ...mk('2025-10', 4, 'f'),
      ...mk('2026-03', 4, 'g'), ...mk('2026-06', 4, 'h'), ...mk('2026-08', 4, 'i'),
    ];
    const g24 = build(all, 'last24');
    expect(titles(g24)).not.toContain('勢い');
    const longCustom = resolvePeriod('custom', '2026-09-06', '2024-01-01', '2026-06-01');
    const gLong = buildP(all, longCustom);
    expect(titles(gLong)).not.toContain('勢い');
  });

  // ---- B4: 直近3ヶ月を暦月で・欠測月ゼロ埋め・年つきラベル ----
  it('B4: 直近3ヶ月は暦月固定・欠測月は0件集計・ラベルに年を含む（9〜12月にならない）', () => {
    const all = [
      ...mk('2025-09', 3, 'p1'), ...mk('2025-10', 3, 'p2'), ...mk('2025-11', 3, 'p3'), ...mk('2025-12', 3, 'p4'),
      ...mk('2026-09', 3, 'c1'), ...mk('2026-10', 3, 'c2'), /* 2026-11 は0件 */ ...mk('2026-12', 3, 'c3'),
    ];
    const t = text(build(all, '2026'), '勢い');
    expect(t).toContain('直近3ヶ月（2026年10〜12月）');
    expect(t).not.toContain('9〜12月');
  });
  it('B4: 期間終端が年始めのとき年跨ぎラベルになる', () => {
    const all = [
      ...mk('2024-11', 3, 'p1'), ...mk('2024-12', 3, 'p2'), ...mk('2025-01', 3, 'p3'),
      ...mk('2025-09', 3, 'd1'), ...mk('2025-11', 3, 'c1'), ...mk('2025-12', 3, 'c2'), ...mk('2026-01', 3, 'c3'),
    ];
    const period = resolvePeriod('custom', '2026-02-01', '2025-09-01', '2026-01-31');
    const t = text(buildP(all, period), '勢い');
    expect(t).toContain('直近3ヶ月（2025年11月〜2026年1月）');
  });

  // ---- B5: 候補1件のときは単独表示 ----
  it('B5: 前年同月比の候補が1件のときは単独表示（最も落ちたは出ない）', () => {
    const all = [
      rec('2026-04-01', 1000, 'A', 'a'),
      ...mk('2026-05', 6, 'b'),
      rec('2026-06-01', 1000, 'A', 'c'),
      ...mk('2025-05', 4, 'd'), // 前年同月が3件以上あるのは5月のみ
    ];
    const t = text(build(all, '2026'), '勢い');
    expect(t).toContain('前年同月比: 2026年5月（+50%）');
    expect(t).not.toContain('最も落ちた');
  });
  it('B5: コース伸び率の候補が1件のときは単独表示（最も落ちたは出ない）', () => {
    const all = [
      ...mk('2026-05', 6, 'a', 'ツアー'), ...mk('2025-05', 4, 'b', 'ツアー'),
      rec('2026-05-01', 500, '体験', 'x'), // 体験: 前年実績なし→候補から除外
    ];
    const t = text(build(all, '2026'), 'コース');
    expect(t).toContain('前年比: 「ツアー」+50%');
    expect(t).not.toContain('最も落ちた');
  });

  // ---- B6: 要因分解の丸め ----
  it('B6: 客単価丸め誤差があっても内訳の合計が売上差額と一致する', () => {
    // 当期: 3件 合計10,000円（1件あたり3333.33...）／前期: 2件 合計5,000円（1件あたり2,500円）
    const all = [
      rec('2026-05-01', 3000, 'A', 'a'), rec('2026-05-02', 3000, 'A', 'b'), rec('2026-05-03', 4000, 'A', 'c'),
      rec('2025-05-01', 2500, 'A', 'x'), rec('2025-05-02', 2500, 'A', 'y'),
    ];
    const t = text(build(all, '2026'), '売上の要因');
    const volumeMatch = t.match(/件数増減で([+\-±][\d,]+)円/);
    const priceMatch = t.match(/客単価変化で([+\-±][\d,]+)円/);
    const parse = (s: string) => (s.startsWith('±') ? 0 : Number(s.replace(/[+,]/g, '')));
    expect(volumeMatch).not.toBeNull();
    expect(priceMatch).not.toBeNull();
    const volume = parse(volumeMatch![1]);
    const price = parse(priceMatch![1]);
    expect(volume + price).toBe(5000); // 10,000 - 5,000
  });

  // ---- B7: signedPct の -0 ----
  it('B7: 変化なし(比率1)は ±0% と表示される（+0%/-0%ではない）', () => {
    const all = [...mk('2026-05', 4, 'a', 'A'), ...mk('2025-05', 4, 'b', 'A')];
    const t = text(build(all, '2026'), 'コース');
    expect(t).toContain('前年比: 「A」±0%');
    expect(t).not.toContain('+0%');
    expect(t).not.toContain('-0%');
  });

  // ---- B8: 追加の正常系分岐カバレッジ ----
  it('B8: 勢い正常系（候補2件以上・直近3ヶ月・「期間平均より強い」hint）', () => {
    const all = [
      ...mk('2025-03', 2, 'p1'), ...mk('2025-06', 4, 'p2'), ...mk('2025-10', 4, 'p3'), ...mk('2025-11', 4, 'p4'), ...mk('2025-12', 4, 'p5'),
      ...mk('2026-03', 4, 'c1'), ...mk('2026-06', 4, 'c2'), ...mk('2026-10', 4, 'c3'), ...mk('2026-11', 4, 'c4'), ...mk('2026-12', 10, 'c5'),
    ];
    const t = text(build(all, '2026'), '勢い');
    expect(t).toContain('前年同月比で最も伸びた月: 2026年12月（+150%）');
    expect(t).toContain('直近3ヶ月（2026年10〜12月）は前年同期比 +50%');
    expect(t).toContain('→ 足元の勢いは期間平均より強い');
  });
  it('B8: 勢い正常系（直近3ヶ月hintの「期間平均より鈍い」分岐）', () => {
    const all = [
      ...mk('2025-01', 4, 'p1'), ...mk('2025-02', 4, 'p2'), ...mk('2025-10', 2, 'p3'), ...mk('2025-11', 2, 'p4'), ...mk('2025-12', 2, 'p5'),
      ...mk('2026-01', 10, 'c1'), ...mk('2026-02', 10, 'c2'), ...mk('2026-10', 2, 'c3'), ...mk('2026-11', 2, 'c4'), ...mk('2026-12', 2, 'c5'),
    ];
    const t = text(build(all, '2026'), '勢い');
    expect(t).toContain('直近3ヶ月（2026年10〜12月）は前年同期比 ±0%');
    expect(t).toContain('→ 足元は期間平均より鈍い');
  });
  it('B8: 売上の要因「客単価要因が大きい」分岐', () => {
    const all = [...mk('2026-05', 10, 'c', 'A'), ...mk('2025-05', 10, 'p', 'A')].map((r, i) =>
      i < 10 ? { ...r, amount: 20000 } : { ...r, amount: 10000 },
    ) as HistoryRecord[];
    const t = text(build(all, '2026'), '売上の要因');
    expect(t).toContain('→ 変化は主に客単価によるもの');
  });
  it('B8: 曜日・季節「平日にも一定の需要がある」分岐', () => {
    const all = Array.from({ length: 14 }, (_, i) => rec(`2026-08-${String(i + 1).padStart(2, '0')}`, 1000, 'A', `d${i}`));
    const t = text(build(all, '2026-08'), '曜日・季節');
    expect(t).toContain('→ 平日にも一定の需要がある');
  });
  it('B8: コース「収益の柱」分岐', () => {
    const all = [...mk('2026-05', 6, 'a', 'ツアー'), ...mk('2026-05', 4, 'b', '体験')].map((r, i) =>
      i < 6 ? { ...r, amount: 5000 } : { ...r, amount: 500 },
    ) as HistoryRecord[];
    const t = text(build(all, '2026'), 'コース');
    expect(t).toContain('→ 主力コースは単価も高く収益の柱');
  });
  it('B8: リピート「新規獲得が伸びている」分岐', () => {
    const all = [rec('2025-05-01', 1000, 'A', 'r1'), rec('2025-05-02', 1000, 'A', 'r2'), ...mk('2026-05', 6, 'n')];
    const t = text(build(all, '2026'), 'リピート');
    expect(t).toContain('→ 新規獲得が伸びている');
  });
  it('B8: リピート「大きな変化なし」分岐', () => {
    const all = [rec('2025-05-01', 1000, 'A', 'r1'), rec('2025-05-02', 1000, 'A', 'r2'), rec('2026-05-01', 1000, 'A', 'n1'), rec('2026-05-02', 1000, 'A', 'n2')];
    const t = text(build(all, '2026'), 'リピート');
    expect(t).toContain('→ 大きな変化なし');
  });
  it('B8: 流入経路「Instagram経由が伸びている」分岐', () => {
    const all = [
      ...mk('2026-05', 4, 'ci', 'A', 'Instagram'), ...mk('2026-05', 6, 'ca', 'A', 'アソビュー'),
      ...mk('2025-05', 2, 'pi', 'A', 'Instagram'), ...mk('2025-05', 8, 'pa', 'A', 'アソビュー'),
    ];
    const t = text(build(all, '2026'), '流入経路（自己申告）');
    expect(t).toContain('→ Instagram経由が伸びている');
  });
});
