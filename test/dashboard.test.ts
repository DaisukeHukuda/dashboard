import { describe, it, expect, vi } from 'vitest';
import worker, { type Env } from '../src/index.js';
import { createSession } from '../src/auth.js';
import type { HistoryRecord } from '../src/types.js';
import { renderDashboard, type DashboardData } from '../src/pages.js';
import { resolvePeriod } from '../src/period.js';
import { DEFAULT_ORDER } from '../src/sections.js';

function fakeKV(seed?: Record<string, string>) {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async (k: string) => { m.delete(k); }, list: async () => ({ keys: [] }) };
}

const history: HistoryRecord[] = [
  { date: '2024-06-08', course: 'SUP体験', pax: 2, amount: 12000, status: '参加済', phoneHash: 'p1' },
  { date: '2024-06-15', course: 'SUP体験', pax: 1, amount: 8000, status: '参加済', phoneHash: 'p2' },
  { date: '2023-06-10', course: 'ロングSUP', pax: 2, amount: 15000, status: '参加済', phoneHash: 'p1' },
];

const base: DashboardData = {
  period: resolvePeriod('last12', '2026-09-05'),
  kpi: {
    bookings: 10,
    revenue: 100000,
    avgPerBooking: 10000,
    pax: 25,
    newCount: 7,
    repeatCount: 3,
    repeatRate: 0.3,
    yoyBookings: 1.1,
    yoyRevenue: 1.2,
  },
  trend: [],
  heatmap: { counts: Array(12).fill(0).map(() => Array(7).fill(0)), max: 0 },
  courses: ['SUP体験', 'ロングSUP'],
  selectedCourse: '',
  cohorts: [],
  courseRows: [],
  sourceRows: [],
  insights: [],
  granularity: 'month',
  trendPrior: [],
  traffic: { channels: [], sourceMedium: [], topPages: [], devices: [], regions: [], overlay: [], insights: [], connected: false },
  social: { followers: [], reach: [], posts: [], overlay: [], insights: [], connected: false },
  sectionOrder: DEFAULT_ORDER,
  view: 'all' as const,
};

describe('dashboard rendering', () => {
  it('renders KPI, charts, and insights for an authed user', async () => {
    const env: Env = {
      DATA: fakeKV({ 'history:latest': JSON.stringify(history) }),
      DASH: fakeKV(),
      ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret',
    };
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const cookie = `sess=${await createSession({ username: 'admin', exp }, 'secret')}`;
    const res = await worker.fetch(new Request('https://x/?period=all', { headers: { cookie } }), env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('KPI');
    expect(html).toContain('<svg');
    expect(html).toContain('コース');
    expect(html).toContain('流入経路');
    expect(html).toContain('月次');
    expect(html).toContain('週次');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('直近24ヶ月の選択肢と前24ヶ月比ラベル', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('last24', '2026-09-05') });
    expect(html).toContain('>直近24ヶ月<');
    expect(html).toContain('前24ヶ月比');
    expect(html).not.toContain('>前年比'); // KPIカードのサブラベルが切り替わっていること（インサイト等の文中は対象外のため素の「前年比」では判定しない）
  });

  it('last12 では従来どおり前年比ラベル', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('last12', '2026-09-05') });
    expect(html).toContain('前年比');
  });

  it('sectionOrder の順に data-sec が並ぶ', () => {
    const order = [...DEFAULT_ORDER].reverse();
    const html = renderDashboard({ ...base, sectionOrder: order });
    const ids = [...html.matchAll(/data-sec="([a-z0-9]+)"/g)].map(m => m[1]);
    expect(ids).toEqual(order);
  });
  it('既定順では kpi が先頭', () => {
    const html = renderDashboard({ ...base, sectionOrder: [...DEFAULT_ORDER] });
    const ids = [...html.matchAll(/data-sec="([a-z0-9]+)"/g)].map(m => m[1]);
    expect(ids).toEqual(DEFAULT_ORDER);
  });

  it('並び替えUI（ボタン・編集バー・保存JS）を含む', () => {
    const html = renderDashboard({ ...base, sectionOrder: [...DEFAULT_ORDER] });
    expect(html).toContain('id="reorderBtn"');
    expect(html).toContain('id="reorderBar"');
    expect(html).toContain('id="reorderSave"');
    expect(html).toContain('id="reorderCancel"');
    expect(html).toContain('/api/section-order');
    expect(html).toContain('data-dir="-1"'); // ↑ボタン
    expect(html).toContain('data-dir="1"');  // ↓ボタン
    expect(html).toMatch(/id="reorderBar"[^>]*\shidden[\s>]/); // 初期状態はhidden属性つき
    expect(html).toContain('body.reorder #reorderBar');          // 表示はモード中のみ（CSSがhiddenを打ち消さない）
  });

  it('各ブロックに対象期間ラベルが出る', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('last12', '2026-09-05') });
    expect(html).toContain('class="p-note"');
    expect(html).toContain('対象: 2025-09-06〜2026-09-05'); // KPI等の期間連動ブロック
    expect(html).toContain('対象: 全期間'); // コホート
  });

  it('bookingsビューは7ブロックのみ・並び替えUIなし', () => {
    const html = renderDashboard({ ...base, view: 'bookings' });
    const ids = [...html.matchAll(/data-sec="([a-z0-9]+)"/g)].map(m => m[1]);
    expect(ids).toHaveLength(7);
    expect(html).not.toContain('id="reorderBtn"');
    expect(html).not.toContain('id="reorderBar"');
  });
  it('allビューは9ブロック＋並び替えUIあり', () => {
    const html = renderDashboard({ ...base, view: 'all' });
    expect([...html.matchAll(/data-sec="/g)]).toHaveLength(9);
    expect(html).toContain('id="reorderBtn"');
  });
  it('サイドバー: 4リンク・現在ビューがactive・periodを引き継ぐ', () => {
    const html = renderDashboard({ ...base, view: 'web', period: resolvePeriod('last24', '2026-09-05') });
    expect(html).toContain('class="side"');
    expect(html).toMatch(/<a[^>]*href="\/\?view=web[^"]*"[^>]*class="[^"]*active/);
    expect(html).toContain('view=bookings');
    expect(html).toContain('view=sns');
    expect(html).toContain('view=all');
    expect((html.match(/period=last24/g) ?? []).length).toBeGreaterThanOrEqual(4); // 4リンクすべてが期間を引き継ぐ
  });
  it('data-media が付与される', () => {
    const html = renderDashboard({ ...base, view: 'all' });
    expect(html).toContain('data-sec="kpi" data-media="booking"');
    expect(html).toContain('data-sec="ga4" data-media="web"');
    expect(html).toContain('data-sec="ig" data-media="sns"');
  });
  it('期間フォームとコースフォームが view を引き継ぐ', () => {
    // heatmap（コースフォーム）は booking 系ビューのみ表示されるため、両フォームが並ぶ bookings で確認する
    const html = renderDashboard({ ...base, view: 'bookings' });
    expect((html.match(/name="view" value="bookings"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('月・期間指定フォームと年の自動生成', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('last12', '2026-09-06') });
    expect(html).toContain('月・期間を指定');
    expect(html).toContain('type="month"');
    expect(html).toContain('type="date"');
    expect(html).toContain('>2026年<');
    expect(html).toContain('>2017年<');
  });
  it('月指定中はセレクタ先頭に現在期間・detailsがopen・入力に現在値', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('2026-08', '2026-09-06'), granularity: 'day' });
    expect(html).toMatch(/<option value="2026-08" selected>2026年8月<\/option>/);
    expect(html).toContain('<details class="period-more" open>');
    expect(html).toContain('type="month" name="period" value="2026-08"');
  });
  it('custom 指定は from/to が全リンク・フォームに引き継がれる', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('custom', '2026-09-06', '2026-04-01', '2026-06-30'), granularity: 'day' });
    expect((html.match(/period=custom&from=2026-04-01&to=2026-06-30/g) ?? []).length).toBeGreaterThanOrEqual(4); // サイドバー4リンク
    expect(html).toContain('name="from" value="2026-04-01"');
    expect(html).toContain('name="to" value="2026-06-30"');
    expect(html).toContain('前年同期間比');
  });
  it('短い期間では日次トグルが出る・長い期間では出ない', () => {
    const short = renderDashboard({ ...base, period: resolvePeriod('2026-08', '2026-09-06'), granularity: 'day' });
    expect(short).toContain('>日次<');
    const long = renderDashboard({ ...base, period: resolvePeriod('last12', '2026-09-06'), granularity: 'month' });
    expect(long).not.toContain('>日次<');
  });
});
