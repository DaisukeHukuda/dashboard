# 実装計画：コホートカードのレイアウト改善（2026-09-07）

Spec: docs/superpowers/specs/2026-09-07-cohort-layout-design.md。TDD。1タスク=1コミット（日本語メッセージ・Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>）。

## Task 1: 集計に within3 / yearLater を追加
- test/cohort.test.ts にユニーク人数のテストを追加（失敗を確認）
- src/metrics/cohort.ts: CohortRow に2項目、計算は cohort→Set<phoneHash>（offset 1..3 / 11..13）
- handlers.ts の呼び出しを `computeCohorts(all, 13)` に
- typecheck + test green → commit

## Task 2: HTMLテーブル描画＋CSS＋配線
- test/cohortgrid.test.ts 新規（spec §5）、dashboard.test.ts に todayYm と cohort-pc/cohort-sp のアサーション（失敗を確認）
- src/charts/cohortgrid.ts を HTML 化（spec §2）、pages.ts の CSS（§3）と sections.cohort・DashboardData.todayYm・注記（§4）、handlers.ts で todayYm を渡す
- 既存の charts テストで renderCohortGrid の SVG 前提があれば spec に合わせて更新
- typecheck + test green → commit
