import type { HistoryRecord } from './types.js';
import { addDaysToYmd, addMonthsToYmd } from './util.js';

export interface Period { start: string; end: string; label: string; kind: 'last12' | 'last24' | 'year' | 'all'; }

export function resolvePeriod(param: string | null, today: string): Period {
  if (param && /^\d{4}$/.test(param)) {
    return { start: `${param}-01-01`, end: `${param}-12-31`, label: `${param}年`, kind: 'year' };
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

// 窓の長さぶん過去へずらした比較期間。last24 は -24ヶ月（-12だと現行窓と重複し比較にならない）。
export function priorPeriod(p: Period): Period {
  const months = p.kind === 'last24' ? 24 : 12;
  return {
    start: addMonthsToYmd(p.start, -months),
    end: addMonthsToYmd(p.end, -months),
    label: `${p.label}（前期間）`,
    kind: p.kind,
  };
}

export function inPeriod(ymd: string, p: Period): boolean {
  return ymd >= p.start && ymd <= p.end;
}

export function filterPeriod(records: HistoryRecord[], p: Period): HistoryRecord[] {
  return records.filter(r => inPeriod(r.date, p));
}
