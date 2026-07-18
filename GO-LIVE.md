# Go-Live ランブック（マーケダッシュボード 本番反映）

> ## 実施状況（2026-07-16 更新）
> - ✅ **Step 1 完了**: web デプロイ済み（/ingest-history=401確認・トップ200＝ビューアー無事）
> - ✅ **Step 2 完了（2026-07-16 15:47 JST）**: HISTORY_SALT Secret作成（Claude がAPI経由で登録・64桁ランダム）＋ sync.yml env 2行追加（ユーザーがWebエディタで `3457f67`）＋ 初回履歴投入成功。Actions run 29477499072 で `[sync] history published 3482 records`。KV `history:latest` に 3482件（2017〜2026年・source正規化済み・PIIなし）を実確認。`HISTORY_SYNC_HOURS` は `3` に戻し済み
> - ✅ **Step 3 完了**: DASH KV作成（`02774304…`）・Secrets 3点設定・デプロイ・ログイン〜全カード描画をE2E確認済み。URL: `https://supsup-dashboard.ymty.workers.dev`
> - ✅ **Step 4 完了（2026-07-17）**: GA4接続済み。ユーザーがSA閲覧者追加＋Analytics Data API有効化（プロジェクト16135446221）、Claude が鍵JSON疎通テスト（sessions_7days=1360取得OK）→ Secrets `GA4_SA_JSON_B64`/`GA4_PROPERTY_ID` 登録 → デプロイ（Version 57a3a607）。※ダッシュボード上のGA4カード表示はユーザー目視確認待ち
> - ✅ **Step 5 完了（2026-07-18）**: Instagram接続済み。Metaアプリ `supsup-inst`（ID 1050110217698332・ユースケース「Instagramでメッセージとコンテンツを管理」のFacebookログイン方式・4権限テスト準備完了）で長期トークン発行→交換（**有効期限 約60日＝2026-09-15頃失効**）。IGユーザーID `17841403433521466`（@supsupnikko・フォロワー3788）。疎通テスト（アカウント/insights/media）合格→ Secrets `IG_ACCESS_TOKEN`/`IG_USER_ID` 登録→デプロイ（Version 31c4bf38）。※トークン再発行時は同アプリのグラフAPIエクスプローラで再生成→交換→Secret更新

Phase 1〜3 のコードは完成済み。本番で動かすための**ユーザー作業**を、正しい順番で記載する。
上から順に実行すること（依存関係がある）。各ステップに**確認方法**を付けた。

> 記法: `…/urakata-calendar` = `/Users/daisukefukuda/Downloads/Often Use/AI（Model, Obsidian, etc）/Claude/Projects/urakata-calendar`（sync/web の置き場所）
> `…/web-marketing-dashboard` = `/Users/daisukefukuda/Downloads/Often Use/AI（Model, Obsidian, etc）/Claude/Projects/web-marketing-dashboard`（**dashboard 本体。2026-07-16 に urakata-calendar/dashboard から移動**）
> フォルダ名に全角括弧を含むため、シェルでは必ずダブルクオートで囲むこと。

---

## ⚠️ 最重要：先に読むこと

**`sync.yml` に `HISTORY_SALT` を追加しないと、履歴データは永久に公開されません。**

- sync のコードは「`HISTORY_SALT` 未設定なら履歴公開を中止」する安全設計（公開既定ソルトで電話ハッシュを弱めないため）。
- 現在の `.github/workflows/sync.yml` の env ブロックに `HISTORY_SALT` が**無い**ため、Secret を登録しただけでは sync プロセスに渡りません。
- **ワークフローファイルは Claude から push できません**（PATに `workflow` スコープが無い）。**GitHub の Web エディタで編集**してください。

**さらに**：履歴スイープは **JST 3時台の定時実行でしか走りません**（手動 Run workflow でも走らない）。初回投入は「3時台を待つ」か「`HISTORY_SYNC_HOURS` で一時的に今の時刻を指定する」かの二択です（Step 2-D 参照）。

---

## Step 1｜web をデプロイ（`/ingest-history` 追加）

```bash
cd "…/urakata-calendar/web" && npx wrangler deploy
```

**確認**: デプロイ成功ログ。エンドポイント疎通（401が返れば存在OK）:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://supsup-urakata-calendar.ymty.workers.dev/ingest-history
# 期待: 401（unauthorized＝ルートは存在し、Bearer認証が効いている）
# 404 なら未デプロイ
```

---

## Step 2｜sync に履歴公開を通す

### 2-A. GitHub Secret `HISTORY_SALT` を作成
GitHub → sync リポジトリ（`DaisukeHukuda/urakata-calendar`）→ Settings → Secrets and variables → Actions → **New repository secret**
- Name: `HISTORY_SALT`
- Value: **長いランダム文字列**（電話番号ハッシュのソルト。一度決めたら変えない＝変えると過去のリピート判定と繋がらなくなる）
  - 生成例: `openssl rand -hex 32`

### 2-B.（必須）`sync.yml` の env に追加 ← **GitHub の Web エディタで**
`https://github.com/DaisukeHukuda/urakata-calendar/edit/main/.github/workflows/sync.yml`

env ブロック（`WEB_INGEST_SECRET` の下あたり）に **2行追加**:
```yaml
          HISTORY_SALT: ${{ secrets.HISTORY_SALT }}
          HISTORY_SYNC_HOURS: ${{ vars.HISTORY_SYNC_HOURS }}
```
- 1行目が**必須**（これが無いと履歴は絶対に公開されない）。
- 2行目は任意だが、**初回投入をすぐ試すために強く推奨**（2-D で使う）。未設定なら既定の JST 3時台のみ。

### 2-C. sync をプッシュ
```bash
cd "…/urakata-calendar/sync" && git pull --rebase && git push
```
（ローカルに `HistoryRecord` 生成・`publishHistory`・main.ts配線のコミットがある。2-B を先に Web で編集した場合、`git pull --rebase` で取り込んでから push。）

### 2-D. 履歴を今すぐ投入する（任意・推奨）
GitHub → Settings → Secrets and variables → Actions → **Variables** タブ → New variable
- Name: `HISTORY_SYNC_HOURS` / Value: **今の JST の時（0〜23の数字）**。例: 14時台なら `14`

→ Actions → sync ワークフロー → **Run workflow**

**確認**（Actions のログ）:
- ✅ `[sync] history published NNNN records` が出れば成功
- ❌ `HISTORY_SALT 未設定のため履歴公開を中止` → 2-A/2-B が未完了
- ❌ `history sweep skipped (light run)` → 時刻ゲートに弾かれた（`HISTORY_SYNC_HOURS` が今の時と一致していない、または 2-B の2行目未追加）

**投入できたら `HISTORY_SYNC_HOURS` を `3` に戻す**（または Variable を削除＝既定の3時台に戻る）。毎回フル履歴を取ると重い。

---

## Step 3｜dashboard をデプロイ

### 3-A. DASH KV namespace を作成（**GA4/IGのキャッシュに必須**）
```bash
cd "…/web-marketing-dashboard"
npx wrangler kv namespace create DASH
```
出力される `id = "xxxxxxxx"` を `wrangler.toml` の DASH 行に貼る（現在は `REPLACE_AFTER_kv_namespace_create` というプレースホルダ）:
```toml
kv_namespaces = [
  { binding = "DATA", id = "a237d8666bc742419b1805c6dc40017d" },
  { binding = "DASH", id = "ここに新しいid" },
]
```
> `DATA` は既存 web と同じ namespace を **read-only 参照**（変更しない）。

### 3-B. Secrets を設定（ログイン用）
```bash
cd "…/web-marketing-dashboard"
npx wrangler secret put ADMIN_USER          # 例: admin
npx wrangler secret put ADMIN_PASSWORD      # 強いパスワード
npx wrangler secret put SESSION_SECRET      # openssl rand -hex 32 等の長いランダム
```

### 3-C. デプロイ
```bash
npx wrangler deploy
```

**確認**: 発行されたURL（`https://supsup-dashboard.<subdomain>.workers.dev`）にアクセス
- ログイン画面が出る → 3-B の資格情報でログイン
- **Step 2 完了後なら**：KPI・トレンド・ヒートマップ・天候・コホート・コース別に**実データ**が出る
- Step 2 未完了だと**すべて空**（0件）。その場合は Step 2 のログを確認

---

## Step 4｜GA4 をライブ接続（Phase 2）

### 4-A. サービスアカウントに GA4 の閲覧権限
GA4 管理画面 → プロパティ **`312598868`**（supsup.jp）→ **アクセス管理** → ユーザーを追加
- メール: `urakata-sync@urakata-calendar.iam.gserviceaccount.com`
- 役割: **閲覧者**

### 4-B. Secrets を設定
サービスアカウントの鍵JSON（GCP → IAM → サービスアカウント → キー）を base64 にして登録:
```bash
cd "…/web-marketing-dashboard"
base64 -i /path/to/service-account.json | tr -d '\n' | npx wrangler secret put GA4_SA_JSON_B64
npx wrangler secret put GA4_PROPERTY_ID     # 値: 312598868
npx wrangler deploy
```

**確認**: ダッシュボードを再読み込み
- 「Web流入（GA4）」のカード群が表示される（チャネル構成ドーナツ・参照元・人気ページ・デバイス/地域・認知→予約の重ね描き）
- 「GA4は未接続です」のままなら：4-A の権限付与漏れ / Secret未設定 / **DASH KV が未作成**（3-A）のいずれか

---

## Step 5｜Instagram をライブ接続（Phase 3）

### 5-A. Facebook アプリと長期トークン
1. [developers.facebook.com](https://developers.facebook.com) で**ビジネス系アプリ**を作成
2. IGビジネスアカウント（FBページ連携済み）に対し、権限 `instagram_basic` / `instagram_manage_insights` / `pages_read_engagement` を付与
3. **長期アクセストークン**（約60日）を発行
4. **IGユーザーID**（`17841…` で始まる数字。**FBページIDではない**）を控える

### 5-B. Secrets を設定
```bash
cd "…/web-marketing-dashboard"
npx wrangler secret put IG_ACCESS_TOKEN     # 長期トークン
npx wrangler secret put IG_USER_ID          # 17841…
npx wrangler deploy
```

**確認**: ダッシュボードを再読み込み
- 「Instagram（SNS）」のカード群が表示される（フォロワー推移・リーチ・投稿別エンゲージメント・投稿×予約）
- **フォロワー推移は初回は空**（「まだ蓄積がありません」）→ **仕様どおり**。日次スナップショットを今日から貯め始めるため、翌日以降グラフになる（過去は遡れない）
- リールやカルーセルは insights 指標の制限で **0 と表示されることがある**（バグではない）

### 5-C. トークンの更新（約60日ごと）
長期トークンは約60日で失効。失効すると**自動で「Instagram未接続」に戻る**（他機能は無事）。
→ 再発行して `npx wrangler secret put IG_ACCESS_TOKEN` で更新。カレンダーにリマインダを入れておくと安全。

---

## 完了チェックリスト

- [x] Step 1: web デプロイ済み（`/ingest-history` が 401 を返す）
- [x] Step 2: `HISTORY_SALT` Secret 作成 ＋ **sync.yml の env に追加（Web エディタ）** ＋ sync push
- [x] Step 2: Actions ログに `[sync] history published NNNN records`（3482件・run 29477499072）
- [x] Step 2: `HISTORY_SYNC_HOURS` を `3` に戻した（または削除）
- [x] Step 3: DASH KV 作成＋wrangler.toml 更新／Secrets 3点／deploy
- [ ] Step 3: ログインして Phase 1 の全カードに実データ（KVには3482件確認済み。**ユーザーがログインして目視確認**）
- [x] Step 4: GA4 に SA を閲覧者追加／Analytics Data API有効化／Secrets 2点／deploy（カード表示はユーザー目視待ち）
- [x] Step 5: FBアプリ＋長期トークン／Secrets 2点／deploy（IGカード表示はユーザー目視待ち）
- [ ] Step 5: トークン更新リマインダ（**2026-09-15頃失効**。9月上旬に再発行→`wrangler secret put IG_ACCESS_TOKEN`）

## トラブル時の切り分け

| 症状 | 原因の見当 |
|---|---|
| ダッシュボードが全部0件 | Step 2 未完（`history:latest` が無い）。Actions ログを見る |
| `history published` が出ない | `HISTORY_SALT` 未設定 or **sync.yml の env に未追加** |
| `history sweep skipped (light run)` | 時刻ゲート。JST3時台を待つか `HISTORY_SYNC_HOURS` を今の時に |
| GA4だけ「未接続」 | SA権限／Secrets／**DASH KV未作成**のどれか |
| Instagramだけ「未接続」 | トークン失効／権限不足／IG_USER_ID がFBページID |
| フォロワー推移が空 | **仕様**（今日から蓄積・過去は遡れない） |

> Phase 1/2/3 は互いに独立してフォールバックする設計。GA4やIGが未接続でも、**予約データ（Phase 1）の分析は常に表示される**。
