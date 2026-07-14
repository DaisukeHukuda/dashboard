// すべて 'YYYY-MM-DD' 文字列を JST の暦日として扱う（UTCのDateを日付演算にのみ使う）
function toUTC(ymd: string): Date { return new Date(`${ymd}T00:00:00Z`); }
function fmt(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function jstToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function weekdayOf(ymd: string): number { return toUTC(ymd).getUTCDay(); }
export function monthOf(ymd: string): number { return toUTC(ymd).getUTCMonth() + 1; }
export function ymOf(ymd: string): string { return ymd.slice(0, 7); }

export function addDaysToYmd(ymd: string, days: number): string {
  const d = toUTC(ymd); d.setUTCDate(d.getUTCDate() + days); return fmt(d);
}
export function addMonthsToYmd(ymd: string, months: number): string {
  const d = toUTC(ymd); d.setUTCMonth(d.getUTCMonth() + months); return fmt(d);
}
// 'YYYY-MM' 同士の月数差（b - a）
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}
