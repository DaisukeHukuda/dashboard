import type { KV } from './kv.js';
import type { HistoryRecord } from './types.js';

// ダッシュボードは慣例として DATA KV を読み取り専用として扱う（history:latest のみ読む。書き込みは全て DASH 側で行う）
export async function getHistory(kv: KV): Promise<HistoryRecord[]> {
  const raw = await kv.get('history:latest');
  return raw ? (JSON.parse(raw) as HistoryRecord[]) : [];
}
