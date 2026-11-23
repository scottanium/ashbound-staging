// UI skin: reads data/ui.json and adds one stylesheet (<style id="ab-ui-style">) after the base CSS.
// Framed panels, bevelled buttons, clearer orbs and hotbar, bigger text, readable item tooltips; desktop also gets a larger HUD.
// Without the data file nothing is added and the game looks as it did before.
(function (root) {
  "use strict";
  var FRAMED = "#panel, #topbar, #quest-track, #bossbar, #minimap, .panel, .detail, .slot-card, .class-card, .shop-row, #tutor, .rotate-card, .toast, #point-hint";
  function px(v) { return v + "px"; }
  function frame(f) {
    var L = f.cornerLen, W = f.cornerW, c = f.corner, g = [];
    // corner marks: eight thin bars painted over the existing background colour
    [["left", "top"], ["right", "top"], ["left", "bottom"], ["right", "bottom"]].forEach(function (p) {
      g.push("linear-gradient(" + c + "," + c + ") " + p[0] + " 4px " + p[1] + " 4px / " + L + "px " + W + "px no-repeat");
      g.push("linear-gradient(" + c + "," + c + ") " + p[0] + " 4px " + p[1] + " 4px / " + W + "px " + L + "px no-repeat");
    });
    return FRAMED + " { border-color: " + f.line + "; box-shadow: 0 0 0 1px " + f.dark + ", inset 0 0 0 1px " + f.ring + ", inset 0 0 0 3px rgba(0,0,0,0.35), " + f.shadow + "; background-image: " + g.join(", ") + ", linear-gradient(" + f.paper + ", rgba(0,0,0,0.12)); }\n" +
      ".toast, #tutor, #point-hint { background-image: linear-gradient(" + f.paper + ", rgba(0,0,0,0.12)); }\n" +
      "#minimap { background-image: none; }\n" +
      "body[data-inv-profile=\"phonePortrait\"] #panel { border: 1px solid " + f.line + "; }\n";
  }
  function buttons(b) {
    return ".btn, button.btn, #dock button, .portal-btn, .flask, .skill-btn { background-image: linear-gradient(" + b.top + ", " + b.bottom + "); border-color: #b08350; color: " + b.text + "; box-shadow: inset 0 1px 0 " + b.hi + ", inset 0 -2px 0 rgba(0,0,0,0.3), 0 2px 0 " + b.edge + ", 0 4px 8px rgba(0,0,0,0.4); text-shadow: 0 1px 1px rgba(0,0,0,0.6); }\n" +
      ".btn:active, #dock button:active, .portal-btn:active, .flask:active, .skill-btn:active, #btn-attack:active { transform: translateY(1px); box-shadow: inset 0 1px 0 " + b.hi + ", 0 1px 0 " + b.edge + "; }\n" +
      ".btn.primary, button.btn.primary, #interact { background-image: linear-gradient(" + b.primaryTop + ", " + b.primaryBottom + "); border-color: #ffd6a8; color: #2a140c; text-shadow: 0 1px 0 rgba(255,230,200,0.4); box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 0 rgba(0,0,0,0.18), 0 2px 0 " + b.primaryEdge + ", 0 4px 10px rgba(0,0,0,0.45); }\n" +
      ".btn:disabled { box-shadow: none; }\n" +
      "#btn-attack { box-shadow: inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -4px 0 rgba(0,0,0,0.22), 0 0 0 3px " + b.edge + ", 0 0 0 4px #e0a060, 0 6px 14px rgba(0,0,0,0.5); text-shadow: 0 1px 0 rgba(255,230,200,0.45); }\n" +
      ".skill-btn .key, #btn-attack .key { background: rgba(10,6,4,0.7); border-radius: 4px; padding: 0 3px; line-height: 1.25; }\n" +
      ".flask.life { box-shadow: inset 0 -9px 0 rgba(160,52,40,0.6), inset 0 1px 0 " + b.hi + ", 0 2px 0 " + b.edge + ", 0 4px 8px rgba(0,0,0,0.4); }\n" +
      ".flask.mana { box-shadow: inset 0 -9px 0 rgba(44,92,176,0.6), inset 0 1px 0 " + b.hi + ", 0 2px 0 " + b.edge + ", 0 4px 8px rgba(0,0,0,0.4); }\n";
  }
  function orbs(o) {
    function ring(c) { return "conic-gradient(from 0deg, " + c[0] + " calc(var(--pct) * 1%), " + c[1] + " 0)"; }
    return ".orb.life { background: " + ring(o.life) + "; border-color: " + o.life[2] + "; }\n.orb.mana { background: " + ring(o.mana) + "; border-color: " + o.mana[2] + "; }\n" +
      ".orb { box-shadow: 0 0 0 2px " + o.rim + ", inset 0 0 0 2px rgba(0,0,0,0.45), 0 8px 16px rgba(0,0,0,0.5); }\n" +
      ".orb em { background: radial-gradient(circle at 38% 30%, " + o.inner[0] + ", " + o.inner[1] + " 72%); box-shadow: inset 0 0 0 2px rgba(0,0,0,0.55), inset 0 3px 6px rgba(255,200,150,0.12), 0 0 0 2px rgba(0,0,0,0.5); position: relative; }\n" +
      ".orb::after { content: ''; position: absolute; left: 14%; top: 8%; width: 46%; height: 30%; border-radius: 50%; background: radial-gradient(ellipse at 50% 40%, rgba(255,255,255," + o.gloss + "), rgba(255,255,255,0) 70%); pointer-events: none; }\n";
  }
  function tip(t, f) {
    return ".detail-name strong, .detail-head strong { font-size: " + t.name + "em; }\n" +
      ".detail-head { border-bottom: 1px solid rgba(154,116,72,0.5); padding-bottom: 6px; margin-bottom: 4px; }\n" +
      ".detail-scroll { line-height: " + t.line + "; background: linear-gradient(#1c1612 30%, rgba(28,22,18,0)) center top, linear-gradient(rgba(28,22,18,0), #1c1612 70%) center bottom, radial-gradient(farthest-side at 50% 0, rgba(0,0,0,0.65), rgba(0,0,0,0)) center top, radial-gradient(farthest-side at 50% 100%, rgba(0,0,0,0.65), rgba(0,0,0,0)) center bottom; background-repeat: no-repeat; background-size: 100% 26px, 100% 26px, 100% 10px, 100% 10px; background-attachment: local, local, scroll, scroll; }\n" +
            "#panel .detail-scroll .small { line-height: " + t.line + "; margin: " + t.gap + "px 0; }\n" +
      ".detail-actions { border-top: 1px solid rgba(154,116,72,0.5); }\n";
  }
  function profile(p) {
    var q = [], has = function (k) { return p[k] != null; };
    if (has("tapMin")) q.push("#panel .detail-head .btn.slim, #panel .gear-bag .row .btn, #point-hint .btn { min-height: " + px(p.tapMin) + "; }");
    if (has("btnH")) q.push(".btn, button.btn, .btn.slim, #panel .btn, #panel button.btn, #panel .btn.slim, #panel .tabs .btn { min-height: " + px(p.btnH) + "; font-size: " + px(p.btnFont) + "; }");
    if (has("panelH2")) q.push(".panel-head h2 { font-size: " + px(p.panelH2) + "; }");
    if (has("small")) q.push(".small, #panel p.small, .muted { font-size: " + px(p.small) + "; line-height: 1.4; }");
    if (has("detailFont")) q.push(".detail, .detail-scroll, .detail-scroll * { font-size: " + px(p.detailFont) + "; } .detail .detail-name strong, .detail-head strong { font-size: " + px(Math.round(p.detailFont * 1.15)) + "; }");
    if (has("slotName")) q.push(".slot .iname, .slot small, .slot-lab { font-size: " + px(p.slotName) + "; }");
    if (has("who")) q.push(".who { font-size: " + px(p.who) + "; } #hud-gold { font-size: " + px(p.who) + "; }");
    if (has("zone")) q.push("#hud-zone { font-size: " + px(p.zone) + "; }");
    if (has("goal")) q.push("#hud-goal { font-size: " + px(p.goal) + "; }");
    if (has("orbFont")) q.push(".orb em { font-size: " + px(p.orbFont) + "; }");
    if (has("dockFont")) q.push("#dock button { font-size: " + px(p.dockFont) + "; }");
    if (has("dockH") || has("tapMin")) q.push("#dock button { min-height: " + px(p.dockH != null ? p.dockH : Math.max(44, p.tapMin)) + "; }");
    if (has("dockPad")) q.push("#dock button { padding: 0 " + px(p.dockPad) + "; }");
    if (has("attackFont")) q.push("#btn-attack { font-size: " + px(p.attackFont) + "; }");
    if (has("hint")) q.push("#hud #hint { font-size: " + px(p.hint) + "; }");
    if (has("tutor")) q.push("#hud #tutor, #tutor p { font-size: " + px(p.tutor) + "; }");
    if (has("toastFont")) q.push(".toast { font-size: " + px(p.toastFont) + "; padding: 5px 9px; }");
    if (has("interact")) q.push("#interact { font-size: " + px(p.interact) + "; }");
    if (has("skillKey")) q.push(".skill-btn .key, #btn-attack .key { font-size: " + px(p.skillKey) + "; }");
    // sizes and places: desktop only
    if (has("topbarW")) {
      q.push("#topbar { width: " + px(p.topbarW) + "; top: " + px(p.topbarTop) + "; padding: 6px 16px 12px; border-radius: 16px; } .bar.xp { height: " + px(p.xpBar) + "; }");
      q.push("#quest-track { width: " + px(p.questW) + "; top: " + px(p.questTop) + "; padding: 8px 14px; min-height: 52px; border-radius: 14px; }");
      q.push("#bossbar { top: " + px(p.bossTop) + "; width: " + px(p.bossW) + "; } #boss-name { font-size: " + px(p.bossName) + "; } #bossbar .track { height: 11px; }");
      q.push(".orb { width: " + px(p.orb) + "; height: " + px(p.orb) + "; } .orb em { width: " + px(p.orbInner) + "; height: " + px(p.orbInner) + "; } .orb.life { left: " + px(p.orbSide) + "; bottom: " + px(p.orbBottom) + "; } .orb.mana { right: " + px(p.orbSide) + "; bottom: " + px(p.orbBottom) + "; }");
      q.push("#dock { bottom: " + px(p.dockBottom) + "; gap: 8px; } #dock button { min-height: " + px(p.dockH) + "; padding: 0 " + px(p.dockPad) + "; border-radius: 14px; }");
      q.push(".flask, .portal-btn { width: " + px(p.flask) + "; height: " + px(p.flask) + "; border-radius: 14px; } .flask .item-ico { width: 28px; height: 40px; } .flask-col { gap: 8px; } #belt-left { left: " + px(p.beltLeft) + "; bottom: " + px(p.beltBottom) + "; } #belt-right { right: " + px(p.beltRight) + "; bottom: " + px(p.beltBottom) + "; }");
      q.push(".skill-btn { width: " + px(p.skill) + "; height: " + px(p.skill) + "; border-radius: 16px; } #skillbar { grid-template-columns: " + px(p.skill) + " " + px(p.skill) + "; gap: 8px; } .skill-ico, .flask svg { width: 30px; height: 30px; } #btn-attack { width: " + px(p.attack) + "; height: " + px(p.attack) + "; } #cast { right: " + px(p.castRight) + "; bottom: " + px(p.castBottom) + "; gap: 12px; }");
      q.push("#minimap { width: " + px(p.minimapW) + "; height: " + px(p.minimapH) + "; border-radius: 12px; top: 10px; right: 10px; }");
      q.push("#hud #toasts { top: " + px(p.toastTop) + "; width: " + px(p.toastW) + "; left: 14px; } #hud #hint { top: " + px(p.toastTop) + "; max-width: " + px(p.toastW) + "; left: 14px; } #hud #tutor { top: " + px(p.tutorTop) + "; max-width: " + px(p.tutorW) + "; left: 14px; padding: 8px 10px 8px 14px; } #tutor-skip { min-height: 36px; padding: 4px 14px; }");
      q.push("#interact { bottom: " + px(p.interactBottom) + "; max-width: 320px; min-height: 52px; padding: 10px 20px; }");
      q.push("#joystick { width: " + px(p.joy) + "; height: " + px(p.joy) + "; } #stick { width: " + px(p.stick) + "; height: " + px(p.stick) + "; left: " + px((p.joy - p.stick) / 2 - 2) + "; top: " + px((p.joy - p.stick) / 2 - 2) + "; }");
      q.push("#hud::before { height: 120px; } #hud::after { height: 110px; }");
    }
    return q.join("\n  ");
  }
  function css(u) {
    var out = frame(u.frame) + buttons(u.button) + orbs(u.orb) + tip(u.tip, u.frame);
    Object.keys(u.profiles).forEach(function (k) { var p = u.profiles[k]; out += "@media " + p.query + " {\n  " + profile(p) + "\n}\n"; });
    return out;
  }
  function apply(u) {
    if (!u || !u.frame || document.getElementById("ab-ui-style")) return false;
    var s = document.createElement("style"); s.id = "ab-ui-style"; s.textContent = css(u); document.head.appendChild(s); return true;
  }
  root.ABUI = { apply: apply, css: css };
  if (root.ASHBOUND_DATA_READY) root.ASHBOUND_DATA_READY.then(function (D) { apply(D && D.ui); });
})(window);
