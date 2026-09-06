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

  it('横ばい（小さい値）でも y 軸目盛が負にならない', () => {
    const flat = [{ date: '2026-08-01', count: 5 }, { date: '2026-08-15', count: 5 }, { date: '2026-09-01', count: 5 }];
    const svg = renderFollowerChart(flat);
    // range=0 → pad=10。min-pad=-5だがクランプでy軸目盛は0以上のみ
    expect(svg).not.toMatch(/>-\d/);
  });

  it('x軸ラベル: 近すぎる（30px未満）ラベルは間引き、最新日を優先して残す', () => {
    const pts4 = [
      { date: '2026-07-18', count: 3788 },
      { date: '2026-08-16', count: 3800 },
      { date: '2026-09-05', count: 3840 },
      { date: '2026-09-06', count: 3851 },
    ];
    const svg = renderFollowerChart(pts4);
    const texts = [...svg.matchAll(/<text x="([\d.]+)" y="250" font-size="10"[^>]*text-anchor="(\w+)"[^>]*>([^<]*)<\/text>/g)]
      .map(m => ({ x: Number(m[1]), anchor: m[2], t: m[3] }));
    const has95 = texts.some(t => t.t === '9/5');
    const has96 = texts.some(t => t.t === '9/6');
    expect(has95 && has96).toBe(false); // 9/5と9/6が両方描画されることはない
    expect(has95 || has96).toBe(true); // どちらか一方は残る
    const rightmost = texts.reduce((a, b) => (b.x > a.x ? b : a));
    expect(rightmost.anchor).toBe('end'); // 右端に寄るラベルは右端揃え
    expect(rightmost.t).toBe('9/6'); // 直近日（9/6）を優先して残す
  });

  it('差分棒のtitle: 空白日数が1日超なら「N日ぶり」を付ける、1日なら付けない', () => {
    const pts = [
      { date: '2026-07-18', count: 3788 }, // 29日ぶりのギャップ
      { date: '2026-08-16', count: 3800 },
      { date: '2026-09-05', count: 3840 }, // 20日ぶり
      { date: '2026-09-06', count: 3851 }, // 1日（連日）
    ];
    const svg = renderFollowerChart(pts);
    expect(svg).toContain('2026-08-16: +12（29日ぶり）');
    expect(svg).toContain('2026-09-06: +11');
    expect(svg).not.toContain('2026-09-06: +11（'); // 1日ギャップには日数注記を付けない
  });
});
