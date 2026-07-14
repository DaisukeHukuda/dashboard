import { describe, it, expect, vi } from 'vitest';
import worker, { type Env } from '../src/index.js';
import { createSession } from '../src/auth.js';
import type { HistoryRecord } from '../src/types.js';

function fakeKV(seed?: Record<string,string>) {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async (k: string) => { m.delete(k); }, list: async ({ prefix }: { prefix: string }) => ({ keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }) };
}
const history: HistoryRecord[] = [{ date: '2024-06-08', course: 'A', pax: 2, amount: 12000, status: '参加済', phoneHash: 'p1' }];

describe('home IG wiring', () => {
  it('shows Instagram not-connected notice when env missing (Phase 1 still renders)', async () => {
    const env: Env = { DATA: fakeKV({ 'history:latest': JSON.stringify(history) }), DASH: fakeKV(), ADMIN_USER: 'admin', ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'secret' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ daily: { time: [], weathercode: [], temperature_2m_max: [], precipitation_sum: [] } }) }));
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const cookie = `sess=${await createSession({ username: 'admin', exp }, 'secret')}`;
    const res = await worker.fetch(new Request('https://x/?period=all', { headers: { cookie } }), env);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('KPI');            // Phase 1 健在
    expect(html).toContain('Instagram');       // IG セクション
    expect(html).toContain('未接続');           // フォールバック
    vi.unstubAllGlobals();
  });
});
