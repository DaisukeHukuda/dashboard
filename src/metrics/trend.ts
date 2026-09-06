import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod, priorYear, spanDays } from '../period.js';
import { ymOf } from '../util.js';

export interface TrendPoint { bucket: string; label: string; bookings: number; revenue: number; }
export type Granularity = 'month' | 'week' | 'day';

// その日を含む週の月曜日（JST暦日として計算）を 'YYYY-MM-DD' で返す
function weekStart(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=日
  const backToMon = (dow + 6) % 7; // 月=0,...,日=6
  d.setUTCDate(d.getUTCDate() - backToMon);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

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
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([bucket, v]) => ({ bucket, label: label(bucket), bookings: v.bookings, revenue: v.revenue }));
}

// 期間の長さに応じた既定粒度・許容粒度（短期間ほど細かい粒度まで許容）。
export function defaultGranularity(p: Period): Granularity { return spanDays(p) <= 92 ? 'day' : 'month'; }
export function allowedGranularities(p: Period): Granularity[] { return spanDays(p) <= 92 ? ['day', 'week', 'month'] : ['month', 'week']; }
export function resolveGranularity(param: string | null, p: Period): Granularity {
  const allowed = allowedGranularities(p);
  return param && (allowed as string[]).includes(param) ? (param as Granularity) : defaultGranularity(p);
}

// 各 current バケットに対応する前年同月の件数を返す（月次のみ。週次・日次は年で境界がずれるため全null）。
export function priorYearSeries(
  all: HistoryRecord[], period: Period, gran: Granularity, points: TrendPoint[],
): (number | null)[] {
  if (gran !== 'month') return points.map(() => null);
  if (period.kind === 'last24') return points.map(() => null); // 24ヶ月窓は前年を自身に含むため重ねない
  const prior = computeTrend(all, priorYear(period), 'month');
  const map = new Map(prior.map(p => [p.bucket, p.bookings]));
  return points.map(p => {
    const [y, m] = p.bucket.split('-');
    return map.get(`${Number(y) - 1}-${m}`) ?? null;
  });
}
