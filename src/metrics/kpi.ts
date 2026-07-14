import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod, priorYear } from '../period.js';
import { firstVisitMap, isRepeat } from '../repeat.js';

export interface Kpi {
  bookings: number; revenue: number; avgPerBooking: number; pax: number;
  newCount: number; repeatCount: number; repeatRate: number;
  yoyRevenue: number | null; yoyBookings: number | null;
}

function totals(recs: HistoryRecord[]): { bookings: number; revenue: number } {
  return { bookings: recs.length, revenue: recs.reduce((s, r) => s + r.amount, 0) };
}

export function computeKpi(all: HistoryRecord[], period: Period): Kpi {
  const first = firstVisitMap(all);
  const cur = filterPeriod(all, period);
  const prev = filterPeriod(all, priorYear(period));

  const revenue = cur.reduce((s, r) => s + r.amount, 0);
  const pax = cur.reduce((s, r) => s + r.pax, 0);
  const bookings = cur.length;
  let repeatCount = 0;
  for (const r of cur) if (isRepeat(r, first)) repeatCount++;
  const newCount = bookings - repeatCount;

  const prevT = totals(prev);
  return {
    bookings, revenue, pax,
    avgPerBooking: bookings ? Math.round(revenue / bookings) : 0,
    newCount, repeatCount,
    repeatRate: bookings ? repeatCount / bookings : 0,
    yoyRevenue: prevT.revenue ? revenue / prevT.revenue : null,
    yoyBookings: prevT.bookings ? bookings / prevT.bookings : null,
  };
}
