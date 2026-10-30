/* 다이소 안전 · 서비스 워커 (D2.1 PWA)
 * 인터넷이 되면 언제나 새 파일 먼저 (GitHub 에 올리면 바로 반영) · 안 되면 마지막으로 받아 둔 파일로 앱을 엶
 * 저장해 두는 것: 이 앱 파일 · 글씨체 · Firebase / PDF 도구 (화면 그리는 데 필요한 것만)
 * 저장 안 하는 것: 로그인 · Firebase 데이터 · 중계(Apps Script) 요청 · 드라이브 (언제나 인터넷으로)
 * 버전을 올릴 때 CACHE 이름도 같이 올리면 예전 저장본이 지워짐
 */
const CACHE = 'ds-D2.1';
const SHELL = ['./', './index.html', './style.css', './config.js', './app.js', './stores.js', './mil.js', './mil_data.js', './solutions.js', './photo.js', './insp.js', './acc.js', './report.js', './rpt.js', './submit.js', './report.css', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
const CDN = ['cdn.jsdelivr.net', 'www.gstatic.com', 'unpkg.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url), mine = u.origin === self.location.origin;
  if (!mine && !CDN.includes(u.hostname)) return;                       // 로그인 · 데이터 · 중계 · 드라이브는 손대지 않음
  if (u.hostname === 'www.gstatic.com' && !/firebasejs/.test(u.pathname)) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const res = await fetch(r);
      if (res && (res.ok || res.type === 'opaque')) c.put(r, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await c.match(r, { ignoreSearch: mine });              // ?v=D2.1 같은 꼬리표는 무시하고 찾음
      if (hit) return hit;
      if (r.mode === 'navigate') { const idx = await c.match('./index.html') || await c.match('./'); if (idx) return idx; }
      throw err;
    }
  })());
});
