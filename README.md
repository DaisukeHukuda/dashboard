# supsup-dashboard

Sup! Sup! マーケティング分析ダッシュボード（Phase 1）。
既存 web の KV `DATA` を read-only 参照し、`history:latest`（sync が公開する完了予約履歴）を集計して表示する。

## 表示ビュー
左サイドバー（またはスマホではタブ）でメディア別に表示を切り替えられる。URLクエリ `?view=bookings|web|sns|all` で指定（既定は `bookings`＝予約分析）。`web`=GA4のWebサイト分析、`sns`=Instagram分析、`all`=全ブロック表示。

## 期間・粒度パラメータ
対象期間は `?period=` で指定する。`last12`（既定・直近12ヶ月）／`last24`（直近24ヶ月）／`all`（全期間）／`YYYY`（年指定、例 `2026`）／`YYYY-MM`（月指定、例 `2026-08`）／`custom`（`&from=YYYY-MM-DD&to=YYYY-MM-DD` と併用、任意期間）。不正な値は既定の `last12` にフォールバックする。
トレンドの表示粒度は `?g=month|week|day` で指定する。期間が92日以下なら既定は `day`（`day/week/month` すべて選択可）、それより長い期間は既定 `month`（`week/month` のみ選択可）。許容外の値を指定した場合は既定粒度にフォールバックする。

## セットアップ
1. `npm install`
2. `npx wrangler kv namespace create DASH` → 出力の id を `wrangler.toml` の DASH に貼る
3. Secrets を設定:
   - `npx wrangler secret put ADMIN_USER`
   - `npx wrangler secret put ADMIN_PASSWORD`
   - `npx wrangler secret put SESSION_SECRET`
4. `npx wrangler deploy`
5. IG フォロワー数は Cron Trigger（`0 16 * * *` UTC = JST 01:00）で毎日記録。`wrangler deploy` で自動登録される。

## ローカル
`.dev.vars` に ADMIN_USER/ADMIN_PASSWORD/SESSION_SECRET を置き、`npx wrangler dev`。

## 前提（sync 側）
sync の GitHub Secrets に `HISTORY_SALT`（電話ハッシュのソルト）を**必ず設定する**。未設定の場合、sync は履歴公開を中止する（公開既定ソルトで電話ハッシュを弱めないための安全策）。カレンダー同期・repeats 公開には影響しない。

## 依存関係
- web の `/ingest-history` が `history:latest` を書く（web 側 Task 6）。
- sync が毎晩 `publishHistory` で履歴を送る（sync 側 Task 4-5）。
