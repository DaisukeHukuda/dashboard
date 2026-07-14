import { describe, it, expect } from 'vitest';
import { resolvePeriod, priorYear, inPeriod, filterPeriod } from '../src/period.js';
import { weekdayOf, monthOf, ymOf, addMonthsToYmd, monthsBetween } from '../src/util.js';

describe('util', () => {
  it('weekdayOf', () => { expect(weekdayOf('2023-06-10')).toBe(6); }); // 土
  it('monthOf/ymOf', () => { expect(monthOf('2023-06-10')).toBe(6); expect(ymOf('2023-06-10')).toBe('2023-06'); });
  it('addMonthsToYmd wraps year', () => { expect(addMonthsToYmd('2023-11-15', 3)).toBe('2024-02-15'); });
  it('monthsBetween', () => { expect(monthsBetween('2023-01', '2023-06')).toBe(5); });
});

describe('resolvePeriod', () => {
  it('last12 spans 12 months back from today', () => {
    const p = resolvePeriod('last12', '2024-06-15');
    expect(p.kind).toBe('last12');
    expect(p.start).toBe('2023-06-16');
    expect(p.end).toBe('2024-06-15');
  });
  it('year sets Jan 1 to Dec 31', () => {
    const p = resolvePeriod('2023', '2024-06-15');
    expect(p.start).toBe('2023-01-01');
    expect(p.end).toBe('2023-12-31');
  });
  it('all uses a wide window', () => {
    const p = resolvePeriod('all', '2024-06-15');
    expect(p.start <= '2015-01-01').toBe(true);
    expect(p.end).toBe('2024-06-15');
  });
  it('defaults to last12 for unknown param', () => {
    expect(resolvePeriod(null, '2024-06-15').kind).toBe('last12');
  });
});

describe('priorYear / inPeriod / filterPeriod', () => {
  it('priorYear shifts both bounds by a year', () => {
    const p = resolvePeriod('2023', '2024-06-15');
    const q = priorYear(p);
    expect(q.start).toBe('2022-01-01');
    expect(q.end).toBe('2022-12-31');
  });
  it('inPeriod is inclusive', () => {
    const p = resolvePeriod('2023', '2024-06-15');
    expect(inPeriod('2023-01-01', p)).toBe(true);
    expect(inPeriod('2022-12-31', p)).toBe(false);
  });
  it('filterPeriod keeps only in-range', () => {
    const p = resolvePeriod('2023', '2024-06-15');
    const recs = [
      { date: '2023-05-01', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' },
      { date: '2022-05-01', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' },
    ];
    expect(filterPeriod(recs, p)).toHaveLength(1);
  });
});
