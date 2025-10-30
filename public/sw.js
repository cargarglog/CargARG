// CargARG PWA — Service Worker (deduplicated)
const CACHE_NAME = 'cargarg-cache-v8';
const PRECACHE_ASSETS = [
  '/offline.html',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/sw.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => k !== CACHE_NAME ? caches.delete(k) : undefined));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/manifest.json') return;
  if (url.pathname.startsWith('/__/auth')) return; // do not intercept Firebase Auth

  const dest = event.request.destination;
  if (dest === 'document' || dest === 'script' || dest === 'style' || dest === 'worker') {
    event.respondWith((async () => {
      try {
        const resp = await fetch(event.request, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, resp.clone());
        return resp;
      } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (dest === 'document') {
          const offline = await caches.match('/offline.html');
          if (offline) return offline;
        }
        throw err;
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const resp = await fetch(event.request);
    try {
      if (resp && resp.status === 200 && (resp.type === 'basic' || resp.type === 'default')) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, resp.clone());
      }
    } catch {}
    return resp;
  })());
});
