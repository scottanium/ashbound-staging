/* Ashbound v84g: one health potion icon with a charge count (data/ui.json flasks.lifeCharges).
   Mana flasks stay as separate belt slots. Pickup, vendor buy, and Fill belt still refill the
   same way, adapted so a life potion adds a charge up to the cap instead of taking another slot. */
(function (root) {
  "use strict";
  var LIFE = 0, SKIP = 1, MANA0 = 2, MANA1 = 3;

  function cfg() {
    var u = (root.ASHBOUND_DATA && root.ASHBOUND_DATA.ui) || {};
    var f = u.flasks || {};
    var n = f.lifeCharges != null ? +f.lifeCharges : 2;
    if (!isFinite(n) || n < 1) n = 2;
    return { lifeCharges: Math.floor(n) };
  }
  function max() { return cfg().lifeCharges; }
  function ensure(player) {
    if (!player) return [];
    if (!Array.isArray(player.belt)) player.belt = [null, null, null, null];
    while (player.belt.length < 4) player.belt.push(null);
    return player.belt;
  }
  function countOf(it) {
    if (!it || it.kind !== "life") return 0;
    var c = it.charges != null ? +it.charges : 1;
    return isFinite(c) && c > 0 ? Math.floor(c) : 0;
  }
  function count(player) {
    var b = player && player.belt;
    return b ? countOf(b[LIFE]) : 0;
  }
  function stash(player, item) {
    if (!item || !player) return;
    var inv = player.inventory;
    if (!inv || !inv.items) return;
    if (typeof root.q === "function") { root.q(inv, item); return; }
    if (inv.items.some(function (x) { return x && x.uid === item.uid; })) return;
    inv.items.push(item);
  }
  function migrate(player) {
    if (!player) return player;
    var b = ensure(player), cap = max();
    var lifeItems = [], manaItems = [], extras = [];
    for (var i = 0; i < b.length; i++) {
      var it = b[i];
      if (!it) continue;
      if (it.kind === "life") lifeItems.push(it);
      else if (it.kind === "mana") manaItems.push(it);
      else extras.push(it);
    }
    var keep = null, acc = 0, leftover = [];
    for (var j = 0; j < lifeItems.length; j++) {
      var pot = lifeItems[j];
      var c = pot.charges != null ? countOf(pot) : 1;
      if (!keep) {
        keep = pot;
        acc = Math.min(cap, c);
        keep.charges = acc;
        if (c > acc) leftover.push(Object.assign({}, pot, { uid: (pot.uid || "po") + "-x" + j, charges: c - acc }));
      } else if (acc < cap) {
        var add = Math.min(cap - acc, c);
        acc += add;
        keep.charges = acc;
        if (c > add) leftover.push(Object.assign({}, pot, { charges: c - add }));
      } else {
        leftover.push(pot);
      }
    }
    b[LIFE] = keep && acc ? keep : null;
    b[SKIP] = null;
    b[MANA0] = manaItems[0] || null;
    b[MANA1] = manaItems[1] || null;
    leftover.concat(manaItems.slice(2)).concat(extras).forEach(function (x) { stash(player, x); });
    return player;
  }
  function add(player, potion) {
    if (!player || !potion || potion.rarity !== "potion") return false;
    migrate(player);
    var b = ensure(player);
    if (potion.kind === "life") {
      var cap = max(), n = count(player);
      if (n >= cap) return false;
      var inc = potion.charges != null ? countOf(potion) : 1;
      if (inc < 1) inc = 1;
      var take = Math.min(cap - n, inc);
      if (!b[LIFE]) {
        potion.charges = take;
        b[LIFE] = potion;
      } else {
        b[LIFE].charges = n + take;
      }
      b[SKIP] = null;
      return true;
    }
    if (potion.kind === "mana") {
      if (!b[MANA0]) { b[MANA0] = potion; return true; }
      if (!b[MANA1]) { b[MANA1] = potion; return true; }
      return false;
    }
    return false;
  }
  function use(player, sheet, index) {
    if (!player || !sheet) return { ok: false };
    migrate(player);
    var b = ensure(player);
    var isLife = index === 0 || index === "0" || index === "life" || index == null;
    if (isLife) {
      var it = b[LIFE], n = count(player);
      if (!it || n < 1) return { ok: false };
      var amt = it.amount || 0;
      player.hp = Math.min(sheet.life, (player.hp || 0) + amt);
      it.charges = n - 1;
      if (it.charges <= 0) b[LIFE] = null;
      return { ok: true, kind: "life", amount: amt };
    }
    var slot = typeof index === "number" ? index : +index;
    var t = b[slot];
    if (!t) return { ok: false };
    var kind = t.kind === "mana" ? "mana" : t.kind;
    var amount = t.amount || 0;
    if (kind === "mana") player.mana = Math.min(sheet.mana, (player.mana || 0) + amount);
    else if (kind === "life") player.hp = Math.min(sheet.life, (player.hp || 0) + amount);
    b[slot] = null;
    return { ok: true, kind: kind, amount: amount };
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
    while (count(player) < max()) {
      var life = pull("life");
      if (!life) break;
      add(player, life);
      filled += 1;
    }
    while (addableMana(player)) {
      var mana = pull("mana");
      if (!mana) break;
      add(player, mana);
      filled += 1;
    }
    return { toast: filled ? "Belt filled." : "No flasks in the pack.", filled: filled };
  }
  function addableMana(player) {
    var b = ensure(player);
    return !b[MANA0] || !b[MANA1];
  }
  function fresh(make) {
    var pot = make("life", 1);
    pot.charges = max();
    return [pot, null, make("mana", 1), null];
  }
  function dummyLife() {
    return { rarity: "potion", kind: "life", name: "Life flask" };
  }
  function paint(root, player, hooks) {
    if (!root || !player) return;
    migrate(player);
    hooks = hooks || {};
    var icon = hooks.icon || function () { return ""; };
    var title = hooks.title || function (it) { return (it && it.name) || ""; };
    var n = count(player);
    var it = player.belt[LIFE];
    var lifeBtn = root.querySelector("#flask-life") || root.querySelector("#belt-left .flask");
    if (lifeBtn) {
      lifeBtn.className = "flask life rar-potion" + (n ? "" : " is-empty");
      lifeBtn.innerHTML = icon(it || dummyLife()) + '<span class="flask-count">' + n + "</span>";
      lifeBtn.title = n ? title(it) : "Empty health potion";
      lifeBtn.setAttribute("data-charges", String(n));
      lifeBtn.setAttribute("data-index", "0");
    }
    var manaBtns = root.querySelectorAll("#belt-right button.flask");
    [MANA0, MANA1].forEach(function (idx, i) {
      var btn = manaBtns[i];
      if (!btn) return;
      var t = player.belt[idx];
      btn.className = "flask" + (t ? " rar-" + (t.rarity || "common") + (t.kind === "mana" ? " mana" : t.kind === "life" ? " life" : "") : " hidden");
      btn.innerHTML = t ? icon(t) : "";
      btn.title = t ? title(t) : "";
      btn.setAttribute("data-index", String(idx));
    });
  }

  root.ABFlasks = {
    max: max, count: count, migrate: migrate, add: add, use: use, fill: fill,
    fresh: fresh, paint: paint, LIFE: LIFE, MANA: [MANA0, MANA1]
  };
})(typeof window !== "undefined" ? window : globalThis);
