/* Ashbound v74: XP curve, skill-point grants, monster XP, and Paragon.
   Numbers come from data/progress.json. Combat, AI and render do not import
   this file's internals; they call ABProgress through this small surface.
   Paragon points are regular spendable stat/skill points plus always-on
   passives (flat life, move speed). They never unlock spell books. */
(function (root) {
  "use strict";

  var DEF = {
    maxLevel: 50,
    xpToNext: { a: 16, b: 20 },
    statPerLevel: 5,
    skillPerLevel: 2,
    skillPointsAtLevel1: 2,
    skillMaxRank: 20,
    monsterXpMul: 2.85,
    monsterXpPerLevel: 0.12,
    paragon: {
      levelLimit: 100,
      xpToNext: { base: 16000, perLevel: 500 },
      statPerLevel: 5,
      skillEvery: 5,
      skillAmount: 1,
      lifePerLevel: 2,
      movePctPer: 1,
      moveEvery: 10,
      moveStacksOnTopOfFrwCap: true
    }
  };

  function src() {
    return (root.ASHBOUND_DATA && root.ASHBOUND_DATA.progress) || {};
  }
  function merge(base, over) {
    var o = {}, k;
    for (k in base) o[k] = base[k];
    if (over) for (k in over) {
      if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) && o[k] && typeof o[k] === "object")
        o[k] = merge(o[k], over[k]);
      else if (over[k] != null) o[k] = over[k];
    }
    return o;
  }
  function cfg() { return merge(DEF, src()); }
  function para() { return cfg().paragon || DEF.paragon; }

  function maxLevel() { return cfg().maxLevel; }
  function statPerLevel() { return cfg().statPerLevel; }
  function skillPerLevel() { return cfg().skillPerLevel; }
  function skillPointsAtLevel1() { return cfg().skillPointsAtLevel1; }
  function skillMaxRank() { return cfg().skillMaxRank; }
  function monsterXpMul() { return cfg().monsterXpMul; }
  function monsterXpPerLevel() { return cfg().monsterXpPerLevel; }

  function xpToNext(level) {
    var x = cfg().xpToNext || DEF.xpToNext;
    return Math.floor((x.a || 0) * level * level + (x.b || 0) * level);
  }

  /* Lifetime skill points granted at character level L (no Paragon). */
  function skillGrantAtLevel(level) {
    var L = Math.max(1, Math.min(maxLevel(), level || 1));
    return skillPointsAtLevel1() + (L - 1) * skillPerLevel();
  }
  /* Pre-v74 grant: 1 at level 1, then +1 per level-up. */
  function legacySkillGrantAtLevel(level) {
    var L = Math.max(1, Math.min(maxLevel(), level || 1));
    return 1 + (L - 1) * 1;
  }

  function monsterXp(base, mlvl, rankMul, extraMul) {
    var b = Number(base) || 0, t = Number(mlvl) || 0, r = rankMul == null ? 1 : rankMul;
    var x = extraMul == null ? 1 : extraMul;
    return Math.round(b * (1 + t * monsterXpPerLevel()) * r * monsterXpMul() * x);
  }

  function paragonCap() {
    var n = para().levelLimit;
    if (n == null || n === false || n === "") return Infinity;
    n = Number(n);
    return n > 0 ? n : Infinity;
  }
  function paragonXpToNext(n) {
    var x = para().xpToNext || DEF.paragon.xpToNext;
    n = Math.max(0, n || 0);
    return Math.floor((x.base || 0) + (x.perLevel || 0) * n);
  }
  function paragonStatPerLevel() { return para().statPerLevel || 0; }
  function paragonSkillEvery() { return para().skillEvery || 0; }
  function paragonSkillAmount() { return para().skillAmount || 0; }
  function lifePerParagon() { return para().lifePerLevel || 0; }
  function moveEvery() { return para().moveEvery || 10; }
  function movePctPer() { return para().movePctPer || 0; }

  function ensure(player) {
    if (!player) return player;
    if (player.paragonLevel == null) player.paragonLevel = 0;
    if (player.paragonXp == null) player.paragonXp = 0;
    if (player.paragonLevel > paragonCap()) player.paragonLevel = paragonCap();
    return player;
  }

  function flatLife(player) {
    var n = (player && player.paragonLevel) || 0;
    return n * lifePerParagon();
  }
  function movePct(player) {
    var n = (player && player.paragonLevel) || 0;
    var ev = moveEvery();
    if (!ev) return 0;
    return Math.floor(n / ev) * movePctPer();
  }
  /* Gear FRW is already clamped; add Paragon move on top when the flag is set. */
  function moveFactor(frwClamped, player) {
    var frw = Number(frwClamped) || 0;
    var extra = para().moveStacksOnTopOfFrwCap !== false ? movePct(player) : 0;
    return 1 + (frw + extra) / 100;
  }

  function skillCap(skill) {
    var cap = skillMaxRank();
    var own = skill && skill.maxRank;
    if (own == null) return cap;
    return Math.min(own, cap);
  }

  function grantOneParagon(player) {
    var cap = paragonCap();
    var n = (player.paragonLevel || 0) + 1;
    if (n > cap) return null;
    player.paragonLevel = n;
    var stat = paragonStatPerLevel();
    var skill = 0;
    var ev = paragonSkillEvery();
    if (ev && n % ev === 0) skill = paragonSkillAmount();
    player.statPoints = (player.statPoints || 0) + stat;
    player.skillPoints = (player.skillPoints || 0) + skill;
    return {
      level: n,
      stat: stat,
      skill: skill,
      life: lifePerParagon(),
      move: (ev = moveEvery()) && n % ev === 0 ? movePctPer() : 0
    };
  }

  function paragonToast(grants) {
    if (!grants || !grants.length) return "";
    var last = grants[grants.length - 1];
    var bits = ["Paragon " + last.level];
    var stat = 0, skill = 0, move = 0, i;
    for (i = 0; i < grants.length; i++) {
      stat += grants[i].stat || 0;
      skill += grants[i].skill || 0;
      move += grants[i].move || 0;
    }
    if (stat) bits.push("+" + stat + " stat point" + (stat === 1 ? "" : "s"));
    if (skill) bits.push("+" + skill + " skill point" + (skill === 1 ? "" : "s"));
    if (move) bits.push("+" + move + "% move speed");
    return bits[0] + (bits.length > 1 ? ". " + bits.slice(1).join(", ") + "." : ".");
  }

  function addParagonXp(player, amount) {
    ensure(player);
    var grants = [];
    if (!amount || amount < 0) return { paragoned: false, grants: grants, leftover: 0 };
    var cap = paragonCap();
    if ((player.paragonLevel || 0) >= cap) {
      player.paragonXp = 0;
      return { paragoned: false, grants: grants, leftover: 0, capped: true };
    }
    player.paragonXp = (player.paragonXp || 0) + amount;
    while ((player.paragonLevel || 0) < cap && player.paragonXp >= paragonXpToNext(player.paragonLevel || 0)) {
      player.paragonXp -= paragonXpToNext(player.paragonLevel || 0);
      var g = grantOneParagon(player);
      if (!g) break;
      grants.push(g);
    }
    if ((player.paragonLevel || 0) >= cap) player.paragonXp = 0;
    return { paragoned: grants.length > 0, grants: grants, leftover: player.paragonXp, toast: paragonToast(grants) };
  }

  function addParagonLevels(player, n) {
    ensure(player);
    var grants = [], i, g;
    n = Math.max(0, n | 0);
    for (i = 0; i < n; i++) {
      if ((player.paragonLevel || 0) >= paragonCap()) break;
      g = grantOneParagon(player);
      if (!g) break;
      grants.push(g);
    }
    return { paragoned: grants.length > 0, grants: grants, toast: paragonToast(grants) };
  }

  /* Apply incoming XP: ordinary levels up to maxLevel, then Paragon. */
  function gainXp(player, amount) {
    var leveled = false, paragoned = false, grants = [], toast = "";
    if (!player || !amount) return { leveled: false, paragoned: false, grants: grants };
    ensure(player);
    var maxL = maxLevel();
    var into = amount;
    if (player.level < maxL) {
      player.xp = (player.xp || 0) + into;
      into = 0;
      while (player.level < maxL && player.xp >= xpToNext(player.level)) {
        player.xp -= xpToNext(player.level);
        player.level += 1;
        player.statPoints = (player.statPoints || 0) + statPerLevel();
        player.skillPoints = (player.skillPoints || 0) + skillPerLevel();
        leveled = true;
      }
      if (player.level >= maxL) {
        into = player.xp || 0;
        player.xp = 0;
      }
    }
    if (player.level >= maxL && into) {
      var r = addParagonXp(player, into);
      paragoned = !!r.paragoned;
      grants = r.grants || [];
      toast = r.toast || "";
    }
    return { leveled: leveled, paragoned: paragoned, grants: grants, toast: toast, level: player.level, paragonLevel: player.paragonLevel || 0 };
  }

  /* Old saves: keep level; grant the extra skill points once (flag on progress). */
  function migrateSave(dto) {
    if (!dto || !dto.player) return dto;
    var p = dto.player;
    ensure(p);
    p.progress = p.progress || {};
    if (!p.progress.v74SkillGrant) {
      var L = Math.max(1, p.level || 1);
      var extra = skillGrantAtLevel(L) - legacySkillGrantAtLevel(L);
      if (extra > 0) p.skillPoints = (p.skillPoints || 0) + extra;
      p.progress.v74SkillGrant = true;
    }
    return dto;
  }

  function markNewPlayer(player) {
    if (!player) return player;
    ensure(player);
    player.progress = player.progress || {};
    player.progress.v74SkillGrant = true;
    return player;
  }

  function hudLevelText(player) {
    if (!player) return "";
    var s = "Lv " + player.level;
    if ((player.paragonLevel || 0) > 0 || player.level >= maxLevel()) {
      s += " P" + (player.paragonLevel || 0);
    }
    return s;
  }

  function xpBarDenom(player) {
    ensure(player);
    if (player.level >= maxLevel()) {
      if ((player.paragonLevel || 0) >= paragonCap()) return 1;
      return Math.max(1, paragonXpToNext(player.paragonLevel || 0));
    }
    return Math.max(1, xpToNext(player.level));
  }
  function xpBarValue(player) {
    ensure(player);
    if (player.level >= maxLevel()) {
      if ((player.paragonLevel || 0) >= paragonCap()) return 1;
      return player.paragonXp || 0;
    }
    return player.xp || 0;
  }

  root.ABProgress = {
    cfg, para, maxLevel, statPerLevel, skillPerLevel, skillPointsAtLevel1, skillMaxRank,
    monsterXpMul, monsterXpPerLevel, xpToNext, skillGrantAtLevel, legacySkillGrantAtLevel,
    monsterXp, paragonCap, paragonXpToNext, paragonStatPerLevel, paragonSkillEvery, paragonSkillAmount,
    lifePerParagon, movePct, moveFactor, flatLife, skillCap, ensure,
    gainXp, addParagonXp, addParagonLevels, grantOneParagon,
    migrateSave, markNewPlayer, hudLevelText, xpBarDenom, xpBarValue
  };
})(typeof window !== "undefined" ? window : self);
