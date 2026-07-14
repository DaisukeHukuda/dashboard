import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod, priorYear } from '../period.js';
import { ymOf } from '../util.js';

export interface TrendPoint { bucket: string; label: string; bookings: number; revenue: number; }

// その日を含む週の月曜日（JST暦日として計算）を 'YYYY-MM-DD' で返す
function weekStart(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0=日
  const backToMon = (dow + 6) % 7; // 月=0,...,日=6
  d.setUTCDate(d.getUTCDate() - backToMon);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function computeTrend(all: HistoryRecord[], period: Period, granularity: 'month' | 'week'): TrendPoint[] {
  const recs = filterPeriod(all, period);
  const map = new Map<string, { bookings: number; revenue: number }>();
  for (const r of recs) {
    const bucket = granularity === 'month' ? ymOf(r.date) : weekStart(r.date);
    const cur = map.get(bucket) ?? { bookings: 0, revenue: 0 };
    cur.bookings += 1; cur.revenue += r.amount;
    map.set(bucket, cur);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([bucket, v]) => ({ bucket, label: bucket, bookings: v.bookings, revenue: v.revenue }));
}

// 各 current バケットに対応する前年同月の件数を返す（月次のみ。週次は年で週境界がずれるため全null）。
export function priorYearSeries(
  all: HistoryRecord[], period: Period, gran: 'month' | 'week', points: TrendPoint[],
): (number | null)[] {
  if (gran !== 'month') return points.map(() => null);
  const prior = computeTrend(all, priorYear(period), 'month');
  const map = new Map(prior.map(p => [p.bucket, p.bookings]));
  return points.map(p => {
    const [y, m] = p.bucket.split('-');
    return map.get(`${Number(y) - 1}-${m}`) ?? null;
  });
}
