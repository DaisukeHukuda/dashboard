import { describe, it, expect } from 'vitest';
import { computeCourseBreakdown } from '../src/metrics/course.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (course: string, amount: number, pax: number): HistoryRecord =>
  ({ date: '2023-06-10', course, pax, amount, status: '参加済', phoneHash: '' });

describe('computeCourseBreakdown', () => {
  it('aggregates and sorts by revenue desc', () => {
    const p = resolvePeriod('2023', '2024-01-01');
    const rows = computeCourseBreakdown([r('A', 1000, 1), r('B', 5000, 2), r('A', 2000, 1)], p);
    expect(rows[0].course).toBe('B');
    expect(rows[1].course).toBe('A');
    expect(rows[1].bookings).toBe(2);
    expect(rows[1].revenue).toBe(3000);
    expect(rows[1].pax).toBe(2);
  });
});
