/* AURA service worker: lets the installed app open instantly and work offline.
   Your own files are fetched fresh when online (so updates show up) and fall back to the saved copy offline.
   Libraries from CDNs and the face model are cached after first use. Sign-in, sync and Derma requests are never cached. */
const VERSION = 'aura-v8';
const SHELL = ['./', './index.html', './css/style.css', './js/app.js', './js/firebase-config.js', './js/lock-config.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png', './favicon.ico'];
const NEVER = /firestore\.googleapis|identitytoolkit|securetoken|googleapis\.com\/(identitytoolkit|v1)|generativelanguage|apis\.google\.com|firebaseapp\.com|accounts\.google/;
const CDN = /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|www\.gstatic\.com\/firebasejs/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || NEVER.test(url.href)) return;
  const same = url.origin === self.location.origin;
  if (same && url.pathname.includes('/vendor/')) return e.respondWith(cacheFirst(req));        // big model files never change
  if (same) return e.respondWith(networkFirst(req));
  if (CDN.test(url.href)) return e.respondWith(cacheFirst(req));                                // versioned libraries
});
async function networkFirst(req) {
  const c = await caches.open(VERSION);
  try { const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; }
  catch { return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? c.match('./index.html') : Response.error()); }
}
async function cacheFirst(req) {
  const c = await caches.open(VERSION), hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res;
}
