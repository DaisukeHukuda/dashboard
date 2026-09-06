# 設計書：GA4セクションの読みやすさ改善（2026-09-06、2026-09-06最終レビューで更新）

ユーザー承認済み。対象は `src/ga4/section.ts` のカード2枚。

## 1. 「認知→予約」カード → 「サイト訪問と参加の推移」

背景: 予約履歴の `date` は**参加日**（申込日ではない）。またGA4計測前の月（全期間・年別選択時）は予約（参加）だけがあり分母（セッション）がない。

- 見出し: `サイト訪問と参加の推移（棒=サイト訪問数 / 線=参加件数）`
- 見出し直下の説明文（13px・muted）:
  「棒はWebサイトへの訪問数（GA4セッション）、線は同じ月にツアーに参加した件数です。訪問が増えているのに参加が伸びない月は、サイトの中身や予約導線に改善余地があるサインです。※参加件数は参加日ベースのため申込みの月とはズレます。合計と比率はGA4の計測データがある月のみで算出しています。予約完了はアソビュー側で行われるためGA4では追跡できず、厳密な因果ではなく目安です。」
- **ミニKPI 3つ**（グラフの上・横並び）:
  1. サイト訪問数（GA4計測がある月の合計セッション）
  2. 参加件数（同じくGA4計測がある月の合計参加件数、カンマ区切り）
  3. **訪問100件あたりの参加件数**＝ `bookings / sessions × 100`（小数1桁「X.X件」、sessions合計=0なら「—」のみ・「—件」にはしない）
- 「最も効率が良かった月」の行は**廃止**。参加日は参加日ベース＋季節商売のため毎回繁忙期の月になり、施策評価の指標として機能しないため。
- 集計は純関数 `summarizeOverlay(points: TrafficPoint[])`（`src/metrics/traffic.ts`）→ `{ sessions, bookings, per100: number | null }`。
  **合計・比率は `points.filter(p => p.sessions > 0)` の月のみで算出**（sessions=0の月のbookingsは合計に含めない）。
- グラフ本体（`renderTrendChart`）は変更しない。

## 2. 「参照元/メディア Top」に解説

- 新規純関数 `describeSourceMedium(label: string): string`（`src/ga4/sourceLabel.ts`）。GA4の `sessionSourceMedium`（例 `google / organic`）を日本語の短い解説に変換。
- source/medium の検索エンジン名解決（`google`→Google など）はプロトタイプ汚染を避けるため `Object.hasOwn(SEARCH_ENGINES, s)` でガードし、`SEARCH_ENGINES[s]` を直接参照しない（`s` が `constructor` 等でも関数ソースが漏れない）。
- ドメイン判定の正規表現は `(^|\.)ドメイン$` 形式でアンカーし、`notinstagram.com` のような偽陽性を防ぐ（`tripadvisor` は `(^|\.)tripadvisor\.[a-z.]+$`）。
- 判定ルール（上から順）:
  1. source が `(not set)` → 「計測できなかった流入」
  2. source `(direct)` または medium `(none)` → 「URL直接入力・ブックマーク・LINEなどアプリ内リンク（参照元が取れない流入）」
  3. medium `organic` → 「{検索エンジン名}検索の検索結果から（広告ではない自然検索）」（google→Google / yahoo→Yahoo! / bing→Bing / それ以外はsource名そのまま）
  4. medium `cpc`/`ppc`/`paid*` → 「{名前}広告のクリック」。SNS系ドメインはここでもSNS名解決を使う（例: `instagram / paid_social` → 「Instagram広告のクリック」）
  5. medium `email` → 「メール内のリンクから」
  6. SNS系 source（`instagram`, `*.instagram.com`, `facebook`, `*.facebook.com`, `t.co`/`twitter.com`/`x.com`, `*.youtube.com`, `line.me`/`line`）または medium `social` → 「{SNS名}のプロフィールや投稿のリンクから」（名前が判定できない social は「SNS（{source}）のリンクから」）
  7. 既知サイト（`asoview.com`→アソビュー（予約サイト）, `jalan.net`→じゃらん, `tripadvisor.*`→トリップアドバイザー）→ 「{名前}からのリンク」
  8. medium `referral` → 「他サイト（{source}）のリンクから」
  9. medium が空 → 「{source} からの流入」（` / ` を含まない自然な文にする）
  10. それ以外（分類不能）→ **空文字**（情報量ゼロの「{source} / {medium} からの流入」は表示しない）
- 表示: `nvTable` に任意の解説関数を渡せるようにし、参照元テーブルではラベルの**下に11px・mutedで解説**を出す。ただし `describe` の戻りが空文字なら解説の `<div>` 自体を出さない。他のテーブル（人気ページ・デバイス・地域）は解説関数を渡さないので影響なし。

## テスト・デプロイ
- `describeSourceMedium` の分類テーブルテスト（プロトタイプ汚染ガード・ドメインアンカー・SNS広告・分類不能→空文字を含む）、`summarizeOverlay` の境界（sessions=0の月を合計・比率から除外することを確認。best関連テストは削除）、`renderTrafficSection` の文言/KPI出力・解説の有無。typecheck + vitest 全件 green。デプロイはユーザー承認後。
