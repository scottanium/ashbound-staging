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
    ["telling", "data/telling.json"],
    ["characters", "data/characters.json"],
  ];
  window.ASHBOUND_DATA_READY = Promise.all(
    files.map(([key, path]) =>
      fetch(path).then((res) => {
        if (!res.ok) throw new Error("Could not load " + path + " (" + res.status + ")");
        return res.json().then((data) => [key, data]);
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
    window.ASHBOUND_DATA = D;
    return D;
  });
})();
