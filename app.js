/* 다이소 안전 · 첫 화면 (로그인 → 팀원 확인 → 업무 고르기) */
// ★ 화면 버전: 바꿀 때마다 index.html 의 ?v= 와 같이 올림
const UI_VERSION = '26.10.29 D1.0';
// 마스터 (코드에 고정 · firestore.rules 와 같은 값)
const MASTER_EMAILS = ['zxcv6309@gmail.com'];

firebase.initializeApp(window.FIREBASE_CONFIG);
const auth = firebase.auth(), db = firebase.firestore();
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const low = (s) => String(s || '').trim().toLowerCase();

let ME = null;          // { email, name, master, member }
let VIEW = 'home';      // home | store | members
let MENU = false;
let MEMBERS = null;     // 팀원 관리 목록
let delAsk = '';        // 지우기 확인 중인 이메일

function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2600); }

/* ---------- 로그인 ---------- */
function loginView() {
  $('app').innerHTML = '<div class="page"><div class="login"><div class="logo">DAISO<br>안전</div><h1>다이소 안전</h1><p>안전보건팀 업무 앱</p>'
    + '<button class="gbtn" type="button" id="gbtn"><b>G</b> Google로 로그인</button>'
    + '<div class="foot">회사 구글 계정으로 로그인하세요</div></div></div>';
  $('gbtn').onclick = login;
}
async function login() {
  const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
  try { await auth.signInWithPopup(p); }
  catch (e) {
    // 팝업이 막히는 휴대폰 브라우저는 화면 이동 방식으로
    if (/popup|operation-not-supported/i.test(e.code || '')) { try { await auth.signInWithRedirect(p); return; } catch (e2) { e = e2; } }
    if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast('로그인하지 못했습니다: ' + (e.message || e.code));
  }
}
async function logout() { MENU = false; await auth.signOut(); }

/* ---------- 팀원 확인 ---------- */
async function checkMember(u) {
  const email = low(u.email), master = MASTER_EMAILS.includes(email);
  let doc = null;
  try { const d = await db.collection('MEMBERS').doc(email).get(); if (d.exists) doc = d.data(); } catch (e) { /* 팀원이 아니면 규칙이 막음 */ }
  const member = master || !!(doc && doc.active !== false);
  ME = { email, name: (doc && doc.name) || u.displayName || email.split('@')[0], team: (doc && doc.team) || '안전보건팀', master, member };
}
function noAccessView() {
  $('app').innerHTML = '<div class="page"><div class="bar"><span class="dot"></span>다이소 안전</div><div class="warn"><div class="i">🔒</div><h2>사용 권한이 없습니다</h2>'
    + '<p>' + esc(ME.email) + ' 계정은<br>안전보건팀 팀원 명단에 없습니다.<br>팀장님께 등록을 요청해 주세요.</p>'
    + '<button class="btn" type="button" id="relog">다른 계정으로 로그인</button></div></div>';
  $('relog').onclick = logout;
}

/* ---------- 틀 (상단 바 + 메뉴) ---------- */
const TITLE = { home: '다이소 안전', store: '매장 밀착지원', members: '팀원 관리' };
function frame(inner) {
  const m = (v, t) => '<button type="button" class="' + (VIEW === v ? 'on' : '') + '" data-go="' + v + '">' + t + '</button>';
  $('app').innerHTML = '<div class="page"><div class="bar"><span class="dot"></span>' + esc(TITLE[VIEW]) + '<button class="mbtn" type="button" id="mbtn" aria-label="메뉴">' + (MENU ? '✕' : '☰') + '</button></div>'
    + '<div class="body">' + inner + '</div>'
    + (MENU ? '<div class="shade" id="shade"></div><div class="menu">' + m('home', '⌂ 업무 고르기') + m('store', '🏬 매장 밀착지원')
      + (ME.master ? m('members', '👥 팀원 관리 <small>(마스터)</small>') : '')
      + '<button type="button" id="pwa">📲 홈 화면에 앱 추가</button><button type="button" id="out">로그아웃</button><div class="ver">버전 ' + UI_VERSION + '</div></div>' : '')
    + '</div>';
  $('mbtn').onclick = () => { MENU = !MENU; render(); };
  if (MENU) {
    $('shade').onclick = () => { MENU = false; render(); };
    document.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => go(b.dataset.go));
    $('out').onclick = logout;
    $('pwa').onclick = () => { MENU = false; render(); toast('홈 화면 앱은 다음 차례에 연결합니다'); };
  }
}
function go(v) { VIEW = v; MENU = false; delAsk = ''; if (v === 'members') MEMBERS = null; render(); window.scrollTo(0, 0); }

/* ---------- 업무 고르기 ---------- */
function homeView() {
  frame('<div class="hello">' + esc(ME.team) + '<b>' + esc(ME.name) + ' 님</b></div>'
    + '<button class="card" type="button" data-app="store"><div class="ic" style="background:#fdecec">🏬</div><div><h3>매장 밀착지원</h3><p>매장 현장점검 · 결과보고서 · 사고 이력 · 대시보드</p></div></button>'
    + '<div class="card off"><div class="ic" style="background:#f3f4f6">🏗</div><div><h3>도급 안전관리</h3><p>나중에 연결 예정</p></div><span class="tag">준비 중</span></div>'
    + '<div class="todo">🔔 <b>처리할 일</b><br><span class="muted">매장 밀착지원을 옮기면 여기에 미조치 지적·재점검 예정이 표시됩니다.</span></div>');
  document.querySelector('[data-app="store"]').onclick = () => go('store');
}

/* ---------- 매장 밀착지원 (다음 차례에 옮김) ---------- */
function storeView() {
  frame('<div class="ready"><div class="i">🏬</div><h2>매장 밀착지원</h2><p class="muted">다음 차례부터 기능을 하나씩 옮겨 옵니다.<br>매장 선택 → 점검 → 사진 → 결과보고서 → 사고 이력 → 대시보드</p>'
    + '<button class="btn ghost" type="button" id="toHome" style="margin-top:22px">‹ 이전으로</button></div>');
  $('toHome').onclick = () => go('home');
}

/* ---------- 팀원 관리 (마스터) ---------- */
async function loadMembers() {
  try { const s = await db.collection('MEMBERS').get(); MEMBERS = s.docs.map((d) => d.data()).sort((a, b) => String(a.name).localeCompare(String(b.name), 'ko')); }
  catch (e) { MEMBERS = []; toast('팀원 목록을 불러오지 못했습니다: ' + (e.message || e.code)); }
  render();
}
function membersView() {
  if (!ME.master) { go('home'); return; }
  if (!MEMBERS) { frame('<p class="muted">팀원 목록 불러오는 중…</p>'); loadMembers(); return; }
  const row = (m) => '<div class="mem"><div><div class="nm">' + esc(m.name) + (MASTER_EMAILS.includes(m.email) ? '<span class="pill m">마스터</span>' : '') + '</div><div class="em">' + esc(m.email) + '</div></div>'
    + '<div class="act">' + (MASTER_EMAILS.includes(m.email) ? '' : delAsk === m.email
      ? '<button type="button" class="del" data-del="' + esc(m.email) + '">정말 빼기</button><button type="button" data-cancel="1">취소</button>'
      : '<button type="button" class="del" data-ask="' + esc(m.email) + '">빼기</button>') + '</div></div>';
  frame('<button class="back" type="button" id="toHome">‹ 이전으로</button>'
    + '<div class="box"><h3>팀원 추가</h3><div class="field"><label for="mEmail">구글 계정 이메일</label><input id="mEmail" type="email" inputmode="email" autocomplete="off" placeholder="예: hong@daiso.co.kr"></div>'
    + '<div class="field"><label for="mName">이름</label><input id="mName" type="text" placeholder="예: 홍길동"></div><button class="btn red wide" type="button" id="mAdd">추가하기</button></div>'
    + '<div class="box"><h3>팀원 명단 <span class="muted">' + MEMBERS.length + '명</span></h3>'
    + (MEMBERS.length ? MEMBERS.map(row).join('') : '<p class="muted">아직 등록한 팀원이 없습니다. 위에서 추가해 주세요.<br>(마스터는 명단에 없어도 들어올 수 있습니다)</p>') + '</div>');
  $('toHome').onclick = () => go('home');
  $('mAdd').onclick = addMember;
  document.querySelectorAll('[data-ask]').forEach((b) => b.onclick = () => { delAsk = b.dataset.ask; render(); });
  document.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => { delAsk = ''; render(); });
  document.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => delMember(b.dataset.del));
}
async function addMember() {
  const ei = $('mEmail'), ni = $('mName'), email = low(ei.value), name = ni.value.trim();
  ei.classList.remove('bad'); ni.classList.remove('bad');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { ei.classList.add('bad'); toast('이메일을 확인해 주세요'); return; }
  if (!name) { ni.classList.add('bad'); toast('이름을 넣어 주세요'); return; }
  if (MEMBERS.some((m) => m.email === email)) { toast('이미 명단에 있습니다'); return; }
  try {
    await db.collection('MEMBERS').doc(email).set({ email, name, team: '안전보건팀', active: true, addedBy: ME.email, addedAt: new Date().toISOString() });
    toast(name + ' 님을 추가했습니다'); MEMBERS = null; render();
  } catch (e) { toast('추가하지 못했습니다: ' + (e.message || e.code)); }
}
async function delMember(email) {
  try { await db.collection('MEMBERS').doc(email).delete(); toast('명단에서 뺐습니다'); delAsk = ''; MEMBERS = null; render(); }
  catch (e) { toast('빼지 못했습니다: ' + (e.message || e.code)); }
}

/* ---------- 화면 고르기 ---------- */
function render() {
  if (!ME) return loginView();
  if (!ME.member) return noAccessView();
  if (VIEW === 'store') return storeView();
  if (VIEW === 'members') return membersView();
  return homeView();
}
auth.getRedirectResult().catch((e) => toast('로그인하지 못했습니다: ' + (e.message || e.code)));
auth.onAuthStateChanged(async (u) => {
  if (!u) { ME = null; VIEW = 'home'; MENU = false; return render(); }
  $('app').innerHTML = '<div class="boot">팀원 확인 중…</div>';
  await checkMember(u); render();
});
