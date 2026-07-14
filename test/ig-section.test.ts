import { describe, it, expect } from 'vitest';
import { renderSocialSection } from '../src/ig/section.js';

const base = { followers: [], reach: [], posts: [], overlay: [], insights: [] };

describe('renderSocialSection', () => {
  it('shows not-connected notice when connected=false', () => {
    const html = renderSocialSection({ ...base, connected: false });
    expect(html).toContain('Instagram');
    expect(html).toContain('未接続');
  });
  it('renders follower/engagement/overlay cards when connected', () => {
    const html = renderSocialSection({
      ...base, connected: true,
      followers: [{ date: '2024-06-01', count: 1000 }, { date: '2024-07-01', count: 1080 }],
      posts: [{ id: 'm1', caption: 'SUP日和', timestamp: '2024-07-10T09:00:00+0900', mediaType: 'IMAGE', permalink: 'p', reach: 500, likes: 40, comments: 5, saved: 12, engagement: 57 }],
      overlay: [{ bucket: '2024-06', posts: 4, bookings: 10 }],
      insights: ['フォロワーは蓄積開始から +80（1000 → 1080）。'],
    });
    expect(html).toContain('フォロワー推移');
    expect(html).toContain('投稿別エンゲージメント');
    expect(html).toContain('投稿 × 予約');
    expect(html).toContain('SUP日和');
  });
});
