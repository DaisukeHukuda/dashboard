import { describe, it, expect } from 'vitest';
import { renderTrafficSection } from '../src/ga4/section.js';

const base = { channels: [], sourceMedium: [], topPages: [], devices: [], regions: [], overlay: [], insights: [] };

describe('renderTrafficSection', () => {
  it('shows a not-connected notice when connected=false', () => {
    const html = renderTrafficSection({ ...base, connected: false });
    expect(html).toContain('GA4');
    expect(html).toContain('未接続');
  });
  it('renders channel/pages/overlay cards when connected', () => {
    const html = renderTrafficSection({
      ...base, connected: true,
      channels: [{ label: 'Organic Search', sessions: 60, users: 40 }],
      topPages: [{ label: '/tour', sessions: 20 }],
      overlay: [{ bucket: '2024-06', sessions: 100, bookings: 5 }],
      insights: ['流入の最大チャネルは Organic Search（全体の 100%）。'],
    });
    expect(html).toContain('流入チャネル');
    expect(html).toContain('Organic Search');
    expect(html).toContain('人気ページ');
    expect(html).toContain('認知→予約');
  });
});
