// Narrow save DTO. Combat/AI live objects are not snapshotted by reference.
// On-disk shape stays SAVE_VERSION 4 so existing slots keep loading.
(function (root) {
  const VERSION = 4;
  const SUPPORTED = [1, 2, 3, 4];
  const OMIT_PLAYER = { flash: 1, moving: 1, swingT: 1 };

  function cloneJson(value, fallback) {
    if (value == null) return fallback;
    try { return JSON.parse(JSON.stringify(value)); }
    catch { return fallback; }
  }

  function snapshotMonster(e) {
    if (!e) return null;
    return {
      uid: e.uid, defId: e.defId, name: e.name, x: e.x, y: e.y,
      homeX: e.homeX, homeY: e.homeY, hp: e.hp, maxHp: e.maxHp,
      dmgMin: e.dmgMin, dmgMax: e.dmgMax, defense: e.defense, attack: e.attack,
      aps: e.aps, move: e.move, xp: e.xp, radius: e.radius, aggro: e.aggro,
      range: e.range, ranged: e.ranged, rank: e.rank, mods: e.mods, packId: e.packId,
      mlvl: e.mlvl, resist: e.resist, boss: e.boss,
      state: e.state === "chase" ? "chase" : "idle",
      color: e.color, accent: e.accent, shape: e.shape,
      summonedAdds: e.summonedAdds, enraged: e.enraged
    };
  }

  function packExplored(e) {
    if (!e) return "";
    let t = "";
    for (let a = 0; a < e.length; a++) t += e[a] ? "1" : "0";
    return t;
  }

  function snapshotPlayer(p) {
    if (!p) return null;
    const out = {};
    for (const k of Object.keys(p)) {
      if (OMIT_PLAYER[k]) continue;
      const v = p[k];
      if (typeof v === "function") continue;
      out[k] = v;
    }
    return cloneJson(out, null);
  }

  function snapshotWorld(t) {
    if (!t) return null;
    return {
      id: t.id, name: t.name, seed: t.seed, kind: t.kind,
      spawn: cloneJson(t.spawn, null), exit: cloneJson(t.exit, null),
      monsters: (t.monsters || []).filter((a) => !a.dead).map(snapshotMonster),
      loots: cloneJson(t.loots || [], []),
      props: cloneJson(t.props || [], []),
      explored: packExplored(t.explored)
    };
  }

  function toDTO(state) {
    return {
      v: VERSION,
      savedAt: Date.now(),
      player: snapshotPlayer(state && state.player),
      world: snapshotWorld(state && state.world)
    };
  }

  function migrate(e) {
    if (!e || !e.player) return e;
    let t = e.player;
    t.progress = t.progress || { waypoints: { hearthveil: true, cinderwood: true }, bossDefeated: false };
    t.progress.waypoints = t.progress.waypoints || { hearthveil: true, cinderwood: true };
    t.progress.bosses = t.progress.bosses || { veyra: !!t.progress.bossDefeated, morra: false, sallow: false };
    if (t.progress.bosses.sallow == null) t.progress.bosses.sallow = false;
    if (t.progress.bosses.mael == null) t.progress.bosses.mael = false;
    if (t.progress.bosses.morra == null) t.progress.bosses.morra = false;
    if (t.season == null) t.season = 0;
    if (t.progress.bossDefeated) t.progress.bosses.veyra = true;
    if (!t.progress.difficulty) t.progress.difficulty = "normal";
    if (t.hireling === void 0) t.hireling = null;
    if (!t.companions) t.companions = [];
    if (!t.cube || !Array.isArray(t.cube.items)) t.cube = { w: 4, h: 3, items: [] };
    if (t.hireling && t.hireling.equipment && t.hireling.equipment.armor === void 0) t.hireling.equipment.armor = null;
    t.progress.seen = t.progress.seen || {};
    t.progress.seen.fresh = Array.isArray(t.progress.seen.fresh) ? t.progress.seen.fresh : [];
    t.progress.sides = t.progress.sides || {};
    if (t.progress.bosses.veyra) {
      t.progress.waypoints.brinehollow = true;
      t.progress.waypoints.reed_marsh = true;
    }
    if (t.progress.bosses.morra) {
      t.progress.waypoints.vesper_orchard = true;
      t.progress.waypoints.briar_rows = true;
    }
    if (t.progress.bosses.sallow) {
      t.progress.waypoints.ashgate = true;
      t.progress.waypoints.pale_steps = true;
    }
    let a = (n) => { n && n.identified == null && (n.identified = true); };
    for (let n of t.inventory && t.inventory.items || []) a(n);
    for (let n of t.stash && t.stash.items || []) a(n);
    for (let n of Object.values(t.equipment || {})) a(n);
    for (let n of t.belt || []) a(n);
    e.v = 4;
    return e;
  }

  function supported(v) {
    return SUPPORTED.indexOf(v) >= 0;
  }

  root.ABSave = {
    VERSION, supported, toDTO, migrate,
    snapshotMonster, snapshotPlayer, snapshotWorld, packExplored
  };
})(typeof window !== "undefined" ? window : self);
