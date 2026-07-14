import type { TrendPoint } from '../metrics/trend.js';
import { svgOpen, svgClose, escXml, scaleY } from './svg.js';

export function renderTrendChart(points: TrendPoint[]): string {
  const W = 720, H = 240, top = 20, bottom = 40, left = 8, right = 8;
  const plotH = H - top - bottom, plotW = W - left - right;
  const revMax = points.reduce((m, p) => Math.max(m, p.revenue), 0);
  const cntMax = points.reduce((m, p) => Math.max(m, p.bookings), 0);
  const n = points.length;
  const step = n > 0 ? plotW / n : plotW;
  const barW = Math.max(2, step * 0.6);

  let s = svgOpen(W, H);
  // 売上の棒
  points.forEach((p, i) => {
    const x = left + i * step + (step - barW) / 2;
    const y = scaleY(p.revenue, revMax, top, plotH);
    s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${(top + plotH - y).toFixed(1)}" fill="#c7d2e0"/>`;
  });
  // 件数の折れ線
  const pts = points.map((p, i) => {
    const x = left + i * step + step / 2;
    const y = scaleY(p.bookings, cntMax, top, plotH);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  if (n > 0) s += `<polyline points="${pts}" fill="none" stroke="#1e3a5f" stroke-width="2"/>`;
  // x 軸ラベル（間引き）
  const labelEvery = Math.ceil(n / 12) || 1;
  points.forEach((p, i) => {
    if (i % labelEvery !== 0) return;
    const x = left + i * step + step / 2;
    s += `<text x="${x.toFixed(1)}" y="${H - 8}" font-size="10" fill="#6b7280" text-anchor="middle">${escXml(p.label.slice(5))}</text>`;
  });
  return s + svgClose();
}
