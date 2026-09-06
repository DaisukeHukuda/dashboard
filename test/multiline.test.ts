import { describe, it, expect } from 'vitest';
import { renderMultiLine, truncMiddle } from '../src/charts/multiline.js';
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

  it('系列数が多くても凡例のx座標は描画幅(W=720)内に収まる', () => {
    const many = {
      buckets: ['2026-01'],
      series: ['/a', '/b', '/c', '/d', '/e', 'その他'].map(name => ({ name, values: [1] })),
    };
    const svg = renderMultiLine(many);
    const W = 720;
    const rectXs = [...svg.matchAll(/<rect x="([\d.]+)" y="8"/g)].map(m => Number(m[1]));
    expect(rectXs.length).toBe(6);
    for (const x of rectXs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(W); }
  });

  it('長い系列名は凡例で中央省略される', () => {
    const many = {
      buckets: ['2026-01'],
      series: ['/a', '/b', '/c', '/d', '/e', '/tours/lake-chuzenji-sup-school'].map(name => ({ name, values: [1] })),
    };
    const svg = renderMultiLine(many);
    expect(svg).toContain('…');
    expect(svg).not.toContain('/tours/lake-chuzenji-sup-school<');
  });
});

describe('truncMiddle', () => {
  it('maxChars以下ならそのまま', () => { expect(truncMiddle('Google検索', 12)).toBe('Google検索'); });
  it('maxCharsを超えると中央を…で省略し、先頭と末尾が残る', () => {
    const out = truncMiddle('/tours/lake-chuzenji-sup-school', 9);
    expect(out).toBe('/tou…hool');
    expect(out).toContain('…');
    expect(out.startsWith('/tou')).toBe(true);
    expect(out.endsWith('hool')).toBe(true);
  });
});
