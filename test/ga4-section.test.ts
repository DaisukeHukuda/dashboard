import { describe, it, expect } from 'vitest';
import { renderTrafficSection } from '../src/ga4/section.js';

const base = { channels: [], sourceMedium: [], topPages: [], devices: [], regions: [], overlay: [], insights: [] };

describe('renderTrafficSection', () => {
  it('shows a not-connected notice when connected=false', () => {
    const html = renderTrafficSection({ ...base, connected: false }, '2025-09-06〜2026-09-05');
    expect(html).toContain('GA4');
    expect(html).toContain('未接続');
  });
  it('renders channel/pages/overlay cards when connected', () => {
    const connectedFixture = {
      ...base, connected: true,
      channels: [{ label: 'Organic Search', sessions: 60, users: 40 }],
      sourceMedium: [{ label: 'google / organic', sessions: 10 }],
      topPages: [{ label: '/tour', sessions: 20 }],
      overlay: [{ bucket: '2024-06', sessions: 100, bookings: 5 }],
      insights: ['流入の最大チャネルは Organic Search（全体の 100%）。'],
    };
    const html = renderTrafficSection(connectedFixture, '2025-09-06〜2026-09-05');
    expect(html).toContain('流入チャネル');
    expect(html).toContain('Organic Search');
    expect(html).toContain('人気ページ');
    expect(html).toContain('サイト訪問と参加の推移');
    expect(html).toContain('訪問100件あたり');
    expect(html).toContain('参加日ベース');
    expect(html).toContain('Google検索の検索結果から');
  });
  it('接続済みは見出しに対象期間ラベルが出る', () => {
    const connectedFixture = { ...base, connected: true };
    expect(renderTrafficSection(connectedFixture, '2025-09-06〜2026-09-05')).toContain('対象: 2025-09-06〜2026-09-05');
  });
});
