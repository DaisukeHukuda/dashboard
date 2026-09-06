import type { NameValue } from '../ga4/reports.js';
import { svgOpen, svgClose, escXml } from './svg.js';
import { channelNameJa } from '../ga4/labels.js';

const COLORS = ['#1e3a5f', '#3b6ea5', '#6aa0d8', '#9ac0e8', '#c7d2e0', '#8fa3bf', '#4a5b78', '#2c3e50'];
const MIN_FRAC = 0.03;

export function renderDonut(rows: NameValue[]): string {
  const W = 440, H = 200, cx = 220, cy = 100, rOuter = 70, rInner = 40, elbow = rOuter + 14, labelX = 30;
  const total = rows.reduce((s, r) => s + r.sessions, 0);
  let s = svgOpen(W, H);
  if (total <= 0) return s + `<text x="10" y="100" font-size="12" fill="#6b7280">データなし</text>` + svgClose();
  // 3%未満を「その他」に合算
  const major = rows.filter(r => r.sessions / total >= MIN_FRAC);
  const minorSum = rows.filter(r => r.sessions / total < MIN_FRAC).reduce((a, r) => a + r.sessions, 0);
  const slices = [...major.map(r => ({ name: channelNameJa(r.label), raw: r.label, sessions: r.sessions })),
    ...(minorSum > 0 ? [{ name: 'その他', raw: 'その他', sessions: minorSum }] : [])];
  // 角度計算
  let a0 = -Math.PI / 2;
  const geo = slices.map((sl, i) => { const frac = sl.sessions / total; const a1 = a0 + frac * Math.PI * 2; const mid = (a0 + a1) / 2; const g = { ...sl, i, frac, a0, a1, mid }; a0 = a1; return g; });
  const p = (ang: number, rad: number) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)] as const;
  // ラベル縦位置（左右別にソートして14px以上離す）
  const place = (side: 'L' | 'R') => {
    const items = geo.filter(g => (Math.cos(g.mid) >= 0) === (side === 'R')).map(g => ({ g, y: p(g.mid, elbow)[1] })).sort((a, b) => a.y - b.y);
    for (let k = 1; k < items.length; k++) if (items[k].y < items[k - 1].y + 14) items[k].y = items[k - 1].y + 14;
    const over = items.length ? items[items.length - 1].y - (H - 8) : 0;
    if (over > 0) items.forEach(it => { it.y -= over; });
    return new Map(items.map(it => [it.g.i, it.y]));
  };
  const ys = new Map([...place('L'), ...place('R')]);
  for (const g of geo) {
    const large = g.frac > 0.5 ? 1 : 0;
    const f = (pt: readonly [number, number]) => `${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`;
    // 単一スライス（frac≥0.999）は円弧が退化して消えるため、リングを描く
    if (g.frac >= 0.999) {
      const rMid = (rOuter + rInner) / 2, strokeW = rOuter - rInner;
      s += `<circle cx="${cx}" cy="${cy}" r="${rMid}" stroke="${COLORS[g.i % COLORS.length]}" stroke-width="${strokeW}" fill="none"><title>${escXml(g.raw)}: ${g.sessions}</title></circle>`;
    } else {
      const d = `M ${f(p(g.a0, rOuter))} A ${rOuter} ${rOuter} 0 ${large} 1 ${f(p(g.a1, rOuter))} L ${f(p(g.a1, rInner))} A ${rInner} ${rInner} 0 ${large} 0 ${f(p(g.a0, rInner))} Z`;
      s += `<path d="${d}" fill="${COLORS[g.i % COLORS.length]}"><title>${escXml(g.raw)}: ${g.sessions}</title></path>`;
    }
    const right = Math.cos(g.mid) >= 0;
    const [ax, ay] = p(g.mid, rOuter); const [ex] = p(g.mid, elbow); const ly = ys.get(g.i) ?? ay;
    const tx = right ? W - labelX : labelX;
    s += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${ex.toFixed(1)},${ly.toFixed(1)} ${(right ? tx - 4 : tx + 4).toFixed(1)},${ly.toFixed(1)}" fill="none" stroke="#9ca3af" stroke-width="1"/>`;
    s += `<text x="${tx}" y="${(ly - 3).toFixed(1)}" font-size="12" fill="#1f2937" text-anchor="${right ? 'end' : 'start'}">${escXml(g.name)} ${Math.round(g.frac * 100)}%</text>`;
  }
  return s + svgClose();
}
