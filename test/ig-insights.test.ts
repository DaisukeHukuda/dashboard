import { describe, it, expect } from 'vitest';
import { buildIgInsights } from '../src/ig/insights.js';
import { resolvePeriod } from '../src/period.js';
const period = resolvePeriod('2026', '2026-09-06');
const post = (id: string, ts: string, mediaType: string, reach: number, likes: number, saved: number, caption = 'c' + id) =>
  ({ id, caption, timestamp: ts, mediaType, permalink: '', reach, likes, comments: 0, saved, engagement: likes + saved });
const base = {
  period,
  followers: [{ date: '2026-07-18', count: 3788 }, { date: '2026-09-06', count: 3851 }],
  reach: Array.from({ length: 10 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, value: i < 5 ? 100 : 200 })),
  posts: [post('1', '2026-08-01T00:00:00+0900', 'VIDEO', 1000, 50, 40, '湖のリール'), post('2', '2026-08-10T00:00:00+0900', 'IMAGE', 500, 30, 5), post('3', '2026-08-20T00:00:00+0900', 'IMAGE', 500, 20, 5)],
  media: [
    { id: '1', caption: '湖のリール', timestamp: '2026-08-01T00:00:00+0900', mediaType: 'VIDEO', permalink: '' },
    { id: '2', caption: '', timestamp: '2026-08-10T00:00:00+0900', mediaType: 'IMAGE', permalink: '' },
    { id: '3', caption: '', timestamp: '2026-08-20T00:00:00+0900', mediaType: 'IMAGE', permalink: '' },
    { id: '4', caption: '', timestamp: '2026-07-05T00:00:00+0900', mediaType: 'CAROUSEL_ALBUM', permalink: '' },
  ],
  overlay: [{ bucket: '2026-05', posts: 1, bookings: 20 }, { bucket: '2026-06', posts: 4, bookings: 40 }, { bucket: '2026-07', posts: 1, bookings: 22 }, { bucket: '2026-08', posts: 5, bookings: 44 }],
};
const text = (g: ReturnType<typeof buildIgInsights>, t: string) => g.find(x => x.title === t)!.items.map(i => i.text + (i.hint ? ' ' + i.hint : '')).join('\n');
const titles = (g: ReturnType<typeof buildIgInsights>) => g.map(x => x.title);
describe('buildIgInsights', () => {
  it('5グループ', () => { expect(titles(buildIgInsights(base))).toEqual(['フォロワー', 'リーチ', '投稿', '投稿×参加', '投稿タイプ']); });
  it('フォロワー: 増減・1日平均・hint', () => {
    const t = text(buildIgInsights(base), 'フォロワー');
    expect(t).toContain('現在 3,851人。蓄積開始（2026-07-18）から +63人（1日あたり +1.3）');
    expect(t).toContain('→ 緩やかに増加');
  });
  it('リーチ: 合計・平均・最大日・後半伸び', () => {
    const t = text(buildIgInsights(base), 'リーチ');
    expect(t).toContain('直近10日 計1,500（1日平均 150）');
    expect(t).toContain('最大は 8/6（200）');
    expect(t).toContain('→ 直近の投稿が届いている');
  });
  it('投稿: 件数・保存率・最高投稿', () => {
    const t = text(buildIgInsights(base), '投稿');
    expect(t).toContain('期間内の投稿 4件');
    expect(t).toContain('保存率 2.5%'); // (40+5+5)/(1000+500+500)
    expect(t).toContain('最高は「湖のリール」');
  });
  it('投稿×参加: 多い月と少ない月', () => {
    const t = text(buildIgInsights(base), '投稿×参加');
    expect(t).toContain('投稿が多い月の参加は平均 42件、少ない月は 21件');
    expect(t).toContain('→ 投稿量と参加に相関の傾向');
  });
  it('投稿タイプ: 内訳と平均リーチ', () => {
    const t = text(buildIgInsights(base), '投稿タイプ');
    expect(t).toContain('画像 2・動画（リール）1・カルーセル 1');
    expect(t).toContain('平均リーチ: 動画（リール） 1,000 / 画像 500');
    expect(t).toContain('→ 動画（リール）が最も届いている');
  });
  it('データ不足なら省略', () => {
    const g = buildIgInsights({ ...base, followers: [{ date: '2026-09-06', count: 5 }], reach: [], posts: [], media: [], overlay: [] });
    expect(text(g, 'フォロワー')).toBe('現在 5人');
    expect(titles(g)).toEqual(['フォロワー']);
  });
});
