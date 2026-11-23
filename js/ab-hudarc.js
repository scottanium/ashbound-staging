/* Ashbound v71: skill slots in an arc around Strike, orbs lifted out of the thumb area.
   Settings: data/ui.json "arc". Runs on load, resize, orientation, body class changes (hand/text size) and when the skillbar is rebuilt.
   Geometry: Strike centre C (radius Rs); each slot is a circle (radius r). Slots sit on a ring of radius R = Rs + r + ringGap,
   one angle step apart, the smallest step that keeps neighbours slotGap apart, centred on the up-and-inward diagonal
   (135 deg right hand, 45 deg left hand) and nudged so all four stay on screen. Belt flasks, dock and orbs are then moved clear of it. */
(function () {
  "use strict";
  var DEF = { enabled: true, ringGap: 6, slotGap: 6, centerDeg: 135, minDeg: 80, maxDeg: 200, edge: 4, beltGap: 8, orbGap: 10, dockGap: 8 };
  var st = { runs: 0, last: null };
  function cfg() { var u = (window.ASHBOUND_DATA && window.ASHBOUND_DATA.ui) || {}; var a = u.arc || {}; var o = {}; for (var k in DEF) o[k] = a[k] != null ? a[k] : DEF[k]; return o; }
  function q(s) { return document.querySelector(s); }
  function rect(e) { if (!e || !e.offsetParent && getComputedStyle(e).position !== "fixed") return null; var b = e.getBoundingClientRect(); return b.width ? b : null; }
  function hit(a, b, g) { g = g || 0; return a && b && a.left < b.right + g && a.right > b.left - g && a.top < b.bottom + g && a.bottom > b.top - g; }
  function union(list) { var r = null; list.forEach(function (b) { if (!b) return; r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; }); return r; }
  function clearInline() {
    ["#belt-right", "#belt-left", "#dock", "#life-orb", "#mana-orb"].forEach(function (s) { var e = q(s); if (e) { e.style.bottom = ""; e.style.right = ""; e.style.left = ""; } });
  }
  function layout() {
    st.dirtyA = st.dirtyO = true;
    var c = cfg(), cast = q("#cast"), bar = q("#skillbar"), atk = q("#btn-attack");
    if (!cast || !bar || !atk) return;
    var slots = [0, 1, 2, 3].map(function (i) { return q("#skill-" + i); }).filter(Boolean);
    if (!c.enabled || slots.length < 4) { cast.classList.remove("ab-arc"); return; }
    st.runs++;
    cast.classList.add("ab-arc");
    clearInline();
    var vw = innerWidth, vh = innerHeight, A = atk.getBoundingClientRect(), Cr = cast.getBoundingClientRect();
    if (!A.width) return;
    var cx = A.left + A.width / 2, cy = A.top + A.height / 2, Rs = A.width / 2, S = slots[0].offsetWidth || 44, r = S / 2;
    var left = document.body.classList.contains("left-hand");
    // Bounding boxes (not circles) must not touch. The 4 slots take the positions nearest Strike (smallest total distance to its centre) such that
    // every slot box is >= ringGap from Strike's box and >= slotGap from the other slots' boxes, fully on screen. Then they are numbered round the
    // arc: slot 1 lowest / nearest the thumb, slot 4 highest.
    var H = Rs + r + c.ringGap, need = 2 * r + c.slotGap, sgn = left ? -1 : 1, STEP = 2, pos = null;
    var cand = [], lim = Math.min(vw, vh) * 0.6 + H;
    for (var u = -lim; u <= lim; u += STEP) for (var v = -lim; v <= lim; v += STEP) {
      if (Math.max(Math.abs(u), Math.abs(v)) < H) continue;
      var d = Math.hypot(u, v); if (d > lim) continue;
      var xx = cx + sgn * u, yy = cy + v;
      if (xx - r < c.edge || xx + r > vw - c.edge || yy - r < c.edge || yy + r > vh - c.edge) continue;
      var ph = Math.atan2(-v, -u) * 180 / Math.PI;             // 0 = straight inward, 90 = straight up
      if (ph < -45 || ph > 135) continue;
      cand.push({ u: u, v: v, d: d, ph: ph });
    }
    cand.sort(function (a, b) { return a.d - b.d || b.ph - a.ph; });
    var best = null, nodes = 0;
    function pick(from, set, cost) {
      if (nodes++ > 300000) return;
      var rem = 4 - set.length;
      if (!rem) { if (!best || cost < best.cost - .01) best = { cost: cost, set: set.slice() }; return; }
      for (var k = from; k < cand.length; k++) {
        var z = cand[k];
        if (best && cost + rem * z.d >= best.cost - .01) break;
        var okk = true;
        for (var m = 0; m < set.length; m++) if (Math.max(Math.abs(z.u - set[m].u), Math.abs(z.v - set[m].v)) < need) { okk = false; break; }
        if (!okk) continue;
        set.push(z); pick(k + 1, set, cost + z.d); set.pop();
        if (nodes > 300000) return;
      }
    }
    pick(0, [], 0);
    st.nodes = nodes;
    if (best) { best.set.sort(function (a, b) { return b.ph - a.ph; }); pos = best.set.map(function (z) { return [cx + sgn * z.u, cy + z.v]; }); }
    if (!pos) { cast.classList.remove("ab-arc"); return; }
    // slot 1 nearest the thumb's resting side (bottom), 4 at the top
    slots.forEach(function (b, i) {
      var p = pos[i]; b.style.left = (p[0] - r - Cr.left) + "px"; b.style.top = (p[1] - r - Cr.top) + "px";
    });
    var arcBox = union(slots.map(function (b) { return b.getBoundingClientRect(); }).concat([A]));
    // belt next to the arc (on Strike's side), same bottom line
    var bR = q(left ? "#belt-left" : "#belt-right"), bRr = rect(bR);
    if (bRr && hit(bRr, arcBox, c.beltGap)) {
      if (!left) bR.style.right = Math.max(0, vw - arcBox.left + c.beltGap) + "px";
      else bR.style.left = Math.max(0, arcBox.right + c.beltGap) + "px";
      bRr = rect(bR);
    }
    // the belt on the stick's side must not touch the stick either (left-hand: flasks sat 2px inside it)
    var oB = q(left ? "#belt-left" : "#belt-left"), oBr = rect(oB), jy = rect(q("#joystick"));
    if (oBr && jy && hit(oBr, jy, c.beltGap)) {
      if (left) oB.style.right = Math.max(0, vw - jy.left + c.beltGap) + "px";
      else oB.style.left = Math.max(0, jy.right + c.beltGap) + "px";
    }
    // dock: lift it above anything it touches
    var dock = q("#dock"), dr = rect(dock);
    if (dr) {
      var blockers = [arcBox, bRr, rect(q(left ? "#belt-right" : "#belt-left")), rect(q("#joystick"))].filter(function (b) { return b && hit(dr, b, c.dockGap); });
      if (blockers.length) { var top = Math.min.apply(null, blockers.map(function (b) { return b.top; })); dock.style.bottom = Math.max(0, vh - top + c.dockGap) + "px"; dr = rect(dock); }
    }
    // orbs: above the stick/belt on one side and above the arc/belt on the other
    var joy = rect(q("#joystick")), bL = rect(q(left ? "#belt-right" : "#belt-left"));
    function lift(orbSel, under) {
      var o = q(orbSel), orr = rect(o); if (!o || !orr) return;
      var ob = orr, top = Math.min.apply(null, under.filter(Boolean).filter(function (u) { return u.right > ob.left - 2 && u.left < ob.right + 2 || true; }).map(function (u) { return u.top; }));
      if (!isFinite(top)) return;
      var bottom = vh - top + c.orbGap;
      if (dr && hit({ left: ob.left, right: ob.right, top: vh - bottom - ob.height, bottom: vh - bottom }, dr, c.orbGap)) bottom = Math.max(bottom, vh - dr.top + c.orbGap);
      o.style.bottom = bottom + "px";
    }
    var lifeSide = [joy, bL], manaSide = [arcBox, bRr];
    var lo = rect(q("#life-orb")), mo = rect(q("#mana-orb"));
    // which orb is on Strike's side depends on hand
    if (lo && mo) {
      var lifeNearStrike = Math.abs((lo.left + lo.right) / 2 - cx) < Math.abs((mo.left + mo.right) / 2 - cx);
      lift("#life-orb", lifeNearStrike ? manaSide : lifeSide);
      lift("#mana-orb", lifeNearStrike ? lifeSide : manaSide);
    }
    st.last = { H: Math.round(H), r: r, Rs: Rs, cx: Math.round(cx), cy: Math.round(cy), vw: vw, vh: vh, left: left };
    keepOut();
  }
  // HUD boxes the objective arrow must not sit on (refreshed on every layout, not per frame)
  var AVOID = ["#life-orb", "#mana-orb", "#skill-0", "#skill-1", "#skill-2", "#skill-3", "#btn-attack", "#belt-left", "#belt-right", "#joystick", "#dock", "#minimap", "#quest-track", "#topbar"];
  function keepOut() { st.avoid = AVOID.map(function (s) { var b = rect(q(s)); return b && { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; }).filter(Boolean); st.dirtyA = false; }
  // move (x,y) toward (cx,cy) until a box of half-size h clears every HUD box
  function avoid(x, y, cx, cy, h) {
    if (!st.avoid || st.dirtyA) keepOut();
    var dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    for (var k = 0; k < 60; k++) {
      var me = { left: x - h, right: x + h, top: y - h, bottom: y + h }, bad = false;
      for (var i = 0; i < st.avoid.length; i++) if (hit(me, st.avoid[i], 2)) { bad = true; break; }
      if (!bad) return { x: x, y: y };
      x += ux * 6; y += uy * 6;
      if ((cx - x) * ux + (cy - y) * uy <= 0) break;
    }
    return { x: x, y: y };
  }
  var pend = 0;
  function soon() { if (pend) return; pend = requestAnimationFrame(function () { pend = 0; try { layout(); } catch (e) { console.error(e); } }); }
  function boot() {
    var bar = q("#skillbar");
    if (!bar) { setTimeout(boot, 200); return; }
    new MutationObserver(soon).observe(bar, { childList: true });
    new MutationObserver(soon).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    var hud = q("#hud"); if (hud) new MutationObserver(soon).observe(hud, { attributes: true, attributeFilter: ["class", "style"] });
    addEventListener("resize", function () { st.dirtyA = st.dirtyO = true; soon(); }); addEventListener("orientationchange", function () { setTimeout(soon, 80); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(soon);
    // the skin (ab-ui.js) and quality settings restyle sizes after this file loads: relayout when styles change
    new MutationObserver(soon).observe(document.head, { childList: true, subtree: true, characterData: true });
    soon();
    setTimeout(soon, 600); setTimeout(soon, 2000);
  }
  function origin(el) { if (st.dirtyO || !st.org) { var b = el.getBoundingClientRect(); st.org = { left: b.left, top: b.top }; st.dirtyO = false; } return st.org; }
  window.ABHudArc = { layout: layout, origin: origin, avoid: avoid, stats: function () { return { runs: st.runs, last: st.last, avoid: (st.avoid || []).length }; } };
  if (window.ASHBOUND_DATA_READY) window.ASHBOUND_DATA_READY.then(boot, boot); else addEventListener("load", boot);
})();
