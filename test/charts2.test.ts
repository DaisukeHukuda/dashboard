import { describe, it, expect } from 'vitest';
import { renderHeatmap } from '../src/charts/heatmap.js';
import { renderCohortGrid } from '../src/charts/cohortgrid.js';

describe('renderHeatmap', () => {
  it('renders 84 cells', () => {
    const counts = Array.from({ length: 12 }, () => Array(7).fill(1));
    const svg = renderHeatmap({ counts, max: 1 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect((svg.match(/<rect/g) ?? []).length).toBe(84);
  });
  it('handles max=0 without crashing', () => {
    const counts = Array.from({ length: 12 }, () => Array(7).fill(0));
    expect(renderHeatmap({ counts, max: 0 }).startsWith('<svg')).toBe(true);
  });
});

describe('renderCohortGrid', () => {
  it('renders a row per cohort with percentage text', () => {
    const svg = renderCohortGrid([{ cohort: '2023-01', size: 4, retention: [4, 2, 1] }]);
    expect(svg).toContain('2023-01');
    expect(svg).toContain('%');
  });
  it('handles empty', () => {
    expect(renderCohortGrid([]).startsWith('<svg')).toBe(true);
  });
});
