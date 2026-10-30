/* 다이소 안전 · 매장 밀착지원 결과보고서 PDF (D1.9)
 * v4 와 똑같은 보고서: report.js(v4 그대로)가 그릴 자료(snapshot)를 v4 getLandscapeReportSnapshot 과 같은 모양으로 만듦
 * → 화면 밖에 1240×880 장으로 펼쳐 html2canvas 로 찍고 jsPDF 로 묶음 (가로 A4 비율) → 중계로 드라이브 점검 폴더에 저장
 * 사진은 휴대폰 사진 보관함(PH)에서 꺼내 그대로 넣음 (그래서 제출 마무리 전에 만들어야 함)
 * D2.0 사고조사 · 조치확인 장 채움 (조치확인의 지난 점검 사진은 드라이브 사진이라 캡처 불가 → 이번 조치 후 사진만)
 * 아직 없는 것: 사다리 유형 참고사진
 */
const RPT_LIBS = {
  h2c: ['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'],
  pdf: ['https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js', 'https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js']
};
const jsPDFCtor = () => (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
function loadScript(src) {
  return new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.onload = () => ok(); el.onerror = () => { el.remove(); no(new Error(src)); }; document.head.appendChild(el); });
}
async function loadLib(ready, list) {
  if (ready()) return;
  for (const src of list) { try { await loadScript(src); if (ready()) return; } catch (e) { /* 다음 주소 */ } }
  throw new Error('PDF 만드는 도구를 불러오지 못했습니다 (인터넷 확인)');
}
function loadRptCss() {
  return new Promise((ok, no) => {
    if (document.querySelector('link[data-rpt]')) return ok();
    const el = document.createElement('link'); el.rel = 'stylesheet'; el.href = (window.RPT_BASE || '') + 'report.css?v=' + encodeURIComponent(UI_VERSION.split(' ').pop()); el.setAttribute('data-rpt', '1');
    el.onload = () => ok(); el.onerror = () => { el.remove(); no(new Error('보고서 디자인 파일(report.css)을 불러오지 못했습니다 · GitHub 에 올라갔는지 확인')); };
    document.head.appendChild(el);
  });
}
const dropRptCss = () => { const el = document.querySelector('link[data-rpt]'); if (el) el.remove(); };
const dataUrl = (blob) => new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => no(fr.error); fr.readAsDataURL(blob); });

/* 사진 번호 → dataURL (보고서에 들어갈 사진만) */
async function rptPhotos(jobs) {
  const M = {};
  for (const j of jobs) { try { const b = await PH.get(j.id); if (b) M[j.id] = await dataUrl(b); } catch (e) { /* 빠진 사진은 점선 칸 */ } }
  await rptLadderImgs();
  return M;
}
/* D2.6 사다리 유형 사진 (img/ladder) → dataURL · 보고서 「사다리 보유현황」 카드에 들어감 · 못 읽으면 「가이드 사진 없음」 */
let RPT_LIMG = {};
async function rptLadderImgs() {
  const src = MD.ladderTypeImages || {}, out = {};
  for (const t of Object.keys(src)) {
    try { const r = await fetch(src[t]); if (r.ok) out[t] = await dataUrl(await r.blob()); } catch (e) { /* 건너뜀 */ }
  }
  RPT_LIMG = out; return out;
}
/* ---------- v4 getLandscapeReportSnapshot 과 같은 모양 ---------- */
function rptSnapshot(M, sc) {
  const res = (files) => (files || []).filter((f) => M[f.id]).map((f) => ({ name: f.id, dataUrl: M[f.id], refId: f.id }));
  const fx = (key, ctx) => { const v = IC.fixTexts[key]; return typeof v === 'string' && v.trim() ? v.trim() : autoText(ctx); };
  const findings = [];
  MD.works.forEach((w, wi) => {
    if (IC.workNA[wi]) return;
    w[1].forEach((q, qi) => {
      const x = IC.wa[wi][qi]; if (!x || !x.risk) return;
      const answer = q[1][x.oi] || q[0], ctx = { category: '작업점검', area: w[0], question: q[0], title: answer, hazards: q[2] || [] };
      findings.push({ category: '작업점검', area: w[0], title: answer, question: q[0], hazards: q[2] || [], photos: res(x.files), fix: fx('w:' + wi + ':' + qi, ctx) });
    });
  });
  IC.ladder.issues.forEach((x) => {
    const type = x.type || x.typeKey || '사다리', item = x.item || '이상사항', ctx = { category: '사다리', area: type, title: item, hazards: ['떨어짐'] };
    findings.push({ category: '사다리', area: type, title: item, note: x.note || '', hazards: ['떨어짐'], photos: res(x.files), fix: fx('ladder:' + type + '|' + item, ctx) });
  });
  [['common', '공통·시설', '시설'], ['fire', '소방', '화재'], ['tbm', 'TBM', '안전관리']].forEach(([k, cat, hz]) => IC[k].issues.forEach((x) => {
    const ctx = { category: cat, area: cat, title: x.item, hazards: [hz] };
    findings.push({ category: cat, area: cat, title: x.item, note: x.note || '', hazards: [hz], photos: res(x.files), fix: fx(k + ':' + x.item, ctx) });
  }));
  IC.others.forEach((x) => {
    if (!String(x.text || '').trim() && !(x.files || []).length) return;
    const t = x.text || '기타사항', ctx = { category: '기타사항', area: '기타사항', title: t, hazards: ['기타'] };
    findings.push({ category: '기타사항', area: '기타사항', title: t, note: '', hazards: ['기타'], photos: res(x.files), fix: fx('other:' + x.id, ctx) });
  });
  const hazards = {}; findings.forEach((f) => (f.hazards || []).forEach((h) => { hazards[h] = (hazards[h] || 0) + 1; }));
  const work = MD.works.map((w, wi) => { const own = findings.filter((f) => f.category === '작업점검' && f.area === w[0]); return { name: w[0], status: IC.workNA[wi] ? 'na' : 'checked', risk: own.length, hazards: [...new Set(own.flatMap((f) => f.hazards || []))] }; });
  const qs = MD.voice, workerOpinions = [];
  IC.workers.forEach((wk, i) => Object.entries(wk.answers || {}).forEach(([qi, a]) => { const q = qs[qi], oi = Number(a.oi); if (!q || !Number.isFinite(oi) || oi === 0) return; workerOpinions.push({ worker: i + 1, question: q[0], answer: q[1][oi] === '기타' && a.text ? '기타: ' + a.text : (q[1][oi] || a.text || '') }); }));
  const ckSnap = (k) => MD[k].map((it) => {
    const name = typeof it === 'string' ? it : it.name, f = IC[k].issues.find((x) => x.item === name), na = !!IC[k].naItems[name], cat = SNM[k];
    return { name, state: f ? 'bad' : na ? 'na' : 'good', note: f ? (f.note || '') : '', photos: f ? res(f.files) : [], fix: f ? fx(k + ':' + name, { category: cat, area: cat, title: name, hazards: [k === 'common' ? '시설' : k === 'fire' ? '화재' : '안전관리'] }) : '' };
  });
  const workDetail = MD.works.map((w, wi) => ({
    name: w[0], na: !!IC.workNA[wi],
    questions: w[1].map((q, qi) => { const a = IC.wa[wi][qi], picked = q[1][a.oi] || '', risk = !!a.risk; return { q: q[0], answer: picked, risk, answered: true, hazards: q[2] || [], photos: risk ? res(a.files) : [], fix: risk ? fx('w:' + wi + ':' + qi, { category: '작업점검', area: w[0], question: q[0], title: picked || q[0], hazards: q[2] || [] }) : '' }; })
  }));
  const ladderDetail = MD.ladderTypes.map((t) => ({ type: t, count: cnt(t), status: IC.ladder.typeStatus[t] || '', highRisk: !!MD.ladderHighRiskTypes[t], issues: IC.ladder.issues.filter((x) => (x.type || x.typeKey) === t).map((x) => ({ item: x.item || '이상사항', note: x.note || '', photos: res(x.files) })) }));
  const voiceDetail = IC.workers.map((wk, i) => ({ worker: i + 1, answers: qs.map((q, qi) => { const a = (wk.answers || {})[qi], oi = a ? Number(a.oi) : NaN; return { q: q[0], answer: Number.isFinite(oi) ? (q[1][oi] || a.text || '') : '', answered: Number.isFinite(oi), good: oi === 0 }; }) }));
  /* TBM 은 양호인데 근로자가 「공유하지 않음」이라고 답한 경우 (v4 tbmCrossCheckFlags) */
  const names = IC.tbm.issues.map((x) => x.item), shareGood = !names.includes('최근 사고사례·예방수칙 공유') && !names.includes('위험성평가 결과·현장 위험요인 공유');
  const vq = qs.findIndex((q) => q[0] === 'TBM에서 위험요인을 공유합니까?'), flags = [];
  if (vq >= 0 && shareGood) IC.workers.forEach((wk, i) => { const a = wk.answers && wk.answers[vq]; if (a && qs[vq][1][a.oi] === '공유하지 않음') flags.push({ worker: i + 1, message: "TBM 점검은 '양호'로 체크됐지만 근로자 " + (i + 1) + '은 위험요인 공유를 "공유하지 않음"으로 답했습니다.' }); });
  const lb = labor(), g = gap(), b = IC.basic, AS = accSnap(res);   // D2.0 사고조사 · 조치확인 (acc.js)
  return {
    generatedAt: now(), inspectionId: IC.id, submittedAt: now(), inspectionMode: 'new', followupOnly: false, sourceInspectionId: '',
    store: { name: IC.store.name, date: IC.date, inspector: IC.inspector.name, hq: IC.store.division || '', dept: IC.store.dept || '', team: IC.store.team || '' },
    work, findings, hazards: Object.entries(hazards).sort((a, c) => c[1] - a[1]), accidents: AS.accidents, workerOpinions,
    sections: { common: IC.common.issues.length, fire: IC.fire.issues.length, tbm: IC.tbm.issues.length, ladder: IC.ladder.issues.length },
    ladder: { counts: Object.assign({}, IC.ladder.counts), typeStatus: Object.assign({}, IC.ladder.typeStatus) },
    workDetail, checklists: { common: ckSnap('common'), fire: ckSnap('fire'), tbm: ckSnap('tbm') }, ladderDetail, ladderTypeImages: RPT_LIMG, voiceDetail,
    tasks: AS.tasks, resultNote: '',
    score: sc.score, grade: sc.grade, scoreParts: sc.parts, hasAccidentScore: !!sc.hasAccident,
    inboundLabor: lb ? { level: lb.level, avgPeople: Math.round(lb.avgPeople * 10) / 10, gapRatioPct: Math.round(lb.gapRatio * 100) } : null,
    inbound: { delivery: b.delivery || '', boxes: Number(b.inboundBoxes) || 0, start: b.inboundStart || '', end: b.inboundEnd || '', staff: Number(b.inboundStaff) || 0, helpers: Number(b.inboundHelpers) || 0, helperOutAt: b.inboundHelperOutAt || '' },
    transport: { floors: Number(b.floors) || 0, stairs: b.hasStairs === '유' ? '유' : '무', elevator: b.hasElevator === '유' ? '유' : '무', escalator: b.hasEscalator === '유' ? '유' : '무' },
    tbmConfirmMethod: IC.tbm.confirmMethod || '직접참관', tbmCrossCheckFlags: flags, tbmTimes: { am: IC.tbm.amTime || '', pm: IC.tbm.pmTime || '' },
    tbmPhotos: IC.tbm.confirmMethod !== '인터뷰만' ? res(IC.tbm.photoFiles) : [],
    tbmStretchGap: g ? { level: g.level, gapMinutes: g.gapMinutes } : null
  };
}
/* ---------- PDF (v4 buildReportPdfBase64 그대로 · 1240×880 · 배율 1.5 · JPEG 0.82) ---------- */
async function rptPdf(snap, onPage) {
  if (typeof window.buildReportPages !== 'function') throw new Error('보고서 파일(report.js)이 없습니다 · GitHub 에 올라갔는지 확인');
  await loadRptCss();
  await loadLib(() => typeof html2canvas === 'function', RPT_LIBS.h2c);
  await loadLib(() => !!jsPDFCtor(), RPT_LIBS.pdf);
  const W = 1240, H = 880, holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-20000px;top:0;width:' + W + 'px;z-index:-1;background:#fff';
  holder.innerHTML = '<div class="sr-report sr-capture">' + window.buildReportPages(snap) + '</div>';
  document.body.appendChild(holder);
  const pages = [...holder.querySelectorAll('.sr-sheet')];
  pages.forEach((p) => { [['display', 'block'], ['width', W + 'px'], ['max-width', 'none'], ['height', H + 'px'], ['min-height', '0'], ['max-height', H + 'px'], ['aspect-ratio', 'auto'], ['margin', '0'], ['box-shadow', 'none'], ['overflow', 'hidden']].forEach(([k, v]) => p.style.setProperty(k, v, 'important')); });
  try {
    await Promise.all([...holder.querySelectorAll('img')].map((im) => (im.complete && im.naturalWidth) ? 0 : new Promise((r) => { im.onload = r; im.onerror = r; setTimeout(r, 4000); })));
    if (document.fonts && document.fonts.ready) { try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]); } catch (e) { /* 글씨체 기다리기 실패는 무시 */ } }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const Pdf = jsPDFCtor(), pdf = new Pdf({ orientation: 'landscape', unit: 'pt', format: [W, H], compress: true });
    for (let i = 0; i < pages.length; i++) {
      const cv = await html2canvas(pages[i], { scale: 1.5, useCORS: false, backgroundColor: '#ffffff', logging: false, width: W, height: H, windowWidth: W, windowHeight: H });
      if (i) pdf.addPage([W, H], 'landscape');
      pdf.addImage(cv.toDataURL('image/jpeg', 0.82), 'JPEG', 0, 0, W, H, undefined, 'FAST');
      if (onPage) onPage(i + 1, pages.length);
    }
    return { base64: pdf.output('datauristring').split(',')[1], pages: pages.length };
  } finally { holder.remove(); dropRptCss(); }
}
