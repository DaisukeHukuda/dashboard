import { describe, it, expect } from 'vitest';
import { describeSourceMedium, isInstagramSource, isAsoviewSource, sourceShortName } from '../src/ga4/sourceLabel.js';

describe('describeSourceMedium', () => {
  const cases: [string, string][] = [
    ['google / organic', 'Google検索の検索結果から（広告ではない自然検索）'],
    ['yahoo / organic', 'Yahoo!検索の検索結果から（広告ではない自然検索）'],
    ['bing / organic', 'Bing検索の検索結果から（広告ではない自然検索）'],
    ['(direct) / (none)', 'URL直接入力・ブックマーク・LINEなどアプリ内リンク（参照元が取れない流入）'],
    ['l.instagram.com / referral', 'Instagramのプロフィールや投稿のリンクから'],
    ['instagram / social', 'Instagramのプロフィールや投稿のリンクから'],
    ['m.facebook.com / referral', 'Facebookのプロフィールや投稿のリンクから'],
    ['t.co / referral', 'X（旧Twitter）のプロフィールや投稿のリンクから'],
    ['asoview.com / referral', 'アソビュー（予約サイト）からのリンク'],
    ['google / cpc', 'Google広告のクリック'],
    ['example.jp / referral', '他サイト（example.jp）のリンクから'],
    ['newsletter / email', 'メール内のリンクから'],
    ['someapp / social', 'SNS（someapp）のリンクから'],
    ['(not set)', '計測できなかった流入'],
    ['foo / bar', ''],
    ['constructor / organic', 'constructor検索の検索結果から（広告ではない自然検索）'],
    ['notinstagram.com / referral', '他サイト（notinstagram.com）のリンクから'],
    ['example.com', 'example.com からの流入'],
    ['(不明)', '(不明) からの流入'],
    ['instagram / paid_social', 'Instagram広告のクリック'],
    ['nottripadvisor.co.jp / referral', '他サイト（nottripadvisor.co.jp）のリンクから'],
    ['tripadvisor.co.jp / referral', 'トリップアドバイザーからのリンク'],
  ];
  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => { expect(describeSourceMedium(input)).toBe(expected); });
  }
});

describe('sourceShortName', () => {
  const cases: [string, string][] = [
    ['google / organic', 'Google検索'], ['yahoo / organic', 'Yahoo!検索'], ['(direct) / (none)', '直接アクセス'],
    ['l.instagram.com / referral', 'Instagram'], ['m.facebook.com / referral', 'Facebook'], ['asoview.com / referral', 'アソビュー'],
    ['example.jp / referral', 'example.jp'], ['google / cpc', 'Google広告'], ['(not set)', '不明'], ['foo / bar', 'foo / bar'],
  ];
  for (const [i, o] of cases) it(`${i} → ${o}`, () => expect(sourceShortName(i)).toBe(o));
});

describe('isInstagramSource / isAsoviewSource', () => {
  it('Instagram経由の判定', () => {
    expect(isInstagramSource('l.instagram.com / referral')).toBe(true);
    expect(isInstagramSource('instagram / social')).toBe(true);
    expect(isInstagramSource('google / organic')).toBe(false);
    expect(isInstagramSource('notinstagram.com / referral')).toBe(false);
  });
  it('アソビュー経由の判定', () => {
    expect(isAsoviewSource('asoview.com / referral')).toBe(true);
    expect(isAsoviewSource('m.asoview.com / referral')).toBe(true);
    expect(isAsoviewSource('google / organic')).toBe(false);
  });
});
