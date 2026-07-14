import { describe, it, expect } from 'vitest';
import { computeTrafficOverlay } from '../src/metrics/traffic.js';
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
