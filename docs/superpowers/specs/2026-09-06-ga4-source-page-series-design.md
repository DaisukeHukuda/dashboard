# 設計書：参照元／人気ページの期間内推移グラフ（2026-09-06）

ユーザー承認済み。「期間に2025年を追加」は既に自動生成（2017〜今年）で対応済みのため作業なし（デプロイ後に再読み込みで確認）。

## 目的
GA4セクションの「参照元/メディア Top」「人気ページ Top」に、**指定期間内の上位5件の推移**（複数折れ線）を表の上に追加。表（解説つき）は維持。

## データ取得（`src/ga4/client.ts`・`src/ga4/reports.ts`・`src/handlers.ts`）
- `Ga4ReportSpec` に任意の `dimensionFilter?: { fieldName: string; values: string[] }` を追加 → リクエスト `dimensionFilter: { filter: { fieldName, inListFilter: { values } } }`。キャッシュキーに値を含める（`ga4:<key>:<start>:<end>:<values.join('|')>`）。
- 2段階取得: 既存の当期6レポート＋前期3レポートの後、上位リスト（sourceMedium／topPages）から**上位5ラベル**を選び、
  - `sourceSeriesSpec(values)` = dims `['date','sessionSourceMedium']`, metrics `['sessions']`, filter sessionSourceMedium in values, limit 100000
  - `pageSeriesSpec(values)` = dims `['date','pagePath']`, metrics `['screenPageViews']`, filter pagePath in values, limit 100000
  - `DAILY_PAGEVIEWS_SPEC` = dims `['date']`, metrics `['screenPageViews']`（「その他」算出用。セッション側は既存 DAILY_SESSIONS を流用）
  を並列取得。各 `.catch(() => null)`（失敗時は該当グラフを省略、他は表示）。上位が0件なら取得しない。
- 取得は `view ∈ {web, all}` かつ GA4 設定時のみ（既存ゲートの内側）。

## 集計（`src/metrics/series.ts`）
- `export interface SeriesData { buckets: string[]; series: { name: string; values: number[] }[] }`
- `buildSeries(rows: { date: string; key: string; value: number }[], period, gran: Granularity, topKeys: string[], totals: { date: string; value: number }[] | null, nameOf: (key: string) => string): SeriesData`
  - バケットは `computeTrend` と同じ規則（month=`YYYY-MM`／week=週の月曜 `YYYY-MM-DD`／day=日付。**day は期間内全日をゼロ埋め**。month/week は当期データがある集合＋totals にあるバケット）。
  - `series` は `topKeys` 順（上位順）。`totals` があれば `その他 = totals − 上位合計`（負は0）を末尾に追加（合計が全期間で0なら追加しない）。
  - `weekStart` を `trend.ts` から export して共用。

## グラフ（`src/charts/multiline.ts`）
- `renderMultiLine(data: SeriesData): string` — 幅720・高さ260。系列ごとに色（6色パレット、その他はグレー破線）、折れ線＋小さな点（`<title>` にバケット・系列名・値）。Y軸は最大値で正規化し、4本の横グリッド＋左に目盛値。X軸ラベルは `line.ts` と同じ「先頭と年境界に年付き」規則（共通ヘルパ `axisLabel` を `src/charts/axis.ts` に切り出し、`line.ts` も使う）。凡例は上部に色スウォッチ＋名前。データ空なら「データなし」。
- 名前: 参照元は `sourceShortName(label)`（`sourceLabel.ts` に追加: organic→「{検索エンジン}検索」／direct→「直接アクセス」／Instagram・Facebook・X・YouTube・LINE→そのSNS名／アソビュー・じゃらん等→サイト名／referral→ドメイン／他は原文）、ページは `pageNameJa(path)`。

## 表示（`src/ga4/section.ts`）
- `TrafficData` に `sourceSeries: SeriesData | null` と `pageSeries: SeriesData | null` を追加。各カードは `見出し → （系列があれば）推移グラフ → 既存の表` の順。系列 null のときは表のみ（従来どおり）。
- 見出し右の注記はそのまま。グラフ上に小さく「上位5件＋その他・{粒度}」を表示。

## テスト・デプロイ
client（dimensionFilter のボディとキャッシュキー）／series（バケット規則・ゼロ埋め・その他・空）／multiline（系列数・凡例・データなし・エスケープ）／sourceShortName／section（グラフの有無）／handlers（第2段取得が上位0件で走らない・失敗で null）。typecheck + vitest 全件 green。デプロイは前回分と合わせてユーザー承認後。
