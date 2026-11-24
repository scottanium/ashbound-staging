// Unique signature effects. Listens on ABBus and writes numbers onto the
// item or hero for the existing combat/stat path to read. Combat resolution
// still goes through the hooked apply() (the game's D()).
(function (root) {
  "use strict";

  var hook = { apply: null, float: null, recalc: null };
  var fired = [];
  var bound = false;
  var styleDone = false;

  function data() {
    return root.ASHBOUND_DATA || {};
  }

  function table() {
    return data().uniqueEffects || {};
  }

  function types() {
    return table().types || [];
  }

  function typeDef(id) {
    if (!id) return null;
    var list = types();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function rarityId(item) {
    if (!item) return "epic";
    if (root.ABCraft && ABCraft.displayId) {
      var id = ABCraft.displayId(item);
      if (id) return id;
    }
    return item.tier || "epic";
  }

  function rankField(item, field, fallbackBag) {
    var id = rarityId(item);
    var def = root.ABCraft && ABCraft.rarityDef && ABCraft.rarityDef(id);
    if (def && def[field] != null) return def[field];
    var bag = fallbackBag || {};
    return bag[id] != null ? bag[id] : 1;
  }

  function rarityMul(item) {
    return rankField(item, "effectMul", table().rarityMul);
  }

  function statMul(item) {
    return rankField(item, "uniqueStatMul", table().statMul);
  }

  function curve() {
    return data().milestoneCurve || {};
  }

  function milestoneMul(level) {
    var c = curve();
    var cap = c.consumeCap || 20;
    var pkg = c.package != null ? c.package : 0.5;
    var n = Math.max(0, Math.min(cap, level || 0));
    if (!n) return 1;
    var weights = c.weights || { "5": 1, "10": 1.6, "15": 2.5, "20": 4 };
    var keys = Object.keys(weights).map(Number).sort(function (a, b) { return a - b; });
    var total = 0;
    for (var i = 0; i < keys.length; i++) total += weights[String(keys[i])] || 0;
    if (total <= 0) return 1;
    var between = c.betweenShare != null ? c.betweenShare : 0.4;
    var spike = c.spikeShare != null ? c.spikeShare : 0.6;
    var acc = 0;
    var prev = 0;
    for (var k = 0; k < keys.length; k++) {
      var at = keys[k];
      var w = (weights[String(at)] || 0) / total;
      if (n >= at) {
        acc += w;
        prev = at;
        continue;
      }
      var span = at - prev;
      var into = n - prev;
      if (span > 0 && into > 0) acc += w * between * (into / span);
      break;
    }
    // Full milestones include their spike share; the last completed one already added full w.
    // The definition "60% lands on the milestone, 40% drips" is already encoded by
    // giving the full weight once the milestone is reached, and only betweenShare
    // of the upcoming weight while climbing toward it.
    return 1 + pkg * acc;
  }

  function scaleVal(v, mul) {
    if (typeof v !== "number") return v;
    var s = v * mul;
    if (Math.abs(v - Math.round(v)) < 1e-9) return Math.round(s);
    return Math.round(s * 100) / 100;
  }

  function scaleNums(nums, item, typ) {
    var out = {};
    var keys = typ && typ.scale || ["damage", "absorb", "heal", "mana", "amount", "move", "ias", "duration", "absorbMax"];
    var mul = rarityMul(item) * milestoneMul(item && item.enchantLevel);
    var k, v;
    for (k in nums) {
      if (!Object.prototype.hasOwnProperty.call(nums, k)) continue;
      v = nums[k];
      out[k] = keys.indexOf(k) >= 0 ? scaleVal(v, mul) : v;
    }
    out._mul = mul;
    out._type = typ && typ.id;
    return out;
  }

  function uniqueDef(id) {
    var list = data().uniques || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function effectSpec(item) {
    if (item && item.effect) return item.effect;
    var def = item && item.uniqueId ? uniqueDef(item.uniqueId) : null;
    return def && def.effect || null;
  }

  function capstoneSpec(item) {
    if (!(item && (item.tier === "mythical" || rarityId(item) === "mythical"))) return null;
    if (item.capstone) return item.capstone;
    var def = item.uniqueId ? uniqueDef(item.uniqueId) : null;
    return def && def.capstone || null;
  }

  function resolved(item) {
    var spec = effectSpec(item);
    if (!spec || !spec.type) return null;
    var typ = typeDef(spec.type);
    if (!typ) return null;
    var nums = {};
    for (var k in spec) if (k !== "type" && k !== "id") nums[k] = spec[k];
    return { type: typ, nums: scaleNums(nums, item, typ), spec: spec, capstone: false };
  }

  function resolvedCapstone(item) {
    var spec = capstoneSpec(item);
    if (!spec || !spec.type) return null;
    var typ = typeDef(spec.type);
    if (!typ) return null;
    var nums = {};
    for (var k in spec) if (k !== "type" && k !== "id") nums[k] = spec[k];
    return { type: typ, nums: scaleNums(nums, item, typ), spec: spec, capstone: true };
  }

  function formatText(typ, nums) {
    var text = typ.text || typ.name || typ.id;
    return String(text).replace(/\{(\w+)\}/g, function (_, k) {
      return nums[k] != null ? nums[k] : "";
    });
  }

  function lineHtml(item, resolvedFx, cap) {
    if (!resolvedFx) return "";
    var typ = resolvedFx.type;
    var name = typ.name || typ.id;
    var body = formatText(typ, resolvedFx.nums);
    var cls = cap ? "unique-sig capstone" : "unique-sig";
    return '<div class="' + cls + '"><span class="unique-sig-name">' + esc(name) + "</span> " + esc(body) + "</div>";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function tooltipHtml(item) {
    if (!item || item.identified === false) return "";
    var a = resolved(item);
    var b = resolvedCapstone(item);
    var html = "";
    if (a) html += lineHtml(item, a, false);
    if (b) html += lineHtml(item, b, true);
    return html;
  }

  function ensureStyle() {
    if (styleDone || !root.document) return;
    styleDone = true;
    if (document.getElementById("ab-effects-style")) return;
    var fam = (data().rarityTable && data().rarityTable.families && data().rarityTable.families.unique) || {};
    var col = fam.color || "#ffd34d";
    var st = document.createElement("style");
    st.id = "ab-effects-style";
    st.textContent = ".unique-sig{color:" + col + ";font-weight:700;margin:3px 0 2px;line-height:1.3}.unique-sig-name{display:block;font-size:.92em}.unique-sig.capstone{text-shadow:0 0 6px " + col + "}";
    document.head.appendChild(st);
  }

  function equippedUniques(player) {
    var out = [], eq = player && player.equipment || {}, k, it;
    for (k in eq) {
      it = eq[k];
      if (it && (it.uniqueId || (it.rarity === "unique")) && it.identified !== false) out.push(it);
    }
    return out;
  }

  function effectsOn(item) {
    var list = [];
    var a = resolved(item);
    var b = resolvedCapstone(item);
    if (a) list.push(a);
    if (b) list.push(b);
    return list;
  }

  function skipPacket(payload) {
    var kind = payload && (payload.kind || (payload.packet && payload.packet.kind));
    return kind === "effect" || kind === "thorns" || kind === "dot" || kind === "lava";
  }

  function note(item, typ, nums, extra) {
    var rec = { type: typ.id, name: typ.name, item: item && (item.uniqueId || item.name), nums: nums, capstone: !!(extra && extra.capstone) };
    if (extra) for (var k in extra) rec[k] = extra[k];
    fired.push(rec);
    if (fired.length > 40) fired.shift();
    return rec;
  }

  function flash(state, typ, x, y) {
    if (!state) return;
    var color = typ.flash || "#ffd34d";
    if (state.effects) {
      state.effects.push({ type: "ring", x: x, y: y, radius: 1.15, t: 0.35, max: 0.35, color: color });
    }
    var p = state.player;
    if (p && Math.hypot((x || 0) - (p.x || 0), (y || 0) - (p.y || 0)) < 0.2) p.flash = Math.max(p.flash || 0, 0.22);
  }

  function applyHit(state, target, packet) {
    if (!hook.apply || !target || target.dead) return null;
    packet = packet || {};
    packet.kind = packet.kind || "effect";
    packet.source = packet.source || "player";
    if (packet.canMiss == null) packet.canMiss = false;
    if (packet.canCrit == null) packet.canCrit = false;
    if (packet.canLeech == null) packet.canLeech = false;
    return hook.apply(state, target, packet);
  }

  function near(state, x, y, radius, except) {
    var list = (state && state.world && state.world.monsters) || [];
    var out = [], i, m, r = radius || 1.4;
    for (i = 0; i < list.length; i++) {
      m = list[i];
      if (!m || m.dead || m === except) continue;
      if (Math.hypot((m.x || 0) - x, (m.y || 0) - y) <= r + (m.radius || 0.3)) out.push(m);
    }
    return out;
  }

  function elemPacket(element, damage) {
    var p = {};
    var el = element || "fire";
    if (el === "phys") p.phys = damage;
    else if (el === "cold") p.cold = damage;
    else if (el === "light" || el === "lightning") p.light = damage;
    else if (el === "poison") p.poison = damage;
    else p.fire = damage;
    return p;
  }

  function healHero(state, amount) {
    var p = state && state.player, sh = state && state.sheet;
    if (!p || !amount) return 0;
    var cap = sh && sh.life || p.hp;
    var before = p.hp || 0;
    p.hp = Math.min(cap, before + amount);
    return p.hp - before;
  }

  function manaHero(state, amount) {
    var p = state && state.player, sh = state && state.sheet;
    if (!p || !amount) return 0;
    var cap = sh && sh.mana || p.mana || 0;
    var before = p.mana || 0;
    p.mana = Math.min(cap, before + amount);
    return p.mana - before;
  }

  function addBuff(state, id, name, remaining, mods, absorb) {
    var p = state && state.player;
    if (!p) return;
    p.buffs = (p.buffs || []).filter(function (b) { return b.id !== id; });
    var b = { id: id, name: name, remaining: remaining, mods: mods || {} };
    if (absorb) { b.absorb = absorb; b.absorbMax = absorb; }
    p.buffs.push(b);
    if (hook.recalc) hook.recalc();
  }

  function chill(target, duration) {
    if (!target) return;
    target.slowT = Math.max(target.slowT || 0, duration || 2);
  }

  function nowT(state) {
    return (state && state.t) || (state && state.time) || Date.now() / 1000;
  }

  function onCooldown(item, key, state, cd) {
    if (!item) return true;
    item._fxCd = item._fxCd || {};
    var t = nowT(state);
    if ((item._fxCd[key] || 0) > t) return true;
    item._fxCd[key] = t + (cd || 0);
    return false;
  }

  function fireEffect(fx, event, payload, item) {
    var typ = fx.type, nums = fx.nums, state = payload.state, typId = typ.id;
    if (typ.trigger && typ.trigger !== event) return;
    if (event === "combat:hit" && skipPacket(payload)) return;
    var target = payload.target;
    var player = state && state.player;
    var rec;

    if (typId === "hit_burst") {
      if (payload.source && payload.source !== "player") return;
      var chance = nums.chance != null ? nums.chance : 100;
      if (!payload.force && Math.random() * 100 >= chance) return;
      var dmg = nums.damage || 0;
      var pkt = elemPacket(nums.element || "fire", dmg);
      var hits = 0;
      if (target) { applyHit(state, target, pkt); hits++; }
      if (nums.radius) {
        near(state, target ? target.x : player.x, target ? target.y : player.y, nums.radius, target).forEach(function (m) {
          applyHit(state, m, elemPacket(nums.element || "fire", dmg));
          hits++;
        });
      }
      rec = note(item, typ, nums, { hits: hits, amount: dmg, capstone: fx.capstone });
      flash(state, typ, target ? target.x : player.x, target ? target.y : player.y);
      return rec;
    }

    if (typId === "kill_explode") {
      if (!target) return;
      var dmg2 = nums.damage || 0;
      var n2 = 0;
      near(state, target.x, target.y, nums.radius || 1.6, target).forEach(function (m) {
        applyHit(state, m, elemPacket(nums.element || "fire", dmg2));
        n2++;
      });
      rec = note(item, typ, nums, { hits: n2, amount: dmg2, capstone: fx.capstone });
      flash(state, typ, target.x, target.y);
      return rec;
    }

    if (typId === "low_life_shield") {
      if (!player) return;
      var life = (state.sheet && state.sheet.life) || player.hp || 1;
      var pct = (player.hp / life) * 100;
      var need = nums.hpPct != null ? nums.hpPct : 35;
      if (pct > need && !payload.force) return;
      if (onCooldown(item, "low_life_shield", state, nums.cooldown || 12) && !payload.force) return;
      addBuff(state, "fx-shield-" + (item.uid || item.uniqueId), typ.name, nums.duration || 6, {}, nums.absorb || 0);
      rec = note(item, typ, nums, { absorb: nums.absorb, capstone: fx.capstone });
      flash(state, typ, player.x, player.y);
      return rec;
    }

    if (typId === "nth_strike") {
      if (payload.source && payload.source !== "player") return;
      item._strikes = (item._strikes || 0) + 1;
      var every = nums.every || 5;
      if (!payload.force && item._strikes % every !== 0) return;
      var d3 = nums.damage || 0;
      var chain = target ? [target] : [];
      if (nums.chains) {
        near(state, target ? target.x : player.x, target ? target.y : player.y, nums.radius || 2.2, target)
          .slice(0, nums.chains).forEach(function (m) { chain.push(m); });
      }
      chain.forEach(function (m) { applyHit(state, m, elemPacket(nums.element || "light", d3)); });
      rec = note(item, typ, nums, { hits: chain.length, amount: d3, capstone: fx.capstone });
      flash(state, typ, target ? target.x : player.x, target ? target.y : player.y);
      return rec;
    }

    if (typId === "freeze_attackers") {
      var src = payload.source;
      if (src && typeof src === "object") chill(src, nums.duration || 2);
      rec = note(item, typ, nums, { capstone: fx.capstone, chilled: !!(src && src.slowT) });
      flash(state, typ, player ? player.x : 0, player ? player.y : 0);
      return rec;
    }

    if (typId === "thorns_nova") {
      var d4 = nums.damage || 0;
      var src2 = payload.source && typeof payload.source === "object" ? payload.source : null;
      var n4 = 0;
      if (src2) { applyHit(state, src2, elemPacket(nums.element || "phys", d4)); n4++; }
      var ox = src2 ? src2.x : (player && player.x), oy = src2 ? src2.y : (player && player.y);
      near(state, ox, oy, nums.radius || 1.3, src2).forEach(function (m) {
        applyHit(state, m, elemPacket(nums.element || "phys", d4));
        n4++;
      });
      rec = note(item, typ, nums, { hits: n4, amount: d4, capstone: fx.capstone });
      flash(state, typ, player ? player.x : 0, player ? player.y : 0);
      return rec;
    }

    if (typId === "life_on_hit") {
      if (payload.source && payload.source !== "player") return;
      var healed = healHero(state, nums.heal || 0);
      rec = note(item, typ, nums, { healed: healed, capstone: fx.capstone });
      if (healed && hook.float && player) hook.float(state, player, "+" + Math.round(healed), "#9ddea0");
      return rec;
    }

    if (typId === "mana_on_kill") {
      var got = manaHero(state, nums.mana || 0);
      rec = note(item, typ, nums, { mana: got, capstone: fx.capstone });
      if (got && hook.float && player) hook.float(state, player, "+" + Math.round(got), "#7ea7ff");
      flash(state, typ, player ? player.x : 0, player ? player.y : 0);
      return rec;
    }

    if (typId === "haste_on_kill") {
      addBuff(state, "fx-haste-" + (item.uid || item.uniqueId), typ.name, nums.duration || 3, {
        frw: nums.move || 0,
        ias: nums.ias || 0
      });
      rec = note(item, typ, nums, { capstone: fx.capstone });
      flash(state, typ, player ? player.x : 0, player ? player.y : 0);
      return rec;
    }

    if (typId === "crit_ignite") {
      if (payload.source && payload.source !== "player") return;
      if (!payload.crit && !payload.force) return;
      var d5 = nums.damage || 0;
      if (target) applyHit(state, target, elemPacket("fire", d5));
      rec = note(item, typ, nums, { amount: d5, capstone: fx.capstone });
      flash(state, typ, target ? target.x : player.x, target ? target.y : player.y);
      return rec;
    }

    if (typId === "brand") {
      if (payload.source && payload.source !== "player") return;
      if (!target) return;
      target._brands = target._brands || {};
      var key = item.uid || item.uniqueId || typ.id;
      var stacks = (target._brands[key] || 0) + 1;
      var need = nums.stacks || 5;
      target._brands[key] = stacks;
      if (stacks < need && !payload.force) {
        rec = note(item, typ, nums, { stacks: stacks, burst: false, capstone: fx.capstone });
        return rec;
      }
      target._brands[key] = 0;
      var d6 = nums.damage || 0;
      applyHit(state, target, elemPacket(nums.element || "poison", d6));
      rec = note(item, typ, nums, { stacks: need, burst: true, amount: d6, capstone: fx.capstone });
      flash(state, typ, target.x, target.y);
      return rec;
    }

    if (typId === "frost_on_hit") {
      if (payload.source && payload.source !== "player") return;
      chill(target, nums.duration || 2);
      rec = note(item, typ, nums, { capstone: fx.capstone, chilled: !!(target && target.slowT) });
      return rec;
    }

    if (typId === "execute") {
      if (payload.source && payload.source !== "player") return;
      if (!target) return;
      var maxHp = target.life || target.hpMax || target.maxHp || target.hp || 1;
      var hpPctNow = (target.hp / maxHp) * 100;
      var line = nums.hpPct != null ? nums.hpPct : 30;
      if (hpPctNow > line && !payload.force) return;
      var d7 = nums.damage || 0;
      applyHit(state, target, elemPacket(nums.element || "phys", d7));
      rec = note(item, typ, nums, { amount: d7, capstone: fx.capstone });
      flash(state, typ, target.x, target.y);
      return rec;
    }

    if (typId === "ward_on_hit") {
      if (payload.source && payload.source !== "player") return;
      var id = "fx-ward-" + (item.uid || item.uniqueId);
      var have = 0;
      (player && player.buffs || []).forEach(function (b) { if (b.id === id) have = b.absorb || 0; });
      var add = nums.absorb || 0;
      var capA = nums.absorbMax != null ? nums.absorbMax : add * 3;
      var next = Math.min(capA, have + add);
      addBuff(state, id, typ.name, nums.duration || 6, {}, next);
      rec = note(item, typ, nums, { absorb: next, capstone: fx.capstone });
      return rec;
    }

    if (typId === "life_on_kill") {
      var healed2 = healHero(state, nums.heal || 0);
      rec = note(item, typ, nums, { healed: healed2, capstone: fx.capstone });
      if (healed2 && hook.float && player) hook.float(state, player, "+" + Math.round(healed2), "#9ddea0");
      flash(state, typ, player ? player.x : 0, player ? player.y : 0);
      return rec;
    }
  }

  function handle(event, payload) {
    payload = payload || {};
    var state = payload.state;
    if (!state || !state.player) return [];
    var out = [], items = equippedUniques(state.player), i, j, list, got;
    for (i = 0; i < items.length; i++) {
      list = effectsOn(items[i]);
      for (j = 0; j < list.length; j++) {
        got = fireEffect(list[j], event, payload, items[i]);
        if (got) out.push(got);
      }
    }
    return out;
  }

  function onHit(p) { handle("combat:hit", p); }
  function onKilled(p) { handle("combat:killed", p); }
  function onHurt(p) { handle("combat:playerHurt", p); }

  function bindBus() {
    if (bound || !root.ABBus) return;
    bound = true;
    ABBus.on("combat:hit", onHit);
    ABBus.on("combat:killed", onKilled);
    ABBus.on("combat:playerHurt", onHurt);
  }

  function attach(api) {
    hook.apply = api && api.apply || hook.apply;
    hook.float = api && api.float || hook.float;
    hook.recalc = api && api.recalc || hook.recalc;
    bindBus();
    ensureStyle();
    return root.ABEffects;
  }

  function scaleMods(mods, mul) {
    if (!mods || mul == null || mul === 1) {
      if (!mods) return mods;
      // still clone
    }
    function walk(v, key) {
      if (key === "skills") return v;
      if (typeof v === "number") return scaleVal(v, mul);
      if (Array.isArray(v)) return v.map(function (x) { return typeof x === "number" ? scaleVal(x, mul) : x; });
      if (v && typeof v === "object") {
        var o = {}, k;
        for (k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = walk(v[k], k);
        return o;
      }
      return v;
    }
    return walk(mods, "");
  }

  root.ABEffects = {
    attach: attach,
    handle: handle,
    tooltipHtml: tooltipHtml,
    resolved: resolved,
    resolvedCapstone: resolvedCapstone,
    rarityMul: rarityMul,
    statMul: statMul,
    milestoneMul: milestoneMul,
    typeDef: typeDef,
    types: types,
    formatText: formatText,
    scaleMods: scaleMods,
    equipped: equippedUniques,
    fired: function () { return fired.slice(); },
    lastFired: function () { return fired.length ? fired[fired.length - 1] : null; },
    clearFired: function () { fired = []; },
    bindBus: bindBus
  };

  if (root.ABBus) bindBus();
  if (root.document) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureStyle);
    else ensureStyle();
  }
})(typeof window !== "undefined" ? window : self);
