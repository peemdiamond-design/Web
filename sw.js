// PEEMCN25 service worker: ทำให้ติดตั้งเป็นแอปได้ และเปิดได้แม้เน็ตหลุด
// หน้าเว็บ = network-first (ได้เวอร์ชันล่าสุดเสมอ), ไฟล์รูป/ไอคอนในเว็บ = cache-first · ไม่แตะ API ภายนอก
const CACHE = 'peemcn25-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/images/Code_Generated_Image.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('/', copy)); return r; }).catch(() => caches.match('/')));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; })));
});
