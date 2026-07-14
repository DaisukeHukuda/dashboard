import { describe, it, expect } from 'vitest';
import { computeCohorts } from '../src/metrics/cohort.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string, phoneHash: string): HistoryRecord => ({ date, course: 'A', pax: 1, amount: 1, status: '参加済', phoneHash });

describe('computeCohorts', () => {
  it('buckets by first-visit month and counts return offsets', () => {
    const all = [
      r('2023-01-10', 'p1'), r('2023-03-10', 'p1'), // p1: 初回1月, 2ヶ月後に再訪
      r('2023-01-20', 'p2'),                        // p2: 初回1月のみ
      r('2023-02-05', 'p3'),                        // p3: 初回2月のみ
    ];
    const rows = computeCohorts(all, 3);
    const jan = rows.find(x => x.cohort === '2023-01')!;
    expect(jan.size).toBe(2);
    expect(jan.retention[0]).toBe(2); // 初月は全員
    expect(jan.retention[2]).toBe(1); // 2ヶ月後は p1 のみ
    const feb = rows.find(x => x.cohort === '2023-02')!;
    expect(feb.size).toBe(1);
    expect(feb.retention[0]).toBe(1);
  });
  it('ignores empty phoneHash', () => {
    expect(computeCohorts([r('2023-01-01', '')], 3)).toHaveLength(0);
  });
});
