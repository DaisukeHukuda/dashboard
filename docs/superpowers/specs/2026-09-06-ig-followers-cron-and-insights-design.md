# 設計書：フォロワー自動記録（Cron）＋フォロワー推移チャート＋IGインサイト拡充（2026-09-06）

ユーザー承認済み（A: Cron自動記録／B: 専用チャート／C: 5グループの数字＋示唆）。

## 背景（診断）
- 本番のフォロワー記録は4点のみ（7/18・8/16・9/5・9/6）。記録が閲覧駆動のため。
- 既存グラフは y=0 起点・x 等間隔のため +63 の変化が見えない。
- 潜在バグ: クールダウンキー `ig:followers:cooldown` が記録の接頭辞 `ig:followers:` と衝突し、list に混入して「フォロワー1人」の偽点になり得る。

## A. 毎日自動記録（Cron Trigger）
- `wrangler.toml` に `[triggers] crons = ["0 16 * * *"]`（UTC16:00 = JST 01:00）。
- `src/index.ts` に `scheduled(_controller, env, ctx)` を追加し、IG Secrets 設定時のみ `ctx.waitUntil(ensureFollowerSnapshot(env))`。失敗は `ensureFollowerSnapshot` 内で握る（既存のクールダウン）。
- クールダウンキーを `ig:followers-cooldown`（接頭辞外）に変更し、`getFollowerSeries` は `YYYY-MM-DD` 形式のキーのみ採用。
- 閲覧時の記録（`handleHome` 内の ensure）は残す（Cron 失敗時の保険）。

## B. フォロワー推移チャート（`src/charts/followers.ts`）
- `renderFollowerChart(points: {date,count}[]): string`（幅720・高さ260）
  - x は**日付に比例**（最初〜最後の日数で正規化。1点なら中央）。
  - y は **min−pad〜max+pad**（pad = max(5, range×0.15)。range 0 なら ±10）。整数目盛4本。
  - 折れ線＋点（`<title>` に日付と人数）。下段（高さ40px）に**前回比**の棒（増=緑・減=赤・0=灰、`<title>` に ±n）。
  - x ラベルは `axisLabels`（年付き規則）を点に対して適用（間引き every=ceil(n/10)）。
  - 1点以下は「まだ蓄積が1日分です（毎日1:00に自動記録されます）」。
- 統計 `summarizeFollowers(points)`（`src/ig/followerStats.ts`）: `{ current, startDate, sinceStart, perDay, last30 }`（last30 = 最終日から30日以内で最古の点との差。窓内に2点未満なら null。perDay = sinceStart / 経過日数、経過0なら null）。
- セクション: 見出し「フォロワー推移」＋注記「毎日1:00に自動記録（9/6以前は閲覧日のみ）」、ミニKPI3つ（現在／蓄積開始からの増減／直近30日の増減）、チャート。

## C. Instagram インサイト（`src/ig/insights.ts` → `InsightGroup[]`）
入力: `{ period, followers, reach, posts(指標つき最新12), media(最新25: timestamp/mediaType), overlay }`。比較不能・データ不足の行は省略。hint は施策提案なし。
1. **フォロワー**: `現在 N人。蓄積開始（YYYY-MM-DD）から ±X人（1日あたり ±Y）`＋`直近30日 ±Z人`（あれば）。hint: perDay ≥ 1 →「→ 緩やかに増加」／≤ −0.5 →「→ 減少傾向」／それ以外「→ ほぼ横ばい」。点が1つなら `現在 N人` のみ・hintなし。
2. **リーチ**（点4以上）: `直近{n}日 計T（1日平均 A）。最大は M/D（V）`。前半/後半（indexで二分）比較: 後半 ≥ 前半×1.15 →「→ 直近の投稿が届いている」／≤ ×0.85 →「→ 直近はリーチが落ちている」／他なし。
3. **投稿**: 期間内の投稿数（media を期間でフィルタ）と週あたり本数（期間内最古投稿日〜期間末の日数で割る。7日未満なら省略）。最新12投稿の平均エンゲージ・保存率（Σsaved/Σreach、reach>0時）・最高投稿（キャプション先頭20字）。hint: 保存率 ≥ 3% →「→ 保存が多く、行き先候補として残されている」／他なし。
4. **投稿×参加**（overlay が4ヶ月以上・投稿数の中央値で二分し両群非空）: `投稿が多い月の参加は平均 A件、少ない月は B件`。hint: A ≥ B×1.2 →「→ 投稿量と参加に相関の傾向（因果ではなく目安）」／他「→ 投稿量と参加に明確な関係は見えない」。
5. **投稿タイプ**: media 25件の種別内訳（IMAGE→画像／VIDEO→動画（リール）／CAROUSEL_ALBUM→カルーセル／他は原文）。posts（reach>0）を種別で平均リーチ（2種以上あるとき）→ hint「→ {種別}が最も届いている」。
- 表示は `renderInsightGroups`（共通）。`SocialData.insights: InsightGroup[]`。

## テスト・デプロイ
followers（キー形式フィルタ・cooldown分離・scheduled が記録）／followerStats／followers chart（x比例・yズーム・差分棒・1点表示）／insights 各グループと省略条件／section。typecheck + vitest 全件 green。デプロイはデバイス表修正（bf74ca2）と合わせてユーザー承認後。
