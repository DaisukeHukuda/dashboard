import { describe, it, expect } from 'vitest';
import { buildCohortInsights } from '../src/metrics/cohortInsights.js';
import type { HistoryRecord } from '../src/types.js';
import type { CohortRow } from '../src/metrics/cohort.js';
import { addMonthsToYmd } from '../src/util.js';

const r = (date: string, phoneHash: string): HistoryRecord => ({ date, course: 'A', pax: 1, amount: 1, status: '参加済', phoneHash });
const TODAY = '2026-09-07';

function build(all: HistoryRecord[], cohorts: CohortRow[] = [], today = TODAY) {
  return buildCohortInsights({ all, cohorts, today });
}
const find = (groups: ReturnType<typeof build>, title: string) => groups.find(g => g.title === title);

describe('buildCohortInsights: 1. リピートの全体像', () => {
  it('N=20,M=5(25%) → 5人に1人以上', () => {
    const all = [
      ...Array.from({ length: 15 }, (_, i) => r('2023-01-10', `a${i}`)),
      ...Array.from({ length: 5 }, (_, i) => [r('2023-01-10', `b${i}`), r('2023-02-10', `b${i}`)]).flat(),
    ];
    const g = find(build(all), 'リピートの全体像')!;
    expect(g.items[0].text).toBe('初参加 20人のうち、2回目以降も来た人 5人（25%）');
    expect(g.items[0].hint).toBe('→ 5人に1人以上が戻っている');
  });

  it('N=20,M=3(15%) → 10人に1〜2人が戻る水準', () => {
    const all = [
      ...Array.from({ length: 17 }, (_, i) => r('2023-01-10', `a${i}`)),
      ...Array.from({ length: 3 }, (_, i) => [r('2023-01-10', `b${i}`), r('2023-02-10', `b${i}`)]).flat(),
    ];
    const g = find(build(all), 'リピートの全体像')!;
    expect(g.items[0].hint).toBe('→ 10人に1〜2人が戻る水準');
  });

  it('N=20,M=1(5%) → 戻る人は10人に1人未満', () => {
    const all = [
      ...Array.from({ length: 19 }, (_, i) => r('2023-01-10', `a${i}`)),
      r('2023-01-10', 'b0'), r('2023-02-10', 'b0'),
    ];
    const g = find(build(all), 'リピートの全体像')!;
    expect(g.items[0].hint).toBe('→ 戻る人は10人に1人未満');
  });

  it('N<20 ならグループを省略する', () => {
    const all = Array.from({ length: 19 }, (_, i) => r('2023-01-10', `a${i}`));
    expect(find(build(all), 'リピートの全体像')).toBeUndefined();
  });
});

describe('buildCohortInsights: 2. 戻ってくるタイミング', () => {
  it('最初の再訪月で分類（同月内2回目は再訪でない・4/10ヶ月後はそれ以外・11/12ヶ月後は翌年）、a>bで同シーズンhint', () => {
    const all = [
      // 3ヶ月以内 (a): 6人 offset 1,2,3 の組み合わせ。うち1人は同月内2回目訪問(offset0)を含むが無視される
      r('2023-01-10', 'a0'), r('2023-02-05', 'a0'), // offset1
      r('2023-01-10', 'a1'), r('2023-03-05', 'a1'), // offset2
      r('2023-01-10', 'a2'), r('2023-04-05', 'a2'), // offset3
      r('2023-01-10', 'a3'), r('2023-02-06', 'a3'), // offset1
      r('2023-01-10', 'a4'), r('2023-03-06', 'a4'), // offset2
      r('2023-01-10', 'a5'), r('2023-01-25', 'a5'), r('2023-02-07', 'a5'), // 同月2回目(無視)→offset1
      // それ以外 (c): 2人 offset 4,10
      r('2023-01-10', 'c0'), r('2023-05-10', 'c0'), // offset4
      r('2023-01-10', 'c1'), r('2023-11-10', 'c1'), // offset10
      // 翌年 (b): 2人 offset 11,12
      r('2023-01-10', 'b0'), r('2023-12-10', 'b0'), // offset11
      r('2023-01-10', 'b1'), r('2024-01-10', 'b1'), // offset12
    ];
    const g = find(build(all), '戻ってくるタイミング')!;
    expect(g.items[0].text).toBe('再訪した人の内訳: 3ヶ月以内 60%／翌年の同時期（11〜13ヶ月後） 20%／それ以外 20%');
    expect(g.items[0].hint).toBe('→ 同じシーズン中に戻る人が多い');
  });

  it('b>aで翌シーズンhint', () => {
    const all = [
      ...Array.from({ length: 2 }, (_, i) => [r('2023-01-10', `a${i}`), r('2023-02-05', `a${i}`)]).flat(), // 3ヶ月以内 2人
      ...Array.from({ length: 6 }, (_, i) => [r('2023-01-10', `b${i}`), r('2023-12-05', `b${i}`)]).flat(), // 翌年 6人
      ...Array.from({ length: 2 }, (_, i) => [r('2023-01-10', `c${i}`), r('2023-06-05', `c${i}`)]).flat(), // それ以外 2人
    ];
    const g = find(build(all), '戻ってくるタイミング')!;
    expect(g.items[0].hint).toBe('→ 翌シーズンに戻る傾向');
  });

  it('a===bなら hint なし', () => {
    const all = [
      ...Array.from({ length: 4 }, (_, i) => [r('2023-01-10', `a${i}`), r('2023-02-05', `a${i}`)]).flat(), // 3ヶ月以内 4人
      ...Array.from({ length: 4 }, (_, i) => [r('2023-01-10', `b${i}`), r('2023-12-05', `b${i}`)]).flat(), // 翌年 4人
      ...Array.from({ length: 2 }, (_, i) => [r('2023-01-10', `c${i}`), r('2023-06-05', `c${i}`)]).flat(), // それ以外 2人
    ];
    const g = find(build(all), '戻ってくるタイミング')!;
    expect(g.items[0].hint).toBeUndefined();
  });

  it('M<10 ならグループを省略する', () => {
    const all = Array.from({ length: 9 }, (_, i) => [r('2023-01-10', `a${i}`), r('2023-02-05', `a${i}`)]).flat();
    expect(find(build(all), '戻ってくるタイミング')).toBeUndefined();
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

  it('窓未完了(2025)とN<20(2022)を除外、上昇hint', () => {
    const all = [
      ...cohortYear('2022-01', 15, 0, 'y22'), // N<20 → 除外
      ...cohortYear('2023-01', 25, 5, 'y23'), // 20%
      ...cohortYear('2024-01', 20, 6, 'y24'), // 30%
      ...cohortYear('2025-01', 20, 1, 'y25'), // 窓未完了 → 除外
    ];
    const g = find(build(all), '年ごとの定着率（1年後に戻った割合）')!;
    expect(g.items[0].text).toBe('2023年 20%／2024年 30%');
    expect(g.items[0].hint).toBe('→ 定着率は上がっている');
  });

  it('下降hint', () => {
    const all = [
      ...cohortYear('2023-01', 25, 10, 'y23'), // 40%
      ...cohortYear('2024-01', 25, 5, 'y24'), // 20%
    ];
    const g = find(build(all), '年ごとの定着率（1年後に戻った割合）')!;
    expect(g.items[0].hint).toBe('→ 定着率は下がっている');
  });

  it('横ばいhint(差1pt)', () => {
    const all = [
      ...cohortYear('2023-01', 100, 20, 'y23'), // 20%
      ...cohortYear('2024-01', 100, 21, 'y24'), // 21%
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

  it('暦月プール(2年分合算)・size<10除外・窓未完了除外、繁忙期hint', () => {
    const cohorts = [
      row('2023-06', 15, 10), row('2024-06', 5, 4), // 6月プール: size20, yearLater14 → 70%
      row('2023-07', 25, 4), // 7月: size25, yearLater4 → 16%
      row('2023-09', 5, 1), // size<10 除外
      row('2026-02', 50, 40), // 窓未完了(monthsBetween<13) 除外
    ];
    const g = find(build([], cohorts), '初回月による戻りやすさ')!;
    expect(g.items[0].text).toBe('初回が6月の人は翌年 70%、7月の人は 16%（1年後に戻った割合）');
    expect(g.items[0].hint).toBe('→ 繁忙期に初めて来た人ほど翌年に戻りにくい傾向');
  });

  it('差が3pt未満なら「差は小さい」hint', () => {
    const cohorts = [row('2023-03', 100, 50), row('2023-05', 100, 48)]; // 50% vs 48%
    const g = find(build([], cohorts), '初回月による戻りやすさ')!;
    expect(g.items[0].hint).toBe('→ 初回の時期による差は小さい');
  });

  it('差が3pt以上で繁忙期(7/8)が絡まなければ「差がある」hint', () => {
    const cohorts = [row('2023-03', 20, 15), row('2023-05', 20, 10)]; // 75% vs 50%
    const g = find(build([], cohorts), '初回月による戻りやすさ')!;
    expect(g.items[0].hint).toBe('→ 初回の時期で翌年の戻りやすさに差がある');
  });

  it('対象月が2未満ならグループを省略する', () => {
    const cohorts = [row('2023-03', 20, 10), row('2023-04', 5, 1)]; // 1つはsize<10で除外→残り1月
    expect(find(build([], cohorts), '初回月による戻りやすさ')).toBeUndefined();
  });
});

describe('buildCohortInsights: 5. 直近の新規客', () => {
  function firstOnly(dates: string[], seed: string): HistoryRecord[] {
    return dates.map((d, i) => r(d, `${seed}${i}`));
  }

  it('増加hint(diff>=10%)、todayのMM-DDでクランプ', () => {
    const prevDates = Array.from({ length: 20 }, (_, i) => `2025-0${(i % 8) + 1}-0${(i % 8) + 1}`);
    const all = [
      ...firstOnly(prevDates, 'p'),
      ...firstOnly(Array.from({ length: 25 }, (_, i) => `2026-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'c'),
      r('2025-10-01', 'excluded'), // today(09-07)より後の同時期外 → prevに含めない
    ];
    const g = find(build(all), '直近の新規客')!;
    expect(g.items[0].text).toBe('今年の初参加 25人（去年の同時期 20人、+25%）');
    expect(g.items[0].hint).toBe('→ 新規客は増えている');
  });

  it('減少hint(diff<=-10%)', () => {
    const all = [
      ...firstOnly(Array.from({ length: 30 }, (_, i) => `2025-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'p'),
      ...firstOnly(Array.from({ length: 20 }, (_, i) => `2026-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'c'),
    ];
    const g = find(build(all), '直近の新規客')!;
    expect(g.items[0].hint).toBe('→ 新規客は減っている');
  });

  it('横ばいhint', () => {
    const all = [
      ...firstOnly(Array.from({ length: 25 }, (_, i) => `2025-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'p'),
      ...firstOnly(Array.from({ length: 27 }, (_, i) => `2026-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'c'),
    ];
    const g = find(build(all), '直近の新規客')!;
    expect(g.items[0].hint).toBe('→ 新規客はほぼ横ばい');
  });

  it('prev<20ならグループを省略する', () => {
    const all = firstOnly(Array.from({ length: 19 }, (_, i) => `2025-0${(i % 8) + 1}-0${(i % 8) + 1}`), 'p');
    expect(find(build(all), '直近の新規客')).toBeUndefined();
  });
});
