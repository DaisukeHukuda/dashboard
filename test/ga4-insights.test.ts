import { describe, it, expect } from 'vitest';
import { buildGa4Insights } from '../src/ga4/insights.js';
import { resolvePeriod } from '../src/period.js';

const nv = (label: string, sessions: number) => ({ label, sessions });
const base = {
  period: resolvePeriod('2025', '2026-09-06'),
  channels: [nv('Organic Search', 60), nv('Direct', 20), nv('Organic Social', 20)],
  prevChannels: [nv('Organic Search', 50), nv('Direct', 30), nv('Organic Social', 10)],
  sourceMedium: [nv('google / organic', 60), nv('l.instagram.com / referral', 20), nv('asoview.com / referral', 10), nv('(direct) / (none)', 10)],
  prevSourceMedium: [nv('google / organic', 50), nv('l.instagram.com / referral', 10), nv('(direct) / (none)', 30)],
  devices: [nv('mobile', 80), nv('desktop', 20)],
  regions: [nv('Tokyo', 50), nv('Tochigi', 30), nv('Saitama', 20)],
  topPages: [nv('/', 50), nv('/course', 30), nv('/access', 20)],
  overlay: [
    { bucket: '2025-05', sessions: 100, bookings: 2 }, { bucket: '2025-06', sessions: 200, bookings: 4 }, { bucket: '2025-07', sessions: 300, bookings: 9 },
  ],
  prevOverlay: [
    { bucket: '2024-05', sessions: 100, bookings: 2 }, { bucket: '2024-06', sessions: 100, bookings: 2 }, { bucket: '2024-07', sessions: 100, bookings: 1 },
  ],
};
const text = (g: ReturnType<typeof buildGa4Insights>, t: string) => g.find(x => x.title === t)!.items.map(i => i.text + (i.hint ? ' ' + i.hint : '')).join('\n');
const titles = (g: ReturnType<typeof buildGa4Insights>) => g.map(x => x.title);

describe('buildGa4Insights', () => {
  it('6グループが出る', () => {
    expect(titles(buildGa4Insights(base))).toEqual(['訪問の勢い', 'チャネル構成', '参照元', '訪問→参加', 'デバイス・地域', '人気ページ']);
  });
  it('訪問の勢い: 合計・前期比・最も伸びた/落ちた月', () => {
    const t = text(buildGa4Insights(base), '訪問の勢い');
    expect(t).toContain('サイト訪問 600（前年比 +100%）');
    expect(t).toContain('最も伸びた月: 2025年7月（+200%）');
    expect(t).toContain('最も落ちた月: 2025年5月（±0%）');
    expect(t).toContain('→ 集客は拡大傾向');
  });
  it('チャネル構成: 最大チャネルとSNS成長hint', () => {
    const t = text(buildGa4Insights(base), 'チャネル構成');
    expect(t).toContain('最大は自然検索 60%（前期 56%・+4pt）');
    expect(t).toContain('自然検索 60%・SNS 20%・直接アクセス 20%');
    expect(t).toContain('→ 検索経由への依存が高い');
  });
  it('参照元: Instagram・アソビュー', () => {
    const t = text(buildGa4Insights(base), '参照元');
    expect(t).toContain('Instagram経由の訪問 20%（前期 11%）');
    expect(t).toContain('アソビュー経由 10%');
    expect(t).toContain('→ Instagramが集客に効き始めている');
  });
  it('訪問→参加: 訪問100件あたり参加と改善hint', () => {
    const t = text(buildGa4Insights(base), '訪問→参加');
    expect(t).toContain('訪問100件あたり参加 2.5件（前期 1.7件）（参加日ベース・GA4計測月のみ）');
    expect(t).toContain('→ 訪問から参加への転換が改善');
  });
  it('デバイス・地域', () => {
    const t = text(buildGa4Insights(base), 'デバイス・地域');
    expect(t).toContain('スマホ 80%');
    expect(t).toContain('東京 50%・栃木 30%・埼玉 20%');
    expect(t).toContain('→ スマホでの見やすさが最優先');
  });
  it('人気ページ', () => {
    expect(text(buildGa4Insights(base), '人気ページ')).toContain('トップページ 50%・/course 30%・/access 20%');
  });
  it('prev が null なら比較・勢いの月別を省略', () => {
    const g = buildGa4Insights({ ...base, prevChannels: null, prevSourceMedium: null, prevOverlay: null });
    const t = text(g, '訪問の勢い');
    expect(t).toContain('サイト訪問 600');
    expect(t).not.toContain('前年比');
    expect(t).not.toContain('最も伸びた月');
    expect(text(g, 'チャネル構成')).not.toContain('前期');
  });
  it('partial: true なら期間途中の注記が付く', () => {
    const g = buildGa4Insights({ ...base, partial: true });
    const t = text(g, '訪問の勢い');
    expect(t).toContain('サイト訪問 600（前年比 +100%・期間途中で同日数比較）');
  });
  it('partial: false（既定）なら注記は付かない', () => {
    const t = text(buildGa4Insights(base), '訪問の勢い');
    expect(t).not.toContain('期間途中で同日数比較');
  });
  it('last24 では月別YoYを省略するが前期比は出す', () => {
    const g = buildGa4Insights({ ...base, period: resolvePeriod('last24', '2026-09-06') });
    const t = text(g, '訪問の勢い');
    expect(t).toContain('前24ヶ月比');
    expect(t).not.toContain('最も伸びた月');
  });
});
