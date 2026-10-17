// Service worker mínimo: guarda la "cáscara" de la app para que cargue rápido y abra sin red.
// Nunca guarda datos de Firebase (siempre van a la red).
const V = 'kiosko-v1';
const SHELL = ['./', 'index.html', 'css/styles.css', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // Red primero; si falla, lo que haya en caché
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone(); caches.open(V).then(c => c.put(e.request, copia)).catch(() => {}); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
