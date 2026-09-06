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
