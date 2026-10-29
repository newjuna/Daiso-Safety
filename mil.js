/* 다이소 안전 · 매장 밀착지원
 * 1단계 (D1.5): 첫 화면 · 점검 시작 (점검자 = 로그인한 사람 · 매장 검색 / 조직으로 고르기)
 * 진행 중인 점검은 이 휴대폰에 저장 (localStorage · 계정별) → 앱을 닫아도 「이어서 하기」
 * 사고이력 · 지난 지적사항 조회는 5단계에서 붙임 (그때 기다릴 일이 생기면 확인 화면을 보여 줌)
 * D1.7: 점검 화면(작업점검 ~ 해결방안 확인)은 insp.js · 사진 보관은 photo.js
 */
Object.assign(ICON, {
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'
});

let MV = 'home';          // home | start | work
let MSEL = '';            // 고른 매장 id
let MQ = '';              // 매장 검색어
let MORG = { division: '', dept: '', team: '' };
let MDATE = '';
let MASK = '';            // 확인 중: 'restart' | 'quit'

const todayStr = () => new Date().toLocaleDateString('sv-SE');
const milKey = () => 'ds_mil_v1:' + (ME ? ME.email : '');
function milGet() { try { return JSON.parse(localStorage.getItem(milKey()) || 'null'); } catch (e) { return null; } }
function milPut(x) { try { if (x) localStorage.setItem(milKey(), JSON.stringify(x)); else localStorage.removeItem(milKey()); return true; } catch (e) { toast('이 휴대폰에 저장하지 못했습니다 (저장 공간 부족)'); return false; } }
function milReset() { MV = 'home'; MSEL = ''; MQ = ''; MASK = ''; MORG = { division: '', dept: '', team: '' }; MDATE = todayStr(); }
const dayKo = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); if (!m) return d || ''; return m[1] + '. ' + Number(m[2]) + '. ' + Number(m[3]) + '. (' + '일월화수목금토'[new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00').getDay()] + ')'; };

function milView() {
  if (!MDATE) MDATE = todayStr();
  TITLE.store = MV === 'start' ? '점검 시작' : '매장 밀착지원';
  if (MV === 'start') return milStart();
  if (MV === 'work') return milWork();
  return milHome();
}

/* ---------- 첫 화면 ---------- */
function milHome() {
  const cur = milGet();
  if (typeof inspReset === 'function') inspReset();
  frame('<div class="hello">' + esc(ME.team) + '<b>' + esc(ME.name) + ' 님</b></div>'
    + (cur ? '<button class="card resume" type="button" id="mResume"><div class="ic red">' + ic('edit') + '</div><div><h3>이어서 하기</h3><p>' + esc(cur.store.name) + ' · ' + esc(dayKo(cur.date)) + '<br>' + esc(typeof inspProgress === 'function' ? inspProgress(cur) : '') + '</p></div><span class="go">' + ic('right', 18) + '</span></button>' : '')
    + '<button class="card" type="button" id="mNew"><div class="ic navy">' + ic('plus') + '</div><div><h3>새 점검 시작</h3><p>매장을 골라 현장점검을 시작해요</p></div></button>'
    + '<div class="card off"><div class="ic gray">' + ic('alert') + '</div><div><h3>사고 이력</h3><p>매장별 사고 · 팀 1장 보고서</p></div><span class="tag">준비 중</span></div>'
    + '<div class="card off"><div class="ic gray">' + ic('chart') + '</div><div><h3>대시보드</h3><p>점검 현황 · 미조치 지적</p></div><span class="tag">준비 중</span></div>'
    + '<button class="btn ghost" type="button" id="mHome" style="margin-top:18px">' + ic('left', 16) + '업무 고르기</button>');
  if (cur) $('mResume').onclick = () => { MV = 'work'; render(); window.scrollTo(0, 0); };
  $('mNew').onclick = () => { MV = 'start'; MSEL = ''; MQ = ''; MASK = ''; MDATE = todayStr(); render(); window.scrollTo(0, 0); };
  $('mHome').onclick = () => go('home');
}

/* ---------- 점검 시작 ---------- */
const liveStores = () => SD.stores.filter((s) => !s.closed);
function milStart() {
  if (!SD) { frame('<p class="muted">매장 목록 불러오는 중…</p>'); storesLoad(); return; }
  const me = '<div class="me"><div class="av">' + esc(String(ME.name).slice(0, 1)) + '</div><div><b>' + esc(ME.name) + '</b>' + (ME.title ? ' <span class="muted" style="font-size:12.5px">' + esc(ME.title) + '</span>' : '') + '<small>점검자 · 로그인 계정으로 자동</small></div>'
    + '<label class="mdate">' + ic('cal', 15) + '<span>' + esc(dayKo(MDATE)) + '</span><input type="date" id="f_mDate" value="' + esc(MDATE) + '" aria-label="점검일"></label></div>';
  let h = '<button class="back" type="button" id="mBack">' + ic('left', 16) + '이전으로</button>' + me;
  const s = MSEL && SD.stores.find((x) => x.id === MSEL);
  if (!liveStores().length) {
    h += '<div class="note warn" style="margin-top:14px">아직 매장 목록이 없습니다. ' + (ME.master ? '메뉴 → 매장 관리에서 매장을 올려 주세요.' : '마스터에게 매장 목록을 올려 달라고 요청해 주세요.') + '</div>';
  } else if (s) {
    const o = orgOf(s), cur = milGet();
    h += '<div class="pick"><h4>' + esc(s.name) + '</h4><p>' + esc([o.division, o.dept, s.team || '팀 없음'].join(' › ')) + ' · ' + esc(s.type) + '</p><div class="facts"><span>지난 점검 · 5단계에서 연결</span><span>사고이력 · 5단계에서 연결</span></div></div>'
      + '<button class="btn ghost wide" type="button" id="mOther" style="font-weight:500">다른 매장 고르기</button>'
      + (MASK === 'restart' && cur ? '<div class="ask">진행 중인 점검 <b>' + esc(cur.store.name) + '</b> (' + esc(dayKo(cur.date)) + ')이 지워집니다. 새로 시작할까요?<div class="fbtn"><button class="b red" type="button" id="mGo2">새로 시작</button><button class="b" type="button" id="mNo">취소</button></div></div>'
        : '<button class="btn red wide" type="button" id="mGo" style="margin-top:14px">점검 시작' + ic('right', 17) + '</button>')
      + '<p class="muted" style="font-size:12px;margin:12px 2px 0">점검 내용은 이 휴대폰에 바로바로 저장돼요. 앱을 닫아도 「이어서 하기」로 돌아옵니다.</p>';
  } else {
    h += '<div class="lb">매장 찾기</div><div class="search"><span>' + ic('search', 17) + '</span><input id="f_mq" type="search" placeholder="매장명 (두 글자 이상 · 공백 무시)" value="' + esc(MQ) + '" autocomplete="off"></div>'
      + '<div id="mRes">' + milResults() + '</div>'
      + '<div class="lb">또는 조직으로 고르기</div><div id="mOrg">' + milOrg() + '</div>';
  }
  frame(h);
  $('mBack').onclick = () => { if (MSEL) { MSEL = ''; MASK = ''; render(); } else { MV = 'home'; render(); } window.scrollTo(0, 0); };
  const dt = $('f_mDate'); if (dt) dt.onchange = () => { if (dt.value) MDATE = dt.value; render(); };
  const q = $('f_mq'); if (q) { q.oninput = () => { MQ = q.value; $('mRes').innerHTML = milResults(); bindPick(); }; if (!MQ) setTimeout(() => q.focus(), 30); }
  if ($('mOther')) $('mOther').onclick = () => { MSEL = ''; MASK = ''; render(); };
  if ($('mGo')) $('mGo').onclick = () => { if (milGet()) { MASK = 'restart'; render(); } else milBegin(); };
  if ($('mGo2')) $('mGo2').onclick = milBegin;
  if ($('mNo')) $('mNo').onclick = () => { MASK = ''; render(); };
  bindPick(); bindOrg();
}
function storeLine(s) {
  const o = orgOf(s);
  return '<button type="button" class="ml" data-pick="' + esc(s.id) + '">' + ic('store', 17) + '<span>' + esc(s.name) + '<small>' + esc(o.dept + ' · ' + (s.team || '팀 없음') + ' · ' + s.type) + '</small></span>' + ic('right', 16) + '</button>';
}
function milResults() {
  const q = nk(MQ); if (q.length < 2) return '';
  const hit = liveStores().filter((s) => s.key.includes(q)).sort((a, b) => (a.key.indexOf(q) - b.key.indexOf(q)) || sortKo(a.name, b.name));
  return '<div class="mlist">' + (hit.length ? hit.slice(0, 30).map(storeLine).join('') + (hit.length > 30 ? '<div class="muted" style="padding:9px 4px;font-size:12px">' + (hit.length - 30) + '개 더 있어요 · 더 길게 적어 주세요</div>' : '') : '<div class="muted" style="padding:10px 4px">찾는 매장이 없습니다</div>') + '</div>';
}
/* D1.6 조직으로 고르기 = 왼쪽 접었다 펴는 목록 + 오른쪽 바로 아래 단계 (팀원 관리와 같은 두 칸)
   MORG = 지금 고른 곳 { division, dept, team } · 왼쪽 · 오른쪽 모두 이 값 하나로 그림 */
let MPATHS = [];
function milOrg() {
  const L = liveStores().map((s) => ({ s, o: orgOf(s), t: s.team || '팀 없음' }));
  const uniq = (a) => [...new Set(a)].sort(sortKo), { division: dv, dept: dp, team: tm } = MORG;
  const divs = uniq(L.map((x) => x.o.division));
  const deptsOf = (v) => uniq(L.filter((x) => x.o.division === v).map((x) => x.o.dept));
  const teamsOf = (v, d) => uniq(L.filter((x) => x.o.division === v && x.o.dept === d).map((x) => x.t));
  const n = (f) => L.filter(f).length.toLocaleString();
  MPATHS = []; const P = (p) => { MPATHS.push(p); return MPATHS.length - 1; };
  /* 왼쪽 */
  const sd = (cls, icon, label, cnt, on, path) => '<button type="button" class="sd ' + cls + (on ? ' on' : '') + '" data-p="' + P(path) + '">' + ic(icon, 13) + '<span>' + esc(label) + '</span><span class="n">' + cnt + '</span></button>';
  let side = sd('', 'folder', '전체', n(() => true), !dv, {});
  divs.forEach((v) => {
    const op = dv === v; side += sd('', op ? 'down' : 'right', v, n((x) => x.o.division === v), op && !dp, { division: v });
    if (op) deptsOf(v).forEach((d) => {
      const od = dp === d; side += sd('d1', od ? 'down' : 'right', d, n((x) => x.o.division === v && x.o.dept === d), od && !tm, { division: v, dept: d });
      if (od) teamsOf(v, d).forEach((t) => { side += sd('d2', 'folder', t, n((x) => x.o.division === v && x.o.dept === d && x.t === t), tm === t, { division: v, dept: d, team: t }); });
    });
  });
  /* 오른쪽 */
  const fo = (label, cnt, path) => '<button type="button" class="ml" data-p="' + P(path) + '">' + ic('folder', 17) + '<span>' + esc(label) + '</span><span class="n">' + cnt + '</span>' + ic('right', 16) + '</button>';
  let crumb = '', title, items;
  if (!dv) { title = '영업부문'; items = divs.map((v) => fo(v, n((x) => x.o.division === v), { division: v })).join(''); }
  else if (!dp) { title = dv; items = deptsOf(dv).map((d) => fo(d, n((x) => x.o.division === dv && x.o.dept === d), { division: dv, dept: d })).join(''); }
  else if (!tm) { crumb = dv + ' ›'; title = dp; items = teamsOf(dv, dp).map((t) => fo(t, n((x) => x.o.division === dv && x.o.dept === dp && x.t === t), { division: dv, dept: dp, team: t })).join(''); }
  else {
    crumb = dv + ' › ' + dp + ' ›'; title = tm;
    const st = L.filter((x) => x.o.division === dv && x.o.dept === dp && x.t === tm).map((x) => x.s).sort((a, b) => sortKo(a.name, b.name));
    items = st.map((s) => '<button type="button" class="ml" data-pick="' + esc(s.id) + '">' + ic('store', 17) + '<span>' + esc(s.name) + '<small>' + esc(s.type) + '</small></span>' + ic('right', 16) + '</button>').join('');
    title += ' <span class="cnt">매장 ' + st.length + '곳</span>';
  }
  return '<div class="two"><nav class="side" aria-label="조직">' + side + '</nav><section class="omain">'
    + (crumb ? '<div class="crumb">' + esc(crumb) + '</div>' : '') + '<div class="ttl">' + (tm ? esc(tm) + title.slice(tm.length) : esc(title)) + '</div>'
    + '<div class="mlist" style="margin-top:6px">' + (items || '<div class="muted" style="padding:10px">매장이 없습니다</div>') + '</div></section></div>';
}
function bindPick() { document.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { MSEL = b.dataset.pick; MASK = ''; render(); window.scrollTo(0, 0); }); }
function bindOrg() {
  document.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => {
    const p = MPATHS[+b.dataset.p] || {};
    MORG = { division: p.division || '', dept: p.dept || '', team: p.team || '' };
    $('mOrg').innerHTML = milOrg(); bindOrg(); bindPick();
  });
}
/* 점검 시작: 기다릴 것이 없어 바로 다음 화면으로 (사고이력 조회는 5단계에서) */
function milBegin() {
  const s = SD.stores.find((x) => x.id === MSEL); if (!s) return;
  const o = orgOf(s), old = milGet();
  if (old && typeof PH !== 'undefined') PH.clear(old.id);   // 지운 점검의 사진도 같이 지움
  const cur = { id: newId('I'), date: MDATE, startedAt: now(), screen: 'work',
    store: { id: s.id, name: s.name, team: s.team, dept: o.dept, division: o.division, type: s.type },
    inspector: { email: ME.email, name: ME.name, title: ME.title || '' } };
  if (!milPut(cur)) return;
  MASK = ''; MV = 'work'; render(); window.scrollTo(0, 0);
}

/* 점검 화면 (milWork) 은 insp.js (D1.7~) */
