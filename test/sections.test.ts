import { describe, it, expect } from 'vitest';
import { SECTION_IDS, DEFAULT_ORDER, applyOrder, isValidOrder } from '../src/sections.js';

describe('sections', () => {
  it('SECTION_IDS は10ブロック', () => {
    expect(SECTION_IDS).toEqual(['kpi','insights','trend','heatmap','weather','cohort','course','source','ga4','ig']);
  });

  describe('applyOrder', () => {
    it('保存なし・不正・空は既定順', () => {
      expect(applyOrder(null)).toEqual(DEFAULT_ORDER);
      expect(applyOrder('broken')).toEqual(DEFAULT_ORDER);
      expect(applyOrder([])).toEqual(DEFAULT_ORDER);
      expect(applyOrder([123, {}])).toEqual(DEFAULT_ORDER);
    });
    it('完全な保存順はそのまま使う', () => {
      const rev = [...DEFAULT_ORDER].reverse();
      expect(applyOrder(rev)).toEqual(rev);
    });
    it('未知IDは無視し重複は除去する', () => {
      const withJunk = ['zzz', ...DEFAULT_ORDER, 'kpi'];
      expect(applyOrder(withJunk)).toEqual(DEFAULT_ORDER);
    });
    it('保存に無い既定ID（将来の新セクション相当）は既定順の直前IDの直後に入る', () => {
      const savedWithoutWeather = DEFAULT_ORDER.filter(id => id !== 'weather').reverse();
      const result = applyOrder(savedWithoutWeather);
      // weather は既定順で heatmap の直後
      expect(result.indexOf('weather')).toBe(result.indexOf('heatmap') + 1);
      expect(result.length).toBe(DEFAULT_ORDER.length);
    });
    it('先頭の既定ID（kpi）が保存に無い場合は先頭に挿入される', () => {
      const savedWithoutKpi = DEFAULT_ORDER.filter(id => id !== 'kpi');
      const result = applyOrder(savedWithoutKpi);
      expect(result[0]).toBe('kpi');
      expect(result.length).toBe(DEFAULT_ORDER.length);
    });
    it('連続して欠けた既定IDも既定順の直前IDの直後に連なって入る', () => {
      const savedWithoutTwo = DEFAULT_ORDER.filter(id => id !== 'insights' && id !== 'trend');
      const result = applyOrder(savedWithoutTwo);
      expect(result.indexOf('insights')).toBe(result.indexOf('kpi') + 1);
      expect(result.indexOf('trend')).toBe(result.indexOf('insights') + 1);
      expect(result.length).toBe(DEFAULT_ORDER.length);
    });
  });

  describe('isValidOrder', () => {
    it('全10IDの並べ替えのみ許可', () => {
      expect(isValidOrder([...DEFAULT_ORDER].reverse())).toBe(true);
      expect(isValidOrder(DEFAULT_ORDER.slice(1))).toBe(false);          // 不足
      expect(isValidOrder([...DEFAULT_ORDER, 'kpi'])).toBe(false);       // 重複・過多
      expect(isValidOrder([...DEFAULT_ORDER.slice(0, 9), 'zzz'])).toBe(false); // 未知ID
      expect(isValidOrder('kpi')).toBe(false);                            // 非配列
    });
  });
});
