// v82s: skill trees for every class. Shared point math lives in data/skilltrees-common.json; each class's three trees,
// between-point bonuses and new skills live in data/skilltrees-<cls>.json (Warden: skilltrees-warden.json).
// Points go into 3 trees. Every 5 points in a tree unlocks its next skill; the 8th (at 40) is the ultimate.
// Points between unlocks add that tree's bonus; points 41-50 add damage only. 70 points total, never two trees at 40.
// Class mechanics are "kits": the Warden's is in this file, the other four register from js/ab-tree-<cls>.js.
// A class with no tree file (or the ?skilltrees=off fallback) keeps the old per-skill system. No secrets here.
(function (root) {
  "use strict";
  let H = null; // game hooks, set by attach()
  const api = { curMul: 1 };
  const extraTrees = {}; // spell-book hook: tree defs registered at runtime
  const kits = {}; // classId -> kit (cast/damage/tick hooks for that class's tree skills)
  let clock = 0;
  const pools = [];
  const pending = [];
  let strCls = null, lastBuffKey = "", lastWorld = null;

  function D() { return root.ASHBOUND_DATA || {}; }
  // data(cls): that class's merged tree data. data(): the shared math (common file; the Warden's merged data as a fallback).
  function data(cls) {
    if (cls) return (D().skillTreesByClass || {})[cls] || null;
    return D().skillTreeCommon || D().skillTrees || null;
  }
  function str(k, vars) {
    const d = (strCls && data(strCls)) || data(); let s = (d && d.strings && d.strings[k]) || k;
    for (const n of Object.keys(vars || {})) s = s.split("{" + n + "}").join(String(vars[n]));
    return s;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function skillDef(id) { return (D().skills || []).find((s) => s && s.id === id) || null; }

  // ---- trees and points -------------------------------------------------
  function treeDef(id) {
    if (extraTrees[id]) return extraTrees[id];
    const all = D().skillTreesByClass || {};
    for (const k of Object.keys(all)) { const t = (all[k].trees || []).find((x) => x.id === id); if (t) return t; }
    return null;
  }
  function supports(classId) { const d = data(classId); return !!(d && d.enabled !== false && Array.isArray(d.trees)); }
  function active(p) { return !!(p && p.tree && p.tree.v && supports(p.classId)); }
  function fresh(classId) {
    if (!supports(classId)) return null;
    const d = data(classId), slots = (d.trees || []).map((t) => t.id), pts = {};
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
  // v84n: trees are linear. No pick-1-of-2 pairs: every node a tree has reached is owned and levels with the tree.
  // isHeld stays (always true) so kit code that asked keeps working.
  function isHeld() { return true; }
  // Ultimate nodes ({ultimate:true, kind:"active"|"passive"}). One per tree today; a second (e.g. at 80) only needs a node.
  function ultKind(n) { if (n.kind) return n.kind; const d = skillDef(n.skill); return d && d.type === "passive" ? "passive" : "active"; }
  function isUltId(id) {
    if (!id) return false;
    const all = D().skillTreesByClass || {};
    for (const c of Object.keys(all)) for (const t of (all[c] && all[c].trees) || []) for (const n of t.nodes || []) if (n.ultimate && n.skill === id) return true;
    for (const k of Object.keys(extraTrees)) for (const n of extraTrees[k].nodes || []) if (n.ultimate && n.skill === id) return true;
    return false;
  }
  function ultNodes(p) {
    const out = [];
    if (!active(p)) return out;
    for (const t of slotTrees(p)) for (const n of t.nodes) if (n.ultimate) out.push({ tree: t.id, skill: n.skill, at: n.at, kind: ultKind(n), owned: ((p.skills && p.skills[n.skill]) || 0) > 0 });
    return out;
  }
  // The HUD ult button shows only an owned ACTIVE ultimate (a passive ult is always on and needs no button).
  function ultOf(p) { const u = ultNodes(p).filter((x) => x.owned && x.kind === "active").sort((a, b) => a.at - b.at)[0]; return u ? u.skill : null; }
  function treeOfSkill(p, id) {
    for (const t of slotTrees(p)) for (const n of t.nodes) if (n.skill === id) return t;
    return null;
  }
  function canSpend(p, treeId) {
    strCls = p.classId;
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
    const cls = (D().classes || []).find((c) => c.id === p.classId);
    const sk = {};
    for (const id of (cls && cls.skills) || []) sk[id] = 0;
    for (const t of slotTrees(p)) { const pts = p.tree.pts[t.id] || 0; for (const n of t.nodes) sk[n.skill] = nodeRank(n, pts); }
    p.skills = sk;
    // Bar slots 1-4 are for actives only; an ultimate lives on its own HUD button (ultOf), so it never sits here.
    if (Array.isArray(p.bar)) p.bar = p.bar.map((id) => (id && sk[id] > 0 && !isUltId(id) ? id : null));
    if (Array.isArray(p.barMemory)) p.barMemory = p.barMemory.map((id) => (id && !isUltId(id) ? id : null));
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
  // Load: re-derive ranks from the tree. v84n: saves from the pick-pair builds (p.tree.picks) simply own every skill again
  // (the set-aside side comes back at the tree's rank) and an ultimate on bar slots 1-4 moves to the ult button.
  // Points never change, so SAVE_VERSION stays 7.
  function normalizePicks(p) {
    if (!active(p)) return false;
    if (p.tree.picks) delete p.tree.picks;
    derive(p);
    return true;
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

  // ---- kits ------------------------------------------------------------------
  // kit(classId, impl): impl may define buffs (tree buff ids), sheetMods(p,m), postSheet(p,sheet), castExtra(e,def,t),
  // behaviors {name: fn(e,d2,rank,mul,raw)}, afterCast(e,def,d2,t,rank,mul), preDamage(e,target,a), onHit(ev,e),
  // onHurt(ev,e), onKilled(ev,e), tick(e,dt,freeze), clear().
  function kit(classId, impl) { if (classId && impl) kits[classId] = impl; return !!kits[classId]; }
  function kitOf(p) { return (p && kits[p.classId]) || null; }
  function isTreeBuff(id) { for (const k of Object.keys(kits)) if ((kits[k].buffs || []).indexOf(id) >= 0) return true; return false; }

  // ---- sheet ---------------------------------------------------------------
  function sheetMods(p) {
    if (!active(p)) return null;
    const m = {};
    for (const t of slotTrees(p)) {
      const sb = statBonus(t, p.tree.pts[t.id] || 0);
      for (const k of Object.keys(sb)) m[k] = (m[k] || 0) + sb[k];
    }
    const k = kitOf(p); if (k && k.sheetMods) k.sheetMods(p, m);
    return m;
  }
  function rankOf(state, id) { return (state.sheet && state.sheet.ranks && state.sheet.ranks[id]) || 0; }
  function postSheet(p, sheet) {
    if (!active(p) || !sheet) return sheet;
    p.skillPoints = freePoints(p);
    const k = kitOf(p); if (k && k.postSheet) k.postSheet(p, sheet);
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
  function getBuff(p, id) { return (p.buffs || []).find((b) => b.id === id && b.remaining > 0) || null; }
  function treeMul(p, t) { const pts = p.tree.pts[t.id] || 0; return { mul: 1 + damagePct(t, pts) / 100, area: 1 + areaPct(t, pts) / 100 }; }
  function skillMul(p, id) { const t = treeOfSkill(p, id); return t ? treeMul(p, t) : { mul: 1, area: 1 }; }
  function withMul(mul, fn) { const prev = api.curMul; api.curMul = mul; try { return fn(); } finally { api.curMul = prev; } }
  // v84n: which skill is casting (tree marks read it). Queued hits (pending) remember the skill that queued them.
  function withSkill(id, fn) { const prev = api.curSkill; api.curSkill = id || null; try { return fn(); } finally { api.curSkill = prev; } }
  pending.push = function () { for (const q of arguments) if (q && q.skill === undefined) q.skill = api.curSkill || null; return Array.prototype.push.apply(this, arguments); };

  function wrapCast(e, def, rank, raw) {
    const p = e.player;
    if (!H || !active(p) || !def) return false;
    const t = treeOfSkill(p, def.id); if (!t) return false;
    const { mul, area } = treeMul(p, t), k = kitOf(p);
    const extra = k && k.castExtra ? k.castExtra(e, def, t) : null;
    const d2 = scaled(def, mul, area, extra);
    withSkill(def.id, () => {
      withMul(mul, () => {
        const fn = (k && k.behaviors && k.behaviors[def.behavior]) || BEHAVIORS[def.behavior];
        if (fn) fn(e, d2, rank, mul, raw);
        else raw(e, d2, rank);
      });
      if (k && k.afterCast) withMul(mul, () => k.afterCast(e, def, d2, t, rank, mul));
      sigOnCast(e, def);
    });
    return true;
  }

  // ---- shared helpers for kits ---------------------------------------------
  function angTo(p, m) { let a = Math.atan2(m.y - p.y, m.x - p.x) - p.facing; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  // Aim point: the nearest living foe in a narrow cone ahead within rng, else a point ahead.
  function aimPoint(e, rng, cone) {
    const p = e.player; let tx = p.x + Math.cos(p.facing) * rng * 0.7, ty = p.y + Math.sin(p.facing) * rng * 0.7, best = 1e9, hit = null;
    for (const m of e.world.monsters) {
      if (m.dead) continue;
      const dist = Math.hypot(m.x - p.x, m.y - p.y); if (dist > rng) continue;
      if (Math.abs(angTo(p, m)) < (cone || 0.6) && dist < best) { best = dist; tx = m.x; ty = m.y; hit = m; }
    }
    return { x: tx, y: ty, target: hit };
  }
  function near(e, x, y, r, skip) {
    const out = [];
    for (const m of e.world.monsters) if (!m.dead && m !== skip && Math.hypot(m.x - x, m.y - y) <= r + (m.radius || 0.3)) out.push(m);
    return out;
  }
  // One spell hit of element el ("fire","cold","light","poison","phys") on m.
  function hit(e, m, el, amt, tag, opts) {
    const a = Object.assign({ kind: "spell", source: "player", canMiss: false, canCrit: false, canLeech: false, tag }, opts || {});
    a[el] = amt; return H.apply(e, m, a);
  }
  function burst(e, x, y, r, el, amt, tag, color, opts) {
    let n = 0;
    for (const m of near(e, x, y, r)) { hit(e, m, el, amt, tag, opts); n++; }
    e.effects.push({ type: "ring", x, y, radius: r, t: 0.3, max: 0.3, color: color || "#fff6e0" });
    return n;
  }
  function addBuff(p, b) { p.buffs = (p.buffs || []).filter((x) => x.id !== b.id); p.buffs.push(b); return b; }
  // "Still": a foe held in place (no moving, no swinging) for sec. Bosses are only slowed.
  function still(m, sec) {
    if (!m || m.dead) return false;
    m.slowT = Math.max(m.slowT || 0, sec);
    if (m.boss) return false;
    if (!(m._abStillT > 0)) { m._abStillX = m.x; m._abStillY = m.y; }
    m._abStillT = Math.max(m._abStillT || 0, sec);
    return true;
  }
  function isStill(m) { return !!(m && m._abStillT > 0); }
  function pool(q) { pools.push(Object.assign({ skill: api.curSkill || null, tick: q.every || 0.5, every: 0.5, el: "fire", color: "#c8461e", spark: "#ff6a2a", kind: "fire", tag: "pool" }, q)); }

  // Shared tree behaviors any kit can use.
  const BEHAVIORS = {
    // N quick melee hits, then an optional burst (burstRadius + a burst element range).
    tree_flurry(e, d2, rank, mul) {
      const pr = d2.params, base = skillDef(d2.id), hitDef = Object.assign({}, d2, { behavior: "melee", params: { arc: pr.arc, range: pr.range, physMult: pr.physMult, fire: pr.fire } });
      const gap = pr.gap || 0.11;
      for (let i = 0; i < (pr.hits || 3); i++) pending.push({ t: i * gap, mul, fn: () => H.melee(e, hitDef, rank) });
      if (pr.burstRadius && pr.burstFire) {
        const area = pr.range / ((base && base.params && base.params.range) || pr.range || 1.5);
        const b = Object.assign({}, d2, { behavior: "nova", params: { radius: [(pr.burstRadius || 1.6) * area, 0], fire: pr.burstFire } });
        pending.push({ t: (pr.hits || 3) * gap + 0.05, mul, fn: () => H.nova(e, b, rank) });
      }
    }
  };

  // ---- v84n tree signatures --------------------------------------------------------------------------------------------
  // Each tree's level-1 active (its "signature" node) marks the foes it hits with the tree's mark (tree.sig in data:
  // id, name, pct = +% damage you deal to the foe per stack, max stacks, sec, plus optional slow / leech / mana / color).
  // Other skills build on it from data: params.sigApply (stacks added per hit), params.sigConsume (+% per stack on this hit,
  // then the mark is spent), and passives params.sigBoost {pct, stacks, sec, burst:{pct (of the foe's max life), radius, el}}.
  // A hit knows its skill from a.skill (projectiles and traps carry it) or from the cast in progress (api.curSkill).
  const DMG_KEYS = ["phys", "fire", "cold", "light", "poison", "holy", "magic"];
  function sigOf(t) { return (t && t.sig) || null; }
  function sigNodeOf(p, id) {
    for (const t of slotTrees(p)) for (const n of t.nodes) if (n.skill === id) return { t, n };
    return null;
  }
  function sigBoost(p, t) {
    const out = { pct: 0, stacks: 0, sec: 0, burst: null };
    const pts = p.tree.pts[t.id] || 0;
    for (const n of t.nodes) {
      if (pts < n.at) continue;
      const d = skillDef(n.skill), b = d && d.params && d.params.sigBoost; if (!b) continue;
      const r = (p.skills && p.skills[n.skill]) || 0; if (r <= 0) continue;
      out.pct += (b.pct || 0) + (b.pctPerRank || 0) * r; out.stacks += b.stacks || 0; out.sec += b.sec || 0;
      if (b.burst) out.burst = b.burst;
    }
    return out;
  }
  function sigStacks(m, treeId) { const s = m && m._sigs && m._sigs[treeId]; return s && s.t > 0 ? s.n : 0; }
  function markFoe(e, m, t, add) {
    const g = sigOf(t); if (!g || !m || m.dead || m.friendly) return 0;
    const p = e.player, b = sigBoost(p, t), max = (g.max || 3) + b.stacks;
    m._sigs = m._sigs || {};
    const cur = m._sigs[t.id] && m._sigs[t.id].t > 0 ? m._sigs[t.id].n : 0;
    const n = Math.min(max, cur + (add || 1));
    m._sigs[t.id] = { n, t: (g.sec || 6) + b.sec, tree: t.id };
    if (g.slow) m.slowT = Math.max(m.slowT || 0, Math.min(1, g.sec || 1));
    api.sigMarks = (api.sigMarks || 0) + 1;
    return n;
  }
  function sigPre(e, target, a) {
    const p = e.player; if (!active(p) || !a || a.source !== "player") return;
    // 1) bonus from every mark on the foe
    let pct = 0;
    if (target._sigs) for (const id of Object.keys(target._sigs)) {
      const s = target._sigs[id]; if (!(s.t > 0) || !(s.n > 0)) continue;
      const t = treeDef(id), g = sigOf(t); if (!g || (p.tree.slots || []).indexOf(id) < 0) continue;
      pct += ((g.pct || 0) + sigBoost(p, t).pct) * s.n;
    }
    // 2) what this hit does to the mark
    const sid = a.skill || api.curSkill, hit = sid && sigNodeOf(p, sid);
    if (hit && isHeld(p, hit.t, hit.n, p.tree.pts[hit.t.id] || 0) && sigOf(hit.t)) {
      const d = skillDef(sid), pr = (d && d.params) || {};
      const apply = hit.n.signature ? (pr.sigApply || 1) : (pr.sigApply || 0);
      if (pr.sigConsume) { const n = sigStacks(target, hit.t.id); if (n > 0) { pct += pr.sigConsume * n; target._sigs[hit.t.id].t = 0; target._sigs[hit.t.id].n = 0; api.sigConsumed = (api.sigConsumed || 0) + n; } }
      else if (apply > 0) markFoe(e, target, hit.t, apply);
    }
    if (pct > 0) { const k = 1 + pct / 100; for (const f of DMG_KEYS) if (typeof a[f] === "number") a[f] *= k; a.sigPct = pct; }
  }
  function sigHit(ev, e) {
    const p = e.player, m = ev.target; if (!m || !m._sigs || !(ev.amount > 0)) return;
    for (const id of Object.keys(m._sigs)) {
      const s = m._sigs[id]; if (!(s.t > 0)) continue; const g = sigOf(treeDef(id)); if (!g) continue;
      if (g.leech && e.sheet) { const h = ev.amount * g.leech / 100 * s.n; p.hp = Math.min(e.sheet.life, (p.hp || 0) + h); }
      if (g.mana && e.sheet) p.mana = Math.min(e.sheet.mana, (p.mana || 0) + g.mana * s.n);
    }
  }
  function sigKilled(ev, e) {
    const m = ev.target, p = e.player; if (!m || !m._sigs) return;
    for (const id of Object.keys(m._sigs)) {
      const s = m._sigs[id]; if (!(s.t > 0)) continue; const t = treeDef(id); if (!sigOf(t)) continue;
      const b = sigBoost(p, t).burst; if (!b) continue;
      const amt = (m.maxHp || m.hp || 50) * (b.pct || 15) / 100 * Math.min(1, 0.5 + 0.25 * s.n);
      burst(e, m.x, m.y, b.radius || 1.8, b.el || "fire", amt, "sigburst", (sigOf(t).color || "#ffb067"), { skill: null });
      api.sigBursts = (api.sigBursts || 0) + 1;
    }
    m._sigs = null;
  }
  function sigTick(e, dt) {
    for (const m of (e.world && e.world.monsters) || []) {
      if (!m._sigs) continue;
      for (const id of Object.keys(m._sigs)) { const s = m._sigs[id]; s.t -= dt; if (s.t <= 0) delete m._sigs[id]; else { const g = sigOf(treeDef(id)); if (g && g.slow) m.slowT = Math.max(m.slowT || 0, 0.2); } }
      if (!Object.keys(m._sigs).length) m._sigs = null;
    }
  }
  // Signature A1s that don't hit (a summon, a circle) mark the foe they aim at when cast (params.sigOnCast = radius).
  function sigOnCast(e, def) {
    const p = e.player, r = def && def.params && def.params.sigOnCast; if (!r) return;
    const hit = sigNodeOf(p, def.id); if (!hit || !sigOf(hit.t)) return;
    const ap = aimPoint(e, def.params.sigRange || 7, 0.9);
    for (const m of near(e, ap.x, ap.y, r)) markFoe(e, m, hit.t, def.params.sigApply || 1);
  }

  // ---- damage hooks (called from the game's damage function) ----------------
  function preDamage(e, target, a) {
    const p = e.player;
    if (!active(p) || !a || a.source !== "player" || target === p || target.friendly) return;
    sigPre(e, target, a);
    const k = kitOf(p); if (k && k.preDamage) k.preDamage(e, target, a);
  }
  function onHit(ev) { const e = ev.state; if (!e || !active(e.player) || ev.source !== "player") return; sigHit(ev, e); const k = kitOf(e.player); if (k && k.onHit) k.onHit(ev, e); }
  function onHurt(ev) { const e = ev.state; if (!e || !active(e.player)) return; const k = kitOf(e.player); if (k && k.onHurt) k.onHurt(ev, e); }
  function onKilled(ev) { const e = ev.state, t = ev.target; if (!e || !t || !active(e.player) || t.friendly) return; const k = kitOf(e.player); if (k && k.onKilled) k.onKilled(ev, e); sigKilled(ev, e); }

  // ---- tick ---------------------------------------------------------------
  function tick(e, dt, freeze) {
    const p = e.player; if (!p) return;
    if (p.progress && p.progress.treeNotice === "pending" && e.mode === "play") {
      p.progress.treeNotice = "shown"; strCls = p.classId;
      e.toasts.push({ text: str("notice"), t: 6, kind: "good" });
      e.pendingSave = true;
    }
    if (e.ui && e.ui.panel !== "skills" && e.ui.treeUndo && e.ui.treeUndo.length) e.ui.treeUndo = [];
    if (!active(p) || !H) return;
    // Level can only drop through staging Test Tools; if more points are spent than the hero has, refund the tree.
    if (spentPoints(p) > totalPoints(p)) { resetFree(p); H.recalc(); e.toasts.push({ text: "Tree points refunded (level went down).", t: 2.5, kind: "good" }); }
    clock += dt;
    // New zone (or a reload): drop pools, queued hits and kit bookkeeping from the old world.
    if (e.world !== lastWorld) { lastWorld = e.world; clearWorld(); }
    const k = kitOf(p);
    if (k && k.tick) k.tick(e, dt, freeze);
    // Recalc when one of our buffs ends on its own.
    const key = (p.buffs || []).filter((b) => isTreeBuff(b.id)).map((b) => b.id).sort().join(",");
    if (key !== lastBuffKey) { const had = lastBuffKey; lastBuffKey = key; if (had && had.length > key.length) H.recalc(); }
    // Held ("still") foes stay put and cannot swing.
    for (const m of (e.world && e.world.monsters) || []) {
      if (!(m._abStillT > 0)) continue;
      m._abStillT -= dt;
      if (m.dead) { m._abStillT = 0; continue; }
      m.x = m._abStillX; m.y = m._abStillY; m.attackCd = Math.max(m.attackCd || 0, 0.3);
    }
    if (freeze) return;
    sigTick(e, dt);
    for (let i = pending.length - 1; i >= 0; i--) {
      const q = pending[i]; q.t -= dt;
      if (q.t <= 0) { pending.splice(i, 1); try { withSkill(q.skill, () => withMul(q.mul || 1, q.fn)); } catch (err) { console.warn("ABTree pending", err); } }
    }
    for (let i = pools.length - 1; i >= 0; i--) {
      const q = pools[i]; q.t -= dt; q.tick -= dt;
      if (q.tick <= 0) {
        q.tick += q.every;
        for (const m of e.world.monsters) {
          if (m.dead || Math.hypot(m.x - q.x, m.y - q.y) > q.r + (m.radius || 0.3)) continue;
          hit(e, m, q.el, q.dmg, q.tag, q.skill ? { skill: q.skill } : null);
          if (q.slow) m.slowT = Math.max(m.slowT || 0, q.slow);
          api.poolTicks = (api.poolTicks || 0) + 1;
        }
        e.effects.push({ type: "ring", x: q.x, y: q.y, radius: q.r, t: q.every * 0.9, max: q.every * 0.9, color: q.color });
        if (Math.random() < 0.7) H.particles(e, q.x + (Math.random() - 0.5) * q.r, q.y + (Math.random() - 0.5) * q.r, q.spark, 3, q.kind);
      }
      if (q.t <= 0) pools.splice(i, 1);
    }
  }
  function clearWorld() { pools.length = 0; pending.length = 0; for (const c of Object.keys(kits)) if (kits[c].clear) kits[c].clear(); }

  // ---- save migration -------------------------------------------------------
  // Old saves (no p.tree) for a tree class: every point back for free; level, paragon, gear, stash and story stay.
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
  function migrateSave(dto) { if (dto && dto.player && !migratePlayer(dto.player)) normalizePicks(dto.player); return dto; }

  // ---- actions ------------------------------------------------------------
  function act(name, t, e) {
    const p = e.player; if (!active(p)) return { touch: false };
    strCls = p.classId;
    const tree = (t && t.tree) || e.ui.treeTab;
    if (name === "tree-tab") { if (treeDef(tree)) e.ui.treeTab = tree; const n = treeDef(tree).nodes[0]; if (!treeOfSkill(p, e.ui.skillId) || treeOfSkill(p, e.ui.skillId).id !== tree) e.ui.skillId = n.skill; return { save: false }; }
    if (name === "tree-spend") {
      const r = spend(p, tree);
      if (!r.ok) return { toast: r.reason, kind: "bad", save: false };
      e.ui.treeTab = tree;
      e.ui.treeUndo = e.ui.treeUndo || []; e.ui.treeUndo.push(tree);
      if (p.progress && p.progress.seen) { p.progress.seen.skilled = true; p.progress.seen.steps = p.progress.seen.steps || {}; p.progress.seen.steps.point = true; if (r.unlocked) p.progress.seen.steps.skill = true; }
      if (r.unlocked) e.ui.skillId = r.unlocked;
      else if (!treeOfSkill(p, e.ui.skillId) || treeOfSkill(p, e.ui.skillId).id !== tree) e.ui.skillId = treeDef(tree).nodes[0].skill;
      H && H.recalc();
      e.sfx && e.sfx.push("ui");
      if (r.unlocked) { const d = skillDef(r.unlocked); const nm = d ? d.name : r.unlocked; return { toast: str("unlockedToast", { name: nm, skill: nm }), kind: "good" }; }
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
    parts.push("+" + dmg + "% " + esc((t.between && t.between.label) || t.name) + " damage");
    for (const k of Object.keys(sb)) parts.push(statText(k, sb[k]));
    parts.push("+" + ar + "% area");
    return parts.join(" \u00b7 ");
  }
  function nextNode(t, pts) { return t.nodes.find((n) => n.at > pts) || null; }
  const STAT_NAMES = { str: "Str", dex: "Dex", vit: "Vit", ene: "Energy", mana: "Mana", ar: "attack", defense: "armor", life: "life",
    manaRegen: "mana/s", minionLife: "servant life", ias: "% attack speed", fcr: "% cast speed", frw: "% move speed" };
  function statText(k, v) {
    const n = Math.round(v * 10) / 10, nm = STAT_NAMES[k] || k;
    return "+" + n + (nm.charAt(0) === "%" ? nm : " " + nm);
  }
  function treeUi() {
    const file = (root.ASHBOUND_DATA && root.ASHBOUND_DATA.skillTreeUi) || {};
    const panel = ((root.ASHBOUND_DATA && root.ASHBOUND_DATA.ui) || {}).skillTreePanel || {};
    return Object.assign({ enabled: true, direction: "down", layout: "forest", pack: "zigzag2", cols: 2, colsNarrow: 2, narrowMax: 520, tile: 56, tileDesktop: 64, tileShort: 56, nodeMinH: 56, tapMin: 44, gapX: 10, gapY: 8, nameSize: 9, lineWidth: 3, boardPad: 4, assignMin: 44, pointsSize: 28, text: {} }, file, panel, { enabled: file.enabled !== false && panel.enabled !== false });
  }
  function treeUiStr(key, fill) {
    const T = (treeUi().text || {});
    let s = T[key] || "";
    if (fill) Object.keys(fill).forEach((k) => { s = s.replace("{" + k + "}", String(fill[k])); });
    return s;
  }
  function skillIco(d) {
    const fn = (typeof ABSkillIco === "function" && ABSkillIco)
      || (root && root.ABSkillIco)
      || (typeof window !== "undefined" && window.ABSkillIco)
      || null;
    if (typeof fn === "function") {
      try { const html = fn(d); if (html) return html; } catch (err) { console.warn("skillIco", err); }
    }
    const ch = ((d && (d.name || d.id)) || "?").toString().charAt(0);
    return `<span class="tt-glyph" aria-hidden="true">${esc(ch)}</span>`;
  }
  // v84n: snake packing (data/skilltree-ui.json pack "snake3"): row 1 left to right, row 2 right to left, ... so the
  // path never crosses itself and each step is a neighbour.
  // Positions go out as CSS variables for the wide (cols) and narrow (colsNarrow, portrait) grids; the CSS picks one.
  function snakePos(i, U) {
    if ((U.pack || "") !== "snake3") return "";
    const one = (c) => { const r = Math.floor(i / c), k = i % c; return [r + 1, r % 2 ? c - k : k + 1]; };
    const w = one(U.cols || 3), n = one(U.colsNarrow || 2);
    return `--sr:${w[0]};--sc:${w[1]};--snr:${n[0]};--snc:${n[1]}`;
  }
  function nodeHtml(e, t, n, pts, nx, tab, pos) {
    const d = skillDef(n.skill) || { name: n.skill, type: "", id: n.skill };
    const unlocked = pts >= n.at, isNext = nx && nx.at === n.at;
    const rank = unlocked ? (e.sheet.ranks[n.skill] || 0) : 0, base = unlocked ? nodeRank(n, pts) : 0;
    const shown = unlocked ? (rank || base) : 0;
    const st = unlocked ? "unlocked" : isNext ? "next" : "locked";
    const ico = skillIco(d);
    const rankMark = unlocked ? `<span class="tt-rank" title="Rank ${shown}">${shown}</span>` : "";
    const ult = n.ultimate ? `<em class="tt-ult">ULT</em>` : "";
    const sigMark = n.signature && t.sig ? `<em class="tt-sig" title="${esc(t.sig.name)}" style="--sig:${esc(t.sig.color || "#ffb067")}"></em>` : "";
    const eqOk = e.ui.equipSlot != null && unlocked && d.type === "active" && !n.ultimate;
    return `<button type="button" class="tt-node tt-tile st-${st} ${n.ultimate ? "is-ult" : ""} ${n.signature ? "is-sig" : ""} ${eqOk ? "is-equippable" : ""} ${e.ui.skillId === n.skill ? "is-sel" : ""}" data-act="select-skill" ${pos ? `style="${pos}"` : ""} data-skill="${n.skill}" data-at="${n.at}" data-tree="${t.id}" data-kind="${n.ultimate ? "ult-" + ultKind(n) : d.type}" aria-label="${esc(d.name)}${unlocked ? " rank " + shown : " locked until " + n.at}">
      <span class="tt-plate">${ico}${rankMark}${ult}${sigMark}<span class="tt-at">${n.at}</span></span>
      <span class="tt-nm">${esc(d.name)}</span>
    </button>`;
  }
  function elbowPath(a, b, br) {
    const acx = a.left + a.width / 2 - br.left, acy = a.top + a.height / 2 - br.top;
    const bcx = b.left + b.width / 2 - br.left, bcy = b.top + b.height / 2 - br.top;
    const sameRow = Math.abs(a.top - b.top) < Math.max(a.height, b.height) * 0.45;
    if (sameRow) {
      const toRight = bcx >= acx;
      const x1 = (toRight ? a.right : a.left) - br.left;
      const x2 = (toRight ? b.left : b.right) - br.left;
      const y = (acy + bcy) / 2;
      return "M" + x1.toFixed(1) + "," + y.toFixed(1) + " L" + x2.toFixed(1) + "," + y.toFixed(1);
    }
    const x1 = acx, y1 = a.bottom - br.top, x2 = bcx, y2 = b.top - br.top;
    const mx = (x1 + x2) / 2;
    return "M" + x1.toFixed(1) + "," + y1.toFixed(1) + " L" + mx.toFixed(1) + "," + y1.toFixed(1) + " L" + mx.toFixed(1) + "," + y2.toFixed(1) + " L" + x2.toFixed(1) + "," + y2.toFixed(1);
  }
  function paintBoard(board, U) {
    const spine = board.querySelector(".tt-spine") || board;
    const svg = board.querySelector("svg.tt-lines");
    const nodes = [...board.querySelectorAll(".tt-node")].sort((a, b) => (+a.dataset.at) - (+b.dataset.at));
    if (!svg || nodes.length < 2) return;
    const br = spine.getBoundingClientRect();
    const w = Math.max(1, spine.offsetWidth || br.width);
    const h = Math.max(1, spine.offsetHeight || br.height);
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    let paths = "";
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i].getBoundingClientRect(), b = nodes[i + 1].getBoundingClientRect();
      const live = nodes[i].classList.contains("st-unlocked");
      paths += '<path class="tt-line ' + (live ? "is-on" : "is-off") + '" d="' + elbowPath(a, b, br) + '" />';
    }
    svg.innerHTML = paths;
    svg.style.strokeWidth = String(U.lineWidth || 3);
  }
  function syncTipFade(rootEl) {
    const tip = (rootEl || document).querySelector("#detail .detail-scroll");
    if (!tip) return;
    const over = tip.scrollHeight > tip.clientHeight + 2;
    const atEnd = tip.scrollTop + tip.clientHeight >= tip.scrollHeight - 2;
    tip.classList.toggle("is-overflow", over);
    tip.classList.toggle("is-at-end", atEnd);
    const wrap = tip.parentElement;
    if (wrap && wrap.classList.contains("tt-tip-wrap")) {
      wrap.classList.toggle("is-overflow", over);
      wrap.classList.toggle("is-at-end", atEnd);
    }
    if (!tip.dataset.fadeBound) {
      tip.dataset.fadeBound = "1";
      tip.addEventListener("scroll", function () { syncTipFade(rootEl); }, { passive: true });
    }
  }
  function layoutBoard(rootEl) {
    const rootNode = rootEl || document;
    const U = treeUi();
    const boards = [...rootNode.querySelectorAll(".tt-board")];
    if (!boards.length) {
      const one = rootNode.querySelector && rootNode.querySelector(".tt-board");
      if (one) boards.push(one);
    }
    boards.forEach((b) => paintBoard(b, U));
    syncTipFade(rootNode);
  }

  // v84n: the tree header is the main +1 control. Tap adds a point (when the tree can take one), hold repeats (see bindHold).
  function hdrHtml(p, x, xp, tab, ult, U) {
    const hd = U.header || {}, cs = canSpend(p, x.id), can = cs.ok && hd.spendOnTap !== false, full = xp >= treeMax();
    const chip = full ? (hd.maxText || "MAX") : (hd.plusText || "+1");
    const lab = x.name + " " + xp + ". " + (can ? str("spend", { tree: x.name }) : (cs.reason || ""));
    return `<button type="button" class="tt-tab tt-hdr ${can ? "can-spend" : "no-spend"} ${x.id === tab ? "is-on" : ""} ${ult ? "has-ult" : ""}" data-act="${can ? "tree-spend" : "tree-tab"}" data-tree="${x.id}" data-hdr="1"${can && hd.hold !== false ? ' data-hold="1"' : ""} aria-pressed="${x.id === tab}" aria-label="${esc(lab)}" style="min-height:${Math.max(44, hd.minH || 44)}px"><span class="tt-hname">${esc(x.name)}</span> <b class="tt-hpts">${xp}</b><span class="tt-hplus ${can ? "is-can" : "is-not"}" aria-hidden="true">${esc(chip)}</span></button>`;
  }
  // Hold a header to keep adding points. A finished hold swallows the click that follows it.
  let holdT = 0, holdIv = 0, holdFired = 0;
  function holdStop() { clearTimeout(holdT); clearInterval(holdIv); holdT = holdIv = 0; }
  function bindHold() {
    if (api.holdBound || typeof document === "undefined") return; api.holdBound = true;
    document.addEventListener("pointerdown", function (ev) {
      const b = ev.target && ev.target.closest && ev.target.closest('.tt-hdr[data-hold="1"]'); if (!b) return;
      const hd = treeUi().header || {}, tree = b.dataset.tree; holdStop(); holdFired = 0;
      holdT = setTimeout(function () {
        holdIv = setInterval(function () {
          const nb = document.querySelector('.tt-hdr[data-tree="' + tree + '"]');
          if (!nb || nb.dataset.act !== "tree-spend") { holdStop(); return; }
          holdFired++; nb.click();
        }, hd.holdEveryMs || 110);
      }, hd.holdDelayMs || 420);
    }, true);
    const end = function () { holdStop(); if (holdFired) { const n = holdFired; holdFired = 0; api._swallow = Date.now(); api._holdAdded = n; } };
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    document.addEventListener("click", function (ev) {
      if (api._swallow && Date.now() - api._swallow < 450 && ev.isTrusted && ev.target.closest && ev.target.closest(".tt-hdr")) { api._swallow = 0; ev.stopPropagation(); ev.preventDefault(); }
    }, true);
  }
  function panelHtml(e) {
    bindHold();
    const p = e.player, trees = slotTrees(p); strCls = p.classId;
    let tab = e.ui.treeTab; if (!trees.some((t) => t.id === tab)) { const ts = treeOfSkill(p, e.ui.skillId); tab = (ts || trees[0]).id; e.ui.treeTab = tab; }
    // Clicking a tile in another column selects that tree (D2-style forest).
    const cur = treeOfSkill(p, e.ui.skillId);
    if (cur && cur.id !== tab) { tab = cur.id; e.ui.treeTab = tab; }
    else if (!cur) e.ui.skillId = treeDef(tab).nodes[0].skill;
    const t = treeDef(tab), pts = p.tree.pts[tab] || 0, free = freePoints(p), cs = canSpend(p, tab), undo = (e.ui.treeUndo || []).length > 0;
    const nx = nextNode(t, pts), band = bandPoints(pts), bd = (data().damageBand || {});
    const U = treeUi();
    const nextTxt = pts >= treeMax() ? str("maxed") : nx ? str("next", { skill: esc((skillDef(nx.skill) || {}).name || nx.skill), at: nx.at, n: nx.at - pts }) : str("allUnlocked");
    const ptsLabel = treeUiStr("pointsTitle") || "Skill points";
    const tile = U.tile || 56;
    const forest = (U.layout || "forest") === "forest";
    const packCols = U.cols || 2;
    const styleVars = `--tt-cols:${packCols};--tt-cols-narrow:${U.colsNarrow || 2};--tt-gap-x:${U.gapX || 10}px;--tt-gap-y:${U.gapY || 8}px;--tt-node-h:${U.nodeMinH || tile}px;--tt-tile:${tile}px;--tt-tile-desktop:${U.tileDesktop || 64}px;--tt-tile-short:${U.tileShort || 56}px;--tt-line:${U.lineWidth || 3}px;--tt-points:${U.pointsSize || 28}px;--tt-pad:${U.boardPad || 4}px;--tt-name:${U.nameSize || 9}px;`;

    function colHtml(x) {
      const def = treeDef(x.id), xp = p.tree.pts[x.id] || 0, ult = xp >= ultAt();
      const nxCol = nextNode(def, xp);
      const nodes = def.nodes.map((n, i) => nodeHtml(e, def, n, xp, nxCol, tab, snakePos(i, U))).join("");
      return `<section class="tt-col ${x.id === tab ? "is-on" : ""} ${ult ? "has-ult" : ""}" data-tree="${x.id}">
        ${hdrHtml(p, x, xp, tab, ult, U)}
        <div class="tt-board"><div class="tt-spine"><svg class="tt-lines" aria-hidden="true"></svg><div class="tt-nodes">${nodes}</div></div></div>
      </section>`;
    }

    const pips = []; for (let i = (bd.from || 41); i <= (bd.to || 50); i++) pips.push(`<span class="tt-pip ${pts >= i ? "on" : ""}" title="${i}"></span>`);
    const fill = Math.min(100, pts / treeMax() * 100);
    const ticks = t.nodes.map((n) => `<span class="tt-tick ${pts >= n.at ? "on" : ""} ${n.ultimate ? "ult" : ""}" style="left:${n.at / treeMax() * 100}%"></span>`).join("");
    const forestHtml = forest
      ? `<div class="tt-forest">${trees.map(colHtml).join("")}</div>`
      : colHtml(t);

    return `<p class="tt-bonus" id="tt-bonus"><span class="muted">${esc(str("bonusTitle"))}:</span> ${bonusLine(t, pts)}</p>
    <div class="tree-wrap tt-wrap">
      <div class="tt-tree tt-forest-wrap" data-tree="${tab}" data-dir="${U.direction || "down"}" data-layout="${U.layout || "forest"}" data-pack="${U.pack || "zigzag2"}" style="${styleVars}">
        <div class="tt-track" aria-label="${pts} of ${treeMax()}"><span class="tt-fill" style="width:${fill}%"></span>${ticks}<span class="tt-bandzone" style="left:${ultAt() / treeMax() * 100}%"></span></div>
        ${forestHtml}
        <div class="tt-band ${band > 0 ? "is-on" : ""}" id="tt-band"><span class="small"><b>${esc(str("bandTitle"))}</b></span><span class="tt-pips">${pips.join("")}</span><span class="small">${esc(str("bandLine", { pct: band * (bd.pctPerPoint || 0), tree: t.name }))}</span></div>
      </div>
    </div>`;
  }
  function rankLines(d, rank) {
    let lines = [];
    if (d.tree) { lines.push(d.about || ""); for (const n of d.notes || []) lines.push(n); }
    else { try { lines = (H && H.describe ? H.describe(d, rank) : [d.about || ""]); } catch (err) { lines = [d.about || ""]; } }
    return (lines || []).filter(Boolean);
  }
  // v84k: each picker slot shows its number (1-4, left to right like the HUD) plus a small icon of the skill already in it;
  // the slot holding this skill is lit (is-on, aria-pressed). data/skillbar.json picker.showEquipped turns the icons off.
  // v84n: equip mode (opened from an empty HUD slot): the hint line and the target slot glow.
  function equipHint(slot) {
    const t = (((root.ASHBOUND_DATA || {}).skillbar || {}).picker || {}).equipHint || "Tap a skill to put it in slot {n}";
    return t.split("{n}").join(String(Number(slot) + 1));
  }
  function barSlotHtml(p, d, r, unlocked, slotLab, eqSlot) {
    const sbCfg = ((root.ASHBOUND_DATA || {}).skillbar || {}).picker || {};
    const cur = (p.bar || [])[r] || null, on = cur === d.id, cd = cur ? skillDef(cur) : null;
    const ico = sbCfg.showEquipped !== false && cd ? `<span class="bs-ico" aria-hidden="true">${skillIco(cd)}</span>` : "";
    const lab = slotLab(r) + (cd ? " \u00b7 " + (cd.name || cur) : "");
    const tgt = eqSlot != null && Number(eqSlot) === r;
    return `<button class="btn bar-slot${on ? " is-on" : ""}${cd ? " has-skill" : ""}${tgt ? " is-target" : ""}" data-act="assign" data-skill="${d.id}" data-slot="${r}" aria-pressed="${on}" aria-label="${esc(lab)}" title="${esc(lab)}" ${unlocked ? "" : "disabled"}><b class="bs-n">${r + 1}</b>${ico}</button>`;
  }
  function detailHtml(e) {
    const p = e.player, id = e.ui.skillId, d = skillDef(id), t = treeOfSkill(p, id); strCls = p.classId;
    if (!d || !t) return "";
    const node = t.nodes.find((n) => n.skill === id), pts = p.tree.pts[t.id] || 0;
    const unlocked = pts >= node.at;
    const baseRank = unlocked ? nodeRank(node, pts) : 0;
    const rank = unlocked ? Math.max(e.sheet.ranks[id] || 0, baseRank) : 0, shown = Math.max(1, rank);
    const curLines = rankLines(d, shown);
    const nextRank = unlocked ? rank + 1 : 1;
    const nextLines = rankLines(d, Math.max(1, nextRank));
    const mana = d.type === "active" && H && H.mana ? ` \u00b7 mana ${H.mana(d, shown)}` : "";
    const cd = d.type === "active" && d.cooldown ? ` \u00b7 ${d.cooldown}s` : "";
    const head = unlocked ? str("detailUnlocked", { rank, pts, tree: t.name }) : str("detailLocked", { at: node.at, tree: t.name });
    const sigLine = node.signature && t.sig ? str("sigLine", { name: t.sig.name, pct: t.sig.pct, max: t.sig.max || 3 }) : "";
    const ultLine = node.ultimate ? str(ultKind(node) === "active" ? "ultButton" : "ultPassive") : "";
    const dmg = damagePct(t, pts), ar = areaPct(t, pts);
    if (unlocked && (dmg || ar)) curLines.push(`${str("bonusTitle")}: +${dmg}% damage` + (ar ? `, +${ar}% area` : "") + (pts >= ultAt() ? " (rank and area stop at 40)" : ""));
    const U = treeUi();
    const curLab = treeUiStr("currentRank", { rank: unlocked ? rank : 0 }) || ("Rank " + (unlocked ? rank : 0));
    const nextLab = unlocked
      ? (treeUiStr("nextRank", { rank: nextRank }) || ("Next rank " + nextRank))
      : (treeUiStr("nextUnlock", { at: node.at }) || str("detailLocked", { at: node.at, tree: t.name }));
    const onBar = treeUiStr("onBar") || "Put on the action bar";
    const slotLab = (n) => treeUiStr("slot", { n: n + 1 }) || ("Bar " + (n + 1));
    const free = freePoints(p), cs = canSpend(p, t.id), undo = (e.ui.treeUndo || []).length > 0;
    const nx = nextNode(t, pts);
    const nextTxt = pts >= treeMax() ? str("maxed") : nx ? str("next", { skill: esc((skillDef(nx.skill) || {}).name || nx.skill), at: nx.at, n: nx.at - pts }) : str("allUnlocked");
    const ptsLabel = treeUiStr("pointsTitle") || "Skill points";
    return `<div class="detail" id="detail">
    <div class="tt-head tt-toolbar">
      <p class="tt-points" id="tt-points"><b>${free}</b> <span class="tt-points-lab">${esc(ptsLabel)}</span> ${esc(str("pointsLine", { free: "", used: spentPoints(p), total: totalPoints(p) }).replace(/^\s+/, ""))}</p>
      <div class="tt-spend">
        <button type="button" class="btn primary tt-plus" data-act="tree-spend" data-tree="${t.id}" ${cs.ok ? "" : "disabled"}>${esc(str("spend", { tree: t.name }))}</button>
        <button type="button" class="btn tt-undo" data-act="tree-undo" ${undo ? "" : "disabled"}>${esc(str("undo"))}</button>
        <button type="button" class="btn hold-respec" data-act="respec-arm" aria-label="Hold to respec"><span class="tt-respec-full">Hold to respec</span><span class="tt-respec-short">Respec</span></button>
      </div>
      ${e.ui.equipSlot != null ? `<span class="small tt-next tt-equiphint">${esc(equipHint(e.ui.equipSlot))}</span>` : `<span class="small tt-next">${cs.ok || pts >= treeMax() ? nextTxt : esc(cs.reason)}</span>`}
    </div>
    <div class="detail-head">
      <span class="tt-dico">${skillIco(d)}</span>
      <strong>${esc(d.name)}${node.ultimate ? ` <span class="tt-ult">${esc(str("ultimate"))}</span>` : ""}</strong>
      <div class="small muted">${esc(d.type)}${mana}${cd}</div>
      <div class="small ${unlocked ? "good" : "muted"}">${esc(head)}</div>
    </div>
    <div class="tt-tip-wrap">
      <div class="detail-scroll tt-tip">
      ${sigLine ? `<div class="small tt-sigline">${esc(sigLine)}</div>` : ""}
        <div class="tt-tip-cur"><h4>${esc(curLab)}</h4>${curLines.map((r) => `<p class="small">${esc(r)}</p>`).join("")}</div>
        <div class="tt-tip-next"><h4>${esc(nextLab)}</h4>${nextLines.map((r) => `<p class="small">${esc(r)}</p>`).join("")}</div>
      </div>
      <div class="tt-tip-fade" aria-hidden="true"></div>
    </div>
    <div class="detail-actions tt-assign">${ultLine ? `<div class="tt-assign-lab tt-ultline">${esc(ultLine)}</div>` : d.type === "active" ? `<div class="tt-assign-lab">${esc(onBar)}</div><div class="row">` + [0, 1, 2, 3].map((r) => barSlotHtml(p, d, r, unlocked, slotLab, e.ui.equipSlot)).join("") + "</div>" : ""}</div>
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
  function hooks() { return H; }
  function now() { return clock; }

  Object.assign(api, {
    data, supports, active, fresh, totalPoints, spentPoints, freePoints, canSpend, spend, unspend, resetFree, derive,
    nodeRank, isHeld, isUltId, ultNodes, ultOf, ultKind, normalizePicks, markFoe, sigStacks, sigBoost, damagePct, areaPct, statBonus, betweenCount, bandPoints, treeDef, treeOfSkill,
    registerTree, replaceTree, sheetMods, postSheet, wrapCast, preDamage, tick, clearWorld,
    migratePlayer, migrateSave, act, panelHtml, detailHtml, layoutBoard, attach, kit,
    // kit tools
    tools: { hooks, now, str, skillDef, rankOf, hasBuff, getBuff, addBuff, treeOfSkill, treeMul, skillMul, scaled, withMul,
      angTo, aimPoint, near, hit, burst, still, isStill, pool, pending, pools, behaviors: BEHAVIORS, withSkill, markFoe, sigStacks },
    _pools: pools, _pending: pending, _kits: kits
  });
  root.ABTree = api;

  // ---- Cinder Warden kit (v81t behavior, unchanged) --------------------------
  (function () {
    let fbCount = 0, heartCount = 0, deathTokens = 6, lastBastion = false;
    const replyAt = new WeakMap();
    function hookPull(e, d2) {
      const up = (data("cinder_warden").upgrades || {}).kiln_hook; if (!up || !H.knock) return;
      const p = e.player, rng = d2.params.range || 1.7, arc = d2.params.arc || 1;
      for (const m of e.world.monsters) {
        if (m.dead || m.boss) continue;
        const dist = Math.hypot(m.x - p.x, m.y - p.y); if (dist > rng + (m.radius || 0.3) || dist < 0.6) continue;
        if (Math.abs(angTo(p, m)) > arc / 2) continue;
        const k = Math.min(up.pull || 0.9, dist - 0.55);
        H.knock(e.world, m, -(m.x - p.x) / dist * k, -(m.y - p.y) / dist * k);
      }
    }
    function avatar(e, d2) {
      const p = e.player, pr = d2.params;
      addBuff(p, { id: d2.id, name: d2.name, remaining: pr.duration || 12, mods: { ias: pr.ias || 40 } });
      e.toasts.push({ text: d2.name + "!", t: 1.6, kind: "good" });
      e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 2.4, t: 0.6, max: 0.6, color: "#ff7a2a" });
      e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 1.4, t: 0.45, max: 0.45, color: "#ffd27a" });
      H.particles(e, p.x, p.y, "#ff8a3d", 18, "fire");
      api.avatarCasts = (api.avatarCasts || 0) + 1;
      H.recalc();
    }
    function slag(e, d2, rank) {
      const pr = d2.params, aim = aimPoint(e, pr.range || 7.5), tx = aim.x, ty = aim.y;
      const rad = Array.isArray(pr.radius) ? pr.radius[0] : pr.radius || 1.7;
      const [lo, hi] = H.te(pr.fire, rank);
      let sum = 0, n = 0;
      for (const m of near(e, tx, ty, rad)) {
        const f = H.fire(e, lo, hi); sum += f; n++;
        H.apply(e, m, { fire: f, kind: "spell", source: "player", canMiss: false, canCrit: true, canLeech: false, tag: "slag" });
      }
      const avg = n ? sum / n : H.fire(e, lo, hi);
      pool({ x: tx, y: ty, r: rad, t: pr.poolSeconds || 4, every: pr.poolTick || 0.5, tick: pr.poolTick || 0.5, dmg: avg * (pr.poolPct || 25) / 100, el: "fire", tag: "slag" });
      e.effects.push({ type: "ring", x: tx, y: ty, radius: rad, t: 0.4, max: 0.4, color: "#ff6a2a" });
      H.particles(e, tx, ty, "#ff7a3c", 14, "fire");
      api.slagCasts = (api.slagCasts || 0) + 1;
    }
    function bulwark(e, d2, rank) {
      const p = e.player, pr = d2.params, cost = Math.max(0, Math.min(p.hp - 1, p.hp * (pr.lifePct || 20) / 100));
      p.hp -= cost;
      const shield = cost * (pr.shieldMul || 2.5);
      addBuff(p, { id: d2.id, name: d2.name, remaining: pr.duration || 8, absorb: shield, absorbMax: shield, mods: { defense: H.J(pr.defense, rank) } });
      e.toasts.push({ text: d2.name + " " + Math.round(shield), t: 1.4, kind: "good" });
      e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 1.2, t: 0.4, max: 0.4, color: "#ffb36b" });
      H.recalc();
    }
    function freeBloom(e, radiusMul, why) {
      // r15 (v84n: no pick pairs now, both are owned): the free blooms (Last Ember, Drowned Furnace) still use its tree rank.
      const p = e.player, bloom = skillDef("cinder_bloom"), t = treeOfSkill(p, "cinder_bloom");
      const r = rankOf(e, "cinder_bloom") || (t ? nodeRank(t.nodes.find((n) => n.skill === "cinder_bloom"), p.tree.pts[t.id] || 0) : 0);
      if (!bloom || r <= 0 || !t) return;
      const { mul, area } = treeMul(p, t);
      const d2 = scaled(bloom, mul, area * radiusMul);
      withMul(mul, () => H.nova(e, d2, r));
      api.freeBlooms = (api.freeBlooms || 0) + 1;
      if (why === "heart") api.heartBlooms = (api.heartBlooms || 0) + 1;
    }
    function bastionLow(e) {
      const r = rankOf(e, "unbroken_bastion"); if (r <= 0 || !e.sheet) return false;
      return e.player.hp > 0 && e.player.hp / Math.max(1, e.sheet.life) < skillDef("unbroken_bastion").params.lowLifePct / 100;
    }
    api.bastionLow = bastionLow;
    kit("cinder_warden", {
      buffs: ["avatar_of_the_kiln", "life_spite_bulwark", "bastion_rage"],
      sheetMods(p, m) {
        const up = (data("cinder_warden").upgrades || {}).ash_skin;
        const r = (p.skills && p.skills.ash_skin) || 0;
        if (up && r > 0) m.allres = (m.allres || 0) + r * (up.allResPerRank || 0);
      },
      postSheet(p, sheet) {
        const bast = skillDef("unbroken_bastion"), r = (sheet.ranks && sheet.ranks.unbroken_bastion) || 0;
        if (bast && r > 0) {
          const pr = bast.params, flat = (sheet.defense || 0) * (pr.armorPct / 100) / (pr.armorPerDamage || 10);
          sheet.physMin += flat; sheet.physMax += flat; sheet.bastionFlat = Math.round(flat);
        }
      },
      castExtra(e, def, t) { return (t.id === "brand" && def.behavior === "melee" && hasBuff(e.player, "avatar_of_the_kiln")) ? { arc: Math.PI * 2 } : null; },
      behaviors: { tree_avatar: avatar, tree_slag: slag, tree_bulwark: bulwark },
      afterCast(e, def, d2, t) {
        if (def.id === "kiln_hook") hookPull(e, d2);
        if (t.id === "ember" && def.type === "active" && rankOf(e, "heart_of_the_sunken_kiln") > 0) {
          const hp = skillDef("heart_of_the_sunken_kiln").params;
          heartCount += 1;
          if (heartCount % (hp.everyNthCast || 3) === 0) freeBloom(e, hp.freeBloomRadiusMul || 1.5, "heart");
        }
      },
      preDamage(e, target, a) {
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
      },
      onHit(ev, e) {
        if (ev.kind === "attack" && hasBuff(e.player, "avatar_of_the_kiln")) {
          const pr = skillDef("avatar_of_the_kiln").params, t = ev.target, amt = ev.amount * (pr.splashPct || 35) / 100;
          if (!t || amt < 1) return;
          for (const m of near(e, t.x, t.y, pr.splashRadius || 1.6, t)) H.apply(e, m, { fire: amt, kind: "spell", source: "player", canMiss: false, canCrit: false, canLeech: false, tag: "splash" });
          api.splashes = (api.splashes || 0) + 1;
          H.particles(e, t.x, t.y, "#ffa04a", 4, "fire");
        }
      },
      onHurt(ev, e) {
        const src = ev.source, r = rankOf(e, "iron_reply");
        if (r <= 0 || !src || src.dead || ev.kind !== "attack" || !(ev.amount > 0) || src === e.player) return;
        const pr = skillDef("iron_reply").params, last = replyAt.get(src);
        if (last != null && clock - last < (pr.icd || 0.35)) return;
        replyAt.set(src, clock);
        const mul = skillMul(e.player, "iron_reply").mul;
        const pct = (pr.armorPct || 12) + (pr.armorPctPerRank || 0) * (r - 1);
        let dmg = (e.sheet.defense || 0) * pct / 100 * mul;
        if (bastionLow(e)) dmg *= skillDef("unbroken_bastion").params.lowLifeReplyMul || 2;
        if (dmg < 1) return;
        H.apply(e, src, { phys: dmg, kind: "thorns", source: "player", canMiss: false, canCrit: false, canLeech: false, tag: "iron_reply" });
        api.replies = (api.replies || 0) + 1;
      },
      onKilled(ev, e) {
        const t = ev.target, r = rankOf(e, "ash_detonation"); if (r <= 0) return;
        const pr = skillDef("ash_detonation").params;
        if (t._abBurnAt == null || clock - t._abBurnAt > (pr.burnWindow || 2.5) || deathTokens < 1) return;
        deathTokens -= 1;
        const mul = skillMul(e.player, "ash_detonation").mul;
        const dmg = (t.maxHp || 30) * (pr.deathPctMaxHp || 12) / 100 * mul, rad = pr.deathRadius || 1.5;
        for (const m of near(e, t.x, t.y, rad, t)) H.apply(e, m, { fire: dmg, kind: "spell", source: "player", canMiss: false, canCrit: false, canLeech: false, tag: "detonation" });
        e.effects.push({ type: "ring", x: t.x, y: t.y, radius: rad, t: 0.3, max: 0.3, color: "#ff8a3d" });
        H.particles(e, t.x, t.y, "#ff8a3d", 8, "fire");
        api.detonations = (api.detonations || 0) + 1;
      },
      tick(e, dt, freeze) {
        const p = e.player, adp = (skillDef("ash_detonation") || { params: {} }).params.deathCapPerSec || 6;
        deathTokens = Math.min(adp, deathTokens + dt * adp);
        for (const m of (e.world && e.world.monsters) || []) if (m._fbT > 0) m._fbT -= dt;
        // Last Ember: Ash Ward bursts when it breaks or runs out (checked before buffs expire).
        if (rankOf(e, "ash_detonation") > 0) for (const b of p.buffs || []) {
          if (b.id !== "ash_ward" || b._abBurst) continue;
          if ((b.absorb != null && b.absorb <= 0) || b.remaining - dt <= 0) { b._abBurst = true; freeBloom(e, 1, "ward"); api.wardBursts = (api.wardBursts || 0) + 1; }
        }
        // The Wall That Burns: low-life rage.
        const low = bastionLow(e);
        if (low !== lastBastion) {
          lastBastion = low;
          p.buffs = (p.buffs || []).filter((b) => b.id !== "bastion_rage");
          if (low) { const bd = skillDef("unbroken_bastion"); p.buffs.push({ id: "bastion_rage", name: (bd && bd.name) || "The Wall That Burns", remaining: 1e9, mods: { ias: (bd && bd.params && bd.params.lowLifeIas) || 100 } }); }
          H.recalc();
        }
        if (!freeze && hasBuff(p, "avatar_of_the_kiln")) {
          api._auraT = (api._auraT || 0) - dt;
          if (api._auraT <= 0) { api._auraT = 0.45; e.effects.push({ type: "ring", x: p.x, y: p.y, radius: 0.95, t: 0.4, max: 0.4, color: "#ff8a3d" }); H.particles(e, p.x, p.y, "#ffb067", 3, "fire"); }
        }
      }
    });
  })();
})(typeof window !== "undefined" ? window : self);
