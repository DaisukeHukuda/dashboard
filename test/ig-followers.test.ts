import { describe, it, expect, vi, afterEach } from 'vitest';
import { recordFollowerSnapshot, getFollowerSeries, ensureFollowerSnapshot, FOLLOWERS_COOLDOWN_KEY } from '../src/ig/followers.js';
import { jstToday } from '../src/util.js';
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

describe('ensureFollowerSnapshot（ビュー非依存の1日1回記録）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('未記録の日は followers_count だけを1回取得して記録する', async () => {
    const dash = fakeKV();
    const e = { ...env(dash), IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '17841000000000000' } as Env;
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ followers_count: 4242 }) });
    vi.stubGlobal('fetch', spy);

    await ensureFollowerSnapshot(e);

    expect(spy).toHaveBeenCalledTimes(1);
    const series = await getFollowerSeries(e);
    expect(series).toEqual([{ date: jstToday(), count: 4242 }]);
  });

  it('記録済みの日は追加fetchをしない（同日デデュープ）', async () => {
    const dash = fakeKV();
    const e = { ...env(dash), IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '17841000000000000' } as Env;
    await recordFollowerSnapshot(e, 1000, jstToday());
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    await ensureFollowerSnapshot(e);

    expect(spy).not.toHaveBeenCalled();
    const series = await getFollowerSeries(e);
    expect(series).toEqual([{ date: jstToday(), count: 1000 }]); // 既存値を上書きしない
  });
});

describe('ensureFollowerSnapshot の失敗クールダウン（IGトークン失効中に毎ビュー8秒再試行するのを防ぐ）', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('igGet失敗時にクールダウンキーが書かれる', async () => {
    const dash = fakeKV();
    const e = { ...env(dash), IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '17841000000000000' } as Env;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    await ensureFollowerSnapshot(e);

    expect(await dash.get(FOLLOWERS_COOLDOWN_KEY)).not.toBeNull();
  });

  it('クールダウン中は igGet（fetch）を呼ばない', async () => {
    const dash = fakeKV();
    await dash.put(FOLLOWERS_COOLDOWN_KEY, '1');
    const e = { ...env(dash), IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '17841000000000000' } as Env;
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);

    await ensureFollowerSnapshot(e);

    expect(spy).not.toHaveBeenCalled();
  });

  it('クールダウンキー削除後は再試行できる（fakeKVはTTLで自動失効しないため手動削除で模擬）', async () => {
    const dash = fakeKV();
    await dash.put(FOLLOWERS_COOLDOWN_KEY, '1');
    await dash.delete(FOLLOWERS_COOLDOWN_KEY);
    const e = { ...env(dash), IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '17841000000000000' } as Env;
    const spy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ followers_count: 555 }) });
    vi.stubGlobal('fetch', spy);

    await ensureFollowerSnapshot(e);

    expect(spy).toHaveBeenCalledTimes(1);
    const series = await getFollowerSeries(e);
    expect(series).toEqual([{ date: jstToday(), count: 555 }]);
  });
});
