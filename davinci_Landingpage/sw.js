// Versionsnummer kommt aus version.js: Ändert sie sich, lädt der Browser diesen Service Worker neu
// und holt alle Dateien frisch vom Server.
importScripts('./version.js');
const CACHE_NAME = 'davinci-v' + APP_VERSION;
const ASSETS = [
  './',
  './index.html',
  './app.html',
  './style.css',
  './app.js',
  './i18n.js',
  './version.js',
  './godice.js',
  './manifest.json',
  './icon.svg',
  './fflate.js'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Pre-caching assets');
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Requests (Cache-First with Network Fallback)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const url = new URL(event.request.url);
          if (url.origin === self.location.origin || url.hostname.includes('cdnjs.cloudflare.com')) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
        }
        return networkResponse;
      }).catch(err => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
