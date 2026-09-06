import type { HistoryRecord } from './types.js';
import { addDaysToYmd, addMonthsToYmd, daysBetweenYmd, isValidYmd, lastDayOfMonth } from './util.js';

export type PeriodKind = 'last12' | 'last24' | 'year' | 'all' | 'month' | 'custom';
export interface Period { start: string; end: string; label: string; kind: PeriodKind; }

export function resolvePeriod(param: string | null, today: string, from?: string | null, to?: string | null): Period {
  if (param && /^\d{4}$/.test(param)) {
    return { start: `${param}-01-01`, end: `${param}-12-31`, label: `${param}年`, kind: 'year' };
  }
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const m = Number(param.slice(5, 7));
    if (m >= 1 && m <= 12) {
      return { start: `${param}-01`, end: lastDayOfMonth(param), label: `${Number(param.slice(0, 4))}年${m}月`, kind: 'month' };
    }
  }
  if (param === 'custom' && from && to && isValidYmd(from) && isValidYmd(to) && from <= to) {
    return { start: from, end: to, label: `${from}〜${to}`, kind: 'custom' };
  }
  if (param === 'all') {
    return { start: '2015-01-01', end: today, label: '全期間', kind: 'all' };
  }
  if (param === 'last24') {
    const start = addDaysToYmd(addMonthsToYmd(today, -24), 1);
    return { start, end: today, label: '直近24ヶ月', kind: 'last24' };
  }
  // 既定: 直近12ヶ月
  const start = addDaysToYmd(addMonthsToYmd(today, -12), 1);
  return { start, end: today, label: '直近12ヶ月', kind: 'last12' };
}

export function priorYear(p: Period): Period {
  return {
    start: addMonthsToYmd(p.start, -12),
    end: addMonthsToYmd(p.end, -12),
    label: `${p.label}（前年）`,
    kind: p.kind,
  };
}

// URLクエリ用の直列化（全フォーム/リンクはこれを使う）
export function periodQuery(p: Period): Record<string, string> {
  if (p.kind === 'year') return { period: p.start.slice(0, 4) };
  if (p.kind === 'month') return { period: p.start.slice(0, 7) };
  if (p.kind === 'custom') return { period: 'custom', from: p.start, to: p.end };
  return { period: p.kind };
}

export function spanDays(p: Period): number {
  return daysBetweenYmd(p.start, p.end) + 1;
}

// 比較期間。month/短いcustom/last12/year/all は -12ヶ月（前年同期）、last24 は -24ヶ月、366日超の custom は期間長ぶん過去へ。
export function priorPeriod(p: Period): Period {
  if (p.kind === 'custom' && spanDays(p) > 366) {
    const months = Math.round(daysBetweenYmd(p.start, p.end) / 30.5);
    return { start: addMonthsToYmd(p.start, -months), end: addMonthsToYmd(p.end, -months), label: `${p.label}（前期間）`, kind: p.kind };
  }
  const months = p.kind === 'last24' ? 24 : 12;
  return { start: addMonthsToYmd(p.start, -months), end: addMonthsToYmd(p.end, -months), label: `${p.label}（前期間）`, kind: p.kind };
}

export function comparisonLabel(p: Period): string {
  if (p.kind === 'last24') return '前24ヶ月比';
  if (p.kind === 'month') return '前年同月比';
  if (p.kind === 'custom') return spanDays(p) > 366 ? '前期間比' : '前年同期間比';
  return '前年比';
}

export function inPeriod(ymd: string, p: Period): boolean {
  return ymd >= p.start && ymd <= p.end;
}

export function filterPeriod(records: HistoryRecord[], p: Period): HistoryRecord[] {
  return records.filter(r => inPeriod(r.date, p));
}
