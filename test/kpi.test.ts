import { describe, it, expect } from 'vitest';
import { computeKpi } from '../src/metrics/kpi.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string, amount: number, pax: number, phoneHash: string): HistoryRecord =>
  ({ date, course: 'A', pax, amount, status: '参加済', phoneHash });

describe('computeKpi', () => {
  const all: HistoryRecord[] = [
    r('2022-06-01', 10000, 2, 'p1'), // 前年
    r('2023-06-01', 12000, 2, 'p1'), // 当年・p1 リピート
    r('2023-07-01', 8000, 1, 'p2'),  // 当年・p2 新規
  ];
  const p = resolvePeriod('2023', '2024-01-01');

  it('sums bookings/revenue/pax in period', () => {
    const k = computeKpi(all, p);
    expect(k.bookings).toBe(2);
    expect(k.revenue).toBe(20000);
    expect(k.pax).toBe(3);
    expect(k.avgPerBooking).toBe(10000);
  });
  it('splits new vs repeat', () => {
    const k = computeKpi(all, p);
    expect(k.repeatCount).toBe(1);
    expect(k.newCount).toBe(1);
    expect(k.repeatRate).toBeCloseTo(0.5);
  });
  it('computes YoY vs prior year', () => {
    const k = computeKpi(all, p);
    // 前年同期(2022)は revenue 10000, bookings 1
    expect(k.yoyRevenue).toBeCloseTo(20000 / 10000);
    expect(k.yoyBookings).toBeCloseTo(2 / 1);
  });
  it('YoY null when no prior data', () => {
    const k = computeKpi([r('2023-06-01', 12000, 2, 'p1')], p);
    expect(k.yoyRevenue).toBeNull();
  });
});
