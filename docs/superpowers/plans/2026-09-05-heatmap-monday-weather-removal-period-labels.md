# ヒートマップ月曜始まり＋天候削除＋期間ラベル Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ヒートマップを月曜始まりにし、天候相関機能を完全削除し、各ブロックに対象期間ラベルを表示する。

**Architecture:** 既存SSR構成のまま。ヒートマップは表示列順のみ変更。天候はカード・取得・インサイト・型・テストごと削除（`applyOrder` が保存順の未知IDを無視するため並び順保存との互換は自動）。期間ラベルは `<span class="p-note">` を各見出しに追加し、GA4/IGセクションは note 文字列を引数で受け取る。

**Tech Stack:** TypeScript / Cloudflare Workers / vitest。スペック: `docs/superpowers/specs/2026-09-05-heatmap-monday-weather-removal-period-labels-design.md`

## Global Constraints

- 外部ライブラリ追加禁止 / UI文言は日本語
- `DATA` KV は read-only
- 各タスクは `npm run typecheck && npm test` 全件 green 後にコミット（main直・日本語メッセージ）
- 天候削除後の `SECTION_IDS` は `['kpi','insights','trend','heatmap','cohort','course','source','ga4','ig']`（9件・この順）

---

### Task 1: ヒートマップ月曜始まり

**Files:**
- Modify: `src/charts/heatmap.ts`
- Test: `test/charts.test.ts`（renderHeatmap のテストがあるファイル。無ければ `test/charts2.test.ts` を確認し、renderHeatmap を検証している方に追加）

**Interfaces:** 変更なし（`renderHeatmap(h: Heatmap): string` のまま。出力SVGの列順のみ変化）

- [ ] **Step 1: 失敗するテストを書く**

renderHeatmap を検証しているテストファイルに追加:

```ts
  it('ヒートマップは月曜始まりで日曜が最終列', () => {
    const counts = Array.from({ length: 12 }, () => [0, 0, 0, 0, 0, 0, 0]);
    counts[0][0] = 5; // 1月の日曜
    counts[0][1] = 3; // 1月の月曜
    const svg = renderHeatmap({ counts, max: 5 });
    // ヘッダ文字の出現順: 月が最初・日が最後
    const order = ['月', '火', '水', '木', '金', '土', '日']
      .map(d => svg.indexOf(`>${d}<`));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // 出現位置が昇順＝この表示順
    // セルの対応: 日曜(counts[0][0]=5)のtitleが「1月 日: 5件」、月曜が「1月 月: 3件」
    expect(svg).toContain('1月 日: 5件');
    expect(svg).toContain('1月 月: 3件');
  });
```

（`Heatmap` 型のフィールドが `counts`/`max` 以外を要求する場合は実型に合わせて最小フィクスチャを作る）

- [ ] **Step 2: RED確認** Run: `npx vitest run test/charts.test.ts test/charts2.test.ts` → 追加テストがFAIL（現状は日曜が先頭列）

- [ ] **Step 3: 実装**

`src/charts/heatmap.ts`: `WD` の直後に列順配列を追加し、ヘッダ・セル・title を経由参照に変更:

```ts
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // 表示列順＝月曜始まり（データのw indexは0=日曜のまま）
```

ヘッダループ:

```ts
  for (let i = 0; i < 7; i++) {
    s += `<text x="${labelW + i * cell + cell / 2}" y="14" font-size="11" fill="#6b7280" text-anchor="middle">${WD[ORDER[i]]}</text>`;
  }
```

セルループ（内側）を `for (let i = 0; i < 7; i++)` にし、`const w = ORDER[i];` を先頭に置いて `h.counts[m][w]`・`WD[w]`・x座標は `labelW + i * cell` を使う:

```ts
    for (let i = 0; i < 7; i++) {
      const w = ORDER[i];
      const c = h.counts[m][w];
      const t = h.max > 0 ? c / h.max : 0;
      const fill = c === 0 ? '#f1f3f5' : `rgba(30,58,95,${(0.15 + 0.85 * t).toFixed(2)})`;
      const x = labelW + i * cell, y = labelH + m * cell;
      s += `<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="${fill}"><title>${m + 1}月 ${WD[w]}: ${c}件</title></rect>`;
      if (c > 0) s += `<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" font-size="10" fill="${t > 0.5 ? '#fff' : '#1f2937'}" text-anchor="middle">${c}</text>`;
    }
```

既存テストが「日曜先頭」を前提に期待値を持つ場合は月曜始まりに更新（理由をレポートへ）。

- [ ] **Step 4: GREEN確認** Run: `npm run typecheck && npx vitest run` → 全件PASS
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: ヒートマップを月曜始まりに変更"`

---

### Task 2: 天候相関の完全削除

**Files:**
- Delete: `src/weather.ts`, `src/metrics/weatherjoin.ts`, `test/weather.test.ts`
- Modify: `src/handlers.ts`, `src/metrics/insights.ts`, `src/pages.ts`, `src/sections.ts`
- Test: `test/insights.test.ts`, `test/sections.test.ts`, `test/dashboard.test.ts`, `test/routing.test.ts`（天候前提の箇所を更新）

**Interfaces:**
- Produces: `SECTION_IDS = ['kpi','insights','trend','heatmap','cohort','course','source','ga4','ig']`（9件）。`buildInsights({ kpi, heatmap, trend })`（weather引数削除）。`DashboardData` から `weather` 削除。

- [ ] **Step 1: 失敗するテストを書く（テスト側を先に9ブロック前提へ更新）**

`test/sections.test.ts`: `SECTION_IDS は10ブロック` テストを9件版に変更:

```ts
  it('SECTION_IDS は9ブロック', () => {
    expect(SECTION_IDS).toEqual(['kpi','insights','trend','heatmap','cohort','course','source','ga4','ig']);
  });
```

同ファイルの `weather` を使う既存テスト（「保存に無い既定ID…」）は `cohort` 版に書き換え:

```ts
    it('保存に無い既定ID（将来の新セクション相当）は既定順の直前IDの直後に入る', () => {
      const savedWithoutCohort = DEFAULT_ORDER.filter(id => id !== 'cohort').reverse();
      const result = applyOrder(savedWithoutCohort);
      // cohort は既定順で heatmap の直後
      expect(result.indexOf('cohort')).toBe(result.indexOf('heatmap') + 1);
      expect(result.length).toBe(DEFAULT_ORDER.length);
    });
```

`test/dashboard.test.ts`: フィクスチャから `weather` フィールドを削除。`天候相関` 文字列を期待するテストがあれば削除。
`test/insights.test.ts`: `buildInsights` 呼び出しから weather 引数を除去し、天候インサイト（「雨・雪」等）を検証するケースを削除。
`test/routing.test.ts`: Open-Meteo向け `vi.stubGlobal('fetch', …)` のスタブとコメント（「天候取得を試みるため」）を削除（削除後はテスト環境で外部fetchは発生しない）。

- [ ] **Step 2: RED確認** Run: `npx vitest run test/sections.test.ts` → SECTION_IDS 9件テストがFAIL

- [ ] **Step 3: 実装（削除）**

1. `src/sections.ts`: `SECTION_IDS` から `'weather'` を除去（9件・Global Constraintsの順）
2. `src/pages.ts`:
   - `sections` 辞書から `weather:` エントリを削除
   - `renderWeatherBlock` 関数を削除
   - `DashboardData` から `weather: WeatherJoin;` を削除、`WeatherJoin` のimportを削除
3. `src/handlers.ts`:
   - import 4行削除（`fetchWeather` / `computeWeatherJoin` / `WeatherJoin` type / `WxCategory` type。`WeatherJoinCat` 等も残らないように）
   - `let weather: WeatherJoin = …` と try/catch の取得ブロックを削除
   - `buildInsights({ kpi, heatmap, weather, trend })` → `buildInsights({ kpi, heatmap, trend })`
   - `renderDashboard` へ渡すオブジェクトから `weather,` を削除
4. `src/metrics/insights.ts`: `WeatherJoin` import・`weather` パラメータ・天候インサイト生成ブロック（`weather.dropPct` 判定〜push）を削除
5. ファイル削除: `git rm src/weather.ts src/metrics/weatherjoin.ts test/weather.test.ts`
6. `grep -rn "weather\|Weather\|天候" src/ test/ README.md` を実行し、**参照ゼロ**を確認（READMEに記述があれば削除）

- [ ] **Step 4: GREEN確認** Run: `npm run typecheck && npx vitest run` → 全件PASS
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat!: 天候相関機能を完全削除（カード・取得・インサイト・テスト）"`

---

### Task 3: 対象期間ラベル

**Files:**
- Modify: `src/pages.ts`, `src/ga4/section.ts`, `src/ig/section.ts`
- Test: `test/dashboard.test.ts`, `test/ga4-section.test.ts`, `test/ig-section.test.ts`

**Interfaces:**
- Produces: `renderTrafficSection(d: TrafficData, periodNote: string)` / `renderSocialSection(d: SocialData, periodNote: string)`（既存呼び出しは pages.ts のみ。テストの呼び出しは第2引数追加）

- [ ] **Step 1: 失敗するテストを書く**

`test/dashboard.test.ts`:

```ts
  it('各ブロックに対象期間ラベルが出る', () => {
    const html = renderDashboard({ ...base, period: resolvePeriod('last12', '2026-09-05') });
    expect(html).toContain('class="p-note"');
    expect(html).toContain('対象: 2025-09-06〜2026-09-05'); // KPI等の期間連動ブロック
    expect(html).toContain('対象: 全期間'); // コホート
  });
```

`test/ga4-section.test.ts`（接続済みデータのレンダリングテストに追加）:

```ts
    expect(renderTrafficSection(connectedFixture, '2025-09-06〜2026-09-05')).toContain('対象: 2025-09-06〜2026-09-05');
```

`test/ig-section.test.ts`（接続済み）:

```ts
    const html = renderSocialSection(connectedFixture, '2025-09-06〜2026-09-05');
    expect(html).toContain('対象: 期間末尾の最大30日');
    expect(html).toContain('対象: 最新25投稿');
    expect(html).toContain('対象: 2025-09-06〜2026-09-05（投稿は最新25件の範囲）');
```

（`connectedFixture` は各テストファイルの既存フィクスチャ名に合わせる。未接続レンダリングのテストは第2引数を追加するだけで期待値不変）

- [ ] **Step 2: RED確認** Run: `npx vitest run test/dashboard.test.ts test/ga4-section.test.ts test/ig-section.test.ts` → FAIL

- [ ] **Step 3: 実装**

`src/pages.ts`:
- layoutのCSSに追加: `.p-note{font-size:11px;color:var(--muted);font-weight:400;margin-left:8px}`
- ヘルパ追加: `const pnote = (t: string) => `<span class="p-note">対象: ${t}</span>`;`（module内 or renderDashboard内）と `const range = `${d.period.start}〜${d.period.end}`;`
- sections 辞書の各 `<h2>` に注記を追加:
  - kpi: `<h2>KPI サマリー${pnote(range)}</h2>`
  - insights: `<h2>戦略インサイト${pnote(range)}</h2>`
  - trend: `<h2 style="margin:0">売上・予約トレンド（棒=売上 / 線=件数）${pnote(range)}</h2>`
  - heatmap: `<h2>季節 × 曜日ヒートマップ${pnote(range)}</h2>`
  - cohort: `<h2>リピーター・コホート再訪率（初回月別・全期間）${pnote('全期間')}</h2>`
  - course: `<h2>コース別内訳${pnote(range)}</h2>`
  - source: `<h2>流入経路（お客様の自己申告）${pnote(range)}</h2>`
  - ga4: `renderTrafficSection(d.traffic, range)` / ig: `renderSocialSection(d.social, range)`

`src/ga4/section.ts`: シグネチャに `periodNote: string` を追加し、接続済み出力の先頭カード見出しを `<h2>Web流入（GA4）インサイト<span class="p-note">対象: ${periodNote}</span></h2>` に。未接続分岐は変更なし（引数は受けるだけ）。

`src/ig/section.ts`: シグネチャに `periodNote: string` を追加し、接続済み出力の見出しを変更:
- リーチ推移: `<h2>リーチ推移<span class="p-note">対象: 期間末尾の最大30日</span></h2>`
- 投稿 × 予約: `<h2>投稿 × 予約（棒=投稿数 / 線=予約件数）<span class="p-note">対象: ${periodNote}（投稿は最新25件の範囲）</span></h2>`
- 投稿別エンゲージメント Top: `<h2>投稿別エンゲージメント Top<span class="p-note">対象: 最新25投稿</span></h2>`
- フォロワー推移・IGインサイトカード・未接続分岐は変更なし

- [ ] **Step 4: GREEN確認** Run: `npm run typecheck && npx vitest run` → 全件PASS
- [ ] **Step 5: コミット** `git add -A && git commit -m "feat: 各ブロックに対象期間ラベルを表示"`

---

### Task 4: 仕上げ検証

- [ ] `npm run typecheck && npm test` 全件green（件数記録）
- [ ] `npx wrangler dev --local` でE2E: ログイン → (a) ヒートマップ先頭列が「月」 (b) 「天候相関」が存在しない (c) `class="p-note"` が表示され last12/last24 で日付範囲が変わる (d) 並び替えモードのブロック数が9
- [ ] レポート作成（デプロイはユーザー承認後）
