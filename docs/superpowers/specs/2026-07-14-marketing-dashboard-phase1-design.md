# Sup! Sup! マーケティング分析ダッシュボード — Phase 1 設計書

- 日付: 2026-07-14
- 対象事業: Sup! Sup!（日光・中禅寺湖のSUP事業）
- 種別: 新規プロジェクト `dashboard`（既存 urakata-calendar の `sync` / `web` とは別プロジェクト）
- ステータス: 設計確定（実装計画待ち）

---

## 1. 背景と目的

Sup! Sup! のマーケティングを支援する Web ダッシュボードを作る。分析は手段であり、目的は**戦略判断の支援**。

ユーザーが答えを出したい戦略問い（優先度順にすべて対象）:

1. 集客・売上の伸ばし方
2. 需要の季節・曜日・天候傾向
3. リピーター・顧客定着
4. 流入経路・認知の拡大

全チャネル（予約データ・Webアクセス解析・SNS・広告）を一度に作るのではなく、**ステップ分割**で開発する。本書は **Phase 1（予約データを土台にしたマーケ分析）** の設計。

### 全体ロードマップ

| Phase | 内容 | 答える問い | 前提 | 位置づけ |
|---|---|---|---|---|
| **1** | 予約データ・マーケ分析 | 集客・売上／季節・曜日・天候／リピーター | 予約データ（確実） | **本書** |
| 2 | GA4 連携 | 流入経路・認知の拡大 | Webサイト+GA4（準備あり） | 次段 |
| 3 | Instagram 連携 | SNS エンゲージ・認知 | IGビジネスアカウント（準備あり） | 次段 |
| 4 | 広告 ROAS | 費用対効果 | 広告アカウント（**未整備**） | 将来・保留 |

各 Phase は独立して spec → plan → implementation のサイクルを回す。

---

## 2. 前提となるデータ事情（既存 urakata-calendar の調査結果）

既存 web の KV（namespace `DATA`）の中身:

| KVキー | 中身 | カバー範囲 | Phase 1 での価値 |
|---|---|---|---|
| `reservations:latest` | 予約の詳細（コース名・人数・**合計金額**・氏名・電話・日付・ステータス）= `ReservationDTO[]` | **当月初〜今後のみ**（過去実績は入らない） | 現在パイプライン・コース構成・直近売上 |
| `repeats:latest` | 電話番号 → 参加日リスト（`Record<phone, string[]>`） | **2015年〜全履歴**（日付と電話のみ、金額・コースなし） | 季節/曜日の需要（件数）・リピート/コホート分析 |

**重要な発見**: `sync/src/main.ts`（L48-60）は毎晩 JST 3 時台に**詳細付きの全履歴（2015〜、金額・コース込み）を実際に取得している**が、`repeatVisitDates()` で「電話→日付」に縮約して他フィールドを捨てている。つまり過去の売上・コース詳細は「取得済みだが保存されていない」。

→ Phase 1 では、**この取得済み履歴を新 KV キーへロールアップ公開する小追加**を sync に入れ、過去の売上トレンド／コース別分析を可能にする（下記 §4）。

（フィールドは `sync/src/parser.ts` で確認: `courseName` / `status` / `phone` / `pax`（人数）/ `totalAmount`（合計金額）/ `customerName` / 参加日 を CSV から取得済み。）

---

## 3. アーキテクチャ

### 3.1 全体像

```
[sync] （既存・小追加）
  毎晩の履歴スイープで取得済みの詳細履歴(2015〜)
   └─ publishHistory() 追加 → POST /ingest-history（Bearer INGEST_SECRET）
        └─ web が KV DATA に history:latest として保存（氏名除去・電話ハッシュ済み）

[web]（既存・小追加）
  /ingest-history エンドポイント追加（既存 /ingest 系と同じ認証・保存パターン）

[dashboard]（新規 Cloudflare Worker: supsup-dashboard）
  ├─ KV DATA を read-only で参照 → reservations:latest / repeats:latest / history:latest
  ├─ KV DASH（新規・書き込み用）→ 天候キャッシュ・集計キャッシュ・（将来）GA4/IGトークン
  ├─ 認証: 既存 web と同じ session cookie 方式（ダッシュ専用の資格情報）
  └─ GET /（ログイン必須）→ SSR でダッシュボード HTML（インライン SVG グラフ）を返す
```

### 3.2 コンポーネント境界（各ユニットの責務）

- **sync 追加分**（`sync/src/web-publish.ts` に `publishHistory()`）
  - 入力: 既に main.ts が持つ詳細履歴 `Reservation[]`（2015〜）
  - 処理: 氏名を除去・電話をソルト付きハッシュ化・必要フィールドのみ抽出
  - 出力: `HistoryRecord[]` を web へ POST。**sync の既存処理には触れない（加算のみ）**
- **web 追加分**（`/ingest-history` ハンドラ）
  - 入力: Bearer INGEST_SECRET + `HistoryRecord[]`
  - 出力: KV `DATA` に `history:latest` として全置換保存
- **dashboard: データアクセス層**（`data.ts`）
  - KV から `reservations:latest` / `repeats:latest` / `history:latest` を読む純粋な取得関数。read-only。
- **dashboard: 集計層**（`metrics/*.ts`、純関数・依存なし）
  - KPI / トレンド / ヒートマップ / コホート / コース別 / 天候結合 / インサイト生成。
  - 入力は素のデータ配列、出力は描画用の集計オブジェクト。**I/O を持たず単体テスト可能**。
- **dashboard: 天候層**（`weather.ts`）
  - Open-Meteo Archive API（無料・キー不要）で中禅寺湖の日別過去天気を取得、`DASH` KV にキャッシュ。
- **dashboard: 描画層**（`charts/*.ts` + `pages.ts`）
  - 集計オブジェクト → インライン SVG（棒・折れ線・ヒートマップ・コホート格子）。外部ライブラリ無し。
- **dashboard: 認証・ルーティング**（`auth.ts` / `index.ts`）
  - 既存 web `auth.ts` のパターンを移植。

各ユニットは「何をするか・どう使うか・何に依存するか」が単独で説明でき、内部を読まずに責務が分かる粒度に保つ。

### 3.3 計算モデル

- 集計は**リクエスト時にオンザフライ**で行い、結果を `DASH` KV に短時間キャッシュ（例: 期間キー単位で数分〜数時間）。
- 予約規模は履歴でも数千件オーダーのため、オンザフライで十分軽い。将来重くなれば Cron Trigger による夜間プリ集計に移行できる（Phase 1 では不要 = YAGNI）。

---

## 4. sync への追加仕様（加算のみ・既存不変）

### 4.1 `history:latest` のデータ形

```ts
interface HistoryRecord {
  date: string;      // 参加日 JST 'YYYY-MM-DD'
  course: string;    // コース名
  pax: number;       // 人数
  amount: number;    // 合計金額（円。パース失敗時は 0）
  status: string;    // ステータス（確定/仮予約/リクエスト等）
  phoneHash: string; // 電話番号のソルト付きハッシュ（リピート判定用。復元不可）
}
// history:latest = HistoryRecord[]（sync が全置換で書く）
```

### 4.2 プライバシー方針

- **氏名は保存しない**。**電話はハッシュ化**のみ保存（リピート同一人物の紐付けに使う）。
- HANDOFF の「PII は sync 内のみで扱い KV に生で入れない」方針に沿う。
- ハッシュのソルトは sync の環境変数（GitHub Secrets）で管理。

### 4.3 実装ポイント

- `sync/src/web-publish.ts` に `publishHistory(webUrl, secret, records)` を追加。
- `sync/src/main.ts` の履歴スイープ成功時（`history` 取得済みの箇所）に `HistoryRecord[]` へ変換して `publishHistory` を呼ぶ。**既存の `publishRepeats` はそのまま残す**（web の予約ビューアーが依存）。
- web 側 `/ingest-history`（`handlers.ts` + `index.ts`）を既存 `/ingest` 系のコピー準拠で追加。KV キー `history:latest`。
- 失敗しても既存同期に影響しない（既存の try/catch 分離方針に合わせる）。

---

## 5. 画面仕様（Phase 1）

全画面ログイン必須・日本語 UI・期間セレクタ（例: 直近12ヶ月／年指定／全期間）を共通ヘッダーに持つ。

### 5.1 KPI サマリー帯
選択期間の主要指標をカード表示:
- 予約件数 / 総売上 / 客単価（売上 ÷ 組数）/ 総参加人数 / 新規・リピート比率 / **前年同期比 (YoY)**

### 5.2 売上・予約トレンド（→ 集客・売上の伸ばし方）
- 月次（切替で週次）の**売上（棒）＋件数（折れ線）**の複合グラフ。
- **前年同期を重ね描き**して伸び／落ちを可視化。

### 5.3 季節×曜日ヒートマップ（→ 季節・曜日傾向）
- 縦=月 / 横=曜日 の予約件数の濃淡。
- コース絞り込み。需要が集中する時期・曜日を判別。

### 5.4 天候相関（→ 天候傾向）
- 日別の**予約件数 × 天気（晴/曇/雨・気温・降水量）**。
- 雨天日の落ち込み度（例: 平均比 -XX%）を提示。
- データ源: Open-Meteo Archive API（中禅寺湖の緯度経度、無料・キー不要）。

### 5.5 リピーター分析（→ リピーター・顧客定着）
- 新規 vs リピートの推移。
- 再訪間隔の分布。
- **初回月別コホートの再訪率**（リテンションカーブ）。
- 判定は `phoneHash` 単位。「その予約日より前の参加が1回でもあればリピート」（既存 web の `priorVisitCount` と同じ定義）。

### 5.6 コース別内訳
- 期間内のコース別 売上・件数の構成（商品ミックス）。

### 5.7 戦略インサイト（決定論的な自動示唆）
- 上記集計から**ルールベースで**短いコメントを生成（LLM 不使用）。
- 例: 「週末は平日比 +40%」「6〜8月に予約の 70% が集中」「リピート率 32%（前年比 +5pt）」「雨天日は平均 -55%」。
- LLM によるナラティブ要約は将来オプション（Phase 1 では YAGNI）。

---

## 6. 技術方針

- **スタック**: TypeScript / Cloudflare Worker（SSR）/ wrangler。既存 web と統一し運用（`wrangler deploy`）を共通化。
- **グラフ**: サーバー描画の**インライン SVG**（棒・折れ線・ヒートマップ・コホート格子）。外部チャートライブラリ無し。既存の純 TS・軽量 JS 流儀に合わせ、CSP・依存を最小化。
- **認証**: 既存 web `auth.ts` の session cookie 方式を移植。ダッシュ専用の `ADMIN_USER` / `ADMIN_PASSWORD` / `SESSION_SECRET`。
- **テスト**: 集計純関数は vitest で TDD。typecheck + test を通してからコミット（既存慣習に準拠）。
- **デプロイ**: `dashboard/` で `npx wrangler deploy`（GitHub は後から提供予定。当面リモート無しでも可）。

---

## 7. 実装の進め方（トークン節約・サブエージェント委譲）

メインセッション（Fable 5）は**設計・監査・レビュー**に専念し、実装はサブエージェントへ委譲する。

| 作業 | 担当 |
|---|---|
| 足場（Worker 骨組み・wrangler.toml・ルーティング・認証移植） | Haiku / Sonnet |
| 集計純関数（KPI / コホート / ヒートマップ / 天候結合）＋ TDD | Sonnet |
| SVG グラフ描画 | Sonnet |
| sync 追加（履歴公開＋ハッシュ化）＋ web `/ingest-history` | Sonnet |
| 難所（コホート再訪率・YoY 整合・インサイト規則・天候相関）・設計・監査・レビュー | メイン（Fable 5）／必要に応じ Opus |

各サブエージェントの成果は typecheck + test を通し、メインがレビューして取り込む。

---

## 8. スコープ外（Phase 1 では作らない）

- GA4 / Instagram / 広告の連携（Phase 2〜4）。
- LLM による戦略ナラティブ生成。
- 予約データの書き換え・受付/金額調整などの運用機能（それは既存 web の役割）。
- 夜間プリ集計（オンザフライで足りるうちは不要）。

---

## 9. 成功基準（Phase 1）

- ログイン後、選択期間で §5.1〜5.7 が表示される。
- 過去（2015〜）の売上・件数トレンドが YoY 付きで見える（sync 追加が機能している）。
- 季節×曜日・天候・リピーター/コホートの各分析が実データで妥当な値を返す。
- sync の既存機能（カレンダー同期・予約ビューアー）が**一切退行しない**。
- 集計純関数に単体テストがあり、typecheck + test が通る。
