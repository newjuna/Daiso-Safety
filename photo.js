/* 다이소 안전 · 사진 보관함 (D1.7)
 * 점검 중 찍은 사진은 이 휴대폰 안(IndexedDB 'ds_photos')에 저장하고, 점검 기록(localStorage)에는 사진 번호만 남김
 *  - 긴 변 1600px · JPEG 로 줄여서 저장 (휴대폰 저장 공간 · 나중에 올릴 때 데이터 절약)
 *  - 사진 번호 = 점검ID:임의값 → 점검을 그만두거나 제출을 마치면 그 점검 사진만 한 번에 지움
 *  - 화면에는 <img data-ph="사진번호"> 로 그리고, 그린 뒤 PH.fill() 이 실제 사진을 채움
 */
const PH = (() => {
  let dbp = null;
  const urls = new Map();
  const open = () => dbp || (dbp = new Promise((ok, no) => {
    const r = indexedDB.open('ds_photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('p');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { dbp = null; no(r.error); };
  }));
  async function run(mode, fn) {
    const d = await open();
    return new Promise((ok, no) => {
      const t = d.transaction('p', mode), r = fn(t.objectStore('p'));
      t.oncomplete = () => ok(r ? r.result : undefined);
      t.onerror = () => no(t.error);
      t.onabort = () => no(t.error || new Error('휴대폰 저장 공간이 부족할 수 있어요'));
    });
  }
  /* 사진 줄이기 · 못 읽는 형식이면 원본 그대로 */
  async function shrink(file) {
    try {
      let src;
      try { src = await createImageBitmap(file); }
      catch (e) {
        src = await new Promise((ok, no) => {
          const u = URL.createObjectURL(file), im = new Image();
          im.onload = () => { URL.revokeObjectURL(u); ok(im); };
          im.onerror = () => { URL.revokeObjectURL(u); no(new Error('그림을 읽지 못함')); };
          im.src = u;
        });
      }
      const w = src.width, h = src.height, k = Math.min(1, 1600 / Math.max(w, h)), c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      if (src.close) src.close();
      const b = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.82));
      return b || file;
    } catch (e) { return file; }
  }
  async function add(prefix, files) {
    const out = [];
    for (const f of files) {
      if (f.type && !/^image\//.test(f.type)) continue;
      const b = await shrink(f), id = prefix + ':' + Math.random().toString(36).slice(2, 10);
      await run('readwrite', (s) => s.put(b, id));
      out.push({ id, at: new Date().toISOString(), size: b.size });
    }
    return out;
  }
  const get = (id) => run('readonly', (s) => s.get(id));
  function forget(ids) { ids.forEach((i) => { const u = urls.get(i); if (u) { URL.revokeObjectURL(u); urls.delete(i); } }); }
  function del(ids) { forget(ids); return run('readwrite', (s) => { ids.forEach((i) => s.delete(i)); }).catch(() => {}); }
  function clear(prefix) { forget([...urls.keys()].filter((k) => k.startsWith(prefix + ':'))); return run('readwrite', (s) => s.delete(IDBKeyRange.bound(prefix + ':', prefix + ':\uffff'))).catch(() => {}); }
  async function fill(root) {
    const imgs = (root || document).querySelectorAll('img[data-ph]');
    for (const im of imgs) {
      if (im.getAttribute('src')) continue;
      const id = im.dataset.ph;
      let u = urls.get(id);
      if (!u) { try { const b = await get(id); if (b) { u = URL.createObjectURL(b); urls.set(id, u); } } catch (e) { /* 못 읽으면 빈 칸 */ } }
      if (u) im.src = u; else if (im.parentNode) im.parentNode.classList.add('gone');
    }
  }
  return { add, get, del, clear, fill };
})();
