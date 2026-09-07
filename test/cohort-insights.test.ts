import { describe, it, expect } from 'vitest';
import { buildCohortInsights } from '../src/metrics/cohortInsights.js';
import type { HistoryRecord } from '../src/types.js';
import { computeCohorts, type CohortRow } from '../src/metrics/cohort.js';
import { addMonthsToYmd } from '../src/util.js';

const r = (date: string, phoneHash: string): HistoryRecord => ({ date, course: 'A', pax: 1, amount: 1, status: '参加済', phoneHash });
const TODAY = '2026-09-07'; // todayYm = 2026-09。13ヶ月以上前 = 2025-08以前。

function build(all: HistoryRecord[], cohorts: CohortRow[] = [], today = TODAY) {
  return buildCohortInsights({ all, cohorts, today });
}
const find = (groups: ReturnType<typeof build>, title: string) => groups.find(g => g.title === title);

// 13ヶ月以上前の固定の初回日（グループ1・2の対象となる基準日）
const OLD_FIRST = '2023-01-10';

describe('buildCohortInsights: 1. リピートの全体像', () => {
  it('N=20,M=5(25%) → 5人に1人以上', () => {
    const all = [
      ...Array.from({ length: 15 }, (_, i) => r(OLD_FIRST, `a${i}`)),
      ...Array.from({ length: 5 }, (_, i) => [r(OLD_FIRST, `b${i}`), r('2023-02-10', `b${i}`)]).flat(),
    ];
    const g = find(build(all), 'リピートの全体像')!;
    expect(g.items[0].text).toBe('13ヶ月以上前に初参加した 20人のうち、2回目以降も来た人 5人（25%）');
    expect(g.items[0].hint).toBe('→ 5人に1人以上が戻っている');
  });

  it('pct=20(境界) → 5人に1人以上', () => {
    const all = [
      ...Array.from({ length: 16 }, (_, i) => r(OLD_FIRST, `a${i}`)),
      ...Array.from({ length: 4 }, (_, i) => [r(OLD_FIRST, `b${i}`), r('2023-02-10', `b${i}`)]).flat(),
    ];
    const g = find(build(all), 'リピートの全体像')!;
    expect(g.items[0].text).toBe('13ヶ月以上前に初参加した 20人のうち、2回目以降も来た人 4人（20%）');
    expect(g.items[0].hint).toBe('→ 5人に1人以上が戻っている');
  });

  it('pct=10(境界) → 10人に1〜2人が戻る水準', () => {
    const all = [
      ...Array.from({ length: 18 }, (_, i) => r(OLD_FIRST, `a${i}`)),
      ...Array.from({ length: 2 }, (_, i) => [r(OLD_FIRST, `b${i}`), r('2023-02-10', `b${i}`)]).flat(),
    ];
    const g = find(build(all), 'リピートの全体像')!;
    expect(g.items[0].text).toBe('13ヶ月以上前に初参加した 20人のうち、2回目以降も来た人 2人（10%）');
    expect(g.items[0].hint).toBe('→ 10人に1〜2人が戻る水準');
  });

  it('N=20,M=1(5%) → 戻る人は10人に1人未満', () => {
    const all = [
      ...Array.from({ length: 19 }, (_, i) => r(OLD_FIRST, `a${i}`)),
      r(OLD_FIRST, 'b0'), r('2023-02-10', 'b0'),
    ];
    const g = find(build(all), 'リピートの全体像')!;
    expect(g.items[0].hint).toBe('→ 戻る人は10人に1人未満');
  });

  it('N<20 ならグループを省略する', () => {
    const all = Array.from({ length: 19 }, (_, i) => r(OLD_FIRST, `a${i}`));
    expect(find(build(all), 'リピートの全体像')).toBeUndefined();
  });

  it('電話番号が空の人は集計から除外する', () => {
    const all = [
      ...Array.from({ length: 19 }, (_, i) => r(OLD_FIRST, `a${i}`)),
      ...Array.from({ length: 5 }, () => r(OLD_FIRST, '')), // 空phoneHash → 除外され N は増えない
    ];
    expect(find(build(all), 'リピートの全体像')).toBeUndefined(); // N=19のまま
  });

  it('初回月から13ヶ月未満（12ヶ月前）の人は除外され、N=19でグループ省略', () => {
    const all = [
      ...Array.from({ length: 19 }, (_, i) => r(OLD_FIRST, `a${i}`)),
      r('2025-09-15', 'boundary'), // todayYm(2026-09)との差=12ヶ月 → 除外
    ];
    expect(find(build(all), 'リピートの全体像')).toBeUndefined();
  });

  it('初回月から13ヶ月以上前（13ヶ月前）の人は対象になり、N=20でグループが出る', () => {
    const all = [
      ...Array.from({ length: 19 }, (_, i) => r(OLD_FIRST, `a${i}`)),
      r('2025-08-15', 'boundary'), // todayYm(2026-09)との差=13ヶ月 → 対象
    ];
    const g = find(build(all), 'リピートの全体像')!;
    expect(g.items[0].text).toBe('13ヶ月以上前に初参加した 20人のうち、2回目以降も来た人 0人（0%）');
  });
});

describe('buildCohortInsights: 2. 戻ってくるタイミング', () => {
  it('最初の再訪月で分類（同月内2回目は再訪でない・4/10ヶ月後はそれ以外・11/12ヶ月後は翌年）、a>bで同シーズンhint', () => {
    const all = [
      // 3ヶ月以内 (a): 6人 offset 1,2,3 の組み合わせ。うち1人は同月内2回目訪問(offset0)を含むが無視される
      r(OLD_FIRST, 'a0'), r('2023-02-05', 'a0'), // offset1
      r(OLD_FIRST, 'a1'), r('2023-03-05', 'a1'), // offset2
      r(OLD_FIRST, 'a2'), r('2023-04-05', 'a2'), // offset3
      r(OLD_FIRST, 'a3'), r('2023-02-06', 'a3'), // offset1
      r(OLD_FIRST, 'a4'), r('2023-03-06', 'a4'), // offset2
      r(OLD_FIRST, 'a5'), r('2023-01-25', 'a5'), r('2023-02-07', 'a5'), // 同月2回目(無視)→offset1
      // それ以外 (c): 2人 offset 4,10
      r(OLD_FIRST, 'c0'), r('2023-05-10', 'c0'), // offset4
      r(OLD_FIRST, 'c1'), r('2023-11-10', 'c1'), // offset10
      // 翌年 (b): 2人 offset 11,12
      r(OLD_FIRST, 'b0'), r('2023-12-10', 'b0'), // offset11
      r(OLD_FIRST, 'b1'), r('2024-01-10', 'b1'), // offset12
    ];
    const g = find(build(all), '戻ってくるタイミング')!;
    expect(g.items[0].text).toBe('再訪した人の内訳: 3ヶ月以内 60%／翌年の同時期（11〜13ヶ月後） 20%／それ以外 20%');
    expect(g.items[0].hint).toBe('→ 同じシーズン中に戻る人が多い');
  });

  it('b>aで翌シーズンhint', () => {
    const all = [
      ...Array.from({ length: 2 }, (_, i) => [r(OLD_FIRST, `a${i}`), r('2023-02-05', `a${i}`)]).flat(), // 3ヶ月以内 2人
      ...Array.from({ length: 6 }, (_, i) => [r(OLD_FIRST, `b${i}`), r('2023-12-05', `b${i}`)]).flat(), // 翌年 6人
      ...Array.from({ length: 2 }, (_, i) => [r(OLD_FIRST, `c${i}`), r('2023-06-05', `c${i}`)]).flat(), // それ以外 2人
    ];
    const g = find(build(all), '戻ってくるタイミング')!;
    expect(g.items[0].hint).toBe('→ 翌シーズンに戻る傾向');
  });

  it('a===bなら hint なし', () => {
    const all = [
      ...Array.from({ length: 4 }, (_, i) => [r(OLD_FIRST, `a${i}`), r('2023-02-05', `a${i}`)]).flat(), // 3ヶ月以内 4人
      ...Array.from({ length: 4 }, (_, i) => [r(OLD_FIRST, `b${i}`), r('2023-12-05', `b${i}`)]).flat(), // 翌年 4人
      ...Array.from({ length: 2 }, (_, i) => [r(OLD_FIRST, `c${i}`), r('2023-06-05', `c${i}`)]).flat(), // それ以外 2人
    ];
    const g = find(build(all), '戻ってくるタイミング')!;
    expect(g.items[0].hint).toBeUndefined();
  });

  it('M<10 ならグループを省略する', () => {
    const all = Array.from({ length: 9 }, (_, i) => [r(OLD_FIRST, `a${i}`), r('2023-02-05', `a${i}`)]).flat();
    expect(find(build(all), '戻ってくるタイミング')).toBeUndefined();
  });

  it('offset=13は翌年バケット、offset=14はそれ以外バケット（境界）', () => {
    const all = [
      ...Array.from({ length: 5 }, (_, i) => [r(OLD_FIRST, `b${i}`), r(addMonthsToYmd(OLD_FIRST, 13), `b${i}`)]).flat(), // offset13 → 翌年
      ...Array.from({ length: 5 }, (_, i) => [r(OLD_FIRST, `c${i}`), r(addMonthsToYmd(OLD_FIRST, 14), `c${i}`)]).flat(), // offset14 → それ以外
    ];
    const g = find(build(all), '戻ってくるタイミング')!;
    expect(g.items[0].text).toBe('再訪した人の内訳: 3ヶ月以内 0%／翌年の同時期（11〜13ヶ月後） 50%／それ以外 50%');
  });

  it('最大剰余法: M=15を5/5/5に分けると34/33/33（同着は先のバケットが繰り上げ）', () => {
    const all = [
      // a: 3ヶ月以内 5人 (offset2)
      ...Array.from({ length: 5 }, (_, i) => [r(OLD_FIRST, `a${i}`), r(addMonthsToYmd(OLD_FIRST, 2), `a${i}`)]).flat(),
      // b: 翌年 5人 (offset12)
      ...Array.from({ length: 5 }, (_, i) => [r(OLD_FIRST, `b${i}`), r(addMonthsToYmd(OLD_FIRST, 12), `b${i}`)]).flat(),
      // c: それ以外 5人 (offset6)
      ...Array.from({ length: 5 }, (_, i) => [r(OLD_FIRST, `c${i}`), r(addMonthsToYmd(OLD_FIRST, 6), `c${i}`)]).flat(),
    ];
    const g = find(build(all), '戻ってくるタイミング')!;
    expect(g.items[0].text).toBe('再訪した人の内訳: 3ヶ月以内 34%／翌年の同時期（11〜13ヶ月後） 33%／それ以外 33%');
  });
});

describe('buildCohortInsights: 3. 年ごとの定着率', () => {
  function cohortYear(ym: string, n: number, returning: number, seed: string): HistoryRecord[] {
    const out: HistoryRecord[] = [];
    for (let i = 0; i < n; i++) {
      const phone = `${seed}${i}`;
      const firstDate = `${ym}-05`;
      out.push(r(firstDate, phone));
      if (i < returning) out.push(r(addMonthsToYmd(firstDate, 12), phone));
    }
    return out;
  }

  it('窓未完了(2025)とN<20(2022)を除外、上昇hint(差5pt以上)', () => {
    const all = [
      ...cohortYear('2022-01', 15, 0, 'y22'), // N<20 → 除外
      ...cohortYear('2023-01', 100, 20, 'y23'), // 20%
      ...cohortYear('2024-01', 100, 25, 'y24'), // 25% (差+5)
      ...cohortYear('2025-01', 20, 1, 'y25'), // 窓未完了 → 除外
    ];
    const g = find(build(all), '年ごとの定着率（1年後に戻った割合）')!;
    expect(g.items[0].text).toBe('2023年 20%／2024年 25%');
    expect(g.items[0].hint).toBe('→ 定着率は上がっている');
  });

  it('下降hint(差-5pt)', () => {
    const all = [
      ...cohortYear('2023-01', 100, 30, 'y23'), // 30%
      ...cohortYear('2024-01', 100, 25, 'y24'), // 25% (差-5)
    ];
    const g = find(build(all), '年ごとの定着率（1年後に戻った割合）')!;
    expect(g.items[0].hint).toBe('→ 定着率は下がっている');
  });

  it('横ばいhint(差+4pt、5pt未満)', () => {
    const all = [
      ...cohortYear('2023-01', 100, 20, 'y23'), // 20%
      ...cohortYear('2024-01', 100, 24, 'y24'), // 24% (差+4)
    ];
    const g = find(build(all), '年ごとの定着率（1年後に戻った割合）')!;
    expect(g.items[0].hint).toBe('→ 定着率はほぼ横ばい');
  });

  it('対象年が1つならhintなし', () => {
    const all = [
      ...cohortYear('2023-01', 25, 5, 'y23'), // 20%、対象
      ...cohortYear('2024-01', 10, 5, 'y24'), // N<20 → 除外
    ];
    const g = find(build(all), '年ごとの定着率（1年後に戻った割合）')!;
    expect(g.items[0].text).toBe('2023年 20%');
    expect(g.items[0].hint).toBeUndefined();
  });

  it('対象年が0ならグループを省略する', () => {
    const all = [
      ...cohortYear('2022-01', 10, 5, 'y22'), // N<20
      ...cohortYear('2025-01', 30, 5, 'y25'), // 窓未完了
    ];
    expect(find(build(all), '年ごとの定着率（1年後に戻った割合）')).toBeUndefined();
  });
});

describe('buildCohortInsights: 4. 初回月による戻りやすさ', () => {
  const row = (cohort: string, size: number, yearLater: number): CohortRow => ({ cohort, size, retention: [], within3: 0, yearLater });

  it('暦月プール(2年分合算)・size<40除外・窓未完了除外、繁忙期hint', () => {
    const cohorts = [
      row('2023-06', 30, 21), row('2024-06', 15, 12), // 6月プール: size45, yearLater33 → 73%
      row('2023-07', 50, 8), // 7月: size50, yearLater8 → 16%
      row('2023-09', 30, 10), // size<40 除外
      row('2026-02', 80, 60), // 窓未完了(monthsBetween<13) 除外
    ];
    const g = find(build([], cohorts), '初回月による戻りやすさ')!;
    expect(g.items[0].text).toBe('初回が6月の人は翌年 73%、7月の人は 16%（1年後に戻った割合）');
    expect(g.items[0].hint).toBe('→ 繁忙期に初めて来た人ほど翌年に戻りにくい傾向');
  });

  it('プールsize=39は除外、40以上が対象になる（境界）', () => {
    const cohorts = [
      row('2023-03', 39, 20), // size39 → 除外
      row('2023-04', 40, 20), // size40 → 対象、50%
      row('2023-05', 40, 10), // size40 → 対象、25%
    ];
    const g = find(build([], cohorts), '初回月による戻りやすさ')!;
    expect(g.items[0].text).toBe('初回が4月の人は翌年 50%、5月の人は 25%（1年後に戻った割合）');
  });

  it('差が5pt未満(4pt)なら「差は小さい」hint', () => {
    const cohorts = [row('2023-03', 100, 50), row('2023-05', 100, 46)]; // 50% vs 46%
    const g = find(build([], cohorts), '初回月による戻りやすさ')!;
    expect(g.items[0].hint).toBe('→ 初回の時期による差は小さい');
  });

  it('差が5pt以上(境界)で繁忙期(7/8)が絡まなければ「差がある」hint', () => {
    const cohorts = [row('2023-03', 2000, 1000), row('2023-05', 2000, 900)]; // 50% vs 45%（差5pt・母集団が大きく 3×SE≈4.7pt < 5pt）
    const g = find(build([], cohorts), '初回月による戻りやすさ')!;
    expect(g.items[0].hint).toBe('→ 初回の時期で翌年の戻りやすさに差がある');
  });

  it('対象月が2未満ならグループを省略する', () => {
    const cohorts = [row('2023-03', 40, 20), row('2023-04', 30, 10)]; // 1つはsize<40で除外→残り1月
    expect(find(build([], cohorts), '初回月による戻りやすさ')).toBeUndefined();
  });

  it('対象月が2以上でも全月の割合が同じならグループを省略する(hi===lo)', () => {
    const cohorts = [row('2023-03', 100, 50), row('2023-05', 80, 40)]; // どちらも50%
    expect(find(build([], cohorts), '初回月による戻りやすさ')).toBeUndefined();
  });
});

describe('buildCohortInsights: 5. 直近の新規客', () => {
  function firstOnly(dates: string[], seed: string): HistoryRecord[] {
    return dates.map((d, i) => r(d, `${seed}${i}`));
  }

  it('増加hint(diff=+10%、境界)、todayのMM-DDでクランプ、"+N%"表記', () => {
    const prevDates = Array.from({ length: 20 }, (_, i) => `2025-0${(i % 8) + 1}-0${(i % 8) + 1}`);
    const all = [
      ...firstOnly(prevDates, 'p'),
      ...firstOnly(Array.from({ length: 22 }, (_, i) => `2026-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'c'),
      r('2025-10-01', 'excluded'), // today(09-07)より後の同時期外 → prevに含めない
    ];
    const g = find(build(all), '直近の新規客')!;
    expect(g.items[0].text).toBe('今年の初参加 22人（去年の同時期 20人、+10%）');
    expect(g.items[0].hint).toBe('→ 新規客は増えている');
  });

  it('減少hint(diff=-10%、境界)、"-N%"表記', () => {
    const all = [
      ...firstOnly(Array.from({ length: 20 }, (_, i) => `2025-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'p'),
      ...firstOnly(Array.from({ length: 18 }, (_, i) => `2026-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'c'),
    ];
    const g = find(build(all), '直近の新規客')!;
    expect(g.items[0].text).toBe('今年の初参加 18人（去年の同時期 20人、-10%）');
    expect(g.items[0].hint).toBe('→ 新規客は減っている');
  });

  it('横ばいhint(diff=+9%、10%未満)', () => {
    const all = [
      ...firstOnly(Array.from({ length: 100 }, (_, i) => `2025-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'p'),
      ...firstOnly(Array.from({ length: 109 }, (_, i) => `2026-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'c'),
    ];
    const g = find(build(all), '直近の新規客')!;
    expect(g.items[0].text).toBe('今年の初参加 109人（去年の同時期 100人、+9%）');
    expect(g.items[0].hint).toBe('→ 新規客はほぼ横ばい');
  });

  it('差0なら"±0%"表記で横ばいhint', () => {
    const all = [
      ...firstOnly(Array.from({ length: 25 }, (_, i) => `2025-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'p'),
      ...firstOnly(Array.from({ length: 25 }, (_, i) => `2026-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'c'),
    ];
    const g = find(build(all), '直近の新規客')!;
    expect(g.items[0].text).toBe('今年の初参加 25人（去年の同時期 25人、±0%）');
    expect(g.items[0].hint).toBe('→ 新規客はほぼ横ばい');
  });

  it('prev<20ならグループを省略する', () => {
    const all = firstOnly(Array.from({ length: 19 }, (_, i) => `2025-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'p');
    expect(find(build(all), '直近の新規客')).toBeUndefined();
  });
});

describe('buildCohortInsights: 再レビュー後の境界', () => {
  const r = (date: string, phoneHash: string): HistoryRecord => ({ date, course: 'A', pax: 1, amount: 1, status: '参加済', phoneHash });
  it('タイミングの hint は実数で比較し、丸めで34/33に割れても同率なら hint なし', () => {
    const all: HistoryRecord[] = [];
    for (let i = 0; i < 5; i++) { all.push(r('2023-05-01', `a${i}`), r('2023-07-01', `a${i}`)); } // +2 → 3ヶ月以内
    for (let i = 0; i < 5; i++) { all.push(r('2023-05-01', `b${i}`), r('2024-05-01', `b${i}`)); } // +12 → 翌年
    for (let i = 0; i < 5; i++) { all.push(r('2023-05-01', `c${i}`), r('2023-11-01', `c${i}`)); } // +6 → それ以外
    for (let i = 0; i < 10; i++) all.push(r('2023-05-01', `n${i}`));
    const g = buildCohortInsights({ all, cohorts: computeCohorts(all, 13), today: '2026-09-07' }).find(x => x.title === '戻ってくるタイミング')!;
    expect(g.items[0].text).toContain('3ヶ月以内 34%');
    expect(g.items[0].hint).toBeUndefined();
  });
  it('初回月比較: 小さな母集団同士の差（5pt以上でも3×SE未満）は「差は小さい」', () => {
    // 6月 40人中5人(13%) vs 9月 40人中1人(3%)。p=0.075, SE≈5.9pt → 閾値≈17.7pt > 10pt
    const cohorts = [
      { cohort: '2024-06', size: 40, retention: [], within3: 0, yearLater: 5 },
      { cohort: '2024-09', size: 40, retention: [], within3: 0, yearLater: 1 },
    ];
    const g = buildCohortInsights({ all: [], cohorts, today: '2026-09-07' }).find(x => x.title === '初回月による戻りやすさ')!;
    expect(g.items[0].hint).toBe('→ 初回の時期による差は小さい');
  });
  it('初回月比較: 大きな母集団で差が3×SEを超えれば差ありと示唆', () => {
    // 6月 400人中60人(15%) vs 8月 400人中20人(5%)。p=0.1, SE≈2.1pt → 閾値≈6.4pt < 10pt
    const cohorts = [
      { cohort: '2024-06', size: 400, retention: [], within3: 0, yearLater: 60 },
      { cohort: '2024-08', size: 400, retention: [], within3: 0, yearLater: 20 },
    ];
    const g = buildCohortInsights({ all: [], cohorts, today: '2026-09-07' }).find(x => x.title === '初回月による戻りやすさ')!;
    expect(g.items[0].hint).toBe('→ 繁忙期に初めて来た人ほど翌年に戻りにくい傾向');
  });
  it('新規客: 表示の % と hint が同じ式（219/200 → +9% で横ばい）', () => {
    const all: HistoryRecord[] = [];
    for (let i = 0; i < 200; i++) all.push(r('2025-06-01', `p${i}`));
    for (let i = 0; i < 219; i++) all.push(r('2026-06-01', `c${i}`));
    const g = buildCohortInsights({ all, cohorts: [], today: '2026-09-07' }).find(x => x.title === '直近の新規客')!;
    expect(g.items[0].text).toContain('+9%');
    expect(g.items[0].hint).toBe('→ 新規客はほぼ横ばい');
  });
});
