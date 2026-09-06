import type { Env } from '../index.js';
import { igGet } from './client.js';
import { jstToday } from '../util.js';

const PREFIX = 'ig:followers:';
export const FOLLOWERS_COOLDOWN_KEY = 'ig:followers-cooldown';

export async function recordFollowerSnapshot(env: Env, count: number, today: string): Promise<void> {
  const key = `${PREFIX}${today}`;
  const existing = await env.DASH.get(key);
  if (existing !== null) return; // その日の最初の値を保持
  await env.DASH.put(key, String(count));
}

// ビューに関係なく1日1回だけフォロワー数を記録する（閲覧駆動のため、非表示ビューでも取りこぼさない）
export async function ensureFollowerSnapshot(env: Env): Promise<void> {
  const today = jstToday();
  const key = `${PREFIX}${today}`;
  const existing = await env.DASH.get(key); // 今日のキーが既にあれば何もしない（KV read 1回）
  if (existing !== null) return;
  const cooldown = await env.DASH.get(FOLLOWERS_COOLDOWN_KEY); // 直近1時間に失敗していれば再試行しない（毎ビュー8秒の再試行を防ぐ）
  if (cooldown !== null) return;
  let acct: { followers_count?: number };
  try {
    acct = await igGet(env, env.IG_USER_ID ?? '', { fields: 'followers_count' }) as { followers_count?: number };
  } catch {
    await env.DASH.put(FOLLOWERS_COOLDOWN_KEY, '1', { expirationTtl: 3600 }); // 1時間クールダウン
    return;
  }
  if (typeof acct.followers_count === 'number') await recordFollowerSnapshot(env, acct.followers_count, today);
}

// KV の list は結果整合性（eventually consistent）のため、同一リクエスト内で書き込んだ
// スナップショットが直後の list には反映されないことがある（次回ロード時に自然に解消する）。
export async function getFollowerSeries(env: Env): Promise<{ date: string; count: number }[]> {
  const { keys } = await env.DASH.list({ prefix: PREFIX });
  const out: { date: string; count: number }[] = [];
  for (const k of keys) {
    const date = k.name.slice(PREFIX.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue; // 日付形式以外（旧cooldownキー等）は無視
    const v = await env.DASH.get(k.name);
    if (v !== null) out.push({ date, count: Number(v) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
