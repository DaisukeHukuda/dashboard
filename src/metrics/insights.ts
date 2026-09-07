import type { HistoryRecord } from '../types.js';
import { type Period, priorPeriod, priorYear, comparisonLabel, spanDays, filterPeriod } from '../period.js';
import { type Kpi, computeKpi } from './kpi.js';
import { type Heatmap, computeHeatmap } from './heatmap.js';
import { type TrendPoint, computeTrend } from './trend.js';
import { type CourseRow, computeCourseBreakdown } from './course.js';
import { computeSourceBreakdown } from './source.js';
import { addMonthsToYmd, monthsBetween, ymOf } from '../util.js';

export interface InsightItem { text: string; hint?: string }
export interface InsightGroup { title: string; items: InsightItem[] }

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const pct = (x: number) => `${Math.round(x * 100)}%`;
export const signedPct = (ratio: number) => { const d = Math.round((ratio - 1) * 100); return d === 0 ? '±0%' : `${d > 0 ? '+' : ''}${d}%`; };   // ratio=cur/prev
const yen = (n: number) => `${Math.round(n).toLocaleString('ja-JP')}円`;
const signedYen = (n: number) => { const r = Math.round(n); return r === 0 ? '±0円' : `${r > 0 ? '+' : '-'}${Math.abs(r).toLocaleString('ja-JP')}円`; };
const jaMonth = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月`;

// 期間終端の月から遡る直近 n 暦月（'YYYY-MM'の昇順配列）
function lastCalendarMonths(endYm: string, n: number): string[] {
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) months.push(addMonthsToYmd(`${endYm}-01`, -i).slice(0, 7));
  return months;
}
// 暦月レンジのラベル（年つき。年をまたぐ場合は両端に年を付ける）
function monthRangeLabel(months: string[]): string {
  const first = months[0], last = months[months.length - 1];
  const fy = Number(first.slice(0, 4)), fm = Number(first.slice(5, 7));
  const ly = Number(last.slice(0, 4)), lm = Number(last.slice(5, 7));
  return fy === ly ? `${fy}年${fm}〜${lm}月` : `${fy}年${fm}月〜${ly}年${lm}月`;
}

export function buildInsights(input: { all: HistoryRecord[]; period: Period; kpi: Kpi; heatmap: Heatmap; trend: TrendPoint[]; courseRows: CourseRow[]; sourceRows: CourseRow[] }): InsightGroup[] {
  const { all, period, kpi, courseRows, sourceRows } = input; // heatmap/trend は内部で再計算するため未使用（呼び出し側の互換のため入力は残す）
  const prev = priorPeriod(period);
  const prevKpi = computeKpi(all, prev);
  const cmp = comparisonLabel(period);
  const comparable = period.kind !== 'all'; // 全期間は「前期」が定義できないため比較を出さない
  const groups: InsightGroup[] = [];

  // 1. 売上の要因
  { const items: InsightItem[] = [];
    if (comparable && prevKpi.revenue > 0) {
      items.push({ text: `売上 ${yen(kpi.revenue)}（${cmp} ${signedPct(kpi.revenue / prevKpi.revenue)}・${signedYen(kpi.revenue - prevKpi.revenue)}）。件数 ${kpi.bookings}件（${signedPct(prevKpi.bookings ? kpi.bookings / prevKpi.bookings : 1)}）・客単価 ${yen(kpi.avgPerBooking)}（前期 ${yen(prevKpi.avgPerBooking)}）` });
      if (prevKpi.bookings > 0) {
        // 丸め誤差の蓄積を避けるため、要因分解には丸め前の客単価（revenue/bookings）を使う
        const prevAvg = prevKpi.revenue / prevKpi.bookings;
        const curAvg = kpi.bookings > 0 ? kpi.revenue / kpi.bookings : 0;
        const volume = (kpi.bookings - prevKpi.bookings) * prevAvg;
        const price = (curAvg - prevAvg) * kpi.bookings;
        items.push({ text: `内訳: 件数増減で${signedYen(volume)}・客単価変化で${signedYen(price)}`, hint: Math.abs(volume) >= Math.abs(price) ? '→ 変化は主に客数（件数）によるもの' : '→ 変化は主に客単価によるもの' });
      }
    } else {
      items.push({ text: `売上 ${yen(kpi.revenue)}・件数 ${kpi.bookings}件・客単価 ${yen(kpi.avgPerBooking)}（比較できる前期間の実績なし）` });
    }
    groups.push({ title: '売上の要因', items }); }

  // 2. 勢い（月次バケット3以上。24ヶ月窓・全期間・366日超のcustomは前年を自身に含む/長すぎるため省略）
  { const skipMomentum = period.kind === 'last24' || period.kind === 'all' || (period.kind === 'custom' && spanDays(period) > 366);
    if (!skipMomentum) {
      const monthly = computeTrend(all, period, 'month');
      if (monthly.length >= 3) {
        const py = new Map(computeTrend(all, priorYear(period), 'month').map(p => [p.bucket, p.bookings]));
        const yoy = monthly.map(m => { const [y, mo] = m.bucket.split('-'); const pv = py.get(`${Number(y) - 1}-${mo}`) ?? 0; return { bucket: m.bucket, cur: m.bookings, prev: pv }; }).filter(x => x.prev >= 3);
        const items: InsightItem[] = [];
        if (yoy.length >= 2) {
          const best = yoy.reduce((a, b) => (b.cur / b.prev > a.cur / a.prev ? b : a));
          const worst = yoy.reduce((a, b) => (b.cur / b.prev < a.cur / a.prev ? b : a));
          items.push({ text: `前年同月比で最も伸びた月: ${jaMonth(best.bucket)}（${signedPct(best.cur / best.prev)}）／最も落ちた月: ${jaMonth(worst.bucket)}（${signedPct(worst.cur / worst.prev)}）` });
        } else if (yoy.length === 1) {
          const only = yoy[0];
          items.push({ text: `前年同月比: ${jaMonth(only.bucket)}（${signedPct(only.cur / only.prev)}）` });
        }
        // 直近3ヶ月は「実績のあるバケットの末尾3つ」ではなく、期間終端から遡る暦月3つを固定で使う（欠測月は0件）
        const endYm = period.end.slice(0, 7);
        const startYm = period.start.slice(0, 7);
        if (monthsBetween(startYm, endYm) >= 2) {
          const months3 = lastCalendarMonths(endYm, 3);
          const monthSet = new Set(months3);
          const cur3 = filterPeriod(all, period).filter(r => monthSet.has(ymOf(r.date))).length;
          const prev3 = months3.reduce((a, ym) => { const [y, mo] = ym.split('-'); return a + (py.get(`${Number(y) - 1}-${mo}`) ?? 0); }, 0);
          if (prev3 > 0) {
            const r3 = cur3 / prev3;
            const overall = prevKpi.bookings > 0 ? kpi.bookings / prevKpi.bookings : null;
            const label = monthRangeLabel(months3);
            items.push({ text: `直近3ヶ月（${label}）は前年同期比 ${signedPct(r3)}`, hint: overall === null ? undefined : r3 >= overall ? '→ 足元の勢いは期間平均より強い' : '→ 足元は期間平均より鈍い' });
          }
        }
        if (items.length) groups.push({ title: '勢い', items });
      }
    } }

  // 3. 曜日・季節（コース絞り込みの影響を受けないよう、常に全コースで計算する）
  { const hm = computeHeatmap(all, period);
    const byW = Array(7).fill(0); for (let m = 0; m < 12; m++) for (let w = 0; w < 7; w++) byW[w] += hm.counts[m][w];
    const total = byW.reduce((a, b) => a + b, 0);
    if (total > 0) {
      const items: InsightItem[] = [];
      const weekend = (byW[0] + byW[6]) / total;
      let prevTxt = '';
      if (comparable) {
        const ph = computeHeatmap(all, prev); const pByW = Array(7).fill(0); for (let m = 0; m < 12; m++) for (let w = 0; w < 7; w++) pByW[w] += ph.counts[m][w];
        const pTotal = pByW.reduce((a, b) => a + b, 0);
        prevTxt = pTotal > 0 ? `（前期 ${pct((pByW[0] + pByW[6]) / pTotal)}）` : '';
      }
      items.push({ text: `土日の比率 ${pct(weekend)}${prevTxt}`, hint: weekend >= 0.6 ? '→ 週末への依存度が高い' : '→ 平日にも一定の需要がある' });
      const maxW = byW.indexOf(Math.max(...byW)); const avg = total / 7;
      if (byW[maxW] > avg) items.push({ text: `最も予約が多い曜日は ${WD[maxW]}曜（平均比 +${pct(byW[maxW] / avg - 1)}）` });
      const monthly = computeTrend(all, period, 'month');
      if (monthly.length >= 3) { const peak = monthly.reduce((a, b) => (b.bookings > a.bookings ? b : a)); items.push({ text: `ピーク月は${jaMonth(peak.bucket)}（件数の${pct(peak.bookings / kpi.bookings)}）` }); }
      groups.push({ title: '曜日・季節', items });
    } }

  // 4. コース
  { if (courseRows.length > 0 && kpi.bookings > 0) {
      const items: InsightItem[] = [];
      const top = [...courseRows].sort((a, b) => b.bookings - a.bookings)[0];
      const bShare = top.bookings / kpi.bookings; const rShare = kpi.revenue > 0 ? top.revenue / kpi.revenue : 0;
      const hint = rShare >= bShare + 0.1 ? '→ 主力コースは単価も高く収益の柱' : bShare >= 0.6 ? '→ 特定コースへの集中度が高い' : undefined;
      items.push({ text: `最多コースは「${top.course}」（件数${pct(bShare)}・売上${pct(rShare)}）`, hint });
      if (comparable) {
        const prevRows = new Map(computeCourseBreakdown(all, prev).map(r => [r.course, r.bookings]));
        const ratios = courseRows.filter(r => (prevRows.get(r.course) ?? 0) >= 3).map(r => ({ course: r.course, ratio: r.bookings / (prevRows.get(r.course) as number) }));
        if (ratios.length >= 2) {
          const up = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a)); const down = ratios.reduce((a, b) => (b.ratio < a.ratio ? b : a));
          items.push({ text: `${cmp}で最も伸びた: 「${up.course}」${signedPct(up.ratio)}／最も落ちた: 「${down.course}」${signedPct(down.ratio)}` });
        } else if (ratios.length === 1) {
          items.push({ text: `${cmp}: 「${ratios[0].course}」${signedPct(ratios[0].ratio)}` });
        }
      }
      groups.push({ title: 'コース', items });
    } }

  // 5. リピート
  { if (kpi.bookings > 0) {
      const items: InsightItem[] = [];
      if (comparable && prevKpi.bookings > 0) {
        const diffPt = Math.round((kpi.repeatRate - prevKpi.repeatRate) * 100);
        items.push({ text: `リピート率 ${pct(kpi.repeatRate)}（前期 ${pct(prevKpi.repeatRate)}・${diffPt >= 0 ? '+' : ''}${diffPt}pt）` });
        const newR = prevKpi.newCount > 0 ? kpi.newCount / prevKpi.newCount : null; const repR = prevKpi.repeatCount > 0 ? kpi.repeatCount / prevKpi.repeatCount : null;
        items.push({ text: `新規 ${kpi.newCount}件（${newR === null ? '前期0件' : cmp + ' ' + signedPct(newR)}）・リピート ${kpi.repeatCount}件（${repR === null ? '前期0件' : cmp + ' ' + signedPct(repR)}）`,
          hint: (newR !== null && newR < 1 && (repR ?? 1) >= 1) ? '→ リピーターが支え、新規獲得が課題' : (newR !== null && newR > 1) ? '→ 新規獲得が伸びている' : '→ 大きな変化なし' });
      } else {
        items.push({ text: `リピート率 ${pct(kpi.repeatRate)}（新規 ${kpi.newCount} / リピート ${kpi.repeatCount}）` });
      }
      groups.push({ title: 'リピート', items });
    } }

  // 6. 流入経路（自己申告）
  { if (sourceRows.length > 0 && kpi.bookings > 0) {
      const items: InsightItem[] = [];
      const top = [...sourceRows].sort((a, b) => b.bookings - a.bookings)[0];
      items.push({ text: `最多は「${top.course}」（${pct(top.bookings / kpi.bookings)}）` });
      const share = (rows: CourseRow[], name: string, total: number) => total > 0 ? (rows.find(r => r.course === name)?.bookings ?? 0) / total : 0;
      const ig = share(sourceRows, 'Instagram', kpi.bookings);
      const unknown = share(sourceRows, '未回答', kpi.bookings) + share(sourceRows, '不明', kpi.bookings);
      let pIg = 0; let showPrev = false;
      if (comparable && prevKpi.bookings > 0) {
        const prevRows = computeSourceBreakdown(all, prev);
        pIg = share(prevRows, 'Instagram', prevKpi.bookings);
        showPrev = true;
      }
      items.push({ text: `Instagram経由 ${pct(ig)}${showPrev ? `（前期 ${pct(pIg)}）` : ''}・未回答・不明 ${pct(unknown)}`,
        hint: unknown >= 0.3 ? '→ 未回答が多く、予約時の「経緯」の把握精度が分析の伸びしろ' : (showPrev && ig > pIg) ? '→ Instagram経由が伸びている' : undefined });
      groups.push({ title: '流入経路（自己申告）', items });
    } }

  return groups;
}
