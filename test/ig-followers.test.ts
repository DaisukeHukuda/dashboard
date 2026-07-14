import { describe, it, expect } from 'vitest';
import { recordFollowerSnapshot, getFollowerSeries } from '../src/ig/followers.js';
import type { Env } from '../src/index.js';

// list(prefix) をちゃんと実装した fakeKV
function fakeKV() {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k) ?? null,
    put: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
    list: async ({ prefix }: { prefix: string }) => ({ keys: [...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })) }),
  };
}
const env = (dash = fakeKV()) => ({ DATA: fakeKV(), DASH: dash, ADMIN_USER:'a', ADMIN_PASSWORD:'b', SESSION_SECRET:'s' } as Env);

describe('follower snapshots', () => {
  it('records once per day and reads back a sorted series', async () => {
    const dash = fakeKV();
    const e = env(dash);
    await recordFollowerSnapshot(e, 1000, '2024-07-11');
    await recordFollowerSnapshot(e, 9999, '2024-07-11'); // 同日は上書きしない
    await recordFollowerSnapshot(e, 1010, '2024-07-10');
    const series = await getFollowerSeries(e);
    expect(series).toEqual([{ date: '2024-07-10', count: 1010 }, { date: '2024-07-11', count: 1000 }]);
  });
  it('returns [] when no snapshots', async () => {
    expect(await getFollowerSeries(env())).toEqual([]);
  });
});
