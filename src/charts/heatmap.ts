import type { Heatmap } from '../metrics/heatmap.js';
import { svgOpen, svgClose } from './svg.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

export function renderHeatmap(h: Heatmap): string {
  const cell = 34, labelW = 36, labelH = 20;
  const W = labelW + 7 * cell, H = labelH + 12 * cell;
  let s = svgOpen(W, H);
  // 曜日ヘッダ
  for (let w = 0; w < 7; w++) {
    s += `<text x="${labelW + w * cell + cell / 2}" y="14" font-size="11" fill="#6b7280" text-anchor="middle">${WD[w]}</text>`;
  }
  for (let m = 0; m < 12; m++) {
    s += `<text x="0" y="${labelH + m * cell + cell / 2 + 4}" font-size="11" fill="#6b7280">${m + 1}月</text>`;
    for (let w = 0; w < 7; w++) {
      const c = h.counts[m][w];
      const t = h.max > 0 ? c / h.max : 0;
      const fill = c === 0 ? '#f1f3f5' : `rgba(30,58,95,${(0.15 + 0.85 * t).toFixed(2)})`;
      const x = labelW + w * cell, y = labelH + m * cell;
      s += `<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="${fill}"><title>${m + 1}月 ${WD[w]}: ${c}件</title></rect>`;
      if (c > 0) s += `<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" font-size="10" fill="${t > 0.5 ? '#fff' : '#1f2937'}" text-anchor="middle">${c}</text>`;
    }
  }
  return s + svgClose();
}
