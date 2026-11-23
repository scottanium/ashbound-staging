importScripts('./config.js');
const CFG = self.ASHBOUND_CONFIG || {};
const FAMILY = CFG.STAGING ? 'ashbound-staging-' : 'ashbound-pages-';
const CACHE = FAMILY + (CFG.VERSION || 'v52');

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([
    './index.html',
    './config.js',
    './js/ab-data.js',
    './js/ab-craft.js',
    './js/ab-bus.js',
    './js/ab-physics.js',
    './js/ab-save.js',
    './js/ab-ai.js',
    './js/ab-render.js',
    './data/tune.json',
    './data/models.json',
    './data/classes.json',
    './data/skills.json',
    './data/content.json',
    './data/monsters.json',
    './data/items.json',
    './data/rarity.json',
    './data/telling.json',
    './data/characters.json',
    './data/npc-lines.json',
    './data/difficulty.json',
    './data/inventory-layout.json',
    './data/camera.json',
    './data/icons.json',
    './js/ab-icons.js',
    './data/props3d.json',
    './js/ab-props3d.js',
    './data/ui.json',
    './data/guide.json',
    './js/ab-ui.js',
    './js/ab-hudarc.js',
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
