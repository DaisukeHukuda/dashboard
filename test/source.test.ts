import { describe, it, expect } from 'vitest';
import { computeSourceBreakdown } from '../src/metrics/source.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (source: string | undefined, amount: number): HistoryRecord =>
  ({ date: '2023-06-10', course: 'A', pax: 1, amount, status: '参加済', phoneHash: '', ...(source !== undefined ? { source } : {}) });

describe('computeSourceBreakdown', () => {
  it('aggregates by source, revenue desc, missing→不明', () => {
    const p = resolvePeriod('2023', '2024-01-01');
    const rows = computeSourceBreakdown([r('Instagram', 5000), r('紹介', 1000), r('Instagram', 3000), r(undefined, 700), r('', 300)], p);
    expect(rows[0]).toEqual({ course: 'Instagram', bookings: 2, revenue: 8000, pax: 2 });
    expect(rows.map(x => x.course)).toEqual(['Instagram', '紹介', '不明']);
    expect(rows[2]).toEqual({ course: '不明', bookings: 2, revenue: 1000, pax: 2 });
  });
});
