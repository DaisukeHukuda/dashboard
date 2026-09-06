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
  it('日次ラベル（YYYY-MM-DD形式を含まない）はそのまま表示される', () => {
    const svg = renderTrendChart([
      { bucket: '2026-08-01', label: '8/1', bookings: 1, revenue: 1000 },
    ]);
    expect(svg).toContain('>8/1<');
  });
  it('月次ラベル 2026-08 は年/月で表示される（先頭の場合）', () => {
    const svg = renderTrendChart([
      { bucket: '2026-08', label: '2026-08', bookings: 1, revenue: 1000 },
    ]);
    expect(svg).toContain('>2026/8<');
  });
  it('週次ラベル 2026-08-10 は年/月/日で表示される（先頭の場合）', () => {
    const svg = renderTrendChart([
      { bucket: '2026-08-10', label: '2026-08-10', bookings: 1, revenue: 1000 },
    ]);
    expect(svg).toContain('>2026/8/10<');
  });
});

describe('renderTrendChart axis labels (year/month)', () => {
  const pt = (bucket: string, label = bucket) => ({ bucket, label, bookings: 1, revenue: 100 });
  const labels = (svg: string) => [...svg.matchAll(/text-anchor="middle">([^<]*)<\/text>/g)].map(m => m[1]);
  it('月次は先頭と年の変わり目に年を付ける', () => {
    const svg = renderTrendChart([pt('2025-11'), pt('2025-12'), pt('2026-01'), pt('2026-02')]);
    expect(labels(svg)).toEqual(['2025/11', '12', '2026/1', '2']);
  });
  it('週次（label===bucket）は年/月/日 → 月/日', () => {
    const svg = renderTrendChart([pt('2026-08-10'), pt('2026-08-17')]);
    expect(labels(svg)).toEqual(['2026/8/10', '8/17']);
  });
  it('日次（labelが整形済み）はそのまま', () => {
    const svg = renderTrendChart([pt('2026-08-01', '8/1'), pt('2026-08-02', '8/2')]);
    expect(labels(svg)).toEqual(['8/1', '8/2']);
  });
  it('間引き後の並びで年境界を判定する', () => {
    const pts = Array.from({ length: 24 }, (_, i) => { const y = 2024 + Math.floor(i / 12); const m = (i % 12) + 1; return pt(`${y}-${String(m).padStart(2, '0')}`); });
    const l = labels(renderTrendChart(pts)); // labelEvery=2 → 12ラベル
    expect(l[0]).toBe('2024/1');
    expect(l).toContain('2025/1');
    expect(l.filter(x => x.includes('/')).length).toBe(2);
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
