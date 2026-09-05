// ダッシュボードの並び替え可能セクション。並び順は DASH KV に保存する。
export const SECTION_IDS = ['kpi', 'insights', 'trend', 'heatmap', 'cohort', 'course', 'source', 'ga4', 'ig'] as const;
export type SectionId = (typeof SECTION_IDS)[number];
export const DEFAULT_ORDER: SectionId[] = [...SECTION_IDS];
export const SECTION_ORDER_KEY = 'ui:sectionOrder';

const KNOWN = new Set<string>(SECTION_IDS);

// 保存値（未検証のJSON parse結果）から表示順を決める。
// 1) 既知IDのみ・重複除去で基礎順を作る（削除済みセクションのIDは無視）
// 2) 保存に無い既定ID（保存後に追加された新セクション）は、既定順の直前IDの直後へ挿入
// 3) 保存なし・不正・空は既定順
export function applyOrder(saved: unknown): SectionId[] {
  if (!Array.isArray(saved)) return [...DEFAULT_ORDER];
  const base: SectionId[] = [];
  for (const id of saved) {
    if (typeof id === 'string' && KNOWN.has(id) && !base.includes(id as SectionId)) base.push(id as SectionId);
  }
  if (base.length === 0) return [...DEFAULT_ORDER];
  for (let i = 0; i < DEFAULT_ORDER.length; i++) {
    const id = DEFAULT_ORDER[i];
    if (base.includes(id)) continue;
    const prev = i > 0 ? base.indexOf(DEFAULT_ORDER[i - 1]) : -1;
    base.splice(prev + 1, 0, id);
  }
  return base;
}

// POST body の検証: 全IDの完全な並べ替え（過不足・重複・未知IDなし）のみ許可
export function isValidOrder(order: unknown): order is SectionId[] {
  return Array.isArray(order)
    && order.length === SECTION_IDS.length
    && new Set(order).size === order.length
    && order.every(id => typeof id === 'string' && KNOWN.has(id));
}

// メディア分類（サイドバーの色・カード左ボーダー・ビュー絞り込みに使用）
export type MediaId = 'booking' | 'web' | 'sns';
export const MEDIA_OF: Record<SectionId, MediaId> = {
  kpi: 'booking', insights: 'booking', trend: 'booking', heatmap: 'booking',
  cohort: 'booking', course: 'booking', source: 'booking',
  ga4: 'web', ig: 'sns',
};

// 表示ビュー。URLクエリ ?view= で切替（既定=予約分析）
export type ViewId = 'bookings' | 'web' | 'sns' | 'all';
const VIEW_IDS: readonly string[] = ['bookings', 'web', 'sns', 'all'];

export function resolveView(param: string | null): ViewId {
  return VIEW_IDS.includes(param ?? '') ? (param as ViewId) : 'bookings';
}

export function sectionsForView(order: SectionId[], view: ViewId): SectionId[] {
  if (view === 'all') return order;
  const media: MediaId = view === 'bookings' ? 'booking' : view === 'web' ? 'web' : 'sns';
  return order.filter(id => MEDIA_OF[id] === media);
}
