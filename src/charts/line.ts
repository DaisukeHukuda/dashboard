import type { TrendPoint } from '../metrics/trend.js';
import { svgOpen, svgClose, escXml, scaleY } from './svg.js';

export function renderTrendChart(points: TrendPoint[], prior?: (number | null)[]): string {
  const W = 720, H = 240, top = 20, bottom = 40, left = 8, right = 8;
  const plotH = H - top - bottom, plotW = W - left - right;
  const hasPrior = !!prior && prior.some(v => v !== null);
  const revMax = points.reduce((m, p) => Math.max(m, p.revenue), 0);
  const priorMax = hasPrior ? prior!.reduce((m: number, v) => Math.max(m, v ?? 0), 0) : 0;
  const cntMax = Math.max(priorMax, points.reduce((m, p) => Math.max(m, p.bookings), 0));
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
  // 前年の件数線（破線・薄色。null は線を切る）
  if (hasPrior) {
    const seg = prior!.map((v, i) => {
      if (v === null) return null;
      const x = left + i * step + step / 2;
      const y = scaleY(v, cntMax, top, plotH);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).filter((p): p is string => p !== null).join(' ');
    if (seg) s += `<polyline points="${seg}" fill="none" stroke="#9aa8bd" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  }
  // 件数の折れ線（当期）
  const pts = points.map((p, i) => {
    const x = left + i * step + step / 2;
    const y = scaleY(p.bookings, cntMax, top, plotH);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  if (n > 0) s += `<polyline points="${pts}" fill="none" stroke="#1e3a5f" stroke-width="2"/>`;
  // 凡例（前年がある時のみ）
  if (hasPrior) {
    s += `<text x="${left}" y="12" font-size="10" fill="#1e3a5f">— 当期</text>`;
    s += `<text x="${left + 56}" y="12" font-size="10" fill="#9aa8bd">- - 前年</text>`;
  }
  // x 軸ラベル（間引き）
  const labelEvery = Math.ceil(n / 12) || 1;
  points.forEach((p, i) => {
    if (i % labelEvery !== 0) return;
    const x = left + i * step + step / 2;
    s += `<text x="${x.toFixed(1)}" y="${H - 8}" font-size="10" fill="#6b7280" text-anchor="middle">${escXml(p.label.slice(5))}</text>`;
  });
  return s + svgClose();
}
