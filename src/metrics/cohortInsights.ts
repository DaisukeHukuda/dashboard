import type { HistoryRecord } from '../types.js';
import type { CohortRow } from './cohort.js';
import type { InsightGroup } from './insights.js';
import { signedPct } from './insights.js';
import { firstVisitMap } from '../repeat.js';
import { ymOf, monthsBetween } from '../util.js';

// 割合（0〜100の整数、四捨五入）
const pct = (a: number, b: number): number => Math.round((a / b) * 100);

// 複数バケットの割合の合計がちょうど100%になるよう最大剰余法で丸める。
// 端数が同着の場合は、counts配列で先に出てくるバケットを優先する。
function distributePercents(counts: number[], total: number): number[] {
  const raw = counts.map(c => (c / total) * 100);
  const floors = raw.map(Math.floor);
  const remainder = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((x, y) => y.frac - x.frac || x.i - y.i);
  const result = [...floors];
  for (let k = 0; k < remainder; k++) result[order[k].i]++;
  return result;
}

interface Person {
  firstYm: string;
  firstYear: number;
  firstRepeatOffset: number | null; // 初回月より後の最初の再訪までの月数（再訪なしなら null）
  hasYearLater: boolean; // +11〜+13ヶ月のいずれかに再訪があるか
}

// phoneHash ごとに、初回参加日・以降の再訪パターンを集計する
function buildPeople(all: HistoryRecord[], first: Map<string, string>): Person[] {
  const visitMonths = new Map<string, Set<string>>();
  for (const r of all) {
    if (!r.phoneHash) continue;
    const set = visitMonths.get(r.phoneHash) ?? new Set<string>();
    set.add(ymOf(r.date));
    visitMonths.set(r.phoneHash, set);
  }

  const people: Person[] = [];
  for (const [phone, firstDate] of first) {
    const firstYm = ymOf(firstDate);
    const months = visitMonths.get(phone) ?? new Set([firstYm]);
    let firstRepeatOffset: number | null = null;
    let hasYearLater = false;
    for (const ym of months) {
      const off = monthsBetween(firstYm, ym);
      if (off >= 1 && (firstRepeatOffset === null || off < firstRepeatOffset)) firstRepeatOffset = off;
      if (off >= 11 && off <= 13) hasYearLater = true;
    }
    people.push({ firstYm, firstYear: Number(firstYm.slice(0, 4)), firstRepeatOffset, hasYearLater });
  }
  return people;
}

export function buildCohortInsights(input: { all: HistoryRecord[]; cohorts: CohortRow[]; today: string }): InsightGroup[] {
  const { all, cohorts, today } = input;
  const todayYm = ymOf(today);
  const first = firstVisitMap(all); // 1回だけ計算し、人物集計と直近新規客の両方で使い回す
  const people = buildPeople(all, first);
  // グループ1・2は「初回月から13ヶ月の観測窓が完了した人」だけを対象にする（グループ3・4と同じ完了窓ルール）。
  // 窓が完了していない人を含めると、まだ再訪する余地が残っている人を「再訪なし」に数えてしまう（右側打ち切り）。
  const censoredPeople = people.filter(p => monthsBetween(p.firstYm, todayYm) >= 13);
  const groups: InsightGroup[] = [];

  // 1. リピートの全体像
  {
    const N = censoredPeople.length;
    const M = censoredPeople.filter(p => p.firstRepeatOffset !== null).length;
    if (N >= 20) {
      const p = pct(M, N);
      const hint = p >= 20 ? '→ 5人に1人以上が戻っている' : p >= 10 ? '→ 10人に1〜2人が戻る水準' : '→ 戻る人は10人に1人未満';
      groups.push({ title: 'リピートの全体像', items: [{ text: `13ヶ月以上前に初参加した ${N}人のうち、2回目以降も来た人 ${M}人（${p}%）`, hint }] });
    }
  }

  // 2. 戻ってくるタイミング
  {
    const repeaters = censoredPeople.filter(p => p.firstRepeatOffset !== null);
    const M = repeaters.length;
    if (M >= 10) {
      let a = 0, b = 0, c = 0;
      for (const p of repeaters) {
        const off = p.firstRepeatOffset!;
        if (off >= 1 && off <= 3) a++;
        else if (off >= 11 && off <= 13) b++;
        else c++;
      }
      const [pa, pb, pc] = distributePercents([a, b, c], M);
      const hint = pa > pb ? '→ 同じシーズン中に戻る人が多い' : pb > pa ? '→ 翌シーズンに戻る傾向' : undefined;
      groups.push({ title: '戻ってくるタイミング', items: [{ text: `再訪した人の内訳: 3ヶ月以内 ${pa}%／翌年の同時期（11〜13ヶ月後） ${pb}%／それ以外 ${pc}%`, hint }] });
    }
  }

  // 3. 年ごとの定着率（1年後に戻った割合）
  {
    const byYear = new Map<number, { n: number; r: number }>();
    for (const p of people) {
      const e = byYear.get(p.firstYear) ?? { n: 0, r: 0 };
      e.n++;
      if (p.hasYearLater) e.r++;
      byYear.set(p.firstYear, e);
    }
    const years = [...byYear.keys()]
      .filter(Y => monthsBetween(`${Y}-12`, todayYm) >= 13 && byYear.get(Y)!.n >= 20)
      .sort((a, b) => a - b);
    if (years.length > 0) {
      const pcts = years.map(Y => pct(byYear.get(Y)!.r, byYear.get(Y)!.n));
      const text = years.map((Y, i) => `${Y}年 ${pcts[i]}%`).join('／');
      let hint: string | undefined;
      if (years.length >= 2) {
        const d = pcts[pcts.length - 1] - pcts[pcts.length - 2];
        hint = d >= 5 ? '→ 定着率は上がっている' : d <= -5 ? '→ 定着率は下がっている' : '→ 定着率はほぼ横ばい';
      }
      groups.push({ title: '年ごとの定着率（1年後に戻った割合）', items: [{ text, hint }] });
    }
  }

  // 4. 初回月による戻りやすさ（暦月でプール）
  {
    const byMonth = new Map<number, { size: number; year: number }>();
    for (const c of cohorts) {
      if (monthsBetween(c.cohort, todayYm) < 13) continue;
      const mm = Number(c.cohort.slice(5, 7));
      const e = byMonth.get(mm) ?? { size: 0, year: 0 };
      e.size += c.size;
      e.year += c.yearLater;
      byMonth.set(mm, e);
    }
    const eligible = [...byMonth.entries()].filter(([, v]) => v.size >= 40).map(([mm, v]) => ({ mm, rate: pct(v.year, v.size) }));
    if (eligible.length >= 2) {
      const hi = eligible.reduce((a, b) => (b.rate > a.rate ? b : a));
      const lo = eligible.reduce((a, b) => (b.rate < a.rate ? b : a));
      // 全対象月の割合が同じ（比較材料がない）場合はグループごと省略する
      if (hi.mm !== lo.mm) {
        let hint: string;
        if (hi.rate - lo.rate < 5) hint = '→ 初回の時期による差は小さい';
        else if ((lo.mm === 7 || lo.mm === 8) && hi.mm !== 7 && hi.mm !== 8) hint = '→ 繁忙期に初めて来た人ほど翌年に戻りにくい傾向';
        else hint = '→ 初回の時期で翌年の戻りやすさに差がある';
        groups.push({ title: '初回月による戻りやすさ', items: [{ text: `初回が${hi.mm}月の人は翌年 ${hi.rate}%、${lo.mm}月の人は ${lo.rate}%（1年後に戻った割合）`, hint }] });
      }
    }
  }

  // 5. 直近の新規客
  {
    const thisYear = Number(today.slice(0, 4));
    const mmdd = today.slice(5);
    const curStart = `${thisYear}-01-01`;
    const cur = [...first.values()].filter(d => d >= curStart && d <= today).length;
    const prevStart = `${thisYear - 1}-01-01`;
    const prevEnd = `${thisYear - 1}-${mmdd}`;
    const prev = [...first.values()].filter(d => d >= prevStart && d <= prevEnd).length;
    if (prev >= 20) {
      const diff = pct(cur - prev, prev);
      const hint = diff >= 10 ? '→ 新規客は増えている' : diff <= -10 ? '→ 新規客は減っている' : '→ 新規客はほぼ横ばい';
      groups.push({ title: '直近の新規客', items: [{ text: `今年の初参加 ${cur}人（去年の同時期 ${prev}人、${signedPct(cur / prev)}）`, hint }] });
    }
  }

  return groups;
}
