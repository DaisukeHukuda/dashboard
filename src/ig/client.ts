import type { Env } from '../index.js';

const BASE = 'https://graph.facebook.com/v21.0';

export async function igGet(
  env: Env, path: string, params: Record<string, string>,
  fetchImpl: typeof fetch = fetch, cacheTtl = 3 * 3600,
): Promise<unknown> {
  const paramStr = new URLSearchParams(params).toString();
  const cacheKey = `ig:${path}:${paramStr}`; // トークンは含めない
  const cached = await env.DASH.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const qs = new URLSearchParams({ ...params, access_token: env.IG_ACCESS_TOKEN ?? '' });
  const resp = await fetchImpl(`${BASE}/${path}?${qs.toString()}`, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`ig api failed: HTTP ${resp.status}`);
  const j = await resp.json();
  await env.DASH.put(cacheKey, JSON.stringify(j), { expirationTtl: cacheTtl });
  return j;
}
