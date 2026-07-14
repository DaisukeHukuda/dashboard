import type { NameValue } from '../ga4/reports.js';
import { svgOpen, svgClose, escXml } from './svg.js';

const COLORS = ['#1e3a5f', '#3b6ea5', '#6aa0d8', '#9ac0e8', '#c7d2e0', '#8fa3bf', '#4a5b78', '#2c3e50'];

export function renderDonut(rows: NameValue[]): string {
  const W = 360, cx = 90, cy = 90, rOuter = 80, rInner = 46;
  const total = rows.reduce((s, r) => s + r.sessions, 0);
  let s = svgOpen(W, 180);
  if (total <= 0) return s + `<text x="10" y="90" font-size="12" fill="#6b7280">データなし</text>` + svgClose();
  let a0 = -Math.PI / 2;
  rows.forEach((r, i) => {
    const frac = r.sessions / total;
    const a1 = a0 + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const p = (ang: number, rad: number) => `${(cx + rad * Math.cos(ang)).toFixed(1)} ${(cy + rad * Math.sin(ang)).toFixed(1)}`;
    const d = `M ${p(a0, rOuter)} A ${rOuter} ${rOuter} 0 ${large} 1 ${p(a1, rOuter)} L ${p(a1, rInner)} A ${rInner} ${rInner} 0 ${large} 0 ${p(a0, rInner)} Z`;
    s += `<path d="${d}" fill="${COLORS[i % COLORS.length]}"><title>${escXml(r.label)}: ${r.sessions}</title></path>`;
    // 凡例
    const ly = 16 + i * 18;
    s += `<rect x="196" y="${ly}" width="10" height="10" fill="${COLORS[i % COLORS.length]}"/>`;
    s += `<text x="212" y="${ly + 9}" font-size="11" fill="#1f2937">${escXml(r.label.slice(0, 16))} ${Math.round(frac * 100)}%</text>`;
    a0 = a1;
  });
  return s + svgClose();
}
