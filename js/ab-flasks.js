/* Ashbound v84g + invpots: health and mana potions each sit on one HUD icon with a charge count.
   belt[0] = health stack, belt[2] = mana stack (belt[1] and belt[3] stay null; the second mana slot is retired).
   The equipped belt's rank sets how many charges each stack holds (data/ui.json flasks.beltCaps / noBelt /
   uniqueMin / setMin). Over-cap charges (after swapping to a smaller belt) are kept until drunk, never dropped.
   Pickup, auto-pickup on walk-over, vendor buy and Fill belt all go through add(). */
(function (root) {
  "use strict";
  var LIFE = 0, SKIP = 1, MANA0 = 2, MANA1 = 3;
  var RANKS = ["common", "magic", "rare", "elite", "epic", "legendary", "fabled", "mythical"];

  function fcfg() {
    var u = (root.ASHBOUND_DATA && root.ASHBOUND_DATA.ui) || {};
    return u.flasks || {};
  }
  function cfg() {
    var f = fcfg();
    var n = f.noBelt != null ? +f.noBelt : f.lifeCharges != null ? +f.lifeCharges : 2;
    if (!isFinite(n) || n < 1) n = 2;
    return { lifeCharges: Math.floor(n) };
  }
  function family(it) {
    if (!it) return "normal";
    if (root.ABCraft && root.ABCraft.family) { try { return root.ABCraft.family(it); } catch (e) { /* fall through */ } }
    if (it.uniqueId || it.rarity === "unique") return "unique";
    if (it.setId || it.setItemId || it.rarity === "set") return "set";
    return "normal";
  }
  function beltRank(it) {
    if (!it) return null;
    if (RANKS.indexOf(it.tier) >= 0) return it.tier;
    if (RANKS.indexOf(it.rarity) >= 0) return it.rarity;
    return "common";
  }
  // charges per potion type for a belt item (null = no belt)
  function capForBelt(it) {
    var f = fcfg(), base = cfg().lifeCharges;
    if (!it) return base;
    var caps = f.beltCaps || {};
    var c = +caps[beltRank(it)];
    if (!isFinite(c) || c < 1) c = base;
    var fam = family(it);
    if (fam === "unique" && f.uniqueMin) c = Math.max(c, +f.uniqueMin);
    if (fam === "set" && f.setMin) c = Math.max(c, +f.setMin);
    return Math.floor(c);
  }
  function max(player) {
    var p = player || (root.ASHBOUND && root.ASHBOUND.state && root.ASHBOUND.state.player);
    var belt = p && p.equipment ? p.equipment.belt : null;
    return capForBelt(belt);
  }
  function ensure(player) {
    if (!player) return [];
    if (!Array.isArray(player.belt)) player.belt = [null, null, null, null];
    while (player.belt.length < 4) player.belt.push(null);
    return player.belt;
  }
  function countOf(it) {
    if (!it || (it.kind !== "life" && it.kind !== "mana")) return 0;
    var c = it.charges != null ? +it.charges : 1;
    return isFinite(c) && c > 0 ? Math.floor(c) : 0;
  }
  function slotOf(kind) { return kind === "mana" ? MANA0 : LIFE; }
  function count(player, kind) {
    var b = player && player.belt;
    return b ? countOf(b[slotOf(kind || "life")]) : 0;
  }
  function stash(player, item) {
    if (!item || !player) return;
    var inv = player.inventory;
    if (!inv || !inv.items) return;
    if (typeof root.q === "function") { root.q(inv, item); return; }
    if (inv.items.some(function (x) { return x && x.uid === item.uid; })) return;
    inv.items.push(item);
  }
  // merge every life / mana potion in the belt into its stack; nothing is clamped or lost
  function merge(list) {
    var keep = null, acc = 0;
    list.forEach(function (pot) {
      var c = pot.charges != null ? countOf(pot) : 1;
      if (c < 1) return;
      if (!keep) { keep = pot; acc = c; } else acc += c;
    });
    if (keep) keep.charges = acc;
    return keep;
  }
  function migrate(player) {
    if (!player) return player;
    var b = ensure(player);
    var lifeItems = [], manaItems = [], extras = [];
    for (var i = 0; i < b.length; i++) {
      var it = b[i];
      if (!it) continue;
      if (it.kind === "life") lifeItems.push(it);
      else if (it.kind === "mana") manaItems.push(it);
      else extras.push(it);
    }
    b[LIFE] = merge(lifeItems);
    b[SKIP] = null;
    b[MANA0] = merge(manaItems);
    b[MANA1] = null;
    b.length = 4;
    extras.forEach(function (x) { stash(player, x); });
    return player;
  }
  function room(player, potion) {
    if (!player || !potion || potion.rarity !== "potion") return 0;
    if (potion.kind !== "life" && potion.kind !== "mana") return 0;
    return Math.max(0, max(player) - count(player, potion.kind));
  }
  function add(player, potion) {
    if (!player || !potion || potion.rarity !== "potion") return false;
    if (potion.kind !== "life" && potion.kind !== "mana") return false;
    migrate(player);
    var b = ensure(player), idx = slotOf(potion.kind);
    var free = room(player, potion);
    if (free < 1) return false;
    var inc = potion.charges != null ? countOf(potion) : 1;
    if (inc < 1) inc = 1;
    var take = Math.min(free, inc);
    if (!b[idx]) {
      potion.charges = take;
      b[idx] = potion;
    } else {
      b[idx].charges = countOf(b[idx]) + take;
    }
    return true;
  }
  function use(player, sheet, index) {
    if (!player || !sheet) return { ok: false };
    migrate(player);
    var b = ensure(player);
    var kind = (index === 2 || index === 3 || index === "2" || index === "3" || index === "mana") ? "mana" : "life";
    var idx = slotOf(kind), it = b[idx], n = countOf(it);
    if (!it || n < 1) return { ok: false };
    var amt = it.amount || 0;
    if (kind === "mana") player.mana = Math.min(sheet.mana, (player.mana || 0) + amt);
    else player.hp = Math.min(sheet.life, (player.hp || 0) + amt);
    it.charges = n - 1;
    if (it.charges <= 0) b[idx] = null;
    return { ok: true, kind: kind, amount: amt };
  }
  function fill(player, take) {
    if (!player) return { toast: "No flasks in the pack.", filled: 0 };
    migrate(player);
    var filled = 0;
    function inv() { return (player.inventory && player.inventory.items) || []; }
    function pull(kind) {
      var a = inv().find(function (n) { return n && n.rarity === "potion" && n.kind === kind; });
      if (!a) return null;
      if (typeof take === "function") take(player.inventory, a.uid);
      else {
        var items = inv();
        var i = items.findIndex(function (n) { return n && n.uid === a.uid; });
        if (i >= 0) items.splice(i, 1);
      }
      return a;
    }
    ["life", "mana"].forEach(function (kind) {
      while (count(player, kind) < max(player)) {
        var pot = pull(kind);
        if (!pot) break;
        var c = pot.charges != null ? countOf(pot) : 1, free = max(player) - count(player, kind);
        if (c > free) {
          // only part of a stacked pack potion fits: split it, the rest stays in the pack
          var rest = Object.assign({}, pot, { charges: c - free });
          pot = Object.assign({}, pot, { uid: (pot.uid || "po") + "-f" + Date.now().toString(36), charges: free });
          stash(player, rest);
        }
        add(player, pot);
        filled += 1;
      }
    });
    return { toast: filled ? "Belt filled." : "No flasks in the pack.", filled: filled };
  }
  function fresh(make) {
    var pot = make("life", 1);
    pot.charges = cfg().lifeCharges;
    var mana = make("mana", 1);
    mana.charges = 1;
    return [pot, null, mana, null];
  }
  function dummy(kind) {
    return { rarity: "potion", kind: kind, name: kind === "mana" ? "Mana flask" : "Life flask" };
  }
  function paintStack(btn, it, n, kind, icon, title, cap) {
    btn.className = "flask " + kind + " rar-potion" + (n ? "" : " is-empty");
    btn.innerHTML = icon(it || dummy(kind)) + '<span class="flask-count">' + n + "</span>";
    btn.title = n ? title(it) + " (" + n + " / " + cap + ")" : (kind === "mana" ? "Empty mana potion" : "Empty health potion");
    btn.setAttribute("data-charges", String(n));
    btn.setAttribute("data-cap", String(cap));
    btn.setAttribute("data-kind", kind);
    btn.setAttribute("data-index", kind === "mana" ? String(MANA0) : "0");
  }
  function paint(rootEl, player, hooks) {
    if (!rootEl || !player) return;
    migrate(player);
    hooks = hooks || {};
    var icon = hooks.icon || function () { return ""; };
    var title = hooks.title || function (it) { return (it && it.name) || ""; };
    var cap = max(player);
    var lifeBtn = rootEl.querySelector("#flask-life") || rootEl.querySelector("#belt-left .flask");
    if (lifeBtn) paintStack(lifeBtn, player.belt[LIFE], count(player, "life"), "life", icon, title, cap);
    var manaBtns = rootEl.querySelectorAll("#belt-right button.flask");
    if (manaBtns[0]) {
      if (!manaBtns[0].id) manaBtns[0].id = "flask-mana";
      paintStack(manaBtns[0], player.belt[MANA0], count(player, "mana"), "mana", icon, title, cap);
    }
    for (var i = 1; i < manaBtns.length; i++) {
      manaBtns[i].className = "flask hidden";
      manaBtns[i].innerHTML = "";
      manaBtns[i].title = "";
      manaBtns[i].setAttribute("data-index", String(MANA1));
    }
  }

  root.ABFlasks = {
    max: max, capForBelt: capForBelt, count: count, room: room, migrate: migrate, add: add, use: use, fill: fill,
    fresh: fresh, paint: paint, LIFE: LIFE, MANA: [MANA0], MANA_SLOT: MANA0
  };
})(typeof window !== "undefined" ? window : globalThis);
