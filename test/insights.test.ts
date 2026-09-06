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
