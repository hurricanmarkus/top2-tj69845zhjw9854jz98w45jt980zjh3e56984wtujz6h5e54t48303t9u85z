// // @ts-check
// Dieser Service Worker wird benötigt, um die App installierbar zu machen (PWA).
// Er hat aktuell keine Offline-Funktionalität.

self.addEventListener('install', (event) => {
  console.log('Service Worker installing.');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (e) {
      console.error('Service Worker activate cache cleanup failed:', e);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isHtml = req.mode === 'navigate' || url.pathname.endsWith('.html');
  const isJs = url.pathname.endsWith('.js');
  const isCss = url.pathname.endsWith('.css');

  if (isSameOrigin && (isHtml || isJs || isCss)) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // Standard: normal weiterlaufen lassen
});