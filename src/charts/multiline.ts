import type { SeriesData } from '../metrics/series.js';
import { svgOpen, svgClose, escXml, scaleY } from './svg.js';
import { axisLabels } from './axis.js';
const COLORS = ['#1e3a5f', '#16a34a', '#db2777', '#f59e0b', '#7c3aed', '#0891b2'];

// 凡例名が長い時、中央を…で省略する（先頭と末尾を残して見分けやすくする）。
export function truncMiddle(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  const head = Math.ceil((maxChars - 1) / 2);
  const tail = Math.floor((maxChars - 1) / 2);
  return name.slice(0, head) + '…' + name.slice(name.length - tail);
}

export function renderMultiLine(data: SeriesData): string {
  const W = 720, H = 260, top = 34, bottom = 36, left = 44, right = 12;
  const n = data.buckets.length;
  if (n === 0 || data.series.length === 0) return svgOpen(W, 60) + `<text x="10" y="35" font-size="12" fill="#6b7280">データなし</text>` + svgClose();
  const plotW = W - left - right, plotH = H - top - bottom;
  const max = Math.max(1, ...data.series.flatMap(s => s.values));
  const xOf = (i: number) => n === 1 ? left + plotW / 2 : left + (i * plotW) / (n - 1);
  let s = svgOpen(W, H);
  // グリッドと目盛（丸めた値が直前と同じ場合はラベルの重複を避けるため描かない）
  let lastLabel: number | null = null;
  for (let g = 0; g <= 4; g++) {
    const v = (max * g) / 4; const y = scaleY(v, max, top, plotH); const rounded = Math.round(v);
    s += `<line x1="${left}" x2="${W - right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e5e7eb"/>`;
    if (rounded !== lastLabel) { s += `<text x="${left - 6}" y="${(y + 3).toFixed(1)}" font-size="9" fill="#6b7280" text-anchor="end">${rounded.toLocaleString('ja-JP')}</text>`; lastLabel = rounded; }
  }
  // 系列
  const slot = Math.floor((W - left - right) / data.series.length);
  const legendMax = Math.max(6, Math.floor((slot - 18) / 10));
  data.series.forEach((ser, si) => {
    const other = ser.name === 'その他';
    const color = other ? '#9ca3af' : COLORS[si % COLORS.length];
    const pts = ser.values.map((v, i) => `${xOf(i).toFixed(1)},${scaleY(v, max, top, plotH).toFixed(1)}`).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2"${other ? ' stroke-dasharray="4 3"' : ''}/>`;
    ser.values.forEach((v, i) => { s += `<circle cx="${xOf(i).toFixed(1)}" cy="${scaleY(v, max, top, plotH).toFixed(1)}" r="2.5" fill="${color}"><title>${escXml(data.buckets[i])} ${escXml(ser.name)}: ${v.toLocaleString('ja-JP')}</title></circle>`; });
    // 凡例（スロット幅は系列数から動的に算出し、はみ出さないようにする）
    const lx = left + si * slot; s += `<rect x="${lx}" y="8" width="10" height="10" fill="${color}"/><text x="${lx + 14}" y="17" font-size="11" fill="#1f2937">${escXml(truncMiddle(ser.name, legendMax))}</text>`;
  });
  // X軸ラベル
  const every = Math.ceil(n / 12) || 1;
  const labels = axisLabels(data.buckets.map(b => ({ bucket: b, label: b })), every);
  labels.forEach((t, i) => { if (t === null) return; s += `<text x="${xOf(i).toFixed(1)}" y="${H - 10}" font-size="10" fill="#6b7280" text-anchor="middle">${escXml(t)}</text>`; });
  return s + svgClose();
}
