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
  per100: number | null;                       // 訪問100件あたり参加件数（sessions=0はnull）
}

// 合計・比率はGA4の計測データがある月（sessions>0）のみで算出する。
// GA4計測前の月（全期間・年別選択時）は予約（参加）だけがあり分母がないため対象外。
export function summarizeOverlay(points: TrafficPoint[]): OverlaySummary {
  const measured = points.filter(p => p.sessions > 0);
  const sessions = measured.reduce((a, p) => a + p.sessions, 0);
  const bookings = measured.reduce((a, p) => a + p.bookings, 0);
  const per100 = sessions > 0 ? (bookings / sessions) * 100 : null;
  return { sessions, bookings, per100 };
}
