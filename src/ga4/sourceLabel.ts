// GA4 の sessionSourceMedium（例 "google / organic"）を、経営者が読める短い日本語にする。
const SEARCH_ENGINES: Record<string, string> = { google: 'Google', yahoo: 'Yahoo!', bing: 'Bing', duckduckgo: 'DuckDuckGo', baidu: 'Baidu', ecosia: 'Ecosia' };
const searchEngineName = (s: string, source: string): string => Object.hasOwn(SEARCH_ENGINES, s) ? SEARCH_ENGINES[s] : source;

const SNS: { match: RegExp; name: string }[] = [
  { match: /^instagram$|(^|\.)instagram\.com$/, name: 'Instagram' },
  { match: /^facebook$|(^|\.)facebook\.com$/, name: 'Facebook' },
  { match: /^t\.co$|(^|\.)twitter\.com$|^x\.com$/, name: 'X（旧Twitter）' },
  { match: /(^|\.)youtube\.com$|^youtube$/, name: 'YouTube' },
  { match: /^line$|(^|\.)line\.me$/, name: 'LINE' },
];

const KNOWN_SITES: { match: RegExp; name: string }[] = [
  { match: /(^|\.)asoview\.com$/, name: 'アソビュー（予約サイト）' },
  { match: /(^|\.)jalan\.net$/, name: 'じゃらん' },
  { match: /(^|\.)tripadvisor\.[a-z.]+$/, name: 'トリップアドバイザー' },
];

// GA4 の sessionSourceMedium ラベル（例 "l.instagram.com / referral"）が Instagram / アソビュー経由かどうかの判定。
// insights.ts の集計（チャネル横断のシェア計算）と sourceLabel の分類、両方から使う共通ロジック。
export function isInstagramSource(label: string): boolean {
  return /(^|\.)instagram\.com\b|^instagram\b/i.test(label.split(' / ')[0].trim());
}
export function isAsoviewSource(label: string): boolean {
  return /(^|\.)asoview\.com\b/i.test(label.split(' / ')[0].trim());
}

export function describeSourceMedium(label: string): string {
  const [rawSource = '', rawMedium = ''] = label.split(' / ');
  const source = rawSource.trim();
  const medium = rawMedium.trim().toLowerCase();
  const s = source.toLowerCase();

  if (s === '(not set)') return '計測できなかった流入';
  if (s === '(direct)' || medium === '(none)') return 'URL直接入力・ブックマーク・LINEなどアプリ内リンク（参照元が取れない流入）';
  if (medium === 'organic') return `${searchEngineName(s, source)}検索の検索結果から（広告ではない自然検索）`;
  if (medium === 'cpc' || medium === 'ppc' || medium.startsWith('paid')) {
    const sns = SNS.find(k => k.match.test(s));
    return `${sns ? sns.name : searchEngineName(s, source)}広告のクリック`;
  }
  if (medium === 'email') return 'メール内のリンクから';

  const sns = SNS.find(k => k.match.test(s));
  if (sns) return `${sns.name}のプロフィールや投稿のリンクから`;
  if (medium === 'social') return `SNS（${source}）のリンクから`;

  const site = KNOWN_SITES.find(k => k.match.test(s));
  if (site) return `${site.name}からのリンク`;
  if (medium === 'referral') return `他サイト（${source}）のリンクから`;
  if (!medium) return `${source} からの流入`;
  return '';
}

export function sourceShortName(label: string): string {
  const [rawSource = '', rawMedium = ''] = label.split(' / ');
  const source = rawSource.trim(); const medium = rawMedium.trim().toLowerCase(); const s = source.toLowerCase();
  if (s === '(not set)') return '不明';
  if (s === '(direct)' || medium === '(none)') return '直接アクセス';
  const engine = Object.hasOwn(SEARCH_ENGINES, s) ? SEARCH_ENGINES[s] : null;
  if (medium === 'organic') return `${engine ?? source}検索`;
  if (medium === 'cpc' || medium === 'ppc' || medium.startsWith('paid')) return `${engine ?? source}広告`;
  const sns = SNS.find(k => k.match.test(s)); if (sns) return sns.name;
  const site = KNOWN_SITES.find(k => k.match.test(s)); if (site) return site.name.replace(/（.*）$/, '');
  if (medium === 'referral') return source;
  return label;
}
