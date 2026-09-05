# 設計書：メディア別ビュー切替（左サイドバー）＋媒体色分け（2026-09-06）

ユーザー承認済み。目的: ①メディア（予約/Web/Instagram）の違いを一目で分かるようにする ②縦長ページをビュー切替で短くする。

## ビュー定義

| view id | 表示名 | 含むセクション |
|---|---|---|
| `bookings`（**既定**） | 予約分析 | kpi, insights, trend, heatmap, cohort, course, source（保存順を維持して絞り込み） |
| `web` | Webサイト | ga4 |
| `sns` | Instagram | ig |
| `all` | すべて | 全9（従来どおり） |

- 状態は URL クエリ `?view=…`（無指定・不正値は `bookings`）。戻る/ブックマーク対応。
- メディア対応: kpi〜source = `booking` ／ ga4 = `web` ／ ig = `sns`（`sections.ts` に `MEDIA_OF` を定義）。

## ナビゲーション

- **PC（幅900px以上）**: 左固定サイドバー（幅180px・sticky）。項目=予約分析/Webサイト/Instagram/すべて。各項目に**メディア色のドット**（booking=#1e3a5f, web=#16a34a, sns=#db2777, all=グレー）。選択中は白背景＋太字。
- **スマホ（900px未満）**: 同じマークアップをCSSで**ヘッダー直下の横並びタブ**（sticky・横スクロール可・タップ目標40px以上）に変える。
- リンクは現在の `period`・`course`・`g` パラメータを**引き継ぐ**（ビューを切り替えても期間等が保たれる）。

## 媒体の色分け

- 各 `<section>` に `data-media="booking|web|sns"` を付与し、CSSで**カード左に4pxのメディア色ボーダー**。「すべて」表示でも媒体が一目で分かる。CSS変数 `--m-booking/--m-web/--m-sns` を定義（サイドバーのドットと同色）。

## データ取得の最適化

- `handleHome` はビューに必要な外部取得だけ実行:
  - GA4取得 = `view ∈ {web, all}` かつ Secrets設定時のみ
  - IG取得 = `view ∈ {sns, all}` かつ Secrets設定時のみ
  - 予約履歴（KV）と予約系集計は全ビューで実施（軽量・GA4/IGの重ね描きにも必要）
- → 既定の予約分析ビューは外部API 0 回で描画（高速化）。

## 既存機能との整合

- **並び替え**: 「並び替え」ボタンと編集バーは **`view === 'all'` のときだけ描画**（部分表示中の保存は全9件検証と矛盾するため）。保存済みの並びは各ビューの絞り込みにも反映される。
- **期間セレクタ・コース選択・月次/週次トグル**: 全フォーム/リンクに `view` を引き継ぐ（hidden input / URLSearchParams）。
- `DashboardData` に `view: ViewId` を追加。`renderDashboard` は `sectionsForView(sectionOrder, view)` で絞って描画。

## テスト方針

- `sections.ts`: `resolveView`（正常/不正/null）・`sectionsForView`（絞り込み・保存順維持・all恒等）
- ルーティング/レンダリング: view別の `data-sec` 構成・サイドバーactive・hidden view input・`data-media` 付与・並び替えUIが all のみ
- 取得ゲーティング: IG Secrets設定＋fetchスタブで、`view=bookings` は外部fetch 0回・`view=sns` は発生することを検証
- typecheck + vitest 全件 green。デプロイはユーザー承認後。
