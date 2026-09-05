# 設計書：ヒートマップ月曜始まり＋天候相関の完全削除＋対象期間ラベル（2026-09-05）

ユーザー承認済みの3修正。前提: 直近24ヶ月＋並び替え機能デプロイ済み（Version b0c3cba4）。

## 1. ヒートマップの週始まりを月曜に

- `src/charts/heatmap.ts` の**表示列順のみ**変更: `月火水木金土日`（データ構造 `counts[m][w]`（w=0が日曜）と集計ロジックは不変）。
- 実装: 列位置→曜日indexの対応配列 `ORDER = [1,2,3,4,5,6,0]` を導入し、ヘッダ・セル・`<title>` すべて `ORDER[i]` 経由で参照。
- テスト: ヘッダ出力順が 月→…→日 であること、既知セル（例: 日曜のデータが最終列に描かれる）を検証。

## 2. 天候相関の完全削除

**方針: 見た目だけでなく機能ごと削除**（毎回の外部API取得を止め表示を高速化。復活はgit履歴から可能）。

削除対象:
- カード「天候相関」（`pages.ts` の sections `weather` エントリ・`renderWeatherBlock`・`DashboardData.weather`）
- `src/weather.ts`（Open-Meteo取得）・`src/metrics/weatherjoin.ts`・`test/weather.test.ts`
- `handlers.ts` の天候import・取得try/catchブロック・`weather` の受け渡し
- 戦略インサイトの天候行（`insights.ts` の `weather` パラメータと該当ブロック、関連テスト）
- `sections.ts` の `SECTION_IDS` から `'weather'` を除去（**10→9ブロック**）

互換性:
- 保存済み並び順に `weather` が残っていても `applyOrder` が既知ID以外を無視する設計のため**自動で吸収**される（追加対応不要）。
- DASH KV の天候キャッシュ `wx:*` はTTLで自然消滅（掃除不要）。
- `routing.test.ts` の天候フェッチスタブは不要になるため削除。

## 3. 各ブロックに対象期間ラベル

- 見出し `<h2>` 内に小さなグレーの注記 `<span class="p-note">対象: …</span>` を追加。CSS: `.p-note{font-size:11px;color:var(--muted);font-weight:400;margin-left:8px}`
- ヘルパ `periodNote(p: Period): string` → `` `${p.start}〜${p.end}` ``
- ブロック別の表示内容:

| ブロック | 注記 |
|---|---|
| KPI／インサイト／トレンド／ヒートマップ／コース別／流入経路 | `対象: {start}〜{end}` |
| コホート | `対象: 全期間` |
| GA4一式 | 先頭カード（Web流入（GA4）インサイト）に `対象: {start}〜{end}`（配下は全カード同一期間のため1箇所） |
| IG: リーチ推移 | `対象: 期間末尾の最大30日` |
| IG: 投稿×予約 | `対象: {start}〜{end}（投稿は最新25件の範囲）` |
| IG: 投稿別エンゲージ | `対象: 最新25投稿` |
| IG: フォロワー推移 | 変更なし（見出しに「蓄積開始以降」既記載） |
| 未接続表示（GA4/IG） | 注記なし |

- シグネチャ変更: `renderTrafficSection(d, periodNote: string)` / `renderSocialSection(d, periodNote: string)`（pages.ts から `periodNote(d.period)` を渡す）。

## テスト・デプロイ

- 各修正にレンダリング/ロジックのテストを追加・更新し、typecheck + vitest 全件 green。
- 実装後、ユーザー承認を得て `npx wrangler deploy`。
