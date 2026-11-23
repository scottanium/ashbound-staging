/* Ashbound v72: attack, hit, movement, stamina and boot-run feel.
   Numbers come from data/feel.json. Combat, AI and render do not import this file's internals;
   they call ABFeel through this small surface. */
(function (root) {
  "use strict";
  var DEF = {
    attack: { swingMin: 0.08, swingMax: 0.18, swingApsRef: 0.28, skillSwing: 0.11, autoSwing: 0.12, windup: 0, recoveryMul: 1, strikeAnimRef: 0.18, strikeAnimRate: 22 },
    hit: { stop: 0.07, stopCrit: 0.11, stopKill: 0.13, stopHurt: 0.055, hurtThreshold: 16, flashHit: 0.18, flashHurt: 0.18, flashFriendly: 0.14, shakeHit: 1.8, shakeCrit: 2.8, shakeHitCap: 3.6, shakeCritCap: 5.2, shakeHurtMul: 0.1, shakeHurtAddCap: 2.4, shakeCap: 4.5, impactRing: 0.16, impactRingCrit: 0.22, impactRadius: 0.55, impactRadiusCrit: 0.85 },
    movement: { runMul: 0.85, walkMul: 0.4, walkStick: 0.62, deadzone: 0.18, accel: 16, decel: 22, slowMul: 0.72, channelMul: 0.5, runAnimSpeed: 3.05, idleSpeed: 0.25 },
    stamina: { maxBase: 80, perVitality: 2.5, drainPerSec: 16, regenWalk: 22, regenIdle: 36, resumeFrac: 0.28, bar: { width: 72, height: 8, gapAboveOrb: 6 } },
    bootMove: { common: 5, magic: 8, rare: 12, elite: 16, epic: 22, legendary: 28, fabled: 34, mythical: 40 },
    affix: { fleetBoots: 8, fleetRing: 5, ofThePath: 15, frwFloor: -20, frwCap: 80 }
  };

  function src() { return (root.ASHBOUND_DATA && root.ASHBOUND_DATA.feel) || {}; }
  function merge(base, over) {
    var o = {};
    for (var k in base) o[k] = base[k];
    if (over) for (var k2 in over) {
      if (over[k2] && typeof over[k2] === "object" && !Array.isArray(over[k2]) && typeof o[k2] === "object") o[k2] = merge(o[k2] || {}, over[k2]);
      else if (over[k2] != null) o[k2] = over[k2];
    }
    return o;
  }
  function cfg() { return merge(DEF, src()); }
  function attack() { return cfg().attack; }
  function hit() { return cfg().hit; }
  function move() { return cfg().movement; }
  function stamina() { return cfg().stamina; }
  function bootMove() { return cfg().bootMove; }
  function affix() { return cfg().affix; }

  function swingTime(aps) {
    var a = attack();
    return Math.max(a.swingMin, Math.min(a.swingMax, a.swingApsRef / (aps || 1)));
  }
  function skillSwing() { return attack().skillSwing; }
  function recoveryMul() { return attack().recoveryMul; }
  function attackPeriod(aps) { return (1 / (aps || 1)) * (recoveryMul() || 1); }
  function strikeFrame(swingT, swing) {
    var a = attack();
    var ref = a.strikeAnimRef, rate = a.strikeAnimRate;
    return Math.min(3, Math.floor((ref - (swingT || swing || 0)) * rate));
  }

  function hitStopFor(kind, crit) {
    var h = hit();
    if (kind === "kill") return h.stopKill;
    if (kind === "hurt") return h.stopHurt;
    return crit ? h.stopCrit : h.stop;
  }

  function itemRank(item) {
    if (!item) return "common";
    var r = item.tier || item.rarity || "common";
    if (r === "unique" || r === "set") r = item.tier || item.baseRarity || "epic";
    return r;
  }
  function bootPct(item) {
    if (!item || (item.slot !== "boots" && item.kind !== "boots")) return 0;
    var table = bootMove();
    var r = itemRank(item);
    var n = table[r];
    return n != null ? n : 0;
  }
  function bootImplicitAffix(item) {
    var n = bootPct(item);
    return n ? [{ name: "Built-in", mods: { moveSpeed: n } }] : [];
  }
  function affixMods(aff, slot) {
    if (!aff) return null;
    var bag = ((root.ASHBOUND_DATA && root.ASHBOUND_DATA.prefixes) || []).concat((root.ASHBOUND_DATA && root.ASHBOUND_DATA.suffixes) || []);
    var def = null;
    for (var i = 0; i < bag.length; i++) if (bag[i] && bag[i].id === aff.id) { def = bag[i]; break; }
    def = def || aff;
    if (def.slotMods && slot && def.slotMods[slot]) return def.slotMods[slot];
    return def.mods || aff.mods;
  }
  function frwClamp(v) {
    var a = affix();
    var lo = a.frwFloor, hi = a.frwCap;
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function stamMax(vit) {
    var s = stamina();
    return s.maxBase + (Number(vit) || 0) * s.perVitality;
  }
  function ensure(player, sheet) {
    if (!player) return player;
    var max = stamMax(sheet && sheet.vit);
    if (player.stamMax == null || player.stamMax !== max) {
      var prev = player.stamMax;
      if (player.stamina == null) player.stamina = max;
      else if (prev > 0) player.stamina = player.stamina * (max / prev);
      player.stamMax = max;
    }
    if (player.stamina > player.stamMax) player.stamina = player.stamMax;
    if (player.stamina < 0) player.stamina = 0;
    if (player.stamLock == null) player.stamLock = false;
    if (player.vx == null) player.vx = 0;
    if (player.vy == null) player.vy = 0;
    if (!player.gait) player.gait = "idle";
    return player;
  }
  function tickStamina(dt, player, sheet, world, running) {
    if (!player || dt <= 0) return player;
    ensure(player, sheet);
    var s = stamina();
    var town = world && world.kind === "town";
    if (town) {
      player.stamina = Math.min(player.stamMax, player.stamina + s.regenIdle * dt);
    } else if (running && !player.stamLock) {
      player.stamina = Math.max(0, player.stamina - s.drainPerSec * dt);
      if (player.stamina <= 0) { player.stamina = 0; player.stamLock = true; }
    } else if (player.gait === "walk" || player.moving) {
      player.stamina = Math.min(player.stamMax, player.stamina + s.regenWalk * dt);
    } else {
      player.stamina = Math.min(player.stamMax, player.stamina + s.regenIdle * dt);
    }
    if (player.stamLock && player.stamina >= player.stamMax * s.resumeFrac) player.stamLock = false;
    return player;
  }

  function topSpeed(moveSpeed, player) {
    var m = move();
    var e = (moveSpeed || 0) * m.runMul;
    if (player && player.slowT > 0) e *= m.slowMul;
    if (player && player.channel) e *= m.channelMul;
    return e;
  }
  function speeds(state) {
    var sheet = state && state.sheet, player = state && state.player;
    var run = topSpeed(sheet && sheet.moveSpeed, player);
    var m = move();
    return { run: run, walk: run * m.walkMul, move: sheet && sheet.moveSpeed, runMul: m.runMul, walkMul: m.walkMul };
  }
  function approach(vx, vy, tx, ty, dt) {
    var m = move();
    var sp = Math.hypot(vx, vy), ts = Math.hypot(tx, ty);
    var rate = ts > sp ? m.accel : m.decel;
    var dx = tx - vx, dy = ty - vy, d = Math.hypot(dx, dy);
    if (d <= rate * dt || d < 1e-6) return { vx: tx, vy: ty };
    return { vx: vx + dx / d * rate * dt, vy: vy + dy / d * rate * dt };
  }
  function gaitFromSpeed(ent, speed) {
    if (ent && ent.gait) return ent.gait;
    var m = move();
    if (!(speed > (m.idleSpeed || 0.25))) return "idle";
    return speed > (m.runAnimSpeed || 3.4) ? "run" : "walk";
  }

  root.ABFeel = {
    cfg, attack, hit, move, stamina, bootMove, affix,
    swingTime, skillSwing, recoveryMul, attackPeriod, strikeFrame, hitStopFor,
    itemRank, bootPct, bootImplicitAffix, affixMods, frwClamp,
    stamMax, ensure, tickStamina,
    topSpeed, speeds, approach, gaitFromSpeed
  };
})(typeof window !== "undefined" ? window : self);
