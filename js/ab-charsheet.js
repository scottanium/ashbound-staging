// v84g Diablo 2-style character sheet. Labels: data/stats.json. Layout: data/ui.json characterSheet.
(function (root) {
  "use strict";
  var api = {};
  var holdTimer = null;
  var blockClick = false;
  var listening = false;

  function data() { return root.ASHBOUND_DATA || {}; }
  function layout() {
    var d = (data().ui || {}).characterSheet || {};
    return {
      enabled: d.enabled !== false,
      panel: d.panel || "stats",
      maxW: d.maxW != null ? +d.maxW : 720,
      pad: d.pad != null ? +d.pad : 12,
      plus: d.plus != null ? +d.plus : 44,
      previewHoldMs: d.previewHoldMs != null ? +d.previewHoldMs : 350,
      xpH: d.xpH != null ? +d.xpH : 8,
      colMin: d.colMin != null ? +d.colMin : 240,
      gap: d.gap != null ? +d.gap : 12
    };
  }
  function labels() {
    var file = data().stats || {}, tab = (data().ui || {}).statsTab || {};
    return Object.assign({}, tab, file);
  }
  function enabled() {
    var u = data().ui || {}, tab = u.statsTab || {}, cs = u.characterSheet || {};
    return tab.enabled !== false && cs.enabled !== false;
  }
  function attach(next) { api = next || api; return root.ABCharSheet; }
  function esc(s) { return api.esc ? api.esc(s) : String(s == null ? "" : s); }
  function fmt(v, dp) { return api.fmt ? api.fmt(v, dp) : String(v); }

  function setPreview(stat) {
    var A = root.ASHBOUND, o = A && A.state;
    if (!o || !o.ui) return;
    o.ui.statPreview = stat || null;
    o.ui.rev++;
  }
  function onDown(ev) {
    var t = ev.target && ev.target.closest && ev.target.closest("[data-act=stat][data-stat]");
    if (!t || !enabled()) return;
    var L = layout(), stat = t.getAttribute("data-stat");
    blockClick = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(function () {
      blockClick = true;
      setPreview(stat);
    }, L.previewHoldMs);
  }
  function onUp() {
    clearTimeout(holdTimer);
    holdTimer = null;
    if (blockClick) setPreview(null);
  }
  function onClick(ev) {
    if (!blockClick) return;
    ev.preventDefault();
    ev.stopPropagation();
    blockClick = false;
  }
  function bind() {
    if (listening) return;
    listening = true;
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("pointercancel", onUp, true);
    document.addEventListener("click", onClick, true);
  }

  function met(name, sheet) {
    var f = api.met && api.met[name];
    return f ? f(sheet) : null;
  }
  function mainBonusRows(attrId, o) {
    if (api.mainBonus) return api.mainBonus(attrId, o);
    return [];
  }

  function previewSheet(o, stat) {
    if (!stat || !api.sheetOf || !o.player) return null;
    var b2 = Object.assign({}, o.player.base);
    b2[stat] = (b2[stat] || 0) + 1;
    return api.sheetOf(Object.assign({}, o.player, { base: b2 }));
  }

  function fmtVal(r, v, sheet) {
    var txt;
    if (r.range && api.met) {
      var lo = api.met[r.range[0]](sheet), hi = api.met[r.range[1]](sheet);
      txt = fmt(lo, r.dp) + "\u2013" + fmt(hi, r.dp);
    } else {
      txt = fmt(v, r.dp);
    }
    if (r.hideZero && !Number(fmt(v, r.dp))) return null;
    txt += r.unit || "";
    if (r.cap != null && v >= r.cap) txt += " (" + esc((labels().text || {}).cap || "cap") + ")";
    return txt;
  }

  function derivedLine(r, t, t2, T) {
    var f = api.met && api.met[r.metric];
    if (!f) return "";
    var v = f(t), now = fmtVal(r, v, t);
    if (now == null) return "";
    var cls = "stat-line small", body = "<span>" + esc(r.label) + "</span><strong>" + now + "</strong>";
    if (t2) {
      var v2 = f(t2), next = fmtVal(r, v2, t2);
      if (next != null && next !== now) {
        cls += " cs-preview";
        body = "<span>" + esc(r.label) + "</span><strong>" + now + " " + esc((T.previewArrow || "\u2192")) + " " + next + "</strong>";
      }
    }
    return '<div class="' + cls + '">' + body + "</div>";
  }

  function attrCard(a, o, e, t, T) {
    var br = api.brk ? api.brk(a.id) : { base: 0, gear: 0, bonus: 0, total: 0 };
    var rows = (a.perPoint || []).concat(mainBonusRows(a.id, o));
    var pp = api.perPoint ? api.perPoint(a.id, rows) : [];
    var live = e.statPoints > 0;
    var plus = live
      ? '<span class="plus live" data-act="stat" data-stat="' + a.id + '" aria-label="Add ' + esc(a.label) + '">+</span>'
      : "";
    var act = live ? ' data-act="stat" data-stat="' + a.id + '"' : ' data-act="explain" data-key="' + a.id + '"';
    var h = [];
    h.push('<section class="stat-card stat-card-attr' + (live ? " live" : "") + '"' + (live ? ' data-act="stat" data-stat="' + a.id + '"' : "") + ">");
    h.push("<h3>");
    h.push('<div class="stat-row">');
    h.push('<button type="button" class="stat' + (live ? " live" : "") + (o.ui.explain === a.id ? " is-sel" : "") + '"' + act + ' aria-label="' + (live ? "Add " : "") + esc(a.label) + '">');
    h.push('<span class="stat-name"><span>' + esc(a.label) + "</span><strong>" + br.total + "</strong></span>");
    h.push(plus);
    h.push("</button></div></h3>");
    h.push('<div class="cs-attr-detail">');
    h.push('<div class="small muted">' + esc(T.base || "Base") + " " + br.base + " \xB7 " + esc(T.gear || "Gear") + " " + (br.gear >= 0 ? "+" : "") + br.gear + " \xB7 " + esc(T.bonus || "Bonus") + " " + (br.bonus >= 0 ? "+" : "") + br.bonus + "</div>");
    h.push('<div class="small muted">' + esc(T.perPoint || "Each point gives:") + "</div>");
    pp.forEach(function (x) {
      h.push('<div class="small pp"><strong>' + esc(x.text) + "</strong> " + esc(x.label) + "</div>");
    });
    h.push("</div></section>");
    return h.join("");
  }

  function groupCard(g, t, t2, T) {
    var rows = [], r, mo, i, v, txt, name;
    for (i = 0; i < (g.rows || []).length; i++) {
      r = g.rows[i];
      if (r.metric === "hit") {
        (r.monsters || []).forEach(function (m) {
          mo = ((data().monsters) || []).find(function (x) { return x.id === m; });
          if (!mo) return;
          name = mo.name;
          txt = Math.round(100 * (api.hitChance ? api.hitChance(mo.attack, t.defense) : 0)) + "%";
          rows.push('<div class="stat-line small"><span>' + esc(name) + "</span><strong>" + txt + "</strong></div>");
        });
        continue;
      }
      rows.push(derivedLine(r, t, t2, T));
    }
    return '<section class="stat-card"><h3>' + esc(g.title) + "</h3>"
      + (g.note ? '<div class="small muted">' + esc(g.note) + "</div>" : "")
      + rows.join("") + "</section>";
  }

  function setsCard(e, t, cfg) {
    var worn = {}, it, sid, def, total, n, body = "", pieceOf, det, text, on, piece, b;
    for (it of Object.values(e.equipment || {})) if (it && it.setId) {
      worn[it.setId] = worn[it.setId] || [];
      worn[it.setId].push(it.setItemId);
    }
    if (e.consume && e.consume.setId) {
      worn[e.consume.setId] = worn[e.consume.setId] || [];
      worn[e.consume.setId].push(e.consume.setItemId);
    }
    var ids = Object.keys(worn);
    if (!ids.length) body = '<div class="small muted">' + esc(cfg.empty || "No set pieces worn.") + "</div>";
    else {
      var items = api.setItems || [];
      var defs = api.setDefs || {};
      ids.forEach(function (sid) {
        def = defs[sid];
        if (!def) return;
        total = items.filter(function (x) { return x.setId === sid; }).length;
        n = [...new Set(worn[sid])].length;
        pieceOf = cfg.pieces || "{n} of {m} pieces worn";
        body += '<div class="stats-set"><div class="stats-set-head"><div class="rar-set">' + esc(def.name) + '</div><div class="small">' + esc(pieceOf.replace("{n}", String(n)).replace("{m}", String(total))) + "</div></div>";
        items.filter(function (x) { return x.setId === sid; }).forEach(function (piece) {
          body += '<div class="small ' + (worn[sid].includes(piece.id) ? "rar-set" : "muted") + '">' + esc(piece.name) + "</div>";
        });
        (def.bonuses || []).forEach(function (b) {
          det = (t.setDetail || []).find(function (x) { return x.setId === sid && x.count === b.count; });
          text = det && det.text ? det.text : (b.count + " pieces: " + b.text);
          on = !!(det && det.active);
          body += '<div class="small ' + (on ? "rar-set" : "muted") + '">' + esc(text) + "</div>";
        });
        body += "</div>";
      });
    }
    return '<section class="stat-card stats-sets"><h3>' + esc(cfg.title || "Sets") + "</h3>" + body + "</section>";
  }

  function panelHtml(o) {
    if (!enabled()) return '<p class="small muted">Character stats</p>';
    var c = labels(), L = layout(), e = o.player, t = o.sheet, T = c.text || {};
    var preview = o.ui && o.ui.statPreview, t2 = preview ? previewSheet(o, preview) : null;
    var cls = api.classOf ? api.classOf(e.classId) : null;
    var xpV = api.xpValue ? api.xpValue(e) : (e.xp || 0);
    var xpD = api.xpDenom ? api.xpDenom(e) : 1;
    var xpPct = Math.max(0, Math.min(100, 100 * (xpV / (xpD || 1))));
    var pts = e.statPoints || 0;
    var ptsText = (T.pointsLeft || "{n} to spend").replace("{n}", String(pts));
    var para = (api.maxLevel != null && e.level >= api.maxLevel) || e.paragonLevel
      ? " \xB7 Paragon " + (e.paragonLevel || 0) : "";
    var h = [];
    h.push('<div class="cs-sheet" id="char-sheet" style="--cs-max:' + L.maxW + "px;--cs-pad:" + L.pad + "px;--cs-plus:" + L.plus + "px;--cs-xp:" + L.xpH + "px;--cs-col:" + L.colMin + "px;--cs-gap:" + L.gap + 'px">');
    h.push('<div class="cs-head"><div class="cs-who">' + esc(e.name) + (cls && cls.name ? " \xB7 " + esc(cls.name) : "") + '</div><div class="small">' + esc(T.level || "Level") + " " + e.level + para + "</div></div>");
    h.push('<div class="cs-xp" role="meter" aria-label="' + esc(T.xp || "Experience") + '" aria-valuenow="' + xpV + '" aria-valuemax="' + xpD + '"><span style="width:' + xpPct + '%"></span></div>');
    h.push('<div class="small muted">' + esc(T.xp || "Experience") + " " + Math.floor(xpV) + " / " + Math.floor(xpD) + "</div>");
    if (pts) h.push('<p class="cs-points">' + esc(ptsText) + "</p>");
    if (pts && T.previewHold) h.push('<p class="cs-hint small muted">' + esc(T.previewHold) + "</p>");
    h.push('<div class="cs-cols stats-tab">');
    h.push('<div class="cs-col cs-attrs">');
    (c.attributes || []).forEach(function (a) { h.push(attrCard(a, o, e, t, T)); });
    h.push("</div><div class=\"cs-col cs-derived\">");
    (c.groups || []).forEach(function (g) { h.push(groupCard(g, t, t2, T)); });
    h.push(setsCard(e, t, c.sets || {}));
    h.push("</div></div></div>");
    return h.join("");
  }

  function syncDock() {
    var btn = document.getElementById("btn-panel-stats");
    if (!btn) return;
    var on = enabled();
    btn.hidden = !on;
    btn.setAttribute("aria-hidden", on ? "false" : "true");
    if (!on) btn.setAttribute("tabindex", "-1");
    else btn.removeAttribute("tabindex");
  }

  root.ABCharSheet = { attach: attach, panelHtml: panelHtml, bind: bind, enabled: enabled, syncDock: syncDock, layout: layout, labels: labels };
})(window);
