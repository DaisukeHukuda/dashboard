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
});
