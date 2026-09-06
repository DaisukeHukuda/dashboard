import { describe, it, expect } from 'vitest';
import { renderTrafficSection } from '../src/ga4/section.js';

const base = { channels: [], sourceMedium: [], topPages: [], devices: [], regions: [], overlay: [], insights: [], sourceSeries: null, pageSeries: null };

describe('renderTrafficSection', () => {
  it('shows a not-connected notice when connected=false', () => {
    const html = renderTrafficSection({ ...base, connected: false }, '2025-09-06〜2026-09-05');
    expect(html).toContain('GA4');
    expect(html).toContain('未接続');
  });
  it('unavailable=trueの場合は一時的な取得失敗の文言を出す（未接続の文言とは異なる）', () => {
    const html = renderTrafficSection({ ...base, connected: false, unavailable: true }, 'x');
    expect(html).toContain('Web流入（GA4）');
    expect(html).toContain('GA4のデータを一時的に取得できませんでした');
    expect(html).toContain('再読み込み');
    expect(html).not.toContain('未接続');
  });
  it('unavailable未指定(false相当)の場合は従来どおり未接続文言', () => {
    const html = renderTrafficSection({ ...base, connected: false }, 'x');
    expect(html).toContain('未接続');
    expect(html).not.toContain('一時的に取得できません');
  });
  it('renders channel/pages/overlay cards when connected', () => {
    const connectedFixture = {
      ...base, connected: true,
      channels: [{ label: 'Organic Search', sessions: 60, users: 40 }],
      sourceMedium: [{ label: 'google / organic', sessions: 10 }],
      topPages: [{ label: '/tour', sessions: 20 }],
      overlay: [{ bucket: '2024-06', sessions: 100, bookings: 5 }],
      insights: [{ title: 'テスト', items: [{ text: '流入の最大チャネルは Organic Search（全体の 100%）。' }] }],
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
  it('参照元テーブルには解説が付くが、人気ページ・デバイス・地域テーブルには解説が付かない', () => {
    const connectedFixture = {
      ...base, connected: true,
      sourceMedium: [{ label: 'google / organic', sessions: 10 }],
      topPages: [{ label: 'google / organic', sessions: 1 }],
      devices: [{ label: 'google / organic', sessions: 1 }],
      regions: [{ label: 'google / organic', sessions: 1 }],
    };
    const html = renderTrafficSection(connectedFixture, '2025-09-06〜2026-09-05');
    const occurrences = html.split('Google検索の検索結果から').length - 1;
    expect(occurrences).toBe(1);
  });
  it('sourceSeries/pageSeries があれば表の上に推移グラフ、null なら表のみ', () => {
    const connectedFixture = {
      ...base, connected: true,
      sourceMedium: [{ label: 'google / organic', sessions: 10 }],
      topPages: [{ label: '/tour', sessions: 20 }],
    };
    const series = { buckets: ['2026-05', '2026-06'], series: [{ name: 'Google検索', values: [10, 12] }] };
    const withS = renderTrafficSection({ ...connectedFixture, sourceSeries: series, pageSeries: series }, 'x');
    expect((withS.match(/<polyline/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(withS).toContain('上位1件のセッション推移（月次）');
    const noS = renderTrafficSection({ ...connectedFixture, sourceSeries: null, pageSeries: null }, 'x');
    expect(noS).not.toContain('<polyline');
  });
  it('注記は実データから生成される：上位2件＋その他のセッション推移（月次）', () => {
    const connectedFixture = { ...base, connected: true, sourceMedium: [{ label: 'google / organic', sessions: 10 }] };
    const series = {
      buckets: ['2026-05', '2026-06'],
      series: [{ name: 'Google検索', values: [10, 12] }, { name: 'Instagram', values: [3, 4] }, { name: 'その他', values: [1, 2] }],
    };
    const html = renderTrafficSection({ ...connectedFixture, sourceSeries: series }, 'x');
    expect(html).toContain('上位2件＋その他のセッション推移（月次）');
  });
  it('注記は粒度ラベルにも従う：上位1件の表示回数推移（日次）・その他なし', () => {
    const connectedFixture = { ...base, connected: true, topPages: [{ label: '/tour', sessions: 20 }] };
    const series = { buckets: ['2026-08-01'], series: [{ name: 'トップページ', values: [5] }] };
    const html = renderTrafficSection({ ...connectedFixture, pageSeries: series }, 'x', '日次');
    expect(html).toContain('上位1件の表示回数推移（日次）');
    expect(html).not.toContain('その他');
  });
  it('空のseries（buckets/seriesが0件）では注記もグラフも出さない', () => {
    const connectedFixture = { ...base, connected: true, sourceMedium: [{ label: 'google / organic', sessions: 10 }] };
    const emptyBuckets = { buckets: [], series: [{ name: 'Google検索', values: [] }] };
    const emptySeries = { buckets: ['2026-05'], series: [] };
    const html1 = renderTrafficSection({ ...connectedFixture, sourceSeries: emptyBuckets }, 'x');
    const html2 = renderTrafficSection({ ...connectedFixture, sourceSeries: emptySeries }, 'x');
    expect(html1).not.toContain('件の');
    expect(html1).not.toContain('<polyline');
    expect(html2).not.toContain('件の');
    expect(html2).not.toContain('<polyline');
  });
  it('人気ページ表のヘッダは「表示回数」', () => {
    const connectedFixture = { ...base, connected: true, topPages: [{ label: '/tour', sessions: 20 }] };
    const html = renderTrafficSection(connectedFixture, 'x');
    expect(html).toContain('<th style="padding:2px 10px">表示回数</th>');
  });
  it('参照元テーブルのヘッダは従来どおり「セッション」', () => {
    const connectedFixture = { ...base, connected: true, sourceMedium: [{ label: 'google / organic', sessions: 10 }] };
    const html = renderTrafficSection(connectedFixture, 'x');
    expect(html).toContain('<th style="padding:2px 10px">セッション</th>');
  });
  it('分類不能な参照元は解説なし（解説用のdivが付かない）', () => {
    const connectedFixture = {
      ...base, connected: true,
      sourceMedium: [{ label: 'foo / bar', sessions: 10 }],
    };
    const html = renderTrafficSection(connectedFixture, '2025-09-06〜2026-09-05');
    expect(html).not.toContain('font-size:11px;color:var(--muted);margin-top:1px');
  });
  it('デバイス・地域テーブルは日本語ラベル・桁区切り・flex align-items:flex-start で引き伸ばし防止', () => {
    const connectedFixture = {
      ...base, connected: true,
      devices: [{ label: 'mobile', sessions: 34271 }],
      regions: [{ label: 'Tokyo', sessions: 12563 }],
    };
    const html = renderTrafficSection(connectedFixture, '2025-09-06〜2026-09-05');
    expect(html).toContain('スマホ');
    expect(html).toContain('東京');
    expect(html).toContain('34,271');
    expect(html).toContain('12,563');
    expect(html).toContain('align-items:flex-start');
  });
  it('参照元テーブルには解説が付くが、人気ページ・デバイス・地域テーブルには解説が付かない（修正後も変わらず）', () => {
    const connectedFixture = {
      ...base, connected: true,
      sourceMedium: [{ label: 'google / organic', sessions: 10 }],
      topPages: [{ label: 'google / organic', sessions: 1 }],
      devices: [{ label: 'google / organic', sessions: 1 }],
      regions: [{ label: 'google / organic', sessions: 1 }],
    };
    const html = renderTrafficSection(connectedFixture, '2025-09-06〜2026-09-05');
    const occurrences = html.split('Google検索の検索結果から').length - 1;
    expect(occurrences).toBe(1);
  });
});
