// // @ts-check
const SW_VERSION = 'top2-v20260402-8';

const APP_CACHE = `${SW_VERSION}-app`;
const ASSET_CACHE = `${SW_VERSION}-assets`;

const APP_SHELL_URLS = [
  '/',
  '/index.html',
  '/index.html?source=pwa',
  '/manifest.json',
  '/manifest.json?v=20260402-8',
  '/style.css'
];

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function notificationUrlFromData(data = {}) {
  const url = String(data.url || '/index.html?view=einkaufsliste').trim();
  return url || '/index.html?view=einkaufsliste';
}

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

self.addEventListener('push', (event) => {
  const raw = event.data ? event.data.text() : '{}';
  const payload = safeJson(raw) || {};
  const title = payload.title || 'Einkaufsliste';
  const body = payload.body || 'Es gibt neue Änderungen in deiner Einkaufsliste.';
  const data = payload.data || {};
  const options = {
    body,
    icon: 'https://placehold.co/192x192/4f46e5/ffffff?text=T2',
    badge: 'https://placehold.co/192x192/4f46e5/ffffff?text=T2',
    tag: payload.tag || `einkaufsliste-${data.listId || 'general'}`,
    renotify: payload.renotify === true,
    data: {
      ...data,
      url: notificationUrlFromData(data)
    },
    actions: Array.isArray(payload.actions) ? payload.actions : []
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  let url = notificationUrlFromData(data);
  if (event.action === 'open-notify') {
    url = String(data.notifyUrl || data.url || '/index.html?view=einkaufsliste&mode=notify').trim();
  }
  event.waitUntil((async () => {
    const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if ('focus' in client) {
        try {
          await client.navigate(url);
        } catch {}
        await client.focus();
        return;
      }
    }
    if (clients.openWindow) {
      await clients.openWindow(url);
    }
  })());
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