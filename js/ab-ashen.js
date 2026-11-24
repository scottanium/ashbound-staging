// Ashen uniques: merge data/uniques-ashen.json into ASHBOUND_DATA.uniques
// and gate late-area drops. Original unique defs are never rewritten.
(function (root) {
  function rulesOf(bag) {
    const data = (bag && bag.rules) ? bag : ((root.ASHBOUND_DATA && root.ASHBOUND_DATA.ashen) || {});
    return data.rules || data || {};
  }

  function listOf(bag) {
    if (bag && Array.isArray(bag.uniques)) return bag.uniques;
    if (Array.isArray(bag)) return bag;
    const D = root.ASHBOUND_DATA || {};
    return D.ashenUniques || [];
  }

  function isAshen(defOrItem) {
    if (!defOrItem) return false;
    if (defOrItem.ashen) return true;
    const id = defOrItem.id || defOrItem.uniqueId || "";
    return typeof id === "string" && id.indexOf("ashen_") === 0;
  }

  function world() {
    return (root.ASHBOUND && ASHBOUND.state && ASHBOUND.state.world) || null;
  }

  function inLateZone(w, rules) {
    if (!w) return false;
    const late = (rules && rules.lateZones) || ["quiet_fields", "stair_of_names", "first_kiln"];
    if (w.id && late.indexOf(w.id) >= 0) return true;
    if ((rules && rules.allowHighRift !== false) && w.kind === "rift") return true;
    return false;
  }

  function canDrop(mlvl, isBoss, def) {
    if (def && !isAshen(def)) {
      if (def.riftOnly) return false;
      if (def.bossOnly && !isBoss) return false;
      return (def.qlvl || 0) <= (mlvl || 0);
    }
    const rules = rulesOf();
    const min = (def && def.dropMinLevel != null) ? def.dropMinLevel : (rules.dropMinLevel || 45);
    if ((mlvl || 0) < min) return false;
    return inLateZone(world(), rules);
  }

  function originals(list) {
    const src = list || ((root.ASHBOUND_DATA && ASHBOUND_DATA.uniques) || []);
    const out = [];
    for (let i = 0; i < src.length; i++) if (src[i] && !isAshen(src[i])) out.push(src[i]);
    return out;
  }

  function ashenOnly(list) {
    const src = list || ((root.ASHBOUND_DATA && ASHBOUND_DATA.uniques) || []);
    const out = [];
    for (let i = 0; i < src.length; i++) if (src[i] && isAshen(src[i])) out.push(src[i]);
    return out;
  }

  function merge(D, bag) {
    if (!D) return D;
    const payload = bag || D.ashen || {};
    const extra = listOf(payload);
    D.ashen = payload.rules ? payload : { rules: rulesOf(payload), uniques: extra };
    D.ashenUniques = extra;
    const have = {};
    const list = Array.isArray(D.uniques) ? D.uniques.slice() : [];
    for (let i = 0; i < list.length; i++) if (list[i] && list[i].id) have[list[i].id] = true;
    for (let i = 0; i < extra.length; i++) {
      const u = extra[i];
      if (!u || !u.id || have[u.id]) continue;
      list.push(u);
      have[u.id] = true;
    }
    D.uniques = list;
    return D;
  }

  root.ABAshen = {
    merge: merge,
    canDrop: canDrop,
    isAshen: isAshen,
    originals: originals,
    ashenOnly: ashenOnly,
    inLateZone: function (w) { return inLateZone(w || world(), rulesOf()); },
    rules: function () { return rulesOf(); }
  };
})(typeof window !== "undefined" ? window : globalThis);
