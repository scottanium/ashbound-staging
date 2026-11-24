// Load tuning, content and text from data/*.json before the game boots.
// No secrets. These files are the source of truth; edit them, then reload.
(function () {
  const files = [
    ["tune", "data/tune.json"],
    ["models", "data/models.json"],
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
    ["camera", "data/camera.json"],
    ["icons", "data/icons.json", true],
    ["props3d", "data/props3d.json", true],
    ["ui", "data/ui.json", true],
    ["guide", "data/guide.json", true],
    ["feel", "data/feel.json"],
    ["progress", "data/progress.json"],
    ["uniqueEffects", "data/unique-effects.json"],
    ["milestoneCurve", "data/milestone-curve.json"],
    ["milestones", "data/milestones.json"],
    ["consume", "data/consume.json"],
    ["sets", "data/sets.json"],
  ];
  window.ASHBOUND_DATA_READY = Promise.all(
    files.map(([key, path, optional]) =>
      fetch(path).then((res) => {
        if (!res.ok) throw new Error("Could not load " + path + " (" + res.status + ")");
        return res.json().then((data) => [key, data]);
      }).catch((err) => {
        if (optional) return [key, null]; // optional art data: the game falls back to its old drawing
        throw err;
      })
    )
  ).then((pairs) => {
    const bag = Object.fromEntries(pairs);
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
    D.props3d = bag.props3d || null;
    D.ui = bag.ui || null;
    D.guide = bag.guide || null;
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
    D.inventoryLayout = bag.inventoryLayout || {};
    D.campaignIntro = (bag.campaignDifficulty && bag.campaignDifficulty.campaignIntro) || bag.campaignDifficulty || {};
    window.ASHBOUND_DATA = D;
    return D;
  });
})();
