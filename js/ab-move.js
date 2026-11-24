/* Player movement helpers: wall sliding (including corners) and walk-to pathing.
   Attaches through ABMove.attach; index.html hooks slide() into me() and follow() into walkTo. */
(function (root) {
  "use strict";
  let blocked = function () { return false; };
  let tileAt = function () { return 0; };
  let isSolid = function () { return false; };
  function attach(api) {
    if (!api) return;
    if (typeof api.blocked === "function") blocked = api.blocked;
    if (typeof api.tile === "function") tileAt = api.tile;
    if (typeof api.isSolid === "function") isSolid = api.isSolid;
  }

  function rad(ent) { return (ent && ent.radius) || 0.32; }

  // Move as far as possible along one vector from (px,py).
  function reach(world, px, py, dx, dy, r) {
    if (!dx && !dy) return { x: px, y: py };
    if (!blocked(world, px + dx, py + dy, r)) return { x: px + dx, y: py + dy };
    let lo = 0, hi = 1;
    for (let i = 0; i < 10; i++) {
      let mid = (lo + hi) / 2;
      if (!blocked(world, px + dx * mid, py + dy * mid, r)) lo = mid;
      else hi = mid;
    }
    return { x: px + dx * lo, y: py + dy * lo };
  }

  function dist2(ax, ay, bx, by) {
    let dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  // Push an overlapping circle out of solid tiles so later slides can start cleanly.
  function depenetrate(world, x, y, r) {
    let s = Math.floor(x - r), e = Math.floor(x + r), i = Math.floor(y - r), l = Math.floor(y + r);
    for (let row = i; row <= l; row++) {
      for (let col = s; col <= e; col++) {
        let t = tileAt(world, col + 0.1, row + 0.1);
        if (!isSolid(t)) continue;
        let cx = x < col ? col : (x > col + 1 ? col + 1 : x);
        let cy = y < row ? row : (y > row + 1 ? row + 1 : y);
        let ux = x - cx, uy = y - cy, d = Math.hypot(ux, uy);
        if (d < 1e-8) { ux = 1; uy = 0; d = 0; }
        else { ux /= d; uy /= d; }
        if (d < r) {
          let out = r - d + 0.02;
          x += ux * out;
          y += uy * out;
        }
      }
    }
    return { x: x, y: y };
  }

  // Try a short side-step around a blocking corner, then continue along the intended move.
  function cornerSlip(world, x, y, dx, dy, r) {
    let step = Math.max(0.08, r * 0.45);
    let signs = [1, -1];
    let best = null, bestScore = -1e9;
    for (let i = 0; i < signs.length; i++) {
      for (let j = 0; j < signs.length; j++) {
        let ox = signs[i] * step, oy = 0;
        if (!blocked(world, x + ox, y + oy, r)) {
          let nxt = reach(world, x + ox, y + oy, dx, dy, r);
          let score = (nxt.x - x) * dx + (nxt.y - y) * dy - Math.hypot(ox, oy) * 0.01;
          if (score > bestScore) { bestScore = score; best = nxt; }
        }
        ox = 0; oy = signs[j] * step;
        if (!blocked(world, x + ox, y + oy, r)) {
          let nxt = reach(world, x + ox, y + oy, dx, dy, r);
          let score = (nxt.x - x) * dx + (nxt.y - y) * dy - Math.hypot(ox, oy) * 0.01;
          if (score > bestScore) { bestScore = score; best = nxt; }
        }
      }
    }
    return best;
  }

  function slide(world, ent, dx, dy) {
    if (!ent || !world) return ent;
    let r = rad(ent);
    if (!blocked(world, ent.x + dx, ent.y + dy, r)) {
      ent.x += dx;
      ent.y += dy;
      return ent;
    }
    let xy = reach(world, ent.x, ent.y, dx, 0, r);
    xy = reach(world, xy.x, xy.y, 0, dy, r);
    let yx = reach(world, ent.x, ent.y, 0, dy, r);
    yx = reach(world, yx.x, yx.y, dx, 0, r);
    let tx = ent.x + dx, ty = ent.y + dy;
    let best = dist2(xy.x, xy.y, tx, ty) <= dist2(yx.x, yx.y, tx, ty) ? xy : yx;
    let moved = Math.hypot(best.x - ent.x, best.y - ent.y);
    if (moved < 1e-4) {
      let pushed = depenetrate(world, ent.x, ent.y, r);
      if (!blocked(world, pushed.x, pushed.y, r)) {
        ent.x = pushed.x;
        ent.y = pushed.y;
      }
      let slip = cornerSlip(world, ent.x, ent.y, dx, dy, r);
      if (slip && Math.hypot(slip.x - ent.x, slip.y - ent.y) > moved) best = slip;
    }
    ent.x = best.x;
    ent.y = best.y;
    return ent;
  }

  function walkableTile(world, tx, ty) {
    if (!world) return false;
    let t = tileAt(world, tx + 0.5, ty + 0.5);
    return !isSolid(t);
  }

  function snapWalkable(world, x, y) {
    let tx = Math.floor(x), ty = Math.floor(y);
    if (walkableTile(world, tx, ty) && !blocked(world, x, y, 0.28)) return { x: x, y: y };
    let best = null, bestD = 1e9;
    for (let radS = 1; radS <= 6; radS++) {
      for (let oy = -radS; oy <= radS; oy++) {
        for (let ox = -radS; ox <= radS; ox++) {
          let nx = tx + ox, ny = ty + oy;
          if (!walkableTile(world, nx, ny)) continue;
          let cx = nx + 0.5, cy = ny + 0.5;
          let d = Math.hypot(cx - x, cy - y);
          if (d < bestD) { bestD = d; best = { x: cx, y: cy }; }
        }
      }
      if (best) return best;
    }
    return { x: x, y: y };
  }

  // 8-connected BFS that refuses diagonal cuts through a corner.
  function path(world, from, to) {
    if (!world || !from || !to) return null;
    let goal = snapWalkable(world, to.x, to.y);
    let sx = Math.floor(from.x), sy = Math.floor(from.y);
    let gx = Math.floor(goal.x), gy = Math.floor(goal.y);
    if (sx === gx && sy === gy) return [goal];
    let w = world.w || 0, h = world.h || 0;
    let seen = new Uint8Array(Math.max(1, w * h));
    let qx = [sx], qy = [sy], came = new Int32Array(Math.max(1, w * h)).fill(-1);
    let qi = 0;
    function idx(x, y) { return y * w + x; }
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return [goal];
    seen[idx(sx, sy)] = 1;
    let dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    while (qi < qx.length) {
      let x = qx[qi], y = qy[qi]; qi++;
      if (x === gx && y === gy) break;
      for (let d = 0; d < dirs.length; d++) {
        let nx = x + dirs[d][0], ny = y + dirs[d][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        let id = idx(nx, ny);
        if (seen[id] || !walkableTile(world, nx, ny)) continue;
        if (dirs[d][0] && dirs[d][1] && (!walkableTile(world, x + dirs[d][0], y) || !walkableTile(world, x, y + dirs[d][1]))) continue;
        seen[id] = 1;
        came[id] = idx(x, y);
        qx.push(nx); qy.push(ny);
      }
    }
    if (!seen[idx(gx, gy)]) return [goal];
    let tiles = [];
    let cur = idx(gx, gy);
    let start = idx(sx, sy);
    let guard = 0;
    while (cur >= 0 && guard++ < w * h) {
      tiles.push({ x: (cur % w) + 0.5, y: Math.floor(cur / w) + 0.5 });
      if (cur === start) break;
      cur = came[cur];
    }
    tiles.reverse();
    if (!tiles.length) tiles.push({ x: from.x, y: from.y });
    tiles[tiles.length - 1] = goal;
    return tiles;
  }

  function pathKey(dest) {
    return dest ? (Math.round(dest.x * 4) + "," + Math.round(dest.y * 4)) : "";
  }

  // Next steering point for a walkTo dest. Caches the path on dest itself.
  function follow(world, ent, dest) {
    if (!world || !ent || !dest) return dest;
    let key = pathKey(dest);
    if (dest._pathKey !== key || !dest._path) {
      dest._path = path(world, ent, dest) || [dest];
      dest._pathKey = key;
      dest._pathI = 0;
    }
    let pts = dest._path || [dest];
    let i = dest._pathI || 0;
    while (i < pts.length - 1 && Math.hypot(pts[i].x - ent.x, pts[i].y - ent.y) < 0.35) i++;
    dest._pathI = i;
    return pts[i] || dest;
  }

  root.ABMove = { attach, slide, path, follow, snapWalkable, depenetrate };
})(self);
