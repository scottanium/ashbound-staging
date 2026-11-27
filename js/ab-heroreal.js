/* Ashbound realism heroes: pre-baked directional sprites. The Warden lives at the top level of
   data/heroes-real.json; other classes are listed in root.classes (type -> json path) and load lazily.
   Falls through (returns null) for a class with no real looks, on hard load error, and when ?real=0.
   Callers of ab3Get expect {F:{c,cx,cy}, mir}. We bake all 8 facings, so mir is always 0. */
(function (w) {
  "use strict";
  var BUDGET = 40 * 1048576;
  var MAX_COMPOSITES = 80;
  var atlasses = new Map(); /* url -> {img, bytes, at, url} */
  var atlasBytes = 0;
  var evictCount = 0;
  var composites = new Map();
  var manifests = new Map(); /* lookId -> look manifest */
  var root = null; /* heroes-real.json */
  var rootFailed = false;
  var loading = new Map();
  var lastLook = null;
  var lastLoadedBy = {}; /* type -> manifest key (path) of the last look that drew */
  var lastPending = false;
  var lastRawBy = {}; /* type -> last drawn frame, so a loading look never shows another class */
  var classCfgs = new Map(); /* type -> class json (non-Warden) */
  var classFailed = {};
  var HERO_TYPES = { warden: 1, caller: 1, stalker: 1, reaver: 1, chanter: 1 };
  var activePath = null;
  var activeHelmPath = null;
  var activeNeedsMask = false;
  var lastAnimDrawn = null;
  var lastFallbackAnim = null;
  var lastDirDrawn = null;
  var lastHelmKind = null;
  var dyeScratch = null;
  var CLASS_OF = { cinder_warden: "warden", salt_reaver: "reaver", bell_chanter: "chanter", reed_caller: "caller", briar_stalker: "stalker" };
  function outlineAlpha() { return root && root.outline != null ? +root.outline : 0.55; }

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
  /* True while realism is on for the current type (Warden) so ab3Get/Dn do not fall through to HD/old mid-load. */
  w.abRealPending = function () { return lastPending; };

  function fetchJSON(url) {
    return fetch(url, { cache: "force-cache" }).then(function (r) { if (!r.ok) throw new Error(url); return r.json(); });
  }
  function ensureRoot() {
    if (root) return Promise.resolve(root);
    if (rootFailed) return Promise.resolve(null);
    if (loading.has("root")) return loading.get("root");
    var p = fetchJSON("data/heroes-real.json").then(function (j) {
      loading.delete("root");
      root = j;
      return j;
    }, function (err) {
      loading.delete("root");
      rootFailed = true;
      throw err;
    });
    loading.set("root", p);
    return p;
  }

  /* Class config: the root for the Warden, a lazily loaded file for classes in root.classes.
     Returns cfg, null (no realism for this class), or undefined (still loading). */
  function classCfg(t) {
    if (!root) return HERO_TYPES[t] ? undefined : null;
    if (t === (root.class || "warden")) return root;
    var path = root.classes && root.classes[t];
    if (!path || classFailed[t]) return null;
    if (classCfgs.has(t)) return classCfgs.get(t);
    var mk = "cls:" + t;
    if (!loading.has(mk)) {
      var p = fetchJSON(path).then(function (j) {
        loading.delete(mk);
        classCfgs.set(t, j);
        var id = j.defaultLook || "cloth";
        prefetch(j, id, ["idle", "walk"], false);
        return j;
      }, function () { loading.delete(mk); classFailed[t] = true; return null; });
      loading.set(mk, p);
    }
    return undefined;
  }
  function cfgVal(cfg, k, dflt) {
    if (cfg && cfg[k] != null) return cfg[k];
    if (root && root[k] != null) return root[k];
    return dflt;
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
  /* Tint ratios from the class's baked dye (cfg.baseDye, Warden = ashguard) to `name`.
     null when name is the baked dye: no mask fetch, no per-pixel pass. */
  function dyeFactors(name, cfg) {
    var baseName = (cfg && cfg.baseDye) || "ashguard";
    if (!name || name === baseName) return null;
    var tab = dyeTable();
    var src = tab[name] || (tab.presets && tab.presets[name]);
    if (!src) return null;
    var B = tab[baseName] || FALLBACK_DYES[baseName] || ASHGUARD;
    var p = hex(src.primary || B.primary);
    var l = hex(src.leather || B.leather);
    var m = hex(src.metal || B.metal);
    var bp = hex(B.primary), bl = hex(B.leather), bm = hex(B.metal);
    return {
      p: [p[0]/(bp[0]||1), p[1]/(bp[1]||1), p[2]/(bp[2]||1)],
      l: [l[0]/(bl[0]||1), l[1]/(bl[1]||1), l[2]/(bl[2]||1)],
      m: [m[0]/(bm[0]||1), m[1]/(bm[1]||1), m[2]/(bm[2]||1)]
    };
  }

  function lookFrom(t, cfg) {
    if (t !== "warden" && !cfg) return null;
    var st = w.ASHBOUND && ASHBOUND.state, P = st && st.player;
    var mine = !!(P && (!P.classId || CLASS_OF[P.classId] === t || (!CLASS_OF[P.classId] && t === "warden")));
    var eq = (mine && P && st.mode === "play" && P.equipment) || null;
    var armorMap = cfgVal(cfg, "armorToTier", null) || { wander_wrap: "cloth", hide_coat: "leather", scale_hauberk: "scale", kiln_plate: "plate" };
    var helmMap = cfgVal(cfg, "helmToKind", null) || { cloth_hood: "hood", salt_cap: "cap", kiln_helm: "bascinet" };
    var armorId = eq && eq.armor && eq.armor.baseId;
    var tier = armorMap[armorId] || "cloth";
    var shield = !!(eq && eq.offhand && (eq.offhand.kind === "shield" || eq.offhand.slot === "offhand" && /shield/.test(eq.offhand.baseId || "")));
    var wpn = eq && eq.weapon, twoH = wpn && (wpn.hands === 2 || /maul|mallet|staff|bow/.test(wpn.baseId || "") || wpn.kind === "mace" || wpn.kind === "staff" || wpn.kind === "bow");
    if (twoH) shield = false;
    if (cfg && cfg.looks && !cfg.looks[tier + "_shield"]) shield = false; /* class bakes no shield look */
    var helm = (eq && eq.helm && helmMap[eq.helm.baseId]) || "none";
    var base = (cfg && cfg.baseDye) || "ashguard";
    var dye = (qs().get("dye") || (mine && P && P.dye) || base);
    if (dye && typeof dye === "object") dye = dye.id || dye.name || base;
    var id = tier;
    if (shield && (!cfg || !cfg.looks || cfg.looks[tier + "_shield"])) id = tier + "_shield";
    else if (twoH && cfg && cfg.looks && cfg.looks[tier + "_2h"]) id = tier + "_2h";
    if (cfg && cfg.looks && !cfg.looks[id]) id = cfg.looks[tier] ? tier : (cfg.defaultLook || "cloth");
    return { tier: tier, shield: id.indexOf("_shield") > 0, helm: helm, dye: String(dye || base), id: id, label: t === "warden" ? id : t + ":" + id };
  }

  function evictPriority(url) {
    if (activePath && url.indexOf(activePath) !== 0 && (!activeHelmPath || url.indexOf(activeHelmPath) !== 0)) return 0;
    if (/_mask\.webp$/.test(url) && !activeNeedsMask) return 1;
    if (/\/idle\.webp$/.test(url)) return 5;
    if (/\/walk\.webp$/.test(url)) return 4;
    if (/\/(strike|run)\.webp$/.test(url)) return 3;
    return 2;
  }
  function evict(need, keepUrl) {
    while (atlasBytes + need > BUDGET && atlasses.size) {
      var best = null, bestPri = 99, bestAt = Infinity;
      atlasses.forEach(function (v, k) {
        if (k === keepUrl) return;
        var pri = evictPriority(k);
        if (pri < bestPri || (pri === bestPri && v.at < bestAt)) {
          bestPri = pri;
          bestAt = v.at;
          best = k;
        }
      });
      if (!best) break;
      atlasBytes = Math.max(0, atlasBytes - atlasses.get(best).bytes);
      atlasses.delete(best);
      evictCount++;
    }
  }
  function loadImage(url) {
    if (atlasses.has(url)) {
      atlasses.get(url).at = performance.now();
      return Promise.resolve(atlasses.get(url).img);
    }
    if (loading.has(url)) return loading.get(url);
    var p = new Promise(function (res, rej) {
      var im = new Image();
      var done = false;
      function commit() {
        if (done) return;
        done = true;
        loading.delete(url);
        var w0 = im.naturalWidth || im.width || 0;
        var h0 = im.naturalHeight || im.height || 0;
        if (!w0 || !h0) { rej(new Error("empty:" + url)); return; }
        var bytes = w0 * h0 * 4;
        if (atlasses.has(url)) {
          atlasBytes = Math.max(0, atlasBytes - atlasses.get(url).bytes);
          atlasses.delete(url);
        }
        evict(bytes, url);
        atlasses.set(url, { img: im, bytes: bytes, at: performance.now(), url: url });
        atlasBytes += bytes;
        res(im);
      }
      im.onload = function () {
        if (typeof im.decode === "function") im.decode().then(commit, commit);
        else commit();
      };
      im.onerror = function () {
        if (done) return;
        done = true;
        loading.delete(url);
        rej(new Error(url));
      };
      im.src = url;
    });
    loading.set(url, p);
    return p;
  }
  /* Manifests are keyed by look path, so looks of different classes never collide. */
  function lookPath(cfg, id) {
    var L = cfg && cfg.looks && cfg.looks[id];
    return L ? L.path : null;
  }
  function lookMan(cfg, id) {
    var key = lookPath(cfg, id);
    if (key && manifests.has(key)) return Promise.resolve(manifests.get(key));
    var mk = "man:" + (key || id);
    if (loading.has(mk)) return loading.get(mk);
    var p = ensureRoot().then(function (r) {
      var c = cfg || r;
      var path = lookPath(c, id);
      if (!path) { loading.delete(mk); return null; }
      return fetchJSON(path + "manifest.json").then(function (m) {
        loading.delete(mk);
        m.path = path;
        manifests.set(path, m);
        return m;
      }, function (err) {
        loading.delete(mk);
        throw err;
      });
    }, function (err) {
      loading.delete(mk);
      throw err;
    });
    loading.set(mk, p);
    return p;
  }
  function prefetch(cfg, id, anims, withMask) {
    lookMan(cfg, id).then(function (m) {
      if (!m) return;
      (anims || ["idle", "walk"]).forEach(function (a) {
        var rec = m.anims[a];
        if (!rec) return;
        loadImage(m.path + rec.file).catch(function () {});
        if (withMask && rec.mask) loadImage(m.path + rec.mask).catch(function () {});
      });
    }).catch(function () {});
  }

  function applyDye(c, maskImg, rec, fr, dir, fac) {
    if (!maskImg || !fac) return;
    var cw = (rec.cell)[0], ch = (rec.cell)[1];
    var g = c.getContext("2d");
    var tmp = dyeScratch || (dyeScratch = document.createElement("canvas"));
    if (tmp.width !== cw) tmp.width = cw;
    if (tmp.height !== ch) tmp.height = ch;
    var tg = tmp.getContext("2d");
    tg.clearRect(0, 0, cw, ch);
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

  function helmFor(look, anim, cfg) {
    if (!look || !look.helm || look.helm === "none" || !cfg || !cfg.helms) return null;
    var kind = (look.shield && anim === "idle" && cfg.helms[look.helm + "_shield"]) ? look.helm + "_shield" : look.helm;
    var Hc = cfg.helms[kind];
    if (!Hc || !Hc.path) return null;
    activeHelmPath = Hc.path;
    var hm = manifests.get(Hc.path);
    if (!hm) {
      var mk = "man:" + Hc.path;
      if (!loading.has(mk)) {
        var hp = fetchJSON(Hc.path + "manifest.json").then(function (m) {
          loading.delete(mk); m.path = Hc.path; manifests.set(Hc.path, m);
          if (m.anims && m.anims[anim]) loadImage(m.path + m.anims[anim].file).catch(function () {});
          return m;
        }, function () { loading.delete(mk); return null; });
        loading.set(mk, hp);
      }
      return null;
    }
    var rec = hm.anims[anim];
    if (!rec) return null;
    var url = hm.path + rec.file, ent = atlasses.get(url);
    if (!ent) { loadImage(url).catch(function () {}); return null; }
    ent.at = performance.now();
    return { img: ent.img, rec: rec, kind: kind };
  }

  function outlined(src, alpha) {
    var c = document.createElement("canvas");
    c.width = src.width + 2; c.height = src.height + 2;
    var g = c.getContext("2d");
    if (alpha > 0) {
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (dx || dy) g.drawImage(src, 1 + dx, 1 + dy);
      g.globalCompositeOperation = "source-in";
      g.fillStyle = "rgba(10,8,6," + alpha + ")";
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = "source-over";
    }
    g.drawImage(src, 1, 1);
    return c;
  }

  function blit(m, anim, dir, fr, look, cfg) {
    var dye = typeof look === "string" ? look : (look && look.dye);
    var rec = m.anims[anim];
    if (!rec) rec = m.anims.idle;
    if (!rec) return null;
    var url = m.path + rec.file;
    var ent = atlasses.get(url);
    if (!ent) { loadImage(url).catch(function () {}); return null; }
    ent.at = performance.now();
    var fac = dyeFactors(dye, cfg);
    var maskUrl = rec.mask ? m.path + rec.mask : null;
    var maskEnt = (fac && maskUrl) ? atlasses.get(maskUrl) : null;
    if (fac && maskUrl && !maskEnt) { loadImage(maskUrl).catch(function () {}); }
    if (maskEnt) maskEnt.at = ent.at;
    var cw = (rec.cell || m.cell)[0], ch = (rec.cell || m.cell)[1];
    var foot = rec.foot || m.foot;
    fr = ((fr % rec.frames) + rec.frames) % rec.frames;
    dir = ((dir % rec.dirs) + rec.dirs) % rec.dirs;
    if (!look || !look.helm || look.helm === "none") activeHelmPath = null;
    var H = (typeof look === "object") ? helmFor(look, anim, cfg) : null;
    lastHelmKind = H ? H.kind : null;
    var ol = outlineAlpha();
    var base = (cfg && cfg.baseDye) || "ashguard";
    var dkey = fac ? (maskEnt ? (dye || "custom") : base) : base;
    var key = m.path + "|" + anim + "|" + dir + "|" + fr + "|" + dkey + "|" + (H ? H.kind : "-") + "|" + ol;
    if (composites.has(key)) { var hit = composites.get(key); composites.delete(key); composites.set(key, hit); return hit; }
    var ox = 0, oy = 0, W = cw, Hh = ch, hx = 0, hy = 0, hw = 0, hh = 0;
    if (H) {
      var hr = H.rec, hfr = ((fr % hr.frames) + hr.frames) % hr.frames, hdir = ((dir % hr.dirs) + hr.dirs) % hr.dirs;
      hw = hr.cell[0]; hh = hr.cell[1];
      hx = foot[0] - hr.foot[0]; hy = foot[1] - hr.foot[1];
      var x0 = Math.min(0, hx), y0 = Math.min(0, hy), x1 = Math.max(cw, hx + hw), y1 = Math.max(ch, hy + hh);
      ox = -x0; oy = -y0; W = Math.ceil(x1 - x0); Hh = Math.ceil(y1 - y0);
      H.sx = hfr * hw; H.sy = hdir * hh;
    }
    var c = document.createElement("canvas");
    c.width = W; c.height = Hh;
    var g = c.getContext("2d");
    g.drawImage(ent.img, fr * cw, dir * ch, cw, ch, ox, oy, cw, ch);
    if (fac && maskEnt) {
      if (ox || oy || W !== cw || Hh !== ch) {
        var bc = document.createElement("canvas"); bc.width = cw; bc.height = ch;
        bc.getContext("2d").drawImage(ent.img, fr * cw, dir * ch, cw, ch, 0, 0, cw, ch);
        applyDye(bc, maskEnt.img, rec, fr, dir, fac);
        g.clearRect(0, 0, W, Hh); g.drawImage(bc, ox, oy);
      } else applyDye(c, maskEnt.img, rec, fr, dir, fac);
    }
    if (H) g.drawImage(H.img, H.sx, H.sy, hw, hh, ox + hx, oy + hy, hw, hh);
    var out = ol > 0 ? outlined(c, ol) : c;
    var pad = ol > 0 ? 1 : 0;
    var F = { c: out, cx: foot[0] + ox + pad, cy: foot[1] + oy + pad };
    composites.set(key, F);
    if (composites.size > MAX_COMPOSITES) composites.delete(composites.keys().next().value);
    return F;
  }

  function scaleToGame(F, r, cfg) {
    /* r is the tile size in CSS px (Na()). Bake dpr caps at 2. Size the canvas so the
       character's foot-to-head span is heightTiles tiles after Dn divides by D. */
    if (!root || !F) return F;
    var D = (typeof ab3BakeDpr === "function") ? ab3BakeDpr() : 2;
    var charH = cfgVal(cfg, "charHeight", 148);
    var tiles = cfgVal(cfg, "heightTiles", 1.33);
    var s = r || 53;
    var target = tiles * s * D;
    var sc = target / charH;
    if (Math.abs(sc - 1) < 0.04) return F;
    var scKey = Math.round(sc * 1000);
    if (F._scKey === scKey && F._scaled) return F._scaled;
    var c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(F.c.width * sc));
    c.height = Math.max(1, Math.round(F.c.height * sc));
    var g = c.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.drawImage(F.c, 0, 0, c.width, c.height);
    var out = { c: c, cx: F.cx * sc, cy: F.cy * sc };
    F._scKey = scKey;
    F._scaled = out;
    return out;
  }

  var warmDone = new Set();
  function warmCombat(cfg, look, m, needMask) {
    var wk = m.path + "|" + (needMask ? 1 : 0);
    if (warmDone.has(wk)) return;
    var a = m.anims;
    if (!(a.idle && atlasses.has(m.path + a.idle.file) && a.walk && atlasses.has(m.path + a.walk.file))) return;
    warmDone.add(wk);
    var go = function () {
      prefetch(cfg, look.id, ["run", "strike", "hit"], needMask);
      /* r15 skillfx: warm the cast poses this look has (slam/throw/cast/...) a beat later */
      var extra = Object.keys(a).filter(function (k) { return FX_ANIMS[k]; });
      if (extra.length) setTimeout(function () { prefetch(cfg, look.id, extra, needMask); }, 900);
    };
    if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2500 }); else setTimeout(go, 600);
  }

  function findLoadedAnim(m, anim) {
    var order = anim === "run"
      ? ["walk", "idle", "strike", "hit", "death"]
      : anim === "walk"
        ? ["idle", "run", "strike", "hit", "death"]
        : (anim === "idle" || anim === "strike" || anim === "hit" || anim === "death")
          ? ["idle", "walk", "run", "strike", "hit", "death"]
          : ["strike", "idle", "walk", "run", "hit", "death"]; /* r15 skillfx cast poses fall back to the strike swing */
    for (var i = 0; i < order.length; i++) {
      var cand = order[i];
      var rec = m.anims[cand];
      if (rec && atlasses.has(m.path + rec.file)) return cand;
    }
    return null;
  }

  function abRealFrame(t, col, acc, pose, face, r, quiet) {
    lastPending = false;
    var st = w.ASHBOUND && ASHBOUND.state;
    var inPlay = !!(st && st.mode === "play");
    if (!enabled() || rootFailed) {
      if (inPlay) { lastLook = null; w.abRealLast = null; }
      return null;
    }
    var cfg = classCfg(t);
    if (cfg === null) {
      if (inPlay) { lastLook = null; w.abRealLast = null; }
      return null;
    }
    var lastRaw = lastRawBy[t] || null;
    if (cfg === undefined && t !== "warden") {
      /* root or class json still loading: hold (no HD/old flash) */
      lastPending = true;
      if (!root) ensureRoot().catch(function () {});
      return lastRaw ? { F: scaleToGame(lastRaw, r, null), mir: 0 } : null;
    }
    var look = lookFrom(t, cfg);
    if (!look) {
      if (inPlay) { lastLook = null; w.abRealLast = null; }
      return null;
    }
    lastPending = true;
    lastLook = look.label;
    w.abRealLast = look.label;
    var needMask = !!dyeFactors(look.dye, cfg);
    activeNeedsMask = needMask;
    if (!root) {
      ensureRoot().then(function () { prefetch(root, look.id, ["idle", "walk"], needMask); }).catch(function () {});
      return lastRaw ? { F: scaleToGame(lastRaw, r, cfg), mir: 0 } : null;
    }
    var path = lookPath(cfg, look.id);
    if (path) activePath = path;
    var shift = cfgVal(cfg, "dirShift", 0) || 0;
    /* Baked rows (all classes, same camera/yaw set) start at row 0 = screen DOWN (+PI/2) and step
       counter-clockwise. Screen angle `face` has 0 = RIGHT, +PI/2 = DOWN, +-PI = LEFT, -PI/2 = UP. */
    var dir = (((Math.round((Math.PI / 2 - (face || 0)) / (Math.PI / 4)) % 8) + 8) % 8 + shift) % 8;
    var anim = (pose && pose.mode) || "idle";
    var fr = (pose && pose.frame) || 0;
    var m = path ? manifests.get(path) : null;
    if (!m) {
      if (!quiet) prefetch(cfg, look.id, !inPlay ? ["idle"] : anim === "idle" || anim === "walk" ? ["idle", "walk"] : [anim, "idle", "walk"], needMask);
      var lk = lastLoadedBy[t];
      if (lk && manifests.has(lk)) {
        var pm = manifests.get(lk);
        var pa = (pm.anims[anim] && atlasses.has(pm.path + pm.anims[anim].file)) ? anim : findLoadedAnim(pm, anim);
        if (pa) {
          var pF = blit(pm, pa, dir, fr, look, cfg);
          if (pF) {
            lastRawBy[t] = pF;
            lastAnimDrawn = pa;
            lastFallbackAnim = pa;
            lastDirDrawn = dir;
            return { F: scaleToGame(pF, r, cfg), mir: 0 };
          }
        }
      }
      return lastRaw ? { F: scaleToGame(lastRaw, r, cfg), mir: 0 } : null;
    }
    lastLoadedBy[t] = path;
    var targetRec = m.anims[anim] || m.anims.idle;
    var useAnim = anim;
    var F = null;
    if (targetRec && atlasses.has(m.path + targetRec.file)) {
      F = blit(m, anim, dir, fr, look, cfg);
      lastFallbackAnim = null;
    } else {
      if (!quiet) prefetch(cfg, look.id, inPlay ? [anim, "idle", "walk"] : [anim], needMask);
      var alt = findLoadedAnim(m, anim);
      if (alt) {
        useAnim = alt;
        lastFallbackAnim = alt;
        F = blit(m, alt, dir, fr, look, cfg);
      }
    }
    if (!F) {
      return lastRaw ? { F: scaleToGame(lastRaw, r, cfg), mir: 0 } : null;
    }
    if (!quiet && inPlay) warmCombat(cfg, look, m, needMask);
    lastRawBy[t] = F;
    lastAnimDrawn = useAnim;
    lastDirDrawn = dir;
    var scaled = scaleToGame(F, r, cfg);
    return scaled ? { F: scaled, mir: 0 } : null;
  }
  w.abRealFrame = abRealFrame;
  /* r15 skillfx: does the hero's current look have this baked anim (and how many frames)? */
  var FX_ANIMS = { slam: 1, throw: 1, dash: 1, hook: 1, cast: 1, plant: 1, roll: 1 };
  function curManifest() { return activePath ? manifests.get(activePath) : null; }
  w.abRealHas = function (anim) {
    var m = curManifest(); var rec = m && m.anims && m.anims[anim];
    if (!rec) return false;
    if (!atlasses.has(m.path + rec.file)) { if (FX_ANIMS[anim]) { loadImage(m.path + rec.file).catch(function () {}); if (activeNeedsMask && rec.mask) loadImage(m.path + rec.mask).catch(function () {}); } return false; }
    if (activeHelmPath) { /* a worn helm layer must have the pose too, or the helm would blink off mid-cast */
      var hm = manifests.get(activeHelmPath), hr = hm && hm.anims && hm.anims[anim];
      if (!(hr && atlasses.has(hm.path + hr.file))) { if (hm && hr) loadImage(hm.path + hr.file).catch(function () {}); return false; }
    }
    return true;
  };
  w.abRealFrames = function (anim) { var m = curManifest(); var rec = m && m.anims && m.anims[anim]; return rec ? rec.frames : 0; };
  w.abRealStats = function () {
    return {
      on: enabled(), look: lastLook, atlasMB: +(atlasBytes / 1048576).toFixed(2),
      atlasses: atlasses.size, composites: composites.size, root: !!root, looks: [...manifests.keys()], classes: [...classCfgs.keys()],
      evicts: evictCount, helm: lastHelmKind, outline: outlineAlpha(), anim: lastAnimDrawn, fallbackAnim: lastFallbackAnim, dir: lastDirDrawn, pending: lastPending
    };
  };

  if (enabled()) {
    ensureRoot().then(function (r) {
      if (!r) return;
      var id = r.defaultLook || "cloth";
      if (r.looks && r.looks[id]) activePath = r.looks[id].path;
      prefetch(r, id, ["idle", "walk"], false);
    }).catch(function () {});
  }
})(window);
