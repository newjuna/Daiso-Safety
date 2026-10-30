/* 다이소 안전 · 매장 밀착지원 사고조사 · 조치확인 (D2.0)
 * 사고조사: 점검 시작 때 중계가 사고 원장(구글 시트 「원본DB」)에서 그 매장 사고를 읽어 옴 (기간 제한 없음 · 출퇴근 재해 제외 · v4 와 같음)
 *          → 점검 맨 앞 섹션 · 한 건마다 확인함/확인 못함 · 미조치/조치완료 · 현재 상태 사진+내용 · (조치완료면) 조치 후 사진*+조치내용
 * 조치확인: 그 매장의 가장 최근 제출 점검(Firebase INSPECTIONS)에 남은 미조치 지적(openNext)을 가져옴 → 맨 뒤 섹션
 *          이번에도 미조치면 이번 기록의 openNext 로 다시 넘어감 (예전 점검 문서는 고치지 않음)
 * 자동 문구 · 위험등급 · 완료 기준 · 점수는 v4 그대로 (inferAccidentHazard · accidentActionDraft · taskActionDraft · isAccidentDone · scoreAccident)
 */
Object.assign(ICON, { link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>' });

/* ---------- 불러오기 ---------- */
const driveId = (u) => { const m = /\/d\/([\w-]{10,})|[?&]id=([\w-]{10,})/.exec(String(u || '')); return m ? (m[1] || m[2]) : ''; };
async function storeAccidents(name) { const r = await relay('accidents', { store: name }); return Array.isArray(r.list) ? r.list : []; }
/* 가장 최근 제출 점검의 미조치 지적 · D1.8~1.9 기록(openNext 없음)은 지적사항으로 만듦 */
async function openIssuesOf(storeId) {
  if (!storeId) return [];
  let q;
  try { q = await db.collection('INSPECTIONS').where('storeId', '==', storeId).get(); }
  catch (e) { throw new Error('지난 점검 기록을 읽지 못했습니다: ' + (e.message || e.code)); }
  const recs = q.docs.map((d) => d.data()).filter((r) => r.status === 'submitted').sort((a, b) => String(b.date + (b.submittedAt || '')).localeCompare(String(a.date + (a.submittedAt || ''))));
  const r = recs[0]; if (!r) return [];
  if (Array.isArray(r.openNext)) return r.openNext;
  return (r.issues || []).filter((x) => x.group !== '기타사항' || x.detail === '개선과제 후보').map((x) => ({
    key: r.id + '|' + x.key, group: x.group, area: x.area, title: x.title, detail: x.detail, date: r.date, inspId: r.id, by: r.inspectorName || '',
    photos: (x.photos || []).map((u) => ({ id: driveId(u), url: u })).filter((p) => p.id)
  }));
}

/* ---------- v4 자동 문구 · 위험등급 ---------- */
function accHazard(a) {
  const t = [a.source, a.type, a.content].filter(Boolean).join(' '), lead = a.source ? a.source + ' 관련 작업 중 ' : '';
  const R = [[/작두|커터|칼날|커터칼|가위|절단|베임/, '손 베임·절단 사고 위험'], [/사다리|계단|발판|고소|추락|떨어/, '높은 곳 작업 중 떨어짐 사고 위험'], [/바닥|통로|단차|미끄|넘어|적재물/, '이동 중 미끄러짐·걸림·넘어짐 사고 위험'], [/전선|콘센트|멀티탭|분전|전기|감전/, '전기설비 접촉에 의한 감전·화재 위험'], [/롤테이너|대차|L카|문|매대|끼임|부딪/, '이동·취급 중 끼임·부딪힘 사고 위험'], [/박스|중량|운반|들어|허리|근골격/, '중량물 취급에 따른 근골격계 부담 위험'], [/낙하|맞음|떨어진|상부/, '물체 낙하에 의한 맞음 사고 위험'], [/화상|뜨거|고온/, '고온 물체 접촉에 의한 화상 위험']];
  for (const [re, s] of R) if (re.test(t)) return lead + s;
  return lead + (a.type ? a.type + ' 사고 재발 위험' : '사고 재발 위험');
}
const accRisk = (st, ap) => st === '조치완료' ? '하' : st === '미조치' ? '상' : ap === 'Y' ? '상' : '중';
function accDraft(x, st) {
  const t = [x.content, x.source, x.type, x.hazardText].filter(Boolean).join(' ');
  let a = '해당 유해위험요인을 제거하고 동일 사고가 재발하지 않도록 작업방법을 안내합니다.';
  if (/통로|적재|넘어|미끄/.test(t)) a = '통행로 적재물을 제거하고 지정 적치구역을 안내하여 이동 동선을 확보합니다.';
  else if (/사다리|계단|발판|추락|떨어/.test(t)) a = '안전한 발판·사다리 사용기준을 확인하고 상부작업 시 안전수칙을 재교육합니다.';
  else if (/낙하|맞음|상부/.test(t)) a = '상부 적재물을 제거·고정하고 낙하방지 적재기준을 재교육합니다.';
  else if (/전선|콘센트|멀티탭|감전|전기/.test(t)) a = '전선과 전기설비를 정리·보수하고 통행 및 사용 전 안전상태를 재확인합니다.';
  else if (/칼|커터|베임|절단/.test(t)) a = '노출형 칼날 사용을 중지하고 안전커터 사용방법을 재교육합니다.';
  return st === '미조치' ? a.replace(/합니다\.$/, '할 예정입니다.') : a;
}
function taskDraft(x, st) {
  const t = [x.title, x.detail].filter(Boolean).join(' ');
  let a = '지적된 상태를 개선하고 재발하지 않도록 작업방법을 안내했습니다.';
  if (/통로|적재|적치|넘어|미끄|바닥|단차/.test(t)) a = '통로 적재물을 제거하고 지정 적치구역으로 옮겨 통행로를 확보했습니다.';
  else if (/사다리|계단|발판|추락|떨어|고소|상부작업/.test(t)) a = '안전한 발판·사다리 사용기준을 확인하고 상부작업 절차를 재교육했습니다.';
  else if (/낙하|맞음|적재높이|상부/.test(t)) a = '상부 적재물을 정리·고정하고 적재높이 기준을 안내했습니다.';
  else if (/전선|콘센트|멀티탭|감전|전기|분전/.test(t)) a = '전선과 전기설비를 정리·보수하고 사용 전 점검방법을 안내했습니다.';
  else if (/칼|커터|베임|절단/.test(t)) a = '노출형 칼날 사용을 중지하고 안전커터로 교체했습니다.';
  else if (/근골격|중량|운반|허리|들어|하차|손으로|반복/.test(t)) a = '보조기구를 사용하도록 조치하고 중량물 취급 자세를 재교육했습니다.';
  else if (/보호구|안전모|미착용|장갑/.test(t)) a = '보호구를 지급·비치하고 착용상태를 확인했습니다.';
  else if (/소화기|소방|피난|비상|방화/.test(t)) a = '소방시설 상태를 정비하고 점검표를 부착했습니다.';
  else if (/끼임|부딪|대차|롤테이너|L카|문/.test(t)) a = '이동 동선을 정리하고 끼임·부딪힘 예방수칙을 안내했습니다.';
  return st === '미조치' ? a.replace(/했습니다\.$/, '할 예정입니다.') : a;
}
/* 점검 시작 때 한 번 만듦 */
function accBuild(list) {
  return (list || []).map((a, i) => ({ key: 'acc' + i, date: a.date || '', type: a.type || '사고', content: a.content || '', source: a.source || '', approved: a.approved || '', lostDays: a.lostDays || '',
    hazardText: accHazard(a), riskLevel: accRisk('', a.approved), status: '', actionText: '', beforeFiles: [], afterFiles: [], notObserved: false, confirmed: false, actEd: false }));
}
function taskBuild(list) {
  return (list || []).map((x, i) => Object.assign({}, x, { tkey: 'tk' + i, status: '', currentState: x.detail || x.title || '', actionText: '', afterFiles: [], notObserved: false, confirmed: false, actEd: false }));
}
const accDone = (x) => !!(x && x.confirmed && (x.notObserved || (x.hazardText && x.status && x.actionText && (x.status !== '조치완료' || x.afterFiles.length))));
const tkDone = (x) => !!(x && x.confirmed);

/* ---------- 화면 ---------- */
const stBadge = (x, done) => x.notObserved && done ? '<span class="ibg">확인 못함</span>' : x.status === '조치완료' && done ? '<span class="ibg g">조치완료</span>' : x.status === '미조치' && done ? '<span class="ibg r">미조치</span>' : done ? '' : '<span class="ibg">' + (x.status ? x.status + ' · 작성 중' : '확인 전') + '</span>';
function vAccident() {
  const L = IC.accidents, dn = L.filter(accDone).length;
  let h = '<div class="ih">사고조사<span class="ihn">' + L.length + '건</span><span class="ibg ' + (dn === L.length ? 'g' : 'r') + '">' + dn + ' / ' + L.length + ' 완료</span></div>'
    + '<div class="ihs">이 매장 사고 원장 기록이에요. 현장에서 재발 방지 조치가 됐는지 확인해 주세요. 카드를 누르면 펼쳐져요.</div>';
  h += L.map((x, i) => {
    const op = IC.accOpen === x.key, done = accDone(x);
    let c = '<div class="acx' + (op ? ' op' : '') + (done ? ' dn' : '') + '"><button type="button" class="ach" data-a="accOpen" data-v="' + i + '">' + ic('alert', 17) + '<span><b>' + esc(x.type) + '</b> · ' + esc(x.date || '-') + '<small>' + esc(x.source || '기인물 미등록') + (x.approved === 'Y' ? ' · 산재승인' : '') + '</small></span>' + stBadge(x, done) + ic(op ? 'down' : 'right', 15) + '</button>';
    if (!op) return c + '</div>';
    c += '<div class="acb"><div class="past"><b>과거 사고 내용</b>' + (x.lostDays ? ' · 근로손실 ' + esc(x.lostDays) + '일' : '') + '<br>' + esc(x.content || '등록된 사고내용이 없습니다.') + '</div>'
      + '<div class="lb">이번 방문 현장 확인</div><div class="seg">' + segB('accObs', i + '|0', !x.notObserved, '확인함') + segB('accObs', i + '|1', x.notObserved, '확인 못함', 'n') + '</div>';
    if (x.notObserved) c += '<div class="inote">이번 방문에는 확인하지 못한 것으로 기록해요. 점수 계산에서 빠지고, 다음 점검에 다시 나와요.</div>';
    else {
      c += '<div class="lb">조치 상태</div><div class="seg">' + segB('accSt', i + '|미조치', x.status === '미조치', '미조치', 'r') + segB('accSt', i + '|조치완료', x.status === '조치완료', '조치완료', 'g') + '</div>'
        + '<div class="lb">현재 상태 · 위험요인</div>' + strip('ac.' + i + '.before', x.beforeFiles) + '<textarea class="it" data-f="ah.' + i + '" placeholder="현재 상태 · 위험요인">' + esc(x.hazardText) + '</textarea>';
      if (x.status === '조치완료') c += '<div class="lb">조치 후 사진 <span class="req">*</span> · 조치 내용</div>' + strip('ac.' + i + '.after', x.afterFiles, '조치 후 사진 1장 이상') + '<textarea class="it" data-f="aa.' + i + '" placeholder="조치 내용">' + esc(x.actionText) + '</textarea>';
    }
    c += '<button type="button" class="btn red wide" data-a="accFin" data-v="' + i + '">' + (done ? '고친 내용 저장' : x.notObserved ? '확인 못함으로 완료' : '이 건 완료') + '</button></div>';
    return c + '</div>';
  }).join('');
  return { html: h, prev: null, next: { t: fixed() || '다음 · 작업점검', a: 'goSec', v: IC.fix ? 'submit' : 'work' } };
}
function vTasks() {
  const L = IC.tasks, dn = L.filter(tkDone).length;
  let h = '<div class="ih">조치확인<span class="ihn">' + L.length + '건</span><span class="ibg ' + (dn === L.length ? 'g' : 'r') + '">' + dn + ' / ' + L.length + ' 완료</span></div>'
    + '<div class="ihs">' + esc(L[0] ? dayKo(L[0].date) : '') + ' 점검에서 미조치였던 항목이에요. 이번에도 미조치면 다음 점검으로 넘어가요.</div>';
  h += L.map((x, i) => {
    const op = IC.tkOpen === x.tkey, done = tkDone(x);
    let c = '<div class="acx' + (op ? ' op' : '') + (done ? ' dn' : '') + '"><button type="button" class="ach" data-a="tkOpen" data-v="' + i + '">' + ic('book', 17) + '<span><b>' + esc(x.group || '') + '</b> · ' + esc(x.title) + '<small>' + esc(x.date) + (x.by ? ' · ' + esc(x.by) : '') + '</small></span>' + stBadge(x, done) + ic(op ? 'down' : 'right', 15) + '</button>';
    if (!op) return c + '</div>';
    c += '<div class="acb"><div class="past"><b>지난 내용</b> · ' + esc(x.area || '') + '<br>' + esc(x.detail || x.title) + '</div>'
      + ((x.photos || []).length ? '<div class="lb">지난 점검 사진 (누르면 드라이브에서 열려요)</div><div class="phs">' + x.photos.map((p) => '<a class="pht" href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="https://drive.google.com/thumbnail?id=' + encodeURIComponent(p.id) + '&sz=w300" alt="지난 사진" onerror="this.parentNode.classList.add(\'gone\');this.remove()"></a>').join('') + '</div>' : '')
      + '<div class="lb">이번 방문 현장 확인</div><div class="seg">' + segB('tkObs', i + '|0', !x.notObserved, '확인함') + segB('tkObs', i + '|1', x.notObserved, '확인 못함', 'n') + '</div>';
    if (x.notObserved) c += '<div class="inote">이번 방문에는 확인하지 못한 것으로 기록해요. 미조치로 다음 점검에 다시 나와요.</div>';
    else {
      c += '<div class="lb">조치 상태</div><div class="seg">' + segB('tkSt', i + '|미조치', x.status === '미조치', '미조치', 'r') + segB('tkSt', i + '|조치완료', x.status === '조치완료', '조치완료', 'g') + '</div>'
        + '<div class="lb">현재 상태</div><textarea class="it" data-f="ts.' + i + '" placeholder="현재 상태">' + esc(x.currentState) + '</textarea>';
      if (x.status === '조치완료') c += '<div class="lb">조치 후 사진 <span class="req">*</span> · 조치 내용</div>' + strip('tk.' + i + '.after', x.afterFiles, '조치 후 사진 1장 이상') + '<textarea class="it" data-f="ta.' + i + '" placeholder="조치 내용">' + esc(x.actionText) + '</textarea>';
    }
    c += '<button type="button" class="btn red wide" data-a="tkFin" data-v="' + i + '">' + (done ? '고친 내용 저장' : x.notObserved ? '확인 못함으로 완료' : '확인 완료') + '</button></div>';
    return c + '</div>';
  }).join('');
  return { html: h, prev: { t: '기타사항', a: 'goSec', v: 'other' }, next: { t: fixed() || '다음 · 제출 전 확인', a: 'goSec', v: 'submit' } };
}

/* ---------- 누를 때 (insp.js iTap 에서 넘어옴 · 처리했으면 true) ---------- */
function accTap(a, v) {
  const [si, val] = String(v || '').split('|'), i = Number(si);
  if (a === 'accOpen') { const x = IC.accidents[i]; IC.accOpen = IC.accOpen === x.key ? '' : x.key; return true; }
  if (a === 'tkOpen') { const x = IC.tasks[i]; IC.tkOpen = IC.tkOpen === x.tkey ? '' : x.tkey; return true; }
  if (a === 'accObs' || a === 'tkObs') {
    const x = (a === 'accObs' ? IC.accidents : IC.tasks)[i]; x.notObserved = val === '1'; x.confirmed = false;
    if (x.notObserved) x.status = a === 'accObs' ? '확인 못함' : '미조치'; else if (x.status === '확인 못함') x.status = '';
    return true;
  }
  if (a === 'accSt') { const x = IC.accidents[i]; x.status = val; x.notObserved = false; x.confirmed = false; x.riskLevel = accRisk(val, x.approved); if (!x.actEd) x.actionText = accDraft(x, val); return true; }
  if (a === 'tkSt') { const x = IC.tasks[i]; x.status = val; x.notObserved = false; x.confirmed = false; if (!x.actEd) x.actionText = taskDraft(x, val); return true; }
  if (a === 'accFin') {
    const x = IC.accidents[i];
    if (x.notObserved) { x.status = '확인 못함'; x.currentState = '이번 방문에는 현장 확인 못함'; }
    else {
      if (!x.status) { toast('조치 상태(미조치 · 조치완료)를 골라 주세요'); return false; }
      if (!String(x.hazardText).trim()) { toast('현재 상태를 적어 주세요'); return false; }
      if (!x.actionText) x.actionText = accDraft(x, x.status);
      if (x.status === '조치완료' && !x.afterFiles.length) { toast('조치 후 사진을 1장 이상 붙여 주세요'); return false; }
      x.currentState = x.hazardText;
    }
    x.confirmed = true; x.riskLevel = accRisk(x.status, x.approved);
    const nx = IC.accidents.find((y) => !accDone(y)); IC.accOpen = nx ? nx.key : '';
    if (!nx && IC.fix) IC.sec = 'submit';
    toast(nx ? '완료했어요 · 다음 건을 열었어요' : '사고조사를 모두 마쳤어요');
    return true;
  }
  if (a === 'tkFin') {
    const x = IC.tasks[i];
    if (!x.notObserved) {
      if (!x.status) { toast('조치 상태(미조치 · 조치완료)를 골라 주세요'); return false; }
      if (!String(x.currentState).trim()) { toast('현재 상태를 적어 주세요'); return false; }
      if (!x.actionText) x.actionText = taskDraft(x, x.status);
      if (x.status === '조치완료' && !x.afterFiles.length) { toast('조치 후 사진을 1장 이상 붙여 주세요'); return false; }
    } else x.status = '미조치';
    x.confirmed = true;
    const nx = IC.tasks.find((y) => !tkDone(y)); IC.tkOpen = nx ? nx.tkey : '';
    if (!nx && IC.fix) IC.sec = 'submit';
    toast(nx ? '완료했어요 · 다음 건을 열었어요' : '조치확인을 모두 마쳤어요');
    return true;
  }
  return false;
}
function accInp(k, i, v) {
  const x = (k === 'ah' || k === 'aa' ? IC.accidents : IC.tasks)[i]; if (!x) return false;
  if (k === 'ah') x.hazardText = v; else if (k === 'ts') x.currentState = v; else { x.actionText = v; x.actEd = true; }
  x.confirmed = false; return true;
}
function accFiles(k, i, which) {
  const x = (k === 'ac' ? IC.accidents : IC.tasks)[i]; if (!x) return null;
  const f = which === 'before' ? 'beforeFiles' : 'afterFiles'; x[f] = x[f] || []; x.confirmed = false; return x[f];
}

/* ---------- 점수 (v4 scoreAccident) · 보고서 · 기록 ---------- */
function scoreAccident() {
  const L = (IC.accidents || []).filter((a) => !a.notObserved && a.status !== '확인 못함');
  if (!L.length) return null;
  const R = MD.scoring.accidentStatusDeductionRate; let d = 0;
  L.forEach((a) => { const r = R[a.status] != null ? R[a.status] : 1; d += r * (100 / L.length); });
  return Math.max(0, Math.round(100 - d));
}
function accSnap(res) {
  return {
    accidents: (IC.accidents || []).map((x) => ({ date: x.date, type: x.type, content: x.content, source: x.source, approved: x.approved, hazardText: x.hazardText, status: x.status, currentState: x.currentState || '', riskLevel: x.riskLevel, actionText: x.actionText, beforePhotos: res(x.beforeFiles), afterPhotos: res(x.afterFiles), photos: res(x.afterFiles) })),
    /* 지난 점검 사진은 드라이브 사진이라 PDF 캡처에 못 넣음 (다른 주소 그림은 캡처가 막힘) · 이번 조치 후 사진만 */
    tasks: (IC.tasks || []).map((x) => ({ title: x.title, date: x.date, status: x.status, currentState: x.currentState || '', actionText: x.actionText || '', notObserved: !!x.notObserved, beforePhotos: [], afterPhotos: res(x.afterFiles) }))
  };
}
/* 다음 점검으로 넘길 미조치 (이번 새 지적 + 이번에도 미조치인 지난 지적) */
function openNextOf(rec) {
  const fresh = (rec.issues || []).filter((x) => x.group !== '기타사항' || x.detail === '개선과제 후보').map((x) => ({
    key: rec.id + '|' + x.key, group: x.group, area: x.area, title: x.title, detail: x.detail, date: rec.date, inspId: rec.id, by: rec.inspectorName,
    photos: (x.photos || []).map((u) => ({ id: driveId(u), url: u })).filter((p) => p.id)
  }));
  const carried = (IC.tasks || []).filter((t) => t.status !== '조치완료').map((t) => ({ key: t.key, group: t.group, area: t.area, title: t.title, detail: t.detail, date: t.date, inspId: t.inspId, by: t.by, photos: t.photos || [], carried: (t.carried || 0) + 1 }));
  return carried.concat(fresh);
}
