import type { KV } from './kv.js';

export type WxCategory = '晴' | '曇' | '雨' | '雪';
export interface DayWeather { date: string; category: WxCategory; tempMax: number; precip: number; }

// WMO weather code → 大分類
export function classifyWeather(code: number): WxCategory {
  if (code === 0 || code === 1) return '晴';
  if (code === 2 || code === 3 || (code >= 45 && code <= 48)) return '曇';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return '雪';
  return '雨'; // 51-67, 80-82, 95-99 等
}

const LAT = 36.73, LON = 139.48;
const CACHE_TTL = 30 * 24 * 3600;

export async function fetchWeather(kv: KV, start: string, end: string, fetchImpl: typeof fetch = fetch): Promise<Map<string, DayWeather>> {
  const cacheKey = `wx:${start}:${end}`;
  const cached = await kv.get(cacheKey);
  if (cached) return new Map(Object.entries(JSON.parse(cached) as Record<string, DayWeather>));

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}`
    + `&start_date=${start}&end_date=${end}`
    + `&daily=weathercode,temperature_2m_max,precipitation_sum&timezone=Asia%2FTokyo`;
  const resp = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  if (!resp.ok) throw new Error(`weather fetch failed: HTTP ${resp.status}`);
  const body = await resp.json() as { daily?: { time: string[]; weathercode: number[]; temperature_2m_max: number[]; precipitation_sum: number[] } };
  const d = body.daily;
  const out: Record<string, DayWeather> = {};
  if (d) {
    for (let i = 0; i < d.time.length; i++) {
      out[d.time[i]] = { date: d.time[i], category: classifyWeather(d.weathercode[i]), tempMax: d.temperature_2m_max[i], precip: d.precipitation_sum[i] };
    }
  }
  await kv.put(cacheKey, JSON.stringify(out), { expirationTtl: CACHE_TTL });
  return new Map(Object.entries(out));
}

// re-export（呼び出し側の利便）
export { computeWeatherJoin } from './metrics/weatherjoin.js';
