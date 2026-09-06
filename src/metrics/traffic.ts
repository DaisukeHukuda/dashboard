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
