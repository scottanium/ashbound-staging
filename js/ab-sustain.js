// Boss-fight sustain: cap on-hit heals and life steal so a Mythical kit can still drop.
(function (root) {
  var log = [];

  function rules() {
    return (root.ASHBOUND_DATA && ASHBOUND_DATA.sustain) || {
      bossHealPerSec: 0.04,
      bossLeechMul: 0.5,
      window: 1
    };
  }

  function nowT(state) {
    if (state && state.time != null) return state.time;
    if (state && state.t != null) return state.t;
    return 0;
  }

  function fightingBoss(state) {
    var list = state && state.world && state.world.monsters;
    if (!list) return false;
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m && m.boss && !m.dead && (m.hp == null || m.hp > 0)) return true;
    }
    return false;
  }

  function prune(t, window) {
    var cut = t - (window || 1);
    var i = 0;
    while (i < log.length && log[i].t < cut) i++;
    if (i) log = log.slice(i);
  }

  function usedSince(t, window) {
    prune(t, window);
    var sum = 0, i;
    for (i = 0; i < log.length; i++) sum += log[i].amount || 0;
    return sum;
  }

  function capFor(state) {
    var sh = state && state.sheet;
    var life = (sh && sh.life) || (state && state.player && state.player.hp) || 0;
    return (rules().bossHealPerSec || 0.04) * life;
  }

  function applyLife(state, amount, opts) {
    opts = opts || {};
    amount = Number(amount) || 0;
    if (amount <= 0 || !state || !state.player) return 0;
    var p = state.player;
    var sh = state.sheet;
    var life = (sh && sh.life) || p.hp || 0;
    var t = nowT(state);
    var vsBoss = fightingBoss(state);
    if (vsBoss) {
      if (opts.kind === "leech") amount *= (rules().bossLeechMul != null ? rules().bossLeechMul : 0.5);
      var window = rules().window || 1;
      var room = Math.max(0, capFor(state) - usedSince(t, window));
      amount = Math.min(amount, room);
    }
    if (amount > 0) log.push({ t: t, amount: amount, kind: opts.kind || "heal" });
    var before = p.hp || 0;
    p.hp = Math.min(life, before + amount);
    return p.hp - before;
  }

  function reset() { log = []; }

  root.ABSustain = {
    applyLife: applyLife,
    fightingBoss: fightingBoss,
    capFor: capFor,
    used: function (state) { return usedSince(nowT(state), (rules().window || 1)); },
    rules: rules,
    reset: reset
  };
})(typeof window !== "undefined" ? window : globalThis);
