/* le-ui (v85) step 16: makings. "Stow makings" (Koto) moves gems, runes and lenses out of the pack into counts
   (player.mats {"rune:an":3, ...}); tapping a count puts one back in the pack. player.matsProto keeps one copy of each
   kind (minus uid/x/y) so a taken-out item is the same item that went in. Items already in the cube or the stash are
   left alone, so the cube still finds every rune it is given; stowed ones are taken out first. Old saves: no mats = {}. */
(function (root) {
  "use strict";
  var KINDS = ["gem", "rune", "lens"], seq = 0;
  function key(it) {
    if (!it || KINDS.indexOf(it.rarity) < 0 || (it.w || 1) !== 1 || (it.h || 1) !== 1 || (it.sockets && it.sockets.length)) return null;
    var id = it.gemId || it.runeId || it.lensId || it.baseId || it.name; return id ? it.rarity + ":" + id : null;
  }
  function proto(it) { var c = JSON.parse(JSON.stringify(it)); delete c.uid; delete c.x; delete c.y; delete c.fresh; delete c.isNew; return c; }
  function ensure(p) { if (!p.mats || typeof p.mats !== "object") p.mats = {}; if (!p.matsProto || typeof p.matsProto !== "object") p.matsProto = {}; return p.mats; }
  function cfg() { return (root.ABLeData && ABLeData.stashCfg && ABLeData.stashCfg().mats) || {}; }
  function stow(H) {
    var p = H.o.player, m = ensure(p), n = 0, sel = H.o.ui.selected;
    p.inventory.items.slice().forEach(function (it) {
      var k = key(it); if (!k) return;
      H.X(p.inventory, it.uid); m[k] = (m[k] || 0) + 1; if (!p.matsProto[k]) p.matsProto[k] = proto(it); n++;
      if (sel && sel.uid === it.uid) H.o.ui.selected = null;
    });
    return n;
  }
  function take(H, k) {
    var p = H.o.player, m = ensure(p); if (!(m[k] > 0) || !p.matsProto[k]) return { toast: "None left.", kind: "bad", save: false };
    var it = JSON.parse(JSON.stringify(p.matsProto[k])); it.uid = "mk" + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
    it.w = it.w || 1; it.h = it.h || 1;
    if (!H.q(p.inventory, it)) return { toast: "No room.", kind: "bad", save: false };
    if (--m[k] <= 0) delete m[k];
    return { le: "mat-take", uid: it.uid };
  }
  function total(p) { var m = (p && p.mats) || {}; return Object.keys(m).reduce(function (s, k) { return s + (m[k] || 0); }, 0); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function html() {
    var H = root.ABLeHost; if (!H || !H.o || !H.o.player) return "";
    var p = H.o.player, m = ensure(p), c = cfg();
    var ks = Object.keys(m).filter(function (k) { return m[k] > 0; }).sort(function (a, b) { return KINDS.indexOf(a.split(":")[0]) - KINDS.indexOf(b.split(":")[0]) || a.localeCompare(b); });
    var any = p.inventory.items.some(function (it) { return !!key(it); });
    var chips = ks.map(function (k) {
      var pr = p.matsProto[k] || {}, col = pr.color || (pr.rarity === "rune" ? "#ff8a4a" : "#bfae92");
      var ico = ""; try { ico = H.bt ? H.bt(pr) : ""; } catch (e) { ico = ""; }
      return '<button type="button" class="le-mat le-mat-' + esc(pr.rarity) + '" data-act="le-mat-take" data-k="' + esc(k) + '" title="' + esc(pr.name || k) + '" aria-label="' + esc((pr.name || k) + ", " + m[k]) + '" style="--mc:' + esc(col) + '">' +
        '<span class="le-mat-i">' + (ico || '<i class="le-mat-dot"></i>') + '</span><b>' + m[k] + "</b></button>";
    }).join("");
    return '<button class="btn slim le-btn le-stow" data-act="le-mats-stow" title="' + esc(c.about || "") + '"' + (any ? "" : " disabled") + ">" + esc(c.label || "Stow makings") + "</button>" +
      (chips ? '<div class="le-mats" aria-label="' + esc(c.title || "Makings") + '">' + chips + "</div>" : "");
  }
  function install() {
    if (!root.ABLeGame || ABLeGame.ACTS["le-mats-stow"]) return;
    ABLeGame.ACTS["le-mats-stow"] = function (H) { var n = stow(H); return n ? { toast: "Stowed " + n + ".", le: "stow", n: n } : { toast: "No makings in the pack.", save: false }; };
    ABLeGame.ACTS["le-mat-take"] = function (H, d) { return take(H, d.k); };
  }
  function css() {
    if (!root.document || root.document.getElementById("ab-lemats-style")) return;
    var s = root.document.createElement("style"); s.id = "ab-lemats-style";
    s.textContent = [
      ".le-stow{white-space:nowrap}",
      ".le-stow[disabled]{opacity:.45}",
      ".le-mats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px;width:100%}",
      ".le-mat{position:relative;display:flex;align-items:center;justify-content:center;gap:3px;min-height:36px;padding:0 3px;border:1px solid color-mix(in srgb,var(--mc,#bfae92) 45%,#3a2c1f);border-radius:4px;background:rgba(0,0,0,.4);color:#efe4cc;font-size:12px}",
      ".le-mat-i{display:inline-grid;place-items:center;width:22px;height:22px;overflow:hidden}",
      ".le-mat-i > *{max-width:22px;max-height:22px}",
      ".le-mat-dot{display:block;width:12px;height:12px;border-radius:50%;background:var(--mc,#bfae92);box-shadow:0 0 6px var(--mc,#bfae92)}",
      ".le-mat b{font-weight:700;min-width:12px;text-align:left}"
    ].join("");
    (root.document.head || root.document.documentElement).appendChild(s);
  }
  if (root.document) { if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", css); else css(); }
  install();
  root.ABLeMats = { key: key, stow: stow, take: take, total: total, html: html, install: install };
})(typeof window !== "undefined" ? window : globalThis);
