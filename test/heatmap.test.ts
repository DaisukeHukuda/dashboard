import { describe, it, expect } from 'vitest';
import { computeHeatmap, courseList } from '../src/metrics/heatmap.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string, course: string): HistoryRecord => ({ date, course, pax: 1, amount: 1, status: '参加済', phoneHash: '' });

describe('computeHeatmap', () => {
  const p = resolvePeriod('2023', '2024-01-01');
  it('bins by month and weekday', () => {
    // 2023-06-10 = 土(6), 6月 → counts[5][6]
    const h = computeHeatmap([r('2023-06-10', 'A'), r('2023-06-10', 'A')], p);
    expect(h.counts[5][6]).toBe(2);
    expect(h.max).toBe(2);
  });
  it('filters by course', () => {
    const h = computeHeatmap([r('2023-06-10', 'A'), r('2023-06-10', 'B')], p, 'A');
    expect(h.counts[5][6]).toBe(1);
  });
});

describe('courseList', () => {
  it('returns courses by frequency desc', () => {
    const p = resolvePeriod('2023', '2024-01-01');
    const list = courseList([r('2023-06-10', 'A'), r('2023-06-11', 'B'), r('2023-06-12', 'B')], p);
    expect(list).toEqual(['B', 'A']);
  });
});
