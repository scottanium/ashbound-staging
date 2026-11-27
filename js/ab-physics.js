// Crowd physics: spatial hash, separation, melee rings, shove budgets.
// Talks to the rest of the game only through attach({ dist, move, getTune }).
(function (root) {
  let dist = function () { return 0; };
  let move = function () {};
  let getTune = function () { return root.AB_TUNE || {}; };
  function tune() { return getTune() || {}; }

  function attach(api) {
    if (!api) return;
    if (typeof api.dist === "function") dist = api.dist;
    if (typeof api.move === "function") move = api.move;
    if (typeof api.getTune === "function") getTune = api.getTune;
  }

  function abMayShove(m) {
    return !!(m && (m.boss || m.leap || m.charge || ["golem", "brute", "knight", "tyrant", "colossus"].includes(m.shape)));
  }

  function abSurrounded(e, p) {
    let mask = 0, n = 0;
    for (let m of e.monsters || []) {
      if (m.dead) continue;
      let d = dist(p, m);
      if (d < (p.radius || 0.34) + (m.radius || 0.3) + 0.4) {
        let a = Math.atan2(m.y - p.y, m.x - p.x);
        let s = Math.floor((a + Math.PI) / (Math.PI / 4)) & 7;
        mask |= 1 << s;
        n++;
      }
    }
    let bits = 0, x = mask;
    while (x) { bits += x & 1; x >>= 1; }
    return bits >= 5 || n >= 6;
  }

  function abOverlapNonShove(e, p) {
    let out = [];
    for (let m of e.monsters || []) {
      if (m.dead || abMayShove(m)) continue;
      if (dist(p, m) < (p.radius || 0.34) + (m.radius || 0.3) + 0.04) out.push(m);
    }
    return out;
  }

  // Every body the player may not walk into. Heavies used to be skipped here (v55), which let the
  // player bulldoze golems, brutes and knights across the floor. tune.playerBlockHeavies (default
  // true) keeps them solid; set it false to get the old v55 behaviour back.
  function abOverlapBody(e, p, pad) {
    let T = tune(), all = T.playerBlockHeavies !== false, out = [];
    if (pad == null) pad = T.playerResolvePad != null ? T.playerResolvePad : 0.04;
    for (let m of e.monsters || []) {
      if (m.dead || (!all && abMayShove(m))) continue;
      if (dist(p, m) < (p.radius || 0.34) + (m.radius || 0.3) + pad) out.push(m);
    }
    return out;
  }

  function abPlayerResolve(e, p, x0, y0) {
    if (!e || !p) return;
    p._slideOut = false;
    let ov = abOverlapBody(e, p);
    if (!ov.length) return;
    if (abSurrounded(e, p)) { p._slideOut = true; return; }
    if (p.x === x0 && p.y === y0) return;
    // Only block a step that closes on a body; stepping away from one is always fine.
    let closer = function () {
      for (let m of abOverlapBody(e, p)) {
        let d1 = dist(p, m), d0 = Math.hypot(x0 - m.x, y0 - m.y);
        if (d1 < d0 - 1e-6) return true;
      }
      return false;
    };
    let dx = p.x - x0, dy = p.y - y0;
    p.x = x0; p.y = y0;
    p.x = x0 + dx;
    if (closer()) p.x = x0;
    p.y = y0 + dy;
    if (closer()) p.y = y0;
  }

  function abHitShove(e, mon, vic) {
    if (!abMayShove(mon) || !vic || vic !== e.player) return;
    let w = e.world;
    if (!w) return;
    let i = dist(mon, vic) || 1e-4;
    let T = tune();
    let left = w._shoveLeft != null ? w._shoveLeft : (T.shoveFrameCap || 0.03);
    let k = Math.min(T.hitShove || 0.08, left);
    if (k <= 0) return;
    let dx = (vic.x - mon.x) / i, dy = (vic.y - mon.y) / i;
    move(w, vic, dx * k, dy * k);
    w._shoveLeft = left - k;
    w._shoveUsed = (w._shoveUsed || 0) + k;
  }

  function abShoveTick(w, dt) {
    let T = tune();
    let cap = T.shoveSecCap || 0.4;
    w._shoveUsed = Math.max(0, (w._shoveUsed || 0) - cap * dt);
    w._shoveLeft = Math.min(T.shoveFrameCap || 0.03, Math.max(0, cap - w._shoveUsed));
  }

  function abHashBuild(e, cell) {
    cell = cell || 1;
    let map = new Map(), inv = 1 / cell;
    for (let m of e.monsters || []) {
      if (m.dead) continue;
      let k = Math.floor(m.x * inv) + "|" + Math.floor(m.y * inv);
      let b = map.get(k);
      b ? b.push(m) : map.set(k, [m]);
    }
    return {
      cell,
      map,
      neighbors(m, rad) {
        let out = [], r = Math.ceil((rad || 1.2) / cell);
        let cx = Math.floor(m.x / cell), cy = Math.floor(m.y / cell);
        for (let y = cy - r; y <= cy + r; y++)
          for (let x = cx - r; x <= cx + r; x++) {
            let b = map.get(x + "|" + y);
            if (!b) continue;
            for (let o of b) o !== m && !o.dead && out.push(o);
          }
        return out;
      }
    };
  }

  function abUidAng(a, b) {
    let s = String(a || "") + "|" + String(b || ""), h = 0;
    for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
    return (h >>> 0) % 360 / 360 * Math.PI * 2;
  }

  function abAngDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function abAssignRing(e, p) {
    if (!e || !p) return;
    let near = [];
    for (let m of e.monsters || []) {
      if (m.dead || m.ranged || m.state !== "chase" || m._active === false) continue;
      if (dist(m, p) < 8) near.push(m);
    }
    let n = near.length;
    if (!n) return;
    let hold0 = 1.05, spacing = 0.85, per = Math.max(6, Math.floor(2 * Math.PI * hold0 / spacing));
    let origin = e._ringA0;
    if (origin == null) origin = Math.atan2(near[0].y - p.y, near[0].x - p.x);
    e._ringA0 = origin;
    near.sort((a, b) => Math.atan2(a.y - p.y, a.x - p.x) - Math.atan2(b.y - p.y, b.x - p.x));
    let used = new Set();
    for (let i = 0; i < n; i++) {
      let m = near[i];
      let cur = m._ringAng != null ? m._ringAng : Math.atan2(m.y - p.y, m.x - p.x);
      let best = -1, bestD = 1e9;
      for (let k = 0; k < n; k++) {
        if (used.has(k)) continue;
        let d = Math.abs(abAngDiff(cur, origin + k * (Math.PI * 2 / n)));
        if (d < bestD) { bestD = d; best = k; }
      }
      used.add(best);
      let ring = Math.floor(best / per), slot = best % per;
      let onThis = Math.min(per, n - ring * per);
      let ang = origin + slot * (Math.PI * 2 / Math.max(1, onThis));
      let rr = hold0 + ring * 0.95;
      if (m._ringAng == null || Math.abs(abAngDiff(m._ringAng, ang)) > 0.55) m._ringAng = ang;
      m._ringR = rr;
    }
  }

  function abSeparate(e, p) {
    if (!e) return;
    let T = tune();
    let shoveLeft = e._shoveLeft != null ? e._shoveLeft : (T.shoveFrameCap || 0.03);
    let padP = T.monsterPlayerPad != null ? T.monsterPlayerPad : 0.02;
    for (let iter = 0; iter < 3; iter++) {
      let hash = abHashBuild(e, 1);
      for (let t of e.monsters || []) {
        if (t.dead) continue;
        for (let s of hash.neighbors(t, 1.15)) {
          let i = dist(t, s), l = (t.radius || 0.3) + (s.radius || 0.3) + 0.28;
          if (i < 1e-4) {
            let ang = abUidAng(t.uid, s.uid);
            move(e, t, Math.cos(ang) * 0.18, Math.sin(ang) * 0.18);
            continue;
          }
          if (i >= l) continue;
          let m = (l - i) * 0.55, dx = (t.x - s.x) / i, dy = (t.y - s.y) / i;
          move(e, t, dx * m * 0.55, dy * m * 0.55);
        }
        // Player contact: only undo overlap the monster walked into. The player is stopped by
        // abPlayerResolve at playerResolvePad, so a pad below that never fires from the player's
        // own step (the old 0.06 pad nudged the body 0.02 every frame the player leaned on it).
        // While the player squeezes out of a full surround (_slideOut) nothing is pushed.
        if (p && !p.dead && !p._slideOut) {
          let i = dist(t, p), l = (t.radius || 0.3) + (p.radius || 0.34) + padP;
          if (i < 1e-4) {
            let ang = abUidAng(t.uid, p.uid || "p");
            move(e, t, Math.cos(ang) * 0.2, Math.sin(ang) * 0.2);
          } else if (i < l) {
            let m = l - i, dx = (p.x - t.x) / i, dy = (p.y - t.y) / i;
            move(e, t, -dx * m, -dy * m);
          }
        }
      }
    }
    e._shoveLeft = shoveLeft;
  }

  const names = {
    attach, mayShove: abMayShove, surrounded: abSurrounded,
    overlapNonShove: abOverlapNonShove, overlapBody: abOverlapBody, playerResolve: abPlayerResolve,
    hitShove: abHitShove, shoveTick: abShoveTick, hashBuild: abHashBuild,
    uidAng: abUidAng, angDiff: abAngDiff, assignRing: abAssignRing,
    separate: abSeparate
  };
  root.ABPhysics = names;
  root.abMayShove = abMayShove;
  root.abSurrounded = abSurrounded;
  root.abOverlapNonShove = abOverlapNonShove;
  root.abOverlapBody = abOverlapBody;
  root.abPlayerResolve = abPlayerResolve;
  root.abHitShove = abHitShove;
  root.abShoveTick = abShoveTick;
  root.abHashBuild = abHashBuild;
  root.abUidAng = abUidAng;
  root.abAngDiff = abAngDiff;
  root.abAssignRing = abAssignRing;
  root.abSeparate = abSeparate;
})(typeof window !== "undefined" ? window : self);
