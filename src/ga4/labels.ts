const CHANNELS: Record<string, string> = {
  'organic search': '自然検索', 'direct': '直接アクセス', 'organic social': 'SNS', 'paid social': 'SNS広告',
  'referral': '他サイトのリンク', 'paid search': '有料検索', 'display': 'ディスプレイ広告', 'email': 'メール',
  'organic video': '動画', 'paid video': '動画広告', 'cross-network': '広告（複数媒体）', 'affiliates': 'アフィリエイト',
  'organic shopping': 'ショッピング', 'paid shopping': 'ショッピング広告', 'audio': '音声', 'sms': 'SMS',
  'mobile push notifications': 'プッシュ通知', 'unassigned': '不明', '(not set)': '不明',
};
export function channelNameJa(label: string): string {
  const k = label.trim().toLowerCase();
  return Object.hasOwn(CHANNELS, k) ? CHANNELS[k] : label;
}

const DEVICES: Record<string, string> = {
  'mobile': 'スマホ', 'desktop': 'PC', 'tablet': 'タブレット', 'smart tv': 'テレビ',
};
export function deviceNameJa(label: string): string {
  const k = label.trim().toLowerCase();
  return Object.hasOwn(DEVICES, k) ? DEVICES[k] : label;
}

const REGIONS: Record<string, string> = {
  hokkaido: '北海道', aomori: '青森', iwate: '岩手', miyagi: '宮城', akita: '秋田', yamagata: '山形', fukushima: '福島',
  ibaraki: '茨城', tochigi: '栃木', gunma: '群馬', saitama: '埼玉', chiba: '千葉', tokyo: '東京', kanagawa: '神奈川',
  niigata: '新潟', toyama: '富山', ishikawa: '石川', fukui: '福井', yamanashi: '山梨', nagano: '長野', gifu: '岐阜',
  shizuoka: '静岡', aichi: '愛知', mie: '三重', shiga: '滋賀', kyoto: '京都', osaka: '大阪', hyogo: '兵庫', nara: '奈良',
  wakayama: '和歌山', tottori: '鳥取', shimane: '島根', okayama: '岡山', hiroshima: '広島', yamaguchi: '山口',
  tokushima: '徳島', kagawa: '香川', ehime: '愛媛', kochi: '高知', fukuoka: '福岡', saga: '佐賀', nagasaki: '長崎',
  kumamoto: '熊本', oita: '大分', miyazaki: '宮崎', kagoshima: '鹿児島', okinawa: '沖縄',
};
export function regionNameJa(label: string): string {
  if (label.trim() === '(not set)') return '不明';
  const k = label.trim().toLowerCase().replace(/\s*(prefecture|-ken|-fu|-to)$/i, '');
  return Object.hasOwn(REGIONS, k) ? REGIONS[k] : label;
}

export function pageNameJa(path: string): string { return path === '/' ? 'トップページ' : path; }
