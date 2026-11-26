/* le-ui (v85) stash UI: category rail (Koto's Arms / Armor / Jewels / Makings / Relics + Stash), tab ribbon, buy-a-tab,
   and the edit sheet (name, icon, colour). Markup is built here and dropped into the stash view by index.html
   (abStashView); actions are "le-*" and run through ABLeGame with the game's own host helpers. Data: data/stash.json. */
(function (root) {
  "use strict";
  function L() { return root.ABLeData; }
  function cfg() { return (L() && L().stashCfg()) || {}; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function art(k) { return root.ABUiArt && ABUiArt.ready && ABUiArt.ready() && ABUiArt.piece && ABUiArt.piece(k) ? "var(--ua-" + k.replace(/_/g, "-") + ")" : ""; }
  function ico(icon, cls) {
    var a = art("tab_" + icon);
    return a ? '<i class="le-ti ' + (cls || "") + '" style="background-image:' + a + '" aria-hidden="true"></i>' : '<i class="le-ti le-ti-txt ' + (cls || "") + '" aria-hidden="true">' + esc((icon || "?").slice(0, 1).toUpperCase()) + "</i>";
  }
  function catOf(p, ui) {
    var st = L().ensureTabs(p), act = st.tabs.find(function (t) { return t.id === st.active; });
    return (ui && ui.leCat) || (act && act.cat) || "stash";
  }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function rail(p, ui) {
    if (!L() || !p) return "";
    var st = L().ensureTabs(p), cur = catOf(p, ui), m = counts(p, ui);
    return '<nav class="le-rail" aria-label="Stash groups">' + (cfg().cats || []).map(function (c) {
      var n = st.tabs.filter(function (t) { return t.cat === c.id; }).length;
      return '<button type="button" class="le-cat' + (c.id === cur ? " is-on" : "") + '" data-act="le-cat" data-cat="' + esc(c.id) + '" title="' + esc(c.about || c.name) + '" aria-pressed="' + (c.id === cur) + '">' +
        ico(c.icon) + '<span class="le-cat-n">' + esc(c.name) + "</span>" + (n ? '<b class="le-cat-c">' + n + "</b>" : "") + (m && m.cats[c.id] ? '<b class="le-cat-m">' + m.cats[c.id] + "</b>" : "") + "</button>";
    }).join("") + "</nav>";
  }
  function nameOf(it) { var H = root.ABLeHost; try { return H && H.Ee ? H.Ee(it) : it.name; } catch (e) { return it.name; } }
  function query(ui) { return String((ui && ui.leQ) || "").trim(); }
  function counts(p, ui) { return query(ui) ? L().searchCounts(p, query(ui), nameOf) : null; }
  function scfg2() { return cfg().search || { placeholder: "Search", chips: [], max: 40 }; }
  function searchRow(p, ui) {
    var sc = scfg2(), q = String((ui && ui.leQ) || ""), have = L().parseQuery(q).map(function (t) { return JSON.stringify(t); });
    var chips = (sc.chips || []).map(function (c) {
      var on = have.indexOf(JSON.stringify(L().parseQuery(c[1])[0])) >= 0;
      return '<button type="button" class="le-qchip' + (on ? " is-on" : "") + '" data-act="le-q-chip" data-q="' + esc(c[1]) + '" aria-pressed="' + on + '">' + esc(c[0]) + "</button>";
    }).join("");
    var n = counts(p, ui);
    return '<div class="le-ribbon le-searching"><label class="le-q"><i class="le-mag" aria-hidden="true"></i><input id="le-q" type="search" enterkeyhint="search" maxlength="' + (sc.max || 40) + '" placeholder="' + esc(sc.placeholder) + '" value="' + esc(q) + '" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
      '<b class="le-q-n" aria-live="polite">' + (n ? n.total : "") + "</b>" +
      '<div class="le-qchips">' + chips + "</div>" +
      '<button type="button" class="le-find-done" data-act="le-find-close" aria-label="Done" title="Done">\u2713</button></div>';
  }
  function hitCls(it) {
    var H = root.ABLeHost, ui = H && H.o && H.o.ui, q = query(ui);
    if (!q || !L()) return "";
    return L().matchItem(it, q, nameOf) ? "le-hit" : "le-dim";
  }
  // live typing: no re-render (keeps the keyboard up); dim/undim the stash grid and refresh the counts in place
  function applyLive() {
    var H = root.ABLeHost, d = root.document; if (!H || !H.o || !d) return;
    var p = H.o.player, ui = H.o.ui, q = query(ui), n = counts(p, ui), items = (p.stash && p.stash.items) || [];
    d.querySelectorAll("#panel .stash-bag .gitem[data-uid]").forEach(function (b) {
      var it = items.find(function (x) { return x.uid === b.dataset.uid; });
      b.classList.toggle("le-hit", !!(q && it && L().matchItem(it, q, nameOf)));
      b.classList.toggle("le-dim", !!(q && !(it && L().matchItem(it, q, nameOf))));
    });
    d.querySelectorAll("#panel .le-cat[data-cat]").forEach(function (c) {
      var m = c.querySelector(".le-cat-m"), v = n ? n.cats[c.dataset.cat] || 0 : 0;
      if (!v) { if (m) m.remove(); return; }
      if (!m) { m = d.createElement("b"); m.className = "le-cat-m"; c.appendChild(m); }
      m.textContent = v;
    });
    var t = d.querySelector("#panel .le-q-n"); if (t) t.textContent = n ? n.total : "";
  }
  function ribbon(p, ui) {
    if (!L() || !p) return "";
    if (ui && ui.leFind) return searchRow(p, ui);
    var st = L().ensureTabs(p), cur = catOf(p, ui), list = st.tabs.filter(function (t) { return t.cat === cur; }), n = counts(p, ui);
    var chips = list.map(function (t) {
      var on = t.id === st.active, chip = art("chip_" + t.color);
      return '<button type="button" class="le-tab' + (on ? " is-on" : "") + (L().ruleEmpty(t.rule) ? "" : " has-rule") + '" data-act="le-tab" data-id="' + esc(t.id) + '" data-color="' + esc(t.color) + '"' + (chip ? ' style="--le-chip:' + chip + '"' : "") + ' aria-pressed="' + on + '">' +
        ico(t.icon) + '<span class="le-tab-n">' + esc(t.name) + "</span>" + (n ? (n.tabs[t.id] ? '<b class="le-tab-m" title="matches">' + n.tabs[t.id] + "</b>" : "") : (t.items.length ? '<b class="le-tab-c">' + t.items.length + "</b>" : "")) + "</button>";
    }).join("");
    var buy = L().canBuy(p) ? '<button type="button" class="le-tab le-buy" data-act="le-buy-tab" data-cat="' + esc(cur) + '" title="New tab"><b>+</b><span class="le-tab-n">' + fmt(L().tabPrice(p)) + " g</span></button>" : "";
    var act = st.tabs.find(function (t) { return t.id === st.active; });
    var edit = act && act.cat === cur ? '<button type="button" class="btn slim le-btn le-edit" data-act="le-tab-edit" data-id="' + esc(act.id) + '" aria-label="Edit tab">Edit</button>' : "";
    var empty = list.length ? "" : '<span class="le-empty">' + esc(((cfg().cats || []).find(function (c) { return c.id === cur; }) || {}).about || "") + "</span>";
    var q = query(ui);
    var find = q ? '<button type="button" class="le-qpill" data-act="le-find" title="Search"><i class="le-mag" aria-hidden="true"></i><span>' + esc(q) + '</span><b>' + n.total + '</b></button><button type="button" class="le-qx" data-act="le-q-clear" aria-label="Clear search">\u00d7</button>'
      : '<button type="button" class="le-find" data-act="le-find" aria-label="Search"><i class="le-mag" aria-hidden="true"></i></button>';
    return '<div class="le-ribbon"><div class="le-tabs">' + chips + empty + buy + "</div>" + find + edit + "</div>";
  }
  function rankList() {
    var r = (root.ASHBOUND_DATA && (ASHBOUND_DATA.rarity || ASHBOUND_DATA.rarities)) || {}, ranks = r.ranks || [];
    return ranks.length ? ranks.map(function (x) { return [x.id, x.name]; }) : ["common", "magic", "rare", "elite", "epic", "legendary", "fabled", "mythical"].map(function (k) { return [k, k[0].toUpperCase() + k.slice(1)]; });
  }
  function ruleSheet(p, ui) {
    var st = L().ensureTabs(p), t = st.tabs.find(function (x) { return x.id === ui.leRule; }); if (!t) return "";
    var rc = cfg().rules || {}, dr = ui.leRuleDraft || {};
    var rows = (rc.groups || []).map(function (g) {
      var have = dr[g.key] || [];
      return '<div class="le-rrow"><span class="le-rlab">' + esc(g.label) + '</span><div class="le-rchips">' + g.opts.map(function (o) {
        var on = have.indexOf(o[0]) >= 0;
        return '<button type="button" class="le-rchip' + (on ? " is-on" : "") + '" data-act="le-rule-pick" data-key="' + esc(g.key) + '" data-val="' + esc(o[0]) + '" aria-pressed="' + on + '">' + esc(o[1]) + "</button>";
      }).join("") + "</div></div>";
    }).join("");
    var rk = [["", "Any"]].concat(rankList());
    rows += '<div class="le-rrow"><span class="le-rlab">' + esc(rc.rankLabel || "Rank") + '</span><div class="le-rchips">' + rk.map(function (o) {
      var on = (dr.rankMin || "") === o[0];
      return '<button type="button" class="le-rchip' + (on ? " is-on" : "") + '" data-act="le-rule-pick" data-key="rankMin" data-val="' + esc(o[0]) + '" aria-pressed="' + on + '">' + esc(o[1]) + "</button>";
    }).join("") + "</div></div>";
    return '<div class="le-sheet le-rule-sheet" role="dialog" aria-label="' + esc(rc.label || "Send here") + '"><div class="le-sheet-in">' +
      '<div class="le-rhead"><b>' + esc(rc.label || "Send here") + " \u00b7 " + esc(t.name) + '</b><span>' + esc(rc.help || "") + "</span></div>" + rows +
      '<div class="le-sheet-btns"><button type="button" class="btn slim le-btn" data-act="le-rule-close">Cancel</button><button type="button" class="btn slim primary le-btn" data-act="le-rule-save" data-id="' + esc(t.id) + '">Save</button></div>' +
      "</div></div>";
  }
  function sheet(p, ui) {
    if (L() && p && ui && ui.leRule) return ruleSheet(p, ui);
    if (!L() || !p || !ui || !ui.leEdit) return "";
    var st = L().ensureTabs(p), t = st.tabs.find(function (x) { return x.id === ui.leEdit; });
    if (!t) return "";
    var c = cfg(), max = c.nameMax || 14;
    var icons = (c.icons || []).map(function (k) { return '<button type="button" class="le-pick' + (k === t.icon ? " is-on" : "") + '" data-act="le-tab-pick" data-icon="' + esc(k) + '" aria-label="' + esc(k) + '">' + ico(k) + "</button>"; }).join("");
    var tc = (root.ABUiArt && ABUiArt.data && ABUiArt.data() && ABUiArt.data().tabColors) || {};
    var cols = (c.colors || []).map(function (k) { return '<button type="button" class="le-swatch' + (k === t.color ? " is-on" : "") + '" data-act="le-tab-pick" data-color="' + esc(k) + '" style="background:' + esc(tc[k] || "#555") + '" aria-label="' + esc(k) + '"></button>'; }).join("");
    return '<div class="le-sheet" role="dialog" aria-label="Edit tab"><div class="le-sheet-in">' +
      '<label class="le-sheet-row"><span>Name</span><input id="le-tab-name" type="text" maxlength="' + max + '" value="' + esc(ui.leDraft && ui.leDraft.name != null ? ui.leDraft.name : t.name) + '" autocomplete="off" spellcheck="false"></label>' +
      '<div class="le-icons">' + icons + "</div><div class=\"le-swatches\">" + cols + "</div>" +
      '<div class="le-sheet-btns"><button type="button" class="btn slim le-btn le-sendhere" data-act="le-rule-edit" data-id="' + esc(t.id) + '" title="' + esc((cfg().rules || {}).help || "") + '">' + esc((cfg().rules || {}).label || "Send here") + (L().ruleEmpty(t.rule) ? "" : " \u2022") + '</button><span class="le-sp"></span><button type="button" class="btn slim le-btn" data-act="le-tab-edit-close">Cancel</button><button type="button" class="btn slim primary le-btn" data-act="le-tab-save" data-id="' + esc(t.id) + '">Save</button></div>' +
      "</div></div>";
  }
  // ---- actions ---------------------------------------------------------------------------------------------
  function A(name, fn) { if (root.ABLeGame) ABLeGame.ACTS[name] = fn; }
  function install() {
    if (!root.ABLeGame || ABLeGame.ACTS["le-cat"]) return;
    A("le-cat", function (H, d) {
      var p = H.o.player, st = L().ensureTabs(p), first = st.tabs.find(function (t) { return t.cat === d.cat; });
      H.o.ui.leCat = d.cat; H.o.ui.leEdit = null;
      if (first) { L().setActive(p, first.id); H.o.ui.selected = null; }
      return { save: !!first };
    });
    A("le-buy-tab", function (H, d) {
      var p = H.o.player;
      if (!L().canBuy(p)) return { toast: "No room for more tabs.", kind: "bad", save: false };
      var price = L().tabPrice(p);
      if ((p.gold || 0) < price) return { toast: "Not enough gold.", kind: "bad", save: false };
      p.gold -= price;
      var t = L().addTab(p, d.cat || "stash");
      L().setActive(p, t.id); H.o.ui.leCat = t.cat; H.o.ui.selected = null;
      return { toast: t.name + " added.", le: "buy" };
    });
    A("le-find", function (H) { H.o.ui.leFind = true; H.o.ui.leEdit = null; return { save: false, le: "find" }; });
    A("le-find-close", function (H) { var i = root.document.getElementById("le-q"); if (i) H.o.ui.leQ = i.value; H.o.ui.leFind = false; return { save: false }; });
    A("le-q-clear", function (H) { H.o.ui.leQ = ""; H.o.ui.leFind = false; return { save: false }; });
    A("le-q-chip", function (H, d) {
      var i = root.document.getElementById("le-q"), q = i ? i.value : (H.o.ui.leQ || ""), add = L().parseQuery(d.q)[0], key = JSON.stringify(add);
      var words = String(q).split(/[\s,]+/).filter(Boolean), had = false;
      words = words.filter(function (w) { var t = L().parseQuery(w)[0]; if (t && JSON.stringify(t) === key) { had = true; return false; } return true; });
      if (!had) words.push(d.q);
      H.o.ui.leQ = words.join(" "); H.o.ui.leFind = true;
      return { save: false };
    });
    A("le-rule-edit", function (H, d) {
      var t = L().ensureTabs(H.o.player).tabs.find(function (x) { return x.id === d.id; }); if (!t) return { save: false };
      var r = t.rule || {};
      H.o.ui.leRule = t.id; H.o.ui.leEdit = null; H.o.ui.leDraft = null;
      H.o.ui.leRuleDraft = { slots: (r.slots || []).slice(), kinds: (r.kinds || []).slice(), families: (r.families || []).slice(), rankMin: r.rankMin || "" };
      return { save: false };
    });
    A("le-rule-close", function (H) { H.o.ui.leRule = null; H.o.ui.leRuleDraft = null; return { save: false }; });
    A("le-rule-pick", function (H, d) {
      var dr = H.o.ui.leRuleDraft; if (!dr) return { save: false };
      if (d.key === "rankMin") { dr.rankMin = d.val || ""; return { save: false }; }
      var g = ((cfg().rules || {}).groups || []).find(function (x) { return x.key === d.key; }); if (!g || !g.opts.some(function (o) { return o[0] === d.val; })) return { save: false };
      var a = dr[d.key] || (dr[d.key] = []), i = a.indexOf(d.val); if (i >= 0) a.splice(i, 1); else a.push(d.val);
      return { save: false };
    });
    A("le-rule-save", function (H, d) {
      var t = L().ensureTabs(H.o.player).tabs.find(function (x) { return x.id === d.id; }), dr = H.o.ui.leRuleDraft || {};
      if (!t) return { save: false };
      var r = {}; ["slots", "kinds", "families"].forEach(function (k) { if (dr[k] && dr[k].length) r[k] = dr[k].slice(); });
      if (dr.rankMin) r.rankMin = dr.rankMin;
      t.rule = L().ruleEmpty(r) ? null : r;
      H.o.ui.leRule = null; H.o.ui.leRuleDraft = null;
      return { le: "rule" };
    });
    function fits(H) { return function (tab, it) { return !!H.ca(tab, it); }; }
    A("le-quick", function (H, d) {
      var p = H.o.player, w = H.o.world; if (!w || w.kind !== "town") return { save: false };
      if (d.from === "inventory") {
        var it = p.inventory.items.find(function (x) { return x.uid === d.uid; }); if (!it) return { save: false };
        var t = L().routeTab(p, it, fits(H)); if (!t) return { toast: "No room.", kind: "bad", save: false };
        H.X(p.inventory, it.uid); H.q(t, it); H.o.ui.selected = null;
        var r = { le: "quick", tab: t.id }; if (t !== p.stash) r.toast = "Sent to " + t.name + "."; return r;
      }
      if (d.from === "stash") {
        var s = p.stash.items.find(function (x) { return x.uid === d.uid; }); if (!s) return { save: false };
        if (!H.ca(p.inventory, s)) return { toast: "No room.", kind: "bad", save: false };
        H.X(p.stash, s.uid); H.q(p.inventory, s); H.o.ui.selected = null; return { le: "quick", tab: "inventory" };
      }
      return { save: false };
    });
    // the card's "To stash" follows the same rules; falls through to the game's own move when no other tab claims it
    ABLeGame.HOOK["to-stash"] = function (H) {
      var s = H.Ie && H.Ie(); if (!s || s.where !== "inventory" || !s.item) return null;
      var p = H.o.player, t = L().routeTab(p, s.item, fits(H)); if (!t || t === p.stash) return null;
      H.X(p.inventory, s.item.uid); H.q(t, s.item); H.o.ui.selected = null;
      return { toast: "Sent to " + t.name + ".", le: "quick", tab: t.id };
    };
    // Sort: the chosen mode (player.leSort) drives every Sort tap; size = the game's own sort
    function gridName(H, d) { var u = H.o.ui; return d.grid || (u.tab === "stash" ? "stash" : u.tab === "shared" ? "shared" : "inventory"); }
    function sortNow(H, d, by) {
      var g = gridName(H, d), grid = H.Mn(g); if (!grid) return { save: false };
      var ok = L().sortGrid(grid, by, H.ca); if (!ok) { H.hs(grid); }
      H.Pa(g, grid);
      var nm = ((cfg().sort || {}).modes || []).find(function (m) { return m[0] === by; });
      return { toast: ok && nm ? "Sorted by " + nm[1].toLowerCase() + "." : "Items sorted.", le: "sort", by: ok ? by : "size" };
    }
    ABLeGame.HOOK["sort"] = function (H, d) { var by = H.o.player && H.o.player.leSort; return by && by !== "size" ? sortNow(H, d, by) : null; };
    A("le-sort-by", function (H, d) {
      closeSortMenu();
      var modes = ((cfg().sort || {}).modes || []).map(function (m) { return m[0]; }); if (modes.indexOf(d.by) < 0) return { save: false };
      H.o.player.leSort = d.by;
      if (d.by === "size") { var g = gridName(H, d), grid = H.Mn(g); H.hs(grid); H.Pa(g, grid); return { toast: "Sorted by size.", le: "sort", by: "size" }; }
      return sortNow(H, d, d.by);
    });
    A("le-sort-close", function () { closeSortMenu(); return { save: false, touch: false }; });
    A("le-tab-edit", function (H, d) { H.o.ui.leEdit = d.id; H.o.ui.leDraft = null; return { save: false }; });
    A("le-tab-edit-close", function (H) { H.o.ui.leEdit = null; H.o.ui.leDraft = null; return { save: false }; });
    A("le-tab-pick", function (H, d) {
      var inp = root.document.getElementById("le-tab-name"), dr = H.o.ui.leDraft || (H.o.ui.leDraft = {});
      if (inp) dr.name = inp.value;
      if (d.icon) dr.icon = d.icon; if (d.color) dr.color = d.color;
      return { save: false };
    });
    A("le-tab-save", function (H, d) {
      var p = H.o.player, st = L().ensureTabs(p), t = st.tabs.find(function (x) { return x.id === d.id; }), c = cfg(), dr = H.o.ui.leDraft || {};
      if (!t) return { save: false };
      var inp = root.document.getElementById("le-tab-name"), nm = String(inp ? inp.value : (dr.name != null ? dr.name : t.name)).replace(/\s+/g, " ").trim().slice(0, c.nameMax || 14);
      if (nm) t.name = nm;
      if (dr.icon && (c.icons || []).indexOf(dr.icon) >= 0) t.icon = dr.icon;
      if (dr.color && (c.colors || []).indexOf(dr.color) >= 0) t.color = dr.color;
      H.o.ui.leEdit = null; H.o.ui.leDraft = null;
      return { le: "edit" };
    });
  }
  // the sheet shows the draft icon/colour while it is open
  function draftView(p, ui) {
    if (!ui || !ui.leEdit || !ui.leDraft) return sheet(p, ui);
    var st = L().ensureTabs(p), t = st.tabs.find(function (x) { return x.id === ui.leEdit; }); if (!t) return "";
    var keep = { icon: t.icon, color: t.color };
    if (ui.leDraft.icon) t.icon = ui.leDraft.icon; if (ui.leDraft.color) t.color = ui.leDraft.color;
    var h = sheet(p, ui); t.icon = keep.icon; t.color = keep.color; return h;
  }
  // plain look (works with ?leui=0); js/ab-leui.js paints it when the art is in
  function baseCss() {
    if (!root.document || root.document.getElementById("ab-lestash-style")) return;
    var st = root.document.createElement("style"); st.id = "ab-lestash-style";
    st.textContent = [
      ".le-stash{position:relative}",
      ".le-rail{display:flex;flex-direction:column;gap:4px;min-width:0}",
      ".le-cat{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;min-height:44px;padding:2px;border:1px solid var(--line-dim,#5a4630);border-radius:6px;background:rgba(0,0,0,.25);color:inherit;font-size:9px;line-height:1.05}",
      ".le-cat.is-on{border-color:var(--line,#c8a46a);background:rgba(200,120,50,.18)}",
      ".le-cat-c{position:absolute;top:1px;right:3px;font-size:8px;opacity:.75}",
      ".le-ti{display:inline-block;width:24px;height:24px;background:center/contain no-repeat;font-style:normal;text-align:center;line-height:24px;font-weight:700}",
      ".le-ribbon{display:flex;align-items:center;gap:6px;min-width:0}",
      ".le-tabs{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none;min-width:0;flex:1 1 auto;align-items:center}",
      ".le-tabs::-webkit-scrollbar{display:none}",
      ".le-tab{position:relative;display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;min-height:36px;padding:0 10px 0 6px;border:1px solid var(--line-dim,#5a4630);border-radius:6px;background:rgba(0,0,0,.3);color:inherit;font-size:12px;white-space:nowrap}",
      ".le-tab.is-on{border-color:var(--line,#c8a46a);box-shadow:inset 0 -2px 0 #ff9a3c}",
      ".le-tab .le-ti{width:20px;height:20px;line-height:20px}",
      ".le-tab-c{font-size:9px;opacity:.7}",
      ".le-empty{font-size:11px;opacity:.7;padding:0 6px}",
      ".le-find,.le-qx{flex:0 0 auto;min-width:40px;min-height:36px;display:grid;place-items:center;border:1px solid var(--line-dim,#5a4630);border-radius:6px;background:rgba(0,0,0,.3);color:inherit;font-size:16px}",
      ".le-mag{display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-radius:50%;position:relative;opacity:.85}",
      ".le-mag::after{content:'';position:absolute;width:2px;height:7px;background:currentColor;right:-4px;bottom:-6px;transform:rotate(-45deg)}",
      ".le-qpill{flex:0 1 auto;min-width:0;max-width:150px;min-height:36px;display:inline-flex;align-items:center;gap:6px;padding:0 8px;border:1px solid #ffd38a;border-radius:6px;background:rgba(255,190,90,.12);color:inherit;font-size:12px}",
      ".le-qpill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".le-qpill b,.le-tab-m,.le-cat-m{min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:#ffd38a;color:#1a1006;font-size:10px;line-height:16px;text-align:center;font-weight:700}",
      ".le-cat-m{position:absolute;top:-4px;left:-4px;font-size:10px}",
      ".le-searching{flex-wrap:nowrap}",
      ".le-q{flex:1 1 100px;min-width:84px;display:flex;align-items:center;gap:6px;min-height:36px;padding:0 8px;border:1px solid #ffd38a;border-radius:6px;background:#0c0806}",
      ".le-q input{flex:1;min-width:0;border:0;background:none;color:inherit;font-size:16px;outline:none;padding:0}",
      ".le-q-n{min-width:18px;font-size:12px;color:#ffd38a;text-align:center}",
      ".le-qchips{display:flex;gap:3px;flex:0 0 auto;overflow-x:auto;scrollbar-width:none}",
      ".le-qchips::-webkit-scrollbar{display:none}",
      ".le-find-done{flex:0 0 auto;min-width:40px;min-height:36px;border:1px solid #ffd38a;border-radius:6px;background:rgba(255,190,90,.16);color:#ffe2a8;font-size:17px;font-weight:700}",
      ".le-qchip{flex:0 0 auto;min-height:36px;padding:0 7px;border:1px solid var(--line-dim,#5a4630);border-radius:18px;background:rgba(0,0,0,.3);color:inherit;font-size:11px}",
      ".le-qchip.is-on{border-color:#ffd38a;background:rgba(255,190,90,.2);color:#ffe2a8}",
      ".stash-bag .gitem.le-dim{opacity:.26;filter:grayscale(.85)}",
      ".stash-bag .gitem.le-hit{box-shadow:0 0 0 2px #ffd38a,0 0 8px rgba(255,200,110,.6)}",
      ".le-tab.has-rule::after{content:'';position:absolute;left:3px;bottom:3px;width:0;height:0;border:3px solid transparent;border-left:5px solid #ffd38a;border-right:0}",
      ".le-rule-sheet{inset:0 !important;width:auto !important;max-width:none !important;grid-column:1/-1;grid-row:1/-1}",
      ".le-rule-sheet .le-sheet-in{gap:5px}",
      ".le-rhead{display:flex;flex-direction:column;gap:1px;font-size:11px;line-height:1.25;opacity:.92}",
      ".le-rhead b{font-size:13px;color:#ffe2a8}",
      ".le-rrow{display:flex;align-items:flex-start;gap:6px}",
      ".le-rlab{flex:0 0 64px;font-size:11px;padding-top:9px;opacity:.8}",
      ".le-rchips{display:flex;flex-wrap:wrap;gap:3px;min-width:0}",
      ".le-rchip{min-height:32px;padding:0 7px;border:1px solid var(--line-dim,#5a4630);border-radius:16px;background:rgba(0,0,0,.3);color:inherit;font-size:11px}",
      ".le-rchip.is-on{border-color:#ffd38a;background:rgba(255,190,90,.2);color:#ffe2a8}",
      ".le-sp{flex:1}",
      ".le-sortmenu{position:fixed;z-index:9000;pointer-events:auto;display:flex;flex-direction:column;gap:3px;min-width:120px;padding:6px;background:rgba(14,10,7,.96);border:1px solid var(--line,#c8a46a);border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.7)}",
      ".le-sortmenu-h{font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;padding:0 4px 2px}",
      ".le-sortopt{min-height:40px;padding:0 12px;text-align:left;border:1px solid var(--line-dim,#5a4630);border-radius:4px;background:rgba(0,0,0,.35);color:inherit;font-size:13px}",
      ".le-sortopt.is-on{border-color:#ffd38a;color:#ffe2a8;box-shadow:inset 3px 0 0 #ffd38a}",
      ".le-sheet{position:absolute;z-index:30;top:0;right:0;bottom:0;width:min(360px,100%);display:flex;align-items:stretch;background:rgba(10,7,5,.92);border:1px solid var(--line,#c8a46a);border-radius:8px}",
      ".le-sheet-in{display:flex;flex-direction:column;gap:8px;padding:10px;width:100%;overflow:auto}",
      ".le-sheet-row{display:flex;align-items:center;gap:8px;font-size:12px}",
      ".le-sheet-row input{flex:1;min-height:36px;font-size:16px;padding:0 8px;background:#0c0806;color:inherit;border:1px solid var(--line-dim,#5a4630);border-radius:4px}",
      ".le-icons{display:grid;grid-template-columns:repeat(8,1fr);gap:4px}",
      ".le-pick{min-height:36px;display:grid;place-items:center;border:1px solid transparent;border-radius:4px;background:rgba(0,0,0,.3)}",
      ".le-pick.is-on,.le-swatch.is-on{border-color:#ffd38a;box-shadow:0 0 0 1px #ffd38a}",
      ".le-swatches{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}",
      ".le-swatch{min-height:30px;border:1px solid #000;border-radius:4px}",
      ".le-sheet-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:auto}",
      ".le-sheet-btns .btn{min-height:44px;min-width:96px}"
    ].join("");
    (root.document.head || root.document.documentElement).appendChild(st);
  }
  if (root.document) root.document.addEventListener("input", function (e) {
    if (!e.target || e.target.id !== "le-q") return; var H = root.ABLeHost; if (!H || !H.o) return;
    H.o.ui.leQ = e.target.value; applyLive();
  });
  // long-press (or right-click) a Sort button: small "Sort by" menu anchored to it, inside #panel so the game's click routing sees it
  function closeSortMenu() { if (root.document) root.document.querySelectorAll(".le-sortmenu").forEach(function (m) { m.remove(); }); }
  function openSortMenu(btn) {
    closeSortMenu();
    var H = root.ABLeHost, panel = root.document.getElementById("panel"); if (!H || !panel) return;
    var cur = (H.o.player && H.o.player.leSort) || "size", r = btn.getBoundingClientRect(), m = root.document.createElement("div");
    m.className = "le-sortmenu"; m.setAttribute("role", "menu");
    m.innerHTML = '<span class="le-sortmenu-h">Sort by</span>' + ((cfg().sort || {}).modes || []).map(function (x) {
      return '<button type="button" role="menuitemradio" class="le-sortopt' + (x[0] === cur ? " is-on" : "") + '" aria-checked="' + (x[0] === cur) + '" data-act="le-sort-by" data-by="' + esc(x[0]) + '" data-grid="' + esc(btn.dataset.grid || "") + '">' + esc(x[1]) + "</button>";
    }).join("");
    (panel.parentElement || panel).appendChild(m); // outside #panel: a child there reflows the gear board
    var mr = m.getBoundingClientRect(), safe = (root.ABSafeArea && ABSafeArea.insets && ABSafeArea.insets()) || {};
    var left = Math.min(Math.max(r.right - mr.width, (safe.left || 0) + 6), root.innerWidth - (safe.right || 0) - mr.width - 6);
    var top = r.bottom + 4; if (top + mr.height > root.innerHeight - (safe.bottom || 0) - 6) top = Math.max(6, r.top - mr.height - 4);
    m.style.left = Math.round(left) + "px"; m.style.top = Math.round(top) + "px";
  }
  var hold = null, eatSort = 0;
  if (root.document) {
    root.document.addEventListener("pointerdown", function (e) {
      var b = e.target && e.target.closest && e.target.closest('#panel [data-act="sort"]');
      if (!e.target.closest || !e.target.closest(".le-sortmenu")) { if (!b) closeSortMenu(); }
      if (!b) return;
      var x = e.clientX, y = e.clientY, ms = (cfg().sort || {}).holdMs || 450;
      clearTimeout(hold && hold.t);
      hold = { b: b, x: x, y: y, t: setTimeout(function () { hold = null; eatSort = Date.now(); openSortMenu(b); }, ms) };
    }, true);
    root.document.addEventListener("pointermove", function (e) { if (hold && Math.abs(e.clientX - hold.x) + Math.abs(e.clientY - hold.y) > 12) { clearTimeout(hold.t); hold = null; } }, true);
    ["pointerup", "pointercancel"].forEach(function (n) { root.document.addEventListener(n, function () { if (hold) { clearTimeout(hold.t); hold = null; } }, true); });
    root.document.addEventListener("click", function (e) {
      var b = e.target && e.target.closest && e.target.closest('#panel [data-act="sort"]');
      if (b && eatSort && Date.now() - eatSort < 1500) { eatSort = 0; e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    root.document.addEventListener("contextmenu", function (e) {
      var b = e.target && e.target.closest && e.target.closest('#panel [data-act="sort"]'); if (!b) return;
      e.preventDefault(); openSortMenu(b);
    }, true);
  }
  // double-tap a pack item (town) = quick store by the Send here rules; double-tap a stash item = back to the pack
  var lastTap = { uid: null, t: 0 };
  if (root.document) root.document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("#panel .gitem[data-uid][data-from]"); if (!b) return;
    var from = b.dataset.from, H = root.ABLeHost; if ((from !== "inventory" && from !== "stash") || !H || !H.o || !H.o.world || H.o.world.kind !== "town") return;
    if (from === "stash" && H.o.ui.tab !== "stash") return;
    var now = Date.now(), ms = (cfg().rules || {}).doubleTapMs || 320;
    if (lastTap.uid === b.dataset.uid && now - lastTap.t < ms) {
      lastTap.uid = null; e.preventDefault(); e.stopImmediatePropagation();
      H.re("le-quick", { uid: b.dataset.uid, from: from }); return;
    }
    lastTap = { uid: b.dataset.uid, t: now };
  }, true);
  if (root.document) root.document.addEventListener("keydown", function (e) { if (e.target && e.target.id === "le-q" && e.key === "Enter") e.target.blur(); });
  if (root.document) { if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", baseCss); else baseCss(); }
  install();
  root.ABLeStashUI = { openSortMenu: openSortMenu, closeSortMenu: closeSortMenu, rail: rail, ribbon: ribbon, sheet: draftView, install: install, hitCls: hitCls, applyLive: applyLive };
})(typeof window !== "undefined" ? window : globalThis);
