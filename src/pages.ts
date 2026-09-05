import type { Period } from './period.js';
import type { Kpi } from './metrics/kpi.js';
import type { TrendPoint } from './metrics/trend.js';
import type { Heatmap } from './metrics/heatmap.js';
import type { CohortRow } from './metrics/cohort.js';
import type { CourseRow } from './metrics/course.js';
import { renderTrendChart } from './charts/line.js';
import { renderCourseBars } from './charts/bar.js';
import { renderHeatmap } from './charts/heatmap.js';
import { renderCohortGrid } from './charts/cohortgrid.js';
import { renderTrafficSection, type TrafficData } from './ga4/section.js';
import { renderSocialSection, type SocialData } from './ig/section.js';
import { type SectionId, type ViewId, MEDIA_OF, sectionsForView } from './sections.js';

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
.sec-tools{display:none;gap:8px;margin:0 0 8px}
body.reorder .sec-tools{display:flex}
.sec-tools button{min-height:44px;min-width:80px;font-size:14px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
.sec-tools button:disabled{opacity:.3}
body.reorder #reorderBar{position:sticky;top:0;z-index:10;display:flex;gap:10px;align-items:center}
#reorderBar button{min-height:44px;min-width:88px;font-size:14px;border-radius:8px;border:1px solid var(--line)}
#reorderSave{background:var(--accent);color:#fff;border:none}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--accent);color:#fff;padding:10px 16px;border-radius:8px;font-size:14px;z-index:20}
.p-note{font-size:11px;color:var(--muted);font-weight:400;margin-left:8px;white-space:nowrap}
.p-note::before{content:" "}
:root{--m-booking:#1e3a5f;--m-web:#16a34a;--m-sns:#db2777}
.shell{display:flex;align-items:flex-start;max-width:1300px;margin:0 auto}
.side{width:180px;flex:none;position:sticky;top:0;padding:12px 8px}
.side a{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:8px;text-decoration:none;color:var(--ink);font-size:14px;min-height:44px;border:1px solid transparent}
.side a.active{background:#fff;font-weight:700;border:1px solid var(--line)}
.dot{width:10px;height:10px;border-radius:50%;flex:none}
main{flex:1;min-width:0}
section[data-media="booking"] .card{border-left:4px solid var(--m-booking)}
section[data-media="web"] .card{border-left:4px solid var(--m-web)}
section[data-media="sns"] .card{border-left:4px solid var(--m-sns)}
@media(max-width:899px){
.shell{display:block}
.side{display:flex;width:auto;position:sticky;top:0;z-index:15;background:var(--bg);overflow-x:auto;padding:8px;gap:4px;border-bottom:1px solid var(--line)}
.side a{white-space:nowrap;min-height:40px;padding:8px 10px}
body.reorder #reorderBar{top:56px}
}
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

const yen = (n: number) => `${n.toLocaleString()}円`;
const pnote = (t: string) => `<span class="p-note">対象: ${t}</span>`;
function yoyLabel(v: number | null): string {
  if (v === null) return '—';
  const d = v - 1;
  return d >= 0 ? `+${Math.round(d * 100)}%` : `-${Math.round(-d * 100)}%`;
}
function kpiCard(label: string, value: string, sub = ''): string {
  return `<div style="flex:1;min-width:130px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px">
<div style="font-size:12px;color:var(--muted)">${esc(label)}</div>
<div style="font-size:20px;font-weight:700;margin-top:4px">${esc(value)}</div>
${sub ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${esc(sub)}</div>` : ''}</div>`;
}

export interface DashboardData {
  period: Period; kpi: Kpi; trend: TrendPoint[]; heatmap: Heatmap;
  courses: string[]; selectedCourse: string; cohorts: CohortRow[];
  courseRows: CourseRow[]; sourceRows: CourseRow[]; insights: string[];
  granularity: 'month' | 'week'; trendPrior: (number | null)[];
  traffic: TrafficData;
  social: SocialData;
  sectionOrder: SectionId[];
  view: ViewId;
}

function periodSelect(period: Period, view: ViewId, selectedCourse: string, granularity: 'month' | 'week'): string {
  const years = [2024, 2023, 2022, 2021, 2020];
  const opt = (v: string, label: string, sel: boolean) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  const cur = period.kind === 'year' ? period.start.slice(0, 4) : period.kind;
  return `<form method="get" style="display:flex;gap:8px;align-items:center">
<input type="hidden" name="view" value="${view}">
${selectedCourse ? `<input type="hidden" name="course" value="${esc(selectedCourse)}">` : ''}
${granularity === 'week' ? '<input type="hidden" name="g" value="week">' : ''}
<label style="margin:0">期間</label>
<select name="period" onchange="this.form.submit()">
${opt('last12', '直近12ヶ月', cur === 'last12')}
${opt('last24', '直近24ヶ月', cur === 'last24')}
${opt('all', '全期間', cur === 'all')}
${years.map(y => opt(String(y), `${y}年`, cur === String(y))).join('')}
</select></form>`;
}

export function renderDashboard(d: DashboardData): string {
  const k = d.kpi;
  const range = `${d.period.start}〜${d.period.end}`;
  const cmp = d.period.kind === 'last24' ? '前24ヶ月比' : '前年比';
  const kpis = [
    kpiCard('予約件数', `${k.bookings}件`, `${cmp} ${yoyLabel(k.yoyBookings)}`),
    kpiCard('売上', yen(k.revenue), `${cmp} ${yoyLabel(k.yoyRevenue)}`),
    kpiCard('客単価', yen(k.avgPerBooking)),
    kpiCard('参加人数', `${k.pax}名`),
    kpiCard('リピート率', `${Math.round(k.repeatRate * 100)}%`, `新規${k.newCount} / リピート${k.repeatCount}`),
  ].join('');

  const courseOpts = ['<option value="">全コース</option>']
    .concat(d.courses.map(c => `<option value="${esc(c)}"${c === d.selectedCourse ? ' selected' : ''}>${esc(c)}</option>`))
    .join('');

  const insightList = d.insights.map(s => `<li style="margin:4px 0">${esc(s)}</li>`).join('');

  const gToggle = (g: 'month' | 'week', label: string) => {
    const params = new URLSearchParams();
    params.set('period', d.period.kind === 'year' ? d.period.start.slice(0, 4) : d.period.kind);
    params.set('view', d.view);
    if (g !== 'month') params.set('g', g);
    if (d.selectedCourse) params.set('course', d.selectedCourse);
    const active = d.granularity === g;
    return `<a href="/?${params.toString()}" style="font-size:12px;padding:2px 8px;border-radius:6px;text-decoration:none;${active ? 'background:var(--accent);color:#fff' : 'color:var(--accent)'}">${esc(label)}</a>`;
  };

  const sections: Record<SectionId, string> = {
    kpi: `<div class="card"><h2>KPI サマリー${pnote(range)}</h2><div style="display:flex;gap:10px;flex-wrap:wrap">${kpis}</div></div>`,
    insights: `<div class="card"><h2>戦略インサイト${pnote(range)}</h2><ul style="margin:0;padding-left:18px;font-size:14px">${insightList}</ul></div>`,
    trend: `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
<h2 style="margin:0">売上・予約トレンド（棒=売上 / 線=件数）${pnote(range)}</h2>
<span>${gToggle('month', '月次')} ${gToggle('week', '週次')}</span></div>
${renderTrendChart(d.trend, d.trendPrior)}</div>`,
    heatmap: `<div class="card"><h2>季節 × 曜日ヒートマップ${pnote(range)}</h2>
<form method="get" style="margin-bottom:8px">
<input type="hidden" name="period" value="${d.period.kind === 'year' ? d.period.start.slice(0, 4) : d.period.kind}">
<input type="hidden" name="view" value="${d.view}">
${d.granularity === 'week' ? '<input type="hidden" name="g" value="week">' : ''}
<select name="course" onchange="this.form.submit()">${courseOpts}</select>
</form>${renderHeatmap(d.heatmap)}</div>`,
    cohort: `<div class="card"><h2>リピーター・コホート再訪率（初回月別・全期間）${pnote('全期間')}</h2>${renderCohortGrid(d.cohorts)}</div>`,
    course: `<div class="card"><h2>コース別内訳${pnote(range)}</h2>${renderCourseBars(d.courseRows)}</div>`,
    source: `<div class="card"><h2>流入経路（お客様の自己申告）${pnote(range)}</h2>
<p style="font-size:12px;color:var(--muted);margin:0 0 8px">予約時アンケート「ご予約の経緯」を分類したもの。sync 更新前の履歴は「不明」と表示されます。</p>
${renderCourseBars(d.sourceRows)}</div>`,
    ga4: renderTrafficSection(d.traffic, range),
    ig: renderSocialSection(d.social, range),
  };
  const secTools = d.view === 'all'
    ? `<div class="sec-tools"><button type="button" class="mv" data-dir="-1">↑ 上へ</button><button type="button" class="mv" data-dir="1">↓ 下へ</button></div>`
    : '';
  const visible = sectionsForView(d.sectionOrder, d.view);
  const orderedSections = visible
    .map(id => `<section class="sec" data-sec="${id}" data-media="${MEDIA_OF[id]}">${secTools}${sections[id]}</section>`)
    .join('\n');

  const viewQuery = (v: ViewId) => {
    const p = new URLSearchParams();
    p.set('view', v);
    p.set('period', d.period.kind === 'year' ? d.period.start.slice(0, 4) : d.period.kind);
    if (d.selectedCourse) p.set('course', d.selectedCourse);
    if (d.granularity !== 'month') p.set('g', d.granularity);
    return `/?${p.toString()}`;
  };
  const navItem = (v: ViewId, label: string, dotColor: string) => {
    const active = d.view === v;
    return `<a href="${viewQuery(v)}" class="${active ? 'active' : ''}"${active ? ' aria-current="page"' : ''}><span class="dot" style="background:${dotColor}"></span>${label}</a>`;
  };
  const sideNav = `<nav class="side">
${navItem('bookings', '予約分析', 'var(--m-booking)')}
${navItem('web', 'Webサイト', 'var(--m-web)')}
${navItem('sns', 'Instagram', 'var(--m-sns)')}
${navItem('all', 'すべて', '#6b7280')}
</nav>`;

  const reorderBtn = d.view === 'all'
    ? `<button type="button" id="reorderBtn" style="background:none;border:1px solid #cbd5e1;color:#cbd5e1;font-size:12px;border-radius:6px;padding:2px 8px;cursor:pointer">並び替え</button>`
    : '';
  const reorderBar = d.view === 'all'
    ? `<div id="reorderBar" class="card" hidden>並び順を編集中：各ブロックの「↑ 上へ」「↓ 下へ」で移動 <button type="button" id="reorderSave">完了</button> <button type="button" id="reorderCancel">キャンセル</button></div>`
    : '';

  const body = `<header>Sup! Sup! マーケ分析ダッシュボード <span style="float:right;display:flex;gap:12px;align-items:center">${reorderBtn}<a href="/logout" style="color:#cbd5e1;font-size:12px">ログアウト</a></span></header>
<div class="shell">
${sideNav}
<main>
<div class="card" style="display:flex;justify-content:space-between;align-items:center">${periodSelect(d.period, d.view, d.selectedCourse, d.granularity)}<span style="font-size:12px;color:var(--muted)">${esc(d.period.label)}</span></div>
${reorderBar}

${orderedSections}
<script>
(function(){
  var btn=document.getElementById('reorderBtn');
  var bar=document.getElementById('reorderBar');
  if(!btn||!bar)return;
  function refresh(){
    var secs=[].slice.call(document.querySelectorAll('section.sec'));
    secs.forEach(function(s,i){
      var up=s.querySelector('[data-dir="-1"]');
      var dn=s.querySelector('[data-dir="1"]');
      if(up)up.disabled=(i===0);
      if(dn)dn.disabled=(i===secs.length-1);
    });
  }
  btn.addEventListener('click',function(){
    document.body.classList.add('reorder');bar.hidden=false;btn.hidden=true;refresh();
    window.scrollTo({top:0});
  });
  document.getElementById('reorderCancel').addEventListener('click',function(){location.reload();});
  document.addEventListener('click',function(e){
    var t=e.target;
    var b=(t&&t.closest)?t.closest('.mv'):null;
    if(!b||b.disabled)return;
    var sec=b.closest('section.sec');
    var dir=Number(b.getAttribute('data-dir'));
    var prev=sec.previousElementSibling,next=sec.nextElementSibling;
    if(dir<0&&prev&&prev.classList.contains('sec'))sec.parentNode.insertBefore(sec,prev);
    if(dir>0&&next&&next.classList.contains('sec'))sec.parentNode.insertBefore(next,sec);
    refresh();
    sec.scrollIntoView({block:'nearest'});
  });
  document.getElementById('reorderSave').addEventListener('click',function(){
    var order=[].slice.call(document.querySelectorAll('section.sec')).map(function(s){return s.getAttribute('data-sec');});
    fetch('/api/section-order',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({order:order})})
      .then(function(r){
        if(!r.ok)throw new Error('save failed');
        document.body.classList.remove('reorder');bar.hidden=true;btn.hidden=false;
        var toast=document.createElement('div');toast.className='toast';toast.textContent='並び順を保存しました';
        document.body.appendChild(toast);setTimeout(function(){toast.remove();},2500);
      })
      .catch(function(){alert('保存できませんでした。画面が古い可能性があります。再読み込みしてからもう一度お試しください');});
  });
})();
</script>
</main>
</div>`;
  return layout('ダッシュボード｜Sup! Sup! マーケ分析', body);
}
