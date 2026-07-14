import type { KV } from './kv.js';
import type { HistoryRecord } from './types.js';

export async function getHistory(kv: KV): Promise<HistoryRecord[]> {
  const raw = await kv.get('history:latest');
  return raw ? (JSON.parse(raw) as HistoryRecord[]) : [];
}
