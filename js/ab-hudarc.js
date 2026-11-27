/* Ashbound: skill slots on an even same-radius arc around a larger Strike, orbs sit near the bottom centre (health left, mana right).
   Settings: data/ui.json "arc" (including strikeScale, spanDeg, strikeInsetX, strikeInsetY) and "flasks" (size, gap, life/mana offsets).
   Runs on load, resize, orientation, body class changes (hand/text size) and when the skillbar is rebuilt.
   Geometry: Strike is scaled from its CSS size, then pulled toward the screen centre by strikeInsetX / strikeInsetY (CSS px)
   so health and mana potions can sit just beside it and the skill buttons stay out of the deep corner. All four slots are the
   same size and share one radius with even angular spacing (90 deg = straight up, 180 = straight left, right-handed), spanning
   from above Strike to its left (spanDeg, default 90). Radius is the smallest that keeps a ringGap from Strike and a slotGap
   from neighbouring slots (circle clearance). Every slot stays fully on screen.
   Health flasks park just to the lower-left of Strike (lower-right in left-hand mode); mana flasks and the portal park just
   to the upper-right (upper-left in left-hand). Dock, orbs and the stamina bar stay clear of the arc and the flasks. */
(function () {
  "use strict";
  var DEF = { enabled: true, ringGap: 6, slotGap: 6, centerDeg: 135, minDeg: 80, maxDeg: 200, spanDeg: 90, edge: 4, beltGap: 8, orbGap: 10, dockGap: 8, strikeScale: 1.22, strikeInsetX: 0, strikeInsetY: 0 };
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
    ["#belt-right", "#belt-left", "#dock", "#dock-left", "#dock-right", "#life-orb", "#mana-orb", "#stam-bar", "#interact", "#cast"].forEach(function (s) { var e = q(s); if (e) { e.style.bottom = ""; e.style.right = ""; e.style.left = ""; e.style.top = ""; } });
    ["#belt-left", "#belt-right"].forEach(function (s) {
      var e = q(s); if (!e) return;
      e.style.width = ""; e.style.height = ""; e.style.overflow = ""; e.style.gap = "";
      Array.prototype.forEach.call(e.children, function (n) {
        n.style.left = ""; n.style.top = ""; n.style.right = ""; n.style.bottom = "";
        n.style.width = ""; n.style.height = ""; n.style.minWidth = ""; n.style.minHeight = "";
        n.style.position = "";
      });
    });
    var dock = q("#dock");
    if (dock) {
      dock.style.gap = ""; dock.style.width = ""; dock.style.height = ""; dock.style.overflow = "";
      dock.querySelectorAll("button").forEach(function (b) { b.style.padding = ""; b.style.minHeight = ""; b.style.fontSize = ""; b.style.minWidth = ""; b.style.width = ""; });
    }
    ["#dock-left", "#dock-right"].forEach(function (s) {
      var e = q(s); if (!e) return;
      e.style.gap = ""; e.style.transform = ""; e.style.width = ""; e.style.height = "";
    });
  }
  function safe() {
    return (window.ABSafeArea && ABSafeArea.insets && ABSafeArea.insets()) || { left: 0, right: 0, top: 0, bottom: 0 };
  }
  function hudCfg() {
    var u = (window.ASHBOUND_DATA && window.ASHBOUND_DATA.ui) || {}, h = u.hudLayout || {}, d = { enabled: true, orbBottom: 8, orbCenterGap: 10, dockAbove: 8, dockGap: 6, interactAbove: 8 };
    var o = {}; for (var k in d) o[k] = h[k] != null ? h[k] : d[k]; return o;
  }
  function flaskCfg() {
    var u = (window.ASHBOUND_DATA && window.ASHBOUND_DATA.ui) || {}, f = u.flasks || {};
    return {
      enabled: f.enabled !== false,
      size: f.size != null ? +f.size : 44,
      gap: f.gap != null ? +f.gap : 8,
      lifeDX: f.lifeDX != null ? +f.lifeDX : -1,
      lifeDY: f.lifeDY != null ? +f.lifeDY : 0.35,
      manaDX: f.manaDX != null ? +f.manaDX : 1,
      manaDY: f.manaDY != null ? +f.manaDY : -0.35
    };
  }
  function visibleKids(el) {
    if (!el) return [];
    return Array.prototype.filter.call(el.children, function (n) {
      if (!n || n.nodeType !== 1) return false;
      if (n.classList.contains("hidden")) return false;
      var st = getComputedStyle(n);
      return st.display !== "none" && st.visibility !== "hidden";
    });
  }
  function flaskBoxes() {
    var out = [];
    ["#belt-left", "#belt-right"].forEach(function (sel) {
      visibleKids(q(sel)).forEach(function (n) {
        var r = rect(n); if (r) out.push(r);
      });
    });
    return out;
  }
  function applyFlaskSize(el, size) {
    el.style.width = size + "px";
    el.style.height = size + "px";
    el.style.minWidth = size + "px";
    el.style.minHeight = size + "px";
  }
  function prepBelt(belt) {
    if (!belt) return;
    belt.style.left = "0px";
    belt.style.top = "0px";
    belt.style.right = "auto";
    belt.style.bottom = "auto";
    belt.style.width = "0px";
    belt.style.height = "0px";
    belt.style.overflow = "visible";
    belt.style.gap = "0px";
  }
  function setElCenter(el, cx, cy, parent) {
    var pr = parent.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    el.style.position = "absolute";
    el.style.left = (cx - r.width / 2 - pr.left) + "px";
    el.style.top = (cy - r.height / 2 - pr.top) + "px";
    el.style.right = "auto";
    el.style.bottom = "auto";
  }
  function clampPt(cx, cy, Rf, vw, vh, s, edge) {
    var minX = s.left + edge + Rf, maxX = vw - s.right - edge - Rf;
    var minY = s.top + edge + Rf, maxY = vh - s.bottom - edge - Rf;
    return { cx: Math.max(minX, Math.min(maxX, cx)), cy: Math.max(minY, Math.min(maxY, cy)) };
  }
  /* Park a flask cluster along a direction from Strike. kids[0] is closest to Strike. */
  function placeCluster(kids, strike, blockers, dirX, dirY, F, vw, vh, s, edge, parent) {
    if (!kids.length) return;
    var gap = F.gap, size = F.size, Rf = size / 2, Rs = strike.w / 2;
    kids.forEach(function (el) { applyFlaskSize(el, size); });
    var ax = Math.abs(dirX), ay = Math.abs(dirY), dx, dy;
    if (ax >= ay) {
      dx = (dirX < 0 ? -1 : 1) * (Rs + Rf + gap);
      dy = (ay ? (dirY < 0 ? -1 : 1) : 0) * Math.abs(dirY / (dirX || 1)) * (Rs + Rf + gap);
    } else {
      dy = (dirY < 0 ? -1 : 1) * (Rs + Rf + gap);
      dx = (ax ? (dirX < 0 ? -1 : 1) : 0) * Math.abs(dirX / (dirY || 1)) * (Rs + Rf + gap);
    }
    if (ax >= ay && Math.abs(dx) < Rs + Rf + gap) dx = (dx < 0 ? -1 : 1) * (Rs + Rf + gap);
    if (ay > ax && Math.abs(dy) < Rs + Rf + gap) dy = (dy < 0 ? -1 : 1) * (Rs + Rf + gap);
    var len = Math.hypot(dirX, dirY) || 1, ux = dirX / len, uy = dirY / len;
    function boxOf(block) {
      if (!block) return null;
      if (block.left != null) return { left: block.left, right: block.right != null ? block.right : block.left + (block.width || 0), top: block.top, bottom: block.bottom != null ? block.bottom : block.top + (block.height || 0) };
      return { left: block.x, right: block.x + block.w, top: block.y, bottom: block.y + block.h };
    }
    function alongEdge(px, py, pr) {
      // If the ray is blocked by the screen edge, walk along that edge instead.
      var tx, ty;
      if (Math.abs(uy) >= Math.abs(ux)) { tx = dirX < 0 ? -1 : 1; ty = 0; }
      else { tx = 0; ty = dirY < 0 ? -1 : 1; }
      return { cx: px + tx * (pr + Rf + gap), cy: py + ty * (pr + Rf + gap) };
    }
    var first = clampPt(strike.cx + dx, strike.cy + dy, Rf, vw, vh, s, edge);
    var cx = first.cx, cy = first.cy;
    kids.forEach(function (el, i) {
      if (i) {
        var prev = kids[i - 1].getBoundingClientRect();
        var pr = (prev.width || size) / 2;
        var pcx = prev.left + prev.width / 2, pcy = prev.top + prev.height / 2;
        cx = pcx + ux * (pr + Rf + gap);
        cy = pcy + uy * (pr + Rf + gap);
        var c = clampPt(cx, cy, Rf, vw, vh, s, edge);
        if (Math.hypot(c.cx - pcx, c.cy - pcy) < pr + Rf + gap - 0.5) {
          var e = alongEdge(pcx, pcy, pr);
          c = clampPt(e.cx, e.cy, Rf, vw, vh, s, edge);
        }
        cx = c.cx; cy = c.cy;
      }
      setElCenter(el, cx, cy, parent);
    });
    var pass, i, el, r, c, moved, j, b, ox, oy, pushX, pushY;
    for (pass = 0; pass < 16; pass++) {
      moved = false;
      for (i = 0; i < kids.length; i++) {
        el = kids[i];
        r = el.getBoundingClientRect();
        cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        function aabbPush(block) {
          b = boxOf(block); if (!b) return;
          ox = Math.min(cx + Rf, b.right) - Math.max(cx - Rf, b.left);
          oy = Math.min(cy + Rf, b.bottom) - Math.max(cy - Rf, b.top);
          if (ox > -gap && oy > -gap) {
            // Push along the thinner overlap (plus gap) so boxes, not just circles, stay clear.
            if (ox <= oy) cx += (cx < (b.left + b.right) / 2 ? -1 : 1) * (ox + gap);
            else cy += (cy < (b.top + b.bottom) / 2 ? -1 : 1) * (oy + gap);
            moved = true;
          }
        }
        aabbPush({ left: strike.cx - Rs, right: strike.cx + Rs, top: strike.cy - Rs, bottom: strike.cy + Rs });
        for (j = 0; j < i; j++) aabbPush(kids[j].getBoundingClientRect());
        for (j = 0; j < blockers.length; j++) aabbPush(blockers[j]);
        c = clampPt(cx, cy, Rf, vw, vh, s, edge);
        if (c.cx !== cx || c.cy !== cy) {
          // If the screen edge blocked the push, walk along that edge away from Strike.
          var e = alongEdge(c.cx, c.cy, 0);
          // alongEdge from the clamped point with pr=0 still adds a full flask step; instead nudge 2px
          var tx = Math.abs(uy) >= Math.abs(ux) ? (dirX < 0 ? -1 : 1) : 0;
          var ty = Math.abs(uy) >= Math.abs(ux) ? 0 : (dirY < 0 ? -1 : 1);
          c = clampPt(c.cx + tx * 4, c.cy + ty * 4, Rf, vw, vh, s, edge);
          moved = true;
        }
        setElCenter(el, c.cx, c.cy, parent);
      }
      if (!moved) break;
    }
  }
  function placeFlasks(c, vw, vh, left, slotBoxes) {
    var F = flaskCfg();
    if (!F.enabled) return;
    var atk = q("#btn-attack"), leftBelt = q("#belt-left"), rightBelt = q("#belt-right");
    if (!atk || !leftBelt || !rightBelt) return;
    var A = atk.getBoundingClientRect();
    if (!A.width) return;
    var s = safe(), edge = c.edge || 4;
    var strike = { cx: A.left + A.width / 2, cy: A.top + A.height / 2, w: A.width };
    var parent = leftBelt.offsetParent || q("#hud") || document.body;
    prepBelt(leftBelt); prepBelt(rightBelt);
    var lifeKids = visibleKids(leftBelt);
    var manaKids = visibleKids(rightBelt).slice().sort(function (a, b) {
      var ap = a.id === "btn-portal" ? 1 : 0, bp = b.id === "btn-portal" ? 1 : 0;
      return ap - bp;
    });
    var blockers = (slotBoxes || []).concat([rect(q("#joystick"))]).filter(Boolean);
    placeCluster(lifeKids, strike, blockers, left ? -F.lifeDX : F.lifeDX, F.lifeDY, F, vw, vh, s, edge, parent);
    placeCluster(manaKids, strike, blockers, left ? -F.manaDX : F.manaDX, F.manaDY, F, vw, vh, s, edge, parent);
  }
  function withFlaskInsets(c) {
    var F = flaskCfg();
    if (!F.enabled) return c;
    // Mana sits on the outward side of Strike; health sits just below it. Leave a flask+gap of room on both axes.
    var needX = F.size + F.gap;
    var needY = F.size + F.gap;
    var o = {};
    for (var k in c) o[k] = c[k];
    o.strikeInsetX = Math.max(c.strikeInsetX || 0, needX);
    o.strikeInsetY = Math.max(c.strikeInsetY || 0, needY);
    return o;
  }
  function applyStrikeScale(atk, scale) {
    atk.style.width = ""; atk.style.height = "";
    var base = atk.getBoundingClientRect();
    if (!base.width || !scale || scale === 1) return base;
    atk.style.width = Math.round(base.width * scale) + "px";
    atk.style.height = Math.round(base.height * scale) + "px";
    return atk.getBoundingClientRect();
  }
  /* Pull #cast (and so Strike) toward the screen centre by the configured CSS-px insets. */
  function applyStrikeInset(cast, c, left, s) {
    s = s || safe();
    var ix = c.strikeInsetX || 0, iy = c.strikeInsetY || 0;
    var parent = cast.offsetParent || q("#hud") || document.body;
    var pr = parent.getBoundingClientRect();
    var r = cast.getBoundingClientRect();
    if (left) {
      cast.style.right = "auto";
      cast.style.left = Math.max(s.left, r.left - pr.left + ix) + "px";
    } else {
      cast.style.left = "auto";
      cast.style.right = Math.max(s.right, pr.right - r.right + ix) + "px";
    }
    cast.style.top = "auto";
    cast.style.bottom = Math.max(s.bottom, pr.bottom - r.bottom + iy) + "px";
  }
  function evenPack(c, vw, vh, cx, cy, Rs, r, left) {
    var ring = c.ringGap, slot = c.slotGap, edge = c.edge;
    var span = c.spanDeg != null ? c.spanDeg : 90;
    var mid0 = left ? 180 - c.centerDeg : c.centerDeg;
    var step0 = span / 3;
    function xy(ang, R) {
      var rad = ang * Math.PI / 180;
      return [cx + R * Math.cos(rad), cy - R * Math.sin(rad)];
    }
    function onScreen(x, y) {
      var s = safe();
      return x - r >= edge + s.left && x + r <= vw - edge - s.right && y - r >= edge + s.top && y + r <= vh - edge - s.bottom;
    }
    // One radius for every slot: clear Strike and neighbours as circles, not as boxes.
    function rNeed(step) {
      var rs = Rs + r + ring;
      var half = (step * Math.PI / 180) / 2;
      var rn = (2 * r + slot) / (2 * Math.sin(Math.max(half, 1e-6)));
      return Math.max(rs, rn);
    }
    function tryPack(mid, step, R) {
      var angs = [mid - 1.5 * step, mid - 0.5 * step, mid + 0.5 * step, mid + 1.5 * step];
      var pts = [], i, p;
      for (i = 0; i < 4; i++) {
        p = xy(angs[i], R);
        if (!onScreen(p[0], p[1])) return null;
        pts.push(p);
      }
      return { pos: pts, angs: angs, R: [R, R, R, R], mid: mid, step: step, tight: true };
    }
    var s = safe();
    var key = [vw, vh, Math.round(cx), Math.round(cy), Math.round(Rs * 10), Math.round(r * 10), left ? 1 : 0, ring, slot, span, s.left, s.right, s.top, s.bottom].join(",");
    if (st.packKey === key && st.pack) return st.pack;
    var rec = tryPack(mid0, step0, rNeed(step0));
    if (rec) { st.packKey = key; st.pack = rec; return rec; }
    var step, k, m, mids, R;
    // If the default quarter-arc goes off-screen, shift mid, then widen or tighten the span, still at one radius.
    for (step = step0; step <= step0 + 20; step += 0.5) {
      R = rNeed(step);
      for (k = 0; k <= 90; k++) {
        mids = k === 0 ? [mid0] : [mid0 + k * 0.5, mid0 - k * 0.5];
        for (m = 0; m < mids.length; m++) {
          rec = tryPack(mids[m], step, R);
          if (rec) { st.packKey = key; st.pack = rec; return rec; }
        }
      }
    }
    for (step = step0 - 0.5; step >= 20; step -= 0.5) {
      rec = tryPack(mid0, step, rNeed(step));
      if (rec) { st.packKey = key; st.pack = rec; return rec; }
    }
    st.packKey = key; st.pack = null;
    return null;
  }

  function layout() {
    st.dirtyA = st.dirtyO = true;
    // v84j: while a full-screen panel is open the HUD is hidden; don't relayout then. Clearing the inline spots here used to
    // drop the flasks and the Town Portal button to the top-left corner of #hud, where they could peek out at the left edge
    // behind the panel (and flash there for a frame on close). Closing the panel changes the body class, which lays out again.
    if (document.body.classList.contains("panel-open") && st.runs > 0) { st.skippedOpen = (st.skippedOpen || 0) + 1; return; }
    var c = withFlaskInsets(cfg()), cast = q("#cast"), bar = q("#skillbar"), atk = q("#btn-attack");
    if (!cast || !bar || !atk) return;
    var slots = [0, 1, 2, 3].map(function (i) { return q("#skill-" + i); }).filter(Boolean);
    if (!c.enabled || slots.length < 4) { atk.style.width = ""; atk.style.height = ""; cast.style.left = ""; cast.style.right = ""; cast.style.bottom = ""; cast.style.top = ""; cast.classList.remove("ab-arc"); return; }
    st.runs++;
    cast.classList.add("ab-arc");
    clearInline();
    var vw = innerWidth, vh = innerHeight, s = safe();
    var left = document.body.classList.contains("left-hand");
    var A = applyStrikeScale(atk, c.strikeScale);
    applyStrikeInset(cast, c, left, s);
    A = atk.getBoundingClientRect();
    var Cr = cast.getBoundingClientRect();
    if (!A.width) return;
    var cx = A.left + A.width / 2, cy = A.top + A.height / 2, Rs = A.width / 2, S = slots[0].offsetWidth || 44, r = S / 2;
    var packed = evenPack(c, vw, vh, cx, cy, Rs, r, left);
    var pos = packed && packed.pos;
    if (!pos) { atk.style.width = ""; atk.style.height = ""; cast.style.left = ""; cast.style.right = ""; cast.style.bottom = ""; cast.style.top = ""; cast.classList.remove("ab-arc"); return; }
    // slot 1 nearest the top / thumb-opposite side of the fan, 4 nearest the side (low angle first was up, high angle is left/right)
    // Number them round the arc: slot 1 lowest / nearest the thumb, slot 4 highest? Historic order is by decreasing "up-ness" of the old ph
    // (slot 1 highest? comment said "slot 1 lowest / nearest the thumb, 4 at the top") but measure names slot1 as the top-most in practice.
    // Existing tests number #skill-0 as slot1 and expect tight neighbours in index order (0-1, 1-2, 2-3).
    // packed.pos is already in increasing angle (up-right ... around to left-down), which matches current slot1..slot4 order.
    slots.forEach(function (b, i) {
      var p = pos[i]; b.style.left = (p[0] - r - Cr.left) + "px"; b.style.top = (p[1] - r - Cr.top) + "px";
    });
    var arcBox = union(slots.map(function (b) { return b.getBoundingClientRect(); }).concat([A]));
    var joy = rect(q("#joystick"));
    var slotBoxes = slots.map(function (b) { return b.getBoundingClientRect(); });
    placeFlasks(c, vw, vh, left, slotBoxes);
    placeCenterOrbs(c, vw, vh, arcBox, joy);
    placeStam();
    placeMute();
    st.last = { H: Math.round(packed && packed.R ? packed.R[0] : (Rs + r + c.ringGap)), r: r, Rs: Rs, cx: Math.round(cx), cy: Math.round(cy), vw: vw, vh: vh, left: left, strikeScale: c.strikeScale, strikeInsetX: c.strikeInsetX || 0, strikeInsetY: c.strikeInsetY || 0, step: packed && packed.step, mid: packed && packed.mid, R: packed && packed.R && packed.R[0] };
    keepOut();
  }


  function dockSplitCfg() {
    var u = (window.ASHBOUND_DATA && window.ASHBOUND_DATA.ui) || {}, d = u.dockSplit || {};
    return {
      enabled: d.enabled !== false,
      orbGap: d.orbGap != null ? +d.orbGap : 8,
      edge: d.edge != null ? +d.edge : 4,
      minBtn: d.minBtn != null ? +d.minBtn : 36
    };
  }
  /* Gear+Stats just left of the life orb; Skills+Journal+Menu just right of the mana orb. */
  /* Gear+Stats just left of the life orb; Skills+Journal+Menu just right of the mana orb. */
  function placeSplitDock(H, c, vw, vh, arcBox, joy, lo, mo, g) {
    var left = q("#dock-left"), right = q("#dock-right"), dock = q("#dock");
    var D = dockSplitCfg();
    if (!D.enabled || !left || !right) {
      if (dock && lo) {
        var orbBox = union([rect(lo), rect(mo), rect(q("#stam-bar"))]);
        dock.style.gap = g + "px";
        if (orbBox) dock.style.bottom = Math.max(0, vh - orbBox.top + (H.dockAbove || 0)) + "px";
      }
      return;
    }
    var s = safe(), gap = D.orbGap, edge = D.edge, hud = (q("#hud") || document.body).getBoundingClientRect();
    var lr = lo.getBoundingClientRect(), mr = mo.getBoundingClientRect();
    [left, right].forEach(function (el) {
      el.style.position = "absolute";
      el.style.transform = "none";
      el.style.right = "auto";
      el.style.top = "auto";
      el.style.gap = g + "px";
    });
    var bottomL = hud.bottom - lr.bottom, bottomR = hud.bottom - mr.bottom;
    left.style.bottom = bottomL + "px";
    right.style.bottom = bottomR + "px";
    function hudBoxes() {
      var ids = ["#joystick", "#btn-attack", "#skill-0", "#skill-1", "#skill-2", "#skill-3", "#life-orb", "#mana-orb", "#stam-bar"];
      var out = ids.map(function (sel) { return rect(q(sel)); }).filter(Boolean);
      flaskBoxes().forEach(function (r) { if (r && r.width > 1 && r.height > 1) out.push(r); });
      return out;
    }
    function vOverlap(a, b, pad) {
      return a && b && a.top < b.bottom + pad && b.top < a.bottom + pad;
    }
    /* Lane ends at the nearest blocker that shares this group's vertical band. */
    function laneEnd(el, fromX, dir) {
      var r = rect(el), boxes = hudBoxes(), best = dir < 0 ? (s.left + edge) : (vw - s.right - edge), pad = gap;
      if (!r) return best;
      boxes.forEach(function (b) {
        if (!vOverlap(r, b, pad)) return;
        if (dir > 0 && b.left >= fromX) best = Math.min(best, b.left - pad);
        if (dir < 0 && b.right <= fromX) best = Math.max(best, b.right + pad);
      });
      return best;
    }
    function fitWidth(el, maxW) {
      var btns = [].slice.call(el.querySelectorAll("button"));
      if (!btns.length || maxW <= 0) return;
      var n = btns.length, avail = maxW - g * (n - 1), each = Math.floor(avail / n);
      if (each < D.minBtn) each = D.minBtn;
      btns.forEach(function (b) {
        b.style.boxSizing = "border-box";
        b.style.minWidth = each + "px";
        b.style.width = each + "px";
        b.style.paddingLeft = "2px";
        b.style.paddingRight = "2px";
      });
    }
    var lw = left.getBoundingClientRect().width || 100;
    var rw = right.getBoundingClientRect().width || 150;
    var lx = lr.left - gap - lw;
    var rx = mr.right + gap;
    var minX = s.left + edge, maxX = vw - s.right - edge;
    if (lx < minX) lx = minX;
    if (rx + rw > maxX) rx = Math.max(minX, maxX - rw);
    left.style.left = (lx - hud.left) + "px";
    right.style.left = (rx - hud.left) + "px";
    /* Shrink to keep each group in the gap beside its orb, still on the orb baseline. */
    var leftEnd = laneEnd(left, lr.left, -1);
    var rightEnd = laneEnd(right, mr.right, 1);
    if (lr.left - gap - leftEnd < lw) {
      fitWidth(left, Math.max(D.minBtn, lr.left - gap - leftEnd));
      lw = left.getBoundingClientRect().width || lw;
      lx = lr.left - gap - lw;
      if (lx < leftEnd) lx = leftEnd;
      left.style.left = (lx - hud.left) + "px";
    }
    if (rightEnd - (mr.right + gap) < rw) {
      fitWidth(right, Math.max(D.minBtn, rightEnd - (mr.right + gap)));
      rw = right.getBoundingClientRect().width || rw;
      rx = mr.right + gap;
      if (rx + rw > rightEnd) rx = Math.max(mr.right + gap, rightEnd - rw);
      right.style.left = (rx - hud.left) + "px";
    }
    function raiseJustEnough(el, keepSide) {
      var n, r, hits, raise;
      for (n = 0; n < 16; n++) {
        r = rect(el);
        if (!r) return;
        hits = hudBoxes().filter(function (b) { return hit(r, b, gap); });
        if (!hits.length) return;
        raise = Math.max.apply(null, hits.map(function (b) { return vh - b.top + gap; }));
        if (raise > 0) el.style.bottom = raise + "px";
        /* After a raise, try to slide back toward the orb if the new band is wider. */
        r = rect(el);
        if (!r) return;
        if (keepSide === "left") {
          var end = laneEnd(el, lr.left, -1);
          el.style.left = (lr.left - gap - r.width - hud.left) + "px";
          if (rect(el) && rect(el).left < end) el.style.left = (end - hud.left) + "px";
        } else {
          var endR = laneEnd(el, mr.right, 1);
          var nx = mr.right + gap;
          if (nx + r.width > endR) nx = endR - r.width;
          el.style.left = (nx - hud.left) + "px";
        }
      }
    }
    raiseJustEnough(left, "left");
    raiseJustEnough(right, "right");
    if (window.ABCharSheet && ABCharSheet.syncDock) ABCharSheet.syncDock();
  }
  function placeCenterOrbs(c, vw, vh, arcBox, joy) {
    var H = hudCfg(), lo = q("#life-orb"), mo = q("#mana-orb");
    if (!H.enabled || !lo || !mo) return;
    lo.style.right = "auto"; mo.style.right = "auto";
    var s = safe();
    var ow = lo.getBoundingClientRect().width || 56, gap = H.orbCenterGap, bottom = (H.orbBottom || 0) + s.bottom, g = H.dockGap;
    function apply() {
      lo.style.left = (vw / 2 - gap / 2 - ow) + "px"; lo.style.bottom = bottom + "px";
      mo.style.left = (vw / 2 + gap / 2) + "px"; mo.style.bottom = bottom + "px";
    }
    apply();
    function stack() { return [joy, arcBox].concat(flaskBoxes()).filter(Boolean); }
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
    // stamina sits above the life orb; place it now so the dock can clear it
    placeStam();
    var orbBox = union([rect(lo), rect(mo), rect(q("#stam-bar"))]);
    placeSplitDock(H, c, vw, vh, arcBox, joy, lo, mo, g);
    var inter = q("#interact"), under = union([rect(q("#dock-left")), rect(q("#dock-right")), rect(lo), rect(mo)]);
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
  var AVOID = ["#btn-mute", "#life-orb", "#mana-orb", "#stam-bar", "#skill-0", "#skill-1", "#skill-2", "#skill-3", "#btn-attack", "#belt-left", "#belt-right", "#joystick", "#dock-left", "#dock-right", "#minimap", "#quest-track", "#topbar"];
  function keepOut() {
    st.avoid = AVOID.map(function (s) { var b = rect(q(s)); return b && { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; }).filter(Boolean);
    flaskBoxes().forEach(function (b) { st.avoid.push({ left: b.left, top: b.top, right: b.right, bottom: b.bottom }); });
    st.dirtyA = false;
  }
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
    if (window.ABSafeArea && ABSafeArea.listen) ABSafeArea.listen(function () { st.dirtyA = st.dirtyO = true; soon(); });
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
