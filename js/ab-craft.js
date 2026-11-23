// Phase A craft/rarity helpers. Combat, AI, and render do not import this.
// Looks up ASHBOUND_DATA at call time (data may still be loading when this file parses).
(function (root) {
  const GEAR_IDS = ["common", "magic", "rare", "elite", "epic", "legendary", "fabled", "mythical"];
  const CURRENCY = { rune: 1, gem: 1, potion: 1, gold: 1, lens: 1 };

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
    return !!(item && CURRENCY[item.rarity]);
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
    if (GEAR_IDS.indexOf(item.rarity) >= 0) return item.rarity;
    return null;
  }

  function displayId(item) {
    if (!item) return "common";
    if (isCurrency(item)) return item.rarity;
    if (item.tier && rarityDef(item.tier)) return item.tier;
    const floor = baseRarityFor(item);
    if (floor && (isUnique(item) || isSet(item))) return floor;
    if (GEAR_IDS.indexOf(item.rarity) >= 0) return item.rarity;
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
    const legacy = (table && table.legacyGold) || data().rarity || {};
    if (item && legacy[item.rarity] != null) return legacy[item.rarity];
    return 1;
  }

  function stampTier(item) {
    if (!item || isCurrency(item) || item.charm) return item;
    if (isUnique(item) || isSet(item)) item.tier = baseRarityFor(item) || "epic";
    else if (GEAR_IDS.indexOf(item.rarity) >= 0) item.tier = item.rarity;
    return item;
  }

  function migrateItem(item) {
    if (!item) return item;
    if (isCurrency(item) || item.charm) return item;
    if (item.enchantLevel == null) item.enchantLevel = 0;
    if (item.itemLevel == null) item.itemLevel = 0;
    stampTier(item);
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
    cssClass, pip, goldMul, stampTier, migrateItem, migrateSave,
    migrateShared, migrateAllItems, ranks, strings
  };
})(typeof window !== "undefined" ? window : self);
