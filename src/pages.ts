export function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function layout(title: string, body: string): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--ink:#1f2937;--muted:#6b7280;--accent:#1e3a5f;--line:#e5e7eb}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Hiragino Sans",sans-serif;background:var(--bg);color:var(--ink)}
header{background:var(--accent);color:#fff;padding:12px 16px;font-weight:700}
main{max-width:1100px;margin:0 auto;padding:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 16px}
.card h2{margin:0 0 12px;font-size:15px}
a{color:var(--accent)}
label{display:block;margin:8px 0 4px;font-size:13px;color:var(--muted)}
input,select{padding:8px;border:1px solid var(--line);border-radius:6px;font-size:14px}
button{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:9px 16px;font-size:14px;cursor:pointer}
</style></head><body>${body}</body></html>`;
}

export function loginPage(error?: string): string {
  const err = error ? `<p style="color:#b91c1c;font-size:13px">${esc(error)}</p>` : '';
  return layout('ログイン｜Sup! Sup! マーケ分析', `<main><div class="card" style="max-width:360px;margin:48px auto">
<h2>ログイン</h2>${err}
<form method="post" action="/login">
<label>ユーザー名</label><input name="username" autocomplete="username" required>
<label>パスワード</label><input name="password" type="password" autocomplete="current-password" required>
<div style="margin-top:12px"><button type="submit">ログイン</button></div>
</form></div></main>`);
}
