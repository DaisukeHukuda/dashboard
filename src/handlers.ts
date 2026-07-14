import type { Env } from './index.js';
import { createSession, constantEquals } from './auth.js';
import { loginPage, renderDashboard } from './pages.js';
import { getHistory } from './data.js';
import { resolvePeriod } from './period.js';
import { jstToday } from './util.js';
import { computeKpi } from './metrics/kpi.js';
import { computeTrend, priorYearSeries } from './metrics/trend.js';
import { computeHeatmap, courseList } from './metrics/heatmap.js';
import { computeCohorts } from './metrics/cohort.js';
import { computeCourseBreakdown } from './metrics/course.js';
import { fetchWeather } from './weather.js';
import { computeWeatherJoin } from './metrics/weatherjoin.js';
import type { WeatherJoin } from './metrics/weatherjoin.js';
import { buildInsights } from './metrics/insights.js';
import type { WxCategory } from './weather.js';
type WeatherJoinCat = { category: WxCategory; days: number; avgBookings: number };

const SESSION_TTL = 7 * 24 * 3600;
const html = (s: string, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });

export async function handleLogin(req: Request, env: Env): Promise<Response> {
  const form = await req.formData();
  const username = String(form.get('username') ?? '');
  const password = String(form.get('password') ?? '');
  const ok = constantEquals(username, env.ADMIN_USER) && constantEquals(password, env.ADMIN_PASSWORD);
  if (!ok) return html(loginPage('ユーザー名またはパスワードが違います'), 401);
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const token = await createSession({ username, exp }, env.SESSION_SECRET);
  return new Response(null, {
    status: 302,
    headers: {
      location: '/',
      'set-cookie': `sess=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`,
    },
  });
}

export function handleLogout(): Response {
  return new Response(null, {
    status: 302,
    headers: { location: '/', 'set-cookie': 'sess=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0' },
  });
}

export async function handleHome(url: URL, env: Env, _username: string): Promise<Response> {
  const period = resolvePeriod(url.searchParams.get('period'), jstToday());
  const selectedCourse = url.searchParams.get('course') ?? '';
  const gran = url.searchParams.get('g') === 'week' ? 'week' : 'month';

  const all = await getHistory(env.DATA);
  const kpi = computeKpi(all, period);
  const trend = computeTrend(all, period, gran);
  const trendPrior = priorYearSeries(all, period, gran, trend);
  const heatmap = computeHeatmap(all, period, selectedCourse || undefined);
  const courses = courseList(all, period);
  const cohorts = computeCohorts(all, 12);
  const courseRows = computeCourseBreakdown(all, period);

  // 天候は失敗してもダッシュボードは描画する
  let weather: WeatherJoin = { rainyAvg: 0, dryAvg: 0, dropPct: null, byCategory: [] as WeatherJoinCat[] };
  try {
    const wx = await fetchWeather(env.DASH, period.start, period.end);
    weather = computeWeatherJoin(all, period, wx);
  } catch { /* 天候取得失敗時は空表示 */ }

  const insights = buildInsights({ kpi, heatmap, weather, trend });

  return html(renderDashboard({
    period, kpi, trend, heatmap, courses, selectedCourse, cohorts, courseRows, weather, insights, granularity: gran, trendPrior,
  }));
}
