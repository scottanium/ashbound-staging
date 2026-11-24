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
    migrateAllItems(dto.player, dto.world);
    dto.v = 5;
    return dto;
  }

  function migrateShared(bag) {
    if (!bag) return bag;
    walkItems(bag.items, migrateItem);
    bag.v = 5;
    return bag;
  }

  root.ABCraft = {
    rarityDef, affixCount, isUnique, isSet, isCurrency,
    baseRarityFor, displayId, rankLabel, floorLabel, kindLabel,
    cssClass, family, familyDef, families, color, outline, pip, goldMul, stampTier, migrateItem, migrateSave,
    migrateShared, migrateAllItems, ranks, strings, scaleUnique, uniqueStatMul
  };
})(typeof window !== "undefined" ? window : self);
