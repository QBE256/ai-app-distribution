const prefix = 'weather-voice-shell-';
const cacheName = prefix + 'v3';
const shell = ['./index.html', './style.css', './app.js', './forecast.js', './manifest.webmanifest', './icon-192.png', './icon-512.png']
  .map((path) => new URL(path, self.registration.scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    await cache.addAll(shell.map((asset) => new Request(asset, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(prefix) && key !== cacheName)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  const asset = url.href === self.registration.scope ? shell[0] : url.href;
  if (!shell.includes(asset)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    let response;
    try {
      response = await fetch(event.request, { cache: 'no-cache' });
    } catch {
      return await cache.match(asset) || Response.error();
    }
    if (response.ok) {
      await cache.put(asset, response.clone()).catch(() => {});
      return response;
    }
    return await cache.match(asset) || response;
  })());
});
