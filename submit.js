/* 다이소 안전 · 매장 밀착지원 제출 (D1.8)
 * [제출하기] → ① 사진 올리기 (한 장씩 · Apps Script 중계 → 구글 드라이브)
 *            → ② 점검 기록 저장 (Firebase INSPECTIONS/점검ID · 답 · 사진 링크 · 해결방안 · 점수)
 *            → ③ 마무리 (휴대폰에 둔 사진 · 진행 중 점검 지우기) → 결과 화면 (점수는 여기서 처음 보여 줌)
 * 중간에 끊기면 [다시 시도] = 멈춘 곳부터 (올라간 사진은 IC.up 에 적어 둬서 다시 안 올림)
 * 점수 계산은 v4 scoreSummary 그대로 (사고이력이 아직 없으니 사고 배점은 작업점검으로 옮김)
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
  w.work += w.accident; w.accident = 0;   // 사고이력 연결 전 (5단계에서 사고 배점 사용)
  let tot = 0, ws = 0; Object.keys(parts).forEach((k) => { tot += parts[k] * w[k]; ws += w[k]; });
  const score = Math.round(tot / ws);
  return { score, grade: score >= 90 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D', parts, weights: w, hasAccident: false };
}

/* ---------- 올릴 사진 목록 (지금 화면에 살아 있는 사진만 · 파일 이름 = 순서 번호 · 섹션 · 항목 · 장 번호) ---------- */
function photoJobs() {
  const J = [], add = (files, label) => (files || []).forEach((f, i) => J.push({ id: f.id, name: label + ' · ' + String(i + 1).padStart(2, '0') + '.jpg' }));
  MD.works.forEach((w, wi) => { if (IC.workNA[wi]) return; w[1].forEach((q, qi) => { const a = IC.wa[wi][qi]; if (a.risk) add(a.files, '1 작업점검 · ' + w[0] + ' ' + (qi + 1) + '번'); }); });
  IC.ladder.issues.forEach((x) => add(x.files, '2 사다리 · ' + x.typeKey + ' ' + x.item));
  [['common', '3 공통·시설'], ['fire', '4 소방']].forEach(([k, g]) => IC[k].issues.forEach((x) => add(x.files, g + ' · ' + x.item)));
  if (IC.tbm.confirmMethod !== '인터뷰만') add(IC.tbm.photoFiles, '5 TBM · 실시 사진');
  IC.others.forEach((x, j) => add(x.files, '6 기타사항 ' + (j + 1)));
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
  const items = solItems(), photos = photoJobs().filter((j) => IC.up[j.id] && IC.up[j.id].fileId).length;
  return JSON.parse(JSON.stringify({
    id: IC.id, status: 'submitted', ui: UI_VERSION,
    date: IC.date, startedAt: IC.startedAt || '', submittedAt: now(),
    storeId: IC.store.id || '', storeName: IC.store.name, team: IC.store.team || '', dept: IC.store.dept || '', division: IC.store.division || '', storeType: IC.store.type || '',
    inspectorEmail: IC.inspector.email, inspectorName: IC.inspector.name, inspectorTitle: IC.inspector.title || '',
    folderId: (IC.folder && IC.folder.id) || '', folderUrl: (IC.folder && IC.folder.url) || '',
    score: sc.score, grade: sc.grade, parts: sc.parts, weights: sc.weights,
    labor: labor(), stretchGap: gap(),
    counts: { issues: items.length, photos, workRisk: items.filter((x) => x.group === '작업점검').length, ladder: IC.ladder.issues.length, common: IC.common.issues.length, fire: IC.fire.issues.length, tbm: IC.tbm.issues.length, workers: IC.workers.length, others: IC.others.length },
    issues: items.map((x) => ({ key: x.key, group: x.group, area: x.area, title: x.title, detail: x.detail, fix: fixOf(x), edited: isEd(x.key), photos: upFiles(x.files).map((f) => f.url) })),
    data: d
  }));
}

/* ---------- 제출 진행 ---------- */
async function submitRun() {
  if (SUB && SUB.running) return;
  if (missing().length) { IC.sec = 'submit'; return render(); }
  const jobs = photoJobs(); IC.up = IC.up || {};
  SUB = { running: true, step: 1, done: jobs.filter((j) => IC.up[j.id]).length, total: jobs.length, err: '' };
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
    IC.folder = { id: t.folderId, url: t.folderUrl }; milPut(IC);
    SUB.step = 2; render();
    const sc = scoreAll(), rec = buildRecord(sc);
    try { await db.collection('INSPECTIONS').doc(IC.id).set(rec); }
    catch (e) { throw new Error('점검 기록을 저장하지 못했습니다: ' + (e.code === 'permission-denied' ? 'Firebase 규칙(INSPECTIONS)이 아직 안 올라갔을 수 있어요' : (e.message || e.code))); }
    SUB.step = 3; render();
    LAST = { store: IC.store.name, date: IC.date, inspector: IC.inspector.name + (IC.inspector.title ? ' ' + IC.inspector.title : ''), sc, issues: rec.counts.issues, photos: rec.counts.photos, counts: rec.counts, folderUrl: rec.folderUrl };
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
      + st(2, '점검 기록 저장', 'Firebase') + st(3, '마무리', '휴대폰에 둔 사진 정리') + '</div>'
      + (s.step === 1 && s.total ? '<div class="spb"><i style="width:' + Math.round(s.done / s.total * 100) + '%"></i></div>' : '')
      + (s.err ? '<div class="ask">' + esc(s.err) + '</div>' : ''),
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
  const rows = Object.keys(nm).map((k) => '<div><span>' + nm[k] + '</span><span class="n">' + (cn[k] ? '지적 ' + cn[k] : '지적 없음') + '</span><b>' + L.sc.parts[k] + '점</b></div>').join('');
  frame('<div class="dn"><div class="ring">' + ic('check', 30) + '</div><h2>' + esc(L.store) + ' 점검 완료</h2><p class="muted">' + esc(dayKo(L.date)) + ' · ' + esc(L.inspector) + '</p></div>'
    + '<div class="dsum"><div>종합 점수<b>' + L.sc.score + '</b><small>' + L.sc.grade + '등급</small></div><div class="r">지적사항<b>' + L.issues + '</b><small>건</small></div><div>사진<b>' + L.photos + '</b><small>장</small></div></div>'
    + '<div class="dl">' + rows + '</div>'
    + (L.folderUrl ? '<a class="btn red wide" href="' + esc(L.folderUrl) + '" target="_blank" rel="noopener">' + ic('folder', 16) + '드라이브 폴더 열기</a>' : '')
    + '<div class="inote">보고서 PDF는 다음 버전(D1.9)부터 이 폴더에 같이 만들어져요. 점검 기록은 Firebase에 저장됐어요.</div>'
    + '<button class="btn ghost wide" type="button" id="dHome">' + ic('home', 16) + '밀착지원 처음으로</button>');
  $('dHome').onclick = () => { LAST = null; MV = 'home'; render(); window.scrollTo(0, 0); };
}
