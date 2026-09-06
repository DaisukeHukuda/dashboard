import { describe, it, expect } from 'vitest';
import { renderFollowerChart } from '../src/charts/followers.js';
describe('renderFollowerChart', () => {
  const pts = [{ date: '2026-07-18', count: 3788 }, { date: '2026-08-16', count: 3800 }, { date: '2026-09-06', count: 3851 }];
  it('x は日付比例・y はズーム・差分棒', () => {
    const svg = renderFollowerChart(pts);
    const xs = [...svg.matchAll(/<circle cx="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(xs.length).toBe(3);
    // 7/18→8/16 = 29日, 8/16→9/6 = 21日 → 中点は全幅の 29/50 位置
    expect((xs[1] - xs[0]) / (xs[2] - xs[0])).toBeCloseTo(29 / 50, 2);
    expect(svg).not.toContain('>0<'); // y軸目盛に0が出ない（ズーム）
    expect(svg).toContain('title>2026-09-06'); // 点のtitle
    expect((svg.match(/class="diff-bar"/g) ?? []).length).toBe(2); // 差分棒は点数-1
    expect(svg).toContain('+51'); expect(svg).toContain('+12');
  });
  it('1点以下は案内文', () => { expect(renderFollowerChart([{ date: '2026-09-06', count: 1 }])).toContain('まだ蓄積が1日分'); expect(renderFollowerChart([])).toContain('まだ蓄積が'); });
});
