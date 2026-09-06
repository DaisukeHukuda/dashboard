# 設計書：コホート再訪率カードの高さ抑制・見出し固定・スマホ要約表（2026-09-07）

ユーザー承認済み。対象は「リピーター・コホート再訪率（初回月別・全期間）」カードのみ。集計の元データ・同一人物判定（phoneHash）・「全期間」の扱いは不変。

## 1. 集計（`src/metrics/cohort.ts`）
- `computeCohorts(all, maxOffset)` の `CohortRow` に2項目を追加:
  - `within3: number` … 初回月の **+1〜+3ヶ月** に1回でも参加した **ユニーク人数**
  - `yearLater: number` … **+11〜+13ヶ月** に1回でも参加したユニーク人数
  - どちらも同じ人が複数月に来ても1人と数える（retention の合計とは異なる）。
- 呼び出し側（`src/handlers.ts`）は `computeCohorts(all, 13)` にする（yearLater が +13 を必要とするため）。PC表の列は **+0〜+12 の13列のまま**（retention の先頭13要素だけ描く）。
- 行順は **新しい初回月が上**（呼び出し側かレンダラで降順。レンダラ側で `sort` し、集計関数の順序は変えない）。

## 2. 描画（`src/charts/cohortgrid.ts` を HTML テーブルに置き換え）
- `renderCohortGrid(rows: CohortRow[], todayYm: string): string` … **SVGをやめ、HTMLを返す**。出力は次の2ブロックを両方含む（CSSで幅により片方だけ表示）:
  1. `<div class="cohort-wrap cohort-pc"><table class="cohort">…</table></div>` … 全列表
     - thead: 「初回月(人数)」＋ `+0m … +12m`。`position: sticky; top: 0`。
     - 各行の1列目 `<th scope="row">2024-08 (120)</th>` は `position: sticky; left: 0`。
     - セル: `Math.round(rate*100)%`、背景は `rgba(30,58,95, 0.1+0.9*rate)`、+0m は紺ベタ・白文字（従来と同じ配色）。rate>0.5 も白文字。
     - **未来セル**: `monthsBetween(cohort, todayYm) < k` のとき、背景 `#f3f4f6`・文字 `—`・`class="future"`・`title="まだ時期が来ていません"`。
  2. `<div class="cohort-wrap cohort-sp"><table class="cohort">…</table></div>` … 要約表
     - 列: 初回月 / 人数 / 3ヶ月以内 / 1年後。値は `within3/size`・`yearLater/size` を `%` 表示。
     - 未来の扱い: 「3ヶ月以内」は `monthsBetween(cohort, todayYm) < 3` なら `—`（まだ3ヶ月経っていない）、「1年後」は `< 13` なら `—`。
     - thead は sticky top。
- 空データ（rows.length===0）は「データがありません」の `<p>` を返す。
- レンダラ内で `escXml` ではなく `esc`（pages.ts）でエスケープ。ただし pages.ts→cohortgrid.ts の循環importを避けるため、cohortgrid は `esc` を自前の小関数で持つか `../pages.js` から import しない（`src/charts/svg.ts` の `escXml` はテキスト用途に流用可＝`&<>"'` をエスケープする既存関数）。

## 3. CSS（`src/pages.ts` の layout CSS）
- `.cohort-wrap{max-height:320px;overflow:auto;border:1px solid var(--line);border-radius:8px}`
- `.cohort{border-collapse:separate;border-spacing:0;font-size:11px;min-width:100%}`
- `.cohort th,.cohort td{padding:4px 6px;text-align:center;white-space:nowrap}`
- `.cohort thead th{position:sticky;top:0;background:#fff;z-index:2;color:var(--muted);font-weight:400;border-bottom:1px solid var(--line)}`
- `.cohort tbody th{position:sticky;left:0;background:#fff;z-index:1;text-align:left;font-weight:400;border-right:1px solid var(--line)}`
- `.cohort thead th:first-child{left:0;z-index:3}`
- `.cohort-sp{display:none}` ／ `@media(max-width:899px){.cohort-pc{display:none}.cohort-sp{display:block}}`（既存のブレークポイント 899px に合わせる）
- 要約表のスマホ側は `max-height:360px`。

## 4. 配線
- `src/pages.ts` sections.cohort: `renderCohortGrid(d.cohorts, d.todayYm)`。`DashboardData` に `todayYm: string` を追加し、`handlers.ts` で `ymOf(today)` を渡す（テスト用フィクスチャ `test/dashboard.test.ts` にも追加）。
- カード見出しの下に1行の注記（13px muted）: 「行=初めて参加した月、列=その何ヶ月後に再び参加した割合。灰色は未来。スマホでは要約（3ヶ月以内／1年後の再訪率）を表示」。

## 5. テスト
- cohort.test.ts: `within3`（+1〜+3 に2回来た人が1人と数えられる／+4 は含まない）、`yearLater`（+11・+13 は含む、+10・+14 は含まない）。
- cohortgrid.test.ts（新規、または charts テストに追加）: 新しい月が上／thead に `+12m` があり `+13m` が無い／未来セルが `class="future"` で `—`／+0m セルが 100%／要約表の値と `—` 条件／空データ文言。
- dashboard.test.ts: `todayYm` 追加でコンパイルが通ること、`cohort` セクションに `cohort-pc` と `cohort-sp` が含まれること。
- typecheck + vitest 全件 green。デプロイはユーザー承認後。
