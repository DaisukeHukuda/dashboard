import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod } from '../period.js';
import { monthOf, weekdayOf } from '../util.js';

export interface Heatmap { counts: number[][]; max: number; }

export function computeHeatmap(all: HistoryRecord[], period: Period, course?: string): Heatmap {
  const counts: number[][] = Array.from({ length: 12 }, () => Array(7).fill(0));
  let max = 0;
  for (const r of filterPeriod(all, period)) {
    if (course && r.course !== course) continue;
    const m = monthOf(r.date) - 1;
    const w = weekdayOf(r.date);
    counts[m][w] += 1;
    if (counts[m][w] > max) max = counts[m][w];
  }
  return { counts, max };
}

export function courseList(all: HistoryRecord[], period: Period): string[] {
  const freq = new Map<string, number>();
  for (const r of filterPeriod(all, period)) freq.set(r.course, (freq.get(r.course) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
