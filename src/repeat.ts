import type { HistoryRecord } from './types.js';

export function firstVisitMap(all: HistoryRecord[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of all) {
    if (!r.phoneHash) continue;
    const cur = m.get(r.phoneHash);
    if (cur === undefined || r.date < cur) m.set(r.phoneHash, r.date);
  }
  return m;
}

// その予約日より前に来訪があればリピート（＝初回来訪日より後）
export function isRepeat(rec: HistoryRecord, firstVisit: Map<string, string>): boolean {
  if (!rec.phoneHash) return false;
  const first = firstVisit.get(rec.phoneHash);
  return first !== undefined && rec.date > first;
}
