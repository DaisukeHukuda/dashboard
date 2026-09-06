import type { IgSeriesPoint, IgPostRow } from './types.js';
import type { SocialPoint } from '../metrics/social.js';
import { esc } from '../pages.js';
import { renderTrendChart } from '../charts/line.js';
import { renderFollowerChart } from '../charts/followers.js';
import { summarizeFollowers } from './followerStats.js';

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

export function renderSocialSection(d: SocialData, periodNote: string): string {
  if (!d.connected) {
    return `<div class="card"><h2>Instagram（SNS）</h2><p style="font-size:13px;color:var(--muted)">Instagramは未接続です。Facebookアプリの長期トークン（IG_ACCESS_TOKEN）とIG_USER_IDの設定後に表示されます。</p></div>`;
  }
  const overlayTp = d.overlay.map(o => ({ bucket: o.bucket, label: o.bucket, bookings: o.bookings, revenue: o.posts }));
  const postRows = d.posts.slice(0, 10).map(p =>
    `<tr><td style="padding:2px 10px">${esc((p.caption || '(なし)').slice(0, 24))}</td><td style="padding:2px 10px;text-align:right">${p.reach}</td><td style="padding:2px 10px;text-align:right">${p.likes}</td><td style="padding:2px 10px;text-align:right">${p.comments}</td><td style="padding:2px 10px;text-align:right">${p.saved}</td></tr>`
  ).join('');
  const insights = d.insights.map(s => `<li style="margin:4px 0">${esc(s)}</li>`).join('');
  const fs = summarizeFollowers(d.followers);
  const signed = (n: number | null) => n === null ? '—' : `${n > 0 ? '+' : ''}${n.toLocaleString('ja-JP')}`;
  const mini = (label: string, value: string) => `<div style="flex:1;min-width:120px;background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:8px 10px"><div style="font-size:11px;color:var(--muted)">${esc(label)}</div><div style="font-size:18px;font-weight:700">${esc(value)}</div></div>`;
  return `<div class="card"><h2>Instagram（SNS）インサイト</h2><ul style="margin:0;padding-left:18px;font-size:14px">${insights}</ul></div>
<div class="card"><h2>フォロワー推移<span class="p-note">毎日1:00に自動記録（9/6以前は閲覧日のみ）</span></h2>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${mini('現在', fs.current === null ? '—' : `${fs.current.toLocaleString('ja-JP')}人`)}${mini('蓄積開始からの増減', signed(fs.sinceStart))}${mini('直近30日の増減', signed(fs.last30))}</div>
${renderFollowerChart(d.followers)}</div>
<div class="card"><h2>リーチ推移<span class="p-note">対象: 期間末尾の最大30日</span></h2>${seriesChart(d.reach)}</div>
<div class="card"><h2>投稿 × 予約（棒=投稿数 / 線=予約件数）<span class="p-note">対象: ${periodNote}（投稿は最新25件の範囲）</span></h2>${renderTrendChart(overlayTp)}</div>
<div class="card"><h2>投稿別エンゲージメント Top<span class="p-note">対象: 最新12投稿（上位10件）</span></h2>
<table style="font-size:13px;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:2px 10px">投稿</th><th style="padding:2px 10px">リーチ</th><th style="padding:2px 10px">いいね</th><th style="padding:2px 10px">コメント</th><th style="padding:2px 10px">保存</th></tr></thead><tbody>${postRows}</tbody></table></div>`;
}
