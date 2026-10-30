// Offline cache: app shell first, fonts and other GETs cached as they're used.
const CACHE = 'minip-v2';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/printer.js', 'js/render.js', 'js/fonts.js', 'js/pixel.js', 'js/vendor/qrcode.js', 'manifest.webmanifest', 'icons/icon.svg'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Network first so edits show up immediately; cache is the offline fallback.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
