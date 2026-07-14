import type { NameValue } from './reports.js';
import type { TrafficPoint } from '../metrics/traffic.js';
import { esc } from '../pages.js';
import { renderDonut } from '../charts/donut.js';
import { renderTrendChart } from '../charts/line.js';

export interface TrafficData {
  channels: NameValue[]; sourceMedium: NameValue[]; topPages: NameValue[];
  devices: NameValue[]; regions: NameValue[]; overlay: TrafficPoint[];
  insights: string[]; connected: boolean;
}

function nvTable(rows: NameValue[], head: string): string {
  const body = rows.map(r => `<tr><td style="padding:2px 10px">${esc(r.label.slice(0, 30))}</td><td style="padding:2px 10px;text-align:right">${r.sessions}</td></tr>`).join('');
  return `<table style="font-size:13px;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:2px 10px">${esc(head)}</th><th style="padding:2px 10px">セッション</th></tr></thead><tbody>${body}</tbody></table>`;
}

export function renderTrafficSection(d: TrafficData): string {
  if (!d.connected) {
    return `<div class="card"><h2>Web流入（GA4）</h2><p style="font-size:13px;color:var(--muted)">GA4は未接続です。プロパティ312598868の閲覧権限とSecret設定後に表示されます。</p></div>`;
  }
  // 重ね描きは既存 renderTrendChart を流用：棒=セッション相当としてTrendPoint化（revenue枠にsessions、bookingsをそのまま）
  const trend = d.overlay.map(o => ({ bucket: o.bucket, label: o.bucket, bookings: o.bookings, revenue: o.sessions }));
  const insights = d.insights.map(s => `<li style="margin:4px 0">${esc(s)}</li>`).join('');
  return `<div class="card"><h2>Web流入（GA4）インサイト</h2><ul style="margin:0;padding-left:18px;font-size:14px">${insights}</ul></div>
<div class="card"><h2>流入チャネル構成</h2>${renderDonut(d.channels)}</div>
<div class="card"><h2>認知→予約（棒=セッション / 線=予約件数）</h2>${renderTrendChart(trend)}</div>
<div class="card"><h2>参照元/メディア Top</h2>${nvTable(d.sourceMedium, '参照元/メディア')}</div>
<div class="card"><h2>人気ページ Top</h2>${nvTable(d.topPages, 'ページ')}</div>
<div class="card"><h2>デバイス・地域</h2><div style="display:flex;gap:24px;flex-wrap:wrap">${nvTable(d.devices, 'デバイス')}${nvTable(d.regions, '地域')}</div></div>`;
}
