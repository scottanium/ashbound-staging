/* v84o (TTPC-51): D2-style stat ranges on uniques. Each unique def may carry "ranges" ({stat: [min, max]}, or for damage adds
   {stat: [[loMin, loMax], [hiMin, hiMax]]}) next to its "mods". A new drop rolls each ranged stat inside its range and keeps the
   rolls on the item as item.uniqueRoll; the item's stats are def.mods with the rolls laid over, then the usual tier / enchant /
   consume scaling (js/ab-craft.js scaleUnique). Items saved before v84o have no uniqueRoll and keep def.mods: their current
   values, which sit inside every range, so they count as already rolled. No SAVE_VERSION change.
   Tooltip: the rolled line gets its range, muted, e.g. "+72% Enhanced Damage (60-80)", scaled the same way as the stat, and a
   perfect roll (every part at max) gets a small mark. Labels / colours: data/ui.json "uniqueRanges". */
(function (root) {
  function cfg() { var u = (root.ASHBOUND_DATA && root.ASHBOUND_DATA.ui) || {}; return u.uniqueRanges || {}; }
  function defOf(item) {
    var D = root.ASHBOUND_DATA || {}, l = D.uniques || [], id = item && item.uniqueId;
    if (!id) return null;
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function pick(lo, hi, rng) {
    var r = (rng || Math.random)();
    if (Math.floor(lo) === lo && Math.floor(hi) === hi) return lo + Math.floor(r * (hi - lo + 1));
    return Math.round((lo + r * (hi - lo)) * 10) / 10;
  }
  function roll(def, rng) {
    if (!def || !def.ranges || cfg().enabled === false) return null;
    var out = {}, any = false;
    for (var k in def.ranges) {
      var r = def.ranges[k];
      if (!Array.isArray(r)) continue;
      if (Array.isArray(r[0])) {
        var a = pick(r[0][0], r[0][1], rng), b = pick(r[1][0], r[1][1], rng);
        if (a > b) { var t = a; a = b; b = t; }
        out[k] = [a, b];
      } else out[k] = pick(r[0], r[1], rng);
      any = true;
    }
    return any ? out : null;
  }
  /* the unscaled stats of this copy: def.mods with its rolls laid over */
  function base(item, mods) {
    var roll0 = item && item.uniqueRoll;
    if (!roll0 || !mods) return mods;
    var o = {};
    for (var k in mods) o[k] = Object.prototype.hasOwnProperty.call(roll0, k) ? roll0[k] : mods[k];
    return o;
  }
  function scaled(item, v) {
    var mul = item && item.uniqueStatMul, cm = item && item.consumeMul;
    var o = { x: v };
    if (root.ABEffects && ABEffects.scaleMods) {
      if (mul != null && mul !== 1) o = ABEffects.scaleMods(o, mul);
      if (cm != null && cm !== 1) o = ABEffects.scaleMods(o, cm);
    }
    return o.x;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmt(n) { return (Math.round(n * 10) / 10).toString(); }
  /* muted range (+ perfect mark) for one printed stat line of a unique; "" when the stat has no range */
  function mark(item, key) {
    var c = cfg();
    if (c.enabled === false || c.show === false || !key) return "";
    css();
    var def = defOf(item), r = def && def.ranges && def.ranges[key];
    if (!r) return "";
    var dash = c.dash || "\u2013", txt, perfect;
    var cur = item.uniqueRoll && Object.prototype.hasOwnProperty.call(item.uniqueRoll, key) ? item.uniqueRoll[key] : def.mods[key];
    if (Array.isArray(r[0])) {
      txt = fmt(scaled(item, r[0][0])) + dash + fmt(scaled(item, r[0][1])) + (c.pairJoin || " to ") + fmt(scaled(item, r[1][0])) + dash + fmt(scaled(item, r[1][1]));
      perfect = Array.isArray(cur) && cur[0] >= r[0][1] && cur[1] >= r[1][1];
    } else {
      txt = fmt(scaled(item, r[0])) + dash + fmt(scaled(item, r[1]));
      perfect = typeof cur === "number" && cur >= r[1];
    }
    return '<span class="u-range" data-range="' + esc(key) + '">(' + esc(txt) + ")</span>" +
      (perfect ? '<span class="u-perfect" title="' + esc(c.perfectTitle || "Perfect roll") + '" aria-label="' + esc(c.perfectTitle || "Perfect roll") + '">' + esc(c.perfectMark || "\u2605") + "</span>" : "");
  }
  /* every ranged stat at its max (used by the glow's maxed-mythical hook) */
  function isPerfect(item) {
    var def = defOf(item);
    if (!def || !def.ranges || !item.uniqueRoll) return false;
    for (var k in def.ranges) {
      var r = def.ranges[k], v = item.uniqueRoll[k];
      if (v == null) return false;
      if (Array.isArray(r[0]) ? !(v[0] >= r[0][1] && v[1] >= r[1][1]) : !(v >= r[1])) return false;
    }
    return true;
  }
  function css() {
    if (!root.document || root.document.getElementById("ab-uroll-style")) return;
    var c = cfg(), s = root.document.createElement("style"); s.id = "ab-uroll-style";
    s.textContent = ".detail .u-range{margin-left:5px;color:" + (c.mutedColor || "#9a8f80") + " !important;font-size:.88em;font-weight:400;white-space:nowrap}" +
      ".detail .u-perfect{margin-left:4px;color:" + (c.perfectColor || "#ffd27a") + " !important;font-size:.9em;text-shadow:0 0 6px " + (c.perfectGlow || "rgba(255,190,80,.8)") + "}";
    (root.document.head || root.document.documentElement).appendChild(s);
  }
  root.ABURoll = { roll: roll, base: base, mark: mark, isPerfect: isPerfect, defOf: defOf, cfg: cfg };
})(typeof window !== "undefined" ? window : self);
