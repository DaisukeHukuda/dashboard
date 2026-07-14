import { describe, it, expect } from 'vitest';
import { CHANNEL_SPEC, DAILY_SESSIONS_SPEC, toNameValues, toDailySessions } from '../src/ga4/reports.js';

describe('specs', () => {
  it('channel spec uses default channel group + sessions/users', () => {
    expect(CHANNEL_SPEC.dimensions).toEqual(['sessionDefaultChannelGroup']);
    expect(CHANNEL_SPEC.metrics).toEqual(['sessions', 'totalUsers']);
  });
  it('daily sessions spec uses date + sessions', () => {
    expect(DAILY_SESSIONS_SPEC.dimensions).toEqual(['date']);
    expect(DAILY_SESSIONS_SPEC.metrics).toEqual(['sessions']);
  });
});

describe('toNameValues', () => {
  it('maps dims/mets to labelled rows', () => {
    const out = toNameValues([{ dims: ['Organic Search'], mets: [120, 90] }, { dims: ['Social'], mets: [80, 60] }]);
    expect(out).toEqual([
      { label: 'Organic Search', sessions: 120, users: 90 },
      { label: 'Social', sessions: 80, users: 60 },
    ]);
  });
});

describe('toDailySessions', () => {
  it('normalizes YYYYMMDD to YYYY-MM-DD and sorts asc', () => {
    const out = toDailySessions([{ dims: ['20240711'], mets: [5] }, { dims: ['20240710'], mets: [3] }]);
    expect(out).toEqual([{ date: '2024-07-10', sessions: 3 }, { date: '2024-07-11', sessions: 5 }]);
  });
});
