/* le-ui (v85) game actions for the Last Epoch-style inventory and stash. index.html routes every "le-*" action through
   ABLeGame.act(name, data, host); host (abLeHost in index.html) hands over the game's own grid helpers, so moves use the
   same fit rules, persistence (shared stash) and save path as the old buttons. Returns {} or {toast, kind} like zl. */
(function (root) {
  "use strict";
  var GRIDS = ["inventory", "stash", "cube", "shared"];
  function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  // where an item lives right now: {item, where, slot?}
  function locate(H, uid) {
    var o = H.o, p = o.player;
    if (!p || !uid) return null;
    var f = H.ha(p, uid);
    if (f && (f.where === "inventory" || f.where === "stash" || f.where === "equip")) return f;
    var c = p.cube && p.cube.items && p.cube.items.find(function (i) { return i.uid === uid; });
    if (c) return { item: c, where: "cube" };
    var sh = H.Ye(), s = sh.items.find(function (i) { return i.uid === uid; });
    if (s) return { item: s, where: "shared", grid: sh };
    for (var k in p.equipment) if (p.equipment[k] && p.equipment[k].uid === uid) return { item: p.equipment[k], where: "equip", slot: k };
    return f || null;
  }
  function gridOf(H, where, cache) { return where === "shared" ? (cache || H.Ye()) : H.o.player[where]; }
  function sharedBlock(item, to, from) {
    if (to !== "shared" || from === "shared") return null;
    if (root.ABCraft && ABCraft.canMoveToShared) { var r = ABCraft.canMoveToShared(item); if (!r.ok) return r.reason || "That can't go there."; }
    return null;
  }
  // plan a grid drop without changing anything: ok / swap / bad
  function plan(H, uid, to, x, y) {
    var src = locate(H, uid);
    if (!src || GRIDS.indexOf(to) < 0) return { kind: "bad" };
    var it = src.item, G = gridOf(H, to, src.where === "shared" ? src.grid : null);
    if (!G || x < 0 || y < 0 || x + it.w > G.w || y + it.h > G.h) return { kind: "bad", why: "edge" };
    if (sharedBlock(it, to, src.where)) return { kind: "bad", why: "shared" };
    var rect = { x: x, y: y, w: it.w, h: it.h };
    var hit = G.items.filter(function (r) { return r.uid !== it.uid && overlap(rect, r); });
    if (!hit.length) return { kind: "ok", src: src };
    if (hit.length > 1 || src.where === "equip") return { kind: "bad", why: "crowded" };
    var o2 = hit[0];
    if (src.where === "shared" && sharedBlock(o2, "shared", to)) return { kind: "bad", why: "shared" };
    // the other item goes where this one was (same grid: room left after the move; other grid: its old spot or any spot)
    return { kind: "swap", src: src, other: o2 };
  }
  function place(H, d) {
    var o = H.o, p = o.player, uid = d.uid, to = d.to, x = d.x | 0, y = d.y | 0;
    var pl = plan(H, uid, to, x, y);
    if (pl.kind === "bad") return { toast: pl.why === "shared" ? "That can't go in the shared stash." : "It doesn't fit there.", kind: "bad", save: false, touch: false, le: "bad" };
    var src = pl.src, it = src.item, from = src.where;
    var shared = (from === "shared" || to === "shared") ? (src.grid || H.Ye()) : null;
    var G = gridOf(H, to, shared), S = from === "equip" ? null : gridOf(H, from, shared);
    var ox = it.x, oy = it.y;
    if (from === "equip") {
      p.equipment[src.slot] = null; it.x = x; it.y = y; G.items.push(it);
      H.se(); o.ui.selected = null;
      return { le: "unequip" };
    }
    if (pl.kind === "ok") {
      H.X(S, uid); it.x = x; it.y = y; G.items.push(it);
      if (from !== to) { H.Pa(from, S); } H.Pa(to, G);
      o.ui.selected = null;
      return { le: "move" };
    }
    var other = pl.other;
    H.X(S, uid); H.X(G, other.uid);
    var gx = other.x, gy = other.y;
    if (!H.Yo(G, it, x, y)) { restore(); return { toast: "It doesn't fit there.", kind: "bad", save: false, touch: false, le: "bad" }; }
    it.x = x; it.y = y; G.items.push(it);
    var spot = H.Yo(S, other, ox, oy) ? { x: ox, y: oy } : H.ca(S, other);
    if (!spot) { H.X(G, uid); restore(); return { toast: "No room to swap.", kind: "bad", save: false, touch: false, le: "bad" }; }
    other.x = spot.x; other.y = spot.y; S.items.push(other);
    if (from !== to) H.Pa(from, S); H.Pa(to, G);
    o.ui.selected = null;
    return { le: "swap", other: other.uid };
    function restore() { it.x = ox; it.y = oy; S.items.push(it); other.x = gx; other.y = gy; G.items.push(other); }
  }
  function slotFits(item, slot) {
    if (!item || !item.slot) return false;
    if (item.slot === "ring") return slot === "ring1" || slot === "ring2";
    return item.slot === slot;
  }
  function equipTo(H, d) {
    var src = locate(H, d.uid);
    if (!src) return { toast: "Select an item.", kind: "bad", save: false };
    if (!slotFits(src.item, d.slot)) return { toast: "That doesn't go there.", kind: "bad", save: false, touch: false, le: "bad" };
    if (src.where === "shared" || src.where === "cube") return { toast: "Move it to your pack first.", kind: "bad", save: false, touch: false, le: "bad" };
    if (src.where === "equip") return { save: false, touch: false, le: "same" };
    H.o.ui.selected = { uid: d.uid };
    var r = H.nm(d.slot) || {};
    H.o.ui.selected = null;
    r.le = r.kind === "bad" ? "bad" : "equip";
    return r;
  }
  // stash tabs (step 11): switch the active tab; player.stash becomes that tab, so the old grid helpers follow it
  function tabSwitch(H, d) {
    var p = H.o.player; if (!root.ABLeData || !p) return { save: false };
    if (!ABLeData.setActive(p, d.id)) return { toast: "No such tab.", kind: "bad", save: false };
    H.o.ui.selected = null;
    return { le: "tab" };
  }
  var ACTS = {
    "le-tab": tabSwitch,
    "le-place": place,
    "le-equip": equipTo
  };
  function act(name, data, host) { var f = ACTS[name]; return f ? f(host, data || {}) : null; }
  function check(uid, to, x, y) { var H = root.ABLeHost; return H ? plan(H, uid, to, x, y).kind : "bad"; }
  function canEquip(uid, slot) { var H = root.ABLeHost, s = H && locate(H, uid); return !!(s && s.where !== "shared" && s.where !== "cube" && slotFits(s.item, slot)); }
  function find(uid) { var H = root.ABLeHost; return H ? locate(H, uid) : null; }
  root.ABLeGame = { act: act, ACTS: ACTS, HOOK: {}, check: check, canEquip: canEquip, find: find, overlap: overlap };
})(typeof window !== "undefined" ? window : globalThis);
