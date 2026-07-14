import { describe, it, expect, vi } from 'vitest';
import { classifyWeather, fetchWeather, computeWeatherJoin, type DayWeather } from '../src/weather.js';
import { computeWeatherJoin as _cwj } from '../src/metrics/weatherjoin.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

function fakeKV() {
  const m = new Map<string, string>();
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async () => {}, list: async () => ({ keys: [] }) };
}

describe('classifyWeather', () => {
  it('maps WMO codes', () => {
    expect(classifyWeather(0)).toBe('晴');
    expect(classifyWeather(3)).toBe('曇');
    expect(classifyWeather(63)).toBe('雨');
    expect(classifyWeather(73)).toBe('雪');
  });
});

describe('fetchWeather', () => {
  it('fetches, parses, and caches', async () => {
    const kv = fakeKV();
    const body = { daily: { time: ['2023-06-10', '2023-06-11'], weathercode: [0, 63], temperature_2m_max: [25, 20], precipitation_sum: [0, 12] } };
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => body }) as unknown as typeof fetch;
    const wx = await fetchWeather(kv, '2023-06-10', '2023-06-11', fetchImpl);
    expect(wx.get('2023-06-10')?.category).toBe('晴');
    expect(wx.get('2023-06-11')?.precip).toBe(12);
    // 2回目はキャッシュから（fetch は呼ばれない）
    const fetch2 = vi.fn() as unknown as typeof fetch;
    const wx2 = await fetchWeather(kv, '2023-06-10', '2023-06-11', fetch2);
    expect((fetch2 as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
    expect(wx2.get('2023-06-11')?.category).toBe('雨');
  });
});

describe('weatherjoin', () => {
  it('computes rainy vs dry average bookings and drop%', () => {
    const p = resolvePeriod('2023', '2024-01-01');
    const recs: HistoryRecord[] = [
      { date: '2023-06-10', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' }, // 晴の日 2件
      { date: '2023-06-10', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' },
      { date: '2023-06-11', course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' }, // 雨の日 1件
    ];
    const wx = new Map<string, DayWeather>([
      ['2023-06-10', { date: '2023-06-10', category: '晴', tempMax: 25, precip: 0 }],
      ['2023-06-11', { date: '2023-06-11', category: '雨', tempMax: 20, precip: 12 }],
    ]);
    const j = _cwj(recs, p, wx);
    expect(j.dryAvg).toBeCloseTo(2);   // 晴/曇 日は 1日で 2件
    expect(j.rainyAvg).toBeCloseTo(1); // 雨/雪 日は 1日で 1件
    expect(j.dropPct).toBeCloseTo(0.5); // (2-1)/2
    expect(computeWeatherJoin).toBe(_cwj); // weather.ts が weatherjoin.ts を re-export していること
  });
});
