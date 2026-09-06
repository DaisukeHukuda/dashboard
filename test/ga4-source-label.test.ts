import { describe, it, expect } from 'vitest';
import { describeSourceMedium } from '../src/ga4/sourceLabel.js';

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
    ['foo / bar', 'foo / bar からの流入'],
  ];
  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => { expect(describeSourceMedium(input)).toBe(expected); });
  }
});
