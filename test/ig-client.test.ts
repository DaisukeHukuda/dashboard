import { describe, it, expect, vi } from 'vitest';
import { igGet } from '../src/ig/client.js';
import type { Env } from '../src/index.js';

function fakeKV(seed?: Record<string,string>) {
  const m = new Map<string, string>(Object.entries(seed ?? {}));
  return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async () => {}, list: async () => ({ keys: [] }) };
}
const env = () => ({ DATA: fakeKV(), DASH: fakeKV(), ADMIN_USER:'a', ADMIN_PASSWORD:'b', SESSION_SECRET:'s', IG_ACCESS_TOKEN: 'TKN', IG_USER_ID: '17841400000000000' } as Env);

describe('igGet', () => {
  it('GETs graph API with token in query (not in cache key) and parses+caches', async () => {
    const e = env();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: '1', followers_count: 1234 }) });
    const out = await igGet(e, '17841400000000000', { fields: 'followers_count' }, fetchMock as unknown as typeof fetch) as { followers_count: number };
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('https://graph.facebook.com/v21.0/17841400000000000?');
    expect(url).toContain('fields=followers_count');
    expect(url).toContain('access_token=TKN');
    expect(out.followers_count).toBe(1234);
    // 2回目はキャッシュ（fetchされない）。キャッシュキーにトークンは含めない
    const fetch2 = vi.fn();
    await igGet(e, '17841400000000000', { fields: 'followers_count' }, fetch2 as unknown as typeof fetch);
    expect(fetch2).not.toHaveBeenCalled();
  });
  it('throws on non-ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(igGet(env(), 'x', {}, fetchMock as unknown as typeof fetch)).rejects.toThrow();
  });
});
