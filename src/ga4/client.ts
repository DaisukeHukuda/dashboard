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

export async function runReport(
  env: Env, spec: Ga4ReportSpec, range: { start: string; end: string }, fetchImpl: typeof fetch = fetch,
): Promise<Ga4Row[]> {
  const cacheKey = `ga4:${spec.key}:${range.start}:${range.end}`;
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
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) throw new Error(`ga4 runReport failed: HTTP ${resp.status}`);
  const rows = parseRows(await resp.json() as { rows?: Ga4ApiRow[] });
  await env.DASH.put(cacheKey, JSON.stringify(rows), { expirationTtl: 12 * 3600 });
  return rows;
}
