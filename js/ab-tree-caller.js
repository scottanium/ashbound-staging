// v82s: Reed Caller tree kit. Runs the Caller's new tree skills (data/skilltrees-caller.json); the tree math and UI are in
// js/ab-skilltree.js. Only active while a Caller uses trees. Servant hits arrive tagged {minion} from the game's servant
// code. No secrets here.
(function (root) {
  "use strict";
  const T = root.ABTree; if (!T || !T.kit) return;
  const X = T.tools, CLS = "reed_caller";
  let seen = new Map(); // servant uid -> {minionId, maxHp, x, y}
  const offered = new Set(); // uids shattered on purpose this frame (burst handled already)
  const reform = []; // {t, minionId}
  const marks = new WeakMap();
  const H = () => X.hooks();
  const P = (id) => (X.skillDef(id) || { params: {} }).params;
  const friends = (e) => ((e.world && e.world.friends) || []).filter((f) => !f.dead && !f.hireling && f.minionId);

  function summonSkillFor(minionId) {
    const c = ((root.ASHBOUND_DATA || {}).classes || []).find((x) => x.id === CLS);
    for (const id of (c && c.skills) || []) { const d = X.skillDef(id); if (d && d.behavior === "summon" && d.params && d.params.minion === minionId) return d; }
    return null;
  }
  function burstMul(e) { return X.rankOf(e, "endless_chorus") > 0 ? (P("endless_chorus").burstMul || 2) : 1; }
  // A servant breaks: cold burst scaled by its max life (Bond tree damage applies).
  function servantBurst(e, f, pct, radius, why) {
    const mul = X.skillMul(e.player, "glass_offering").mul * burstMul(e);
    const amt = (f.maxHp || 20) * pct / 100 * mul;
    const n = X.burst(e, f.x, f.y, radius, "cold", amt, "shatter_" + why, "#cfefff");
    H().particles(e, f.x, f.y, "#d7f4ff", 10, "cold");
    T.servantBursts = (T.servantBursts || 0) + 1; T.servantBurstLast = amt;
    return n;
  }
  function queueReform(e, f) {
    if (X.rankOf(e, "endless_chorus") <= 0 || f._abColossus) return;
    reform.push({ t: P("endless_chorus").reformSec || 1.5, minionId: f.minionId });
  }
  function rally(e, d2) {
    const p = e.player, pr = d2.params;
    let n = 0;
    for (const f of friends(e)) {
      let best = null, bd = pr.range || 9;
      for (const m of e.world.monsters) { if (m.dead) continue; const k = Math.hypot(m.x - f.x, m.y - f.y); if (k < bd) { bd = k; best = m; } }
      if (best) { const a = Math.atan2(f.y - best.y, f.x - best.x); f.x = best.x + Math.cos(a) * ((best.radius || 0.3) + (f.radius || 0.3) + 0.1); f.y = best.y + Math.sin(a) * ((best.radius || 0.3) + (f.radius || 0.3) + 0.1); }
      if (!(f._abRallyT > 0)) { f._abApsBase = f.aps || 1; f.aps = f._abApsBase * (1 + (pr.apsPct || 60) / 100); }
      f._abRallyT = pr.duration || 6; n++;
      e.effects.push({ type: "ring", x: f.x, y: f.y, radius: 0.6, t: 0.3, max: 0.3, color: "#d7f4ff" });
    }
    if (!n) e.toasts.push({ text: "No servants to rally.", t: 1.2 });
    T.rallied = (T.rallied || 0) + n;
  }
  function colossus(e, d2, rank, mul) {
    const p = e.player, pr = d2.params, w = e.world;
    for (const f of friends(e)) if (f._abColossus) { f.hp = 0; f.dead = true; }
    const before = new Set((w.friends || []).map((f) => f.uid));
    const call = { id: "glassling", name: d2.name, type: "active", behavior: "summon", params: { minion: "glassling", max: [99, 0] } };
    const nT = e.toasts.length;
    H().melee(e, call, rank);
    e.toasts.length = nT;
    const f = (w.friends || []).find((x) => !before.has(x.uid));
    if (!f) return;
    p.companions = (p.companions || []).filter((c) => c.uid !== f.uid); // never saved: it fades on its own
    f._abColossus = true; f._abColT = pr.duration || 20; f._abSlamT = pr.slamEvery || 2.5; f._abRank = rank; f._abMul = mul;
    f.name = d2.name; f.hp = f.maxHp = f.maxHp * (pr.lifeMul || 8); f.dmgMin *= pr.dmgMul || 4; f.dmgMax *= pr.dmgMul || 4; f.radius = (f.radius || 0.32) * (pr.sizeMul || 1.8);
    e.toasts.push({ text: d2.name + " rises!", t: 1.8, kind: "good" });
    e.effects.push({ type: "ring", x: f.x, y: f.y, radius: 2.6, t: 0.7, max: 0.7, color: "#9fd4ea" });
    H().particles(e, f.x, f.y, "#d7f4ff", 20, "cold");
    T.colossusCasts = (T.colossusCasts || 0) + 1; T.colossusUid = f.uid;
  }
  function blackIce(e, d2, rank) {
    const pr = d2.params, aim = X.aimPoint(e, pr.range || 7), rad = Array.isArray(pr.radius) ? pr.radius[0] : pr.radius || 1.8;
    let sum = 0, n = 0;
    for (const m of X.near(e, aim.x, aim.y, rad)) { const c = H().cold(e, pr.cold, rank); sum += c; n++; X.hit(e, m, "cold", c, "black_ice", { canCrit: true }); }
    const avg = n ? sum / n : H().cold(e, pr.cold, rank);
    X.pool({ x: aim.x, y: aim.y, r: rad, t: pr.poolSeconds || 5, every: pr.poolTick || 0.5, tick: pr.poolTick || 0.5, dmg: avg * (pr.poolPct || 22) / 100, el: "cold", slow: pr.chill || 1, color: "#7fb8d6", spark: "#d7f4ff", kind: "cold", tag: "black_ice" });
    e.effects.push({ type: "ring", x: aim.x, y: aim.y, radius: rad, t: 0.4, max: 0.4, color: "#9fd4ea" });
    H().particles(e, aim.x, aim.y, "#d7f4ff", 12, "cold");
    T.blackIceCasts = (T.blackIceCasts || 0) + 1;
  }
  function offering(e, d2, rank, mul) {
    const p = e.player, pr = d2.params, list = friends(e).filter((f) => !f._abColossus);
    if (!list.length) { e.toasts.push({ text: "No servants to offer.", t: 1.2 }); return; }
    const pct = (pr.burstPct || 35) + 0.5 * (rank - 1);
    for (const f of list) {
      servantBurst(e, f, pct, pr.burstRadius || 2, "offering");
      f.hp = 0; f.dead = true; offered.add(f.uid); seen.delete(f.uid);
      p.companions = (p.companions || []).filter((c) => c.uid !== f.uid);
      queueReform(e, f);
      if (e.sheet) { const amt = e.sheet.life * (pr.healPct || 4) / 100; if (root.ABSustain && root.ABSustain.applyLife) root.ABSustain.applyLife(e, amt, { kind: "heal" }); else p.hp = Math.min(e.sheet.life, p.hp + amt); }
    }
    T.offered = (T.offered || 0) + list.length;
  }

  T.kit(CLS, {
    buffs: [],
    behaviors: { tree_rally: rally, tree_colossus: colossus, tree_black_ice: blackIce, tree_offering: offering },
    preDamage(e, target, a) {
      if (a.minion && X.rankOf(e, "cold_chorus") > 0) {
        const pr = P("cold_chorus");
        if (target.slowT > 0) { a.phys = (a.phys || 0) * (1 + (pr.pct || 25) / 100); T.chorusBonusHits = (T.chorusBonusHits || 0) + 1; }
        target.slowT = Math.max(target.slowT || 0, pr.chillSec || 2);
      }
      if (target._abFrozenT > 0 && X.rankOf(e, "glassmere_heart") > 0) {
        const k = 1 + (P("glassmere_heart").pct || 30) / 100;
        for (const el of ["phys", "fire", "cold", "light", "poison"]) if (a[el]) a[el] *= k;
        T.frozenHits = (T.frozenHits || 0) + 1;
      }
    },
    onHit(ev, e) {
      const m = ev.target; if (!m || m.dead) return;
      if (ev.element === "cold" && X.rankOf(e, "glassmere_heart") > 0 && !(m._abFrozenT > 0)) {
        const n = (marks.get(m) || 0) + 1;
        if (n >= (P("glassmere_heart").marks || 5)) {
          marks.set(m, 0); const sec = P("glassmere_heart").freezeSec || 2;
          X.still(m, sec); m._abFrozenT = sec;
          e.effects.push({ type: "ring", x: m.x, y: m.y, radius: (m.radius || 0.3) + 0.3, t: 0.4, max: 0.4, color: "#d7f4ff" });
          T.freezes = (T.freezes || 0) + 1;
        } else marks.set(m, n);
      }
      if (X.rankOf(e, "deep_cold") > 0 && !m.boss && m.slowT > 0 && m.hp > 0 && m.hp < (m.maxHp || 1) * (P("deep_cold").execPct || 15) / 100 && !/^shatter/.test(ev.tag || "")) {
        X.hit(e, m, "cold", Math.max(m.maxHp || 0, m.hp * 4), "shatter"); // resists still apply, so overkill on purpose
        H().particles(e, m.x, m.y, "#e8f8ff", 10, "cold");
        T.shatters = (T.shatters || 0) + 1;
      }
    },
    tick(e, dt, freeze) {
      const p = e.player, list = friends(e), now = new Map();
      for (const f of list) now.set(f.uid, { minionId: f.minionId, maxHp: f.maxHp, x: f.x, y: f.y, colossus: !!f._abColossus });
      // Servants that broke since last frame (not offered on purpose): Glass Echo burst, Endless Chorus re-form.
      for (const [uid, f] of seen) {
        if (now.has(uid) || offered.has(uid)) continue;
        if (f.colossus) continue;
        if (X.rankOf(e, "shatter_bond") > 0) servantBurst(e, f, P("shatter_bond").burstPct || 25, P("shatter_bond").burstRadius || 1.8, "echo");
        queueReform(e, f);
      }
      seen = now; offered.clear();
      for (let i = reform.length - 1; i >= 0; i--) {
        const q = reform[i]; q.t -= dt; if (q.t > 0) continue;
        reform.splice(i, 1);
        const d = summonSkillFor(q.minionId), r = d ? X.rankOf(e, d.id) : 0;
        if (!d || r <= 0 || X.rankOf(e, "endless_chorus") <= 0) continue;
        const { mul } = X.skillMul(p, d.id), nT = e.toasts.length;
        X.withMul(mul, () => H().melee(e, d, r));
        e.toasts.length = nT;
        T.reformed = (T.reformed || 0) + 1;
      }
      for (const f of list) {
        if (f._abRallyT > 0) { f._abRallyT -= dt; if (f._abRallyT <= 0) f.aps = f._abApsBase || f.aps; }
        if (f._abColossus) {
          f._abColT -= dt;
          if (f._abColT <= 0) { f.hp = 0; f.dead = true; e.effects.push({ type: "ring", x: f.x, y: f.y, radius: 1.6, t: 0.5, max: 0.5, color: "#9fd4ea" }); continue; }
          f._abSlamT -= dt;
          if (f._abSlamT <= 0 && !freeze) {
            const pr = P("mere_colossus"); f._abSlamT = pr.slamEvery || 2.5;
            const amt = X.withMul(f._abMul || 1, () => H().cold(e, pr.cold, f._abRank || 1));
            X.burst(e, f.x, f.y, pr.slamRadius || 2.2, "cold", amt, "colossus", "#9fd4ea", { canCrit: true });
            H().particles(e, f.x, f.y, "#d7f4ff", 12, "cold");
            T.colossusSlams = (T.colossusSlams || 0) + 1;
          }
        }
      }
      for (const m of (e.world && e.world.monsters) || []) if (m._abFrozenT > 0) m._abFrozenT -= dt;
    },
    clear() { seen = new Map(); offered.clear(); reform.length = 0; }
  });
})(typeof window !== "undefined" ? window : self);
