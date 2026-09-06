# 設計書：GA4セクションの読みやすさ改善（2026-09-06）

ユーザー承認済み。対象は `src/ga4/section.ts` のカード2枚。

## 1. 「認知→予約」カード → 「サイト訪問と予約の推移」

- 見出し: `サイト訪問と予約の推移（棒=サイト訪問数 / 線=予約件数）`
- 見出し直下の説明文（13px・muted）:
  「棒はWebサイトへの訪問数（GA4セッション）、線は同じ月の予約件数。訪問が増えているのに予約が伸びない月は、サイトの中身や予約導線に改善余地があるサインです。※予約完了はアソビュー側で行われるためGA4では追跡できず、厳密な因果ではなく目安です。」
- **ミニKPI 3つ**（グラフの上・横並び）:
  1. サイト訪問数（期間合計セッション）
  2. 予約件数（期間合計）
  3. **訪問100件あたりの予約件数**＝ `bookings / sessions × 100`（小数1桁・sessions=0なら「—」）
- KPI下に1行: 「最も効率が良かった月: YYYY-MM（X.X件）」— 対象は**訪問30件以上の月**のみ（少数月のノイズ除外）。該当なしなら非表示。
- 集計は純関数 `summarizeOverlay(points: TrafficPoint[])`（`src/metrics/traffic.ts`）→ `{ sessions, bookings, per100: number | null, best: { bucket, per100 } | null }`
- グラフ本体（`renderTrendChart`）は変更しない。

## 2. 「参照元/メディア Top」に解説

- 新規純関数 `describeSourceMedium(label: string): string`（`src/ga4/sourceLabel.ts`）。GA4の `sessionSourceMedium`（例 `google / organic`）を日本語の短い解説に変換。
- 判定ルール（上から順）:
  1. source が `(not set)` → 「計測できなかった流入」
  2. source `(direct)` または medium `(none)` → 「URL直接入力・ブックマーク・LINEなどアプリ内リンク（参照元が取れない流入）」
  3. medium `organic` → 「{検索エンジン名}検索の検索結果から（広告ではない自然検索）」（google→Google / yahoo→Yahoo! / bing→Bing / それ以外はsource名そのまま）
  4. medium `cpc`/`ppc`/`paid*` → 「{名前}広告のクリック」
  5. medium `email` → 「メール内のリンクから」
  6. SNS系 source（`instagram`, `*.instagram.com`, `facebook`, `*.facebook.com`, `t.co`/`twitter.com`/`x.com`, `*.youtube.com`, `line.me`/`line`）または medium `social` → 「{SNS名}のプロフィールや投稿のリンクから」（名前が判定できない social は「SNS（{source}）のリンクから」）
  7. 既知サイト（`asoview.com`→アソビュー（予約サイト）, `jalan.net`→じゃらん, `tripadvisor*`→トリップアドバイザー）→ 「{名前}からのリンク」
  8. medium `referral` → 「他サイト（{source}）のリンクから」
  9. それ以外 → 「{source} / {medium} からの流入」
- 表示: `nvTable` に任意の解説関数を渡せるようにし、参照元テーブルではラベルの**下に11px・mutedで解説**を出す。他のテーブル（人気ページ・デバイス・地域）は変更なし。

## テスト・デプロイ
- `describeSourceMedium` の分類テーブルテスト、`summarizeOverlay` の境界（sessions=0・30件未満の月除外・best選定）、`renderTrafficSection` の文言/KPI出力。typecheck + vitest 全件 green。デプロイはユーザー承認後。
