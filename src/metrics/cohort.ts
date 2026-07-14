import type { HistoryRecord } from '../types.js';
import { ymOf, monthsBetween } from '../util.js';
import { firstVisitMap } from '../repeat.js';

export interface CohortRow { cohort: string; size: number; retention: number[]; }

export function computeCohorts(all: HistoryRecord[], maxOffset: number): CohortRow[] {
  const first = firstVisitMap(all);
  // cohort(YYYY-MM) → offset → Set<phoneHash>
  const table = new Map<string, Map<number, Set<string>>>();
  const sizes = new Map<string, Set<string>>();

  for (const r of all) {
    if (!r.phoneHash) continue;
    const firstDate = first.get(r.phoneHash)!;
    const cohort = ymOf(firstDate);
    const offset = monthsBetween(ymOf(firstDate), ymOf(r.date));
    if (offset < 0 || offset > maxOffset) continue;
    (sizes.get(cohort) ?? sizes.set(cohort, new Set()).get(cohort)!).add(r.phoneHash);
    let byOffset = table.get(cohort);
    if (!byOffset) { byOffset = new Map(); table.set(cohort, byOffset); }
    (byOffset.get(offset) ?? byOffset.set(offset, new Set()).get(offset)!).add(r.phoneHash);
  }

  return [...table.keys()].sort().map(cohort => {
    const byOffset = table.get(cohort)!;
    const retention = Array.from({ length: maxOffset + 1 }, (_, k) => byOffset.get(k)?.size ?? 0);
    return { cohort, size: sizes.get(cohort)?.size ?? retention[0], retention };
  });
}
