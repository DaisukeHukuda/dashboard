import { daysBetweenYmd, addDaysToYmd } from '../util.js';
export interface FollowerStats { current: number | null; startDate: string | null; sinceStart: number | null; perDay: number | null; last30: number | null; last30From: string | null }
export function summarizeFollowers(points: { date: string; count: number }[]): FollowerStats {
  if (points.length === 0) return { current: null, startDate: null, sinceStart: null, perDay: null, last30: null, last30From: null };
  const p = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const first = p[0], last = p[p.length - 1];
  if (p.length === 1) return { current: last.count, startDate: first.date, sinceStart: null, perDay: null, last30: null, last30From: null };
  const days = daysBetweenYmd(first.date, last.date);
  const sinceStart = last.count - first.count;
  const cutoff = addDaysToYmd(last.date, -30);
  const inWin = p.filter(x => x.date >= cutoff);
  const last30 = inWin.length >= 2 ? last.count - inWin[0].count : null;
  const last30From = inWin.length >= 2 ? inWin[0].date : null;
  return { current: last.count, startDate: first.date, sinceStart, perDay: days > 0 ? sinceStart / days : null, last30, last30From };
}
