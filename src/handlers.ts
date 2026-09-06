import type { Env } from './index.js';
import { createSession, constantEquals } from './auth.js';
import { loginPage, renderDashboard } from './pages.js';
import { getHistory } from './data.js';
import { resolvePeriod, priorPeriod, alignPriorEnd, type Period } from './period.js';
import { jstToday, addDaysToYmd } from './util.js';
import { computeKpi } from './metrics/kpi.js';
import { computeTrend, priorYearSeries, resolveGranularity } from './metrics/trend.js';
import { computeHeatmap, courseList } from './metrics/heatmap.js';
import { computeCohorts } from './metrics/cohort.js';
import { computeCourseBreakdown } from './metrics/course.js';
import { computeSourceBreakdown } from './metrics/source.js';
import { buildInsights } from './metrics/insights.js';
import { runReport } from './ga4/client.js';
import { getAccessToken } from './ga4/auth.js';
import {
  CHANNEL_SPEC, SOURCE_MEDIUM_SPEC, TOP_PAGES_SPEC, DEVICE_SPEC, REGION_SPEC, DAILY_SESSIONS_SPEC, DAILY_PAGEVIEWS_SPEC,
  toNameValues, toDailySessions, sourceSeriesSpec, pageSeriesSpec, toKeyedDaily, type NameValue,
} from './ga4/reports.js';
import { computeTrafficOverlay } from './metrics/traffic.js';
import { buildGa4Insights } from './ga4/insights.js';
import type { TrafficData } from './ga4/section.js';
import { buildSeries } from './metrics/series.js';
import { distinctSourceNames } from './ga4/sourceLabel.js';
import { pageNameJa } from './ga4/labels.js';
import { igGet } from './ig/client.js';
import { parseInsightSeries, parseMediaList, parseMediaInsights, buildPostRows } from './ig/reports.js';
import { recordFollowerSnapshot, getFollowerSeries, ensureFollowerSnapshot } from './ig/followers.js';
import { computeSocialOverlay } from './metrics/social.js';
import { buildIgInsights } from './ig/insights.js';
import type { SocialData } from './ig/section.js';
import type { IgSeriesPoint, IgPostRow, IgMedia } from './ig/types.js';
import { applyOrder, isValidOrder, resolveView, SECTION_ORDER_KEY } from './sections.js';

const SESSION_TTL = 7 * 24 * 3600;
// 未来日を today にクランプする（GA4/IG は未来日を要求できないため）
export function clampEnd(end: string, today: string): string { return end > today ? today : end; }
// 推移グラフ用に end を endClamped へ差し替えた期間を作る（GA4取得範囲と一致させ、未来日バケットのゼロ埋めを防ぐ）
export function seriesPeriod(period: Period, endClamped: string): Period { return { ...period, end: endClamped }; }
const html = (s: string, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

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
  const view = resolveView(url.searchParams.get('view'));
  const today = jstToday();
  const period = resolvePeriod(url.searchParams.get('period'), today, url.searchParams.get('from'), url.searchParams.get('to'));
  const selectedCourse = url.searchParams.get('course') ?? '';
  const gran = resolveGranularity(url.searchParams.get('g'), period);
  const endClamped = clampEnd(period.end, today); // GA4/IG には未来日を渡さない

  const all = await getHistory(env.DATA);
  const kpi = computeKpi(all, period);
  const trend = computeTrend(all, period, gran);
  const trendPrior = priorYearSeries(all, period, gran, trend);
  const heatmap = computeHeatmap(all, period, selectedCourse || undefined);
  const courses = courseList(all, period);
  const cohorts = computeCohorts(all, 13); // yearLater(+11〜+13)算出のため13ヶ月分まで集計する
  const courseRows = computeCourseBreakdown(all, period);
  const sourceRows = computeSourceBreakdown(all, period);

  const insights = buildInsights({ all, period, kpi, heatmap, trend, courseRows, sourceRows });

  // GA4 未設定/失敗時は Phase 1 を退行させず未接続表示にフォールバック
  const emptyTraffic: TrafficData = { channels: [], sourceMedium: [], topPages: [], devices: [], regions: [], overlay: [], insights: [], connected: false, sourceSeries: null, pageSeries: null };
  let traffic: TrafficData = emptyTraffic;
  if ((view === 'web' || view === 'all') && env.GA4_SA_JSON_B64 && env.GA4_PROPERTY_ID) {
    try {
      await getAccessToken(env);
      const range = { start: period.start, end: endClamped };
      const comparable = period.kind !== 'all';
      const partial = endClamped < period.end; // 当期の終端が今日でクランプされた（期間が完了していない）
      const prevP = priorPeriod(period);
      // 当期が期間途中なら、前期も同じ経過日数で終端を切って揃える（フェアな比較にする）
      const prevAligned = { ...prevP, end: alignPriorEnd(period, prevP, endClamped) };
      const prevRange = { start: prevAligned.start, end: clampEnd(prevAligned.end, today) };
      // 前期3レポートの失敗は比較を省略するだけに留め、当期の描画は継続する
      const [ch, sm, tp, dv, rg, ds, pch, psm, pds] = await Promise.all([
        runReport(env, CHANNEL_SPEC, range), runReport(env, SOURCE_MEDIUM_SPEC, range), runReport(env, TOP_PAGES_SPEC, range),
        runReport(env, DEVICE_SPEC, range), runReport(env, REGION_SPEC, range), runReport(env, DAILY_SESSIONS_SPEC, range),
        comparable ? runReport(env, CHANNEL_SPEC, prevRange).catch(() => null) : Promise.resolve(null),
        comparable ? runReport(env, SOURCE_MEDIUM_SPEC, prevRange).catch(() => null) : Promise.resolve(null),
        comparable ? runReport(env, DAILY_SESSIONS_SPEC, prevRange).catch(() => null) : Promise.resolve(null),
      ]);
      const channels = toNameValues(ch), devices = toNameValues(dv), regions = toNameValues(rg), topPages = toNameValues(tp), sourceMedium = toNameValues(sm);
      const dailySessions = toDailySessions(ds); // 1回だけ計算して以下で再利用する
      const overlay = computeTrafficOverlay(all, period, dailySessions);
      const prevOverlay = pds ? computeTrafficOverlay(all, prevAligned, toDailySessions(pds)) : null;

      // 第2段：参照元/人気ページの上位5件（sessions降順）について日次の推移を取得する（上位0件なら取得しない）
      const top5 = (rows: NameValue[]) => [...rows].sort((a, b) => b.sessions - a.sessions).slice(0, 5).map(r => r.label);
      const srcTop = top5(sourceMedium), pageTop = top5(topPages);
      const [srcRows, pageRows, dailyPv] = await Promise.all([
        srcTop.length ? runReport(env, sourceSeriesSpec(srcTop), range).catch(() => null) : Promise.resolve(null),
        pageTop.length ? runReport(env, pageSeriesSpec(pageTop), range).catch(() => null) : Promise.resolve(null),
        pageTop.length ? runReport(env, DAILY_PAGEVIEWS_SPEC, range).catch(() => null) : Promise.resolve(null),
      ]);
      // GA4取得範囲（endClamped）と一致させ、未来日バケットがゼロ埋めされないようにする
      const spPeriod = seriesPeriod(period, endClamped);
      const dailyTotals = dailySessions.map(d => ({ date: d.date, value: d.sessions }));
      const emptyToNull = (sd: ReturnType<typeof buildSeries> | null) => sd && sd.buckets.length > 0 ? sd : null;
      const sourceSeries = srcRows ? emptyToNull(buildSeries(toKeyedDaily(srcRows), spPeriod, gran, srcTop, dailyTotals, distinctSourceNames(srcTop))) : null;
      const pageSeries = pageRows
        ? emptyToNull(buildSeries(toKeyedDaily(pageRows), spPeriod, gran, pageTop, dailyPv ? toDailySessions(dailyPv).map(d => ({ date: d.date, value: d.sessions })) : null, pageNameJa))
        : null;

      traffic = { channels, sourceMedium, topPages, devices, regions, overlay, sourceSeries, pageSeries,
        insights: buildGa4Insights({ period, channels, prevChannels: pch ? toNameValues(pch) : null, sourceMedium, prevSourceMedium: psm ? toNameValues(psm) : null, devices, regions, topPages, overlay, prevOverlay, partial }),
        connected: true };
    } catch { traffic = { ...emptyTraffic, unavailable: true }; }
  }

  // 表示ビューに関係なく、その日まだ記録が無ければフォロワー数だけ1回取得して記録する（取りこぼし防止）
  if (env.IG_ACCESS_TOKEN && env.IG_USER_ID) {
    try { await ensureFollowerSnapshot(env); } catch { /* 記録失敗は表示に影響させない */ }
  }

  // IG 未設定/失敗時は Phase 1/2 を退行させず未接続表示にフォールバック
  const emptySocial: SocialData = { followers: [], reach: [], posts: [], overlay: [], insights: [], connected: false };
  let social: SocialData = emptySocial;
  if ((view === 'sns' || view === 'all') && env.IG_ACCESS_TOKEN && env.IG_USER_ID) {
    try {
      const uid = env.IG_USER_ID;
      // アカウント取得＝接続判定。ここが失敗したら本当に未接続（外側catchでemptySocialに落ちる）
      const acct = await igGet(env, uid, { fields: 'followers_count' }) as { followers_count?: number };
      if (typeof acct.followers_count === 'number') await recordFollowerSnapshot(env, acct.followers_count, jstToday());
      const followers = await getFollowerSeries(env);

      // リーチは独立して失敗を吸収（失敗しても接続は維持）。期間は<=30日にクランプ（IG insightsの制限）
      let reach: IgSeriesPoint[] = [];
      try {
        const reachSince = period.start > addDaysToYmd(endClamped, -29) ? period.start : addDaysToYmd(endClamped, -29);
        const reachJson = await igGet(env, `${uid}/insights`, { metric: 'reach', period: 'day', since: reachSince, until: endClamped });
        reach = parseInsightSeries(reachJson, 'reach');
      } catch { /* reach失敗は無視（他は表示） */ }

      // 投稿一覧＋上位insightsも独立
      let posts: IgPostRow[] = [];
      let media: IgMedia[] = [];
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
      social = { followers, reach, posts, overlay, insights: buildIgInsights({ period: seriesPeriod(period, endClamped), followers, reach, posts, media, overlay }), connected: true };
    } catch { social = emptySocial; }
  }

  let sectionOrder = applyOrder(null);
  try {
    const rawOrder = await env.DASH.get(SECTION_ORDER_KEY);
    if (rawOrder) sectionOrder = applyOrder(JSON.parse(rawOrder));
  } catch { /* 並び順が読めなくても既定順で表示する */ }

  return html(renderDashboard({
    period, kpi, trend, heatmap, courses, selectedCourse, cohorts, courseRows, sourceRows, insights, granularity: gran, trendPrior, traffic, social, sectionOrder, view,
  }));
}

export async function handleSectionOrder(req: Request, env: Env): Promise<Response> {
  let body: unknown;
  try { body = await req.json(); } catch { return json({ ok: false }, 400); }
  const order = (body as { order?: unknown } | null)?.order;
  if (!isValidOrder(order)) return json({ ok: false }, 400);
  await env.DASH.put(SECTION_ORDER_KEY, JSON.stringify(order));
  return json({ ok: true });
}
