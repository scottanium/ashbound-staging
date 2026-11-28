/* v84o (TTPC-51): small ember tier marker for Ashen (Mythical-tier) uniques. Ashen uniques lost their "Ashen " name prefix
   (each has its own name now), so a glowing ember dot marks them: before the name in the tooltip, in a corner of the icon in the
   bag / gear slots / tooltip icon, and a glyph before the ground label. Look and labels: data/ui.json "ashenMark". */
(function (root) {
  var done = false;
  function cfg() { var u = (root.ASHBOUND_DATA && root.ASHBOUND_DATA.ui) || {}; return u.ashenMark || {}; }
  function isAshen(it) {
    if (!it) return false;
    if (root.ABAshen && ABAshen.isAshen) return !!ABAshen.isAshen(it);
    return !!it.ashen;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function css() {
    if (done || !root.document) return; done = true;
    var c = cfg(), col = c.colors || {}, core = col.core || "#fff1c2", mid = col.mid || "#ff9a3a", edge = col.edge || "#c8360f", halo = col.halo || "rgba(255,110,30,.85)";
    var ball = "background:radial-gradient(circle at 40% 38%," + core + " 0 18%," + mid + " 45%," + edge + " 78%,rgba(120,20,0,.9) 100%);box-shadow:0 0 " + (c.haloPx || 4) + "px " + halo + ";border-radius:50%;display:inline-block;flex:none;pointer-events:none;";
    var s = root.document.createElement("style"); s.id = "ab-ashenmark-style";
    s.textContent =
      ".ember-mark{" + ball + "width:" + (c.tipPx || 9) + "px;height:" + (c.tipPx || 9) + "px;margin-right:6px;vertical-align:middle;position:relative;top:-1px}" +
      ".ember-badge{" + ball + "position:absolute;left:" + (c.badgeInset || 3) + "px;bottom:" + (c.badgeInset || 3) + "px;width:" + (c.badgePx || 7) + "px;height:" + (c.badgePx || 7) + "px;z-index:3}" +
      ".detail-ico .ember-badge{left:1px;bottom:1px}";
    (root.document.head || root.document.documentElement).appendChild(s);
  }
  function html(it, where) {
    var c = cfg();
    if (c.enabled === false || !isAshen(it)) return "";
    css();
    var t = esc(c.title || "Ashen \u00b7 Mythical tier");
    return where === "badge" ? '<span class="ember-badge" title="' + t + '" aria-hidden="true"></span>'
      : '<span class="ember-mark" title="' + t + '" role="img" aria-label="' + t + '"></span>';
  }
  function glyph(it) {
    var c = cfg();
    return c.enabled === false || !isAshen(it) ? "" : (c.groundGlyph || "\u2726");
  }
  root.ABAshenMark = { html: html, glyph: glyph, isAshen: isAshen, cfg: cfg };
})(typeof window !== "undefined" ? window : self);
