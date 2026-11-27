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
    './js/ab-safearea.js',
    './js/ab-ashen.js',
    './js/ab-craft.js',
    './js/ab-bus.js',
    './js/ab-physics.js',
    './js/ab-ledata.js',
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
    './data/town-layout.json',
    './data/camera.json',
    './data/icons.json',
    './js/ab-icons.js',
    './js/ab-uiart.js',
    './js/ab-leui.js',
    './js/ab-legame.js',
    './js/ab-ledrag.js',
    './js/ab-lestash.js',
    './js/ab-lemats.js',
    './js/ab-lefilter.js',
    './data/ui-art.json',
    './data/stash.json',
    './data/lootfilter.json',
    './assets/ui/chrome@2x.webp',
    './assets/ui/items@2x.webp',
    './assets/ui/items@1x.webp',
    './assets/ui/doll.webp',
    './assets/ui/panel_bg.webp',
    './assets/fonts/cinzel.woff2',
    './assets/fonts/marcellus-sc.woff2',
    './data/props3d.json',
    './js/ab-props3d.js',
    './js/ab-zones.js',
    './data/zones.json',
    './data/ui.json',
    './data/stats.json',
    './data/skilltree-ui.json',
    './data/guide.json',
    './data/questui.json',
    './data/feel.json',
    './js/ab-feel.js',
    './js/ab-itemtip.js',
    './js/ab-itembox.js',
    './js/ab-ui.js',
    './js/ab-charsheet.js',
    './js/ab-flasks.js',
    './js/ab-hudarc.js',
    './js/ab-questui.js',
    './data/progress.json',
    './js/ab-progress.js',
    './js/ab-skilltree.js',
    './data/skilltrees-common.json',
    './data/skilltrees-warden.json',
    './data/skilltrees-reaver.json',
    './js/ab-tree-reaver.js',
    './data/skilltrees-chanter.json',
    './js/ab-tree-chanter.js',
    './data/skilltrees-caller.json',
    './js/ab-tree-caller.js',
    './data/skilltrees-stalker.json',
    './js/ab-tree-stalker.js',
    './js/ab-hero2.js',
    './data/models-hd.json',
    './js/ab-heroreal.js',
    './data/heroes-real.json',
    './js/ab-enemyreal.js',
    './data/enemies-real.json',
    './js/ab-panelscroll.js',
    './js/ab-testtools.js',
    './js/ab-move.js',
    './data/unique-effects.json',
    './data/milestone-curve.json',
    './data/milestones.json',
    './data/consume.json',
    './data/sets.json',
    './data/sustain.json',
    './data/uniques-ashen.json',
    './js/ab-sustain.js',
    './js/ab-effects.js',
    './js/ab-consume.js',
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
