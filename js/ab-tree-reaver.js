// v82s: Salt Reaver tree kit. Runs the Reaver's new tree skills (data/skilltrees-reaver.json); the tree math and UI are in
// js/ab-skilltree.js. Only active while a Reaver uses trees. No secrets here.
(function (root) {
  "use strict";
  const T = root.ABTree; if (!T || !T.kit) return;
  const X = T.tools, CLS = "salt_reaver";
  let wakeHits = 0, wakeUntil = 0, rhythm = 0, lastHit = -99, lastFight = -99, tideDealt = 0, tideOn = false, wrapped = false;
  const H = () => X.hooks();
  const P = (id) => (X.skillDef(id) || { params: {} }).params;
  const mine = (e) => !!(e && e.player && e.player.classId === CLS && T.active(e.player));

  // Brine Surplus: life stolen or healed past full becomes a shield. Wraps ABSustain.applyLife once (it is called through
  // the global, so the wrapper sees every heal and leech).
  function wrapSustain() {
    if (wrapped || !root.ABSustain || !root.ABSustain.applyLife) return;
    wrapped = true;
    const orig = root.ABSustain.applyLife;
    root.ABSustain.applyLife = function (state, amount, opts) {
      const got = orig.apply(this, arguments);
      try { if (mine(state)) overflow(state, (Number(amount) || 0) - (got || 0)); } catch (err) { console.warn("brine", err); }
      return got;
    };
  }
  function overflow(e, extra) {
    const p = e.player, sh = e.sheet;
    if (!(extra > 0) || X.rankOf(e, "brine_surplus") <= 0 || !sh || p.hp < sh.life - 0.01) return;
    if (root.ABSustain.fightingBoss && root.ABSustain.fightingBoss(e)) extra *= 0.5;
    const cap = sh.life * (P("brine_surplus").capPctLife || 30) / 100;
    let b = X.getBuff(p, "brine_shield");
    if (!b) b = X.addBuff(p, { id: "brine_shield", name: (X.skillDef("brine_surplus") || {}).name || "Brine", remaining: 1e9, absorb: 0, absorbMax: cap, mods: {} });
    b.absorbMax = cap; b.absorb = Math.min(cap, (b.absorb || 0) + extra);
    T.brineGained = (T.brineGained || 0) + extra;
  }

  function rhythmMax(e) { return X.rankOf(e, "perfect_tempo") > 0 ? (P("perfect_tempo").max || 20) : (P("rhythm").max || 10); }
  function rhythmWindow(e) { return X.rankOf(e, "perfect_tempo") > 0 ? (P("perfect_tempo").window || 4) : (P("rhythm").window || 2); }
  function setRhythm(e, n) {
    const p = e.player; n = Math.max(0, Math.min(rhythmMax(e), n));
    if (n === rhythm && (n === 0) === !X.getBuff(p, "rhythm")) return;
    rhythm = n; T.rhythm = n;
    p.buffs = (p.buffs || []).filter((b) => b.id !== "rhythm");
    if (n > 0) p.buffs.push({ id: "rhythm", name: ((X.skillDef("rhythm") || {}).name || "Rhythm") + " " + n, remaining: 1e9, stacks: n, mods: { ias: n * (P("rhythm").iasPer || 4) } });
    H().recalc();
  }

  function saltStorm(e, d2) {
    const p = e.player, pr = d2.params;
    X.addBuff(p, { id: d2.id, name: d2.name, remaining: pr.duration || 10, mods: { frw: pr.frw || 35 } });
    e.toasts.push({ text: d2.name + "!", t: 1.6, kind: "good" });
    e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 2.2, t: 0.5, max: 0.5, color: "#dfe9ef" });
    H().particles(e, p.x, p.y, "#e8f2f6", 16, "phys");
    T.stormCasts = (T.stormCasts || 0) + 1;
    H().recalc();
  }
  function landingCut(e) {
    const cut = X.skillDef("salt_cut"), r = X.rankOf(e, "salt_cut"); if (!cut || r <= 0) return;
    const { mul, area } = X.skillMul(e.player, "salt_cut");
    const d2 = X.scaled(cut, mul, area, { arc: Math.PI * 2 });
    X.withMul(mul, () => H().melee(e, d2, r));
    T.stormCuts = (T.stormCuts || 0) + 1;
  }
  function fullMeasure(e, d2, rank, mul, raw) {
    const n = rhythm, k = 1 + n * (d2.params.perStackPct || 15) / 100;
    const d3 = Object.assign({}, d2, { behavior: "melee", params: Object.assign({}, d2.params, { physMult: d2.params.physMult.map((x) => x * k) }) });
    raw(e, d3, rank);
    T.measureSpent = n; T.measureCasts = (T.measureCasts || 0) + 1;
    if (n > 0) { e.toasts.push({ text: d2.name + " \u00d7" + n, t: 1.2, kind: "good" }); setRhythm(e, 0); }
  }
  function bloodletting(e, d2, rank, mul, raw) {
    const p = e.player, pr = d2.params, rng = pr.range || 2, arc = pr.arc || 0.9;
    let n = 0;
    for (const m of e.world.monsters) if (!m.dead && Math.hypot(m.x - p.x, m.y - p.y) <= rng + (m.radius || 0.3) && Math.abs(X.angTo(p, m)) <= arc / 2) n++;
    raw(e, Object.assign({}, d2, { behavior: "melee" }), rank);
    n = Math.min(n, pr.maxHeals || 5);
    if (n > 0 && e.sheet) {
      const amt = e.sheet.life * (pr.healPctPerHit || 3) / 100 * n;
      if (root.ABSustain && root.ABSustain.applyLife) root.ABSustain.applyLife(e, amt, { kind: "heal" }); else p.hp = Math.min(e.sheet.life, p.hp + amt);
    }
    T.bloodHeals = (T.bloodHeals || 0) + n;
  }
  function redTide(e, d2) {
    const p = e.player, pr = d2.params;
    X.addBuff(p, { id: d2.id, name: d2.name, remaining: pr.duration || 8, mods: { leech: (pr.leechPct || 8) / 100 } });
    tideDealt = 0; tideOn = true;
    e.toasts.push({ text: d2.name + "!", t: 1.6, kind: "good" });
    e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 2, t: 0.5, max: 0.5, color: "#c0303a" });
    H().particles(e, p.x, p.y, "#d23a44", 16, "phys");
    T.tideCasts = (T.tideCasts || 0) + 1;
    H().recalc();
  }

  T.kit(CLS, {
    buffs: ["salt_storm", "rhythm", "red_tide", "brine_shield"],
    sheetMods(p, m) {
      if ((p.skills && p.skills.perfect_tempo) > 0) m.ias = (m.ias || 0) + (P("perfect_tempo").ias || 20);
    },
    postSheet(p, sheet) {
      const cap = P("perfect_tempo").cap || 140;
      sheet.tempoOver = Math.max(0, ((sheet.mods && sheet.mods.ias) || 0) - cap);
    },
    behaviors: { tree_salt_storm: saltStorm, tree_measure: fullMeasure, tree_bloodletting: bloodletting, tree_red_tide: redTide },
    afterCast(e, def, d2, t, rank) {
      const p = e.player;
      if (def.behavior !== "dash") return;
      if (X.rankOf(e, "wake_edge") > 0) { wakeHits = P("wake_edge").hits || 2; wakeUntil = X.now() + (P("wake_edge").window || 3); }
      if (X.hasBuff(p, "salt_storm")) {
        delete p.cooldowns[def.id];
        const cost = H().mana ? H().mana(def, rank) : 0; if (cost > 0 && e.sheet) p.mana = Math.min(e.sheet.mana, p.mana + cost);
        landingCut(e);
      }
    },
    preDamage(e, target, a) {
      if (a.kind !== "attack") return;
      if (wakeHits > 0 && X.now() <= wakeUntil && X.rankOf(e, "wake_edge") > 0) { wakeHits--; a.forceCrit = true; T.wakeCrits = (T.wakeCrits || 0) + 1; }
      const pt = X.rankOf(e, "perfect_tempo");
      if (pt > 0 && e.sheet && e.sheet.tempoOver > 0) {
        const k = 1 + e.sheet.tempoOver * (P("perfect_tempo").dmgPerOver || 1.5) / 100;
        for (const el of ["phys", "fire", "cold", "light", "poison"]) if (a[el]) a[el] *= k;
        T.overclockHits = (T.overclockHits || 0) + 1; T.overclockMul = k;
      }
    },
    onHit(ev, e) {
      lastFight = X.now();
      if (tideOn && X.hasBuff(e.player, "red_tide")) tideDealt += ev.amount || 0;
      if (ev.kind !== "attack") return;
      if (X.rankOf(e, "rhythm") > 0) { const within = X.now() - lastHit <= rhythmWindow(e); setRhythm(e, within ? rhythm + 1 : Math.max(1, rhythm)); }
      lastHit = X.now();
    },
    onHurt(ev, e) {
      const p = e.player; lastFight = X.now();
      if (X.hasBuff(p, "red_tide") && p.hp < 1) { p.hp = 1; T.tideSaves = (T.tideSaves || 0) + 1; }
    },
    tick(e, dt) {
      wrapSustain();
      const p = e.player, now = X.now();
      if (rhythm > 0 && (now - lastHit > rhythmWindow(e) || X.rankOf(e, "rhythm") <= 0)) setRhythm(e, 0);
      else if (rhythm > rhythmMax(e)) setRhythm(e, rhythmMax(e));
      else if (rhythm === 0 && X.getBuff(p, "rhythm")) setRhythm(e, 0);
      if (tideOn && !X.hasBuff(p, "red_tide")) {
        tideOn = false;
        const amt = tideDealt * (P("red_tide").healBackPct || 25) / 100; tideDealt = 0;
        if (amt > 0 && root.ABSustain && root.ABSustain.applyLife) root.ABSustain.applyLife(e, amt, { kind: "heal" });
        T.tideHealBack = amt;
      }
      const b = X.getBuff(p, "brine_shield");
      if (b) {
        if (X.rankOf(e, "brine_surplus") <= 0) b.absorb = 0;
        else if (now - lastFight > (P("brine_surplus").fadeAfter || 3)) b.absorb -= (e.sheet ? e.sheet.life : 50) * (P("brine_surplus").fadePctPerSec || 4) / 100 * dt;
        if (!(b.absorb > 0)) p.buffs = p.buffs.filter((x) => x !== b);
      }
      if (X.hasBuff(p, "salt_storm")) {
        T._stormT = (T._stormT || 0) - dt;
        if (T._stormT <= 0) { T._stormT = 0.4; H().particles(e, p.x, p.y, "#e8f2f6", 3, "phys"); }
      }
    },
    clear() { wakeHits = 0; rhythm = 0; T.rhythm = 0; tideOn = false; tideDealt = 0; }
  });
})(typeof window !== "undefined" ? window : self);
