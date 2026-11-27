/* Ashbound v84k skill bar. Settings: data/skillbar.json.
   1. treeRespec: the skill screen's "Hold to respec" refunds tree points only. It used to run Lye's full retrain, which also
      refunded every stat point; gear whose Strength/Dexterity needs were met by spent stats switched off and damage fell to
      a few points until the stats were spent again. Stats, gear and non-tree buffs now stay; the bar is remembered.
   2. fill: replaces the old per-frame bar auto-fill (Tr in index.html). Remembered skills go back to the slot they had;
      other learned actives fill the first free slot that no remembered skill is waiting for.
   3. Cooldown overlay on each HUD skill button: a dark clock sweep that drains, big seconds in the middle (one decimal under
      1 s), a greyed icon while cooling, a short glow when ready, and a blue tint when there is not enough mana. */
(function (root) {
  "use strict";
  var CSS_ID = "ab-skillbar-css";
  function D() { return (root.ASHBOUND_DATA && root.ASHBOUND_DATA.skillbar) || {}; }
  function C() {
    var c = D().cooldown || {};
    var d = { enabled: true, shade: "rgba(0,0,0,0.70)", rim: "rgba(255,170,80,0.85)", text: "#fff4dc", textShadow: "0 0 3px #000, 0 1px 2px #000",
      fontPx: 20, fontPxSmall: 17, decimalUnderSec: 1, minShowSec: 0.05, desaturate: 0.9, dim: 0.6, readyFlashMs: 450,
      readyGlow: "rgba(255,196,96,0.95)", noManaTint: "rgba(40,90,220,0.50)", noManaText: "#a8ccff", noManaLabel: "mana" };
    var o = {}; for (var k in d) o[k] = c[k] != null ? c[k] : d[k]; return o;
  }
  function R() { var r = D().respec || {}; return { mode: r.mode || "tree", costPerLevel: r.costPerLevel != null ? +r.costPerLevel : 40, rememberBar: r.rememberBar !== false,
    toast: r.toast || "Tree points refunded. Your stats and gear stay.", costToast: r.costToast || "Respec costs {cost} gold." }; }

  // ---- respec (tree only) ---------------------------------------------------
  function treeRespec(state, hooks) {
    var p = state && state.player, T = root.ABTree, cfg = R();
    if (!p || !T || !T.active || !T.active(p)) return { toast: "Nothing to respec.", kind: "bad" };
    var cost = Math.max(0, Math.round((p.level || 1) * cfg.costPerLevel));
    if ((p.gold || 0) < cost) return { toast: cfg.costToast.replace("{cost}", cost), kind: "bad" };
    var spent = T.spentPoints ? T.spentPoints(p) : 1;
    if (!spent) return { toast: "No tree points to refund.", kind: "bad", save: false };
    p.gold -= cost;
    if (cfg.rememberBar) p.barMemory = (p.bar || []).slice(0, 4);
    T.resetFree(p); // tree points back, tree buffs dropped, ranks re-derived (bar entries for unlearned skills clear)
    if (state.ui) state.ui.treeUndo = [];
    if (hooks && hooks.recalc) hooks.recalc();
    api.respecs = (api.respecs || 0) + 1;
    return { toast: cfg.toast, kind: "good" };
  }

  // ---- bar fill (every frame, from se()) --------------------------------------
  function fill(p, skillOf) {
    if (!p || !Array.isArray(p.bar)) return;
    var bar = p.bar, sk = p.skills || {}, mem = Array.isArray(p.barMemory) ? p.barMemory : null, i, id;
    while (bar.length < 4) bar.push(null);
    if (mem) {
      var waiting = 0;
      for (i = 0; i < 4; i++) {
        id = mem[i]; if (!id) continue;
        if (bar[i] === id) { mem[i] = null; continue; }               // back in its slot
        if (bar[i] && bar[i] !== id) { mem[i] = null; continue; }     // the player put something else there
        if (bar.indexOf(id) >= 0) { mem[i] = null; continue; }        // the player placed it elsewhere
        if ((sk[id] || 0) > 0) { bar[i] = id; mem[i] = null; continue; }
        waiting++;
      }
      if (!waiting) { delete p.barMemory; mem = null; }
    }
    // v84n: an ultimate never auto-fills slots 1-4 (it has its own button)
    var act = Object.keys(sk).filter(function (k) { if (!((sk[k] || 0) > 0)) return false; if (root.ABTree && root.ABTree.isUltId && root.ABTree.isUltId(k)) return false; var d = skillOf ? skillOf(k) : null; return !!d && d.type === "active"; });
    for (var a = 0; a < act.length; a++) {
      id = act[a]; if (bar.indexOf(id) >= 0) continue;
      var slot = -1;
      for (i = 0; i < 4; i++) if (!bar[i] && !(mem && mem[i])) { slot = i; break; }
      if (slot < 0) break;
      bar[slot] = id;
    }
  }


  // ---- v84n ultimate button (#skill-ult, hotkey 5) --------------------------------------------------------------------
  // Bar slots 1-4 hold actives only. The ultimate has its own button: it shows the owned ACTIVE ultimate (ABTree.ultOf),
  // is locked ("40") before one is learned, and a passive ultimate shows as always on (no press). Ult nodes carry
  // kind: active|passive in the tree data, so a second ult per tree later only needs data. Sizes / text: skillbar.json "ult".
  function UC() {
    var d = ((root.ASHBOUND_DATA || {}).skillbar || {}).ult || {};
    return {
      enabled: d.enabled !== false, size: d.size != null ? +d.size : 54, gap: d.minGap != null ? +d.minGap : 8, edge: d.edge != null ? +d.edge : 6,
      key: d.key || "5", label: d.label || "Ultimate", tag: d.tag || "ULT", lockedText: d.lockedText || "40", passiveText: d.passiveText || "On",
      ring: d.ring || "#ffd27a", ringLocked: d.ringLocked || "rgba(201,163,94,0.6)", glow: d.glow || "rgba(255,170,70,0.55)",
      lockedToast: d.lockedToast || "Your ultimate unlocks at 40 points in a tree.",
      passiveToast: d.passiveToast || "Your ultimate is passive: it is always on.",
      avoid: d.avoid || ["#btn-attack", "#skill-0", "#skill-1", "#skill-2", "#skill-3", "#belt-left > *", "#belt-right > *", "#btn-portal", "#btn-transmute", "#life-orb", "#mana-orb", "#stam-bar", "#dock", "#dock-left", "#dock-right", "#joystick", "#minimap", "#btn-mute", "#topbar", "#quest-track", "#hud-goal"]
    };
  }
  function ultState(p) {
    var T = root.ABTree;
    if (!T || !T.active || !T.active(p) || !T.ultOf) return { state: "none" };
    var id = T.ultOf(p); if (id) return { state: "ready", id: id };
    var pas = (T.ultNodes(p) || []).filter(function (x) { return x.owned && x.kind === "passive"; })[0];
    return pas ? { state: "passive", id: pas.skill } : { state: "locked" };
  }
  function ultWhy(p) { var u = ultState(p), c = UC(); return u.state === "passive" ? c.passiveToast : c.lockedToast; }
  var ultKey = "", ultSeen = 0;
  function ultCss() {
    if (document.getElementById(CSS_ID + "-ult")) return;
    var c = UC(), s = document.createElement("style"); s.id = CSS_ID + "-ult";
    s.textContent = [
      "#cast #skill-ult.ult-btn{position:absolute;left:auto;right:auto;top:auto;bottom:auto;width:" + c.size + "px !important;height:" + c.size + "px !important;min-width:" + c.size + "px;min-height:" + c.size + "px;margin:0;padding:0;box-sizing:border-box;border-radius:50% !important;border:2px solid " + c.ring + " !important;box-shadow:0 0 0 2px rgba(18,10,6,.92),0 0 0 4px " + c.ring + ",0 0 16px " + c.glow + " !important;background:radial-gradient(circle at 50% 40%,#43291a,#140b06 72%) !important;z-index:4;touch-action:manipulation;overflow:visible}",
      "#cast #skill-ult.ult-btn > img.skill-ico,#cast #skill-ult.ult-btn > svg.skill-ico{width:84%;height:84%;margin:auto;position:absolute;inset:0;border-radius:50%}",
      "#cast #skill-ult.is-locked{border-style:dashed !important;border-color:" + c.ringLocked + " !important;box-shadow:0 0 0 2px rgba(18,10,6,.92),0 0 0 4px " + c.ringLocked + " !important;}",
      "#cast #skill-ult .ult-lock{position:absolute;inset:0;display:grid;place-items:center;font:700 16px/1 var(--ua-title,serif);color:#e8c36a;opacity:.85;pointer-events:none}",
      "#cast #skill-ult.is-passive .ult-lock{font-size:22px;color:#ffd27a;opacity:1}",
      "#cast #skill-ult .ult-tag{position:absolute;left:50%;bottom:-10px;transform:translateX(-50%);z-index:5;padding:0 5px;border-radius:7px;font:700 11px/13px var(--sans,sans-serif);letter-spacing:.04em;color:#ffd27a;background:#24160c;border:1px solid " + c.ring + ";pointer-events:none;white-space:nowrap}",
      "#cast #skill-ult .key{z-index:5}",
      "body.panel-open #cast #skill-ult{visibility:hidden}"
    ].join("\n");
    document.head.appendChild(s);
  }
  function ultBtn() {
    var cast = document.getElementById("cast"); if (!cast) return null;
    var b = document.getElementById("skill-ult");
    if (!b) {
      ultCss();
      b = document.createElement("button"); b.type = "button"; b.id = "skill-ult"; b.className = "skill-btn ult-btn";
      b.setAttribute("data-act", "cast"); b.setAttribute("data-slot", "4"); cast.appendChild(b); ultKey = ""; api.ultPos = null;
    } else if (b.parentNode !== cast) cast.appendChild(b);
    return b;
  }
  function paintUlt(s) {
    var c = UC(), b = ultBtn(); if (!b) return;
    var T = root.ABTree, on = c.enabled && T && T.active && T.active(s.player);
    if (!on) { if (b.style.display !== "none") b.style.display = "none"; return; }
    if (b.style.display === "none") { b.style.display = ""; api.ultPos = null; }
    var u = ultState(s.player), d = u.id && T.tools && T.tools.skillDef(u.id), key = u.state + ":" + (u.id || "");
    if (key !== ultKey) {
      ultKey = key; b.dataset.state = u.state; b.dataset.skill = u.id || "";
      b.classList.toggle("is-locked", u.state !== "ready"); b.classList.toggle("is-passive", u.state === "passive"); b.classList.toggle("empty-skill", u.state !== "ready");
      var ico = u.state === "ready" && d && typeof root.ABSkillIco === "function" ? root.ABSkillIco(d) : "";
      b.innerHTML = '<span class="key">' + c.key + "</span>" + (ico || '<span class="ult-lock" aria-hidden="true">' + (u.state === "passive" ? c.passiveText : c.lockedText) + "</span>") + '<span class="ult-tag">' + c.tag + "</span>";
      var lab = c.label + (u.state === "ready" ? ": " + ((d && d.name) || u.id) : u.state === "passive" ? ": " + ((d && d.name) || "") + " (" + c.passiveToast + ")" : " (" + c.lockedToast + ")");
      b.setAttribute("aria-label", lab); b.title = lab;
      if (u.state !== "ready") b.setAttribute("aria-disabled", "true"); else b.removeAttribute("aria-disabled");
    }
    if (!api.ultPos || ++ultSeen % 45 === 0) placeUlt();
  }
  function hitBox(a, b, pad) { return a.left < b.right + pad && b.left < a.right + pad && a.top < b.bottom + pad && b.top < a.bottom + pad; }
  function placeUlt() {
    var b = document.getElementById("skill-ult"), atk = document.getElementById("btn-attack"), cast = document.getElementById("cast");
    if (!b || !atk || !cast || b.style.display === "none" || document.body.classList.contains("panel-open")) return null;
    var c = UC(), S = c.size, A = atk.getBoundingClientRect(); if (!A.width) return null;
    var vw = root.innerWidth, vh = root.innerHeight, key = [vw, vh, Math.round(A.left), Math.round(A.top), document.body.classList.contains("left-hand")].join(",");
    var Cr = cast.getBoundingClientRect(), cx = A.left + A.width / 2, cy = A.top + A.height / 2, Rs = A.width / 2;
    var sa = (root.ABSafeArea && root.ABSafeArea.insets && root.ABSafeArea.insets()) || { left: 0, right: 0, top: 0, bottom: 0 };
    var lo = { x: (sa.left || 0) + c.edge, y: (sa.top || 0) + c.edge }, hi = { x: vw - (sa.right || 0) - c.edge, y: vh - (sa.bottom || 0) - c.edge - 8 };
    var boxes = [];
    c.avoid.forEach(function (sel) {
      var els; try { els = document.querySelectorAll(sel); } catch (e) { els = []; }
      Array.prototype.forEach.call(els, function (el) {
        if (el === b || b.contains(el)) return;
        var st = getComputedStyle(el); if (st.display === "none" || st.visibility === "hidden" || el.classList.contains("hidden")) return;
        var r = el.getBoundingClientRect(); if (r.width > 1 && r.height > 1) boxes.push(r);
      });
    });
    var dir0 = Math.atan2(vh * 0.3 - cy, vw / 2 - cx), best = null, tagH = 10;
    for (var R = Rs + S / 2 + c.gap; R < Rs + S * 5 && !best; R += 3) {
      for (var k = 0; k <= 72 && !best; k++) {
        var off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 36), th = dir0 + off;
        var x = cx + Math.cos(th) * R, y = cy + Math.sin(th) * R;
        var me = { left: x - S / 2, right: x + S / 2, top: y - S / 2, bottom: y + S / 2 + tagH };
        if (me.left < lo.x || me.right > hi.x || me.top < lo.y || me.bottom > hi.y) continue;
        var bad = false;
        for (var i = 0; i < boxes.length; i++) if (hitBox(me, boxes[i], c.gap)) { bad = true; break; }
        if (!bad) best = { x: x, y: y, R: R, th: th };
      }
    }
    if (!best) best = { x: cx - Rs - S, y: cy - Rs - S, R: 0, th: 0, fallback: true };
    b.style.left = Math.round(best.x - S / 2 - Cr.left) + "px"; b.style.top = Math.round(best.y - S / 2 - Cr.top) + "px";
    b.style.right = "auto"; b.style.bottom = "auto";
    api.ultPos = { x: Math.round(best.x), y: Math.round(best.y), R: Math.round(best.R), deg: Math.round(best.th * 180 / Math.PI), fallback: !!best.fallback, key: key, boxes: boxes.length };
    return api.ultPos;
  }

  // ---- cooldown overlay -----------------------------------------------------
  var maxCd = {}, lastCd = {}, flashUntil = {}, wasCool = {};
  function css() {
    if (!root.document || document.getElementById(CSS_ID)) return;
    var c = C(), s = document.createElement("style"); s.id = CSS_ID;
    s.textContent = [
      ".skill-btn .ab-cd{position:absolute;inset:0;border-radius:50%;pointer-events:none;z-index:3;display:none;align-items:center;justify-content:center;overflow:hidden}",
      ".skill-btn.is-cooling .ab-cd,.skill-btn.no-mana .ab-cd{display:flex}",
      ".skill-btn.is-cooling .ab-cd{background:conic-gradient(from 0deg,transparent 0 calc(var(--cd-done,0)*360deg)," + c.shade + " calc(var(--cd-done,0)*360deg) 360deg)}",
      ".skill-btn.is-cooling .ab-cd::after{content:'';position:absolute;left:50%;top:0;width:2px;height:50%;margin-left:-1px;transform-origin:50% 100%;transform:rotate(calc(var(--cd-done,0)*360deg));background:linear-gradient(" + c.rim + ",transparent)}",
      ".skill-btn.no-mana:not(.is-cooling) .ab-cd{background:" + c.noManaTint + "}",
      ".skill-btn.is-cooling.no-mana .ab-cd{box-shadow:inset 0 0 0 40px " + c.noManaTint + "}",
      ".skill-btn .ab-cd-n{position:relative;z-index:1;font-family:var(--ua-title,inherit);font-weight:800;font-size:" + c.fontPx + "px;line-height:1;color:" + c.text + ";text-shadow:" + c.textShadow + ";font-variant-numeric:tabular-nums;letter-spacing:-.02em}",
      ".skill-btn .ab-cd-n.is-small{font-size:" + c.fontPxSmall + "px}",
      ".skill-btn.no-mana:not(.is-cooling) .ab-cd-n{font-size:10px;letter-spacing:.04em;text-transform:uppercase;color:" + c.noManaText + "}",
      "body .skill-btn.is-cooling .skill-ico,body #cast .skill-btn.is-cooling .skill-ico{filter:grayscale(" + c.desaturate + ") brightness(" + c.dim + ") !important}",
      "body .skill-btn.no-mana .skill-ico{filter:grayscale(.5) brightness(.75) !important}",
      ".skill-btn.ab-cd-on .sweep{display:none !important}",
      "@keyframes abCdReady{0%{box-shadow:0 0 0 0 " + c.readyGlow + ",inset 0 0 0 2px " + c.readyGlow + "}60%{box-shadow:0 0 14px 6px " + c.readyGlow + ",inset 0 0 0 2px " + c.readyGlow + "}100%{box-shadow:0 0 0 0 transparent}}",
      "body .skill-btn.cd-ready{animation:abCdReady " + c.readyFlashMs + "ms ease-out 1 !important}"
    ].join("\n");
    document.head.appendChild(s);
  }
  function fmt(sec, c) {
    if (sec < c.decimalUnderSec) return { t: (Math.max(0.1, Math.ceil(sec * 10) / 10)).toFixed(1), small: true };
    return { t: String(Math.ceil(sec - 1e-6)), small: false };
  }
  function manaCost(state, id) {
    var T = root.ABTree, H = T && ((T.tools && T.tools.hooks && T.tools.hooks()) || (T.hooks && T.hooks())), d = T && T.tools && T.tools.skillDef(id);
    if (!H || !H.mana || !d) return 0;
    var rank = (state.sheet && state.sheet.ranks && state.sheet.ranks[id]) || 1;
    try { return +H.mana(d, Math.max(1, rank)) || 0; } catch (e) { return 0; }
  }
  function paint() {
    var A = root.ASHBOUND, s = A && A.state, c = C();
    if (!s || !s.player || s.mode !== "play" || !c.enabled) return;
    var p = s.player, now = performance.now();
    for (var i = 0; i < 5; i++) {
      var b = document.getElementById(i < 4 ? "skill-" + i : "skill-ult"); if (!b) continue;
      var id = i < 4 ? (p.bar && p.bar[i]) : (b.dataset.state === "ready" ? b.dataset.skill : null);
      var ov = b.querySelector(":scope > .ab-cd");
      if (!id || b.classList.contains("empty-skill")) { if (ov) ov.remove(); b.classList.remove("is-cooling", "no-mana", "cd-ready", "ab-cd-on"); continue; }
      if (!ov) { ov = document.createElement("span"); ov.className = "ab-cd"; ov.setAttribute("aria-hidden", "true"); ov.innerHTML = '<span class="ab-cd-n"></span>'; b.appendChild(ov); b.classList.add("ab-cd-on"); }
      var cd = +(p.cooldowns && p.cooldowns[id]) || 0, prev = lastCd[id] || 0;
      if (cd > prev + 0.05 || !maxCd[id] || cd > maxCd[id]) maxCd[id] = Math.max(cd, 0.001);
      if (cd > c.minShowSec) wasCool[id] = true;
      else if (cd <= 0 && wasCool[id]) { wasCool[id] = false; flashUntil[id] = now + c.readyFlashMs; api.readyFlashes = (api.readyFlashes || 0) + 1; }
      lastCd[id] = cd;
      var cooling = cd > c.minShowSec, n = ov.firstChild;
      var noMana = !cooling && (p.mana || 0) + 1e-6 < manaCost(s, id);
      b.classList.toggle("is-cooling", cooling);
      b.classList.toggle("no-mana", noMana || (cooling && (p.mana || 0) + 1e-6 < manaCost(s, id)));
      if (cooling) {
        var f = fmt(cd, c), done = 1 - Math.min(1, cd / maxCd[id]);
        b.style.setProperty("--cd-done", done.toFixed(4));
        if (n.textContent !== f.t) n.textContent = f.t;
        n.classList.toggle("is-small", f.small);
        b.dataset.cd = f.t;
      } else {
        b.style.removeProperty("--cd-done");
        var lab = noMana ? c.noManaLabel : "";
        if (n.textContent !== lab) n.textContent = lab;
        n.classList.remove("is-small");
        delete b.dataset.cd;
      }
      var fl = (flashUntil[id] || 0) > now;
      if (fl && !b.classList.contains("cd-ready")) { b.classList.remove("cd-ready"); void b.offsetWidth; b.classList.add("cd-ready"); }
      if (!fl) b.classList.remove("cd-ready");
    }
  }
  function loop() { try { var A0 = root.ASHBOUND; if (A0 && A0.state && A0.state.player && A0.state.mode === "play") paintUlt(A0.state); paint(); } catch (e) { if (!api.err) { api.err = String(e); console.warn("ABSkillBar", e); } } root.requestAnimationFrame(loop); }
  function boot() { css(); root.requestAnimationFrame(loop); }

  var api = { treeRespec: treeRespec, fill: fill, paint: paint, cfg: C, respecCfg: R, _max: maxCd, ultCfg: UC, ultState: ultState, ultWhy: ultWhy, placeUlt: placeUlt };
  root.ABSkillBar = api;
  if (root.ASHBOUND_DATA_READY) root.ASHBOUND_DATA_READY.then(boot, boot); else if (root.addEventListener) root.addEventListener("load", boot);
})(typeof window !== "undefined" ? window : this);
