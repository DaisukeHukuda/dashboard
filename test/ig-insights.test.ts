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
  overlay: [
    { bucket: '2026-03', posts: 2, bookings: 25 },
    { bucket: '2026-04', posts: 3, bookings: 30 },
    { bucket: '2026-05', posts: 1, bookings: 20 },
    { bucket: '2026-06', posts: 4, bookings: 40 },
    { bucket: '2026-07', posts: 1, bookings: 22 },
    { bucket: '2026-08', posts: 5, bookings: 44 },
  ],
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
  describe('リーチ: 閾値の境界（1.15/0.85）', () => {
    const mkReach = (ratio: number) => {
      // 前半5点=100固定、後半5点=100*ratio固定
      return Array.from({ length: 10 }, (_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, value: i < 5 ? 100 : Math.round(100 * ratio) }));
    };
    it('ratio=1.10 は hint なし', () => {
      const t = text(buildIgInsights({ ...base, reach: mkReach(1.10) }), 'リーチ');
      expect(t).not.toContain('→');
    });
    it('ratio=1.15 は「→ 直近の投稿が届いている」', () => {
      const t = text(buildIgInsights({ ...base, reach: mkReach(1.15) }), 'リーチ');
      expect(t).toContain('→ 直近の投稿が届いている');
    });
    it('ratio=0.90 は hint なし', () => {
      const t = text(buildIgInsights({ ...base, reach: mkReach(0.90) }), 'リーチ');
      expect(t).not.toContain('→');
    });
    it('ratio=0.85 は「→ 直近はリーチが落ちている」', () => {
      const t = text(buildIgInsights({ ...base, reach: mkReach(0.85) }), 'リーチ');
      expect(t).toContain('→ 直近はリーチが落ちている');
    });
  });
  it('投稿: 件数・保存率（最新12投稿ラベル）・最高投稿', () => {
    const t = text(buildIgInsights(base), '投稿');
    expect(t).toContain('期間内の投稿 4件');
    expect(t).toContain('保存率 2.5%（最新12投稿）'); // (40+5+5)/(1000+500+500)
    expect(t).not.toContain('→ 保存が多く'); // 2.5% < 3%
    expect(t).toContain('最新12投稿で最高は「湖のリール」');
  });
  it('投稿: 保存率が3%以上なら hint が付く', () => {
    const highSavePosts = [post('1', '2026-08-01T00:00:00+0900', 'VIDEO', 1000, 50, 40, '湖のリール')]; // 40/1000=4%
    const t = text(buildIgInsights({ ...base, posts: highSavePosts }), '投稿');
    expect(t).toContain('保存率 4.0%（最新12投稿） → 保存が多く、行き先候補として残されている');
  });
  it('投稿: 週あたりは period.end（クランプ済み想定）を分母にする', () => {
    // media の最古は 2026-07-05。period.end を「今日」相当の 2026-09-06 にクランプすると 63日差。
    const clampedPeriod = { ...period, end: '2026-09-06' };
    const t = text(buildIgInsights({ ...base, period: clampedPeriod }), '投稿');
    expect(t).toContain('期間内の投稿 4件（週 0.4件）');
  });
  it('投稿: period.end が未来（未クランプ）だと週あたりが変わってしまう（クランプの必要性を示す）', () => {
    // base.period.end は 2026-12-31（年指定の期末・未来日）。日数が伸びる分、週あたりは下がる。
    const t = text(buildIgInsights(base), '投稿');
    expect(t).toContain('期間内の投稿 4件（週 0.2件）');
    expect(t).not.toContain('週 0.4件');
  });
  it('投稿×参加: 多い月と少ない月（overlay 6件以上）', () => {
    const t = text(buildIgInsights(base), '投稿×参加');
    expect(t).toContain('投稿が多い月の参加は平均 38件、少ない月は 22件');
    expect(t).toContain('→ 投稿量と参加に相関の傾向（季節の影響もあるため因果ではなく目安）');
  });
  it('投稿×参加: overlay が5件以下なら省略', () => {
    const g = buildIgInsights({ ...base, overlay: base.overlay.slice(0, 5) });
    expect(titles(g)).not.toContain('投稿×参加');
  });
  it('投稿タイプ: 内訳と平均リーチ（既定fixtureはtopが1件のみでhintなし）', () => {
    const t = text(buildIgInsights(base), '投稿タイプ');
    expect(t).toContain('画像 2件・動画（リール） 1件・カルーセル 1件');
    expect(t).toContain('平均リーチ: 動画（リール） 1,000 / 画像 500');
    expect(t).not.toContain('→'); // top(動画)はreachありが1件のみなのでhintなし
  });
  it('投稿タイプ: 種別が1種類のみなら平均リーチにhintなし', () => {
    const onlyImage = [post('1', '2026-08-01T00:00:00+0900', 'IMAGE', 1000, 50, 40), post('2', '2026-08-02T00:00:00+0900', 'IMAGE', 900, 40, 30)];
    const onlyImageMedia = [
      { id: '1', caption: '', timestamp: '2026-08-01T00:00:00+0900', mediaType: 'IMAGE', permalink: '' },
      { id: '2', caption: '', timestamp: '2026-08-02T00:00:00+0900', mediaType: 'IMAGE', permalink: '' },
    ];
    const t = text(buildIgInsights({ ...base, posts: onlyImage, media: onlyImageMedia }), '投稿タイプ');
    expect(t).toContain('平均リーチ: 画像');
    expect(t).not.toContain('→');
  });
  it('投稿タイプ: 2種以上でtopがreachあり2件以上ならhintが付く', () => {
    const posts2 = [
      post('1', '2026-08-01T00:00:00+0900', 'VIDEO', 1000, 50, 40),
      post('2', '2026-08-02T00:00:00+0900', 'VIDEO', 1200, 60, 30),
      post('3', '2026-08-03T00:00:00+0900', 'IMAGE', 500, 20, 5),
    ];
    const media2 = [
      { id: '1', caption: '', timestamp: '2026-08-01T00:00:00+0900', mediaType: 'VIDEO', permalink: '' },
      { id: '2', caption: '', timestamp: '2026-08-02T00:00:00+0900', mediaType: 'VIDEO', permalink: '' },
      { id: '3', caption: '', timestamp: '2026-08-03T00:00:00+0900', mediaType: 'IMAGE', permalink: '' },
    ];
    const t = text(buildIgInsights({ ...base, posts: posts2, media: media2 }), '投稿タイプ');
    expect(t).toContain('→ 動画（リール）が最も届いている');
  });
  it('投稿: キャプションの絵文字（サロゲートペア）を分割しない', () => {
    // 絵文字🌊(U+1F30A)はUTF-16で2コードユニット。19文字+🌊でちょうど20コードポイント目に来る位置に配置。
    // 素朴な .slice(0, 20)（UTF-16単位）だとサロゲートの片方だけ残って壊れる。コードポイント単位なら絵文字を含めて綺麗に切れる。
    const emojiCaption = '1'.repeat(19) + '🌊' + 'あいうえお';
    const p = [post('1', '2026-08-01T00:00:00+0900', 'IMAGE', 100, 5, 1, emojiCaption)];
    const t = text(buildIgInsights({ ...base, posts: p }), '投稿');
    expect(t).toContain(`「${'1'.repeat(19)}🌊」`);
  });
  it('データ不足なら省略', () => {
    const g = buildIgInsights({ ...base, followers: [{ date: '2026-09-06', count: 5 }], reach: [], posts: [], media: [], overlay: [] });
    expect(text(g, 'フォロワー')).toBe('現在 5人');
    expect(titles(g)).toEqual(['フォロワー']);
  });
});
