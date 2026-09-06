# 設計書：コホート再訪率カードのインサイト（2026-09-07）

ユーザー承認済み。「リピーター・コホート再訪率」カードの表の上に、既存と同じ形式（`InsightGroup[]` → `renderInsightGroups`）でインサイトを出す。対象は全期間・参加日ベース・phoneHash で同一人物判定。比較に必要な人数がなければその行／グループを出さない（無理に断定しない）。

## 集計（新規 `src/metrics/cohortInsights.ts`）
`buildCohortInsights(input: { all: HistoryRecord[]; cohorts: CohortRow[]; today: string /* YYYY-MM-DD */ }): InsightGroup[]`

共通: `first = firstVisitMap(all)`（phoneHash→初回参加日）。phoneHash 空は除外。`todayYm = ymOf(today)`。人ごとの「再訪」は **初回月より後の月**の参加（`monthsBetween(firstYm, ym) >= 1`）。同じ月内の2回目は再訪に数えない（コホート表の定義と統一）。`pct(a,b) = Math.round(a/b*100)`。

### 1. リピートの全体像（title: 'リピートの全体像'）
- N = 初参加者のユニーク人数、M = 再訪した人数。
- text: `初参加 ${N}人のうち、2回目以降も来た人 ${M}人（${pct}%）`
- hint: pct ≥ 20 → `→ 5人に1人以上が戻っている`／10 ≤ pct < 20 → `→ 10人に1〜2人が戻る水準`／pct < 10 → `→ 戻る人は10人に1人未満`
- N < 20 ならグループごと省略。

### 2. 戻ってくるタイミング（title: '戻ってくるタイミング'）
- 再訪した各人について gap = 初回月から **最初の再訪月** までの月数。バケット: 1〜3 = `3ヶ月以内`、11〜13 = `翌年の同時期`、それ以外 = `それ以外`。
- text: `再訪した人の内訳: 3ヶ月以内 ${a}%／翌年の同時期（11〜13ヶ月後） ${b}%／それ以外 ${c}%`（M に対する割合、四捨五入）
- hint: a > b → `→ 同じシーズン中に戻る人が多い`／b > a → `→ 翌シーズンに戻る傾向`／a === b → hint なし
- M < 10 なら省略。

### 3. 年ごとの定着率（title: '年ごとの定着率（1年後に戻った割合）'）
- 初参加年 Y ごと: N_Y = 初参加者数、R_Y = そのうち初回月から 11〜13 ヶ月後に参加した人数（ユニーク）。
- 対象年の条件: `monthsBetween(\`${Y}-12\`, todayYm) >= 13`（その年の全コホートの13ヶ月窓が完了）かつ N_Y ≥ 20。
- text: 対象年を昇順に `${Y}年 ${pct}%` を `／` で連結（例 `2023年 9%／2024年 12%`）。
- hint: 対象年が2つ以上のとき、末尾2年の差 d（ポイント）: d ≥ 2 → `→ 定着率は上がっている`／d ≤ -2 → `→ 定着率は下がっている`／それ以外 → `→ 定着率はほぼ横ばい`。1年しかなければ hint なし。
- 対象年が0ならグループ省略。

### 4. 初回月による戻りやすさ（title: '初回月による戻りやすさ'）
- `cohorts` のうち `monthsBetween(cohort, todayYm) >= 13` の行を **暦月（MM）でプール**: size_MM = Σsize、year_MM = ΣyearLater（同月の複数年を合算）。
- size_MM ≥ 10 の月だけ対象。対象が2月未満ならグループ省略。
- rate_MM = pct(year_MM, size_MM)。最大の月 hi と最小の月 lo。
- text: `初回が${hi}月の人は翌年 ${rate_hi}%、${lo}月の人は ${rate_lo}%（1年後に戻った割合）`
- hint: rate_hi − rate_lo < 3 → `→ 初回の時期による差は小さい`／lo が 7 または 8 かつ hi がそれ以外 → `→ 繁忙期に初めて来た人ほど翌年に戻りにくい傾向`／それ以外 → `→ 初回の時期で翌年の戻りやすさに差がある`
- 月表記は先頭ゼロなし（`6月`）。

### 5. 直近の新規客（title: '直近の新規客'）
- thisYear = today の年。cur = 初回参加日が `${thisYear}-01-01`〜`today` の人数。prev = 初回参加日が `${thisYear-1}-01-01`〜`${thisYear-1}-${MM-DD of today}` の人数。
- text: `今年の初参加 ${cur}人（去年の同時期 ${prev}人、${signed diff}%）`。diff = pct(cur−prev, prev)。
- hint: diff ≥ 10 → `→ 新規客は増えている`／diff ≤ −10 → `→ 新規客は減っている`／それ以外 → `→ 新規客はほぼ横ばい`
- prev < 20 なら省略。

## 表示（`src/pages.ts`）
- `DashboardData` に `cohortInsights: InsightGroup[]` を追加（テストフィクスチャにも）。`handlers.ts` で `buildCohortInsights({ all, cohorts, today })` を渡す。
- sections.cohort: `<h2>…</h2>` → 既存の読み方注記 → `renderInsightGroups(d.cohortInsights)` → 直下に muted 12px の1行「電話番号が同じ人を同一人物として数えています。家族で予約者が変わると別人になります。」 → 表。
- インサイトが空配列なら見出しと注記だけで表へ（renderInsightGroups は空を許容）。

## テスト（`test/cohort-insights.test.ts` 新規）
- 1: N/M/pct と3段階 hint、N<20 で省略。
- 2: 最初の再訪月で分類（同月内2回目は再訪でない・4ヶ月後は「それ以外」・11/13ヶ月後は「翌年」）、M<10 で省略、hint 3通り。
- 3: 窓未完了の年と N_Y<20 の年を除外、hint 3通り（±2pt 境界）。
- 4: 暦月プール（2年分の同月を合算）、size<10 除外、hint 3通り（繁忙期判定 7/8）。
- 5: 同時期比較（today の MM-DD でクランプ）、prev<20 で省略、hint 3通り（±10% 境界）。
- dashboard.test.ts: cohort セクションに insight の見出しと注記文言が含まれる。
- typecheck + vitest 全件 green。デプロイはユーザー承認後。
