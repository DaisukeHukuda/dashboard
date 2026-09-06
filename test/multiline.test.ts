import { describe, it, expect } from 'vitest';
import { renderMultiLine } from '../src/charts/multiline.js';
describe('renderMultiLine', () => {
  const data = { buckets: ['2025-11', '2025-12', '2026-01'], series: [{ name: 'Google検索', values: [10, 20, 30] }, { name: 'A&B', values: [5, 5, 5] }, { name: 'その他', values: [1, 2, 3] }] };
  it('系列ごとに折れ線と凡例、X軸は年/月規則', () => {
    const svg = renderMultiLine(data);
    expect((svg.match(/<polyline/g) ?? []).length).toBe(3);
    expect(svg).toContain('Google検索'); expect(svg).toContain('A&amp;B');
    expect(svg).toContain('>2025/11<'); expect(svg).toContain('>12<'); expect(svg).toContain('>2026/1<');
    expect(svg).toContain('stroke-dasharray'); // その他は破線
  });
  it('データなし', () => { expect(renderMultiLine({ buckets: [], series: [] })).toContain('データなし'); });
});
