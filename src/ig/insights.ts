import type { IgMedia, IgPostRow, IgSeriesPoint } from './types.js';
import type { SocialPoint } from '../metrics/social.js';
import { jstDateOfIso } from '../metrics/social.js';
import { type Period, inPeriod } from '../period.js';
import { daysBetweenYmd } from '../util.js';
import { summarizeFollowers } from './followerStats.js';
import type { InsightGroup, InsightItem } from '../metrics/insights.js';

const num = (n: number) => Math.round(n).toLocaleString('ja-JP');
const signedNum = (n: number) => `${n >= 0 ? '+' : ''}${num(n)}`;
const signedDecimal1 = (n: number) => { const r = Math.round(n * 10) / 10; return `${r >= 0 ? '+' : ''}${r.toFixed(1)}`; };
const mmdd = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;

const TYPE_JA: Record<string, string> = { IMAGE: '画像', VIDEO: '動画（リール）', CAROUSEL_ALBUM: 'カルーセル' };
const typeLabel = (t: string) => TYPE_JA[t] ?? t;

export function buildIgInsights(input: {
  period: Period;
  followers: { date: string; count: number }[];
  reach: IgSeriesPoint[];
  posts: IgPostRow[];
  media: IgMedia[];
  overlay: SocialPoint[];
}): InsightGroup[] {
  const { period, followers, reach, posts, media, overlay } = input;
  const groups: InsightGroup[] = [];

  // 1. フォロワー
  { const fs = summarizeFollowers(followers);
    if (fs.current !== null) {
      const items: InsightItem[] = [];
      if (fs.sinceStart !== null && fs.startDate !== null) {
        let hint: string | undefined;
        if (fs.perDay !== null) {
          hint = fs.perDay >= 1 ? '→ 緩やかに増加' : fs.perDay <= -0.5 ? '→ 減少傾向' : '→ ほぼ横ばい';
        }
        const perDayTxt = fs.perDay === null ? '—' : signedDecimal1(fs.perDay);
        items.push({ text: `現在 ${num(fs.current)}人。蓄積開始（${fs.startDate}）から ${signedNum(fs.sinceStart)}人（1日あたり ${perDayTxt}）`, hint });
      } else {
        items.push({ text: `現在 ${num(fs.current)}人` });
      }
      groups.push({ title: 'フォロワー', items });
    } }

  // 2. リーチ
  { const n = reach.length;
    if (n >= 4) {
      const items: InsightItem[] = [];
      const sum = reach.reduce((s, p) => s + p.value, 0);
      const avg = Math.round(sum / n);
      items.push({ text: `直近${n}日 計${num(sum)}（1日平均 ${num(avg)}）` });
      let maxIdx = 0;
      for (let i = 1; i < n; i++) if (reach[i].value > reach[maxIdx].value) maxIdx = i;
      const half = Math.floor(n / 2);
      const front = reach.slice(0, half);
      const back = reach.slice(half);
      const frontAvg = front.length ? front.reduce((s, p) => s + p.value, 0) / front.length : 0;
      const backAvg = back.length ? back.reduce((s, p) => s + p.value, 0) / back.length : 0;
      let hint: string | undefined;
      if (frontAvg > 0) {
        const ratio = backAvg / frontAvg;
        hint = ratio >= 1.15 ? '→ 直近の投稿が届いている' : ratio <= 0.85 ? '→ 直近はリーチが落ちている' : undefined;
      } else if (backAvg > 0) {
        hint = '→ 直近の投稿が届いている';
      }
      items.push({ text: `最大は ${mmdd(reach[maxIdx].date)}（${num(reach[maxIdx].value)}）`, hint });
      groups.push({ title: 'リーチ', items });
    } }

  // 3. 投稿
  { if (media.length > 0) {
      const inWindow = media.filter(m => inPeriod(jstDateOfIso(m.timestamp), period));
      const count = inWindow.length;
      const items: InsightItem[] = [];
      let weekly = '';
      if (count > 0) {
        const oldest = inWindow.reduce((a, b) => (jstDateOfIso(b.timestamp) < jstDateOfIso(a.timestamp) ? b : a));
        const days = daysBetweenYmd(jstDateOfIso(oldest.timestamp), period.end);
        if (days >= 7) {
          const rate = count / (days / 7);
          weekly = `（週 ${rate.toFixed(1)}件）`;
        }
      }
      items.push({ text: `期間内の投稿 ${count}件${weekly}` });
      const withReach = posts.filter(p => p.reach > 0);
      if (withReach.length > 0) {
        const savedSum = withReach.reduce((s, p) => s + p.saved, 0);
        const reachSum = withReach.reduce((s, p) => s + p.reach, 0);
        const rate = Math.round((savedSum / reachSum) * 1000) / 10;
        const hint = rate >= 3 ? '→ 保存が多く、行き先候補として残されている' : undefined;
        items.push({ text: `保存率 ${rate.toFixed(1)}%（最新12投稿）`, hint });
      }
      if (posts.length > 0) {
        const top = posts.reduce((a, b) => (b.engagement > a.engagement ? b : a));
        const cap = top.caption ? `「${[...top.caption].slice(0, 20).join('')}」` : '(キャプションなし)';
        items.push({ text: `最新12投稿で最高は${cap}（いいね${top.likes}/保存${top.saved}）` });
      }
      groups.push({ title: '投稿', items });
    } }

  // 4. 投稿×参加
  { if (overlay.length >= 6) {
      const sortedPosts = [...overlay.map(o => o.posts)].sort((a, b) => a - b);
      const median = sortedPosts[Math.floor(sortedPosts.length / 2)];
      const high = overlay.filter(o => o.posts >= median);
      const low = overlay.filter(o => o.posts < median);
      if (high.length > 0 && low.length > 0) {
        const items: InsightItem[] = [];
        const highAvg = Math.round(high.reduce((s, o) => s + o.bookings, 0) / high.length);
        const lowAvg = Math.round(low.reduce((s, o) => s + o.bookings, 0) / low.length);
        const corrHint = '→ 投稿量と参加に相関の傾向（季節の影響もあるため因果ではなく目安）';
        const hint = lowAvg > 0 ? (highAvg >= lowAvg * 1.2 ? corrHint : undefined)
          : (highAvg > 0 ? corrHint : undefined);
        items.push({ text: `投稿が多い月の参加は平均 ${highAvg}件、少ない月は ${lowAvg}件`, hint });
        groups.push({ title: '投稿×参加', items });
      }
    } }

  // 5. 投稿タイプ
  { if (media.length > 0) {
      const counts = new Map<string, number>();
      for (const m of media) counts.set(m.mediaType, (counts.get(m.mediaType) ?? 0) + 1);
      const order = Object.keys(TYPE_JA); // 既知の順序（未知種別はこの順序を優先しつつ末尾へ）
      const knownFirst = [...counts.keys()].sort((a, b) => {
        const ia = order.indexOf(a); const ib = order.indexOf(b);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
      const entries = knownFirst.map(t => ({ type: t, count: counts.get(t)! }));
      entries.sort((a, b) => b.count - a.count);
      const items: InsightItem[] = [];
      const withCount = (label: string, n: number) => `${label} ${n}件`;
      items.push({ text: entries.map(e => withCount(typeLabel(e.type), e.count)).join('・') });
      const reachByType = new Map<string, { sum: number; n: number }>();
      for (const p of posts) {
        if (p.reach <= 0) continue;
        const cur = reachByType.get(p.mediaType) ?? { sum: 0, n: 0 };
        cur.sum += p.reach; cur.n += 1;
        reachByType.set(p.mediaType, cur);
      }
      const avgEntries = [...reachByType.entries()].map(([type, v]) => ({ type, avg: v.sum / v.n, n: v.n }));
      if (avgEntries.length > 0) {
        avgEntries.sort((a, b) => b.avg - a.avg);
        const top = avgEntries[0];
        const txt = avgEntries.map(e => `${typeLabel(e.type)} ${num(e.avg)}`).join(' / ');
        const hint = (avgEntries.length >= 2 && top.n >= 2) ? `→ ${typeLabel(top.type)}が最も届いている` : undefined;
        items.push({ text: `平均リーチ: ${txt}`, hint });
      }
      groups.push({ title: '投稿タイプ', items });
    } }

  return groups;
}
