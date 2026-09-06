import type { CohortRow } from '../metrics/cohort.js';
import { escXml } from './svg.js';
import { monthsBetween } from '../util.js';

const PC_COLS = 13; // +0m〜+12m

function pct(v: number, size: number): number {
  return size ? Math.round((v / size) * 100) : 0;
}

function renderPcTable(rows: CohortRow[], todayYm: string): string {
  const head = `<thead><tr><th>初回月(人数)</th>${
    Array.from({ length: PC_COLS }, (_, k) => `<th>+${k}m</th>`).join('')
  }</tr></thead>`;

  const body = rows.map(r => {
    const cells = Array.from({ length: PC_COLS }, (_, k) => {
      const isFuture = monthsBetween(r.cohort, todayYm) < k;
      if (isFuture) {
        return `<td class="future" style="background:#f3f4f6;color:var(--muted)" title="まだ時期が来ていません">—</td>`;
      }
      const v = r.retention[k] ?? 0;
      const rate = r.size ? v / r.size : 0;
      const bg = k === 0 ? '#1e3a5f' : `rgba(30,58,95,${(0.1 + 0.9 * rate).toFixed(2)})`;
      const color = rate > 0.5 || k === 0 ? '#fff' : '#1f2937';
      return `<td style="background:${bg};color:${color}">${Math.round(rate * 100)}%</td>`;
    }).join('');
    return `<tr><th scope="row">${escXml(r.cohort)} (${r.size})</th>${cells}</tr>`;
  }).join('');

  return `<div class="cohort-wrap cohort-pc"><table class="cohort">${head}<tbody>${body}</tbody></table></div>`;
}

function renderSpTable(rows: CohortRow[], todayYm: string): string {
  const head = `<thead><tr><th>初回月</th><th>人数</th><th>3ヶ月以内</th><th>1年後</th></tr></thead>`;

  const body = rows.map(r => {
    const within3 = monthsBetween(r.cohort, todayYm) < 3 ? '—' : `${pct(r.within3, r.size)}%`;
    const yearLater = monthsBetween(r.cohort, todayYm) < 13 ? '—' : `${pct(r.yearLater, r.size)}%`;
    return `<tr><th scope="row">${escXml(r.cohort)}</th><td>${r.size}</td><td>${within3}</td><td>${yearLater}</td></tr>`;
  }).join('');

  return `<div class="cohort-wrap cohort-sp"><table class="cohort">${head}<tbody>${body}</tbody></table></div>`;
}

export function renderCohortGrid(rows: CohortRow[], todayYm: string): string {
  if (rows.length === 0) return '<p>データがありません</p>';
  const sorted = [...rows].sort((a, b) => b.cohort.localeCompare(a.cohort)); // 新しい初回月が上（入力配列は変更しない）
  return renderPcTable(sorted, todayYm) + renderSpTable(sorted, todayYm);
}
