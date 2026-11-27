importScripts('./config.js');
const CFG = self.ASHBOUND_CONFIG || {};
const FAMILY = CFG.STAGING ? 'ashbound-staging-' : 'ashbound-pages-';
const CACHE = FAMILY + (CFG.VERSION || 'v52');
// v84m: the cache name follows config.js VERSION (ashbound-staging-v84m on staging), so this build installs a fresh cache and drops v84l.

// r14: cache every painted skill icon listed in data/skill-art.json. Best effort: a missing icon never fails install.
async function cacheSkillArt(cache) {
  try {
    const res = await fetch('./data/skill-art.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const cfg = await res.json();
    const dir = cfg.dir || '';
    const urls = Object.keys(cfg.skills || {}).map((id) => {
      const e = cfg.skills[id];
      return './' + dir + (typeof e === 'string' ? e : e.file);
    });
    await Promise.all(urls.map((u) => cache.add(u).catch(() => null)));
  } catch (err) { /* offline or no art: the game falls back to glyphs */ }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([
    './index.html',
    './config.js',
    './js/ab-data.js',
    './js/ab-safearea.js',
    './js/ab-ashen.js',
    './js/ab-lootpick.js',
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
    './js/ab-reskin.js',
    './js/ab-spawns.js',
    './data/spawns.json',
    './data/reskin.json',
    './data/audio.json',
    './js/ab-ui.js',
    './js/ab-charsheet.js',
    './js/ab-flasks.js',
    './js/ab-invpots.js',
    './js/ab-hudarc.js',
    './js/ab-questui.js',
    './js/ab-skillbar.js',
    './data/skillbar.json',
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
    './js/ab-collide.js',
    './data/collision.json',
    './data/unique-effects.json',
    './data/milestone-curve.json',
    './data/milestones.json',
    './data/consume.json',
    './data/sets.json',
    './data/sustain.json',
    './data/uniques-ashen.json',
    './data/lootpick.json',
    './data/uniques-r15.json',
    './js/ab-sustain.js',
    './js/ab-effects.js',
    './js/ab-consume.js',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png',
    './data/skill-art.json',
    './js/ab-skillart.js',
    './data/skill-fx.json',
    './js/ab-skillfx.js',
    // v84m zone graphics (painted Reed Marsh set, time of day) + FPS readout
    './js/ab-zonegfx.js',
    './data/zonegfx.json',
    './js/ab-fps.js',
    './data/perfhud.json',
    './assets/zonegfx/mere/arch.webp',
    './assets/zonegfx/mere/backdrop.webp',
    './assets/zonegfx/mere/bankside.webp',
    './assets/zonegfx/mere/banktop.webp',
    './assets/zonegfx/mere/banner.webp',
    './assets/zonegfx/mere/bones.png',
    './assets/zonegfx/mere/crate.webp',
    './assets/zonegfx/mere/detail.webp',
    './assets/zonegfx/mere/lantern.webp',
    './assets/zonegfx/mere/lily.webp',
    './assets/zonegfx/mere/marker.webp',
    './assets/zonegfx/mere/moss.webp',
    './assets/zonegfx/mere/mud.webp',
    './assets/zonegfx/mere/mudsplat.png',
    './assets/zonegfx/mere/path.webp',
    './assets/zonegfx/mere/pedestal.webp',
    './assets/zonegfx/mere/planks.png',
    './assets/zonegfx/mere/puddle.png',
    './assets/zonegfx/mere/reeds1.webp',
    './assets/zonegfx/mere/reeds2.webp',
    './assets/zonegfx/mere/ripple.webp',
    './assets/zonegfx/mere/rock1.webp',
    './assets/zonegfx/mere/roots.png',
    './assets/zonegfx/mere/scum.png',
    './assets/zonegfx/mere/sedge.webp',
    './assets/zonegfx/mere/shrine.webp',
    './assets/zonegfx/mere/silt.webp',
    './assets/zonegfx/mere/stone.webp',
    './assets/zonegfx/mere/stones.png',
    './assets/zonegfx/mere/tree1.webp',
    './assets/zonegfx/mere/tree2.webp',
    './assets/zonegfx/mere/tree3.webp',
    './assets/zonegfx/mere/waterbed.webp',
    './assets/zonegfx/mere/waypoint.webp',
  ]).then(() => cacheSkillArt(cache))));
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
