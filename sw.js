// // @ts-check
const SW_VERSION = 'top2-v20260317-1';

const APP_CACHE = `${SW_VERSION}-app`;
const ASSET_CACHE = `${SW_VERSION}-assets`;

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/index.html?source=pwa',
  '/manifest.json',
  '/manifest.json?v=20260317-1',
  '/style.css'
];

function isCacheableResponse(response) {
  return Boolean(response && response.ok && (response.type === 'basic' || response.type === 'default'));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    await cache.addAll(APP_SHELL_URLS);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key !== APP_CACHE && key !== ASSET_CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === '/version.json') {
    return;
  }

  const destination = request.destination;
  const isAppCode = request.mode === 'navigate' || ['script', 'style', 'document', 'manifest', 'worker'].includes(destination);

  if (isAppCode) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request, { cache: 'no-store' });
        if (isCacheableResponse(networkResponse)) {
          const cache = await caches.open(APP_CACHE);
          await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) return cachedResponse;
        const shellResponse = await caches.match('/index.html?source=pwa') || await caches.match('/index.html') || await caches.match('/');
        if (shellResponse) return shellResponse;
        throw error;
      }
    })());
    return;
  }

  if (['image', 'font'].includes(destination)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        fetch(request)
          .then((networkResponse) => {
            if (isCacheableResponse(networkResponse)) {
              cache.put(request, networkResponse.clone());
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      const networkResponse = await fetch(request);
      if (isCacheableResponse(networkResponse)) {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })());
  }
});