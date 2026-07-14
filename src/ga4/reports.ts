import type { Ga4ReportSpec, Ga4Row } from './types.js';

export const CHANNEL_SPEC: Ga4ReportSpec = { key: 'channel', dimensions: ['sessionDefaultChannelGroup'], metrics: ['sessions', 'totalUsers'], limit: 12 };
export const SOURCE_MEDIUM_SPEC: Ga4ReportSpec = { key: 'sourceMedium', dimensions: ['sessionSourceMedium'], metrics: ['sessions', 'totalUsers'], limit: 15 };
export const TOP_PAGES_SPEC: Ga4ReportSpec = { key: 'topPages', dimensions: ['pagePath'], metrics: ['screenPageViews'], limit: 15 };
export const DEVICE_SPEC: Ga4ReportSpec = { key: 'device', dimensions: ['deviceCategory'], metrics: ['sessions'], limit: 5 };
export const REGION_SPEC: Ga4ReportSpec = { key: 'region', dimensions: ['region'], metrics: ['sessions'], limit: 15 };
// period=all は 2015→現在で日次行が約4200件になるため、限定的な400では
// silently truncateされ overlay の集計が過少になる。GA4 の上限(250,000)を
// 十分下回りつつ何年分もの日次行をカバーできる値に引き上げる。
export const DAILY_SESSIONS_SPEC: Ga4ReportSpec = { key: 'dailySessions', dimensions: ['date'], metrics: ['sessions'], limit: 100000 };

export interface NameValue { label: string; sessions: number; users?: number; }

export function toNameValues(rows: Ga4Row[]): NameValue[] {
  return rows.map(r => ({
    label: r.dims[0] ?? '(不明)',
    sessions: r.mets[0] ?? 0,
    ...(r.mets.length > 1 ? { users: r.mets[1] } : {}),
  }));
}

export function toDailySessions(rows: Ga4Row[]): { date: string; sessions: number }[] {
  return rows
    .map(r => {
      const d = r.dims[0] ?? '';
      const date = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
      return { date, sessions: r.mets[0] ?? 0 };
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
