import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod, inPeriod } from '../period.js';
import { ymOf } from '../util.js';

export interface TrafficPoint { bucket: string; sessions: number; bookings: number; }

export function computeTrafficOverlay(
  all: HistoryRecord[], period: Period, daily: { date: string; sessions: number }[],
): TrafficPoint[] {
  const map = new Map<string, { sessions: number; bookings: number }>();
  const get = (b: string) => map.get(b) ?? { sessions: 0, bookings: 0 };

  for (const r of filterPeriod(all, period)) {
    const b = ymOf(r.date);
    const cur = get(b); cur.bookings += 1; map.set(b, cur);
  }
  for (const d of daily) {
    if (!inPeriod(d.date, period)) continue;
    const b = ymOf(d.date);
    const cur = get(b); cur.sessions += d.sessions; map.set(b, cur);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([bucket, v]) => ({ bucket, sessions: v.sessions, bookings: v.bookings }));
}
