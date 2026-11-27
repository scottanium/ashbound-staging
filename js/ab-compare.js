/* v84n (TTPC-49): per-line item compare. When a bag item opens next to the equipped item, each stat line on the bag
   item shows its difference against the worn item (green better, red worse), the base Damage / Defense lines do the
   same, and stats only the worn item has are listed as red "lose" lines. Totals add every mod list on the item:
   implicit, boot implicit, affixes, fixed (unique) mods and socketed runes. Colours and labels: data/ui.json "compare". */
(function (root) {
  var cssDone = false;
  function cfg() { var u = (root.ASHBOUND_DATA && root.ASHBOUND_DATA.ui) || {}; return u.compare || {}; }
  function css() {
    if (cssDone || !root.document) return; cssDone = true;
    var c = cfg(), col = c.colors || {}, g = col.better || "#6fdc7a", b = col.worse || "#ff6a5a";
    var s = root.document.createElement("style"); s.id = "ab-compare-style";
    s.textContent = [
      ".detail .cmp-d{display:inline-block;margin-left:6px;font-weight:700;font-size:.92em;white-space:nowrap}",
      ".detail .cmp-d.up{color:" + g + " !important}", ".detail .cmp-d.down{color:" + b + " !important}",
      ".detail .affix.cmp-lost,html .detail .detail-scroll .affix.cmp-lost{color:" + b + " !important}",
      ".detail .cmp-lost-tag{display:inline-block;margin-right:5px;padding:0 4px;border:1px solid " + b + ";border-radius:2px;font-size:.78em;letter-spacing:.04em;text-transform:uppercase;vertical-align:1px}",
      ".detail .compare .le-delta.good{color:" + g + "}", ".detail .compare .le-delta.bad{color:" + b + "}"
    ].join("\n");
    (root.document.head || root.document.documentElement).appendChild(s);
  }
  function add(T, k, v) {
    if (typeof v === "number") T[k] = (T[k] || 0) + v;
    else if (Array.isArray(v) && v.length === 2) { var o = T[k] || [0, 0]; T[k] = [o[0] + (+v[0] || 0), o[1] + (+v[1] || 0)]; }
  }
  function addMods(T, m) {
    if (!m) return;
    for (var k in m) {
      if (k === "skills" && m.skills && typeof m.skills === "object") { for (var id in m.skills) add(T, "skills:" + id, +m.skills[id] || 0); }
      else add(T, k, m[k]);
    }
  }
  function totals(it) {
    var T = {};
    if (!it) return T;
    try { var bi = root.ABFeel && ABFeel.bootImplicitAffix && ABFeel.bootImplicitAffix(it); (bi || []).forEach(function (a) { addMods(T, a && a.mods); }); } catch (e) {}
    addMods(T, it.implicit);
    (it.affixes || []).forEach(function (a) { addMods(T, a && a.mods); });
    addMods(T, it.fixedMods);
    (it.sockets || []).forEach(function (s) { if (s) addMods(T, s.mods || s.fixedMods); });
    if (it.dmgMax) T["@dmg"] = [it.dmgMin || 0, it.dmgMax || 0];
    if (it.defense) T["@def"] = it.defense;
    return T;
  }
  /* keys in the same order Io() prints the lines (skills first, then the rest) */
  function keys(m) {
    if (!m) return [];
    var out = [];
    if (m.skills) for (var id in m.skills) out.push("skills:" + id);
    for (var k in m) if (k !== "skills") out.push(k);
    return out;
  }
  function ctx(item, peer) {
    if (!item || !peer || peer.uid === item.uid) return null;
    css();
    return { mine: totals(item), peer: totals(peer), shown: {} };
  }
  function val(v) { return Array.isArray(v) ? (v[0] + v[1]) / 2 : (v || 0); }
  function num(d) { var a = Math.abs(d); return (a >= 10 || Math.abs(a - Math.round(a)) < 0.05) ? String(Math.round(a)) : (Math.round(a * 10) / 10).toFixed(1); }
  function lowerBetter(k) { return (cfg().lowerIsBetter || []).indexOf(k) >= 0; }
  function span(c, k, d, text) {
    if (Math.abs(d) < 0.05) return "";
    var good = lowerBetter(k) ? d < 0 : d > 0;
    return '<span class="cmp-d ' + (good ? "up" : "down") + '" data-cmp="' + k + '" data-delta="' + Math.round(d * 100) / 100 + '">' + text + "</span>";
  }
  function fmt(d) { var c = cfg(); return (d > 0 ? (c.plus || "+") : (c.minus || "\u2212")) + num(d); }
  /* delta for one printed stat line; each stat shows once (its first line) */
  function mark(c, k) {
    if (!c || !k || c.shown[k]) return "";
    c.shown[k] = 1;
    var a = c.mine[k], b = c.peer[k];
    if (Array.isArray(a) || Array.isArray(b)) {
      var A = Array.isArray(a) ? a : [0, 0], B = Array.isArray(b) ? b : [0, 0], d0 = A[0] - B[0], d1 = A[1] - B[1];
      if (Math.abs(d0) < 0.05 && Math.abs(d1) < 0.05) return "";
      return span(c, k, (d0 + d1) / 2, (d0 === d1 ? fmt(d0) : fmt(d0) + "\u2013" + fmt(d1).replace(/^\+/, "")));
    }
    var d = (a || 0) - (b || 0);
    return span(c, k, d, fmt(d));
  }
  /* stats only the worn item has: [{key, mods}] for the page to print with its own line text */
  function lost(c) {
    if (!c) return [];
    var out = [];
    for (var k in c.peer) {
      if (k.charAt(0) === "@" || c.shown[k] || c.mine[k] != null) continue;
      if (Math.abs(val(c.peer[k])) < 0.05) continue;
      var m = {};
      if (k.indexOf("skills:") === 0) { m.skills = {}; m.skills[k.slice(7)] = c.peer[k]; } else m[k] = c.peer[k];
      out.push({ key: k, mods: m });
    }
    return out;
  }
  function lostTag() { return cfg().lostTag || "Lose"; }
  root.ABCompare = { totals: totals, keys: keys, ctx: ctx, mark: mark, lost: lost, lostTag: lostTag, cfg: cfg };
})(typeof window !== "undefined" ? window : self);
