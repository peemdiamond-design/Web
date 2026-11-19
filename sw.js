// PEEMCN25 service worker: ติดตั้งเป็นแอปได้ และเปิดได้แม้เน็ตหลุด
// หน้าเว็บ + CSS/JS = network-first (ได้เวอร์ชันล่าสุดเสมอ) · รูป/ไอคอน = cache-first · ไม่แตะ API ภายนอก
const CACHE = 'peemcn25-v4';
const SHELL = ['/', '/assets/css/site.css?v=4', '/assets/js/app.js?v=4', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const networkFirst = (req, key) => fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key || req, copy)); } return r; }).catch(() => caches.match(key || req));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) { e.respondWith(networkFirst(req, '/')); return; }
  if (/\.(css|js|webmanifest)$/.test(url.pathname)) { e.respondWith(networkFirst(req)); return; }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; })));
});
