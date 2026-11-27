/* zonegfx (r17): textured, lit, animated zones. Look and numbers live in data/zonegfx.json; art in assets/zonegfx/<set>/.
   Hooks in index.html (all guarded by window.ABZoneGfx):
     pre(d,ISO)              isoBuild, before the ground picture is sized: per-set ground resolution and smoothing
     bake(x,d,T,h,ISO)       isoBuild, after the tile pass: repaints the ground picture (splat, relief, water, decals, cast shadows)
     ground(e,d,s,g,t,a,n,I) isoGround, right after the floor is drawn: animated water, fine detail
     list(k,e,d,s,g,t,a,n,I) fo0, before the depth sort: foliage, lanterns, banners (decoration only, no hit boxes)
     post(e,d,s,g,t,a,n,I)   fo0, after the vignette: fireflies, dust, mist, fog depth, colour grade
     light(d)                abLight: darkness colour/strength, hero fill colour
   and in js/ab-props3d.js sprite(): sprite(e,name,P,s,n,h,alpha,time) swaps a set's painted trees/rocks/reeds in.
   Gameplay never reads any of this: tiles, walls, collision and props are untouched. ?zgfx=0 off, ?zgfx=low forces low. */
(function (root) {
  "use strict";
  var CFG = null, sets = {}, orig = null, W = null, ISOref = null, stats = { bakeMs: 0, groundMs: 0, listMs: 0, postMs: 0, foliage: 0, drawnFol: 0 };
  var Q = (function () { try { return new URLSearchParams(location.search).get("zgfx"); } catch (e) { return null; } })();
  fetch("data/zonegfx.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    CFG = j; if (!j || Q === "0" || j.enabled === false) return;
    var want = {}; Object.keys(j.zones || {}).forEach(function (z) { want[j.zones[z]] = 1; }); Object.keys(j.palettes || {}).forEach(function (p) { want[j.palettes[p]] = 1; });
    Object.keys(want).forEach(loadSet);
  }).catch(function () { CFG = null; });


  // ---------- time of day + weather (data: CFG.tod, CFG.weather; per-set overrides in sets.<id>.tod.presets) ----------
  // Presets are partial overrides of sets.<id>.live blocks (light, grade, fog, water, lanterns, motes, backdrop ...).
  // Numbers, [r,g,b] arrays and "#rrggbb" colours blend; anything else snaps to the heavier preset.
  // Mode: settings.tod = "real" (device clock, default) | "day" | "dusk" | "night" | "dawn"; test overrides ?tod=day, ?todh=18.5.
  var QS = (function () { try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return null; } }; } })();
  var TOD = { wts: null, last: 0, key: "", merged: {}, hour: 0 }, WX = { state: "clear", amount: 0, renderers: {} };
  function todMode() {
    var q = QS.get("tod"); if (q) return q;
    var s = root.ASHBOUND && root.ASHBOUND.state && root.ASHBOUND.state.settings; return (s && s.tod) || (CFG && CFG.tod && CFG.tod.mode) || "real";
  }
  function localHour() {
    var q = QS.get("todh"); if (q != null && q !== "") return +q;
    var dt = new Date(); return dt.getHours() + dt.getMinutes() / 60 + dt.getSeconds() / 3600;
  }
  function todTarget(TD) { // preset name -> weight, from the mode or the clock schedule
    var names = Object.keys(TD.presets || {}), w = {}; names.forEach(function (n) { w[n] = 0; });
    var m = todMode();
    if (m !== "real" && w[m] != null) { w[m] = 1; return w; }
    var h = TOD.hour = localHour(), K = TD.schedule || [[0, "night"], [24, "night"]];
    for (var i = 0; i < K.length - 1; i++) {
      if (h >= K[i][0] && h < K[i + 1][0]) {
        var f = (h - K[i][0]) / Math.max(1e-6, K[i + 1][0] - K[i][0]); f = f * f * (3 - 2 * f);
        if (w[K[i][1]] != null) w[K[i][1]] += 1 - f; if (w[K[i + 1][1]] != null) w[K[i + 1][1]] += f; return w;
      }
    }
    w[K[K.length - 1][1]] = 1; return w;
  }
  function hx(c) { return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)]; }
  function blendVals(vals, ws) { // vals: [v...] weights ws (sum 1)
    var v0 = vals[0];
    if (typeof v0 === "number") { var r = 0; for (var i = 0; i < vals.length; i++) r += (typeof vals[i] === "number" ? vals[i] : v0) * ws[i]; return r; }
    if (typeof v0 === "string" && /^#[0-9a-f]{6}$/i.test(v0)) {
      var c = [0, 0, 0]; for (var j = 0; j < vals.length; j++) { var h = hx(vals[j] || v0); c[0] += h[0] * ws[j]; c[1] += h[1] * ws[j]; c[2] += h[2] * ws[j]; }
      return "#" + c.map(function (x) { var t = Math.max(0, Math.min(255, Math.round(x))).toString(16); return t.length < 2 ? "0" + t : t; }).join("");
    }
    if (Array.isArray(v0) && typeof v0[0] === "number") return v0.map(function (_, k) { var r2 = 0; for (var i2 = 0; i2 < vals.length; i2++) r2 += ((vals[i2] || v0)[k]) * ws[i2]; return Math.round(r2 * 1000) / 1000; });
    var bi = 0; for (var b = 1; b < ws.length; b++) if (ws[b] > ws[bi]) bi = b; return vals[bi];
  }
  function todTick(st) { // eased weights (smooth when the setting changes) + merged live blocks, cached per ~frame
    if (!WX.init && CFG) { WX.init = 1; WX.state = (CFG.weather && CFG.weather.state) || "clear"; WX.amount = 1; }
    var TD = CFG && CFG.tod; if (!TD || TD.enabled === false) return null;
    var now = performance.now(); if (TOD.wts && now - TOD.last < 30 && TOD.st === st) return TOD;
    var tg = todTarget(TD), dt = TOD.last ? Math.min(1, (now - TOD.last) / 1000) : 1, k = TOD.wts ? 1 - Math.exp(-dt / (TD.ease || .6)) : 1;
    var w = TOD.wts || {}; Object.keys(tg).forEach(function (n) { w[n] = (w[n] || 0) + (tg[n] - (w[n] || 0)) * k; });
    TOD.wts = w; TOD.last = now;
    var key = Object.keys(w).map(function (n) { return n + (Math.round(w[n] * 200)); }).join(",") + "|" + st.id + "|" + WX.state + Math.round(WX.amount * 20);
    if (key === TOD.key && TOD.st === st) return TOD;
    TOD.key = key; TOD.st = st; TOD.merged = {};
    var PS = Object.assign({}, TD.presets || {}, (st.S.tod || {}).presets || {}), names = Object.keys(w).filter(function (n) { return w[n] > .002; });
    var sum = names.reduce(function (a, n) { return a + w[n]; }, 0) || 1, ws = names.map(function (n) { return w[n] / sum; });
    var blocks = {}; names.forEach(function (n) { Object.keys(PS[n] || {}).forEach(function (b) { blocks[b] = 1; }); });
    var WS = WX.state !== "clear" && CFG.weather && (CFG.weather.states || {})[WX.state];
    if (WS) Object.keys(WS.live || {}).forEach(function (b) { blocks[b] = 1; });
    Object.keys(blocks).forEach(function (b) {
      var base = (st.S.live || {})[b]; if (base == null && !(WS && WS.live && WS.live[b])) return;
      var out = Object.assign({}, base || {}), props = {};
      names.forEach(function (n) { Object.keys((PS[n] || {})[b] || {}).forEach(function (p) { props[p] = 1; }); });
      Object.keys(props).forEach(function (p) { out[p] = blendVals(names.map(function (n) { var o = (PS[n] || {})[b]; return o && o[p] !== undefined ? o[p] : (base || {})[p]; }), ws); });
      if (WS && WS.live && WS.live[b]) { var a = Math.max(0, Math.min(1, WX.amount)); Object.keys(WS.live[b]).forEach(function (p) { out[p] = blendVals([out[p] !== undefined ? out[p] : WS.live[b][p], WS.live[b][p]], [1 - a, a]); }); }
      TOD.merged[b] = out;
    });
    return TOD;
  }
  function todPreset() { // name of the heaviest preset now (for UI / shots)
    var w = TOD.wts || {}, best = null; Object.keys(w).forEach(function (n) { if (best == null || w[n] > w[best]) best = n; }); return best;
  }
  var TOD_MODES = ["real", "day", "dusk", "night"], TOD_LABEL = { real: "Real time", day: "Day", dusk: "Dusk", night: "Night", dawn: "Dawn" };
  function todButton(S) { var m = (S && S.tod) || "real"; return '<button class="btn" data-act="tod">Time of day: ' + (TOD_LABEL[m] || m) + "</button>"; }
  function todCycle(S) { var m = (S && S.tod) || "real", i = TOD_MODES.indexOf(m); S.tod = TOD_MODES[(i + 1) % TOD_MODES.length]; return "Time of day: " + TOD_LABEL[S.tod] + (S.tod === "real" ? " (follows your clock)." : "."); }
  // weather: state hook only (renderers come later). setWeather("rain", .7) blends CFG.weather.states.rain.live overrides in;
  // registerWeather(name, {update(dt, amount), draw(e, view)}) plugs a renderer that post() will call (none shipped yet).
  function setWeather(state, amount) { WX.state = state || "clear"; WX.amount = amount == null ? 1 : amount; TOD.key = ""; }
  function registerWeather(name, r) { WX.renderers[name] = r; }

  // ---------- art loading ----------
  function loadSet(id) {
    var S = (CFG.sets || {})[id]; if (!S || sets[id]) return;
    var names = {}, dir = "assets/zonegfx/" + id + "/";
    Object.keys((S.import || {}).textures || {}).forEach(function (n) { names[n] = n + ".webp"; });
    Object.keys((S.import || {}).sprites || {}).forEach(function (n) { names[n] = n + ".webp"; });
    Object.keys((S.import || {}).strips || {}).forEach(function (n) { names[n] = n + ".webp"; });
    var G = S.gen || {}; Object.keys(G.textures || {}).forEach(function (n) { names[n] = n + ".webp"; });
    Object.keys(G.decals || {}).forEach(function (n) { names[n] = n + ".png"; });
    var st = sets[id] = { id: id, S: S, img: {}, ready: false, left: 0 };
    Object.keys(names).forEach(function (n) {
      st.left++; var im = new Image(); im.decoding = "async";
      im.onload = function () { st.img[n] = im; done(); }; im.onerror = function () { done(); };
      im.src = dir + names[n];
    });
    function done() { if (--st.left <= 0) { st.ready = true; var I = ISOref; if (I && I.gw && setOf(I.gw) === st) I.gw = null; } }
  }
  function lowFx() {
    if (Q === "low") return true; if (root.ASHBOUND_CONFIG && root.ASHBOUND_CONFIG.LOW_FX) return true;
    var s = root.ASHBOUND && root.ASHBOUND.state && root.ASHBOUND.state.settings; return !!(s && (s.gfx === "low"));
  }
  function setOf(d) {
    if (!CFG || Q === "0" || CFG.enabled === false || !d || d.kind === "town" || d.kind === "rift") return null;
    var id = (CFG.zones || {})[d.id] || (CFG.palettes || {})[d.palette]; var st = id && sets[id];
    return st && st.ready ? st : null;
  }
  function P(st, k) { var L = lowFx() && CFG.low || {}; return L[k] !== undefined ? L[k] : undefined; }
  function live(st, k) { var lo = P(st, k); if (lo === false) return null; var T0 = todTick(st), v = T0 && T0.merged[k] || (st.S.live || {})[k]; return v; }

  // ---------- small helpers ----------
  function hash(i, j, s) { var n = Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 144067); n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; }
  function mk(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; }
  function rgb(h) { h = String(h || "#000"); return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgba(h, a) { var c = rgb(h); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  var NG = null;
  function noiseGrid() { if (NG) return NG; NG = new Float32Array(64 * 64); for (var k = 0; k < NG.length; k++) NG[k] = hash(k & 63, k >> 6, 911); return NG; }
  function vnoise(x, y) { // tileable value noise, period 64
    var G = noiseGrid(), xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = G[(yi & 63) * 64 + (xi & 63)], b = G[(yi & 63) * 64 + ((xi + 1) & 63)], c = G[((yi + 1) & 63) * 64 + (xi & 63)], dd = G[((yi + 1) & 63) * 64 + ((xi + 1) & 63)];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + dd) * fx * fy;
  }
  function fbm(x, y) { return vnoise(x, y) * .55 + vnoise(x * 2.1 + 17, y * 2.1 + 5) * .3 + vnoise(x * 4.3 + 3, y * 4.3 + 31) * .15; }
  var STAMP = {}, STAMPN = 0;
  // pre-scaled sprite cache: big painted sprites are drawn from a copy near their on-screen device size (6% buckets);
  // downscaling a 512px source every frame was the main per-frame cost on weak GPUs
  var FIT = new Map(), DSC = 3;
  function fit(im, hgt) {
    var Hd = hgt * DSC; if (Hd >= im.height * .8) return im;
    var b = Math.ceil(Math.log(Hd) / Math.log(1.06)), Hq = Math.min(im.height, Math.ceil(Math.pow(1.06, b))), key = b;
    var m = FIT.get(im); if (!m) { m = {}; FIT.set(im, m); } if (m[key]) return m[key];
    var Wq = Math.max(1, Math.round(Hq * im.width / im.height)), c = mk(Wq, Hq), x = c.getContext("2d");
    // two-step downscale for quality
    var src = im; if (im.height > Hq * 2.2) { var h2 = Hq * 2, c2 = mk(Math.round(h2 * im.width / im.height), h2); var x2 = c2.getContext("2d"); x2.imageSmoothingQuality = "high"; x2.drawImage(im, 0, 0, c2.width, c2.height); src = c2; }
    x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, Wq, Hq); return m[key] = c;
  }
  function stamp(col) { // soft radial blob, cached by colour
    if (STAMP[col]) return STAMP[col]; if (++STAMPN > 400) { STAMP = {}; STAMPN = 0; } var c = mk(64, 64), x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32), k = rgb(col);
    g.addColorStop(0, "rgba(" + k + ",1)"); g.addColorStop(.45, "rgba(" + k + ",.55)"); g.addColorStop(1, "rgba(" + k + ",0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return STAMP[col] = c;
  }

  // ---------- per-zone layout (deterministic from the zone seed) ----------
  var T_ = { FLOOR: 0, WALL: 1, TREE: 2, ROCK: 3, LAVA: 4, EXIT: 5, PATH: 6, BUILDING: 7 };
  function tileAt(d, i, j) { return i < 0 || j < 0 || i >= d.w || j >= d.h ? 1 : d.tiles[j * d.w + i]; }
  function distGrid(d, pred, maxD) { // chebyshev-ish BFS distance to tiles matching pred
    var N = d.w * d.h, D = new Float32Array(N).fill(99), q = [];
    for (var k = 0; k < N; k++) if (pred(d.tiles[k], k)) { D[k] = 0; q.push(k); }
    for (var h = 0; h < q.length; h++) {
      var k2 = q[h], i = k2 % d.w, j = k2 / d.w | 0, nv = D[k2] + 1; if (nv > maxD) continue;
      for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) { var ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= d.w || jj >= d.h) continue; var kk = jj * d.w + ii; if (D[kk] > nv) { D[kk] = nv; q.push(kk); } }
    }
    return D;
  }
  function layout(d, st) {
    var B = st.S.bake || {}, R = B.rules || {}, mats = B.materials || [], mi = {}, N = d.w * d.h, seed = (d.seed || 1) + 77;
    mats.forEach(function (m, k) { mi[m] = k; });
    var waterIs = R.waterTile === undefined ? T_.LAVA : R.waterTile;
    var dW = distGrid(d, function (t) { return t === waterIs; }, 4);
    var dTree = distGrid(d, function (t) { return t === T_.TREE; }, 3);
    var mat = new Int8Array(N);
    for (var j = 0; j < d.h; j++) for (var i = 0; i < d.w; i++) {
      var k = j * d.w + i, t = d.tiles[k], m;
      if (t === waterIs) m = R.water;
      else if (t === T_.WALL) m = R.wall;
      else if (t === T_.ROCK) m = R.rock;
      else if (t === T_.TREE) m = R.tree;
      else if (t === T_.EXIT) m = R.exit;
      else if (t === T_.PATH) m = R.path;
      else if (d.road && d.road[k] === T_.FLOOR) m = R.road;
      else if (dW[k] <= (R.bankDist || 1)) m = R.bank;
      else { var fl = R.floor || [mats[0]]; m = fl[fbm(i * .23 + 3, j * .23 + 9) > (R.floorSplit || .5) ? 1 : 0] || fl[0]; }
      mat[k] = mi[m] != null ? mi[m] : 0;
    }
    // decoration spots: keep clear of doors, waypoints and interactables so nothing important is hidden
    var keep = [], LV = st.S.live || {}, FO = LV.foliage || {};
    (d.props || []).forEach(function (p) { if (p && p.x != null && p.kind !== "npc") keep.push([p.x, p.y, p.kind === "exit" || p.kind === "entry" || p.kind === "waypoint" ? (FO.keepDoor || 2.2) : 1.2]); });
    if (d.spawn) keep.push([d.spawn.x, d.spawn.y, 2.2]);
    // v84m2 paths read at a glance: no plants/reeds on (or within margin of) road tiles, fewer next to them (data: live.foliage.path)
    var PA = FO.path || null, road = d.road, pathCut = 0, nearCut = 0, nearAll = 0;
    function thin(x, y, salt) { if (!PA || PA.nearMul == null || !roadAdj(Math.floor(x), Math.floor(y), PA.nearDist || 1)) return false; nearAll++; if (nearRoadPt(x, y, PA.margin || .3)) { pathCut++; return true; } if (hash(x * 13 | 0, y * 13 | 0, salt) > PA.nearMul) { nearCut++; return true; } return false; }
    function isR(i, j) { return !!road && i >= 0 && j >= 0 && i < d.w && j < d.h && road[j * d.w + i] === T_.FLOOR; }
    function nearRoadPt(x, y, mg) { if (!PA || !road) return false; var i0 = Math.floor(x), j0 = Math.floor(y); for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) { var ii = i0 + di, jj = j0 + dj; if (!isR(ii, jj)) continue; var dx = Math.max(ii - x, 0, x - (ii + 1)), dy = Math.max(jj - y, 0, y - (jj + 1)); if (Math.hypot(dx, dy) < mg) return true; } return false; }
    function roadAdj(i, j, r) { if (!PA || !road) return false; for (var dj = -r; dj <= r; dj++) for (var di = -r; di <= r; di++) if (isR(i + di, j + dj)) return true; return false; }
    function clear(x, y, extra) { for (var q = 0; q < keep.length; q++) { var K = keep[q]; if (Math.hypot(K[0] - x, K[1] - y) < K[2] + (extra || 0)) return false; } return true; }
    var fringe = [], fol = [], maxF = P(st, "foliageMax") || FO.max || 120, sprites = FO.sprites || [];
    for (var j2 = 1; j2 < d.h - 1 && sprites.length; j2++) for (var i2 = 1; i2 < d.w - 1; i2++) {
      var k3 = j2 * d.w + i2, t3 = d.tiles[k3]; if (t3 !== T_.FLOOR) continue;
      if (FO.keepOffPath && d.road && d.road[k3] === T_.FLOOR) continue;
      var ch = dW[k3] <= 1 ? FO.nearWater : dTree[k3] <= 1 ? FO.nearTree : FO.open, adj = roadAdj(i2, j2, (PA && PA.nearDist) || 1);
      for (var r = 0; r < 2; r++) {
        var hh = hash(i2 * 3 + r, j2, seed); if (hh > (ch || 0)) continue;
        if (adj) nearAll++;
        if (adj && PA.nearMul != null && hh > (ch || 0) * PA.nearMul) { nearCut++; continue; }
        var x = i2 + .15 + hash(i2, j2 * 5 + r, seed + 1) * .7, y = j2 + .15 + hash(i2 * 7 + r, j2, seed + 2) * .7;
        if (!clear(x, y)) continue;
        if (PA && nearRoadPt(x, y, PA.margin || .3)) { pathCut++; continue; }
        var nm = sprites[Math.floor(hash(i2, j2 + r * 13, seed + 3) * sprites.length) % sprites.length];
        nm = dW[k3] <= 1 ? (hash(i2, j2, seed + 9) < .75 ? sprites[0] : sprites[sprites.length - 1]) : (hash(i2, j2, seed + 9) < .3 ? sprites[0] : sprites[sprites.length - 1]);
        var sc = FO.scale || [1, 1]; fol.push({ x: x, y: y, n: nm, s: sc[0] + (sc[1] - sc[0]) * hash(i2 + r, j2, seed + 4), f: hash(i2, j2, seed + 5) < .5, ph: hash(i2, j2, seed + 6) * 6.28 });
      }
    }
    // wall fringe: thickets (and the odd tree) along the foot of every wall that faces open ground, so the border reads as marsh, not a plinth
    var FR = FO.fringe;
    if (FR) for (var j6 = 0; j6 < d.h; j6++) for (var i6 = 0; i6 < d.w; i6++) {
      if (tileAt(d, i6, j6) !== T_.WALL) continue;
      if (FR.top && (tileAt(d, i6 + 1, j6) !== T_.WALL || tileAt(d, i6, j6 + 1) !== T_.WALL || tileAt(d, i6 - 1, j6) !== T_.WALL || tileAt(d, i6, j6 - 1) !== T_.WALL) && hash(i6, j6, seed + 51) < FR.top) {
        var tx_ = i6 + .25 + hash(i6, j6, seed + 52) * .5, ty_ = j6 + .25 + hash(i6, j6, seed + 53) * .5, tr = hash(i6, j6, seed + 54) < (FR.topTrees || 0) * (P(st, "fringeTrees") != null ? P(st, "fringeTrees") : 1);
        var ar = tr ? FR.trees : FR.sprites; if (!thin(tx_, ty_, 61)) fringe.push({ x: tx_, y: ty_, n: ar[Math.floor(hash(i6, j6, seed + 55) * ar.length) % ar.length], s: 1 + hash(i6, j6, seed + 56) * .4, f: hash(i6, j6, seed + 57) < .5, ph: hash(i6, j6, seed + 58) * 6.28, tree: tr, lift: 1 });
      }
      [[0, 1], [1, 0], [0, -1], [-1, 0]].forEach(function (o, q) {
        var ni = i6 + o[0], nj = j6 + o[1], tt = tileAt(d, ni, nj); if (tt === T_.WALL || ni < 0 || nj < 0 || ni >= d.w || nj >= d.h) return;
        var along = hash(i6 * 5 + q, j6, seed + 41), ins = FR.inset || .12;
        var x = (o[0] ? (o[0] > 0 ? ni + ins : ni + 1 - ins) : i6 + .15 + along * .7), y = (o[1] ? (o[1] > 0 ? nj + ins : nj + 1 - ins) : j6 + .15 + along * .7);
        if (!clear(x, y, -.6)) return; if (thin(x, y, 62)) return;
        var tree = hash(i6, j6 * 3 + q, seed + 43) < (FR.treeChance || 0) * (P(st, "fringeTrees") != null ? P(st, "fringeTrees") : 1), arr = tree ? FR.trees : FR.sprites, nm2 = arr[Math.floor(hash(i6 + q, j6, seed + 44) * arr.length) % arr.length];
        var sc2 = FR.scale || [1, 1]; fringe.push({ x: x, y: y, n: nm2, s: sc2[0] + (sc2[1] - sc2[0]) * hash(i6, j6 + q, seed + 45), f: hash(i6 + q, j6, seed + 46) < .5, ph: hash(i6, j6 + q, seed + 47) * 6.28, tree: tree });
      });
    }
    if (fol.length > maxF) { fol.sort(function (a, b) { return hash(a.x * 9 | 0, a.y * 9 | 0, 5) - hash(b.x * 9 | 0, b.y * 9 | 0, 5); }); fol.length = maxF; }
    // lanterns and banners: along the road, spaced out
    var lam = [], ban = [], LA = LV.lanterns || {}, BA = LV.banners || {}, cand = [];
    for (var k4 = 0; k4 < N; k4++) {
      var i4 = k4 % d.w, j4 = k4 / d.w | 0; if (d.tiles[k4] !== T_.FLOOR || (d.road && d.road[k4] === T_.FLOOR)) continue;
      var nearRoad = false; for (var dj = -1; dj <= 1 && !nearRoad; dj++) for (var di = -1; di <= 1; di++) { var kk = (j4 + dj) * d.w + i4 + di; if (d.road && d.road[kk] === T_.FLOOR) { nearRoad = true; break; } }
      if (LA.nearPath && !nearRoad && d.road) continue;
      cand.push([i4 + .5, j4 + .5, hash(i4, j4, seed + 21)]);
    }
    cand.sort(function (a, b) { return a[2] - b[2]; });
    function spaced(L, x, y, g) { for (var q = 0; q < L.length; q++) if (Math.hypot(L[q].x - x, L[q].y - y) < g) return false; return true; }
    if (d.spawn && LA.count) { // one lantern by the arrival point so the first view has a light
      var best = null, bd = 1e9; cand.forEach(function (c) { var dd = Math.hypot(c[0] - d.spawn.x, c[1] - d.spawn.y); if (dd > 1.8 && dd < 4 && clear(c[0], c[1], -.4) && dd < bd) { bd = dd; best = c; } });
      if (best) lam.push({ x: best[0], y: best[1], ph: best[2] * 6.28 });
    }
    cand.forEach(function (c) { if (lam.length < (LA.count || 0) && clear(c[0], c[1], -.4) && spaced(lam, c[0], c[1], LA.minGap || 6)) lam.push({ x: c[0], y: c[1], ph: c[2] * 6.28 }); });
    if (P(st, "banners") !== false) cand.slice().reverse().forEach(function (c) { if (ban.length < (BA.count || 0) && clear(c[0], c[1], -.2) && spaced(lam, c[0], c[1], 3) && spaced(ban, c[0], c[1], 8)) ban.push({ x: c[0], y: c[1], ph: c[2] * 6.28 }); });
    // water glints
    var gl = [], WA = LV.water || {};
    for (var k5 = 0; k5 < N && gl.length < (WA.glints || 0) * 4; k5++) if (d.tiles[k5] === waterIs && hash(k5, 3, seed + 31) < .5) gl.push({ x: k5 % d.w + hash(k5, 1, seed) , y: (k5 / d.w | 0) + hash(k5, 2, seed), ph: hash(k5, 4, seed) * 6.28 });
    var fM = P(st, "fringeMax"); if (fM != null && fringe.length > fM) { fringe.sort(function (a, b) { return hash(a.x * 9 | 0, a.y * 9 | 0, 7) - hash(b.x * 9 | 0, b.y * 9 | 0, 7); }); fringe.length = fM; }
    fol = fringe.concat(fol);
    var onRoad = PA ? fol.filter(function (f) { return !f.tree && nearRoadPt(f.x, f.y, (PA.margin || .3) - .01); }).length : 0;
    return { mat: mat, mi: mi, dW: dW, fol: fol, lam: lam, ban: ban, gl: gl, waterIs: waterIs, path: PA ? { cut: pathCut, nearCut: nearCut, nearAll: nearAll, onRoad: onRoad, isR: isR, roadAdj: roadAdj } : null };
  }

  // ---------- pre / bake ----------
  function pre(d, ISO) {
    ISOref = ISO;
    if (!orig) orig = { texel: ISO.texel, tilt: ISO.tiltTexel, smooth: ISO.smooth };
    var st = setOf(d);
    if (!st) { ISO.texel = orig.texel; ISO.tiltTexel = orig.tilt; ISO.smooth = orig.smooth; return; }
    var B = st.S.bake || {};
    ISO.texel = P(st, "texel") || B.texel || orig.texel; ISO.tiltTexel = P(st, "tiltTexel") || B.tiltTexel || orig.tilt; ISO.smooth = B.smooth !== false;
  }
  // old renderer liquid colours per palette (data: liquid.<palette>): mere water is black-teal, not lava
  var BLOW = null;
  function liquid(pal) { var q = CFG && Q !== "0" && CFG.liquid && CFG.liquid[pal]; return q && q.base ? q : null; }
  function bake(x, d, T, h, ISO) {
    BLOW = lowFx();
    var LQ = d && liquid(d.palette); if (LQ && LQ.glow === false && ISO.anim) { var A0 = ISO.anim, k0 = []; for (var q0 = 0; q0 < A0.length; q0 += 3) if (A0[q0 + 2] !== T_.LAVA) k0.push(A0[q0], A0[q0 + 1], A0[q0 + 2]); ISO.anim = k0; }
    var st = setOf(d); W = null; if (!st) return;
    var t0 = performance.now(), PH = {}, tp = t0, ph = function (k) { var t = performance.now(); PH[k] = +(t - tp).toFixed(1); tp = t; }, B = st.S.bake || {}, L = layout(d, st); ph('layout'); var img = st.img, mats = B.materials || [];
    W = { d: d, st: st, L: L, T: T };
    var PA2 = ((st.S.live || {}).foliage || {}).path, propCut = 0, propNear = 0;
    if (PA2 && PA2.props !== false && L.path && ISO.props) ISO.props = ISO.props.filter(function (q) {
      if (q.tall && (PA2.propKinds || []).indexOf(q.w) < 0) return true; // trees/rocks stand on their own (solid) tiles: kept
      var on = L.path.isR(q.i, q.j), nr = on || L.path.roadAdj(q.i, q.j, PA2.nearDist || 1); if (!nr) return true; propNear++;
      if (on || hash(q.i, q.j, 77) > (PA2.nearMul != null ? PA2.nearMul : 1)) { propCut++; return false; }
      return true;
    });
    var CW = d.w * T, CH = d.h * T, MR = 16, MW = d.w * MR, MH = d.h * MR;
    // 1) material weight masks at MR px/tile: warped bilinear tile weights, height-blended, sharpened
    var NM = mats.length, masks = [], datas = [];
    for (var m = 0; m < NM; m++) { var c = mk(MW, MH); masks.push(c); datas.push(c.getContext("2d").createImageData(MW, MH)); }
    var hgt = B.height || {}, hv = mats.map(function (n) { return hgt[n] || 0; }), warp = B.warp || .35, blend = B.blend || .3, mac = B.macro || .15;
    var Hf = new Float32Array(MW * MH), wts = new Float32Array(NM), sc = new Float32Array(NM), mat = L.mat;
    for (var py = 0; py < MH; py++) for (var px = 0; px < MW; px++) {
      var u = (px + .5) / MR, v = (py + .5) / MR;
      var wu = u + (fbm(u * .9, v * .9) - .5) * warp * 2, wv = v + (fbm(u * .9 + 40, v * .9 + 40) - .5) * warp * 2;
      var fx = wu - .5, fy = wv - .5, i0 = Math.floor(fx), j0 = Math.floor(fy), ax = fx - i0, ay = fy - j0;
      for (var q = 0; q < NM; q++) wts[q] = 0;
      var cw = [(1 - ax) * (1 - ay), ax * (1 - ay), (1 - ax) * ay, ax * ay], ci = [i0, i0 + 1, i0, i0 + 1], cj = [j0, j0, j0 + 1, j0 + 1];
      for (var z = 0; z < 4; z++) { var ii = Math.max(0, Math.min(d.w - 1, ci[z])), jj = Math.max(0, Math.min(d.h - 1, cj[z])); wts[mat[jj * d.w + ii]] += cw[z]; }
      var best = -9;
      for (var q2 = 0; q2 < NM; q2++) { var s2 = wts[q2] > 0 ? wts[q2] + (vnoise(u * 3.1 + q2 * 7, v * 3.1 + q2 * 3) - .5) * blend : -9; sc[q2] = s2; if (s2 > best) best = s2; }
      var sum = 0, bw = .18;
      for (var q3 = 0; q3 < NM; q3++) { var w = Math.max(0, sc[q3] - (best - bw)) / bw; sc[q3] = w; sum += w; }
      var o4 = (py * MW + px) * 4, H = (fbm(u * .5 + 11, v * .5 + 7) - .5) * mac * 2;
      for (var q4 = 0; q4 < NM; q4++) { var a = sum > 0 ? sc[q4] / sum : 0; datas[q4].data[o4 + 3] = a * 255 | 0; H += a * hv[q4]; }
      Hf[py * MW + px] = H;
    }
    ph('masks');
    for (var m2 = 0; m2 < NM; m2++) masks[m2].getContext("2d").putImageData(datas[m2], 0, 0);
    // 2) splat textures through the masks
    var tmp = mk(CW, CH), tx = tmp.getContext("2d"), tps = B.texTiles || 4;
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.imageSmoothingEnabled = true; x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
    x.fillStyle = "#101816"; x.fillRect(0, 0, CW, CH);
    // bbox (px) of each material's tiles +1 tile margin: splat only there; the most common material fills everything unmasked
    var cnt = new Array(NM).fill(0), BB = mats.map(function () { return [1e9, 1e9, -1, -1]; });
    for (var jb = 0; jb < d.h; jb++) for (var ib = 0; ib < d.w; ib++) { var mb = mat[jb * d.w + ib], bb = BB[mb]; cnt[mb]++; if (ib < bb[0]) bb[0] = ib; if (jb < bb[1]) bb[1] = jb; if (ib > bb[2]) bb[2] = ib; if (jb > bb[3]) bb[3] = jb; }
    BB = BB.map(function (b) { return b[2] < 0 ? null : [Math.max(0, b[0] - 1) * T, Math.max(0, b[1] - 1) * T, (Math.min(d.w - 1, b[2] + 1) - Math.max(0, b[0] - 1) + 1) * T, (Math.min(d.h - 1, b[3] + 1) - Math.max(0, b[1] - 1) + 1) * T]; });
    var baseM = cnt.indexOf(Math.max.apply(null, cnt));
    for (var m3 = 0; m3 < NM; m3++) {
      var im = img[mats[m3]], R3 = BB[m3]; if (!im || !R3) continue;
      var pat = x.createPattern(im, "repeat"), k = T * tps / im.width, ox = hash(m3, 1, 5) * im.width, oy = hash(m3, 2, 5) * im.height;
      if (pat.setTransform) pat.setTransform(new DOMMatrix([k, 0, 0, k, ox * k, oy * k]));
      if (m3 === baseM) { x.fillStyle = pat; x.fillRect(0, 0, CW, CH); continue; }
      tx.globalCompositeOperation = "source-over"; tx.clearRect(R3[0], R3[1], R3[2], R3[3]);
      tx.fillStyle = pat; tx.fillRect(R3[0], R3[1], R3[2], R3[3]);
      var TN = (B.tone || {})[mats[m3]]; // v84m2: per-material tone (data: bake.tone), e.g. a lighter, higher-contrast path
      if (TN) { if (TN.contrast) { tx.globalCompositeOperation = "overlay"; tx.globalAlpha = TN.contrast; tx.fillRect(R3[0], R3[1], R3[2], R3[3]); }
        if (TN.lift) { tx.globalCompositeOperation = "screen"; tx.globalAlpha = TN.liftAlpha || .12; tx.fillStyle = TN.lift; tx.fillRect(R3[0], R3[1], R3[2], R3[3]); } tx.globalAlpha = 1; }
      tx.globalCompositeOperation = "destination-in"; tx.imageSmoothingEnabled = true; tx.drawImage(masks[m3], R3[0] / T * MR, R3[1] / T * MR, R3[2] / T * MR, R3[3] / T * MR, R3[0], R3[1], R3[2], R3[3]);
      x.drawImage(tmp, R3[0], R3[1], R3[2], R3[3], R3[0], R3[1], R3[2], R3[3]);
    }
    ph('splat');
    // 3) relief light from the height field (key light upper-left on screen) + hollow darkening, as an overlay
    var sh = mk(MW, MH), sx = sh.getContext("2d"), sd = sx.createImageData(MW, MH), ld = B.lightDir || [-1, -1], rel = (B.relief || .5) * MR;
    for (var y2 = 0; y2 < MH; y2++) for (var x2 = 0; x2 < MW; x2++) {
      var kx = y2 * MW + x2, hx = Hf[y2 * MW + Math.min(MW - 1, x2 + 1)] - Hf[y2 * MW + Math.max(0, x2 - 1)], hy = Hf[Math.min(MH - 1, y2 + 1) * MW + x2] - Hf[Math.max(0, y2 - 1) * MW + x2];
      var lv = 128 + (-(hx * ld[0] + hy * ld[1])) * rel * 60 + Hf[kx] * 70; lv = lv < 0 ? 0 : lv > 255 ? 255 : lv;
      sd.data[kx * 4] = sd.data[kx * 4 + 1] = sd.data[kx * 4 + 2] = lv; sd.data[kx * 4 + 3] = 255;
    }
    sx.putImageData(sd, 0, 0);
    x.globalCompositeOperation = "overlay"; x.globalAlpha = B.reliefAlpha || .85; x.drawImage(sh, 0, 0, CW, CH); x.globalAlpha = 1;
    ph('relief');
    // 4) water: deepen toward the middle, black glass with a pale teal shore line
    var WA = B.water || {}, wm = masks[L.mi[(B.rules || {}).water]];
    var WB = BB[L.mi[(B.rules || {}).water]];
    if (wm && WB) {
      var X0 = Math.max(0, WB[0] - T), Y0 = Math.max(0, WB[1] - T), XW = Math.min(CW - X0, WB[2] + 2 * T), YH = Math.min(CH - Y0, WB[3] + 2 * T);
      var cp = function (c) { c.save(); c.beginPath(); c.rect(X0, Y0, XW, YH); c.clip(); };
      cp(x); cp(tx);
      tx.globalCompositeOperation = "source-over"; tx.clearRect(0, 0, CW, CH);
      // inner (deep) mask: shrink by blurring-down-and-up trick: draw mask small then large, then threshold by alpha via multiply twice
      tx.drawImage(wm, 0, 0, CW, CH); tx.globalCompositeOperation = "source-in"; tx.fillStyle = WA.deep || "#06171a"; tx.fillRect(0, 0, CW, CH);
      x.globalCompositeOperation = "source-over"; x.globalAlpha = WA.depth || .62; x.drawImage(tmp, 0, 0);
      x.globalAlpha = 1;
      // shore glint: mask edge = mask minus a slightly offset copy, drawn light
      tx.globalCompositeOperation = "source-over"; tx.clearRect(0, 0, CW, CH); tx.drawImage(wm, 0, 0, CW, CH);
      tx.globalCompositeOperation = "destination-out"; tx.drawImage(wm, -T * .07, -T * .07, CW, CH);
      tx.globalCompositeOperation = "source-in"; tx.fillStyle = WA.shore || "#86b8ae"; tx.fillRect(0, 0, CW, CH);
      x.globalCompositeOperation = "screen"; x.globalAlpha = WA.shoreAlpha || .25; x.drawImage(tmp, 0, 0); x.globalAlpha = 1;
      x.globalCompositeOperation = "source-over";
      // wet dark band just outside the water
      tx.globalCompositeOperation = "source-over"; tx.clearRect(0, 0, CW, CH);
      for (var e1 = 0; e1 < 2; e1++) { var oo = T * .2 * (e1 + 1); tx.globalAlpha = .45; tx.drawImage(wm, -oo, 0, CW, CH); tx.drawImage(wm, oo, 0, CW, CH); tx.drawImage(wm, 0, -oo, CW, CH); tx.drawImage(wm, 0, oo, CW, CH); }
      tx.globalAlpha = 1; tx.globalCompositeOperation = "source-in"; tx.fillStyle = "#000"; tx.fillRect(0, 0, CW, CH);
      x.globalCompositeOperation = "source-over"; x.globalAlpha = WA.edgeWet || .3; x.drawImage(tmp, 0, 0); x.globalAlpha = 1;
      x.restore(); tx.restore();
    }
    ph('water');
    // 5) decals
    var D = B.decals || [], seed = (d.seed || 1) + 301;
    for (var j3 = 0; j3 < d.h; j3++) for (var i3 = 0; i3 < d.w; i3++) {
      var mt = mats[L.mat[j3 * d.w + i3]];
      for (var r = 0; r < D.length; r++) {
        var de = D[r], di = img[de.img]; if (!di || de.on.indexOf(mt) < 0) continue;
        if (de.nearTree && !(tileAt(d, i3, j3) === T_.TREE)) continue;
        if (hash(i3 * 13 + r, j3, seed) > de.chance) continue;
        var s3 = de.scale ? de.scale[0] + (de.scale[1] - de.scale[0]) * hash(i3, j3 + r, seed + 1) : 1, sz = T * s3, rot = hash(i3 + r, j3, seed + 2) * 6.28;
        x.save(); x.translate((i3 + .2 + hash(i3, j3 * 3 + r, seed + 3) * .6) * T, (j3 + .2 + hash(i3 * 5 + r, j3, seed + 4) * .6) * T); x.rotate(rot);
        x.globalAlpha = de.alpha || 1; var ar = di.height / di.width; x.drawImage(di, -sz / 2, -sz * ar / 2, sz, sz * ar); x.restore();
      }
    }
    ph('decals');
    // 6) cast shadows (lower-right on screen = +x in the world), contact AO
    var SH = B.shadows || {}, dir = SH.dir || [1, .15], blob = stamp("#000000");
    function cast(cx, cy, len, wid, al) {
      x.save(); x.translate(cx * T, cy * T); x.rotate(Math.atan2(dir[1], dir[0])); x.globalAlpha = al;
      x.drawImage(blob, -wid * .5 * T, -wid * .5 * T, (len + wid) * T, wid * T); x.globalAlpha = al * 1.2; x.drawImage(blob, -wid * .45 * T, -wid * .45 * T, wid * .9 * T, wid * .9 * T); x.restore();
    }
    for (var j4 = 0; j4 < d.h; j4++) for (var i4 = 0; i4 < d.w; i4++) {
      var t4 = tileAt(d, i4, j4);
      if (t4 === T_.TREE && SH.tree) cast(i4 + .5, j4 + .5, SH.tree[0], SH.tree[1], SH.tree[2]);
      else if (t4 === T_.ROCK && SH.rock) cast(i4 + .5, j4 + .5, SH.rock[0], SH.rock[1], SH.rock[2]);
    }
    L.fol.forEach(function (f) { if (f.tree) cast(f.x, f.y, 1.0 * f.s, .6 * f.s, .42); else cast(f.x, f.y, .35 * f.s, .35 * f.s, .22); });
    L.lam.forEach(function (f) { cast(f.x, f.y, .9, .18, .3); });
    var PR = (st.S.live || {}).props || {};
    (d.props || []).forEach(function (b) { var df = PR[b.kind === "entry" ? "exit" : b.kind]; if (df && df.shadow) cast(b.x, b.y, df.shadow[0], df.shadow[1], df.shadow[2]); });
    L.ban.forEach(function (f) { cast(f.x, f.y, .9, .3, .3); });
    ph('shadows');
    // walls: dark the floor along wall edges (AO)
    var ao = (B.ao || {}).wall || .45, WLs = (st.S.live || {}).walls || {}, wgIm = img[WLs.ground || WLs.top], wgPat = null, wgSh = WLs.groundShade != null ? WLs.groundShade : .35;
    // ground under wall tiles (shows as a strip below the outer bank): the bank-top texture, shaded, not black
    if (wgIm) { wgPat = x.createPattern(wgIm, "repeat"); var kw = T * 2 / wgIm.width; if (wgPat.setTransform) wgPat.setTransform(new DOMMatrix([kw, 0, 0, kw, 0, 0])); }
    for (var j5 = 0; j5 < d.h; j5++) for (var i5 = 0; i5 < d.w; i5++) {
      if (tileAt(d, i5, j5) !== T_.WALL) continue;
      x.fillStyle = wgPat || "#070b0a"; x.globalAlpha = 1; x.fillRect(i5 * T, j5 * T, T, T); if (wgPat) { x.fillStyle = "#000"; x.globalAlpha = wgSh; x.fillRect(i5 * T, j5 * T, T, T); }
      x.globalAlpha = ao * .5; x.drawImage(blob, (i5 - .55) * T, (j5 - .55) * T, T * 2.1, T * 2.1);
    }
    x.restore();
    // the water tiles are not lava here: no orange glow circles / lava lights
    if (B.waterNotLava !== false) { var A = ISO.anim, keepA = []; for (var q5 = 0; q5 < A.length; q5 += 3) if (A[q5 + 2] !== L.waterIs) keepA.push(A[q5], A[q5 + 1], A[q5 + 2]); ISO.anim = keepA; }
    W.wmask = wm || null; W.MR = MR;
    ph('ao'); stats.bakePh = PH; stats.bakeMs = +(performance.now() - t0).toFixed(1); stats.foliage = L.fol.length; stats.fringeTrees = L.fol.filter(function (f) { return f.tree; }).length; stats.low = lowFx(); stats.path = L.path ? { cut: L.path.cut, nearCut: L.path.nearCut, nearAll: L.path.nearAll, onRoad: L.path.onRoad, propCut: propCut, propNear: propNear, keptNear: +(1 - (L.path.cut + L.path.nearCut + propCut) / Math.max(1, L.path.nearAll + propNear)).toFixed(3) } : null; stats.lanterns = L.lam.length; stats.banners = L.ban.length;
  }

  // ---------- per frame ----------
  function cur(d) { return W && W.d === d ? W : null; }
  function isoM(e, d, s, g, n, ISO, per) { // world (tile units * per px) -> screen device transform
    var O = g(0, 0), c = ISO.c, sn = ISO.sn, p = ISO.p;
    e.setTransform(n * c * s / per, n * sn * p * s / per, -n * sn * s / per, n * c * p * s / per, n * O.x, n * O.y);
  }
  var WFX = null;
  function ground(e, d, s, g, t, a, n, ISO) {
    if (BLOW !== null && BLOW !== lowFx() && ISO.gw === d) { ISO.gw = null; BLOW = null; return; } // graphics setting changed: re-bake (texel, foliage, trees)
    var w = cur(d); if (!w) return; var t0 = performance.now(), st = w.st, img = st.img, time = (root.ASHBOUND.state || {}).time || 0;
    e.save();
    var BD = live(st, "backdrop"); // painted canopy/water outside the map (world space, so it scrolls with the map)
    if (BD && img[BD.img]) {
      var bp = w.bdPat || (w.bdPat = e.createPattern(img[BD.img], "repeat")), M = BD.margin || 40, kb = (BD.tiles || 6) / img[BD.img].width;
      isoM(e, d, s, g, n, ISO, 1); if (bp.setTransform) bp.setTransform(new DOMMatrix([kb, 0, 0, kb, 0, 0]));
      var WLb = (st.S.live || {}).walls || {}, R = WLb.outerFaces === false ? (WLb.outerRing || 1) : 0; // v84m2: canopy runs up under the outer bank (its off-map faces are not drawn)
      e.beginPath(); e.rect(-M, -M, d.w + M * 2, d.h + M * 2); e.rect(0, 0, d.w - R, d.h - R);
      e.globalCompositeOperation = "source-over"; e.fillStyle = BD.col || "#050c0d"; e.globalAlpha = 1; e.fill("evenodd");
      e.globalAlpha = BD.alpha || .6; e.fillStyle = bp; e.fill("evenodd"); e.globalAlpha = 1;
    }
    var DT = live(st, "detail");
    if (DT && img[DT.img] && P(st, "detail") !== false) {
      var pat = w.detPat || (w.detPat = e.createPattern(img[DT.img], "repeat"));
      isoM(e, d, s, g, n, ISO, 1); var k = (DT.scale || .5) / img[DT.img].width;
      if (pat.setTransform) pat.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
      e.globalCompositeOperation = DT.op || "overlay"; e.globalAlpha = DT.alpha || .2; e.fillStyle = pat; e.fillRect(0, 0, d.w, d.h);
    }
    var WA = live(st, "water");
    if (WA && w.wmask && img[WA.img]) {
      var MR = 12, Wd = d.w * MR, Hd = d.h * MR;
      if (!WFX || WFX.width !== Wd || WFX.height !== Hd) WFX = mk(Wd, Hd);
      var fx = WFX.getContext("2d"), rp = w.ripPat || (w.ripPat = fx.createPattern(img[WA.img], "repeat")), sc = MR * (WA.scale || .7) * 4 / img[WA.img].width;
      WFX.n = (WFX.n || 0) + 1; if (WFX.n % (WA.every || 2) === 1 || WFX.d !== d) { WFX.d = d; // ripple canvas refresh rate (data: water.every)
      fx.globalCompositeOperation = "source-over"; fx.clearRect(0, 0, Wd, Hd);
      var s1 = WA.speed || [.05, .02], s2 = WA.speed2 || [-.03, .04];
      fx.globalAlpha = 1; if (rp.setTransform) rp.setTransform(new DOMMatrix([sc, 0, 0, sc, time * s1[0] * MR * 4, time * s1[1] * MR * 4])); fx.fillStyle = rp; fx.fillRect(0, 0, Wd, Hd);
      fx.globalCompositeOperation = "lighter"; fx.globalAlpha = .7; if (rp.setTransform) rp.setTransform(new DOMMatrix([-sc * 1.3, 0, 0, sc * 1.3, time * s2[0] * MR * 4 + 37, time * s2[1] * MR * 4 + 11])); fx.fillRect(0, 0, Wd, Hd);
      // sky reflection: brighter toward the top of the screen (= -x -y in the world)
      fx.globalCompositeOperation = "source-over"; fx.globalAlpha = WA.reflectAlpha || .15;
      var gr = fx.createLinearGradient(0, 0, Wd, Hd); gr.addColorStop(0, WA.reflect || "#5f9e9a"); gr.addColorStop(1, "rgba(0,0,0,0)"); fx.fillStyle = gr; fx.fillRect(0, 0, Wd, Hd);
      fx.globalAlpha = 1; fx.globalCompositeOperation = "destination-in"; fx.drawImage(w.wmask, 0, 0, Wd, Hd);
      }
      isoM(e, d, s, g, n, ISO, MR); e.globalCompositeOperation = "screen"; e.globalAlpha = WA.alpha || .2; e.imageSmoothingEnabled = true; e.drawImage(WFX, 0, 0);
      // glints
      e.setTransform(n, 0, 0, n, 0, 0); e.globalCompositeOperation = "lighter"; var gs = stamp(WA.glintCol || "#cfeee6"), shown = 0;
      for (var q = 0; q < w.L.gl.length && shown < (WA.glints || 20); q++) {
        var G = w.L.gl[q], tw = Math.sin(time * 2.3 + G.ph * 3) * .5 + .5; if (tw < .75) continue;
        var S = g(G.x, G.y); if (S.x < -20 || S.y < -20 || S.x > t + 20 || S.y > a + 20) continue; shown++;
        var r = s * .09 * (tw - .7) * 4; e.globalAlpha = (tw - .75) * 2.4; e.drawImage(gs, S.x - r * 2, S.y - r * .6, r * 4, r * 1.2);
      }
    }
    e.restore(); stats.groundMs = +(performance.now() - t0).toFixed(2);
  }

  function heroBox(g, s, I) { var pl = root.ASHBOUND.state.player, H = g(pl.x, pl.y); return { x: H.x, y: H.y, z: pl.x * I.sn + pl.y * I.c }; }
  function list(k, e, d, s, g, t, a, n, ISO, abL) {
    var w = cur(d); if (!w) return; var t0 = performance.now(), st = w.st, img = st.img, time = (root.ASHBOUND.state || {}).time || 0, L = w.L, LV = st.S.live || {};
    ABL = abL; DSC = Math.abs(e.getTransform().a) || n || 3; var FO = LV.foliage || {}, SW = P(st, "sway") === false ? null : FO.sway, hb = HB = heroBox(g, s, ISO), pts = abL && abL.pts, drawn = 0;
    function vis(S, m) { return S.x > -s * m && S.x < t + s * m && S.y > -s * .3 && S.y < a + s * m * 1.6; }
    function zOf(x, y) { return x * ISO.sn + y * ISO.c; }
    L.fol.forEach(function (f) {
      var S = g(f.x, f.y); if (!vis(S, 1.2)) return; var im = img[f.n]; if (!im) return; drawn++;
      var z = f.lift ? zOf(Math.floor(f.x) + .5, Math.floor(f.y) + .5) + 1e-3 : zOf(f.x, f.y);
      k.push({ y: z, draw: function () {
        var hgt = s * (FO.h && FO.h[f.n] || (f.n === "sedge" ? .55 : 1.25)) * f.s, wd = hgt * im.width / im.height;
        var al = 1; if (hb.z < z && Math.abs(hb.x - S.x) < wd * .6 && hb.y < S.y + 2 && hb.y > S.y - hgt * 1.1) al = .45;
        var sk = 0; if (SW) sk = SW.amp * Math.sin(time * SW.speed + f.ph + (f.x + f.y) * (SW.wave || .2)) + SW.amp * (SW.gust || 0) * Math.max(0, Math.sin(time * (SW.gustSpeed || .17) * 6.28 + f.x * .1));
        e.save(); e.globalAlpha = al; e.translate(S.x, S.y + s * .04 - (f.lift ? ISO.wallH * ISO.hs * ISO.cp * s : 0)); if (f.f) e.scale(-1, 1); if (sk) e.transform(1, 0, f.f ? sk : -sk, 1, 0, 0);
        e.imageSmoothingEnabled = true; e.drawImage(fit(im, hgt), -wd / 2, -hgt, wd, hgt); e.restore();
      } });
    });
    var LA = live(st, "lanterns"), BA = live(st, "banners");
    if (LA && img[LA.img]) L.lam.forEach(function (f) {
      var S = g(f.x, f.y); if (!vis(S, 1.5)) return; var im = img[LA.img], hgt = s * 2.1 * (LA.scale || 1), wd = hgt * im.width / im.height;
      var fl = 1 + Math.sin(time * 11 + f.ph) * (LA.flicker || .08) + Math.sin(time * 23 + f.ph * 2) * (LA.flicker || .08) * .5;
      var lx = S.x - wd * .2, ly = S.y - hgt * .58; // lantern glass on the sprite (left arm)
      var LG = LA.glow != null ? LA.glow : 1; if (pts && pts.length < 240 && LG > .05) pts.push(lx, ly + s * .3, s * (LA.light || 2.8) * fl * Math.min(1, LG + .3), 1);
      var z = zOf(f.x, f.y);
      k.push({ y: z, draw: function () {
        e.save(); e.imageSmoothingEnabled = true; e.drawImage(fit(im, hgt), S.x - wd * .62, S.y - hgt + s * .05, wd, hgt);
        e.globalCompositeOperation = "lighter"; e.globalAlpha = .55 * fl * LG; var gl = stamp(LA.color || "#ffb45a"), r = s * .55 * fl; e.drawImage(gl, lx - r, ly - r, r * 2, r * 2);
        e.globalAlpha = .9 * Math.min(1, LG * 1.5); var r2 = s * .12 * fl; e.drawImage(stamp("#fff0c8"), lx - r2, ly - r2, r2 * 2, r2 * 2); e.restore();
      } });
    });
    var bim = img.banner;
    if (BA && bim) L.ban.forEach(function (f) {
      var S = g(f.x, f.y); if (!vis(S, 1.5)) return; var hgt = s * (BA.poleH || 2.1), wd = hgt * bim.width / bim.height, z = zOf(f.x, f.y);
      k.push({ y: z, draw: function () {
        e.save(); e.imageSmoothingEnabled = true; var x0 = S.x - wd / 2, y0 = S.y - hgt + s * .05, N = 24, sh = bim.height / N, dh = hgt / N;
        var c0 = (BA.clothTop || .22), c1 = (BA.clothBottom || .78);
        for (var i = 0; i < N; i++) {
          var fr = i / N, off = 0;
          if (fr > c0) { var q = Math.min(1, (fr - c0) / (c1 - c0)); off = Math.sin(time * (BA.wave || 2.2) + f.ph - fr * 7) * s * .06 * q; }
          e.drawImage(bim, 0, i * sh, bim.width, sh + .5, x0 + off, y0 + i * dh, wd, dh + .6);
        }
        e.restore();
      } });
    });
    stats.drawnFol = drawn; stats.listMs = +(performance.now() - t0).toFixed(2);
  }

  var MOTES = null;
  function post(e, d, s, g, t, a, n, ISO) {
    var w = cur(d); if (!w) return; var t0 = performance.now(), st = w.st, time = (root.ASHBOUND.state || {}).time || 0, pl = root.ASHBOUND.state.player;
    e.save(); e.setTransform(n, 0, 0, n, 0, 0);
    var MO = live(st, "motes"), nF = MO ? (P(st, "motes") != null ? P(st, "motes") : Math.round(MO.fireflies || 0)) : 0, nD = MO && P(st, "motes") == null ? Math.round(MO.dust || 0) : 0;
    if (nF || nD) {
      var sp = MO.spread || 9, fs = stamp(MO.fireflyCol || "#d8ff9a"), ds = stamp(MO.dustCol || "#bfe3da");
      e.globalCompositeOperation = "lighter";
      for (var i = 0; i < nF + nD; i++) {
        var fire = i < nF, bx = Math.floor(pl.x / sp) * sp, by = Math.floor(pl.y / sp) * sp; // anchored in world cells around the hero
        for (var cy = -1; cy <= 1; cy++) for (var cx = -1; cx <= 1; cx++) {
          if (hash(i, cx + bx, cy + by + 3) > .34) continue;
          var hx = bx + cx * sp + hash(i, bx + cx, by + cy) * sp, hy = by + cy * sp + hash(i + 50, bx + cx, by + cy) * sp, ph = hash(i, 7, bx + by) * 6.28;
          var wx = hx + Math.sin(time * (fire ? .35 : .12) + ph) * (fire ? .8 : 1.6), wy = hy + Math.cos(time * (fire ? .29 : .1) + ph * 1.3) * (fire ? .8 : 1.6);
          var S = g(wx, wy); var lift = (fire ? .6 + Math.sin(time * .7 + ph) * .3 : .2 + ((time * .05 + ph) % 1.6)) * s; S.y -= lift;
          if (S.x < -10 || S.y < -10 || S.x > t + 10 || S.y > a + 10 || wx < 1 || wy < 1 || wx > d.w - 1 || wy > d.h - 1) continue;
          if (fire) { var bl = Math.max(0, Math.sin(time * 1.7 + ph * 2)); if (bl < .15) continue; var r = s * .09; e.globalAlpha = bl * .7; e.drawImage(fs, S.x - r, S.y - r, r * 2, r * 2); e.globalAlpha = bl; e.fillStyle = "#f4ffd8"; e.fillRect(S.x - 1, S.y - 1, 2, 2); }
          else { e.globalAlpha = .25 + .2 * Math.sin(time + ph); var r2 = s * .035; e.drawImage(ds, S.x - r2, S.y - r2, r2 * 2, r2 * 2); }
        }
      }
    }
    var FG = live(st, "fog");
    if (FG && P(st, "fog") !== false) {
      e.globalCompositeOperation = "source-over";
      // drifting ground mist in world space
      var ms = stamp(FG.mistCol || "#9cc8c2"), dr = FG.drift || [.07, .02];
      for (var m = 0; m < Math.round(FG.mist || 0); m++) {
        var mx = ((hash(m, 1, 9) * 40 + time * dr[0] * (1 + m % 3)) % 40 + 40) % 40 - 20 + pl.x, my = ((hash(m, 2, 9) * 40 + time * dr[1]) % 40 + 40) % 40 - 20 + pl.y;
        var S2 = g(mx, my), R = s * (3 + hash(m, 3, 9) * 3);
        if (S2.x < -R * 2 || S2.x > t + R * 2 || S2.y < -R || S2.y > a + R) continue;
        e.globalAlpha = FG.mistAlpha || .12; e.drawImage(ms, S2.x - R * 1.6, S2.y - R * .5, R * 3.2, R);
      }
      // depth haze: far (top of the screen) fades into teal-black fog
      var gr = e.createLinearGradient(0, 0, 0, a * (FG.top || .4)); gr.addColorStop(0, rgba(FG.col || "#0d2226", FG.topAlpha || .5)); gr.addColorStop(1, rgba(FG.col || "#0d2226", 0));
      e.globalAlpha = 1; e.fillStyle = gr; e.fillRect(0, 0, t, a * (FG.top || .4));
    }
    var EX = live(st, "exposure"); // daylight lift (time of day); 0 at night
    if (EX && EX.alpha > .01 && P(st, "grade") !== false) { e.globalCompositeOperation = EX.op || "screen"; e.globalAlpha = EX.alpha; e.fillStyle = EX.col || "#ffffff"; e.fillRect(0, 0, t, a); e.globalAlpha = 1; }
    var GR = live(st, "grade");
    if (GR && P(st, "grade") !== false) {
      e.globalCompositeOperation = GR.op || "soft-light"; e.globalAlpha = 1;
      var g2 = e.createLinearGradient(0, 0, t, a); g2.addColorStop(0, rgba(GR.highlight || "#ffd9a0", GR.highlightAlpha || .05)); g2.addColorStop(1, rgba(GR.shadow || "#0b2a30", GR.shadowAlpha || .15));
      e.fillStyle = g2; e.fillRect(0, 0, t, a);
    }
    var WR = WX.state !== "clear" && WX.renderers[WX.state]; if (WR && WR.draw) { e.globalCompositeOperation = "source-over"; e.globalAlpha = 1; WR.draw(e, { d: d, s: s, g: g, t: t, a: a, n: n, time: time, amount: WX.amount }); }
    e.restore(); stats.postMs = +(performance.now() - t0).toFixed(2);
  }

  var LCache = {};
  function light(d) {
    var w = cur(d); if (!w) return null; var LI = live(w.st, "light"); if (!LI) return null;
    var dc = (LI.darkCol || [6, 4, 10]).map(Math.round), fc = (LI.heroFill || [255, 150, 64]).map(Math.round), key = w.st.id + "|" + fc;
    var c = LCache[key];
    if (!c) {
      c = LCache[key] = document.createElement("canvas"); c.width = c.height = 128; var x = c.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(" + fc + ",1)"); gr.addColorStop(.35, "rgba(" + fc + ",.85)"); gr.addColorStop(.7, "rgba(" + fc + ",.32)"); gr.addColorStop(1, "rgba(" + fc + ",0)"); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    }
    return { dark: LI.dark != null ? LI.dark : .56, heroR: LI.heroR || 6.2, fillA: LI.heroFillAlpha != null ? LI.heroFillAlpha : .22, stamp: c, css: function (k) { return "rgba(" + dc[0] + "," + dc[1] + "," + dc[2] + "," + k + ")"; } };
  }

  // painted swaps for props3d grid sprites (trees, rocks, reeds) in set zones
  var HB = null, ABL = null;
  function sprite(e, name, P0, s, n, h, alpha, time) {
    var d = root.ASHBOUND && root.ASHBOUND.state && root.ASHBOUND.state.world, w = cur(d); if (!w) return false;
    var SP = (w.st.S.live || {}).swap || {}, sw = SP[name]; if (!sw) return false;
    var list_ = sw.imgs || [sw.img], nm = list_[Math.floor(h * 7 * list_.length) % list_.length], im = w.st.img[nm]; if (!im) return false;
    var v = 1 + ((h * 13) % 1 - .5) * (sw.vary || .2), hgt = s * (sw.h || 2.4) * v, wd = hgt * im.width / im.height, flip = (h * 29) % 1 < .5;
    var TS = (w.st.S.live || {}).treeSway, sk = 0;
    if (TS && P(w.st, "sway") !== false && sw.sway !== false) sk = (TS.amp || .02) * Math.sin((time || 0) * (TS.speed || .9) + h * 40);
    var al = alpha == null ? 1 : alpha, OC = (w.st.S.live || {}).occlude; // fade a tall sprite that hides the hero (hero stands behind it)
    if (OC && HB && HB.y < P0.y - s * .1 && HB.y > P0.y - hgt * (OC.top || .95) && Math.abs(HB.x - P0.x) < wd * (OC.w || .38)) al = Math.min(al, OC.alpha || .42);
    e.save(); e.globalAlpha = al; e.imageSmoothingEnabled = true; e.translate(P0.x, P0.y + s * (sw.dy || .1));
    if (flip) e.scale(-1, 1); if (sk) e.transform(1, 0, sk, 1, 0, 0);
    e.drawImage(fit(im, hgt), -wd * (sw.ax || .5), -hgt, wd, hgt); e.restore();
    return true;
  }


  // interactables / doors / waypoint bases: painted set art (live.props[kind]); labels stay the game's
  function propDef(b) {
    var d = root.ASHBOUND && root.ASHBOUND.state && root.ASHBOUND.state.world, w = cur(d); if (!w) return null;
    var PR = (w.st.S.live || {}).props || {}, k = b.kind === "entry" ? "exit" : b.kind, df = PR[k]; if (!df) return null;
    var im = w.st.img[df.img]; return im ? { w: w, df: df, im: im } : null;
  }
  function drawProp(e, R, P, s, b, time, al) {
    var df = R.df, im = R.im, hgt = s * (df.h || 1), wd = hgt * im.width / im.height, ay = df.ay != null ? df.ay : .97;
    var x0 = P.x - wd * (df.ax != null ? df.ax : .5), y0 = P.y - hgt * ay + s * (df.dy || 0);
    if (HB && df.occlude !== false && HB.y < P.y - s * .1 && HB.y > y0 && HB.x > x0 && HB.x < x0 + wd && hgt > s * 1.2) al = Math.min(al, .5);
    e.save(); e.globalAlpha = al; e.imageSmoothingEnabled = true; if (df.flip) { e.translate(P.x * 2, 0); e.scale(-1, 1); }
    e.drawImage(fit(im, hgt), x0, y0, wd, hgt); e.restore();
    var G = df.glow; if (G) { // [x, up, r (tiles), colour, pulse]
      var pu = 1 + Math.sin(time * 5 + b.x) * (G[4] || 0), gx = P.x + G[0] * s, gy = P.y - G[1] * s, r = G[2] * s * pu;
      e.save(); e.globalCompositeOperation = "lighter"; e.globalAlpha = al * (G[5] || .6); e.drawImage(stamp(G[3]), gx - r, gy - r, r * 2, r * 2); e.restore();
      if (df.light && ABL && ABL.pts && ABL.pts.length < 240) ABL.pts.push(gx, gy, s * df.light * pu, 1);
    }
    var M = df.gem; if (M) { // floating relic gem: [up, size, colour, glowColour]
      var by = (M[0] + Math.sin(time * 2.4) * .05) * s, gx2 = P.x, gy2 = P.y - by, r2 = s * M[1];
      e.save(); e.globalAlpha = al; e.globalCompositeOperation = "lighter"; e.drawImage(stamp(M[3] || "#ffb067"), gx2 - r2 * 3, gy2 - r2 * 3, r2 * 6, r2 * 6);
      e.globalCompositeOperation = "source-over"; e.fillStyle = M[2] || "#ffd7a8"; e.beginPath(); e.moveTo(gx2, gy2 - r2 * 1.5); e.lineTo(gx2 + r2, gy2); e.lineTo(gx2, gy2 + r2 * 1.5); e.lineTo(gx2 - r2, gy2); e.closePath(); e.fill();
      e.fillStyle = "rgba(255,255,255,.55)"; e.beginPath(); e.moveTo(gx2, gy2 - r2 * 1.5); e.lineTo(gx2 + r2, gy2); e.lineTo(gx2, gy2); e.closePath(); e.fill(); e.restore();
    }
    return { x: P.x, y: P.y - hgt * (df.labelAt != null ? df.labelAt : .92) - s * .12, lbl: b.warn ? (df.lblWarn || df.lbl) : df.lbl };
  }
  // index.html isoProp3 (shrine, crate, relic, marker, ...): returns {x,y,lbl} for the game's label, or null
  function prop(e, d, b, s, g, time, Xa) {
    var R = propDef(b); if (!R) return null; var P = g(b.x, b.y);
    return drawProp(e, R, P, s, b, time || 0, Xa ? Xa(P.x, P.y) : 1);
  }
  // js/ab-props3d.js prop() (exit/entry arches, waypoint base)
  function prop3(e, b, P, s, time, alpha) {
    var R = propDef(b); if (!R) return false; drawProp(e, R, P, s, b, time || 0, alpha == null ? 1 : alpha); return true;
  }

  // wall blocks (isoBlock): painted bank top and side faces
  function wall(d) {
    var w = cur(d); if (!w) return null; var WL = (w.st.S.live || {}).walls; if (!WL) return null;
    var top = w.st.img[WL.top], side = w.st.img[WL.side]; if (!top || !side) return null;
    var SS = WL.sideShade || [.4, .58]; // south / east face darkening over the painted bank side (data)
    return w.wallInfo || (w.wallInfo = { id: w.st.id, top: top, side: side, shS: "rgba(0,0,0," + SS[0] + ")", shE: "rgba(0,0,0," + SS[1] + ")", skirt: WL.outerFaces === false });
  }

  // v84m2 test/readout only (reads pixels back, never called per frame): mean luminance of road vs plain floor tile centres in the baked ground
  function pathLum() {
    var w = W, c = ISOref && ISOref.gc; if (!w || !w.L.path || !c) return null; var d = w.d, T = w.T, x = c.getContext("2d"), L = w.L;
    var lr = 0, nr = 0, lg = 0, ng = 0; for (var jl = 1; jl < d.h - 1; jl++) for (var il = 1; il < d.w - 1; il++) { var kl = jl * d.w + il; if (d.tiles[kl] !== T_.FLOOR) continue; var rd = L.path.isR(il, jl); if (!rd && L.path.roadAdj(il, jl, 1)) continue;
      var px_ = x.getImageData(il * T + (T >> 2), jl * T + (T >> 2), T >> 1, T >> 1).data, lu = 0; for (var q = 0; q < px_.length; q += 4) lu += .2126 * px_[q] + .7152 * px_[q + 1] + .0722 * px_[q + 2]; lu /= px_.length / 4;
      if (rd) { lr += lu; nr++; } else { lg += lu; ng++; } }
    return { road: +(lr / Math.max(1, nr)).toFixed(1), ground: +(lg / Math.max(1, ng)).toFixed(1), nRoad: nr, nGround: ng };
  }

  root.ABZoneGfx = { pre: pre, bake: bake, ground: ground, list: list, post: post, light: light, sprite: sprite, wall: wall, liquid: liquid, prop: prop, prop3: prop3,
    active: function () { return !!(W && root.ASHBOUND && W.d === root.ASHBOUND.state.world); },
    stats: function () { return Object.assign({ set: W && W.st.id, low: lowFx(), ready: Object.keys(sets).filter(function (k) { return sets[k].ready; }) }, stats); },
    cfg: function () { return CFG; }, lowDpr: function () { return lowFx(); }, todButton: todButton, todCycle: todCycle, setWeather: setWeather, registerWeather: registerWeather,
    tod: function () { return { mode: todMode(), hour: +TOD.hour.toFixed(2), preset: todPreset(), weights: TOD.wts, weather: WX.state }; }, rebuild: function () { if (ISOref) ISOref.gw = null; }, pathLum: pathLum };
})(window);
