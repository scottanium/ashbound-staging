importScripts('./config.js');
const CFG = self.ASHBOUND_CONFIG || {};
const FAMILY = CFG.STAGING ? 'ashbound-staging-' : 'ashbound-pages-';
const CACHE = FAMILY + (CFG.VERSION || 'v51');

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([
    './index.html',
    './config.js',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png',
  ])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Only clean up this build's own family, so live and staging never delete each other's cache.
    await Promise.all(keys.filter((key) => key.startsWith(FAMILY) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(req);
      cache.put(req, fresh.clone());
      return fresh;
    } catch {
      const cached = await cache.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        return cache.match(new URL('./index.html', self.registration.scope));
      }
      throw new Error('offline');
    }
  })());
});
