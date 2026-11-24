// Phase A craft/rarity helpers. Combat, AI, and render do not import this.
// Looks up ASHBOUND_DATA at call time (data may still be loading when this file parses).
(function (root) {
  function gearIds() {
    const list = ranks();
    return list.length ? list.map((r) => r.id) : ["common", "magic", "rare", "elite", "epic", "legendary", "fabled", "mythical"];
  }

  function currencyIds() {
    const table = data().rarityTable || {};
    const list = table.currency;
    if (Array.isArray(list) && list.length) return list;
    return ["rune", "gem", "potion", "gold", "lens"];
  }

  function data() {
    return root.ASHBOUND_DATA || root.ABDATA || {};
  }

  function ranks() {
    const table = data().rarityTable || data().rarityRanks;
    if (table && Array.isArray(table.ranks)) return table.ranks;
    if (Array.isArray(table)) return table;
    return [];
  }

  function strings() {
    const table = data().rarityTable;
    return (table && table.strings) || {};
  }

  function rarityDef(id) {
    if (!id) return null;
    const list = ranks();
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function affixCount(id) {
    const def = rarityDef(id);
    return def && def.affixCount != null ? def.affixCount : 0;
  }

  function isUnique(item) {
    return !!(item && (item.uniqueId || item.rarity === "unique"));
  }

  function isSet(item) {
    return !!(item && (item.setId || item.setItemId || item.rarity === "set"));
  }

  function isCurrency(item) {
    const ids = currencyIds();
    return !!(item && item.rarity && ids.indexOf(item.rarity) >= 0);
  }

  function uniqueDef(id) {
    const list = data().uniques || [];
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function setItemDef(id) {
    const list = data().setItems || [];
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function baseRarityFor(item) {
    if (!item || isCurrency(item) || item.charm) return null;
    if (item.uniqueId) {
      const def = uniqueDef(item.uniqueId);
      return (def && def.baseRarity) || "epic";
    }
    if (item.setItemId || item.setId) {
      const def = setItemDef(item.setItemId);
      if (def && def.baseRarity) return def.baseRarity;
      const bonuses = data().setBonuses || {};
      const setDef = item.setId && bonuses[item.setId];
      return (setDef && setDef.baseRarity) || "epic";
    }
    if (item.rarity === "unique") return "epic";
    if (item.rarity === "set") return "epic";
    if (gearIds().indexOf(item.rarity) >= 0) return item.rarity;
    return null;
  }

  function displayId(item) {
    if (!item) return "common";
    if (isCurrency(item)) return item.rarity;
    if (item.tier && rarityDef(item.tier)) return item.tier;
    const floor = baseRarityFor(item);
    if (floor && (isUnique(item) || isSet(item))) return floor;
    if (gearIds().indexOf(item.rarity) >= 0) return item.rarity;
    return "common";
  }

  function format(template, vars) {
    return String(template || "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ""));
  }

  function rankLabel(item) {
    const id = displayId(item);
    const def = rarityDef(id);
    if (!def) return "";
    const s = strings();
    return format(s.rankLabel || "Rank {n} {name}", { n: def.rank, name: def.name });
  }

  function floorLabel(item) {
    if (!isUnique(item) && !isSet(item)) return "";
    const floor = baseRarityFor(item);
    const def = rarityDef(floor);
    if (!def) return "";
    const s = strings();
    return format(s.floorLabel || "Floor: {name}", { name: def.name });
  }

  function kindLabel(item) {
    const s = strings();
    if (isUnique(item)) return s.uniqueKind || "Unique";
    if (isSet(item)) return s.setKind || "Set";
    return "";
  }

  function color(itemOrId) {
    const id = typeof itemOrId === "string" ? itemOrId : displayId(itemOrId);
    const def = rarityDef(id);
    if (def && def.color) return def.color;
    if (itemOrId && typeof itemOrId === "object" && itemOrId.rarity) {
      const cur = rarityDef(itemOrId.rarity);
      if (cur && cur.color) return cur.color;
    }
    return "#e6dece";
  }

  function outline(itemOrId) {
    const id = typeof itemOrId === "string" ? itemOrId : displayId(itemOrId);
    const def = rarityDef(id);
    if (def) return def.outline || def.border || def.color || "#e6dece";
    return color(itemOrId);
  }

  function families() {
    const table = data().rarityTable || {};
    return table.families || {};
  }

  function family(item) {
    if (isUnique(item)) return "unique";
    if (isSet(item)) return "set";
    return "normal";
  }

  function familyDef(itemOrId) {
    const id = typeof itemOrId === "string" ? itemOrId : family(itemOrId);
    const bag = families();
    return bag[id] || bag.normal || null;
  }

  function cssClass(item) {
    if (!item) return "rar-common";
    if (isCurrency(item)) return "rar-" + item.rarity;
    const id = displayId(item);
    let cls = "rar-" + (rarityDef(id) ? id : (item.rarity || "common"));
    if (isSet(item)) cls += " family-set";
    else if (isUnique(item)) cls += " family-unique";
    return cls;
  }

  function pip(item) {
    if (!item || isCurrency(item) || item.charm) return null;
    const def = rarityDef(displayId(item));
    if (!def) return null;
    return {
      letter: String(def.letter || def.rank),
      shape: def.pip || "circle",
      title: rankLabel(item),
      color: def.color
    };
  }

  function goldMul(item) {
    const table = data().rarityTable;
    const def = rarityDef(displayId(item));
    if (def && def.goldMul != null) return def.goldMul;
    const legacy = (table && table.legacyGold) || {};
    if (item && legacy[item.rarity] != null) return legacy[item.rarity];
    return 1;
  }

  function stampTier(item) {
    if (!item || isCurrency(item) || item.charm) return item;
    if (isUnique(item) || isSet(item)) {
      const floor = baseRarityFor(item) || "epic";
      const cur = item.tier && rarityDef(item.tier) ? item.tier : null;
      const curRank = cur && rarityDef(cur) ? (rarityDef(cur).rank || 0) : 0;
      const floorRank = rarityDef(floor) ? (rarityDef(floor).rank || 0) : 0;
      if (!cur || curRank < floorRank) item.tier = floor;
    } else if (gearIds().indexOf(item.rarity) >= 0) item.tier = item.rarity;
    return item;
  }


  function uniqueStatMul(item) {
    if (root.ABEffects && ABEffects.statMul) return ABEffects.statMul(item);
    return 1;
  }

  function scaleUnique(item) {
    if (!item || !isUnique(item)) return item;
    const def = item.uniqueId ? uniqueDef(item.uniqueId) : null;
    if (!def || !def.mods) return item;
    const mul = uniqueStatMul(item);
    if (root.ABEffects && ABEffects.scaleMods) item.fixedMods = ABEffects.scaleMods(def.mods, mul);
    else item.fixedMods = def.mods;
    item.uniqueStatMul = mul;
    if (def.effect && !item.effect) item.effect = def.effect;
    if (def.capstone && !item.capstone) item.capstone = def.capstone;
    return item;
  }

  function migrateItem(item) {
    if (!item) return item;
    if (isCurrency(item) || item.charm) return item;
    if (isUnique(item) && isSet(item)) {
      delete item.setId;
      delete item.setItemId;
      if (item.rarity === "set") item.rarity = "unique";
      const def = item.uniqueId ? uniqueDef(item.uniqueId) : null;
      if (def) {
        if (def.name) item.name = def.name;
        if (def.mods) item.fixedMods = def.mods;
        if (def.flavor != null) item.flavor = def.flavor;
      }
    }
    if (item.enchantLevel == null) item.enchantLevel = 0;
    if (item.itemLevel == null) item.itemLevel = 0;
    if (item.consumeLevel == null) item.consumeLevel = 0;
    if (item.consumeXp == null) item.consumeXp = 0;
    if (item.dormant == null) item.dormant = false;
    stampTier(item);
    if (isUnique(item)) scaleUnique(item);
    const cap = affixCount(item.tier || displayId(item));
    const n = (item.affixes && item.affixes.length) || 0;
    if (!isUnique(item) && !isSet(item) && n > cap) item.legacyAffixes = true;
    return item;
  }

  function walkItems(list, fn) {
    if (!list) return;
    if (Array.isArray(list)) {
      for (let i = 0; i < list.length; i++) fn(list[i]);
      return;
    }
    const keys = Object.keys(list);
    for (let i = 0; i < keys.length; i++) fn(list[keys[i]]);
  }

  function migrateAllItems(player, world) {
    if (player) {
      walkItems(player.inventory && player.inventory.items, migrateItem);
      walkItems(player.stash && player.stash.items, migrateItem);
      walkItems(player.cube && player.cube.items, migrateItem);
      walkItems(player.equipment, migrateItem);
      walkItems(player.belt, migrateItem);
      if (player.hireling && player.hireling.equipment) walkItems(player.hireling.equipment, migrateItem);
      if (player.companions) {
        for (let i = 0; i < player.companions.length; i++) {
          const c = player.companions[i];
          if (c && c.equipment) walkItems(c.equipment, migrateItem);
        }
      }
    }
    if (world && world.loots) walkItems(world.loots, migrateItem);
  }

  function migrateSave(dto) {
    if (!dto) return dto;
    if (dto.player) ensurePlayer(dto.player);
    migrateAllItems(dto.player, dto.world);
    if (dto.player && dto.player.consume) migrateItem(dto.player.consume);
    dto.v = 5;
    return dto;
  }

  function migrateShared(bag) {
    if (!bag) return bag;
    walkItems(bag.items, migrateItem);
    bag.v = 5;
    return bag;
  }


  function consumeCfg() {
    return data().consume || {};
  }

  function milestones() {
    return data().milestones || data().milestoneCurve || {};
  }

  function setTable() {
    return data().setDefs || data().sets || {};
  }

  function setDef(id) {
    if (!id) return null;
    const table = setTable();
    if (table && table.sets && table.sets[id]) return table.sets[id];
    const bonuses = data().setBonuses || {};
    return bonuses[id] || null;
  }

  function milestoneMul(level) {
    if (root.ABEffects && ABEffects.milestoneMul) return ABEffects.milestoneMul(level);
    const c = milestones();
    const cap = c.consumeCap || 20;
    const pkg = c.package != null ? c.package : 0.5;
    const n = Math.max(0, Math.min(cap, level || 0));
    if (!n) return 1;
    const weights = c.weights || { "5": 1, "10": 1.6, "15": 2.5, "20": 4 };
    const keys = Object.keys(weights).map(Number).sort((a, b) => a - b);
    let total = 0;
    for (let i = 0; i < keys.length; i++) total += weights[String(keys[i])] || 0;
    if (total <= 0) return 1;
    const between = c.betweenShare != null ? c.betweenShare : 0.4;
    let acc = 0;
    let prev = 0;
    for (let k = 0; k < keys.length; k++) {
      const at = keys[k];
      const w = (weights[String(at)] || 0) / total;
      if (n >= at) {
        acc += w;
        prev = at;
        continue;
      }
      const span = at - prev;
      const into = n - prev;
      if (span > 0 && into > 0) acc += w * between * (into / span);
      break;
    }
    return 1 + pkg * acc;
  }

  function majorSlots() {
    const list = consumeCfg().majorSlots;
    return Array.isArray(list) && list.length ? list : ["weapon", "armor", "helm", "offhand"];
  }

  function isMajorSlot(slot) {
    return majorSlots().indexOf(slot) >= 0;
  }

  function matDef(id) {
    const mats = (consumeCfg().materials || {});
    return mats[id] || null;
  }

  function isBoundMat(item) {
    if (!item) return false;
    if (item.bound) return true;
    const def = item.matId ? matDef(item.matId) : null;
    return !!(def && def.bound);
  }

  function makeMat(id, qty) {
    const def = matDef(id);
    if (!def) return null;
    const n = qty == null ? 1 : qty;
    return {
      uid: "mat" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      rarity: def.rarity || "material",
      matId: def.id,
      name: def.name,
      flavor: def.flavor || "",
      bound: !!def.bound,
      amount: n,
      w: def.w || 1,
      h: def.h || 1,
      ilvl: 1,
      identified: true,
      slot: null
    };
  }

  function consumePieceId(setId) {
    const def = setDef(setId);
    return (def && (def.consumePiece || def.consume)) || null;
  }

  function isConsumePiece(item) {
    if (!item) return false;
    const sid = item.setId;
    if (!sid) return false;
    const pid = consumePieceId(sid);
    if (!pid) return false;
    return item.setItemId === pid || item.id === pid || item.uniqueId === pid;
  }

  function itemSlot(item) {
    if (!item) return null;
    if (item.slot) return item.slot;
    const bases = data().itemBases || [];
    const bid = item.baseId;
    for (let i = 0; i < bases.length; i++) if (bases[i].id === bid) return bases[i].slot;
    return null;
  }

  function canConsume(item, player, opts) {
    opts = opts || {};
    if (!item) return { ok: false, reason: "Pick an item first." };
    const slot = itemSlot(item);
    const jewelry = (consumeCfg().jewelrySlots || ["ring", "amulet"]);
    if (jewelry.indexOf(slot) >= 0) return { ok: false, reason: "Jewelry cannot go in the consume slot." };
    if (!isMajorSlot(slot)) return { ok: false, reason: "Only a weapon, chest, helm, or shield can be consumed." };
    const uniqueOk = isUnique(item);
    const setOk = isConsumePiece(item);
    if (!uniqueOk && !setOk) return { ok: false, reason: "Only a unique, or a set's designated consume piece, can go here." };
    if (item.dormant && !opts.awakening) return { ok: false, reason: "That unique is dormant. Awaken it with Wake-Oil first." };
    if (player && player.consume && player.consume.uid && player.consume.uid !== item.uid) {
      return { ok: false, reason: "The consume slot already holds a unique." };
    }
    if (player && remnantOf(player, uniqueKey(item)) && !(player.consume && player.consume.uid === item.uid)) {
      // remnant of this unique is fine if we are putting the same unique back; otherwise block double
    }
    return { ok: true, slot: slot };
  }

  function uniqueKey(item) {
    if (!item) return null;
    return item.uniqueId || (isConsumePiece(item) ? (item.setItemId || item.id) : null) || item.setItemId || null;
  }

  function remnantOf(player, key) {
    if (!player || !key) return null;
    const list = player.remnants || [];
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].uniqueId === key) return list[i];
    return null;
  }

  function remnantList(player) {
    return (player && player.remnants) || [];
  }

  function remnantActive(player, key) {
    if (!player || !key) return false;
    const rec = remnantOf(player, key);
    if (!rec) return false;
    const cur = player.consume;
    if (cur && uniqueKey(cur) === key && !cur.dormant) return false;
    return rec.on !== false;
  }

  function scaleModBag(mods, mul, skip) {
    if (!mods || mul === 1) return mods ? JSON.parse(JSON.stringify(mods)) : mods;
    const out = {};
    const skipKeys = skip || { skills: 1 };
    for (const k of Object.keys(mods)) {
      const v = mods[k];
      if (skipKeys[k]) {
        out[k] = typeof v === "object" && v && !Array.isArray(v) ? Object.assign({}, v) : v;
        continue;
      }
      if (typeof v === "number") {
        const s = v * mul;
        out[k] = Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(s) : Math.round(s * 100) / 100;
      } else if (Array.isArray(v)) {
        out[k] = v.map((n) => (typeof n === "number" ? (Math.abs(n - Math.round(n)) < 1e-9 ? Math.round(n * mul) : Math.round(n * mul * 100) / 100) : n));
      } else if (v && typeof v === "object") {
        out[k] = scaleModBag(v, mul, skip);
      } else out[k] = v;
    }
    return out;
  }

  function mergeMods(dst, src) {
    if (!src) return dst;
    dst = dst || {};
    for (const k of Object.keys(src)) {
      const v = src[k];
      if (v && typeof v === "object" && !Array.isArray(v)) dst[k] = mergeMods(dst[k] || {}, v);
      else if (Array.isArray(v)) {
        const cur = Array.isArray(dst[k]) ? dst[k] : [dst[k] || 0, dst[k] || 0];
        dst[k] = [(cur[0] || 0) + (v[0] || 0), (cur[1] || 0) + (v[1] || 0)];
      } else if (typeof v === "number") dst[k] = (dst[k] || 0) + v;
      else if (dst[k] == null) dst[k] = v;
    }
    return dst;
  }

  function uniqueBaseMods(item) {
    if (!item) return {};
    if (item.uniqueId) {
      const def = uniqueDef(item.uniqueId);
      if (def && def.mods) return def.mods;
    }
    if (item.setItemId) {
      const def = setItemDef(item.setItemId);
      if (def && def.mods) return def.mods;
    }
    return item.fixedMods || item.mods || {};
  }

  function consumePackageMul(item) {
    if (!item) return 1;
    return milestoneMul(item.consumeLevel || 0);
  }

  function isConsumedNow(item, player) {
    return !!(item && player && player.consume && player.consume.uid === item.uid && !item.dormant);
  }

  const _scaleUniqueOrig = scaleUnique;
  function scaleUniqueWithConsume(item, player) {
    if (!item) return item;
    const unique = isUnique(item);
    const piece = isConsumePiece(item);
    if (unique) _scaleUniqueOrig(item);
    else if (piece) {
      const defMods = uniqueBaseMods(item);
      const mul = uniqueStatMul(item);
      if (root.ABEffects && ABEffects.scaleMods) item.fixedMods = ABEffects.scaleMods(defMods, mul);
      else item.fixedMods = scaleModBag(defMods, mul);
      item.uniqueStatMul = mul;
    } else return item;
    const armed = player ? isConsumedNow(item, player) : (item._consumeArmed && !item.dormant);
    if (armed) {
      const cm = consumePackageMul(item);
      if (cm !== 1 && item.fixedMods) item.fixedMods = scaleModBag(item.fixedMods, cm);
      item.consumeMul = cm;
    } else {
      item.consumeMul = 1;
    }
    return item;
  }

  function setAverageRank(items) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return 5;
    let sum = 0, n = 0;
    for (let i = 0; i < list.length; i++) {
      const id = displayId(list[i]);
      const def = rarityDef(id);
      const rank = def && def.rank != null ? def.rank : 5;
      sum += rank;
      n += 1;
    }
    return n ? sum / n : 5;
  }

  function setRankMul(avgRank) {
    const table = setTable();
    const bag = (table && table.setAverageMuls) || { "5": 1, "6": 1.15, "7": 1.3, "8": 1.5 };
    const r = Math.max(5, Math.min(8, avgRank == null ? 5 : avgRank));
    const lo = Math.floor(r);
    const hi = Math.ceil(r);
    const a = bag[String(lo)] != null ? bag[String(lo)] : 1;
    const b = bag[String(hi)] != null ? bag[String(hi)] : a;
    if (hi === lo) return a;
    return a + (b - a) * (r - lo);
  }

  function sixWornDormantOn() {
    const table = data().rarityTable || {};
    if (table.setSixWornDormant === false) return false;
    return true;
  }

  function setAwakened(setId, player, wornItems) {
    const pid = consumePieceId(setId);
    if (!pid) return false;
    const cur = player && player.consume;
    if (!cur || cur.dormant) return false;
    const key = uniqueKey(cur);
    if (cur.setId !== setId && key !== pid && cur.setItemId !== pid) return false;
    return !cur.dormant && (cur.setId === setId || key === pid || cur.setItemId === pid);
  }

  function wornSetItems(equipment, player) {
    const out = [];
    const seen = {};
    function add(it) {
      if (!it || !it.setId) return;
      const sid = it.setItemId || it.uid || uniqueKey(it);
      const k = it.setId + ":" + sid;
      if (seen[k]) return;
      seen[k] = true;
      out.push(it);
    }
    const eq = equipment || (player && player.equipment) || {};
    const keys = Object.keys(eq);
    for (let i = 0; i < keys.length; i++) add(eq[keys[i]]);
    if (player && player.consume) add(player.consume);
    return out;
  }

  function scaleSetBonus(bonus, averageRank, awakened) {
    if (!bonus) return { mods: {}, text: "", active: false };
    const dormantMul = (consumeCfg().dormantSetMul != null ? consumeCfg().dormantSetMul : 0.25);
    const rankMul = setRankMul(averageRank);
    const bodyMul = (awakened ? 1 : dormantMul) * rankMul;
    const base = bonus.mods || {};
    // Stored numbers are dormant-scale (what a 2/3 piece set already gave). Awakened multiplies by 1/dormantMul.
    const awakenMul = awakened ? (1 / dormantMul) : 1;
    const mods = scaleModBag(base, awakenMul * rankMul);
    let text = bonus.text || "";
    if (awakened && bonus.textAwakened) text = bonus.textAwakened;
    else if (!awakened && bonus.textDormant) text = bonus.textDormant;
    else {
      const textMul = awakenMul * rankMul;
      if (textMul !== 1) text = scaleBonusText(text, textMul);
      if (awakened && text && text.indexOf("(awakened)") < 0) text = text + " (awakened)";
    }
    return { mods: mods, text: text, mul: awakenMul * rankMul, rankMul: rankMul, awakened: !!awakened, count: bonus.count };
  }

  function scaleBonusText(text, mul) {
    if (!text || mul == null || mul === 1) return text || "";
    return String(text).replace(/([+-]?)(\d+)(\s*%)?/g, function (full, sign, num, pct, offset, src) {
      const after = src.slice(offset + full.length);
      if (/^\s*to\s+[A-Z]/.test(after)) return full;
      const v = Math.round(Number(num) * mul);
      return (sign || "") + v + (pct || "");
    });
  }

  function setBonuses(equipment, player, hooks) {
    hooks = hooks || {};
    const items = wornSetItems(equipment, player);
    const counts = {};
    const bySet = {};
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || !it.setId) continue;
      counts[it.setId] = (counts[it.setId] || 0) + 1;
      (bySet[it.setId] = bySet[it.setId] || []).push(it);
    }
    const detail = [];
    let mods = hooks.zero ? hooks.zero() : {};
    const add = hooks.add || mergeMods;
    const fromMods = hooks.fromMods || function (m) { return m; };
    const ids = Object.keys(counts);
    for (let s = 0; s < ids.length; s++) {
      const sid = ids[s];
      const def = setDef(sid) || (data().setBonuses || {})[sid];
      if (!def) continue;
      const worn = bySet[sid];
      const n = counts[sid];
      const avg = setAverageRank(worn);
      const awakened = setAwakened(sid, player, worn);
      const list = def.bonuses || [];
      for (let b = 0; b < list.length; b++) {
        const row = list[b];
        const on = n >= (row.count || 0);
        const scaled = scaleSetBonus(row, avg, awakened && on);
        const text = (row.count || 0) + " pieces: " + (scaled.text || "");
        detail.push({
          setId: sid,
          name: def.name,
          text: text,
          active: on,
          awakened: !!(awakened && on),
          dormant: on && !awakened,
          count: row.count,
          worn: n
        });
        if (on) {
          if (hooks.add && hooks.fromMods) hooks.add(mods, hooks.fromMods(scaled.mods));
          else mods = mergeMods(mods, scaled.mods);
        }
      }
    }
    return { mods: mods, detail: detail, counts: counts };
  }

  function remnantMods(player) {
    const out = {};
    const list = remnantList(player);
    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      if (!rec || !remnantActive(player, rec.uniqueId)) continue;
      mergeMods(out, rec.mods || {});
    }
    return out;
  }

  function buildRemnant(item) {
    const key = uniqueKey(item);
    if (!key) return null;
    const mul = consumeCfg().remnantMul != null ? consumeCfg().remnantMul : 0.12;
    const base = uniqueBaseMods(item);
    const rarity = (root.ABEffects && ABEffects.statMul) ? ABEffects.statMul(item) : uniqueStatMul(item);
    // Remnant is a crumb of the *unconsumed* unique lines, never the proc.
    const mods = scaleModBag(base, mul * (rarity || 1), { skills: 1 });
    return {
      uniqueId: key,
      setId: item.setId || null,
      name: item.name || key,
      consumeLevel: item.consumeLevel || 0,
      mods: mods,
      on: true
    };
  }

  function countMat(player, id) {
    let n = 0;
    const grids = [];
    if (player && player.inventory) grids.push(player.inventory.items || []);
    if (player && player.stash) grids.push(player.stash.items || []);
    for (let g = 0; g < grids.length; g++) {
      for (let i = 0; i < grids[g].length; i++) {
        const it = grids[g][i];
        if (it && it.matId === id) n += it.amount || 1;
      }
    }
    return n;
  }

  function spendMat(player, id, amount, hooks) {
    let need = amount || 1;
    const grids = [];
    if (player && player.inventory) grids.push(player.inventory);
    if (player && player.stash) grids.push(player.stash);
    for (let g = 0; g < grids.length && need > 0; g++) {
      const items = grids[g].items || [];
      for (let i = items.length - 1; i >= 0 && need > 0; i--) {
        const it = items[i];
        if (!it || it.matId !== id) continue;
        const have = it.amount || 1;
        if (have > need) {
          it.amount = have - need;
          need = 0;
        } else {
          need -= have;
          if (hooks && hooks.remove) hooks.remove(grids[g], it.uid);
          else items.splice(i, 1);
        }
      }
    }
    return need <= 0;
  }

  function ensurePlayer(player) {
    if (!player) return player;
    if (!player.remnants) player.remnants = [];
    if (player.consumeUnlocked == null) player.consumeUnlocked = false;
    if (player.craftingLevel == null) player.craftingLevel = 1;
    if (player.consume === undefined) player.consume = null;
    player.progress = player.progress || {};
    player.progress.seen = player.progress.seen || {};
    return player;
  }

  function accountRecipes(bag) {
    if (!bag) return {};
    bag.recipes = bag.recipes || {};
    return bag.recipes;
  }

  function learnRecipe(bag, id) {
    const rec = accountRecipes(bag);
    if (id) rec[id] = true;
    return rec;
  }

  function hasRecipe(bag, id) {
    const rec = accountRecipes(bag);
    return !!(id && rec[id]);
  }

  function unlockConsume(player, opts) {
    opts = opts || {};
    ensurePlayer(player);
    if (player.consumeUnlocked) return { ok: true, already: true };
    const u = consumeCfg().unlock || {};
    const needLv = u.craftingLevel || 6;
    if (!opts.force && (player.craftingLevel || 1) < needLv) {
      return { ok: false, reason: "The consume recipe is learned at crafting level " + needLv + "." };
    }
    if (!opts.force && u.gold && (player.gold || 0) < u.gold) {
      return { ok: false, reason: "Not enough gold." };
    }
    const mats = u.mats || { heart_cinder: 1 };
    if (!opts.force) {
      const ids = Object.keys(mats);
      for (let i = 0; i < ids.length; i++) {
        if (countMat(player, ids[i]) < (mats[ids[i]] || 1)) {
          return { ok: false, reason: "This craft needs " + ((matDef(ids[i]) && matDef(ids[i]).name) || ids[i]) + "." };
        }
      }
      if (u.gold) player.gold = (player.gold || 0) - u.gold;
      for (let i = 0; i < ids.length; i++) spendMat(player, ids[i], mats[ids[i]] || 1, opts);
    }
    player.consumeUnlocked = true;
    if (opts.recipes) learnRecipe(opts.recipes, (u.recipeId || "consume_slot"));
    if (opts.recipes && opts.saveRecipes) opts.saveRecipes(opts.recipes);
    return { ok: true };
  }

  function findAndTake(player, uid, hooks) {
    if (player.consume && player.consume.uid === uid) {
      const it = player.consume;
      player.consume = null;
      return { item: it, where: "consume" };
    }
    const grids = [];
    if (player.inventory) grids.push(["inventory", player.inventory]);
    if (player.stash) grids.push(["stash", player.stash]);
    if (player.cube) grids.push(["cube", player.cube]);
    for (let g = 0; g < grids.length; g++) {
      const items = grids[g][1].items || [];
      for (let i = 0; i < items.length; i++) {
        if (items[i] && items[i].uid === uid) {
          const it = items[i];
          if (hooks && hooks.remove) hooks.remove(grids[g][1], uid);
          else items.splice(i, 1);
          return { item: it, where: grids[g][0] };
        }
      }
    }
    if (player.equipment) {
      const keys = Object.keys(player.equipment);
      for (let i = 0; i < keys.length; i++) {
        const it = player.equipment[keys[i]];
        if (it && it.uid === uid) {
          player.equipment[keys[i]] = null;
          return { item: it, where: "equip", slot: keys[i] };
        }
      }
    }
    return null;
  }

  function giveBack(player, item, hooks) {
    if (!item) return false;
    if (hooks && hooks.give) return !!hooks.give(item);
    const grids = [player.inventory, player.stash];
    for (let i = 0; i < grids.length; i++) {
      if (!grids[i] || !grids[i].items) continue;
      if (typeof hooks !== "undefined" && hooks && hooks.insert) {
        if (hooks.insert(grids[i], item)) return true;
      } else {
        item.x = item.x || 0;
        item.y = item.y || 0;
        grids[i].items.push(item);
        return true;
      }
    }
    return false;
  }

  function consumeInto(player, item, opts) {
    opts = opts || {};
    ensurePlayer(player);
    if (!player.consumeUnlocked && !opts.force) {
      return { ok: false, reason: "The consume slot is still locked." };
    }
    const check = canConsume(item, player, opts);
    if (!check.ok) return check;
    const key = uniqueKey(item);
    if (player.consume && player.consume.uid !== item.uid) {
      return { ok: false, reason: "The consume slot already holds a unique." };
    }
    if (item.dormant && !opts.awakening) {
      return { ok: false, reason: "That unique is dormant. Awaken it with Wake-Oil first." };
    }
    const taken = opts.alreadyTaken ? { item: item } : findAndTake(player, item.uid, opts);
    const held = taken && taken.item ? taken.item : item;
    held.consumeLevel = held.consumeLevel || 0;
    held.consumeXp = held.consumeXp || 0;
    held.dormant = false;
    player.consume = held;
    const rem = remnantOf(player, key);
    if (rem) rem.on = false;
    if (opts.scale !== false) scaleUniqueWithConsume(held, player);
    return { ok: true, item: held };
  }

  function setConsumeLevel(player, level, opts) {
    opts = opts || {};
    ensurePlayer(player);
    const item = player.consume;
    if (!item) return { ok: false, reason: "Nothing is in the consume slot." };
    const cap = consumeCfg().cap || 20;
    const n = Math.max(0, Math.min(cap, level == null ? 0 : level));
    item.consumeLevel = n;
    if (n >= cap) item.consumeXp = 0;
    if (opts.scale !== false) scaleUniqueWithConsume(item, player);
    return { ok: true, item: item, level: n };
  }

  function sleepConsume(player, opts) {
    opts = opts || {};
    ensurePlayer(player);
    const item = player.consume;
    if (!item) return { ok: false, reason: "Nothing is in the consume slot." };
    const cap = consumeCfg().cap || 20;
    if (consumeCfg().sleepRequiresCap !== false && (item.consumeLevel || 0) < cap && !opts.force) {
      return { ok: false, reason: "A unique can be put to sleep once it reaches consume +" + cap + "." };
    }
    const key = uniqueKey(item);
    const existing = remnantOf(player, key);
    const rem = buildRemnant(item);
    if (existing) {
      // Same unique never double-stacks; refresh numbers from the best consume level.
      if ((item.consumeLevel || 0) >= (existing.consumeLevel || 0)) {
        existing.mods = rem.mods;
        existing.consumeLevel = item.consumeLevel || 0;
      }
      existing.on = true;
    } else if (rem) {
      player.remnants.push(rem);
    }
    item.dormant = true;
    player.consume = null;
    if (opts.scale !== false) {
      // Revert to pre-consume stats (rarity frame only).
      if (isUnique(item) || isConsumePiece(item)) _scaleUniqueOrig(item);
      item.consumeMul = 1;
    }
    if (!opts.keepItem) giveBack(player, item, opts);
    return { ok: true, item: item, remnant: remnantOf(player, key) };
  }

  function awakenConsume(player, item, opts) {
    opts = opts || {};
    ensurePlayer(player);
    if (!item) return { ok: false, reason: "Pick a dormant unique." };
    if (!item.dormant) return { ok: false, reason: "That unique is not dormant." };
    if (!opts.force && !opts.oilSpent) {
      if (countMat(player, "wake_oil") < 1) return { ok: false, reason: "Awakening costs one Wake-Oil." };
      if (!spendMat(player, "wake_oil", 1, opts)) return { ok: false, reason: "Awakening costs one Wake-Oil." };
    }
    item.dormant = false;
    const key = uniqueKey(item);
    const rem = remnantOf(player, key);
    const slotFree = !player.consume;
    const result = { ok: true, item: item, oil: !opts.force };
    if (slotFree && player.consumeUnlocked) {
      const into = consumeInto(player, item, Object.assign({}, opts, { alreadyTaken: !!opts.alreadyTaken, awakening: true }));
      if (!into.ok) {
        if (rem) rem.on = false;
        result.inserted = false;
        result.reason = into.reason;
        return result;
      }
      result.inserted = true;
    } else if (rem) {
      rem.on = false;
    }
    return result;
  }

  function canMoveToShared(item, opts) {
    opts = opts || {};
    if (!isBoundMat(item)) return { ok: true };
    if (opts.giveToCrafter) return { ok: true, gift: true };
    return { ok: false, reason: "Heart-Cinder is bound to this hero and cannot go in the shared stash as trade goods." };
  }

  function giveToCrafter(src, dest, item, opts) {
    opts = opts || {};
    if (!item || !isBoundMat(item)) return { ok: false, reason: "That is not a bound craft mat." };
    const def = item.matId ? matDef(item.matId) : null;
    if (def && def.giveToHigherCrafter === false) return { ok: false, reason: "That mat cannot be given." };
    const srcLv = (src && src.craftingLevel) || 1;
    const destLv = (dest && dest.craftingLevel) || 1;
    if (destLv <= srcLv) return { ok: false, reason: "Heart-Cinder can only be given to a crafter of a higher crafting level." };
    return { ok: true, srcLevel: srcLv, destLevel: destLv };
  }

  function noteFirstUnique(player, item) {
    ensurePlayer(player);
    if (!item || !isUnique(item)) return null;
    if (player.progress.seen.consumeHint) return null;
    player.progress.seen.consumeHint = true;
    return consumeCfg().hint || "A unique can be consumed at the Bench once you have Heart-Cinder.";
  }

  function consumeTick(player, amount) {
    ensurePlayer(player);
    const item = player.consume;
    if (!item || item.dormant) return { ok: false };
    const cap = consumeCfg().cap || 20;
    if ((item.consumeLevel || 0) >= cap) return { ok: true, level: cap, capped: true };
    item.consumeXp = (item.consumeXp || 0) + (amount || 0);
    // Simple stand-in: 100 xp per consume level, until a later item-XP pass.
    const need = 100;
    let ups = 0;
    while ((item.consumeLevel || 0) < cap && (item.consumeXp || 0) >= need) {
      item.consumeXp -= need;
      item.consumeLevel = (item.consumeLevel || 0) + 1;
      ups += 1;
    }
    if (ups) scaleUniqueWithConsume(item, player);
    return { ok: true, level: item.consumeLevel || 0, ups: ups };
  }

  root.ABCraft = {
    rarityDef, affixCount, isUnique, isSet, isCurrency,
    baseRarityFor, displayId, rankLabel, floorLabel, kindLabel,
    cssClass, family, familyDef, families, color, outline, pip, goldMul, stampTier, migrateItem, migrateSave,
    migrateShared, migrateAllItems, ranks, strings, scaleUnique: scaleUniqueWithConsume, uniqueStatMul,
    milestoneMul, consumeCfg, milestones, setDef, setTable, majorSlots, isMajorSlot,
    matDef, isBoundMat, makeMat, canConsume, uniqueKey, isConsumePiece, consumePieceId,
    remnantList, remnantOf, remnantActive, remnantMods, buildRemnant,
    scaleModBag, mergeMods, setAverageRank, setRankMul, scaleSetBonus, scaleBonusText, setBonuses, setAwakened,
    sixWornDormantOn, wornSetItems, consumePackageMul, isConsumedNow,
    ensurePlayer, unlockConsume, consumeInto, setConsumeLevel, sleepConsume, awakenConsume,
    consumeTick, canMoveToShared, giveToCrafter, noteFirstUnique,
    countMat, spendMat, accountRecipes, learnRecipe, hasRecipe, findAndTake, giveBack
  };
})(typeof window !== "undefined" ? window : self);
