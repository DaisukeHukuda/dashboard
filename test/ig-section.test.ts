import { describe, it, expect } from 'vitest';
import { renderSocialSection } from '../src/ig/section.js';

const base = { followers: [], reach: [], posts: [], overlay: [], insights: [] };

describe('renderSocialSection', () => {
  it('shows not-connected notice when connected=false', () => {
    const html = renderSocialSection({ ...base, connected: false }, '2025-09-06〜2026-09-05');
    expect(html).toContain('Instagram');
    expect(html).toContain('未接続');
  });
  it('renders follower/engagement/overlay cards when connected', () => {
    const connectedFixture = {
      ...base, connected: true,
      followers: [{ date: '2024-06-01', count: 1000 }, { date: '2024-07-01', count: 1080 }],
      posts: [{ id: 'm1', caption: 'SUP日和', timestamp: '2024-07-10T09:00:00+0900', mediaType: 'IMAGE', permalink: 'p', reach: 500, likes: 40, comments: 5, saved: 12, engagement: 57 }],
      overlay: [{ bucket: '2024-06', posts: 4, bookings: 10 }],
      insights: [{ title: 'フォロワー', items: [{ text: '現在 1,080人。蓄積開始（2024-06-01）から +80人（1日あたり +2.7）' }] }],
    };
    const html = renderSocialSection(connectedFixture, '2025-09-06〜2026-09-05');
    expect(html).toContain('フォロワー推移');
    expect(html).toContain('毎日1:00に自動記録');
    expect(html).toContain('現在');
    expect(html).toContain('蓄積開始からの増減');
    expect(html).toContain('直近30日の増減');
    expect(html).toContain('class="diff-bar"');
    expect(html).toContain('投稿別エンゲージメント');
    expect(html).toContain('投稿 × 予約');
    expect(html).toContain('SUP日和');
  });
  it('接続済みは各見出しに対象期間ラベルが出る', () => {
    const connectedFixture = { ...base, connected: true };
    const html = renderSocialSection(connectedFixture, '2025-09-06〜2026-09-05');
    expect(html).toContain('対象: 期間末尾の最大30日');
    expect(html).toContain('対象: 最新12投稿（上位10件）');
    expect(html).toContain('対象: 2025-09-06〜2026-09-05（投稿は最新25件の範囲）');
  });
});
