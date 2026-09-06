import { describe, it, expect } from 'vitest';
import { channelNameJa, regionNameJa, pageNameJa } from '../src/ga4/labels.js';

describe('ga4 labels', () => {
  it('channelNameJa', () => {
    expect(channelNameJa('Organic Search')).toBe('自然検索');
    expect(channelNameJa('direct')).toBe('直接アクセス');
    expect(channelNameJa('Organic Social')).toBe('SNS');
    expect(channelNameJa('Paid Social')).toBe('SNS広告');
    expect(channelNameJa('Referral')).toBe('他サイトのリンク');
    expect(channelNameJa('Unassigned')).toBe('不明');
    expect(channelNameJa('(not set)')).toBe('不明');
    expect(channelNameJa('Something New')).toBe('Something New');
  });
  it('regionNameJa', () => {
    expect(regionNameJa('Tokyo')).toBe('東京'); expect(regionNameJa('Tochigi')).toBe('栃木'); expect(regionNameJa('Kanagawa')).toBe('神奈川');
    expect(regionNameJa('Hokkaido')).toBe('北海道'); expect(regionNameJa('California')).toBe('California');
  });
  it('regionNameJa: 都道府県サフィックス除去', () => {
    expect(regionNameJa('Tokyo Prefecture')).toBe('東京');
    expect(regionNameJa('Osaka-fu')).toBe('大阪');
  });
  it('pageNameJa', () => { expect(pageNameJa('/')).toBe('トップページ'); expect(pageNameJa('/course')).toBe('/course'); });
});
