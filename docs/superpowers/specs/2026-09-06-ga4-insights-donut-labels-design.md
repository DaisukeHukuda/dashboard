# 設計書：GA4インサイト拡充＋ドーナツ引き出し線＋年/月ラベル（2026-09-06）

ユーザー承認済み。3点とも承認どおり（年/月ラベルは全トレンドグラフに統一）。

## 1. グラフ下ラベルを「年/月」に（`src/charts/line.ts`）

- ラベルは `bucket`（ISO）から描画時に生成。**先頭ラベルと年が変わった最初のラベルに年を付ける**。
  - 月次 `YYYY-MM`: `2025/8, 9, 10, 11, 12, 2026/1, 2, …`
  - 週次 `YYYY-MM-DD`（label===bucket のとき）: `2026/8/10, 8/17, …`（年が変われば `2027/1/5`）
  - 日次（`computeTrend` が `label` を `M/D` に整形済み＝label≠bucket）: そのまま `8/1`
  - `bucket` がISO形式でないものは `label` をそのまま表示
- 「年を付ける」判定は**実際に描画される（間引き後の）ラベル**の並びで行う（前に描いたラベルと年が違えば年付き）。
- 対象: 売上・予約トレンド／GA4 サイト訪問と参加の推移／IG フォロワー推移・リーチ・投稿×予約（すべて `renderTrendChart` 経由）。

## 2. 流入チャネルのドーナツ（`src/charts/donut.ts`）＋日本語名（`src/ga4/labels.ts`）

- `channelNameJa(label)`: Organic Search→自然検索／Direct→直接アクセス／Organic Social→SNS／Paid Social→SNS広告／Referral→他サイトのリンク／Paid Search→有料検索／Display→ディスプレイ広告／Email→メール／Organic Video→動画／Paid Video→動画広告／Cross-network→広告（複数媒体）／Affiliates→アフィリエイト／Unassigned・(not set)→不明／その他は原文。大文字小文字を区別しない。
- ドーナツ: 3%未満のスライスは「その他」に合算（末尾）。各スライスの中心角から**引き出し線**（外周→肘→水平）を描き、線の先にラベル `名前 NN%`。右半分は右側・左半分は左側に配置し、同じ側のラベルは上下14px以上空くよう縦位置を調整。凡例は廃止。`<title>` に原文ラベルと件数を残す。
- SVG幅は 520px（左右にラベル領域）。

## 3. GA4インサイトの拡充（`src/ga4/insights.ts`・`src/handlers.ts`・`src/ga4/section.ts`）

### データ
- 前期間 `prev = priorPeriod(period)`（終端は今日でクランプ）について **CHANNEL・SOURCE_MEDIUM・DAILY_SESSIONS** の3レポートを追加取得（同じキャッシュ機構）。`period.kind === 'all'` のときは取得も比較も行わない。
- 出力は戦略インサイトと同じ `InsightGroup[]`（`{title, items:[{text, hint?}]}`。型は `src/metrics/insights.ts` から export）。

### グループ
1. **訪問の勢い**: 訪問数（期間内セッション合計）と `comparisonLabel` 付き前期比。月次バケット3以上かつ勢い判定可（last24／366日超custom／all 以外）のとき、前年同月比が最大／最小の月（候補2件以上のときのみ対、1件は単独）。hint: 前期比 ≥ +10% →「→ 集客は拡大傾向」／≤ −10% →「→ 集客は縮小傾向」／それ以外なし。
2. **チャネル構成**: 最大チャネル（日本語名・シェア・前期比pt）。自然検索／SNS（Organic Social＋Paid Social）／直接アクセスの3本柱シェア。hint: 自然検索 ≥50% →「→ 検索経由への依存が高い」／SNSシェアが前期比 +3pt以上 →「→ SNSからの流入が伸びている」／それ以外なし。
3. **参照元**: Instagram経由（source が instagram 系）の訪問シェアと前期比、アソビュー経由のシェア。hint: Instagramシェア +3pt以上 →「→ Instagramが集客に効き始めている」／−3pt以下 →「→ Instagram経由の訪問が減っている」／それ以外なし。
4. **訪問→参加**: 訪問100件あたり参加件数（`summarizeOverlay`）と前期値。hint: 相対 +10%以上 →「→ 訪問から参加への転換が改善」／−10%以下 →「→ 訪問は来ているが参加につながりにくくなっている」／それ以外「→ 大きな変化なし」。
5. **デバイス・地域**: スマホ比率、上位3地域（日本語名・シェア）。hint: スマホ ≥70% →「→ スマホでの見やすさが最優先」／栃木 ≥30% →「→ 県内からの閲覧が多い」／東京が1位 →「→ 首都圏からの閲覧が主」（優先順）。
6. **人気ページ**: 上位3ページ（`/`→「トップページ」、他はパス）のPVシェア。hint なし。
- 各グループは分母0や比較不能なら行省略。地域名は `regionNameJa`（Tokyo→東京 等、47都道府県の英語名→日本語。未知は原文）。

### 表示
GA4セクション先頭カードを、戦略インサイトと同じマークアップ（`.ins-title`／`.ins-hint`）で描画。共通関数 `renderInsightGroups(groups)` を `src/pages.ts` から export して両方で使う。

## テスト・デプロイ
line ラベル（年境界・間引き後判定・日次そのまま）、donut（その他合算・引き出し線本数・日本語名・XML エスケープ）、labels（channel/region マップ）、GA4 insights（各グループ・省略条件・hint分岐）、handlers（all では前期取得なし）。typecheck + vitest 全件 green。デプロイはユーザー承認後。
