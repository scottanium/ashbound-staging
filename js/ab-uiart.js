/* le-ui (v85): painted UI art loader. data/ui-art.json maps two atlases:
   - items@2x.webp / items@1x.webp: painted item icons, 128 (64) px per grid cell. Cut once into a small blob URL per icon (v84k; the old <svg viewBox> crop is only a fallback) so
     every icon shares one decoded atlas (about 10 MB at @2x, 2.6 MB at @1x).
   - chrome@2x.webp: frames, 9-slices, slots, rarity plates/frames/glows, tab icons, chips, badges and glyphs in one file.
     After the first load each piece is cut once into a small blob URL (CSS border-image needs its own image), exposed as
     CSS custom properties --ua-<key>, and the full atlas is released.
   Nothing here changes game rules. If the json or an image is missing, ready stays false and the old look stays. */
(function (root) {
  "use strict";
  var st = { ready: false, failed: false, pieces: {}, items: {}, itemsSrc: "", started: false, ms: 0, bytes: 0, err: "" };
  var waiters = [];
  function D() { return (root.ASHBOUND_DATA || {}).uiArt || null; }
  function off() {
    try { if (/(?:^|[?&])leui=0(?:&|$)/.test(location.search || "")) return true; } catch (e) {}
    var c = root.ASHBOUND_CONFIG || {}; return c.LEUI === false;
  }
  function hd() {
    var u = ((root.ASHBOUND_DATA || {}).ui || {}).leui || {};
    if (u.iconHD === false) return false;
    try { if (/(?:^|[?&])iconhd=0(?:&|$)/.test(location.search || "")) return false; } catch (e) {}
    return (root.devicePixelRatio || 1) >= 1.5;
  }
  function itemsSrc() { var d = D(); if (!d) return ""; return hd() ? d.items.src2x : d.items.src1x; }
  function loadImg(src) {
    return new Promise(function (res, rej) { var im = new Image(); im.decoding = "async"; im.onload = function () { res(im); }; im.onerror = function () { rej(new Error("Could not load " + src)); }; im.src = src; });
  }
  function cut(im, r) {
    var c = document.createElement("canvas"); c.width = r[2]; c.height = r[3];
    c.getContext("2d").drawImage(im, r[0], r[1], r[2], r[3], 0, 0, r[2], r[3]);
    return new Promise(function (res) {
      if (c.toBlob) c.toBlob(function (b) { st.bytes += b ? b.size : 0; res(b ? URL.createObjectURL(b) : c.toDataURL()); c.width = c.height = 0; }, "image/png");
      else res(c.toDataURL("image/png"));
    });
  }
  function installVars() {
    var d = D(), css = [":root{"];
    Object.keys(st.pieces).forEach(function (k) { css.push("--ua-" + k.replace(/_/g, "-") + ":url(" + st.pieces[k] + ");"); });
    css.push("--ua-items:url(" + st.itemsSrc + ");--ua-doll:url(" + d.photos.doll + ");--ua-panel-bg:url(" + d.photos.panelBg + ");}");
    var s = document.getElementById("ab-uiart-vars"); if (!s) { s = document.createElement("style"); s.id = "ab-uiart-vars"; document.head.appendChild(s); }
    s.textContent = css.join("");
  }
  function start() {
    if (st.started) return whenReady(); st.started = true;
    var d = D(); if (!d || off()) { st.failed = true; st.err = d ? "off" : "no data"; flush(); return Promise.resolve(false); }
    var t0 = (root.performance && performance.now()) || Date.now();
    st.itemsSrc = itemsSrc();
    return Promise.all([loadImg(d.chrome.src), loadImg(st.itemsSrc)]).then(function (ims) {
      var im = ims[0], keys = Object.keys(d.chrome.rects);
      // v84k: every item icon is cut once into its own small image too. iOS Safari blanked the old per-icon <svg> crops
      // (each one drew the whole atlas under a CSS filter, which blew its filter memory budget once the reskin added more layers).
      var it = ims[1], k = hd() ? 1 : 0.5, ir = d.items.rects || {};
      var cuts = keys.map(function (key) { return cut(im, d.chrome.rects[key]).then(function (u) { st.pieces[key] = u; }); });
      Object.keys(ir).forEach(function (id) {
        var r = ir[id], rr = [Math.round(r[0] * k), Math.round(r[1] * k), Math.round(r[2] * k), Math.round(r[3] * k)];
        cuts.push(cut(it, rr).then(function (u) { st.items[id] = u; }, function () {}));
      });
      return Promise.all(cuts).then(function () {
        im.src = ""; // release the full chrome atlas; the small pieces stay
        st.itemsW = it.naturalWidth; st.itemsH = it.naturalHeight;
        if (Object.keys(st.items).length === Object.keys(ir).length) it.src = ""; // every icon has its own cut: drop the decoded atlas too
        installVars(); st.ready = true; st.ms = Math.round(((root.performance && performance.now()) || Date.now()) - t0);
        document.documentElement.classList.add("ua-ready");
        flush(); return true;
      });
    }).catch(function (e) { st.failed = true; st.err = String(e && e.message || e); flush(); return false; });
  }
  function flush() { var w = waiters; waiters = []; w.forEach(function (f) { try { f(st.ready); } catch (e) {} }); try { root.dispatchEvent(new CustomEvent("ab-uiart", { detail: { ready: st.ready } })); } catch (e) {} }
  function whenReady() { return new Promise(function (res) { if (st.ready || st.failed) res(st.ready); else waiters.push(res); }); }
  // id of the painted icon for an item, or "" when there is none
  function itemArtId(item) {
    var d = D(); if (!d || !item) return "";
    var m = d.misc || {}, rects = d.items.rects, id = "";
    if (item.rarity === "potion") id = m["potion:" + (item.kind === "mana" ? "mana" : "life")];
    else if (item.rarity === "gem") id = rects[item.gemId] ? item.gemId : rects[item.baseId] ? item.baseId : (item.shardId && rects[item.shardId]) ? item.shardId : m.gem;
    else if (item.rarity === "rune") id = m.rune;
    else if (item.rarity === "lens") id = m.lens;
    else if (item.rarity === "gold") id = m.gold;
    else if (item.charm) id = m["charm:" + (item.charmSize || "small")];
    else if (item.baseId && rects[item.baseId]) id = item.baseId;
    else if (item.matId && rects[item.matId]) id = item.matId;
    return id && rects[id] ? id : "";
  }
  function artSvg(id, cls) {
    var d = D(); if (!d || !id) return ""; var r = d.items.rects[id]; if (!r) return "";
    var k = hd() ? 1 : 0.5, W = d.items.size2x[0] * k, H = d.items.size2x[1] * k;
    var x = r[0] * k, y = r[1] * k, w = r[2] * k, h = r[3] * k;
    // outer svg fits the icon (meet); the nested svg clips to exactly this icon's cell of the atlas
    return '<svg class="item-ico art ' + (cls || "") + '" data-art="' + id + '" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">' +
      '<svg width="' + w + '" height="' + h + '" viewBox="' + x + " " + y + " " + w + " " + h + '"><image href="' + (st.itemsSrc || itemsSrc()) + '" width="' + W + '" height="' + H + '"/></svg></svg>';
  }
  // v84k: a plain <img> of the icon's own cut-out (same class + data-art as before); the svg crop is only a fallback.
  function artImg(id, cls) {
    var u = st.items[id]; if (!u) return "";
    return '<img class="item-ico art ' + (cls || "") + '" data-art="' + id + '" alt="" draggable="false" src="' + u + '">';
  }
  function itemHtml(item, cls) { if (off() || !D()) return ""; var id = itemArtId(item); return id ? (artImg(id, cls) || artSvg(id, cls)) : ""; }
  function piece(k) { return st.pieces[k] || ""; }
  root.ABUiArt = {
    start: start, whenReady: whenReady, ready: function () { return st.ready; }, failed: function () { return st.failed; },
    off: off, data: D, itemArtId: itemArtId, itemHtml: itemHtml, artSvg: artSvg, artImg: artImg, piece: piece,
    itemUrl: function (id) { return st.items[id] || ""; },
    stats: function () {
      var d = D() || { chrome: { size: [0, 0], rects: {} } }, px = 0;
      Object.keys(d.chrome.rects || {}).forEach(function (k) { var r = d.chrome.rects[k]; px += r[2] * r[3]; });
      return { ready: st.ready, failed: st.failed, err: st.err, ms: st.ms, pieces: Object.keys(st.pieces).length, rects: Object.keys(d.chrome.rects || {}).length,
        items: Object.keys(st.items).length, itemsSrc: st.itemsSrc, itemsW: st.itemsW || 0, itemsH: st.itemsH || 0, blobBytes: st.bytes,
        decodedMB: +(((st.itemsW || 0) * (st.itemsH || 0) * 4 + px * 4) / 1048576).toFixed(1) };
    }
  };
  if (root.ASHBOUND_DATA_READY && root.ASHBOUND_DATA_READY.then) root.ASHBOUND_DATA_READY.then(function () { start(); });
})(typeof window !== "undefined" ? window : self);
