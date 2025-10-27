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
  // Ignoramos solicitudes a ciertos dominios como Firebase y Google APIs
  const url = new URL(event.request.url);
  if (
    event.request.url.includes('firebase') ||
    event.request.url.includes('googleapis.com') ||
    url.pathname === '/manifest.json'
  ) {
    return fetch(event.request); // No usamos caché para estas solicitudes
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Si encontramos el recurso en la caché, lo devolvemos
      if (response) {
        return response;
      }

      const fetchRequest = event.request.clone();

      return fetch(fetchRequest).then(
        (response) => {
          // Si no obtenemos una respuesta válida, retornamos
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const responseToCache = response.clone();

          // Guardamos el nuevo recurso en la caché
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        },
        (error) => {
          // Si ocurre un error con la red, mostramos una página offline
          console.log('Fetch failed; returning offline page', error);
          return caches.match('/offline.html'); // Aquí puedes agregar una página de error offline
        }
      );
    })
  );
});
