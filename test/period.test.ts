import { describe, it, expect } from 'vitest';
import { resolvePeriod, priorYear, priorPeriod, inPeriod, filterPeriod, periodQuery, spanDays, comparisonLabel } from '../src/period.js';
import { weekdayOf, monthOf, ymOf, addMonthsToYmd, monthsBetween, isValidYmd, lastDayOfMonth, daysBetweenYmd } from '../src/util.js';

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
  it('last24 spans 24 months back from today', () => {
    const p = resolvePeriod('last24', '2026-09-05');
    expect(p.kind).toBe('last24');
    expect(p.start).toBe('2024-09-06');
    expect(p.end).toBe('2026-09-05');
    expect(p.label).toBe('直近24ヶ月');
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

describe('priorPeriod', () => {
  it('last24 は 24ヶ月シフト（現行窓と重ならない）', () => {
    const p = resolvePeriod('last24', '2026-09-05');
    const q = priorPeriod(p);
    expect(q.start).toBe('2022-09-06');
    expect(q.end).toBe('2024-09-05');
  });
  it('last12 は priorYear と同じ窓', () => {
    const p = resolvePeriod('last12', '2026-09-05');
    const q = priorPeriod(p);
    expect(q.start).toBe(priorYear(p).start);
    expect(q.end).toBe(priorYear(p).end);
  });
});

describe('util date helpers', () => {
  it('lastDayOfMonth', () => {
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2024-02')).toBe('2024-02-29');
    expect(lastDayOfMonth('2026-08')).toBe('2026-08-31');
  });
  it('isValidYmd', () => {
    expect(isValidYmd('2026-02-30')).toBe(false);
    expect(isValidYmd('2026-02-28')).toBe(true);
    expect(isValidYmd('2026-13-01')).toBe(false);
    expect(isValidYmd('abc')).toBe(false);
  });
  it('daysBetweenYmd', () => {
    expect(daysBetweenYmd('2026-01-01', '2026-01-31')).toBe(30);
  });
});

describe('resolvePeriod month/custom', () => {
  it('YYYY-MM は月初〜月末', () => {
    const p = resolvePeriod('2026-08', '2026-09-06');
    expect(p).toEqual({ start: '2026-08-01', end: '2026-08-31', label: '2026年8月', kind: 'month' });
  });
  it('不正な月は既定', () => {
    expect(resolvePeriod('2026-13', '2026-09-06').kind).toBe('last12');
  });
  it('custom は from〜to', () => {
    const p = resolvePeriod('custom', '2026-09-06', '2026-04-01', '2026-06-30');
    expect(p).toEqual({ start: '2026-04-01', end: '2026-06-30', label: '2026-04-01〜2026-06-30', kind: 'custom' });
  });
  it('custom の不正は既定にフォールバック', () => {
    expect(resolvePeriod('custom', '2026-09-06', '2026-06-30', '2026-04-01').kind).toBe('last12'); // from>to
    expect(resolvePeriod('custom', '2026-09-06', '2026-02-30', '2026-03-01').kind).toBe('last12'); // 実在しない日
    expect(resolvePeriod('custom', '2026-09-06', null, '2026-03-01').kind).toBe('last12');        // 欠落
    expect(resolvePeriod('custom', '2026-09-06', '2026/04/01', '2026-06-30').kind).toBe('last12'); // 形式
  });
});

describe('periodQuery / spanDays / comparisonLabel / priorPeriod', () => {
  it('periodQuery', () => {
    expect(periodQuery(resolvePeriod('last24', '2026-09-06'))).toEqual({ period: 'last24' });
    expect(periodQuery(resolvePeriod('2025', '2026-09-06'))).toEqual({ period: '2025' });
    expect(periodQuery(resolvePeriod('2026-08', '2026-09-06'))).toEqual({ period: '2026-08' });
    expect(periodQuery(resolvePeriod('custom', '2026-09-06', '2026-04-01', '2026-06-30'))).toEqual({ period: 'custom', from: '2026-04-01', to: '2026-06-30' });
  });
  it('spanDays は両端含む', () => {
    expect(spanDays(resolvePeriod('2026-08', '2026-09-06'))).toBe(31);
  });
  it('month は前年同月', () => {
    const q = priorPeriod(resolvePeriod('2026-08', '2026-09-06'));
    expect(q.start).toBe('2025-08-01');
    expect(q.end).toBe('2025-08-31');
    expect(comparisonLabel(resolvePeriod('2026-08', '2026-09-06'))).toBe('前年同月比');
  });
  it('custom ≤366日 は -12ヶ月・>366日 は期間長シフト', () => {
    const short = resolvePeriod('custom', '2026-09-06', '2026-04-01', '2026-06-30');
    expect(priorPeriod(short).start).toBe('2025-04-01');
    expect(priorPeriod(short).end).toBe('2025-06-30');
    expect(comparisonLabel(short)).toBe('前年同期間比');
    const long = resolvePeriod('custom', '2026-09-06', '2024-01-01', '2025-12-31'); // 731日
    expect(priorPeriod(long).end).toBe('2023-12-31');
    expect(priorPeriod(long).start).toBe('2021-12-31');
    expect(comparisonLabel(long)).toBe('前期間比');
  });
  it('既存 kind のラベル', () => {
    expect(comparisonLabel(resolvePeriod('last12', '2026-09-06'))).toBe('前年比');
    expect(comparisonLabel(resolvePeriod('last24', '2026-09-06'))).toBe('前24ヶ月比');
  });
});

describe('priorPeriod: 366日超の custom は日数ぶんシフト', () => {
  it('366日超の custom は日数ぶんシフトし、現行期間と重ならない', () => {
    const p = resolvePeriod('custom', '2026-09-06', '2025-01-01', '2026-02-04'); // 400日
    const q = priorPeriod(p);
    expect(spanDays(q)).toBe(spanDays(p));           // 同じ長さ
    expect(q.end).toBe('2024-12-31');                 // 現行開始日の前日で終わる（重複なし・隙間なし）
    expect(q.start).toBe('2023-11-28');
  });
});
