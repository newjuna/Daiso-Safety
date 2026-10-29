/* 다이소 안전 · 매장 관리 (마스터)
 * STORES/{id}   = { id, name, key(공백 뺀 이름), team, type, closed, updatedBy, updatedAt }
 * TEAMMAP/{팀}  = { team, dept, division }  ← 팀 → 부서 → 영업부문 (조직_표준화표 대신)
 * SETTINGS/stores = { at, by, count }       ← 마지막으로 올린 날
 * 부서 · 영업부문은 매장에 저장하지 않고, 볼 때 팀 연결표에서 찾음 (조직 개편 때 연결표만 고치면 됨)
 */
Object.assign(ICON, {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'
});

/* 지금 밀착 앱과 같은 빼는 기준 */
const EXCLUDE_TEAMS = ['가맹동부팀', '가맹서부팀', '경남가맹팀', '경북가맹팀', '충청가맹팀', '호남가맹팀'];
const INCLUDE_TYPES = ['유통점', '유통행사', '직영점'];
const EXCLUDE_NAME_WORDS = ['폐점'];
const nk = (s) => String(s || '').replace(/\s+/g, '');
const teamId = (t) => nk(t).replace(/\//g, '_');

let SD = null;            // { stores:[], teams:{id:{team,dept,division}}, meta }
let SM = 'list';          // list | upload | teams
let SQ = '';              // 매장 검색어
const SOPEN = new Set();  // 펼친 줄
let SEDIT = '';           // 고치는 매장 id
let PV = null;            // 매장 올리기 확인 결과
let TQ = '', TEDIT = '', TPV = null; // 팀 연결표: 검색 · 고치는 팀 · 붙여넣기 확인

async function storesLoad() {
  try {
    const [s, t, m] = await Promise.all([db.collection('STORES').get(), db.collection('TEAMMAP').get(), db.collection('SETTINGS').doc('stores').get()]);
    const teams = {}; t.docs.forEach((d) => { teams[d.id] = d.data(); });
    SD = { stores: s.docs.map((d) => d.data()), teams, meta: m.exists ? m.data() : null };
  } catch (e) { SD = { stores: [], teams: {}, meta: null }; toast('매장 목록을 불러오지 못했습니다: ' + (e.message || e.code)); }
  render();
}
const teamOf = (t) => (t ? SD.teams[teamId(t)] : null);
const orgOf = (s) => { const t = teamOf(s.team); return { division: t ? t.division : '미분류', dept: t ? t.dept : '미분류' }; };
const sortKo = (a, b) => String(a).localeCompare(String(b), 'ko');

/* ---------- 엑셀에서 복사한 글(탭으로 나뉨) 읽기 · 칸 안 줄바꿈(따옴표) 처리 ---------- */
/* D1.3 엑셀 복사(탭) · CSV(쉼표) · 세미콜론 모두 읽음 · 첫 줄을 보고 구분 글자를 고름 */
function delimOf(t) {
  const first = (t.split(/\r?\n/).find((l) => l.trim()) || '');
  const n = (ch) => first.split(ch).length - 1;
  const c = [['\t', n('\t')], [',', n(',')], [';', n(';')]].sort((a, b) => b[1] - a[1]);
  return c[0][1] > 0 ? c[0][0] : '\t';
}
function parseTSV(t) {
  t = String(t || '').replace(/^\uFEFF/, '').replace(/[\u200B\uFEFF]/g, '');
  const D = delimOf(t), rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell.trim() === '') { q = true; cell = ''; }
    else if (c === D) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
/* 머리글 줄(앞 5줄 안)에서 필요한 열 위치 찾기 · 열 순서 상관없음 */
function findCols(rows, want) {
  for (let r = 0; r < Math.min(rows.length, 5); r++) {
    const h = rows[r].map(nk), idx = {}; let ok = true;
    for (const k of Object.keys(want)) { const i = h.findIndex((x) => want[k].includes(x)); if (i < 0) { ok = false; break; } idx[k] = i; }
    if (ok) return { row: r, idx };
  }
  return null;
}
const cellOf = (r, i) => String(r[i] == null ? '' : r[i]).trim();

/* ---------- 매장 올리기: 확인 (아직 저장 안 함) ---------- */
function storePreview(text) {
  const rows = parseTSV(text), f = findCols(rows, { name: ['매장명'], team: ['지역', '팀명', '팀'], type: ['형태', '매장형태'] });
  if (!f) return { err: '머리글에서 「매장명 · 지역 · 형태」를 찾지 못했습니다. 1행 머리글까지 같이 복사해 주세요.' };
  const seen = new Set(), keep = [], ex = { name: 0, team: 0, type: 0, dup: 0 };
  const xt = EXCLUDE_TEAMS.map(nk), it = INCLUDE_TYPES.map(nk);
  /* D1.4 병합된 칸: 엑셀에서 복사하면 병합된 칸은 첫 줄에만 값이 있고 나머지는 빈칸
     → 지역(팀) · 형태가 비어 있으면 바로 위 줄의 값을 이어서 씀 (빼는 매장 줄도 위 값으로 셈) */
  let upTeam = '', upType = '', filled = 0;
  rows.slice(f.row + 1).forEach((r) => {
    const name = cellOf(r, f.idx.name); let team = cellOf(r, f.idx.team), type = cellOf(r, f.idx.type);
    if (!team && upTeam) { team = upTeam; filled++; } if (!type && upType) type = upType;
    if (team) upTeam = team; if (type) upType = type;
    if (!name) return;
    if (EXCLUDE_NAME_WORDS.some((w) => nk(name).includes(w))) { ex.name++; return; }
    if (xt.includes(nk(team))) { ex.team++; return; }
    if (!it.includes(nk(type))) { ex.type++; return; }
    const key = nk(name); if (seen.has(key)) { ex.dup++; return; }
    seen.add(key); keep.push({ name, team, type, key });
  });
  const unknown = {}; keep.forEach((s) => { if (s.team && !teamOf(s.team)) unknown[s.team] = (unknown[s.team] || 0) + 1; });
  const noTeam = keep.filter((s) => !s.team).length;
  const cur = new Map(SD.stores.map((s) => [s.key, s])), add = [], chg = [];
  keep.forEach((s) => { const o = cur.get(s.key); if (!o) add.push(s); else if (o.team !== s.team || o.type !== s.type || o.closed || o.name !== s.name) chg.push({ ...o, name: s.name, team: s.team, type: s.type, closed: false }); });
  const gone = SD.stores.filter((s) => !s.closed && !seen.has(s.key));
  return { lines: rows.length - f.row - 1, keep, ex, unknown, noTeam, filled, add, chg, gone, same: keep.length - add.length - chg.length, pick: {} };
}
/* 연결표에 있는 부서 목록 (모르는 팀을 정할 때 고르는 칸) */
function deptChoices() {
  const m = new Map(); Object.values(SD.teams).forEach((t) => { if (t.dept) m.set(t.dept + '|' + (t.division || ''), [t.dept, t.division || '']); });
  return [...m.values()].sort((a, b) => sortKo(a[1] + a[0], b[1] + b[0]));
}

/* ---------- 여러 건 저장 (Firestore는 한 번에 500건까지 → 400건씩 나눠서) ---------- */
async function commitOps(ops, label) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = db.batch();
    ops.slice(i, i + 400).forEach(([kind, ref, data]) => { if (kind === 'del') b.delete(ref); else if (kind === 'upd') b.update(ref, data); else b.set(ref, data); });
    await b.commit();
    if (label) { const el = $('busyTxt'); if (el) el.textContent = label + ' ' + Math.min(i + 400, ops.length) + ' / ' + ops.length; }
  }
}
async function storeApply() {
  const by = ME.email, at = now(), ops = [];
  Object.entries(PV.pick).forEach(([t, v]) => { if (!v) return; const [dept, division] = v.split('|'); ops.push(['set', db.collection('TEAMMAP').doc(teamId(t)), { team: t, dept, division, updatedBy: by, updatedAt: at }]); });
  PV.add.forEach((s) => { const id = newId('S'); ops.push(['set', db.collection('STORES').doc(id), { id, name: s.name, key: s.key, team: s.team, type: s.type, closed: false, updatedBy: by, updatedAt: at }]); });
  PV.chg.forEach((s) => ops.push(['set', db.collection('STORES').doc(s.id), { id: s.id, name: s.name, key: nk(s.name), team: s.team, type: s.type, closed: false, updatedBy: by, updatedAt: at }]));
  PV.gone.forEach((s) => ops.push(['upd', db.collection('STORES').doc(s.id), { closed: true, updatedBy: by, updatedAt: at }]));
  ops.push(['set', db.collection('SETTINGS').doc('stores'), { at, by, count: PV.keep.length }]);
  BUSY = true; render();
  try { await commitOps(ops, '저장 중'); BUSY = false; PV = null; SM = 'list'; toast('매장 목록을 저장했습니다'); await storesLoad(); }
  catch (e) { BUSY = false; render(); toast('저장하지 못했습니다: ' + (e.message || e.code) + ' · 다시 [가져오기]를 누르면 이어서 맞춥니다'); }
}

/* ---------- 화면 ---------- */
function storesView() {
  if (!ME.master) { go('home'); return; }
  if (!SD) { frame('<p class="muted">매장 목록 불러오는 중…</p>'); storesLoad(); return; }
  if (SM === 'upload') return uploadView();
  if (SM === 'teams') return teamsView();
  const live = SD.stores.filter((s) => !s.closed), closed = SD.stores.length - live.length;
  const depts = new Set(live.map((s) => orgOf(s).dept)), teams = new Set(live.map((s) => s.team));
  let html = '<button class="back" type="button" data-s="home">' + ic('left', 16) + '이전으로</button>';
  if (!SD.stores.length) {
    html += '<div class="ready" style="padding:30px 10px 10px"><div class="ring red">' + ic('store', 28) + '</div><h2>아직 매장이 없습니다</h2><p class="muted">회사 시스템에서 받은 매장 엑셀을 통째로 복사해서 한 번에 가져오세요.<br>' + (Object.keys(SD.teams).length ? '' : '먼저 <b>팀 연결표</b>를 만들면 부서 · 영업부문이 자동으로 들어갑니다.') + '</p></div>'
      + '<button class="btn red wide" type="button" data-s="upload">' + ic('upload', 18) + '매장 올리기</button>'
      + '<button class="btn ghost wide" type="button" data-s="teams" style="margin-top:8px">' + ic('link', 18) + '팀 연결표 (' + Object.keys(SD.teams).length + '팀)</button>';
    frame(html); bindStores(); return;
  }
  html += '<div class="search"><span>' + ic('search', 17) + '</span><input id="f_sq" type="search" placeholder="매장명 검색 (공백 무시)" value="' + esc(SQ) + '" autocomplete="off"></div>'
    + '<div class="stat"><div>매장<b>' + live.length.toLocaleString() + '</b></div><div>부서<b>' + depts.size + '</b></div><div>팀<b>' + teams.size + '</b></div></div>'
    + '<div class="row2"><button class="btn red" type="button" data-s="upload">' + ic('upload', 17) + '매장 올리기</button><button class="btn ghost" type="button" data-s="teams">' + ic('link', 17) + '팀 연결표</button></div>'
    + (SD.meta ? '<p class="muted" style="margin:8px 2px 0;font-size:12px">마지막으로 올린 날 ' + esc(String(SD.meta.at).slice(0, 10)) + ' · ' + esc(String(SD.meta.by).split('@')[0]) + (closed ? ' · 폐점 ' + closed + '개' : '') + '</p>' : '')
    + '<div id="sList">' + storeList() + '</div>';
  frame(html); bindStores();
  const q = $('f_sq'); if (q) q.oninput = () => { SQ = q.value; $('sList').innerHTML = storeList(); bindList(); };
}
function storeList() {
  const q = nk(SQ);
  if (q) {
    const hit = SD.stores.filter((s) => s.key.includes(q)).sort((a, b) => sortKo(a.name, b.name)).slice(0, 60);
    return '<div class="tr">' + (hit.length ? hit.map(storeRow).join('') : '<div class="muted" style="padding:12px">찾는 매장이 없습니다</div>') + '</div>';
  }
  const tree = {};
  SD.stores.filter((s) => !s.closed).forEach((s) => { const o = orgOf(s); ((tree[o.division] = tree[o.division] || {})[o.dept] = tree[o.division][o.dept] || {}); (tree[o.division][o.dept][s.team || '(팀 없음)'] = tree[o.division][o.dept][s.team || '(팀 없음)'] || []).push(s); });
  const cnt = (o) => Array.isArray(o) ? o.length : Object.values(o).reduce((a, x) => a + cnt(x), 0);
  const line = (k, depth, label, n) => '<button type="button" class="tl" data-open="' + esc(k) + '" style="padding-left:' + (10 + depth * 16) + 'px">' + ic(SOPEN.has(k) ? 'down' : 'right', 15) + ic('folder', 16) + '<span>' + esc(label) + '</span><span class="n">' + n + '</span></button>';
  let h = '';
  Object.keys(tree).sort(sortKo).forEach((dv) => {
    const kd = 'd:' + dv; h += line(kd, 0, dv, cnt(tree[dv]));
    if (!SOPEN.has(kd)) return;
    Object.keys(tree[dv]).sort(sortKo).forEach((dp) => {
      const kp = kd + '|' + dp; h += line(kp, 1, dp, cnt(tree[dv][dp]));
      if (!SOPEN.has(kp)) return;
      Object.keys(tree[dv][dp]).sort(sortKo).forEach((tm) => {
        const kt = kp + '|' + tm, L = tree[dv][dp][tm]; h += line(kt, 2, tm, L.length);
        if (SOPEN.has(kt)) h += L.sort((a, b) => sortKo(a.name, b.name)).map(storeRow).join('');
      });
    });
  });
  const cl = SD.stores.filter((s) => s.closed);
  if (cl.length) { h += line('closed', 0, '폐점 · 목록에서 빠진 매장', cl.length); if (SOPEN.has('closed')) h += cl.sort((a, b) => sortKo(a.name, b.name)).map(storeRow).join(''); }
  return '<div class="tr">' + h + '</div>';
}
function storeRow(s) {
  if (SEDIT === s.id) return storeForm(s);
  const o = orgOf(s);
  return '<button type="button" class="st" data-edit="' + esc(s.id) + '">' + ic('store', 16) + '<span class="sn">' + esc(s.name) + (SQ ? '<small>' + esc(o.dept + ' · ' + (s.team || '팀 없음')) + '</small>' : '') + '</span><span class="n">' + (s.closed ? '<span class="pill">폐점</span>' : esc(s.type)) + '</span></button>';
}
function storeForm(s) {
  const teams = Object.values(SD.teams).map((t) => t.team).sort(sortKo); if (s.team && !teams.includes(s.team)) teams.unshift(s.team);
  return '<div class="form" style="margin:6px 8px"><b>' + esc(s.name) + '</b><div class="grid">'
    + fld('sName', '매장명 *', s.name, 'text', '', ' full')
    + '<div class="fd"><label for="f_sTeam">팀</label><select id="f_sTeam">' + teams.map((t) => '<option' + (t === s.team ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></div>'
    + '<div class="fd"><label for="f_sType">형태</label><select id="f_sType">' + INCLUDE_TYPES.map((t) => '<option' + (t === s.type ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div></div>'
    + '<label class="chk"><input type="checkbox" id="f_sClosed"' + (s.closed ? ' checked' : '') + '><span class="box">' + ic('check', 12) + '</span>폐점 (목록에서 빼기 · 지난 기록은 남음)</label>'
    + '<div class="fbtn"><button class="b red grow" type="button" data-ssave="' + esc(s.id) + '"' + (BUSY ? ' disabled' : '') + '>' + (BUSY ? '저장 중…' : '저장') + '</button><button class="b" type="button" data-scancel="1">취소</button></div></div>';
}
function bindStores() {
  document.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { const v = b.dataset.s; if (v === 'home') go('home'); else { SM = v; PV = null; TPV = null; TEDIT = ''; render(); window.scrollTo(0, 0); } });
  bindList();
}
function bindList() {
  document.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { const k = b.dataset.open; SOPEN.has(k) ? SOPEN.delete(k) : SOPEN.add(k); $('sList').innerHTML = storeList(); bindList(); });
  document.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => { SEDIT = b.dataset.edit; $('sList').innerHTML = storeList(); bindList(); });
  document.querySelectorAll('[data-scancel]').forEach((b) => b.onclick = () => { SEDIT = ''; $('sList').innerHTML = storeList(); bindList(); });
  document.querySelectorAll('[data-ssave]').forEach((b) => b.onclick = () => storeSave(b.dataset.ssave));
}
async function storeSave(id) {
  const s = SD.stores.find((x) => x.id === id), name = val('sName');
  if (!name) return shake(['f_sName'], '매장명을 적어 주세요');
  if (SD.stores.some((x) => x.id !== id && x.key === nk(name))) return shake(['f_sName'], '같은 이름의 매장이 이미 있습니다');
  const d = { id, name, key: nk(name), team: $('f_sTeam').value, type: $('f_sType').value, closed: $('f_sClosed').checked, updatedBy: ME.email, updatedAt: now() };
  try { await db.collection('STORES').doc(id).set(d); Object.assign(s, d); SEDIT = ''; toast('저장했습니다'); render(); }
  catch (e) { toast('저장하지 못했습니다: ' + (e.message || e.code)); }
}

/* ---------- 매장 올리기 화면 ---------- */
function uploadView() {
  let h = '<button class="back" type="button" data-s="list">' + ic('left', 16) + '매장 관리</button>';
  if (!PV || PV.err) {
    h += '<div class="steps"><div><i>1</i>회사 시스템에서 받은 매장 엑셀을 열고 <b>전체 선택</b> (<span class="kbd">Ctrl</span>+<span class="kbd">A</span>) → <b>복사</b> (<span class="kbd">Ctrl</span>+<span class="kbd">C</span>)</div>'
      + '<div><i>2</i>아래 칸을 누르고 <b>붙여넣기</b> (<span class="kbd">Ctrl</span>+<span class="kbd">V</span>)</div>'
      + '<div><i>3</i>[확인하기] · 아직 저장되지 않아요</div></div>'
      + '<p class="muted" style="font-size:12px;margin:6px 2px 0">머리글 <b>매장명 · 지역(팀) · 형태</b> 세 열만 씁니다. 다른 열은 읽지도 저장하지도 않아요. PC에서 하는 게 편해요.</p>'
      + '<textarea id="f_paste" class="ta" placeholder="여기에 붙여넣기 (Ctrl+V)"></textarea>'
      + (PV && PV.err ? '<div class="note warn">' + esc(PV.err) + '</div>' : '')
      + '<button class="btn red wide" type="button" id="pvGo">' + ic('check', 18) + '확인하기</button>';
    frame(h); bindStores();
    $('pvGo').onclick = () => { const t = $('f_paste').value; if (!t.trim()) return shake(['f_paste'], '먼저 붙여넣어 주세요'); PV = storePreview(t); render(); window.scrollTo(0, 0); };
    return;
  }
  const first = !SD.stores.length, uk = Object.keys(PV.unknown).sort(sortKo), ch = deptChoices();
  h += '<div class="pv"><div><span>붙여넣은 줄</span><b>' + PV.lines.toLocaleString() + '줄</b></div><div><span class="ok">가져올 매장</span><b class="ok">' + PV.keep.length.toLocaleString() + '개</b></div>'
    + '<div><span>빼는 매장 · 가맹 팀</span><b>' + PV.ex.team + '</b></div><div><span>빼는 매장 · 형태 (유통점 · 유통행사 · 직영점 아님)</span><b>' + PV.ex.type + '</b></div><div><span>빼는 매장 · 이름에 「폐점」</span><b>' + PV.ex.name + '</b></div>'
    + (PV.ex.dup ? '<div><span>같은 이름 (하나만 넣음)</span><b>' + PV.ex.dup + '</b></div>' : '')
    + (PV.filled ? '<div><span>병합된 칸 → 위 줄 팀으로 채움</span><b>' + PV.filled.toLocaleString() + '줄</b></div>' : '') + '</div>';
  if (!first) h += '<div class="pv"><div><span class="ok">새로 생긴 매장</span><b class="ok">+ ' + PV.add.length + '</b></div><div><span>팀 · 형태가 바뀐 매장</span><b>' + PV.chg.length + '</b></div>'
    + '<div><span class="bad">이번 목록에서 없어진 매장 → 폐점 표시</span><b class="bad">' + PV.gone.length + '</b></div><div><span>그대로</span><b>' + PV.same + '</b></div></div>'
    + (PV.add.length + PV.chg.length + PV.gone.length ? '<details class="dt"><summary>바뀌는 매장 목록 보기</summary>' + [['새로', PV.add], ['바뀜', PV.chg], ['폐점', PV.gone]].map(([l, L]) => L.slice(0, 80).map((s) => '<div><span class="pill">' + l + '</span> ' + esc(s.name) + ' <span class="muted">' + esc(s.team || '') + ' · ' + esc(s.type || '') + '</span></div>').join('')).join('') + '</details>' : '');
  if (uk.length || PV.noTeam) {
    h += '<div class="note warn"><b>팀 연결표에 없는 팀 ' + uk.length + '개</b> · 부서를 골라 주면 연결표에도 저장돼서 다음부터 자동이에요. 안 고르면 「미분류」로 들어가요.'
      + (PV.noTeam ? '<br>지역(팀) 칸이 빈 매장 ' + PV.noTeam + '개도 「미분류」로 들어가요.' : '') + (ch.length ? '' : '<br>연결표가 비어 있어 고를 부서가 없습니다. <b>팀 연결표</b>를 먼저 만들어 주세요.') + '</div>';
    uk.forEach((t, i) => { h += '<div class="fixr"><b>' + esc(t) + '</b> <span class="muted">매장 ' + PV.unknown[t] + '개</span><select data-pick="' + i + '"><option value="">부서 고르기 (안 고르면 미분류)</option>' + ch.map(([d, v]) => '<option value="' + esc(d + '|' + v) + '"' + (PV.pick[t] === d + '|' + v ? ' selected' : '') + '>' + esc(d) + (v ? ' (' + esc(v) + ')' : '') + '</option>').join('') + '</select></div>'; });
  }
  h += BUSY ? '<div class="btn red wide" style="opacity:.7"><span id="busyTxt">저장 중…</span></div>'
    : '<button class="btn red wide" type="button" id="pvSave">' + ic('check', 18) + (first ? PV.keep.length.toLocaleString() + '개 가져오기' : '이대로 맞추기') + '</button>'
      + '<button class="btn ghost wide" type="button" id="pvBack" style="margin-top:8px">다시 붙여넣기</button>';
  frame(h); bindStores();
  document.querySelectorAll('[data-pick]').forEach((s) => s.onchange = () => { PV.pick[uk[+s.dataset.pick]] = s.value; });
  if (!BUSY) { $('pvSave').onclick = storeApply; $('pvBack').onclick = () => { PV = null; render(); }; }
}

/* ---------- 팀 연결표 화면 ---------- */
function teamPreview(text) {
  const rows = parseTSV(text), f = findCols(rows, { team: ['표준팀'], dept: ['표준영업부'], division: ['표준영업부문'] });
  if (!f) return { err: '머리글에서 「표준팀 · 표준영업부 · 표준영업부문」을 찾지 못했습니다. 조직_표준화표 탭을 1행 머리글까지 같이 복사해 주세요.' };
  const m = new Map();
  rows.slice(f.row + 1).forEach((r) => { const team = cellOf(r, f.idx.team); if (!team || /^(확인필요|#N\/A|#REF!)$/.test(team)) return; m.set(teamId(team), { team, dept: cellOf(r, f.idx.dept), division: cellOf(r, f.idx.division) }); });
  const L = [...m.values()];
  return { list: L, depts: new Set(L.map((x) => x.dept).filter(Boolean)).size, divs: new Set(L.map((x) => x.division).filter(Boolean)).size, chg: L.filter((x) => { const o = SD.teams[teamId(x.team)]; return !o || o.dept !== x.dept || o.division !== x.division; }).length };
}
function teamsView() {
  let h = '<button class="back" type="button" data-s="list">' + ic('left', 16) + '매장 관리</button>';
  const all = Object.values(SD.teams).sort((a, b) => sortKo(a.team, b.team));
  if (TPV && !TPV.err) {
    h += '<div class="pv"><div><span>찾은 팀</span><b>' + TPV.list.length + '개</b></div><div><span>부서</span><b>' + TPV.depts + '개</b></div><div><span>영업부문</span><b>' + TPV.divs + '개</b></div><div><span class="ok">새로 들어가거나 바뀌는 팀</span><b class="ok">' + TPV.chg + '</b></div></div>'
      + '<p class="muted" style="font-size:12px">연결표에만 있고 붙여넣은 표에 없는 팀은 지우지 않고 그대로 둡니다.</p>'
      + (BUSY ? '<div class="btn red wide" style="opacity:.7"><span id="busyTxt">저장 중…</span></div>' : '<button class="btn red wide" type="button" id="tpSave">' + ic('check', 18) + '연결표 저장</button><button class="btn ghost wide" type="button" id="tpBack" style="margin-top:8px">다시 붙여넣기</button>');
    frame(h); bindStores();
    if (!BUSY) { $('tpSave').onclick = teamPasteSave; $('tpBack').onclick = () => { TPV = null; render(); }; }
    return;
  }
  h += '<details class="dt"' + (all.length && !TPV ? '' : ' open') + '><summary>' + ic('upload', 16) + ' 조직_표준화표 붙여넣기 ' + (all.length ? '(한꺼번에 고칠 때)' : '(처음 한 번)') + '</summary>'
    + '<p class="muted" style="font-size:12px;margin:8px 0 0">구글 시트 「조직_표준화표」 탭 전체를 복사해서 붙여넣으세요. 머리글 <b>표준팀 · 표준영업부 · 표준영업부문</b>을 보고 찾습니다. 다른 열이 섞여 있어도 돼요.</p>'
    + '<textarea id="f_tpaste" class="ta" style="height:110px" placeholder="여기에 붙여넣기 (Ctrl+V)"></textarea>' + (TPV && TPV.err ? '<div class="note warn">' + esc(TPV.err) + '</div>' : '')
    + '<button class="btn red wide" type="button" id="tpGo">' + ic('check', 18) + '확인하기</button></details>';
  h += '<div class="search" style="margin-top:12px"><span>' + ic('search', 17) + '</span><input id="f_tq" type="search" placeholder="팀 이름 검색" value="' + esc(TQ) + '" autocomplete="off"></div>'
    + '<div class="row2" style="margin-top:8px"><span class="muted" style="align-self:center">' + all.length + '팀</span><button class="b red" type="button" id="tAdd">' + ic('plus', 15) + '팀 추가</button></div>'
    + '<div id="tList">' + teamList() + '</div>';
  frame(h); bindStores();
  $('tpGo').onclick = () => { const t = $('f_tpaste').value; if (!t.trim()) return shake(['f_tpaste'], '먼저 붙여넣어 주세요'); TPV = teamPreview(t); render(); window.scrollTo(0, 0); };
  $('f_tq').oninput = () => { TQ = $('f_tq').value; $('tList').innerHTML = teamList(); bindTeams(); };
  $('tAdd').onclick = () => { TEDIT = '_new'; $('tList').innerHTML = teamList(); bindTeams(); };
  bindTeams();
}
function teamList() {
  const q = nk(TQ), xt = EXCLUDE_TEAMS.map(nk);
  const L = Object.entries(SD.teams).filter(([, t]) => !q || nk(t.team).includes(q) || nk(t.dept).includes(q)).sort((a, b) => sortKo(a[1].team, b[1].team));
  const used = {}; SD.stores.forEach((s) => { if (!s.closed) used[teamId(s.team)] = (used[teamId(s.team)] || 0) + 1; });
  return (TEDIT === '_new' ? teamForm({}) : '') + '<div class="tr">' + (L.length ? L.map(([id, t]) => TEDIT === id ? teamForm(t, id) :
    '<button type="button" class="st" data-tedit="' + esc(id) + '"><span class="sn"><b>' + esc(t.team) + '</b><small>' + (xt.includes(nk(t.team)) ? '가져오기에서 빼는 팀' : esc((t.dept || '부서 없음') + ' · ' + (t.division || '영업부문 없음'))) + '</small></span><span class="n">' + (used[id] ? '매장 ' + used[id] : '') + '</span></button>').join('')
    : '<div class="muted" style="padding:12px">' + (q ? '찾는 팀이 없습니다' : '아직 팀이 없습니다. 위에서 조직_표준화표를 붙여넣어 주세요.') + '</div>') + '</div>';
}
function teamForm(t, id) {
  const depts = [...new Set(Object.values(SD.teams).map((x) => x.dept).filter(Boolean))].sort(sortKo), divs = [...new Set(Object.values(SD.teams).map((x) => x.division).filter(Boolean))].sort(sortKo);
  return '<div class="form" style="margin:6px 0"><b>' + (id ? esc(t.team) + ' 고치기' : '팀 추가') + '</b><div class="grid">'
    + (id ? '' : fld('tTeam', '팀 이름 *', '', 'text', '예: 창원팀', ' full'))
    + '<div class="fd"><label for="f_tDept">부서 *</label><input id="f_tDept" list="dl_dept" value="' + esc(t.dept || '') + '" placeholder="예: 경남부" autocomplete="off"></div>'
    + '<div class="fd"><label for="f_tDiv">영업부문 *</label><input id="f_tDiv" list="dl_div" value="' + esc(t.division || '') + '" placeholder="예: 영업3본부" autocomplete="off"></div></div>'
    + '<datalist id="dl_dept">' + depts.map((d) => '<option value="' + esc(d) + '">').join('') + '</datalist><datalist id="dl_div">' + divs.map((d) => '<option value="' + esc(d) + '">').join('') + '</datalist>'
    + (ASK === 'team:' + id ? '<div class="ask">' + esc(t.team) + ' 팀을 연결표에서 뺄까요? 이 팀 매장은 「미분류」로 보입니다.<div class="fbtn"><button class="b red" type="button" data-tdel="' + esc(id) + '">빼기</button><button class="b" type="button" data-tno="1">취소</button></div></div>'
      : '<div class="fbtn"><button class="b red grow" type="button" data-tsave="' + esc(id || '') + '">저장</button><button class="b" type="button" data-tcancel="1">취소</button>' + (id ? '<button class="b danger" type="button" data-task="' + esc(id) + '">빼기</button>' : '') + '</div>') + '</div>';
}
function bindTeams() {
  const re = () => { $('tList').innerHTML = teamList(); bindTeams(); };
  document.querySelectorAll('[data-tedit]').forEach((b) => b.onclick = () => { TEDIT = b.dataset.tedit; ASK = ''; re(); });
  document.querySelectorAll('[data-tcancel]').forEach((b) => b.onclick = () => { TEDIT = ''; ASK = ''; re(); });
  document.querySelectorAll('[data-task]').forEach((b) => b.onclick = () => { ASK = 'team:' + b.dataset.task; re(); });
  document.querySelectorAll('[data-tno]').forEach((b) => b.onclick = () => { ASK = ''; re(); });
  document.querySelectorAll('[data-tsave]').forEach((b) => b.onclick = () => teamSave(b.dataset.tsave));
  document.querySelectorAll('[data-tdel]').forEach((b) => b.onclick = () => teamDel(b.dataset.tdel));
}
async function teamSave(id) {
  const team = id ? SD.teams[id].team : val('tTeam'), dept = val('tDept'), division = val('tDiv'), miss = [];
  if (!team) miss.push('f_tTeam'); if (!dept) miss.push('f_tDept'); if (!division) miss.push('f_tDiv');
  if (miss.length) return shake(miss, '팀 · 부서 · 영업부문을 적어 주세요');
  const tid = teamId(team); if (!id && SD.teams[tid]) return shake(['f_tTeam'], '이미 연결표에 있는 팀입니다');
  const d = { team, dept, division, updatedBy: ME.email, updatedAt: now() };
  try { await db.collection('TEAMMAP').doc(tid).set(d); SD.teams[tid] = d; TEDIT = ''; toast('저장했습니다'); render(); }
  catch (e) { toast('저장하지 못했습니다: ' + (e.message || e.code)); }
}
async function teamDel(id) {
  try { await db.collection('TEAMMAP').doc(id).delete(); delete SD.teams[id]; TEDIT = ''; ASK = ''; toast('연결표에서 뺐습니다'); render(); }
  catch (e) { toast('빼지 못했습니다: ' + (e.message || e.code)); }
}
async function teamPasteSave() {
  const by = ME.email, at = now(), ops = TPV.list.map((t) => ['set', db.collection('TEAMMAP').doc(teamId(t.team)), { ...t, updatedBy: by, updatedAt: at }]);
  BUSY = true; render();
  try { await commitOps(ops, '저장 중'); BUSY = false; TPV = null; toast('팀 연결표를 저장했습니다'); await storesLoad(); }
  catch (e) { BUSY = false; render(); toast('저장하지 못했습니다: ' + (e.message || e.code)); }
}
