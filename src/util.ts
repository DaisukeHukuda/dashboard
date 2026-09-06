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

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 翌月0日=当月末
  return `${ym}-${String(last).padStart(2, '0')}`;
}

export function daysBetweenYmd(a: string, b: string): number {
  return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
}
