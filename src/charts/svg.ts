export function escXml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
export function svgOpen(w: number, h: number): string {
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg" font-family="system-ui,sans-serif">`;
}
export function svgClose(): string { return '</svg>'; }
// 値 v(0..max) を、上端 top・高さ height の描画領域内の y 座標へ写す（v=max → top、v=0 → top+height）
export function scaleY(v: number, max: number, top: number, height: number): number {
  if (max <= 0) return top + height;
  return top + height - (v / max) * height;
}
