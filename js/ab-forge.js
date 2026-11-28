/* v84q Bench crafting (power-notes/DESIGN.md 2c). Numbers and names: data/power.json "crafting". Bench tabs "Forge" and "Salvage".
   Forge on one item: Hone (affix -> next tier of its group), Reforge (reroll one affix), Imbue (add an affix up to the rank's count),
   Rank Up (Rank Stone + gold, chance; a miss keeps the item), Punch / Seal a socket, Reroll a unique's range (js/ab-uroll.js).
   Every forge action on a normal item spends Temper (data/ui.json leui.temperSpend); at 0 the item is Set. Uniques/sets have no
   Temper; only their range reroll works. Salvage turns bag gear into Ember Dust / Cinder Glass / Ichor Shards (runes come back).
   Crafting XP from every Bench action raises player.craftingLevel (gates Hone T6/T7, Rank Up to Fabled/Mythical, Awaken 4-5).
   Materials go to the wallet player.craftMats (js/ab-awaken.js). Rank Stones / Dust / Glass drop from kills (crafting.matDrops). */
(function (root) {
  "use strict";
  var sel = null, bound = false, cssDone = false;
  function D() { return root.ASHBOUND_DATA || {}; }
  function C() { return ((D().power || {}).crafting) || {}; }
  function on() { return !!(root.ABPower && ABPower.on() && (D().power || {}).crafting && root.ABAwaken); }
  function S() { return root.ASHBOUND && ASHBOUND.state; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  function W() { return root.ABAwaken; }
  function ranks() { return C().ranks || ["common", "magic", "rare", "elite", "epic", "legendary", "fabled", "mythical"]; }
  function rankName(r) { var d = root.ABCraft && ABCraft.rarityDef ? ABCraft.rarityDef(r) : null; return (d && (d.label || d.name)) || (r ? r[0].toUpperCase() + r.slice(1) : ""); }
  function isUniq(it) { return !!(it && (it.rarity === "unique" || it.uniqueId)); }
  function isSet(it) { return !!(it && (it.rarity === "set" || it.setId)); }
  function isGear(it) { return !!(it && it.slot && it.baseId && !it.matId && !it.charm && ["rune", "gem", "currency", "potion", "charm"].indexOf(it.rarity) < 0 && ["rune", "gem", "potion", "mat", "charm"].indexOf(it.kind) < 0); }
  function isNormal(it) { return isGear(it) && !isUniq(it) && !isSet(it) && Array.isArray(it.affixes); }
  function temperOn() { var u = (D().ui || {}).leui || {}; return u.temperSpend === true; }
  function tcost(k) { return (C().temperCost || {})[k] || 0; }
  function temperOk(it, k) { if (!temperOn() || !isNormal(it)) return true; var t = it.temper == null ? Infinity : it.temper; return t >= tcost(k); }
  function spendTemper(it, k) { if (!temperOn() || !isNormal(it) || it.temper == null) return; it.temper = Math.max(0, (it.temper | 0) - tcost(k)); }
  function setRefusal(it) { return (it.name || "It") + " is Set: no Temper left for that."; }
  function rng() { return (root.ABForge && ABForge._rng) || Math.random; }
  function recalc() { if (root.ASHBOUND && ASHBOUND.recalc) ASHBOUND.recalc(); var s = S(); if (s && s.ui) s.ui.rev++; if (s) s.pendingSave = true; }
  /* ---------- crafting level ---------- */
  function lvlTable() { return (C().level || {}).xpToLevel || [0, 0, 30, 80, 160, 280, 450, 700, 1000, 1400, 1900]; }
  function levelFor(xp) { var t = lvlTable(), mx = (C().level || {}).max || t.length - 1, l = 1; for (var i = 1; i <= mx && i < t.length; i++) if (xp >= t[i]) l = i; return l; }
  function craftLevel(p) { return Math.max((p && p.craftingLevel) || 1, levelFor((p && p.craftXp) || 0)); }
  function addXp(p, n) {
    if (!p || !n) return;
    var before = craftLevel(p); p.craftXp = (p.craftXp || 0) + n; var after = craftLevel(p);
    if (after > (p.craftingLevel || 1)) p.craftingLevel = after;
    var s = S(); if (after > before && s) s.toasts.push({ text: "Crafting level " + after + ".", t: 3, kind: "good" });
  }
  /* ---------- affix pools ---------- */
  function pools() { return { pre: D().prefixes || [], suf: D().suffixes || [] }; }
  function defOf(a) { var p = pools(); return p.pre.concat(p.suf).find(function (x) { return x.id === a.id; }) || null; }
  function fits(it, d) { return d.slots && (d.slots.indexOf(it.slot) >= 0 || d.slots.indexOf(it.kind) >= 0); }
  function tierFor(d) { return d.tier || (root.ABLeData && ABLeData.tierForLevel ? ABLeData.tierForLevel(d.level || 1) : 1); }
  function mkAffix(d, isPre) { return { id: d.id, name: d.name, mods: d.mods, prefix: isPre, level: d.level || 1, tier: tierFor(d) }; }
  function groupsUsed(it, except) { var u = {}; (it.affixes || []).forEach(function (a, i) { if (i === except) return; var d = defOf(a); u[(d && d.group) || a.group || a.id] = 1; }); return u; }
  /* Hone: if the affix's group has a bigger entry the item's level allows, swap to it; else step the affix's tier +1 and grow its
     numbers by hone.stepPct of the pool values per step (up to T7 and the item level's tier). */
  function ilvlTier(it) { return root.ABLeData && ABLeData.tierForLevel ? ABLeData.tierForLevel(it.ilvl || 1) : 7; }
  function scaleBag(m, k) { var o = {}; for (var q in m) { var v = m[q]; o[q] = q === "skills" ? v : Array.isArray(v) ? v.map(function (x) { return Math.round(x * k); }) : (typeof v === "number" ? Math.round(v * k * 10) / 10 : v); } return o; }
  function honeTarget(it, idx) {
    var a = (it.affixes || [])[idx], d = a && defOf(a); if (!d) return null;
    var pool = a.prefix ? pools().pre : pools().suf, cur = a.tier || tierFor(d);
    var c = pool.filter(function (x) { return x.group === d.group && (x.level || 1) > (d.level || 1) && (x.level || 1) <= (it.ilvl || 1) && fits(it, x); }).sort(function (x, y) { return (x.level || 1) - (y.level || 1); });
    if (c[0] && tierFor(c[0]) > cur) return { swap: c[0], tier: tierFor(c[0]), name: c[0].name };
    if (cur >= 7) return null;
    return { tier: cur + 1, def: d, name: a.name };
  }
  function honeCost(t) { var h = C().hone || {}; return t.tier >= (h.highFromTier || 4) ? (h.cost || {}).high : (h.cost || {}).low; }
  function canHone(p, it, idx) {
    if (!isNormal(it)) return { ok: false, reason: "Only normal items can be honed." };
    var t = honeTarget(it, idx); if (!t) return { ok: false, reason: "Already T7." };
    if (t.tier > ilvlTier(it)) return { ok: false, reason: "T" + t.tier + " needs a higher item level.", to: t };
    var need = ((C().hone || {}).craftLevelForTier || {})[String(t.tier)]; if (need && craftLevel(p) < need) return { ok: false, reason: "T" + t.tier + " needs crafting level " + need + ".", to: t };
    if (!temperOk(it, "hone")) return { ok: false, reason: setRefusal(it), to: t };
    var cost = honeCost(t); if (!W().canPay(p, cost)) return { ok: false, reason: "Missing materials.", cost: cost, to: t };
    return { ok: true, cost: cost, to: t };
  }
  function hone(p, it, idx) {
    var c = canHone(p, it, idx); if (!c.ok) return c;
    W().pay(p, c.cost); spendTemper(it, "hone");
    var old = it.affixes[idx], t = c.to, step = (C().hone || {}).stepPct == null ? 0.15 : C().hone.stepPct;
    if (t.swap) { it.affixes[idx] = mkAffix(t.swap, old.prefix); it.reqLevel = Math.max(it.reqLevel || 1, t.swap.level || 1); }
    else { var n = (old.honed || 0) + 1; old.honed = n; old.honeMul = 1 + step * n; old.tier = t.tier; old.mods = scaleBag(t.def.mods, old.honeMul); }
    addXp(p, (C().hone || {}).xp || 4); recalc();
    return { ok: true, toast: (old.name || "Affix") + " honed to T" + t.tier + (t.swap ? " (" + t.swap.name + ")" : "") + "." };
  }
  function reforgePool(it, idx) {
    var a = it.affixes[idx], used = groupsUsed(it, idx), pool = a.prefix ? pools().pre : pools().suf;
    return pool.filter(function (x) { return x.id !== a.id && (x.level || 1) <= (it.ilvl || 1) && !used[x.group] && fits(it, x); });
  }
  function canReforge(p, it, idx) {
    if (!isNormal(it) || !(it.affixes || [])[idx]) return { ok: false, reason: "Pick an affix on a normal item." };
    if (!reforgePool(it, idx).length) return { ok: false, reason: "Nothing else can roll there." };
    if (!temperOk(it, "reforge")) return { ok: false, reason: setRefusal(it) };
    var cost = (C().reforge || {}).cost || {}; if (!W().canPay(p, cost)) return { ok: false, reason: "Missing materials.", cost: cost };
    return { ok: true, cost: cost };
  }
  function reforge(p, it, idx) {
    var c = canReforge(p, it, idx); if (!c.ok) return c;
    var l = reforgePool(it, idx), d = l[Math.floor(rng()() * l.length)], old = it.affixes[idx];
    W().pay(p, c.cost); spendTemper(it, "reforge"); it.affixes[idx] = mkAffix(d, old.prefix); it.reqLevel = Math.max(it.reqLevel || 1, d.level || 1);
    addXp(p, (C().reforge || {}).xp || 3); recalc();
    return { ok: true, toast: old.name + " became " + d.name + "." };
  }
  function imbueMax(it) { return ((C().imbue || {}).maxAffixes || {})[it.rarity] || 0; }
  function imbuePick(it) {
    var used = groupsUsed(it, -1), np = it.affixes.filter(function (a) { return a.prefix; }).length, ns = it.affixes.length - np, half = Math.ceil(imbueMax(it) / 2);
    var sides = np <= ns ? [true, false] : [false, true];
    for (var i = 0; i < 2; i++) {
      var isPre = sides[i]; if ((isPre ? np : ns) >= half) continue;
      var l = (isPre ? pools().pre : pools().suf).filter(function (x) { return (x.level || 1) <= (it.ilvl || 1) && !used[x.group] && fits(it, x); });
      if (l.length) return { list: l, pre: isPre };
    }
    return null;
  }
  function canImbue(p, it) {
    if (!isNormal(it)) return { ok: false, reason: "Only normal items can be imbued." };
    if (it.affixes.length >= imbueMax(it)) return { ok: false, reason: imbueMax(it) ? "Full: " + rankName(it.rarity) + " holds " + imbueMax(it) + " affixes." : "This rank can't hold more." };
    if (!imbuePick(it)) return { ok: false, reason: "Nothing more can roll on it." };
    if (!temperOk(it, "imbue")) return { ok: false, reason: setRefusal(it) };
    var cost = (C().imbue || {}).cost || {}; if (!W().canPay(p, cost)) return { ok: false, reason: "Missing materials.", cost: cost };
    return { ok: true, cost: cost };
  }
  function imbue(p, it) {
    var c = canImbue(p, it); if (!c.ok) return c;
    var pk = imbuePick(it), d = pk.list[Math.floor(rng()() * pk.list.length)];
    W().pay(p, c.cost); spendTemper(it, "imbue"); it.affixes.push(mkAffix(d, pk.pre)); it.reqLevel = Math.max(it.reqLevel || 1, d.level || 1);
    addXp(p, (C().imbue || {}).xp || 6); recalc();
    return { ok: true, toast: "Imbued: " + d.name + "." };
  }
  function nextRank(it) { var r = ranks(), i = r.indexOf(it.rarity); return i >= 0 && i < r.length - 1 ? r[i + 1] : null; }
  function rankCost(it) { var ru = C().rankUp || {}, n = nextRank(it), o = {}; if (!n) return o; var st = (ru.stoneFor || {})[n]; if (st) o[st] = 1; if ((ru.gold || {})[n]) o.gold = ru.gold[n]; return o; }
  function canRankUp(p, it) {
    if (!isNormal(it)) return { ok: false, reason: "Uniques and set pieces keep their rank." };
    var n = nextRank(it); if (!n) return { ok: false, reason: "Already the top rank." };
    if (it.rarity === "common" || it.rarity === "magic") return { ok: false, reason: "Rank Up starts at Rare." };
    if (root.ABCraft && ABCraft.canSetTier) { var ck = ABCraft.canSetTier(it, n); if (!ck.ok) return ck; }
    var need = ((C().rankUp || {}).craftLevelFor || {})[n]; if (need && craftLevel(p) < need) return { ok: false, reason: rankName(n) + " needs crafting level " + need + "." };
    if (!temperOk(it, "rankUp")) return { ok: false, reason: setRefusal(it) };
    var cost = rankCost(it); if (!W().canPay(p, cost)) return { ok: false, reason: "Missing materials.", cost: cost, to: n };
    return { ok: true, cost: cost, to: n, chance: ((C().rankUp || {}).chance || {})[n] == null ? 1 : C().rankUp.chance[n] };
  }
  function rankUp(p, it) {
    var c = canRankUp(p, it); if (!c.ok) return c;
    W().pay(p, c.cost); addXp(p, (C().rankUp || {}).xp || 10);
    if (rng()() >= c.chance) { spendTemper(it, "rankUpFail"); recalc(); return { ok: true, failed: true, kind: "bad", toast: "The rank didn't take. " + (it.name || "The item") + " is unchanged (" + Math.round(c.chance * 100) + "% chance)." }; }
    spendTemper(it, "rankUp"); it.rarity = c.to; it.tier = c.to;
    if (it.awaken && root.ABAwaken) { /* a higher rank can awaken further; the Ichor already earned stays */ }
    recalc();
    return { ok: true, toast: (it.name || "Item") + " is now " + rankName(c.to) + "." };
  }
  function baseMaxSockets(it) { var b = (D().itemBases || []).find(function (x) { return x.id === it.baseId; }); return (b && b.maxSockets) || 0; }
  function socketsBusy(it) { return !!(it.runeword) ; }
  function canPunch(p, it) {
    if (!isGear(it) || isUniq(it) || isSet(it) || it.jewelry) return { ok: false, reason: "Only normal weapons and armor take sockets." };
    if (socketsBusy(it)) return { ok: false, reason: "A finished runeword can't change its sockets." };
    var mx = baseMaxSockets(it); if (!mx) return { ok: false, reason: "This base can't hold sockets." };
    if ((it.socketMax || 0) >= mx) return { ok: false, reason: "Already at the base's max (" + mx + ")." };
    if (!temperOk(it, "punch")) return { ok: false, reason: setRefusal(it) };
    var cost = ((C().sockets || {}).punch || {}).cost || {}; if (!W().canPay(p, cost)) return { ok: false, reason: "Missing materials.", cost: cost };
    return { ok: true, cost: cost, max: mx };
  }
  function punch(p, it) {
    var c = canPunch(p, it); if (!c.ok) return c;
    W().pay(p, c.cost); spendTemper(it, "punch");
    it.sockets = Array.isArray(it.sockets) ? it.sockets : []; while (it.sockets.length < (it.socketMax || 0)) it.sockets.push(null);
    it.socketMax = (it.socketMax || 0) + 1; it.sockets.push(null);
    addXp(p, ((C().sockets || {}).punch || {}).xp || 3); recalc();
    return { ok: true, toast: "Punched a socket: " + it.socketMax + " of " + c.max + "." };
  }
  function canSeal(p, it) {
    if (!isGear(it) || !(it.socketMax > 0)) return { ok: false, reason: "No socket to seal." };
    if (socketsBusy(it)) return { ok: false, reason: "A finished runeword can't change its sockets." };
    if (!(it.sockets || []).some(function (x) { return !x; })) return { ok: false, reason: "Every socket is full. Take a rune out first." };
    if (!temperOk(it, "seal")) return { ok: false, reason: setRefusal(it) };
    var cost = ((C().sockets || {}).seal || {}).cost || {}; if (!W().canPay(p, cost)) return { ok: false, reason: "Missing materials.", cost: cost };
    return { ok: true, cost: cost };
  }
  function seal(p, it) {
    var c = canSeal(p, it); if (!c.ok) return c;
    W().pay(p, c.cost); spendTemper(it, "seal");
    var i = it.sockets.lastIndexOf(null); if (i < 0) i = it.sockets.findIndex(function (x) { return !x; }); it.sockets.splice(i, 1); it.socketMax = Math.max(0, (it.socketMax || 1) - 1);
    if (!it.socketMax) it.sockets = [];
    addXp(p, ((C().sockets || {}).seal || {}).xp || 1); recalc();
    return { ok: true, toast: "Sealed a socket: " + it.socketMax + " left." };
  }
  function uDef(it) { return root.ABURoll && ABURoll.defOf ? ABURoll.defOf(it) : null; }
  function rangeKeys(it) { var d = uDef(it); return d && d.ranges ? Object.keys(d.ranges) : []; }
  function canReroll(p, it, key) {
    if (!isUniq(it)) return { ok: false, reason: "Only uniques have ranges." };
    if (rangeKeys(it).indexOf(key) < 0) return { ok: false, reason: "That stat has no range." };
    var cost = (C().uniqueReroll || {}).cost || {}; if (!W().canPay(p, cost)) return { ok: false, reason: "Missing materials.", cost: cost };
    return { ok: true, cost: cost };
  }
  function reroll(p, it, key) {
    var c = canReroll(p, it, key); if (!c.ok) return c;
    var d = uDef(it), one = ABURoll.roll({ ranges: (function () { var o = {}; o[key] = d.ranges[key]; return o; })() }, rng());
    if (!one) return { ok: false, reason: "Ranges are off." };
    W().pay(p, c.cost);
    if (!it.uniqueRoll) { it.uniqueRoll = {}; rangeKeys(it).forEach(function (k) { if (d.mods && d.mods[k] != null) it.uniqueRoll[k] = JSON.parse(JSON.stringify(d.mods[k])); }); }
    var before = JSON.stringify(it.uniqueRoll[key]); it.uniqueRoll[key] = one[key];
    if (root.ABCraft && ABCraft.scaleUnique) ABCraft.scaleUnique(it, p);
    addXp(p, (C().uniqueReroll || {}).xp || 5); recalc();
    return { ok: true, toast: "Rerolled: " + before + " \u2192 " + JSON.stringify(one[key]) + "." };
  }
  /* ---------- salvage ---------- */
  function salvageYield(it) {
    var sv = C().salvage || {}, tab = isUniq(it) ? sv.unique : isSet(it) ? sv.set : (sv.byRank || {})[it.rarity || it.tier] || (sv.byRank || {}).common || {};
    return tab || {};
  }
  function wornUids(p) { var o = {}; for (var k in (p.equipment || {})) if (p.equipment[k]) o[p.equipment[k].uid] = 1; return o; }
  function canSalvage(p, it) {
    if (!isGear(it)) return { ok: false, reason: "Only gear can be salvaged." };
    if (wornUids(p)[it.uid]) return { ok: false, reason: "Take it off first." };
    if (it.locked || it.favorite) return { ok: false, reason: "It's locked." };
    if (!(p.inventory.items || []).some(function (x) { return x.uid === it.uid; })) return { ok: false, reason: "Only items in your bag." };
    return { ok: true };
  }
  function salvage(p, it) {
    var c = canSalvage(p, it); if (!c.ok) return c;
    var y = salvageYield(it), got = {}, r = rng();
    for (var k in y) { var lo = y[k][0], hi = y[k][1], n = lo + Math.floor(r() * (hi - lo + 1)); if (n > 0) { W().addMat(p, k, n); got[k] = n; } }
    var rs = ((C().salvage || {}).rankStoneChance || {})[it.rarity] || {}; for (var q in rs) if (r() < rs[q]) { W().addMat(p, q, 1); got[q] = (got[q] || 0) + 1; }
    p.inventory.items = p.inventory.items.filter(function (x) { return x.uid !== it.uid; });
    var back = (it.sockets || []).filter(Boolean); back.forEach(function (ru) { if (root.ASHBOUND && ASHBOUND.give) ASHBOUND.give(ru); });
    addXp(p, (C().salvage || {}).xp || 2); recalc();
    var txt = Object.keys(got).map(function (k) { return "+" + got[k] + " " + W().matName(k); }).join(", ") || "nothing";
    return { ok: true, got: got, toast: "Salvaged " + (it.name || "item") + ": " + txt + (back.length ? " (runes back in your bag)" : "") + "." };
  }
  function salvageMany(p, rarities) {
    var l = (p.inventory.items || []).filter(function (it) { return isNormal(it) && rarities.indexOf(it.rarity) >= 0 && canSalvage(p, it).ok && !(it.sockets || []).some(Boolean); }), n = 0, tot = {};
    l.forEach(function (it) { var r = salvage(p, it); if (r.ok) { n++; for (var k in r.got) tot[k] = (tot[k] || 0) + r.got[k]; } });
    return { ok: n > 0, reason: "Nothing to salvage.", toast: n ? "Salvaged " + n + " items: " + Object.keys(tot).map(function (k) { return "+" + tot[k] + " " + W().matName(k); }).join(", ") + "." : "Nothing to salvage." };
  }
  /* ---------- drops ---------- */
  function onKill(pl) {
    if (!on() || !pl || !pl.state || !pl.target) return;
    var s = pl.state, p = s.player, m = pl.target; if (!p || m === p) return;
    var rank = m.boss || m.rank === "boss" ? "boss" : (m.rank === "elite" || m.mini ? "elite" : (m.rank === "champion" ? "champion" : "normal"));
    var md = C().matDrops || {}, r = rng();
    for (var id in md) { var d = md[id]; if ((m.mlvl || 1) < (d.minMlvl || 0)) continue; var ch = d[rank] || 0; if (ch && r() < ch) { W().addMat(p, id, 1); if (id.indexOf("rank_stone") === 0 || rank === "boss") s.toasts.push({ text: "+1 " + W().matName(id), t: 2.5, kind: "good" }); } }
  }
  /* ---------- UI ---------- */
  function css() {
    if (cssDone || !root.document) return; cssDone = true;
    var st = document.createElement("style"); st.id = "ab-forge-style";
    st.textContent = ["#ab-bench .fpick{display:flex;gap:5px;overflow-x:auto;padding:2px 0 6px;scrollbar-width:thin}",
      "#ab-bench .fpick button{flex:0 0 auto;width:48px;height:48px;border:1px solid #4a3a28;border-radius:8px;background:#211812;position:relative;padding:2px}",
      "#ab-bench .fpick button.on{border-color:#ffb060;box-shadow:0 0 0 1px #ffb060 inset}",
      "#ab-bench .fpick button svg,#ab-bench .fpick button img{max-width:40px;max-height:40px}",
      "#ab-bench .fpick .w{position:absolute;left:2px;top:1px;font-size:8.5px;color:#ffcf96}",
      "#ab-bench .fa{display:flex;align-items:center;gap:6px;padding:3px 0;border-top:1px solid #2e241a}",
      "#ab-bench .fa .t{flex:1 1 auto;min-width:0;font-size:12px}",
      "#ab-bench .fa .c{font-size:10.5px;color:#9a8f80;white-space:nowrap}",
      "#ab-bench .facts{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}",
      "#ab-bench .facts .card{flex:1 1 210px;margin:0;padding:6px 8px;display:flex;align-items:center;gap:6px}",
      "#ab-bench .facts .card .t{flex:1 1 auto;min-width:0}",
      "#ab-bench .tchip{display:inline-block;font-size:9.5px;border-radius:4px;padding:0 4px;margin-right:4px;background:#3a2c20;color:#ffcf96}"].join("\n");
    (document.head || document.documentElement).appendChild(st);
  }
  function modLines(mods) { try { if (root.abModLines) return root.abModLines(mods); } catch (e) {} var o = []; for (var k in mods || {}) o.push(k + " " + (Array.isArray(mods[k]) ? mods[k].join("\u2013") : JSON.stringify(mods[k]))); return o; }
  function list(p) {
    var out = [], seen = {}, eq = p.equipment || {};
    Object.keys(eq).forEach(function (k) { var it = eq[k]; if (it && isGear(it)) { out.push({ it: it, worn: true }); seen[it.uid] = 1; } });
    (p.inventory.items || []).forEach(function (it) { if (isGear(it) && !seen[it.uid]) out.push({ it: it, worn: false }); });
    return out;
  }
  function costHtml(p, cost) { return cost ? W().costText(p, cost) : ""; }
  function lvlHtml(p) {
    var t = lvlTable(), l = craftLevel(p), xp = p.craftXp || 0, nx = t[l + 1];
    return '<div class="mut" style="margin-bottom:4px">Crafting level <b style="color:#ffcf96">' + l + "</b>" + (nx != null ? " \u00b7 " + fmt(xp) + " / " + fmt(nx) + " XP" : " \u00b7 max") + "</div>";
  }
  function btn(act, label, c, extra) { return '<button type="button" class="btn2' + (c && c.ok ? " pri" : "") + '" data-bench-act="' + act + '"' + (extra || "") + (c && c.ok ? "" : " disabled") + ">" + label + "</button>"; }
  function forgeHtml(s, st) {
    css(); var p = s.player, l = list(p);
    if (st && st.uid && l.some(function (r) { return r.it.uid === st.uid; })) { sel = st.uid; st.uid = null; }
    if (!l.length) return lvlHtml(p) + '<div class="card mut">No gear to work on.</div>';
    if (!sel || !l.some(function (r) { return r.it.uid === sel; })) sel = l[0].it.uid;
    var it = l.find(function (r) { return r.it.uid === sel; }).it;
    var h = lvlHtml(p) + '<div class="fpick">' + l.map(function (r) { return '<button type="button" data-bench-act="pick" data-uid="' + esc(r.it.uid) + '" class="' + (r.it.uid === sel ? "on" : "") + '" title="' + esc(r.it.name) + '">' + (r.worn ? '<span class="w">worn</span>' : "") + W().icon(r.it) + "</button>"; }).join("") + "</div>";
    var temper = isNormal(it) && it.temperMax ? ' \u00b7 Temper <b style="color:' + (it.temper ? "#ffcf96" : "#ff9a8a") + '">' + (it.temper | 0) + "</b> / " + it.temperMax + (it.temper ? "" : " (Set)") : (isNormal(it) ? "" : " \u00b7 no Temper");
    h += '<div class="card" data-forge-item="' + esc(it.uid) + '"><div class="nm">' + esc(it.name) + ' <span class="mut">' + esc(root.ABCraft && ABCraft.rankLabel ? ABCraft.rankLabel(it) : rankName(it.rarity)) + " \u00b7 item level " + (it.ilvl || 1) + temper + "</span></div>";
    if (isNormal(it)) {
      (it.affixes || []).forEach(function (a, i) {
        var ch = canHone(p, it, i), cr = canReforge(p, it, i), to = ch.to || honeTarget(it, i);
        h += '<div class="fa" data-forge-affix="' + i + '"><div class="t"><span class="tchip">T' + (a.tier || tierFor(defOf(a) || a)) + "</span>" + esc(modLines(root.ABPower ? ABPower.scaleMods(it, a.mods) : a.mods).join(", ")) +
          '<div class="c">' + (to ? "Hone \u2192 T" + to.tier + ": " + costHtml(p, honeCost(to)) + (ch.ok || !ch.reason || ch.reason === "Missing materials." ? "" : " \u00b7 " + esc(ch.reason)) : "Top tier") + " \u00b7 Reforge: " + costHtml(p, (C().reforge || {}).cost) + "</div></div>" +
          btn("hone", "Hone", ch, ' data-i="' + i + '"') + btn("reforge", "Reforge", cr, ' data-i="' + i + '"') + "</div>";
      });
      var ci = canImbue(p, it), cu = canRankUp(p, it), cp = canPunch(p, it), cs = canSeal(p, it), nr = nextRank(it);
      h += '<div class="facts">' +
        '<div class="card"><div class="t"><b>Imbue</b> <span class="mut">' + it.affixes.length + " / " + imbueMax(it) + " affixes</span><div class=\"mut\">" + (ci.ok || ci.reason === "Missing materials." ? costHtml(p, (C().imbue || {}).cost) : esc(ci.reason)) + "</div></div>" + btn("imbue", "Imbue", ci) + "</div>" +
        '<div class="card"><div class="t"><b>Rank Up</b> <span class="mut">' + (nr ? "\u2192 " + esc(rankName(nr)) + (cu.chance != null || cu.ok ? " \u00b7 " + Math.round(100 * (((C().rankUp || {}).chance || {})[nr] == null ? 1 : C().rankUp.chance[nr])) + "%" : "") : "") + '</span><div class="mut">' + (cu.ok || cu.reason === "Missing materials." ? costHtml(p, rankCost(it)) : esc(cu.reason)) + "</div></div>" + btn("rankup", "Rank Up", cu) + "</div>" +
        '<div class="card"><div class="t"><b>Sockets</b> <span class="mut">' + (it.socketMax || 0) + " / " + baseMaxSockets(it) + '</span><div class="mut">Punch: ' + (cp.ok || cp.reason === "Missing materials." ? costHtml(p, ((C().sockets || {}).punch || {}).cost) : esc(cp.reason)) + "</div></div>" + btn("punch", "Punch", cp) + btn("seal", "Seal", cs) + "</div></div>";
    } else if (isUniq(it)) {
      var keys = rangeKeys(it), roll = it.uniqueRoll || {};
      if (!keys.length) h += '<div class="mut">This unique has no ranged stats to reroll.</div>';
      keys.forEach(function (k) {
        var d = uDef(it), r = d.ranges[k], cur = roll[k] != null ? roll[k] : (d.mods || {})[k], cr = canReroll(p, it, k);
        var m = {}; m[k] = cur;
        h += '<div class="fa" data-forge-range="' + esc(k) + '"><div class="t">' + esc(modLines(m).join(", ")) + ' <span class="mut">(' + esc(Array.isArray(r[0]) ? r[0].join("\u2013") + " to " + r[1].join("\u2013") : r.join("\u2013")) + ')</span><div class="c">Reroll: ' + costHtml(p, (C().uniqueReroll || {}).cost) + "</div></div>" + btn("reroll", "Reroll", cr, ' data-k="' + esc(k) + '"') + "</div>";
      });
    } else h += '<div class="mut">Set pieces can\'t be worked at the bench.</div>';
    return h + '<div class="mut" style="margin-top:4px">' + esc(((C().temperCost && temperOn()) ? "Each action spends Temper from the item; at 0 it is Set." : "")) + "</div></div>";
  }
  function salvageHtml(s) {
    css(); var p = s.player, l = (p.inventory.items || []).filter(function (it) { return isGear(it); });
    var h = lvlHtml(p) + '<div class="mut" style="margin-bottom:6px">' + esc((C().salvage || {}).about || "") + "</div>" +
      '<div style="display:flex;gap:6px;margin-bottom:6px"><button type="button" class="btn2" data-bench-act="salv-low">Salvage all Common + Magic</button><button type="button" class="btn2" data-bench-act="salv-rare">Salvage all Rare</button></div>';
    if (!l.length) return h + '<div class="card mut">No gear in your bag.</div>';
    return h + l.map(function (it) {
      var y = salvageYield(it), c = canSalvage(p, it);
      return '<div class="card" data-salv="' + esc(it.uid) + '"><div class="row"><div class="ico">' + W().icon(it) + '</div><div style="flex:1;min-width:0"><div class="nm">' + esc(it.name) + ' <span class="mut">' + esc(root.ABCraft && ABCraft.rankLabel ? ABCraft.rankLabel(it) : it.rarity) + '</span></div><div class="mut">' +
        Object.keys(y).map(function (k) { return y[k][0] + (y[k][1] > y[k][0] ? "\u2013" + y[k][1] : "") + " " + esc(W().matName(k)); }).join(" \u00b7 ") + (c.ok ? "" : " \u00b7 " + esc(c.reason)) + "</div></div>" + btn("salvage", "Salvage", c, ' data-uid="' + esc(it.uid) + '"') + "</div></div>";
    }).join("");
  }
  function sel0(p) { return W().findItem(p, sel); }
  function forgeAct(act, el, s) {
    var p = s.player;
    if (act === "pick") { sel = el.getAttribute("data-uid"); return null; }
    var it = sel0(p); if (!it) return { ok: false, toast: "Pick an item.", kind: "bad" };
    var i = +el.getAttribute("data-i"), r = act === "hone" ? hone(p, it, i) : act === "reforge" ? reforge(p, it, i) : act === "imbue" ? imbue(p, it) : act === "rankup" ? rankUp(p, it) : act === "punch" ? punch(p, it) : act === "seal" ? seal(p, it) : act === "reroll" ? reroll(p, it, el.getAttribute("data-k")) : null;
    if (r && !r.ok && !r.toast) r.toast = r.reason;
    return r;
  }
  function salvageAct(act, el, s) {
    var p = s.player, r;
    if (act === "salv-low") r = salvageMany(p, ["common", "magic"]);
    else if (act === "salv-rare") r = salvageMany(p, ["rare"]);
    else if (act === "salvage") { var it = W().findItem(p, el.getAttribute("data-uid")); r = it ? salvage(p, it) : { ok: false, reason: "Item not found." }; }
    if (r && !r.ok && !r.toast) r.toast = r.reason;
    return r;
  }
  function init() {
    if (!bound && root.ABBus) { bound = true; ABBus.on("combat:killed", onKill); }
    if (root.ABBench) { ABBench.register({ id: "forge", label: "Forge", order: 20, html: forgeHtml, onAct: forgeAct }); ABBench.register({ id: "salvage", label: "Salvage", order: 30, html: salvageHtml, onAct: salvageAct }); }
  }
  if (root.document) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init(); }
  root.ABForge = { on: on, craftLevel: craftLevel, addXp: addXp, levelFor: levelFor, isNormal: isNormal, isGear: isGear,
    honeTarget: honeTarget, canHone: canHone, hone: hone, canReforge: canReforge, reforge: reforge, imbueMax: imbueMax, canImbue: canImbue, imbue: imbue,
    nextRank: nextRank, rankCost: rankCost, canRankUp: canRankUp, rankUp: rankUp, baseMaxSockets: baseMaxSockets, canPunch: canPunch, punch: punch, canSeal: canSeal, seal: seal,
    rangeKeys: rangeKeys, canReroll: canReroll, reroll: reroll, salvageYield: salvageYield, canSalvage: canSalvage, salvage: salvage, salvageMany: salvageMany,
    temperOn: temperOn, select: function (uid) { sel = uid; }, onKill: onKill, _rng: null };
})(typeof window !== "undefined" ? window : self);
