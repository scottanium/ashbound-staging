// v82s: Briar Stalker tree kit. Runs the Stalker's new tree skills (data/skilltrees-stalker.json); the tree math and UI
// are in js/ab-skilltree.js. Only active while a Stalker uses trees. The game keeps only the strongest poison on a foe;
// Thousandfold Venom keeps a list of doses per foe and writes their sum back. No secrets here.
(function (root) {
  "use strict";
  const T = root.ABTree; if (!T || !T.kit) return;
  const X = T.tools, CLS = "briar_stalker";
  let prevTraps = [];
  const H = () => X.hooks();
  const P = (id) => (X.skillDef(id) || { params: {} }).params;
  const ALL = ["phys", "fire", "cold", "light", "poison"];
  const mulAll = (a, k) => { for (const el of ALL) if (a[el]) a[el] *= k; };

  // Place a trap at (x, y) through the game's own trap code (so trap bonuses and limits apply), using def's id for the limit.
  function placeAt(e, def, rank, x, y) {
    const p = e.player, ox = p.x, oy = p.y;
    p.x = x - Math.cos(p.facing) * 0.85; p.y = y - Math.sin(p.facing) * 0.85;
    try { H().melee(e, def, rank); } finally { p.x = ox; p.y = oy; }
  }
  function snareAs(id, name, max, arm) {
    const t = X.skillDef("thorn_snare"); if (!t) return null;
    return Object.assign({}, t, { id, name, params: Object.assign({}, t.params, { max: [max, 0] }, arm ? { arm } : {}) });
  }
  function seedScatter(e, d2, rank) {
    const p = e.player, pr = d2.params, def = snareAs("seed_scatter", d2.name, pr.max || 6);
    if (!def) return;
    for (let i = 0; i < (pr.count || 3); i++) {
      const a = p.facing + (i - ((pr.count || 3) - 1) / 2) * (pr.spread || 0.55);
      placeAt(e, def, rank, p.x + Math.cos(a) * (pr.dist || 2.4), p.y + Math.sin(a) * (pr.dist || 2.4));
    }
    T.seedsThrown = (T.seedsThrown || 0) + (pr.count || 3);
  }
  function garden(e, d2, rank) {
    const p = e.player, pr = d2.params, n = pr.count || 8, def = snareAs("garden_of_thorns", d2.name, n, pr.arm || 0.6);
    if (!def) return;
    for (let i = 0; i < n; i++) { const a = i * Math.PI * 2 / n; placeAt(e, def, rank, p.x + Math.cos(a) * (pr.ringRadius || 2.3), p.y + Math.sin(a) * (pr.ringRadius || 2.3)); }
    X.addBuff(p, { id: d2.id, name: d2.name, remaining: pr.duration || 8 });
    e.effects.push({ type: "ring", x: p.x, y: p.y, radius: (pr.ringRadius || 2.3) + 0.4, t: 0.6, max: 0.6, color: "#9dce6a" });
    H().particles(e, p.x, p.y, "#9dce6a", 18, "poison");
    T.gardenCasts = (T.gardenCasts || 0) + 1;
  }
  function fangVolley(e, d2, rank) {
    const p = e.player, pr = d2.params, nd = X.skillDef("needle"), f0 = p.facing, n = pr.count || 3;
    if (!nd) return;
    for (let i = 0; i < n; i++) { p.facing = f0 + (i - (n - 1) / 2) * (pr.spread || 0.28); H().melee(e, nd, rank); }
    p.facing = f0;
    T.fangs = (T.fangs || 0) + n;
  }
  function veil(e, d2, rank) {
    const p = e.player, pr = d2.params;
    X.addBuff(p, { id: d2.id, name: d2.name, remaining: pr.duration || 5, mods: { frw: pr.frw || 40 } });
    p.iframes = Math.max(p.iframes || 0, pr.duration || 5);
    H().particles(e, p.x, p.y, "#6f7fa8", 16, "poison");
    e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 1.2, t: 0.5, max: 0.5, color: "#6f7fa8" });
    T.veilCasts = (T.veilCasts || 0) + 1;
  }
  // Which armed trap is this hit from? Traps hit with exactly their stored phys/poison and no tag.
  function trapOf(e, a) {
    if (a.tag || a.kind !== "spell" || a.minion) return null;
    for (const q of (e.world && e.world.traps) || []) if (q.arm <= 0 && !q.force && q.phys === (a.phys || 0) && q.poison === (a.poison || 0)) return q;
    return null;
  }

  T.kit(CLS, {
    buffs: ["twilight_veil", "garden_of_thorns"],
    behaviors: { tree_seed_scatter: seedScatter, tree_garden: garden, tree_fang_volley: fangVolley, tree_veil: veil },
    afterCast(e, def) {
      if (def.id === "vanish") { e.player.iframes = Math.max(e.player.iframes || 0, P("vanish").iframes || 1.2); T.vanishes = (T.vanishes || 0) + 1; }
    },
    preDamage(e, m, a) {
      const p = e.player, trap = trapOf(e, a);
      if (trap) { trap._abFired = true; if (trap._abLife == null) trap._abLife = trap.life; T.trapHits = (T.trapHits || 0) + 1; }
      if (a.kind === "dot") return;
      if (X.rankOf(e, "ambusher") > 0 && m.hp >= (m.maxHp || 1) * (P("ambusher").fullAt || 0.98)) {
        mulAll(a, 1 + (P("ambusher").pct || 60) / 100); T.ambushes = (T.ambushes || 0) + 1;
      }
      if (!trap && a.kind !== "thorns" && X.hasBuff(p, "twilight_veil")) {
        const pr = P("twilight_veil"), r = X.rankOf(e, "twilight_veil") || 1;
        mulAll(a, pr.mult || 3);
        a.poison = (a.poison || 0) + H().poison(e, pr.poison, r);
        a.canMiss = false;
        p.buffs = p.buffs.filter((b) => b.id !== "twilight_veil");
        p.iframes = Math.min(p.iframes || 0, 0.3);
        e.effects.push({ type: "ring", x: m.x, y: m.y, radius: 1, t: 0.4, max: 0.4, color: "#6f7fa8" });
        T.veilBreaks = (T.veilBreaks || 0) + 1; T.veilPoison = a.poison; T.veilBrokeBy = (a.kind || "") + "/" + (a.tag || "");
      }
      // Thousandfold Venom: every dose is its own stack (same math the game uses for one dose).
      if (X.rankOf(e, "thousandfold_venom") > 0 && a.poison > 0) {
        const res = Math.min(75, Math.max(-30, (m.resist && m.resist.poison) || 0));
        const dps = a.poison * (1 - res / 100) * (m.hexT > 0 ? 0.85 : 1) / 3;
        if (dps > 1 / 3) {
          const t = 3 + ((e.sheet && e.sheet.ranks && e.sheet.ranks.long_bite) || 0) * 0.22;
          const st = m._abVen || (m._abVen = []);
          st.push({ dps, t });
          const max = P("thousandfold_venom").maxStacks || 8;
          while (st.length > max) { let k = 0; for (let i = 1; i < st.length; i++) if (st[i].t < st[k].t) k = i; st.splice(k, 1); }
          if (m.poison && m.poison.t > 0 && m._abKeepTick == null) m._abKeepTick = m.poison.tick;
          T.venomStacksMax = Math.max(T.venomStacksMax || 0, st.length);
        }
      }
    },
    onKilled(ev, e) {
      const t = ev.target;
      if (X.rankOf(e, "virulence") <= 0 || !t || !t.poison || !(t.poison.t > 0) || !(t.poison.dps > 0)) return;
      const pr = P("virulence"); let n = 0;
      for (const m of X.near(e, t.x, t.y, pr.radius || 2.5, t)) {
        m.poison = { dps: Math.max((m.poison && m.poison.dps) || 0, t.poison.dps), t: Math.max((m.poison && m.poison.t) || 0, t.poison.t + (pr.extraSec || 2)), tick: (m.poison && m.poison.t > 0) ? m.poison.tick : 0.4 };
        if (t._abVen && t._abVen.length) m._abVen = (m._abVen || []).concat(t._abVen.map((s) => ({ dps: s.dps, t: s.t + (pr.extraSec || 2) }))).slice(-(P("thousandfold_venom").maxStacks || 8));
        n++;
      }
      if (n) { e.effects.push({ type: "ring", x: t.x, y: t.y, radius: pr.radius || 2.5, t: 0.4, max: 0.4, color: "#9dce6a" }); T.spreads = (T.spreads || 0) + n; }
    },
    tick(e, dt) {
      const p = e.player, w = e.world; if (!w) return;
      // Fired traps: Hair Trigger re-arms once; Garden of Thorns re-arms every time while it lasts.
      const now = w.traps || [], gardenOn = X.hasBuff(p, "garden_of_thorns"), hair = X.rankOf(e, "hair_trigger") > 0;
      for (const q of prevTraps) {
        if (now.includes(q) || !q._abFired || q.force) continue;
        const n = q._abRearms || 0;
        if (!gardenOn && !(hair && n < (P("hair_trigger").rearm || 1))) continue;
        const arm = gardenOn ? (P("garden_of_thorns").arm || 0.6) : (P("hair_trigger").arm || 0.35);
        w.traps = w.traps || [];
        w.traps.push({ skillId: q.skillId, x: q.x, y: q.y, arm, life: Math.max(q._abLife || 0, P("hair_trigger").minLife || 4), radius: q.radius, poison: q.poison, phys: q.phys, _abRearms: n + 1 });
        e.effects.push({ type: "ring", x: q.x, y: q.y, radius: q.radius * 0.6, t: 0.25, max: 0.25, color: "#c9e89a" });
        T.rearms = (T.rearms || 0) + 1;
      }
      prevTraps = (w.traps || []).slice();
      // Thousandfold Venom: all stacks tick at once.
      for (const m of w.monsters) {
        if (!m._abVen) continue;
        if (m.dead) { m._abVen = null; continue; }
        for (const s of m._abVen) s.t -= dt;
        m._abVen = m._abVen.filter((s) => s.t > 0);
        if (!m._abVen.length) { m._abVen = null; m._abKeepTick = null; continue; }
        let sum = 0, tmax = 0; for (const s of m._abVen) { sum += s.dps; tmax = Math.max(tmax, s.t); }
        const tick = m.poison && m.poison.t > 0 ? m.poison.tick : 0.4;
        m.poison = { dps: sum, t: tmax, tick: m._abKeepTick != null ? Math.min(tick, m._abKeepTick) : tick }; // a new dose must not reset the tick clock
        m._abKeepTick = null;
        T.venomDps = sum;
      }
    },
    clear() { prevTraps = []; }
  });
})(typeof window !== "undefined" ? window : self);
