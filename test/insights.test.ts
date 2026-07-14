import { describe, it, expect } from 'vitest';
import { buildInsights } from '../src/metrics/insights.js';

describe('buildInsights', () => {
  it('mentions repeat rate and YoY when present', () => {
    const out = buildInsights({
      kpi: { bookings: 100, revenue: 1000000, avgPerBooking: 10000, pax: 200, newCount: 70, repeatCount: 30, repeatRate: 0.3, yoyRevenue: 1.2, yoyBookings: 1.1 },
      heatmap: { counts: Array.from({ length: 12 }, () => Array(7).fill(0)), max: 0 },
      weather: { rainyAvg: 1, dryAvg: 2, dropPct: 0.5, byCategory: [] },
      trend: [],
    });
    expect(out.some(s => s.includes('リピート率'))).toBe(true);
    expect(out.some(s => s.includes('前年'))).toBe(true);
    expect(out.some(s => s.includes('雨'))).toBe(true);
  });
  it('omits YoY line when null', () => {
    const out = buildInsights({
      kpi: { bookings: 10, revenue: 100, avgPerBooking: 10, pax: 10, newCount: 10, repeatCount: 0, repeatRate: 0, yoyRevenue: null, yoyBookings: null },
      heatmap: { counts: Array.from({ length: 12 }, () => Array(7).fill(0)), max: 0 },
      weather: { rainyAvg: 0, dryAvg: 0, dropPct: null, byCategory: [] },
      trend: [],
    });
    expect(out.some(s => s.includes('前年'))).toBe(false);
  });
});
