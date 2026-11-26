/* le-ui (v85) save data: affix tiers, and later stash tabs, Temper, Ashmarks, makings and the loot filter.
   Save VERSION 7 (js/ab-save.js) calls ABLeData.migrateSave(e) on every load; each step only fills what is missing,
   so a v1-v6 save loads with nothing lost and loading a v7 save again changes nothing. Numbers live in data/*.json. */
(function (root) {
  "use strict";
  var FALLBACK_TIERS = [[1, 1], [3, 2], [5, 3], [7, 4], [9, 5], [12, 6], [14, 7]];
  function D() { return root.ASHBOUND_DATA || {}; }
  function tierTable() { var t = D().affixTiers; return t && Array.isArray(t.byLevel) && t.byLevel.length ? t.byLevel : FALLBACK_TIERS; }
  function tierForLevel(level) {
    var l = Math.max(1, Number(level) || 1), t = 1;
    tierTable().forEach(function (row) { if (l >= row[0]) t = row[1]; });
    return t;
  }
  var poolIndex = null;
  function pool(id) {
    if (!poolIndex) {
      poolIndex = {};
      (D().prefixes || []).concat(D().suffixes || []).forEach(function (a) { if (a && a.id) poolIndex[a.id] = a; });
    }
    return poolIndex[id] || null;
  }
  // tier of a rolled affix: stored value, else its pool entry, else its level. Unique/fixed mod lines (no id, no level) have none.
  function tierOf(affix) {
    if (!affix) return 0;
    if (affix.tier >= 1 && affix.tier <= 7) return affix.tier | 0;
    var p = affix.id && pool(affix.id);
    if (p && p.tier) return p.tier;
    if (p) return tierForLevel(p.level);
    if (affix.level) return tierForLevel(affix.level);
    return 0;
  }
  function eachItem(e, fn) {
    var t = e && e.player; if (!t) return;
    var lists = [t.inventory && t.inventory.items, t.stash && t.stash.items, t.cube && t.cube.items, t.belt];
    if (t.stashTabs && Array.isArray(t.stashTabs.tabs)) t.stashTabs.tabs.forEach(function (tab) { if (tab !== t.stash) lists.push(tab && tab.items); });
    lists.forEach(function (l) { (l || []).forEach(function (it) { it && fn(it); }); });
    Object.values(t.equipment || {}).forEach(function (it) { it && fn(it); });
    Object.values(t.hireling && t.hireling.equipment || {}).forEach(function (it) { it && fn(it); });
    (t.companions || []).forEach(function (c) { Object.values(c && c.equipment || {}).forEach(function (it) { it && fn(it); }); });
    if (t.consume) fn(t.consume);
    ((e.world && e.world.loots) || []).forEach(function (l) { l && l.item && fn(l.item); });
  }
  // ---- Temper + Ashmarks (step 17): stamped once at drop (index.html wraps the item makers) and on load for old items
  var NOGEAR = { gem: 1, rune: 1, lens: 1, material: 1, potion: 1, gold: 1, charm: 0 };
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function isGear(it) { return !!(it && it.slot && !NOGEAR[it.rarity] && it.baseId); }
  function stampItem(it) {
    if (!isGear(it)) return it;
    var fam = it.rarity === "unique" || it.rarity === "set", h = hash((it.uid || "") + "|" + it.baseId + "|" + (it.ilvl || 1));
    if (fam) {
      delete it.temper; delete it.temperMax;
      if (it.ashPot == null) {
        var w = (D().ashmarks && D().ashmarks.weights) || [50, 30, 14, 5, 1], sum = w.reduce(function (a, b) { return a + b; }, 0), r = h % sum, n = 0;
        while (n < w.length - 1 && r >= w[n]) { r -= w[n]; n++; }
        it.ashPot = n;
      }
      return it;
    }
    delete it.ashPot;
    if (it.temperMax == null || !(it.temperMax >= 0)) {
      var c = D().temper || {}, base = (c.base || {})[it.tier] || (c.base || {}).common || 20, j = c.jitter == null ? 2 : c.jitter;
      it.temperMax = Math.max(1, base + Math.round((it.ilvl || 1) * (c.perIlvl == null ? 0.5 : c.perIlvl)) + (j ? (h % (2 * j + 1)) - j : 0));
      it.temper = it.temperMax;
    } else if (it.temper == null || it.temper > it.temperMax) it.temper = it.temperMax;
    return it;
  }
  function forgeHtml(it) {
    if (!isGear(it)) return "";
    var c = D().temper || {}, a = D().ashmarks || {};
    if (it.temperMax > 0 && it.temper != null) {
      var t = Math.max(0, it.temper | 0), pct = Math.round(100 * t / it.temperMax);
      return '<span class="le-temper' + (t ? "" : " is-set") + '" title="' + esc(c.help || "") + '" data-temper="' + t + '">' + esc(c.name || "Temper") + ' <i class="le-tbar" style="--p:' + pct + '%"></i> <b>' + (t ? t : esc(c.setLabel || "Set")) + "</b></span>";
    }
    if (it.ashPot > 0) return '<span class="le-ash" title="' + esc(a.help || "") + '" data-ash="' + it.ashPot + '">' + esc(a.name || "Ashmarks") + ' <i class="le-am" style="--n:' + it.ashPot + '"></i></span>';
    return "";
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fixItem(it) {
    if (!it || typeof it !== "object") return it;
    stampItem(it);
    (it.affixes || []).forEach(function (a) { if (a && !a.tier) { var t = tierOf(a); if (t) a.tier = t; } });
    return it;
  }
  // ---- stash tabs (step 11) -------------------------------------------------------------------------------
  function scfg() { return D().stashCfg || { maxTabs: 12, tabW: 10, tabH: 8, starter: { id: "t1", cat: "stash", name: "Stash", icon: "chest", color: "ember" }, cats: [{ id: "stash", name: "Stash" }], prices: [500] }; }
  // make sure player.stashTabs exists and player.stash IS the active tab object (old saves: the stash becomes tab 1, items untouched)
  function ensureTabs(p) {
    if (!p) return null;
    var c = scfg(), st = p.stashTabs;
    if (!st || !Array.isArray(st.tabs) || !st.tabs.length) {
      var old = p.stash && Array.isArray(p.stash.items) ? p.stash : { w: c.tabW || 10, h: c.tabH || 8, items: [] };
      var s0 = c.starter || {};
      old.id = old.id || s0.id || "t1"; old.cat = old.cat || s0.cat || "stash"; old.name = old.name || s0.name || "Stash";
      old.icon = old.icon || s0.icon || "chest"; old.color = old.color || s0.color || "ember"; if (old.rule === void 0) old.rule = null;
      old.w = old.w || c.tabW || 10; old.h = old.h || c.tabH || 8;
      st = p.stashTabs = { v: 2, active: old.id, next: 2, bought: 0, tabs: [old] };
    }
    var act = st.tabs.find(function (x) { return x.id === st.active; }) || st.tabs[0];
    st.active = act.id;
    if (p.stash !== act) {
      // a v7 save stores only a placeholder in player.stash; anything real found there is kept in the active tab
      var extra = p.stash && Array.isArray(p.stash.items) && p.stash.tab === act.id ? p.stash.items : [];
      extra.forEach(function (it) { if (it && !act.items.some(function (x) { return x.uid === it.uid; })) act.items.push(it); });
      p.stash = act;
    }
    return st;
  }
  function tabs(p) { var st = ensureTabs(p); return st ? st.tabs : []; }
  function activeTab(p) { ensureTabs(p); return p && p.stash; }
  function setActive(p, id) {
    var st = ensureTabs(p), t = st && st.tabs.find(function (x) { return x.id === id; });
    if (!t) return false;
    st.active = id; p.stash = t; return true;
  }
  function tabPrice(p) { var c = scfg(), pr = c.prices || [500], n = (ensureTabs(p).bought || 0); return pr[Math.min(n, pr.length - 1)]; }
  function canBuy(p) { var st = ensureTabs(p); return st.tabs.length < (scfg().maxTabs || 12); }
  function addTab(p, cat, opts) {
    var c = scfg(), st = ensureTabs(p); opts = opts || {};
    if (!canBuy(p)) return null;
    var cd = (c.cats || []).find(function (x) { return x.id === cat; }) || (c.cats || [])[0] || { id: "stash", name: "Stash" };
    var id = "t" + (st.next || st.tabs.length + 1);
    st.next = (st.next || st.tabs.length + 1) + 1;
    var same = st.tabs.filter(function (x) { return x.cat === cd.id; }).length;
    var t = { id: id, cat: cd.id, name: opts.name || (cd.name + (same ? " " + (same + 1) : "")), icon: opts.icon || cd.icon || "chest", color: opts.color || cd.color || "ember",
      w: c.tabW || 10, h: c.tabH || 8, items: [], rule: opts.rule !== void 0 ? opts.rule : (cd.rule ? JSON.parse(JSON.stringify(cd.rule)) : null) };
    st.tabs.push(t); if (opts.bought !== false) st.bought = (st.bought || 0) + 1;
    return t;
  }
  function migrateSave(e) {
    if (!e || !e.player) return e;
    ensureTabs(e.player);
    eachItem(e, fixItem);
    return e;
  }
  // save writer: the active tab lives in stashTabs; player.stash gets a small placeholder so items aren't written twice
  function snapshotStash(p, out) {
    if (!p || !out || !p.stashTabs || !Array.isArray(p.stashTabs.tabs) || p.stashTabs.tabs.indexOf(p.stash) < 0) return out;
    out.stash = { w: p.stash.w, h: p.stash.h, items: [], tab: p.stash.id };
    return out;
  }
  // shared stash (ashbound.shared) is not part of the save: items get the same fill when it is read
  function migrateShared(s) {
    if (s && Array.isArray(s.items)) s.items.forEach(fixItem);
    if (s && Array.isArray(s.tabs)) s.tabs.forEach(function (tab) { (tab && tab.items || []).forEach(fixItem); });
    return s;
  }
  function chipHtml(affix) {
    var t = tierOf(affix);
    return t ? '<span class="tchip t' + t + '" data-tier="' + t + '" title="Tier ' + t + ' of 7">T' + t + "</span>" : "";
  }
  // plain chip look for ?leui=0 (the painted chips come from js/ab-leui.js)
  function baseCss() {
    if (!root.document || root.document.getElementById("ab-ledata-style")) return;
    var st = root.document.createElement("style"); st.id = "ab-ledata-style";
    st.textContent = ".le-temper,.le-ash{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;color:#d9b98a;white-space:nowrap}.le-temper b{color:#ffcf8a}.le-temper.is-set b{color:#9a8f80}" +
      ".le-tbar{display:inline-block;width:34px;height:5px;border-radius:2px;background:linear-gradient(90deg,#ff8a3c var(--p,0%),#3a2a1c var(--p,0%));box-shadow:inset 0 0 0 1px rgba(0,0,0,.6)}" +
      ".le-am{display:inline-block;height:8px;width:calc(10px * var(--n,0));background:repeating-linear-gradient(90deg,transparent 0 1px,#e8c27a 1px 2px,transparent 2px 7px,transparent 7px 10px);mask:repeating-linear-gradient(90deg,#000 0 8px,transparent 8px 10px);border:0;opacity:.9}" +
      ".affix .tchip{display:inline-block;margin-left:auto;padding:0 4px;min-width:22px;text-align:center;border:1px solid currentColor;border-radius:3px;font-size:10px;line-height:14px;font-weight:700;opacity:.9}.affix .tchip.t6,.affix .tchip.t7{color:#c88cff}";
    (root.document.head || root.document.documentElement).appendChild(st);
  }
  if (root.document) { if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", baseCss); else baseCss(); }

  // ---- stash search (step 13): pure query. Tokens AND together:
  //   unique / set / magic / rare / <rank>  · ring(s) / amulet / weapon / helm / armor / gloves / belt / boots / offhand / <kind>
  //   t6  (any affix tier >= 6)  · lv20+ / lv10-20 (item level)  · anything else: part of the name / base / affix id
  var SLOTW = { ring: "ring", amulet: "amulet", weapon: "weapon", helm: "helm", armor: "armor", armour: "armor", body: "armor", gloves: "gloves", glove: "gloves", belt: "belt", boots: "boots", boot: "boots", offhand: "offhand", shield: "offhand" };
  function parseQuery(q) {
    return String(q || "").toLowerCase().split(/[\s,]+/).filter(Boolean).map(function (w) {
      var m;
      if ((m = /^t([1-7])\+?$/.exec(w))) return { k: "tier", n: +m[1] };
      if ((m = /^(?:lv|lvl|ilvl|level)(\d+)\+$/.exec(w))) return { k: "lv", a: +m[1], b: 1e9 };
      if ((m = /^(?:lv|lvl|ilvl|level)(\d+)-(\d+)$/.exec(w))) return { k: "lv", a: +m[1], b: +m[2] };
      if ((m = /^(?:lv|lvl|ilvl|level)(\d+)$/.exec(w))) return { k: "lv", a: +m[1], b: +m[1] };
      var s = w.length > 3 && /s$/.test(w) && !SLOTW[w] ? w.slice(0, -1) : w;
      if (s === "unique" || s === "set" || s === "relic") return { k: "fam", v: s === "relic" ? "relic" : s };
      if (SLOTW[s]) return { k: "slot", v: SLOTW[s] };
      return { k: "text", v: w, s: s };
    });
  }
  var RANKS = ["common", "magic", "rare", "elite", "epic", "legendary", "fabled", "mythical"];
  function matchItem(it, q, nameOf) {
    var toks = Array.isArray(q) ? q : parseQuery(q);
    if (!toks.length) return true;
    if (!it) return false;
    return toks.every(function (t) {
      if (t.k === "tier") return (it.affixes || []).some(function (a) { return tierOf(a) >= t.n; });
      if (t.k === "lv") { var l = it.ilvl || 0; return l >= t.a && l <= t.b; }
      if (t.k === "fam") return t.v === "relic" ? (it.rarity === "unique" || it.rarity === "set") : it.rarity === t.v;
      if (t.k === "slot") return it.slot === t.v;
      if (RANKS.indexOf(t.v) >= 0 || t.v === "magic" || t.v === "rare") return it.tier === t.v || it.rarity === t.v;
      var hay = [nameOf ? nameOf(it) : "", it.name, it.baseId, it.kind, it.rarity, it.tier, it.uniqueId, it.setId].concat((it.affixes || []).map(function (a) { return a && (a.id || a.name || ""); })).join(" ").toLowerCase().replace(/_/g, " ");
      return hay.indexOf(t.v) >= 0 || (t.s !== t.v && hay.indexOf(t.s) >= 0);
    });
  }
  // match counts per tab id and per category id across every tab
  function searchCounts(p, q, nameOf) {
    var toks = parseQuery(q), st = ensureTabs(p), out = { tabs: {}, cats: {}, total: 0 };
    if (!toks.length || !st) return out;
    st.tabs.forEach(function (t) {
      var n = (t.items || []).filter(function (it) { return matchItem(it, toks, nameOf); }).length;
      out.tabs[t.id] = n; out.cats[t.cat] = (out.cats[t.cat] || 0) + n; out.total += n;
    });
    return out;
  }
  // ---- keep-here rules (step 14) -----------------------------------------------------------------------
  // rule = {slots:[], kinds:[], families:[], rankMin:"rare"} ; every key that is set must match; an empty rule matches nothing
  function ruleEmpty(r) { return !r || !((r.slots && r.slots.length) || (r.kinds && r.kinds.length) || (r.families && r.families.length) || r.rankMin); }
  function ruleMatch(r, it) {
    if (ruleEmpty(r) || !it) return false;
    if (r.slots && r.slots.length && r.slots.indexOf(it.slot) < 0) return false;
    if (r.kinds && r.kinds.length && r.kinds.indexOf(it.kind) < 0 && r.kinds.indexOf(it.rarity) < 0) return false;
    if (r.families && r.families.length && r.families.indexOf(it.rarity) < 0) return false;
    if (r.rankMin && RANKS.indexOf(it.tier) < RANKS.indexOf(r.rankMin)) return false;
    return true;
  }
  // where a quick store goes: first tab (tab order) whose rule matches and that has room, else the open tab if it has room
  function routeTab(p, it, fits) {
    var st = ensureTabs(p); if (!st || !it) return null;
    for (var i = 0; i < st.tabs.length; i++) { var t = st.tabs[i]; if (ruleMatch(t.rule, it) && fits(t, it)) return t; }
    var a = activeTab(p); return a && fits(a, it) ? a : null;
  }
  // ---- sort by (step 15): order then greedy top-left placement; returns false (grid untouched) if that order cannot pack
  function sortKey(by) {
    var so = (scfg().sort && scfg().sort.slotOrder) || ["weapon", "offhand", "helm", "armor", "gloves", "belt", "boots", "ring", "amulet"];
    var rk = function (it) { return (it.rarity === "unique" || it.rarity === "set" ? 10 : 0) + RANKS.indexOf(it.tier); };
    var sl = function (it) { var i = so.indexOf(it.slot); return i < 0 ? so.length + (it.kind ? it.kind.charCodeAt(0) / 1000 : 0) : i; };
    var ar = function (it) { return (it.w || 1) * (it.h || 1); };
    if (by === "rank") return function (a, b) { return rk(b) - rk(a) || sl(a) - sl(b) || ar(b) - ar(a) || (b.ilvl || 0) - (a.ilvl || 0); };
    if (by === "slot") return function (a, b) { return sl(a) - sl(b) || rk(b) - rk(a) || (b.ilvl || 0) - (a.ilvl || 0); };
    if (by === "level") return function (a, b) { return (b.ilvl || 0) - (a.ilvl || 0) || rk(b) - rk(a) || ar(b) - ar(a); };
    return function (a, b) { return ar(b) - ar(a) || (b.ilvl || 0) - (a.ilvl || 0); };
  }
  function sortGrid(grid, by, findSpot) {
    var keep = grid.items.map(function (it) { return [it, it.x, it.y]; }), order = grid.items.slice().sort(sortKey(by));
    grid.items = [];
    for (var i = 0; i < order.length; i++) {
      var s = findSpot(grid, order[i]);
      if (!s) { grid.items = keep.map(function (k) { k[0].x = k[1]; k[0].y = k[2]; return k[0]; }); return false; }
      order[i].x = s.x; order[i].y = s.y; grid.items.push(order[i]);
    }
    return true;
  }
  root.ABLeData = { tierForLevel: tierForLevel, tierOf: tierOf, fixItem: fixItem, eachItem: eachItem, migrateSave: migrateSave, migrateShared: migrateShared, chipHtml: chipHtml,
    stashCfg: scfg, ensureTabs: ensureTabs, tabs: tabs, activeTab: activeTab, setActive: setActive, addTab: addTab, tabPrice: tabPrice, canBuy: canBuy, snapshotStash: snapshotStash,
    parseQuery: parseQuery, matchItem: matchItem, searchCounts: searchCounts, ruleEmpty: ruleEmpty, ruleMatch: ruleMatch, routeTab: routeTab, sortKey: sortKey, sortGrid: sortGrid, stampItem: stampItem, forgeHtml: forgeHtml, isGear: isGear };
})(typeof window !== "undefined" ? window : globalThis);
