/* Ashbound realism enemies: pre-baked 8-direction sprites for monsters, keyed by monster id (ent.defId).
   Data: data/enemies-real.json (root) -> assets/enemies/<id>/manifest.json + <anim>.webp (shelf-packed frames).
   Called from Dn() before ab3Get. Returns {F:{c,cx,cy}, mir:0} or null.
   null + abEnemyPending() true  -> the type has real data but nothing is decoded yet: draw nothing (no old-sprite flash).
   null + abEnemyPending() false -> no real data for this monster (or realism off / data failed): old sprite.
   Memory: own LRU atlas budget, shrunk by what the hero atlases use (combined cap), plus a byte-capped composite cache. */
(function (w) {
  "use strict";
  var GAME_FRAMES = { idle: 4, walk: 8, run: 8, strike: 4, hit: 1, death: 4 };
  var ANIM_ALIAS = { run: "walk" };
  var root = null, rootFailed = false, rootP = null;
  var mans = new Map(), manP = new Map(), manFailed = {};
  var atl = new Map(), atlBytes = 0, imgP = new Map(), evicts = 0;
  var comps = new Map(), compBytes = 0;
  var lastBy = new WeakMap();
  var pendSince = {};
  var pend = false;
  var worldIds = {}, lastScan = 0, warmed = {};
  var S = { real: 0, fallback: 0, held: 0, hidden: 0, byType: {}, fbType: {}, lastDir: {}, lastAnim: {}, lastFrame: {}, lastFace: {}, lastMir: {}, errors: 0 };
  /* Bosses ("fine": true) bake more frames than the game's pose indices: pick them from time instead.
     idle: looping clock; strike: time since this swing began (strikeSec); death: deathT (the game's own 0.57 s fall). */
  var strikeAt = new WeakMap(), deathAt = new WeakMap();
  function fineFrame(ent, sp, mode, n, fr) {
    var t = now() / 1000;
    if (mode === "idle") { strikeAt.delete(ent); var u = +String(ent.uid || 0).replace(/\D/g, "").slice(-4) || 0;  /* uid may be a string ("m12") */
      return Math.max(0, Math.floor(t * (sp.idleFps || 3) + u * 0.37)) % n; }
    if (mode === "strike") {
      var s0 = strikeAt.get(ent); if (s0 == null || t - s0 > (sp.strikeSec || 0.45) * 2.5) { s0 = t; strikeAt.set(ent, t); }
      return Math.min(n - 1, Math.floor((t - s0) / (sp.strikeSec || 0.45) * n));
    }
    strikeAt.delete(ent);
    if (mode === "death") {
      /* deathT when the game advances it; a boss defeat can hold deathT still, so also run on our own clock (0.6 s fall) */
      var d0 = deathAt.get(ent); if (d0 == null) { d0 = t; deathAt.set(ent, t); }
      var f = Math.max((ent.deathT || 0) * 7 / 4, (t - d0) / 0.6);
      return Math.min(n - 1, Math.floor(Math.min(1, f) * n));
    }
    deathAt.delete(ent);
    return fr;
  }

  function qs() { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } }
  function enabled() {
    var q = qs();
    if (q.get("realenemies") === "0" || q.get("real") === "0") return false;
    if (q.get("realenemies") === "1") return true;
    try {
      var ls = localStorage.getItem("ashbound.realEnemies");
      if (ls === "0") return false;
      if (ls === "1") return true;
    } catch (e) {}
    var C = w.ASHBOUND_CONFIG || {};
    if (C.REAL_ENEMIES != null) return !!C.REAL_ENEMIES;
    if (w.abRealOn && !w.abRealOn()) return false;
    return !!C.STAGING;
  }
  function now() { return performance.now(); }
  function cfg(k, d) { return root && root[k] != null ? root[k] : d; }
  function MB(x) { return x * 1048576; }
  function budget() {
    var heroMB = 0;
    try { heroMB = (w.abRealStats && w.abRealStats().atlasMB) || 0; } catch (e) {}
    var b = cfg("combinedBudgetMB", 64) - heroMB;
    return MB(Math.max(cfg("minBudgetMB", 12), Math.min(cfg("budgetMB", 24), b)));
  }

  function ensureRoot() {
    if (root || rootFailed) return rootP || Promise.resolve(root);
    if (rootP) return rootP;
    rootP = fetch("data/enemies-real.json", { cache: "force-cache" }).then(function (r) {
      if (!r.ok) throw new Error("enemies-real.json " + r.status);
      return r.json();
    }).then(function (j) { root = j; return j; }, function () { rootFailed = true; return null; });
    return rootP;
  }
  function spec(id) { return root && root.enemies && root.enemies[id]; }
  function loadMan(id) {
    if (mans.has(id) || manFailed[id]) return;
    if (manP.has(id)) return;
    var sp = spec(id); if (!sp) return;
    var p = fetch(sp.path + "manifest.json", { cache: "force-cache" }).then(function (r) {
      if (!r.ok) throw new Error(id);
      return r.json();
    }).then(function (m) { m.path = sp.path; mans.set(id, m); manP.delete(id); return m; },
      function () { manFailed[id] = true; manP.delete(id); S.errors++; return null; });
    manP.set(id, p);
  }

  function pri(url) {
    var id = url.split("/").slice(-2, -1)[0];
    if (!worldIds[id]) return 0;
    var sp = spec(id); if (sp && sp.boss) return 5;
    if (/\/(death|hit)\.webp$/.test(url)) return 1;
    if (/\/strike\.webp$/.test(url)) return 2;
    if (/\/walk\.webp$/.test(url)) return 3;
    return 4;
  }
  function evict(need, keep) {
    var B = budget();
    while (atlBytes + need > B && atl.size) {
      var best = null, bp = 99, bat = Infinity;
      atl.forEach(function (v, k) {
        if (k === keep) return;
        var p = pri(k);
        if (p < bp || (p === bp && v.at < bat)) { bp = p; bat = v.at; best = k; }
      });
      if (!best) break;
      atlBytes -= atl.get(best).bytes; atl.delete(best); evicts++;
      comps.forEach(function (c, k) { if (c.url === best) { compBytes -= c.bytes; comps.delete(k); } });
    }
  }
  function loadImg(url) {
    if (atl.has(url)) { atl.get(url).at = now(); return; }
    if (imgP.has(url)) return;
    var p = new Promise(function (res) {
      var im = new Image(), done = false;
      function commit() {
        if (done) return; done = true; imgP.delete(url);
        var wd = im.naturalWidth || im.width, ht = im.naturalHeight || im.height;
        if (!wd || !ht) { S.errors++; res(null); return; }
        var bytes = wd * ht * 4;
        evict(bytes, url);
        atl.set(url, { img: im, bytes: bytes, at: now() }); atlBytes += bytes;
        res(im);
      }
      im.onload = function () { if (typeof im.decode === "function") im.decode().then(commit, commit); else commit(); };
      im.onerror = function () { if (done) return; done = true; imgP.delete(url); S.errors++; res(null); };
      im.src = url;
    });
    imgP.set(url, p);
  }
  function prefetch(id, anims) {
    var m = mans.get(id);
    if (!m) { loadMan(id); return; }
    anims.forEach(function (a) { var r = m.anims[a]; if (r) loadImg(m.path + r.file); });
  }
  function has(m, a) { var r = m.anims[a]; return !!(r && atl.has(m.path + r.file)); }
  function warm(id) {
    var m = mans.get(id);
    if (!m || warmed[id] || !has(m, "idle") || !has(m, "walk")) return;
    warmed[id] = 1;
    var go = function () { prefetch(id, ["strike", "hit", "death"]); };
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 1500 }); else setTimeout(go, 300);
  }
  /* Every 0.5 s: which real-enemy ids are in the current world. Prefetch their idle/walk, warm the rest. */
  function scan() {
    var t = now(); if (t - lastScan < 500) return; lastScan = t;
    var st = w.ASHBOUND && ASHBOUND.state, W = st && st.world;
    var ids = {};
    if (W && W.monsters) for (var i = 0; i < W.monsters.length; i++) { var e = W.monsters[i]; if (e && e.defId && spec(e.defId)) ids[e.defId] = 1; }
    worldIds = ids;
    for (var id in ids) {
      var sp_ = spec(id);
      if (sp_ && sp_.boss) prefetch(id, ["idle", "walk", "strike", "hit", "death"]);  /* one boss per zone: load its whole set as soon as it exists */
      else { prefetch(id, ["idle", "walk"]); warm(id); }
    }
  }

  function outlineCol(rank) {
    var R = cfg("rankOutline", {});
    if (rank === "elite") return R.elite || "#f0d56a";
    if (rank === "champion") return R.champion || "#79b0ff";
    return null;
  }
  function composite(id, m, anim, rec, dir, fr, rank, sc) {
    /* Bosses are drawn 1.75-2.35x bigger than they are baked: composite them at atlas resolution and let the draw scale
       them up (F.k), instead of building ~1 MB upscaled canvases per frame that thrash the 8 MB composite cache. */
    var sp0 = spec(id), up = sp0 && sp0.boss && sc > 1 ? sc : 0;
    if (up) {
      var F0 = composite(id + "#1x", m, anim, rec, dir, fr, rank, 1);
      return F0 && { c: F0.c, cx: F0.cx, cy: F0.cy, k: up };
    }
    var key = id + "|" + anim + "|" + dir + "|" + fr + "|" + (rank || "") + "|" + Math.round(sc * 200);
    var hit = comps.get(key);
    if (hit) { comps.delete(key); comps.set(key, hit); return hit.F; }
    var url = m.path + rec.file, A = atl.get(url);
    if (!A) return null;
    A.at = now();
    var R = rec.rects[dir * rec.frames + fr];
    if (!R || !R[2]) return null;
    var dw = Math.max(1, Math.round(R[2] * sc)), dh = Math.max(1, Math.round(R[3] * sc));
    var oc = outlineCol(rank), pad = oc ? 2 : 1;
    var c = document.createElement("canvas"); c.width = dw + pad * 2; c.height = dh + pad * 2;
    var g = c.getContext("2d"); g.imageSmoothingEnabled = true;
    var alpha = cfg("outline", 0.55);
    if (alpha > 0 || oc) {
      for (var dy = -pad; dy <= pad; dy++) for (var dx = -pad; dx <= pad; dx++) if (dx || dy) g.drawImage(A.img, R[0], R[1], R[2], R[3], pad + dx, pad + dy, dw, dh);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = oc ? oc : "rgba(10,8,6," + alpha + ")";
      if (oc) g.globalAlpha = 0.9;
      g.fillRect(0, 0, c.width, c.height);
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
    g.drawImage(A.img, R[0], R[1], R[2], R[3], pad, pad, dw, dh);
    var F = { c: c, cx: R[4] * sc + pad, cy: R[5] * sc + pad };
    var bytes = c.width * c.height * 4;
    comps.set(key, { F: F, bytes: bytes, url: url }); compBytes += bytes;
    var cap = MB(cfg("compositeMB", 8));
    while (compBytes > cap && comps.size) { var k0 = comps.keys().next().value; compBytes -= comps.get(k0).bytes; comps.delete(k0); }
    return F;
  }

  function hold(ent, id) {
    var t = now();
    if (!pendSince[id]) pendSince[id] = t;
    var L = lastBy.get(ent);
    if (L) { S.held++; return { F: L.F, mir: L.mir }; }
    if (t - pendSince[id] > cfg("holdMs", 4000)) { S.fallback++; S.fbType[id] = (S.fbType[id] || 0) + 1; return null; }
    pend = true; S.hidden++;
    return null;
  }

  function frame(ent, shape, pose, face, r, quiet) {
    pend = false;
    if (!ent || !ent.defId || !enabled()) return null;
    if (!root) {
      if (rootFailed) return null;
      ensureRoot();
      pend = true; S.hidden++;
      return null;
    }
    var id = ent.defId, sp = spec(id);
    if (!sp || manFailed[id]) return null;
    scan();
    var m = mans.get(id);
    if (!m) { if (!quiet) loadMan(id); return hold(ent, id); }
    var mode = (pose && pose.mode) || "idle";
    var anim = ANIM_ALIAS[mode] || mode;
    if (!m.anims[anim]) anim = "idle";
    if (!has(m, anim)) {
      if (!quiet) prefetch(id, [anim, "idle", "walk"]);
      var order = anim === "death" ? ["hit", "idle", "walk"] : anim === "walk" ? ["idle", "strike"] : ["idle", "walk"];
      var alt = null;
      for (var i = 0; i < order.length; i++) if (has(m, order[i])) { alt = order[i]; break; }
      if (!alt) return hold(ent, id);
      anim = alt;
    }
    var rec = m.anims[anim];
    var n = rec.frames, gf = GAME_FRAMES[mode] || n, f0 = (pose && pose.frame) || 0;
    var same = anim === mode || ANIM_ALIAS[mode] === anim;
    var fr = same ? Math.min(n - 1, Math.max(0, Math.floor(f0 * n / gf))) : 0;
    if (same && sp.fine) fr = fineFrame(ent, sp, mode, n, fr);
    var shift = sp.dirShift || 0;
    var dir = (((Math.round((Math.PI / 2 - (face || 0)) / (Math.PI / 4)) % 8) + 8) % 8 + shift) % 8;
    /* 5-direction bakes (bosses: rows 0..4 = front .. back through the right side): rows 5..7 are mirrors of 3..1 */
    var mir = 0;
    if (rec.dirs === 5 && dir > 4) { dir = 8 - dir; mir = 1; }
    var D = (typeof ab3BakeDpr === "function") ? ab3BakeDpr() : 2;
    var sc = cfg("tilesPerMeter", 0.82) * (r || 53) * D * (sp.scale || 1) / (m.ppm || 60);
    var rank = ent.rank === "elite" || ent.rank === "champion" ? ent.rank : "";
    var F = composite(id, m, anim, rec, dir, fr, rank, sc);
    if (!F) return hold(ent, id);
    delete pendSince[id];
    lastBy.set(ent, { F: F, mir: mir });
    S.real++; S.byType[id] = (S.byType[id] || 0) + 1;
    S.lastDir[id] = mir ? 8 - dir : dir; S.lastAnim[id] = anim; S.lastFrame[id] = fr; S.lastFace[id] = face; S.lastMir[id] = mir;
    return { F: F, mir: mir };
  }

  w.abEnemyRiftFx = function (g, t, a) {
    var T = (w.ASHBOUND && ASHBOUND.state && ASHBOUND.state.time) || now() / 1000;
    var n = t.riftSig === "bell" ? "#f0c14a" : t.riftSig === "shade" ? "#b794f6" : "#ff6a1a";
    g.save(); g.globalAlpha = 0.22 + Math.sin(T * 4) * 0.06; g.fillStyle = n;
    g.beginPath(); g.ellipse(0, 2, a * 1.25, a * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.55;
    for (var m = 0; m < 6; m++) { var d = T * 2 + m * 1.05; g.fillRect(Math.cos(d) * a * 0.9, -a * 0.6 + Math.sin(d * 1.7) * a * 0.45, 3, 3); }
    g.restore();
  };
  setInterval(function () { try { if (enabled() && root) scan(); } catch (e) {} }, 600);
  w.abEnemyOn = enabled;
  w.abEnemyFrame = frame;
  w.abEnemyPending = function () { return pend; };
  w.abEnemyHasData = function (id) { return !!spec(id); };
  w.abEnemyStats = function () {
    return {
      on: enabled(), root: !!root, rootFailed: rootFailed, types: Object.keys((root && root.enemies) || {}),
      manifests: [...mans.keys()], atlases: atl.size, typeMB: (function () { var o = {}; atl.forEach(function (v, k) { var t = k.split("/").slice(-2, -1)[0]; o[t] = +(((o[t] || 0) + v.bytes / 1048576)).toFixed(2); }); return o; })(), atlasMB: +(atlBytes / 1048576).toFixed(2), budgetMB: +(budget() / 1048576).toFixed(2),
      composites: comps.size, compositeMB: +(compBytes / 1048576).toFixed(2), evicts: evicts, worldIds: Object.keys(worldIds),
      real: S.real, fallback: S.fallback, held: S.held, hidden: S.hidden, byType: S.byType, fbType: S.fbType,
      lastDir: S.lastDir, lastAnim: S.lastAnim, lastFrame: S.lastFrame, lastMir: S.lastMir, errors: S.errors,
      loaded: [...atl.keys()]
    };
  };
  w.abEnemyResetStats = function () { S.real = 0; S.fallback = 0; S.held = 0; S.hidden = 0; S.byType = {}; S.fbType = {}; };
  w.abEnemySet = function (on) { try { localStorage.setItem("ashbound.realEnemies", on ? "1" : "0"); } catch (e) {} };
  if (enabled()) ensureRoot();
})(window);
