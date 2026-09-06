import { describe, it, expect } from 'vitest';
import { renderCohortGrid } from '../src/charts/cohortgrid.js';
import type { CohortRow } from '../src/metrics/cohort.js';

const row = (cohort: string, size: number, retention: number[], within3: number, yearLater: number): CohortRow =>
  ({ cohort, size, retention, within3, yearLater });

describe('renderCohortGrid', () => {
  it('新しい初回月が上（入力配列は変更しない）', () => {
    const rows = [row('2024-01', 10, Array(13).fill(10), 5, 3), row('2024-03', 8, Array(13).fill(8), 4, 2)];
    const html = renderCohortGrid(rows, '2026-09');
    expect(html.indexOf('2024-03')).toBeLessThan(html.indexOf('2024-01'));
    // 入力配列は変更されない
    expect(rows[0].cohort).toBe('2024-01');
    expect(rows[1].cohort).toBe('2024-03');
  });

  it('PC表のtheadは+12mまで、+13mは無い', () => {
    const rows = [row('2024-01', 10, Array(14).fill(10), 5, 3)];
    const html = renderCohortGrid(rows, '2026-09');
    expect(html).toContain('+12m');
    expect(html).not.toContain('+13m');
  });

  it('+0mセルは100%', () => {
    const rows = [row('2024-01', 10, Array(13).fill(10), 5, 3)];
    const html = renderCohortGrid(rows, '2026-09');
    expect(html).toContain('100%');
  });

  it('未来セルはclass="future"かつ—', () => {
    // cohort 2024-08、todayYm 2024-09 → 経過1ヶ月。+2m以降は未来。
    const rows = [row('2024-08', 5, [5, 3, 0, 0], 0, 0)];
    const html = renderCohortGrid(rows, '2024-09');
    expect(html).toMatch(/<td class="future"[^>]*title="まだ時期が来ていません">—<\/td>/);
  });

  it('要約表: within3/yearLaterの%表示と、未経過は—', () => {
    // cohort 2024-08、todayYm 2024-09 → 3ヶ月未経過・13ヶ月未経過
    const rows = [row('2024-08', 4, Array(13).fill(0), 2, 1)];
    const html = renderCohortGrid(rows, '2024-09');
    const spMatch = html.match(/<div class="cohort-wrap cohort-sp">[\s\S]*$/)![0];
    expect(spMatch).toContain('—'); // 3ヶ月以内・1年後とも未経過で—

    // 十分に時間が経過している場合は%表示
    const rows2 = [row('2020-01', 4, Array(13).fill(0), 2, 1)];
    const html2 = renderCohortGrid(rows2, '2026-09');
    const spMatch2 = html2.match(/<div class="cohort-wrap cohort-sp">[\s\S]*$/)![0];
    expect(spMatch2).toContain('50%'); // within3: 2/4, yearLater: 1/4→25%も含む
    expect(spMatch2).toContain('25%');
  });

  it('空データは案内文言を返す', () => {
    const out = renderCohortGrid([], '2026-09');
    expect(out).toContain('データがありません');
    expect(out).toContain('color:var(--muted)');
  });
});
