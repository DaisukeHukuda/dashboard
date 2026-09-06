import type { NameValue } from './reports.js';
import type { TrafficPoint } from '../metrics/traffic.js';
import { summarizeOverlay } from '../metrics/traffic.js';
import type { InsightGroup } from '../metrics/insights.js';
import { esc, renderInsightGroups } from '../pages.js';
import { renderDonut } from '../charts/donut.js';
import { renderTrendChart } from '../charts/line.js';
import { renderMultiLine } from '../charts/multiline.js';
import type { SeriesData } from '../metrics/series.js';
import { describeSourceMedium } from './sourceLabel.js';

export interface TrafficData {
  channels: NameValue[]; sourceMedium: NameValue[]; topPages: NameValue[];
  devices: NameValue[]; regions: NameValue[]; overlay: TrafficPoint[];
  insights: InsightGroup[]; connected: boolean;
  sourceSeries: SeriesData | null; pageSeries: SeriesData | null;
  unavailable?: boolean;
}

function nvTable(rows: NameValue[], head: string, describe?: (label: string) => string, valueLabel = 'セッション'): string {
  const body = rows.map(r => {
    const desc = describe ? describe(r.label) : '';
    const note = desc ? `<div style="font-size:11px;color:var(--muted);margin-top:1px">${esc(desc)}</div>` : '';
    return `<tr><td style="padding:4px 10px">${esc(r.label.slice(0, 30))}${note}</td><td style="padding:4px 10px;text-align:right;vertical-align:top">${r.sessions}</td></tr>`;
  }).join('');
  return `<table style="font-size:13px;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:2px 10px">${esc(head)}</th><th style="padding:2px 10px">${esc(valueLabel)}</th></tr></thead><tbody>${body}</tbody></table>`;
}

// 注記は実データ（sd.series）から生成する：その他を除いた系列数と、その他の有無で文言を組み立てる。
// データが無ければ（null、またはbuckets/seriesが0件）注記もグラフも出さない。
const seriesBlock = (sd: SeriesData | null, granLabel: string, unitLabel: string): string => {
  if (!sd || sd.buckets.length === 0 || sd.series.length === 0) return '';
  const hasOther = sd.series.some(s => s.name === 'その他');
  const n = sd.series.length - (hasOther ? 1 : 0);
  const note = `上位${n}件${hasOther ? '＋その他' : ''}の${unitLabel}推移（${granLabel}）`;
  return `<p style="font-size:11px;color:var(--muted);margin:0 0 4px">${esc(note)}</p>${renderMultiLine(sd)}`;
};

export function renderTrafficSection(d: TrafficData, periodNote: string, granLabel = '月次'): string {
  if (!d.connected) {
    if (d.unavailable) {
      return `<div class="card"><h2>Web流入（GA4）</h2><p style="font-size:13px;color:var(--muted)">GA4のデータを一時的に取得できませんでした。再読み込みで回復することが多いです。</p></div>`;
    }
    return `<div class="card"><h2>Web流入（GA4）</h2><p style="font-size:13px;color:var(--muted)">GA4は未接続です。プロパティ312598868の閲覧権限とSecret設定後に表示されます。</p></div>`;
  }
  // 重ね描きは既存 renderTrendChart を流用：棒=セッション相当としてTrendPoint化（revenue枠にsessions、bookingsをそのまま）
  const trend = d.overlay.map(o => ({ bucket: o.bucket, label: o.bucket, bookings: o.bookings, revenue: o.sessions }));
  const insights = renderInsightGroups(d.insights);
  const sum = summarizeOverlay(d.overlay);
  const fmt1 = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}件`;
  const mini = (label: string, value: string) =>
    `<div style="flex:1;min-width:120px;background:#f8fafc;border:1px solid var(--line);border-radius:8px;padding:8px 10px"><div style="font-size:11px;color:var(--muted)">${esc(label)}</div><div style="font-size:18px;font-weight:700">${esc(value)}</div></div>`;
  const overlayCard = `<div class="card"><h2>サイト訪問と参加の推移（棒=サイト訪問数 / 線=参加件数）</h2>
<p style="font-size:13px;color:var(--muted);margin:0 0 10px">棒はWebサイトへの訪問数（GA4セッション）、線は同じ月にツアーに参加した件数です。訪問が増えているのに参加が伸びない月は、サイトの中身や予約導線に改善余地があるサインです。※参加件数は参加日ベースのため申込みの月とはズレます。合計と比率はGA4の計測データがある月のみで算出しています。予約完了はアソビュー側で行われるためGA4では追跡できず、厳密な因果ではなく目安です。</p>
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${mini('サイト訪問数', sum.sessions.toLocaleString('ja-JP'))}${mini('参加件数', `${sum.bookings.toLocaleString('ja-JP')}件`)}${mini('訪問100件あたりの参加件数', fmt1(sum.per100))}</div>
${renderTrendChart(trend)}</div>`;
  return `<div class="card"><h2>Web流入（GA4）インサイト<span class="p-note">対象: ${periodNote}</span></h2>${insights}</div>
<div class="card"><h2>流入チャネル構成</h2>${renderDonut(d.channels)}</div>
${overlayCard}
<div class="card"><h2>参照元/メディア Top</h2>${seriesBlock(d.sourceSeries, granLabel, 'セッション')}${nvTable(d.sourceMedium, '参照元/メディア', describeSourceMedium)}</div>
<div class="card"><h2>人気ページ Top</h2>${seriesBlock(d.pageSeries, granLabel, '表示回数')}${nvTable(d.topPages, 'ページ', undefined, '表示回数')}</div>
<div class="card"><h2>デバイス・地域</h2><div style="display:flex;gap:24px;flex-wrap:wrap">${nvTable(d.devices, 'デバイス')}${nvTable(d.regions, '地域')}</div></div>`;
}
