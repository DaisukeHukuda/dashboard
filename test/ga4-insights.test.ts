import { describe, it, expect } from 'vitest';
import { renderDonut } from '../src/charts/donut.js';
import { buildGa4Insights } from '../src/ga4/insights.js';

describe('renderDonut', () => {
  it('renders a path per segment', () => {
    const svg = renderDonut([{ label: 'Organic', sessions: 60 }, { label: 'Social', sessions: 40 }]);
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/<path/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('handles empty', () => {
    expect(renderDonut([]).startsWith('<svg')).toBe(true);
  });
});

describe('buildGa4Insights', () => {
  it('mentions top channel share and device ratio', () => {
    const out = buildGa4Insights({
      channels: [{ label: 'Organic Search', sessions: 60 }, { label: 'Social', sessions: 40 }],
      devices: [{ label: 'mobile', sessions: 85 }, { label: 'desktop', sessions: 15 }],
      overlay: [{ bucket: '2024-06', sessions: 100, bookings: 5 }],
    });
    expect(out.some(s => s.includes('Organic Search'))).toBe(true);
    expect(out.some(s => s.includes('モバイル') || s.includes('mobile'))).toBe(true);
  });
});
