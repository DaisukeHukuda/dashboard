# 実装計画：コホートインサイト（2026-09-07）
Spec: docs/superpowers/specs/2026-09-07-cohort-insights-design.md。TDD。1タスク=1コミット。

## Task 1: `src/metrics/cohortInsights.ts` と `test/cohort-insights.test.ts`
- spec のグループ1〜5を純関数で実装。`firstVisitMap`（src/repeat.ts）・`ymOf`/`monthsBetween`（src/util.ts）・`InsightGroup`（src/metrics/insights.ts）を再利用。
- 各グループの省略条件と hint の境界をテスト。

## Task 2: 配線と表示
- `DashboardData.cohortInsights`、handlers.ts、pages.ts sections.cohort（注記→インサイト→同一人物注記→表）、dashboard.test.ts。
