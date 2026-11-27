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
    var act = Object.keys(sk).filter(function (k) { if (!((sk[k] || 0) > 0)) return false; var d = skillOf ? skillOf(k) : null; return !!d && d.type === "active"; });
    for (var a = 0; a < act.length; a++) {
      id = act[a]; if (bar.indexOf(id) >= 0) continue;
      var slot = -1;
      for (i = 0; i < 4; i++) if (!bar[i] && !(mem && mem[i])) { slot = i; break; }
      if (slot < 0) break;
      bar[slot] = id;
    }
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
    for (var i = 0; i < 4; i++) {
      var b = document.getElementById("skill-" + i); if (!b) continue;
      var id = p.bar && p.bar[i];
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
  function loop() { try { paint(); } catch (e) { if (!api.err) { api.err = String(e); console.warn("ABSkillBar", e); } } root.requestAnimationFrame(loop); }
  function boot() { css(); root.requestAnimationFrame(loop); }

  var api = { treeRespec: treeRespec, fill: fill, paint: paint, cfg: C, respecCfg: R, _max: maxCd };
  root.ABSkillBar = api;
  if (root.ASHBOUND_DATA_READY) root.ASHBOUND_DATA_READY.then(boot, boot); else if (root.addEventListener) root.addEventListener("load", boot);
})(typeof window !== "undefined" ? window : this);
