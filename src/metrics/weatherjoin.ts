import type { HistoryRecord } from '../types.js';
import { type Period, filterPeriod } from '../period.js';
import type { DayWeather, WxCategory } from '../weather.js';

export interface WeatherJoin {
  rainyAvg: number; dryAvg: number; dropPct: number | null;
  byCategory: { category: WxCategory; days: number; avgBookings: number }[];
}

export function computeWeatherJoin(all: HistoryRecord[], period: Period, wx: Map<string, DayWeather>): WeatherJoin {
  // 日別件数
  const perDay = new Map<string, number>();
  for (const r of filterPeriod(all, period)) perDay.set(r.date, (perDay.get(r.date) ?? 0) + 1);

  const cats: WxCategory[] = ['晴', '曇', '雨', '雪'];
  const agg = new Map<WxCategory, { days: number; bookings: number }>();
  for (const c of cats) agg.set(c, { days: 0, bookings: 0 });

  // 天候データがある日のみ対象（予約0の日も days に数える）
  for (const [date, w] of wx) {
    if (date < period.start || date > period.end) continue;
    const a = agg.get(w.category)!;
    a.days += 1; a.bookings += perDay.get(date) ?? 0;
  }

  const byCategory = cats.map(c => {
    const a = agg.get(c)!;
    return { category: c, days: a.days, avgBookings: a.days ? a.bookings / a.days : 0 };
  });

  const dry = ['晴', '曇'].reduce((s, c) => { const a = agg.get(c as WxCategory)!; return { days: s.days + a.days, bookings: s.bookings + a.bookings }; }, { days: 0, bookings: 0 });
  const rain = ['雨', '雪'].reduce((s, c) => { const a = agg.get(c as WxCategory)!; return { days: s.days + a.days, bookings: s.bookings + a.bookings }; }, { days: 0, bookings: 0 });
  const dryAvg = dry.days ? dry.bookings / dry.days : 0;
  const rainyAvg = rain.days ? rain.bookings / rain.days : 0;
  const dropPct = dryAvg ? (dryAvg - rainyAvg) / dryAvg : null;

  return { rainyAvg, dryAvg, dropPct, byCategory };
}
