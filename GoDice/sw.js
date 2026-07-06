const CACHE_NAME = 'godice-dashboard-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './godice.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install Service Worker and cache all local assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching all static assets...');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate and clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Cleaning up old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch events: Stale-While-Revalidate strategy
self.addEventListener('fetch', (event) => {
  // Only handle local HTTP/S requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update to keep cache fresh
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
            }
          })
          .catch((err) => console.log('[Service Worker] Background fetch failed (probably offline):', err));
          
        return cachedResponse;
      }

      // Fallback to network if not in cache
      return fetch(event.request);
    })
  );
});
