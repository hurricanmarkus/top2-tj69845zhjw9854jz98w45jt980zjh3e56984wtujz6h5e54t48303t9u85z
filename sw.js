// // @ts-check
// Dieser Service Worker wird benötigt, um die App installierbar zu machen (PWA).
// Er hat aktuell keine Offline-Funktionalität.

self.addEventListener('install', (event) => {
  console.log('Service Worker installing.');
});

self.addEventListener('fetch', (event) => {
  // Leerer Fetch-Listener, damit die App als PWA erkannt wird.
});