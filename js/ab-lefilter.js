/* le-ui (v85) step 18: loot filter for ground names. settings.leFilter = {on, rules:[{on, act, color, cond}]}, top rule
   wins. act: show (always name it) / hide (no name) / recolor (name in a colour) / big (larger name). cond (all set keys
   must match): rankMin, family ("unique"/"set"), slot, lvl [a,b] (item level), t6 (any affix T6+). Up to data max rules.
   Kept apart from settings.lootFilter, which is the game's own pick-up setting ("magic"/"all"). Data: data/lootfilter.json.
   Labels are working names for Koto's pass. index.html asks verdict() in Md (show/hide) and color()/big() when drawing. */
(function (root) {
  "use strict";
  var RANKS = ["common", "magic", "rare", "elite", "epic", "legendary", "fabled", "mythical"], cache = {}, rev = 0;
  function D() { return (root.ASHBOUND_DATA && root.ASHBOUND_DATA.lootFilter) || { max: 20, acts: [["show", "Show"], ["hide", "Hide"], ["recolor", "Recolor"], ["big", "Big name"]], colors: {} }; }
  function H() { return root.ABLeHost; }
  function st() { var h = H(); return h && h.o && h.o.settings; }
  function cfg() { var s = st(); if (!s) return null; if (!s.leFilter || !Array.isArray(s.leFilter.rules)) s.leFilter = { on: true, rules: [] }; return s.leFilter; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function tierOf(a) { return root.ABLeData && ABLeData.tierOf ? ABLeData.tierOf(a) : (a && a.tier) || 0; }
  function match(c, it) {
    if (!it || !c) return false;
    if (c.rankMin && (RANKS.indexOf(it.tier) < RANKS.indexOf(c.rankMin))) return false;
    if (c.family && it.rarity !== c.family) return false;
    if (c.slot && it.slot !== c.slot) return false;
    if (c.lvl && ((it.ilvl || 0) < (c.lvl[0] || 0) || (it.ilvl || 0) > (c.lvl[1] == null ? 1e9 : c.lvl[1]))) return false;
    if (c.t6 && !(it.affixes || []).some(function (a) { return tierOf(a) >= 6; })) return false;
    return true;
  }
  function verdict(it) {
    var f = cfg(); if (!f || !f.on || !f.rules.length || !it || it.rarity === "gold") return null;
    var k = (it.uid || "") + "|" + rev, v = cache[k]; if (v !== undefined) return v;
    v = null;
    for (var i = 0; i < f.rules.length; i++) { var r = f.rules[i]; if (r && r.on !== false && match(r.cond || {}, it)) { v = r; break; } }
    cache[k] = v; return v;
  }
  function color(it) { var v = verdict(it); return v && v.act === "recolor" ? (D().colors || {})[v.color] || v.color || null : null; }
  function big(it) { var v = verdict(it); return !!(v && v.act === "big"); }
  function bump() { rev++; cache = {}; }
  // ---- sheet ------------------------------------------------------------------------------------------------
  function label(list, id) { var x = (list || []).find(function (o) { return o[0] === id; }); return x ? x[1] : id; }
  function summary(r) {
    var d = D(), c = r.cond || {}, bits = [];
    if (c.family) bits.push(label(d.families, c.family));
    if (c.rankMin) bits.push(label(d.ranks, c.rankMin) + "+");
    if (c.slot) bits.push(label(d.slots, c.slot));
    if (c.lvl) bits.push("Lv " + (c.lvl[0] || 0) + (c.lvl[1] == null ? "+" : "\u2013" + c.lvl[1]));
    if (c.t6) bits.push(d.t6Label || "Top tier (T6+)");
    return bits.length ? bits.join(" \u00b7 ") : (d.anyLabel || "Any item");
  }
  function button() { var f = cfg(); var n = f ? f.rules.length : 0; return '<button class="btn" data-act="le-filter-open">' + esc(D().title || "Loot Filter") + ": " + (f && f.on && n ? n + " " + (n === 1 ? "rule" : "rules") : "off") + "</button>"; }
  function chips(key, list, cur, extra) {
    return list.map(function (o) { var on = cur === o[0]; return '<button type="button" class="le-fchip' + (on ? " is-on" : "") + '" data-act="le-filter-pick" data-key="' + key + '" data-val="' + esc(o[0]) + '" aria-pressed="' + on + '"' + (extra ? extra(o) : "") + ">" + esc(o[1]) + "</button>"; }).join("");
  }
  function editor(ui) {
    var d = D(), r = ui.leFDraft || { act: "show", cond: {} }, c = r.cond || {}, cols = d.colors || {};
    var row = function (lab, html) { return '<div class="le-frow"><span class="le-flab">' + esc(lab) + '</span><div class="le-fchips">' + html + "</div></div>"; };
    var lv = c.lvl || null;
    var h = row(d.actLabel || "Action", chips("act", d.acts, r.act));
    if (r.act === "recolor") h += row(d.colorLabel || "Color", Object.keys(cols).map(function (k) { var on = r.color === k; return '<button type="button" class="le-fsw' + (on ? " is-on" : "") + '" data-act="le-filter-pick" data-key="color" data-val="' + esc(k) + '" aria-label="' + esc(k) + '" style="background:' + esc(cols[k]) + '"></button>'; }).join(""));
    h += row(d.rankLabel || "Minimum rank", chips("rankMin", [["", "Any"]].concat(d.ranks || []), c.rankMin || ""));
    h += row(d.familyLabel || "Kind", chips("family", [["", "Any"]].concat(d.families || []), c.family || "") + '<span class="le-fgap"></span>' +
      '<button type="button" class="le-fchip' + (c.t6 ? " is-on" : "") + '" data-act="le-filter-pick" data-key="t6" data-val="1" aria-pressed="' + !!c.t6 + '">' + esc(d.t6Label || "Top tier (T6+)") + '</button>' +
      '<span class="le-fgap"></span><span class="le-flv">' + esc(d.levelLabel || "Level") + ' <button type="button" class="le-fstep" data-act="le-filter-lv" data-d="-5" aria-label="Lower">\u2212</button><b>' + (lv ? (lv[0] || 0) + "+" : "Any") + '</b><button type="button" class="le-fstep" data-act="le-filter-lv" data-d="5" aria-label="Higher">+</button></span>');
    h += row(d.slotLabel || "Slot", chips("slot", [["", "Any"]].concat(d.slots || []), c.slot || ""));
    return '<div class="le-fsheet le-fedit" role="dialog" aria-label="' + esc(d.title || "Loot Filter") + '"><div class="le-fin"><div class="le-fhead"><b>' + esc(ui.leFEdit === "new" ? (d.addLabel || "New rule") : (d.editLabel || "Edit rule")) + "</b><span>" + esc(summary(r)) + "</span></div>" + h +
      '<div class="le-fbtns"><span class="le-fgap"></span><button type="button" class="btn slim le-btn" data-act="le-filter-cancel">Cancel</button><button type="button" class="btn slim primary le-btn" data-act="le-filter-save">Save</button></div></div></div>';
  }
  function sheet() {
    var h = H(); if (!h || !h.o || !h.o.ui || !h.o.ui.leFilter) return "";
    var ui = h.o.ui, f = cfg(), d = D(); if (ui.leFEdit) return editor(ui);
    var rows = f.rules.map(function (r, i) {
      var col = r.act === "recolor" ? (d.colors || {})[r.color] || "#fff" : "";
      return '<div class="le-frule' + (r.on === false ? " is-off" : "") + '" data-i="' + i + '">' +
        '<button type="button" class="le-fon" data-act="le-filter-toggle" data-i="' + i + '" aria-pressed="' + (r.on !== false) + '" aria-label="On">' + (r.on !== false ? "\u2713" : "") + "</button>" +
        '<span class="le-fact le-fact-' + esc(r.act) + '"' + (col ? ' style="color:' + esc(col) + '"' : "") + ">" + esc(label(d.acts, r.act)) + "</span>" +
        '<button type="button" class="le-fsum" data-act="le-filter-edit" data-i="' + i + '">' + esc(summary(r)) + "</button>" +
        '<button type="button" class="le-fmv" data-act="le-filter-move" data-i="' + i + '" data-d="-1" aria-label="Up"' + (i ? "" : " disabled") + ">\u25b2</button>" +
        '<button type="button" class="le-fmv" data-act="le-filter-move" data-i="' + i + '" data-d="1" aria-label="Down"' + (i < f.rules.length - 1 ? "" : " disabled") + ">\u25bc</button>" +
        '<button type="button" class="le-fdel" data-act="le-filter-del" data-i="' + i + '" aria-label="Delete">\u00d7</button></div>';
    }).join("");
    return '<div class="le-fsheet" role="dialog" aria-label="' + esc(d.title || "Loot Filter") + '"><div class="le-fin"><div class="le-fhead"><b>' + esc(d.title || "Loot Filter") + "</b><span>" + esc(d.help || "") + "</span></div>" +
      '<div class="le-frules">' + (rows || '<p class="le-fnone">' + esc(d.empty || "No rules yet.") + "</p>") + "</div>" +
      '<div class="le-fbtns"><button type="button" class="btn slim le-btn le-fmaster" data-act="le-filter-onoff">' + esc(d.title || "Loot Filter") + ": " + (f.on ? "on" : "off") + '</button><span class="le-fgap"></span>' +
      (f.rules.length < (d.max || 20) ? '<button type="button" class="btn slim le-btn" data-act="le-filter-edit" data-i="new">' + esc(d.addLabel || "New rule") + "</button>" : "") +
      '<button type="button" class="btn slim primary le-btn" data-act="le-filter-close">Done</button></div></div></div>';
  }
  function saveSettings(h) { bump(); try { h.o.ui.rev = (h.o.ui.rev || 0) + 1; } catch (e) {} return { save: false, le: "filter", settings: true }; }
  function install() {
    if (!root.ABLeGame || ABLeGame.ACTS["le-filter-open"]) return;
    var A = function (n, f) { ABLeGame.ACTS[n] = f; };
    A("le-filter-open", function (h) { cfg(); h.o.ui.leFilter = true; h.o.ui.leFEdit = null; return { save: false }; });
    A("le-filter-close", function (h) { h.o.ui.leFilter = false; h.o.ui.leFEdit = null; persist(h); return { save: false }; });
    A("le-filter-onoff", function (h) { var f = cfg(); f.on = !f.on; persist(h); return saveSettings(h); });
    A("le-filter-toggle", function (h, d) { var r = cfg().rules[+d.i]; if (r) { r.on = r.on === false; persist(h); } return saveSettings(h); });
    A("le-filter-del", function (h, d) { cfg().rules.splice(+d.i, 1); persist(h); return saveSettings(h); });
    A("le-filter-move", function (h, d) { var R = cfg().rules, i = +d.i, j = i + (+d.d); if (R[i] && j >= 0 && j < R.length) { var t = R[i]; R[i] = R[j]; R[j] = t; persist(h); } return saveSettings(h); });
    A("le-filter-edit", function (h, d) {
      var f = cfg(); if (d.i === "new") { if (f.rules.length >= (D().max || 20)) return { toast: "That's the most rules.", kind: "bad", save: false }; h.o.ui.leFEdit = "new"; h.o.ui.leFDraft = { on: true, act: "show", cond: {} }; }
      else { var r = f.rules[+d.i]; if (!r) return { save: false }; h.o.ui.leFEdit = String(+d.i); h.o.ui.leFDraft = JSON.parse(JSON.stringify(r)); h.o.ui.leFDraft.cond = h.o.ui.leFDraft.cond || {}; }
      return { save: false };
    });
    A("le-filter-cancel", function (h) { h.o.ui.leFEdit = null; h.o.ui.leFDraft = null; return { save: false }; });
    A("le-filter-pick", function (h, d) {
      var r = h.o.ui.leFDraft; if (!r) return { save: false }; var c = r.cond || (r.cond = {}), dd = D();
      if (d.key === "act") { if ((dd.acts || []).some(function (a) { return a[0] === d.val; })) { r.act = d.val; if (r.act === "recolor" && !r.color) r.color = Object.keys(dd.colors || {})[0]; } }
      else if (d.key === "color") { if ((dd.colors || {})[d.val]) r.color = d.val; }
      else if (d.key === "t6") { if (c.t6) delete c.t6; else c.t6 = true; }
      else if (d.key === "rankMin" || d.key === "family" || d.key === "slot") { if (d.val) c[d.key] = d.val; else delete c[d.key]; }
      return { save: false };
    });
    A("le-filter-lv", function (h, d) {
      var r = h.o.ui.leFDraft; if (!r) return { save: false }; var c = r.cond || (r.cond = {}), a = (c.lvl ? c.lvl[0] : 0) + (+d.d);
      if (a <= 0) delete c.lvl; else c.lvl = [Math.min(a, 100), null];
      return { save: false };
    });
    A("le-filter-save", function (h) {
      var r = h.o.ui.leFDraft, f = cfg(); if (!r) return { save: false };
      var clean = { on: r.on !== false, act: r.act, cond: r.cond || {} }; if (r.act === "recolor") clean.color = r.color;
      if (h.o.ui.leFEdit === "new") f.rules.push(clean); else f.rules[+h.o.ui.leFEdit] = clean;
      f.rules = f.rules.slice(0, D().max || 20); h.o.ui.leFEdit = null; h.o.ui.leFDraft = null; persist(h);
      return saveSettings(h);
    });
  }
  // settings live in their own store (the game's xe()); host exposes it as saveSettings when present
  function persist(h) { bump(); try { if (h.xe) h.xe(h.o.settings); } catch (e) {} }
  function css() {
    if (!root.document || root.document.getElementById("ab-lefilter-style")) return;
    var s = root.document.createElement("style"); s.id = "ab-lefilter-style";
    s.textContent = [
      ".le-fsheet{position:absolute;z-index:40;inset:max(6px,var(--safe-t,0px)) max(6px,var(--safe-r,0px)) max(6px,var(--safe-b,0px)) max(6px,var(--safe-l,0px));display:flex;background:linear-gradient(180deg,#1a130e,#0e0a08);border:1px solid var(--line,#c8a46a);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.7)}",
      ".le-fin{display:flex;flex-direction:column;gap:5px;padding:8px 10px;width:100%;min-width:0;overflow:hidden}",
      ".le-fhead{display:flex;align-items:baseline;gap:10px;font-size:11px;opacity:.95}.le-fhead b{font-size:14px;color:#ffe2a8;white-space:nowrap}.le-fhead span{opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".le-frules{display:flex;flex-direction:column;gap:3px;flex:1 1 auto;min-height:0;overflow-y:auto}",
      ".le-frule{display:flex;align-items:center;gap:5px;min-height:38px;padding:0 4px;border:1px solid var(--line-dim,#5a4630);border-radius:5px;background:rgba(0,0,0,.3)}",
      ".le-frule.is-off{opacity:.5}",
      ".le-fon,.le-fmv,.le-fdel{flex:0 0 auto;width:36px;height:34px;border:1px solid var(--line-dim,#5a4630);border-radius:4px;background:rgba(0,0,0,.35);color:#ffe2a8;font-size:13px}",
      ".le-fmv[disabled]{opacity:.3}",
      ".le-fact{flex:0 0 74px;font-size:12px;font-weight:700;color:#e8d6b0}.le-fact-hide{color:#9a8f80}.le-fact-big{font-size:14px}",
      ".le-fsum{flex:1 1 auto;min-width:0;min-height:34px;text-align:left;padding:0 8px;border:0;background:none;color:inherit;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".le-fnone{opacity:.7;font-size:12px;margin:8px 0}",
      ".le-fbtns{display:flex;align-items:center;gap:8px}.le-fbtns .btn{min-height:44px}",
      ".le-fgap{flex:1 1 auto}",
      ".le-fedit .le-fbtns{margin-top:auto}",
      "body:has(.le-fsheet) #btn-mute{z-index:1 !important}",
      ".le-frow{display:flex;align-items:center;gap:6px;min-height:34px}",
      ".le-flab{flex:0 0 78px;font-size:11px;opacity:.8}",
      ".le-fchips{display:flex;flex-wrap:wrap;gap:3px;align-items:center;min-width:0;flex:1}",
      ".le-fchip{min-height:32px;padding:0 8px;border:1px solid var(--line-dim,#5a4630);border-radius:16px;background:rgba(0,0,0,.3);color:inherit;font-size:11px}",
      ".le-fchip.is-on{border-color:#ffd38a;background:rgba(255,190,90,.2);color:#ffe2a8}",
      ".le-fsw{width:30px;height:30px;border:1px solid #000;border-radius:4px}.le-fsw.is-on{box-shadow:0 0 0 2px #ffd38a}",
      ".le-flv{display:inline-flex;align-items:center;gap:4px;font-size:11px}.le-flv b{min-width:30px;text-align:center;color:#ffe2a8}",
      ".le-fstep{width:32px;height:32px;border:1px solid var(--line-dim,#5a4630);border-radius:4px;background:rgba(0,0,0,.35);color:inherit;font-size:15px}"
    ].join("");
    (root.document.head || root.document.documentElement).appendChild(s);
  }
  if (root.document) { if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", css); else css(); }
  install();
  root.ABLeFilter = { verdict: verdict, color: color, big: big, match: match, bump: bump, button: button, sheet: sheet, summary: summary, install: install };
})(typeof window !== "undefined" ? window : globalThis);
