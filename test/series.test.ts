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
