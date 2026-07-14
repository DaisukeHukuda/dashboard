import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod, inPeriod } from '../period.js';
import { ymOf } from '../util.js';

export interface SocialPoint { bucket: string; posts: number; bookings: number; }

// ISO timestamp（+0900等）を JST 'YYYY-MM-DD' へ
function jstDateOfIso(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts.slice(0, 10);
  const j = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`;
}

export function computeSocialOverlay(
  all: HistoryRecord[], period: Period, media: { timestamp: string }[],
): SocialPoint[] {
  const map = new Map<string, { posts: number; bookings: number }>();
  const get = (b: string) => map.get(b) ?? { posts: 0, bookings: 0 };

  for (const r of filterPeriod(all, period)) {
    const b = ymOf(r.date); const cur = get(b); cur.bookings += 1; map.set(b, cur);
  }
  for (const m of media) {
    const date = jstDateOfIso(m.timestamp);
    if (!inPeriod(date, period)) continue;
    const b = ymOf(date); const cur = get(b); cur.posts += 1; map.set(b, cur);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([bucket, v]) => ({ bucket, posts: v.posts, bookings: v.bookings }));
}
