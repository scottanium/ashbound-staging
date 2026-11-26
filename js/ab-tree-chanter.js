// v82s: Bell Chanter tree kit. Runs the Chanter's new tree skills (data/skilltrees-chanter.json); the tree math and UI are
// in js/ab-skilltree.js. Only active while a Chanter uses trees. No secrets here.
(function (root) {
  "use strict";
  const T = root.ABTree; if (!T || !T.kit) return;
  const X = T.tools, CLS = "bell_chanter";
  const silenced = new Set();
  let lastHigh = false;
  const H = () => X.hooks();
  const P = (id) => (X.skillDef(id) || { params: {} }).params;

  // Lightning jumps (Sympathy, Carillon). Jumps are tagged "arc" and never jump again.
  function jump(e, from, amount, n, pct) {
    if (n <= 0 || !(amount > 0)) return 0;
    const r = P("sympathy").radius || 3, list = X.near(e, from.x, from.y, r, from).sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y));
    let k = 0;
    for (const m of list.slice(0, n)) {
      X.hit(e, m, "light", amount * pct / 100, "arc");
      e.effects.push({ type: "ring", x: m.x, y: m.y, radius: 0.45, t: 0.2, max: 0.2, color: "#e6e38a" });
      k++;
    }
    if (k) { H().particles(e, from.x, from.y, "#f3e6a0", 3, "holy"); T.arcs = (T.arcs || 0) + k; }
    return k;
  }
  function toll(e, d2, rank, mul) {
    const pr = d2.params, aim = X.aimPoint(e, pr.range || 7), rad = Array.isArray(pr.radius) ? pr.radius[0] : pr.radius || 1.5;
    for (let i = 0; i < (pr.strikes || 3); i++) X.pending.push({ t: i * (pr.gap || 0.25), mul, fn: () => {
      for (const m of X.near(e, aim.x, aim.y, rad)) X.hit(e, m, "light", H().light(e, pr.light, rank), "toll", { canCrit: true });
      e.effects.push({ type: "ring", x: aim.x, y: aim.y, radius: rad, t: 0.3, max: 0.3, color: "#f3e6a0" });
      H().particles(e, aim.x, aim.y, "#f6eeb0", 8, "holy");
      T.tollStrikes = (T.tollStrikes || 0) + 1;
    } });
  }
  function carillon(e, d2) {
    const p = e.player, pr = d2.params;
    X.addBuff(p, { id: d2.id, name: d2.name, remaining: pr.duration || 10, mods: { fcr: pr.fcr || 30 } });
    e.toasts.push({ text: d2.name + "!", t: 1.6, kind: "good" });
    e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 2.4, t: 0.6, max: 0.6, color: "#f3e6a0" });
    H().particles(e, p.x, p.y, "#f6eeb0", 16, "holy");
    T.carillonCasts = (T.carillonCasts || 0) + 1;
    H().recalc();
  }
  function hush(e, d2, rank) {
    const p = e.player, pr = d2.params;
    H().nova(e, d2, rank);
    const rad = H().J(pr.radius, rank);
    let n = 0;
    for (const m of X.near(e, p.x, p.y, rad)) { m.slowT = Math.max(m.slowT || 0, pr.slowSec || 4); n++; }
    T.hushed = (T.hushed || 0) + n;
  }
  function silence(e, d2) {
    const p = e.player, pr = d2.params, rad = pr.radius || 5.5;
    let held = 0;
    for (const m of X.near(e, p.x, p.y, rad)) {
      if (X.still(m, pr.duration || 4)) { held++; m._abSilT = pr.duration || 4; m._abStored = 0; silenced.add(m); }
    }
    e.toasts.push({ text: d2.name + "\u2026", t: 1.8, kind: "good" });
    e.effects.push({ type: "ring", x: p.x, y: p.y, radius: rad, t: 0.8, max: 0.8, color: "#cfd8ff" });
    e.effects.push({ type: "ring", x: p.x, y: p.y, radius: rad * 0.6, t: 0.6, max: 0.6, color: "#f3e6a0" });
    T.silenceCasts = (T.silenceCasts || 0) + 1; T.silenceHeld = held;
  }
  function stillWater(e, d2) {
    const p = e.player, pr = d2.params;
    if (e.sheet) p.mana = Math.min(e.sheet.mana, p.mana + e.sheet.mana * (pr.manaPct || 25) / 100);
    X.addBuff(p, { id: d2.id, name: d2.name, remaining: pr.duration || 6, mods: { fcr: pr.fcr || 25 } });
    e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 1.2, t: 0.4, max: 0.4, color: "#9fd4ea" });
    T.stillWaterCasts = (T.stillWaterCasts || 0) + 1;
    H().recalc();
  }

  T.kit(CLS, {
    buffs: ["carillon", "still_water", "bell_resonance"],
    postSheet(p, sheet) {
      if (((sheet.ranks && sheet.ranks.bell_that_holds) || 0) > 0) {
        const add = (sheet.mana || 0) * (P("bell_that_holds").manaToLightPct || 1.5) / 100;
        sheet.lightMin = (sheet.lightMin || 0) + add; sheet.lightMax = (sheet.lightMax || 0) + add; sheet.bellLight = Math.round(add * 10) / 10;
      }
    },
    behaviors: { tree_toll: toll, tree_carillon: carillon, tree_hush: hush, tree_silence: silence, tree_still_water: stillWater },
    afterCast(e, def, d2, t, rank) {
      const p = e.player;
      if (t.id === "bell" && def.behavior === "projectile" && X.hasBuff(p, "carillon")) {
        const pr = P("carillon"), f = p.facing;
        for (let i = 1; i <= (pr.fan || 2) / 2; i++) for (const s of [-1, 1]) { p.facing = f + s * i * (pr.spread || 0.22); H().melee(e, d2, rank); }
        p.facing = f; T.fanNotes = (T.fanNotes || 0) + (pr.fan || 2);
      }
    },
    preDamage(e, target, a) {
      const r = X.rankOf(e, "dirge_weight");
      if (r > 0 && target.slowT > 0) {
        const pr = P("dirge_weight"), pct = ((pr.pct || 25) + (pr.pctPerRank || 0) * (r - 1)) * (X.isStill(target) ? (pr.stillMul || 2) : 1);
        for (const el of ["phys", "fire", "cold", "light", "poison"]) if (a[el]) a[el] *= 1 + pct / 100;
        T.dirgeHits = (T.dirgeHits || 0) + 1; T.dirgeLastPct = pct;
      }
    },
    onHit(ev, e) {
      const m = ev.target; if (!m) return;
      if (m._abSilT > 0 && ev.tag !== "silence") { m._abStored = (m._abStored || 0) + (ev.amount || 0) * (P("grand_silence").storePct || 40) / 100; }
      if (ev.tag === "arc" || ev.tag === "silence" || ev.element !== "holy") return;
      let n = 0, pct = 0;
      if (X.rankOf(e, "sympathy") > 0) { n = P("sympathy").arcs || 1; pct = P("sympathy").pct || 40; }
      if (X.hasBuff(e.player, "carillon")) { n += P("carillon").arcs || 2; pct = Math.max(pct, P("carillon").arcPct || 50); }
      if (n > 0) jump(e, m, ev.amount, n, pct);
    },
    onHurt(ev, e) {
      const p = e.player, r = X.rankOf(e, "mana_skin"); if (r <= 0 || !(ev.amount > 0) || ev.kind === "dot") return;
      const pct = X.rankOf(e, "bell_that_holds") > 0 ? (P("bell_that_holds").skinPct || 50) : (P("mana_skin").pct || 25);
      const per = P("mana_skin").manaPerLife || 1, want = ev.amount * pct / 100, take = Math.min(want, p.mana / per);
      if (take <= 0) return;
      p.mana -= take * per; p.hp += take; T.skinPaid = (T.skinPaid || 0) + take;
    },
    tick(e, dt, freeze) {
      const p = e.player;
      // Grand Silence: when the hold ends, the stored damage rings out once.
      for (const m of Array.from(silenced)) {
        if (m.dead) { silenced.delete(m); continue; }
        m._abSilT -= dt;
        if (m._abSilT > 0) continue;
        silenced.delete(m);
        const amt = m._abStored || 0; m._abStored = 0;
        if (amt >= 1) {
          X.hit(e, m, "light", amt, "silence");
          e.effects.push({ type: "ring", x: m.x, y: m.y, radius: 0.9, t: 0.35, max: 0.35, color: "#f3e6a0" });
          H().particles(e, m.x, m.y, "#f6eeb0", 6, "holy");
          T.silenceTolls = (T.silenceTolls || 0) + 1; T.silenceStoredLast = amt;
        }
      }
      // The Bell That Holds: cast faster above half mana.
      const holds = X.rankOf(e, "bell_that_holds") > 0 && e.sheet;
      const high = !!(holds && p.mana >= e.sheet.mana * (P("bell_that_holds").highPct || 50) / 100);
      if (high !== lastHigh || (!high && X.getBuff(p, "bell_resonance"))) {
        lastHigh = high;
        p.buffs = (p.buffs || []).filter((b) => b.id !== "bell_resonance");
        if (high) p.buffs.push({ id: "bell_resonance", name: (X.skillDef("bell_that_holds") || {}).name || "Resonance", remaining: 1e9, mods: { fcr: P("bell_that_holds").fcrHigh || 30 } });
        H().recalc();
      }
      if (!freeze && silenced.size) {
        T._silT = (T._silT || 0) - dt;
        if (T._silT <= 0) { T._silT = 0.5; for (const m of silenced) e.effects.push({ type: "ring", x: m.x, y: m.y, radius: (m.radius || 0.3) + 0.25, t: 0.45, max: 0.45, color: "#cfd8ff" }); }
      }
    },
    clear() { silenced.clear(); lastHigh = false; }
  });
})(typeof window !== "undefined" ? window : self);
