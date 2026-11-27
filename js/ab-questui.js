/* Ashbound quest indicator. Objective copy, a path-aware edge compass with a
   distance or "here" label, a ground beacon on the target, and a minimap pip.
   Copy, sizes, and the compass pointer shape live in data/questui.json. Hooks from index.html call ABQuestUi. */
(function (root) {
  "use strict";

  var CSS_ID = "ab-questui-css";
  var ready = false;

  function cfg() {
    var d = (root.ASHBOUND_DATA || {}).questUi || {};
    return d;
  }
  function state() {
    return (root.ASHBOUND && root.ASHBOUND.state) || null;
  }
  function zones() {
    var A = root.ASHBOUND || {}, D = root.ASHBOUND_DATA || {};
    return A.zones || D.zones || [];
  }
  function zoneById(id) {
    if (!id) return null;
    var list = zones();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function zoneName(id) {
    var z = zoneById(id);
    return (z && z.name) || "the next road";
  }
  function isoScr(x, y) {
    if (root.ASHBOUND && typeof root.ASHBOUND.isoScreen === "function") return root.ASHBOUND.isoScreen(x, y);
    return { x: x, y: y };
  }
  function fmt(t, bag) {
    t = String(t || "");
    Object.keys(bag || {}).forEach(function (k) {
      t = t.split("{" + k + "}").join(bag[k] == null ? "" : String(bag[k]));
    });
    return t;
  }
  function hypot(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }
  function origin(el) {
    var n = el || (state() && state().ui && document.getElementById("ui")) || document.body;
    var r = n.getBoundingClientRect ? n.getBoundingClientRect() : { left: 0, top: 0 };
    return { left: r.left || 0, top: r.top || 0 };
  }

  function ensureCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement("style");
    s.id = CSS_ID;
    s.textContent = [
      "#obj-arrow{position:absolute;z-index:6;pointer-events:none;width:auto;height:auto;margin:0;border:none;border-radius:0;background:transparent;box-shadow:none;animation:none;display:flex;flex-direction:column;align-items:center;gap:5px;}",
      "#obj-arrow.hidden{display:none;}",
      "#obj-arrow[data-edge=left]{flex-direction:row;align-items:center;}",
      "#obj-arrow[data-edge=right]{flex-direction:row-reverse;align-items:center;}",
      "#obj-arrow[data-edge=top]{flex-direction:column;}",
      "#obj-arrow[data-edge=bottom]{flex-direction:column-reverse;}",
      "#obj-arrow .obj-ptr{display:block;flex:none;width:var(--quest-ptr-l,28px);height:var(--quest-ptr-w,12px);overflow:visible;border:none;background:transparent;filter:drop-shadow(0 0 3px #000) drop-shadow(0 0 8px var(--quest-ptr-glow,rgba(255,176,80,.95)));transform-origin:50% 50%;color:var(--quest-ptr-fill,#ffb067);}",
      "#obj-arrow .obj-ptr polygon{fill:currentColor;stroke:var(--quest-ptr-stroke,#3a1408);stroke-width:var(--quest-ptr-sw,1.4);stroke-linejoin:round;}",
      "#obj-arrow.on-target .obj-ptr{color:var(--quest-ptr-fill-on,#ffe7b0);}",
      "#obj-arrow .obj-lab{pointer-events:none;white-space:nowrap;font:700 12px/1.15 system-ui,sans-serif;letter-spacing:.02em;color:#fff3d2;text-shadow:0 1px 2px #000,0 0 8px #000,0 0 2px #000;padding:3px 8px;border-radius:999px;background:rgba(28,16,10,.82);border:1px solid rgba(255,200,120,.65);box-shadow:0 0 10px rgba(255,160,60,.35);}",
      "#obj-arrow.on-target .obj-lab{border-color:#ffe7b0;background:rgba(40,22,10,.9);}",
      "#obj-arrow::after{content:none;display:none;}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function ptrCfg() {
    var p = (cfg().pointer) || {};
    return {
      kind: p.kind || "arrow",
      length: p.length || 28,
      width: p.width || 12,
      head: p.head || 14,
      tailW: p.tailW || 3.5,
      stroke: p.stroke == null ? 1.4 : p.stroke,
      fill: p.fill || "#ffb067",
      fillOnTarget: p.fillOnTarget || "#ffe7b0",
      strokeColor: p.strokeColor || "#3a1408",
      glow: p.glow || "rgba(255,176,80,.95)"
    };
  }

  function applyPtrVars(el) {
    var p = ptrCfg();
    var host = el || document.documentElement;
    host.style.setProperty("--quest-ptr-l", p.length + "px");
    host.style.setProperty("--quest-ptr-w", p.width + "px");
    host.style.setProperty("--quest-ptr-fill", p.fill);
    host.style.setProperty("--quest-ptr-fill-on", p.fillOnTarget);
    host.style.setProperty("--quest-ptr-stroke", p.strokeColor);
    host.style.setProperty("--quest-ptr-sw", String(p.stroke));
    host.style.setProperty("--quest-ptr-glow", p.glow);
  }

  function makePtrSvg() {
    var p = ptrCfg();
    var L = p.length, W = p.width, H = Math.min(p.head || 14, L), tw = Math.min(p.tailW || 3.5, W - 0.5);
    var mid = W / 2;
    var shaft = Math.max(0, L - H);
    var y1 = mid - tw / 2, y2 = mid + tw / 2;
    var raw = [0, y1, shaft, y1, shaft, 0, L, mid, shaft, W, shaft, y2, 0, y2];
    var pts = [];
    var i;
    for (i = 0; i < raw.length; i += 2) pts.push(raw[i].toFixed(2) + "," + raw[i + 1].toFixed(2));
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "obj-ptr");
    svg.setAttribute("viewBox", "0 0 " + L + " " + W);
    svg.setAttribute("width", String(L));
    svg.setAttribute("height", String(W));
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    var poly = document.createElementNS(ns, "polygon");
    poly.setAttribute("points", pts.join(" "));
    svg.appendChild(poly);
    return svg;
  }

  function ensureDom() {
    var el = document.getElementById("obj-arrow");
    if (!el) return null;
    ensureCss();
    applyPtrVars(el);
    var ptr = el.querySelector(".obj-ptr");
    var isSvg = ptr && ptr.tagName && ptr.tagName.toLowerCase() === "svg" && ptr.querySelector("polygon");
    if (!isSvg) {
      if (ptr && ptr.parentNode) ptr.parentNode.removeChild(ptr);
      ptr = makePtrSvg();
      var lab = el.querySelector(".obj-lab");
      if (lab) el.insertBefore(ptr, lab);
      else el.appendChild(ptr);
    }
    if (!el.querySelector(".obj-lab")) {
      var lab2 = document.createElement("span");
      lab2.className = "obj-lab";
      el.appendChild(lab2);
    }
    return el;
  }

  function forwardExit(world) {
    if (!world) return null;
    var props = world.props || [];
    var i, p;
    if (world.exit) {
      for (i = 0; i < props.length; i++) {
        p = props[i];
        if (p.kind === "exit" && !p.town && Math.hypot((p.x || 0) - world.exit.x, (p.y || 0) - world.exit.y) < 1.2) {
          return p;
        }
      }
    }
    for (i = 0; i < props.length; i++) {
      p = props[i];
      if (p.kind === "exit" && !p.town) return p;
    }
    var gate = null;
    for (i = 0; i < props.length; i++) if (props[i].kind === "gate") { gate = props[i]; break; }
    if (gate) return gate;
    if (world.exit) return { kind: "exit", name: "Far Arch", x: world.exit.x, y: world.exit.y };
    return null;
  }

  function target(quest) {
    var o = state();
    if (!o || !o.world || !o.player) return null;
    var w = o.world, pl = o.player, a = quest;
    if (!a || a.ui) return null;
    var props = w.props || [], n, i;
    if (a.target) {
      for (i = 0; i < props.length; i++) if (props[i].kind === a.target) return { x: props[i].x, y: props[i].y, name: props[i].name, kind: props[i].kind, prop: props[i] };
    }
    if (a.kind === "side") {
      n = (w.monsters || []).filter(function (s) { return !s.dead; }).sort(function (s, r) { return hypot(s.x, s.y, pl.x, pl.y) - hypot(r.x, r.y, pl.x, pl.y); });
      if (n[0]) return { x: n[0].x, y: n[0].y, name: n[0].name, kind: "monster" };
    }
    var need = (a.quest && a.quest.need) || a.need || {};
    if (need.boss) {
      n = (w.monsters || []).find(function (s) { return s.boss && !s.dead; });
      if (n) return { x: n.x, y: n.y, name: n.name, kind: "boss" };
    }
    var ex = forwardExit(w);
    return ex ? { x: ex.x, y: ex.y, name: ex.name, kind: ex.kind, prop: ex } : null;
  }

  function line(quest) {
    var L = (cfg().lines) || {};
    if (!quest) return L.keep || "Keep going";
    var need = quest.need || {};
    var world = state() && state().world;
    var here = world ? zoneById(world.id) : null;
    if (need.boss) {
      var key = String(need.boss);
      var names = cfg().bossNames || {};
      return fmt(L.kill || "Kill {name}", { name: names[key] || names[key.toLowerCase()] || "the keeper" });
    }
    if (need.waypoint) {
      var dest = zoneName(need.waypoint);
      if (here && here.unlocks === need.waypoint) {
        var ex = forwardExit(world);
        var exitName = (ex && ex.name) || "exit";
        return fmt(L.through || "Go through the {exit} to the {zone}", { exit: exitName, zone: dest });
      }
      return fmt(L.reach || "Go to the {zone}", { zone: dest });
    }
    var track = (quest.track || "").replace(/\.$/, "");
    if (track && track.length <= 52) return track;
    return quest.name || L.keep || "Keep going";
  }

  function interact(prop) {
    var I = (cfg().interact) || {};
    if (!prop) return I.archFallback || "Take the arch";
    if (prop.kind === "exit" && prop.town) {
      var town = "town";
      try { town = (root.ASHBOUND && typeof root.Pr === "function") ? root.Pr() : town; } catch (e) {}
      return fmt(I.exitTown || "Return to {town}", { town: town });
    }
    if (prop.kind === "exit" || prop.kind === "gate") {
      return fmt(I.exit || "Take the {exit}", { exit: prop.name || "arch" });
    }
    return I.archFallback || "Take the arch";
  }

  function pathInfo(from, dest) {
    var o = state();
    var info = { hint: dest, final: dest, path: null, pathLen: 0, euclid: 0, corners: 0 };
    if (!from || !dest) return info;
    info.euclid = hypot(from.x, from.y, dest.x, dest.y);
    var pts = null;
    if (root.ABMove && typeof root.ABMove.path === "function" && o && o.world) {
      pts = root.ABMove.path(o.world, from, dest);
    }
    info.path = pts;
    if (!pts || !pts.length) {
      info.hint = dest;
      info.pathLen = info.euclid;
      return info;
    }
    var len = 0, i;
    for (i = 1; i < pts.length; i++) len += hypot(pts[i].x, pts[i].y, pts[i - 1].x, pts[i - 1].y);
    info.pathLen = len;
    var look = (cfg().lookAhead) || 5;
    var hint = pts[Math.min(pts.length - 1, 1)];
    var prevDx = 0, prevDy = 0;
    for (i = 1; i < pts.length; i++) {
      var d = hypot(pts[i].x, pts[i].y, from.x, from.y);
      var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      hint = pts[i];
      if (i > 1 && d >= 2) {
        var turn = Math.abs(dx * prevDy - dy * prevDx);
        if (turn > 0.15 && d >= 2.2) { info.corners++; break; }
      }
      if (d >= look) break;
      prevDx = dx; prevDy = dy;
    }
    // If the remaining path is short, steer at the destination itself.
    if (len <= look * 0.7) hint = dest;
    info.hint = hint;
    return info;
  }

  function hudBoxes() {
    var ids = ["#btn-mute", "#life-orb", "#mana-orb", "#stam-bar", "#skill-0", "#skill-1", "#skill-2", "#skill-3", "#btn-attack", "#belt-left", "#belt-right", "#joystick", "#dock", "#minimap", "#quest-track", "#topbar", "#toasts", "#hint", "#tutor", "#act-banner", "#quest-banner"];
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var el = document.querySelector(ids[i]);
      if (!el || !el.getBoundingClientRect || el.offsetParent === null) continue;
      if (el.classList && el.classList.contains("hidden")) continue;
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      out.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, id: ids[i] });
    }
    return out;
  }
  function overlaps(x, y, r, boxes) {
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (x + r > b.left && x - r < b.right && y + r > b.top && y - r < b.bottom) return b;
    }
    return null;
  }

  // Sit the compass on a true screen edge, never on the hero in the middle.
  function placeOnEdge(cx, cy, hx, hy, vw, vh, originPt) {
    var e = cfg().edge || {};
    var pad = e.pad || 20, top = e.top || 86, bottom = e.bottom || 150, side = e.side || 18;
    var s = (root.ABSafeArea && ABSafeArea.insets && ABSafeArea.insets()) || { left: 0, right: 0, top: 0, bottom: 0 };
    top += s.top; bottom += s.bottom; side = side; // side is applied per-edge below
    var dx = hx - cx, dy = hy - cy;
    if (!dx && !dy) { dx = 0; dy = 1; }
    var absx = Math.abs(dx), absy = Math.abs(dy);
    var boxes = hudBoxes();
    var x0 = originPt.left, y0 = originPt.top;
    var left = x0 + side + s.left, right = x0 + vw - side - s.right, up = y0 + top, down = y0 + vh - bottom;
    // Prefer left/right when the bottom band is the HUD (phone landscape).
    var edge;
    if (absy >= absx * 1.15 && dy > 0) edge = dx >= 0 ? "right" : "left";
    else if (absy >= absx && dy < 0) edge = "top";
    else if (absx >= absy && dx > 0) edge = "right";
    else if (absx >= absy && dx < 0) edge = "left";
    else edge = dy > 0 ? (dx >= 0 ? "right" : "left") : "top";

    var x, y;
    if (edge === "left" || edge === "right") {
      x = edge === "left" ? left : right;
      var t = dx ? ((x - x0 - cx) / dx) : 0;
      y = y0 + cy + dy * Math.max(t, 0);
      y = Math.max(up, Math.min(down, y));
    } else {
      y = edge === "top" ? up : down;
      var t2 = dy ? ((y - y0 - cy) / dy) : 0;
      x = x0 + cx + dx * Math.max(t2, 0);
      x = Math.max(left, Math.min(right, x));
    }
    // Slide along the edge if we landed on a HUD box; if the edge is packed, step inward.
    var rad = 36, hit, guard = 0, step = 16;
    while ((hit = overlaps(x, y, rad, boxes)) && guard++ < 28) {
      if (edge === "left" || edge === "right") {
        var midY = (hit.top + hit.bottom) / 2;
        var ny = y + (y <= midY ? -step : step);
        if (ny >= up && ny <= down) y = ny;
        else x += (edge === "left" ? step : -step);
      } else {
        var midX = (hit.left + hit.right) / 2;
        var nx = x + (x <= midX ? -step : step);
        if (nx >= left && nx <= right) x = nx;
        else y += (edge === "top" ? step : -step);
      }
    }
    // Still covered (toasts + tutor stacking on a phone): nudge toward the playfield.
    guard = 0;
    while ((hit = overlaps(x, y, rad, boxes)) && guard++ < 16) {
      if (edge === "left") x += step;
      else if (edge === "right") x -= step;
      else if (edge === "top") y += step;
      else y -= step;
    }
    return { x: x - x0, y: y - y0, edge: edge, ang: Math.atan2(dy, dx) };
  }

  function placeArrow(quest, tgt) {
    var el = ensureDom();
    if (!el) return;
    var o = state();
    var play = o && o.mode === "play" && o.player && o.world && !o.ui.panel && !o.ui.talk;
    var a = play ? (tgt || target(quest)) : null;
    if (!a) { el.classList.add("hidden"); lastDebug = { mode: "hidden" }; return; }
    var pl = o.player, vw = o.view.w, vh = o.view.h;
    var route = pathInfo(pl, a);
    var hereR = (cfg().hereTiles) || 1.2;
    var dist = route.pathLen || route.euclid;
    var near = hypot(pl.x, pl.y, a.x, a.y) <= hereR;
    var A = (cfg().arrow) || {};
    var exitName = a.name || A.objective || "Objective";
    var lab = el.querySelector(".obj-lab");
    var ptr = el.querySelector(".obj-ptr");
    var scrFinal = isoScr(a.x, a.y);
    var scrHint = isoScr(route.hint.x, route.hint.y);
    var pad = (cfg().edge) || {};
    var inward = 28, topM = pad.top || 86, botM = pad.bottom || 150, sideM = pad.side || 18;
    var sA = (root.ABSafeArea && ABSafeArea.insets && ABSafeArea.insets()) || { left: 0, right: 0, top: 0, bottom: 0 };
    topM += sA.top; botM += sA.bottom;
    var onScreen = scrFinal.x > sideM + sA.left && scrFinal.x < vw - sideM - sA.right && scrFinal.y > topM && scrFinal.y < vh - botM;
    var label, ang, px, py, mode, placedEdge = "";
    if (near || onScreen) {
      mode = near ? "here" : "on-target";
      el.classList.add("on-target");
      px = scrFinal.x;
      py = Math.max(topM, scrFinal.y - 10);
      ang = Math.PI / 2;
      label = near ? fmt(A.take || "Take the {exit}", { exit: exitName }) : (fmt(A.here || "Here", {}) + " · " + exitName);
    } else {
      mode = "edge";
      el.classList.remove("on-target");
      var host = document.getElementById("hud") || document.getElementById("ui") || document.body;
      var hr = host.getBoundingClientRect();
      var org = { left: hr.left, top: hr.top };
      var placed = placeOnEdge(vw / 2, vh / 2, scrHint.x, scrHint.y, vw, vh, org);
      px = placed.x; py = placed.y; ang = placed.ang; placedEdge = placed.edge;
      var tiles = Math.max(1, Math.round(dist));
      label = exitName + " · " + fmt(A.tiles || "{n} tiles", { n: tiles });
    }
    if (lab) lab.textContent = label;
    if (ptr) ptr.style.transform = "rotate(" + ang + "rad)";
    el.classList.remove("hidden");
    var edge = (mode === "edge" && placedEdge) ? placedEdge : "";
    if (edge) el.setAttribute("data-edge", edge);
    else el.removeAttribute("data-edge");
    var shift = "translate(-50%,-50%)";
    if (mode === "here" || mode === "on-target") shift = "translate(-50%,-100%)";
    else if (edge === "left") shift = "translate(0,-50%)";
    else if (edge === "right") shift = "translate(-100%,-50%)";
    else if (edge === "top") shift = "translate(-50%,0)";
    else if (edge === "bottom") shift = "translate(-50%,-100%)";
    el.style.left = px + "px";
    el.style.top = py + "px";
    el.style.transform = shift;
    // The label is wider than the pointer: if the real box still lands on a HUD control
    // (e.g. Gear/dock in the bottom band on a phone), slide it off along the edge.
    if (mode === "edge") {
      var hb = hudBoxes(), g;
      for (g = 0; g < 8; g++) {
        var r = el.getBoundingClientRect(), hit = null, k;
        for (k = 0; k < hb.length; k++) {
          var b = hb[k];
          if (r.right > b.left + 2 && r.left < b.right - 2 && r.bottom > b.top + 2 && r.top < b.bottom - 2) { hit = b; break; }
        }
        if (!hit) break;
        if (edge === "left" || edge === "right") {
          py += (r.top + r.bottom) / 2 <= (hit.top + hit.bottom) / 2 ? -(r.bottom - hit.top + 4) : (hit.bottom - r.top + 4);
          py = Math.max(r.height / 2 + 4, Math.min(vh - r.height / 2 - 4, py));
          el.style.top = py + "px";
        } else {
          px += (r.left + r.right) / 2 <= (hit.left + hit.right) / 2 ? -(r.right - hit.left + 4) : (hit.right - r.left + 4);
          px = Math.max(r.width / 2 + 4, Math.min(vw - r.width / 2 - 4, px));
          el.style.left = px + "px";
        }
      }
      // v84i: a top/bottom edge label is centred on the pointer, so near a corner half of it could hang off the screen
      // (seen as "Way Down · 79 tiles" cut at the right edge). Keep the whole box inside the safe area.
      var si = (root.ABSafeArea && ABSafeArea.insets && ABSafeArea.insets()) || { left: 0, right: 0, top: 0, bottom: 0 };
      var rb = el.getBoundingClientRect(), lo = (si.left || 0) + 4, hi = vw - (si.right || 0) - 4;
      if (rb.width && rb.right > hi) { px -= rb.right - hi; el.style.left = px + "px"; }
      else if (rb.width && rb.left < lo) { px += lo - rb.left; el.style.left = px + "px"; }
      var tp = (si.top || 0) + 4, bt = vh - (si.bottom || 0) - 4;
      if (rb.height && rb.bottom > bt) { py -= rb.bottom - bt; el.style.top = py + "px"; }
      else if (rb.height && rb.top < tp) { py += tp - rb.top; el.style.top = py + "px"; }
    }
    lastDebug = {
      mode: mode, label: label, target: { x: a.x, y: a.y, name: a.name, kind: a.kind },
      hint: { x: route.hint.x, y: route.hint.y }, pathLen: +((route.pathLen || 0).toFixed(2)),
      euclid: +((route.euclid || 0).toFixed(2)), pathTiles: route.path ? route.path.length : 0,
      arrow: { x: px, y: py, ang: ang, edge: edge }, onScreen: onScreen, near: near, dist: dist,
      pointer: { kind: ptrCfg().kind, length: ptrCfg().length, width: ptrCfg().width }
    };
  }

  function glow(ctx, world, project, tile) {
    if (!ctx || !project) return;
    var o = state();
    if (!o || !o.player || (o.ui && o.ui.panel)) return;
    var a = target(null);
    // target() needs the current quest; index.html passes it when hooked, but
    // we also accept a stashed last target from placeArrow / a live lookup.
    if (typeof arguments[4] === "object" && arguments[4] && arguments[4].x != null) a = arguments[4];
    else {
      // When called as glow(ctx,world,project,tile) the hook should pass the target as 5th arg.
    }
    if (!a) return;
    var P = project(a.x, a.y);
    var t = (o.time || 0), k = 0.5 + 0.5 * Math.sin(t * 3.2);
    var r = tile * (1.15 + 0.22 * k);
    ctx.save();
    ctx.translate(P.x, P.y);
    // Ground ring, squashed in iso.
    ctx.save();
    ctx.scale(1, (root.ISO && root.ISO.on) ? 0.55 : 0.6);
    var G = ctx.createRadialGradient(0, 0, r * 0.12, 0, 0, r);
    G.addColorStop(0, "rgba(255,210,110," + (0.42 + 0.25 * k) + ")");
    G.addColorStop(0.55, "rgba(255,150,40," + (0.2 + 0.14 * k) + ")");
    G.addColorStop(1, "rgba(255,120,30,0)");
    ctx.fillStyle = G;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.6, tile * 0.07);
    ctx.strokeStyle = "rgba(255,220,150," + (0.6 + 0.35 * k) + ")";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Vertical beacon shaft so the target reads as a place, not a floor stain.
    var h = tile * (2.4 + 0.5 * k);
    var shaft = ctx.createLinearGradient(0, 0, 0, -h);
    shaft.addColorStop(0, "rgba(255,200,90," + (0.55 + 0.2 * k) + ")");
    shaft.addColorStop(0.55, "rgba(255,170,60," + (0.22 + 0.12 * k) + ")");
    shaft.addColorStop(1, "rgba(255,180,80,0)");
    ctx.fillStyle = shaft;
    ctx.beginPath();
    ctx.moveTo(-tile * 0.18, 0);
    ctx.lineTo(tile * 0.18, 0);
    ctx.lineTo(tile * 0.05, -h);
    ctx.lineTo(-tile * 0.05, -h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,230,160," + (0.55 + 0.35 * k) + ")";
    ctx.beginPath();
    ctx.ellipse(0, -h, tile * 0.16, tile * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawMinimap(ctx, world, map) {
    if (!ctx || !world || !map) return;
    var a = lastDebug && lastDebug.target;
    if (!a && state()) a = target(null);
    if (!a) return;
    var ox = map.ox || 0, oy = map.oy || 0, tw = map.tw || 1, th = map.th || 1;
    var x = (a.x - ox) * tw, y = (a.y - oy) * th;
    var mm = cfg().minimap || {};
    var sz = mm.size || 8;
    var t = (state() && state().time) || 0;
    var pulse = 0.75 + 0.25 * Math.sin(t * 4);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.moveTo(0, -sz);
    ctx.lineTo(sz * 0.65, 0);
    ctx.lineTo(0, sz);
    ctx.lineTo(-sz * 0.65, 0);
    ctx.closePath();
    ctx.fillStyle = mm.fill || "#ffe08a";
    ctx.strokeStyle = mm.stroke || "#3a1408";
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  var lastDebug = { mode: "init" };
  function debug() { return lastDebug; }

  root.ABQuestUi = {
    cfg: cfg,
    line: line,
    target: target,
    placeArrow: placeArrow,
    glow: glow,
    drawMinimap: drawMinimap,
    interact: interact,
    pathInfo: pathInfo,
    forwardExit: forwardExit,
    debug: debug
  };
})(self);
