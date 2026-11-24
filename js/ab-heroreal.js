/* Ashbound realism heroes: pre-baked directional sprites for the Warden.
   Falls through (returns null) for any other class, on load misses, and when ?real=0.
   Callers of ab3Get expect {F:{c,cx,cy}, mir}. We bake all 8 facings, so mir is always 0. */
(function (w) {
  "use strict";
  var BUDGET = 32 * 1048576;
  var MAX_COMPOSITES = 80;
  var atlasses = new Map(); /* url -> {img, bytes, at} */
  var atlasBytes = 0;
  var composites = new Map();
  var manifests = new Map(); /* lookId -> look manifest */
  var root = null; /* heroes-real.json */
  var loading = new Map();
  var lastLook = null;
  var lastPending = false;

  var FALLBACK_DYES = {
    ashguard: { primary: "#7c2016", leather: "#6a4a34", metal: "#9aa1a8" },
    reed:     { primary: "#2e5a58", leather: "#7a5838", metal: "#8a9096" },
    briar:    { primary: "#3e4a24", leather: "#5a4430", metal: "#7a7e84" },
    salt:     { primary: "#2a4a6e", leather: "#7a5a40", metal: "#a8b0b8" },
    bell:     { primary: "#8a6a20", leather: "#6a4c36", metal: "#b8a070" },
    gilded:   { primary: "#1d2f5e", leather: "#3a291d", metal: "#caa45c" },
    blackwatch:{ primary: "#2c4a2b", leather: "#261c16", metal: "#5a5f66" }
  };
  var ASHGUARD = FALLBACK_DYES.ashguard;

  function qs() { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); } }
  function enabled() {
    var q = qs();
    if (q.get("real") === "0") return false;
    if (q.get("real") === "1") return true;
    try {
      var ls = localStorage.getItem("ashbound.real");
      if (ls === "0") return false;
      if (ls === "1") return true;
    } catch (e) {}
    var C = w.ASHBOUND_CONFIG || {};
    if (C.REAL_HEROES != null) return !!C.REAL_HEROES;
    return !!C.STAGING;
  }
  w.abRealOn = enabled;
  w.abRealSet = function (on) { try { localStorage.setItem("ashbound.real", on ? "1" : "0"); } catch (e) {} };
  w.abRealLast = null;
  /* True while realism is on for the current type (Warden) so ab3Get does not fall through to HD/old mid-load. */
  w.abRealPending = function () { return lastPending; };

  function fetchJSON(url) {
    return fetch(url, { cache: "force-cache" }).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); });
  }
  function ensureRoot() {
    if (root) return Promise.resolve(root);
    if (loading.has("root")) return loading.get("root");
    var p = fetchJSON("data/heroes-real.json").then(function (j) { root = j; return j; });
    loading.set("root", p);
    return p;
  }

  function hex(h) {
    if (!h) return [0.5, 0.5, 0.5];
    h = String(h).replace("#", "");
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
  }
  function dyeTable() {
    return (root && root.dyes) || FALLBACK_DYES;
  }
  function dyeFactors(name) {
    if (!name || name === "ashguard") return null;
    var tab = dyeTable();
    var src = tab[name] || (tab.presets && tab.presets[name]);
    if (!src) return null;
    var p = hex(src.primary || ASHGUARD.primary);
    var l = hex(src.leather || ASHGUARD.leather);
    var m = hex(src.metal || ASHGUARD.metal);
    var bp = hex(ASHGUARD.primary), bl = hex(ASHGUARD.leather), bm = hex(ASHGUARD.metal);
    return {
      p: [p[0]/(bp[0]||1), p[1]/(bp[1]||1), p[2]/(bp[2]||1)],
      l: [l[0]/(bl[0]||1), l[1]/(bl[1]||1), l[2]/(bl[2]||1)],
      m: [m[0]/(bm[0]||1), m[1]/(bm[1]||1), m[2]/(bm[2]||1)]
    };
  }

  function lookFrom(t) {
    if (t !== "warden") return null;
    var st = w.ASHBOUND && ASHBOUND.state, P = st && st.player, eq = (P && st.mode === "play" && P.equipment) || null;
    var armorMap = (root && root.armorToTier) || { wander_wrap: "cloth", hide_coat: "leather", scale_hauberk: "scale", kiln_plate: "plate" };
    var helmMap = (root && root.helmToKind) || { cloth_hood: "hood", salt_cap: "cap", kiln_helm: "bascinet" };
    var armorId = eq && eq.armor && eq.armor.baseId;
    var tier = armorMap[armorId] || "cloth";
    var shield = !!(eq && eq.offhand && (eq.offhand.kind === "shield" || eq.offhand.slot === "offhand" && /shield/.test(eq.offhand.baseId || "")));
    var wpn = eq && eq.weapon, twoH = wpn && (wpn.hands === 2 || /maul|mallet|staff|bow/.test(wpn.baseId || "") || wpn.kind === "mace" || wpn.kind === "staff" || wpn.kind === "bow");
    if (twoH) shield = false;
    var helm = (eq && eq.helm && helmMap[eq.helm.baseId]) || "none";
    var dye = (qs().get("dye") || (P && P.dye) || "ashguard");
    if (dye && typeof dye === "object") dye = dye.id || dye.name || "ashguard";
    return { tier: tier, shield: shield, helm: helm, dye: String(dye || "ashguard"), id: tier + (shield ? "_shield" : "") };
  }

  function evict(need) {
    while (atlasBytes + need > BUDGET && atlasses.size) {
      var oldest = null, oldAt = Infinity;
      atlasses.forEach(function (v, k) { if (v.at < oldAt) { oldAt = v.at; oldest = k; } });
      if (!oldest) break;
      atlasBytes -= atlasses.get(oldest).bytes;
      atlasses.delete(oldest);
    }
  }
  function loadImage(url) {
    if (atlasses.has(url)) { atlasses.get(url).at = performance.now(); return Promise.resolve(atlasses.get(url).img); }
    if (loading.has(url)) return loading.get(url);
    var p = new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () {
        var bytes = (im.naturalWidth * im.naturalHeight * 4) || 1;
        evict(bytes);
        atlasses.set(url, { img: im, bytes: bytes, at: performance.now() });
        atlasBytes += bytes;
        res(im);
      };
      im.onerror = function () { loading.delete(url); rej(new Error(url)); };
      im.src = url;
    });
    loading.set(url, p);
    return p;
  }
  function lookMan(id) {
    if (manifests.has(id)) return Promise.resolve(manifests.get(id));
    return ensureRoot().then(function (r) {
      var L = r.looks[id];
      if (!L) return null;
      return fetchJSON(L.path + "manifest.json").then(function (m) {
        m.path = L.path;
        manifests.set(id, m);
        return m;
      });
    });
  }
  function prefetch(id, anims) {
    lookMan(id).then(function (m) {
      if (!m) return;
      (anims || ["idle", "walk"]).forEach(function (a) {
        var rec = m.anims[a];
        if (!rec) return;
        loadImage(m.path + rec.file).catch(function () {});
        if (rec.mask) loadImage(m.path + rec.mask).catch(function () {});
      });
    });
  }

  function applyDye(c, maskImg, rec, fr, dir, fac) {
    if (!maskImg || !fac) return;
    var cw = (rec.cell)[0], ch = (rec.cell)[1];
    var g = c.getContext("2d");
    var tmp = document.createElement("canvas");
    tmp.width = cw; tmp.height = ch;
    var tg = tmp.getContext("2d");
    tg.drawImage(maskImg, fr * cw, dir * ch, cw, ch, 0, 0, cw, ch);
    var b = g.getImageData(0, 0, cw, ch);
    var m = tg.getImageData(0, 0, cw, ch);
    var bd = b.data, md = m.data, n = bd.length;
    var pr = fac.p, lr = fac.l, mr = fac.m;
    for (var i = 0; i < n; i += 4) {
      var a = md[i + 3];
      if (a < 8) continue;
      var wr = md[i] / 255, wg = md[i + 1] / 255, wb = md[i + 2] / 255;
      var s = wr + wg + wb;
      if (s <= 0.01) continue;
      /* Exclusive-ish channels: weight by mask RGB and apply dye/ashguard ratios. */
      bd[i    ] = Math.min(255, bd[i    ] * (1 + wr * (pr[0] - 1) + wg * (lr[0] - 1) + wb * (mr[0] - 1)));
      bd[i + 1] = Math.min(255, bd[i + 1] * (1 + wr * (pr[1] - 1) + wg * (lr[1] - 1) + wb * (mr[1] - 1)));
      bd[i + 2] = Math.min(255, bd[i + 2] * (1 + wr * (pr[2] - 1) + wg * (lr[2] - 1) + wb * (mr[2] - 1)));
    }
    g.putImageData(b, 0, 0);
  }

  function blit(m, anim, dir, fr, dye) {
    var rec = m.anims[anim];
    if (!rec) rec = m.anims.idle;
    if (!rec) return null;
    var url = m.path + rec.file;
    var ent = atlasses.get(url);
    if (!ent) { loadImage(url).catch(function () {}); return null; }
    var fac = dyeFactors(dye);
    var maskUrl = rec.mask ? m.path + rec.mask : null;
    if (fac && maskUrl && !atlasses.has(maskUrl)) { loadImage(maskUrl).catch(function () {}); }
    var cw = (rec.cell || m.cell)[0], ch = (rec.cell || m.cell)[1];
    var foot = rec.foot || m.foot;
    fr = ((fr % rec.frames) + rec.frames) % rec.frames;
    dir = ((dir % rec.dirs) + rec.dirs) % rec.dirs;
    var dkey = fac ? (dye || "custom") : "ashguard";
    var key = m.path + "|" + anim + "|" + dir + "|" + fr + "|" + dkey;
    if (composites.has(key)) { var hit = composites.get(key); composites.delete(key); composites.set(key, hit); return hit; }
    var c = document.createElement("canvas");
    c.width = cw; c.height = ch;
    var g = c.getContext("2d");
    g.drawImage(ent.img, fr * cw, dir * ch, cw, ch, 0, 0, cw, ch);
    if (fac && maskUrl && atlasses.has(maskUrl)) applyDye(c, atlasses.get(maskUrl).img, rec, fr, dir, fac);
    var F = { c: c, cx: foot[0], cy: foot[1] };
    composites.set(key, F);
    if (composites.size > MAX_COMPOSITES) composites.delete(composites.keys().next().value);
    return F;
  }

  function scaleToGame(F, r) {
    /* r is the tile size in CSS px (Na()). Bake dpr caps at 2. Size the canvas so the
       character's foot-to-head span is heightTiles tiles after Dn divides by D. */
    if (!root || !F) return F;
    var D = (typeof ab3BakeDpr === "function") ? ab3BakeDpr() : 2;
    var charH = root.charHeight || 148;
    var tiles = root.heightTiles || 1.33;
    var s = r || 53;
    var target = tiles * s * D;
    var sc = target / charH;
    if (Math.abs(sc - 1) < 0.04) return F;
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(F.c.width * sc));
    c.height = Math.max(1, Math.round(F.c.height * sc));
    var g = c.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.drawImage(F.c, 0, 0, c.width, c.height);
    return { c: c, cx: F.cx * sc, cy: F.cy * sc };
  }

  function abRealFrame(t, col, acc, pose, face, r, quiet) {
    lastPending = false;
    if (!enabled()) return null;
    var look = lookFrom(t);
    if (!look) return null;
    lastPending = true;
    lastLook = look.id;
    w.abRealLast = look.id;
    if (!root) { ensureRoot().then(function () { prefetch(look.id); }); return null; }
    var shift = root.dirShift || 0;
    var dir = (((Math.round((face || 0) / (Math.PI / 4)) % 8) + 8) % 8 + shift) % 8;
    var anim = (pose && pose.mode) || "idle";
    var fr = (pose && pose.frame) || 0;
    var m = manifests.get(look.id);
    if (!m) { lookMan(look.id).then(function () { prefetch(look.id); }); return null; }
    if (!atlasses.has(m.path + (m.anims[anim] || m.anims.idle).file)) {
      if (!quiet) prefetch(look.id, [anim, "idle", "walk"]);
      return null;
    }
    var F = blit(m, anim, dir, fr, look.dye);
    if (!F) return null;
    F = scaleToGame(F, r);
    return F ? { F: F, mir: 0 } : null;
  }
  w.abRealFrame = abRealFrame;
  w.abRealStats = function () {
    return { on: enabled(), look: lastLook, atlasMB: +(atlasBytes / 1048576).toFixed(2),
      atlasses: atlasses.size, composites: composites.size, root: !!root, looks: [...manifests.keys()] };
  };
})(window);
