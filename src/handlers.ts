import type { Env } from './index.js';
import { createSession, constantEquals } from './auth.js';
import { loginPage, renderDashboard } from './pages.js';
import { getHistory } from './data.js';
import { resolvePeriod } from './period.js';
import { jstToday, addDaysToYmd } from './util.js';
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
import { runReport } from './ga4/client.js';
import { getAccessToken } from './ga4/auth.js';
import { CHANNEL_SPEC, SOURCE_MEDIUM_SPEC, TOP_PAGES_SPEC, DEVICE_SPEC, REGION_SPEC, DAILY_SESSIONS_SPEC, toNameValues, toDailySessions } from './ga4/reports.js';
import { computeTrafficOverlay } from './metrics/traffic.js';
import { buildGa4Insights } from './ga4/insights.js';
import type { TrafficData } from './ga4/section.js';
import { igGet } from './ig/client.js';
import { parseInsightSeries, parseMediaList, parseMediaInsights, buildPostRows } from './ig/reports.js';
import { recordFollowerSnapshot, getFollowerSeries } from './ig/followers.js';
import { computeSocialOverlay } from './metrics/social.js';
import { buildIgInsights } from './ig/insights.js';
import type { SocialData } from './ig/section.js';
import type { IgSeriesPoint, IgPostRow } from './ig/types.js';
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

  // GA4 未設定/失敗時は Phase 1 を退行させず未接続表示にフォールバック
  const emptyTraffic: TrafficData = { channels: [], sourceMedium: [], topPages: [], devices: [], regions: [], overlay: [], insights: [], connected: false };
  let traffic: TrafficData = emptyTraffic;
  if (env.GA4_SA_JSON_B64 && env.GA4_PROPERTY_ID) {
    try {
      await getAccessToken(env);
      const range = { start: period.start, end: period.end };
      const [ch, sm, tp, dv, rg, ds] = await Promise.all([
        runReport(env, CHANNEL_SPEC, range),
        runReport(env, SOURCE_MEDIUM_SPEC, range),
        runReport(env, TOP_PAGES_SPEC, range),
        runReport(env, DEVICE_SPEC, range),
        runReport(env, REGION_SPEC, range),
        runReport(env, DAILY_SESSIONS_SPEC, range),
      ]);
      const channels = toNameValues(ch), devices = toNameValues(dv);
      const overlay = computeTrafficOverlay(all, period, toDailySessions(ds));
      traffic = {
        channels, sourceMedium: toNameValues(sm), topPages: toNameValues(tp),
        devices, regions: toNameValues(rg), overlay,
        insights: buildGa4Insights({ channels, devices, overlay }),
        connected: true,
      };
    } catch { traffic = emptyTraffic; }
  }

  // IG 未設定/失敗時は Phase 1/2 を退行させず未接続表示にフォールバック
  const emptySocial: SocialData = { followers: [], reach: [], posts: [], overlay: [], insights: [], connected: false };
  let social: SocialData = emptySocial;
  if (env.IG_ACCESS_TOKEN && env.IG_USER_ID) {
    try {
      const uid = env.IG_USER_ID;
      // アカウント取得＝接続判定。ここが失敗したら本当に未接続（外側catchでemptySocialに落ちる）
      const acct = await igGet(env, uid, { fields: 'followers_count' }) as { followers_count?: number };
      if (typeof acct.followers_count === 'number') await recordFollowerSnapshot(env, acct.followers_count, jstToday());
      const followers = await getFollowerSeries(env);

      // リーチは独立して失敗を吸収（失敗しても接続は維持）。期間は<=30日にクランプ（IG insightsの制限）
      let reach: IgSeriesPoint[] = [];
      try {
        const reachSince = period.start > addDaysToYmd(period.end, -29) ? period.start : addDaysToYmd(period.end, -29);
        const reachJson = await igGet(env, `${uid}/insights`, { metric: 'reach', period: 'day', since: reachSince, until: period.end });
        reach = parseInsightSeries(reachJson, 'reach');
      } catch { /* reach失敗は無視（他は表示） */ }

      // 投稿一覧＋上位insightsも独立
      let posts: IgPostRow[] = [];
      let media: { timestamp: string }[] = [];
      try {
        const mediaJson = await igGet(env, `${uid}/media`, { fields: 'id,caption,timestamp,media_type,permalink', limit: '25' });
        const mediaList = parseMediaList(mediaJson);
        media = mediaList;
        const top = mediaList.slice(0, 12);
        const pairs = await Promise.all(top.map(async m => {
          try { return [m.id, parseMediaInsights(await igGet(env, `${m.id}/insights`, { metric: 'reach,likes,comments,saved' }))] as const; }
          catch { return null; }
        }));
        const insightsById: Record<string, { reach: number; likes: number; comments: number; saved: number }> = {};
        for (const p of pairs) if (p) insightsById[p[0]] = p[1];
        posts = buildPostRows(mediaList, insightsById);
      } catch { /* media失敗は無視 */ }

      const overlay = computeSocialOverlay(all, period, media);
      social = { followers, reach, posts, overlay, insights: buildIgInsights({ followers, posts, overlay }), connected: true };
    } catch { social = emptySocial; }
  }

  return html(renderDashboard({
    period, kpi, trend, heatmap, courses, selectedCourse, cohorts, courseRows, weather, insights, granularity: gran, trendPrior, traffic, social,
  }));
}
