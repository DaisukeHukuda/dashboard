import type { HistoryRecord } from './types.js';
import { addDaysToYmd, addMonthsToYmd } from './util.js';

export interface Period { start: string; end: string; label: string; kind: 'last12' | 'year' | 'all'; }

export function resolvePeriod(param: string | null, today: string): Period {
  if (param && /^\d{4}$/.test(param)) {
    return { start: `${param}-01-01`, end: `${param}-12-31`, label: `${param}年`, kind: 'year' };
  }
  if (param === 'all') {
    return { start: '2015-01-01', end: today, label: '全期間', kind: 'all' };
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

export function inPeriod(ymd: string, p: Period): boolean {
  return ymd >= p.start && ymd <= p.end;
}

export function filterPeriod(records: HistoryRecord[], p: Period): HistoryRecord[] {
  return records.filter(r => inPeriod(r.date, p));
}
