// 2학년 교재 게임 잠금 풀기: g2·book 아래 요청을 locked/<경로 해시>.bin 에서 받아 열쇠로 풀어 돌려준다(열쇠는 열쇠 페이지가 IndexedDB에 넣음)
const BASE = '/sdg-worlds/', LOCKED = ['g2', 'book'];
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4', svg: 'image/svg+xml' };
async function name(rel) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rel)); return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24); }
function keyStore(mode, fn) {
  return new Promise((res) => {
    const r = indexedDB.open('sdg-lock', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('k');
    r.onsuccess = () => { const q = fn(r.result.transaction('k', mode).objectStore('k')); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); };
    r.onerror = () => res(null);
  });
}
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || !u.pathname.startsWith(BASE) || e.request.method !== 'GET') return;
  let rel = decodeURIComponent(u.pathname.slice(BASE.length));
  const top = rel.split('/')[0];
  if (!LOCKED.includes(top) || rel === top) return;
  if (rel.endsWith('/')) rel += 'index.html';
  e.respondWith(serve(e.request, rel, u));
});
async function serve(req, rel, u) {
  // 열쇠가 없으면 열쇠 페이지로(열쇠 페이지 자체는 그대로 받아 온다)
  const toLock = () => rel === 'g2/index.html' ? fetch(req) : Response.redirect(BASE + 'g2/?next=' + encodeURIComponent(u.pathname + u.search), 302);
  const key = await keyStore('readonly', (s) => s.get('key'));
  if (!key) return toLock();
  const r = await fetch(BASE + 'locked/' + await name(rel) + '.bin');
  if (!r.ok) return new Response('없는 파일이에요', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const buf = new Uint8Array(await r.arrayBuffer());
  let body;
  try { body = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12)); }
  catch (e) { await keyStore('readwrite', (s) => s.delete('key')); return toLock(); }   // 열쇠가 바뀌었으면 다시 받는다
  const type = TYPES[rel.split('.').pop()] || 'application/octet-stream';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  if (m && (m[1] || m[2])) {   // 영상은 부분 요청을 보낸다
    const size = body.byteLength, start = m[1] ? +m[1] : Math.max(0, size - +m[2]), end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    return new Response(body.slice(start, end + 1), { status: 206, headers: { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes' } });
  }
  return new Response(body, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
}
