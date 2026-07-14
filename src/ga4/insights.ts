import type { NameValue } from './reports.js';
import type { TrafficPoint } from '../metrics/traffic.js';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function buildGa4Insights(input: { channels: NameValue[]; devices: NameValue[]; overlay: TrafficPoint[] }): string[] {
  const out: string[] = [];
  const chTotal = input.channels.reduce((s, c) => s + c.sessions, 0);
  if (chTotal > 0) {
    const top = [...input.channels].sort((a, b) => b.sessions - a.sessions)[0];
    out.push(`流入の最大チャネルは ${top.label}（全体の ${pct(top.sessions / chTotal)}）。`);
  }
  const dvTotal = input.devices.reduce((s, d) => s + d.sessions, 0);
  if (dvTotal > 0) {
    const mobile = input.devices.find(d => d.label === 'mobile');
    if (mobile) out.push(`モバイル比率は ${pct(mobile.sessions / dvTotal)}。`);
  }
  const withBoth = input.overlay.filter(p => p.sessions > 0 && p.bookings > 0);
  if (withBoth.length >= 2) {
    out.push(`流入と予約の月次推移を重ねて確認できます（${withBoth.length} ヶ月分でセッションと予約が併存）。`);
  }
  return out;
}
