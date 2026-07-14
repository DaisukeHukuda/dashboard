import { describe, it, expect } from 'vitest';
import { escXml, scaleY } from '../src/charts/svg.js';
import { renderCourseBars } from '../src/charts/bar.js';
import { renderTrendChart } from '../src/charts/line.js';

describe('svg helpers', () => {
  it('escapes xml', () => { expect(escXml('a&b<c>')).toBe('a&amp;b&lt;c&gt;'); });
  it('scaleY maps max to top', () => { expect(scaleY(10, 10, 20, 100)).toBe(20); expect(scaleY(0, 10, 20, 100)).toBe(120); });
});

describe('renderCourseBars', () => {
  it('produces an svg with a rect per course', () => {
    const svg = renderCourseBars([
      { course: 'A', bookings: 2, revenue: 3000, pax: 2 },
      { course: 'B', bookings: 1, revenue: 5000, pax: 2 },
    ]);
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain('A');
    expect(svg).toContain('B');
  });
  it('handles empty input', () => {
    expect(renderCourseBars([]).startsWith('<svg')).toBe(true);
  });
});

describe('renderTrendChart', () => {
  it('produces an svg with a polyline for counts', () => {
    const svg = renderTrendChart([
      { bucket: '2023-06', label: '2023-06', bookings: 2, revenue: 3000 },
      { bucket: '2023-07', label: '2023-07', bookings: 1, revenue: 500 },
    ]);
    expect(svg).toContain('<polyline');
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('renderTrendChart with prior', () => {
  it('draws a second (prior-year) polyline when prior provided', () => {
    const points = [
      { bucket: '2024-06', label: '2024-06', bookings: 2, revenue: 3000 },
      { bucket: '2024-07', label: '2024-07', bookings: 1, revenue: 500 },
    ];
    const svg = renderTrendChart(points, [1, null]);
    // 現在の件数線 + 前年線 = polyline 2本
    expect((svg.match(/<polyline/g) ?? []).length).toBe(2);
  });
  it('draws a single polyline when prior omitted or all null', () => {
    const points = [{ bucket: '2024-06', label: '2024-06', bookings: 2, revenue: 3000 }];
    expect((renderTrendChart(points).match(/<polyline/g) ?? []).length).toBe(1);
    expect((renderTrendChart(points, [null]).match(/<polyline/g) ?? []).length).toBe(1);
  });
});
