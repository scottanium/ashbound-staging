/* le-ui (v85) long-press drag & drop for the pack, stash, shared stash and paper doll (touch first, mouse too).
   Hold an item dragHoldMs (220) without moving -> it lifts; the carried copy floats dragLift (40) px above the finger
   and a footprint shows where it lands: green = fits, amber = swaps with the item there, red = can't (nothing moves).
   Drop on a doll slot to equip, drag a worn item to a grid to take it off. A tap still opens the item card. */
(function (root) {
  "use strict";
  var doc = root.document;
  function cfg() { var u = (root.ASHBOUND_DATA || {}).ui || {}; return u.leui || {}; }
  function on() { return doc.documentElement.classList.contains("ua-ready") && root.ABLeGame && root.ABLeHost; }
  var S = null, eatClick = 0;
  function cellOf(grid) { var c = grid.querySelector(".cell"); return c ? c.getBoundingClientRect().width : 0; }
  function origin(grid) { var r = grid.getBoundingClientRect(), cs = getComputedStyle(grid); return { x: r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), y: r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop), r: r }; }
  function begin(ev, el) {
    var uid = el.getAttribute("data-uid"); if (!uid) return;
    var f = ABLeGame.find(uid); if (!f) return;
    S = { id: ev.pointerId, el: el, uid: uid, item: f.item, from: el.getAttribute("data-from"), x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY, live: false };
    S.timer = setTimeout(lift, cfg().dragHoldMs || 220);
  }
  function lift() {
    if (!S) return;
    var el = S.el, r = el.getBoundingClientRect(), grid = el.closest(".grid");
    var cell = grid ? cellOf(grid) : (doc.querySelector("#panel .gear-bag .grid") ? cellOf(doc.querySelector("#panel .gear-bag .grid")) : 42);
    S.w = (S.item.w || 1) * cell; S.h = (S.item.h || 1) * cell; S.cell = cell; S.live = true;
    var g = doc.createElement("div"); g.className = "le-drag-ghost " + (el.className.match(/\b(rar-\S+|family-\S+)/g) || []).join(" ");
    g.setAttribute("aria-hidden", "true");
    var ico = el.querySelector(".ico,.slot-ico"); g.innerHTML = '<span class="ico">' + (ico ? ico.innerHTML : "") + "</span>";
    g.style.width = S.w + "px"; g.style.height = S.h + "px";
    doc.body.appendChild(g); S.ghost = g;
    var pv = doc.createElement("div"); pv.className = "le-drop-preview"; pv.style.display = "none"; doc.body.appendChild(pv); S.pv = pv;
    el.classList.add("le-drag-src"); doc.documentElement.classList.add("le-dragging");
    try { root.navigator.vibrate && root.navigator.vibrate(12); } catch (e) {}
    move(S.x, S.y);
  }
  function target(px, py) {
    // the carried item's centre sits dragLift above the finger; drop spot = the cell under its top-left cell centre
    var lift = cfg().dragLift == null ? 40 : cfg().dragLift;
    var cx = px, cy = py - lift - S.h / 2;
    var gl = S.ghost; if (gl) gl.style.visibility = "hidden";
    var hit = doc.elementsFromPoint(cx, cy); if (gl) gl.style.visibility = "";
    for (var i = 0; i < hit.length; i++) {
      var slot = hit[i].closest && hit[i].closest("#panel .doll-slot[data-slot]");
      if (slot) return { type: "slot", el: slot, slot: slot.getAttribute("data-slot"), ok: ABLeGame.canEquip(S.uid, slot.getAttribute("data-slot")) && S.from !== "equip" };
      var grid = hit[i].closest && hit[i].closest("#panel .grid[data-grid]");
      if (grid) {
        var o = origin(grid), c = cellOf(grid) || S.cell;
        var x = Math.round((cx - S.w / 2 - o.x) / c), y = Math.round((cy - S.h / 2 - o.y) / c);
        var to = grid.getAttribute("data-grid");
        return { type: "grid", el: grid, to: to, x: x, y: y, c: c, o: o, kind: ABLeGame.check(S.uid, to, x, y) };
      }
    }
    return null;
  }
  function move(px, py) {
    S.x = px; S.y = py;
    var lift = cfg().dragLift == null ? 40 : cfg().dragLift;
    S.ghost.style.transform = "translate(" + Math.round(px - S.w / 2) + "px," + Math.round(py - lift - S.h) + "px)";
    var t = S.t = target(px, py), pv = S.pv;
    doc.querySelectorAll("#panel .le-slot-ok,#panel .le-slot-bad").forEach(function (e) { e.classList.remove("le-slot-ok", "le-slot-bad"); });
    if (!t) { pv.style.display = "none"; S.ghost.classList.remove("ok", "bad", "swap"); return; }
    if (t.type === "slot") {
      pv.style.display = "none"; t.el.classList.add(t.ok ? "le-slot-ok" : "le-slot-bad");
      S.ghost.className = S.ghost.className.replace(/\b(ok|bad|swap)\b/g, "").trim() + (t.ok ? " ok" : " bad");
      return;
    }
    var it = S.item;
    pv.style.display = "block"; pv.className = "le-drop-preview " + t.kind;
    pv.style.left = (t.o.x + Math.max(0, t.x) * t.c) + "px"; pv.style.top = (t.o.y + Math.max(0, t.y) * t.c) + "px";
    pv.style.width = Math.min(it.w, Math.max(1, it.w + Math.min(0, t.x))) * t.c + "px"; pv.style.height = Math.min(it.h, Math.max(1, it.h + Math.min(0, t.y))) * t.c + "px";
    S.ghost.className = S.ghost.className.replace(/\b(ok|bad|swap)\b/g, "").trim() + " " + t.kind;
  }
  function end(drop) {
    var s = S; S = null; if (!s) return;
    clearTimeout(s.timer);
    if (!s.live) return;
    eatClick = Date.now();
    doc.documentElement.classList.remove("le-dragging");
    s.el.classList.remove("le-drag-src");
    doc.querySelectorAll("#panel .le-slot-ok,#panel .le-slot-bad").forEach(function (e) { e.classList.remove("le-slot-ok", "le-slot-bad"); });
    var t = drop ? s.t : null, res = null, H = root.ABLeHost;
    if (t && t.type === "grid" && t.kind !== "bad") res = H.re("le-place", { uid: s.uid, to: t.to, x: t.x, y: t.y });
    else if (t && t.type === "slot" && t.ok) res = H.re("le-equip", { uid: s.uid, slot: t.slot });
    var bad = t && (t.type === "grid" ? t.kind === "bad" : !t.ok);
    if (bad || (res && res.le === "bad")) { s.el.classList.add("le-drop-bad"); setTimeout(function () { s.el.classList.remove("le-drop-bad"); }, 450); }
    root.ABLeDrag.last = { uid: s.uid, target: t ? { type: t.type, to: t.to, x: t.x, y: t.y, slot: t.slot, kind: t.kind || (t.ok ? "ok" : "bad") } : null, result: res && res.le || (bad ? "bad" : "none") };
    s.ghost && s.ghost.remove(); s.pv && s.pv.remove();
  }
  doc.addEventListener("pointerdown", function (ev) {
    if (S || !on() || ev.button > 0) return;
    var el = ev.target.closest && ev.target.closest("#panel .gitem[data-uid], #panel .doll-slot.has-item[data-uid]");
    if (!el || el.closest(".detail")) return;
    begin(ev, el);
  }, true);
  doc.addEventListener("pointermove", function (ev) {
    if (!S || ev.pointerId !== S.id) return;
    if (!S.live) { if (Math.hypot(ev.clientX - S.x0, ev.clientY - S.y0) > (cfg().dragSlop || 9)) { clearTimeout(S.timer); S = null; } else { S.x = ev.clientX; S.y = ev.clientY; } return; }
    ev.preventDefault(); move(ev.clientX, ev.clientY);
  }, { capture: true, passive: false });
  doc.addEventListener("pointerup", function (ev) { if (S && ev.pointerId === S.id) end(true); }, true);
  doc.addEventListener("pointercancel", function (ev) { if (S && ev.pointerId === S.id) end(false); }, true);
  doc.addEventListener("click", function (ev) { if (Date.now() - eatClick < 400) { ev.stopPropagation(); ev.preventDefault(); eatClick = 0; } }, true);
  doc.addEventListener("contextmenu", function (ev) { if (S && S.live) ev.preventDefault(); }, true);
  root.ABLeDrag = { active: function () { return !!(S && S.live); }, last: null };
})(window);
