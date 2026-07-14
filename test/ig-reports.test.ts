import { describe, it, expect } from 'vitest';
import { parseInsightSeries, parseMediaList, parseMediaInsights, buildPostRows } from '../src/ig/reports.js';

describe('parseInsightSeries', () => {
  it('extracts the named metric daily series', () => {
    const json = { data: [
      { name: 'reach', period: 'day', values: [ { value: 100, end_time: '2024-07-10T07:00:00+0000' }, { value: 120, end_time: '2024-07-11T07:00:00+0000' } ] },
      { name: 'impressions', period: 'day', values: [ { value: 200, end_time: '2024-07-10T07:00:00+0000' } ] },
    ] };
    expect(parseInsightSeries(json, 'reach')).toEqual([
      { date: '2024-07-10', value: 100 }, { date: '2024-07-11', value: 120 },
    ]);
  });
  it('returns [] for missing metric', () => {
    expect(parseInsightSeries({ data: [] }, 'reach')).toEqual([]);
  });
});

describe('parseMediaList', () => {
  it('maps media fields', () => {
    const json = { data: [ { id: 'm1', caption: 'hello', timestamp: '2024-07-10T09:00:00+0000', media_type: 'IMAGE', permalink: 'https://insta/p/1' } ] };
    expect(parseMediaList(json)).toEqual([
      { id: 'm1', caption: 'hello', timestamp: '2024-07-10T09:00:00+0000', mediaType: 'IMAGE', permalink: 'https://insta/p/1' },
    ]);
  });
});

describe('parseMediaInsights', () => {
  it('reads reach/likes/comments/saved from insights data', () => {
    const json = { data: [
      { name: 'reach', values: [{ value: 500 }] },
      { name: 'likes', values: [{ value: 40 }] },
      { name: 'comments', values: [{ value: 5 }] },
      { name: 'saved', values: [{ value: 12 }] },
    ] };
    expect(parseMediaInsights(json)).toEqual({ reach: 500, likes: 40, comments: 5, saved: 12 });
  });
});

describe('buildPostRows', () => {
  it('joins media with insights and sorts by engagement desc', () => {
    const media = [
      { id: 'm1', caption: 'a', timestamp: '2024-07-10T09:00:00+0000', mediaType: 'IMAGE', permalink: 'p1' },
      { id: 'm2', caption: 'b', timestamp: '2024-07-11T09:00:00+0000', mediaType: 'IMAGE', permalink: 'p2' },
    ];
    const ins = {
      m1: { reach: 100, likes: 10, comments: 1, saved: 2 },  // eng 13
      m2: { reach: 200, likes: 30, comments: 3, saved: 5 },  // eng 38
    };
    const rows = buildPostRows(media, ins);
    expect(rows.map(r => r.id)).toEqual(['m2', 'm1']);
    expect(rows[0].engagement).toBe(38);
  });
});
