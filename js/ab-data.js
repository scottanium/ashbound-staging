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
    D.inventoryLayout = bag.inventoryLayout || {};
    D.campaignIntro = (bag.campaignDifficulty && bag.campaignDifficulty.campaignIntro) || bag.campaignDifficulty || {};
    window.ASHBOUND_DATA = D;
    return D;
  });
})();
