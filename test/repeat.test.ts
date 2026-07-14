import { describe, it, expect } from 'vitest';
import { firstVisitMap, isRepeat } from '../src/repeat.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string, phoneHash: string): HistoryRecord => ({ date, course: 'A', pax: 1, amount: 1, status: '参加済', phoneHash });

describe('firstVisitMap', () => {
  it('records earliest date per phoneHash', () => {
    const m = firstVisitMap([r('2023-06-01', 'p1'), r('2022-05-01', 'p1'), r('2023-01-01', 'p2')]);
    expect(m.get('p1')).toBe('2022-05-01');
    expect(m.get('p2')).toBe('2023-01-01');
  });
  it('ignores empty phoneHash', () => {
    expect(firstVisitMap([r('2023-06-01', '')]).size).toBe(0);
  });
});

describe('isRepeat', () => {
  it('true when a prior visit exists', () => {
    const all = [r('2022-05-01', 'p1'), r('2023-06-01', 'p1')];
    const m = firstVisitMap(all);
    expect(isRepeat(r('2023-06-01', 'p1'), m)).toBe(true);
    expect(isRepeat(r('2022-05-01', 'p1'), m)).toBe(false); // 初回そのもの
  });
  it('empty phoneHash is always new', () => {
    expect(isRepeat(r('2023-06-01', ''), new Map())).toBe(false);
  });
});
