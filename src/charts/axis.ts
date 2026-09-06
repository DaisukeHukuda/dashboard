// X軸ラベル: 描画対象(index % every === 0)のみ生成。ISO bucket かつ label===bucket なら「先頭と年境界に年付き」形式、それ以外は label をそのまま。
export function axisLabels(items: { bucket: string; label: string }[], every: number): (string | null)[] {
  let lastYear = '';
  return items.map((p, i) => {
    if (i % every !== 0) return null;
    const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(p.bucket);
    if (!(iso && p.label === p.bucket)) return p.label;
    const [, y, m, d] = iso; const md = d ? `${Number(m)}/${Number(d)}` : `${Number(m)}`;
    const text = y !== lastYear ? `${y}/${md}` : md; lastYear = y; return text;
  });
}
