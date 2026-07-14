import type { Kpi } from './kpi.js';
import type { Heatmap } from './heatmap.js';
import type { WeatherJoin } from './weatherjoin.js';
import type { TrendPoint } from './trend.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function buildInsights(input: { kpi: Kpi; heatmap: Heatmap; weather: WeatherJoin; trend: TrendPoint[] }): string[] {
  const { kpi, heatmap, weather } = input;
  const out: string[] = [];

  out.push(`期間の予約 ${kpi.bookings} 件・売上 ${kpi.revenue.toLocaleString()} 円（客単価 ${kpi.avgPerBooking.toLocaleString()} 円）。`);
  out.push(`リピート率は ${pct(kpi.repeatRate)}（新規 ${kpi.newCount} / リピート ${kpi.repeatCount}）。`);

  if (kpi.yoyRevenue !== null) {
    const diff = kpi.yoyRevenue - 1;
    const dir = diff >= 0 ? `+${pct(diff)}` : `-${pct(-diff)}`;
    out.push(`売上は前年同期比 ${dir}。`);
  }

  // 曜日の偏り（全曜日合計）
  const byWeekday = Array(7).fill(0);
  for (let m = 0; m < 12; m++) for (let w = 0; w < 7; w++) byWeekday[w] += heatmap.counts[m][w];
  const total = byWeekday.reduce((a, b) => a + b, 0);
  if (total > 0) {
    const maxW = byWeekday.indexOf(Math.max(...byWeekday));
    const avg = total / 7;
    if (byWeekday[maxW] > avg) {
      out.push(`最も予約が多い曜日は ${WD[maxW]}曜（平均比 +${pct(byWeekday[maxW] / avg - 1)}）。`);
    }
  }

  if (weather.dropPct !== null && weather.dryAvg > 0) {
    out.push(`雨・雪の日は晴・曇の日より平均 -${pct(weather.dropPct)}（雨天 ${weather.rainyAvg.toFixed(1)} 件/日 vs 好天 ${weather.dryAvg.toFixed(1)} 件/日）。`);
  }

  return out;
}
