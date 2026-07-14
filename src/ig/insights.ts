import type { IgPostRow } from './types.js';
import type { SocialPoint } from '../metrics/social.js';

export function buildIgInsights(input: {
  followers: { date: string; count: number }[]; posts: IgPostRow[]; overlay: SocialPoint[];
}): string[] {
  const out: string[] = [];
  const f = input.followers;
  if (f.length >= 2) {
    const diff = f[f.length - 1].count - f[0].count;
    const sign = diff >= 0 ? `+${diff}` : `${diff}`;
    out.push(`フォロワーは蓄積開始から ${sign}（${f[0].count} → ${f[f.length - 1].count}）。`);
  } else if (f.length === 1) {
    out.push(`フォロワー ${f[0].count}（推移は本日以降、日次で蓄積されます）。`);
  }
  if (input.posts.length > 0) {
    const top = input.posts[0]; // engagement 降順済み
    const cap = top.caption ? `「${top.caption.slice(0, 20)}」` : '(キャプションなし)';
    out.push(`最もエンゲージメントが高い投稿は ${cap}（いいね${top.likes}/コメント${top.comments}/保存${top.saved}）。`);
    const avg = Math.round(input.posts.reduce((s, p) => s + p.engagement, 0) / input.posts.length);
    out.push(`直近投稿の平均エンゲージメントは ${avg}。`);
  }
  return out;
}
