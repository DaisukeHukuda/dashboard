import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod } from '../period.js';
import type { CourseRow } from './course.js';

// 流入経路（自己申告カテゴリ）別の集計。CourseRow を流用し course にラベルを入れる。
// source 欠損/空（sync 更新前の旧データ）は「不明」に丸める。
export function computeSourceBreakdown(all: HistoryRecord[], period: Period): CourseRow[] {
  const map = new Map<string, CourseRow>();
  for (const r of filterPeriod(all, period)) {
    const label = r.source || '不明';
    const cur = map.get(label) ?? { course: label, bookings: 0, revenue: 0, pax: 0 };
    cur.bookings += 1; cur.revenue += r.amount; cur.pax += r.pax;
    map.set(label, cur);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
