import { describe, it, expect, vi } from 'vitest';
import worker, { type Env } from '../src/index.js';
import { createSession } from '../src/auth.js';
import type { HistoryRecord } from '../src/types.js';

function fakeKV(seed?: Record<string, string>) {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async (k: string) => { m.delete(k); }, list: async () => ({ keys: [] }) };
}

const history: HistoryRecord[] = [
  { date: '2024-06-08', course: 'SUP体験', pax: 2, amount: 12000, status: '参加済', phoneHash: 'p1' },
  { date: '2024-06-15', course: 'SUP体験', pax: 1, amount: 8000, status: '参加済', phoneHash: 'p2' },
  { date: '2023-06-10', course: 'ロングSUP', pax: 2, amount: 15000, status: '参加済', phoneHash: 'p1' },
];

describe('dashboard rendering', () => {
  it('renders KPI, charts, and insights for an authed user', async () => {
    const env: Env = {
      DATA: fakeKV({ 'history:latest': JSON.stringify(history) }),
      DASH: fakeKV(),
      ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret',
    };
    // 天候 fetch をスタブ（グローバル fetch）
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily: { time: [], weathercode: [], temperature_2m_max: [], precipitation_sum: [] } }) }));
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const cookie = `sess=${await createSession({ username: 'admin', exp }, 'secret')}`;
    const res = await worker.fetch(new Request('https://x/?period=all', { headers: { cookie } }), env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('KPI');
    expect(html).toContain('<svg');
    expect(html).toContain('コース');
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
