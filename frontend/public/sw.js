// Estrategia: Network First para API, Cache First para assets estáticos

const CACHE_NAME    = 'novatech-v3';
const STATIC_ASSETS = ['/', '/tienda', '/favicon.svg?v=novatech-1', '/favicon.ico?v=novatech-1', '/icons/icon-192.png', '/icons/icon-512.png'];
const LOCAL_DEVELOPMENT = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('install', (event) => {
  if (LOCAL_DEVELOPMENT) { self.skipWaiting(); return; }
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('novatech-') && (LOCAL_DEVELOPMENT || k !== CACHE_NAME)).map(k => caches.delete(k)))
    ).then(() => LOCAL_DEVELOPMENT ? self.registration.unregister() : undefined)
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (LOCAL_DEVELOPMENT) return;
  const url = new URL(event.request.url);

  // Siempre red para llamadas API
  if (url.pathname.startsWith('/api/')) return;

  // Cache First para assets (imágenes, fuentes, JS, CSS)
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Solo cachear respuestas exitosas y estáticas
          if (response.ok && !url.pathname.startsWith('/api/')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached || new Response('Offline', { status: 503 }));
      })
    );
  }
});
