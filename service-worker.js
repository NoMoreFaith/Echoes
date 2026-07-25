const CACHE_NAME = 'echoes-app-v24';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=23',
  './app.js?v=24',
  './npcs.js?v=21',
  './library-core.js?v=21',
  './library-storage.js?v=21',
  './monsters.js',
  './spells.js',
  './manifest.webmanifest',
  './HELP.md',
  './monster-template.json',
  './assets/Echoes.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fresh = fetch(event.request).then(response => {
        if (response && response.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || fresh;
    })
  );
});
