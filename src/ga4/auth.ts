import type { Env } from '../index.js';
import { parseSaJsonB64, makeAssertion } from './jwt.js';

const TOKEN_KEY = 'ga4:token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

export async function getAccessToken(
  env: Env,
  fetchImpl: typeof fetch = fetch,
  nowSec: () => number = () => Math.floor(Date.now() / 1000),
): Promise<string> {
  const cached = await env.DASH.get(TOKEN_KEY);
  if (cached) return cached;
  if (!env.GA4_SA_JSON_B64) throw new Error('GA4_SA_JSON_B64 未設定');
  const sa = parseSaJsonB64(env.GA4_SA_JSON_B64);
  const assertion = await makeAssertion(sa, SCOPE, nowSec());
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const resp = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`ga4 token failed: HTTP ${resp.status}`);
  const j = await resp.json() as { access_token: string; expires_in?: number };
  const ttl = Math.max(60, (j.expires_in ?? 3600) - 300);
  await env.DASH.put(TOKEN_KEY, j.access_token, { expirationTtl: ttl });
  return j.access_token;
}
