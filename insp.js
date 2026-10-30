/* 다이소 안전 · 매장 밀착지원 2단계 (D1.7) · 점검 화면 전체
 * 흐름: 작업점검 → 사다리 → 공통·시설 → 소방 → TBM → 의견청취 → 기타사항 → 제출 전 확인(누락 → 해결방안)
 * 문항 · 판정 기준(입고 인력부담 · TBM 스트레칭) · 누락 기준 · 해결방안 문구는 v4 그대로 (mil_data.js · solutions.js)
 * 점검 내용은 이 휴대폰(localStorage · 계정별)에, 사진은 휴대폰 사진 보관함(photo.js)에 바로바로 저장
 * 아직 안 붙인 것: 사고조사 · 조치확인(사고 원장 연결) · 제출(Firebase 저장 · 사진 올리기) · 보고서 PDF
 */
Object.assign(ICON, {
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M8 7h7"/>',
  slash: '<circle cx="12" cy="12" r="9"/><path d="M6 18L18 6"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  checkc: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  dotc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>',
  circle: '<circle cx="12" cy="12" r="9"/>'
});

const SEC = ['work', 'ladder', 'common', 'fire', 'tbm', 'voice', 'other'];
const NEED = ['work', 'ladder', 'common', 'fire', 'tbm', 'voice'];   // 꼭 마쳐야 제출되는 섹션 (기타사항은 선택)
const SNM = { work: '작업점검', ladder: '사다리', common: '공통·시설', fire: '소방', tbm: 'TBM', voice: '의견청취', other: '기타사항', submit: '제출 전 확인' };
/* 입고·하차 기본값 (v4 와 같음 · 흔한 값을 미리 넣고 눌러서 고침) */
const INB = { delivery: '오전', inboundStart: '07:00', inboundEnd: '09:00', inboundStaff: '3', inboundHelpers: '2', inboundHelperOutAt: '09:00', inboundBoxes: '200' };
const LVN = { good: '양호', minor: '위험(경미)', severe: '위험(심각)' }, LVC = { good: 'g', minor: 'w', severe: 'r' };
const LSW = { '구형 사다리(빨강)': '#dc2626', '구형 사다리(검정)': '#111827' };
const UI_ONLY = new Set(['toc', 'shut', 'guide', 'pview', 'askNo', 'vAsk', 'oAsk', 'quitAsk']);

let IC = null;      // 지금 점검 (화면이 고치는 원본 · 고칠 때마다 localStorage 에 씀)
let SUB = null;     // 제출 진행 중 { running, step, done, total, err } (submit.js)
let SHEET = '';     // 아래에서 올라오는 판: '' | 'toc' | 'guide' | 'pv:사진번호'
let IASK = '';      // 확인 중: 'quit' | 'worker' | 'other:id' | 'submit'
let SOLC = [], MISS = [], FLASH = 0;

function inspReset() { SHEET = ''; IASK = ''; if (SUB && !SUB.running) SUB = null; }
const goodIdx = (q) => (q[4] && q[4].length) ? q[4][0] : Math.max(0, q[1].findIndex((_, i) => !(q[3] || []).includes(i)));
/* 저장된 점검을 지금 모양으로 맞춤 (빠진 칸 채우기 · 좋은 답 미리 고르기) */
function inspNorm(c) {
  c.sec = c.sec || 'work'; c.wv = c.wv || 'list'; c.wi = Number.isInteger(c.wi) ? c.wi : 0;
  c.basic = Object.assign({ floors: '', hasStairs: '무', hasElevator: '무', hasEscalator: '무' }, INB, c.basic || {});
  c.wa = c.wa || {}; c.workNA = c.workNA || {}; c.workChecked = c.workChecked || {};
  MD.works.forEach((w, wi) => { c.wa[wi] = c.wa[wi] || {}; w[1].forEach((q, qi) => { if (!c.wa[wi][qi]) c.wa[wi][qi] = { oi: goodIdx(q), risk: false, files: [] }; }); });
  c.ladder = Object.assign({ counts: {}, typeStatus: {}, issues: [], status: '' }, c.ladder || {});
  ['common', 'fire', 'tbm'].forEach((k) => { c[k] = Object.assign({ issues: [], naItems: {}, status: '' }, c[k] || {}); });
  c.tbm = Object.assign({ confirmMethod: '직접참관', amTime: '08:00', pmTime: '13:45', photoFiles: [] }, c.tbm);
  c.workers = Array.isArray(c.workers) && c.workers.length ? c.workers : [{ answers: {} }];
  c.worker = Math.min(Math.max(0, c.worker || 0), c.workers.length - 1);
  c.others = Array.isArray(c.others) ? c.others : [];
  c.fixTexts = c.fixTexts || {}; c.fix = !!c.fix;
  return c;
}
function inspCur() { const s = milGet(); if (!s) { IC = null; return null; } if (!IC || IC.id !== s.id) IC = inspNorm(s); return IC; }
/* 밀착지원 첫 화면 「이어서 하기」에 쓰는 한 줄 */
function inspProgress(cur) {
  try {
    const c = inspNorm(JSON.parse(JSON.stringify(cur)));
    if (c.sec === 'submit') return '제출 전 확인 단계';
    if (c.sec === 'work') return '작업점검 ' + Object.keys(c.workChecked).length + ' / ' + MD.works.length + ' 진행';
    return SNM[c.sec] + ' 진행 중';
  } catch (e) { return ''; }
}
function flash() { const e = $('isv'); if (!e) return; e.classList.add('on'); clearTimeout(flash._t); flash._t = setTimeout(() => e.classList.remove('on'), 1100); }
function isave() { if (milPut(IC)) { FLASH = Date.now(); flash(); } }

/* ---------- 판정 계산 (v4 calcInboundLabor · calcTbmStretchGap 그대로) ---------- */
const toMin = (t) => { const m = /^(\d{2}):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
function labor(c) {
  c = c || IC; const b = c.basic, s = toMin(b.inboundStart), e = toMin(b.inboundEnd), staff = Number(b.inboundStaff), hp = Number(b.inboundHelpers) || 0;
  if (s == null || e == null || e <= s || !(staff > 0)) return null;
  const tot = e - s; let pm, gr = 0;
  if (hp > 0 && b.inboundHelperOutAt) {
    let ho = toMin(b.inboundHelperOutAt); if (ho == null) ho = e; ho = Math.max(s, Math.min(e, ho));
    pm = (staff + hp) * (ho - s) + staff * (e - ho); gr = (e - ho) / tot;
  } else pm = (staff + hp) * tot;
  const avg = pm / tot, cf = MD.scoring.inboundLabor; let level = 'good';
  if (avg < cf.minorAvgPeople || gr >= cf.severeGapRatio) level = 'severe';
  else if (avg < cf.goodAvgPeople || gr >= cf.minorGapRatio) level = 'minor';
  return { avgPeople: avg, gapRatio: gr, level, totalMin: tot };
}
function gap(c) {
  c = c || IC; const b = c.basic, t = c.tbm, s = toMin(b.inboundStart); if (s == null) return null;
  const ts = b.delivery === '오전' ? t.amTime : b.delivery === '오후(야간)' ? t.pmTime : (toMin(t.amTime) != null ? t.amTime : t.pmTime);
  const tm = toMin(ts); if (tm == null) return null;
  const g = tm - s, cf = MD.scoring.tbmStretchGap;   // 양수 = 입고가 TBM(스트레칭)보다 먼저 시작
  return { gapMinutes: g, level: g > cf.severeMinutes ? 'severe' : g > cf.minorMinutes ? 'minor' : 'good' };
}

/* ---------- 섹션 완료 · 누락 (v4 sectionDone · completionState 그대로) ---------- */
const isInb = (i) => MD.works[i] && MD.works[i][0] === '입고·하차';
const isTr = (i) => MD.works[i] && MD.works[i][0] === '운반·분류·합포';
const inbOk = () => Number(IC.basic.inboundBoxes) > 0, trOk = () => Number(IC.basic.floors) > 0;
const riskN = (i) => Object.values(IC.wa[i] || {}).filter((x) => x.risk).length;
const cnt = (t) => Math.max(0, Number(IC.ladder.counts[t] || 0));
const voiceDone = () => IC.workers.length > 0 && IC.workers.every((w) => MD.voice.every((_, i) => w.answers && w.answers[i]));
function secDone(k) {
  if (k === 'work') return MD.works.every((w, i) => IC.workNA[i] || (IC.workChecked[i] && !(isInb(i) && !inbOk()) && !(isTr(i) && !trOk())));
  if (k === 'ladder') return ['good', 'bad', 'na'].includes(IC.ladder.status);
  if (k === 'voice') return voiceDone();
  if (k === 'common' || k === 'fire' || k === 'tbm') return ['good', 'bad'].includes(IC[k].status);
  return false;
}
function missing() {
  const M = [];
  MD.works.forEach((w, wi) => {
    if (IC.workNA[wi]) return;
    const ib = isInb(wi) && !inbOk(), tr = isTr(wi) && !trOk();
    if (!IC.workChecked[wi] || ib || tr) M.push({ kind: 'work', wi, label: '작업점검 · ' + w[0] + (ib ? ' · 입고 물량' : tr ? ' · 층수' : '') });
  });
  if (!secDone('ladder')) M.push({ kind: 'ladder', label: '사다리' });
  ['common', 'fire', 'tbm'].forEach((k) => { if (!secDone(k)) M.push({ kind: k, label: SNM[k] }); });
  if (!voiceDone()) M.push({ kind: 'voice', label: '의견청취' });
  return M;
}

/* ---------- 해결방안 (v4 solutionItems · report.js improvementText 그대로) ---------- */
function solFor(f) {
  const T = window.SOLUTIONS; if (!T || !f) return null;
  if (f.category === '작업점검') return (f.area && f.question && f.title && T.work && T.work[f.area + '|' + f.question + '|' + f.title]) || null;
  if (f.category === '사다리') return (T.ladder && T.ladder[f.title]) || null;
  if (f.category === '공통·시설') return (T.common && T.common[f.title]) || null;
  if (f.category === '소방') return (T.fire && T.fire[f.title]) || null;
  return null;
}
function ruleText(f) {
  const t = f.title || '';
  if (f.category === '사다리') return '이상 사다리 사용 여부를 확인하고, 사용 전 발판·체결상태 점검 후 필요한 조치를 실시합니다.';
  if (f.category === '소방') return '소화기 등 소방설비 상태를 재확인하고 정기점검 및 유지관리 기준에 따라 조치합니다.';
  if (t.indexOf('안전모') >= 0) return '해당 작업 시 필요한 보호구 착용기준이 현장에서 준수되도록 안내·확인합니다.';
  if (t.indexOf('하차') >= 0) return '수작업 부담을 줄일 수 있도록 작업방법과 투입인원을 검토하고, 끼임 위험이 없도록 작업동선을 관리합니다.';
  if (t.indexOf('칼') >= 0 || t.indexOf('개봉') >= 0) return '노출형 칼날 사용을 중지하고 자동복귀형 안전칼 사용으로 전환합니다.';
  if (t.indexOf('발판') >= 0 || t.indexOf('사다리') >= 0) return '규격 발판·사다리만 사용하도록 하고 임시 발판은 현장에서 제거합니다.';
  if (t.indexOf('전선') >= 0 || t.indexOf('콘센트') >= 0 || t.indexOf('멀티탭') >= 0) return '전선을 고정·정리해 통행로를 확보하고 과부하 여부를 함께 확인합니다.';
  if (t.indexOf('적재') >= 0 || t.indexOf('통로') >= 0) return '통로 적재물을 제거하고 지정 적치구역을 운영해 통행 동선을 확보합니다.';
  if (f.category === '공통·시설') return '시설물의 이상상태를 확인하고 사용 전 안전상태가 유지되도록 보수·정리합니다.';
  if (f.category === '기타사항') return '확인된 특이사항의 위험 노출을 줄이도록 현장 조치 후 재확인합니다.';
  return '해당 위험요인을 제거하거나 노출을 줄일 수 있도록 현장 조치 후 재확인합니다.';
}
const autoText = (f) => solFor(f) || ruleText(f || {});
/* 지적사항 목록 · key 는 나중에 보고서가 같은 항목을 찾는 값이라 규칙을 바꾸면 보고서도 같이 바꿀 것
   TBM · 의견청취는 넣지 않음 (보고서 그 장에 해결방안 자리가 없음 · v4 2026-10-06 확정) */
function solItems() {
  const out = [];
  MD.works.forEach((w, wi) => {
    if (IC.workNA[wi]) return;
    w[1].forEach((q, qi) => {
      const a = IC.wa[wi][qi]; if (!a || !a.risk) return;
      const pk = q[1][a.oi] || q[0];
      out.push({ key: 'w:' + wi + ':' + qi, group: '작업점검', area: w[0], title: q[0], detail: pk, files: a.files, ctx: { category: '작업점검', area: w[0], question: q[0], title: pk } });
    });
  });
  IC.ladder.issues.forEach((x) => { const t = x.type || x.typeKey || '사다리', it = x.item || '이상사항'; out.push({ key: 'ladder:' + t + '|' + it, group: '사다리', area: t, title: it, detail: x.note || '떨어짐 위험', files: x.files, ctx: { category: '사다리', area: t, title: it } }); });
  [['common', '공통·시설'], ['fire', '소방']].forEach(([k, g]) => IC[k].issues.forEach((x) => out.push({ key: k + ':' + x.item, group: g, area: g, title: x.item, detail: x.note || '현장에서 미흡 확인', files: x.files, ctx: { category: g, area: g, title: x.item } })));
  IC.others.forEach((x) => { if (!String(x.text || '').trim()) return; out.push({ key: 'other:' + x.id, group: '기타사항', area: '기타사항', title: x.text, detail: x.task ? '개선과제 후보' : '현장 확인 특이사항', files: x.files, ctx: { category: '기타사항', title: x.text } }); });
  return out;
}
const fixOf = (x) => { const v = IC.fixTexts[x.key]; return typeof v === 'string' && v.trim() ? v.trim() : autoText(x.ctx); };
const isEd = (k) => typeof IC.fixTexts[k] === 'string' && !!IC.fixTexts[k].trim();

/* ---------- 작은 조각 ---------- */
function getV(p) { const [a, k] = p.split('.'); return (a === 'b' ? IC.basic : IC.tbm)[k]; }
function setV(p, v) { const [a, k] = p.split('.'); (a === 'b' ? IC.basic : IC.tbm)[k] = v; }
function setNum(p, n) {
  setV(p, String(n));
  if (p === 'b.inboundHelpers') { if (n > 0 && !IC.basic.inboundHelperOutAt) IC.basic.inboundHelperOutAt = INB.inboundHelperOutAt; if (!n) IC.basic.inboundHelperOutAt = ''; }
}
const segB = (a, v, on, t, cls) => '<button type="button" class="' + (cls || '') + (on ? ' on' : '') + '" data-a="' + a + '" data-v="' + esc(v) + '">' + esc(t) + '</button>';
const seg = (p, opts) => '<div class="seg">' + opts.map((o) => segB('set', p + '=' + o, getV(p) === o, o)).join('') + '</div>';
function numF(p, label, unit, step, req) {
  return '<div class="ifr"><label>' + label + (req ? ' <span class="req">*</span>' : '') + '</label><div class="stp">'
    + '<button type="button" data-a="num" data-v="' + p + '" data-d="' + (-step) + '" aria-label="줄이기">−</button>'
    + '<input type="number" inputmode="numeric" min="0" data-n="' + p + '" value="' + esc(getV(p)) + '" aria-label="' + esc(label) + '">'
    + '<button type="button" data-a="num" data-v="' + p + '" data-d="' + step + '" aria-label="늘리기">+</button></div><span class="u">' + unit + '</span></div>';
}
/* 시각 = 시 · 5분 단위 두 칸 (v4: 휴대폰 기본 시각 휠은 분이 저절로 정해지는 문제가 있었음) */
function tsel(p) {
  const m = /^(\d{2})?:(\d{2})?$/.exec(getV(p) || '') || [], h = m[1] || '', mi = m[2] || '';
  let s = '<div class="tsel"><select data-t="' + p + '" data-p="h" aria-label="시"><option value="">시</option>';
  for (let i = 0; i < 24; i++) { const x = String(i).padStart(2, '0'); s += '<option value="' + x + '"' + (x === h ? ' selected' : '') + '>' + x + '시</option>'; }
  s += '</select><select data-t="' + p + '" data-p="m" aria-label="분"><option value="">분</option>';
  for (let i = 0; i < 60; i += 5) { const x = String(i).padStart(2, '0'); s += '<option value="' + x + '"' + (x === mi ? ' selected' : '') + '>' + x + '분</option>'; }
  return s + '</select>' + (h && !mi ? '<small class="muted">분까지 골라 주세요</small>' : '') + '</div>';
}
/* 사진 줄 · path = 사진 목록 위치 (w.작업.문항 / ld.이상ID / ck.섹션.이상ID / ot.기타ID / tbm) */
function strip(path, files, hint) {
  files = files || [];
  return '<div class="phs">' + files.map((f) => '<span class="pht"><img data-ph="' + esc(f.id) + '" data-a="pview" data-v="' + esc(f.id) + '" alt="사진"><button type="button" data-a="pdel" data-v="' + esc(path + '|' + f.id) + '" aria-label="사진 빼기">' + ic('x', 12) + '</button></span>').join('')
    + '<label class="pha">' + ic('camera', 19) + '<span>사진</span><input type="file" accept="image/*" multiple data-pp="' + esc(path) + '"></label>'
    + (!files.length && hint ? '<small>' + esc(hint) + '</small>' : files.length ? '<small>' + files.length + '장</small>' : '') + '</div>';
}
function filesAt(p) {
  const [k, a, b] = p.split('.'); let o = null;
  if (k === 'tbm') return IC.tbm.photoFiles;
  if (k === 'w') o = IC.wa[a] && IC.wa[a][b];
  else if (k === 'ld') o = IC.ladder.issues.find((x) => x.id === a);
  else if (k === 'ck') o = IC[a] && IC[a].issues.find((x) => x.id === b);
  else if (k === 'ot') o = IC.others.find((x) => x.id === a);
  if (!o) return null; o.files = o.files || []; return o.files;
}
const sheetWrap = (inner) => '<div class="ish" id="ish"><div class="ishd" role="dialog"><div class="grab"></div>' + inner + '</div></div>';
const fixed = () => IC.fix ? '확인 · 누락 목록으로' : '';

/* =====================================================================
   화면
   ===================================================================== */
function milWork() {
  if (!inspCur()) { MV = 'home'; return render(); }
  TITLE.store = IC.store.name;
  const k = IC.sec;
  const v = SUB ? vProgress() : k === 'work' ? (IC.wv === 'q' ? vWorkQ() : vWorkList()) : k === 'ladder' ? vLadder() : (k === 'common' || k === 'fire' || k === 'tbm') ? vCheck(k) : k === 'voice' ? vVoice() : k === 'other' ? vOther() : vSubmit();
  const sh = SUB ? '' : SHEET === 'toc' ? tocSheet() : SHEET === 'guide' ? guideSheet() : SHEET.indexOf('pv:') === 0 ? pvSheet(SHEET.slice(3)) : '';
  const fb = IC.fix && k !== 'submit' ? '<div class="ifix">' + ic('alert', 17) + '<span><b>누락 보완 중</b> · 이 화면을 마치면 누락 목록으로 돌아가요</span><button type="button" class="b sm" data-a="goSec" data-v="submit">목록</button></div>' : '';
  frame((SUB ? '' : secBar() + fb) + '<div class="ib">' + v.html + '</div>' + navBar(v.prev, v.next) + sh);
  const pg = document.querySelector('.page'); pg.onclick = iTap; pg.onchange = iChg; pg.oninput = iInp;
  PH.fill();
  if (Date.now() - FLASH < 700) flash();
}
function secBar() {
  const i = SEC.indexOf(IC.sec), dn = NEED.filter(secDone).length;
  return '<div class="isb"><b>' + SNM[IC.sec] + '</b><span class="n">' + (i >= 0 ? (i + 1) + '/' + SEC.length : '') + '</span><div class="pg" title="필수 ' + dn + '/' + NEED.length + ' 완료"><i style="width:' + Math.round(dn / NEED.length * 100) + '%"></i></div>'
    + '<button type="button" class="dd" data-a="toc">목차' + ic('down', 14) + '</button></div>';
}
function navBar(p, n) {
  const btn = (o, cls, l, r) => '<button type="button" class="b ' + cls + '" data-a="' + o.a + '"' + (o.v != null ? ' data-v="' + esc(o.v) + '"' : '') + (o.dis ? ' disabled' : '') + '>' + (l ? ic('left', 16) : '') + '<span>' + esc(o.t) + '</span>' + (r ? ic('right', 16) : '') + '</button>';
  return '<span class="isv" id="isv">' + ic('check', 12) + '저장됨</span><nav class="inav">'
    + (p ? btn(p, '', true) : '<button type="button" class="b" disabled>' + ic('left', 16) + '<span>이전</span></button>')
    + (n ? btn(n, 'red', false, true) : '') + '</nav>';
}

/* ---------- 작업점검 ---------- */
function vWorkList() {
  const rows = MD.works.map((w, i) => {
    const na = IC.workNA[i], ck = IC.workChecked[i], rk = riskN(i);
    const sc = na ? '<span class="sc na"></span>' : ck ? '<span class="sc dn">' + ic('check', 13) + '</span>' : '<span class="sc"></span>';
    const r = na ? '해당 없음' : ck && rk ? '위험 ' + rk : ck ? '확인' : w[1].length + '문항';
    return '<button type="button" class="wr' + (na ? ' na' : '') + '" data-a="wOpen" data-v="' + i + '">' + sc + '<span class="nm">' + esc(w[0]) + '</span><span class="r' + (ck && rk && !na ? ' rk' : '') + '">' + r + ic('right', 15) + '</span></button>';
  }).join('');
  const nx = MD.works.findIndex((w, i) => !IC.workNA[i] && !IC.workChecked[i]);
  return {
    html: '<div class="ih">작업점검<span class="ihn">작업 ' + MD.works.length + '종</span></div><div class="ihs">작업을 누르면 문항이 열려요. 좋은 답이 미리 골라져 있어서 현장과 다른 것만 바꾸면 돼요.</div><div class="wl">' + rows + '</div>',
    prev: null,
    next: nx >= 0 ? { t: (Object.keys(IC.workChecked).length ? '이어서 · ' : '시작 · ') + MD.works[nx][0], a: 'wOpen', v: nx } : { t: '다음 · 사다리', a: 'goSec', v: 'ladder' }
  };
}
function vWorkQ() {
  const wi = IC.wi, w = MD.works[wi], na = !!IC.workNA[wi], a = IC.wa[wi];
  let h = '<div class="ih">' + esc(w[0]) + '<span class="ihn">' + (wi + 1) + ' / ' + MD.works.length + '</span></div>'
    + '<div class="itools"><button type="button" class="b sm" data-a="guide">' + ic('book', 15) + '점검 가이드</button><button type="button" class="b sm' + (na ? ' on' : '') + '" data-a="wNA">' + ic(na ? 'check' : 'slash', 15) + '해당 작업 없음</button></div>';
  if (na) h += '<div class="inote"><b>' + esc(w[0]) + '</b> 작업은 이 매장에 없음으로 기록해요. 다시 누르면 문항이 돌아와요.</div>';
  else {
    if (isInb(wi)) h += inbCard();
    if (isTr(wi)) h += trCard();
    h += w[1].map((q, qi) => qHtml(wi, qi, q, a[qi])).join('');
  }
  const last = wi === MD.works.length - 1;
  return { html: h, prev: { t: '목록', a: 'wList' }, next: { t: fixed() || (last ? '다음 · 사다리' : '다음 · ' + MD.works[wi + 1][0]), a: 'wNext' } };
}
function qHtml(wi, qi, q, v) {
  const rs = q[3] || [];
  return '<div class="iq' + (v.risk ? ' rk' : '') + '"><p>' + (qi + 1) + '. ' + esc(q[0]) + '</p><div class="ops">'
    + q[1].map((o, oi) => '<button type="button" class="op' + (v.oi === oi ? ' on' : '') + (rs.includes(oi) ? ' rk' : '') + '" data-a="wPick" data-v="' + qi + '.' + oi + '"><span class="rd"></span><span class="ot">' + esc(o) + '</span>' + (v.oi === oi && rs.includes(oi) ? '<em>위험</em>' : '') + '</button>').join('')
    + '</div>' + (v.risk ? strip('w.' + wi + '.' + qi, v.files, '위험 장면을 찍어 두면 보고서에 실려요') : '') + '</div>';
}
function inbCard() {
  const b = IC.basic, hp = Number(b.inboundHelpers) > 0, r = labor();
  return '<div class="icard"><div class="hd">' + ic('truck', 18) + '입고 정보' + (r ? '<span class="ibg ' + LVC[r.level] + '">' + LVN[r.level] + '</span>' : '<span class="ibg">계산 전</span>') + '</div>'
    + '<div class="ifr"><label>입고 시간대</label>' + seg('b.delivery', ['오전', '오후(야간)']) + '</div>'
    + numF('b.inboundBoxes', '입고 물량', '박스', 10, true) + numF('b.inboundStaff', '임직원', '명', 1) + numF('b.inboundHelpers', '입고도우미', '명', 1)
    + '<div class="ifr"><label>입고 시작</label>' + tsel('b.inboundStart') + '</div><div class="ifr"><label>입고 종료</label>' + tsel('b.inboundEnd') + '</div>'
    + (hp ? '<div class="ifr"><label>도우미 퇴근</label>' + tsel('b.inboundHelperOutAt') + '</div>' : '')
    + '<div class="icalc">' + (r ? '평균 투입인원 <b>' + r.avgPeople.toFixed(1) + '명</b>' + (hp ? ' · 도우미 공백비율 ' + Math.round(r.gapRatio * 100) + '%' : ' · 입고도우미 없음') + ' → <b>' + LVN[r.level] + '</b>' : '입고 시작 · 종료 시각과 임직원 수를 넣으면 인력부담이 자동으로 계산돼요.') + '</div></div>';
}
function trCard() {
  return '<div class="icard"><div class="hd">' + ic('layers', 18) + '운반 작업공간</div>' + numF('b.floors', '작업공간 층수', '개 층', 1, true)
    + [['hasStairs', '계단'], ['hasElevator', 'E/V'], ['hasEscalator', 'E/S']].map(([f, t]) => '<div class="ifr"><label>' + t + '</label>' + seg('b.' + f, ['무', '유']) + '</div>').join('') + '</div>';
}
function wNext() {
  const wi = IC.wi, na = IC.workNA[wi];
  if (!na && isInb(wi) && !inbOk()) return toast('입고 물량(박스 수)을 넣어 주세요');
  if (!na && isTr(wi) && !trOk()) return toast('작업공간 층수를 넣어 주세요');
  IC.workChecked[wi] = { at: now(), status: na ? 'na' : 'checked' };
  if (IC.fix) IC.sec = 'submit';
  else if (wi < MD.works.length - 1) IC.wi = wi + 1;
  else { IC.sec = 'ladder'; IC.wv = 'list'; }
  isave(); render(); window.scrollTo(0, 0);
}

/* ---------- 사다리 ---------- */
function vLadder() {
  const L = IC.ladder, na = L.status === 'na', total = MD.ladderTypes.reduce((n, t) => n + cnt(t), 0);
  let h = '<div class="ih">사다리' + (total ? '<span class="ihn">총 ' + total + '개</span>' : '') + '</div><div class="ihs">가진 사다리를 유형별로 세어 넣고 상태를 골라요. 미흡이면 어떤 문제인지 체크해요.</div>'
    + '<div class="itools"><button type="button" class="b sm' + (na ? ' on' : '') + '" data-a="ldNone">' + ic(na ? 'check' : 'slash', 15) + '사다리 없음</button></div>';
  if (na) h += '<div class="inote">이 매장은 <b>사다리 없음</b>으로 기록했어요. 개수를 올리면 다시 바뀌어요.</div>';
  h += MD.ladderTypes.map(ldCard).join('');
  return { html: h, prev: { t: '작업점검', a: 'goSec', v: 'work' }, next: { t: fixed() || '다음 · 공통·시설', a: 'ldNext' } };
}
function ldCard(t) {
  const L = IC.ladder, n = cnt(t), st = L.typeStatus[t] || '', hr = MD.ladderHighRiskTypes[t];
  let h = '<div class="ld' + (n ? '' : ' off') + (st === 'bad' ? ' rk' : '') + '"><div class="lt"><span class="sw" style="background:' + (LSW[t] || '#d1d5db') + '"></span><span class="ln">' + esc(t) + (hr ? ' <span class="ibg r">고위험</span>' : '') + (n ? '' : '<small>없음</small>') + '</span>'
    + '<div class="stp"><button type="button" data-a="ldCnt" data-v="' + esc(t) + '" data-d="-1" aria-label="줄이기">−</button><b>' + n + '</b><button type="button" data-a="ldCnt" data-v="' + esc(t) + '" data-d="1" aria-label="늘리기">+</button></div></div>';
  if (n) {
    h += '<div class="seg" style="margin-top:9px">' + segB('ldSt', t + '|good', st === 'good', '양호', 'g') + segB('ldSt', t + '|bad', st === 'bad', '미흡', 'r') + '</div>';
    if (st === 'bad') h += '<div class="lis"><div class="ihs">어떤 문제인가요? (여러 개 고를 수 있어요)</div>' + MD.ladder.map(([nm, hint]) => {
      const f = L.issues.find((x) => x.typeKey === t && x.item === nm);
      return '<div class="lck"><label class="chk"><input type="checkbox" data-c="ldIss" data-v="' + esc(t + '|' + nm) + '"' + (f ? ' checked' : '') + '><span class="box">' + ic('check', 12) + '</span><b>' + esc(nm) + '</b>' + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</label>'
        + (f ? (nm === '기타사항' ? '<input class="it" data-f="ln.' + f.id + '" placeholder="어떤 이상인지 짧게" value="' + esc(f.note || '') + '">' : '') + strip('ld.' + f.id, f.files) : '') + '</div>';
    }).join('') + '</div>';
  }
  return h + '</div>';
}
function ldNext() {
  const L = IC.ladder, owned = MD.ladderTypes.filter((t) => cnt(t) > 0);
  if (!owned.length) return toast('사다리 개수를 넣거나 [사다리 없음]을 눌러 주세요');
  const unset = owned.filter((t) => !L.typeStatus[t]); if (unset.length) return toast(unset[0] + ' 상태(양호 · 미흡)를 골라 주세요');
  const bad = owned.filter((t) => L.typeStatus[t] === 'bad');
  for (const t of bad) if (!L.issues.some((x) => x.typeKey === t)) return toast(t + '의 문제 항목을 1개 이상 체크해 주세요');
  L.issues = L.issues.filter((x) => bad.includes(x.typeKey));
  L.types = owned; L.status = bad.length ? 'bad' : 'good'; L.checkedAt = now();
  toNext('ladder');
}

/* ---------- 공통·시설 / 소방 / TBM ---------- */
function vCheck(k) {
  const st = IC[k], list = MD[k], bad = st.issues.length, i = SEC.indexOf(k);
  let h = '<div class="ih">' + SNM[k] + '<span class="ihn">' + list.length + '문항</span>' + (bad ? '<span class="ibg r">미흡 ' + bad + '</span>' : '<span class="ibg g">모두 양호</span>') + '</div>'
    + '<div class="ihs">양호가 미리 골라져 있어요. 현장과 다른 항목만 미흡으로 바꿔 주세요.</div>'
    + (k !== 'tbm' ? '<div class="itools"><button type="button" class="b sm" data-a="guide">' + ic('book', 15) + '점검 가이드</button></div>' : '');
  if (k === 'tbm') h += tbmCard();
  h += list.map((it) => {
    const nm = typeof it === 'string' ? it : it.name, cond = typeof it === 'object' && it.conditional, f = st.issues.find((x) => x.item === nm), na = !!st.naItems[nm];
    return '<div class="ck' + (f ? ' rk' : '') + '"><p>' + esc(nm) + (cond ? '<small>해당 시설이 있을 때만</small>' : '') + '</p><div class="seg">'
      + segB('ck', k + '|' + nm + '|good', !f && !na, '양호', 'g') + segB('ck', k + '|' + nm + '|bad', !!f, '미흡', 'r') + (cond ? segB('ck', k + '|' + nm + '|na', na, '해당 없음', 'n') : '') + '</div>'
      + (f ? strip('ck.' + k + '.' + f.id, f.files, '미흡 장면을 찍어 주세요') : '') + '</div>';
  }).join('');
  return { html: h, prev: { t: SNM[SEC[i - 1]], a: 'goSec', v: SEC[i - 1] }, next: { t: fixed() || '다음 · ' + SNM[SEC[i + 1]], a: 'ckNext', v: k } };
}
function tbmCard() {
  const t = IC.tbm, g = gap(), dir = t.confirmMethod !== '인터뷰만';
  return '<div class="icard"><div class="hd">' + ic('users', 18) + 'TBM 확인 방법' + (g ? '<span class="ibg ' + LVC[g.level] + '">' + (g.level === 'good' ? '스트레칭 후 입고' : LVN[g.level]) + '</span>' : '') + '</div>'
    + '<div class="ifr">' + seg('t.confirmMethod', ['직접참관', '인터뷰만']) + '</div>'
    + '<div class="ihs" style="margin-top:5px">인터뷰만으로 확인하면 TBM 점수 인정 비율이 낮아져요.</div>'
    + '<div class="ifr"><label>오전 TBM</label>' + tsel('t.amTime') + '</div><div class="ifr"><label>오후 TBM</label>' + tsel('t.pmTime') + '</div>'
    + '<div class="icalc">' + (g ? (g.level === 'good' ? 'TBM(스트레칭)을 한 뒤에 입고작업을 시작했어요.' : 'TBM(스트레칭)보다 입고작업이 <b>' + g.gapMinutes + '분 먼저</b> 시작됐어요 · 스트레칭 없이 중량물 작업') : '작업점검의 입고 시작 시각과 TBM 시각이 있으면 자동으로 비교해요.') + '</div>'
    + (dir ? '<div class="lb" style="margin:12px 0 0">TBM 실시 사진</div>' + strip('tbm', t.photoFiles, 'TBM 하는 모습 · 보고서 요약에 실려요') : '') + '</div>';
}
function ckSet(k, nm, s) {
  const st = IC[k];
  if (s === 'bad') { delete st.naItems[nm]; if (!st.issues.some((x) => x.item === nm)) st.issues.push({ id: newId('C'), item: nm, note: '', files: [] }); }
  else { st.issues = st.issues.filter((x) => x.item !== nm); if (s === 'na') st.naItems[nm] = true; else delete st.naItems[nm]; }
}

/* ---------- 의견청취 (익명 · 첫 번째 보기가 미리 골라짐) ---------- */
function vVoice() {
  const W = IC.workers, i = IC.worker, w = W[i], qs = MD.voice;
  w.answers = w.answers || {}; let filled = false;
  qs.forEach((q, qi) => { if (!w.answers[qi]) { w.answers[qi] = { oi: 0 }; filled = true; } });
  if (filled) milPut(IC);
  const changed = qs.filter((q, qi) => w.answers[qi].oi > 0).length;
  let h = '<div class="ih">의견청취<span class="ihn">근로자 ' + W.length + '명</span></div><div class="ihs">이름 · 사번 · 업무구분은 받지 않아요(익명). 첫 번째 답이 미리 골라져 있으니 근로자가 다르게 답한 것만 바꿔 주세요.</div>'
    + '<div class="vws">' + W.map((x, j) => '<button type="button" class="vw' + (j === i ? ' on' : '') + '" data-a="vSel" data-v="' + j + '">근로자 ' + (j + 1) + '</button>').join('') + '<button type="button" class="vw" data-a="vAdd">' + ic('plus', 14) + '추가</button></div>'
    + '<div class="ih sub">근로자 ' + (i + 1) + (changed ? '<span class="ibg r">의견 ' + changed + '건</span>' : '<span class="ibg g">모두 양호</span>') + '</div>';
  h += qs.map((q, qi) => {
    const a = w.answers[qi];
    return '<div class="iq"><p>' + (qi + 1) + '. ' + esc(q[0]) + '</p><div class="ops row">' + q[1].map((o, oi) => '<button type="button" class="op' + (a.oi === oi ? ' on' : '') + (oi > 0 ? ' rk' : '') + '" data-a="vPick" data-v="' + qi + '.' + oi + '">' + esc(o) + '</button>').join('') + '</div>'
      + (q[1][a.oi] === '기타' ? '<input class="it" data-f="vt.' + qi + '" placeholder="기타 의견을 짧게" value="' + esc(a.text || '') + '">' : '') + '</div>';
  }).join('');
  h += '<button type="button" class="btn ghost wide" data-a="vAdd">' + ic('plus', 16) + '다음 근로자 의견 받기</button>';
  if (W.length > 1) h += IASK === 'worker' ? '<div class="ask">근로자 ' + (i + 1) + '의 응답을 지울까요?<div class="fbtn"><button class="b red" type="button" data-a="vDel">지우기</button><button class="b" type="button" data-a="askNo">취소</button></div></div>'
    : '<button type="button" class="b danger" style="margin-top:10px" data-a="vAsk">' + ic('trash', 15) + '근로자 ' + (i + 1) + ' 응답 지우기</button>';
  return { html: h, prev: { t: 'TBM', a: 'goSec', v: 'tbm' }, next: { t: fixed() || '다음 · 기타사항', a: 'vNext' } };
}

/* ---------- 기타사항 (선택 · 여러 건) ---------- */
function vOther() {
  let h = '<div class="ih">기타사항<span class="ihn">' + (IC.others.length ? IC.others.length + '건' : '선택') + '</span></div><div class="ihs">점검표에 없는 위험 · 건의사항이 있을 때만 적어요. 없으면 그냥 다음으로 가면 돼요.</div>';
  h += IC.others.map((x, j) => {
    const asking = IASK === 'other:' + x.id;
    return '<div class="oc"><div class="hd">기타사항 ' + (j + 1) + (asking ? '' : '<button type="button" class="b sm danger" data-a="oAsk" data-v="' + x.id + '">' + ic('trash', 14) + '지우기</button>') + '</div>'
      + (asking ? '<div class="ask">기타사항 ' + (j + 1) + '을 지울까요? 붙인 사진도 같이 빠져요.<div class="fbtn"><button class="b red" type="button" data-a="oDel" data-v="' + x.id + '">지우기</button><button class="b" type="button" data-a="askNo">취소</button></div></div>' : '')
      + '<textarea class="it" data-f="ot.' + x.id + '" placeholder="현장에서 확인한 내용을 적어 주세요">' + esc(x.text || '') + '</textarea>'
      + '<label class="chk"><input type="checkbox" data-c="oTask" data-v="' + x.id + '"' + (x.task ? ' checked' : '') + '><span class="box">' + ic('check', 12) + '</span>개선과제 후보로 올리기</label>'
      + strip('ot.' + x.id, x.files) + '</div>';
  }).join('');
  h += '<button type="button" class="btn ghost wide" data-a="oAdd">' + ic('plus', 16) + (IC.others.length ? '한 건 더' : '기타사항 추가') + '</button>';
  return { html: h, prev: { t: '의견청취', a: 'goSec', v: 'voice' }, next: { t: '다음 · 제출 전 확인', a: 'goSec', v: 'submit' } };
}

/* ---------- 제출 전 확인 → 해결방안 확인 ---------- */
function vSubmit() {
  IC.fix = false; MISS = missing();
  const pv = { t: '기타사항', a: 'goSec', v: 'other' };
  if (MISS.length) return {
    html: '<div class="ih">제출 전 확인</div><div class="ihs">아직 마치지 않은 점검이 <b>' + MISS.length + '개</b> 있어요. 누르면 그 화면으로 가고, 마치면 여기로 돌아와요.</div>'
      + '<div class="ms">' + MISS.map((m, j) => '<button type="button" data-a="missGo" data-v="' + j + '">' + ic('alert', 18) + '<span>' + esc(m.label) + '</span>' + ic('right', 16) + '</button>').join('') + '</div>',
    prev: pv, next: { t: '첫 항목부터 채우기', a: 'missGo', v: 0 }
  };
  SOLC = solItems();
  let h = '<div class="ih">해결방안 확인' + (SOLC.length ? '<span class="ibg r">지적 ' + SOLC.length + '건</span>' : '') + '</div>';
  if (!SOLC.length) h += '<div class="inote">미흡 · 위험으로 기록한 항목이 없어요. 해결방안을 적을 것이 없으니 바로 제출하면 돼요.</div>';
  else {
    h += '<div class="ihs">아래 문장이 결과보고서의 「위험요인에 관한 해결방안」으로 들어가요. 자동으로 만든 문구라 현장에 맞게 고쳐 주세요. 다 지우면 자동 문구로 돌아가요.</div>';
    let g = '';
    SOLC.forEach((x, j) => {
      if (x.group !== g) { h += '<div class="sg">' + esc(x.group) + '</div>'; g = x.group; }
      const ed = isEd(x.key);
      h += '<div class="sol' + (ed ? ' ed' : '') + '"><div class="hd">' + esc(x.area) + '<em>' + (ed ? '고침' : '자동 문구') + '</em></div><h4>' + esc(x.title) + '</h4><div class="fd2">' + esc(x.detail) + '</div>'
        + (x.files && x.files.length ? '<div class="phs">' + x.files.slice(0, 4).map((f) => '<span class="pht"><img data-ph="' + esc(f.id) + '" data-a="pview" data-v="' + esc(f.id) + '" alt="사진"></span>').join('') + (x.files.length > 4 ? '<small>+' + (x.files.length - 4) + '장</small>' : '') + '</div>' : '')
        + '<textarea class="it" data-f="fx.' + j + '" aria-label="해결방안">' + esc(fixOf(x)) + '</textarea>'
        + '<div class="rs"><button type="button" class="b sm" data-a="solReset" data-v="' + j + '">' + ic('undo', 14) + '자동 문구로 되돌리기</button></div></div>';
    });
  }
  h += '<div class="inote">[제출하기]를 누르면 사진이 구글 드라이브(다이소 안전 › 매장 밀착지원)에 올라가고, 점검 기록이 저장돼요. 점수는 제출 뒤 결과 화면에서 보여요.</div>';
  return { html: h, prev: pv, next: { t: '제출하기', a: 'submit' } };
}

/* ---------- 아래에서 올라오는 판 ---------- */
function secInfo(k) {
  if (k === 'work') return Object.keys(IC.workChecked).length + ' / ' + MD.works.length + ' 작업';
  if (k === 'ladder') { const t = MD.ladderTypes.reduce((n, x) => n + cnt(x), 0); return IC.ladder.status === 'na' ? '없음' : t ? '총 ' + t + '개' : ''; }
  if (k === 'common' || k === 'fire' || k === 'tbm') return IC[k].status ? (IC[k].issues.length ? '미흡 ' + IC[k].issues.length : '모두 양호') : MD[k].length + '문항';
  if (k === 'voice') return '근로자 ' + IC.workers.length + '명';
  if (k === 'other') return IC.others.length ? IC.others.length + '건' : '선택';
  return '';
}
function tocSheet() {
  const row = (k) => { const dn = secDone(k), on = IC.sec === k; return '<button type="button" class="tc' + (on ? ' on' : dn ? ' dn' : '') + '" data-a="goSec" data-v="' + k + '">' + ic(on ? 'dotc' : dn ? 'checkc' : 'circle', 19) + '<span>' + SNM[k] + '</span><span class="r">' + secInfo(k) + '</span></button>'; };
  return sheetWrap('<h3>점검 목차<button type="button" class="b sm" data-a="shut">닫기</button></h3>' + SEC.map(row).join('')
    + '<button type="button" class="btn red wide" data-a="goSec" data-v="submit">' + ic('send', 16) + '제출 전 확인으로</button>'
    + '<div class="tcx"><button type="button" class="tc" data-a="home">' + ic('home', 19) + '<span>밀착지원 처음으로</span><span class="r">점검은 그대로 저장</span></button>'
    + (IASK === 'quit' ? '<div class="ask">이 점검을 지울까요? 이 휴대폰에 저장된 내용과 사진이 모두 없어져요.<div class="fbtn"><button class="b red" type="button" data-a="quit">지우기</button><button class="b" type="button" data-a="askNo">취소</button></div></div>'
      : '<button type="button" class="tc dz" data-a="quitAsk">' + ic('trash', 19) + '<span>이 점검 그만두기</span></button>') + '</div>');
}
function guideSheet() {
  const k = IC.sec, li = (a) => a && a.length ? '<ul>' + a.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<span>해당 보기 없음</span>';
  const gg = (good, bad) => '<div class="gg"><div class="g"><h5>양호</h5>' + li(good) + '</div><div class="r"><h5>미흡 · 위험</h5>' + li(bad) + '</div></div>';
  let t, body;
  if (k === 'work') {
    const w = MD.works[IC.wi]; t = w[0];
    body = w[1].map((q, qi) => {
      const rs = q[3] || [], gd = q[4] || [], etc = q[1].filter((o, i) => !rs.includes(i) && !gd.includes(i));
      return '<div class="gi"><b>' + (qi + 1) + '. ' + esc(q[0]) + '</b>' + gg(q[1].filter((o, i) => gd.includes(i)), q[1].filter((o, i) => rs.includes(i)))
        + (etc.length ? '<div class="gn">참고 · ' + esc(etc.join(' / ')) + '</div>' : '') + ((q[2] || []).length ? '<div class="gn">관련 재해유형 · ' + esc(q[2].join(' / ')) + '</div>' : '') + '</div>';
    }).join('');
  } else {
    t = SNM[k]; const G = (MD.guides || {})[k] || {};
    body = MD[k].map((it, i) => { const nm = typeof it === 'string' ? it : it.name, g = G[nm] || {}; return '<div class="gi"><b>' + (i + 1) + '. ' + esc(nm) + '</b>' + gg(g.good, g.bad) + (g.note ? '<div class="gn">' + esc(g.note) + '</div>' : '') + '</div>'; }).join('');
  }
  return sheetWrap('<h3>' + esc(t) + ' 점검 가이드<button type="button" class="b sm" data-a="shut">닫기</button></h3><div class="ihs">현장이 「미흡 · 위험」에 해당할 때만 답을 바꿔 주세요.</div>' + body);
}
const pvSheet = (id) => '<div class="pvw" id="ish"><img data-ph="' + esc(id) + '" alt="사진 크게 보기"><button type="button" data-a="shut" aria-label="닫기">' + ic('x', 22) + '</button></div>';

/* =====================================================================
   누를 때 · 고칠 때 (화면 전체에 한 번만 걸어 둠)
   ===================================================================== */
function toNext(k) {
  if (IC.fix) IC.sec = 'submit';
  else { IC.sec = SEC[SEC.indexOf(k) + 1] || 'submit'; if (IC.sec === 'work') IC.wv = 'list'; }
  IASK = ''; isave(); render(); window.scrollTo(0, 0);
}
function iTap(e) {
  if (e.target.id === 'ish') { SHEET = ''; if (IASK === 'quit') IASK = ''; return render(); }
  const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
  const a = el.dataset.a, v = el.dataset.v, d = Number(el.dataset.d || 0);
  let top = false;
  switch (a) {
    case 'toc': SHEET = 'toc'; IASK = ''; break;
    case 'shut': SHEET = ''; if (IASK === 'quit') IASK = ''; break;
    case 'guide': SHEET = 'guide'; break;
    case 'pview': SHEET = 'pv:' + v; break;
    case 'askNo': IASK = ''; break;
    case 'goSec': IC.sec = v; if (v === 'work') IC.wv = 'list'; IC.fix = false; SHEET = ''; IASK = ''; top = true; break;
    case 'wList': IC.wv = 'list'; top = true; break;
    case 'wOpen': IC.sec = 'work'; IC.wv = 'q'; IC.wi = Number(v); top = true; break;
    case 'wNA': IC.workNA[IC.wi] = !IC.workNA[IC.wi]; delete IC.workChecked[IC.wi]; break;
    case 'wPick': { const [qi, oi] = v.split('.').map(Number), q = MD.works[IC.wi][1][qi], o = IC.wa[IC.wi][qi]; o.oi = oi; o.risk = (q[3] || []).includes(oi); break; }
    case 'wNext': return wNext();
    case 'set': { const p = v.indexOf('='); setV(v.slice(0, p), v.slice(p + 1)); break; }
    case 'num': setNum(v, Math.max(0, (Number(getV(v)) || 0) + d)); break;
    case 'ldCnt': {
      const L = IC.ladder, b = cnt(v), n = Math.max(0, b + d); L.counts[v] = n; L.status = '';
      if (!n) { delete L.typeStatus[v]; L.issues = L.issues.filter((x) => x.typeKey !== v); } else if (!b) L.typeStatus[v] = L.typeStatus[v] || 'good';
      break;
    }
    case 'ldSt': { const [t, s] = v.split('|'), L = IC.ladder; L.typeStatus[t] = s; L.status = ''; if (s !== 'bad') L.issues = L.issues.filter((x) => x.typeKey !== t); break; }
    case 'ldNone': {
      const L = IC.ladder; if (L.status === 'na') { L.status = ''; break; }
      L.counts = {}; L.typeStatus = {}; L.issues = []; L.types = []; L.status = 'na'; L.checkedAt = now(); return toNext('ladder');
    }
    case 'ldNext': return ldNext();
    case 'ck': { const p = v.split('|'); ckSet(p[0], p[1], p[2]); break; }
    case 'ckNext': IC[v].status = IC[v].issues.length ? 'bad' : 'good'; IC[v].checkedAt = now(); return toNext(v);
    case 'vSel': IC.worker = Number(v); IASK = ''; top = true; break;
    case 'vAdd': IC.workers.push({ answers: {} }); IC.worker = IC.workers.length - 1; IASK = ''; top = true; toast('근로자 ' + IC.workers.length + '의 의견을 받아요'); break;
    case 'vPick': { const [qi, oi] = v.split('.').map(Number), w = IC.workers[IC.worker], old = w.answers[qi] || {}; w.answers[qi] = { oi, text: old.text || '' }; break; }
    case 'vAsk': IASK = 'worker'; break;
    case 'vDel': IC.workers.splice(IC.worker, 1); IC.worker = Math.max(0, IC.worker - 1); IASK = ''; break;
    case 'vNext': return toNext('voice');
    case 'oAdd': IC.others.push({ id: newId('O'), text: '', task: false, files: [] }); break;
    case 'oAsk': IASK = 'other:' + v; break;
    case 'oDel': { const o = IC.others.find((x) => x.id === v); if (o && o.files) PH.del(o.files.map((f) => f.id)); IC.others = IC.others.filter((x) => x.id !== v); IASK = ''; break; }
    case 'pdel': {
      const p = v.lastIndexOf('|'), id = v.slice(p + 1), L = filesAt(v.slice(0, p));
      if (L) { const j = L.findIndex((f) => f.id === id); if (j >= 0) L.splice(j, 1); }
      PH.del([id]); break;
    }
    case 'missGo': { const m = MISS[Number(v)]; if (!m) return; IC.fix = true; IC.sec = m.kind; if (m.kind === 'work') { IC.wv = 'q'; IC.wi = m.wi; } top = true; break; }
    case 'solReset': { const x = SOLC[Number(v)]; if (x) delete IC.fixTexts[x.key]; toast('자동 문구로 되돌렸어요'); break; }
    case 'submit': case 'subRetry': return submitRun();
    case 'subBack': SUB = null; delete IC.pdf; IC.sec = 'submit'; top = true; break;   // 점검을 고치면 보고서를 새로 만들어야 함
    case 'subNoPdf': if (SUB) SUB.skipPdf = true; return submitRun();
    case 'home': SHEET = ''; IASK = ''; MV = 'home'; render(); return window.scrollTo(0, 0);
    case 'quitAsk': IASK = 'quit'; break;
    case 'quit': { const id = IC.id; milPut(null); PH.clear(id); IC = null; SHEET = ''; IASK = ''; MV = 'home'; toast('점검을 지웠습니다'); render(); return window.scrollTo(0, 0); }
    default: return;
  }
  if (!UI_ONLY.has(a)) isave();
  render(); if (top) window.scrollTo(0, 0);
}
function iChg(e) {
  const el = e.target, ds = el.dataset;
  if (ds.pp) return addPhotos(ds.pp, el);
  if (ds.t) {
    const m = /^(\d{2})?:(\d{2})?$/.exec(getV(ds.t) || '') || [], h = ds.p === 'h' ? el.value : (m[1] || ''), mi = ds.p === 'm' ? el.value : (m[2] || '');
    setV(ds.t, h || mi ? h + ':' + mi : ''); isave(); return render();
  }
  if (ds.n) { setNum(ds.n, Math.max(0, Math.round(Number(el.value) || 0))); isave(); return render(); }
  if (ds.c === 'ldIss') {
    const [t, nm] = ds.v.split('|'), L = IC.ladder; L.status = '';
    if (el.checked) { if (!L.issues.some((x) => x.typeKey === t && x.item === nm)) L.issues.push({ id: newId('L'), typeKey: t, type: t, item: nm, note: '', files: [] }); }
    else L.issues = L.issues.filter((x) => !(x.typeKey === t && x.item === nm));
    isave(); return render();
  }
  if (ds.c === 'oTask') { const o = IC.others.find((x) => x.id === ds.v); if (o) o.task = el.checked; isave(); return render(); }
}
function iInp(e) {
  const el = e.target, f = el.dataset.f; if (!f) return;
  const p = f.indexOf('.'), k = f.slice(0, p), id = f.slice(p + 1), v = el.value;
  if (k === 'ot') { const o = IC.others.find((x) => x.id === id); if (o) o.text = v; }
  else if (k === 'ln') { const o = IC.ladder.issues.find((x) => x.id === id); if (o) o.note = v; }
  else if (k === 'vt') { const a = IC.workers[IC.worker].answers[Number(id)]; if (a) a.text = v; }
  else if (k === 'fx') { const x = SOLC[Number(id)]; if (x) { const t = v.trim(); if (t) IC.fixTexts[x.key] = t; else delete IC.fixTexts[x.key]; } }
  else return;
  isave();
}
async function addPhotos(path, input) {
  const fl = [...(input.files || [])]; input.value = ''; if (!fl.length) return;
  toast('사진 ' + fl.length + '장 저장 중…');
  try {
    const metas = await PH.add(IC.id, fl), L = filesAt(path);
    if (!L) { PH.del(metas.map((m) => m.id)); return; }
    L.push(...metas); isave(); render();
    toast(metas.length ? '사진 ' + metas.length + '장을 붙였어요' : '사진 파일이 아니에요');
  } catch (err) { toast('사진을 저장하지 못했어요: ' + (err.message || err)); }
}
