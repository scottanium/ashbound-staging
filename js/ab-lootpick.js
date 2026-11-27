// r15 loot picker. Data: data/lootpick.json (+ data/uniques-r15.json merged by js/ab-data.js).
// - pickBase: gear kind first (kindWeights), then a base of that kind near the best one the level allows.
//   The old [ilvl-10, ilvl] window collapsed to a few weapon bases at monster level 19-26 (Act 2).
// - pickUnique / pickSet: kind first, then a def of that kind. Uniques already found are weighted down, never locked out.
// - rollSetAffixes: set pieces get real affixes on top of their set stats, like a rare of the same item level.
// - migrateSave / migrateShared: fill-missing on load (no SAVE_VERSION bump, stays 7) seeds player.uniquesFound from owned uniques and tops up old set pieces.
(function (root) {
  function D() { return root.ASHBOUND_DATA || {}; }
  function cfg() { return D().lootPick || {}; }
  function on() { var c = cfg(); return !!(c && c.enabled !== false && c.kindWeights); }
  function bases() { return D().itemBases || []; }
  function baseOf(id) { var b = bases(); for (var i = 0; i < b.length; i++) if (b[i].id === id) return b[i]; return null; }
  function kindW(kind) { var w = (cfg().kindWeights || {})[kind]; return w == null ? 1 : w; }
  function weighted(rng, list, wf) {
    var tot = 0, ws = [];
    for (var i = 0; i < list.length; i++) { var w = Math.max(0, +wf(list[i]) || 0); ws.push(w); tot += w; }
    if (!list.length) return null;
    if (tot <= 0) return list[Math.floor(rng() * list.length)];
    var r = rng() * tot;
    for (var j = 0; j < list.length; j++) { r -= ws[j]; if (r < 0) return list[j]; }
    return list[list.length - 1];
  }
  function groupByKind(list, kindOf) {
    var g = {}, order = [];
    for (var i = 0; i < list.length; i++) { var k = kindOf(list[i]); if (!k) continue; if (!g[k]) { g[k] = []; order.push(k); } g[k].push(list[i]); }
    return { g: g, kinds: order };
  }
  // base for a drop at level e; opts.slot keeps the old slot filter. null = use the game's old picker.
  function pickBase(e, rng, opts) {
    if (!on()) return null;
    opts = opts || {};
    var lvl = Math.max(1, e | 0), win = cfg().baseWindow != null ? cfg().baseWindow : 10;
    var list = bases().filter(function (b) { return b.ilvl <= lvl && (!opts.slot || b.slot === opts.slot); });
    if (!list.length) return null;
    var gk = groupByKind(list, function (b) { return b.kind; });
    var kind = weighted(rng, gk.kinds, kindW);
    var ofKind = gk.g[kind], top = 0;
    for (var i = 0; i < ofKind.length; i++) top = Math.max(top, ofKind[i].ilvl);
    var near = ofKind.filter(function (b) { return b.ilvl >= top - win; });
    return near[Math.floor(rng() * near.length)];
  }
  function uniqueKind(def) { var b = baseOf(def.baseId); return b ? b.kind : null; }
  function foundBag(player) {
    if (!player) return null;
    if (!player.uniquesFound || typeof player.uniquesFound !== "object") player.uniquesFound = {};
    return player.uniquesFound;
  }
  function player() { return (root.ASHBOUND && ASHBOUND.state && ASHBOUND.state.player) || null; }
  // pool = the game's eligible list (level, boss, rift gates already applied)
  function pickUnique(e, rng, pool, who) {
    if (!on() || !pool || !pool.length) return null;
    var uc = cfg().unique || {}, p = who || player(), found = (p && p.uniquesFound) || {};
    var dw = uc.dupeWeight != null ? uc.dupeWeight : 0.15, dx = uc.dupeWeightPerExtra != null ? uc.dupeWeightPerExtra : 0.5;
    var gap = uc.oldGap != null ? uc.oldGap : 14, ow = uc.oldWeight != null ? uc.oldWeight : 0.5;
    var gk = groupByKind(pool, uniqueKind);
    if (!gk.kinds.length) return null;
    function defW(u) {
      var w = (u.qlvl || 0) < e - gap ? ow : 1, n = found[u.id] || 0;
      if (n > 0) w *= dw * Math.pow(dx, n - 1);
      return w;
    }
    // a kind whose uniques are all found already gets a smaller share, so the next unique is more likely new
    var kind = weighted(rng, gk.kinds, function (k) {
      var list = gk.g[k], best = 0;
      for (var i = 0; i < list.length; i++) best = Math.max(best, defW(list[i]));
      return kindW(k) * Math.min(1, best);
    });
    var def = weighted(rng, gk.g[kind], defW);
    return def;
  }
  function noteFound(def, who) {
    if (!def || cfg().unique && cfg().unique.trackFound === false) return;
    var bag = foundBag(who || player());
    if (bag) bag[def.id] = (bag[def.id] || 0) + 1;
  }
  function pickSet(e, rng, pool) {
    if (!on() || !pool || !pool.length) return null;
    var gk = groupByKind(pool, uniqueKind);
    if (!gk.kinds.length) return null;
    var kind = weighted(rng, gk.kinds, kindW);
    var list = gk.g[kind];
    return list[Math.floor(rng() * list.length)];
  }
  // affixes on set pieces: same pools and rules as a rare (level <= ilvl, slot match, one per group)
  function affixCountFor(item) {
    var t = cfg().setAffixes || {}, id = item.tier || "epic";
    return t[id] != null ? t[id] : 3;
  }
  function rollSetAffixes(item, rng) {
    if (!item || !on() || !(item.setId || item.setItemId)) return item;
    rng = rng || Math.random;
    var want = affixCountFor(item), have = item.affixes = Array.isArray(item.affixes) ? item.affixes : [];
    var used = {}, pre = D().prefixes || [], suf = D().suffixes || [];
    for (var i = 0; i < have.length; i++) {
      var g = findAffix(have[i].id); if (g) used[g.group] = 1;
    }
    var tries = 0;
    while (have.length < want && tries < 16) {
      tries++;
      var np = have.filter(function (a) { return a.prefix; }).length, ns = have.length - np;
      var first = np <= ns ? pre : suf, second = first === pre ? suf : pre;
      var a = rollOne(rng, first, item, used) || rollOne(rng, second, item, used);
      if (!a) break;
      used[a.group] = 1;
      have.push({ id: a.id, name: a.name, mods: a.mods, prefix: pre.indexOf(a) >= 0, level: a.level || 1,
        tier: a.tier || (root.ABLeData && ABLeData.tierForLevel ? ABLeData.tierForLevel(a.level || 1) : 1) });
      item.reqLevel = Math.max(item.reqLevel || 1, a.level || 1);
    }
    item.setRolled = cfg().setRollVersion || 1;
    return item;
  }
  function findAffix(id) {
    var all = (D().prefixes || []).concat(D().suffixes || []);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function rollOne(rng, pool, item, used) {
    var ok = pool.filter(function (a) {
      return (a.level || 1) <= (item.ilvl || 1) && !used[a.group] && a.slots && (a.slots.indexOf(item.slot) >= 0 || a.slots.indexOf(item.kind) >= 0);
    });
    return ok.length ? ok[Math.floor(rng() * ok.length)] : null;
  }
  // ---- save migration: fill-missing, idempotent, SAVE_VERSION stays 7 ----
  function hash(s) { var h = 2166136261 >>> 0; s = String(s || ""); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
  function seeded(seed) { var t = seed >>> 0; return function () { t |= 0; t = t + 1831565813 | 0; var n = Math.imul(t ^ t >>> 15, 1 | t); n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n; return ((n ^ n >>> 14) >>> 0) / 4294967296; }; }
  function fixItem(it, found) {
    if (!it || typeof it !== "object") return;
    if (found && it.uniqueId && !it.ashen && (it.rarity === "unique" || it.uniqueId)) found[it.uniqueId] = Math.max(found[it.uniqueId] || 0, 1);
    if ((it.setId || it.setItemId) && it.rarity === "set" && !it.setRolled) {
      if (!it.slot) { var b = baseOf(it.baseId); if (b) { it.slot = b.slot; it.kind = it.kind || b.kind; } }
      rollSetAffixes(it, seeded(hash((it.uid || "") + "|" + (it.setItemId || "") + "|" + (it.ilvl || 1))));
    }
  }
  function migrateSave(dto) {
    if (!dto || !dto.player || !on()) return dto;
    var had = dto.player.uniquesFound && typeof dto.player.uniquesFound === "object";
    var found = had ? null : (dto.player.uniquesFound = {});
    if (root.ABLeData && ABLeData.eachItem) ABLeData.eachItem(dto, function (it) { fixItem(it, found); });
    return dto;
  }
  function migrateShared(s) {
    if (!s || !on()) return s;
    if (Array.isArray(s.items)) s.items.forEach(function (it) { fixItem(it, null); });
    if (Array.isArray(s.tabs)) s.tabs.forEach(function (t) { (t && t.items || []).forEach(function (it) { fixItem(it, null); }); });
    return s;
  }
  root.ABLootPick = { cfg: cfg, on: on, pickBase: pickBase, pickUnique: pickUnique, noteFound: noteFound, pickSet: pickSet,
    rollSetAffixes: rollSetAffixes, migrateSave: migrateSave, migrateShared: migrateShared };
})(typeof window !== "undefined" ? window : globalThis);
