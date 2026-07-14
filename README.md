# supsup-dashboard

Sup! Sup! マーケティング分析ダッシュボード（Phase 1）。
既存 web の KV `DATA` を read-only 参照し、`history:latest`（sync が公開する完了予約履歴）を集計して表示する。

## セットアップ
1. `npm install`
2. `npx wrangler kv namespace create DASH` → 出力の id を `wrangler.toml` の DASH に貼る
3. Secrets を設定:
   - `npx wrangler secret put ADMIN_USER`
   - `npx wrangler secret put ADMIN_PASSWORD`
   - `npx wrangler secret put SESSION_SECRET`
4. `npx wrangler deploy`

## ローカル
`.dev.vars` に ADMIN_USER/ADMIN_PASSWORD/SESSION_SECRET を置き、`npx wrangler dev`。

## 前提（sync 側）
sync の GitHub Secrets に `HISTORY_SALT` を設定（電話ハッシュのソルト）。未設定でも既定値で動くが、本番は必ず設定する。

## 依存関係
- web の `/ingest-history` が `history:latest` を書く（web 側 Task 6）。
- sync が毎晩 `publishHistory` で履歴を送る（sync 側 Task 4-5）。
