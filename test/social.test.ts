import { describe, it, expect } from 'vitest';
import { computeSocialOverlay } from '../src/metrics/social.js';
import { resolvePeriod } from '../src/period.js';
import type { HistoryRecord } from '../src/types.js';

const r = (date: string): HistoryRecord => ({ date, course: 'A', pax: 1, amount: 1, status: 's', phoneHash: '' });

describe('computeSocialOverlay', () => {
  it('aligns post counts and bookings by month', () => {
    const p = resolvePeriod('2024', '2025-01-01');
    const all = [r('2024-06-05'), r('2024-06-20'), r('2024-07-02')];
    const media = [
      { timestamp: '2024-06-10T09:00:00+0900' },
      { timestamp: '2024-06-28T12:00:00+0900' },
      { timestamp: '2024-07-01T08:00:00+0900' },
      { timestamp: '2023-06-01T00:00:00+0900' }, // 期間外は無視
    ];
    expect(computeSocialOverlay(all, p, media)).toEqual([
      { bucket: '2024-06', posts: 2, bookings: 2 },
      { bucket: '2024-07', posts: 1, bookings: 1 },
    ]);
  });

  it('drops buckets before the oldest fetched post (24ヶ月で投稿が最新25件しか取れない場合)', () => {
    const p = resolvePeriod('2024', '2025-01-01');
    const all = [r('2024-05-10'), r('2024-06-05'), r('2024-07-02')];
    // IG APIの取得上限で、実際は最新1ヶ月分の投稿しか届かなかった想定
    const media = [{ timestamp: '2024-07-01T08:00:00+0900' }];
    expect(computeSocialOverlay(all, p, media)).toEqual([
      { bucket: '2024-07', posts: 1, bookings: 1 },
    ]);
  });

  it('keeps every bucket when posts are available across the whole period', () => {
    const p = resolvePeriod('2024', '2025-01-01');
    const all = [r('2024-05-10'), r('2024-06-05'), r('2024-07-02')];
    const media = [
      { timestamp: '2024-05-11T08:00:00+0900' },
      { timestamp: '2024-06-06T08:00:00+0900' },
      { timestamp: '2024-07-01T08:00:00+0900' },
    ];
    expect(computeSocialOverlay(all, p, media)).toEqual([
      { bucket: '2024-05', posts: 1, bookings: 1 },
      { bucket: '2024-06', posts: 1, bookings: 1 },
      { bucket: '2024-07', posts: 1, bookings: 1 },
    ]);
  });

  it('keeps posts:0 buckets untouched when there are no posts at all (従来どおり)', () => {
    const p = resolvePeriod('2024', '2025-01-01');
    const all = [r('2024-05-10'), r('2024-06-05')];
    const media: { timestamp: string }[] = [];
    expect(computeSocialOverlay(all, p, media)).toEqual([
      { bucket: '2024-05', posts: 0, bookings: 1 },
      { bucket: '2024-06', posts: 0, bookings: 1 },
    ]);
  });
});
