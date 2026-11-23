// Item pictures drawn from data/icons.json (recipes, palettes, rarity frames). No external art.
// Each picture is drawn once on a canvas and cached. If the data is missing, ready() is false and the game uses its old pixel icons.
(function (root) {
  "use strict";
  var cvCache = Object.create(null), urlCache = Object.create(null), styleOn = false, stats = { drawn: 0, hits: 0 };
  function D() { return (root.ASHBOUND_DATA || {}).icons || null; }
  function ready() { var d = D(); return !!(d && d.recipes); }
  function mono(p) { var o = {}; for (var k in p) o[k] = "#3a3028"; o.M = "#6a5c4c"; o.d = "#241c16"; return o; }
  function palFor(palName, rankId, ghost) {
    var d = D(), base = Object.assign({}, (d.palettes || {})[palName] || d.palettes.bone);
    var t = (d.tint || {})[rankId]; if (t) Object.assign(base, t);
    return ghost ? mono(base) : base;
  }
  function col(p, c) { return p[c] || c; }
  var P2 = typeof Path2D !== "undefined";
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function outline(ctx, st, w) { ctx.lineWidth = w || st.outlineW; ctx.strokeStyle = st.outline; ctx.stroke(); }
  function run(ctx, ops, p, st, item) {
    var clipped = false;
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i], k = op[0], fl = op[op.length - 1];
      if (!(fl && typeof fl === "object" && !Array.isArray(fl))) fl = {};
      ctx.globalAlpha = fl.a == null ? 1 : fl.a;
      if (k === "P") { var pa = new Path2D(op[2]); ctx.fillStyle = col(p, op[1]); ctx.fill(pa); if (!fl.n) { ctx.lineWidth = st.outlineW; ctx.strokeStyle = st.outline; ctx.stroke(pa); } }
      else if (k === "R") { ctx.beginPath(); var r = op[6] || 0; if (ctx.roundRect && r) ctx.roundRect(op[2], op[3], op[4], op[5], r); else ctx.rect(op[2], op[3], op[4], op[5]); ctx.fillStyle = col(p, op[1]); ctx.fill(); if (!fl.n) outline(ctx, st); }
      else if (k === "C") { ctx.beginPath(); ctx.arc(op[2], op[3], op[4], 0, 6.2832); ctx.fillStyle = col(p, op[1]); ctx.fill(); if (!fl.n) outline(ctx, st); }
      else if (k === "E") { ctx.beginPath(); ctx.ellipse(op[2], op[3], op[4], op[5], 0, 0, 6.2832); ctx.fillStyle = col(p, op[1]); ctx.fill(); if (!fl.n) outline(ctx, st); }
      else if (k === "L") { ctx.beginPath(); ctx.moveTo(op[2], op[3]); ctx.lineTo(op[4], op[5]); ctx.lineCap = "round";
        if (fl.o) { ctx.lineWidth = op[6] + st.outlineW * 2; ctx.strokeStyle = st.outline; ctx.stroke(); }
        ctx.lineWidth = op[6]; ctx.strokeStyle = col(p, op[1]); ctx.stroke(); }
      else if (k === "S") { var sp = new Path2D(op[2]); ctx.lineCap = "round";
        if (!fl.n) { ctx.lineWidth = op[3] + st.outlineW * 2; ctx.strokeStyle = st.outline; ctx.stroke(sp); }
        ctx.lineWidth = op[3]; ctx.strokeStyle = col(p, op[1]); ctx.stroke(sp); }
      else if (k === "clip") { ctx.save(); ctx.clip(new Path2D(op[1])); clipped = true; }
      else if (k === "unclip") { if (clipped) { ctx.restore(); clipped = false; } }
      else if (k === "scales") {
        var x0 = op[2], y0 = op[3], w = op[4], h = op[5], s = op[6], row = 0;
        ctx.strokeStyle = st.outline; ctx.lineWidth = .5; ctx.fillStyle = col(p, op[1]);
        for (var y = y0; y < y0 + h; y += s * .62, row++) for (var x = x0 + (row % 2 ? s / 2 : 0); x < x0 + w; x += s) {
          ctx.beginPath(); ctx.arc(x, y, s * .52, 0, Math.PI); ctx.globalAlpha = .55; ctx.fill(); ctx.globalAlpha = .7; ctx.stroke(); }
      }
      else if (k === "rivets") { ctx.fillStyle = col(p, op[1]); for (var q = 0; q < op[2].length; q++) { ctx.beginPath(); ctx.arc(op[2][q][0], op[2][q][1], op[3], 0, 6.2832); ctx.fill(); } }
      else if (k === "glyph") {
        var gl = D().runeGlyphs || ["M8 3 L8 13"], hv = hash(item && (item.runeId || item.name) || "r"), strokes = [gl[hv % gl.length], gl[(hv >>> 4) % gl.length], gl[(hv >>> 9) % gl.length]];
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (var z = 0; z < strokes.length; z++) { if (z && strokes[z] === strokes[0]) continue; var gp = new Path2D(strokes[z]);
          ctx.globalAlpha = .28; ctx.lineWidth = st.glyphStroke + 1.6; ctx.strokeStyle = col(p, op[1]); ctx.stroke(gp);
          ctx.globalAlpha = 1; ctx.lineWidth = st.glyphStroke; ctx.strokeStyle = "#ffd2a6"; ctx.stroke(gp); }
      }
    }
    if (clipped) ctx.restore();
    ctx.globalAlpha = 1;
  }
  function recipeFor(item) {
    var d = D(), id = null, palName = null;
    if (!item) return null;
    if (item.rarity === "potion") { id = "flask"; palName = item.kind === "mana" ? "mana" : "life"; }
    else if (item.rarity === "gem") { id = "gem"; palName = "gem:" + (item.color || "#7dcea0"); }
    else if (item.rarity === "rune") { id = "rune"; palName = "bone"; }
    else if (item.rarity === "lens") { id = "lens"; palName = "steel"; }
    else if (item.rarity === "gold") { id = "coins"; palName = "copper"; }
    else if (item.charm) { id = item.charmSize === "grand" ? "charm_grand" : item.charmSize === "large" ? "charm_large" : "charm_small"; palName = "bone"; }
    else {
      var b = (d.bases || {})[item.baseId];
      if (b) { id = b.recipe; palName = b.palette; }
      else { var fb = d.fallback || {}, fid = fb[item.kind] || fb[item.slot] || "salt_saber"; id = fid; palName = (d.bases[fid] || {}).palette; }
    }
    return { id: id, pal: palName };
  }
  function palette(palName, rankId, ghost) {
    var d = D();
    if (palName === "life") return Object.assign(palFor("glass", rankId, ghost), { j: "#e25b45", M: "#ffd8d0" });
    if (palName === "mana") return Object.assign(palFor("glass", rankId, ghost), { j: "#5aa6e8", M: "#d8eeff" });
    if (palName && palName.indexOf("gem:") === 0) { var c = palName.slice(4); return Object.assign(palFor("glass", null, ghost), { j: c, M: "#ffffff", d: "#000000" }); }
    return palFor(palName, rankId, ghost);
  }
  function drawTo(ctx, rec, pal, st, s, item) {
    ctx.save(); ctx.scale(s, s); ctx.translate(st.pad, st.pad); ctx.lineJoin = "round";
    run(ctx, rec.ops, pal, st, item); ctx.restore();
    // soft light from the top, shade at the bottom (only where something is drawn)
    var w = ctx.canvas.width, h = ctx.canvas.height, g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(255,255,255," + st.shadeTop + ")"); g.addColorStop(.5, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0," + st.shadeBottom + ")");
    ctx.globalCompositeOperation = "source-atop"; ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = "source-over";
  }
  function keyOf(item, rankId, ghost) {
    var r = recipeFor(item); if (!r) return null;
    var extra = item.rarity === "rune" ? ("|" + (item.runeId || item.name)) : "";
    return r.id + "|" + r.pal + "|" + (rankId || "common") + (ghost ? "|g" : "") + extra;
  }
  function canvasFor(item, rankId, opts) {
    if (!ready() || !item) return null;
    opts = opts || {}; var ghost = !!opts.ghost, key = keyOf(item, rankId, ghost); if (!key) return null;
    var c = cvCache[key]; if (c) { stats.hits++; return c; }
    var d = D(), st = d.style, r = recipeFor(item), rec = d.recipes[r.id]; if (!rec) return null;
    var s = st.px / 32, W = Math.ceil((rec.vb[0] + st.pad * 2) * s), H = Math.ceil((rec.vb[1] + st.pad * 2) * s);
    c = document.createElement("canvas"); c.width = W; c.height = H;
    drawTo(c.getContext("2d"), rec, palette(r.pal, rankId, ghost), st, s, item);
    cvCache[key] = c; stats.drawn++; return c;
  }
  function urlFor(item, rankId, opts) {
    var ghost = opts && opts.ghost, key = keyOf(item, rankId, ghost); if (!key) return "";
    var u = urlCache[key]; if (u) return u;
    var c = canvasFor(item, rankId, opts); if (!c) return ""; return (urlCache[key] = c.toDataURL("image/png"));
  }
  function html(item, rankId) {
    var u = urlFor(item, rankId); if (!u) return "";
    return '<img class="item-ico pic" alt="" draggable="false" src="' + u + '">';
  }
  function ghostHtml(slot) {
    if (!ready()) return "";
    var fb = D().fallback || {}, id = fb[slot] || "salt_saber", b = D().bases[id] || {};
    var item = { baseId: id, kind: slot, slot: slot, rarity: "common" };
    var u = urlFor(item, "common", { ghost: true }); if (!u) return "";
    return '<img class="item-ico pic" alt="" draggable="false" src="' + u + '">';
  }
  // CSS for the frames, written from data so colours stay in icons.json
  function css() {
    var d = D(); if (!d) return "";
    var o = [], rar = d.rarity || {};
    Object.keys(rar).forEach(function (k) {
      var r = rar[k], sel = ".gitem.rar-" + k + ",.slot.has-item.rar-" + k + ",.shop-ico.rar-" + k + ",.detail-ico.rar-" + k + ",.flask.rar-" + k;
      var glow = r.glow ? ",0 0 " + r.blur + "px " + (r.spread || 0) + "px " + r.glow + "88,inset 0 0 " + Math.max(4, Math.round(r.blur * .9)) + "px " + r.glow + "55" : "";
      o.push(sel + "{border-color:" + r.border + ";background:linear-gradient(160deg," + r.bg + ",rgba(18,12,8,.55));box-shadow:inset 0 0 0 1px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.12)" + glow + "}");
      if (r.img) o.push(sel.split(",").map(function (s) { return s + " .item-ico.pic"; }).join(",") + "{filter:drop-shadow(0 0 " + r.img + "px " + (r.glow || r.border) + ")}");
    });
    o.push(".item-ico.pic{object-fit:contain;image-rendering:auto;width:100%;height:100%;display:block}");
    o.push(".shop-ico,.detail-ico{border:1px solid #8d7b68;border-radius:5px}");
    return o.join("\n");
  }
  function installStyle() {
    if (styleOn || !ready() || typeof document === "undefined") return; styleOn = true;
    var s = document.createElement("style"); s.id = "ab-icons-style"; s.textContent = css(); document.head.appendChild(s);
  }
  root.ABIcons = {
    ready: ready, html: html, ghost: ghostHtml, canvas: canvasFor, url: urlFor, css: css, installStyle: installStyle, recipeFor: recipeFor,
    keys: function () { var d = D(); return d ? Object.keys(d.recipes) : []; },
    stats: function () { return { cached: Object.keys(cvCache).length, drawn: stats.drawn, hits: stats.hits }; },
    clear: function () { cvCache = Object.create(null); urlCache = Object.create(null); stats = { drawn: 0, hits: 0 }; }
  };
})(typeof window !== "undefined" ? window : self);
