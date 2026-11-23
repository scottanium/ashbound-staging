/* Ashbound v72: skill slots in an even-angle arc around a larger Strike, orbs sit near the bottom centre (health left, mana right).
   Settings: data/ui.json "arc" (including strikeScale). Runs on load, resize, orientation, body class changes (hand/text size) and when the skillbar is rebuilt.
   Geometry: Strike is scaled from its CSS size. Each slot is a circle (radius r) at an even angular step around Strike
   (90 deg = straight up, 180 = straight left, right-handed). Each slot sits as close as possible without its bounding box
   overlapping Strike (ringGap) or another slot (slotGap), and fully on screen. Belt flasks, dock, orbs and the stamina bar
   are then moved clear of the arc. */
(function () {
  "use strict";
  var DEF = { enabled: true, ringGap: 6, slotGap: 6, centerDeg: 135, minDeg: 80, maxDeg: 200, edge: 4, beltGap: 8, orbGap: 10, dockGap: 8, strikeScale: 1.22 };
  var st = { runs: 0, last: null };
  function cfg() { var u = (window.ASHBOUND_DATA && window.ASHBOUND_DATA.ui) || {}; var a = u.arc || {}; var o = {}; for (var k in DEF) o[k] = a[k] != null ? a[k] : DEF[k]; return o; }
  function q(s) { return document.querySelector(s); }
  function rect(e) { if (!e || !e.offsetParent && getComputedStyle(e).position !== "fixed") return null; var b = e.getBoundingClientRect(); return b.width ? b : null; }
  function hit(a, b, g) { g = g || 0; return a && b && a.left < b.right + g && a.right > b.left - g && a.top < b.bottom + g && a.bottom > b.top - g; }
  function union(list) { var r = null; list.forEach(function (b) { if (!b) return; r = r ? { left: Math.min(r.left, b.left), top: Math.min(r.top, b.top), right: Math.max(r.right, b.right), bottom: Math.max(r.bottom, b.bottom) } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; }); return r; }
  function shiftAway(el, blocker, gap, vw) {
    var r = rect(el); if (!el || !r || !blocker || !hit(r, blocker, gap)) return;
    var elMid = (r.left + r.right) / 2, bMid = (blocker.left + blocker.right) / 2;
    if (elMid <= bMid) { el.style.left = "auto"; el.style.right = Math.max(0, vw - blocker.left + gap) + "px"; }
    else { el.style.right = "auto"; el.style.left = Math.max(0, blocker.right + gap) + "px"; }
  }
  function boxGap(a, b) {
    var gx = Math.max(a.left - b.right, b.left - a.right), gy = Math.max(a.top - b.bottom, b.top - a.bottom);
    return Math.max(gx, gy);
  }
  function clearInline() {
    ["#belt-right", "#belt-left", "#dock", "#life-orb", "#mana-orb", "#stam-bar", "#interact"].forEach(function (s) { var e = q(s); if (e) { e.style.bottom = ""; e.style.right = ""; e.style.left = ""; } });
    var dock = q("#dock");
    if (dock) {
      dock.style.gap = "";
      dock.querySelectorAll("button").forEach(function (b) { b.style.padding = ""; b.style.minHeight = ""; b.style.fontSize = ""; });
    }
  }
  function hudCfg() {
    var u = (window.ASHBOUND_DATA && window.ASHBOUND_DATA.ui) || {}, h = u.hudLayout || {}, d = { enabled: true, orbBottom: 8, orbCenterGap: 10, dockAbove: 8, dockGap: 6, interactAbove: 8 };
    var o = {}; for (var k in d) o[k] = h[k] != null ? h[k] : d[k]; return o;
  }
  function applyStrikeScale(atk, scale) {
    atk.style.width = ""; atk.style.height = "";
    var base = atk.getBoundingClientRect();
    if (!base.width || !scale || scale === 1) return base;
    atk.style.width = Math.round(base.width * scale) + "px";
    atk.style.height = Math.round(base.height * scale) + "px";
    return atk.getBoundingClientRect();
  }
  function evenPack(c, vw, vh, cx, cy, Rs, r, left) {
    var ring = c.ringGap, slot = c.slotGap, edge = c.edge, mid0 = left ? 180 - c.centerDeg : c.centerDeg;
    function rMin(ang) {
      var rad = ang * Math.PI / 180, m = Math.max(Math.abs(Math.cos(rad)), Math.abs(Math.sin(rad)));
      return (Rs + r + ring) / Math.max(m, 1e-6);
    }
    function xy(ang, R) {
      var rad = ang * Math.PI / 180;
      return [cx + R * Math.cos(rad), cy - R * Math.sin(rad)];
    }
    function onScreen(x, y) {
      return x - r >= edge && x + r <= vw - edge && y - r >= edge && y + r <= vh - edge;
    }
    function tryPack(mid, step) {
      var angs = [mid - 1.5 * step, mid - 0.5 * step, mid + 0.5 * step, mid + 1.5 * step];
      var R = angs.map(rMin);
      var strike = { left: cx - Rs, right: cx + Rs, top: cy - Rs, bottom: cy + Rs };
      function at(i, rad) {
        var p = xy(angs[i], rad);
        var box = { left: p[0] - r, right: p[0] + r, top: p[1] - r, bottom: p[1] + r };
        return { p: p, box: box, on: onScreen(p[0], p[1]), g: boxGap(box, strike) };
      }
      for (var n = 0; n < 220; n++) {
        var pts = [], i, j, boxes = [], gs = [], moved = false, cur;
        for (i = 0; i < 4; i++) {
          cur = at(i, R[i]);
          if (!cur.on) return null;
          pts.push(cur.p); boxes.push(cur.box); gs[i] = cur.g;
          if (gs[i] < ring - 0.05) { R[i] += 1; moved = true; }
        }
        if (moved) continue;
        var pushed = false;
        for (i = 0; i < 4 && !pushed; i++) for (j = i + 1; j < 4; j++) {
          if (boxGap(boxes[i], boxes[j]) >= slot - 0.05) continue;
          var cand = [];
          [i, j].forEach(function (k) {
            var nxt = at(k, R[k] + 1);
            if (nxt.on && nxt.g <= 40.0001) cand.push({ k: k, extra: R[k] - rMin(angs[k]) });
          });
          if (!cand.length) return null;
          cand.sort(function (a, b) { return b.extra - a.extra || b.k - a.k; });
          R[cand[0].k] += 1;
          pushed = true;
          break;
        }
        if (pushed) continue;
        var ns = [boxGap(boxes[0], boxes[1]), boxGap(boxes[1], boxes[2]), boxGap(boxes[2], boxes[3])];
        var tightS = gs.filter(function (g) { return g >= -0.5 && g <= 14; }).length >= 3 && gs.every(function (g) { return g >= -0.5 && g <= 40; });
        var tightN = ns.every(function (g) { return g >= -0.5 && g <= 14; });
        if (!tightS || !tightN) return null;
        return { pos: pts, angs: angs, R: R, gs: gs, ns: ns, tight: true, mid: mid, step: step };
      }
      return null;
    }
    var key = [vw, vh, Math.round(cx), Math.round(cy), Math.round(Rs * 10), Math.round(r * 10), left ? 1 : 0, ring, slot].join(",");
    if (st.packKey === key && st.pack) return st.pack;
    var best = null, step, k, mid, rec, firstStep = null;
    for (step = 24; step <= 50; step += 0.5) {
      if (firstStep != null && step > firstStep + 16) break;
      for (k = 0; k <= 90; k++) {
        var mids = k === 0 ? [mid0] : [mid0 + k * 0.5, mid0 - k * 0.5];
        for (var m = 0; m < mids.length; m++) {
          mid = mids[m];
          rec = tryPack(mid, step);
          if (!rec) continue;
          if (firstStep == null) firstStep = step;
          if (rec.tight) { st.packKey = key; st.pack = rec; return rec; }
          if (!best) best = rec;
        }
      }
    }
    st.packKey = key; st.pack = best;
    return best;
  }
  function layout() {
    st.dirtyA = st.dirtyO = true;
    var c = cfg(), cast = q("#cast"), bar = q("#skillbar"), atk = q("#btn-attack");
    if (!cast || !bar || !atk) return;
    var slots = [0, 1, 2, 3].map(function (i) { return q("#skill-" + i); }).filter(Boolean);
    if (!c.enabled || slots.length < 4) { atk.style.width = ""; atk.style.height = ""; cast.classList.remove("ab-arc"); return; }
    st.runs++;
    cast.classList.add("ab-arc");
    clearInline();
    var vw = innerWidth, vh = innerHeight;
    var A = applyStrikeScale(atk, c.strikeScale), Cr = cast.getBoundingClientRect();
    if (!A.width) return;
    var cx = A.left + A.width / 2, cy = A.top + A.height / 2, Rs = A.width / 2, S = slots[0].offsetWidth || 44, r = S / 2;
    var left = document.body.classList.contains("left-hand");
    var packed = evenPack(c, vw, vh, cx, cy, Rs, r, left);
    var pos = packed && packed.pos;
    if (!pos) { atk.style.width = ""; atk.style.height = ""; cast.classList.remove("ab-arc"); return; }
    // slot 1 nearest the top / thumb-opposite side of the fan, 4 nearest the side (low angle first was up, high angle is left/right)
    // Number them round the arc: slot 1 lowest / nearest the thumb, slot 4 highest? Historic order is by decreasing "up-ness" of the old ph
    // (slot 1 highest? comment said "slot 1 lowest / nearest the thumb, 4 at the top") but measure names slot1 as the top-most in practice.
    // Existing tests number #skill-0 as slot1 and expect tight neighbours in index order (0-1, 1-2, 2-3).
    // packed.pos is already in increasing angle (up-right ... around to left-down), which matches current slot1..slot4 order.
    slots.forEach(function (b, i) {
      var p = pos[i]; b.style.left = (p[0] - r - Cr.left) + "px"; b.style.top = (p[1] - r - Cr.top) + "px";
    });
    var arcBox = union(slots.map(function (b) { return b.getBoundingClientRect(); }).concat([A]));
    // push each belt away from the arc and from the stick (IDs swap sides in left-hand CSS)
    function shiftHoriz(el, blocker, gap) { shiftAway(el, blocker, gap, vw); }
    var joy = rect(q("#joystick"));
    ["#belt-left", "#belt-right"].forEach(function (sel) { var el = q(sel); shiftHoriz(el, arcBox, c.beltGap); shiftHoriz(el, joy, c.beltGap); });
    // strike-side belt is #belt-right in both hands (CSS moves it next to Strike when left-handed)
    var bRr = rect(q("#belt-right"));
    placeCenterOrbs(c, vw, vh, arcBox, joy);
    placeStam();
    placeMute();
    st.last = { H: Math.round(Rs + r + c.ringGap), r: r, Rs: Rs, cx: Math.round(cx), cy: Math.round(cy), vw: vw, vh: vh, left: left, strikeScale: c.strikeScale, step: packed && packed.step, mid: packed && packed.mid };
    keepOut();
  }

  function placeCenterOrbs(c, vw, vh, arcBox, joy) {
    var H = hudCfg(), lo = q("#life-orb"), mo = q("#mana-orb");
    if (!H.enabled || !lo || !mo) return;
    lo.style.right = "auto"; mo.style.right = "auto";
    var ow = lo.getBoundingClientRect().width || 56, gap = H.orbCenterGap, bottom = H.orbBottom, g = H.dockGap;
    function apply() {
      lo.style.left = (vw / 2 - gap / 2 - ow) + "px"; lo.style.bottom = bottom + "px";
      mo.style.left = (vw / 2 + gap / 2) + "px"; mo.style.bottom = bottom + "px";
    }
    apply();
    function stack() { return [joy, arcBox, rect(q("#belt-left")), rect(q("#belt-right"))].filter(Boolean); }
    var n, lr, mr;
    for (n = 0; n < 48; n++) {
      lr = rect(lo); mr = rect(mo); if (!lr || !mr) break;
      var raise = 0;
      stack().forEach(function (b) {
        if (hit(lr, b, g) || hit(mr, b, g)) raise = Math.max(raise, vh - b.top + g);
      });
      if (!raise || raise <= bottom) break;
      bottom = raise; apply();
    }
    lr = rect(lo); mr = rect(mo);
    ["#belt-left", "#belt-right"].forEach(function (sel) {
      if (lr) shiftAway(q(sel), lr, c.beltGap, vw);
      if (mr) shiftAway(q(sel), mr, c.beltGap, vw);
    });
    // stamina sits above the life orb; place it now so the dock can clear it
    placeStam();
    var dock = q("#dock"), orbBox = union([rect(lo), rect(mo), rect(q("#stam-bar"))]);
    if (dock) {
      dock.style.gap = g + "px";
      // size and type come from data/ui.json profiles (tapMin / dockH / dockFont) via ab-ui.js; only position the dock here
      if (orbBox) dock.style.bottom = Math.max(0, vh - orbBox.top + H.dockAbove) + "px";
      var dr = rect(dock), tops = [arcBox, joy, rect(q("#belt-left")), rect(q("#belt-right")), orbBox].filter(function (b) { return b && dr && hit(dr, b, g); }).map(function (b) { return b.top; });
      if (tops.length) dock.style.bottom = Math.max(0, vh - Math.min.apply(null, tops) + g) + "px";
    }
    var inter = q("#interact"), under = union([rect(dock), rect(lo), rect(mo)]);
    if (inter && under) inter.style.bottom = Math.max(0, vh - under.top + H.interactAbove) + "px";
  }
  function placeStam() {
    var bar = q("#stam-bar"), lo = q("#life-orb"), hud = q("#hud");
    if (!bar || !lo || !hud) return;
    var feel = (window.ABFeel && ABFeel.stamina && ABFeel.stamina().bar) || {};
    var r = lo.getBoundingClientRect(), H = hud.getBoundingClientRect();
    if (!r.width || !H.width) return;
    var w = feel.width || 72, h = feel.height || 8, gap = feel.gapAboveOrb || 6;
    bar.style.width = w + "px";
    bar.style.height = h + "px";
    bar.style.left = (r.left - H.left + (r.width - w) / 2) + "px";
    bar.style.right = "auto";
    bar.style.top = "auto";
    bar.style.bottom = (H.bottom - r.top + gap) + "px";
    var br = bar.getBoundingClientRect();
    // if it clips off the top, sit just below the orb instead
    if (br.top < 2) {
      bar.style.bottom = Math.max(0, H.bottom - r.bottom - gap - h) + "px";
      br = bar.getBoundingClientRect();
    }
    // if it overlaps an orb after all, nudge toward the screen centre
    var orbs = ["#life-orb", "#mana-orb"].map(function (s) { return rect(q(s)); });
    if (orbs[0] && hit(br, orbs[0], 1) || orbs[1] && hit(br, orbs[1], 1)) {
      var mid = innerWidth / 2, cx = (br.left + br.right) / 2, nudge = (mid > cx ? 12 : -12);
      bar.style.left = (br.left - H.left + nudge) + "px";
    }
  }
  // HUD boxes the objective arrow must not sit on (refreshed on every layout, not per frame)
  var AVOID = ["#btn-mute", "#life-orb", "#mana-orb", "#stam-bar", "#skill-0", "#skill-1", "#skill-2", "#skill-3", "#btn-attack", "#belt-left", "#belt-right", "#joystick", "#dock", "#minimap", "#quest-track", "#topbar"];
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
  
  function placeMute() {
    var btn = q("#btn-mute"), mm = q("#minimap"), hud = q("#hud");
    if (!btn || !hud) return;
    var H = ((window.ASHBOUND_DATA && window.ASHBOUND_DATA.ui) || {}).muteBtn || {}, size = H.size || 48, gap = H.gap || 8;
    btn.style.width = size + "px"; btn.style.height = size + "px";
    var hr = hud.getBoundingClientRect(), m = mm && mm.getBoundingClientRect();
    if (!m || !m.width) return;
    btn.style.top = (m.top - hr.top) + "px";
    if (document.body.classList.contains("left-hand")) {
      btn.style.left = (m.right - hr.left + gap) + "px"; btn.style.right = "auto";
    } else {
      btn.style.left = (m.left - hr.left - gap - size) + "px"; btn.style.right = "auto";
    }
  }
  window.ABHudArc = { layout: layout, origin: origin, avoid: avoid, placeMute: placeMute, stats: function () { return { runs: st.runs, last: st.last, avoid: (st.avoid || []).length }; } };
  if (window.ASHBOUND_DATA_READY) window.ASHBOUND_DATA_READY.then(boot, boot); else addEventListener("load", boot);
})();
