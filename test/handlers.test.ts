import { describe, it, expect } from 'vitest';
import { clampEnd } from '../src/handlers.js';

describe('clampEnd', () => {
  it('未来日は today にクランプされる', () => {
    expect(clampEnd('2026-12-31', '2026-09-06')).toBe('2026-09-06');
  });
  it('today 以前の日付はそのまま', () => {
    expect(clampEnd('2026-08-01', '2026-09-06')).toBe('2026-08-01');
    expect(clampEnd('2026-09-06', '2026-09-06')).toBe('2026-09-06');
  });
});
