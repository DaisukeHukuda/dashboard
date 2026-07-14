# Phase 3 設計書（ドラフト）— Instagram 連携（SNSエンゲージ・認知）

- 日付: 2026-07-14
- 対象: Sup! Sup! マーケティング分析ダッシュボード / Phase 3
- ステータス: **DRAFT**（§9 の確認事項をユーザーに確認後に確定→plan へ）

---

## 1. 目的

Phase 1（予約）・Phase 2（GA4流入）に、**Instagram のSNS指標**を足して「認知の拡大」をSNS面から見る。

- フォロワーの増減
- リーチ／インプレッション（どれだけ見られているか）
- 投稿ごとのエンゲージメント（いいね・コメント・保存・リーチ）
- 投稿活動 × 予約 の関係（SNSが予約に効いているか）

## 2. 前提（Phase 1/2 からの継続）

- 既存の独立 Worker `supsup-dashboard` に**加算**。期間セレクタ・認証・SVG描画・DASH KVキャッシュ・「未接続フォールバック」方針を再利用。
- Phase 1 の `history:latest`（予約実績）と重ねて「投稿/リーチ × 予約」を見る（§4.4）。
- Instagram は Phase 2 の GA4 と同じく「**認知・検討の入口**」を測る。予約完了はアソビュー側で、SNSは直接CVを持たない。

## 3. アーキテクチャ

### 3.1 データ源：Instagram Graph API

- 対象は **Instagram ビジネス/クリエイターアカウント**（個人アカウントは不可）で、**Facebookページに連携**されている必要がある。
- アカウント指標: `GET /{ig-user-id}?fields=followers_count,media_count` と `GET /{ig-user-id}/insights?metric=reach,impressions,profile_views&period=day`。
- 投稿指標: `GET /{ig-user-id}/media?fields=id,caption,timestamp,media_type,permalink` → 各 `GET /{media-id}/insights?metric=reach,likes,comments,saved`（メディア種別で使える指標が異なる点に注意）。

### 3.2 認証（**難所：トークン運用**。GA4のSAより重い）

Instagram Graph API はサービスアカウント方式が無く、**Facebookアプリ＋長期アクセストークン**が要る:

- 前提: **Facebookアプリ**（ビジネス）を作成し、IGビジネスアカウント連携済みのFBページに対し、権限 `instagram_basic` / `instagram_manage_insights` / `pages_read_engagement` を付与。
- **長期トークン（約60日・更新可）**を発行し、dashboard の Worker Secret に格納（`IG_ACCESS_TOKEN`、`IG_USER_ID`）。
- **更新運用の選択肢**（60日で失効するため）:
  - (A) **手動更新**: 期限が近づいたらユーザーがトークンを再発行してSecret更新（最も単純・低頻度運用向け／推奨の初期形）。
  - (B) **自動延長**: dashboard か sync が期限前に `GET /refresh_access_token`（Instagram）または FBのトークン延長で更新し、新トークンをKV/Secretに保存（アプリシークレット要・実装重め）。
- Phase 3 初期は **(A) 手動更新**を採用（設定が単純）。将来必要なら (B) を追加。
- トークン欠如/失効/API失敗時は **「Instagram未接続」フォールバック**（Phase 1/2 は退行しない）。

### 3.3 フォロワー推移の扱い（重要）

- Instagram Graph API の `followers_count` は**現在値のスナップショット**で、過去の推移は遡って取れない。
- → **今から日次スナップショットを蓄積**する方式にする（`ig:followers:YYYY-MM-DD` を DASH KV に保存、または sync が日次で追記）。過去分は遡れない旨をUIに明記。
- リーチ/インプレッションは insights の期間指定で過去も取得可能（アカウント作成以降・APIの保持期間内）。

### 3.4 コンポーネント境界（新規ユニット）

- `src/ig/client.ts` — Graph API 呼び出しの薄いラッパ（トークン付与・DASH KVキャッシュ・fetch注入）。
- `src/ig/reports.ts` — アカウント指標・投稿一覧＋各投稿insights の取得と描画用整形（純部は単体テスト可能に）。
- `src/ig/followers.ts` — フォロワー日次スナップショットの読み書き（DASH KV）。
- `src/metrics/social.ts` — 投稿活動/リーチ × 予約(history) の月次重ね描き（純）。
- `src/ig/insights.ts` — SNS版 決定論インサイト（純）。
- `src/ig/section.ts` — Instagramカード群の描画（未接続フォールバック付き）。
- `src/handlers.ts` / `src/pages.ts` — env拡張・IG取得(try/catch)・home へ組み込み。

## 4. 画面（Phase 3）

1. **フォロワー推移**：日次スナップショットの折れ線（蓄積開始以降）。
2. **リーチ／インプレッション推移**：アカウントinsightsの時系列。
3. **投稿別エンゲージメント Top**：投稿サムネ/キャプション先頭＋reach/likes/comments/saved（保存数は保存意欲の指標）。
4. **投稿 × 予約 重ね描き**：月次の投稿数（またはリーチ）と予約件数を重ねる（§Phase2 と同型の overlay）。
5. **SNSインサイト**：決定論ルールで「フォロワー前月比 +X」「平均エンゲージ率 Y%」「保存が多い投稿の傾向」等。

## 5. 技術方針

- Graph API の呼び出しは最小限（アカウント1、メディア一覧1＋上位N件のinsights）。DASH KVキャッシュ（数時間）＋フォロワーは日次スナップショット。
- 期間は Phase 1 の期間セレクタに追従。
- グラフは既存インライン SVG を再利用（投稿サムネは permalink 画像を貼るとCSP/外部依存が増えるため、初期は**サムネ無し**でテキスト＋数値に留める）。
- 失敗時フォールバック：Instagramカードだけ「未接続」表示。

## 6. スコープ外（Phase 3 では作らない）

- 投稿の予約・自動投稿（分析専用）。
- コメントのセンチメント分析・ハッシュタグ分析（将来余地）。
- 広告（Phase 4）。
- トークンの完全自動延長（初期は手動更新。必要になれば追加）。

## 7. 実装の進め方（Phase 1/2 と同様）

- メイン(Fable 5)＝設計・監査・レビュー、実装はサブエージェント委譲。
- 難所＝**トークン運用**（失効ハンドリング＋未接続フォールバック）と**メディア種別ごとに使えるinsights指標の差異**。ここは慎重に。
- TDD：client/reports/followers/social/insights は fetch/KV をモックして単体テスト。ライブIGは叩かない。

## 8. 成功基準

- ログイン後、選択期間で §4 の各カードが実データで表示される。
- IG未設定/失敗でも Phase 1/2 は退行しない。
- 投稿(またはリーチ)×予約の重ね描きが同一期間で描ける。
- 各純関数に単体テストがあり typecheck+test 通過。

## 9. 確認事項（ユーザー決定が必要 — これが埋まれば plan 化）

1. **Instagram アカウントはビジネス/クリエイターか**、そして**Facebookページに連携済み**か（個人アカウントだと Graph API 不可）。
2. **Facebookアプリ**を作成できるか（アプリID/シークレット、`instagram_basic`/`instagram_manage_insights`/`pages_read_engagement` 権限、長期トークン発行）。ここが Phase 3 の最大の準備コスト。
3. **フォロワー推移**は「今から日次スナップショットを蓄積」（過去分は遡れない）で良いか。
4. トークン更新は当面**手動（60日ごとに再発行してSecret更新）**で良いか、自動延長まで作るか。
5. 投稿サムネイル表示は要るか（初期はテキスト＋数値で軽量にする想定）。

> 注: 認証(トークン)以外の骨組み（client/reports/followers/social/insights/section の TDD 雛形）は確認前でも先行可能。ただし Instagram はアプリ＆トークンの準備が GA4 より重いため、まず §9-1/2 の実現性を確認するのが安全。
