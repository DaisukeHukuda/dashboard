# Phase 2 設計書（ドラフト）— GA4 連携（流入経路・認知の拡大）

- 日付: 2026-07-14
- 対象: Sup! Sup! マーケティング分析ダッシュボード / Phase 2
- ステータス: **DRAFT**（§9 の確認事項をユーザーに確認後に確定→plan へ）

---

## 1. 目的

Phase 1（予約データ）に、**Web アクセス解析（GA4）**を足して「流入経路・認知の拡大」の問いに答える。

- どこから客が来ているか（SNS/検索/広告/直接）
- どのページが見られているか（特に予約導線）
- 認知（サイト訪問）→ 予約 の導線を、予約実績と同じ時間軸で重ねて見る

## 2. 前提（Phase 1 からの継続）

- 既存の独立 Worker `supsup-dashboard`（TS / Cloudflare Worker / SSR / インライン SVG）に**加算**する。
- 期間セレクタ・認証・グラフ描画（svg/bar/line/heatmap）は Phase 1 の資産を再利用。
- Phase 1 の `history:latest`（予約実績）を、GA4 のトラフィックと**同一タイムラインで突き合わせ**できる（本 Phase の目玉）。

## 3. アーキテクチャ

### 3.1 データ取得の方式（推奨: ダッシュボードが GA4 Data API を直接叩く）

```
[dashboard Worker]
  ├─ GA4 Data API (analyticsdata.googleapis.com/v1beta:runReport) を期間指定で問い合わせ
  │    認証: サービスアカウントの JWT(RS256) を Web Crypto で署名 → oauth2 で access_token 取得
  │    → DASH KV に日次キャッシュ（キー例 ga4:${report}:${start}:${end}、TTL 半日〜1日）
  ├─ KV DATA(read-only) の history:latest（予約実績）と同一期間で結合
  └─ SSR で /traffic セクション（または新カード群）を描画
```

- **GA4 Data API は集計クエリ API**（ディメンション×メトリクスを期間指定で取得）。レスポンスは小さく、オンデマンド＋キャッシュが最適。→ **sync は不要**（Phase 2 は dashboard 内で完結）。
- **サービスアカウント JWT 署名は Worker 上で可能**：Web Crypto の `RSASSA-PKCS1-v1_5`(SHA-256) で PEM 秘密鍵をインポートして署名 → `https://oauth2.googleapis.com/token` で `urn:ietf:params:oauth:grant-type:jwt-bearer` により access_token を取得（scope `https://www.googleapis.com/auth/analytics.readonly`）。access_token も DASH KV に短期キャッシュ（〜55分）。

### 3.2 認証情報（推奨: 既存サービスアカウントの再利用）

- 既存 GCP プロジェクト `urakata-calendar` のサービスアカウント **`urakata-sync@urakata-calendar.iam.gserviceaccount.com`** に、**GA4 プロパティの「閲覧者」**を付与すれば再利用できる（Calendar/Sheets と同じ主体）。
- dashboard の Worker Secret に **サービスアカウント JSON**（`client_email` と `private_key`）を格納。改行を含むため **base64 で1シークレット**に入れて起動時にデコードするのが安全。
- 必要 Secret: `GA4_SA_JSON_B64`（SA鍵のbase64）、`GA4_PROPERTY_ID`（数値プロパティID）。

### 3.3 コンポーネント境界（新規ユニット）

- `src/ga4/auth.ts` — SAのJWT署名(RS256/Web Crypto)＋access_token取得＋KVキャッシュ。純粋部（JWTクレーム生成）は単体テスト可能に。
- `src/ga4/client.ts` — `runReport(property, {dateRange, dimensions, metrics})` の薄いラッパ＋DASH KVキャッシュ＋fetch注入（テスト用）。
- `src/ga4/reports.ts` — 画面が必要とする定型レポート（チャネル別/ページ別/source-medium/デバイス/地域/日次セッション）を GA4 リクエストに変換し、結果を描画用に整形する純関数群。
- `src/metrics/traffic.ts` — GA4 の日次セッションと `history:latest` の日次予約を結合する純関数（認知→予約の相関）。
- `src/charts/donut.ts`（新）— チャネル構成用のドーナツ/横棒。既存 svg.ts を再利用。
- `src/handlers.ts` / `src/pages.ts` — `/`（または新 `/traffic`）に GA4 セクションを追加。GA4 未設定/失敗時は Phase 1 部分は通常表示（天候と同じ try/catch フォールバック方針）。

## 4. 画面（Phase 2）

1. **流入チャネル構成**：Default Channel Group 別の sessions/users（ドーナツ＋表）。→ 認知の入口の内訳
2. **参照元/メディア Top**：source/medium 上位（Instagram・Google 等を判別）
3. **人気ページ Top**：pagePath 別 views（予約ページの閲覧状況）
4. **デバイス・地域**：deviceCategory、region（都道府県）
5. **認知→予約の重ね描き**：GA4 日次セッション（折れ線）と `history:latest` 日次予約（棒）を同一タイムラインで重ねる。→ トラフィックが予約に効いているかを一目で
6. **戦略インサイト（GA4版）**：決定論ルールで「Instagram流入 前月比 +X%」「Organic が流入の Y%」「モバイル比率 Z%」等

## 5. 技術方針

- GA4 は `runReport`（v1beta）を最小限のレポート数で叩く（画面あたり1〜数リクエスト）。キャッシュで日中の再計算を抑制。
- 期間は Phase 1 の期間セレクタに追従（GA4 の dateRange に変換）。
- グラフは Phase 1 同様インライン SVG（ドーナツのみ新規）。
- 失敗時フォールバック：GA4 セクションだけ「未接続/取得失敗」を表示し、他は通常描画。

## 6. スコープ外（Phase 2 では作らない）

- Instagram（Phase 3）・広告ROAS（Phase 4）。
- GA4 の生イベントストリーム/BigQuery エクスポート連携（runReport で足りる範囲に限定）。
- ユーザー個別のクロスデバイス同定など高度な分析。

## 7. 実装の進め方（Phase 1 と同様）

- メイン(Fable 5)＝設計・監査・レビュー、実装はサブエージェント委譲。
- 難所＝**Worker上のRS256 JWT署名とaccess_token取得**（`ga4/auth.ts`）。ここはメイン/Opus で慎重に。定型レポート整形・描画は Sonnet。
- TDD：JWTクレーム生成・GA4レスポンス整形・traffic結合は純関数で単体テスト。GA4 fetch はモック注入。

## 8. 成功基準

- ログイン後、選択期間で §4 の各カードが実データで表示される。
- GA4 未設定/失敗でも Phase 1 の画面は退行しない。
- 認知→予約の重ね描きが同一期間で描ける。
- ga4/auth・reports・traffic に単体テストがあり typecheck+test 通過。

## 9. 確認事項（ユーザー決定が必要 — これが埋まれば plan 化）

1. **GA4 は導入済みで計測が回っているか**、対象サイト（自社予約ページ等）と **GA4 プロパティID（数値）**。
2. **認証主体**：既存 SA `urakata-sync@urakata-calendar.iam.gserviceaccount.com` を GA4「閲覧者」に追加して再利用する／新規SAを作る、のどちら。
3. **予約の計測**：GA4 側に「予約完了」等の**コンバージョンイベント**が設定されているか（あればファネル/CVを出せる。無ければセッション×予約実績の重ね描きで代替）。
4. 予約サイトは**アソビュー（外部）**主体か、自社サイトにも予約導線があるか（GA4計測範囲＝何を"認知"と見なすか）。

> 注: 上記は本番接続のための情報で、実装コード自体は確認前でも骨組み（auth/client/reports のTDD雛形）を先行できる。
