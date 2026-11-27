// Load tuning, content and text from data/*.json before the game boots.
// No secrets. These files are the source of truth; edit them, then reload.
(function () {
  const files = [
    ["tune", "data/tune.json"],
    ["models", "data/models.json"],
    ["modelsHD", "data/models-hd.json", true],
    ["classes", "data/classes.json"],
    ["skills", "data/skills.json"],
    ["content", "data/content.json"],
    ["monsters", "data/monsters.json"],
    ["items", "data/items.json"],
    ["rarity", "data/rarity.json"],
    ["telling", "data/telling.json"],
    ["characters", "data/characters.json"],
    ["npcLines", "data/npc-lines.json"],
    ["campaignDifficulty", "data/difficulty.json"],
    ["inventoryLayout", "data/inventory-layout.json"],
    ["townLayout", "data/town-layout.json", true],
    ["camera", "data/camera.json"],
    ["icons", "data/icons.json", true],
    ["props3d", "data/props3d.json", true],
    ["collision", "data/collision.json", true],
    ["zonesCfg", "data/zones.json", true],
    ["ui", "data/ui.json", true],
    ["uiArt", "data/ui-art.json", true],
    ["reskin", "data/reskin.json", true],
    ["audio", "data/audio.json", true],
    ["spawns", "data/spawns.json", true],
    ["stashCfg", "data/stash.json", true],
    ["lootFilter", "data/lootfilter.json", true],
    ["stats", "data/stats.json", true],
    ["skillTreeUi", "data/skilltree-ui.json", true],
    ["skillArt", "data/skill-art.json", true],
    ["guide", "data/guide.json", true],
    ["questUi", "data/questui.json", true],
    ["skillbar", "data/skillbar.json", true],
    ["feel", "data/feel.json"],
    ["progress", "data/progress.json"],
    ["uniqueEffects", "data/unique-effects.json"],
    ["milestoneCurve", "data/milestone-curve.json"],
    ["milestones", "data/milestones.json"],
    ["consume", "data/consume.json"],
    ["sets", "data/sets.json"],
    ["sustain", "data/sustain.json"],
    ["uniquesAshen", "data/uniques-ashen.json"],
    // r15: loot picker config and extra campaign uniques (js/ab-lootpick.js). Optional: missing = old drop picker.
    ["lootPick", "data/lootpick.json", true],
    ["uniquesR15", "data/uniques-r15.json", true],
    // v82s: skill trees. Shared math in skilltrees-common.json, one file per class. All optional: a class with no file
    // (or the staging/test fallback ?skilltrees=off) keeps the old per-skill system.
    ["skillTreeCommon", "data/skilltrees-common.json", true],
    ["skillTrees_warden", "data/skilltrees-warden.json", true],
    ["skillTrees_reaver", "data/skilltrees-reaver.json", true],
    ["skillTrees_chanter", "data/skilltrees-chanter.json", true],
    ["skillTrees_caller", "data/skilltrees-caller.json", true],
    ["skillTrees_stalker", "data/skilltrees-stalker.json", true],
  ];
  const treesOff = (() => { try { return /(?:^|[?&])skilltrees=off(?:&|$)/.test(location.search || ""); } catch (e) { return false; } })();
  window.ASHBOUND_DATA_READY = Promise.all(
    files.map(([key, path, optional]) =>
      (treesOff && /^skillTree/.test(key)) ? Promise.resolve([key, null]) : fetch(path).then((res) => {
        if (!res.ok) throw new Error("Could not load " + path + " (" + res.status + ")");
        return res.json().then((data) => [key, data]);
      }).catch((err) => {
        if (optional) return [key, null]; // optional art data: the game falls back to its old drawing
        throw err;
      })
    )
  ).then((pairs) => {
    const bag = Object.fromEntries(pairs);
    if (bag.modelsHD && bag.models) { Object.assign(bag.models.types, bag.modelsHD.types || {}); bag.models.hd = bag.modelsHD; Object.assign(bag.models.materials, bag.modelsHD.materials || {}); }
    const D = Object.assign(
      { tune: bag.tune, models: bag.models, skills: bag.skills },
      bag.classes,
      bag.content,
      bag.monsters,
      bag.items
    );
    D.telling = bag.telling;
    D.characters = bag.characters;
    D.npcLines = bag.npcLines;
    D.rarityTable = bag.rarity;
    D.camera = bag.camera || {};
    D.icons = bag.icons || null;
    D.uiArt = bag.uiArt || null;
    D.reskin = bag.reskin || null;
    D.audio = bag.audio || null; // v84j: sound off by default (data/audio.json)
    D.spawns = bag.spawns || null; // spawnspread: monster spread along each zone (data/spawns.json)
    D.skillArt = bag.skillArt || null; // r14: painted skill icons (optional)
    D.stashCfg = bag.stashCfg || null;
    D.lootFilter = bag.lootFilter || null;
    D.props3d = bag.props3d || null;
    D.collision = bag.collision || null; // r15 wallfix: colliders match the drawn obstacles (data/collision.json)
    D.zonesCfg = bag.zonesCfg || null;
    D.ui = bag.ui || null;
    D.guide = bag.guide || null;
    D.questUi = bag.questUi || null;
    D.feel = bag.feel || null;
    D.progress = bag.progress || {};
    D.uniqueEffects = bag.uniqueEffects || {};
    D.milestoneCurve = bag.milestoneCurve || {};
    D.milestones = bag.milestones || bag.milestoneCurve || {};
    if (D.milestones && D.milestones.weights) {
      D.milestoneCurve = Object.assign({}, D.milestoneCurve, {
        weights: D.milestones.weights,
        betweenShare: D.milestones.betweenShare,
        spikeShare: D.milestones.spikeShare,
        consumeCap: D.milestones.consumeCap,
        package: D.milestones.package
      });
    }
    D.consume = bag.consume || {};
    D.setDefs = bag.sets || {};
    if (bag.sets && bag.sets.sets) {
      const table = bag.sets.sets;
      const items = Array.isArray(D.setItems) ? D.setItems.slice() : [];
      const have = new Set(items.map((x) => x && x.id));
      D.setBonuses = D.setBonuses || {};
      for (const sid of Object.keys(table)) {
        const def = table[sid];
        if (!def) continue;
        const prev = D.setBonuses[sid] || {};
        D.setBonuses[sid] = Object.assign({}, prev, {
          name: def.name || prev.name,
          baseRarity: def.baseRarity || prev.baseRarity,
          consumePiece: def.consumePiece,
          consumeSlot: def.consumeSlot,
          bonuses: def.bonuses || prev.bonuses
        });
        const extra = def.newPieces || [];
        for (let i = 0; i < extra.length; i++) {
          const piece = extra[i];
          if (!piece || !piece.id || have.has(piece.id)) continue;
          items.push(Object.assign({ setId: sid }, piece));
          have.add(piece.id);
        }
      }
      D.setItems = items;
    }
    D.sustain = bag.sustain || {};
    // r15: campaign uniques from data/uniques-r15.json join the original list (before the Ashen twins).
    D.lootPick = bag.lootPick || null;
    if (bag.uniquesR15 && Array.isArray(bag.uniquesR15.uniques)) {
      const list = Array.isArray(D.uniques) ? D.uniques.slice() : [];
      const have = {};
      for (let i = 0; i < list.length; i++) if (list[i] && list[i].id) have[list[i].id] = true;
      for (const u of bag.uniquesR15.uniques) if (u && u.id && !have[u.id]) { list.push(u); have[u.id] = true; }
      D.uniques = list;
      D.uniquesR15 = bag.uniquesR15.uniques;
    }
    if (bag.uniquesAshen) {
      if (typeof ABAshen !== "undefined" && ABAshen.merge) ABAshen.merge(D, bag.uniquesAshen);
      else {
        D.ashen = bag.uniquesAshen;
        const extra = (bag.uniquesAshen && bag.uniquesAshen.uniques) || [];
        D.ashenUniques = extra;
        const list = Array.isArray(D.uniques) ? D.uniques : [];
        const have = {};
        for (let i = 0; i < list.length; i++) if (list[i] && list[i].id) have[list[i].id] = true;
        for (let i = 0; i < extra.length; i++) {
          const u = extra[i];
          if (u && u.id && !have[u.id]) { list.push(u); have[u.id] = true; }
        }
        D.uniques = list;
      }
    }
    // v82s: skill trees (optional, per class). Each class file is merged over skilltrees-common.json (class keys win;
    // strings merge key by key). A tree class's new skills join D.skills and its class skill list. A missing or
    // disabled file leaves that class on the old per-skill system.
    D.skillTrees = null;
    D.skillTreesByClass = {};
    D.skillTreeCommon = bag.skillTreeCommon || null;
    const common = bag.skillTreeCommon || {};
    for (const key of Object.keys(bag)) {
      if (!/^skillTrees_/.test(key)) continue;
      const raw = bag[key];
      if (!raw || raw.enabled === false || !Array.isArray(raw.trees) || !raw.classId) continue;
      const st = Object.assign({}, common, raw, { strings: Object.assign({}, common.strings || {}, raw.strings || {}) });
      const list = Array.isArray(D.skills) ? D.skills : [];
      const have = {};
      for (let i = 0; i < list.length; i++) if (list[i] && list[i].id) have[list[i].id] = true;
      const extra = st.skills || [];
      for (let i = 0; i < extra.length; i++) if (extra[i] && extra[i].id && !have[extra[i].id]) { list.push(Object.assign({ tree: true }, extra[i])); have[extra[i].id] = true; }
      D.skills = list;
      const cls = (D.classes || []).find((c) => c && c.id === st.classId);
      if (cls) {
        const ids = (cls.skills || []).slice();
        for (let i = 0; i < extra.length; i++) if (extra[i] && ids.indexOf(extra[i].id) < 0) ids.push(extra[i].id);
        cls.skills = ids;
      }
      D.skillTreesByClass[st.classId] = st;
    }
    // Back-compat: D.skillTrees is the Warden's merged data (r9 tests and tools read it).
    D.skillTrees = D.skillTreesByClass.cinder_warden || null;
    D.inventoryLayout = bag.inventoryLayout || {};
    D.townLayout = bag.townLayout || {};
    D.difficulty = bag.campaignDifficulty || {};
    D.campaignIntro = (bag.campaignDifficulty && bag.campaignDifficulty.campaignIntro) || bag.campaignDifficulty || {};
    window.ASHBOUND_DATA = D;
    return D;
  });
})();
