import { describe, it, expect } from 'vitest';
import { clampEnd, seriesPeriod } from '../src/handlers.js';
import { buildSeries } from '../src/metrics/series.js';
import { resolvePeriod } from '../src/period.js';

describe('clampEnd', () => {
  it('未来日は today にクランプされる', () => {
    expect(clampEnd('2026-12-31', '2026-09-06')).toBe('2026-09-06');
  });
  it('today 以前の日付はそのまま', () => {
    expect(clampEnd('2026-08-01', '2026-09-06')).toBe('2026-08-01');
    expect(clampEnd('2026-09-06', '2026-09-06')).toBe('2026-09-06');
  });
});

describe('seriesPeriod', () => {
  it('endをendClampedに差し替えた期間を返す（start/label/kindは元のまま）', () => {
    const p = resolvePeriod('2026-09', '2026-09-06');
    const sp = seriesPeriod(p, '2026-09-06');
    expect(sp).toEqual({ start: '2026-09-01', end: '2026-09-06', label: '2026年9月', kind: 'month' });
  });
  it('end を today でクランプした期間を buildSeries に渡すと未来日のバケットが含まれない（日次）', () => {
    const today = '2026-09-06';
    const period = resolvePeriod('2026-09', today); // end=2026-09-30（月末、今日より先）
    const endClamped = clampEnd(period.end, today);
    const sp = seriesPeriod(period, endClamped);
    const s = buildSeries([{ date: '2026-09-01', key: 'A', value: 1 }], sp, 'day', ['A'], null, (k) => k);
    expect(s.buckets).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
    expect(s.buckets).not.toContain('2026-09-07');
    expect(s.buckets).not.toContain('2026-09-30');
  });
});
