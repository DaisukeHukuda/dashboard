import { describe, it, expect } from 'vitest';
import { renderHeatmap } from '../src/charts/heatmap.js';
import { renderCohortGrid } from '../src/charts/cohortgrid.js';

describe('renderHeatmap', () => {
  it('renders 84 cells', () => {
    const counts = Array.from({ length: 12 }, () => Array(7).fill(1));
    const svg = renderHeatmap({ counts, max: 1 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/<rect/g) ?? []).length).toBe(84);
  });
  it('handles max=0 without crashing', () => {
    const counts = Array.from({ length: 12 }, () => Array(7).fill(0));
    expect(renderHeatmap({ counts, max: 0 }).startsWith('<svg')).toBe(true);
  });
  it('ヒートマップは月曜始まりで日曜が最終列', () => {
    const counts = Array.from({ length: 12 }, () => [0, 0, 0, 0, 0, 0, 0]);
    counts[0][0] = 5; // 1月の日曜
    counts[0][1] = 3; // 1月の月曜
    const svg = renderHeatmap({ counts, max: 5 });
    // ヘッダ文字の出現順: 月が最初・日が最後
    const order = ['月', '火', '水', '木', '金', '土', '日']
      .map(d => svg.indexOf(`>${d}<`));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // 出現位置が昇順＝この表示順
    // セルの対応: 日曜(counts[0][0]=5)のtitleが「1月 日: 5件」、月曜が「1月 月: 3件」
    expect(svg).toContain('1月 日: 5件');
    expect(svg).toContain('1月 月: 3件');
    // 日曜セルは最終列（cell=34, labelW=36 → 7列目 x=36+6*34=240、rectのxは+1で241）に描かれる
    expect(svg).toMatch(/<rect x="241"[^>]*><title>1月 日: 5件<\/title>/);
  });
});

describe('renderCohortGrid', () => {
  it('renders a row per cohort with percentage text', () => {
    const svg = renderCohortGrid([{ cohort: '2023-01', size: 4, retention: [4, 2, 1], within3: 2, yearLater: 0 }]);
    expect(svg).toContain('2023-01');
    expect(svg).toContain('%');
  });
  it('handles empty', () => {
    expect(renderCohortGrid([]).startsWith('<svg')).toBe(true);
  });
});
