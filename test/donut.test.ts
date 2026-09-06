import { describe, it, expect } from 'vitest';
import { renderDonut } from '../src/charts/donut.js';

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

describe('renderDonut callouts', () => {
  it('引き出し線と日本語ラベル、3%未満は「その他」', () => {
    const svg = renderDonut([
      { label: 'Organic Search', sessions: 60 }, { label: 'Direct', sessions: 25 },
      { label: 'Organic Social', sessions: 12 }, { label: 'Email', sessions: 2 }, { label: 'Display', sessions: 1 },
    ]);
    expect(svg).toContain('自然検索 60%');
    expect(svg).toContain('直接アクセス 25%');
    expect(svg).toContain('その他 3%');
    expect(svg).not.toContain('メール');
    expect((svg.match(/<polyline/g) ?? []).length).toBe(4); // 4スライス=4本
    expect(svg).not.toContain('<rect'); // 凡例廃止
  });
  it('データなし', () => { expect(renderDonut([])).toContain('データなし'); });
});
