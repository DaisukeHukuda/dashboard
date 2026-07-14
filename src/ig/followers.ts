import type { Env } from '../index.js';

const PREFIX = 'ig:followers:';

export async function recordFollowerSnapshot(env: Env, count: number, today: string): Promise<void> {
  const key = `${PREFIX}${today}`;
  const existing = await env.DASH.get(key);
  if (existing !== null) return; // その日の最初の値を保持
  await env.DASH.put(key, String(count));
}

// KV の list は結果整合性（eventually consistent）のため、同一リクエスト内で書き込んだ
// スナップショットが直後の list には反映されないことがある（次回ロード時に自然に解消する）。
export async function getFollowerSeries(env: Env): Promise<{ date: string; count: number }[]> {
  const { keys } = await env.DASH.list({ prefix: PREFIX });
  const out: { date: string; count: number }[] = [];
  for (const k of keys) {
    const v = await env.DASH.get(k.name);
    if (v !== null) out.push({ date: k.name.slice(PREFIX.length), count: Number(v) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
