/* 다이소 안전 · 매장 밀착지원 대시보드 (D2.5 · 대시보드시안 D-1~D-3)
 * 데이터: INSP_SUM/{점검ID} = 제출할 때 같이 저장하는 짧은 요약 (점수 · 분야별 건수 · 지적 제목 · 미조치)
 *         → 대시보드는 이것만 읽음 (점검 기록 전체는 무거워서 안 읽음)
 *         예전에 제출한 기록은 마스터가 대시보드 맨 아래 [요약 다시 만들기] 로 채움
 * 조직: 점검 때 적은 값이 아니라 지금 매장 관리 목록(팀 연결표)으로 붙임 · 목록에 없는 매장만 점검 때 값
 * 점검률 분모 = 매장 관리의 영업 중 매장 (폐점 제외) · 폐점 매장의 점검은 대시보드에서 뺌 (v4 와 같음)
 * 미조치 = 그 매장 가장 최근 점검의 openNext (조치확인과 같은 기준 · 기간과 상관없이 지금 상태)
 */
Object.assign(ICON, {
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
  trend: '<path d="M3 7l6 6 4-4 8 8"/><path d="M21 11v6h-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'
});

let DS = null;   // { rows:[요약], loading, err }
const DSC = { division: '', dept: '', period: 'year', store: '', open: new Set(['open']), more: {} };
const DPER = [['month', '이번 달'], ['year', '올해'], ['y1', '최근 1년'], ['all', '전체']];
const DGRP = [['work', '작업점검'], ['ladder', '사다리'], ['common', '공통·시설'], ['fire', '소방'], ['tbm', 'TBM'], ['other', '기타사항']];

/* ---------- 요약 한 줄 만들기 (제출 · 다시 만들기에서 같이 씀) ---------- */
const dLab = (x) => x.group === '작업점검' ? String(x.area || '') + ' · ' + String(x.detail || '').slice(0, 40) : String(x.title || '').slice(0, 60);
const dFresh = (x) => x.group !== '기타사항' || x.detail === '개선과제 후보';
function dashSum(r) {
  const c = r.counts || {};
  const open = Array.isArray(r.openNext) ? r.openNext
    : (r.issues || []).filter(dFresh).map((x) => ({ key: r.id + '|' + x.key, group: x.group, area: x.area, title: x.title, detail: x.detail, date: r.date, inspId: r.id }));
  return JSON.parse(JSON.stringify({
    id: r.id, v: 1, date: r.date, at: r.submittedAt || '',
    storeId: r.storeId || '', storeName: r.storeName, division: r.division || '', dept: r.dept || '', team: r.team || '',
    inspectorEmail: r.inspectorEmail, inspectorName: r.inspectorName || '',
    score: Number(r.score) || 0, grade: r.grade || '', pdfView: r.pdfView || '',
    c: { issues: c.issues || 0, work: c.workRisk || 0, ladder: c.ladder || 0, common: c.common || 0, fire: c.fire || 0, tbm: c.tbm || 0, other: c.others || 0 },
    iss: (r.issues || []).map((x) => ({ g: x.group || '', l: dLab(x) })),
    open: open.map((x) => ({ k: x.key || '', g: x.group || '', l: dLab(x), d: x.date || '', i: x.inspId || '' }))
  }));
}

/* ---------- 불러오기 ---------- */
async function dashLoad() {
  if (DS && DS.loading) return;
  DS = { loading: true };
  try {
    if (!SD) await storesLoad();
    const q = await db.collection('INSP_SUM').get();
    DS = { rows: q.docs.map((d) => d.data()) };
  } catch (e) {
    DS = { err: e.code === 'permission-denied' ? 'Firebase 규칙(INSP_SUM)이 아직 안 올라갔을 수 있어요. 마스터에게 알려 주세요.' : (e.message || e.code || String(e)) };
  }
  render();
}

/* 마스터 · 예전에 제출한 점검 기록으로 요약을 다시 만듦 */
async function dashRebuild() {
  if (!ME.master || (DS && DS.loading)) return;
  DS = { loading: true, msg: '점검 기록 읽는 중' }; render();
  try {
    const q = await db.collection('INSPECTIONS').get();
    const docs = q.docs.map((d) => d.data()).filter((r) => r.status === 'submitted' && r.id);
    for (let i = 0; i < docs.length; i += 400) {
      const b = db.batch();
      docs.slice(i, i + 400).forEach((r) => b.set(db.collection('INSP_SUM').doc(r.id), dashSum(r)));
      await b.commit();
      DS.msg = '요약 저장 중 ' + Math.min(i + 400, docs.length) + ' / ' + docs.length; render();
    }
    DS = null; toast('점검 ' + docs.length + '건의 요약을 다시 만들었어요');
  } catch (e) { DS = null; toast('요약을 만들지 못했습니다: ' + (e.code === 'permission-denied' ? 'Firebase 규칙(INSP_SUM)을 확인해 주세요' : (e.message || e.code))); }
  dashLoad();
}

/* ---------- 계산 ---------- */
const dToday = () => new Date().toLocaleDateString('sv-SE');
const dDays = (d) => { const t = Date.parse(d + 'T00:00:00'); return isNaN(t) ? 0 : Math.max(0, Math.round((Date.parse(dToday() + 'T00:00:00') - t) / 864e5)); };
const dMD = (d) => String(d || '').slice(5).replace('-', '-');
function dFrom(p) {
  const t = dToday();
  if (p === 'month') return t.slice(0, 8) + '01';
  if (p === 'year') return t.slice(0, 4) + '-01-01';
  if (p === 'y1') { const d = new Date(); d.setFullYear(d.getFullYear() - 1); d.setDate(d.getDate() + 1); return d.toLocaleDateString('sv-SE'); }
  return '';
}
/* 매장 · 조직을 붙인 점검 목록 (폐점 매장 뺌) */
function dRows() {
  const byId = new Map(), byKey = new Map();
  SD.stores.forEach((s) => { byId.set(s.id, s); byKey.set(s.key || nk(s.name), s); });
  const out = [];
  (DS.rows || []).forEach((r) => {
    const s = (r.storeId && byId.get(r.storeId)) || byKey.get(nk(r.storeName));
    if (s && s.closed) return;
    const o = s ? orgOf(s) : { division: r.division || '미분류', dept: r.dept || '미분류' };
    out.push(Object.assign({}, r, { sk: s ? s.id : 'n:' + nk(r.storeName), sn: s ? s.name : r.storeName, dv: o.division, dp: o.dept, tm: (s ? s.team : r.team) || '팀 없음', live: !!s }));
  });
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.at).localeCompare(String(a.at)));
}
const dIn = (x) => (!DSC.division || x.dv === DSC.division) && (!DSC.dept || x.dp === DSC.dept);
function dLatest(rows) { const m = new Map(); rows.forEach((r) => { if (!m.has(r.sk)) m.set(r.sk, r); }); return m; }   // rows 는 최신 순

/* ---------- 화면 ---------- */
function dashView() {
  TITLE.store = '대시보드';
  if (!DS || (!DS.rows && !DS.err && !DS.loading)) { dashLoad(); }
  if (!DS || DS.loading || !SD) {
    frame('<div class="ready" style="padding-top:70px"><div class="ring red"><span class="spin"></span></div><h2>' + esc((DS && DS.msg) || '점검 현황 불러오는 중') + '</h2></div>'); return;
  }
  if (DS.err) {
    frame('<button class="back" type="button" id="dzBack">' + ic('left', 16) + '밀착지원 처음</button><div class="note warn">' + esc(DS.err) + '</div><button class="btn wide" type="button" id="dzRe">' + ic('refresh', 16) + '다시 불러오기</button>');
    $('dzBack').onclick = dzHome; $('dzRe').onclick = () => { DS = null; render(); }; return;
  }
  if (DSC.store) return dashStore();
  const all = dRows(), scope = all.filter(dIn), from = dFrom(DSC.period);
  const per = scope.filter((r) => !from || r.date >= from);
  const live = SD.stores.filter((s) => !s.closed).filter((s) => { const o = orgOf(s); return (!DSC.division || o.division === DSC.division) && (!DSC.dept || o.dept === DSC.dept); });
  const latestAll = dLatest(scope), latestPer = dLatest(per);
  const doneLive = [...latestPer.values()].filter((r) => r.live).length;
  const avg = per.length ? Math.round(per.reduce((a, r) => a + (Number(r.score) || 0), 0) / per.length) : 0;
  const issues = per.reduce((a, r) => a + ((r.c && r.c.issues) || 0), 0);
  const openRows = [...latestAll.values()].filter((r) => (r.open || []).length);
  const openN = openRows.reduce((a, r) => a + r.open.length, 0);
  const rate = live.length ? Math.round(doneLive / live.length * 100) : 0;

  /* 범위 · 기간 */
  const L = SD.stores.filter((s) => !s.closed).map(orgOf);
  const divs = [...new Set(L.map((o) => o.division))].sort(sortKo);
  const depts = DSC.division ? [...new Set(L.filter((o) => o.division === DSC.division).map((o) => o.dept))].sort(sortKo) : [];
  const sel = (id, ph, list, v) => '<select id="' + id + '" class="dzsel' + (v ? ' on' : '') + '"><option value="">' + esc(ph) + '</option>' + list.map((x) => '<option' + (x === v ? ' selected' : '') + '>' + esc(x) + '</option>').join('') + '</select>';
  let h = '<button class="back" type="button" id="dzBack">' + ic('left', 16) + '밀착지원 처음</button>'
    + '<div class="dzcrumb"><button type="button" id="dzAll" class="' + (!DSC.division ? 'on' : '') + '">전사</button><i>›</i>' + sel('dzDiv', '영업부문 ▾', divs, DSC.division)
    + (DSC.division ? '<i>›</i>' + sel('dzDept', '부서 ▾', depts, DSC.dept) : '') + '</div>'
    + '<div class="dzper">' + DPER.map(([k, t]) => '<button type="button" data-per="' + k + '" class="' + (DSC.period === k ? 'on' : '') + '">' + t + '</button>').join('') + '</div>'
    + '<div class="dzsum">'
    + '<div><small>점검한 매장</small><b>' + doneLive.toLocaleString() + '<span> / ' + live.length.toLocaleString() + '곳</span></b><div class="dzrate"><i style="width:' + rate + '%"></i></div></div>'
    + '<div><small>평균 점수</small><b>' + (per.length ? avg : '-') + '<span>' + (per.length ? '점 · ' + per.length + '건' : '') + '</span></b></div>'
    + '<div><small>지적사항</small><b>' + issues.toLocaleString() + '<span>건</span></b></div>'
    + '<div class="hl"><small>미조치 지적 (지금)</small><b>' + openN.toLocaleString() + '<span>건</span></b></div></div>';

  if (!all.length) h += '<div class="note warn">아직 대시보드에 올라온 점검이 없어요.' + (ME.master ? ' 예전에 제출한 점검이 있으면 맨 아래 [요약 다시 만들기]를 눌러 주세요.' : '') + '</div>';

  /* 월별 (최근 12개월 · 기간과 상관없이) */
  const months = []; { const d = new Date(); d.setDate(1); for (let i = 11; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth() - i, 1); months.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')); } }
  const mc = months.map((m) => scope.filter((r) => String(r.date).slice(0, 7) === m).length), mmax = Math.max(1, ...mc), mpk = mc.indexOf(Math.max(...mc));
  h += dAcc('month', 'chart', '', '월별 점검', mc.some(Boolean) ? months[mpk].slice(5).replace(/^0/, '') + '월이 ' + mc[mpk] + '건으로 가장 많아요 · 최근 12개월' : '최근 12개월 점검 없음',
    '<div class="dzbars">' + mc.map((n, i) => '<div><b>' + (n || '') + '</b><em class="' + (i === mpk && n ? 'pk' : '') + '" style="height:' + Math.round(n / mmax * 64) + 'px"></em>' + Number(months[i].slice(5)) + '</div>').join('') + '</div>');

  /* 등급 (기간 안 매장별 최근 점검) */
  const gc = { A: 0, B: 0, C: 0, D: 0 }; latestPer.forEach((r) => { if (gc[r.grade] != null) gc[r.grade]++; });
  h += dAcc('grade', 'award', '', '등급 분포', 'D ' + gc.D + '곳 · C ' + gc.C + '곳',
    '<div class="dzgr"><div class="gA"><b>' + gc.A + '</b>A · 90↑</div><div class="gB"><b>' + gc.B + '</b>B · 70↑</div><div class="gC"><b>' + gc.C + '</b>C · 50↑</div><div class="gD"><b>' + gc.D + '</b>D · 50↓</div></div>'
    + '<div class="dztip">같은 매장을 여러 번 점검했으면 기간 안 가장 최근 점검 등급으로 세요.</div>');

  /* 미조치 많은 매장 */
  const os = openRows.map((r) => ({ r, n: r.open.length, old: Math.max(...r.open.map((x) => dDays(x.d))) })).sort((a, b) => b.n - a.n || b.old - a.old);
  h += dAcc('open', 'alert', 'red', '미조치 지적 많은 매장', os.length ? openN + '건 · ' + os[0].r.sn + ' ' + os[0].n + '건' : '미조치 지적 없음',
    dMore('open', os, (x, i) => dLine(i, x.r.sk, x.r.sn, x.r.dp + ' · ' + x.r.tm + ' · 마지막 점검 ' + dMD(x.r.date), '<em class="bad">' + x.n + '건<small>최장 ' + x.old + '일째</small></em>'))
    + '<div class="dztip">미조치 = 그 매장 가장 최근 점검에서 다음 점검으로 넘어간 지적이에요 (조치확인과 같은 기준 · 기간과 상관없이 지금 상태). 「최장 ○일째」는 처음 지적한 날부터 센 날짜예요.</div>');

  /* 분야별 · TOP 5 */
  const gs = DGRP.map(([k, t]) => [t, per.reduce((a, r) => a + ((r.c && r.c[k]) || 0), 0)]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]);
  const gmax = Math.max(1, ...gs.map((x) => x[1]));
  const tc = new Map(); per.forEach((r) => (r.iss || []).forEach((x) => { if (x.g === '기타사항') return; const k = x.g + '\u0001' + x.l; tc.set(k, (tc.get(k) || 0) + 1); }));
  const top = [...tc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  h += dAcc('group', 'list', '', '분야별 · 자주 나온 지적', gs.length ? gs[0][0] + ' ' + gs[0][1] + '건이 가장 많아요' : '지적 없음',
    gs.map(([t, n]) => '<div class="dzrk"><div class="l"><span>' + esc(t) + '</span><span>' + n + '건</span></div><div class="t"><em style="width:' + Math.round(n / gmax * 100) + '%"></em></div></div>').join('')
    + (top.length ? '<div class="lb">자주 나온 지적 TOP 5</div>' + top.map(([k, n], i) => { const [g, l] = k.split('\u0001'); return '<div class="dzli"><span class="n' + (i ? '' : ' r') + '">' + (i + 1) + '</span><span><b>' + esc(l) + '</b><small>' + esc(g) + '</small></span><em>' + n + '건</em></div>'; }).join('') : ''));

  /* 점수 낮은 매장 */
  const low = [...latestPer.values()].sort((a, b) => (a.score - b.score) || String(b.date).localeCompare(String(a.date)));
  h += dAcc('low', 'trend', '', '점수 낮은 매장', low.length ? low[0].sn + ' ' + low[0].score + '점 (' + low[0].grade + ')' : '이 기간 점검 없음',
    dMore('low', low, (r, i) => dLine(i, r.sk, r.sn, r.dp + ' · ' + r.tm + ' · ' + dMD(r.date), '<em>' + r.score + '점' + dG(r.grade) + '</em>')));

  /* 아직 점검 안 한 매장 (오래된 순 · 한 번도 안 한 곳이 위) */
  const done = new Set([...latestPer.keys()]);
  const yet = live.filter((s) => !done.has(s.id)).map((s) => ({ s, o: orgOf(s), last: latestAll.get(s.id) })).sort((a, b) => (a.last ? 1 : 0) - (b.last ? 1 : 0) || String(a.last ? a.last.date : '').localeCompare(String(b.last ? b.last.date : '')) || sortKo(a.s.name, b.s.name));
  h += dAcc('yet', 'store', '', '아직 점검 안 한 매장', yet.length.toLocaleString() + '곳 · 이 기간에 점검 기록 없음',
    dMore('yet', yet, (x) => dLine(-1, x.s.id, x.s.name, x.o.dept + ' · ' + (x.s.team || '팀 없음'), '<em><small>마지막 점검</small>' + (x.last ? esc(x.last.date) : '없음') + '</em>'))
    + '<div class="dztip">마지막 점검이 오래된 매장부터 보여요 (한 번도 안 한 곳이 맨 위).</div>');

  /* 최근 점검 */
  h += dAcc('recent', 'clock', '', '최근 점검', per.length ? dMD(per[0].date) + ' ' + per[0].sn + ' · ' + per[0].inspectorName : '이 기간 점검 없음',
    dMore('recent', per, (r) => dLine(-1, r.sk, r.sn, dMD(r.date) + ' · ' + r.inspectorName + ' · 지적 ' + ((r.c && r.c.issues) || 0), '<em>' + r.score + '점' + dG(r.grade) + '</em>')));

  if (ME.master) h += '<div class="dzmaster"><b>마스터</b> · 예전에 제출한 점검이 대시보드에 안 보이면 눌러 주세요 (점검 기록으로 요약을 다시 만들어요).<button class="btn ghost wide" type="button" id="dzRebuild">' + ic('refresh', 16) + '요약 다시 만들기</button></div>';
  frame(h);
  $('dzBack').onclick = dzHome;
  $('dzAll').onclick = () => { DSC.division = ''; DSC.dept = ''; DSC.more = {}; render(); };
  $('dzDiv').onchange = (e) => { DSC.division = e.target.value; DSC.dept = ''; DSC.more = {}; render(); };
  if ($('dzDept')) $('dzDept').onchange = (e) => { DSC.dept = e.target.value; DSC.more = {}; render(); };
  document.querySelectorAll('[data-per]').forEach((b) => b.onclick = () => { DSC.period = b.dataset.per; DSC.more = {}; render(); });
  dBind();
  if ($('dzRebuild')) $('dzRebuild').onclick = dashRebuild;
}
function dzHome() { MV = 'home'; DSC.store = ''; render(); window.scrollTo(0, 0); }
const dG = (g) => g ? '<span class="dzg g' + esc(g) + '">' + esc(g) + '</span>' : '';
function dAcc(k, icon, cls, title, line, body) {
  const op = DSC.open.has(k);
  return '<div class="dzacc' + (op ? ' open' : '') + '"><button type="button" class="h" data-acc="' + k + '"><span class="ic ' + cls + '">' + ic(icon, 17) + '</span><span class="tx"><b>' + esc(title) + '</b><small>' + esc(line) + '</small></span>' + ic('down', 16) + '</button>'
    + (op ? '<div class="bd">' + body + '</div>' : '') + '</div>';
}
function dLine(i, sk, name, sub, right) {
  return '<button type="button" class="dzli" data-st="' + esc(sk) + '">' + (i >= 0 ? '<span class="n' + (i ? '' : ' r') + '">' + (i + 1) + '</span>' : '') + '<span><b>' + esc(name) + '</b><small>' + esc(sub) + '</small></span>' + right + '</button>';
}
function dMore(k, list, fn) {
  if (!list.length) return '<p class="muted" style="margin:4px 0 0">없어요</p>';
  const n = DSC.more[k] || (k === 'yet' || k === 'recent' ? 10 : 5);
  return list.slice(0, n).map(fn).join('') + (list.length > n ? '<button type="button" class="dzmore" data-more="' + k + '">더 보기 (' + (list.length - n).toLocaleString() + '곳 더)</button>' : '');
}
function dBind() {
  document.querySelectorAll('[data-acc]').forEach((b) => b.onclick = () => { const k = b.dataset.acc; if (DSC.open.has(k)) DSC.open.delete(k); else DSC.open.add(k); render(); });
  document.querySelectorAll('[data-more]').forEach((b) => b.onclick = () => { const k = b.dataset.more; DSC.more[k] = (DSC.more[k] || (k === 'yet' || k === 'recent' ? 10 : 5)) + 20; render(); });
  document.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { DSC.store = b.dataset.st; render(); window.scrollTo(0, 0); });
}

/* ---------- 매장 상세 (D-3) ---------- */
function dashStore() {
  const rows = dRows().filter((r) => r.sk === DSC.store);
  const s = SD.stores.find((x) => x.id === DSC.store);
  const name = s ? s.name : (rows[0] ? rows[0].sn : '매장');
  const o = s ? orgOf(s) : (rows[0] ? { division: rows[0].dv, dept: rows[0].dp } : { division: '', dept: '' });
  const last = rows[0], first = rows[rows.length - 1];
  let h = '<button class="back" type="button" id="dzBack2">' + ic('left', 16) + '대시보드</button>'
    + '<h2 class="dzname">' + esc(name) + '</h2><p class="dzorg">' + esc([o.division, o.dept, s ? (s.team || '팀 없음') : (rows[0] ? rows[0].tm : '')].filter(Boolean).join(' · ')) + '</p>';
  if (!rows.length) h += '<div class="note warn">이 매장은 아직 점검 기록이 없어요.</div>';
  else {
    const diff = rows.length > 1 ? last.score - first.score : null;
    h += '<div class="dzsum">'
      + '<div><small>점검 횟수</small><b>' + rows.length + '<span>회</span></b></div>'
      + '<div><small>최근 점수</small><b>' + last.score + '<span>점 · ' + esc(last.grade) + '</span></b></div>'
      + '<div><small>첫 점검보다</small><b class="' + (diff > 0 ? 'up' : diff < 0 ? 'dn' : '') + '">' + (diff == null ? '-' : (diff > 0 ? '+' : '') + diff) + '<span>' + (diff == null ? '' : '점') + '</span></b></div>'
      + '<div class="hl"><small>미조치 지적</small><b>' + (last.open || []).length + '<span>건</span></b></div></div>';
    const tr = rows.slice(0, 6).reverse(), tmax = Math.max(1, ...tr.map((r) => r.score));
    if (tr.length > 1) h += '<div class="lb">점수 추이</div><div class="dztrend">' + tr.map((r, i) => '<div><em class="' + (i === tr.length - 1 ? 'pk' : '') + '" style="height:' + Math.max(4, Math.round(r.score / tmax * 50)) + 'px"></em>' + r.score + '점<br>' + esc(dMD(r.date)) + '</div>').join('') + '</div>';
    h += '<div class="lb">점검 기록</div>';
    rows.forEach((r, i) => {
      const iss = (r.c && r.c.issues) || 0;
      let sub = esc(r.inspectorName) + (i === 0 ? ' · 가장 최근' : '') + ' · 지적 ' + iss, body = '';
      if (i === 0) {
        if ((r.open || []).length) body = '<div class="dziss">' + r.open.map((x) => '<div><span>' + esc(x.l) + '<small>' + esc(x.g) + (x.d && x.d !== r.date ? ' · ' + esc(x.d) + '부터' : '') + '</small></span><em>미조치</em></div>').join('') + '</div><p class="dztip" style="margin-top:6px">다음 점검의 조치확인에서 확인해요.</p>';
      } else {
        const nx = rows[i - 1], fresh = (r.open || []).filter((x) => x.i === r.id), still = new Set((nx.open || []).map((x) => x.k));
        if (fresh.length) sub += ' · 다음 점검에서 ' + fresh.filter((x) => !still.has(x.k)).length + ' / ' + fresh.length + '건 조치완료';
      }
      h += '<div class="dztl' + (i === 0 ? ' last' : '') + '"><div class="t1"><b>' + esc(r.date) + '</b><span><span class="sc">' + r.score + '</span>점' + dG(r.grade) + '</span></div><small>' + sub + '</small>' + body
        + (r.pdfView ? '<button type="button" class="dzrb" data-pdf="' + esc(r.pdfView) + '">' + ic('file', 15) + '결과보고서 보기</button>' : '') + '</div>';
    });
  }
  if (s && !s.closed) h += '<button class="btn red wide" type="button" id="dzGo">' + ic('plus', 16) + '이 매장 점검 시작</button>';
  frame(h);
  $('dzBack2').onclick = () => { DSC.store = ''; render(); window.scrollTo(0, 0); };
  document.querySelectorAll('[data-pdf]').forEach((b) => b.onclick = () => window.open(b.dataset.pdf, '_blank', 'noopener'));
  if ($('dzGo')) $('dzGo').onclick = () => { MV = 'start'; MSEL = s.id; MQ = ''; MASK = ''; MDATE = todayStr(); DSC.store = ''; render(); window.scrollTo(0, 0); };
}

/* 밀착지원 첫 화면 카드의 한 줄 (불러온 적 있을 때만) */
function dashBrief() {
  if (!DS || !DS.rows || !SD) return '';
  const all = dRows(), y = dToday().slice(0, 4) + '-01-01';
  const n = new Set(all.filter((r) => r.date >= y && r.live).map((r) => r.sk)).size;
  const open = [...dLatest(all).values()].reduce((a, r) => a + (r.open || []).length, 0);
  return '올해 ' + n.toLocaleString() + '곳 점검 · 미조치 ' + open.toLocaleString() + '건';
}
