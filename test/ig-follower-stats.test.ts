import { describe, it, expect } from 'vitest';
import { summarizeFollowers } from '../src/ig/followerStats.js';
describe('summarizeFollowers', () => {
  it('増減・1日平均・直近30日', () => {
    const s = summarizeFollowers([{ date: '2026-07-18', count: 3788 }, { date: '2026-08-16', count: 3800 }, { date: '2026-09-05', count: 3840 }, { date: '2026-09-06', count: 3851 }]);
    expect(s.current).toBe(3851); expect(s.startDate).toBe('2026-07-18'); expect(s.sinceStart).toBe(63);
    expect(s.perDay).toBeCloseTo(63 / 50, 2); // 7/18→9/6 = 50日
    expect(s.last30).toBe(51); // 9/6の30日以内で最古=8/16(3800) → 3851-3800
    expect(s.last30From).toBe('2026-08-16');
  });
  it('1点なら current のみ', () => {
    expect(summarizeFollowers([{ date: '2026-09-06', count: 10 }])).toEqual({ current: 10, startDate: '2026-09-06', sinceStart: null, perDay: null, last30: null, last30From: null });
  });
  it('空は全null', () => { expect(summarizeFollowers([]).current).toBeNull(); });
  it('直近30日の窓に2点未満なら last30 も last30From も null', () => {
    const s = summarizeFollowers([{ date: '2026-01-01', count: 100 }, { date: '2026-09-06', count: 200 }]);
    expect(s.last30).toBeNull();
    expect(s.last30From).toBeNull();
  });
});
