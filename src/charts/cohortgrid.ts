import type { CohortRow } from '../metrics/cohort.js';
import { svgOpen, svgClose, escXml } from './svg.js';

export function renderCohortGrid(rows: CohortRow[]): string {
  const labelW = 78, cellW = 46, cellH = 26, headH = 22;
  const offsets = rows.reduce((m, r) => Math.max(m, r.retention.length), 0);
  const W = labelW + Math.max(1, offsets) * cellW, H = headH + Math.max(1, rows.length) * cellH;
  let s = svgOpen(W, H);
  for (let k = 0; k < offsets; k++) {
    s += `<text x="${labelW + k * cellW + cellW / 2}" y="15" font-size="10" fill="#6b7280" text-anchor="middle">+${k}m</text>`;
  }
  rows.forEach((r, i) => {
    const y = headH + i * cellH;
    s += `<text x="0" y="${y + cellH / 2 + 4}" font-size="11" fill="#1f2937">${escXml(r.cohort)}(${r.size})</text>`;
    r.retention.forEach((v, k) => {
      const rate = r.size ? v / r.size : 0;
      const x = labelW + k * cellW;
      const fill = k === 0 ? '#1e3a5f' : `rgba(30,58,95,${(0.1 + 0.9 * rate).toFixed(2)})`;
      s += `<rect x="${x + 1}" y="${y + 1}" width="${cellW - 2}" height="${cellH - 2}" rx="3" fill="${fill}"/>`;
      s += `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4}" font-size="10" fill="${rate > 0.5 || k === 0 ? '#fff' : '#1f2937'}" text-anchor="middle">${Math.round(rate * 100)}%</text>`;
    });
  });
  return s + svgClose();
}
