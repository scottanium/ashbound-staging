// v81s: Warden skill trees (staging trial). Tuning and text live in data/skilltrees-warden.json.
// Points go into 3 trees. Every 5 points in a tree unlocks its next skill; the 8th (at 40) is the ultimate.
// Points between unlocks add that tree's bonus; points 41-50 add damage only. Only the class named in the
// data uses trees; every other class keeps the old per-skill system. No secrets here.
(function (root) {
  "use strict";
  let H = null; // game hooks, set by attach()
  const api = { curMul: 1 };
  const extraTrees = {}; // spell-book hook: tree defs registered at runtime
  let clock = 0;
  const pools = [];
  const pending = [];
  let fbCount = 0, heartCount = 0, deathTokens = 6, lastBastion = false, lastBuffKey = "";
  const replyAt = new WeakMap();

  function data() { const D = root.ASHBOUND_DATA || {}; return D.skillTrees || null; }
  function str(k, vars) {
    const d = data(); let s = (d && d.strings && d.strings[k]) || k;
    for (const n of Object.keys(vars || {})) s = s.split("{" + n + "}").join(String(vars[n]));
    return s;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function skillDef(id) { const D = root.ASHBOUND_DATA || {}; return (D.skills || []).find((s) => s && s.id === id) || null; }

  // ---- trees and points -------------------------------------------------
  function treeDef(id) {
    if (extraTrees[id]) return extraTrees[id];
    const d = data(); return d ? (d.trees || []).find((t) => t.id === id) || null : null;
  }
  function supports(classId) { const d = data(); return !!(d && d.enabled !== false && d.classId === classId); }
  function active(p) { return !!(p && p.tree && p.tree.v && supports(p.classId)); }
  function fresh(classId) {
    if (!supports(classId)) return null;
    const d = data(), slots = (d.trees || []).map((t) => t.id), pts = {};
    for (const id of slots) pts[id] = 0;
    return { v: 1, slots, pts };
  }
  function slotTrees(p) { return (p.tree.slots || []).map(treeDef).filter(Boolean); }
  function totalPoints(p) {
    const d = data(); if (!d) return 0; const P = d.points || {};
    const L = Math.max(1, Math.min(P.maxLevel || 50, p.level || 1));
    const base = (P.atLevel1 == null ? 1 : P.atLevel1) + (L - 1) * (P.perLevel == null ? 1 : P.perLevel);
    const para = Math.min(P.paragonCap == null ? 20 : P.paragonCap, Math.floor((p.paragonLevel || 0) / (P.paragonEvery || 5)) * (P.paragonAmount == null ? 1 : P.paragonAmount));
    // testBonus: staging Test Tools "+ skill points" only (never set by play).
    return Math.min(P.total || 70, base + para) + ((p.tree && p.tree.testBonus) || 0);
  }
  function spentPoints(p) { let s = 0; for (const k of Object.keys(p.tree.pts || {})) s += p.tree.pts[k] || 0; return s; }
  function freePoints(p) { return Math.max(0, totalPoints(p) - spentPoints(p)); }
  function ultAt() { const d = data(); return (d && d.ultimateAt) || 40; }
  function treeMax() { const d = data(); return (d && d.treeMax) || 50; }
  function betweenCount(pts) { const c = Math.min(pts, ultAt()), e = (data() && data().unlockEvery) || 5; return c - Math.floor(c / e); }
  function bandPoints(pts) { const b = (data() && data().damageBand) || {}; return Math.max(0, Math.min(pts, b.to || 50) - ((b.from || 41) - 1)); }
  function damagePct(tree, pts) {
    const b = (data() && data().damageBand) || {};
    return betweenCount(pts) * ((tree.between && tree.between.damagePct) || 0) + bandPoints(pts) * (b.pctPerPoint || 0);
  }
  function areaPct(tree, pts) { return Math.floor(betweenCount(pts) / 2) * ((tree.between && tree.between.areaPctPer2) || 0); }
  function statBonus(tree, pts) {
    const out = {}, st = (tree.between && tree.between.stats) || {}, n = betweenCount(pts);
    for (const k of Object.keys(st)) out[k] = st[k] * n;
    return out;
  }
  function nodeRank(node, pts) {
    if (pts < node.at) return 0;
    const R = (data() && data().rank) || {}, max = R.max || 20;
    const r = Math.max(1, Math.min(max, Math.round(Math.min(pts, ultAt()) / (R.perRank || 2))));
    const def = skillDef(node.skill);
    return Math.min(r, (def && def.maxRank) || max);
  }
  function treeOfSkill(p, id) {
    for (const t of slotTrees(p)) for (const n of t.nodes) if (n.skill === id) return t;
    return null;
  }
  function canSpend(p, treeId) {
    const t = treeDef(treeId); if (!t || (p.tree.slots || []).indexOf(treeId) < 0) return { ok: false, reason: "No such tree." };
    const pts = p.tree.pts[treeId] || 0;
    if (pts >= treeMax()) return { ok: false, reason: str("maxed") };
    if (freePoints(p) < 1) return { ok: false, reason: str("noPoints") };
    if (pts + 1 >= ultAt()) for (const o of p.tree.slots) if (o !== treeId && (p.tree.pts[o] || 0) >= ultAt()) return { ok: false, reason: str("oneUltimate") };
    return { ok: true };
  }
  // Rebuild the legacy rank store from the tree (only on spend/reset/migrate).
  function derive(p) {
    if (!active(p)) return;
    const D = root.ASHBOUND_DATA || {}, cls = (D.classes || []).find((c) => c.id === p.classId);
    const sk = {};
    for (const id of (cls && cls.skills) || []) sk[id] = 0;
    for (const t of slotTrees(p)) { const pts = p.tree.pts[t.id] || 0; for (const n of t.nodes) sk[n.skill] = nodeRank(n, pts); }
    p.skills = sk;
    if (Array.isArray(p.bar)) p.bar = p.bar.map((id) => (id && sk[id] > 0 ? id : null));
    p.skillPoints = freePoints(p);
  }
  function spend(p, treeId) {
    const c = canSpend(p, treeId); if (!c.ok) return c;
    const t = treeDef(treeId), before = p.tree.pts[treeId] || 0;
    p.tree.pts[treeId] = before + 1;
    derive(p);
    const node = t.nodes.find((n) => n.at === before + 1);
    return { ok: true, unlocked: node ? node.skill : null };
  }
  function unspend(p, treeId) {
    if (!(p.tree.pts[treeId] > 0)) return false;
    p.tree.pts[treeId] -= 1; derive(p); return true;
  }
  function resetFree(p) {
    if (!active(p)) return 0;
    const s = spentPoints(p);
    for (const k of Object.keys(p.tree.pts)) p.tree.pts[k] = 0;
    p.buffs = (p.buffs || []).filter((b) => !isTreeBuff(b.id));
    derive(p);
    return s;
  }
  // Spell-book hook (next phase): swap one tree slot for another tree and reset every point for free.
  function registerTree(def) { if (def && def.id && Array.isArray(def.nodes)) extraTrees[def.id] = def; return !!(def && extraTrees[def.id]); }
  function replaceTree(p, slotIndex, treeId) {
    if (!active(p) || !treeDef(treeId) || slotIndex < 0 || slotIndex >= p.tree.slots.length) return false;
    if (p.tree.slots.indexOf(treeId) >= 0 && p.tree.slots[slotIndex] !== treeId) return false;
    const old = p.tree.slots[slotIndex];
    delete p.tree.pts[old];
    p.tree.slots[slotIndex] = treeId;
    p.tree.pts[treeId] = 0;
    resetFree(p);
    p.bar = [null, null, null, null];
    return true;
  }

  // ---- sheet ---------------------------------------------------------------
  function sheetMods(p) {
    if (!active(p)) return null;
    const m = {};
    for (const t of slotTrees(p)) {
      const sb = statBonus(t, p.tree.pts[t.id] || 0);
      for (const k of Object.keys(sb)) m[k] = (m[k] || 0) + sb[k];
    }
    const up = (data().upgrades || {}).ash_skin;
    const r = (p.skills && p.skills.ash_skin) || 0;
    if (up && r > 0) m.allres = (m.allres || 0) + r * (up.allResPerRank || 0);
    return m;
  }
  function rankOf(state, id) { return (state.sheet && state.sheet.ranks && state.sheet.ranks[id]) || 0; }
  function postSheet(p, sheet) {
    if (!active(p) || !sheet) return sheet;
    p.skillPoints = freePoints(p);
    const bast = skillDef("unbroken_bastion"), r = (sheet.ranks && sheet.ranks.unbroken_bastion) || 0;
    if (bast && r > 0) {
      const pr = bast.params, flat = (sheet.defense || 0) * (pr.armorPct / 100) / (pr.armorPerDamage || 10);
      sheet.physMin += flat; sheet.physMax += flat; sheet.bastionFlat = Math.round(flat);
    }
    return sheet;
  }

  // ---- casting ------------------------------------------------------------
  function scaleArr(a, k) { return Array.isArray(a) ? a.map((x) => x * k) : typeof a === "number" ? a * k : a; }
  function scaled(def, mul, area, extra) {
    const pr = Object.assign({}, def.params || {});
    if (pr.physMult) pr.physMult = scaleArr(pr.physMult, mul);
    if (pr.range != null && def.behavior !== "projectile") pr.range = pr.range * area;
    if (pr.radius != null && def.behavior !== "projectile") pr.radius = scaleArr(pr.radius, area);
    if (pr.arc != null) pr.arc = Math.min(Math.PI * 2, pr.arc * area);
    Object.assign(pr, extra || {});
    return Object.assign({}, def, { params: pr });
  }
  function hasBuff(p, id) { return (p.buffs || []).some((b) => b.id === id && b.remaining > 0); }
  function isTreeBuff(id) { return id === "avatar_of_the_kiln" || id === "life_spite_bulwark" || id === "bastion_rage"; }
  function treeMul(p, t) { const pts = p.tree.pts[t.id] || 0; return { mul: 1 + damagePct(t, pts) / 100, area: 1 + areaPct(t, pts) / 100 }; }
  function withMul(mul, fn) { const prev = api.curMul; api.curMul = mul; try { return fn(); } finally { api.curMul = prev; } }

  function wrapCast(e, def, rank, raw) {
    const p = e.player;
    if (!H || !active(p) || !def) return false;
    const t = treeOfSkill(p, def.id); if (!t) return false;
    const { mul, area } = treeMul(p, t);
    let extra = null;
    if (t.id === "brand" && def.behavior === "melee" && hasBuff(p, "avatar_of_the_kiln")) extra = { arc: Math.PI * 2 };
    const d2 = scaled(def, mul, area, extra);
    withMul(mul, () => {
      if (def.behavior === "tree_flurry") flurry(e, d2, rank, mul);
      else if (def.behavior === "tree_avatar") avatar(e, d2, rank);
      else if (def.behavior === "tree_slag") slag(e, d2, rank, mul);
      else if (def.behavior === "tree_bulwark") bulwark(e, d2, rank);
      else raw(e, d2, rank);
    });
    if (def.id === "kiln_hook") hookPull(e, d2);
    if (t.id === "ember" && def.type === "active" && rankOf(e, "heart_of_the_sunken_kiln") > 0) {
      const hp = skillDef("heart_of_the_sunken_kiln").params;
      heartCount += 1;
      if (heartCount % (hp.everyNthCast || 3) === 0) freeBloom(e, hp.freeBloomRadiusMul || 1.5, "heart");
    }
    return true;
  }
  function hookPull(e, d2) {
    const up = (data().upgrades || {}).kiln_hook; if (!up || !H.knock) return;
    const p = e.player, rng = d2.params.range || 1.7, arc = d2.params.arc || 1;
    for (const m of e.world.monsters) {
      if (m.dead || m.boss) continue;
      const dist = Math.hypot(m.x - p.x, m.y - p.y); if (dist > rng + (m.radius || 0.3) || dist < 0.6) continue;
      let ang = Math.atan2(m.y - p.y, m.x - p.x) - p.facing; while (ang > Math.PI) ang -= Math.PI * 2; while (ang < -Math.PI) ang += Math.PI * 2;
      if (Math.abs(ang) > arc / 2) continue;
      const k = Math.min(up.pull || 0.9, dist - 0.55);
      H.knock(e.world, m, -(m.x - p.x) / dist * k, -(m.y - p.y) / dist * k);
    }
  }
  function flurry(e, d2, rank, mul) {
    const pr = d2.params, hit = Object.assign({}, d2, { behavior: "melee", params: { arc: pr.arc, range: pr.range, physMult: pr.physMult, fire: pr.fire } });
    for (let i = 0; i < (pr.hits || 3); i++) pending.push({ t: i * 0.11, mul, fn: () => H.melee(e, hit, rank) });
    const area = pr.range / ((skillDef("furnace_flurry").params.range) || 1.5);
    const burst = Object.assign({}, d2, { behavior: "nova", params: { radius: [(pr.burstRadius || 1.6) * area, 0], fire: pr.burstFire } });
    pending.push({ t: (pr.hits || 3) * 0.11 + 0.05, mul, fn: () => H.nova(e, burst, rank) });
  }
  function avatar(e, d2, rank) {
    const p = e.player, pr = d2.params;
    p.buffs = (p.buffs || []).filter((b) => b.id !== d2.id);
    p.buffs.push({ id: d2.id, name: d2.name, remaining: pr.duration || 12, mods: { ias: pr.ias || 40 } });
    e.toasts.push({ text: d2.name + "!", t: 1.6, kind: "good" });
    e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 2.4, t: 0.6, max: 0.6, color: "#ff7a2a" });
    e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 1.4, t: 0.45, max: 0.45, color: "#ffd27a" });
    H.particles(e, p.x, p.y, "#ff8a3d", 18, "fire");
    api.avatarCasts = (api.avatarCasts || 0) + 1;
    H.recalc();
  }
  function slag(e, d2, rank, mul) {
    const p = e.player, pr = d2.params, rng = pr.range || 7.5;
    let tx = p.x + Math.cos(p.facing) * rng * 0.7, ty = p.y + Math.sin(p.facing) * rng * 0.7, best = 1e9;
    for (const m of e.world.monsters) {
      if (m.dead) continue;
      const dist = Math.hypot(m.x - p.x, m.y - p.y); if (dist > rng) continue;
      let ang = Math.atan2(m.y - p.y, m.x - p.x) - p.facing; while (ang > Math.PI) ang -= Math.PI * 2; while (ang < -Math.PI) ang += Math.PI * 2;
      if (Math.abs(ang) < 0.6 && dist < best) { best = dist; tx = m.x; ty = m.y; }
    }
    const rad = Array.isArray(pr.radius) ? pr.radius[0] : pr.radius || 1.7;
    const [lo, hi] = H.te(pr.fire, rank);
    let sum = 0, n = 0;
    for (const m of e.world.monsters) {
      if (m.dead || Math.hypot(m.x - tx, m.y - ty) > rad + (m.radius || 0.3)) continue;
      const f = H.fire(e, lo, hi); sum += f; n++;
      H.apply(e, m, { fire: f, kind: "spell", source: "player", canMiss: false, canCrit: true, canLeech: false, tag: "slag" });
    }
    const avg = n ? sum / n : H.fire(e, lo, hi);
    pools.push({ x: tx, y: ty, r: rad, t: pr.poolSeconds || 4, tick: pr.poolTick || 0.5, every: pr.poolTick || 0.5, dmg: avg * (pr.poolPct || 25) / 100 });
    e.effects.push({ type: "ring", x: tx, y: ty, radius: rad, t: 0.4, max: 0.4, color: "#ff6a2a" });
    H.particles(e, tx, ty, "#ff7a3c", 14, "fire");
    api.slagCasts = (api.slagCasts || 0) + 1;
  }
  function bulwark(e, d2, rank) {
    const p = e.player, pr = d2.params, cost = Math.max(0, Math.min(p.hp - 1, p.hp * (pr.lifePct || 20) / 100));
    p.hp -= cost;
    const shield = cost * (pr.shieldMul || 2.5);
    p.buffs = (p.buffs || []).filter((b) => b.id !== d2.id);
    p.buffs.push({ id: d2.id, name: d2.name, remaining: pr.duration || 8, absorb: shield, absorbMax: shield, mods: { defense: H.J(pr.defense, rank) } });
    e.toasts.push({ text: d2.name + " " + Math.round(shield), t: 1.4, kind: "good" });
    e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 1.2, t: 0.4, max: 0.4, color: "#ffb36b" });
    H.recalc();
  }
  function freeBloom(e, radiusMul, why) {
    const p = e.player, bloom = skillDef("cinder_bloom"), r = rankOf(e, "cinder_bloom"), t = treeOfSkill(p, "cinder_bloom");
    if (!bloom || r <= 0 || !t) return;
    const { mul, area } = treeMul(p, t);
    const d2 = scaled(bloom, mul, area * radiusMul);
    withMul(mul, () => H.nova(e, d2, r));
    api.freeBlooms = (api.freeBlooms || 0) + 1;
    if (why === "heart") api.heartBlooms = (api.heartBlooms || 0) + 1;
  }

  // ---- damage hooks (called from the game's damage function) ----------------
  function preDamage(e, target, a) {
    const p = e.player;
    if (!active(p) || !a || a.source !== "player" || target === p || target.friendly) return;
    if (a.fire > 0) target._abBurnAt = clock;
    if (a.kind === "attack" && rankOf(e, "forgebreaker") > 0) {
      const fp = skillDef("forgebreaker").params;
      fbCount += 1;
      if (fbCount % (fp.everyNth || 4) === 0) { a.forceCrit = true; api.forgeCrits = (api.forgeCrits || 0) + 1; }
      target._fbT = fp.armorBreakSec || 4; target._fbMul = 1 - (fp.armorBreakPct || 15) / 100;
    }
    if (rankOf(e, "heart_of_the_sunken_kiln") > 0) {
      const hp = skillDef("heart_of_the_sunken_kiln").params;
      a.fireCritMult = hp.fireCritMult || 1.75; a.fireResIgnore = hp.fireResistIgnore || 25;
    }
  }
  function onHit(ev) {
    const e = ev.state; if (!e || !active(e.player) || ev.source !== "player") return;
    if (ev.kind === "attack" && hasBuff(e.player, "avatar_of_the_kiln")) {
      const pr = skillDef("avatar_of_the_kiln").params, t = ev.target, amt = ev.amount * (pr.splashPct || 35) / 100;
      if (!t || amt < 1) return;
      for (const m of e.world.monsters) {
        if (m === t || m.dead || Math.hypot(m.x - t.x, m.y - t.y) > (pr.splashRadius || 1.6) + (m.radius || 0.3)) continue;
        H.apply(e, m, { fire: amt, kind: "spell", source: "player", canMiss: false, canCrit: false, canLeech: false, tag: "splash" });
      }
      api.splashes = (api.splashes || 0) + 1;
      H.particles(e, t.x, t.y, "#ffa04a", 4, "fire");
    }
  }
  function bastionLow(e) {
    const r = rankOf(e, "unbroken_bastion"); if (r <= 0 || !e.sheet) return false;
    return e.player.hp > 0 && e.player.hp / Math.max(1, e.sheet.life) < skillDef("unbroken_bastion").params.lowLifePct / 100;
  }
  function onHurt(ev) {
    const e = ev.state; if (!e || !active(e.player)) return;
    const src = ev.source, r = rankOf(e, "iron_reply");
    if (r <= 0 || !src || src.dead || ev.kind !== "attack" || !(ev.amount > 0) || src === e.player) return;
    const pr = skillDef("iron_reply").params, last = replyAt.get(src);
    if (last != null && clock - last < (pr.icd || 0.35)) return;
    replyAt.set(src, clock);
    const t = treeOfSkill(e.player, "iron_reply"), mul = t ? treeMul(e.player, t).mul : 1;
    const pct = (pr.armorPct || 12) + (pr.armorPctPerRank || 0) * (r - 1);
    let dmg = (e.sheet.defense || 0) * pct / 100 * mul;
    if (bastionLow(e)) dmg *= skillDef("unbroken_bastion").params.lowLifeReplyMul || 2;
    if (dmg < 1) return;
    H.apply(e, src, { phys: dmg, kind: "thorns", source: "player", canMiss: false, canCrit: false, canLeech: false, tag: "iron_reply" });
    api.replies = (api.replies || 0) + 1;
  }
  function onKilled(ev) {
    const e = ev.state, t = ev.target; if (!e || !t || !active(e.player) || t.friendly) return;
    const r = rankOf(e, "ash_detonation"); if (r <= 0) return;
    const pr = skillDef("ash_detonation").params;
    if (t._abBurnAt == null || clock - t._abBurnAt > (pr.burnWindow || 2.5) || deathTokens < 1) return;
    deathTokens -= 1;
    const tr = treeOfSkill(e.player, "ash_detonation"), mul = tr ? treeMul(e.player, tr).mul : 1;
    const dmg = (t.maxHp || 30) * (pr.deathPctMaxHp || 12) / 100 * mul, rad = pr.deathRadius || 1.5;
    for (const m of e.world.monsters) {
      if (m === t || m.dead || Math.hypot(m.x - t.x, m.y - t.y) > rad + (m.radius || 0.3)) continue;
      H.apply(e, m, { fire: dmg, kind: "spell", source: "player", canMiss: false, canCrit: false, canLeech: false, tag: "detonation" });
    }
    e.effects.push({ type: "ring", x: t.x, y: t.y, radius: rad, t: 0.3, max: 0.3, color: "#ff8a3d" });
    H.particles(e, t.x, t.y, "#ff8a3d", 8, "fire");
    api.detonations = (api.detonations || 0) + 1;
  }

  // ---- tick ---------------------------------------------------------------
  function tick(e, dt, freeze) {
    const p = e.player; if (!p) return;
    if (p.progress && p.progress.treeNotice === "pending" && e.mode === "play") {
      p.progress.treeNotice = "shown";
      e.toasts.push({ text: str("notice"), t: 6, kind: "good" });
      e.pendingSave = true;
    }
    if (e.ui && e.ui.panel !== "skills" && e.ui.treeUndo && e.ui.treeUndo.length) e.ui.treeUndo = [];
    if (!active(p) || !H) return;
    // Level can only drop through staging Test Tools; if more points are spent than the hero has, refund the tree.
    if (spentPoints(p) > totalPoints(p)) { resetFree(p); H.recalc(); e.toasts.push({ text: "Tree points refunded (level went down).", t: 2.5, kind: "good" }); }
    clock += dt;
    deathTokens = Math.min((skillDef("ash_detonation") || { params: {} }).params.deathCapPerSec || 6, deathTokens + dt * ((skillDef("ash_detonation") || { params: {} }).params.deathCapPerSec || 6));
    for (const m of (e.world && e.world.monsters) || []) if (m._fbT > 0) m._fbT -= dt;
    // Ash Detonation: Ash Ward bursts when it breaks or runs out (checked before buffs expire).
    if (rankOf(e, "ash_detonation") > 0) for (const b of p.buffs || []) {
      if (b.id !== "ash_ward" || b._abBurst) continue;
      if ((b.absorb != null && b.absorb <= 0) || b.remaining - dt <= 0) { b._abBurst = true; freeBloom(e, 1, "ward"); api.wardBursts = (api.wardBursts || 0) + 1; }
    }
    // Unbroken Bastion: low-life rage.
    const low = bastionLow(e);
    if (low !== lastBastion) {
      lastBastion = low;
      p.buffs = (p.buffs || []).filter((b) => b.id !== "bastion_rage");
      if (low) p.buffs.push({ id: "bastion_rage", name: "Unbroken", remaining: 1e9, mods: { ias: skillDef("unbroken_bastion").params.lowLifeIas || 100 } });
      H.recalc();
    }
    // Recalc when one of our buffs ends on its own.
    const key = (p.buffs || []).filter((b) => isTreeBuff(b.id)).map((b) => b.id).sort().join(",");
    if (key !== lastBuffKey) { const had = lastBuffKey; lastBuffKey = key; if (had && had.length > key.length) H.recalc(); }
    if (freeze) return;
    if (hasBuff(p, "avatar_of_the_kiln")) {
      api._auraT = (api._auraT || 0) - dt;
      if (api._auraT <= 0) { api._auraT = 0.45; e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 0.95, t: 0.4, max: 0.4, color: "#ff8a3d" }); H.particles(e, p.x, p.y, "#ffb067", 3, "fire"); }
    }
    for (let i = pending.length - 1; i >= 0; i--) {
      const q = pending[i]; q.t -= dt;
      if (q.t <= 0) { pending.splice(i, 1); try { withMul(q.mul, q.fn); } catch (err) { console.warn("ABTree pending", err); } }
    }
    for (let i = pools.length - 1; i >= 0; i--) {
      const q = pools[i]; q.t -= dt; q.tick -= dt;
      if (q.tick <= 0) {
        q.tick += q.every;
        for (const m of e.world.monsters) {
          if (m.dead || Math.hypot(m.x - q.x, m.y - q.y) > q.r + (m.radius || 0.3)) continue;
          H.apply(e, m, { fire: q.dmg, kind: "spell", source: "player", canMiss: false, canCrit: false, canLeech: false, tag: "slag" });
          api.poolTicks = (api.poolTicks || 0) + 1;
        }
        e.effects.push({ type: "ring", x: q.x, y: q.y, radius: q.r, t: q.every * 0.9, max: q.every * 0.9, color: "#c8461e" });
        if (Math.random() < 0.7) H.particles(e, q.x + (Math.random() - 0.5) * q.r, q.y + (Math.random() - 0.5) * q.r, "#ff6a2a", 3, "fire");
      }
      if (q.t <= 0) pools.splice(i, 1);
    }
  }
  function clearWorld() { pools.length = 0; pending.length = 0; }

  // ---- save migration -------------------------------------------------------
  // Old saves (no p.tree) for the tree class: every point back for free; level, paragon, gear, stash and story stay.
  function migratePlayer(p) {
    if (!p || p.tree || !supports(p.classId)) return false;
    p.tree = fresh(p.classId);
    p.skills = {};
    p.bar = [null, null, null, null];
    p.buffs = [];
    p.cooldowns = {};
    p.progress = p.progress || {};
    p.progress.treeNotice = "pending";
    derive(p);
    return true;
  }
  function migrateSave(dto) { if (dto && dto.player) migratePlayer(dto.player); return dto; }

  // ---- actions ------------------------------------------------------------
  function act(name, t, e) {
    const p = e.player; if (!active(p)) return { touch: false };
    const tree = (t && t.tree) || e.ui.treeTab;
    if (name === "tree-tab") { if (treeDef(tree)) e.ui.treeTab = tree; const n = treeDef(tree).nodes[0]; if (!treeOfSkill(p, e.ui.skillId) || treeOfSkill(p, e.ui.skillId).id !== tree) e.ui.skillId = n.skill; return { save: false }; }
    if (name === "tree-spend") {
      const r = spend(p, tree);
      if (!r.ok) return { toast: r.reason, kind: "bad", save: false };
      e.ui.treeTab = tree;
      e.ui.treeUndo = e.ui.treeUndo || []; e.ui.treeUndo.push(tree);
      if (p.progress && p.progress.seen) { p.progress.seen.skilled = true; p.progress.seen.steps = p.progress.seen.steps || {}; p.progress.seen.steps.point = true; if (r.unlocked) p.progress.seen.steps.skill = true; }
      if (r.unlocked) e.ui.skillId = r.unlocked;
      H && H.recalc();
      e.sfx && e.sfx.push("ui");
      if (r.unlocked) { const d = skillDef(r.unlocked); return { toast: str("unlockedToast", { skill: d ? d.name : r.unlocked }), kind: "good" }; }
      return {};
    }
    if (name === "tree-undo") {
      const st = e.ui.treeUndo || []; const last = st.pop();
      if (!last || !unspend(p, last)) return { toast: "Nothing to undo.", kind: "bad", save: false };
      e.ui.treeTab = last; H && H.recalc(); return {};
    }
    return { touch: false };
  }

  // ---- UI -------------------------------------------------------------------
  function bonusLine(t, pts) {
    const parts = [], dmg = damagePct(t, pts), sb = statBonus(t, pts), ar = areaPct(t, pts);
    const names = { str: "Str", ene: "Energy", mana: "Mana", ar: "attack", defense: "armor", life: "life" };
    parts.push("+" + dmg + "% " + esc((t.between && t.between.label) || t.name) + " damage");
    for (const k of Object.keys(sb)) parts.push("+" + sb[k] + " " + (names[k] || k));
    parts.push("+" + ar + "% area");
    return parts.join(" \u00b7 ");
  }
  function nextNode(t, pts) { return t.nodes.find((n) => n.at > pts) || null; }
  function panelHtml(e) {
    const p = e.player, trees = slotTrees(p);
    let tab = e.ui.treeTab; if (!trees.some((t) => t.id === tab)) { const ts = treeOfSkill(p, e.ui.skillId); tab = (ts || trees[0]).id; e.ui.treeTab = tab; }
    const cur = treeOfSkill(p, e.ui.skillId); if (!cur || cur.id !== tab) e.ui.skillId = treeDef(tab).nodes[0].skill;
    const t = treeDef(tab), pts = p.tree.pts[tab] || 0, free = freePoints(p), cs = canSpend(p, tab), undo = (e.ui.treeUndo || []).length > 0;
    const nx = nextNode(t, pts), band = bandPoints(pts), bd = (data().damageBand || {});
    const nextTxt = pts >= treeMax() ? str("maxed") : nx ? str("next", { skill: esc((skillDef(nx.skill) || {}).name || nx.skill), at: nx.at, n: nx.at - pts }) : str("allUnlocked");
    const tabs = trees.map((x) => {
      const xp = p.tree.pts[x.id] || 0, ult = xp >= ultAt();
      return `<button type="button" class="tt-tab ${x.id === tab ? "is-on" : ""} ${ult ? "has-ult" : ""}" data-act="tree-tab" data-tree="${x.id}" aria-pressed="${x.id === tab}">${esc(x.name)} <b>${xp}</b></button>`;
    }).join("");
    const nodes = t.nodes.map((n) => {
      const d = skillDef(n.skill) || { name: n.skill, type: "" }, unlocked = pts >= n.at, isNext = nx && nx.at === n.at;
      const rank = unlocked ? (e.sheet.ranks[n.skill] || 0) : 0, base = unlocked ? nodeRank(n, pts) : 0;
      const st = unlocked ? "unlocked" : isNext ? "next" : "locked";
      return `<button type="button" class="tt-node st-${st} ${n.ultimate ? "is-ult" : ""} ${e.ui.skillId === n.skill ? "is-sel" : ""}" data-act="select-skill" data-skill="${n.skill}" data-at="${n.at}">
        <span class="tt-at">${n.at}</span><span class="tt-nm">${esc(d.name)}${n.ultimate ? `<em class="tt-ult">${esc(str("ultimate"))}</em>` : ""}</span>
        <span class="tt-st">${unlocked ? esc(str("unlocked", { rank: base })) + (rank > base ? `<i>+${rank - base}</i>` : "") : (d.type === "passive" ? "passive \u00b7 " : "") + esc(str("locked", { at: n.at }))}</span></button>`;
    }).join("");
    const pips = []; for (let i = (bd.from || 41); i <= (bd.to || 50); i++) pips.push(`<span class="tt-pip ${pts >= i ? "on" : ""}" title="${i}"></span>`);
    const fill = Math.min(100, pts / treeMax() * 100);
    const ticks = t.nodes.map((n) => `<span class="tt-tick ${pts >= n.at ? "on" : ""} ${n.ultimate ? "ult" : ""}" style="left:${n.at / treeMax() * 100}%"></span>`).join("");
    return `<div class="tt-head"><p class="small tt-points" id="tt-points"><b>${free}</b> ${esc(str("pointsLine", { free: "", used: spentPoints(p), total: totalPoints(p) }).replace(/^\s+/, ""))}</p>
      <button type="button" class="btn hold-respec" data-act="respec-arm">Hold to respec</button></div>
    <div class="tt-tabs" role="tablist">${tabs}</div>
    <div class="tree-wrap tt-wrap">
      <section class="tt-tree" data-tree="${tab}">
        <div class="tt-bonus" id="tt-bonus"><span class="muted">${esc(str("bonusTitle"))}:</span> ${bonusLine(t, pts)}</div>
        <div class="tt-spend">
          <button type="button" class="btn primary tt-plus" data-act="tree-spend" data-tree="${tab}" ${cs.ok ? "" : "disabled"}>${esc(str("spend", { tree: t.name }))}</button>
          <button type="button" class="btn tt-undo" data-act="tree-undo" ${undo ? "" : "disabled"}>${esc(str("undo"))}</button>
          <span class="small tt-next">${cs.ok || pts >= treeMax() ? nextTxt : esc(cs.reason)}</span>
        </div>
        <div class="tt-track" aria-label="${pts} of ${treeMax()}"><span class="tt-fill" style="width:${fill}%"></span>${ticks}<span class="tt-bandzone" style="left:${ultAt() / treeMax() * 100}%"></span></div>
        <div class="tt-nodes">${nodes}</div>
        <div class="tt-band ${band > 0 ? "is-on" : ""}" id="tt-band"><span class="small"><b>${esc(str("bandTitle"))}</b></span><span class="tt-pips">${pips.join("")}</span><span class="small">${esc(str("bandLine", { pct: band * (bd.pctPerPoint || 0), tree: t.name }))}</span></div>
      </section>
    </div>`;
  }
  function detailHtml(e) {
    const p = e.player, id = e.ui.skillId, d = skillDef(id), t = treeOfSkill(p, id);
    if (!d || !t) return "";
    const node = t.nodes.find((n) => n.skill === id), pts = p.tree.pts[t.id] || 0, unlocked = pts >= node.at;
    const rank = unlocked ? (e.sheet.ranks[id] || 0) : 0, shown = Math.max(1, rank);
    let lines = [];
    if (d.tree) { lines.push(d.about || ""); for (const n of d.notes || []) lines.push(n); }
    else { try { lines = (H && H.describe ? H.describe(d, shown) : [d.about || ""]); } catch (err) { lines = [d.about || ""]; } }
    const mana = d.type === "active" && H && H.mana ? ` \u00b7 mana ${H.mana(d, shown)}` : "";
    const cd = d.type === "active" && d.cooldown ? ` \u00b7 ${d.cooldown}s` : "";
    const head = unlocked ? str("detailUnlocked", { rank, pts, tree: t.name }) : str("detailLocked", { at: node.at, tree: t.name });
    const dmg = damagePct(t, pts), ar = areaPct(t, pts);
    if (unlocked && (dmg || ar)) lines.push(`${str("bonusTitle")}: +${dmg}% damage` + (ar ? `, +${ar}% area` : "") + (pts >= ultAt() ? " (rank and area stop at 40)" : ""));
    return `<div class="detail" id="detail">
    <div class="detail-head">
      <strong>${esc(d.name)}${node.ultimate ? ` <span class="tt-ult">${esc(str("ultimate"))}</span>` : ""}</strong>
      <div class="small muted">${esc(d.type)}${mana}${cd}</div>
      <div class="small ${unlocked ? "good" : "muted"}">${esc(head)}</div>
    </div>
    <div class="detail-core">${lines.filter(Boolean).slice(0, 5).map((r) => `<div class="small">${esc(r)}</div>`).join("")}</div>
    <div class="detail-actions"><div class="row">
      ${d.type === "active" ? [0, 1, 2, 3].map((r) => `<button class="btn slim bar-slot" data-act="assign" data-skill="${d.id}" data-slot="${r}" aria-label="Bar ${r + 1}" ${unlocked ? "" : "disabled"}>${r + 1}</button>`).join("") : ""}
    </div></div>
  </div>`;
  }

  function attach(hooks) {
    H = hooks || null;
    if (!H || api.bound || typeof root.ABBus === "undefined") return;
    api.bound = true;
    root.ABBus.on("combat:hit", onHit);
    root.ABBus.on("combat:playerHurt", onHurt);
    root.ABBus.on("combat:killed", onKilled);
  }

  Object.assign(api, {
    data, supports, active, fresh, totalPoints, spentPoints, freePoints, canSpend, spend, unspend, resetFree, derive,
    nodeRank, damagePct, areaPct, statBonus, betweenCount, bandPoints, treeDef, treeOfSkill,
    registerTree, replaceTree, sheetMods, postSheet, wrapCast, preDamage, tick, clearWorld,
    migratePlayer, migrateSave, act, panelHtml, detailHtml, attach, bastionLow,
    _pools: pools, _pending: pending
  });
  root.ABTree = api;
})(typeof window !== "undefined" ? window : self);
