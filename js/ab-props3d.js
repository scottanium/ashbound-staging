// Extruded 3D props for the isometric view, drawn from data/props3d.json (trees, clutter, fences, decor, arches, rift stone, set pieces).
// Each prop is a short list of solids (box cyl cone pyr sphere poly line disc glow). It is drawn once per scale into a small cached
// canvas and then copied like a sprite, so a frame costs one drawImage per prop. Glow pulses ("live" ops) are drawn every frame.
// If the data is missing, ready() is false and the game keeps its old flat sprites.
(function (root) {
  "use strict";
  var cache = new Map(), fenceSpecs = {}, st = { baked: 0, hits: 0, drawn: 0, bakeMs: 0 };
  function D() { return (root.ASHBOUND_DATA || {}).props3d || null; }
  function ready() { var d = D(); return !!(d && d.sprites); }
  function rgb(h) { h = String(h); if (h[0] !== "#") return [128, 128, 128]; return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function mix(h, f) { var c = rgb(h); return "rgb(" + Math.max(0, Math.min(255, Math.round(c[0] * f))) + "," + Math.max(0, Math.min(255, Math.round(c[1] * f))) + "," + Math.max(0, Math.min(255, Math.round(c[2] * f))) + ")"; }
  function rgba(h, a) { var c = rgb(h); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function fillFace(x, pts, color, alpha) {
    x.globalAlpha = alpha == null ? 1 : alpha; x.fillStyle = color; x.strokeStyle = color; x.beginPath(); x.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) x.lineTo(pts[i].x, pts[i].y); x.closePath(); x.fill(); x.lineWidth = 0.8; x.stroke(); x.globalAlpha = 1;
  }
  function run(x, ops, X, k, p, vx, vz, hz) {
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i], t = o[0];
      if (t === "box") {
        var cx = o[1], cy = o[2], w = o[3], d = o[4], z0 = o[5], z1 = o[6];
        var A = [cx - w / 2, cy - d / 2], B = [cx + w / 2, cy - d / 2], C = [cx + w / 2, cy + d / 2], Dd = [cx - w / 2, cy + d / 2];
        fillFace(x, [X(Dd[0], Dd[1], z0), X(C[0], C[1], z0), X(C[0], C[1], z1), X(Dd[0], Dd[1], z1)], o[8]);
        fillFace(x, [X(C[0], C[1], z0), X(B[0], B[1], z0), X(B[0], B[1], z1), X(C[0], C[1], z1)], o[9]);
        fillFace(x, [X(A[0], A[1], z1), X(B[0], B[1], z1), X(C[0], C[1], z1), X(Dd[0], Dd[1], z1)], o[7]);
      } else if (t === "pyr") {
        var cx2 = o[1], cy2 = o[2], w2 = o[3], d2 = o[4], zb = o[5], za = o[6], Ap = X(cx2, cy2, za);
        var D2 = X(cx2 - w2 / 2, cy2 + d2 / 2, zb), C2 = X(cx2 + w2 / 2, cy2 + d2 / 2, zb), B2 = X(cx2 + w2 / 2, cy2 - d2 / 2, zb);
        fillFace(x, [D2, C2, Ap], o[7]); fillFace(x, [C2, B2, Ap], o[8]);
      } else if (t === "cyl") {
        var r = o[3] * vx * k, e0 = X(o[1], o[2], o[4]), e1 = X(o[1], o[2], o[5]), ry = r * p;
        var g = x.createLinearGradient(e0.x - r, 0, e0.x + r, 0); g.addColorStop(0, o[7]); g.addColorStop(.45, o[7]); g.addColorStop(1, o[8]);
        x.fillStyle = g; x.beginPath(); x.ellipse(e0.x, e0.y, r, ry, 0, 0, Math.PI); x.lineTo(e1.x - r, e1.y); x.ellipse(e1.x, e1.y, r, ry, 0, Math.PI, 0, true); x.lineTo(e0.x + r, e0.y); x.fill();
        x.fillStyle = o[6]; x.beginPath(); x.ellipse(e1.x, e1.y, r, ry, 0, 0, Math.PI * 2); x.fill();
      } else if (t === "cone") {
        var r2 = o[3] * vx * k, b0 = X(o[1], o[2], o[4]), ap = X(o[1], o[2], o[5]), ry2 = r2 * p;
        x.fillStyle = o[6]; x.beginPath(); x.moveTo(ap.x, ap.y); x.lineTo(b0.x - r2, b0.y); x.ellipse(b0.x, b0.y, r2, ry2, 0, Math.PI, Math.PI / 2, true); x.closePath(); x.fill();
        x.fillStyle = o[7]; x.beginPath(); x.moveTo(ap.x, ap.y); x.lineTo(b0.x + r2, b0.y); x.ellipse(b0.x, b0.y, r2, ry2, 0, 0, Math.PI / 2); x.closePath(); x.fill();
      } else if (t === "sphere") {
        var c0 = X(o[1], o[2], o[3]), rr = o[4] * vx * k, gr = x.createRadialGradient(c0.x - rr * .35, c0.y - rr * .4, rr * .1, c0.x, c0.y, rr);
        gr.addColorStop(0, mix(o[5], 1.35)); gr.addColorStop(.55, mix(o[5], 1)); gr.addColorStop(1, mix(o[5], .55));
        x.fillStyle = gr; x.beginPath(); x.arc(c0.x, c0.y, rr, 0, Math.PI * 2); x.fill();
      } else if (t === "poly") {
        fillFace(x, o[2].map(function (q) { return X(q[0], q[1], q[2]); }), o[1], o[3]);
      } else if (t === "line") {
        x.globalAlpha = o[4] == null ? 1 : o[4]; x.strokeStyle = o[1]; x.lineWidth = Math.max(1, o[2] * vx * k); x.lineCap = "round"; x.lineJoin = "round"; x.beginPath();
        for (var j = 0; j < o[3].length; j++) { var q = X(o[3][j][0], o[3][j][1], o[3][j][2]); j ? x.lineTo(q.x, q.y) : x.moveTo(q.x, q.y); } x.stroke(); x.globalAlpha = 1;
      } else if (t === "disc") {
        var dc = X(o[1], o[2], o[3]), dr = o[4] * vx * k; x.globalAlpha = o[6]; x.fillStyle = o[5]; x.beginPath(); x.ellipse(dc.x, dc.y, dr, dr * p, 0, 0, Math.PI * 2); x.fill(); x.globalAlpha = 1;
      } else if (t === "glow") {
        var gc = X(o[1], o[2], o[3]), gR = o[4] * vx * k, gg = x.createRadialGradient(gc.x, gc.y, 0, gc.x, gc.y, gR); gg.addColorStop(0, rgba(o[5], o[6])); gg.addColorStop(1, rgba(o[5], 0));
        x.fillStyle = gg; x.beginPath(); x.arc(gc.x, gc.y, gR, 0, Math.PI * 2); x.fill();
      } else if (t === "shadow") {
        if (!o[3]) continue; var sc = X(0, 0, 0), sr = (o[1] + o[2]) / 2 * vx * k, sg = x.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, sr);
        sg.addColorStop(0, "rgba(0,0,0," + o[3] + ")"); sg.addColorStop(1, "rgba(0,0,0,0)"); x.save(); x.translate(sc.x, sc.y); x.scale(1, p); x.translate(-sc.x, -sc.y); x.fillStyle = sg; x.beginPath(); x.arc(sc.x, sc.y, sr, 0, Math.PI * 2); x.fill(); x.restore();
      }
    }
  }
  function bbox(cv) {
    var w = cv.width, h = cv.height, d = cv.getContext("2d").getImageData(0, 0, w, h).data, x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) return { x: 0, y: 0, w: 1, h: 1 };
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(w - 1, x1 + 1); y1 = Math.min(h - 1, y1 + 1);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function bake(spec, cam, s, n, vi) {
    var t0 = performance.now(), d = D(), v = (d.variants || [[1, 1]])[vi] || [1, 1], vx = v[0], vz = v[1];
    var c = cam.c, sn = cam.sn, p = cam.p, hz = cam.hs * cam.cp, k = s * n, ext = spec.ext || [1, 2.4, .5];
    var W = Math.ceil(ext[0] * 2 * k) + 6, H = Math.ceil((ext[1] + ext[2]) * k) + 6, ox = W / 2, oy = ext[1] * k + 3;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H; var x = cv.getContext("2d"); x.lineJoin = "round";
    function X(a, b, z) { a *= vx; b *= vx; z = (z || 0) * vz; return { x: ox + (a * c - b * sn) * k, y: oy + ((a * sn + b * c) * p - z * hz) * k }; }
    run(x, spec.ops, X, k, p, vx, vz, hz);
    var bb = bbox(cv), out = document.createElement("canvas"); out.width = bb.w; out.height = bb.h; out.getContext("2d").drawImage(cv, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
    st.baked++; st.bakeMs += performance.now() - t0;
    return { c: out, ox: (bb.x - ox) / n, oy: (bb.y - oy) / n, w: bb.w / n, h: bb.h / n };
  }
  function getBaked(key, spec, cam, s, n, vi) {
    var full = key + "|" + vi + "|" + s.toFixed(2) + "|" + n + "|" + cam.c.toFixed(3) + "|" + cam.p.toFixed(3), b = cache.get(full);
    if (b) { st.hits++; return b; }
    var mx = (D().cacheMax) || 160; if (cache.size >= mx) cache.clear();
    b = bake(spec, cam, s, n, vi); cache.set(full, b); return b;
  }
  function live(e, spec, P, s, time, cam, vi, alpha) {
    if (!spec.live) return;
    var d = D(), v = (d.variants || [[1, 1]])[vi] || [1, 1], vx = v[0], vz = v[1], c = cam.c, sn = cam.sn, p = cam.p, hz = cam.hs * cam.cp;
    for (var i = 0; i < spec.live.length; i++) {
      var o = spec.live[i]; if (o[0] !== "pulse") continue;
      var a = (o[6] + (o[7] - o[6]) * (.5 + .5 * Math.sin(time * o[8]))) * alpha, X = o[1] * vx, Y = o[2] * vx, Z = (o[3] || 0) * vz;
      var px = P.x + (X * c - Y * sn) * s, py = P.y + ((X * sn + Y * c) * p - Z * hz) * s, R = o[4] * vx * s, g = e.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, rgba(o[5], a)); g.addColorStop(1, rgba(o[5], 0)); e.fillStyle = g; e.beginPath(); e.arc(px, py, R, 0, Math.PI * 2); e.fill();
    }
  }
  function blit(e, b, P, alpha) { e.globalAlpha = alpha; e.drawImage(b.c, P.x + b.ox, P.y + b.oy, b.w, b.h); e.globalAlpha = 1; st.drawn++; }
  function spriteName(name, h) {
    var d = D(), S = d.sprites; if (S[name]) return name;
    var a = (d.alias || {})[name]; if (a && S[a]) return a;
    if (name === "tree" || name === "tree2" || name === "tree3") return ["tree", "tree2", "tree3"][Math.floor(h * 3 % 3)];
    return null;
  }
  function has(name) { return ready() && !!spriteName(name, 0); }
  // grid props (trees, rocks, clutter): P = tile centre on screen
  function sprite(e, name, P, s, n, h, alpha, cam, time) {
    if (root.ABZoneGfx && root.ABZoneGfx.sprite(e, name, P, s, n, h, alpha, time)) return true; // zonegfx (r17): painted set art
    if (!ready()) return false; var nm = spriteName(name, h); if (!nm) return false;
    var spec = D().sprites[nm], vi = Math.floor(h * 3) % 3, b = getBaked("s:" + nm, spec, cam, s, n, vi);
    blit(e, b, P, alpha); if (spec.live && time != null) live(e, spec, P, s, time, cam, vi, alpha); return true;
  }
  function fenceSpec(sprite, len) {
    var key = sprite + "|" + len, f = fenceSpecs[key]; if (f) return f;
    var F = (D().fences || {})[sprite]; if (!F) return null;
    function sh(c, m) { return mix(c, m); }
    function box(cx, cy, w, d, z0, z1, c) { return ["box", cx, cy, w, d, z0, z1, sh(c, 1.08), sh(c, .8), sh(c, .56)]; }
    var ops = [["shadow", len * .5, .22, .22]];
    if (F.kind === "wall") { ops.push(box(0, 0, len, .24, 0, F.h, F.rail)); ops.push(box(0, 0, len + .04, .3, F.h, F.h + .07, F.post)); }
    else {
      var cnt = Math.max(2, Math.round(len / F.gap) + 1);
      ops.push(box(0, 0, len, .06, F.h * .42, F.h * .54, F.rail)); ops.push(box(0, 0, len, .06, F.h * .78, F.h * .9, F.rail));
      for (var i = 0; i < cnt; i++) { var px = -len / 2 + len * i / (cnt - 1); ops.push(box(px, 0, .1, .1, 0, F.h, F.post)); }
      if (F.vine) ops.push(["line", F.vine, .035, [[-len / 2, .05, F.h * .6], [-len * .2, .06, F.h * .85], [len * .1, .05, F.h * .55], [len / 2, .05, F.h * .8]], .9]);
    }
    f = fenceSpecs[key] = { ext: [len / 2 * 1.02 + .5, F.h + 1.1, .6], ops: ops }; return f;
  }
  // other prop kinds: decor, fence, exit, rift, setpiece. Returns true when drawn.
  function prop(e, b, P, s, n, time, alpha, cam) {
    if (root.ABZoneGfx && root.ABZoneGfx.prop3(e, b, P, s, time, alpha)) return true; // zonegfx (r17): painted set art
    if (!ready()) return false; var d = D(), k = b.kind, spec = null, key = null, vi = 0;
    if (k === "decor") { spec = (d.decor || {})[b.sprite]; key = "d:" + b.sprite; }
    else if (k === "fence") { spec = fenceSpec(b.sprite || "fence_ash", b.tilesW || 2); key = "f:" + (b.sprite || "") + ":" + (b.tilesW || 2); }
    else if (k === "exit" || k === "entry") { spec = d.props.exit; key = "p:exit"; }
    else if (k === "waypoint" && d.props.waypoint) { spec = d.props.waypoint; key = "p:waypoint"; }
    else if (k === "rift") { spec = d.props.rift; key = "p:rift"; }
    else if (k === "setpiece") {
      var pc = b.piece;
      if (pc === "bridge") { key = b.down ? "p:bridge_down" : "p:bridge"; spec = d.props[b.down ? "bridge_down" : "bridge"]; }
      else if (pc === "glass") { spec = d.props.glass; key = "p:glass"; }
      else if (pc === "trees") {
        var sw = (b.sway || 0) * s * .35, c = cam.c, sn = cam.sn, p = cam.p;
        for (var i = -1; i <= 1; i++) { var dx = i * .95, Q = { x: P.x + (dx * c) * s + sw * (i + 1), y: P.y + (dx * sn) * p * s }, nm = i === 0 ? "rowtree_m" : "rowtree_s", sp = d.props[nm]; blit(e, getBaked("p:" + nm, sp, cam, s, n, 0), Q, alpha); }
        return true;
      } else if (pc === "wind") {
        e.save(); e.globalAlpha = alpha * (b.gust ? .95 : .45); e.strokeStyle = b.gust ? "rgba(244,236,220,1)" : "rgba(210,200,180,1)"; e.lineWidth = Math.max(2, s * .04); e.lineCap = "round";
        for (var r = 0; r < 8; r++) {
          var oy = (r - 3.5) * .3, gx = (b.gust ? .35 : .08) * Math.sin(time * 5 + r), z = .35 + (r % 3) * .1;
          var A = { x: P.x + ((-.2 + gx) * cam.c - oy * cam.sn) * s, y: P.y + (((-.2 + gx) * cam.sn + oy * cam.c) * cam.p - z * cam.hs * cam.cp) * s };
          var B = { x: P.x + ((1.7 + gx) * cam.c - oy * cam.sn) * s, y: P.y + (((1.7 + gx) * cam.sn + oy * cam.c) * cam.p - z * cam.hs * cam.cp) * s };
          e.beginPath(); e.moveTo(A.x, A.y); e.lineTo(B.x, B.y); e.stroke();
        }
        e.restore(); return true;
      }
    }
    if (!spec) return false;
    var bk = getBaked(key, spec, cam, s, n, vi); blit(e, bk, P, alpha); live(e, spec, P, s, time, cam, vi, alpha); return true;
  }
  root.ABProps3D = {
    ready: ready, has: has, sprite: sprite, prop: prop,
    stats: function () { return { baked: st.baked, hits: st.hits, drawn: st.drawn, bakeMs: +st.bakeMs.toFixed(1), cached: cache.size }; },
    resetStats: function () { st = { baked: 0, hits: 0, drawn: 0, bakeMs: 0 }; },
    clear: function () { cache.clear(); fenceSpecs = {}; },
    names: function () { var d = D(); return d ? { sprites: Object.keys(d.sprites), decor: Object.keys(d.decor), props: Object.keys(d.props), fences: Object.keys(d.fences) } : null; }
  };
})(typeof window !== "undefined" ? window : self);
