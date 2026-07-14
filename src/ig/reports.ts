import type { IgMedia, IgSeriesPoint, IgPostRow } from './types.js';

interface InsightData { data?: { name: string; values?: { value: number; end_time?: string }[] }[]; }

export function parseInsightSeries(json: unknown, metric: string): IgSeriesPoint[] {
  const d = (json as InsightData).data ?? [];
  const found = d.find(x => x.name === metric);
  if (!found) return [];
  return (found.values ?? []).map(v => ({
    date: (v.end_time ?? '').slice(0, 10),
    value: v.value ?? 0,
  }));
}

interface MediaListJson { data?: { id: string; caption?: string; timestamp: string; media_type: string; permalink: string }[]; }

export function parseMediaList(json: unknown): IgMedia[] {
  return ((json as MediaListJson).data ?? []).map(m => ({
    id: m.id, caption: m.caption ?? '', timestamp: m.timestamp, mediaType: m.media_type, permalink: m.permalink,
  }));
}

export function parseMediaInsights(json: unknown): { reach: number; likes: number; comments: number; saved: number } {
  const d = (json as InsightData).data ?? [];
  const val = (name: string) => d.find(x => x.name === name)?.values?.[0]?.value ?? 0;
  return { reach: val('reach'), likes: val('likes'), comments: val('comments'), saved: val('saved') };
}

export function buildPostRows(
  media: IgMedia[], insightsById: Record<string, { reach: number; likes: number; comments: number; saved: number }>,
): IgPostRow[] {
  return media.map(m => {
    const ins = insightsById[m.id] ?? { reach: 0, likes: 0, comments: 0, saved: 0 };
    return { ...m, ...ins, engagement: ins.likes + ins.comments + ins.saved };
  }).sort((a, b) => b.engagement - a.engagement);
}
