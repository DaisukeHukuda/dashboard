import { describe, it, expect } from 'vitest';
import { buildIgInsights } from '../src/ig/insights.js';
import type { IgPostRow } from '../src/ig/types.js';

const post = (over: Partial<IgPostRow>): IgPostRow => ({ id: 'm', caption: 'c', timestamp: '2024-07-10T09:00:00+0900', mediaType: 'IMAGE', permalink: 'p', reach: 0, likes: 0, comments: 0, saved: 0, engagement: 0, ...over });

describe('buildIgInsights', () => {
  it('reports follower change and top post', () => {
    const out = buildIgInsights({
      followers: [{ date: '2024-06-01', count: 1000 }, { date: '2024-07-01', count: 1080 }],
      posts: [post({ caption: '最高のSUP日和', engagement: 50, reach: 500 }), post({ engagement: 10 })],
      overlay: [{ bucket: '2024-06', posts: 4, bookings: 10 }],
    });
    expect(out.some(s => s.includes('フォロワー'))).toBe(true);
    expect(out.some(s => s.includes('+80') || s.includes('80'))).toBe(true);
    expect(out.some(s => s.includes('エンゲージ'))).toBe(true);
  });
  it('is safe with empty data', () => {
    expect(buildIgInsights({ followers: [], posts: [], overlay: [] })).toEqual([]);
  });
});
