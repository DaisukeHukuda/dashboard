import type { IgSeriesPoint, IgPostRow } from './types.js';
import type { SocialPoint } from '../metrics/social.js';
import { esc } from '../pages.js';
import { renderTrendChart } from '../charts/line.js';

export interface SocialData {
  followers: { date: string; count: number }[];
  reach: IgSeriesPoint[];
  posts: IgPostRow[];
  overlay: SocialPoint[];
  insights: string[];
  connected: boolean;
}

// {date,value}[] を折れ線用の TrendPoint（bookings=線）に載せる簡易再利用
function seriesChart(points: { date: string; value: number }[]): string {
  const tp = points.map(p => ({ bucket: p.date, label: p.date, bookings: p.value, revenue: 0 }));
  return renderTrendChart(tp);
}

export function renderSocialSection(d: SocialData): string {
  if (!d.connected) {
    return `<div class="card"><h2>Instagram（SNS）</h2><p style="font-size:13px;color:var(--muted)">Instagramは未接続です。Facebookアプリの長期トークン（IG_ACCESS_TOKEN）とIG_USER_IDの設定後に表示されます。</p></div>`;
  }
  const followerTp = d.followers.map(f => ({ bucket: f.date, label: f.date, bookings: f.count, revenue: 0 }));
  const overlayTp = d.overlay.map(o => ({ bucket: o.bucket, label: o.bucket, bookings: o.bookings, revenue: o.posts }));
  const postRows = d.posts.slice(0, 10).map(p =>
    `<tr><td style="padding:2px 10px">${esc((p.caption || '(なし)').slice(0, 24))}</td><td style="padding:2px 10px;text-align:right">${p.reach}</td><td style="padding:2px 10px;text-align:right">${p.likes}</td><td style="padding:2px 10px;text-align:right">${p.comments}</td><td style="padding:2px 10px;text-align:right">${p.saved}</td></tr>`
  ).join('');
  const insights = d.insights.map(s => `<li style="margin:4px 0">${esc(s)}</li>`).join('');
  return `<div class="card"><h2>Instagram（SNS）インサイト</h2><ul style="margin:0;padding-left:18px;font-size:14px">${insights}</ul></div>
<div class="card"><h2>フォロワー推移（蓄積開始以降）</h2>${followerTp.length ? renderTrendChart(followerTp) : '<p style="font-size:13px;color:var(--muted)">まだ蓄積がありません（本日以降）。</p>'}</div>
<div class="card"><h2>リーチ推移</h2>${seriesChart(d.reach)}</div>
<div class="card"><h2>投稿 × 予約（棒=投稿数 / 線=予約件数）</h2>${renderTrendChart(overlayTp)}</div>
<div class="card"><h2>投稿別エンゲージメント Top</h2>
<table style="font-size:13px;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:2px 10px">投稿</th><th style="padding:2px 10px">リーチ</th><th style="padding:2px 10px">いいね</th><th style="padding:2px 10px">コメント</th><th style="padding:2px 10px">保存</th></tr></thead><tbody>${postRows}</tbody></table></div>`;
}
