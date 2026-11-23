// AI helpers and a tick entry so monster updates talk to the game
// through a small interface: { dist, move, getTune, tick }.
(function (root) {
  let dist = function () { return 0; };
  let move = function () {};
  let getTune = function () { return root.AB_TUNE || {}; };
  let tickFn = null;
  function tune() { return getTune() || {}; }

  function attach(api) {
    if (!api) return;
    if (typeof api.dist === "function") dist = api.dist;
    if (typeof api.move === "function") move = api.move;
    if (typeof api.getTune === "function") getTune = api.getTune;
    if (typeof api.tick === "function") tickFn = api.tick;
  }

  function abMoveCap(t) {
    let T = tune();
    let hv = ["golem", "brute", "knight"].includes(t.shape);
    return Math.min(t.move || 0, hv ? T.heavyMax : T.normalMax);
  }

  function abMarkActive(w, p) {
    let cap = tune().activeCap || 40, live = [];
    for (let m of w.monsters || []) if (!m.dead) live.push(m);
    for (let m of live) { m._active = false; m._lodDist = dist(m, p); }
    live.sort((a, b) => {
      let av = a.boss || a.leap || a.charge ? 0 : 1;
      let bv = b.boss || b.leap || b.charge ? 0 : 1;
      if (av !== bv) return av - bv;
      let ac = a.state === "chase" ? 0 : 1;
      let bc = b.state === "chase" ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return a._lodDist - b._lodDist;
    });
    for (let i = 0; i < live.length; i++) if (i < cap || live[i].boss) live[i]._active = true;
  }

  function abLodChase(e, t, a) {
    t._lodAcc = (t._lodAcc || 0) + a;
    if (t._lodAcc < 0.12) return;
    let dt = t._lodAcc;
    t._lodAcc = 0;
    let s = e.player, d = dist(t, s);
    if (!s || d < 0.4) return;
    let i = abMoveCap(t) * 0.65 * (t.slowT > 0 ? 0.68 : 1);
    move(e.world, t, (s.x - t.x) / d * i * dt, (s.y - t.y) / d * i * dt);
    t.facing = Math.atan2(s.y - t.y, s.x - t.x);
  }

  function tick(state, dt, freeze) {
    if (tickFn) tickFn(state, dt, freeze);
  }

  root.ABAI = { attach, tick, moveCap: abMoveCap, markActive: abMarkActive, lodChase: abLodChase };
  root.abMoveCap = abMoveCap;
  root.abMarkActive = abMarkActive;
  root.abLodChase = abLodChase;
})(typeof window !== "undefined" ? window : self);
