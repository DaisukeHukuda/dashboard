import { svgOpen, svgClose, escXml } from './svg.js';
import { axisLabels } from './axis.js';
import { daysBetweenYmd } from '../util.js';
export function renderFollowerChart(points: { date: string; count: number }[]): string {
  const p = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (p.length <= 1) return `<p style="font-size:13px;color:var(--muted)">まだ蓄積が${p.length}日分です（毎日1:00に自動記録されます）。</p>`;
  const W = 720, H = 260, top = 16, left = 56, right = 12, diffH = 40, bottom = 30;
  const plotH = H - top - bottom - diffH - 8; const plotW = W - left - right;
  const span = Math.max(1, daysBetweenYmd(p[0].date, p[p.length - 1].date));
  const xOf = (d: string) => left + (daysBetweenYmd(p[0].date, d) / span) * plotW;
  const counts = p.map(x => x.count); const min = Math.min(...counts), max = Math.max(...counts);
  const range = max - min; const pad = range === 0 ? 10 : Math.max(5, Math.ceil(range * 0.15));
  const lo = min - pad, hi = max + pad;
  const yOf = (v: number) => top + plotH - ((v - lo) / (hi - lo)) * plotH;
  let s = svgOpen(W, H);
  for (let g = 0; g <= 4; g++) { const v = Math.round(lo + ((hi - lo) * g) / 4); const y = yOf(v); s += `<line x1="${left}" x2="${W - right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb"/><text x="${left - 6}" y="${(y + 3).toFixed(1)}" font-size="9" fill="#6b7280" text-anchor="end">${v.toLocaleString('ja-JP')}</text>`; }
  s += `<polyline points="${p.map(x => `${xOf(x.date).toFixed(1)},${yOf(x.count).toFixed(1)}`).join(' ')}" fill="none" stroke="#db2777" stroke-width="2"/>`;
  for (const x of p) s += `<circle cx="${xOf(x.date).toFixed(1)}" cy="${yOf(x.count).toFixed(1)}" r="3" fill="#db2777"><title>${escXml(x.date)}: ${x.count.toLocaleString('ja-JP')}人</title></circle>`;
  // 差分棒（下段）
  const base = top + plotH + 8 + diffH / 2; const maxAbs = Math.max(1, ...p.slice(1).map((x, i) => Math.abs(x.count - p[i].count)));
  s += `<line x1="${left}" x2="${W - right}" y1="${base}" y2="${base}" stroke="#e5e7eb"/>`;
  for (let i = 1; i < p.length; i++) { const d = p[i].count - p[i - 1].count; const h = (Math.abs(d) / maxAbs) * (diffH / 2); const x = xOf(p[i].date); const color = d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#9ca3af'; const y = d >= 0 ? base - h : base; s += `<rect class="diff-bar" x="${(x - 3).toFixed(1)}" y="${y.toFixed(1)}" width="6" height="${Math.max(1, h).toFixed(1)}" fill="${color}"><title>${escXml(p[i].date)}: ${d > 0 ? '+' : ''}${d}</title></rect>`; }
  const labels = axisLabels(p.map(x => ({ bucket: x.date, label: x.date })), Math.ceil(p.length / 10) || 1);
  labels.forEach((t, i) => { if (t === null) return; s += `<text x="${xOf(p[i].date).toFixed(1)}" y="${H - 10}" font-size="10" fill="#6b7280" text-anchor="middle">${escXml(t)}</text>`; });
  return s + svgClose();
}
