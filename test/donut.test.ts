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

describe('renderDonut A1: ラベルは引き出し線の上に乗る（貫通しない）', () => {
  it('text の y が polyline 終点の y より小さい（上にある）', () => {
    const svg = renderDonut([
      { label: 'Organic Search', sessions: 60 }, { label: 'Direct', sessions: 25 }, { label: 'Organic Social', sessions: 15 },
    ]);
    const polylineEndYs = [...svg.matchAll(/<polyline points="[^"]+ [\d.]+,([\d.]+)"/g)].map(m => Number(m[1]));
    const textYs = [...svg.matchAll(/<text x="[^"]+" y="([\d.]+)"/g)].map(m => Number(m[1]));
    expect(textYs.length).toBeGreaterThan(0);
    expect(textYs.length).toBe(polylineEndYs.length);
    for (let i = 0; i < textYs.length; i++) expect(textYs[i]).toBeLessThan(polylineEndYs[i]);
  });
});

describe('renderDonut A2: 単一スライスはリングで描画', () => {
  it('1件だけなら <circle> でリングを描き、<path> は出ない。ラベルは100%', () => {
    const svg = renderDonut([{ label: 'Direct', sessions: 100 }]);
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('<path');
    expect(svg).toContain('直接アクセス 100%');
  });
});

describe('renderDonut A3: スマホ可読性のための幅', () => {
  it('viewBoxの幅が440', () => {
    const svg = renderDonut([{ label: 'Organic', sessions: 60 }, { label: 'Social', sessions: 40 }]);
    expect(svg).toContain('viewBox="0 0 440 200"');
  });
});

describe('renderDonut A4: XMLエスケープ', () => {
  it('ラベルの & < > はエスケープされる', () => {
    const svg = renderDonut([{ label: 'A&B <x>', sessions: 100 }]);
    expect(svg).toContain('A&amp;B &lt;x&gt;');
  });
});
