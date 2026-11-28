/* v84o (TTPC-51): rarity glow on painted item art, like the old pixel-art icon glow (data/icons.json rarity .glow colours).
   Bag items, gear (doll) slots and the tooltip icon get a CSS drop-shadow glow in the rarity colour; set, unique and Ashen
   items glow stronger, and uniques / Ashen get a slow halo pulse behind the art (opacity only, so it stays on the compositor).
   Ground drops get the same glow as a cached, pre-blurred sprite drawn behind the icon (one extra drawImage per drop; the
   sprite is baked once per icon + colour). All numbers in data/ui.json "rarityGlow"; LOW_FX turns the pulses off.
   Hook for later: an item that is maxed (Ashen / Mythical with a perfect roll on every ranged stat, js/ab-uroll.js) gets
   <i class="glow-maxed"> inside its icon box and ABRarityGlow.hooks.maxedGround(ctx, item, x, y, w, h, time) is called for its
   ground drop. Neither draws anything yet: register a future special effect there (data rarityGlow.maxed). */
(function (root) {
  var done = false, sprites = new WeakMap();
  var hooks = { maxedGround: null, maxedCss: "" };
  function D() { return root.ASHBOUND_DATA || {}; }
  function cfg() { var u = D().ui || {}; return u.rarityGlow || {}; }
  function lowFx() { var c = root.ASHBOUND_CONFIG || {}; return !!c.LOW_FX; }
  function oldGlow(id) { var r = ((D().icons || {}).rarity || {})[id] || {}; return r.glow || r.border || ""; }
  function tierCfg(key) { return (cfg().tiers || {})[key] || null; }
  function colorOf(key) { var t = tierCfg(key) || {}; return t.color || oldGlow(key) || "#ffd34d"; }
  function isAshen(it) { return root.ABAshenMark ? ABAshenMark.isAshen(it) : !!(it && it.ashen); }
  function rankId(it) {
    if (root.ABCraft && ABCraft.cssClass) { var m = /rar-(\S+)/.exec(ABCraft.cssClass(it)); if (m) return m[1]; }
    return (it && it.rarity) || "common";
  }
  /* which glow an item gets: ashen > unique > set > its rank; null = none */
  function tierOf(it) {
    if (!it) return null;
    if (isAshen(it) && tierCfg("ashen")) return "ashen";
    if (root.ABCraft && ABCraft.isUnique && ABCraft.isUnique(it) && tierCfg("unique")) return "unique";
    if (root.ABCraft && ABCraft.isSet && ABCraft.isSet(it) && tierCfg("set")) return "set";
    var r = rankId(it);
    return tierCfg(r) ? r : null;
  }
  function isMaxed(it) {
    var m = cfg().maxed || {};
    if (m.enabled === false || !it) return false;
    var tierOk = isAshen(it) || it.tier === "mythical";
    return tierOk && !!(root.ABURoll && ABURoll.isPerfect(it));
  }
  function shadows(t, col) {
    var px = t.px || 3, a = t.alpha != null ? t.alpha : 0.8, s = [];
    s.push("drop-shadow(0 1px 1px rgba(0,0,0,.7))");
    if (t.inner) s.push("drop-shadow(0 0 " + (t.innerPx || 1) + "px " + t.inner + ")");
    if (t.ring) s.push("drop-shadow(0 0 " + t.ring + "px " + col + ")");
    s.push("drop-shadow(0 0 " + px + "px " + hexA(col, a) + ")");
    return s.join(" ");
  }
  function hexA(c, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(c || "");
    if (!m) return c;
    var n = parseInt(m[1], 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function css() {
    if (done || !root.document) return; done = true;
    var c = cfg(); if (c.enabled === false) return;
    var T = c.tiers || {}, P = c.pulse || {}, out = [];
    var boxes = function (q) { return [".gitem" + q + " .item-ico.art", ".doll-slot" + q + " .item-ico.art", ".detail-ico" + q + " .item-ico.art"].join(","); };
    var halos = function (q) { return [".gitem" + q + " .ico::before", ".doll-slot" + q + " .slot-ico::before", ".detail-ico" + q + "::before"].join(","); };
    var order = (c.order || ["magic", "rare", "elite", "epic", "legendary", "fabled", "mythical", "set", "unique", "ashen"]);
    order.forEach(function (k) {
      var t = T[k]; if (!t) return;
      var q = k === "set" ? ".family-set" : k === "unique" ? ".family-unique" : k === "ashen" ? ".family-unique:has(.ember-badge)" : ".rar-" + k;
      out.push(boxes(q) + "{filter:" + shadows(t, colorOf(k)) + "}");
      if (t.pulse && P.enabled !== false && !lowFx()) {
        out.push(halos(q) + "{content:'';position:absolute;left:50%;top:50%;width:" + (P.size || "80%") + ";height:" + (P.size || "80%") +
          ";transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;z-index:0;background:radial-gradient(circle," + hexA(colorOf(k), t.pulseAlpha || 0.45) +
          " 0," + hexA(colorOf(k), 0) + " 70%);animation:abGlowPulse " + (t.periodS || P.periodS || 2.6) + "s ease-in-out infinite;will-change:opacity}");
      }
    });
    out.push(".gitem .ico,.doll-slot .slot-ico{position:relative}.gitem .ico>.item-ico,.doll-slot .slot-ico>.item-ico,.detail-ico>.item-ico{position:relative;z-index:1}");
    out.push("@keyframes abGlowPulse{0%,100%{opacity:" + (P.min != null ? P.min : 0.35) + "}50%{opacity:" + (P.max != null ? P.max : 0.9) + "}}");
    out.push("@media (prefers-reduced-motion:reduce){.gitem .ico::before,.doll-slot .slot-ico::before,.detail-ico::before{animation:none !important}}");
    out.push(".glow-maxed{display:none}" + (hooks.maxedCss || (c.maxed && c.maxed.css) || ""));
    var s = root.document.createElement("style"); s.id = "ab-rarityglow-style"; s.textContent = out.join("\n");
    (root.document.head || root.document.documentElement).appendChild(s);
  }
  /* icon-box extras (rendered from abFamilyBadge): the maxed hook marker */
  function iconHtml(it) {
    css();
    var m = cfg().maxed || {};
    return isMaxed(it) ? '<i class="' + (m.className || "glow-maxed") + '" data-glow-maxed="1" aria-hidden="true"></i>' : "";
  }
  function sprite(c, col, blur, pad) {
    var bag = sprites.get(c); if (!bag) { bag = {}; sprites.set(c, bag); }
    var key = col + "|" + blur;
    if (bag[key]) return bag[key];
    var W = c.width + pad * 2, H = c.height + pad * 2, cv = root.document.createElement("canvas"); cv.width = W; cv.height = H;
    var x = cv.getContext("2d");
    x.shadowColor = col; x.shadowBlur = blur; x.shadowOffsetX = W * 2;  // draw only the shadow (image itself lands off-canvas)
    x.drawImage(c, pad - W * 2, pad); x.drawImage(c, pad - W * 2, pad);
    bag[key] = { cv: cv, pad: pad };
    return bag[key];
  }
  /* ground drop: glow sprite behind the icon. ctx is translated to the drop; x,y,w,h is where the icon is drawn */
  function ground(ctx, it, c, x, y, w, h, time) {
    var g = cfg().ground || {};
    if (cfg().enabled === false || g.enabled === false || !c || !root.document) return false;
    var k = tierOf(it); if (!k) return false;
    var t = tierCfg(k) || {}, col = colorOf(k), sc = w / c.width;
    var blur = Math.max(2, Math.round((t.px || 3) * (g.blurMul || 1.6) / Math.max(0.2, sc)));
    var sp = sprite(c, col, blur, Math.round(blur * 1.5) + (g.padPx || 4));
    var pulse = t.pulse && !lowFx() ? 1 - (g.pulseAmp != null ? g.pulseAmp : 0.25) * (0.5 + 0.5 * Math.sin((time || 0) * (Math.PI * 2) / (t.periodS || 2.6))) : 1;
    var a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * Math.min(1, (g.alpha != null ? g.alpha : 0.85) * (t.alpha != null ? t.alpha : 0.8) * pulse * (t.groundBoost || 1));
    var p = sp.pad * sc;
    ctx.drawImage(sp.cv, x - p, y - p, w + p * 2, h + p * 2);
    ctx.globalAlpha = a0;
    if (isMaxed(it) && typeof hooks.maxedGround === "function") { try { hooks.maxedGround(ctx, it, x, y, w, h, time); } catch (e) { /* hook must not break the frame */ } }
    return true;
  }
  root.ABRarityGlow = { tierOf: tierOf, colorOf: colorOf, isMaxed: isMaxed, iconHtml: iconHtml, ground: ground, css: css, hooks: hooks, cfg: cfg,
    _spriteCount: function (c) { var b = sprites.get(c); return b ? Object.keys(b).length : 0; } };
})(typeof window !== "undefined" ? window : self);
