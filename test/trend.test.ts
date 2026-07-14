import { describe, it, expect } from 'vitest';
import { computeTrend, priorYearSeries } from '../src/metrics/trend.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string, amount: number): HistoryRecord => ({ date, course: 'A', pax: 1, amount, status: '参加済', phoneHash: '' });

describe('computeTrend month', () => {
  const all = [r('2023-06-05', 1000), r('2023-06-20', 2000), r('2023-07-02', 500)];
  const p = resolvePeriod('2023', '2024-01-01');
  it('groups by month, sorted', () => {
    const t = computeTrend(all, p, 'month');
    expect(t.map(x => x.bucket)).toEqual(['2023-06', '2023-07']);
    expect(t[0].revenue).toBe(3000);
    expect(t[0].bookings).toBe(2);
    expect(t[1].revenue).toBe(500);
  });
});

describe('computeTrend week', () => {
  it('groups by ISO-ish week (Monday start)', () => {
    // 2023-06-05 は月曜。同週に 06-05, 06-11(日) が入り、06-12(月)は翌週
    const all = [r('2023-06-05', 100), r('2023-06-11', 200), r('2023-06-12', 300)];
    const p = resolvePeriod('2023', '2024-01-01');
    const t = computeTrend(all, p, 'week');
    expect(t).toHaveLength(2);
    expect(t[0].bucket).toBe('2023-06-05');
    expect(t[0].revenue).toBe(300);
    expect(t[1].bucket).toBe('2023-06-12');
    expect(t[1].revenue).toBe(300);
  });
});

describe('priorYearSeries', () => {
  const all = [
    { date: '2023-06-05', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' },
    { date: '2024-06-10', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' },
    { date: '2024-06-20', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' },
  ];
  it('maps current month bucket to prior-year count (monthly)', () => {
    const p = resolvePeriod('2024', '2025-01-01');
    const points = computeTrend(all, p, 'month'); // ['2024-06'] with bookings 2
    const prior = priorYearSeries(all, p, 'month', points);
    expect(prior).toEqual([1]); // 2023-06 had 1 booking
  });
  it('returns nulls for weekly granularity', () => {
    const p = resolvePeriod('2024', '2025-01-01');
    const points = computeTrend(all, p, 'week');
    const prior = priorYearSeries(all, p, 'week', points);
    expect(prior.every(x => x === null)).toBe(true);
    expect(prior).toHaveLength(points.length);
  });
});
