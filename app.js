/* 다이소 안전 · 첫 화면 (로그인 → 팀원 확인 → 업무 고르기) · 팀원 관리 = 조직도 방식 */
// ★ 화면 버전: 바꿀 때마다 index.html 의 ?v= 와 같이 올림
const UI_VERSION = '26.10.29 D2.1';
// 고정 마스터 (firestore.rules 와 같은 값 · 화면에서 못 끔)
const MASTER_EMAILS = ['zxcv6309@gmail.com'];

firebase.initializeApp(window.FIREBASE_CONFIG);
const auth = firebase.auth(), db = firebase.firestore();
// D2.1 한 번 읽은 팀원 · 매장 목록을 휴대폰에 보관 → 인터넷이 약해도 앱이 열림 (안 되는 브라우저면 그냥 넘어감)
try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) { /* 무시 */ }
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const low = (s) => String(s || '').trim().toLowerCase();
const now = () => new Date().toISOString();
const newId = (p) => p + '-' + Math.random().toString(36).slice(2, 10).toUpperCase();

/* ---------- 선 아이콘 (인스타그램처럼 얇은 선 · 그림 파일 없이 코드로) ---------- */
const ICON = {
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M3 9h18"/><path d="M9 20v-6h6v6"/>',
  contract: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h3"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  install: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3"/><path d="M10.5 18.5h3"/>',
  logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z"/>',
  down: '<path d="M6 9l6 6 6-6"/>', right: '<path d="M9 6l6 6-6 6"/>', left: '<path d="M15 6l-6 6 6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', check: '<path d="M5 12l5 5 9-10"/>',
  google: '<path d="M20.5 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.6-3.9 2.6-6.5z"/><path d="M12 21c2.4 0 4.5-.8 5.9-2.2L15 16.6c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H4v2.3A9 9 0 0 0 12 21z"/><path d="M7 13.8a5.4 5.4 0 0 1 0-3.6V7.9H4a9 9 0 0 0 0 8.2z"/><path d="M12 6.5c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 4 7.9l3 2.3c.7-2.1 2.7-3.7 5-3.7z"/>'
};
const ic = (k, sz) => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"' + (sz ? ' style="width:' + sz + 'px;height:' + sz + 'px"' : '') + '>' + (ICON[k] || '') + '</svg>';

let ME = null;          // { email, name, team, master, member, memberId }
let VIEW = 'home';      // home | store | members
let MENU = false;
let ORG = null;         // { units:[], members:[] }
let SEL = '';           // 고른 조직 id
const OPEN = new Set(); // 펼친 조직
let FORM = null;        // { kind:'unit'|'mem', mode:'top'|'sub'|'edit'|'new', id }
let ASK = '';           // 삭제 확인 중인 대상 id
let BUSY = false;

function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2600); }
function shake(ids, t) { ids.forEach((i) => { const e = $(i); if (e) { e.classList.remove('bad'); void e.offsetWidth; e.classList.add('bad'); } }); toast(t); }
const fmtTel = (v) => { const d = String(v || '').replace(/\D/g, '').slice(0, 11); if (d.length < 4) return d; if (d.startsWith('02')) return d.length < 6 ? d.slice(0, 2) + '-' + d.slice(2) : d.length < 10 ? d.slice(0, 2) + '-' + d.slice(2, 5) + '-' + d.slice(5) : d.slice(0, 2) + '-' + d.slice(2, 6) + '-' + d.slice(6); return d.length < 8 ? d.slice(0, 3) + '-' + d.slice(3) : d.length < 11 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7); };

/* ---------- 로그인 ---------- */
function loginView() {
  $('app').innerHTML = '<div class="page"><div class="login"><div class="logo">DAISO<br>안전</div><h1>다이소 안전</h1><p>안전보건팀 업무 앱</p>'
    + '<button class="gbtn" type="button" id="gbtn">' + ic('google', 20) + 'Google로 로그인</button>'
    + '<div class="foot">회사 구글 계정으로 로그인하세요</div></div></div>';
  $('gbtn').onclick = login;
}
async function login() {
  const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  try { await auth.signInWithPopup(p); }
  catch (e) {
    if (/popup|operation-not-supported/i.test(e.code || '')) { try { await auth.signInWithRedirect(p); return; } catch (e2) { e = e2; } }
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast('로그인하지 못했습니다: ' + (e.message || e.code));
  }
}
async function logout() { MENU = false; ORG = null; await auth.signOut(); }

/* ---------- 팀원 확인 (LOGINS/이메일 = 로그인 허락 표) ---------- */
async function checkMember(u) {
  const email = low(u.email), fixed = MASTER_EMAILS.includes(email);
  let lg = null, mem = null;
  try { const d = await db.collection('LOGINS').doc(email).get(); if (d.exists) lg = d.data(); } catch (e) { /* 명단에 없으면 규칙이 막음 */ }
  if (lg && lg.memberId) { try { const d = await db.collection('MEMBERS').doc(lg.memberId).get(); if (d.exists) mem = d.data(); } catch (e) {} }
  let unit = null; if (mem && mem.unitId) { try { const d = await db.collection('UNITS').doc(mem.unitId).get(); if (d.exists) unit = d.data(); } catch (e) {} }
  ME = { email, master: fixed || !!(lg && lg.master), member: fixed || !!lg, memberId: lg ? lg.memberId : '',
    name: (mem && mem.name) || (lg && lg.name) || u.displayName || email.split('@')[0], title: (mem && mem.title) || '',
    team: (unit && unit.name) || '안전보건팀' };
}
function noAccessView() {
  $('app').innerHTML = '<div class="page"><div class="bar"><span class="dot"></span>다이소 안전</div><div class="warn"><div class="ring">' + ic('lock', 30) + '</div><h2>사용 권한이 없습니다</h2>'
    + '<p>' + esc(ME.email) + ' 계정은<br>안전보건팀 팀원 명단에 없습니다.<br>팀장님께 등록을 요청해 주세요.</p>'
    + '<button class="btn" type="button" id="relog">다른 계정으로 로그인</button></div></div>';
  $('relog').onclick = logout;
}

/* ---------- 틀 (상단 바 + 메뉴) ---------- */
const TITLE = { home: '다이소 안전', store: '매장 밀착지원', members: '팀원 관리', stores: '매장 관리' };
function frame(inner, wide) {
  const m = (v, i, t, s) => '<button type="button" class="' + (VIEW === v ? 'on' : '') + '" data-go="' + v + '">' + ic(i) + t + (s ? '<small>' + s + '</small>' : '') + '</button>';
  $('app').innerHTML = '<div class="page' + (wide ? ' wide' : '') + '"><div class="bar"><span class="dot"></span>' + esc(TITLE[VIEW]) + '<button class="mbtn" type="button" id="mbtn" aria-label="메뉴">' + ic(MENU ? 'x' : 'menu', 24) + '</button></div>'
    + '<div class="body">' + inner + '</div>'
    + (MENU ? '<div class="shade" id="shade"></div><div class="menu">' + m('home', 'home', '업무 고르기') + m('store', 'store', '매장 밀착지원')
      + (ME.master ? m('members', 'users', '팀원 관리', '마스터') + m('stores', 'list', '매장 관리', '마스터') : '')
      + '<button type="button" id="pwa">' + ic('install') + (typeof pwaIsApp === 'function' && pwaIsApp() ? '앱으로 쓰는 중<small>설치됨</small>' : '홈 화면에 앱 추가') + '</button><button type="button" id="out">' + ic('logout') + '로그아웃</button><div class="ver">버전 ' + UI_VERSION + '</div></div>' : '')
    + '</div>';
  $('mbtn').onclick = () => { MENU = !MENU; render(); };
  if (MENU) {
    $('shade').onclick = () => { MENU = false; render(); };
    document.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
    $('out').onclick = logout;
    $('pwa').onclick = () => { MENU = false; render(); if (typeof pwaInstall === 'function') pwaInstall(); };
  }
}
function go(v) { VIEW = v; MENU = false; FORM = null; ASK = ''; if (v === 'store' && typeof milReset === 'function') milReset(); if (v === 'stores' && typeof SM !== 'undefined') { SM = 'list'; PV = null; TPV = null; SEDIT = ''; TEDIT = ''; } render(); window.scrollTo(0, 0); }

/* ---------- 업무 고르기 ---------- */
function homeView() {
  frame('<div class="hello">' + esc(ME.team) + '<b>' + esc(ME.name) + ' 님</b></div>'
    + '<button class="card" type="button" id="toStore"><div class="ic red">' + ic('store') + '</div><div><h3>매장 밀착지원</h3><p>매장 현장점검 · 결과보고서 · 사고 이력 · 대시보드</p></div></button>'
    + '<div class="card off"><div class="ic gray">' + ic('contract') + '</div><div><h3>도급 안전관리</h3><p>나중에 연결 예정</p></div><span class="tag">준비 중</span></div>'
    + '<div class="todo">' + ic('bell') + '<div><b>처리할 일</b><br><span class="muted">매장 밀착지원을 옮기면 여기에 미조치 지적 · 재점검 예정이 표시됩니다.</span></div></div>');
  $('toStore').onclick = () => go('store');
}

/* ---------- 매장 밀착지원 (다음 차례에 옮김) ---------- */
function storeView() {
  frame('<div class="ready"><div class="ring red">' + ic('store', 30) + '</div><h2>매장 밀착지원</h2><p class="muted">다음 차례부터 기능을 하나씩 옮겨 옵니다.<br>매장 선택 → 점검 → 사진 → 결과보고서 → 사고 이력 → 대시보드</p>'
    + '<button class="btn ghost" type="button" id="toHome">' + ic('left', 16) + '이전으로</button></div>');
  $('toHome').onclick = () => go('home');
}

/* =====================================================================
   팀원 관리 (마스터) · 조직도: 왼쪽 조직 · 오른쪽 사람
   UNITS  = { id, name, parent }
   MEMBERS = { id, unitId, name, title, phone, companyEmail, gmail, master }
   LOGINS/{gmail} = { email, memberId, name, master }  ← 로그인 허락 표 (사람을 저장할 때 같이 고침)
   ===================================================================== */
async function orgLoad() {
  try {
    const [u, m] = await Promise.all([db.collection('UNITS').get(), db.collection('MEMBERS').get()]);
    ORG = { units: u.docs.map((d) => d.data()), members: m.docs.map((d) => d.data()) };
    if (!SEL || (SEL !== '_none' && !ORG.units.some((x) => x.id === SEL))) { const f = kids('')[0]; SEL = f ? f.id : ''; }
  } catch (e) { ORG = { units: [], members: [] }; toast('팀원 목록을 불러오지 못했습니다: ' + (e.message || e.code)); }
  render();
}
const kids = (p) => ORG.units.filter((u) => (u.parent || '') === (p || '')).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko'));
const unitOf = (id) => ORG.units.find((u) => u.id === id);
function below(id) { const s = new Set([id]); let ch = true; while (ch) { ch = false; ORG.units.forEach((u) => { if (s.has(u.parent) && !s.has(u.id)) { s.add(u.id); ch = true; } }); } return s; }
function path(id) { const L = []; let u = unitOf(id), g = 0; while (u && g++ < 12) { L.unshift(u.name); u = unitOf(u.parent); } return L; }
function flat() { const out = [], walk = (p, d) => kids(p).forEach((u) => { out.push([u, d]); walk(u.id, d + 1); }); walk('', 0); return out; }
const orphans = () => ORG.members.filter((m) => !unitOf(m.unitId));
const isFixed = (m) => MASTER_EMAILS.includes(low(m.gmail));

function membersView() {
  if (!ME.master) { go('home'); return; }
  if (!ORG) { frame('<p class="muted">팀원 목록 불러오는 중…</p>', true); orgLoad(); return; }
  let u = unitOf(SEL), g = 0; while (u && u.parent && g++ < 12) { OPEN.add(u.parent); u = unitOf(u.parent); }
  frame('<button class="back" type="button" id="toHome">' + ic('left', 16) + '이전으로</button>'
    + '<div class="og"><nav class="ogs" aria-label="조직"><div class="ogsh"><span>조직</span><button class="xs" type="button" id="addTop" aria-label="맨 위 조직 추가">' + ic('plus', 15) + '</button></div>'
    + tree('', 0) + (orphans().length ? '<button type="button" class="ogf' + (SEL === '_none' ? ' on' : '') + '" data-unit="_none">' + ic('folder', 17) + '소속 없음<span class="n">' + orphans().length + '</span></button>' : '')
    + (ORG.units.length ? '' : '<p class="muted" style="padding:6px 8px;font-size:12.5px">[+]로 첫 조직을 만들어 주세요<br>(예: 안전보건팀)</p>') + '</nav>'
    + '<section class="ogm">' + main() + '</section></div>', true);
  $('toHome').onclick = () => go('home');
  $('addTop').onclick = () => { FORM = { kind: 'unit', mode: 'top' }; ASK = ''; render(); };
  document.querySelectorAll('[data-unit]').forEach((b) => b.onclick = () => pick(b.dataset.unit));
  document.querySelectorAll('[data-act]').forEach((b) => b.onclick = () => act(b.dataset.act, b.dataset.id));
  const tel = $('f_mPhone'); if (tel) tel.oninput = () => { tel.value = fmtTel(tel.value); };
  if (FORM) setTimeout(() => { const f = $(FORM.kind === 'unit' ? 'f_uName' : 'f_mName'); if (f && !f.value) f.focus(); }, 30);
}
function tree(p, d) {
  return kids(p).map((u) => {
    const k = kids(u.id).length, op = OPEN.has(u.id), n = ORG.members.filter((m) => below(u.id).has(m.unitId)).length;
    return '<button type="button" class="ogf' + (SEL === u.id ? ' on' : '') + '" style="padding-left:' + (6 + d * 14) + 'px" data-unit="' + esc(u.id) + '"' + (k ? ' aria-expanded="' + op + '"' : '') + '>'
      + '<span class="tw">' + (k ? ic(op ? 'down' : 'right', 14) : '') + '</span>' + ic('folder', 17) + '<span class="nm">' + esc(u.name) + '</span><span class="n">' + n + '</span></button>'
      + (k && op ? tree(u.id, d + 1) : '');
  }).join('');
}
function pick(id) { if (SEL === id && id !== '_none' && kids(id).length) { OPEN.has(id) ? OPEN.delete(id) : OPEN.add(id); } else { SEL = id; if (id !== '_none' && kids(id).length) OPEN.add(id); } FORM = null; ASK = ''; render(); }

function main() {
  if (FORM && FORM.kind === 'unit' && FORM.mode === 'top') return unitForm();
  const none = SEL === '_none', u = unitOf(SEL);
  if (!none && !u) return '<p class="muted">왼쪽에서 조직을 고르거나 [+]로 조직을 만들어 주세요.</p>';
  const list = none ? orphans() : ORG.members.filter((m) => m.unitId === SEL);
  list.sort((a, b) => (isFixed(b) - isFixed(a)) || String(a.name).localeCompare(String(b.name), 'ko'));
  const head = '<div class="ogt"><div><div class="path">' + (none ? '조직이 지워졌거나 예전 자료' : esc(path(SEL).slice(0, -1).join(' › ')) + (path(SEL).length > 1 ? ' ›' : '')) + '</div><h3>' + (none ? '소속 없음' : esc(u.name)) + '</h3></div>'
    + (none ? '' : '<div class="ogbar"><button class="b" type="button" data-act="unitEdit">' + ic('edit', 15) + '조직 고치기</button><button class="b" type="button" data-act="unitSub">' + ic('plus', 15) + '아래 조직</button><button class="b red" type="button" data-act="memNew">' + ic('plus', 15) + '사람</button></div>') + '</div>';
  if (FORM && FORM.kind === 'unit') return head + unitForm(u);
  return head + (FORM && FORM.kind === 'mem' && FORM.mode === 'new' ? memForm({ unitId: SEL }) : '')
    + (list.length ? list.map((m) => FORM && FORM.kind === 'mem' && FORM.id === m.id ? memForm(m) : memRow(m)).join('')
      : (FORM ? '' : '<p class="muted" style="margin-top:14px">아직 사람이 없습니다. [+ 사람]으로 넣어 주세요.</p>'));
}
function memRow(m) {
  const sub = [m.gmail, m.phone].filter(Boolean).join(' · ') || (m.companyEmail ? m.companyEmail : '연락처 없음');
  return '<button type="button" class="mem" data-act="memEdit" data-id="' + esc(m.id) + '"><div class="av">' + esc(String(m.name || '?').slice(0, 1)) + '</div>'
    + '<div class="mi"><div class="nm">' + esc(m.name) + '<span class="ti">' + esc(m.title) + '</span>' + (m.master || isFixed(m) ? '<span class="pill m">마스터</span>' : '') + '</div><div class="em">' + esc(sub) + '</div></div>'
    + '<span class="ed">' + ic('right', 18) + '</span></button>';
}
const fld = (id, label, val, type, ph, extra) => '<div class="fd' + (extra || '') + '"><label for="f_' + id + '">' + label + '</label><input id="f_' + id + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '" autocomplete="off"></div>';
function memForm(m) {
  const ed = !!m.id, fixed = isFixed(m), none = SEL === '_none';
  return '<div class="form"><b>' + (ed ? '고치기 · ' + esc(m.name) : '사람 추가') + '</b><div class="grid">'
    + fld('mName', '이름 *', m.name, 'text', '홍길동') + fld('mTitle', '직책 *', m.title, 'text', '예: 대리')
    + fld('mPhone', '연락처', m.phone, 'tel', '숫자만 (- 자동)') + fld('mMail', '회사 이메일', m.companyEmail, 'email', 'name@daiso.co.kr')
    + fld('mGmail', '로그인 Gmail (앱 쓸 사람만 · 넣으면 바로 들어올 수 있어요)', m.gmail, 'email', 'name@gmail.com 또는 회사 구글 계정', ' full')
    + (ed && ORG.units.length ? '<div class="fd full"><label for="f_mUnit">소속</label><select id="f_mUnit">' + (none ? '<option value="">골라 주세요</option>' : '') + flat().map(([x, d]) => '<option value="' + esc(x.id) + '"' + (m.unitId === x.id ? ' selected' : '') + '>' + '　'.repeat(d) + esc(x.name) + '</option>').join('') + '</select></div>' : '')
    + '</div><label class="chk"><input type="checkbox" id="f_mMaster"' + (m.master || fixed ? ' checked' : '') + (fixed ? ' disabled' : '') + '><span class="box">' + ic('check', 12) + '</span>마스터 (팀원 관리 · 데이터 관리)' + (fixed ? ' <span class="muted">· 고정 마스터라 못 끔</span>' : '') + '</label>'
    + (ASK === m.id ? '<div class="ask">' + esc(m.name) + ' 님을 삭제할까요?' + (m.gmail ? ' 앱 로그인도 같이 막힙니다.' : '') + '<div class="fbtn"><button class="b red" type="button" data-act="memDel" data-id="' + esc(m.id) + '">삭제</button><button class="b" type="button" data-act="askNo">취소</button></div></div>'
      : '<div class="fbtn"><button class="b red grow" type="button" data-act="memSave" data-id="' + esc(m.id || '') + '"' + (BUSY ? ' disabled' : '') + '>' + (BUSY ? '저장 중…' : '저장') + '</button><button class="b" type="button" data-act="cancel">취소</button>'
        + (ed && !fixed && m.id !== ME.memberId ? '<button class="b danger" type="button" data-act="askDel" data-id="' + esc(m.id) + '">삭제</button>' : '') + '</div>') + '</div>';
}
function unitForm(u) {
  const m = FORM.mode, ed = m === 'edit', no = ed ? below(u.id) : new Set();
  return '<div class="form"><b>' + (m === 'top' ? '맨 위 조직 추가' : m === 'sub' ? esc(u.name) + ' 아래에 조직 추가' : '조직 고치기') + '</b><div class="grid">'
    + fld('uName', '조직 이름 *', ed ? u.name : '', 'text', '예: 매장안전파트', ' full')
    + (ed ? '<div class="fd full"><label for="f_uParent">위치</label><select id="f_uParent"><option value="">맨 위</option>' + flat().filter(([x]) => !no.has(x.id)).map(([x, d]) => '<option value="' + esc(x.id) + '"' + (u.parent === x.id ? ' selected' : '') + '>' + '　'.repeat(d) + esc(x.name) + ' 아래</option>').join('') + '</select></div>' : '')
    + '</div>' + (ASK === 'unit' ? '<div class="ask">' + esc(u.name) + ' 조직을 삭제할까요?<div class="fbtn"><button class="b red" type="button" data-act="unitDel">삭제</button><button class="b" type="button" data-act="askNo">취소</button></div></div>'
      : '<div class="fbtn"><button class="b red grow" type="button" data-act="unitSave"' + (BUSY ? ' disabled' : '') + '>' + (BUSY ? '저장 중…' : '저장') + '</button><button class="b" type="button" data-act="cancel">취소</button>' + (ed ? '<button class="b danger" type="button" data-act="askUnit">삭제</button>' : '') + '</div>') + '</div>';
}
function act(a, id) {
  if (a === 'unitEdit') { FORM = { kind: 'unit', mode: 'edit' }; ASK = ''; }
  else if (a === 'unitSub') { FORM = { kind: 'unit', mode: 'sub' }; ASK = ''; }
  else if (a === 'memNew') { FORM = { kind: 'mem', mode: 'new' }; ASK = ''; }
  else if (a === 'memEdit') { FORM = { kind: 'mem', mode: 'edit', id }; ASK = ''; }
  else if (a === 'cancel') { FORM = null; ASK = ''; }
  else if (a === 'askNo') { ASK = ''; }
  else if (a === 'askDel') { ASK = id; }
  else if (a === 'askUnit') { const u = unitOf(SEL); if (kids(SEL).length) return toast(u.name + ' 아래에 조직이 있습니다. 아래 조직부터 지우거나 옮겨 주세요.'); if (ORG.members.some((m) => m.unitId === SEL)) return toast(u.name + '에 사람이 있습니다. 사람을 옮기거나 삭제해 주세요.'); ASK = 'unit'; }
  else if (a === 'unitSave') return unitSave();
  else if (a === 'unitDel') return unitDel();
  else if (a === 'memSave') return memSave(id);
  else if (a === 'memDel') return memDel(id);
  render();
}
const val = (id) => ($('f_' + id) ? $('f_' + id).value.trim() : '');
async function unitSave() {
  const name = val('uName'); if (!name) return shake(['f_uName'], '조직 이름을 적어 주세요');
  const m = FORM.mode; let u;
  if (m === 'edit') { u = { ...unitOf(SEL), name }; if ($('f_uParent')) u.parent = $('f_uParent').value; }
  else { u = { id: newId('U'), name, parent: m === 'sub' ? SEL : '' }; if (m === 'sub') OPEN.add(SEL); }
  BUSY = true; render();
  try { await db.collection('UNITS').doc(u.id).set({ id: u.id, name: u.name, parent: u.parent || '' }); SEL = u.id; FORM = null; toast('조직을 저장했습니다'); BUSY = false; await orgLoad(); }
  catch (e) { BUSY = false; render(); toast('저장하지 못했습니다: ' + (e.message || e.code)); }
}
async function unitDel() {
  const u = unitOf(SEL); BUSY = true;
  try { await db.collection('UNITS').doc(u.id).delete(); SEL = u.parent || ''; FORM = null; ASK = ''; BUSY = false; toast('삭제했습니다'); await orgLoad(); }
  catch (e) { BUSY = false; render(); toast('삭제하지 못했습니다: ' + (e.message || e.code)); }
}
async function memSave(id) {
  const old = id ? ORG.members.find((x) => x.id === id) : null;
  const d = { id: id || newId('M'), unitId: $('f_mUnit') ? $('f_mUnit').value : (old ? old.unitId : SEL), name: val('mName'), title: val('mTitle'), phone: fmtTel(val('mPhone')),
    companyEmail: low(val('mMail')), gmail: low(val('mGmail')), master: !!($('f_mMaster') && $('f_mMaster').checked), updatedBy: ME.email, updatedAt: now() };
  const miss = []; if (!d.name) miss.push('f_mName'); if (!d.title) miss.push('f_mTitle'); if (miss.length) return shake(miss, '이름과 직책을 적어 주세요');
  if (!d.unitId || d.unitId === '_none') return shake(['f_mUnit'], '소속 조직을 골라 주세요');
  const mail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (d.gmail && !mail.test(d.gmail)) return shake(['f_mGmail'], '로그인 Gmail 형식을 확인해 주세요');
  if (d.companyEmail && !mail.test(d.companyEmail)) return shake(['f_mMail'], '회사 이메일 형식을 확인해 주세요');
  if (d.gmail && ORG.members.some((x) => x.id !== d.id && low(x.gmail) === d.gmail)) return shake(['f_mGmail'], '이 Gmail은 다른 사람에게 이미 들어가 있습니다');
  if (MASTER_EMAILS.includes(d.gmail)) d.master = true;
  if (old && isFixed(old) && d.gmail !== low(old.gmail)) return shake(['f_mGmail'], '고정 마스터의 로그인 Gmail은 바꿀 수 없습니다');
  BUSY = true; render();
  try {
    const b = db.batch();
    b.set(db.collection('MEMBERS').doc(d.id), d);
    if (old && old.gmail && low(old.gmail) !== d.gmail) b.delete(db.collection('LOGINS').doc(low(old.gmail)));
    if (d.gmail) b.set(db.collection('LOGINS').doc(d.gmail), { email: d.gmail, memberId: d.id, name: d.name, master: d.master });
    await b.commit();
    SEL = d.unitId; FORM = null; BUSY = false; toast('저장했습니다'); await orgLoad();
  } catch (e) { BUSY = false; render(); toast('저장하지 못했습니다: ' + (e.message || e.code)); }
}
async function memDel(id) {
  const m = ORG.members.find((x) => x.id === id); if (!m || isFixed(m)) return;
  BUSY = true;
  try { const b = db.batch(); b.delete(db.collection('MEMBERS').doc(id)); if (m.gmail) b.delete(db.collection('LOGINS').doc(low(m.gmail))); await b.commit(); FORM = null; ASK = ''; BUSY = false; toast('삭제했습니다'); await orgLoad(); }
  catch (e) { BUSY = false; render(); toast('삭제하지 못했습니다: ' + (e.message || e.code)); }
}

/* ---------- 화면 고르기 ---------- */
function render() {
  if (!ME) return loginView();
  if (!ME.member) return noAccessView();
  if (VIEW === 'store') return typeof milView === 'function' ? milView() : storeView();
  if (VIEW === 'members') return membersView();
  if (VIEW === 'stores') return storesView();
  return homeView();
}
auth.getRedirectResult().catch((e) => toast('로그인하지 못했습니다: ' + (e.message || e.code)));
auth.onAuthStateChanged(async (u) => {
  if (!u) { ME = null; VIEW = 'home'; MENU = false; return render(); }
  $('app').innerHTML = '<div class="boot">팀원 확인 중…</div>';
  await checkMember(u); render();
});
