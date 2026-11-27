// spawnspread: spread monsters along each zone's walkable path in many small packs plus stragglers.
// Tuning lives in data/spawns.json (ASHBOUND_DATA.spawns). No secrets. index.html's pack builder (hn) asks
// ABSpawns.plan() for pack spots and sizes; a missing file or enabled:false keeps the old placement.
(function () {
  "use strict";
  function C() { var D = window.ASHBOUND_DATA || {}; return D.spawns || null; }
  function lerp(a, b, f) { return a + (b - a) * f; }
  function frac(id) {
    var zs = ((window.ASHBOUND_DATA || {}).campaignIntro || {}).zones || [], i = zs.indexOf(id);
    if (i < 0 || zs.length < 2) return 0;
    return i / (zs.length - 1);
  }
  function active(t) {
    var c = C();
    if (!c || c.enabled === false || !t || t.kind === "rift" || t.id === "rift") return null;
    if ((c.kinds || ["wild", "dungeon"]).indexOf(t.kind) < 0) return null;
    var z = (c.zones || {})[t.id];
    if (z && z.enabled === false) return null;
    return Object.assign({}, c, (c.byKind || {})[t.kind] || {}, z || {});
  }
  function ri(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  // grid helpers: BFS distance from the entry and the shortest walkable path entry -> exit
  function grid(e, solid) {
    var W = e.w, H = e.h, N = W * H, sx = Math.floor(e.spawn.x), sy = Math.floor(e.spawn.y);
    var ex = Math.floor(e.exit.x), ey = Math.floor(e.exit.y), dist = new Int32Array(N).fill(-1), prev = new Int32Array(N).fill(-1);
    var ok = new Uint8Array(N);
    for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) ok[y * W + x] = solid(x + .5, y + .5) ? 0 : 1;
    ok[ey * W + ex] = 1; ok[sy * W + sx] = 1;
    var q = [sy * W + sx]; dist[q[0]] = 0;
    for (var h = 0; h < q.length; h++) {
      var c = q[h], cx = c % W, cy = (c / W) | 0, nb = [c + 1, c - 1, c + W, c - W];
      for (var k = 0; k < 4; k++) {
        var n = nb[k]; if (n < 0 || n >= N || dist[n] >= 0 || !ok[n]) continue;
        if ((k === 0 && cx >= W - 1) || (k === 1 && cx <= 0)) continue;
        dist[n] = dist[c] + 1; prev[n] = c; q.push(n);
      }
    }
    var path = [], p = ey * W + ex;
    if (dist[p] >= 0) { while (p >= 0) { path.push({ x: p % W + .5, y: ((p / W) | 0) + .5 }); p = prev[p]; } path.reverse(); }
    // wild zones: the road the player follows (roadSpine, tile by tile from the entry to the far arch) is the path
    var rs = e.roadSpine;
    if (rs && rs.length > 6) path = rs.map(function (q) { return { x: q.x, y: q.y }; });
    return { W: W, H: H, ok: ok, dist: dist, path: path, reach: q };
  }
  function wpGuess(e, t) {
    var Z = window.ABZones; if (!Z || !Z.isWpZone || !Z.isWpZone(t.id)) return null;
    var W = (Z.cfg && Z.cfg().waypoints) || {}, a = e.roadSpine, k = W.alongRoad || 6.5;
    if (a && a.length) { var s = 0, pv = a[0]; for (var i = 0; i < a.length; i++) { s += Math.hypot(a[i].x - pv.x, a[i].y - pv.y); pv = a[i]; if (s >= k) break; } return { x: pv.x, y: pv.y }; }
    return { x: e.spawn.x + 2.6, y: e.spawn.y - 2.6 };
  }
  function plan(e, t, rng, nPacks, o) {
    var c = active(t); if (!c || !e || !e.spawn || !e.exit) return null;
    var G = grid(e, o.solid); if (G.path.length < 6) return null;
    var f = frac(t.id), mul = typeof c.mobMul === "number" ? c.mobMul : lerp(c.mobMul.start, c.mobMul.end, f);
    var zps = t.packSize || [2, 4], psS = (c.packSize && c.packSize.start) || [2, 4], psE = (c.packSize && c.packSize.end) || psS;
    var ps0 = Math.max(1, Math.round(lerp(psS[0], psE[0], f))), ps1 = Math.min((zps[1] || 4) + 2, Math.round(lerp(psS[1], psE[1], f)));
    if (c.packSizeFixed) { ps0 = c.packSizeFixed[0]; ps1 = c.packSizeFixed[1]; }
    ps1 = Math.max(ps0, ps1);
    var baseMobs = nPacks * ((zps[0] || 2) + (zps[1] || 4)) / 2, target = Math.max(c.minMobs || 0, Math.round(baseMobs * mul));
    var nStr = Math.round(target * (c.stragglerShare || 0)), sizes = [], left = target;
    var ss = c.stragglerSize || [1, 1], strag = [];
    while (nStr > 0 && left > 0) { var s1 = Math.min(left, ri(rng, ss[0], ss[1])); strag.push(s1); left -= s1; nStr -= s1; }
    while (left > 0) { var s = ri(rng, ps0, ps1); if (left - s > 0 && left - s < ps0) s = left - s + s <= ps1 ? left : s; s = Math.min(s, left); sizes.push(s); left -= s; }
    var sp = e.spawn, safe = c.entrySafe || 8, safeIn = safe + 1.9, path = G.path;
    // circles kept clear: the entry, plus where the waypoint will stand (ABZones puts it alongRoad tiles up the road)
    var circles = [[sp.x, sp.y, safeIn]], wpAt = wpGuess(e, t);
    if (wpAt) circles.push([wpAt.x, wpAt.y, (c.propSafe || 9.5) + 1.2]);
    function inSafe(x, y) { for (var q = 0; q < circles.length; q++) if (Math.hypot(x - circles[q][0], y - circles[q][1]) < circles[q][2]) return true; return false; }
    // walkable arc starts once the path leaves the safe circles
    var s0 = 0; while (s0 < path.length - 1 && inSafe(path[s0].x, path[s0].y)) s0++;
    var arc = path.slice(s0); if (arc.length < 2) arc = path.slice(-2);
    var anchors = [], gap = c.minGap || 4.2, lat = c.lateral || 3.5;
    function free(x, y, g) {
      var tx = Math.floor(x), ty = Math.floor(y); if (tx < 1 || ty < 1 || tx >= G.W - 1 || ty >= G.H - 1) return false;
      var i = ty * G.W + tx; if (!G.ok[i] || G.dist[i] < 0) return false;
      if (inSafe(x, y)) return false;
      if (Math.abs(x - e.exit.x) < .8 && Math.abs(y - e.exit.y) < .8) return false;
      for (var k = 0; k < anchors.length; k++) if (Math.hypot(anchors[k].x - x, anchors[k].y - y) < g) return false;
      return true;
    }
    function nearPath(x, y) { var b = 1e9; for (var k = 0; k < path.length; k++) { var d = Math.hypot(path[k].x - x, path[k].y - y); if (d < b) b = d; } return b; }
    var nOff = sizes.length >= (c.offPathMinPacks || 6) ? Math.round(sizes.length * (c.offPathShare || 0)) : 0, nOn = sizes.length - nOff;
    // on-path packs: spaced along the arc by monster count (a big pack gets a longer stretch), small jitter,
    // nudged sideways up to `lateral`
    var placed = [], onMobs = 0, cum = 0;
    for (var k = 0; k < nOn; k++) onMobs += sizes[k];
    for (var i = 0; i < nOn; i++) {
      var slot = (cum + sizes[i] / 2) / Math.max(1, onMobs), jit = (rng() - .5) * .5 * sizes[i] / Math.max(1, onMobs); cum += sizes[i];
      var pos = Math.min(arc.length - 1, Math.max(0, Math.floor((slot + jit) * arc.length))), pt = arc[pos], got = null;
      for (var tr = 0; tr < 14 && !got; tr++) {
        var a = rng() * Math.PI * 2, r = tr === 13 ? 0 : rng() * lat, x = pt.x + Math.cos(a) * r, y = pt.y + Math.sin(a) * r;
        if (free(x, y, gap)) got = { x: x, y: y };
      }
      for (var sh = 1; sh < 8 && !got; sh++) for (var sg = -1; sg <= 1 && !got; sg += 2) {
        var q2 = arc[Math.min(arc.length - 1, Math.max(0, pos + sg * sh * 2))]; if (free(q2.x, q2.y, gap * .85)) got = { x: q2.x, y: q2.y };
      }
      if (got) { got.size = sizes[i]; anchors.push(got); placed.push(got); }
    }
    // off-path packs: side pockets, farthest from what is already placed
    var reach = G.reach;
    for (var j = 0; j < nOff; j++) {
      var best = null, bd = -1;
      for (var tt = 0; tt < 40; tt++) {
        var cell = reach[Math.floor(rng() * reach.length)], cx = cell % G.W + .5, cy = ((cell / G.W) | 0) + .5;
        if (nearPath(cx, cy) <= lat || !free(cx, cy, gap)) continue;
        var md = 99; for (var m = 0; m < anchors.length; m++) md = Math.min(md, Math.hypot(anchors[m].x - cx, anchors[m].y - cy));
        if (md > bd) { bd = md; best = { x: cx, y: cy }; }
      }
      if (!best) { // no side pocket: back on the path, farthest point
        for (var t2 = 0; t2 < 30; t2++) { var p3 = arc[Math.floor(rng() * arc.length)]; if (!free(p3.x, p3.y, gap)) continue;
          var md2 = 99; for (var m2 = 0; m2 < anchors.length; m2++) md2 = Math.min(md2, Math.hypot(anchors[m2].x - p3.x, anchors[m2].y - p3.y));
          if (md2 > bd) { bd = md2; best = { x: p3.x, y: p3.y }; } }
      }
      if (best) { best.size = sizes[nOn + j]; anchors.push(best); placed.push(best); }
    }
    // stragglers: in the gaps along the path
    for (var st = 0; st < strag.length; st++) {
      var bs = null, bsd = -1;
      for (var t3 = 0; t3 < 30; t3++) {
        var p4 = arc[Math.floor(rng() * arc.length)], a4 = rng() * Math.PI * 2, r4 = rng() * lat, x4 = p4.x + Math.cos(a4) * r4, y4 = p4.y + Math.sin(a4) * r4;
        if (!free(x4, y4, c.stragglerGap || 2.8)) continue;
        var md3 = 99; for (var m3 = 0; m3 < anchors.length; m3++) md3 = Math.min(md3, Math.hypot(anchors[m3].x - x4, anchors[m3].y - y4));
        if (md3 > bsd) { bsd = md3; bs = { x: x4, y: y4 }; }
      }
      if (bs) { bs.size = strag[st]; bs.solo = true; anchors.push(bs); placed.push(bs); }
    }
    placed.baseMobs = baseMobs; placed.target = target; placed.cfg = c; placed.path = path; placed.inSafe = inSafe;
    return placed;
  }
  // a spot for the zone's named monster: the far half of the path, off to the side
  function spot(e, rng, P) {
    if (!P || !P.path) return null; var path = P.path, sp = e.spawn, c = P.cfg, safeIn = (c.entrySafe || 8) + 1.9;
    for (var tr = 0; tr < 30; tr++) {
      var p = path[Math.floor(path.length * (.45 + rng() * .45))], a = rng() * Math.PI * 2, r = rng() * (c.lateral || 3.5);
      var x = Math.floor(p.x + Math.cos(a) * r) + .5, y = Math.floor(p.y + Math.sin(a) * r) + .5;
      if (Math.hypot(x - sp.x, y - sp.y) < safeIn || (P.inSafe && P.inSafe(x, y)) || P.solid && P.solid(x, y)) continue;
      return { x: x, y: y };
    }
    return { x: path[Math.floor(path.length * .7)].x, y: path[Math.floor(path.length * .7)].y };
  }
  // after placement: nothing inside the entry circle (walls can push a pack member back toward it),
  // and pack monsters' experience scaled so the zone's total stays near the old one
  function sweep(e, list, P, solid) {
    if (!P || !list) return list;
    var c = P.cfg, sp = e.spawn, safe = c.entrySafe || 8;
    for (var i = 0; i < list.length; i++) {
      var m = list[i]; if (m.boss) continue;
      if (Math.hypot(m.x - sp.x, m.y - sp.y) < safe) {
        var home = null;
        for (var k = 0; k < list.length && !home; k++) { var o = list[k]; if (o !== m && o.packId === m.packId && Math.hypot(o.x - sp.x, o.y - sp.y) >= safe) home = o; }
        if (!home) home = P.find(function (a) { return Math.hypot(a.x - sp.x, a.y - sp.y) >= safe; });
        if (home) { m.x = home.x + (Math.random() - .5) * .6; m.y = home.y + (Math.random() - .5) * .6; if (solid && solid(m.x, m.y)) { m.x = home.x; m.y = home.y; } }
      }
    }
    if (c.keepZoneXp !== false) {
      var pk = list.filter(function (m) { return m.packId && m.packId !== "named" && m.packId !== "mini" && !m.boss; });
      var ratio = pk.length ? Math.min(1, P.baseMobs / pk.length) : 1;
      for (var j = 0; j < pk.length; j++) pk[j].xp = Math.max(1, Math.round((pk[j].xp || 0) * ratio));
      e.spawnXpRatio = +ratio.toFixed(3);
    }
    e.spawnSpread = { target: P.target, base: P.baseMobs, packs: P.length };
    return list;
  }
  // keep a clear circle around a spot (entry door, waypoint, the town portal you came back through)
  function clearAround(w, x, y, r, solid, avoid) {
    if (!w || !w.monsters) return 0; var n = 0;
    for (var i = 0; i < w.monsters.length; i++) {
      var m = w.monsters[i]; if (m.dead || m.friendly || m.boss) continue;
      var dx = m.x - x, dy = m.y - y, d = Math.hypot(dx, dy); if (d >= r) continue;
      if (d < .05) { dx = 1; dy = -1; d = Math.SQRT2; }
      var moved = false;
      for (var k = r + 1; k <= r + 10 && !moved; k += .5) for (var a = 0; a < 12 && !moved; a++) {
        var ang = Math.atan2(dy, dx) + (a % 2 ? 1 : -1) * Math.ceil(a / 2) * .5, nx = x + Math.cos(ang) * k, ny = y + Math.sin(ang) * k;
        if (nx < 1 || ny < 1 || nx > w.w - 1 || ny > w.h - 1 || (solid && solid(nx, ny))) continue;
        if (w.spawn && Math.hypot(nx - w.spawn.x, ny - w.spawn.y) < r) continue;
        if (avoid && avoid.some(function (o) { return Math.hypot(nx - o[0], ny - o[1]) < o[2] + .6; })) continue;
        if (w.monsters.some(function (o) { return o !== m && !o.dead && Math.hypot(nx - o.x, ny - o.y) < .8; })) continue;
        m.x = nx; m.y = ny; m.state = "idle"; moved = true; n++;
      }
    }
    return n;
  }
  function safeProps(w, solid, withPortal) {
    var c = C(); if (!c || c.enabled === false || !w || w.kind === "town" || w.kind === "rift" || w.kind === "boss") return 0;
    var n = 0, spots = [];
    for (var i = 0; i < (w.props || []).length; i++) {
      var p = w.props[i];
      if (p.uid === "zentry" || p.uid === "zwp") spots.push([p.x, p.y, c.propSafe || 9.5]);
      else if (withPortal && p.uid === "ztp") spots.push([p.x, p.y, c.portalSafe || 9.5]);
    }
    // a monster pushed out of one circle can land in the next one: repeat until every circle is clear
    for (var pass = 0; pass < 4; pass++) {
      var moved = 0;
      for (var k = 0; k < spots.length; k++) moved += clearAround(w, spots[k][0], spots[k][1], spots[k][2], solid, spots);
      n += moved; if (!moved) break;
    }
    return n;
  }
  window.ABSpawns = { active: active, plan: plan, spot: spot, sweep: sweep, clearAround: clearAround, safeProps: safeProps, grid: grid };
})();
