/* Zone travel (zones branch, v84i): Diablo 2 style doors, waypoints and town portals.
   The main game closure hands its internals in with ABZones.attach({...}) right after window.ASHBOUND is built.
   Settings and every player-facing word are in data/zones.json (ASHBOUND_DATA.zonesCfg).
   Doors: entry door (kind "entry") by a field zone's spawn -> previous zone (you arrive by its far arch);
   far arch / town gate -> next zone only; boss arena: entry back + forward arch sealed until the boss falls. */
(function (root) {
  "use strict";
  var A = null, pendingArrive = null;
  function D() { return root.ASHBOUND_DATA || {}; }
  function cfg() { return D().zonesCfg || {}; }
  function T(k, vars) {
    var s = (cfg().text || {})[k] || k;
    return String(s).replace(/\{(\w+)\}/g, function (_, n) { return vars && vars[n] != null ? vars[n] : ""; });
  }
  function S() { return A && A.state(); }
  function list() { return (A && A.zones) || D().zones || []; }
  function zone(id) { return list().find(function (z) { return z.id === id; }) || null; }
  function zname(id) { var z = zone(id); return z ? z.name : String(id || ""); }
  function actTown(act) { var z = list().find(function (q) { return q.kind === "town" && q.act === act; }); return z ? z.id : "hearthveil"; }

  // previous zone: the zone that unlocks this one, else the act's town (first field zone of an act)
  function prevOf(id) {
    var z = zone(id); if (!z || z.kind === "town") return null;
    var p = list().find(function (q) { return q.unlocks === id; });
    return p ? p.id : actTown(z.act);
  }
  // next zone: field -> unlocks; town -> first non-town zone of the act; boss -> next act's town (last act -> its own town)
  function nextOf(id) {
    var z = zone(id); if (!z) return null;
    if (z.kind === "town") {
      var L = list(), i = L.indexOf(z);
      for (var j = i + 1; j < L.length; j++) if (L[j].act === z.act && L[j].kind !== "town") return L[j].id;
      return null;
    }
    if (z.kind === "boss") {
      var t = list().find(function (q) { return q.kind === "town" && q.act === z.act + 1; });
      return t ? t.id : actTown(z.act);
    }
    return z.unlocks || null;
  }
  function aliveBoss(w) { return (w && w.monsters || []).find(function (m) { return m.boss && !m.dead; }) || null; }
  function walk(w, x, y) { return A.nearest(w, x, y); }

  // ---- world decoration (idempotent; runs on every zone build or save load) ----
  function hasUid(w, uid) { return (w.props || []).some(function (p) { return p.uid === uid; }); }
  function decorate(w) {
    if (!w || !w.props) return;
    var z = zone(w.id);
    if (w.kind === "rift" || !z) return;
    if (z.kind !== "boss") addWaypoint(w, z);
    if (z.kind === "town") syncTownPortal(w);
    if (z.kind === "wild" || z.kind === "dungeon") {
      var pv = prevOf(z.id);
      if (pv && !hasUid(w, "zentry") && w.spawn) {
        var off = cfg().entryOffset || [-1.4, 1.2], q = walk(w, w.spawn.x + off[0], w.spawn.y + off[1]);
        w.props.push({ uid: "zentry", kind: "entry", to: pv, name: zname(pv), x: q.x, y: q.y });
      }
    } else if (z.kind === "boss") {
      var ret = w.props.find(function (p) { return p.uid === "return" && p.kind === "exit"; });
      if (ret) { ret.kind = "entry"; ret.uid = "zentry"; ret.town = false; ret.to = prevOf(z.id); ret.name = zname(ret.to); }
      if (!hasUid(w, "zfwd")) {
        var nx = nextOf(z.id), f = walk(w, w.w / 2, 3.4);
        w.props.push({ uid: "zfwd", kind: "exit", bossGate: true, to: nx, name: zname(nx), x: f.x, y: f.y });
      }
    }
  }
  function arrive(w, side) {
    var st = S(), pl = st.player; if (!pl || !w) return;
    if (side && typeof side === "object") {
      var qa = walk(w, side.x, side.y); pl.x = qa.x; pl.y = qa.y;
      // spawnspread: back through a town portal, the landing spot is kept clear (data/spawns.json portalSafe)
      if (side.portal && window.ABSpawns) { var sc = (window.ASHBOUND_DATA || {}).spawns; if (sc && sc.enabled !== false) ABSpawns.clearAround(w, pl.x, pl.y, sc.portalSafe || 4.5, function (x, y) { return A.solid(w, x, y); }); }
      return;
    }
    if (side === "tp") {
      var tpp = (w.props || []).find(function (p) { return p.uid === "ztp"; });
      if (tpp) { var q1 = walk(w, tpp.x - .9, tpp.y + 1.1); pl.x = q1.x; pl.y = q1.y; spawnSafe(w, true); }
      return;
    }
    if (side === "wp") {
      var wp = (w.props || []).find(function (p) { return p.uid === "zwp"; });
      if (wp) { var q0 = walk(w, wp.x + .2, wp.y + 1.3); pl.x = q0.x; pl.y = q0.y; spawnSafe(w, false); }
      return;
    }
    if (side !== "back") return;
    var tgt = (w.props || []).find(function (p) { return p.kind === "gate" || (p.kind === "exit" && !p.town); }) || w.exit;
    if (!tgt || !w.spawn) return;
    var dx = w.spawn.x - tgt.x, dy = w.spawn.y - tgt.y, d = Math.hypot(dx, dy) || 1, k = cfg().arriveBackStep || 1.6;
    var q = walk(w, tgt.x + dx / d * k, tgt.y + dy / d * k);
    pl.x = q.x; pl.y = q.y;
  }
  function spawnSafe(w, portal) { // spawnspread: no fight on arrival at the entry, waypoint or a town portal
    if (window.ABSpawns && w) ABSpawns.safeProps(w, function (x, y) { return A.solid(w, x, y); }, portal);
  }
  function onWorld(w, fresh) {
    decorate(w);
    if (fresh) spawnSafe(w, false);
    var z = w && zone(w.id);
    if (z && z.kind === "town" && S().player && typeof pcfg().scrolls === "number") S().player.tpScrolls = Math.max(S().player.tpScrolls || 0, pcfg().scrolls);
    if (z && z.kind === "town" && isWpZone(z.id) && S().player) { ensure(S().player); if (!found(z.id)) discover(z.id, true); }
    if (pendingArrive) { arrive(w, pendingArrive); pendingArrive = null; }
  }


  // ---- waypoints ----
  function wcfg() { return cfg().waypoints || {}; }
  function isWpZone(id) {
    var W = wcfg(); if ((W.towns || []).indexOf(id) >= 0) return true;
    var Z = W.zones || {}; for (var k in Z) if ((Z[k] || []).indexOf(id) >= 0) return true; return false;
  }
  function wpZones() { return list().filter(function (z) { return isWpZone(z.id); }); }
  // fill-missing: a hero with no waypoint record gets every waypoint zone (and town) they have already reached
  function ensure(pl) {
    if (!pl || !pl.progress) return null;
    var pr = pl.progress;
    if (!pr.wps || typeof pr.wps !== "object") {
      pr.wps = {};
      var reached = pr.waypoints || {};
      for (var k in reached) if (reached[k] && isWpZone(k)) pr.wps[k] = true;
      pr.wps.hearthveil = true;
    }
    return pr.wps;
  }
  function migrateSave(dto) { if (dto && dto.player) ensure(dto.player); return dto; }
  function clearOf(w, x, y, r) {
    if (A.solid(w, x, y)) return false;
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) if (A.solid(w, x + dx * .6, y + dy * .6)) return false;
    return !(w.props || []).some(function (p) { return p.kind !== "fence" && Math.hypot(p.x - x, p.y - y) < r; });
  }
  function townSpot(w) {
    var o = (wcfg().townSpot || {})[w.id]; if (o) return walk(w, o[0], o[1]);
    var sp = w.spawn || { x: w.w / 2, y: w.h / 2 }, best = null;
    for (var r = 2.4; r <= 6 && !best; r += .6) for (var a = 0; a < 16 && !best; a++) {
      var ang = -Math.PI / 2 + Math.PI * 2 * a / 16, x = sp.x + Math.cos(ang) * r * 1.2, y = sp.y + Math.sin(ang) * r;
      if (x > 1.5 && y > 1.5 && x < w.w - 1.5 && y < w.h - 1.5 && clearOf(w, x, y, 1.6)) best = { x: x, y: y };
    }
    return best || walk(w, sp.x + 2.4, sp.y);
  }
  function fieldSpot(w) {
    var a = w.roadSpine, k = wcfg().alongRoad || 6.5;
    if (a && a.length) {
      var s = 0, pv = a[0];
      for (var i = 0; i < a.length; i++) { s += Math.hypot(a[i].x - pv.x, a[i].y - pv.y); pv = a[i]; if (s >= k) break; }
      var c = [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4], [0, 0]];
      for (var j = 0; j < c.length; j++) if (clearOf(w, pv.x + c[j][0], pv.y + c[j][1], 1.2)) return { x: pv.x + c[j][0], y: pv.y + c[j][1] };
    }
    var sp = w.spawn; return walk(w, sp.x + 2.6, sp.y - 2.6);
  }
  function addWaypoint(w, z) {
    if (!isWpZone(z.id) || hasUid(w, "zwp")) return;
    var q = z.kind === "town" ? townSpot(w) : fieldSpot(w);
    w.props.push({ uid: "zwp", kind: "waypoint", zone: z.id, name: z.name, x: q.x, y: q.y, radius: .3 });
  }
  function found(id) { var st = S(); var m = ensure(st && st.player); return !!(m && m[id]); }
  function discover(id, quiet) {
    var st = S(), m = ensure(st.player); if (!m || m[id]) return false;
    m[id] = true; if (!quiet) { A.toast(T("wpFound", { zone: zname(id) }), "good"); A.sfx("shrine"); }
    A.save(); A.refresh(); return true;
  }
  function tick(dt) {
    var st = S(); if (!A || !st || st.mode !== "play" || !st.world || !st.player) return;
    portalTick();
    var w = st.world, wp = (w.props || []).find(function (p) { return p.uid === "zwp"; });
    if (wp && !found(wp.zone) && Math.hypot(st.player.x - wp.x, st.player.y - wp.y) < (wcfg().discoverRadius || 2.2)) discover(wp.zone);
  }
  function panelHtml() {
    var st = S(), pl = st.player, m = ensure(pl) || {}, here = st.world && st.world.id, E = A.esc;
    var diff = (pl.progress && pl.progress.difficulty) || "normal", out = [];
    out.push('<div class="abz-wp-panel">');
    out.push('<p class="small muted abz-intro">' + E(T("wpIntro")) + '</p>');
    out.push('<div class="row abz-diff"><span class="small muted">' + E(T("difficulty")) + '</span>' + (A.difficulties || []).map(function (d) {
      return '<button class="btn slim le-btn ' + (diff === d.id ? "primary" : "") + '" data-act="difficulty" data-tier="' + E(d.id) + '">' + E(d.name) + '</button>';
    }).join("") + '</div>');
    var acts = {}; wpZones().forEach(function (z) { (acts[z.act] = acts[z.act] || []).push(z); });
    Object.keys(acts).sort().forEach(function (n) {
      var zs = acts[n].filter(function (z) { return m[z.id]; });
      if (!zs.length) return;
      out.push('<h3 class="abz-act">' + E(T("act", { n: n })) + '</h3><div class="abz-wp-grid">');
      zs.forEach(function (z) {
        var h = z.id === here;
        out.push('<button class="btn le-btn abz-wp' + (h ? " primary is-here" : "") + '" data-act="travel" data-zone="' + E(z.id) + '"' + (h ? " disabled" : "") + '>' +
          '<span class="abz-ico' + (z.kind === "town" ? " town" : "") + '"></span><span class="abz-name">' + E(z.name) + '</span>' +
          '<span class="abz-tag">' + E(h ? T("wpHere") : T("wpGo")) + '</span></button>');
      });
      out.push('</div>');
    });
    out.push('</div>');
    return out.join("");
  }
  function wpTravel(id) {
    var st = S();
    if (!zone(id)) return { toast: T("wpShut"), kind: "bad" };
    if (!found(id)) return { toast: T("wpShut"), kind: "bad" };
    if (st.world && st.world.id === id) return { toast: T("wpAlready") };
    go(id, "wp");
    return { touch: false };
  }


  // ---- town portal ----
  function pcfg() { return cfg().townPortal || {}; }
  function zact(w) { var z = w && zone(w.id); return (z && z.act) || (w && w.act) || 1; }
  function ensureScrolls(pl) { var n = pcfg().scrolls; if (typeof n === "number" && typeof pl.tpScrolls !== "number") pl.tpScrolls = n; }
  function castPortal() {
    var st = S(), w = st.world, pl = st.player, c = pcfg();
    if (!w || !pl) return { save: false };
    if (w.kind === "town") return { toast: T("tpTown") };
    if (w.kind === "rift" || !zone(w.id)) return { toast: T("tpRift"), kind: "bad" };
    if (c.cooldown && pl.tpReadyAt && st.time < pl.tpReadyAt) return { toast: T("tpCooldown"), kind: "bad" };
    ensureScrolls(pl);
    if (typeof c.scrolls === "number" && pl.tpScrolls <= 0) return { toast: T("tpNoScroll"), kind: "bad" };
    A.closePanel();
    var t = Math.max(.05, +c.castTime || .9);
    pl.channel = { name: T("tpCast"), t: t, max: t, kind: "tportal", keepOnHit: !c.interruptOnHit, x0: pl.x, y0: pl.y };
    w.props = w.props.filter(function (p) { return p.uid !== "ztpc"; });
    var off0 = c.fieldOffset || [1.2, -.6], q0 = walk(w, pl.x + off0[0], pl.y + off0[1]);
    w.props.push({ uid: "ztpc", kind: "tportal", side: "cast", x: q0.x, y: q0.y, born: st.time, castT: t, radius: .1 });
    A.sfx("story");
    return { touch: false };
  }
  function portalDone() {
    var st = S(), w = st.world, pl = st.player, c = pcfg(); if (!w || !pl || w.kind === "town") return;
    if (typeof c.scrolls === "number") { ensureScrolls(pl); pl.tpScrolls = Math.max(0, pl.tpScrolls - 1); }
    if (c.cooldown) pl.tpReadyAt = st.time + c.cooldown;
    var pre = w.props.find(function (p) { return p.uid === "ztpc"; });
    w.props = w.props.filter(function (p) { return p.uid !== "ztp" && p.uid !== "ztpc"; });
    var off = c.fieldOffset || [1.2, -.6], q = pre ? { x: pre.x, y: pre.y } : walk(w, pl.x + off[0], pl.y + off[1]);
    var town = actTown(zact(w));
    w.props.push({ uid: "ztp", kind: "tportal", side: "field", town: town, x: q.x, y: q.y, born: st.time, radius: .3 });
    pl.tp = { zone: w.id, town: town, x: pl.x, y: pl.y };
    A.toast(T("tpOpened", { town: zname(town) }), "good"); A.sfx("shrine"); A.save(); A.refresh();
  }
  function portalTick() {
    var st = S(), ch = st.player && st.player.channel;
    if (ch && ch.kind === "tportal" && pcfg().cancelOnMove && Math.hypot(st.player.x - ch.x0, st.player.y - ch.y0) > .35) st.player.channel = null;
    // a cancelled cast leaves no half-open portal
    if ((!st.player.channel || st.player.channel.kind !== "tportal") && st.world.props.some(function (p) { return p.uid === "ztpc"; }))
      st.world.props = st.world.props.filter(function (p) { return p.uid !== "ztpc"; });
  }
  function townPortalSpot(w) {
    var o = (pcfg().townSpot || {})[w.id]; if (o) return walk(w, o[0], o[1]);
    var sp = w.spawn || { x: w.w / 2, y: w.h / 2 }, off = pcfg().townOffset || [1.6, .4];
    var c0 = { x: sp.x + off[0], y: sp.y + off[1] };
    if (clearOf(w, c0.x, c0.y, 1.3)) return c0;
    for (var r = 1.8; r <= 6; r += .6) for (var a = 0; a < 16; a++) {
      var ang = Math.PI * 2 * a / 16, x = sp.x + Math.cos(ang) * r * 1.2, y = sp.y + Math.sin(ang) * r;
      if (x > 1.5 && y > 1.5 && x < w.w - 1.5 && y < w.h - 1.5 && clearOf(w, x, y, 1.3)) return { x: x, y: y };
    }
    return walk(w, c0.x, c0.y);
  }
  function syncTownPortal(w) {
    var pl = S().player; if (!w || w.kind !== "town" || !pl) return;
    var want = pl.tp && pl.tp.town === w.id, has = (w.props || []).find(function (p) { return p.uid === "ztp"; });
    if (!want && has) w.props = w.props.filter(function (p) { return p.uid !== "ztp"; });
    if (want && !has) { var q = townPortalSpot(w); w.props.push({ uid: "ztp", kind: "tportal", side: "town", zone: pl.tp.zone, x: q.x, y: q.y, born: S().time, radius: .3 }); }
    if (want && has) has.zone = pl.tp.zone;
  }
  function enterPortal(e) {
    var st = S(), pl = st.player, w = st.world;
    if (e.side === "field") {
      if (!pl.tp || pl.tp.zone !== w.id) pl.tp = { zone: w.id, town: e.town || actTown(zact(w)), x: e.x, y: e.y };
      pl.tp.x = pl.x; pl.tp.y = pl.y;
      var keep = w.props; w.props = keep.filter(function (p) { return p.uid !== "ztp"; });
      try { pl.tp.snap = root.ABSave && root.ABSave.snapshotWorld ? JSON.parse(JSON.stringify(root.ABSave.snapshotWorld(w))) : null; } catch (er) { pl.tp.snap = null; }
      w.props = keep;
      A.closePanel(); return go(pl.tp.town, "tp");
    }
    // town side: back to the same spot; both portals close
    var tp = pl.tp; if (!tp || !zone(tp.zone)) { pl.tp = null; syncTownPortal(w); A.toast(T("tpGone")); return true; }
    pl.tp = null; A.closePanel();
    pl.x = tp.x; pl.y = tp.y;
    pendingArrive = { x: tp.x, y: tp.y, portal: true };
    A.goSnap(tp.zone, tp.snap || null);
    return true;
  }


  // ---- visuals: baked stone pad from data/props3d.json + live glow drawn here every frame ----
  function vfxOn() { var st = S(); return !(st && st.settings && st.settings.particles === "off"); }
  function groundGlow(e, x, y, rx, ry, col, a) {
    var g = e.createRadialGradient(x, y, 0, x, y, rx);
    g.addColorStop(0, "rgba(" + col + "," + a + ")"); g.addColorStop(.6, "rgba(" + col + "," + (a * .45) + ")"); g.addColorStop(1, "rgba(" + col + ",0)");
    e.save(); e.translate(x, y); e.scale(1, ry / rx); e.translate(-x, -y); e.fillStyle = g; e.beginPath(); e.arc(x, y, rx, 0, Math.PI * 2); e.fill(); e.restore();
  }
  function drawWaypoint(e, b, P, s, cam, t, dpr) {
    var p = cam.p || .6, hz = (cam.hs || 1) * (cam.cp || 1) * s, on = found(b.zone), town = (zone(b.zone) || {}).kind === "town";
    var col = town ? "255,196,110" : "120,200,255", fx = vfxOn();
    if (root.ABProps3D && ABProps3D.ready()) ABProps3D.prop(e, b, P, s, dpr, t, 1, cam);
    var cy = P.y - .17 * hz, rx = .54 * s, ry = rx * p;
    e.save(); e.globalCompositeOperation = "lighter";
    groundGlow(e, P.x, cy, rx * (on ? 1.5 : 1.05), ry * (on ? 1.5 : 1.05), col, on ? .5 + .12 * Math.sin(t * 2.4) : .16);
    // rune ring: 12 ticks turning slowly round the inset
    e.strokeStyle = "rgba(" + col + "," + (on ? .9 : .35) + ")"; e.lineWidth = Math.max(1.2, s * .035); e.lineCap = "round";
    var rot = on ? t * .6 : 0;
    for (var i = 0; i < 12; i++) {
      var a0 = rot + i / 12 * Math.PI * 2, a1 = a0 + .28;
      e.beginPath(); e.ellipse(P.x, cy, rx * .8, ry * .8, 0, a0, a1); e.stroke();
    }
    if (on) {
      e.beginPath(); e.ellipse(P.x, cy, rx * .45, ry * .45, 0, -rot * 1.6, -rot * 1.6 + Math.PI * 1.3); e.stroke();
      // soft light column + rising motes
      var H = 1.7 * hz, cw = rx * .7, gc = e.createLinearGradient(0, cy, 0, cy - H);
      gc.addColorStop(0, "rgba(" + col + ",.32)"); gc.addColorStop(1, "rgba(" + col + ",0)");
      e.fillStyle = gc; e.beginPath(); e.ellipse(P.x, cy, cw, cw * p, 0, 0, Math.PI); e.lineTo(P.x - cw * .55, cy - H); e.lineTo(P.x + cw * .55, cy - H); e.closePath(); e.fill();
      if (fx) for (var m = 0; m < 7; m++) {
        var ph = (t * .45 + m / 7) % 1, ang = m * 2.4 + t * .8, mx = P.x + Math.cos(ang) * rx * .5 * (1 - ph * .4), my = cy + Math.sin(ang) * ry * .5 - ph * H * .9;
        e.fillStyle = "rgba(" + col + "," + (.9 * (1 - ph)) + ")"; e.beginPath(); e.arc(mx, my, Math.max(1, s * .035), 0, Math.PI * 2); e.fill();
      }
    }
    e.restore();
    return true;
  }
  function drawPortal(e, b, P, s, cam, t) {
    var p = cam.p || .6, hz = (cam.hs || 1) * (cam.cp || 1) * s, st = S(), age = Math.max(0, (st.time || 0) - (b.born || 0));
    var k = b.born == null ? 1 : Math.min(1, age / .35), fx = vfxOn();
    if (b.side === "cast") k = Math.min(1, age / Math.max(.05, b.castT || .9)) * .55;
    var ease = 1 - Math.pow(1 - k, 3);
    var cx = P.x, cz = P.y - .95 * hz, rx = .42 * s * ease, ry = .82 * hz * (.3 + .7 * ease);
    e.save();
    // shadow + ground light
    var sg = e.createRadialGradient(cx, P.y, 0, cx, P.y, .7 * s); sg.addColorStop(0, "rgba(0,0,0,.35)"); sg.addColorStop(1, "rgba(0,0,0,0)");
    e.save(); e.translate(cx, P.y); e.scale(1, p); e.fillStyle = sg; e.beginPath(); e.arc(0, 0, .7 * s, 0, Math.PI * 2); e.fill(); e.restore();
    e.globalCompositeOperation = "lighter";
    groundGlow(e, cx, P.y, .95 * s * ease, .95 * s * p * ease, "90,170,255", .45 + .1 * Math.sin(t * 3));
    if (rx > 1) {
      // outer halo
      var hg = e.createRadialGradient(cx, cz, 0, cx, cz, ry * 1.45); hg.addColorStop(0, "rgba(120,190,255,.35)"); hg.addColorStop(1, "rgba(60,120,255,0)");
      e.fillStyle = hg; e.beginPath(); e.arc(cx, cz, ry * 1.45, 0, Math.PI * 2); e.fill();
      e.globalCompositeOperation = "source-over";
      // body
      e.save(); e.translate(cx, cz); e.scale(1, ry / rx);
      var bg = e.createRadialGradient(0, 0, 0, 0, 0, rx);
      bg.addColorStop(0, "rgba(236,250,255,.98)"); bg.addColorStop(.35, "rgba(140,210,255,.95)"); bg.addColorStop(.8, "rgba(40,90,210,.92)"); bg.addColorStop(1, "rgba(20,40,120,.85)");
      e.fillStyle = bg; e.beginPath(); e.arc(0, 0, rx, 0, Math.PI * 2); e.fill();
      // swirl arms
      e.globalCompositeOperation = "lighter"; e.lineCap = "round";
      for (var a = 0; a < 3; a++) {
        var base = t * 2.2 + a * Math.PI * 2 / 3;
        e.strokeStyle = "rgba(220,245,255," + (.55 - a * .08) + ")"; e.lineWidth = Math.max(1.2, rx * .09);
        e.beginPath();
        for (var q = 0; q <= 16; q++) { var u = q / 16, rr = rx * (.15 + .78 * u), an = base + u * 3.2; var X = Math.cos(an) * rr, Y = Math.sin(an) * rr; q ? e.lineTo(X, Y) : e.moveTo(X, Y); }
        e.stroke();
      }
      e.restore();
      // rim
      e.globalCompositeOperation = "lighter";
      e.strokeStyle = "rgba(190,235,255,.9)"; e.lineWidth = Math.max(1.5, s * .05);
      e.beginPath(); e.ellipse(cx, cz, rx, ry, 0, 0, Math.PI * 2); e.stroke();
      e.strokeStyle = "rgba(120,190,255,.45)"; e.lineWidth = Math.max(3, s * .12);
      e.beginPath(); e.ellipse(cx, cz, rx * 1.04, ry * 1.03, 0, 0, Math.PI * 2); e.stroke();
      // orbiting sparks
      if (fx) for (var m = 0; m < 9; m++) {
        var an2 = t * (1.4 + (m % 3) * .3) + m * .7, sx = cx + Math.cos(an2) * rx * 1.12, sy = cz + Math.sin(an2) * ry * 1.06;
        e.fillStyle = "rgba(210,240,255," + (.5 + .5 * Math.sin(t * 6 + m)) + ")"; e.beginPath(); e.arc(sx, sy, Math.max(1, s * .03), 0, Math.PI * 2); e.fill();
      }
    }
    e.restore();
    return true;
  }
  function draw(e, b, P, s, cam, t, dpr) {
    try {
      if (b.kind === "waypoint") return drawWaypoint(e, b, P, s, cam || {}, t || 0, dpr || 1);
      if (b.kind === "tportal") return drawPortal(e, b, P, s, cam || {}, t || 0);
    } catch (er) { return false; }
    return false;
  }

  // ---- doors ----
  function go(id, side) {
    if (!id || !zone(id)) return false;
    pendingArrive = side || null;
    A.go(id);
    return true;
  }
  function doorTarget(e) {
    var st = S(), w = st.world; if (!w) return null;
    if (w.kind === "rift" && e.kind === "exit") return { to: actTown(w.act || 4), side: "back", rift: true };
    if (e.kind === "entry") return { to: e.to || prevOf(w.id), side: "back" };
    if (e.kind === "gate") return { to: nextOf(w.id), side: "fwd" };
    if (e.kind === "exit" && e.bossGate) return { to: e.to || nextOf(w.id), side: "fwd", boss: true };
    if (e.kind === "exit" && !e.town) return { to: nextOf(w.id), side: "fwd" };
    return null;
  }
  function interact(e) {
    if (!A || !e) return false;
    if (e.kind === "waypoint") { discover(e.zone); A.openPanel("travel"); return true; }
    if (e.kind === "tportal") return e.side === "cast" ? true : enterPortal(e);
    var d = doorTarget(e); if (!d) return false;
    if (d.boss) {
      var b = aliveBoss(S().world);
      if (b) { A.toast(T("sealedToast", { boss: b.name }), "bad"); return true; }
    }
    if (!d.to) return false;
    A.closePanel();
    return go(d.to, d.side === "back" ? "back" : "fwd");
  }
  function label(e) {
    if (!A || !e) return "";
    if (e.kind === "waypoint") return T("wpUse");
    if (e.kind === "tportal" && e.side === "cast") return T("tpCast");
    if (e.kind === "tportal") { var pl = S().player; return e.side === "town" ? T("tpEnterTown", { zone: zname((pl.tp && pl.tp.zone) || e.zone) }) : T("tpEnterField", { town: zname(e.town) }); }
    var d = doorTarget(e); if (!d || !d.to) return "";
    if (d.boss) { var b = aliveBoss(S().world); if (b) return T("sealed", { boss: b.name }); return T("roadTo", { zone: zname(d.to) }); }
    if (d.rift) return T("riftOut", { zone: zname(d.to) });
    return T(d.side === "back" ? "backTo" : "goTo", { zone: zname(d.to) });
  }

  function css() {
    if (typeof document === "undefined" || document.getElementById("abz-css")) return;
    var st = document.createElement("style"); st.id = "abz-css";
    st.textContent = [
      "#panel:has(.abz-wp-panel) .panel-head h2{max-width:none !important;overflow:visible}",
      ".abz-wp-panel .abz-intro{margin:2px 0 6px}",
      ".abz-wp-panel .abz-diff{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:4px}",
      ".abz-wp-panel .abz-diff .btn{min-height:44px}",
      ".abz-wp-panel .abz-act{margin:8px 0 4px;font-family:var(--ua-title,serif);letter-spacing:.08em;color:#e6cfa6;font-size:13px;border-bottom:1px solid rgba(176,131,80,.35);padding-bottom:2px}",
      ".abz-wp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:6px}",
      ".abz-wp{display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 10px;text-align:left;justify-content:flex-start}",
      ".abz-wp .abz-name{flex:1 1 auto;font-size:13px;line-height:1.15}",
      ".abz-wp .abz-tag{font-size:10.5px;opacity:.75;text-transform:uppercase;letter-spacing:.06em}",
      ".abz-wp.is-here{opacity:.85}",
      ".abz-ico{flex:0 0 22px;width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 50% 50%,#e8fbff 0 18%,#7fd3ff 30%,rgba(60,140,220,.55) 52%,rgba(30,60,120,0) 70%);box-shadow:0 0 0 2px #6d5a44,0 0 8px rgba(120,200,255,.6)}",
      ".abz-ico.town{background:radial-gradient(circle at 50% 50%,#fff3d6 0 18%,#ffc86a 32%,rgba(230,130,40,.55) 54%,rgba(120,50,10,0) 72%);box-shadow:0 0 0 2px #6d5a44,0 0 8px rgba(255,190,100,.6)}"
    ].join("\n");
    document.head.appendChild(st);
  }
  function hudButton() {
    if (typeof document === "undefined") return;
    var b = document.getElementById("btn-portal"); if (!b) return;
    b.title = T("tpButton"); b.setAttribute("aria-label", T("tpButton"));
  }
  function attach(api) { A = api; css(); hudButton(); }
  root.ABZones = {
    attach: attach, onWorld: onWorld, interact: interact, label: label,
    prevOf: prevOf, nextOf: nextOf, text: T, cfg: cfg,
    tick: tick, draw: draw, castPortal: castPortal, portalDone: portalDone, ensure: ensure, migrateSave: migrateSave, panelHtml: panelHtml, wpTravel: wpTravel, discover: discover, found: found, isWpZone: isWpZone,
    _go: go
  };
})(typeof window !== "undefined" ? window : self);
