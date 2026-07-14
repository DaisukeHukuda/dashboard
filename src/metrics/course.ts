import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod } from '../period.js';

export interface CourseRow { course: string; bookings: number; revenue: number; pax: number; }

export function computeCourseBreakdown(all: HistoryRecord[], period: Period): CourseRow[] {
  const map = new Map<string, CourseRow>();
  for (const r of filterPeriod(all, period)) {
    const cur = map.get(r.course) ?? { course: r.course, bookings: 0, revenue: 0, pax: 0 };
    cur.bookings += 1; cur.revenue += r.amount; cur.pax += r.pax;
    map.set(r.course, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
