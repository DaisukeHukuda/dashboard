import type { Env } from '../index.js';
import type { Ga4ReportSpec, Ga4Row } from './types.js';
import { getAccessToken } from './auth.js';

interface Ga4ApiRow { dimensionValues?: { value: string }[]; metricValues?: { value: string }[]; }

function parseRows(j: { rows?: Ga4ApiRow[] }): Ga4Row[] {
  return (j.rows ?? []).map(r => ({
    dims: (r.dimensionValues ?? []).map(d => d.value),
    mets: (r.metricValues ?? []).map(m => Number(m.value) || 0),
  }));
}

// 32bit FNV-1a → 8桁hex（キャッシュキー用。衝突は実用上無視できる）
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export async function runReport(
  env: Env, spec: Ga4ReportSpec, range: { start: string; end: string }, fetchImpl: typeof fetch = fetch,
): Promise<Ga4Row[]> {
  // dimensionFilter.values を生のまま連結すると（長い pagePath 5件などで）KVキー上限(512バイト)を
  // 超えうるため、短いハッシュに変換する。区切りを ' ' にして値中の '|' との衝突も回避。
  const cacheKey = `ga4:${spec.key}:${range.start}:${range.end}${spec.dimensionFilter ? ':f' + shortHash(spec.dimensionFilter.values.join(' ')) : ''}`;
  const cached = await env.DASH.get(cacheKey);
  if (cached) return JSON.parse(cached) as Ga4Row[];

  const token = await getAccessToken(env, fetchImpl);
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`;
  const resp = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: range.start, endDate: range.end }],
      dimensions: spec.dimensions.map(name => ({ name })),
      metrics: spec.metrics.map(name => ({ name })),
      limit: spec.limit ?? 20,
      ...(spec.metrics[0] ? { orderBys: [{ metric: { metricName: spec.metrics[0] }, desc: true }] } : {}),
      ...(spec.dimensionFilter ? { dimensionFilter: { filter: { fieldName: spec.dimensionFilter.fieldName, inListFilter: { values: spec.dimensionFilter.values } } } } : {}),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`ga4 runReport failed: HTTP ${resp.status}`);
  const rows = parseRows(await resp.json() as { rows?: Ga4ApiRow[] });
  await env.DASH.put(cacheKey, JSON.stringify(rows), { expirationTtl: 12 * 3600 });
  return rows;
}
