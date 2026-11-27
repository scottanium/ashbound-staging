/* Ashbound r15 skillfx: every active skill gets its own cast pose, VFX signature, impact and (for buffs) a hero aura,
   plus a buff row by the life orb, "use it now" cues on skill buttons, and enemy wind-up cues.
   All per-skill numbers and looks live in data/skill-fx.json; this file only knows how to draw shape kinds.
   Hooks (index.html): Hi -> pre/post, world draw -> ground()/air(), abPose -> pose(), gd -> heroLift(),
   combat:hit payload carries .fx, er() -> warnElite(), al() leap -> leapWind().
   Performance: fixed particle pool (cap from data, lower on low FX), pooled shape list with a cap, baked glow sprites,
   no per-frame allocation in the draw loops. Low FX: ASHBOUND_CONFIG.LOW_FX, ?lowfx=1, localStorage ashbound.lowfx=1,
   or Settings > Particles "low"; Particles "off" keeps shapes only. */
(function (w) {
  "use strict";
  var D = null, loadFailed = false, errs = 0;
  var FX = [], FXCAP = 48;
  var P = [], PCAP = 0, PI_ = 0;
  var now = 0, lastNow = 0, dt = 0, SCALE = 1, maxLive = 0;
  var lastCast = null;
  var hitBudget = 0;
  var glow = {};
  var B = { ox: 0, oy: 0, ex: 0, ey: 0, fx: 0, fy: 0, s: 1 };
  var CTX = null, G = null, S = 1, LIFT = 0, ST = null;
  var stats = { drawn: 0, projDrawn: 0, casts: 0, impacts: 0, spawned: 0, dropped: 0, poses: 0, ready: 0, auras: 0, wind: 0, lastFrameMs: 0 };
  var forcedLow = null, CUR = null, BYID = {};
  var TAU = Math.PI * 2;

  /* ---------- data ---------- */
  function load() {
    try {
      fetch("data/skill-fx.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) { D = d; FXCAP = (d.caps && d.caps.shapes) || 48; prewarm(); }).catch(function () { loadFailed = true; });
    } catch (e) { loadFailed = true; }
  }
  /* bake every palette's glow sprite while idle, so the first cast of a colour doesn't hitch mid-fight */
  function prewarm() {
    var go = function () { try { var ps = D.palettes || {}; for (var k in ps) { if (ps[k].glow) glowSprite(ps[k].glow); if (ps[k].main) glowSprite(ps[k].main); } } catch (e) {} };
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 3000 }); else setTimeout(go, 1500);
  }
  load();
  function ready() { return !!D; }
  function skillDef(id) { return D && D.skills ? D.skills[id] || null : null; }
  function pal(k) {
    if (!D) return null;
    if (k && typeof k === "object") return k;
    return (D.palettes && D.palettes[k]) || (D.palettes && D.palettes.steel) || { core: "#fff", main: "#ddd", edge: "#888", glow: "#fff" };
  }
  function col(p, c) { return !c ? p.main : (p[c] || c); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rr(v, d) { return Array.isArray(v) ? rnd(v[0], v[1]) : (v == null ? d : v); }

  /* ---------- level: 2 full, 1 low, 0 shapes only ---------- */
  var LV = -1;
  function level() { if (LV < 0) LV = calcLevel(); return LV; }
  function calcLevel() {
    if (!D) return 0;
    var st = w.ASHBOUND && w.ASHBOUND.state, set = st && st.settings || {};
    if (set.particles === "off") return 0;
    if (forcedLow != null) return forcedLow ? 1 : 2;
    var C = w.ASHBOUND_CONFIG || {};
    if (C.LOW_FX) return 1;
    try { if (/(?:^|[?&])lowfx=1(?:&|$)/.test(location.search || "")) return 1; if (localStorage.getItem("ashbound.lowfx") === "1") return 1; } catch (e) {}
    if (set.lowFx || set.particles === "low") return 1;
    return 2;
  }
  function on() { return !!D && !loadFailed && errs < 25; }
  function caps() {
    var c = (D && D.caps) || {}, L = level();
    return { particles: L === 2 ? (c.particles || 180) : L === 1 ? (c.particlesLow || 60) : 0, shapes: L === 2 ? (c.shapes || 48) : (c.shapesLow || 20),
      impactsPerFrame: L === 2 ? (c.impactsPerFrame || 6) : (c.impactsPerFrameLow || 2) };
  }

  /* ---------- glow sprites (baked once per colour) ---------- */
  function glowSprite(color) {
    var g = glow[color]; if (g) return g;
    var c = document.createElement("canvas"); c.width = c.height = 64;
    var x = c.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, color); gr.addColorStop(0.35, color); gr.addColorStop(1, "rgba(0,0,0,0)");
    x.globalAlpha = 1; x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    glow[color] = c; return c;
  }
  function drawGlow(ctx, sx, sy, rad, color, alpha) {
    if (level() < 2 || rad <= 0.5 || alpha <= 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(glowSprite(color), sx - rad, sy - rad, rad * 2, rad * 2); ctx.restore();
  }

  /* ---------- particles (fixed pool) ---------- */
  function ensurePool() {
    var cap = caps().particles;
    if (cap === PCAP) return;
    PCAP = cap; P.length = 0;
    for (var i = 0; i < cap; i++) P.push({ a: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, m: 1, sz: 2, c: "#fff", k: "spark", gr: 0, dr: 0, lit: false, rot: 0 });
    PI_ = 0;
  }
  function emit(spec, x, y, z, ang, p, mul) {
    if (!spec || !PCAP) return;
    var n = Math.round(rr(spec.n, 6) * (mul || 1) * (level() === 1 ? 0.4 : 1));
    var spread = spec.spread == null ? TAU : spec.spread;
    for (var i = 0; i < n; i++) {
      var q = P[PI_]; PI_ = (PI_ + 1) % PCAP;
      if (q.a) stats.dropped++;
      var a = spread >= TAU ? Math.random() * TAU : (ang || 0) + (Math.random() - 0.5) * spread;
      var sp = rr(spec.speed, 2), ring = spec.ring ? rr(spec.ring, 0) : 0;
      q.a = true; q.x = x + Math.cos(a) * ring; q.y = y + Math.sin(a) * ring; q.z = (z || 0) + rr(spec.z, 0);
      q.vx = Math.cos(a) * sp; q.vy = Math.sin(a) * sp; q.vz = rr(spec.up, 0);
      q.m = q.t = rr(spec.life, 0.5); q.sz = rr(spec.size, 2.5);
      var cs = spec.colors || ["main"]; q.c = col(p, cs[(Math.random() * cs.length) | 0]);
      q.k = spec.kind || "spark"; q.gr = spec.gravity == null ? 0 : spec.gravity; q.dr = spec.drag == null ? 1.5 : spec.drag;
      q.lit = spec.lit !== false; q.rot = Math.random() * TAU;
      stats.spawned++;
    }
  }
  function stepParticles() {
    for (var i = 0; i < PCAP; i++) {
      var q = P[i]; if (!q.a) continue;
      q.t -= dt; if (q.t <= 0) { q.a = false; continue; }
      var f = Math.max(0, 1 - q.dr * dt);
      q.vx *= f; q.vy *= f; q.vz = q.vz * f - q.gr * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z = Math.max(0, q.z + q.vz * dt); q.rot += dt * 6;
    }
  }
  function drawParticles(ctx) {
    var lit = level() === 2;
    for (var i = 0; i < PCAP; i++) {
      var q = P[i]; if (!q.a) continue;
      var o = G(q.x, q.y), sx = o.x, sy = o.y - LIFT * 0.35 - q.z * S * 0.8, al = Math.max(0, Math.min(1, q.t / q.m * 1.4)), sz = q.sz;
      ctx.globalAlpha = al;
      if (q.k === "ember" || q.k === "mote") {
        if (lit && q.lit) drawGlow(ctx, sx, sy, sz * 3.2, q.c, al * 0.7);
        ctx.fillStyle = q.c; ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz);
      } else if (q.k === "spark") {
        var vx = q.vx * S * 0.05, vy = q.vy * S * 0.05 * 0.6 - q.vz * S * 0.04;
        ctx.strokeStyle = q.c; ctx.lineWidth = Math.max(1, sz * 0.5); ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - vx, sy - vy); ctx.stroke();
      } else if (q.k === "shard") {
        ctx.fillStyle = q.c; ctx.save(); ctx.translate(sx, sy); ctx.rotate(q.rot); ctx.beginPath();
        ctx.moveTo(0, -sz * 1.4); ctx.lineTo(sz * 0.5, 0); ctx.lineTo(0, sz * 1.4); ctx.lineTo(-sz * 0.5, 0); ctx.closePath(); ctx.fill(); ctx.restore();
      } else if (q.k === "note") {
        ctx.fillStyle = q.c; ctx.font = "700 " + Math.round(sz * 4) + "px Georgia, serif"; ctx.textAlign = "center"; ctx.fillText(q.rot % 2 < 1 ? "\u266A" : "\u266B", sx, sy);
      } else if (q.k === "puff") {
        ctx.globalAlpha = al * 0.35; ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(sx, sy, sz * (1.8 - al * 0.8), 0, TAU); ctx.fill();
      } else if (q.k === "drop") {
        ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(sx, sy, sz * 0.6, 0, TAU); ctx.fill();
      } else if (q.k === "thorn") {
        ctx.fillStyle = q.c; ctx.save(); ctx.translate(sx, sy); ctx.rotate(q.rot); ctx.beginPath(); ctx.moveTo(0, -sz * 1.6); ctx.lineTo(sz * 0.45, sz * 0.6); ctx.lineTo(-sz * 0.45, sz * 0.6); ctx.closePath(); ctx.fill(); ctx.restore();
      } else if (q.k === "zap") {
        ctx.strokeStyle = q.c; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.lineTo(sx + rnd(-1, 1) * sz * 2, sy + rnd(-1, 1) * sz * 2); ctx.lineTo(sx + rnd(-1, 1) * sz * 3, sy + rnd(-1, 1) * sz * 3); ctx.stroke();
      } else if (q.k === "flake") {
        ctx.fillStyle = q.c; ctx.save(); ctx.translate(sx, sy); ctx.rotate(q.rot); ctx.fillRect(-sz / 2, -sz / 2, sz, sz); ctx.restore();
      } else { ctx.fillStyle = q.c; ctx.fillRect(sx - sz / 2, sy - sz / 2, sz, sz); }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- ground basis (exact projection of the world plane, ISO or flat) ---------- */
  function basis(g, s, st) {
    var px = st.player ? st.player.x : 0, py = st.player ? st.player.y : 0;
    var o = g(px, py), a = g(px + 1, py), b = g(px, py + 1);
    B.ex = a.x - o.x; B.ey = a.y - o.y; B.fx = b.x - o.x; B.fy = b.y - o.y; B.s = s;
  }
  function gBegin(ctx, x, y, zPx) {
    var o = G(x, y); ctx.save(); ctx.translate(o.x, o.y - (zPx || 0)); ctx.transform(B.ex, B.ey, B.fx, B.fy, 0, 0);
  }
  function scr(x, y, z) { var o = G(x, y); return { x: o.x, y: o.y - (z || 0) * S * 0.8 }; }

  /* ---------- shapes ---------- */
  function alloc() {
    var c = caps().shapes;
    if (FX.length >= c) { FX.shift(); stats.dropped++; }
    var f = { k: "", x: 0, y: 0, x2: 0, y2: 0, ang: 0, r: 1, t0: 0, dur: 0.4, p: null, o: null, seed: Math.random() * 1000, done: false, fol: false };
    FX.push(f); return f;
  }
  function addShape(sh, x, y, ang, p, extra) {
    var f = alloc();
    f.k = sh.k; f.x = x; f.y = y; f.ang = ang + (sh.rot || 0); f.r = sh.r == null ? 1 : sh.r; f.dur = sh.dur || 0.4; f.t0 = now + (sh.delay || 0);
    f.p = sh.pal ? pal(sh.pal) : p; f.o = sh; f.fol = !!sh.follow; f.x2 = extra && extra.x2 != null ? extra.x2 : x; f.y2 = extra && extra.y2 != null ? extra.y2 : y;
    f.emitted = false; f.id = CUR;
    return f;
  }
  var GROUND = { nova: 1, ripple: 1, zapring: 1, sigil: 1, scorch: 1, spin: 1, glyph: 1, plant: 1, cloud: 1, fan: 1, link: 1, shout: 1, streak: 1, cone: 1 };
  function ease(p) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3); }
  function band(ctx, r0, r1, a0, a1) {
    ctx.beginPath(); ctx.arc(0, 0, r1, a0, a1); ctx.arc(0, 0, Math.max(0.01, r0), a1, a0, true); ctx.closePath();
  }
  function jag(ctx, x0, y0, x1, y1, n, amp) {
    ctx.moveTo(x0, y0);
    for (var i = 1; i < n; i++) { var t = i / n; ctx.lineTo(x0 + (x1 - x0) * t + rnd(-amp, amp), y0 + (y1 - y0) * t + rnd(-amp * 0.4, amp * 0.4)); }
    ctx.lineTo(x1, y1);
  }
  function drawShape(ctx, f, layer) {
    var age = now - f.t0; if (age < 0) return;
    stats.drawn++; if (f.id) BYID[f.id] = (BYID[f.id] || 0) + 1;
    var p = Math.min(1, age / f.dur), o = f.o, pl = f.p, st = ST, hero = st.player;
    if (f.fol && hero) { f.x = hero.x; f.y = hero.y; }
    if (!f.emitted) {
      f.emitted = true;
      if (o.emit) emit(o.emit, o.emitAt === "end" ? f.x2 : f.x, o.emitAt === "end" ? f.y2 : f.y, o.emitZ || 0.3, f.ang, pl);
      if (o.shake && st.settings && st.settings.shake !== false) st.shake = Math.min(6, (st.shake || 0) + o.shake * (level() === 2 ? 1 : 0.6));
    }
    var isG = !!GROUND[f.k];
    if ((layer === "g") !== isG) return;
    var fade = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3, k = f.k, r = f.r;
    if (k === "slash" || k === "cleave" || k === "thrust") {
      var z = (o.z == null ? 0.45 : o.z) * S;
      gBegin(ctx, f.x, f.y, z); ctx.rotate(f.ang);
      if (k === "thrust") {
        var L = r * ease(p / 0.5), wd = (o.w || 0.3) * (1 - p * 0.6);
        ctx.globalAlpha = 0.85 * fade; ctx.fillStyle = col(pl, o.c || "main");
        ctx.beginPath(); ctx.moveTo(0.2, -wd); ctx.lineTo(L, 0); ctx.lineTo(0.2, wd); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = pl.core; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(0.25, 0); ctx.lineTo(L * 1.04, 0); ctx.stroke();
        if (o.rings) { for (var ri = 0; ri < o.rings; ri++) { var rp = (p * 1.6 - ri * 0.25); if (rp <= 0 || rp >= 1) continue; ctx.globalAlpha = (1 - rp) * 0.7; ctx.strokeStyle = col(pl, "edge"); ctx.lineWidth = 0.04; ctx.beginPath(); ctx.ellipse(L * rp, 0, 0.08, wd * 1.6 * (1 - rp * 0.5), 0, 0, TAU); ctx.stroke(); } }
      } else {
        var arc = o.arc || 1.2, sw = o.sweep || 1, a0 = -arc / 2 * sw, head = a0 + arc * sw * ease(p / 0.42), tail = a0 + arc * sw * ease((p - 0.2) / 0.6);
        var th = (o.w || 0.25), r1 = r, r0 = r - th;
        var lo = Math.min(head, tail), hi = Math.max(head, tail);
        ctx.globalAlpha = 0.75 * fade; ctx.fillStyle = col(pl, o.c || "main"); band(ctx, r0, r1, lo, hi); ctx.fill();
        if (k === "cleave") { ctx.globalAlpha = 0.45 * fade; ctx.fillStyle = col(pl, "edge"); band(ctx, r0 - th * 0.9, r0 - th * 0.15, lo, hi); ctx.fill(); }
        ctx.globalAlpha = fade; ctx.strokeStyle = pl.core; ctx.lineWidth = 0.045; ctx.beginPath(); ctx.arc(0, 0, r1, lo, hi); ctx.stroke();
        if (o.double) { ctx.globalAlpha = 0.6 * fade; ctx.beginPath(); ctx.arc(0, 0, r1 + 0.18, lo, hi); ctx.stroke(); }
      }
      ctx.restore();
      if (level() === 2 && p < 0.5) { var hs = scr(f.x + Math.cos(f.ang) * r * 0.7, f.y + Math.sin(f.ang) * r * 0.7, (o.z == null ? 0.45 : o.z)); drawGlow(ctx, hs.x, hs.y, S * r * 0.9, pl.glow, 0.45 * (1 - p * 2)); }
      return;
    }
    if (k === "spin") {
      gBegin(ctx, f.x, f.y, (o.z == null ? 0.3 : o.z) * S);
      var turns = o.turns || 1, hd = f.ang + TAU * turns * ease(p / 0.6), tl = hd - Math.min(TAU * 0.95, TAU * turns * 0.8);
      ctx.globalAlpha = 0.7 * fade; ctx.fillStyle = col(pl, o.c || "main"); band(ctx, r - (o.w || 0.3), r, tl, hd); ctx.fill();
      ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = pl.core; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(0, 0, r, tl, hd); ctx.stroke();
      if (o.ghost) { ctx.globalAlpha = 0.35 * fade; ctx.strokeStyle = col(pl, "edge"); ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(0, 0, r * (0.7 + p * 0.5), 0, TAU); ctx.stroke(); }
      ctx.restore(); return;
    }
    if (k === "nova" || k === "zapring" || k === "ripple" || k === "shout" || k === "sigil") {
      gBegin(ctx, f.x, f.y, 0);
      var R = r * ease(p / (o.grow || 0.55));
      if (k === "nova") {
        ctx.globalAlpha = 0.45 * fade; ctx.fillStyle = col(pl, o.fill || "edge"); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.arc(0, 0, Math.max(0.01, R * (0.55 + p * 0.4)), 0, TAU, true); ctx.fill();
        ctx.globalAlpha = 0.95 * fade; ctx.strokeStyle = col(pl, o.c || "main"); ctx.lineWidth = o.lw || 0.12; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
        if (o.petals) { ctx.fillStyle = pl.core; ctx.globalAlpha = 0.8 * fade; for (var i = 0; i < o.petals; i++) { var a = f.ang + i / o.petals * TAU + p; ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.12) * R * 0.75, Math.sin(a - 0.12) * R * 0.75); ctx.lineTo(Math.cos(a) * (R + 0.35), Math.sin(a) * (R + 0.35)); ctx.lineTo(Math.cos(a + 0.12) * R * 0.75, Math.sin(a + 0.12) * R * 0.75); ctx.closePath(); ctx.fill(); } }
      } else if (k === "zapring") {
        ctx.strokeStyle = col(pl, o.c || "main"); ctx.lineWidth = o.lw || 0.07; ctx.globalAlpha = fade;
        var n = o.n || 28; ctx.beginPath();
        for (var j = 0; j <= n; j++) { var aa = j / n * TAU, rj = R * (j % 2 ? 1 + rnd(-0.12, 0.12) : 1); j ? ctx.lineTo(Math.cos(aa) * rj, Math.sin(aa) * rj) : ctx.moveTo(Math.cos(aa) * rj, Math.sin(aa) * rj); }
        ctx.stroke(); ctx.strokeStyle = pl.core; ctx.lineWidth = 0.03; ctx.stroke();
        if (o.spokes) { ctx.globalAlpha = 0.7 * fade; ctx.beginPath(); for (var sp = 0; sp < o.spokes; sp++) { var as = f.seed + sp / o.spokes * TAU; jag(ctx, Math.cos(as) * 0.3, Math.sin(as) * 0.3, Math.cos(as) * R, Math.sin(as) * R, 5, 0.18); } ctx.stroke(); }
      } else if (k === "ripple") {
        for (var q2 = 0; q2 < (o.rings || 3); q2++) { var pp = p * 1.4 - q2 * 0.18; if (pp <= 0 || pp >= 1) continue; ctx.globalAlpha = (1 - pp) * 0.9; ctx.strokeStyle = q2 ? col(pl, "edge") : col(pl, "main"); ctx.lineWidth = 0.09 * (1 - pp) + 0.02; ctx.beginPath(); ctx.arc(0, 0, r * ease(pp), 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 0.25 * fade; ctx.fillStyle = col(pl, "edge"); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      } else if (k === "shout") {
        ctx.rotate(f.ang); ctx.strokeStyle = col(pl, "main"); ctx.lineWidth = 0.1;
        for (var c3 = 0; c3 < 3; c3++) { var pc = p * 1.3 - c3 * 0.15; if (pc <= 0 || pc >= 1) continue; ctx.globalAlpha = 1 - pc; ctx.beginPath(); ctx.arc(0, 0, r * ease(pc), -0.9, 0.9); ctx.stroke(); }
        ctx.globalAlpha = 0.6 * fade; ctx.beginPath(); ctx.arc(0, 0, R * 0.5, 0, TAU); ctx.stroke();
      } else {
        ctx.rotate(f.ang + p * (o.spinRate || 1.5));
        ctx.globalAlpha = 0.85 * fade; ctx.strokeStyle = col(pl, o.c || "main"); ctx.lineWidth = 0.07; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
        ctx.lineWidth = 0.035; ctx.beginPath(); ctx.arc(0, 0, R * 0.82, 0, TAU); ctx.stroke();
        var tk = o.ticks || 12; ctx.lineWidth = 0.06; ctx.strokeStyle = pl.core; ctx.beginPath();
        for (var t2 = 0; t2 < tk; t2++) { var at = t2 / tk * TAU; ctx.moveTo(Math.cos(at) * R * 0.84, Math.sin(at) * R * 0.84); ctx.lineTo(Math.cos(at) * R * 0.98, Math.sin(at) * R * 0.98); }
        ctx.stroke();
        if (o.star) { ctx.globalAlpha = 0.5 * fade; ctx.beginPath(); for (var s3 = 0; s3 <= o.star; s3++) { var a3 = s3 * 2 * TAU / o.star * (o.star % 2 ? 1 : 0.5); s3 ? ctx.lineTo(Math.cos(a3) * R * 0.8, Math.sin(a3) * R * 0.8) : ctx.moveTo(Math.cos(a3) * R * 0.8, Math.sin(a3) * R * 0.8); } ctx.stroke(); }
      }
      ctx.restore(); return;
    }
    if (k === "scorch") {
      gBegin(ctx, f.x, f.y, 0); ctx.globalAlpha = 0.5 * (1 - p); ctx.fillStyle = col(pl, o.c || "edge"); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.6 * (1 - p); ctx.strokeStyle = col(pl, "main"); ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(0, 0, r * 0.98, 0, TAU); ctx.stroke(); ctx.restore(); return;
    }
    if (k === "cloud") {
      gBegin(ctx, f.x, f.y, 0); var Rc = r * ease(p / 0.5); ctx.globalAlpha = 0.32 * fade; ctx.fillStyle = col(pl, "edge");
      for (var c4 = 0; c4 < 7; c4++) { var ac = f.seed + c4 * 0.9, rc = Rc * (0.35 + (c4 % 3) * 0.25); ctx.beginPath(); ctx.arc(Math.cos(ac) * rc, Math.sin(ac) * rc, Rc * 0.42, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 0.8 * fade; ctx.strokeStyle = col(pl, "main"); ctx.lineWidth = 0.05; ctx.setLineDash && ctx.setLineDash([0.18, 0.12]); ctx.beginPath(); ctx.arc(0, 0, Rc, 0, TAU); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
      ctx.restore(); return;
    }
    if (k === "glyph" || k === "plant") {
      gBegin(ctx, f.x, f.y, 0); ctx.rotate(f.ang);
      var Rg = r * (k === "plant" ? ease(p / 0.3) : 1); ctx.globalAlpha = fade; ctx.strokeStyle = col(pl, "main"); ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.arc(0, 0, Rg, 0, TAU); ctx.stroke();
      var sp2 = o.spikes || 6; ctx.fillStyle = col(pl, "core");
      for (var i2 = 0; i2 < sp2; i2++) { var ag = i2 / sp2 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(ag - 0.2) * Rg * 0.4, Math.sin(ag - 0.2) * Rg * 0.4); ctx.lineTo(Math.cos(ag) * Rg * 1.15, Math.sin(ag) * Rg * 1.15); ctx.lineTo(Math.cos(ag + 0.2) * Rg * 0.4, Math.sin(ag + 0.2) * Rg * 0.4); ctx.closePath(); ctx.fill(); }
      ctx.restore(); return;
    }
    if (k === "fan" || k === "cone") {
      gBegin(ctx, f.x, f.y, 0.2 * S); ctx.rotate(f.ang); var sp3 = o.spread || 0.6, nr = o.n || 3, Lf = r * ease(p / 0.4);
      if (k === "cone") { ctx.globalAlpha = 0.35 * fade; ctx.fillStyle = col(pl, "edge"); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, Lf, -sp3 / 2, sp3 / 2); ctx.closePath(); ctx.fill(); }
      ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = col(pl, "main"); ctx.lineWidth = 0.05; ctx.beginPath();
      for (var i3 = 0; i3 < nr; i3++) { var af = nr > 1 ? -sp3 / 2 + sp3 * i3 / (nr - 1) : 0; ctx.moveTo(Math.cos(af) * 0.3, Math.sin(af) * 0.3); ctx.lineTo(Math.cos(af) * Lf, Math.sin(af) * Lf); }
      ctx.stroke(); ctx.restore(); return;
    }
    if (k === "streak") {
      var a1 = G(f.x, f.y), b1 = G(f.x2, f.y2), zz = 0.5 * S * 0.8;
      ctx.save(); ctx.globalAlpha = 0.7 * (1 - p); ctx.strokeStyle = col(pl, "main"); ctx.lineCap = "round";
      ctx.lineWidth = S * (o.w || 0.35) * (1 - p * 0.7); ctx.beginPath(); ctx.moveTo(a1.x, a1.y - zz); ctx.lineTo(b1.x, b1.y - zz); ctx.stroke();
      ctx.strokeStyle = pl.core; ctx.lineWidth = Math.max(1.5, S * 0.06); ctx.stroke();
      var gh = level() === 2 ? (o.ghosts || 3) : 1;
      for (var g2 = 1; g2 <= gh; g2++) {
        var tg = g2 / (gh + 1), gx = a1.x + (b1.x - a1.x) * tg, gy = a1.y + (b1.y - a1.y) * tg;
        ctx.globalAlpha = 0.35 * (1 - p) * tg; ctx.fillStyle = col(pl, "edge"); ctx.beginPath(); ctx.ellipse(gx, gy - S * 0.55, S * 0.16, S * 0.5, 0, 0, TAU); ctx.fill();
      }
      ctx.restore(); return;
    }
    if (k === "link") {
      var tg2 = linkTargets(o.to, f), hs2 = scr(f.x, f.y, 0.6);
      ctx.save(); ctx.strokeStyle = col(pl, "main"); ctx.lineWidth = Math.max(1.5, S * 0.05); ctx.globalAlpha = 0.9 * fade; ctx.beginPath();
      for (var l = 0; l < tg2.length; l++) { var ts = scr(tg2[l].x, tg2[l].y, 0.4); var mx = hs2.x + (ts.x - hs2.x) * ease(p / 0.3), my = hs2.y + (ts.y - hs2.y) * ease(p / 0.3); o.jag ? jag(ctx, hs2.x, hs2.y, mx, my, 6, S * 0.12) : (ctx.moveTo(hs2.x, hs2.y), ctx.lineTo(mx, my)); }
      ctx.stroke(); ctx.restore();
      if (level() === 2) for (var l2 = 0; l2 < tg2.length; l2++) { var tp = scr(tg2[l2].x, tg2[l2].y, 0.4); drawGlow(ctx, tp.x, tp.y, S * 0.6, pl.glow, 0.6 * fade); }
      return;
    }
    if (k === "bolt" || k === "meteor" || k === "pillar" || k === "dome" || k === "swirl" || k === "veil" || k === "burst" || k === "flash") {
      var base = scr(f.x, f.y, 0);
      if (k === "bolt") {
        if (p < 0.55) { var top = scr(f.x + rnd(-0.3, 0.3), f.y - 0.5, 7); ctx.save(); ctx.globalAlpha = 1 - p / 0.55; ctx.strokeStyle = pl.glow; ctx.lineWidth = Math.max(4, S * 0.18); ctx.beginPath(); jag(ctx, top.x, top.y, base.x, base.y, 9, S * 0.35); ctx.stroke(); ctx.strokeStyle = pl.core; ctx.lineWidth = Math.max(1.5, S * 0.05); ctx.stroke(); ctx.restore(); }
        drawGlow(ctx, base.x, base.y, S * r * 1.4, pl.glow, (1 - p) * 0.9);
      } else if (k === "meteor") {
        var fall = Math.min(1, p / 0.4), mz = (1 - fall) * 6, mp = scr(f.x - (1 - fall) * 1.2, f.y - (1 - fall) * 0.6, mz);
        if (fall < 1) { ctx.save(); ctx.fillStyle = pl.core; ctx.strokeStyle = col(pl, "main"); ctx.lineWidth = Math.max(3, S * 0.14); ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.moveTo(mp.x - S * 0.9, mp.y - S * 0.6); ctx.lineTo(mp.x, mp.y); ctx.stroke(); ctx.beginPath(); ctx.arc(mp.x, mp.y, Math.max(3, S * 0.16), 0, TAU); ctx.fill(); ctx.restore(); drawGlow(ctx, mp.x, mp.y, S * 0.7, pl.glow, 0.8); }
        else drawGlow(ctx, base.x, base.y, S * r * 1.2, pl.glow, (1 - p) * 1.2);
      } else if (k === "pillar") {
        var hgt = S * (o.h || 2.4) * ease(p / 0.3), wid = S * (o.w || 0.45) * (1 - p * 0.5);
        ctx.save(); var gr = ctx.createLinearGradient(0, base.y - hgt, 0, base.y); gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, pl.glow);
        ctx.globalAlpha = 0.85 * fade; ctx.fillStyle = gr; ctx.fillRect(base.x - wid / 2, base.y - hgt, wid, hgt);
        ctx.fillStyle = pl.core; ctx.fillRect(base.x - wid * 0.12, base.y - hgt, wid * 0.24, hgt); ctx.restore();
      } else if (k === "dome") {
        var rs = S * r * ease(p / 0.35); ctx.save(); ctx.globalAlpha = 0.25 * fade; ctx.fillStyle = col(pl, "edge");
        ctx.beginPath(); ctx.ellipse(base.x, base.y - rs * 0.55, rs, rs * 0.95, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = col(pl, "main"); ctx.lineWidth = Math.max(2, S * 0.06); ctx.stroke();
        ctx.strokeStyle = pl.core; ctx.lineWidth = Math.max(1.5, S * 0.04); ctx.beginPath(); ctx.ellipse(base.x, base.y - rs * 0.55, rs * 0.8, rs * 0.75, 0, -2.6, -1.4); ctx.stroke();
        if (o.hex) { ctx.globalAlpha = 0.5 * fade; ctx.beginPath(); for (var h = 0; h < 6; h++) { var ah = h / 6 * TAU + f.seed; ctx.moveTo(base.x, base.y - rs * 0.55); ctx.lineTo(base.x + Math.cos(ah) * rs, base.y - rs * 0.55 + Math.sin(ah) * rs * 0.95); } ctx.stroke(); }
        ctx.restore();
      } else if (k === "swirl" || k === "veil") {
        ctx.save(); var nn = k === "veil" ? 10 : 8;
        for (var v = 0; v < nn; v++) { var av = f.seed + v / nn * TAU + p * 7 * (k === "veil" ? -1 : 1), rv = S * r * (k === "veil" ? 0.6 + p * 0.6 : 0.8 - p * 0.4), hv = S * (0.2 + p * 1.3 + (v % 3) * 0.12);
          ctx.globalAlpha = (k === "veil" ? 0.5 : 0.85) * fade; ctx.fillStyle = v % 2 ? col(pl, "main") : col(pl, k === "veil" ? "edge" : "core");
          ctx.beginPath(); ctx.arc(base.x + Math.cos(av) * rv, base.y - hv + Math.sin(av) * rv * 0.35, Math.max(2, S * (k === "veil" ? 0.16 : 0.06)), 0, TAU); ctx.fill(); }
        ctx.restore();
      } else if (k === "burst") {
        ctx.save(); var nb = o.n || 10, Rb = S * r * ease(p / 0.35); ctx.strokeStyle = col(pl, "main"); ctx.lineWidth = Math.max(2, S * 0.06); ctx.globalAlpha = fade; ctx.beginPath();
        for (var bb = 0; bb < nb; bb++) { var ab = f.seed + bb / nb * TAU; ctx.moveTo(base.x + Math.cos(ab) * Rb * 0.3, base.y - S * 0.4 + Math.sin(ab) * Rb * 0.3 * 0.6); ctx.lineTo(base.x + Math.cos(ab) * Rb, base.y - S * 0.4 + Math.sin(ab) * Rb * 0.6); }
        ctx.stroke(); ctx.restore(); drawGlow(ctx, base.x, base.y - S * 0.4, S * r, pl.glow, 0.7 * (1 - p));
      } else {
        drawGlow(ctx, base.x, base.y - S * 0.5, S * r * 1.5, pl.glow, (1 - p) * 1.1);
      }
    }
  }
  function linkTargets(to, f) {
    var st = ST, out = [];
    if (to === "friends") { var fr = st.world && st.world.friends || []; for (var i = 0; i < fr.length; i++) if (!fr[i].dead) out.push(fr[i]); }
    else if (to === "traps") { var tr = st.world && st.world.traps || []; for (var j = 0; j < tr.length; j++) out.push(tr[j]); if (!out.length && f._traps) out = f._traps; }
    else if (to === "foes") { var ms = st.world && st.world.monsters || [], hero = st.player; for (var k = 0; k < ms.length && out.length < 6; k++) if (!ms[k].dead && Math.hypot(ms[k].x - hero.x, ms[k].y - hero.y) < (f.r || 5)) out.push(ms[k]); }
    return out;
  }

  /* ---------- casting ---------- */
  function pre(e, sk) {
    if (!on() || !sk) return null;
    var pl = e.player, def = skillDef(sk.id);
    if (def) lastCast = { id: sk.id, t: now, win: def.window || 0.6 };
    return { n: (e.projectiles || []).length, x: pl.x, y: pl.y, face: pl.facing || 0, traps: (e.world && e.world.traps || []).map(function (t) { return { x: t.x, y: t.y }; }) };
  }
  function aimPoint(e, def, k) {
    var pl = e.player, rng = def.aim || 5, best = null, bd = 1e9, ms = e.world && e.world.monsters || [];
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i]; if (m.dead) continue;
      var dx = m.x - pl.x, dy = m.y - pl.y, d = Math.hypot(dx, dy); if (d > rng) continue;
      var da = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - pl.facing), Math.cos(Math.atan2(dy, dx) - pl.facing)));
      if (da > 1.0) continue; if (d < bd) { bd = d; best = m; }
    }
    if (best) return { x: best.x, y: best.y };
    return { x: pl.x + Math.cos(pl.facing) * Math.min(rng, 4), y: pl.y + Math.sin(pl.facing) * Math.min(rng, 4) };
  }
  function post(e, sk, rank, k) {
    if (!k || !on()) return;
    try {
      var def = skillDef(sk.id); if (!def) return;
      stats.casts++; CUR = sk.id;
      var pl = e.player, p = pal(def.pal), face = pl.facing || 0;
      var np = e.projectiles || [];
      for (var i = k.n; i < np.length; i++) { var b = np[i]; if (b && b.owner === "player" && !b.fx) { b.fx = sk.id; b._tr = []; if (b.damage) b.damage.fx = sk.id; } }
      setPose(pl, def.pose, face);
      var aim = null;
      var shapes = def.shapes || [];
      for (var j = 0; j < shapes.length; j++) {
        var sh = shapes[j], at = sh.at || "hero", x = pl.x, y = pl.y, ex = null;
        if (at === "aim") { aim = aim || aimPoint(e, def, k); x = aim.x; y = aim.y; }
        else if (at === "start") { x = k.x; y = k.y; }
        else if (at === "path") { x = k.x; y = k.y; ex = { x2: pl.x, y2: pl.y }; }
        else if (at === "ahead") { x = pl.x + Math.cos(face) * (sh.dist || 1); y = pl.y + Math.sin(face) * (sh.dist || 1); }
        else if (at === "friends") { var fr = e.world && e.world.friends || []; for (var q = 0; q < fr.length; q++) if (!fr[q].dead) addShape(sh, fr[q].x, fr[q].y, face, p); continue; }
        else if (at === "traps") { var tr = (e.world && e.world.traps && e.world.traps.length) ? e.world.traps : k.traps; for (var q2 = 0; q2 < tr.length; q2++) addShape(sh, tr[q2].x, tr[q2].y, face, p); continue; }
        else if (at === "arc") { var n = sh.n || 3, spr = sh.spread || 0.6; for (var q3 = 0; q3 < n; q3++) { var a = face - spr / 2 + spr * (n > 1 ? q3 / (n - 1) : 0.5); addShape(sh, pl.x + Math.cos(a) * (sh.dist || 2), pl.y + Math.sin(a) * (sh.dist || 2), a, p); } continue; }
        else if (at === "ring") { var n2 = sh.n || 8, rr2 = sh.dist || 2.3; for (var q4 = 0; q4 < n2; q4++) { var a2 = q4 / n2 * TAU; addShape(sh, pl.x + Math.cos(a2) * rr2, pl.y + Math.sin(a2) * rr2, a2, p); } continue; }
        var f = addShape(sh, x, y, face, p, ex);
        if (f && sh.k === "link" && sh.to === "traps") f._traps = k.traps;
      }
      if (def.proj && def.proj.muzzle !== false) addShape({ k: "flash", r: def.proj.muzzle || 0.45, dur: 0.18 }, pl.x + Math.cos(face) * 0.5, pl.y + Math.sin(face) * 0.5, face, p);
      if (def.castEmit) emit(def.castEmit, pl.x, pl.y, 0.6, face, p);
    } catch (err) { errs++; if (w.console) console.warn("skillfx post", err); }
    CUR = null;
  }
  function setPose(pl, name, face) {
    var ps = D.poses && D.poses[name || "strike"]; if (!ps) return;
    pl.fxPose = { n: name, anim: ps.anim, fb: ps.fb || "strike", t0: now, dur: ps.dur || 0.3, face: face, spin: ps.spin || 0, hop: ps.hop || 0, lean: ps.lean || 0, loops: ps.loops || 0 };
    stats.poses++;
  }
  function realHas(anim) { return !!(w.abRealOn && w.abRealOn() && w.abRealHas && w.abRealHas(anim)); }
  function pose(ent, R) {
    var f = ent && ent.fxPose; if (!f || !on() || ent.dead) return R;
    var p = (now - f.t0) / f.dur; if (p < 0 || p >= 1) { if (p >= 1) ent.fxPose = null; return R; }
    var anim = realHas(f.anim) ? f.anim : f.fb, n = (w.abRealFrames && w.abRealFrames(anim)) || 4;
    if (anim === "strike") n = 4;
    var fr = f.loops ? Math.floor(p * n * f.loops) % n : Math.min(n - 1, Math.floor(p * n));
    var face = f.spin ? f.face + TAU * f.spin * p : R.face;
    return { mode: anim, frame: fr, face: face, fx: f.n };
  }
  function heroLift(s) {
    var pl = w.ASHBOUND && w.ASHBOUND.state && w.ASHBOUND.state.player, f = pl && pl.fxPose; if (!f || !f.hop || !on()) return 0;
    var p = (now - f.t0) / f.dur; if (p < 0 || p >= 1) return 0;
    return -Math.sin(Math.min(1, p / 0.7) * Math.PI) * f.hop * s;
  }

  /* ---------- impacts ---------- */
  function onHit(ev) {
    if (!on() || !ev || ev.source !== "player" || ev.kind === "dot" || ev.kind === "thorns") return;
    var id = ev.fx || (lastCast && now - lastCast.t <= lastCast.win ? lastCast.id : null); if (!id) return;
    var def = skillDef(id); if (!def || !def.impact) return;
    if (hitBudget <= 0) return; hitBudget--;
    stats.impacts++;
    var t = ev.target, im = def.impact, p = pal(im.pal || def.pal);
    emit(im.emit || { n: 6, kind: "spark", speed: [2, 5], life: [0.2, 0.4] }, t.x, t.y, 0.5, 0, p, ev.crit ? 1.5 : 1);
    if (im.ring && level() > 0) addShape({ k: "nova", r: im.ring, dur: 0.22, grow: 0.5, lw: 0.06 }, t.x, t.y, 0, p);
    if (im.shake && ev.amount >= (im.shakeMin || 0) && ST && ST.settings && ST.settings.shake !== false) ST.shake = Math.min(6, (ST.shake || 0) + im.shake);
    if (im.flash) t.flash = Math.max(t.flash || 0, im.flash);
  }

  /* ---------- auras on the hero while a buff runs ---------- */
  function drawAuras(ctx, layer) {
    var st = ST, pl = st.player; if (!pl || !D.auras) return;
    var bs = pl.buffs || [];
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i]; if (!(b.remaining > 0)) continue;
      var a = D.auras[b.id]; if (!a) continue;
      if (layer === "g") stats.auras++;
      var p = pal(a.pal), k = a.k, base = scr(pl.x, pl.y, 0), pulse = 0.75 + Math.sin(now * (a.rate || 4)) * 0.25;
      if (layer === "g") {
        if (k === "ring" || k === "blood" || k === "calm") {
          var R = a.r === "aura" ? (b.aura && b.aura.radius || 4) : (a.r || 1);
          gBegin(ctx, pl.x, pl.y, 0); ctx.rotate(now * (a.spin || 0.4));
          ctx.globalAlpha = 0.18 * pulse; ctx.fillStyle = col(p, "edge"); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.75; ctx.strokeStyle = col(p, "main"); ctx.lineWidth = 0.06; ctx.setLineDash && ctx.setLineDash(k === "calm" ? [] : [0.35, 0.2]); ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
          if (a.ticks) { ctx.strokeStyle = p.core; ctx.lineWidth = 0.05; ctx.beginPath(); for (var t = 0; t < a.ticks; t++) { var at = t / a.ticks * TAU; ctx.moveTo(Math.cos(at) * R * 0.9, Math.sin(at) * R * 0.9); ctx.lineTo(Math.cos(at) * R * 1.04, Math.sin(at) * R * 1.04); } ctx.stroke(); }
          ctx.restore();
        } else {
          gBegin(ctx, pl.x, pl.y, 0); ctx.globalAlpha = 0.35 * pulse; ctx.fillStyle = col(p, "edge"); ctx.beginPath(); ctx.arc(0, 0, a.r || 0.8, 0, TAU); ctx.fill(); ctx.restore();
        }
        continue;
      }
      if (k === "shell") {
        var rs = S * (a.r || 0.75); ctx.save(); ctx.globalAlpha = 0.18 + 0.1 * pulse; ctx.fillStyle = col(p, "edge"); ctx.beginPath(); ctx.ellipse(base.x, base.y - S * 0.55, rs, rs * 1.05, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.65; ctx.strokeStyle = col(p, "main"); ctx.lineWidth = Math.max(1.5, S * 0.04); ctx.stroke();
        var frac = b.absorbMax ? Math.max(0, Math.min(1, b.absorb / b.absorbMax)) : 1; ctx.globalAlpha = 0.95; ctx.strokeStyle = p.core; ctx.lineWidth = Math.max(2, S * 0.06);
        ctx.beginPath(); ctx.ellipse(base.x, base.y - S * 0.55, rs, rs * 1.05, 0, -Math.PI / 2, -Math.PI / 2 + TAU * frac); ctx.stroke();
        var cy = base.y - S * 0.55, pat = a.pat; ctx.strokeStyle = col(p, "main"); ctx.lineWidth = Math.max(1, S * 0.025); ctx.globalAlpha = 0.55 * pulse; ctx.beginPath();
        if (pat === "hex") { for (var h = 0; h < 6; h++) { var ah = h / 6 * TAU + now * 0.3; ctx.moveTo(base.x + Math.cos(ah) * rs, cy + Math.sin(ah) * rs * 1.05); ctx.lineTo(base.x + Math.cos(ah + TAU / 6) * rs, cy + Math.sin(ah + TAU / 6) * rs * 1.05); ctx.moveTo(base.x, cy); ctx.lineTo(base.x + Math.cos(ah) * rs, cy + Math.sin(ah) * rs * 1.05); } }
        else if (pat === "wave") { for (var wv = -1; wv <= 1; wv++) { var yy = cy + wv * rs * 0.4; ctx.moveTo(base.x - rs * 0.9, yy); for (var q = 1; q <= 12; q++) ctx.lineTo(base.x - rs * 0.9 + q / 12 * rs * 1.8, yy + Math.sin(q * 1.2 + now * 4 + wv) * rs * 0.08); } }
        else if (pat === "cracks") { for (var c2 = 0; c2 < 5; c2++) { var ac = c2 * 1.37 + 0.4; ctx.moveTo(base.x, cy); ctx.lineTo(base.x + Math.cos(ac) * rs * 0.5, cy + Math.sin(ac) * rs * 0.45); ctx.lineTo(base.x + Math.cos(ac + 0.3) * rs * 0.95, cy + Math.sin(ac + 0.3) * rs); } }
        else if (pat === "facets") { for (var fa = 0; fa < 8; fa++) { var af = fa / 8 * TAU + now * 0.8; ctx.moveTo(base.x + Math.cos(af) * rs * 0.55, cy + Math.sin(af) * rs * 0.55); ctx.lineTo(base.x + Math.cos(af) * rs, cy + Math.sin(af) * rs * 1.05); } }
        else if (pat === "bands") { for (var bd = -2; bd <= 2; bd++) { ctx.moveTo(base.x - rs * Math.sqrt(1 - bd * bd / 9), cy + bd * rs * 0.33); ctx.lineTo(base.x + rs * Math.sqrt(1 - bd * bd / 9), cy + bd * rs * 0.33); } }
        else if (pat === "leaves") { for (var lf = 0; lf < 6; lf++) { var al = lf / 6 * TAU + now * 1.2, lx = base.x + Math.cos(al) * rs * 0.85, ly = cy + Math.sin(al) * rs * 0.9; ctx.moveTo(lx + S * 0.07, ly); ctx.ellipse(lx, ly, S * 0.07, S * 0.035, al, 0, TAU); } }
        ctx.stroke(); ctx.restore();
      } else if (k === "flames") {
        drawGlow(ctx, base.x, base.y - S * 0.5, S * 1.3, p.glow, 0.5 * pulse);
        if (Math.random() < dt * (a.emitRate || 30)) emit({ n: 1, kind: "ember", speed: [0.2, 0.8], up: [1.5, 3], life: [0.4, 0.8], size: [2, 3.5], ring: [0.2, 0.5], colors: ["main", "core"], gravity: 0, drag: 1 }, pl.x, pl.y, 0.2, 0, p);
      } else if (k === "motes") {
        var n = a.stacksFrom ? (b.stacks || 0) : (a.n || 5); n = Math.min(n, 10);
        ctx.save(); ctx.fillStyle = col(p, "main");
        for (var m = 0; m < n; m++) { var am = now * 3 + m / Math.max(1, n) * TAU, mx = base.x + Math.cos(am) * S * 0.55, my = base.y - S * 0.6 + Math.sin(am) * S * 0.2;
          ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(mx, my, Math.max(2, S * 0.06), 0, TAU); ctx.fill(); drawGlow(ctx, mx, my, S * 0.22, p.glow, 0.6); }
        ctx.restore();
      } else if (k === "shadow") {
        ctx.save(); ctx.globalAlpha = 0.35 * pulse; ctx.fillStyle = col(p, "edge"); ctx.beginPath(); ctx.ellipse(base.x, base.y - S * 0.55, S * 0.55, S * 0.8, 0, 0, TAU); ctx.fill(); ctx.restore();
        if (Math.random() < dt * (a.emitRate || 14)) emit({ n: 1, kind: "puff", speed: [0.1, 0.4], up: [0.4, 1], life: [0.6, 1.1], size: [5, 9], ring: [0.1, 0.4], colors: ["edge", "main"], lit: false }, pl.x, pl.y, 0.3, 0, p);
      } else if (k === "storm") {
        if (Math.random() < dt * (a.emitRate || 30)) emit({ n: 1, kind: "flake", speed: [1.5, 3], up: [0.2, 0.8], life: [0.4, 0.7], size: [2, 3], ring: [0.5, 0.9], colors: ["main", "core"] }, pl.x, pl.y, 0.4, 0, p);
        drawGlow(ctx, base.x, base.y - S * 0.5, S * 1.0, p.glow, 0.35 * pulse);
      } else {
        drawGlow(ctx, base.x, base.y - S * 0.5, S * (a.r || 1), p.glow, 0.45 * pulse);
        if (a.emit && Math.random() < dt * (a.emitRate || 10)) emit(a.emit, pl.x, pl.y, 0.3, 0, p);
      }
    }
  }

  /* ---------- buff row by the life orb ---------- */
  var row = null, rowT = 0, rowSig = "";
  function iconUrl(id) { try { return w.ABSkillArt && w.ABSkillArt.url ? w.ABSkillArt.url(id) : null; } catch (e) { return null; } }
  var CSS = "#fx-buffs{position:fixed;z-index:30;transform:translateX(-50%);display:none;gap:4px;pointer-events:none}" +
    ".fxb{position:relative;width:26px;height:26px;border-radius:6px;border:1.5px solid var(--fxc);box-shadow:0 0 6px var(--fxc);background:#140e0c;overflow:hidden}" +
    ".fxb img{width:100%;height:100%;display:block}.fxb-l{display:block;text-align:center;font:700 14px/24px Georgia,serif;color:var(--fxc)}" +
    ".fxb-dr{position:absolute;inset:0}.fxb-t{position:absolute;left:0;right:0;bottom:-1px;font:700 11px/12px Georgia,serif;color:#fff;text-align:center;text-shadow:0 0 3px #000,0 0 2px #000,0 0 1px #000}" +
    ".fxb-low{animation:fxbBlink .35s infinite alternate}@keyframes fxbBlink{to{opacity:.45}}" +
    // v84l: the reskin's "html.ua-ready.rk .skill-btn" box-shadow !important out-ranked the glow, and an animation cannot
    // beat !important, so the ready glow never showed; match its specificity and pulse with filter instead.
    ".skill-btn.fx-ready,html.ua-ready.rk .skill-btn.fx-ready,html.ua-ready.rk #cast .skill-btn.fx-ready{box-shadow:0 0 0 2px var(--fxr),0 0 16px 5px var(--fxr),0 4px 10px rgba(0,0,0,.6)!important;animation:fxReady .9s ease-in-out infinite}" +
    "@keyframes fxReady{50%{filter:brightness(1.3) drop-shadow(0 0 6px var(--fxr))}}" +
    "body.fx-lowmotion .skill-btn.fx-ready{animation:none}";
  function css() { if (css.done || !document.head) return; css.done = true; var st = document.createElement("style"); st.id = "fx-style"; st.textContent = CSS; document.head.appendChild(st); }
  function updateRow(st) {
    if ((rowT -= dt) > 0) return; rowT = 0.2; css();
    if (st.ui && (st.ui.panel || st.ui.talk)) { if (row) row.style.display = "none"; return; }
    var hud = document.getElementById("hud"), orb = document.getElementById("life-orb");
    if (!hud || !orb || st.mode !== "play") { if (row) row.style.display = "none"; return; }
    if (!row) { row = document.createElement("div"); row.id = "fx-buffs"; row.setAttribute("aria-label", "Active effects"); document.body.appendChild(row); }
    var bs = (st.player.buffs || []).filter(function (b) { return b.remaining > 0 && b.remaining < 1e6 && (D.auras && D.auras[b.id] || skillDef(b.id) || (D.buffRow && D.buffRow.extra && D.buffRow.extra[b.id])); });
    if (!bs.length) { row.style.display = "none"; return; }
    var r = orb.getBoundingClientRect(), mo = document.getElementById("mana-orb"), r2 = mo ? mo.getBoundingClientRect() : r, sb = document.getElementById("stam-bar"), rs = sb ? sb.getBoundingClientRect() : null;
    var top = Math.min(r.top, rs && rs.height ? rs.top : r.top) - 30, cx = (r.left + r2.right) / 2;
    row.style.display = "flex"; row.style.top = Math.max(4, top) + "px"; row.style.left = cx + "px";
    var sig = bs.map(function (b) { return b.id; }).join(",");
    if (sig !== rowSig) {
      rowSig = sig;
      row.innerHTML = bs.map(function (b) {
        var u = iconUrl(b.id), def = skillDef(b.id) || {}, p = pal((D.auras && D.auras[b.id] && D.auras[b.id].pal) || def.pal || "steel");
        return '<div class="fxb" data-id="' + b.id + '" style="--fxc:' + p.main + '">' + (u ? '<img alt="" src="' + u + '">' : '<span class="fxb-l">' + String(b.name || b.id).charAt(0) + "</span>") + '<i class="fxb-dr"></i><b class="fxb-t"></b></div>';
      }).join("");
    }
    var els = row.children;
    for (var i = 0; i < bs.length && i < els.length; i++) {
      var b = bs[i], max = b._fxMax = Math.max(b._fxMax || 0, b.remaining), frac = Math.max(0, Math.min(1, b.remaining / (max || 1)));
      els[i].querySelector(".fxb-dr").style.background = "conic-gradient(rgba(0,0,0,0.62) " + Math.round((1 - frac) * 360) + "deg, rgba(0,0,0,0) 0)";
      els[i].querySelector(".fxb-t").textContent = b.remaining >= 9.5 ? Math.round(b.remaining) : b.remaining.toFixed(1);
      els[i].classList.toggle("fxb-low", b.remaining < 2);
      els[i].title = (b.name || b.id) + " " + Math.ceil(b.remaining) + "s";
    }
  }

  /* ---------- "use it now" cues on skill buttons + matching hero glow ---------- */
  var readyT = 0, readyIds = {}, readyColor = null, readyFlash = 0;
  function condOk(st, id, c) {
    var pl = st.player, w0 = st.world || {}, sheet = st.sheet || {};
    if (c.traps) { var n = (w0.traps || []).length; if (n < c.traps) return false; }
    if (c.friends) { var f = 0, fr = w0.friends || []; for (var i = 0; i < fr.length; i++) if (!fr[i].dead) f++; if (f < c.friends) return false; }
    if (c.foes) { var m = 0, ms = w0.monsters || [], R = c.r || 2.5; for (var j = 0; j < ms.length; j++) { var q = ms[j]; if (!q.dead && !q.friendly && Math.hypot(q.x - pl.x, q.y - pl.y) <= R + (q.radius || 0.3)) m++; } if (m < c.foes) return false; }
    if (c.lifeBelow != null) { var L = sheet.life || pl.maxHp || 1; if (pl.hp / L >= c.lifeBelow) return false; }
    if (c.manaBelow != null) { var M = sheet.mana || 1; if (pl.mana / M >= c.manaBelow) return false; }
    if (c.poisoned && !(pl.poison && pl.poison.t > 0)) return false;
    if (c.noBuff) { var bs = pl.buffs || []; for (var k = 0; k < bs.length; k++) if (bs[k].id === (c.noBuff === true ? id : c.noBuff) && bs[k].remaining > 0) return false; }
    if (c.stacks) { var bb = (pl.buffs || []).find(function (x) { return x.id === c.stacks[0]; }); if (!bb || (bb.stacks || 0) < c.stacks[1]) return false; }
    if (c.boss) { var hasB = (w0.monsters || []).some(function (x) { return x.boss && !x.dead && Math.hypot(x.x - pl.x, x.y - pl.y) < (c.r || 8); }); if (!hasB) return false; }
    return true;
  }
  function updateReady(st) {
    if ((readyT -= dt) > 0) return; readyT = 0.15;
    var pl = st.player, bar = pl.bar || [], any = null;
    for (var i = 0; i < 4; i++) {
      var id = bar[i], el = document.getElementById("skill-" + i); if (!el) continue;
      var def = id && skillDef(id), ok = false;
      if (def && def.ready && !((pl.cooldowns || {})[id] > 0) && st.mode === "play") {
        ok = condOk(st, id, def.ready);
        if (ok && def.ready.mana !== false && pl.mana < 1) ok = false;
      }
      var was = !!readyIds[i];
      if (ok !== was) {
        readyIds[i] = ok; el.classList.toggle("fx-ready", ok);
        if (ok) { el.style.setProperty("--fxr", pal(def.pal).main); readyFlash = 0.5; stats.ready++; }
      } else if (ok && !el.classList.contains("fx-ready")) { el.classList.add("fx-ready"); el.style.setProperty("--fxr", pal(def.pal).main); }
      if (ok && !any) any = pal(def.pal);
    }
    readyColor = any;
  }
  function drawReadyHero(ctx) {
    if (!readyColor) { readyFlash = 0; return; }
    var pl = ST.player, b = scr(pl.x, pl.y, 0), pulse = 0.6 + Math.sin(now * 5) * 0.25;
    gBegin(ctx, pl.x, pl.y, 0); ctx.globalAlpha = 0.55 * pulse + readyFlash; ctx.strokeStyle = readyColor.main; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.arc(0, 0, 0.62 + readyFlash * 0.6, 0, TAU); ctx.stroke(); ctx.restore();
    drawGlow(ctx, b.x, b.y - S * 0.55, S * (0.9 + readyFlash), readyColor.glow, 0.35 * pulse + readyFlash);
    readyFlash = Math.max(0, readyFlash - dt * 1.2);
  }

  /* ---------- enemy wind-ups ---------- */
  function tcfg() { return (D && D.telegraph) || {}; }
  function warnElite(e, m, packet) {
    if (!on()) return false;
    var c = tcfg(); if (!c.eliteWarn) return false;
    if (!(m && (m.rank === "elite" || m.rank === "champion" || m.mini || m.boss))) return false;
    var L = Math.max(1, e.sheet && e.sheet.life || e.player.hp || 1), s = (packet.phys || 0) + (packet.fire || 0) + (packet.cold || 0) + (packet.light || 0);
    return s > L * (c.eliteWarnPct || 0.1);
  }
  function leapWind(m) { if (!on()) return 0; var c = tcfg(); stats.wind++; return m.charge ? (c.chargeWindup || 0) : (c.leapWindup || 0); }
  function drawWindups(ctx, layer) {
    var c = tcfg(), ms = ST.world && ST.world.monsters || [], boss = false;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i]; if (m.dead) continue;
      var tl = m.telegraph, armed = m.leapArmed && m.leapCd > 0;
      if (!tl && !armed) continue;
      var big = m.boss || m.mini || m.rank === "elite" || m.rank === "champion";
      var prog = tl ? 1 - tl.t / (tl.max || 0.5) : 1 - m.leapCd / Math.max(0.05, (m.charge ? c.chargeWindup : c.leapWindup) || 0.35);
      prog = Math.max(0, Math.min(1, prog));
      var colr = m.boss ? (c.bossColor || "#ff3020") : big ? (c.eliteColor || "#ff7a20") : (c.color || "#ffb040");
      if (m.boss) boss = true;
      if (layer === "g") {
        if (armed) {
          gBegin(ctx, m.x, m.y, 0); ctx.rotate(m.leapDir || m.facing || 0); var L = c.leapLen || 2.2, wd = (m.radius || 0.35) + 0.15;
          ctx.globalAlpha = 0.28; ctx.fillStyle = colr; ctx.fillRect(0, -wd, L, wd * 2);
          ctx.globalAlpha = 0.6; ctx.fillRect(0, -wd, L * prog, wd * 2);
          ctx.globalAlpha = 0.95; ctx.strokeStyle = colr; ctx.lineWidth = 0.05; ctx.strokeRect(0, -wd, L, wd * 2);
          ctx.beginPath(); ctx.moveTo(L, -wd * 1.6); ctx.lineTo(L + 0.5, 0); ctx.lineTo(L, wd * 1.6); ctx.closePath(); ctx.fillStyle = colr; ctx.fill();
          ctx.restore();
        }
        if (tl && tl.type === "circle" && level() > 0) {
          gBegin(ctx, tl.x, tl.y, 0); ctx.globalAlpha = 0.5 + 0.4 * prog; ctx.strokeStyle = colr; ctx.lineWidth = 0.05 + prog * 0.05;
          ctx.beginPath(); ctx.arc(0, 0, (tl.radius || 1) * prog, 0, TAU); ctx.stroke(); ctx.restore();
        }
        continue;
      }
      var sp = scr(m.x, m.y, 0), H = S * (m.boss ? 2.4 : m.mini ? 1.9 : 1.35);
      drawGlow(ctx, sp.x, sp.y - S * 0.5, S * (big ? 1.4 : 0.9) * (0.8 + prog * 0.6), colr, 0.35 + prog * 0.55);
      if (big || tl && tl.warn || armed) {
        var py = sp.y - H - Math.max(26, S * 0.62) - prog * 4, rad = Math.max(7, S * 0.2); /* above the name plate */
        ctx.save(); ctx.globalAlpha = 0.95; ctx.fillStyle = "#1a0c08"; ctx.strokeStyle = colr; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sp.x, py - rad); ctx.lineTo(sp.x + rad, py); ctx.lineTo(sp.x, py + rad); ctx.lineTo(sp.x - rad, py); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = colr; ctx.font = "900 " + Math.round(rad * 1.3) + "px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(m.boss ? "!!" : "!", sp.x, py + 1); ctx.restore();
      }
    }
    if (layer === "a" && boss && c.bossEdge !== false && level() > 0) {
      var v = ST.view || {}, W = v.w || 800, Hh = v.h || 400, a = 0.22 + Math.sin(now * 14) * 0.08;
      ctx.save(); ctx.globalAlpha = a; var gr = ctx.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.45, W / 2, Hh / 2, Math.max(W, Hh) * 0.65);
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, c.bossColor || "#ff3020"); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, Hh); ctx.restore();
    }
  }

  /* ---------- projectiles (skinned per skill) ---------- */
  function drawProjectiles(ctx) {
    var ps = ST.projectiles || [];
    for (var i = 0; i < ps.length; i++) {
      var b = ps[i]; if (!b.fx) continue; stats.projDrawn++; BYID[b.fx] = (BYID[b.fx] || 0) + 1;
      var def = skillDef(b.fx), pr = def && def.proj; if (!pr) { pr = { head: "orb" }; }
      var p = pal(def ? def.pal : "steel"), sp = G(b.x, b.y), sx = sp.x, sy = sp.y - LIFT, ang = Math.atan2((b.vx || 0) * B.ey + (b.vy || 0) * B.fy, (b.vx || 0) * B.ex + (b.vy || 0) * B.fx);
      var tr = b._tr || (b._tr = []); tr.push(sx, sy); if (tr.length > (level() === 2 ? 16 : 8)) tr.splice(0, 2);
      if (tr.length >= 4) {
        ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = col(p, pr.trail || "main");
        for (var j = 2; j < tr.length; j += 2) { var a = j / tr.length; ctx.globalAlpha = a * 0.8; ctx.lineWidth = Math.max(1, S * (pr.tw || 0.1) * a); ctx.beginPath(); ctx.moveTo(tr[j - 2], tr[j - 1] + (pr.wave ? Math.sin(now * 30 + j) * S * 0.06 : 0)); ctx.lineTo(tr[j], tr[j + 1]); ctx.stroke(); }
        ctx.restore();
      }
      var h = pr.head || "orb", R = Math.max(3, S * (pr.r || 0.12));
      drawGlow(ctx, sx, sy, R * 3.2, p.glow, 0.8);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang); ctx.fillStyle = p.core; ctx.strokeStyle = col(p, "main"); ctx.lineWidth = Math.max(1.5, S * 0.035);
      ctx.beginPath();
      if (h === "shard") { ctx.moveTo(R * 2.2, 0); ctx.lineTo(0, R * 0.55); ctx.lineTo(-R * 1.4, 0); ctx.lineTo(0, -R * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if (h === "needle") { ctx.moveTo(R * 2.6, 0); ctx.lineTo(-R * 1.6, R * 0.25); ctx.lineTo(-R * 1.6, -R * 0.25); ctx.closePath(); ctx.fill(); ctx.stroke(); }
      else if (h === "note") { ctx.rotate(-ang); ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = col(p, "edge"); ctx.font = "700 " + Math.round(R * 1.8) + "px Georgia, serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("\u266A", 0, 1); }
      else if (h === "ring") { ctx.rotate(-ang); ctx.lineWidth = Math.max(2, R * 0.45); ctx.arc(0, 0, R * (1.1 + Math.sin(now * 20) * 0.2), 0, TAU); ctx.stroke(); ctx.fillStyle = p.core; ctx.beginPath(); ctx.arc(0, 0, R * 0.4, 0, TAU); ctx.fill(); }
      else if (h === "glob") { ctx.ellipse(0, 0, R * 1.3, R * 0.95, 0, 0, TAU); ctx.fillStyle = col(p, "main"); ctx.fill(); ctx.fillStyle = p.core; ctx.beginPath(); ctx.arc(R * 0.35, -R * 0.3, R * 0.3, 0, TAU); ctx.fill(); }
      else if (h === "coal") { ctx.rotate(now * 9); ctx.moveTo(R, 0); for (var k2 = 1; k2 < 6; k2++) { var ak = k2 / 6 * TAU; ctx.lineTo(Math.cos(ak) * R * (k2 % 2 ? 0.75 : 1.1), Math.sin(ak) * R * (k2 % 2 ? 0.75 : 1.1)); } ctx.closePath(); ctx.fillStyle = col(p, "main"); ctx.fill(); ctx.fillStyle = p.core; ctx.beginPath(); ctx.arc(0, 0, R * 0.45, 0, TAU); ctx.fill(); }
      else if (h === "bolt") { ctx.moveTo(-R * 2, 0); ctx.lineTo(-R * 0.6, -R * 0.6); ctx.lineTo(R * 0.2, R * 0.4); ctx.lineTo(R * 2.2, 0); ctx.lineWidth = Math.max(2, S * 0.05); ctx.strokeStyle = p.core; ctx.stroke(); }
      else { ctx.arc(0, 0, R, 0, TAU); ctx.fill(); ctx.stroke(); }
      ctx.restore();
      if (pr.drip && level() === 2 && Math.random() < 0.35) emit(pr.drip, b.x, b.y, 0.5, 0, p);
    }
  }

  /* ---------- lingering ground pools from tree skills (slag, black ice) ---------- */
  function drawPools(ctx) {
    var ps = w.ABTree && w.ABTree._pools; if (!ps || !ps.length || !D.pools) return;
    for (var i = 0; i < ps.length; i++) {
      var q = ps[i], d = D.pools[q.tag] || D.pools[q.el]; if (!d) continue;
      var p = pal(d.pal), life = Math.max(0, Math.min(1, q.t / 0.6)), pulse = 0.8 + Math.sin(now * (d.rate || 6) + i) * 0.2;
      gBegin(ctx, q.x, q.y, 0);
      ctx.globalAlpha = 0.42 * life * pulse; ctx.fillStyle = col(p, "edge"); ctx.beginPath(); ctx.arc(0, 0, q.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.5 * life; ctx.fillStyle = col(p, "main"); ctx.beginPath(); ctx.arc(0, 0, q.r * 0.62, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9 * life; ctx.strokeStyle = d.k === "ice" ? p.core : col(p, "main"); ctx.lineWidth = 0.04; ctx.beginPath();
      var seed = (q.x * 7.3 + q.y * 3.1) % 6.28, n = d.k === "ice" ? 7 : 5;
      for (var c = 0; c < n; c++) { var a = seed + c / n * TAU; ctx.moveTo(Math.cos(a) * q.r * 0.15, Math.sin(a) * q.r * 0.15); ctx.lineTo(Math.cos(a + 0.25) * q.r * 0.55, Math.sin(a + 0.25) * q.r * 0.55); ctx.lineTo(Math.cos(a - 0.1) * q.r * 0.95, Math.sin(a - 0.1) * q.r * 0.95); }
      ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, q.r, 0, TAU); ctx.stroke(); ctx.restore();
      if (d.emit && Math.random() < dt * (d.emitRate || 8)) emit(d.emit, q.x + rnd(-0.6, 0.6) * q.r, q.y + rnd(-0.6, 0.6) * q.r, 0, 0, p);
    }
  }

  /* ---------- frame entry points ---------- */
  function frame(st) {
    var t = performance.now() / 1000; if (!lastNow) lastNow = t;
    dt = Math.min(0.1, Math.max(0, t - lastNow)) * SCALE; lastNow = t; now = now ? now + dt : t;
    LV = -1; hitBudget = caps().impactsPerFrame;
  }
  function ground(ctx, g, s, st) {
    if (!on() || !st || !st.player || !st.world) return;
    var t0 = performance.now();
    try {
      frame(st); ensurePool(); CTX = ctx; G = g; S = s; ST = st; basis(g, s, st);
      stepParticles();
      for (var i = 0; i < FX.length; i++) { var f = FX[i]; if (now - f.t0 > f.dur) { f.done = true; continue; } drawShape(ctx, f, "g"); }
      drawPools(ctx); drawAuras(ctx, "g"); drawWindups(ctx, "g"); drawReadyHero(ctx);
    } catch (e) { errs++; if (w.console && errs < 4) console.warn("skillfx ground", e); try { ctx.restore(); } catch (_) {} }
    stats.lastFrameMs = performance.now() - t0;
  }
  function air(ctx, g, s, st, lift) {
    if (!on() || !st || !st.player || !st.world) return;
    var t0 = performance.now();
    try {
      CTX = ctx; G = g; S = s; ST = st; LIFT = lift || 0;
      for (var i = 0; i < FX.length; i++) { var f = FX[i]; if (f.done) continue; drawShape(ctx, f, "a"); }
      var k = 0; for (var j = 0; j < FX.length; j++) if (!(FX[j].done || now - FX[j].t0 > FX[j].dur)) FX[k++] = FX[j]; FX.length = k; if (k > maxLive) maxLive = k;
      drawProjectiles(ctx); drawAuras(ctx, "a"); drawParticles(ctx); drawWindups(ctx, "a");
      updateRow(st); updateReady(st);
    } catch (e) { errs++; if (w.console && errs < 4) console.warn("skillfx air", e); try { ctx.restore(); } catch (_) {} }
    stats.lastFrameMs += performance.now() - t0;
  }
  function liveParticles() { var n = 0; for (var i = 0; i < PCAP; i++) if (P[i].a) n++; return n; }

  function bind() {
    if (w.ABBus && !bind.done) { bind.done = true; w.ABBus.on("combat:hit", onHit); }
  }
  bind(); if (!bind.done) setTimeout(bind, 0);

  w.ABSkillFx = {
    ready: ready, on: on, pre: pre, post: post, pose: pose, heroLift: heroLift, ground: ground, air: air,
    warnElite: warnElite, leapWind: leapWind, level: level,
    setLow: function (v) { forcedLow = v == null ? null : !!v; PCAP = -1; LV = -1; },
    slow: function (k) { SCALE = k == null ? 1 : Math.max(0, +k); },
    def: skillDef, data: function () { return D; },
    readyOk: function (id) { var d = skillDef(id), st = w.ASHBOUND && w.ASHBOUND.state; return !!(d && d.ready && st && st.player && condOk(st, id, d.ready)); },
    drawnBy: function (id) { return id ? BYID[id] || 0 : BYID; },
    stats: function () { return { drawn: stats.drawn, projDrawn: stats.projDrawn, live: FX.length, maxLive: maxLive, particles: liveParticles(), cap: PCAP, level: level(), casts: stats.casts, impacts: stats.impacts, spawned: stats.spawned, dropped: stats.dropped, poses: stats.poses, ready: stats.ready, auras: stats.auras, wind: stats.wind, errors: errs, ms: +stats.lastFrameMs.toFixed(3) }; },
    _clear: function () { FX.length = 0; for (var i = 0; i < PCAP; i++) P[i].a = false; }
  };
})(window);
