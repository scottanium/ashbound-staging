/* v84q Awaken / Suppress / Hunger (power-notes/DESIGN.md 2b). Numbers: data/power.json "awaken"; art: data/awaken-art.json.
   item.awaken = {stage, active (null = follows stage; lower = Suppressed), ichor, hunger, starved, asleep}
   - Main slots only (weapon, armor, helm, offhand). Max stage by rarity (Elite/Epic 1, Legendary 2, Fabled 3, Mythical 5);
     runeword items cap at runewordMaxStage (3). Item Power reads the active stage (js/ab-power.js).
   - Ichor: worn items earn it from kills; reaching the next threshold makes the item ready; the Bench finishes the stage with
     its gate cost (Wake-Oil, Heart-Cinder, Mimic Heart, gold). Crafting materials sit in player.craftMats (no bag space).
   - Hunger from stage 3: drains in combat, fills on kills; at 0 the item is Starved (bites 1% max life/s, never lethal,
     fights one stage lower). Suppress is free; raising it again needs combatWindowSec + raiseDelaySec out of combat.
   - Stage unlocks: 1 best affix +20%; 2 themed hidden affix; 3 signature +50% (ABPower.effectMul); 5 Mimic Strike.
   - Folds the old Consume slot: SAVE_VERSION 9 migration puts the consumed item back on the hero at stage
     floor(consumeLevel / 4) (capped by rarity); Remnants stay. Stage 5 items can be put to Sleep for a Remnant. */
(function (root) {
  "use strict";
  var lastCombat = -1e9, mimicT = {}, cssDone = false, bound = false;
  function D() { return root.ASHBOUND_DATA || {}; }
  function P() { return D().power || {}; }
  function C() { return P().awaken || {}; }
  function on() { return !!(root.ABPower && ABPower.on() && P().awaken); }
  function S() { return root.ASHBOUND && ASHBOUND.state; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(n) { return Math.round(n).toLocaleString("en-US"); }
  /* ---------- materials wallet ---------- */
  function wallet(p) { if (!p.craftMats || typeof p.craftMats !== "object") p.craftMats = {}; return p.craftMats; }
  function matName(id) {
    var n = (C().gateMatNames || {})[id]; if (n) return n;
    var cm = (P().crafting || {}).materials || {}; if (cm[id]) return cm[id].name;
    var m = ((D().consume || {}).materials || {})[id]; return m ? m.name : id;
  }
  function count(p, id) {
    if (id === "gold") return p.gold || 0;
    var n = wallet(p)[id] || 0;
    if (root.ABCraft && ABCraft.countMat) n += ABCraft.countMat(p, id);
    return n;
  }
  function canPay(p, cost) { for (var k in cost || {}) if (count(p, k) < cost[k]) return false; return true; }
  function pay(p, cost) {
    if (!canPay(p, cost)) return false;
    for (var k in cost) {
      var need = cost[k];
      if (k === "gold") { p.gold -= need; continue; }
      var w = wallet(p), take = Math.min(w[k] || 0, need); w[k] = (w[k] || 0) - take; if (!w[k]) delete w[k]; need -= take;
      if (need > 0 && root.ABCraft && ABCraft.spendMat) ABCraft.spendMat(p, k, need, root.ASHBOUND && ASHBOUND.removeHook ? { remove: ASHBOUND.removeHook } : null);
    }
    return true;
  }
  function addMat(p, id, n) { var w = wallet(p); w[id] = (w[id] || 0) + (n || 1); return w[id]; }
  function costText(p, cost) {
    var out = []; for (var k in cost || {}) { var have = count(p, k), ok = have >= cost[k];
      out.push('<span class="' + (ok ? "ok" : "no") + '">' + (k === "gold" ? fmt(cost[k]) + " gold" : cost[k] + " " + esc(matName(k))) + " (" + fmt(have) + ")</span>"); }
    return out.join(" \u00b7 ") || '<span class="ok">free</span>';
  }
  function walletText(p) {
    var w = wallet(p), parts = [];
    var order = ["wake_oil", "heart_cinder", "mimic_heart"].concat(Object.keys(((P().crafting || {}).materials) || {}));
    order.forEach(function (k) { var n = count(p, k); if (n) parts.push(esc(matName(k)) + " " + fmt(n)); });
    parts.push(fmt(p.gold || 0) + " gold");
    return parts.join(" \u00b7 ");
  }
  /* ---------- items ---------- */
  function tierOf(item) { return root.ABPower ? ABPower.tierOf(item) : (item.tier || item.rarity); }
  function mainSlot(item) { return !!(item && (C().slots || []).indexOf(item.slot) >= 0); }
  function maxStage(item) {
    if (!on() || !mainSlot(item)) return 0;
    if (item.awaken && item.awaken.asleep) return 0;
    var m = (C().maxStageByRarity || {})[tierOf(item)] || 0;
    if (item.runeword && !(item.elderWord || (root.ABRunes && ABRunes.isElder(item.runeword)))) m = Math.min(m, C().runewordMaxStage != null ? C().runewordMaxStage : 3);
    return m;
  }
  function eligible(item) { return maxStage(item) > 0; }
  function ensure(item) { if (!item.awaken) item.awaken = { stage: 0, active: null, ichor: 0, hunger: 100 }; return item.awaken; }
  function stage(item) { return item && item.awaken ? item.awaken.stage || 0 : 0; }
  function active(item) { return root.ABPower ? ABPower.activeStage(item) : stage(item); }
  function held(item) { var a = item && item.awaken; if (!a) return 0; return a.active == null ? a.stage || 0 : Math.min(a.stage || 0, a.active); }
  function need(s) { var t = C().ichorToStage || []; return t[s] != null ? t[s] : Infinity; }
  function ready(item) { var a = item && item.awaken; return !!(a && eligible(item) && (a.stage || 0) < maxStage(item) && (a.ichor || 0) >= need((a.stage || 0) + 1)); }
  function gate(s) { return (C().gateMats || [])[s] || {}; }
  function worn(p) { var out = []; var eq = (p && p.equipment) || {}; for (var k in eq) { var it = eq[k]; if (it && eligible(it)) out.push(it); } return out; }
  function nowT() { var s = S(); return (s && s.time) || 0; }
  function inCombat() { return nowT() - lastCombat < (C().combatWindowSec || 4); }
  function canAwaken(p, item) {
    if (!eligible(item)) return { ok: false, reason: "Only a weapon, body armor, helm or shield of Elite rank or better can awaken." };
    var a = ensure(item), s = (a.stage || 0) + 1;
    if (s > maxStage(item)) return { ok: false, reason: "Fully awake for its rank." };
    if ((a.ichor || 0) < need(s)) return { ok: false, reason: "Needs " + fmt(need(s)) + " Ichor (has " + fmt(a.ichor || 0) + "). Wear it and kill." };
    var cl = (C().craftLevelForStage || [])[s]; if (cl && root.ABForge && ABForge.craftLevel(p) < cl) return { ok: false, reason: ((C().stageNames || [])[s] || "That stage") + " needs crafting level " + cl + "." };
    if (!canPay(p, gate(s))) return { ok: false, reason: "Missing materials." };
    return { ok: true, stage: s, cost: gate(s) };
  }
  function recalc() { if (root.ASHBOUND && ASHBOUND.recalc) ASHBOUND.recalc(); var s = S(); if (s && s.ui) s.ui.rev++; }
  function awaken(p, item, opts) {
    var c = (opts && opts.force) ? { ok: true, stage: stage(item) + 1, cost: {} } : canAwaken(p, item);
    if (!c.ok) return c;
    if (!(opts && opts.force)) { pay(p, c.cost); if (root.ABForge) ABForge.addXp(p, ((D().power || {}).crafting || {}).awakenXp || 8); }
    var a = ensure(item); a.stage = c.stage; a.active = null; a.hunger = (C().hunger || {}).max || 100; a.starved = false;
    recalc();
    var nm = (C().stageNames || [])[a.stage] || ("Stage " + a.stage);
    return { ok: true, stage: a.stage, toast: (item.name || "It") + " awakens: " + nm + "." };
  }
  function suppress(p, item, level) {
    var a = item && item.awaken; if (!a || !a.stage) return { ok: false, reason: "Nothing to suppress." };
    level = Math.max(0, Math.min(a.stage, level | 0));
    var cur = held(item);
    if (level > cur) {
      var sp = C().suppress || {}, wait = (C().combatWindowSec || 4) + (sp.raiseDelaySec || 0);
      if (sp.outOfCombatToRaise !== false && nowT() - lastCombat < wait) return { ok: false, reason: "It has to wake up: " + Math.ceil(wait - (nowT() - lastCombat)) + "s out of combat." };
    }
    a.active = level >= a.stage ? null : level;
    if (a.active != null && a.active < ((C().hunger || {}).fromStage || 3)) a.starved = false;
    recalc();
    return { ok: true, toast: level >= a.stage ? (item.name + " is fully awake.") : (item.name + " held at " + ((C().stageNames || [])[level] || level) + ".") };
  }
  function sleep(p, item) {
    var a = item && item.awaken, from = (C().sleep || {}).fromStage || 5;
    if (!a || (a.stage || 0) < from) return { ok: false, reason: "Only a fully awake item can be put to sleep." };
    if (!item.uniqueId) return { ok: false, reason: "Only uniques leave a Remnant." };
    var rem = root.ABCraft && ABCraft.buildRemnant ? ABCraft.buildRemnant(item) : null;
    if (rem) { if (root.ABCraft.ensurePlayer) ABCraft.ensurePlayer(p); var ex = (p.remnants || []).find(function (r) { return r.uniqueId === rem.uniqueId; }); if (ex) { ex.mods = rem.mods; ex.on = true; } else p.remnants.push(rem); }
    a.stage = 0; a.active = null; a.ichor = 0; a.asleep = true; a.starved = false;
    recalc();
    return { ok: true, toast: item.name + " sleeps. Its Remnant stays with you." };
  }
  /* ---------- stats: stage unlocks + Leashed bonus (called from index.html ua) ---------- */
  function theme(item) {
    var m = Object.assign({}, item.fixedMods || {}); (item.affixes || []).forEach(function (a) { for (var k in a.mods || {}) m[k] = 1; });
    if (m.fireDamage || m.fireDamagePercent || (item.effect && item.effect.element === "fire")) return "fire";
    if (m.coldDamage || (item.effect && item.effect.element === "cold")) return "cold";
    if (m.lightningDamage || (item.effect && item.effect.element === "lightning")) return "lightning";
    if (m.poisonDamage || (item.effect && item.effect.element === "poison")) return "poison";
    return "phys";
  }
  function themeMods(item) { var t = C().themeAffix || {}, bag = item.slot === "weapon" ? t.weapon : t["default"]; return (bag || {})[theme(item)] || null; }
  function bestAffix(item) {
    var best = null, bt = -1; (item.affixes || []).forEach(function (a) { var t = a.tier || 1; if (t > bt) { bt = t; best = a; } });
    if (!best && item.fixedMods) return { mods: item.fixedMods, unique: true };
    return best;
  }
  function bagExtra(e, t, Z, V) {
    if (!on() || !e || !e.awaken || !mainSlot(e)) return;
    var s = active(e), a = e.awaken, sc = function (m) { return root.ABPower ? ABPower.scaleMods(e, m) : m; };
    if (s >= 1) {
      var b = bestAffix(e), k = C().bestAffixBonus || 0.2;
      if (b && b.mods) { var mods = (root.ABFeel && ABFeel.affixMods && !b.unique ? ABFeel.affixMods(b, e.slot) : null) || b.mods, part = {};
        for (var key in mods) { if (key === "skills") continue; var v = mods[key]; part[key] = Array.isArray(v) ? v.map(function (x) { return x * k; }) : (typeof v === "number" ? v * k : v); }
        V(t, Z(sc(part))); }
    }
    if (s >= 2) { var tm = themeMods(e); if (tm) V(t, Z(sc(tm))); }
    var heldBack = (a.stage || 0) - held(e);
    if (heldBack > 0) { var lb = ((C().suppress || {}).leashBonusPerStageSuppressed) || {}, lm = {}; for (var q in lb) lm[q] = lb[q] * heldBack; V(t, Z(lm)); }
  }
  /* ---------- combat hooks ---------- */
  function onKill(pl) {
    if (!on() || !pl || !pl.state || !pl.target) return;
    var s = pl.state, p = s.player, m = pl.target; if (!p || m === p) return;
    lastCombat = s.time || 0;
    var ip = C().ichorPerKill || {}, rank = m.boss || m.rank === "boss" ? "boss" : (m.rank === "elite" || m.mini ? "elite" : (m.rank === "champion" ? "champion" : "normal"));
    var gain = (ip[rank] || 1) * (1 + (ip.levelBonusPer10 || 0) * Math.floor((m.mlvl || 1) / 10));
    var h = C().hunger || {}, fed = rank === "normal" ? (h.perKill || 4) : (h.perEliteKill || 15);
    worn(p).forEach(function (it) {
      var a = ensure(it);
      if ((a.stage || 0) < maxStage(it)) { var before = ready(it); a.ichor = Math.min(need(maxStage(it)), (a.ichor || 0) + gain); if (!before && ready(it)) s.toasts.push({ text: it.name + " is ready to awaken. Visit the bench.", t: 3, kind: "good" }); }
      if (a.hunger != null && a.hunger < (h.max || 100)) { a.hunger = Math.min(h.max || 100, a.hunger + fed); if (a.starved && a.hunger > 0) { a.starved = false; recalc(); s.toasts.push({ text: it.name + " is fed.", t: 2.5 }); } }
    });
    matDrops(s, p, m, rank);
  }
  function matDrops(s, p, m, rank) {
    var md = C().matDrops || {};
    for (var id in md) {
      var d = md[id]; if ((m.mlvl || 1) < (d.minMlvl || 0)) continue;
      var ch = d[rank] || 0; if (!ch) continue;
      var w = s.world || {}, rt = w.kind === "rift" ? (w.riftTier || 0) : 0;
      if (d.eliteRiftFrom && rank !== "boss" && rt < d.eliteRiftFrom) continue; // v84q: e.g. Mimic Heart from elites only in rifts T10+
      if (rt && d.riftPerTier) ch += d.riftPerTier * rt;
      if (Math.random() < ch) { addMat(p, id, 1); s.toasts.push({ text: "+1 " + matName(id), t: 2.5, kind: "good" }); }
    }
  }
  function onCombat(pl) { if (pl && pl.state) lastCombat = pl.state.time || 0; }
  function tick(dt, s) {
    if (!on() || !s || !s.player || s.mode !== "play") return;
    var p = s.player, h = C().hunger || {}, fight = inCombat(), changed = false;
    worn(p).forEach(function (it) {
      var a = it.awaken; if (!a) return;
      var hs = held(it);
      if (hs >= (h.fromStage || 3)) {
        if (a.hunger == null) a.hunger = h.max || 100;
        if (fight) a.hunger = Math.max(0, a.hunger - ((h.drainPerSecInCombat || [])[hs] || 0) * dt);
        if (a.hunger <= 0 && !a.starved) { a.starved = true; changed = true; s.toasts.push({ text: it.name + " is starving. Feed it kills.", t: 3, kind: "bad" }); }
        if (a.starved) {
          var life = (s.sheet && s.sheet.life) || 100, bite = life * ((h.starved || {}).selfDamagePctPerSec || 1) / 100 * dt;
          p.hp = h.lethal ? p.hp - bite : Math.max(1, p.hp - bite);
        }
      } else if (a.starved) { a.starved = false; changed = true; }
      if (active(it) >= 5) mimic(s, it, dt, fight);
    });
    if (changed) recalc();
    hud(s);
  }
  function mimic(s, it, dt, fight) {
    var ms = C().mimicStrike || {}; if (ms.inCombatOnly !== false && !fight) return;
    var k = it.uid; mimicT[k] = (mimicT[k] || 0) + dt; if (mimicT[k] < (ms.everySec || 8)) return;
    var p = s.player, list = (s.world && s.world.monsters) || [], best = null, bd = ms.range || 4.5;
    for (var i = 0; i < list.length; i++) { var m = list[i]; if (m.dead) continue; var d = Math.hypot(m.x - p.x, m.y - p.y); if (d < bd) { bd = d; best = m; } }
    if (!best || !root.ABEffects || !ABEffects.applyHit) return;
    mimicT[k] = 0;
    var sh = s.sheet || {}, avg = ((sh.physMin || 1) + (sh.physMax || 3)) / 2, dmg = Math.round(avg * (ms.weaponPct || 3));
    var el = { fire: "fire", cold: "cold", lightning: "lightning", poison: "poison" }[theme(it)] || "phys";
    ABEffects.applyHit(s, best, ABEffects.elemPacket ? ABEffects.elemPacket(el === "phys" ? "fire" : el, dmg) : { amount: dmg });
    if (s.effects) s.effects.push({ type: "ring", x: best.x, y: best.y, radius: 1.0, t: 0.4, max: 0.4, color: "#ff6a3c" });
  }
  /* ---------- HUD hunger chip (only when an item hungers) ---------- */
  function hud(s) {
    if (!root.document) return;
    var el = document.getElementById("ab-hunger"), p = s.player, h = C().hunger || {};
    var list = worn(p).filter(function (it) { return held(it) >= (h.fromStage || 3); });
    if (!list.length || (s.ui && s.ui.panel)) { if (el) el.hidden = true; return; }
    css();
    if (!el) { el = document.createElement("div"); el.id = "ab-hunger"; document.body.appendChild(el); }
    el.hidden = false;
    var html = list.map(function (it) { var a = it.awaken, pct = Math.round(100 * (a.hunger || 0) / (h.max || 100));
      return '<span class="hg' + (a.starved ? " st" : "") + '" title="' + esc(it.name) + '"><b style="width:' + pct + '%"></b></span>'; }).join("");
    if (el.__h !== html) { el.innerHTML = '<span class="hl">Hunger</span>' + html; el.__h = html; }
  }
  function css() {
    if (cssDone || !root.document) return; cssDone = true;
    var st = document.createElement("style"); st.id = "ab-awaken-style";
    st.textContent = [
      "#ab-hunger{position:fixed;z-index:20;top:calc(var(--safe-t,0px) + 4px);left:50%;transform:translateX(-50%);display:flex;gap:4px;align-items:center;pointer-events:none;background:rgba(20,12,8,.55);border-radius:8px;padding:2px 6px}",
      "body:has(#panel:not(.hidden)) #ab-hunger,body:has(#ab-bench:not([hidden])) #ab-hunger,#ab-hunger[hidden]{display:none!important}",
      "#ab-hunger .hl{font-size:9px;color:#e9a07a;letter-spacing:.05em;text-transform:uppercase}",
      "#ab-hunger .hg{display:inline-block;width:34px;height:6px;border-radius:3px;background:#3a1f18;overflow:hidden}#ab-hunger .hg b{display:block;height:100%;background:#e0603c}",
      "#ab-hunger .hg.st{outline:1px solid #ff4a3d;animation:abHg 0.6s infinite alternate}@keyframes abHg{to{opacity:.4}}",
      ".aw-block{margin:5px 0 3px;padding:5px 7px;border:1px solid #6b3a26;border-radius:8px;background:rgba(80,30,18,.25)}",
      ".aw-block.dorm{margin:2px 0;padding:0 2px;border:0;background:none}.aw-block.dorm .aw-h{font-size:12px}[data-le-fit='4'] .aw-block.dorm,[data-le-fit='5'] .aw-block.dorm{margin:0;padding:0}[data-le-fit='4'] .aw-block.dorm *,[data-le-fit='5'] .aw-block.dorm *{font-size:10px;line-height:1.1}[data-le-fit='5'] .aw-block.dorm{float:right;margin-left:6px}.aw-block .aw-h{font-weight:700;color:#ff9a6a}.aw-block .aw-pips{letter-spacing:2px;color:#ff7a4a}.aw-block .aw-l{font-size:11px;color:#d8c8ae}",
      ".aw-block .aw-bar{height:5px;border-radius:3px;background:#3a2c20;overflow:hidden;margin:3px 0}.aw-block .aw-bar i{display:block;height:100%;background:#d9772e}",
      ".aw-block .aw-bar.hu i{background:#e0603c}.aw-block .aw-btns{display:flex;gap:5px;margin-top:4px;flex-wrap:wrap}",
      ".aw-badge{position:absolute;right:-2px;bottom:-2px;min-width:13px;height:13px;border-radius:7px;background:#b8341c;color:#fff;font:700 9px/13px system-ui;text-align:center;padding:0 2px;box-shadow:0 0 4px #ff6a3c;pointer-events:none}",
      ".aw-badge.st{background:#6b0d0d}",
      ".aw-art{max-width:100%;max-height:100%;object-fit:contain}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(st);
  }
  /* ---------- tooltip block (wraps ABEffects.tooltipHtml) ---------- */
  function pips(item) { var m = maxStage(item), s = stage(item), h = held(item), out = ""; for (var i = 1; i <= m; i++) out += i <= h ? "\u25cf" : (i <= s ? "\u25d0" : "\u25cb"); return out; }
  function block(item) {
    if (!on() || !eligible(item)) return "";
    css();
    var a = ensure(item), s = a.stage || 0, m = maxStage(item), names = C().stageNames || [], lines = C().stageLines || [], h = C().hunger || {};
    var o = '<div class="aw-block" data-aw-uid="' + esc(item.uid) + '"><div class="aw-h">' + esc(names[held(item)] || "") + ' <span class="aw-pips">' + pips(item) + "</span>" +
      (held(item) < s ? ' <span class="aw-l">(held back from ' + esc(names[s]) + ")</span>" : "") + "</div>";
    if (s === 0 && !ready(item)) return o.replace('<div class="aw-block"', '<div class="aw-block dorm"').replace(/<\/div>$/, "") + ' <span class="aw-l">\u00b7 Ichor ' + fmt(a.ichor || 0) + " / " + fmt(need(1)) + "</span></div></div>"; // dormant: one line, keeps the compare card short
    if (s < m) { var nd = need(s + 1), pc = Math.min(100, Math.round(100 * (a.ichor || 0) / nd)); o += '<div class="aw-l">Ichor ' + fmt(a.ichor || 0) + " / " + fmt(nd) + (ready(item) ? " \u00b7 ready at the bench" : "") + '</div><div class="aw-bar"><i style="width:' + pc + '%"></i></div>'; }
    if (held(item) >= (h.fromStage || 3)) o += '<div class="aw-l">' + (a.starved ? "Starved: it bites and fights a stage lower" : "Hunger " + Math.round(a.hunger == null ? 100 : a.hunger)) + '</div><div class="aw-bar hu"><i style="width:' + Math.round(a.hunger == null ? 100 : a.hunger) + '%"></i></div>';
    for (var i = 1; i <= Math.min(held(item), lines.length - 1); i++) if (lines[i]) o += '<div class="aw-l">\u2726 ' + esc(lines[i]) + (i === 2 ? " (" + esc((C().themeNames || {})[theme(item)] || "") + ")" : "") + "</div>";
    o += '<div class="aw-btns"><button type="button" class="btn slim" data-bench-open="awaken" data-uid="' + esc(item.uid) + '">Awaken\u2026</button>';
    if (s > 0) o += '<button type="button" class="btn slim" data-aw-act="down" data-uid="' + esc(item.uid) + '">Suppress \u2212</button><button type="button" class="btn slim" data-aw-act="up" data-uid="' + esc(item.uid) + '">Wake +</button>';
    return o + "</div></div>";
  }
  function findItem(p, uid) { if (!p || !uid) return null; var l = [].concat(p.inventory && p.inventory.items || [], p.stash && p.stash.items || [], Object.values(p.equipment || {})); return l.find(function (x) { return x && x.uid === uid; }) || null; }
  if (root.document) document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-aw-act]"); if (!t) return;
    ev.preventDefault(); ev.stopPropagation();
    var s = S(), it = findItem(s && s.player, t.getAttribute("data-uid")); if (!it) return;
    var r = suppress(s.player, it, held(it) + (t.getAttribute("data-aw-act") === "up" ? 1 : -1));
    s.toasts.push({ text: r.toast || r.reason, t: 2.5, kind: r.ok ? "good" : "bad" }); s.pendingSave = true;
  }, true);
  /* ---------- art hook: stage art from data/awaken-art.json, else the normal icon; a small stage badge ---------- */
  // stage shown = held awaken stage on a main-slot item, else 0 (inanimate); missing stage -> highest lower stage -> null (normal icon)
  function artStage(item) { return item && item.awaken && eligible(item) ? held(item) : 0; }
  function artPath(item, st) { var a = D().awakenArt || {}, items = a.items || {}, e = item.uniqueId ? items[item.uniqueId] : items[item.baseId]; if (!e) return null;
    for (var k = Math.max(0, st | 0); k >= 0; k--) if (e[String(k)]) return e[String(k)]; return null; }
  function badge(item) { if (!on() || !item || !item.awaken || !(item.awaken.stage > 0)) return ""; var cfgA = (D().awakenArt || {}).badge || {}; if (cfgA.show === false) return ""; css();
    return '<span class="aw-badge' + (item.awaken.starved ? " st" : "") + '" title="Awaken stage">' + held(item) + "</span>"; }
  function wrapArt() {
    if (root.ABUiArt && !ABUiArt.__aw) { var orig = ABUiArt.itemHtml; ABUiArt.__aw = true;
      ABUiArt.itemHtml = function (item, cls) { var base = orig.apply(this, arguments); if (!on() || !item) return base;
        var st = artStage(item), pth = artPath(item, st);
        // same classes as the atlas icon (item-ico art) so the rarity glow CSS still draws on top; atlas icon kept hidden as the onerror fallback
        if (pth) base = '<img class="item-ico art aw-art ' + esc(cls || "") + '" data-art="' + esc((ABUiArt.itemArtId && ABUiArt.itemArtId(item)) || "") + '" data-aw-stage="' + st + '" alt="" draggable="false" src="' + esc(pth) +
          '" onerror="var n=this.nextElementSibling;if(n){n.hidden=false;n.outerHTML=n.innerHTML}this.remove()"><span class="aw-fallback" hidden>' + base + "</span>";
        return base + badge(item); }; }
    if (root.ABEffects && !ABEffects.__aw) { var t0 = ABEffects.tooltipHtml; ABEffects.__aw = true;
      ABEffects.tooltipHtml = function (item) { var a = t0 ? t0.apply(this, arguments) : ""; return (a || "") + block(item); }; }
  }
  /* ---------- Bench tab ---------- */
  function icon(it) {
    try { if (root.ABIcons && ABIcons.ready && ABIcons.ready()) { var h = ABIcons.html(it, root.ABCraft && ABCraft.displayId ? ABCraft.displayId(it) : it.tier); if (h) return h; } } catch (e) {}
    try { return (root.ABUiArt && ABUiArt.itemHtml(it)) || ""; } catch (e) { return ""; }
  }
  function benchList(p) {
    var out = [], seen = {}; worn(p).forEach(function (it) { out.push({ it: it, where: "Worn" }); seen[it.uid] = 1; });
    (p.inventory && p.inventory.items || []).forEach(function (it) { if (it && !seen[it.uid] && eligible(it)) out.push({ it: it, where: "Bag" }); });
    return out;
  }
  function benchHtml(s, st) {
    var p = s.player, list = benchList(p), names = C().stageNames || [];
    if (!list.length) return '<div class="card mut">No item can awaken yet. Awaken needs a weapon, body armor, helm or shield of Elite rank or better.</div>';
    if (st.uid) list.sort(function (a, b) { return (b.it.uid === st.uid) - (a.it.uid === st.uid); });
    return '<div class="mut" style="margin-bottom:6px">Wear an item to feed it Ichor from kills. When the bar fills, pay the gate cost here to wake the next stage. From Hungry on it must keep killing.</div>' + list.map(function (row) {
      var it = row.it, a = ensure(it), s0 = a.stage || 0, m = maxStage(it), c = canAwaken(p, it);
      var nxt = s0 < m ? '<div>Next: <b>' + esc(names[s0 + 1]) + '</b> \u00b7 Ichor <span class="' + ((a.ichor || 0) >= need(s0 + 1) ? "ok" : "no") + '">' + fmt(a.ichor || 0) + " / " + fmt(need(s0 + 1)) + '</span></div><div class="bar"><i style="width:' + Math.min(100, Math.round(100 * (a.ichor || 0) / need(s0 + 1))) + '%"></i></div><div class="mut">Cost: ' + costText(p, gate(s0 + 1)) + "</div>" : '<div class="ok">Fully awake for its rank.</div>';
      var btns = (s0 < m ? '<button type="button" class="btn2 pri" data-bench-act="awaken" data-uid="' + esc(it.uid) + '"' + (c.ok ? "" : " disabled") + ">Awaken</button>" : "") +
        (s0 > 0 ? '<button type="button" class="btn2" data-bench-act="sup-down" data-uid="' + esc(it.uid) + '">Suppress \u2212</button><button type="button" class="btn2" data-bench-act="sup-up" data-uid="' + esc(it.uid) + '">Wake +</button>' : "") +
        (s0 >= ((C().sleep || {}).fromStage || 5) && it.uniqueId ? '<button type="button" class="btn2" data-bench-act="sleep" data-uid="' + esc(it.uid) + '">Sleep (Remnant)</button>' : "");
      var mul = root.ABPower ? ABPower.stagePower(it) : 1;
      return '<div class="card" data-aw-row="' + esc(it.uid) + '"><div class="row"><div class="ico">' + icon(it) + '</div><div style="flex:1;min-width:0"><div class="nm">' + esc(it.name) + ' <span class="mut">' + esc(row.where) + " \u00b7 " + esc((root.ABCraft && ABCraft.rankLabel ? ABCraft.rankLabel(it) : tierOf(it))) + '</span></div><div>' + esc(names[held(it)]) + ' <span style="color:#ff7a4a;letter-spacing:2px">' + pips(it) + '</span> <span class="mut">item power x' + mul.toFixed(1) + "</span>" + (a.starved ? ' <span class="no">Starved</span>' : "") + "</div>" + nxt +
        '</div><div style="display:flex;flex-direction:column;gap:4px">' + btns + "</div></div>" + (c.ok || s0 >= m ? "" : '<div class="mut">' + esc(c.reason) + "</div>") + "</div>";
    }).join("");
  }
  function benchAct(act, el, s) {
    var p = s.player, it = findItem(p, el.getAttribute("data-uid")); if (!it) return { ok: false, toast: "Item not found.", kind: "bad" };
    var r = act === "awaken" ? awaken(p, it) : act === "sup-down" ? suppress(p, it, held(it) - 1) : act === "sup-up" ? suppress(p, it, held(it) + 1) : act === "sleep" ? sleep(p, it) : null;
    if (r && !r.ok && !r.toast) r.toast = r.reason;
    return r;
  }
  /* ---------- save: SAVE_VERSION 9 (fold the Consume slot) ---------- */
  function migratePlayer(p) {
    if (!p) return p;
    wallet(p);
    var c = p.consume;
    if (c && typeof c === "object") {
      var lv = c.consumeLevel || 0, per = (C().consumeFold || {}).levelsPerStage || 4;
      delete c.dormant; c.consumeMul = 1;
      var a = ensure(c), mx = (C().maxStageByRarity || {})[tierOf(c)] || 0;
      a.stage = Math.min(mx, Math.floor(lv / per)); a.ichor = a.stage ? need(a.stage) : 0; a.hunger = (C().hunger || {}).max || 100;
      var slot = c.slot; p.equipment = p.equipment || {};
      if (slot && p.equipment[slot] == null && (C().slots || []).indexOf(slot) >= 0) p.equipment[slot] = c;
      else { p.consumeReturned = p.consumeReturned || []; p.consumeReturned.push(c); }
      p.consume = null;
    }
    var all = [].concat(p.inventory && p.inventory.items || [], p.stash && p.stash.items || [], Object.values(p.equipment || {}));
    all.forEach(function (it) { if (it && it.awaken && typeof it.awaken !== "object") delete it.awaken; });
    return p;
  }
  function migrateSave(dto) { if (dto && dto.player) migratePlayer(dto.player); return dto; }
  /* items the migration could not place in a gear slot go to the bag (or stash) once the game is running */
  function placeReturned(p) {
    if (!p || !p.consumeReturned || !p.consumeReturned.length || !root.ASHBOUND || !ASHBOUND.give) return;
    var l = p.consumeReturned.slice(); p.consumeReturned = []; l.forEach(function (it) { ASHBOUND.give(it); });
  }
  function bind() {
    if (bound || !root.ABBus) return; bound = true;
    ABBus.on("combat:killed", onKill); ABBus.on("combat:hit", onCombat); ABBus.on("combat:struck", onCombat); ABBus.on("combat:playerHurt", onCombat);
  }
  function init() {
    bind(); wrapArt();
    if (root.ABBench) ABBench.register({ id: "awaken", label: "Awaken", order: 10, html: benchHtml, onAct: benchAct });
  }
  if (root.document) { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init(); }
  if (root.ASHBOUND_DATA_READY && root.ASHBOUND_DATA_READY.then) root.ASHBOUND_DATA_READY.then(function () { wrapArt(); });
  root.ABAwaken = { on: on, eligible: eligible, maxStage: maxStage, ensure: ensure, stage: stage, held: held, active: active, need: need, ready: ready, gate: gate,
    canAwaken: canAwaken, awaken: awaken, suppress: suppress, sleep: sleep, bagExtra: bagExtra, onKill: onKill, tick: tick, inCombat: inCombat,
    markCombat: function (t) { lastCombat = t == null ? nowT() : t; }, theme: theme, block: block, badge: badge, artPath: artPath, artStage: artStage, wallet: wallet, count: count, canPay: canPay, pay: pay,
    addMat: addMat, matName: matName, costText: costText, walletText: walletText, migrateSave: migrateSave, migratePlayer: migratePlayer, placeReturned: placeReturned, icon: icon, findItem: findItem, wrapArt: wrapArt };
})(typeof window !== "undefined" ? window : self);
