// Service Worker: hält die App-Oberfläche offline verfügbar.
// Offline-Oberfläche ≠ Offline-Funktion: Web-Quellen und KI brauchen Internet, Bluetooth braucht die Geräte.
// Bei Änderungen an Dateien VERSION erhöhen, damit Nutzer die neue Fassung bekommen.

const VERSION = 'magichub-0.2.1';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './vendor/godice.js',
  './js/main.js', './js/print-layout.js', './js/stacks.js', './js/config.js', './js/platform.js', './js/bluefy.js', './js/hub.js', './js/render.js',
  './js/ble/base.js', './js/ble/godice.js', './js/ble/davinci.js', './js/ble/ultrasharpie.js',
  './js/ble/peeksmith.js', './js/ble/selfiescreen.js', './js/ble/peripage.js',
  './js/web/sources.js', './js/ai/vision.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Nur eigene Dateien: erst Netz (frische Fassung), bei Fehler Cache. Fremde Anfragen (APIs) nie anfassen.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    // cache: 'no-cache' → beim Server nachfragen (ETag), statt bis zu 10 min alte Dateien aus dem HTTP-Cache zu nehmen.
    fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
