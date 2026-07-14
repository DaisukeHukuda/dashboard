import type { CourseRow } from '../metrics/course.js';
import { svgOpen, svgClose, escXml } from './svg.js';

export function renderCourseBars(rows: CourseRow[]): string {
  const W = 640, rowH = 30, pad = 8, labelW = 140, barMax = W - labelW - 90;
  const H = Math.max(rowH, rows.length * rowH) + pad * 2;
  const max = rows.reduce((m, r) => Math.max(m, r.revenue), 0);
  let s = svgOpen(W, H);
  rows.forEach((r, i) => {
    const y = pad + i * rowH;
    const w = max ? Math.max(1, (r.revenue / max) * barMax) : 0;
    s += `<text x="0" y="${y + 18}" font-size="12" fill="#1f2937">${escXml(r.course.slice(0, 12))}</text>`;
    s += `<rect x="${labelW}" y="${y + 6}" width="${w}" height="16" rx="3" fill="#1e3a5f"/>`;
    s += `<text x="${labelW + w + 6}" y="${y + 18}" font-size="11" fill="#6b7280">${r.revenue.toLocaleString()}円 / ${r.bookings}件</text>`;
  });
  return s + svgClose();
}
