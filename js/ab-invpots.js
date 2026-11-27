/* Ashbound invpots: compact item sizes, pickup priority, and the save step for both.
   - Item sizes: data/inventory-layout.json itemSizes. Gear shrinks to its slot size (weapons with a tall base use
     longWeapon). Each side is min(old, new), so items never grow and old saves never overlap.
   - Pack grid size: data/inventory-layout.json pack {w,h}; a saved Pack only ever grows to it.
   - Pickup priority: unique/set first, then rank (mythical ... common), then item level, then the nearest.
     Gems, runes, materials and charms rank below gear; gold and potions last (they pick up on their own).
   - migrateSave: resizes every item the save holds (pack, stash tabs, cube, gear, ground) and re-packs any
     container whose items shrank (largest first). If a re-pack ever fails the shrunk items keep their old spots,
     which always fit, so nothing is lost and nothing overflows. */
(function (root) {
  "use strict";
  var RANKS = ["common", "magic", "rare", "elite", "epic", "legendary", "fabled", "mythical"];

  function layout() { var d = root.ASHBOUND_DATA || {}; return d.inventoryLayout || {}; }
  function sizesCfg() { return layout().itemSizes || null; }
  function packDims() {
    var p = layout().pack || {};
    var w = +p.w, h = +p.h;
    return { w: isFinite(w) && w >= 4 ? Math.floor(w) : 10, h: isFinite(h) && h >= 3 ? Math.floor(h) : 6 };
  }
  // target size for a gear base / item, or null when the item keeps its own size
  function target(slot, baseH) {
    var c = sizesCfg();
    if (!c || c.enabled === false || !slot) return null;
    var lw = c.longWeapon;
    if (slot === "weapon" && lw && baseH >= (lw.minBaseH || 4) && Array.isArray(lw.size)) return lw.size;
    var s = (c.bySlot || {})[slot];
    return Array.isArray(s) && s.length === 2 ? s : null;
  }
  function baseSize(base) {
    var w = (base && base.w) || 1, h = (base && base.h) || 1;
    var t = base && !base.jewelryCharm ? target(base.slot, h) : null;
    return t ? { w: Math.max(1, Math.min(w, t[0])), h: Math.max(1, Math.min(h, t[1])) } : { w: w, h: h };
  }
  function baseH(it) {
    var bases = (root.ASHBOUND_DATA && root.ASHBOUND_DATA.itemBases) || [];
    for (var i = 0; i < bases.length; i++) if (bases[i] && bases[i].id === it.baseId) return bases[i].h || it.h || 1;
    return it.h || 1;
  }
  // shrink one item in place; true when it changed
  function resizeItem(it) {
    if (!it || it.charm || !it.slot) return false;
    if (it.rarity === "potion" || it.rarity === "gold" || it.rarity === "gem" || it.rarity === "rune" || it.rarity === "material" || it.rarity === "lens") return false;
    var t = target(it.slot, baseH(it));
    if (!t) return false;
    var w = it.w || 1, h = it.h || 1;
    var nw = Math.max(1, Math.min(w, t[0])), nh = Math.max(1, Math.min(h, t[1]));
    if (nw === w && nh === h) return false;
    it.w = nw; it.h = nh;
    return true;
  }
  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function fits(grid, placed, it, x, y) {
    if (x < 0 || y < 0 || x + it.w > grid.w || y + it.h > grid.h) return false;
    var r = { x: x, y: y, w: it.w, h: it.h };
    for (var i = 0; i < placed.length; i++) if (overlaps(r, placed[i])) return false;
    return true;
  }
  // largest first, then item level; all-or-nothing
  function repack(grid) {
    if (!grid || !Array.isArray(grid.items) || !grid.w || !grid.h) return false;
    var order = grid.items.slice().sort(function (a, b) { return (b.w * b.h) - (a.w * a.h) || (b.ilvl || 0) - (a.ilvl || 0); });
    var placed = [], spots = [];
    for (var k = 0; k < order.length; k++) {
      var it = order[k], done = false;
      for (var y = 0; y <= grid.h - it.h && !done; y++) for (var x = 0; x <= grid.w - it.w && !done; x++) {
        if (fits(grid, placed, it, x, y)) { placed.push({ x: x, y: y, w: it.w, h: it.h }); spots.push([it, x, y]); done = true; }
      }
      if (!done) return false;
    }
    spots.forEach(function (s) { s[0].x = s[1]; s[0].y = s[2]; });
    return true;
  }
  function containers(p) {
    var out = [];
    if (!p) return out;
    if (p.inventory) out.push(p.inventory);
    if (p.stash) out.push(p.stash);
    if (p.stashTabs && Array.isArray(p.stashTabs.tabs)) p.stashTabs.tabs.forEach(function (t) { if (t && out.indexOf(t) < 0) out.push(t); });
    if (p.cube) out.push(p.cube);
    return out;
  }
  function migrateSave(e) {
    var p = e && e.player;
    if (!p) return e;
    var c = sizesCfg();
    if (c && c.enabled !== false) {
      containers(p).forEach(function (g) {
        var changed = false;
        (g.items || []).forEach(function (it) { if (resizeItem(it)) changed = true; });
        if (changed) repack(g);
      });
      Object.values(p.equipment || {}).forEach(resizeItem);
      Object.values((p.hireling && p.hireling.equipment) || {}).forEach(resizeItem);
      (p.companions || []).forEach(function (m) { Object.values((m && m.equipment) || {}).forEach(resizeItem); });
      if (p.consume) resizeItem(p.consume);
      ((e.world && e.world.loots) || []).forEach(function (l) { l && resizeItem(l.item); });
    }
    var d = packDims();
    if (p.inventory) {
      if (!(p.inventory.w >= d.w)) p.inventory.w = d.w;
      if (!(p.inventory.h >= d.h)) p.inventory.h = d.h;
    }
    p.invpots = 1;
    return e;
  }
  function migrateShared(sh) {
    var c = sizesCfg();
    if (!sh || !Array.isArray(sh.items) || !c || c.enabled === false) return sh;
    var changed = false;
    sh.items.forEach(function (it) { if (resizeItem(it)) changed = true; });
    if (changed) repack(sh);
    return sh;
  }
  if (root.ABLeData && root.ABLeData.migrateShared && !root.ABLeData.__invpots) {
    var orig = root.ABLeData.migrateShared;
    root.ABLeData.migrateShared = function (sh) { var r = orig.apply(this, arguments); migrateShared(sh); return r; };
    root.ABLeData.__invpots = true;
  }

  // ---- pickup priority ----
  function family(it) {
    if (root.ABCraft && root.ABCraft.family) { try { return root.ABCraft.family(it); } catch (x) { /* fall through */ } }
    if (it.uniqueId || it.rarity === "unique") return "unique";
    if (it.setId || it.setItemId || it.rarity === "set") return "set";
    return "normal";
  }
  function score(it) {
    if (!it) return -1;
    var r = it.rarity;
    if (r === "gold") return 0;
    if (r === "potion") return 1;
    if (!it.slot && !it.charm) return 2; // gems, runes, materials, lenses
    var fam = family(it);
    var rank = RANKS.indexOf(it.tier);
    if (rank < 0) rank = RANKS.indexOf(r);
    if (rank < 0) rank = 0;
    return (fam === "unique" || fam === "set" ? 100 : 10) + rank;
  }
  // is loot a (distance da) a better pick than loot b (distance db)?
  function better(a, da, b, db) {
    if (!b) return true;
    var ia = a.item || a, ib = b.item || b;
    var sa = score(ia), sb = score(ib);
    if (sa !== sb) return sa > sb;
    var la = ia.ilvl || 0, lb = ib.ilvl || 0;
    if (la !== lb) return la > lb;
    return da < db;
  }
  // best loot within maxD of (x,y); dist(loot) optional
  function pickBest(loots, x, y, maxD, skipGold) {
    var best = null, bd = Infinity;
    (loots || []).forEach(function (l) {
      if (!l || !l.item) return;
      if (skipGold && l.item.rarity === "gold") return;
      var d = Math.hypot(l.x - x, l.y - y);
      if (d >= maxD) return;
      if (better(l, d, best, bd)) { best = l; bd = d; }
    });
    return best;
  }
  // walk-over potion pickup: true when this potion should be pulled in (belt has room for its type)
  function autoPotion(player, loot) {
    var f = ((root.ASHBOUND_DATA && root.ASHBOUND_DATA.ui) || {}).flasks || {};
    if (f.autoPickup === false) return false;
    var it = loot && loot.item;
    if (!it || it.rarity !== "potion" || !root.ABFlasks || !root.ABFlasks.room) return false;
    return root.ABFlasks.room(player, it) > 0;
  }

  root.ABInvPots = {
    baseSize: baseSize, resizeItem: resizeItem, repack: repack, packDims: packDims, migrateSave: migrateSave,
    migrateShared: migrateShared, score: score, better: better, pickBest: pickBest, autoPotion: autoPotion
  };
})(typeof window !== "undefined" ? window : globalThis);
