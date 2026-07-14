import type { Period } from './period.js';
import type { Kpi } from './metrics/kpi.js';
import type { TrendPoint } from './metrics/trend.js';
import type { Heatmap } from './metrics/heatmap.js';
import type { CohortRow } from './metrics/cohort.js';
import type { CourseRow } from './metrics/course.js';
import type { WeatherJoin } from './metrics/weatherjoin.js';
import { renderTrendChart } from './charts/line.js';
import { renderCourseBars } from './charts/bar.js';
import { renderHeatmap } from './charts/heatmap.js';
import { renderCohortGrid } from './charts/cohortgrid.js';

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function layout(title: string, body: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--ink:#1f2937;--muted:#6b7280;--accent:#1e3a5f;--line:#e5e7eb}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--accent);color:#fff;padding:12px 16px;font-weight:700}
main{max-width:1100px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 16px}
.card h2{margin:0 0 12px;font-size:15px}
a{color:var(--accent)}
label{display:block;margin:8px 0 4px;font-size:13px;color:var(--muted)}
input,select{padding:8px;border:1px solid var(--line);border-radius:6px;font-size:14px}
button{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:9px 16px;font-size:14px;cursor:pointer}
</style></head><body>${body}</body></html>`;
}

export function loginPage(error?: string): string {
  const err = error ? `<p style="color:#b91c1c;font-size:13px">${esc(error)}</p>` : '';
  return layout('ログイン｜Sup! Sup! マーケ分析', `<main><div class="card" style="max-width:360px;margin:48px auto">
<h2>ログイン</h2>${err}
<form method="post" action="/login">
<label>ユーザー名</label><input name="username" autocomplete="username" required>
<label>パスワード</label><input name="password" type="password" autocomplete="current-password" required>
<div style="margin-top:12px"><button type="submit">ログイン</button></div>
</form></div></main>`);
}

const yen = (n: number) => `${n.toLocaleString()}円`;
function yoyLabel(v: number | null): string {
  if (v === null) return '—';
  const d = v - 1;
  return d >= 0 ? `+${Math.round(d * 100)}%` : `-${Math.round(-d * 100)}%`;
}
function kpiCard(label: string, value: string, sub = ''): string {
  return `<div style="flex:1;min-width:130px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px">
<div style="font-size:12px;color:var(--muted)">${esc(label)}</div>
<div style="font-size:20px;font-weight:700;margin-top:4px">${esc(value)}</div>
${sub ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(sub)}</div>` : ''}</div>`;
}

export interface DashboardData {
  period: Period; kpi: Kpi; trend: TrendPoint[]; heatmap: Heatmap;
  courses: string[]; selectedCourse: string; cohorts: CohortRow[];
  courseRows: CourseRow[]; weather: WeatherJoin; insights: string[];
  granularity: 'month' | 'week';
}

function periodSelect(period: Period): string {
  const years = [2024, 2023, 2022, 2021, 2020];
  const opt = (v: string, label: string, sel: boolean) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  const cur = period.kind === 'year' ? period.start.slice(0, 4) : period.kind;
  return `<form method="get" style="display:flex;gap:8px;align-items:center">
<label style="margin:0">期間</label>
<select name="period" onchange="this.form.submit()">
${opt('last12', '直近12ヶ月', cur === 'last12')}
${opt('all', '全期間', cur === 'all')}
${years.map(y => opt(String(y), `${y}年`, cur === String(y))).join('')}
</select></form>`;
}

export function renderDashboard(d: DashboardData): string {
  const k = d.kpi;
  const kpis = [
    kpiCard('予約件数', `${k.bookings}件`, `前年比 ${yoyLabel(k.yoyBookings)}`),
    kpiCard('売上', yen(k.revenue), `前年比 ${yoyLabel(k.yoyRevenue)}`),
    kpiCard('客単価', yen(k.avgPerBooking)),
    kpiCard('参加人数', `${k.pax}名`),
    kpiCard('リピート率', `${Math.round(k.repeatRate * 100)}%`, `新規${k.newCount} / リピート${k.repeatCount}`),
  ].join('');

  const courseOpts = ['<option value="">全コース</option>']
    .concat(d.courses.map(c => `<option value="${esc(c)}"${c === d.selectedCourse ? ' selected' : ''}>${esc(c)}</option>`))
    .join('');

  const insightList = d.insights.map(s => `<li style="margin:4px 0">${esc(s)}</li>`).join('');

  const body = `<header>Sup! Sup! マーケ分析ダッシュボード <a href="/logout" style="color:#cbd5e1;font-size:12px;float:right">ログアウト</a></header>
<main>
<div class="card" style="display:flex;justify-content:space-between;align-items:center">${periodSelect(d.period)}<span style="font-size:12px;color:var(--muted)">${esc(d.period.label)}</span></div>

<div class="card"><h2>KPI サマリー</h2><div style="display:flex;gap:10px;flex-wrap:wrap">${kpis}</div></div>

<div class="card"><h2>戦略インサイト</h2><ul style="margin:0;padding-left:18px;font-size:14px">${insightList}</ul></div>

<div class="card"><h2>売上・予約トレンド（棒=売上 / 線=件数）</h2>${renderTrendChart(d.trend)}</div>

<div class="card"><h2>季節 × 曜日ヒートマップ</h2>
<form method="get" style="margin-bottom:8px">
<input type="hidden" name="period" value="${d.period.kind === 'year' ? d.period.start.slice(0, 4) : d.period.kind}">
<select name="course" onchange="this.form.submit()">${courseOpts}</select>
</form>${renderHeatmap(d.heatmap)}</div>

<div class="card"><h2>天候相関</h2>${renderWeatherBlock(d.weather)}</div>

<div class="card"><h2>リピーター・コホート再訪率（初回月別・全期間）</h2>${renderCohortGrid(d.cohorts)}</div>

<div class="card"><h2>コース別内訳</h2>${renderCourseBars(d.courseRows)}</div>
</main>`;
  return layout('ダッシュボード｜Sup! Sup! マーケ分析', body);
}

function renderWeatherBlock(w: WeatherJoin): string {
  const rows = w.byCategory.map(c =>
    `<tr><td style="padding:2px 10px">${esc(c.category)}</td><td style="padding:2px 10px;text-align:right">${c.days}日</td><td style="padding:2px 10px;text-align:right">${c.avgBookings.toFixed(1)}件/日</td></tr>`
  ).join('');
  const drop = w.dropPct !== null ? `雨・雪の日は好天比 <b>-${Math.round(w.dropPct * 100)}%</b>` : '天候データが不足しています';
  return `<p style="font-size:14px;margin:0 0 8px">${drop}</p>
<table style="font-size:13px;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:2px 10px">天候</th><th style="padding:2px 10px">日数</th><th style="padding:2px 10px">平均予約</th></tr></thead><tbody>${rows}</tbody></table>`;
}
