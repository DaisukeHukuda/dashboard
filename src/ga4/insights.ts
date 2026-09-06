import type { NameValue } from './reports.js';
import type { TrafficPoint } from '../metrics/traffic.js';
import { summarizeOverlay } from '../metrics/traffic.js';
import type { InsightGroup, InsightItem } from '../metrics/insights.js';
import { type Period, comparisonLabel, spanDays } from '../period.js';
import { channelNameJa, regionNameJa, pageNameJa } from './labels.js';
import { isInstagramSource, isAsoviewSource } from './sourceLabel.js';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const signedPct = (ratio: number) => { const d = Math.round((ratio - 1) * 100); return d === 0 ? '±0%' : `${d > 0 ? '+' : ''}${d}%`; };
const signedPt = (d: number) => { const r = Math.round(d); return r === 0 ? '±0pt' : `${r > 0 ? '+' : ''}${r}pt`; };
const jaMonth = (ym: string) => `${Number(ym.slice(0, 4))}年${Number(ym.slice(5, 7))}月`;
const sum = (rows: NameValue[]) => rows.reduce((a, r) => a + r.sessions, 0);
const share = (rows: NameValue[], pred: (label: string) => boolean) => { const t = sum(rows); return t > 0 ? rows.filter(r => pred(r.label)).reduce((a, r) => a + r.sessions, 0) / t : 0; };
const ch = (l: string, ...names: string[]) => names.includes(channelNameJa(l));

export function buildGa4Insights(input: { period: Period; channels: NameValue[]; prevChannels: NameValue[] | null; sourceMedium: NameValue[]; prevSourceMedium: NameValue[] | null; devices: NameValue[]; regions: NameValue[]; topPages: NameValue[]; overlay: TrafficPoint[]; prevOverlay: TrafficPoint[] | null; partial?: boolean }): InsightGroup[] {
  const { period, channels, prevChannels, sourceMedium, prevSourceMedium, devices, regions, topPages, overlay, prevOverlay, partial = false } = input;
  const cmp = comparisonLabel(period);
  const groups: InsightGroup[] = [];
  const cur = summarizeOverlay(overlay); const prev = prevOverlay ? summarizeOverlay(prevOverlay) : null;
  const skipMonthly = period.kind === 'last24' || period.kind === 'all' || (period.kind === 'custom' && spanDays(period) > 366);

  // 1. 訪問の勢い
  { const items: InsightItem[] = [];
    if (cur.sessions > 0) {
      const ratio = prev && prev.sessions > 0 ? cur.sessions / prev.sessions : null;
      items.push({ text: `サイト訪問 ${cur.sessions.toLocaleString('ja-JP')}${ratio !== null ? `（${cmp} ${signedPct(ratio)}${partial ? '・期間途中で同日数比較' : ''}）` : ''}`,
        hint: ratio === null ? undefined : ratio >= 1.1 ? '→ 集客は拡大傾向' : ratio <= 0.9 ? '→ 集客は縮小傾向' : undefined });
      if (prevOverlay && !skipMonthly && overlay.length >= 3) {
        const pm = new Map(prevOverlay.map(p => [p.bucket, p.sessions]));
        const yoy = overlay.map(o => { const [y, m] = o.bucket.split('-'); const pv = pm.get(`${Number(y) - 1}-${m}`) ?? 0; return { b: o.bucket, r: pv > 0 ? o.sessions / pv : null }; }).filter(x => x.r !== null) as { b: string; r: number }[];
        if (yoy.length >= 2) { const best = yoy.reduce((a, b) => (b.r > a.r ? b : a)); const worst = yoy.reduce((a, b) => (b.r < a.r ? b : a)); items.push({ text: `前年同月比で最も伸びた月: ${jaMonth(best.b)}（${signedPct(best.r)}）／最も落ちた月: ${jaMonth(worst.b)}（${signedPct(worst.r)}）` }); }
        else if (yoy.length === 1) items.push({ text: `前年同月比: ${jaMonth(yoy[0].b)}（${signedPct(yoy[0].r)}）` });
      }
    }
    if (items.length) groups.push({ title: '訪問の勢い', items }); }

  // 2. チャネル構成
  { const total = sum(channels);
    if (total > 0) { const items: InsightItem[] = [];
      const top = [...channels].sort((a, b) => b.sessions - a.sessions)[0]; const topShare = top.sessions / total;
      const prevTop = prevChannels && sum(prevChannels) > 0 ? share(prevChannels, l => channelNameJa(l) === channelNameJa(top.label)) : null;
      items.push({ text: `最大は${channelNameJa(top.label)} ${pct(topShare)}${prevTop !== null ? `（前期 ${pct(prevTop)}・${signedPt((topShare - prevTop) * 100)}）` : ''}` });
      const org = share(channels, l => ch(l, '自然検索')); const sns = share(channels, l => ch(l, 'SNS', 'SNS広告')); const dir = share(channels, l => ch(l, '直接アクセス'));
      const prevSns = prevChannels && sum(prevChannels) > 0 ? share(prevChannels, l => ch(l, 'SNS', 'SNS広告')) : null;
      items.push({ text: `自然検索 ${pct(org)}・SNS ${pct(sns)}・直接アクセス ${pct(dir)}`, hint: org >= 0.5 ? '→ 検索経由への依存が高い' : (prevSns !== null && (sns - prevSns) * 100 >= 3) ? '→ SNSからの流入が伸びている' : undefined });
      groups.push({ title: 'チャネル構成', items }); } }

  // 3. 参照元
  { if (sum(sourceMedium) > 0) { const items: InsightItem[] = [];
      const ig = share(sourceMedium, isInstagramSource); const prevIg = prevSourceMedium && sum(prevSourceMedium) > 0 ? share(prevSourceMedium, isInstagramSource) : null; const aso = share(sourceMedium, isAsoviewSource);
      const dPt = prevIg !== null ? (ig - prevIg) * 100 : null;
      items.push({ text: `Instagram経由の訪問 ${pct(ig)}${prevIg !== null ? `（前期 ${pct(prevIg)}）` : ''}・アソビュー経由 ${pct(aso)}`,
        hint: dPt !== null && dPt >= 3 ? '→ Instagramが集客に効き始めている' : dPt !== null && dPt <= -3 ? '→ Instagram経由の訪問が減っている' : undefined });
      groups.push({ title: '参照元', items }); } }

  // 4. 訪問→参加
  { if (cur.per100 !== null) { const f = (v: number) => v.toFixed(1);
      const hint = prev && prev.per100 !== null && prev.per100 > 0 ? (cur.per100 / prev.per100 >= 1.1 ? '→ 訪問から参加への転換が改善' : cur.per100 / prev.per100 <= 0.9 ? '→ 訪問は来ているが参加につながりにくくなっている' : '→ 大きな変化なし') : undefined;
      groups.push({ title: '訪問→参加', items: [{ text: `訪問100件あたり参加 ${f(cur.per100)}件${prev && prev.per100 !== null ? `（前期 ${f(prev.per100)}件）` : ''}（参加日ベース・GA4計測月のみ）`, hint }] }); } }

  // 5. デバイス・地域
  { const dt = sum(devices); const rt = sum(regions);
    if (dt > 0 || rt > 0) { const items: InsightItem[] = [];
      const mobile = dt > 0 ? share(devices, l => l.toLowerCase() === 'mobile') : null;
      const top3 = [...regions].sort((a, b) => b.sessions - a.sessions).slice(0, 3);
      const regTxt = rt > 0 ? top3.map(r => `${regionNameJa(r.label)} ${pct(r.sessions / rt)}`).join('・') : '';
      const tochigi = rt > 0 ? share(regions, l => regionNameJa(l) === '栃木') : 0; const tokyoTop = top3.length > 0 && regionNameJa(top3[0].label) === '東京';
      const hint = mobile !== null && mobile >= 0.7 ? '→ スマホでの見やすさが最優先' : tochigi >= 0.3 ? '→ 県内からの閲覧が多い' : tokyoTop ? '→ 首都圏からの閲覧が主' : undefined;
      items.push({ text: `${mobile !== null ? `スマホ ${pct(mobile)}` : ''}${mobile !== null && regTxt ? '。地域は ' : ''}${regTxt}`, hint });
      groups.push({ title: 'デバイス・地域', items }); } }

  // 6. 人気ページ
  { const pt = sum(topPages);
    if (pt > 0) { const top3 = [...topPages].sort((a, b) => b.sessions - a.sessions).slice(0, 3);
      groups.push({ title: '人気ページ', items: [{ text: top3.map(p => `${pageNameJa(p.label)} ${pct(p.sessions / pt)}`).join('・') }] }); } }

  return groups;
}
