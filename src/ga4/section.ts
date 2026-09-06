import type { NameValue } from './reports.js';
import type { TrafficPoint } from '../metrics/traffic.js';
import { summarizeOverlay } from '../metrics/traffic.js';
import { esc } from '../pages.js';
import { renderDonut } from '../charts/donut.js';
import { renderTrendChart } from '../charts/line.js';
import { describeSourceMedium } from './sourceLabel.js';

export interface TrafficData {
  channels: NameValue[]; sourceMedium: NameValue[]; topPages: NameValue[];
  devices: NameValue[]; regions: NameValue[]; overlay: TrafficPoint[];
  insights: string[]; connected: boolean;
}

function nvTable(rows: NameValue[], head: string, describe?: (label: string) => string): string {
  const body = rows.map(r => {
    const note = describe ? `<div style="font-size:11px;color:var(--muted);margin-top:1px">${esc(describe(r.label))}</div>` : '';
    return `<tr><td style="padding:4px 10px">${esc(r.label.slice(0, 30))}${note}</td><td style="padding:4px 10px;text-align:right;vertical-align:top">${r.sessions}</td></tr>`;
  }).join('');
  return `<table style="font-size:13px;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:2px 10px">${esc(head)}</th><th style="padding:2px 10px">セッション</th></tr></thead><tbody>${body}</tbody></table>`;
}

export function renderTrafficSection(d: TrafficData, periodNote: string): string {
  if (!d.connected) {
    return `<div class="card"><h2>Web流入（GA4）</h2><p style="font-size:13px;color:var(--muted)">GA4は未接続です。プロパティ312598868の閲覧権限とSecret設定後に表示されます。</p></div>`;
  }
  // 重ね描きは既存 renderTrendChart を流用：棒=セッション相当としてTrendPoint化（revenue枠にsessions、bookingsをそのまま）
  const trend = d.overlay.map(o => ({ bucket: o.bucket, label: o.bucket, bookings: o.bookings, revenue: o.sessions }));
  const insights = d.insights.map(s => `<li style="margin:4px 0">${esc(s)}</li>`).join('');
  const sum = summarizeOverlay(d.overlay);
  const fmt1 = (v: number | null) => v === null ? '—' : v.toFixed(1);
  const mini = (label: string, value: string) =>
    `<div style="flex:1;min-width:120px;background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:8px 10px"><div style="font-size:11px;color:var(--muted)">${esc(label)}</div><div style="font-size:18px;font-weight:700">${esc(value)}</div></div>`;
  const bestLine = sum.best
    ? `<p style="font-size:12px;color:var(--muted);margin:6px 0 0">最も効率が良かった月: ${esc(sum.best.bucket)}（訪問100件あたり ${fmt1(sum.best.per100)}件）</p>`
    : '';
  const overlayCard = `<div class="card"><h2>サイト訪問と予約の推移（棒=サイト訪問数 / 線=予約件数）</h2>
<p style="font-size:13px;color:var(--muted);margin:0 0 10px">棒はWebサイトへの訪問数（GA4セッション）、線は同じ月の予約件数。訪問が増えているのに予約が伸びない月は、サイトの中身や予約導線に改善余地があるサインです。※予約完了はアソビュー側で行われるためGA4では追跡できず、厳密な因果ではなく目安です。</p>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${mini('サイト訪問数', sum.sessions.toLocaleString('ja-JP'))}${mini('予約件数', `${sum.bookings}件`)}${mini('訪問100件あたりの予約件数', `${fmt1(sum.per100)}件`)}</div>
${renderTrendChart(trend)}${bestLine}</div>`;
  return `<div class="card"><h2>Web流入（GA4）インサイト<span class="p-note">対象: ${periodNote}</span></h2><ul style="margin:0;padding-left:18px;font-size:14px">${insights}</ul></div>
<div class="card"><h2>流入チャネル構成</h2>${renderDonut(d.channels)}</div>
${overlayCard}
<div class="card"><h2>参照元/メディア Top</h2>${nvTable(d.sourceMedium, '参照元/メディア', describeSourceMedium)}</div>
<div class="card"><h2>人気ページ Top</h2>${nvTable(d.topPages, 'ページ')}</div>
<div class="card"><h2>デバイス・地域</h2><div style="display:flex;gap:24px;flex-wrap:wrap">${nvTable(d.devices, 'デバイス')}${nvTable(d.regions, '地域')}</div></div>`;
}
