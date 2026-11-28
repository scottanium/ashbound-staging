/* v84q item power (power-notes/DESIGN.md, approved by Scott Nov 27 2026). All numbers live in data/power.json.
   Item Power = levelPower(ilvl) x rarityPower[tier] x awaken stagePower[active stage] x budget (uniques / Ashen).
   Power stats (damage, defense, flat element damage, life, attributes ...) are multiplied by Item Power; utility stats
   (speeds, crit, resists, leech, % multipliers, +skills) only by utilityMul so their caps keep meaning.
   Used by: the stat bag (index.html ua / Zo / Re), the tooltip (Hn / socket lines / base Damage and Defense lines),
   js/ab-compare.js totals, js/ab-uroll.js range text, js/ab-effects.js proc numbers, monster life/damage (index.html ge),
   the drop grade roll (index.html Vo) and the affix top-up for Elite and better (index.html le).
   Off switch: data/power.json enabled:false, or ?power=off on staging. */
(function (root) {
  "use strict";
  var sets = null;
  function D() { return root.ASHBOUND_DATA || {}; }
  function cfg() { return D().power || null; }
  function off() { try { return /(?:^|[?&])power=off(?:&|$)/.test(root.location && root.location.search || ""); } catch (e) { return false; } }
  function on() { var c = cfg(); return !!(c && c.enabled !== false && !off()); }
  function keySets() {
    if (sets) return sets;
    var c = cfg() || {}; sets = { p: {}, u: {} };
    (c.powerStats || []).forEach(function (k) { sets.p[k] = 1; });
    (c.utilityStats || []).forEach(function (k) { sets.u[k] = 1; });
    return sets;
  }
  function tierOf0(item) {
    if (!item) return "common";
    if (root.ABCraft && ABCraft.displayId) { var id = ABCraft.displayId(item); if (id && (cfg().rarityPower || {})[id] != null) return id; }
    var t = item.tier || item.rarity || "common";
    return (cfg().rarityPower || {})[t] != null ? t : "epic";
  }
  /* Scott (Nov 27): only Elder runewords reach Mythical; a normal runeword counts as at most runewords.normalRankCap (Fabled) */
  var RANKS = ["common", "magic", "rare", "elite", "epic", "legendary", "fabled", "mythical"];
  function tierOf(item) {
    var t = tierOf0(item), rw = (cfg() || {}).runewords || {}, cap = rw.normalRankCap;
    if (!cap || !item || !item.runeword) return t;
    var w = (D().runewords || []).find(function (x) { return x.id === item.runeword; });
    if (w && w.elder) return t;
    return RANKS.indexOf(t) > RANKS.indexOf(cap) ? cap : t;
  }
  function levelPower(ilvl) {
    var lp = (cfg() || {}).levelPower || {}, g = lp.growth || 1, a = lp.anchorIlvl || 14, mn = lp.minPower != null ? lp.minPower : 0;
    return Math.max(mn, Math.pow(g, (ilvl || 1) - a));
  }
  function rarityPower(item) { var r = (cfg() || {}).rarityPower || {}, v = r[tierOf(item)]; return v != null ? v : 1; }
  function utilityMul(item) { var r = (cfg() || {}).utilityMul || {}, v = r[tierOf(item)]; return v != null ? v : 1; }
  function isUnique(item) { return !!(item && (item.uniqueId || item.rarity === "unique")); }
  function uniqueDef(item) {
    if (!item || !item.uniqueId) return null;
    var l = D().uniques || []; for (var i = 0; i < l.length; i++) if (l[i].id === item.uniqueId) return l[i];
    return null;
  }
  function isAshen(item) { return !!(item && (item.ashen || (root.ABAshen && ABAshen.isAshen && ABAshen.isAshen(item)))); }
  function budget(item) {
    var b = (cfg() || {}).budget || {}; if (!isUnique(item)) return 1;
    var m = b.unique || 1;
    if (isAshen(item)) { var d = uniqueDef(item); m *= (b.ashen || 1); if (b.ashenDividesOutAshenScale !== false && d && d.ashenScale) m /= d.ashenScale; }
    return m;
  }
  /* awaken: the stage that is fighting now (earned stage, lowered by Suppress and by a Starved item) */
  function activeStage(item) {
    if (!item || !item.awaken) return 0;
    var a = item.awaken, s = Math.max(0, Math.min(a.stage || 0, a.active == null ? (a.stage || 0) : a.active));
    if (a.starved) { var h = (((cfg() || {}).awaken || {}).hunger || {}).starved || {}; s = Math.max(0, s - (h.dropStages || 1)); }
    return s;
  }
  function stagePower(item) { var sp = ((cfg() || {}).awaken || {}).stagePower || [1]; var s = activeStage(item); return sp[Math.min(s, sp.length - 1)] || 1; }
  function itemMul(item) {
    if (!on() || !item) return 1;
    return levelPower(item.ilvl || 1) * rarityPower(item) * stagePower(item) * budget(item);
  }
  function round(orig, v) { return Math.abs(orig - Math.round(orig)) < 1e-9 ? Math.round(v) : Math.round(v * 10) / 10; }
  function mulFor(item, key, P, U) {
    var s = keySets();
    if (s.p[key]) return P;
    if (s.u[key]) return U;
    return 1;
  }
  /* scaled copy of a mod bag ({enhancedDamage: 40, fireDamage: [5, 12], skills: {...}}) for this item */
  function scaleMods(item, mods) {
    if (!mods || !on() || !item) return mods;
    var P = itemMul(item), U = utilityMul(item);
    if (P === 1 && U === 1) return mods;
    var o = {};
    for (var k in mods) {
      var v = mods[k];
      if (k === "skills" || k === "allSkills") { o[k] = v; continue; }
      var m = mulFor(item, k, P, U);
      if (typeof v === "number") o[k] = m === 1 ? v : round(v, v * m);
      else if (Array.isArray(v)) o[k] = v.map(function (x) { return typeof x === "number" && m !== 1 ? round(x, x * m) : x; });
      else o[k] = v;
    }
    return o;
  }
  /* one number of a power stat on this item ("dmg" for weapon damage, "defense") */
  function num(item, key, v) {
    if (!on() || !item || typeof v !== "number") return v;
    var m = key === "dmg" || keySets().p[key] ? itemMul(item) : (keySets().u[key] ? utilityMul(item) : 1);
    return m === 1 ? v : round(v, v * m);
  }
  /* tooltip context: abItemTextHtml sets the item it is drawing; Hn and socket lines scale through it */
  var tipItem = null;
  function tip(mods) { return tipItem ? scaleMods(tipItem, mods) : mods; }
  function withTip(item, fn) { var prev = tipItem; tipItem = item || null; try { return fn(); } finally { tipItem = prev; } }
  /* unique signature effects (js/ab-effects.js scaleNums) */
  function effectMul(item) {
    if (!on() || !item) return 1;
    var e = (cfg() || {}).effect || {}, m = 1;
    if (e.useLevelPower !== false) m *= levelPower(item.ilvl || 1);
    if (e.useStagePower !== false) m *= stagePower(item);
    if (e.sigBonusFromStage != null && activeStage(item) >= e.sigBonusFromStage) m *= (e.sigBonus || 1);
    if (isAshen(item)) { var d = uniqueDef(item), b = (cfg() || {}).budget || {}; if (d && d.effectScale) m *= (b.ashen || 1) / d.effectScale; }
    return m;
  }
  /* monsters (index.html ge): life and damage on top of hp + hpLvl * L */
  function monHp(level) { if (!on()) return 1; var m = (cfg() || {}).monsterScale || {}, a = m.anchorLevel || 14; return level > a ? Math.pow(m.hpGrowth || 1, level - a) : 1; }
  function monDmg(level) { if (!on()) return 1; var m = (cfg() || {}).monsterScale || {}, a = m.anchorLevel || 14; return level > a ? Math.pow(m.dmgGrowth || 1, level - a) : 1; }
  /* drop grades (index.html Vo): the new grades, their chances and their monster-level gates merged over difficulty.json */
  function dropTable(T) {
    if (!on() || !T) return T;
    var d = (cfg() || {}).drops; if (!d) return T;
    if (T.__abPower) return T.__abPower;
    var o = JSON.parse(JSON.stringify(T));
    o.order = d.order || o.order;
    ["base", "magicFind", "boss", "elitePack", "champion"].forEach(function (k) { if (d[k]) o[k] = Object.assign({}, o[k] || {}, d[k]); });
    o.minMlvl = d.minMlvl || {};
    Object.defineProperty(T, "__abPower", { value: o, enumerable: false, configurable: true });
    return o;
  }
  /* the campaign gate only; rifts and White Ash open grades in dropAdj */
  function gradeOpen(T, g, mlvl) { return true; }
  var TOP = { epic: 1, legendary: 1, fabled: 1, mythical: 1 };
  /* Scott Nov 27 10:45 PM: campaign = mostly Elite/Epic + a rare Legendary; Legendary+ scale with rift tier and difficulty.
     p is the table chance for grade g (base + MF + bump). ctx = game state (world.kind/riftTier, player.progress.difficulty). */
  function dropAdj(T, g, p, mlvl, opts, ctx) {
    if (!on() || !TOP[g]) return p;
    var d = (cfg() || {}).drops || {}, w = ctx && ctx.world, diff = (ctx && ctx.player && ctx.player.progress && ctx.player.progress.difficulty) || "normal";
    var dm = (d.difficulty || {})[diff] || {}, dmul = dm[g] != null ? dm[g] : 1, mf = ((ctx && ctx.sheet && ctx.sheet.mf) || 0) / 100;
    opts = opts || {};
    if (w && (w.kind === "rift" || w.id === "rift") && d.rift) {
      var r = d.rift, T0 = w.riftTier || 1, pr;
      if (g === "epic") pr = (r.epicBase || 0) + (r.epicPerTier || 0) * T0;
      else pr = Math.min((r.max || {})[g] || 1, ((r.per || {})[g] || 0) * Math.max(0, T0 - ((r.from || {})[g] || 1) + 1));
      pr *= 1 + (r.magicFindMul == null ? 1 : r.magicFindMul) * mf;
      if (opts.boss) pr *= r.bossMul || 1; else if (opts.elite || opts.champion) pr *= r.packMul || 1;
      return Math.max(0, pr * dmul);
    }
    var mn = (d.minMlvl || {})[g];
    if (g === "fabled" && dm.fabledCampaign && (mlvl || 0) >= (dm.fabledCampaignMinMlvl || 0)) return dm.fabledCampaign * (opts.boss ? 5 : 1);
    if (mn != null && (mlvl || 0) < mn) return 0;
    var rp = (d.ramp || {})[g];
    if (rp) { var f = Math.max(0, Math.min(1, ((mlvl || 0) - rp[0]) / Math.max(1, rp[1] - rp[0]))); p *= 0.25 + 0.75 * f; }
    return Math.max(0, p * dmul);
  }
  /* Ember Rift ladder and difficulty (data/power.json endgame) */
  function eg() { return (cfg() || {}).endgame || {}; }
  function riftTiers() { return on() ? (eg().riftTiers || 12) : 12; }
  function riftMul(T, kind) { if (!on()) return 1; var g = kind === "dmg" ? eg().riftTierDmg : eg().riftTierHp; return g ? Math.pow(g, Math.max(0, (T || 1) - 1)) : 1; }
  function riftMlvl(T) { var r = eg().riftMlvl || {}; return Math.min(r.max || 999, (r.base == null ? 32 : r.base) + (r.perTier == null ? 3 : r.perTier) * Math.max(1, T || 1)); }
  function diffMul(dd, kind) {
    if (!dd) return 1; var base = kind === "dmg" ? dd.dmgMul : dd.hpMul;
    if (!on()) return base || 1;
    var a = (eg().difficultyAdd || {})[dd.id]; var v = a && (kind === "dmg" ? a.dmgMul : a.hpMul);
    return v != null ? v : (base || 1);
  }
  /* affix top-up for Elite and better (index.html le): add affixes from the same pools (level <= ilvl, slot match, one per group) */
  function fillAffixes(item, rng) {
    if (!on() || !item || !Array.isArray(item.affixes)) return item;
    var want = ((cfg() || {}).affixCount || {})[item.rarity] || 0;
    if (!want || item.affixes.length >= want) return item;
    rng = rng || Math.random;
    var pre = D().prefixes || [], suf = D().suffixes || [], used = {};
    item.affixes.forEach(function (a) { var d = pre.concat(suf).find(function (x) { return x.id === a.id; }); used[(d && d.group) || a.group || a.id] = 1; });
    var guard = 0;
    while (item.affixes.length < want && guard++ < 20) {
      var np = item.affixes.filter(function (a) { return a.prefix; }).length, ns = item.affixes.length - np;
      var first = np <= ns ? pre : suf, second = first === pre ? suf : pre, picked = null, isPre = first === pre;
      [first, second].some(function (pool, j) {
        var e = pool.filter(function (a) { return (a.level || 1) <= (item.ilvl || 1) && !used[a.group] && a.slots && (a.slots.indexOf(item.slot) >= 0 || a.slots.indexOf(item.kind) >= 0); });
        if (!e.length) return false;
        picked = e[Math.floor(rng() * e.length)]; isPre = (j === 0) === (first === pre); return true;
      });
      if (!picked) break;
      used[picked.group] = 1;
      item.affixes.push({ id: picked.id, name: picked.name, mods: picked.mods, prefix: isPre, level: picked.level || 1, tier: picked.tier || (root.ABLeData && ABLeData.tierForLevel ? ABLeData.tierForLevel(picked.level) : 1) });
      item.reqLevel = Math.max(item.reqLevel || 1, picked.level || 1);
    }
    return item;
  }
  root.ABPower = { on: on, cfg: cfg, levelPower: levelPower, rarityPower: rarityPower, utilityMul: utilityMul, budget: budget, activeStage: activeStage,
    stagePower: stagePower, itemMul: itemMul, scaleMods: scaleMods, num: num, tip: tip, withTip: withTip, effectMul: effectMul,
    monHp: monHp, monDmg: monDmg, dropTable: dropTable, gradeOpen: gradeOpen, dropAdj: dropAdj, riftTiers: riftTiers, riftMul: riftMul, riftMlvl: riftMlvl, diffMul: diffMul, fillAffixes: fillAffixes, tierOf: tierOf, _reset: function () { sets = null; } };
})(typeof window !== "undefined" ? window : self);
