/* 다이소 안전 · 매장 밀착지원 제출 (D1.8 · D1.9 보고서)
 * [제출하기] → ① 사진 올리기 (한 장씩 · Apps Script 중계 → 구글 드라이브)
 *            → ② 결과보고서 PDF (rpt.js · 휴대폰에서 만들어 같은 폴더에 「0 결과보고서 …pdf」)
 *            → ③ 점검 기록 저장 (Firebase INSPECTIONS/점검ID · 답 · 사진 링크 · 해결방안 · 점수 · 보고서 링크)
 *            → ④ 마무리 (휴대폰에 둔 사진 · 진행 중 점검 지우기) → 결과 화면 (점수는 여기서 처음 보여 줌)
 * 중간에 끊기면 [다시 시도] = 멈춘 곳부터 (올라간 사진은 IC.up 에 적어 둬서 다시 안 올림)
 * 점수 계산은 v4 scoreSummary 그대로 (D2.0 사고 배점 포함 · 확인한 사고가 없으면 작업점검으로 옮김)
 */
let LAST = null;   // 결과 화면에 보여 줄 것 (앱을 닫으면 사라짐 · 기록은 Firebase 에 있음)

/* ---------- 점수 (v4 그대로) ---------- */
function hazW(h) { const m = MD.scoring.hazardMultiplier; return m[h] != null ? m[h] : MD.scoring.hazardMultiplierDefault; }
const itemW = (hz) => Math.max(...(hz && hz.length ? hz : ['기타']).map(hazW));
function scoreWork() {
  let rs = 0, tot = 0;
  MD.works.forEach((w, wi) => { if (IC.workNA[wi]) return; w[1].forEach((q, qi) => { tot += 1; if (IC.wa[wi][qi].risk) rs += itemW(q[2]); }); });
  const lb = labor(); if (lb) { tot += 1; if (lb.level !== 'good') rs += hazW('근골격계') * (lb.level === 'severe' ? 1.3 : 1); }
  const g = gap(); if (g) { tot += 1; if (g.level !== 'good') rs += hazW('근골격계') * (g.level === 'severe' ? 1.3 : 1); }
  return tot ? Math.max(0, Math.round((1 - rs / tot) * 100)) : 100;
}
function scoreList(list, issues, na) {
  const tot = list.filter((it) => !(na && na[typeof it === 'string' ? it : it.name])).length;
  return tot ? Math.max(0, Math.round((1 - issues.length / tot) * 100)) : 100;
}
function scoreLadder() {
  const n = IC.ladder.issues.length;
  const slots = Math.max(1, MD.ladderTypes.reduce((s, t) => s + (cnt(t) > 0 ? MD.ladder.length : 0), MD.ladder.length));
  let base = Math.max(0, Math.round((1 - n / slots) * 100));
  if (n && MD.ladderTypes.some((t) => MD.ladderHighRiskTypes[t] && cnt(t) > 0)) base = Math.max(0, Math.round(base - (100 - base) * (MD.scoring.ladderHighRiskMultiplier - 1)));
  return base;
}
function scoreTbm() { const c = MD.scoring.tbmConfidence[IC.tbm.confirmMethod || '직접참관']; return Math.round(scoreList(MD.tbm, IC.tbm.issues, IC.tbm.naItems) * (c != null ? c : 1)); }
function scoreAll() {
  const w = Object.assign({}, MD.scoring.categoryWeights);
  const parts = { work: scoreWork(), ladder: scoreLadder(), common: scoreList(MD.common, IC.common.issues, IC.common.naItems), fire: scoreList(MD.fire, IC.fire.issues, IC.fire.naItems), tbm: scoreTbm() };
  /* D2.0 사고 배점: 확인한 사고가 있으면 사용 · 없거나 전부 확인 못함이면 v4 처럼 작업점검으로 옮김 */
  const acc = scoreAccident();
  if (acc == null) { w.work += w.accident; w.accident = 0; } else parts.accident = acc;
  let tot = 0, ws = 0; Object.keys(parts).forEach((k) => { if (!w[k]) return; tot += parts[k] * w[k]; ws += w[k]; });
  const score = Math.round(tot / ws);
  return { score, grade: score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D', parts, weights: w, hasAccident: acc != null };
}

/* ---------- 올릴 사진 목록 (지금 화면에 살아 있는 사진만 · 파일 이름 = 순서 번호 · 섹션 · 항목 · 장 번호) ---------- */
function photoJobs() {
  const J = [], add = (files, label) => (files || []).forEach((f, i) => J.push({ id: f.id, name: label + ' · ' + String(i + 1).padStart(2, '0') + '.jpg' }));
  MD.works.forEach((w, wi) => { if (IC.workNA[wi]) return; w[1].forEach((q, qi) => { const a = IC.wa[wi][qi]; if (a.risk) add(a.files, '1 작업점검 · ' + w[0] + ' ' + (qi + 1) + '번'); }); });
  IC.ladder.issues.forEach((x) => add(x.files, '2 사다리 · ' + x.typeKey + ' ' + x.item));
  [['common', '3 공통·시설'], ['fire', '4 소방']].forEach(([k, g]) => IC[k].issues.forEach((x) => add(x.files, g + ' · ' + x.item)));
  if (IC.tbm.confirmMethod !== '인터뷰만') add(IC.tbm.photoFiles, '5 TBM · 실시 사진');
  IC.others.forEach((x, j) => add(x.files, '6 기타사항 ' + (j + 1)));
  /* D2.0 번호는 보고서 장 번호와 같게 (08 조치확인 · 09 사고조사) */
  (IC.tasks || []).forEach((x, j) => { if (x.status === '조치완료' && !x.notObserved) add(x.afterFiles, '8 조치확인 ' + (j + 1) + ' · ' + x.title + ' · 조치 후'); });
  (IC.accidents || []).forEach((x, j) => {
    if (x.notObserved) return;
    const lb = '9 사고조사 ' + (j + 1) + ' · ' + x.date + ' ' + x.type;
    add(x.beforeFiles, lb + ' · 현재 상태'); if (x.status === '조치완료') add(x.afterFiles, lb + ' · 조치 후');
  });
  return J;
}
async function relay(action, body) {
  if (!window.RELAY_URL) throw new Error('사진 중계 주소가 아직 없습니다 (config.js 의 RELAY_URL)');
  const token = await auth.currentUser.getIdToken();
  let r;
  try { r = await fetch(window.RELAY_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action, token }, body)) }); }
  catch (e) { throw new Error('인터넷 연결을 확인해 주세요 (중계에 닿지 못함)'); }
  if (!r.ok) throw new Error('중계 응답 오류 ' + r.status);
  let j; try { j = await r.json(); } catch (e) { throw new Error('중계 응답을 읽지 못했습니다 (배포 설정 「모든 사용자」 확인)'); }
  if (!j.ok) throw new Error(j.error || '중계 오류');
  return j;
}
const b64 = (blob) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => no(fr.error); fr.readAsDataURL(blob); });

/* ---------- 저장할 기록 ---------- */
function upFiles(arr) { return (arr || []).filter((f) => IC.up[f.id] && IC.up[f.id].fileId).map((f) => ({ id: f.id, fileId: IC.up[f.id].fileId, url: IC.up[f.id].url, name: IC.up[f.id].name })); }
function buildRecord(sc) {
  const d = JSON.parse(JSON.stringify({ basic: IC.basic, wa: IC.wa, workNA: IC.workNA, workChecked: IC.workChecked, ladder: IC.ladder, common: IC.common, fire: IC.fire, tbm: IC.tbm, workers: IC.workers, others: IC.others, fixTexts: IC.fixTexts }));
  Object.keys(d.wa).forEach((wi) => Object.keys(d.wa[wi]).forEach((qi) => { const a = d.wa[wi][qi]; a.files = a.risk ? upFiles(a.files) : []; }));
  d.ladder.issues.forEach((x) => { x.files = upFiles(x.files); });
  ['common', 'fire', 'tbm'].forEach((k) => d[k].issues.forEach((x) => { x.files = upFiles(x.files); }));
  d.tbm.photoFiles = d.tbm.confirmMethod !== '인터뷰만' ? upFiles(d.tbm.photoFiles) : [];
  d.others.forEach((x) => { x.files = upFiles(x.files); });
  d.accidents = JSON.parse(JSON.stringify(IC.accidents || [])).map((x) => Object.assign(x, { beforeFiles: x.notObserved ? [] : upFiles(x.beforeFiles), afterFiles: x.notObserved || x.status !== '조치완료' ? [] : upFiles(x.afterFiles) }));
  d.tasks = JSON.parse(JSON.stringify(IC.tasks || [])).map((x) => Object.assign(x, { afterFiles: x.notObserved || x.status !== '조치완료' ? [] : upFiles(x.afterFiles) }));
  const items = solItems(), photos = photoJobs().filter((j) => IC.up[j.id] && IC.up[j.id].fileId).length;
  const rec = JSON.parse(JSON.stringify({
    id: IC.id, status: 'submitted', ui: UI_VERSION,
    date: IC.date, startedAt: IC.startedAt || '', submittedAt: now(),
    storeId: IC.store.id || '', storeName: IC.store.name, team: IC.store.team || '', dept: IC.store.dept || '', division: IC.store.division || '', storeType: IC.store.type || '',
    inspectorEmail: IC.inspector.email, inspectorName: IC.inspector.name, inspectorTitle: IC.inspector.title || '',
    folderId: (IC.folder && IC.folder.id) || '', folderUrl: (IC.folder && IC.folder.url) || '',
    pdfId: (IC.pdf && IC.pdf.fileId) || '', pdfUrl: (IC.pdf && IC.pdf.url) || '', pdfPages: (IC.pdf && IC.pdf.pages) || 0,
    pdfView: IC.pdf && IC.pdf.viewKey ? new URL('view.html?k=' + IC.pdf.viewKey, location.href).href : '',   // D2.2 드라이브 없이 인터넷 창에서 보기
    score: sc.score, grade: sc.grade, parts: sc.parts, weights: sc.weights,
    labor: labor(), stretchGap: gap(),
    counts: { issues: items.length, photos, workRisk: items.filter((x) => x.group === '작업점검').length, ladder: IC.ladder.issues.length, common: IC.common.issues.length, fire: IC.fire.issues.length, tbm: IC.tbm.issues.length, workers: IC.workers.length, others: IC.others.length,
      accidents: (IC.accidents || []).length, accOpen: (IC.accidents || []).filter((x) => x.status === '미조치').length, tasks: (IC.tasks || []).length, tasksOpen: (IC.tasks || []).filter((x) => x.status !== '조치완료').length },
    accSkipped: !!IC.accSkipped,
    issues: items.map((x) => ({ key: x.key, group: x.group, area: x.area, title: x.title, detail: x.detail, fix: fixOf(x), edited: isEd(x.key), photos: upFiles(x.files).map((f) => f.url) })),
    data: d
  }));
  rec.openNext = JSON.parse(JSON.stringify(openNextOf(rec)));   // D2.0 다음 점검의 조치확인
  return rec;
}

/* ---------- 제출 진행 ---------- */
async function submitRun() {
  if (SUB && SUB.running) return;
  if (missing().length) { IC.sec = 'submit'; return render(); }
  const jobs = photoJobs(); IC.up = IC.up || {};
  const skipPdf = !!(SUB && SUB.skipPdf);
  SUB = { running: true, step: 1, done: jobs.filter((j) => IC.up[j.id]).length, total: jobs.length, err: '', skipPdf };
  render(); window.scrollTo(0, 0);
  try {
    const insp = { id: IC.id, date: IC.date, store: IC.store.name, inspector: IC.inspector.name, folderId: (IC.folder && IC.folder.id) || '' };
    for (const j of jobs) {
      if (IC.up[j.id]) { if (IC.up[j.id].name !== j.name) delete IC.up[j.id]; else continue; }   // 이름(순서)이 바뀌었으면 다시 맞춤 (중계가 같은 사진이면 이름만 바꿈)
      const blob = await PH.get(j.id);
      if (!blob) { IC.up[j.id] = { missing: true, name: j.name }; SUB.done++; continue; }   // 휴대폰에서 사라진 사진은 건너뜀
      const r = await relay('photo', { insp, photoId: j.id, name: j.name, mime: blob.type || 'image/jpeg', data: await b64(blob) });
      IC.up[j.id] = { fileId: r.fileId, url: r.url, name: j.name };
      IC.folder = { id: r.folderId, url: r.folderUrl }; insp.folderId = r.folderId;
      milPut(IC); SUB.done = jobs.filter((x) => IC.up[x.id]).length; render();
    }
    const keep = jobs.map((j) => IC.up[j.id] && IC.up[j.id].fileId).filter(Boolean);
    const t = await relay('tidy', { insp, keep });
    IC.folder = { id: t.folderId, url: t.folderUrl }; insp.folderId = t.folderId; milPut(IC);
    const sc = scoreAll();
    /* ② 보고서 PDF (D1.9) · 실패하면 [다시 시도] 또는 [보고서 없이 제출] */
    SUB.step = 2; SUB.page = ''; render();
    if (!IC.pdf && !SUB.skipPdf) {
      let pdf;
      try {
        const snap = rptSnapshot(await rptPhotos(jobs), sc);
        pdf = await rptPdf(snap, (i, n) => { SUB.page = i + ' / ' + n + '장'; render(); });
      } catch (e) { SUB.pdfFail = true; throw new Error('보고서 PDF를 만들지 못했습니다: ' + (e.message || e)); }
      SUB.page = '드라이브에 저장 중'; render();
      const r = await relay('report', { insp, name: '0 결과보고서 · ' + IC.store.name + ' · ' + IC.date + '.pdf', data: pdf.base64 });
      IC.pdf = { fileId: r.fileId, url: r.url, pages: pdf.pages, viewKey: r.viewKey || '' }; milPut(IC);
    }
    SUB.step = 3; SUB.pdfFail = false; render();
    const rec = buildRecord(sc);
    try { await db.collection('INSPECTIONS').doc(IC.id).set(rec); }
    catch (e) { throw new Error('점검 기록을 저장하지 못했습니다: ' + (e.code === 'permission-denied' ? 'Firebase 규칙(INSPECTIONS)이 아직 안 올라갔을 수 있어요' : (e.message || e.code))); }
    SUB.step = 4; render();
    /* D2.2 점검자 본인 Teams 로 결과보고서 알림 (실패해도 제출은 끝난 것 · 결과 화면에 사유만 보여 줌) */
    let teams = '';
    if (!IC.teamsSent) {
      try {
        const c = rec.counts, r = await relay('notify', { sum: { store: rec.storeName, org: [rec.division, rec.dept, rec.team].filter(Boolean).join(' › '), date: rec.date,
          inspector: rec.inspectorName + (rec.inspectorTitle ? ' ' + rec.inspectorTitle : ''), score: rec.score, grade: rec.grade, issues: c.issues, photos: c.photos,
          accidents: c.accidents, accOpen: c.accOpen, tasks: c.tasks, tasksOpen: c.tasksOpen, viewUrl: rec.pdfView, folderUrl: rec.folderUrl } });
        IC.teamsSent = r.to || true; milPut(IC); teams = 'ok:' + (r.to || '');
      } catch (e) { teams = 'err:' + (e.message || e); }
    } else teams = 'ok:' + (IC.teamsSent === true ? '' : IC.teamsSent);
    LAST = { store: IC.store.name, date: IC.date, inspector: IC.inspector.name + (IC.inspector.title ? ' ' + IC.inspector.title : ''), sc, issues: rec.counts.issues, photos: rec.counts.photos, counts: rec.counts, folderUrl: rec.folderUrl, pdfUrl: rec.pdfUrl, viewUrl: rec.pdfView, teams };
    await PH.clear(IC.id);
    milPut(null); IC = null; SUB = null; SHEET = ''; IASK = '';
    MV = 'done'; render(); window.scrollTo(0, 0);
  } catch (e) {
    if (SUB) { SUB.running = false; SUB.err = e.message || String(e); }
    if (IC) milPut(IC);
    render();
  }
}
window.addEventListener('beforeunload', (e) => { if (SUB && SUB.running) { e.preventDefault(); e.returnValue = ''; } });

function vProgress() {
  const s = SUB;
  const st = (n, t, sub) => {
    const c = s.step > n ? 'ok' : s.step === n ? (s.err ? 'er' : 'go') : '';
    return '<div class="sp ' + c + '"><span class="c">' + (s.step > n ? ic('check', 13) : s.step === n && s.err ? '!' : n) + '</span><span><b>' + t + '</b><small>' + sub + '</small></span></div>';
  };
  return {
    html: '<div class="ih">' + (s.err ? '제출이 멈췄어요' : '제출하고 있어요') + '</div>'
      + '<div class="ihs">' + (s.err ? '[다시 시도]를 누르면 멈춘 곳부터 이어서 해요. 이미 올라간 사진은 다시 올리지 않아요.' : '화면을 끄거나 앱을 닫지 말아 주세요. 사진이 많으면 1~2분 걸려요.') + '</div>'
      + '<div class="spl">' + st(1, '사진 올리기', s.total ? s.done + ' / ' + s.total + '장 · 구글 드라이브' : '올릴 사진 없음 · 드라이브 폴더만 만들어요')
      + st(2, '결과보고서 PDF', s.skipPdf ? '보고서 없이 제출' : (s.step === 2 && s.page ? esc(s.page) : '가로 A4 · 점검 폴더에 저장'))
      + st(3, '점검 기록 저장', 'Firebase') + st(4, '마무리', '내 Teams 알림 · 휴대폰에 둔 사진 정리') + '</div>'
      + (s.step === 1 && s.total ? '<div class="spb"><i style="width:' + Math.round(s.done / s.total * 100) + '%"></i></div>' : '')
      + (s.err ? '<div class="ask">' + esc(s.err) + '</div>' : '')
      + (s.err && s.pdfFail ? '<button type="button" class="btn ghost wide" data-a="subNoPdf">보고서 없이 제출하기</button><div class="ihs" style="margin-top:6px">사진과 점검 기록은 그대로 저장돼요. 보고서만 빠져요.</div>' : ''),
    prev: s.err ? { t: '점검 화면으로', a: 'subBack' } : null,
    next: s.err ? { t: '다시 시도', a: 'subRetry' } : { t: '제출 중…', a: 'noop', dis: true }
  };
}

/* ---------- 결과 화면 ---------- */
function milDone() {
  const L = LAST; if (!L) { MV = 'home'; return render(); }
  TITLE.store = '점검 완료';
  const nm = { work: '작업점검', ladder: '사다리', common: '공통·시설', fire: '소방', tbm: 'TBM' };
  const cn = { work: L.counts.workRisk, ladder: L.counts.ladder, common: L.counts.common, fire: L.counts.fire, tbm: L.counts.tbm };
  if (L.sc.parts.accident != null) { nm.accident = '사고조사'; cn.accident = L.counts.accOpen; }
  const rows = Object.keys(nm).map((k) => '<div><span>' + nm[k] + '</span><span class="n">' + (k === 'accident' ? (cn[k] ? '미조치 ' + cn[k] : '모두 조치') : cn[k] ? '지적 ' + cn[k] : '지적 없음') + '</span><b>' + L.sc.parts[k] + '점</b></div>').join('');
  frame('<div class="dn"><div class="ring">' + ic('check', 30) + '</div><h2>' + esc(L.store) + ' 점검 완료</h2><p class="muted">' + esc(dayKo(L.date)) + ' · ' + esc(L.inspector) + '</p></div>'
    + '<div class="dsum"><div>종합 점수<b>' + L.sc.score + '</b><small>' + L.sc.grade + '등급</small></div><div class="r">지적사항<b>' + L.issues + '</b><small>건</small></div><div>사진<b>' + L.photos + '</b><small>장</small></div></div>'
    + '<div class="dl">' + rows + '</div>'
    /* D2.3 보고서는 인터넷 창(view.html)으로만 · 드라이브 링크는 화면에 안 보임 (드라이브는 마스터가 드라이브 앱으로 직접) */
    + (L.viewUrl ? '<a class="btn red wide" href="' + esc(L.viewUrl) + '" target="_blank" rel="noopener">' + ic('book', 16) + '결과보고서 보기</a>'
      : L.pdfUrl ? '<div class="inote">결과보고서는 저장됐는데 보기 링크를 못 만들었어요. 중계(Apps Script)가 R1.3 이상인지 확인해 주세요.</div>' : '<div class="inote">이번 제출은 보고서 PDF 없이 저장됐어요.</div>')
    + (L.teams ? '<div class="inote">' + (L.teams.indexOf('ok:') === 0 ? ic('check', 15) + ' 내 Teams' + (L.teams.length > 3 ? '(' + esc(L.teams.slice(3)) + ')' : '') + '로 결과보고서 알림을 보냈어요. Teams 왼쪽 [채팅]의 「Workflows」에서 볼 수 있어요.' : 'Teams 알림을 못 보냈어요 · ' + esc(L.teams.slice(4)) + ' (점검 제출은 끝났어요)') + '</div>' : '')

    + '<div class="inote">보고서에는 점수 숫자 대신 상태(우수 · 양호 · 관리필요 · 위험)로 나와요.</div>'
    + '<button class="btn ghost wide" type="button" id="dHome">' + ic('home', 16) + '밀착지원 처음으로</button>');
  $('dHome').onclick = () => { LAST = null; MV = 'home'; render(); window.scrollTo(0, 0); };
}
