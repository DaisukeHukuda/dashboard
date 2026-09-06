# 設計書：ブラウザタブのアイコン（favicon）（2026-09-06）

ユーザー承認済み（3案から A を選択）。

## デザイン
- 紺（ダッシュボードのアクセント色 `#1e3a5f`）の角丸四角（rx=14/64）に、白の太字「S!」。
- SVG 1枚で全サイズに対応（拡大しても粗くならない）。文字はシステムフォント（Helvetica Neue / Arial 系）に依存する。
- 対象はブラウザのタブ・ブックマークのアイコンのみ。スマホのホーム画面追加用 PNG（apple-touch-icon）は今回は作らない。

## 実装
- `src/favicon.ts`: `FAVICON_SVG` 定数（SVG 文字列）。
- `src/index.ts`: 認証の**前**に `GET /favicon.svg` → `image/svg+xml`、`cache-control: public, max-age=86400`。`GET /favicon.ico` → `/favicon.svg` へ 302（link 未対応のクライアントがログインHTMLをアイコンとして受け取るのを防ぐ）。
- `src/pages.ts` `layout()`: `<link rel="icon" type="image/svg+xml" href="/favicon.svg">` を head に追加（ログイン画面・ダッシュボード両方）。

## テスト
- 未認証で `/favicon.svg` が 200・`image/svg+xml`・`<svg` を含む。`/favicon.ico` が 302 で Location が `/favicon.svg`。
- `layout()` の出力に `rel="icon"` の link がある。
