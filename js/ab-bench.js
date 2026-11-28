/* v84q Bench overlay: one full-screen panel with tabs (Awaken, Forge, Sockets, Salvage ...). Each feature registers a tab:
   ABBench.register({id, label, order, html(state) -> string, onAct(act, el, state) -> {toast, kind}|null}).
   Opened from the bench NPC panel ("The bench"), from an item popup, or ABBench.open(tabId, {uid}). Stays inside the safe
   area (--safe-l/--safe-r from js/ab-safearea.js), so it clears the Dynamic Island in both landscape orientations.
   Labels: data/power.json bench. */
(function (root) {
  "use strict";
  var tabs = [], st = { open: false, tab: null, uid: null }, el = null, css = false;
  function D() { return root.ASHBOUND_DATA || {}; }
  function cfg() { return ((D().power || {}).bench) || {}; }
  function S() { return root.ASHBOUND && ASHBOUND.state; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function style() {
    if (css || !root.document) return; css = true;
    var s = document.createElement("style"); s.id = "ab-bench-style";
    s.textContent = [
      "#ab-bench{position:fixed;z-index:60;top:calc(var(--safe-t,0px) + 6px);bottom:calc(var(--safe-b,0px) + 6px);left:calc(var(--safe-l,0px) + 8px);right:calc(var(--safe-r,0px) + 8px);",
      "background:#1b1410;border:1px solid #6b5536;border-radius:12px;color:#efe4d2;font:13px/1.3 'Noto Sans',system-ui,sans-serif;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.6)}",
      "#ab-bench[hidden]{display:none}",
      "#ab-bench .bh{display:flex;align-items:center;gap:8px;padding:6px 10px 4px}",
      "#ab-bench .bh h2{margin:0;font:700 17px Georgia,serif;flex:0 0 auto}",
      "#ab-bench .bt{display:flex;gap:5px;flex:1 1 auto;overflow-x:auto;scrollbar-width:none}",
      "#ab-bench .bt button{border:1px solid #6b5536;border-radius:9px;padding:4px 10px;font-size:12px;background:#2a1f17;color:#efe4d2;white-space:nowrap}",
      "#ab-bench .bt button.on{background:#d9772e;color:#1b0f06;font-weight:700}",
      "#ab-bench .bx{width:34px;height:30px;border:1px solid #6b5536;border-radius:8px;background:#2a1f17;color:#ddd;font-size:16px;flex:0 0 auto}",
      "#ab-bench .wallet{font-size:11px;color:#c9b79c;padding:0 10px 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "#ab-bench .bb{flex:1 1 auto;overflow-y:auto;padding:4px 10px 6px;-webkit-overflow-scrolling:touch}",
      "#ab-bench .card{border:1px solid #4a3a28;border-radius:10px;background:#211812;padding:7px 9px;margin-bottom:7px}",
      "#ab-bench .row{display:flex;align-items:center;gap:8px}",
      "#ab-bench .ico{width:var(--ab-ico-w,58px);height:var(--ab-ico-h,56px);flex:0 0 var(--ab-ico-w,58px);display:flex;align-items:center;justify-content:center;position:relative;overflow:visible}",
      "#ab-bench .ico svg,#ab-bench .ico img,#ab-bench .fpick button svg,#ab-bench .fpick button img{max-width:100%;max-height:100%;width:100%;height:100%;object-fit:contain;display:block}",
      "#ab-bench .ico>.item-ico,#ab-bench .fpick button>.item-ico{position:relative;z-index:1}",
      "#ab-bench .nm{font-weight:700}#ab-bench .mut{color:#9a8f80;font-size:11px}#ab-bench .ok{color:#9be8a3}#ab-bench .no{color:#ff9a8a}",
      "#ab-bench .btn2{border:1px solid #ffb060;border-radius:8px;padding:4px 10px;background:#3a2414;color:#ffcf96;font-size:12px;white-space:nowrap}",
      "#ab-bench .btn2.pri{background:#d9772e;color:#1b0f06;font-weight:700}#ab-bench .btn2[disabled]{opacity:.45}",
      "#ab-bench .bar{height:6px;border-radius:3px;background:#3a2c20;overflow:hidden;margin-top:3px}#ab-bench .bar i{display:block;height:100%;background:#d9772e}",
      "#ab-bench .grid2{display:grid;grid-template-columns:1fr 1fr;gap:7px}","#ab-bench .rw-cmp{max-height:72px;overflow-y:auto;-webkit-overflow-scrolling:touch}",
      "#ab-bench .fpick{display:flex;gap:5px;overflow-x:auto;padding:2px 0 2px;scrollbar-width:thin}",
      "#ab-bench .fpick button{flex:0 0 auto;width:var(--ab-ico-w,58px);height:var(--ab-ico-h,56px);border:1px solid #4a3a28;border-radius:8px;background:#211812;position:relative;padding:2px;display:flex;align-items:center;justify-content:center}",
      "#ab-bench .fpick button.on{border-color:#ffb060;box-shadow:0 0 0 1px #ffb060 inset}",
      "#ab-bench .fpick .w{position:absolute;left:2px;top:1px;font-size:8.5px;color:#ffcf96}",
      "#ab-bench .chip{display:inline-block;font-size:10.5px;border:1px solid #5a4630;border-radius:20px;padding:1px 7px;color:#c9b79c;margin:1px 2px 1px 0}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(s);
  }
  function register(t) { tabs = tabs.filter(function (x) { return x.id !== t.id; }); tabs.push(t); tabs.sort(function (a, b) { return (a.order || 0) - (b.order || 0); }); if (st.open) render(); }
  function walletLine() {
    var s = S(); if (!s || !root.ABAwaken) return "";
    return ABAwaken.walletText(s.player);
  }
  function render() {
    style();
    if (!el) {
      el = document.createElement("div"); el.id = "ab-bench"; el.hidden = true; document.body.appendChild(el);
      el.addEventListener("click", onClick);
    }
    if (!st.open) { el.hidden = true; return; }
    var s = S(), tab = tabs.find(function (t) { return t.id === st.tab; }) || tabs[0];
    if (!tab) return;
    st.tab = tab.id;
    var title = cfg().title || "The bench", oldBb = el.querySelector(".bb"), keep = oldBb && el.getAttribute("data-tab") === tab.id ? oldBb.scrollTop : 0;
    var body = ""; try { body = tab.html(s, st) || ""; } catch (e) { body = '<div class="no">' + esc(e.message) + "</div>"; }
    el.innerHTML = '<div class="bh"><h2>' + esc(title) + '</h2><div class="bt">' + tabs.map(function (t) { return '<button type="button" data-bench-tab="' + esc(t.id) + '" class="' + (t.id === tab.id ? "on" : "") + '">' + esc(t.label) + "</button>"; }).join("") +
      '</div><button type="button" class="bx" data-bench-close aria-label="Close">\u00d7</button></div><div class="wallet">' + walletLine() + '</div><div class="bb">' + body + "</div>";
    el.hidden = false; el.setAttribute("data-tab", tab.id);
    var bb = el.querySelector(".bb"); if (bb && keep) bb.scrollTop = keep; // keep the place after an action
  }
  function toast(r) {
    var s = S(); if (!r || !s) return;
    if (r.toast) s.toasts.push({ text: r.toast, t: 3, kind: r.kind || (r.ok === false ? "bad" : "good") });
    if (root.ASHBOUND && ASHBOUND.recalc) ASHBOUND.recalc();
    if (s.ui) s.ui.rev++;
    s.pendingSave = true;
  }
  function onClick(ev) {
    var t = ev.target.closest("button,[data-bench-act]"); if (!t || !el.contains(t)) return;
    if (t.hasAttribute("data-bench-close")) { close(); return; }
    var tb = t.getAttribute("data-bench-tab"); if (tb) { st.tab = tb; render(); return; }
    var act = t.getAttribute("data-bench-act"); if (!act || t.disabled) return;
    var tab = tabs.find(function (x) { return x.id === st.tab; });
    var r = null; try { r = tab && tab.onAct ? tab.onAct(act, t, S(), st) : null; } catch (e) { r = { ok: false, toast: e.message, kind: "bad" }; }
    toast(r); render();
  }
  function open(tab, opts) { st.open = true; st.tab = tab || st.tab || (tabs[0] && tabs[0].id); st.uid = opts && opts.uid || null; var s = S(); if (s && s.ui) { s.ui.selected = null; } render(); }
  function close() { st.open = false; render(); var s = S(); if (s && s.ui) s.ui.rev++; }
  /* the bench NPC panel and item popups get buttons with data-bench-open="tab" [data-uid] */
  if (root.document) document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("[data-bench-open]"); if (!t) return;
    ev.preventDefault(); ev.stopPropagation(); open(t.getAttribute("data-bench-open"), { uid: t.getAttribute("data-uid") });
  }, true);
  function buttons() {
    return '<div class="bench-open-row" style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 8px">' + tabs.map(function (t) {
      return '<button type="button" class="btn slim" data-bench-open="' + esc(t.id) + '">' + esc(t.label) + "</button>"; }).join("") + "</div>";
  }
  // v84q1: icon box size from data/power.json bench.icon (matches the compact doll slot for that item)
  function iconSize(it, kind) {
    var ic = (cfg().icon || {}), def = ic["default"] || [58, 56];
    var bag = kind === "pick" ? (ic.pick || ic.slots || {}) : (ic.slots || {});
    var k = it && (it.slot || it.kind) || "default", s = bag[k] || (kind === "pick" && ic.pick && ic.pick["default"]) || def;
    return { w: s[0], h: s[1] };
  }
  function iconStyle(it, kind) {
    var s = iconSize(it, kind);
    return "--ab-ico-w:" + s.w + "px;--ab-ico-h:" + s.h + "px;width:" + s.w + "px;height:" + s.h + "px;flex-basis:" + s.w + "px";
  }
  function itemCls(it) { return (root.ABCraft && ABCraft.cssClass ? ABCraft.cssClass(it) : ""); }
  function icoExtras(it) {
    var x = "";
    try { if (root.ABAshenMark && ABAshenMark.html) x += ABAshenMark.html(it, "badge"); } catch (e) {}
    try { if (root.ABRarityGlow && ABRarityGlow.iconHtml) x += ABRarityGlow.iconHtml(it); } catch (e) {}
    return x;
  }
  function icoWrap(inner, it) {
    return '<div class="ico ' + esc(itemCls(it)) + '" style="' + iconStyle(it) + '">' + (inner || "") + icoExtras(it) + "</div>";
  }
  function pickCls(it, extra) { return ((extra || "") + " " + itemCls(it)).trim(); }
  root.ABBench = { register: register, open: open, close: close, render: render, isOpen: function () { return st.open; }, tab: function () { return st.tab; }, state: st, esc: esc, buttons: buttons, toast: toast, tabs: function () { return tabs.slice(); },
    iconSize: iconSize, iconStyle: iconStyle, icoWrap: icoWrap, pickCls: pickCls, itemCls: itemCls };
})(typeof window !== "undefined" ? window : self);
