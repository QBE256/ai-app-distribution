const cachePrefix = 'ai-app-factory-counter-';
const cacheName = cachePrefix + 'v1';
const scope = self.registration.scope;
const indexUrl = new URL('index.html', scope).href;
const staticUrls = ['index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png']
  .map((path) => new URL(path, scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName)
    .then((cache) => cache.addAll(staticUrls))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys
      .filter((key) => key.startsWith(cachePrefix) && key !== cacheName)
      .map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  url.search = '';
  const assetUrl = url.href === scope ? indexUrl : url.href;
  if (!staticUrls.includes(assetUrl)) return;

  event.respondWith(caches.open(cacheName)
    .then((cache) => cache.match(assetUrl))
    .then((response) => response || fetch(event.request)));
});
