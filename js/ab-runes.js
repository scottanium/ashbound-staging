/* v84q runeword overhaul (power-notes/DESIGN.md 2e). Data: data/content.json runes / runewords (Elder runes T9-12 and Elder
   words added), data/power.json "runewords" (codex labels, signatures, drops, first-word quest, socket tab).
   - Codex: Journal tab "Runewords" with filters (Can make now / Close / Weapon / Body-Shield / Elder / All / Runes), each word
     with its runes (owned green, missing red + where to get them), the base it needs and whether you have one, a preview of
     its stats at your level, its signature effect, and Pin. A pinned word marks its runes and bases in the bag and doubles
     its runes' drop weight.
   - Bench "Sockets" tab: pick a socketed item, see its sockets and what it is spelling, put runes in (the completing rune is
     listed first and shows a before -> after preview), take runes out any time.
   - Signature effect per word (js/ab-effects.js reads ABRunes.signature); stats scale with the base's Item Power
     (js/ab-power.js; normal words count as at most Fabled, Elder words go to Mythical and awaken to stage 5).
   - Ground names show sockets "[3]"; the loot filter has a Sockets condition (js/ab-lefilter.js).
   - Act 1: Lye gives An + Bri and a 2-socket Ashwood Knife to spell Saltedge (player.progress.rwFirst).
   - Drops (index.html ds): normal rune chance 5%, pinned word's runes x2, bosses drop 2 runes, Elder runes from mlvl 40. */
(function (root) {
  "use strict";
  var st = { filter: null, sel: null, preview: null }, cssDone = false, lastScan = 0;
  function D() { return root.ASHBOUND_DATA || {}; }
  function C() { return ((D().power || {}).runewords) || {}; }
  function on() { return !!(root.ABPower && ABPower.on() && (D().power || {}).runewords); }
  function S() { return root.ASHBOUND && ASHBOUND.state; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function runes() { return D().runes || []; }
  function words() { return D().runewords || []; }
  function rune(id) { return runes().find(function (r) { return r.id === id; }) || null; }
  function word(id) { return words().find(function (w) { return w.id === id; }) || null; }
  function isElder(id) { var w = word(id); return !!(w && w.elder); }
  function wordMods(e, a) { return a.mods; }
  function signature(item) { if (!on() || !item || !item.runeword) return null; return (C().signatures || {})[item.runeword] || null; }
  function modLines(m) { try { if (root.abModLines) return root.abModLines(m); } catch (e) {} var o = []; for (var k in m || {}) o.push(k + " " + JSON.stringify(m[k])); return o; }
  function recalc() { if (root.ASHBOUND && ASHBOUND.recalc) ASHBOUND.recalc(); var s = S(); if (s && s.ui) s.ui.rev++; if (s) s.pendingSave = true; }
  /* ---------- what the hero holds ---------- */
  function bagItems(p) { return [].concat(p.inventory && p.inventory.items || [], p.stash && p.stash.items || [], p.cube && p.cube.items || []); }
  function allGear(p) { var eq = p.equipment || {}; return bagItems(p).concat(Object.keys(eq).map(function (k) { return eq[k]; })).filter(Boolean); }
  function owned(p) { var c = {}; bagItems(p).forEach(function (it) { if (it && it.rarity === "rune" && it.runeId) c[it.runeId] = (c[it.runeId] || 0) + 1; }); return c; }
  function fits(w, it) { return !!(it && it.slot && w.slots.indexOf(it.slot) >= 0 && !it.uniqueId && it.rarity !== "unique" && it.rarity !== "set"); }
  function maxSock(it) { var b = (D().itemBases || []).find(function (x) { return x.id === it.baseId; }); return (b && b.maxSockets) || 0; }
  function bases(p, w) {
    var exact = [], punch = [];
    allGear(p).forEach(function (it) {
      if (!fits(w, it) || it.runeword) return;
      var filled = (it.sockets || []).filter(Boolean);
      var prefixOk = filled.every(function (r, i) { return r.runeId === w.runes[i]; });
      if ((it.socketMax || 0) === w.runes.length && prefixOk) exact.push(it);
      else if (!filled.length && maxSock(it) >= w.runes.length) punch.push(it);
    });
    return { exact: exact, punch: punch };
  }
  function status(p, w) {
    var c = Object.assign({}, owned(p)), have = w.runes.map(function (id) { if (c[id] > 0) { c[id]--; return true; } return false; });
    var miss = have.filter(function (x) { return !x; }).length, b = bases(p, w);
    return { have: have, missing: miss, bases: b, canMake: miss === 0 && b.exact.length > 0, close: miss <= 1 };
  }
  function pinned(p) { return p && p.progress && p.progress.rwPin || null; }
  function setPin(p, id) { p.progress = p.progress || {}; p.progress.rwPin = p.progress.rwPin === id ? null : id; }
  /* ---------- signature text ---------- */
  function sigText(item, spec) {
    if (!spec) return "";
    var typ = ((D().uniqueEffects || {}).types || []).find(function (t) { return t.id === spec.type; }); if (!typ) return spec.name || "";
    var nums = {}; for (var k in spec) if (k !== "type" && k !== "name") nums[k] = spec[k];
    if (item && root.ABPower) { var m = ABPower.effectMul ? ABPower.effectMul(item) : 1; (typ.scale || []).forEach(function (k) { if (typeof nums[k] === "number") nums[k] = Math.round(nums[k] * m * 10) / 10; }); }
    return (spec.name || typ.name) + ": " + String(typ.text || "").replace(/\{(\w+)\}/g, function (_, k) { return nums[k] != null ? nums[k] : ""; });
  }
  /* ---------- preview: the word's stats on a base at the hero's level ---------- */
  function previewItem(p, w) {
    var b = bases(p, w).exact[0];
    var it = b ? JSON.parse(JSON.stringify(b)) : { ilvl: (p && p.level) || 1, rarity: w.elder ? "mythical" : "rare", tier: w.elder ? "mythical" : "rare", slot: w.slots[0] };
    it.runeword = w.id; return it;
  }
  function previewLines(p, w) { var it = previewItem(p, w); var m = root.ABPower ? ABPower.scaleMods(it, w.mods) : w.mods; return modLines(m); }
  /* ---------- codex (Journal tab) ---------- */
  function css() {
    if (cssDone || !root.document) return; cssDone = true;
    var s = document.createElement("style"); s.id = "ab-runes-style";
    s.textContent = [
      ".rw-how{font-size:12px;color:#c9b79c;margin:0 0 6px}",
      ".rw-filters{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px}",
      ".rw-filters button{border:1px solid #6b5536;border-radius:14px;padding:3px 10px;background:#2a1f17;color:#efe4d2;font-size:12px}",
      ".rw-filters button.on{background:#d9772e;color:#1b0f06;font-weight:700}",
      ".rw-card{border:1px solid #4a3a28;border-radius:10px;background:#211812;padding:7px 9px;margin-bottom:7px}",
      ".rw-card.pin{border-color:#ffb060;box-shadow:0 0 0 1px #ffb060 inset}",
      ".rw-card .rw-top{display:flex;align-items:center;gap:8px}.rw-card .rw-nm{font:700 15px Georgia,serif;color:#e8c77a;flex:1 1 auto}",
      ".rw-card .rw-eld{font-size:10px;border:1px solid #c98cff;color:#d9b0ff;border-radius:8px;padding:0 6px;margin-left:6px}",
      ".rw-runes{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}",
      ".rw-rune{border:1px solid #5a4630;border-radius:7px;padding:1px 7px;font-size:12px}.rw-rune.ok{color:#9be8a3;border-color:#3f7a46}.rw-rune.no{color:#ff9a8a;border-color:#7a3f3a}",
      ".rw-rune small{color:#9a8f80;margin-left:3px}",
      ".rw-l{font-size:11.5px;color:#c9b79c}.rw-l .ok{color:#9be8a3}.rw-l .no{color:#ff9a8a}",
      ".rw-stats{display:flex;flex-wrap:wrap;gap:2px 10px;font-size:12px;color:#8fb4ff;margin-top:3px}",
      ".rw-sig{font-size:12px;color:#ffd34d;margin-top:3px}",
      ".rw-pinbtn{border:1px solid #ffb060;border-radius:8px;padding:3px 10px;background:#3a2414;color:#ffcf96;font-size:12px}",
      ".rw-pinbtn.on{background:#d9772e;color:#1b0f06}",
      ".rw-mark{position:absolute;right:1px;top:1px;width:9px;height:9px;border-radius:50%;background:#ffb060;box-shadow:0 0 4px #ffb060;pointer-events:none}",
      ".rw-sockline{margin:4px 0 2px;font-size:12px;color:#c9b79c;display:flex;align-items:center;gap:6px;flex-wrap:wrap}",
      ".rw-sockline .pips{letter-spacing:2px;color:#ffcf96}",
      "#ab-bench .sk-row{display:flex;gap:6px;align-items:center;margin:6px 0}",
      "#ab-bench .sk{width:38px;height:38px;border-radius:50%;border:2px solid #6b5536;display:flex;align-items:center;justify-content:center;font-size:11px;background:#140e0a;position:relative}",
      "#ab-bench .sk.full{border-color:#ffb060;color:#ffcf96}#ab-bench .sk button{position:absolute;right:-6px;top:-6px;width:18px;height:18px;border-radius:50%;border:1px solid #ff9a8a;background:#3a1a14;color:#ff9a8a;font-size:11px;line-height:14px;padding:0}",
      "#ab-bench .rw-runelist{display:flex;flex-wrap:wrap;gap:6px}",
      "#ab-bench .rw-runelist .card{flex:1 1 180px;margin:0;display:flex;align-items:center;gap:6px}",
      "#ab-bench .rw-cmp{display:grid;grid-template-columns:max-content max-content max-content;gap:1px 10px;font-size:12px;margin:4px 0}",
      "#ab-bench .rw-cmp .up{color:#6fdc7a}#ab-bench .rw-cmp .dn{color:#ff6a5a}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(s);
  }
  function whereText(r) { var w = C().where || {}; return (w[String(r.tier)] || "") + (r.tier > 1 && w.upgrade ? " " + w.upgrade : ""); }
  function runeChip(id, ok, cnt) { var r = rune(id) || { name: id }; return '<span class="rw-rune ' + (ok ? "ok" : "no") + '" title="' + esc(r ? whereText(r) : "") + '">' + esc(r.name) + (r.tier ? "<small>T" + r.tier + "</small>" : "") + "</span>"; }
  function baseLine(p, w, sx) {
    var need = esc(w.slots.map(function (s) { var n = (D().slotNames || {})[s]; n = n || s; return n.charAt(0).toUpperCase() + n.slice(1); }).join(" or ")) + " \u00b7 exactly " + w.runes.length + " sockets";
    var b = sx.bases;
    if (b.exact.length) return need + ' \u00b7 <span class="ok">You have: ' + esc(b.exact[0].name) + " [" + b.exact[0].socketMax + "]</span>";
    if (b.punch.length) return need + ' \u00b7 <span class="no">' + esc(b.punch[0].name) + " [" + (b.punch[0].socketMax || 0) + "] \u2192 punch or seal a socket at the Bench</span>";
    return need + ' \u00b7 <span class="no">No base yet</span>';
  }
  function filtered(p, f) {
    return words().filter(function (w) {
      var sx = status(p, w);
      if (f === "make") return sx.canMake;
      if (f === "close") return sx.close;
      if (f === "weapon") return w.slots.indexOf("weapon") >= 0;
      if (f === "armor") return w.slots.indexOf("armor") >= 0 || w.slots.indexOf("offhand") >= 0;
      if (f === "elder") return !!w.elder;
      return true;
    });
  }
  function codexHtml() {
    css(); var s = S(), p = s.player, cf = C();
    if (!st.filter) st.filter = filtered(p, "make").length ? "make" : "all";
    var h = '<div class="rw-codex"><p class="rw-how">' + esc(cf.how || "") + '</p><div class="rw-filters">' + (cf.filters || []).map(function (f) { return '<button type="button" data-rw-act="filter" data-f="' + esc(f[0]) + '" class="' + (st.filter === f[0] ? "on" : "") + '">' + esc(f[1]) + "</button>"; }).join("") + "</div>";
    if (st.filter === "runes") {
      var c = owned(p);
      return h + runes().map(function (r) { return '<div class="rw-card" data-rw-rune="' + esc(r.id) + '"><div class="rw-top"><span class="rw-nm">' + esc(r.name) + ' <small class="rw-l">T' + r.tier + (r.elder ? " \u00b7 " + esc(cf.elderLabel || "Elder") : "") + '</small></span><span class="rw-l ' + (c[r.id] ? "ok" : "") + '">You have ' + (c[r.id] || 0) + '</span></div><div class="rw-stats">' + modLines(r.mods).map(esc).join(" \u00b7 ") + '</div><div class="rw-l">' + esc(whereText(r)) + "</div></div>"; }).join("") + "</div>";
    }
    var list = filtered(p, st.filter), pin = pinned(p);
    if (!list.length) h += '<div class="rw-card rw-l">Nothing here yet. Try All.</div>';
    list.sort(function (a, b) { return (b.id === pin) - (a.id === pin); });
    h += list.map(function (w) {
      var sx = status(p, w), sig = (cf.signatures || {})[w.id], pi = previewItem(p, w);
      return '<div class="rw-card' + (w.id === pin ? " pin" : "") + '" data-rw-word="' + esc(w.id) + '"><div class="rw-top"><span class="rw-nm">' + esc(w.name) + (w.elder ? '<span class="rw-eld">' + esc(cf.elderLabel || "Elder") + "</span>" : "") + "</span>" +
        (sx.canMake ? '<span class="rw-l ok">Can make now</span>' : "") + '<button type="button" class="rw-pinbtn' + (w.id === pin ? " on" : "") + '" data-rw-act="pin" data-w="' + esc(w.id) + '">' + (w.id === pin ? "Pinned" : "Pin") + "</button></div>" +
        '<div class="rw-runes">' + w.runes.map(function (id, i) { return runeChip(id, sx.have[i]); }).join('<span class="rw-l">\u2192</span>') + "</div>" +
        '<div class="rw-l">' + baseLine(p, w, sx) + "</div>" +
        '<div class="rw-stats">' + previewLines(p, w).map(esc).join(" \u00b7 ") + ' <span class="rw-l">(' + (sx.bases.exact[0] ? "on your " + esc(sx.bases.exact[0].name) : "on a level " + (p.level || 1) + " " + (w.elder ? "Mythical" : "Rare") + " base") + ")</span></div>" +
        (sig ? '<div class="rw-sig">\u2726 ' + esc(sigText(pi, sig)) + "</div>" : "") +
        (w.id === pin ? '<div class="rw-l">' + esc(cf.pinNote || "") + "</div>" : "") + "</div>";
    }).join("");
    return h + "</div>";
  }
  function tabLabel() { return C().tabLabel || "Runewords"; }
  /* ---------- Sockets tab (Bench) ---------- */
  function socketed(p) {
    var out = [], seen = {}, eq = p.equipment || {};
    Object.keys(eq).forEach(function (k) { var it = eq[k]; if (it && it.socketMax > 0) { out.push({ it: it, worn: true }); seen[it.uid] = 1; } });
    (p.inventory.items || []).forEach(function (it) { if (it && it.socketMax > 0 && !seen[it.uid] && it.rarity !== "rune") out.push({ it: it, worn: false }); });
    return out;
  }
  function spelling(it) {
    var filled = (it.sockets || []).map(function (x) { return x && x.runeId || null; }), n = filled.filter(Boolean).length;
    var cand = words().filter(function (w) { return w.runes.length === (it.socketMax || 0) && w.slots.indexOf(it.slot) >= 0 && filled.every(function (r, i) { return !r || r === w.runes[i]; }) && filled.slice(0, n).every(Boolean); });
    return { n: n, cand: cand, done: it.runeword ? word(it.runeword) : null, gap: filled.slice(0, n).some(function (x) { return !x; }) };
  }
  function nextIndex(it) { return (it.sockets || []).findIndex(function (x) { return !x; }); }
  function sheetSnap() { var sh = (S() || {}).sheet || {}; return { "Damage": ((sh.physMin || 0) + (sh.physMax || 0)) / 2, "Fire": ((sh.fireMin || 0) + (sh.fireMax || 0)) / 2, "Life": sh.life || 0, "Defense": sh.defense || 0, "Attack": sh.attack || 0, "Crit %": sh.crit || 0, "Attack speed": sh.aps || 0 }; }
  function sock() { return root.abSock || null; }
  function putRune(p, it, ru, dry) {
    var k = sock(); if (!k) return { ok: false, reason: "Sockets are not ready." };
    var before = dry ? sheetSnap() : null;
    p.inventory.items = p.inventory.items.filter(function (x) { return x.uid !== ru.uid; });
    var r = k.put(it, ru);
    if (!r.ok) { p.inventory.items.push(ru); return r; }
    if (dry) {
      if (root.ASHBOUND && ASHBOUND.recalc) ASHBOUND.recalc(); var after = sheetSnap(), word0 = it.runeword;
      var back = k.take(it, r.index); p.inventory.items.push(back); if (root.ASHBOUND && ASHBOUND.recalc) ASHBOUND.recalc();
      return { ok: true, before: before, after: after, word: word0 };
    }
    recalc();
    if (it.runeword) onWord(p, it);
    return { ok: true, toast: it.runeword ? (word(it.runeword).name + "! The runeword wakes.") : ru.name + " set in " + (it.name || "the item") + "." };
  }
  function takeRune(p, it, i) {
    var k = sock(); if (!k) return { ok: false, reason: "Sockets are not ready." };
    var ru = k.take(it, i); if (!ru) return { ok: false, reason: "That socket is empty." };
    if (root.ASHBOUND && ASHBOUND.give) ASHBOUND.give(ru); else p.inventory.items.push(ru);
    recalc(); return { ok: true, toast: ru.name + " back in your bag." };
  }
  function socketsHtml(s, bst) {
    css(); var p = s.player, l = socketed(p), cf = C().socketTab || {};
    if (bst && bst.uid && l.some(function (r) { return r.it.uid === bst.uid; })) { st.sel = bst.uid; bst.uid = null; st.preview = null; }
    if (!l.length) return '<div class="card mut">No socketed items. Punch a socket at the Forge, or find a base with sockets ("[3]" on the ground).</div>';
    if (!st.sel || !l.some(function (r) { return r.it.uid === st.sel; })) st.sel = l[0].it.uid;
    var it = l.find(function (r) { return r.it.uid === st.sel; }).it, sp = spelling(it);
    var h = '<div class="mut" style="margin-bottom:4px">' + esc(cf.help || "") + '</div><div class="fpick">' + l.map(function (r) { return '<button type="button" data-bench-act="sk-pick" data-uid="' + esc(r.it.uid) + '" class="' + (root.ABBench && ABBench.pickCls ? ABBench.pickCls(r.it, r.it.uid === st.sel ? "on" : "") : (r.it.uid === st.sel ? "on" : "")) + '" style="' + (root.ABBench && ABBench.iconStyle ? ABBench.iconStyle(r.it, 'pick') : "") + '" title="' + esc(r.it.name) + '">' + (r.worn ? '<span class="w">worn</span>' : "") + (root.ABAwaken ? ABAwaken.icon(r.it) : "") + "</button>"; }).join("") + "</div>";
    h += '<div class="card" data-sk-item="' + esc(it.uid) + '"><div class="nm">' + esc(it.runeword && word(it.runeword) ? word(it.runeword).name : it.name) + ' <span class="mut">' + esc(it.slot) + " \u00b7 " + (it.socketMax || 0) + " sockets</span></div>";
    h += '<div class="sk-row">' + (it.sockets || []).map(function (x, i) { return '<div class="sk' + (x ? " full" : "") + '" data-sk="' + i + '">' + (x ? esc(x.name) + '<button type="button" data-bench-act="sk-take" data-i="' + i + '" aria-label="Take out">\u00d7</button>' : "") + "</div>"; }).join("") + "</div>";
    if (sp.done) h += '<div class="ok">Spelled: <b>' + esc(sp.done.name) + "</b>" + ((C().signatures || {})[sp.done.id] ? ' \u00b7 <span style="color:#ffd34d">' + esc(sigText(it, C().signatures[sp.done.id])) + "</span>" : "") + "</div>";
    else if (sp.n && !sp.cand.length) h += '<div class="no">This order spells nothing for ' + (it.socketMax || 0) + " sockets. Take a rune out.</div>";
    else if (sp.cand.length) h += '<div>' + sp.cand.slice(0, 3).map(function (w) { return 'Spelling <b>' + esc(w.name) + "</b>: " + sp.n + " of " + w.runes.length + (sp.n < w.runes.length ? ", next rune <b>" + esc((rune(w.runes[sp.n]) || {}).name || w.runes[sp.n]) + "</b>" : ""); }).join("<br>") + "</div>";
    else h += '<div class="mut">No runeword uses ' + (it.socketMax || 0) + " sockets in a " + esc(it.slot) + ". Runes still add their own stats.</div>";
    if (st.preview) {
      var pv = st.preview, keys = Object.keys(pv.after).filter(function (k) { return Math.abs(pv.after[k] - pv.before[k]) > 0.05; });
      h += '<div class="card" data-sk-preview style="border-color:#ffb060"><b>' + esc(pv.word ? "Completes " + word(pv.word).name : "Preview") + "</b>" + (keys.length ? '<div class="rw-cmp">' + keys.map(function (k) { var d = pv.after[k] - pv.before[k]; return "<span>" + esc(k) + "</span><span>" + fmt1(pv.before[k]) + " \u2192 " + fmt1(pv.after[k]) + '</span><span class="' + (d > 0 ? "up" : "dn") + '">' + (d > 0 ? "+" : "") + fmt1(d) + "</span>"; }).join("") + "</div>" : (pv.word ? '<div class="rw-stats">' + modLines(root.ABPower ? ABPower.scaleMods(Object.assign({}, it, { runeword: pv.word }), word(pv.word).mods) : word(pv.word).mods).map(esc).join(" \u00b7 ") + "</div>" : "")) +
        '<div style="display:flex;gap:6px;margin-top:4px"><button type="button" class="btn2 pri" data-bench-act="sk-confirm">Put it in</button><button type="button" class="btn2" data-bench-act="sk-cancel">Not yet</button></div></div>';
    }
    h += "</div>";
    var bag = (p.inventory.items || []).filter(function (x) { return x && x.rarity === "rune"; });
    if (nextIndex(it) < 0) return h + '<div class="mut">Every socket is full.</div>';
    if (!bag.length) return h + '<div class="mut">No runes in your bag.</div>';
    var nextIds = {}, doneIds = {}; sp.cand.forEach(function (w) { var id = w.runes[sp.n]; if (id) { nextIds[id] = 1; if (sp.n === w.runes.length - 1) doneIds[id] = w.id; } });
    bag.sort(function (a, b) { return (!!doneIds[b.runeId] - !!doneIds[a.runeId]) || (!!nextIds[b.runeId] - !!nextIds[a.runeId]) || (a.tier - b.tier); });
    return h + '<div class="rw-runelist">' + bag.map(function (ru) {
      var tag = doneIds[ru.runeId] ? '<span class="ok">completes ' + esc(word(doneIds[ru.runeId]).name) + "</span>" : nextIds[ru.runeId] ? '<span class="ok">next</span>' : "";
      return '<div class="card" data-sk-rune="' + esc(ru.uid) + '"><div style="flex:1;min-width:0"><b>' + esc(ru.name) + '</b> <span class="mut">T' + ru.tier + "</span> " + tag + '<div class="mut">' + esc(modLines((rune(ru.runeId) || {}).mods).join(" \u00b7 ")) + '</div></div><button type="button" class="btn2' + (tag ? " pri" : "") + '" data-bench-act="sk-put" data-uid="' + esc(ru.uid) + '">Put in</button></div>';
    }).join("") + "</div>";
  }
  function fmt1(n) { return Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-US") : (Math.round(n * 10) / 10).toString(); }
  function socketsAct(act, el, s) {
    var p = s.player, it = root.ABAwaken ? ABAwaken.findItem(p, st.sel) : null;
    if (act === "sk-pick") { st.sel = el.getAttribute("data-uid"); st.preview = null; return null; }
    if (!it) return { ok: false, toast: "Pick an item.", kind: "bad" };
    if (act === "sk-take") { st.preview = null; return takeRune(p, it, +el.getAttribute("data-i")); }
    if (act === "sk-cancel") { st.preview = null; return null; }
    if (act === "sk-put" || act === "sk-confirm") {
      var uid = act === "sk-confirm" ? st.preview && st.preview.uid : el.getAttribute("data-uid"), ru = (p.inventory.items || []).find(function (x) { return x.uid === uid; });
      if (!ru) { st.preview = null; return { ok: false, toast: "Rune not found.", kind: "bad" }; }
      if (act === "sk-put") {
        var completes = nextIndex(it) === (it.socketMax || 0) - 1;
        if (completes) { var d = putRune(p, it, ru, true); if (!d.ok) return { ok: false, toast: d.reason, kind: "bad" }; st.preview = { uid: uid, before: d.before, after: d.after, word: d.word }; return null; }
      }
      st.preview = null; var r = putRune(p, it, ru, false); if (!r.ok && !r.toast) r.toast = r.reason; return r;
    }
    return null;
  }
  /* ---------- first runeword (Act 1, Lye) ---------- */
  function fw() { return C().firstWord || null; }
  function fwState(p) { p.progress = p.progress || {}; return p.progress.rwFirst || null; }
  function lyeHtml() {
    if (!on() || !fw()) return ""; css();
    var s = S(), p = s.player, f = fw(), q = fwState(p);
    if (!q) { if ((p.level || 1) < (f.minLevel || 1)) return ""; return '<div class="rw-card" data-rw-first="offer"><div class="rw-nm">' + esc(f.title) + '</div><div class="rw-l">' + esc(f.offer) + '</div><button type="button" class="rw-pinbtn on" data-rw-act="first-take" style="margin-top:5px">' + esc(f.take) + "</button></div>"; }
    if (q === "taken") return '<div class="rw-card" data-rw-first="taken"><div class="rw-nm">' + esc(f.title) + '</div><div class="rw-l">' + esc(f.track) + '</div><button type="button" class="rw-pinbtn" data-bench-open="sockets" style="margin-top:5px">Open Sockets</button></div>';
    return '<div class="rw-card" data-rw-first="done"><div class="rw-nm">' + esc(f.title) + ' <span class="rw-l ok">Done</span></div><div class="rw-l">' + esc(f.done) + "</div></div>";
  }
  function firstTake(p) {
    var f = fw(); if (!f || fwState(p)) return { ok: false };
    (f.runes || []).forEach(function (id) { if (ASHBOUND.giveRune) ASHBOUND.giveRune(id); });
    var kn = ASHBOUND.giveSocketed ? ASHBOUND.giveSocketed(f.base, f.sockets || 2) : null;
    p.progress.rwFirst = "taken"; p.progress.rwPin = f.word;
    recalc(); return { ok: true, toast: "Lye gives you two runes and a knife. " + (f.track || "") };
  }
  function onWord(p, it) {
    p.progress = p.progress || {};
    var q = p.progress.rwFirst, s = S();
    if (q !== "done") { p.progress.rwFirst = "done"; var g = (fw() || {}).rewardGold || 0; if (g) p.gold = (p.gold || 0) + g; if (s) s.toasts.push({ text: "First runeword! " + (g ? "+" + g + " gold. " : "") + ((fw() || {}).done || ""), t: 4, kind: "good" }); }
    if (p.progress.rwPin === it.runeword) p.progress.rwPin = null;
  }
  /* ---------- drops (index.html ds) ---------- */
  function pick(rng, list, mlvl) {
    var p = (S() || {}).player, pin = pinned(p), w = pin ? word(pin) : null, mn = C().elderMinMlvl || 40, wt = (C().drop || {}).pinnedWeight || 2;
    var l = list.filter(function (r) { return !r.elder || (mlvl || 0) >= mn; }); if (!l.length) l = list.filter(function (r) { return !r.elder; });
    var tot = 0, ws = l.map(function (r) { var x = w && w.runes.indexOf(r.id) >= 0 ? wt : 1; tot += x; return x; }), x = rng() * tot;
    for (var i = 0; i < l.length; i++) { x -= ws[i]; if (x < 0) return l[i]; }
    return l[l.length - 1];
  }
  function bossRunes(rng, mlvl) {
    var d = C().drop || {}, n = d.bossRunes || 1, out = [], base = runes().filter(function (r) { return r.tier <= (d.bossMaxTier || 6); });
    for (var i = 0; i < n; i++) out.push(pick(rng, base, mlvl).id);
    if ((mlvl || 0) >= (d.bossElderFromMlvl || 99) && rng() < (d.bossElderChance || 0)) out.push(pick(rng, runes().filter(function (r) { return r.elder; }), mlvl).id);
    return out;
  }
  function dropChance() { return (C().drop || {}).normal || 0.04; }
  /* ---------- bag marks, tooltip socket line, first-full-set toast ---------- */
  function marks(item) {
    var p = (S() || {}).player, pin = pinned(p), w = pin && word(pin); if (!w || !item) return false;
    if (item.rarity === "rune") return w.runes.indexOf(item.runeId) >= 0;
    return !item.runeword && fits(w, item) && ((item.socketMax || 0) === w.runes.length || maxSock(item) >= w.runes.length);
  }
  function sockLine(item) {
    if (!on() || !item || !(item.socketMax > 0) || item.rarity === "rune") return "";
    var filled = (item.sockets || []).some(Boolean);
    if (!filled && !item.runeword && (C().sockLineWhen || "spelling") === "spelling") return ""; // v84q: empty sockets already show in the card's Sockets row; keeps the max card unscrolled
    css(); var sp = spelling(item), pips = (item.sockets || []).map(function (x) { return x ? "\u25cf" : "\u25cb"; }).join("");
    var txt = sp.done ? "" : sp.cand.length ? "Spelling " + sp.cand[0].name + " " + sp.n + "/" + sp.cand[0].runes.length : "";
    var sig = item.runeword ? signature(item) : null;
    return '<div class="rw-sockline"><span class="pips">' + pips + "</span>" + esc(txt) + '<button type="button" class="btn slim" data-bench-open="sockets" data-uid="' + esc(item.uid) + '">Sockets\u2026</button></div>';
  }
  function wrap() {
    if (root.ABUiArt && !ABUiArt.__rw) { var o = ABUiArt.itemHtml; ABUiArt.__rw = true; ABUiArt.itemHtml = function (item) { var b = o.apply(this, arguments); return on() && marks(item) ? b + '<span class="rw-mark" title="Pinned runeword"></span>' : b; }; }
    if (root.ABEffects && !ABEffects.__rw) { var t = ABEffects.tooltipHtml; ABEffects.__rw = true; ABEffects.tooltipHtml = function (item) { return (t ? t.apply(this, arguments) || "" : "") + sockLine(item); }; }
  }
  function scan() {
    var s = S(); if (!on() || !s || s.mode !== "play" || !s.player) return;
    var p = s.player, c = owned(p); p.progress = p.progress || {}; var seen = p.progress.rwSetSeen = p.progress.rwSetSeen || {};
    words().forEach(function (w) {
      if (seen[w.id]) return; var cc = Object.assign({}, c);
      if (w.runes.every(function (id) { if (cc[id] > 0) { cc[id]--; return true; } return false; })) { seen[w.id] = 1; s.toasts.push({ text: String(C().firstSetToast || "").replace("{word}", w.name), t: 4, kind: "good" }); }
    });
  }
  function onDoc(ev) {
    var t = ev.target.closest && ev.target.closest("[data-rw-act]"); if (!t) return;
    ev.preventDefault(); ev.stopPropagation();
    var s = S(), p = s && s.player, a = t.getAttribute("data-rw-act"), r = null; if (!p) return;
    if (a === "filter") st.filter = t.getAttribute("data-f");
    else if (a === "pin") setPin(p, t.getAttribute("data-w"));
    else if (a === "first-take") r = firstTake(p);
    if (r && r.toast) s.toasts.push({ text: r.toast, t: 4, kind: "good" });
    s.pendingSave = true; if (s.ui) s.ui.rev++; if (root.ASHBOUND && ASHBOUND.refresh) ASHBOUND.refresh();
  }
  function init() {
    wrap();
    if (root.document) document.addEventListener("click", onDoc, true);
    if (root.ABBench) ABBench.register({ id: "sockets", label: (C().socketTab || {}).label || "Sockets", order: 15, html: socketsHtml, onAct: socketsAct });
    if (root.setInterval) setInterval(function () { try { scan(); } catch (e) {} }, 2000);
  }
  if (root.document) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init(); }
  if (root.ASHBOUND_DATA_READY && root.ASHBOUND_DATA_READY.then) root.ASHBOUND_DATA_READY.then(wrap);
  root.ABRunes = { on: on, rune: rune, word: word, isElder: isElder, wordMods: wordMods, signature: signature, owned: owned, bases: bases, status: status,
    pinned: pinned, setPin: setPin, sigText: sigText, codexHtml: codexHtml, tabLabel: tabLabel, spelling: spelling, putRune: putRune, takeRune: takeRune,
    lyeHtml: lyeHtml, firstTake: firstTake, onWord: onWord, pick: pick, bossRunes: bossRunes, dropChance: dropChance, marks: marks, sockLine: sockLine, scan: scan, wrap: wrap,
    _st: st };
})(typeof window !== "undefined" ? window : self);
