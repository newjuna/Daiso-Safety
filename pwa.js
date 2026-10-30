/* 다이소 안전 · 홈 화면 앱 (D2.1 PWA)
 * 메뉴 → [홈 화면에 앱 추가]
 *   안드로이드 크롬 · 엣지 · PC 크롬: 설치 창이 바로 뜸 (브라우저가 설치 준비를 알려 줬을 때)
 *   아이폰 · 아이패드(사파리): 설치 창을 띄울 수 없어서 [공유] → [홈 화면에 추가] 안내를 보여 줌
 *   이미 앱으로 열려 있으면: 「설치됨」
 * 인터넷이 끊기면 화면 아래에 「인터넷 연결 없음」 띠 (점검 입력과 사진은 계속 휴대폰에 저장됨 · 제출만 안 됨)
 */
let PWA_EVT = null;
const pwaIsApp = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
const pwaIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); PWA_EVT = e; });
window.addEventListener('appinstalled', () => { PWA_EVT = null; toast('홈 화면에 「다이소 안전」을 추가했어요'); });

function pwaSheet(html) {
  const old = document.getElementById('pwaSh'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'pwaSh'; d.className = 'ish';
  d.innerHTML = '<div class="ishd" role="dialog"><div class="grab"></div>' + html + '<button type="button" class="btn ghost wide" id="pwaX">닫기</button></div>';
  d.onclick = (e) => { if (e.target === d || e.target.id === 'pwaX') d.remove(); };
  document.body.appendChild(d);
}
async function pwaInstall() {
  if (pwaIsApp()) return toast('이미 홈 화면 앱으로 쓰고 있어요');
  if (PWA_EVT) {
    const e = PWA_EVT; PWA_EVT = null;
    e.prompt();
    try { const r = await e.userChoice; if (r && r.outcome !== 'accepted') toast('설치를 취소했어요 · 나중에 메뉴에서 다시 누르면 돼요'); } catch (err) { /* 무시 */ }
    return;
  }
  const step = (n, t) => '<div style="display:flex;gap:10px;margin-top:12px;font-size:14px;line-height:1.55"><span class="ibg r" style="flex:none">' + n + '</span><span>' + t + '</span></div>';
  if (pwaIOS()) return pwaSheet('<h3>아이폰 · 아이패드에 앱 추가</h3><div class="ihs">사파리에서만 돼요. 카카오톡 · 팀즈 안에서 열었다면 먼저 「사파리로 열기」를 눌러 주세요.</div>'
    + step(1, '화면 아래(아이패드는 위) <b>공유 버튼</b>(네모에서 위로 화살표)을 눌러요')
    + step(2, '목록을 내려서 <b>홈 화면에 추가</b>를 눌러요')
    + step(3, '오른쪽 위 <b>추가</b>를 누르면 홈 화면에 빨간 「다이소 안전」 아이콘이 생겨요'));
  pwaSheet('<h3>홈 화면에 앱 추가</h3><div class="ihs">이 브라우저는 설치 창을 아직 준비하지 않았어요. 아래 방법으로 직접 추가해 주세요.</div>'
    + step(1, '<b>크롬</b>: 오른쪽 위 <b>⋮</b> → <b>홈 화면에 추가</b> (또는 <b>앱 설치</b>)')
    + step(2, '<b>삼성 인터넷</b>: 아래 <b>☰</b> → <b>현재 페이지 추가</b> → <b>홈 화면</b>')
    + step(3, '<b>PC 크롬 · 엣지</b>: 주소창 오른쪽 <b>설치 아이콘</b>(모니터에 화살표)'));
}

/* 인터넷 끊김 띠 */
function pwaNet() {
  let b = document.getElementById('netBar');
  if (navigator.onLine) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('div'); b.id = 'netBar'; b.className = 'netbar'; document.body.appendChild(b); }
  b.textContent = '인터넷 연결 없음 · 입력과 사진은 이 휴대폰에 저장돼요 (제출은 연결된 뒤에)';
}
window.addEventListener('online', () => { pwaNet(); toast('인터넷에 다시 연결됐어요'); });
window.addEventListener('offline', pwaNet);
pwaNet();

/* 서비스 워커 (인터넷이 되면 언제나 새 파일 · 안 되면 받아 둔 파일로 앱을 엶) */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => { /* 실패해도 앱은 그대로 동작 */ }); });
}
