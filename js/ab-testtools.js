/* Ashbound STAGING-ONLY Test Tools. Loaded by index.html only when ASHBOUND_CONFIG.STAGING === true, and this file does nothing
   unless that is true AND the game handed over its bridge. The live build never loads it and has no menu button or panel for it.
   Panel: Menu > TEST tools. Spawn items (base / rarity / unique / set / runeword / rune / gem / flask / charm, item level, sockets),
   set the hero's level, add points and gold, ignore level and stat requirements, jump to any zone.
   Also spawn 1/5/10 random maxed uniques raised to Mythical (top upgrade tier; no separate awakened flag) or random maxed set pieces. Also spawn a random maxed Mythical normal item (no unique or set). */
(function () {
  "use strict";
  var C = self.ASHBOUND_CONFIG, B = self.ABSTG_BRIDGE;
  if (!C || C.STAGING !== true || !B) return;
  var S = { kind: "gear", base: "", rarity: "rare", ilvl: 20, sockets: 0, unique: "", set: "", word: "", rune: "", gem: "", flask: "life", charm: "small", count: 1, mythCount: 1, lvl: 30, pts: 5, gold: 1000, zone: "", msg: "" };
  self.ABSTG_IGNORE = false;
  var KINDS = [["gear", "Base item"], ["unique", "Unique"], ["set", "Set item"], ["runeword", "Runeword"], ["rune", "Rune"], ["gem", "Gem"], ["flask", "Flask"], ["charm", "Charm"]];
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function opts(list, cur, val, lab) { return list.map(function (x) { var v = val(x); return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + esc(lab(x)) + "</option>"; }).join(""); }
  function sel(key, list, val, lab) { if (!S[key] && list.length) S[key] = val(list[0]); return '<select class="tt-in" data-tt="' + key + '">' + opts(list, S[key], val, lab) + "</select>"; }
  function num(key, min, max) { return '<input class="tt-in tt-num" data-tt="' + key + '" type="number" inputmode="numeric" min="' + min + '" max="' + max + '" value="' + esc(S[key]) + '">'; }
  function row(label, ctl) { return '<label class="tt-row"><span>' + esc(label) + "</span>" + ctl + "</label>"; }
  function bases() { return B.bases.slice().sort(function (a, b) { return (a.slot || "").localeCompare(b.slot || "") || a.ilvl - b.ilvl || a.name.localeCompare(b.name); }); }
  function render() {
    var o = B.o, p = o.player, h = [];
    if (!p) return '<p class="small">Start a hero first.</p>';
    h.push('<div class="tt"><p class="small tt-note">STAGING test tools. Not in the live game.' + (S.msg ? ' <strong class="good">' + esc(S.msg) + "</strong>" : "") + "</p>");
    h.push("<section class=\"tt-card\"><h3>Spawn item</h3>");
    h.push(row("Type", sel("kind", KINDS, function (x) { return x[0]; }, function (x) { return x[1]; })));
    if (S.kind === "gear") {
      h.push(row("Base", sel("base", bases(), function (b) { return b.id; }, function (b) { return b.name + " \u00b7 " + b.slot + " \u00b7 il" + b.ilvl; })));
      h.push(row("Rarity", sel("rarity", [["common", "Common"], ["magic", "Magic"], ["rare", "Rare"]], function (x) { return x[0]; }, function (x) { return x[1]; })));
      h.push(row("Item level", num("ilvl", 1, 80))); h.push(row("Sockets", num("sockets", 0, 6)));
    } else if (S.kind === "unique") {
      h.push(row("Unique", sel("unique", B.uniques.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }), function (u) { return u.id; }, function (u) { return u.name + " \u00b7 lvl " + u.qlvl; })));
      h.push(row("Sockets", num("sockets", 0, 6)));
    } else if (S.kind === "set") {
      h.push(row("Set item", sel("set", B.sets.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }), function (u) { return u.id; }, function (u) { return u.name + " \u00b7 " + u.setId; })));
    } else if (S.kind === "runeword") {
      h.push(row("Runeword", sel("word", B.words, function (w) { return w.id; }, function (w) { return w.name + " (" + w.runes.map(function (r) { return (B.rune(r) || {}).name || r; }).join("+") + ")"; })));
    } else if (S.kind === "rune") {
      h.push(row("Rune", sel("rune", B.runes, function (r) { return r.id; }, function (r) { return r.name + " \u00b7 tier " + r.tier; })));
    } else if (S.kind === "gem") {
      h.push(row("Gem", sel("gem", B.gems, function (g) { return g.id; }, function (g) { return g.name; })));
    } else if (S.kind === "flask") {
      h.push(row("Flask", sel("flask", [["life", "Life"], ["mana", "Mana"]], function (x) { return x[0]; }, function (x) { return x[1]; }))); h.push(row("Item level", num("ilvl", 1, 80)));
    } else if (S.kind === "charm") {
      h.push(row("Charm size", sel("charm", B.charmSizes, function (c) { return c.id; }, function (c) { return c.word + " (" + c.w + "x" + c.h + ")"; }))); h.push(row("Item level", num("ilvl", 1, 80)));
    }
    h.push(row("How many", num("count", 1, 20)));
    h.push('<div class="row"><button class="btn primary" data-act="tt-add">Add to pack</button><button class="btn" data-act="tt-equip">Add and equip</button></div></section>');
    h.push('<section class="tt-card"><h3>Spawn maxed</h3>');
    h.push('<p class="small muted">Random unique or set piece with best base defense, full sockets, and Mythical rank (the top upgrade tier). There is no separate awakened flag.</p>');
    h.push('<div class="row tt-counts">' + [1, 5, 10].map(function (n) {
      return '<button class="btn' + (S.mythCount === n ? " primary" : "") + '" data-act="tt-mc" data-n="' + n + '">' + n + "</button>";
    }).join("") + "</div>");
    h.push('<button class="btn primary" data-act="tt-mythic">Spawn random maxed Mythical unique</button>');
    h.push('<button class="btn primary" data-act="tt-setmax">Spawn random maxed set piece</button>');
    h.push('<button class="btn primary" data-act="tt-normyth">Spawn random maxed Mythical normal item</button>');
    h.push('<button class="btn" data-act="tt-alluniques">Spawn every unique (Mythical)</button></section>');
    h.push('<section class="tt-card"><h3>Hero</h3>');
    h.push(row("Level (now " + p.level + (p.paragonLevel ? ", P" + p.paragonLevel : "") + ")", num("lvl", 1, B.maxLevel))); h.push('<button class="btn" data-act="tt-level">Set level now</button>');
    h.push('<div class="row"><button class="btn" data-act="tt-level50">Set level 50</button><button class="btn" data-act="tt-paragon10">+10 Paragon</button></div>');
    h.push(row("Points", num("pts", 1, 500)));
    h.push('<div class="row"><button class="btn" data-act="tt-stat">+ stat points</button><button class="btn" data-act="tt-skill">+ skill points</button></div>');
    h.push(row("Gold", num("gold", 1, 9999999))); h.push('<button class="btn" data-act="tt-gold">+ gold</button>');
    h.push('<div class="row"><button class="btn" data-act="tt-heal">Full heal</button><button class="btn" data-act="tt-kill">Kill all here</button></div></section>');
    h.push('<section class="tt-card"><h3>Rules</h3><button class="btn ' + (self.ABSTG_IGNORE ? "primary" : "") + '" data-act="tt-ign">Ignore level &amp; stat requirements: ' + (self.ABSTG_IGNORE ? "ON" : "off") + "</button>");
    h.push('<p class="small muted">Equip any item and learn any skill whatever your level, Strength or Dexterity. Skills still cost a point.</p></section>');
    h.push('<section class="tt-card"><h3>Go to zone</h3>');
    h.push(row("Zone", sel("zone", B.zones, function (z) { return z.id; }, function (z) { return "Act " + z.act + " \u00b7 " + z.name + (z.kind === "town" ? " (town)" : ""); })));
    h.push('<button class="btn" data-act="tt-tp">Go</button></section>');
    h.push('<button class="btn" data-act="panel" data-panel="menu">Back to Menu</button></div>');
    return h.join("");
  }
  function give(item) { return B.q(B.o.player.inventory, item) || B.q(B.o.player.stash, item); }
  function baseOf(it) {
    var id = it && it.baseId;
    for (var i = 0; i < B.bases.length; i++) if (B.bases[i].id === id) return B.bases[i];
    return null;
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function maxOut(it) {
    var b = baseOf(it);
    if (b) {
      if (b.defense) it.defense = Array.isArray(b.defense) ? b.defense[b.defense.length - 1] : b.defense;
      if (b.maxSockets) B.rn(it, b.maxSockets);
      it.ilvl = Math.max(it.ilvl || 1, b.ilvl || 1, 80);
    } else it.ilvl = Math.max(it.ilvl || 1, 80);
    it.tier = "mythical";
    it.identified = true;
    if (self.ABCraft && ABCraft.scaleUnique) ABCraft.scaleUnique(it);
    return it;
  }
  function makeSet(def) {
    if (!def) return null;
    var it = B._e(def.baseId);
    if (!it) return null;
    if (it.uniqueId || it.rarity === "unique") return null;
    if (!B.Ho(it, def)) return null;
    it.identified = true;
    return it;
  }
  function spawnMaxed(kind, n) {
    var out = [], i, it, def;
    n = Math.max(1, Math.min(10, n | 0));
    for (i = 0; i < n; i++) {
      it = null;
      if (kind === "mythic") { def = pick(B.uniques); it = B.Lt(def.id); }
      else if (kind === "set") { def = pick(B.sets); it = makeSet(def); }
      else {
        def = pick(B.bases);
        it = def ? B._e(def.id) : null;
        if (it && (it.uniqueId || it.setId || it.setItemId || it.rarity === "unique" || it.rarity === "set")) it = null;
        if (it) { it.rarity = "mythical"; it.uniqueId = null; it.setId = null; it.setItemId = null; }
      }
      if (it) out.push(maxOut(it));
    }
    return out;
  }
  function make() {
    var n = [], k = S.kind, p = B.o.player, il = Math.max(1, Math.min(80, S.ilvl | 0)), so = Math.max(0, Math.min(6, S.sockets | 0));
    for (var i = 0; i < Math.max(1, Math.min(20, S.count | 0)); i++) {
      var it = null;
      if (k === "gear") { it = B.le(il, 0, Math.random, { baseId: S.base, rarity: S.rarity }); if (so) B.rn(it, so); }
      else if (k === "unique") { it = B.Lt(S.unique); if (so) B.rn(it, so); }
      else if (k === "set") { var si = B.sets.find(function (x) { return x.id === S.set; }); it = makeSet(si); }
      else if (k === "runeword") {
        var w = B.words.find(function (x) { return x.id === S.word; }), bs = B.bases.filter(function (b) { return w.slots.indexOf(b.slot) >= 0 && (b.maxSockets || 0) >= w.runes.length; }).sort(function (a, b) { return a.ilvl - b.ilvl; });
        var pick = bs.find(function (b) { return b.id === S.base; }) || bs[0]; if (!pick) return n;
        it = B._e(pick.id); B.rn(it, w.runes.length); w.runes.forEach(function (r) { B.on(it, B.Oe(r)); });
      }
      else if (k === "rune") it = B.Oe(S.rune);
      else if (k === "gem") it = B.Tt(S.gem);
      else if (k === "flask") it = B.be(S.flask, il);
      else if (k === "charm") it = B.la(null, S.charm, Math.random, { ilvl: il });
      if (it) { it.identified = true; n.push(it); }
    }
    return n;
  }
  function say(m) { S.msg = m; B.toast(m, "good"); }
  function act(e, t) {
    var o = B.o, p = o.player; if (!p) return;
    if (e === "tt-add" || e === "tt-equip") {
      var items = make(), ok = 0, last = null;
      items.forEach(function (it) { if (give(it)) { ok++; last = it; } });
      if (e === "tt-equip" && last && last.slot) { var slot = last.slot === "ring" ? (p.equipment.ring1 ? "ring2" : "ring1") : last.slot; B.equip(last, slot); }
      say(ok ? "Added " + ok + (ok === 1 ? " item" : " items") + (e === "tt-equip" ? " (equipped)" : "") : "Pack and stash are full.");
    } else if (e === "tt-level" || e === "tt-level50") {
      var N = e === "tt-level50" ? B.maxLevel : Math.max(1, Math.min(B.maxLevel, S.lvl | 0)), d = N - p.level;
      if (d > 0) { p.statPoints += B.perLevel.stat * d; p.skillPoints += B.perLevel.skill * d; }
      p.level = N; p.xp = 0;
      if (N < B.maxLevel) { p.paragonLevel = 0; p.paragonXp = 0; }
      B.se(); p.hp = o.sheet.life; p.mana = o.sheet.mana; say("Level " + N + ".");
    } else if (e === "tt-paragon10") {
      if (self.ASHBOUND && self.ASHBOUND.addParagon) self.ASHBOUND.addParagon(10);
      else {
        if (typeof ABProgress !== "undefined") ABProgress.addParagonLevels(p, 10);
        B.se(); p.hp = o.sheet.life; p.mana = o.sheet.mana;
      }
      say("Paragon " + (p.paragonLevel || 0) + ".");
    } else if (e === "tt-stat") { p.statPoints += Math.max(1, S.pts | 0); say("+" + (S.pts | 0) + " stat points."); }
    else if (e === "tt-skill") { p.skillPoints += Math.max(1, S.pts | 0); say("+" + (S.pts | 0) + " skill points."); }
    else if (e === "tt-gold") { p.gold += Math.max(1, S.gold | 0); say("+" + (S.gold | 0) + " gold."); }
    else if (e === "tt-heal") { B.se(); p.hp = o.sheet.life; p.mana = o.sheet.mana; say("Healed."); }
    else if (e === "tt-kill") { if (self.ASHBOUND && self.ASHBOUND.killAll) self.ASHBOUND.killAll(); say("Cleared the zone."); }
    else if (e === "tt-ign") { self.ABSTG_IGNORE = !self.ABSTG_IGNORE; B.se(); say("Requirements " + (self.ABSTG_IGNORE ? "ignored." : "back on.")); }
    else if (e === "tt-tp") { o.ui.panel = null; self.ASHBOUND.travel(S.zone); }
    else if (e === "tt-mc") { S.mythCount = Math.max(1, Math.min(10, Number(t && t.n) || 1)); }
    else if (e === "tt-mythic" || e === "tt-setmax" || e === "tt-normyth") {
      var kind = e === "tt-mythic" ? "mythic" : e === "tt-setmax" ? "set" : "normal";
      var items = spawnMaxed(kind, S.mythCount), ok = 0;
      items.forEach(function (it) { if (give(it)) ok++; });
      var label = kind === "mythic" ? "mythic unique" : kind === "set" ? "set piece" : "mythic normal item";
      say(ok ? ("Added " + ok + " maxed " + label + (ok === 1 ? "" : "s")) : "Pack and stash are full.");
    } else if (e === "tt-alluniques") {
      var added = 0, i, it, def;
      for (i = 0; i < B.uniques.length; i++) {
        def = B.uniques[i];
        it = def ? B.Lt(def.id) : null;
        if (it && give(maxOut(it))) added++;
      }
      say(added ? ("Added " + added + " Mythical uniques.") : "Pack and stash are full.");
    }
    B.se(); B.refresh();
  }
  function onChange(ev) {
    var el = ev.target; if (!el || !el.dataset || !el.dataset.tt || !el.closest || !el.closest("#panel")) return;
    var k = el.dataset.tt, v = el.type === "number" ? Number(el.value) : el.value; S[k] = v; S.msg = "";
    if (k === "kind" || k === "base") B.refresh();
  }
  document.addEventListener("change", onChange);
  if (!document.getElementById("ab-tt-style")) {
    var st = document.createElement("style"); st.id = "ab-tt-style";
    st.textContent = ".tt{display:flex;flex-direction:column;gap:8px}.tt-card{border:1px solid var(--line-dim);border-radius:12px;background:#1c1612;padding:8px 10px;display:flex;flex-direction:column;gap:6px}" +
      ".tt-card h3{margin:0 0 2px;font-size:14px}.tt-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px}.tt-row span{flex:0 0 auto;max-width:42%}" +
      ".tt-in{flex:1 1 auto;min-width:0;min-height:44px;background:#120e0b;color:#f0e2c4;border:1px solid var(--line-dim);border-radius:8px;padding:4px 8px;font:inherit}.tt-num{max-width:130px}" +
      ".tt .btn{min-height:44px}.tt .row{display:flex;gap:8px;flex-wrap:wrap}.tt .row .btn{flex:1 1 120px}.tt-counts .btn{flex:1 1 44px}";
    document.head.appendChild(st);
  }
  self.ABSTG = { render: render, act: act, state: S };
  B.refresh();
})();
