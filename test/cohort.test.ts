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

  it('within3: +1〜+3のユニーク人数（同一人物の複数回は1人）、+4は含まない', () => {
    const all = [
      r('2023-01-05', 'p1'), r('2023-02-10', 'p1'), r('2023-04-10', 'p1'), // 初回 + +1 + +3 → 1人
      r('2023-01-05', 'p2'), r('2023-05-10', 'p2'), // 初回 + +4 → within3には含まない
    ];
    const rows = computeCohorts(all, 4);
    const jan = rows.find(x => x.cohort === '2023-01')!;
    expect(jan.within3).toBe(1);
  });

  it('yearLater: +11・+13は含む、+10・+14は含まない', () => {
    const all = [
      r('2023-01-05', 'p3'), r('2023-12-10', 'p3'), // +11
      r('2023-01-05', 'p4'), r('2024-02-10', 'p4'), // +13
      r('2023-01-05', 'p5'), r('2023-11-10', 'p5'), // +10
      r('2023-01-05', 'p6'), r('2024-03-10', 'p6'), // +14
    ];
    const rows = computeCohorts(all, 14);
    const jan = rows.find(x => x.cohort === '2023-01')!;
    expect(jan.yearLater).toBe(2); // p3, p4 のみ
  });
});

describe('computeCohorts: within3/yearLater は maxOffset に依存しない', () => {
  it('maxOffset=12 でも +13ヶ月の再訪を yearLater に数え、retention は 13要素のまま', () => {
    const all = [r('2023-01-10', 'p1'), r('2024-02-10', 'p1'), r('2023-01-10', 'p2')];
    const jan = computeCohorts(all, 12).find(x => x.cohort === '2023-01')!;
    expect(jan.yearLater).toBe(1);
    expect(jan.retention).toHaveLength(13);
    expect(jan.size).toBe(2);
  });
});
