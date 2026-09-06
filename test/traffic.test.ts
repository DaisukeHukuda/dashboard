import { describe, it, expect } from 'vitest';
import { computeTrafficOverlay, summarizeOverlay } from '../src/metrics/traffic.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string): HistoryRecord => ({ date, course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' });

describe('computeTrafficOverlay', () => {
  it('aligns sessions and bookings by month within period', () => {
    const p = resolvePeriod('2024', '2025-01-01');
    const all = [r('2024-06-05'), r('2024-06-20'), r('2024-07-02')];
    const daily = [
      { date: '2024-06-10', sessions: 100 },
      { date: '2024-06-25', sessions: 50 },
      { date: '2024-07-01', sessions: 30 },
      { date: '2023-06-01', sessions: 999 }, // 期間外は無視
    ];
    const out = computeTrafficOverlay(all, p, daily);
    expect(out).toEqual([
      { bucket: '2024-06', sessions: 150, bookings: 2 },
      { bucket: '2024-07', sessions: 30, bookings: 1 },
    ]);
  });
  it('includes months with sessions but no bookings and vice versa', () => {
    const p = resolvePeriod('2024', '2025-01-01');
    const out = computeTrafficOverlay([r('2024-05-01')], p, [{ date: '2024-08-01', sessions: 10 }]);
    expect(out).toEqual([
      { bucket: '2024-05', sessions: 0, bookings: 1 },
      { bucket: '2024-08', sessions: 10, bookings: 0 },
    ]);
  });
});

describe('summarizeOverlay', () => {
  it('合計と訪問100件あたり参加件数を返す', () => {
    const s = summarizeOverlay([
      { bucket: '2026-05', sessions: 100, bookings: 3 },
      { bucket: '2026-06', sessions: 50, bookings: 2 },
      { bucket: '2026-07', sessions: 10, bookings: 5 },
    ]);
    expect(s.sessions).toBe(160);
    expect(s.bookings).toBe(10);
    expect(s.per100).toBeCloseTo(6.25, 2);
  });
  it('sessions=0 の月は合計・per100の算出対象から除外する（bookingsも含めない）', () => {
    const s = summarizeOverlay([
      { bucket: '2026-04', sessions: 0, bookings: 7 }, // GA4計測前：分母なしなので除外
      { bucket: '2026-05', sessions: 100, bookings: 3 },
    ]);
    expect(s.sessions).toBe(100);
    expect(s.bookings).toBe(3); // 7を含まない
    expect(s.per100).toBeCloseTo(3, 2);
  });
  it('全月 sessions=0 なら per100 は null', () => {
    const s = summarizeOverlay([{ bucket: '2026-05', sessions: 0, bookings: 2 }]);
    expect(s.sessions).toBe(0);
    expect(s.bookings).toBe(0);
    expect(s.per100).toBeNull();
  });
  it('空配列でも壊れない', () => {
    expect(summarizeOverlay([])).toEqual({ sessions: 0, bookings: 0, per100: null });
  });
});
