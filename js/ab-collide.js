/* r15 wallfix: terrain collision that matches what is drawn.
   Walls, lava/water and buildings block as full tile squares (they are drawn as full tiles).
   TREE and ROCK tiles block as a circle at the tile centre, sized from the obstacle sprite the renderer draws there
   (cross-section of the drawn props3d recipe at shin height x its size variant + pad, clamped by data/collision.json propCollider;
   a wide bush or salt drift may reach a little past its own tile).
   index.html attaches tile(), isSolid() and sprite(world,i,j) -> {name,h} (the renderer's own pick) and routes its
   blocked test here. No state is stored on the world object (worlds are saved as JSON). */
(function (root) {
  "use strict";
  var tileAt = function () { return 0; };
  var isSolid = function () { return false; };
  var spriteAt = function () { return null; };
  var ROUND = {};               // tile codes that use a round collider (TREE, ROCK)
  var foot = {};                // sprite name -> base footprint radius (tiles), from props3d ops
  var cache = typeof WeakMap === "function" ? new WeakMap() : null;

  function attach(api) {
    if (!api) return;
    if (typeof api.tile === "function") tileAt = api.tile;
    if (typeof api.isSolid === "function") isSolid = api.isSolid;
    if (typeof api.sprite === "function") spriteAt = api.sprite;
    if (api.round) { ROUND = {}; for (var i = 0; i < api.round.length; i++) ROUND[api.round[i]] = 1; }
  }
  function cfg() { var d = root.ASHBOUND_DATA || {}; return (d.collision && d.collision.propCollider) || null; }
  function on() { var c = cfg(); return !!(c && c.round !== false); }
  function p3() { var d = root.ASHBOUND_DATA || {}; return d.props3d || null; }

  // Radius of a props3d recipe's cross-section at shin height (z = 0.12 tiles): what the hero's legs would bump into.
  // Flat decals (disc, shadow, glow, ground polys) do not count; cones, pyramids and spheres are measured where they cut that height.
  var ZC = 0.12;
  function footprint(name) {
    if (name in foot) return foot[name];
    var P = p3(), S = P && P.sprites, spec = S && (S[name] || (P.alias && S[P.alias[name]]));
    var r = null, h = Math.hypot;
    if (spec && spec.ops) {
      r = 0;
      for (var i = 0; i < spec.ops.length; i++) {
        var o = spec.ops[i], t = o[0], k;
        if (t === "box") { if (o[5] <= ZC && o[6] >= ZC) r = Math.max(r, h(Math.abs(o[1]) + o[3] / 2, Math.abs(o[2]) + o[4] / 2)); }
        else if (t === "cyl") { if (o[4] <= ZC && o[5] >= ZC) r = Math.max(r, h(o[1], o[2]) + o[3]); }
        else if (t === "cone") { if (o[4] <= ZC && o[5] > ZC) { k = 1 - (ZC - o[4]) / (o[5] - o[4]); r = Math.max(r, h(o[1], o[2]) + o[3] * k); } }
        else if (t === "pyr") { if (o[5] <= ZC && o[6] > ZC) { k = 1 - (ZC - o[5]) / (o[6] - o[5]); r = Math.max(r, h(Math.abs(o[1]) + o[3] / 2 * k, Math.abs(o[2]) + o[4] / 2 * k)); } }
        else if (t === "sphere") { var dz = ZC - o[3]; if (Math.abs(dz) < o[4]) r = Math.max(r, h(o[1], o[2]) + Math.sqrt(o[4] * o[4] - dz * dz)); }
        else if (t === "line") {
          var pts = o[3];
          for (var j = 0; j + 1 < pts.length; j++) {
            var a = pts[j], b = pts[j + 1];
            if ((a[2] - ZC) * (b[2] - ZC) <= 0 && a[2] !== b[2]) { var f = (ZC - a[2]) / (b[2] - a[2]); r = Math.max(r, h(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f) + (o[2] || 0) / 2); }
          }
        } else if (t === "poly") {
          var zs = o[2].map(function (q) { return q[2]; });
          if (Math.min.apply(null, zs) <= ZC && Math.max.apply(null, zs) >= ZC) for (var m = 0; m < o[2].length; m++) r = Math.max(r, h(o[2][m][0], o[2][m][1]));
        }
      }
    }
    foot[name] = r;
    return r;
  }

  // Collider radius for a sprite at tile hash h (h picks the size variant exactly like ab-props3d does).
  function radiusFor(name, h) {
    var C = cfg() || {}, min = C.min != null ? C.min : 0.24, max = C.max != null ? C.max : 0.46;
    var by = C.bySprite || {}, base;
    if (name && by[name] != null) base = by[name];
    else {
      var f = name ? footprint(name) : null;
      base = f == null ? (C["default"] != null ? C["default"] : 0.34) : f + (C.pad != null ? C.pad : 0.1);
    }
    var P = p3(), vs = (P && P.variants) || [[1, 1]], v = vs[Math.floor((h || 0) * 3) % 3] || vs[0] || [1, 1];
    if (!(name && by[name] != null)) base *= v[0] || 1;
    return Math.max(min, Math.min(max, base));
  }

  // Shape of tile (col,row): null (open), {box:1} or {r, cx, cy}. Round radii are cached per world without touching it.
  function shape(world, col, row) {
    var t = tileAt(world, col + 0.1, row + 0.1);
    if (!isSolid(t)) return null;
    if (!ROUND[t] || !on() || col < 0 || row < 0 || col >= world.w || row >= world.h) return { box: 1 };
    var m = cache && cache.get(world), k = row * world.w + col;
    if (!m || m.n !== world.w * world.h) { m = { n: world.w * world.h, t: new Int16Array(world.w * world.h).fill(-1), r: new Float32Array(world.w * world.h) }; cache && cache.set(world, m); }
    if (m.t[k] !== t) {
      var sp = spriteAt(world, col, row);
      m.r[k] = sp && sp.name ? radiusFor(sp.name, sp.h) : -1;
      m.t[k] = t;
    }
    var r = m.r[k];
    return r > 0 ? { r: r, cx: col + 0.5, cy: row + 0.5 } : { box: 1 };
  }

  // Does a circle (x,y,rad) overlap anything solid?
  function reachOut() { var C = cfg() || {}; return Math.max(0, (C.max != null ? C.max : 0.46) - 0.5); }
  function blocked(world, x, y, rad) {
    var X = rad + reachOut(), s = Math.floor(x - X), e = Math.floor(x + X), i = Math.floor(y - X), l = Math.floor(y + X);
    for (var row = i; row <= l; row++) {
      for (var col = s; col <= e; col++) {
        var sh = shape(world, col, row);
        if (!sh) continue;
        if (sh.box) {
          var cx = x < col ? col : (x > col + 1 ? col + 1 : x), cy = y < row ? row : (y > row + 1 ? row + 1 : y);
          var ux = x - cx, uy = y - cy;
          if (ux * ux + uy * uy < rad * rad) return true;
        } else {
          var dx = x - sh.cx, dy = y - sh.cy, R = sh.r + rad;
          if (dx * dx + dy * dy < R * R) return true;
        }
      }
    }
    return false;
  }

  // Push an overlapping circle out of solids (used by ABMove when a slide is stuck).
  function pushOut(world, x, y, r) {
    var X = r + reachOut(), s = Math.floor(x - X), e = Math.floor(x + X), i = Math.floor(y - X), l = Math.floor(y + X);
    for (var row = i; row <= l; row++) {
      for (var col = s; col <= e; col++) {
        var sh = shape(world, col, row);
        if (!sh) continue;
        var ux, uy, d, lim;
        if (sh.box) {
          var cx = x < col ? col : (x > col + 1 ? col + 1 : x), cy = y < row ? row : (y > row + 1 ? row + 1 : y);
          ux = x - cx; uy = y - cy; lim = r;
        } else { ux = x - sh.cx; uy = y - sh.cy; lim = r + sh.r; }
        d = Math.hypot(ux, uy);
        if (d < 1e-8) { ux = 1; uy = 0; d = 0; } else { ux /= d; uy /= d; }
        if (d < lim) { var out = lim - d + 0.02; x += ux * out; y += uy * out; }
      }
    }
    return { x: x, y: y };
  }

  root.ABCollide = { attach: attach, on: on, blocked: blocked, shape: shape, pushOut: pushOut, radiusFor: radiusFor, footprint: footprint };
})(self);
