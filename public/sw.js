const CACHE_NAME = 'cargarg-cache-v5';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/sw.js', // Asegúrate de que sw.js esté en el cache
];

// Durante la instalación, pre-cacheamos los recursos importantes
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching offline page');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Durante la activación, eliminamos cachés antiguos
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName); // Borra cachés obsoletos
          }
        })
      );
    }).then(() => self.clients.claim()) // Asegura que el SW controle todas las páginas abiertas
  );
});

// Durante las solicitudes de red, manejamos la caché y la red
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1) No interceptar peticiones de otros orígenes (evita CORS/HTML como JS)
  if (url.origin !== self.location.origin) {
    return; // dejar que el navegador maneje la solicitud
  }

  // 2) Ignorar manifest
  if (url.pathname === '/manifest.json') {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // Cache-first para recursos de mismo origen
        const cached = await caches.match(event.request);
        if (cached) return cached;

        const resp = await fetch(event.request);
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, resp.clone());
        }
        return resp;
      } catch (err) {
        // Offline fallback sólo para navegaciones
        if (event.request.mode === 'navigate') {
          const offline = await caches.match('/offline.html');
          if (offline) return offline;
        }
        throw err;
      }
    })()
  );
});
