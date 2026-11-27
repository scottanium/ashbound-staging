/* reskin (r14): medieval / arcane HUD and screens in the gear tab's painted kiln-iron style.
   Pieces come from the chrome atlas through js/ab-uiart.js (CSS vars --ua-<key>); numbers and colours from data/reskin.json.
   Decoration only: border-image, backgrounds and pseudo layers. No element moves or changes size, so the HUD layout
   (ab-hudarc, ab-safearea), tap targets and Dynamic Island clearances stay exactly as before. Everything is scoped under
   html.ua-ready.rk; if the art can't load, or reskin is off (data enabled:false, ?reskin=0), the old look stays. */
(function (root) {
  "use strict";
  var st = { on: false, areas: [], css: 0 };
  function D() { return root.ASHBOUND_DATA || {}; }
  function cfg() { return D().reskin || null; }
  function off() {
    try { if (/(?:^|[?&])reskin=0(?:&|$)/.test(location.search || "")) return true; } catch (e) {}
    var c = cfg(); return !c || c.enabled === false;
  }
  function area(k) { var a = (cfg() || {}).areas || {}; return a[k] !== false; }
  function v(k) { return "var(--ua-" + k.replace(/_/g, "-") + ")"; }
  function art() { return (root.ABUiArt && ABUiArt.data()) || { chrome: { nine: {}, three: {} } }; }
  function nine(k, d) { return (art().chrome.nine || {})[k] || d; }
  function three(k, d) { return (art().chrome.three || {})[k] || d; }
  var P = "html.ua-ready.rk ";

  // ---- HUD plates: hero/zone plate, quest tracker, toasts, hints, tutor bubble, minimap, sound button ----
  function hudCss(c, t) {
    var f = c.frame || {}, hb = f.hudBorder || 11, ho = f.hudOutset || 2, hn = nine("hud_frame", 26);
    var plate = "background:linear-gradient(180deg," + (f.paperTop || "rgba(46,26,14,.55)") + ",rgba(0,0,0,0) 60%),linear-gradient(" + (f.paper || "rgba(14,10,8,.86)") + "," + (f.paper || "rgba(14,10,8,.86)") + ")," + v("panel_bg") + " !important;background-size:auto,auto,160px 160px !important;";
    var frame = "border-color:transparent !important;border-radius:3px !important;border-image:" + v("hud_frame") + " " + hn + " / " + hb + "px / " + ho + "px stretch !important;";
    var shadow = "box-shadow:0 4px 14px rgba(0,0,0,.55) !important;";
    return [
      P + "#topbar," + P + "#quest-track," + P + "#bossbar," + P + ".toast," + P + "#tutor{" + plate + frame + shadow + "}",
      // hero plate: name in Cinzel, gold in bronze-gold, zone in small caps, xp as an ember groove
      P + "#topbar .who{font-family:var(--ua-title);font-weight:700;letter-spacing:.04em;color:" + t.title + ";text-shadow:0 1px 2px #000,0 0 8px " + t.glow + "}",
      P + "#hud-gold{font-family:var(--ua-label);color:" + t.gold + ";text-shadow:0 1px 2px #000}",
      P + "#hud-zone{font-family:var(--ua-label);line-height:17px;letter-spacing:.06em;color:" + t.muted + "}",
      P + "#topbar .bar.xp{background:linear-gradient(#0b0705,#1d130d);border:1px solid #5a4128;box-shadow:inset 0 1px 2px #000}",
      P + "#topbar .bar.xp span{background:linear-gradient(90deg,#8a4a16,#ffb35a 70%,#ffe0a0);box-shadow:0 0 6px rgba(255,160,60,.6)}",
      // quest tracker: kicker on a thin rune rule, goal in serif
      P + "#quest-track #quest-kicker{font-family:var(--ua-label);font-size:11px;line-height:14px;letter-spacing:.1em;color:" + t.ember + "}",
      P + "#quest-track #hud-goal{font-family:var(--ua-title);font-weight:600;letter-spacing:.01em;color:" + t.title + ";text-shadow:0 1px 2px #000}",
      P + "#quest-track.is-guide{box-shadow:0 0 0 1px rgba(255,170,80,.35),0 0 16px rgba(255,140,50,.45),0 4px 14px rgba(0,0,0,.55) !important}",
      P + "#bossbar{border-image-source:" + v("hud_frame") + " !important}",
      P + "#boss-name{font-family:var(--ua-title);letter-spacing:.06em}",
      P + "#bossbar .track{background:linear-gradient(#0b0705,#24100a);border:1px solid #5a2a18;box-shadow:inset 0 1px 2px #000}",
      P + "#bossbar .track span{background:linear-gradient(#ff7a3a,#a8240e)}",
      // toasts / hint: framed note, Marcellus label
      P + ".toast{font-family:var(--ua-label);letter-spacing:.02em;color:" + t.label + ";text-shadow:0 1px 2px #000}",
      P + ".toast.good{color:#9fd48a}" + P + ".toast.bad{color:#ff8a6a}",
      P + "#hint{font-family:var(--ua-label);letter-spacing:.03em;text-shadow:0 1px 2px #000,0 0 6px #000}",
      P + "#hint:not(:empty){padding:3px 12px;border:0 solid transparent;border-image:" + v("hud_frame") + " " + hn + " fill / 9px / 1px stretch;background:radial-gradient(closest-side,rgba(14,10,8,.82),rgba(14,10,8,.6))}",
      P + "#tutor{border-radius:3px !important;font-family:var(--ua-label);letter-spacing:.02em;color:" + t.ember + "}",
      P + "#tutor-skip{font-family:var(--ua-label);color:" + t.label + ";background:none !important;border-color:transparent !important;box-shadow:none !important;border-image:" + v("btn_iron") + " 0 " + three("btn_iron", 112) + " fill / 0 10px stretch}",
      // minimap: canvas keeps its 1px border; the painted frame draws around it
      P + "#minimap{border-color:transparent !important;border-radius:2px !important;border-image:" + v("hud_frame") + " " + hn + " / " + hb + "px / " + (ho + 2) + "px stretch !important;box-shadow:0 4px 14px rgba(0,0,0,.55) !important}",
      // sound button: a dock plate with the bronze speaker glyph
      P + "#btn-mute{background:none !important;border-color:transparent !important;border-radius:4px;box-shadow:0 3px 10px rgba(0,0,0,.5) !important;border-image:" + v("dock_plate") + " " + nine("dock_plate", 30) + " fill / 12px stretch;color:#e2bf86;filter:drop-shadow(0 1px 0 #000)}",
      P + "#btn-mute.is-muted{color:#c07850}"
    ].join("\n");
  }

  // ---- bottom dock: framed iron plates with painted glyphs (Gear, Stats, Skills, Journal, Menu) ----
  function dockCss(c, t) {
    var d = c.dock || {}, g = d.glyphs || {}, gs = d.glyph || 24, lab = d.label || 11, n = nine("dock_plate", 30), o = [];
    o.push(P + "#dock button{position:relative;background:none !important;border-color:transparent !important;border-radius:4px !important;box-shadow:0 3px 8px rgba(0,0,0,.55) !important;border-image:" + v("dock_plate") + " " + n + " fill / " + (d.rim || 10) + "px stretch !important;color:" + t.label + ";justify-content:flex-end !important;overflow:visible}");
    o.push(P + "#dock button .dock-ico{visibility:hidden}");
    o.push(P + "#dock button::before{content:'';position:absolute;left:50%;top:" + (d.glyphTop || 2) + "px;width:" + gs + "px;height:" + gs + "px;margin-left:-" + gs / 2 + "px;background:center/contain no-repeat;filter:brightness(1.3) saturate(1.1) drop-shadow(0 1px 1px #000);pointer-events:none}");
    Object.keys(g).forEach(function (id) { o.push(P + "#dock button#btn-panel-" + id + "::before{background-image:" + v("hg_" + g[id]) + "}"); });
    o.push(P + "#dock .dock-lab{position:relative;font-family:var(--ua-label);font-size:" + lab + "px !important;line-height:" + (lab + 1) + "px;letter-spacing:0;white-space:nowrap;color:" + t.label + ";text-shadow:0 1px 1px #000,0 0 3px #000;margin-bottom:1px}");
    o.push(P + "#dock button:active{filter:brightness(1.25)}");
    o.push(P + "#dock button.ab-guide,"+ P + "#dock button.is-on," + P + "body.panel-open #dock button[aria-pressed=true]{filter:drop-shadow(0 0 5px rgba(255,150,60,.85))}");
    // tap area: when the dock is squeezed (Island side), widen the hit box into the gap without moving anything
    o.push(P + "#dock button::after{content:'';position:absolute;top:0;bottom:0;left:-" + (d.hitPad || 4) + "px;right:-" + (d.hitPad || 4) + "px}");
    return o.join("\n");
  }

  // ---- health / mana: liquid globes in an ornate rune-banded iron rim (the gauge reads as a fill level, D2-style) ----
  function orbCss(c, t) {
    var o = c.orb || {}, rim = o.rimOutset || 6, L = o.life || ["#4a0806", "#b3261a", "#ff7a5a"], M = o.mana || ["#06103e", "#2453c0", "#8ab8ff"];
    function liquid(k) {
      return "radial-gradient(circle at 36% 28%,rgba(255,255,255,.28),rgba(255,255,255,0) 34%)," +
        "radial-gradient(circle at 50% 120%,rgba(0,0,0,0),rgba(0,0,0,.55) 75%)," +
        "linear-gradient(to top," + k[0] + " 0," + k[1] + " calc(var(--pct) * 1% - 5%)," + k[2] + " calc(var(--pct) * 1% - 1%),rgba(8,5,4,.96) calc(var(--pct) * 1%),#0e0907 100%)";
    }
    return [
      P + ".orb{border-color:transparent !important;box-shadow:0 6px 14px rgba(0,0,0,.6),inset 0 0 12px rgba(0,0,0,.85) !important;border-image:" + v("orb_rim") + " 50% / 50% / " + rim + "px stretch}",
      P + ".orb.life{background:" + liquid(L) + " !important}",
      P + ".orb.mana{background:" + liquid(M) + " !important}",
      P + ".orb em{background:none !important;box-shadow:none !important;font-family:var(--ua-title);font-weight:700;color:#fff3e0;text-shadow:0 1px 2px #000,0 0 6px #000,0 0 2px #000}",
      P + ".orb::after{z-index:1}",
      // stamina: a thin ember groove in an iron channel
      P + ".stam-bar{border-color:#5a4128 !important;background:linear-gradient(#0b0705,#1d130d) !important;box-shadow:inset 0 1px 2px #000,0 0 0 1px rgba(0,0,0,.6),0 2px 6px rgba(0,0,0,.5) !important}",
      P + ".stam-bar span{background:linear-gradient(90deg,#8a5a16,#f0c24a 70%,#ffe9a0) !important;box-shadow:0 0 5px rgba(255,200,80,.55)}"
    ].join("\n");
  }

  // ---- Strike + skill slots: rune-ringed metal frames; Strike gets the glowing rune ring over an ember-lacquer face ----
  function castCss(c, t) {
    var k = c.cast || {}, so = k.slotOutset || 3, ao = k.strikeOutset || 7;
    return [
      P + ".skill-btn{background:radial-gradient(circle at 50% 38%,#2a1d16,#120c09 62%,#060403) !important;border-color:transparent !important;box-shadow:0 4px 10px rgba(0,0,0,.6),inset 0 0 10px rgba(0,0,0,.9) !important;border-image:" + v("orb_rim") + " 50% / 50% / " + so + "px stretch;overflow:visible !important;color:" + t.label + "}",
      P + ".skill-btn .sweep{border-radius:50%;background:rgba(0,0,0,.62)}",
      P + ".skill-btn .skill-ico{filter:drop-shadow(0 0 3px rgba(255,150,60,.55)) drop-shadow(0 1px 1px #000)}",
      P + ".skill-btn .learn-mark{font-family:var(--ua-title);font-weight:700;font-size:20px;color:#ffcf8a;text-shadow:0 0 6px rgba(255,140,50,.8),0 1px 2px #000}",
      P + ".skill-btn .key,"+ P + "#btn-attack .key{font-family:var(--ua-label);font-size:11px !important;line-height:13px;min-width:13px;text-align:center;color:#f3dfb5;background:radial-gradient(circle,#2a1a10,#0c0806) !important;border:1px solid #8a6438;border-radius:7px !important;padding:0 3px !important;box-shadow:0 1px 2px #000;z-index:2}",
      P + "#cast.ab-arc .skill-btn .key{top:-6px}",
      P + "#btn-attack{border-color:transparent !important;border-image:" + v("rune_ring") + " 50% / 50% / " + ao + "px stretch;" +
        "background:radial-gradient(circle at 38% 30%,rgba(255,236,200,.55),rgba(255,236,200,0) 32%),radial-gradient(circle at 50% 50%,#d9681f 0,#9a3a12 55%,#3a1206 100%) !important;" +
        "box-shadow:0 6px 16px rgba(0,0,0,.65),inset 0 0 14px rgba(40,8,0,.85),0 0 18px rgba(255,120,40,.35) !important;" +
        "font-family:var(--ua-title) !important;font-weight:700;letter-spacing:.08em;color:#fff1d8 !important;text-shadow:0 1px 0 #3a1206,0 0 6px rgba(0,0,0,.9),0 0 2px #000 !important}",
      P + "#btn-attack:active{filter:brightness(1.2)}"
    ].join("\n");
  }

  // ---- potion + town portal buttons: iron plates; the portal gets the painted arcane-portal glyph ----
  function beltCss(c, t) {
    var b = c.belt || {}, n = nine("dock_plate", 30), rim = b.rim || 9, H = "html.ua-ready.rk #hud ";
    return [
      H + ".flask," + H + ".portal-btn{background:none !important;border-color:transparent !important;border-radius:4px !important;border-image:" + v("dock_plate") + " " + n + " fill / " + rim + "px stretch !important;box-shadow:0 3px 8px rgba(0,0,0,.55) !important}",
      H + ".flask::before," + H + ".flask::after{display:none !important}",
      H + ".flask.life{box-shadow:0 3px 8px rgba(0,0,0,.55),inset 0 -10px 12px -6px rgba(170,30,20,.65) !important}",
      H + ".flask.mana{box-shadow:0 3px 8px rgba(0,0,0,.55),inset 0 -10px 12px -6px rgba(40,80,200,.65) !important}",
      H + ".flask .item-ico{filter:drop-shadow(0 0 4px rgba(255,120,80,.35)) drop-shadow(0 1px 1px #000)}",
      H + ".flask .flask-count{font:700 11px/14px var(--ua-title),serif;color:#fff0d6;background:radial-gradient(circle,#3a2414,#0c0806) !important;border:1px solid #9a7040;border-radius:7px;box-shadow:0 1px 2px #000}",
      H + ".portal-btn svg{visibility:hidden}",
      H + ".portal-btn{position:relative}",
      H + ".portal-btn::before{content:'';position:absolute;inset:" + (b.glyphInset || 6) + "px;background:" + v("hg_portal") + " center/contain no-repeat;filter:drop-shadow(0 0 5px rgba(90,170,255,.55));pointer-events:none}"
    ].join("\n");
  }

  // ---- action prompt ('Enter the portal', 'Open Kiln Box'): ornate ember banner; quest banner, pointer pills, objective arrow ----
  function promptCss(c, t) {
    var b = c.banner || {}, th = three("banner", 120), ew = b.endW || 30, eo = b.endOutset || 16;
    return [
      P + "#interact{background:none !important;border-color:transparent !important;border-radius:0 !important;box-shadow:none !important;" +
        "border-style:solid;border-image:" + v("banner") + " 0 " + th + " fill / 0 " + ew + "px / 0 " + eo + "px stretch !important;" +
        "font-family:var(--ua-title) !important;font-weight:700;letter-spacing:.05em;color:#2a0e03 !important;text-shadow:0 1px 0 rgba(255,214,160,.55) !important;filter:drop-shadow(0 4px 8px rgba(0,0,0,.6))}",
      P + "#interact:active{filter:brightness(1.15) drop-shadow(0 4px 8px rgba(0,0,0,.6))}",
      // quest banner: framed proclamation
      P + "#quest-banner{background:linear-gradient(180deg,rgba(60,30,12,.6),rgba(0,0,0,0) 70%),linear-gradient(rgba(14,10,8,.94),rgba(14,10,8,.94))," + v("panel_bg") + " !important;background-size:auto,auto,160px 160px !important;" +
        "border-color:transparent !important;border-radius:3px !important;border-image:" + v("hud_frame") + " " + nine("hud_frame", 26) + " / 12px / 2px stretch !important;box-shadow:0 10px 26px rgba(0,0,0,.6),0 0 18px rgba(255,130,50,.25) !important;" +
        "color:" + t.ember + ";text-shadow:0 1px 2px #000}",
      // pointer pill ('Skill points') and the objective arrow: bronze-rimmed
      P + "#point-hint p{font-family:var(--ua-label);letter-spacing:.03em;color:#ffd9a0;background:radial-gradient(ellipse at 50% 0,#4a2a14,#160e09) !important;border-color:#c08a4a !important;border-radius:3px !important;box-shadow:0 0 0 1px #000,0 2px 6px rgba(0,0,0,.6),0 0 8px rgba(255,140,50,.35)}",
      P + "#obj-arrow{background:radial-gradient(circle at 50% 40%,#3a1c0e,#120906) !important;border-color:transparent !important;border-image:" + v("orb_rim") + " 50% / 50% / 4px stretch}",
      P + "#obj-arrow .obj-lab{font-family:var(--ua-label);letter-spacing:.03em}"
    ].join("\n");
  }

  // ---- every panel and tab (Stats, Skills frame + branch tabs, Journal, Menu/Settings, Loot filter, Waypoints, Stall,
  //      Kiln box, Quill...): painted iron / ember buttons and tab plates like the gear tab, full-width title plaques,
  //      framed parchment-dark cards. Skill tree nodes are left alone (vtree reworks them). ----
  function plate(f) { return "background:linear-gradient(180deg,rgba(52,30,16,.42),rgba(0,0,0,0) 46%),linear-gradient(" + f + "," + f + ")," + v("panel_bg") + " !important;background-size:auto,auto,160px 160px !important;"; }
  function panelCss(c, t) {
    var k = c.panels || {}, bt = three("btn_iron", 112), hn = nine("hud_frame", 26), sw = nine("slot_well", 34), cb = k.cardBorder || 10, X = "html.ua-ready.rk #panel ";
    var BTN = [X + ".btn:not(.icon-x)", X + ".tt-tab", X + ".shop-row .btn"];
    var IRON = "background:none !important;border-color:transparent !important;box-shadow:0 2px 4px rgba(0,0,0,.45) !important;border-image:" + v("btn_iron") + " 0 " + bt + " fill / 0 16px stretch;font-family:var(--ua-label);letter-spacing:.02em;color:#d6c09c;text-shadow:0 1px 1px #000;border-radius:0 !important";
    return [
      // title plaque: show the whole word when the head has no tab row beside it
      X + ".panel-head:not(:has(.tabs)) h2{max-width:min(60%,280px) !important;text-overflow:clip}",
      BTN.join(",") + "{" + IRON + "}",
      X + ".btn.primary:not(.icon-x)," + X + ".tt-tab.is-on," + X + ".btn[aria-pressed=true]{border-image-source:" + v("btn_ember") + " !important;color:#ffeccc !important}",
      X + ".btn:disabled{filter:grayscale(.7) brightness(.75)}",
      X + ".btn:not(.icon-x):active," + X + ".tt-tab:active{filter:brightness(1.25)}",
      // cards: journal quests/runes, stat cards, Quill, sets, vendor rows
      X + ".class-card," + X + ".stat-card," + X + ".detail:not(.le-card)," + X + ".slot-card{" + plate("rgba(16,11,8,.9)") + "border-color:transparent !important;border-radius:2px !important;border-image:" + v("hud_frame") + " " + hn + " / " + cb + "px / 1px stretch !important;box-shadow:0 3px 10px rgba(0,0,0,.5) !important}",
      X + ".class-card.is-now{box-shadow:0 0 0 1px rgba(255,170,80,.25),0 0 14px rgba(255,140,50,.35),0 3px 10px rgba(0,0,0,.5) !important}",
      X + ".class-card.is-done{opacity:.8;filter:saturate(.7)}",
      X + ".class-card strong," + X + ".class-card h3," + X + ".stat-card h3," + X + ".stat-card .stat-card-title," + X + ".slot-card strong{font-family:var(--ua-title);font-weight:700;letter-spacing:.03em;color:#ecd6b0;text-shadow:0 1px 2px #000}",
      X + ".class-card.is-now strong{color:#ffc27a}",
      X + ".shop-row{" + plate("rgba(14,10,8,.88)") + "border-color:transparent !important;border-radius:2px !important;border-image:" + v("slot_well") + " " + sw + " fill / 6px stretch !important}",
      X + ".shop-row:active{filter:brightness(1.2)}",
      X + ".panel-body h3," + X + ".panel-body .act-head," + X + "strong.act{font-family:var(--ua-title);letter-spacing:.06em;color:#e2c48e}",
      // stat block buttons (+ on attributes)
      X + "button.stat{border-image:" + v("slot_well") + " " + sw + " fill / 6px stretch !important;background:none !important;border-color:transparent !important}",
      // form bits: sliders, text areas, inputs
      X + "input[type=range]{accent-color:#d0782e}",
      X + "textarea," + X + "input[type=text]{background:#0b0806 !important;color:#e8d8bc;border:1px solid #5a4128 !important;border-radius:2px;box-shadow:inset 0 2px 6px #000}",
      X + ".slider{font-family:var(--ua-label);color:#d6c09c}",
      // journal map + kiln box grids sit in a painted frame
      X + ".map-wrap{border:0 solid transparent;border-image:" + v("hud_frame") + " " + hn + " / 10px / 2px stretch;box-shadow:0 3px 10px rgba(0,0,0,.5)}",
      // waypoint rows: act headings in small caps
      X + ".abz-act," + X + ".abz-head{font-family:var(--ua-title);letter-spacing:.08em;color:#e2c48e}",
      // skill tree outer frame only: branch tabs are plates (above), bonus line and track keep their internals
      X + ".tt-bonus{font-family:var(--ua-label)}"
    ].join("\n");
  }

  // ---- vtree skill tree: each tile's icon slot sits in a painted well inside a painted frame (iron when locked or next,
  //      bronze-ember once unlocked, ornate gold for the ultimate); tree columns in framed dark parchment, the 41-50 strip
  //      as a framed band of ember sockets, the detail pane's headings in the gear-tab type. The icon (img / svg / glyph)
  //      is never styled here, so custom skill icons drop in unchanged. ----
  function treeCss(c, t) {
    var k = c.tree || {}, fr = k.frames || {}, hn = nine("hud_frame", 26), sw = nine("slot_well", 17), X = "html.ua-ready.rk #panel ";
    var TILE = X + ".tt-node.tt-tile .tt-plate", FR = function (key) { return v(key) + " " + nine(key, 17) + " / " + (k.frame || 8) + "px / 0 stretch"; };
    return [
      // well: the plate's own border box (1px) is kept; the painted well fills it, the frame rides on ::after (inset 0, under the badges)
      TILE + "{background:radial-gradient(circle at 50% 42%,rgba(60,36,20,.55),rgba(0,0,0,0) 70%) !important;border-color:transparent !important;border-style:solid !important;border-radius:2px !important;border-image:" + v("slot_well") + " " + sw + " fill / " + (k.well || 6) + "px / 0 stretch !important;box-shadow:0 2px 0 #0d0907,0 3px 7px rgba(0,0,0,.55) !important}",
      TILE + "::after{content:'';position:absolute;inset:0;pointer-events:none;z-index:1;border:0 solid transparent;border-image:" + FR(fr.locked || "frame_common") + "}",
      X + ".tt-node.tt-tile.st-locked .tt-plate{opacity:.55;filter:saturate(.45) brightness(.85)}",
      X + ".tt-node.tt-tile.st-next .tt-plate::after{border-image-source:" + v(fr.next || "frame_common") + "}",
      X + ".tt-node.tt-tile.st-next .tt-plate{box-shadow:0 0 0 1px rgba(255,150,60,.55),0 0 10px rgba(255,140,50,.55),0 3px 7px rgba(0,0,0,.55) !important}",
      X + ".tt-node.tt-tile.st-unlocked .tt-plate::after{border-image-source:" + v(fr.unlocked || "frame_epic") + "}",
      X + ".tt-node.tt-tile.is-ult .tt-plate::after{border-image-source:" + v(fr.ult || "frame_unique") + "}",
      X + ".tt-node.tt-tile.is-ult.st-unlocked .tt-plate{box-shadow:0 0 0 1px rgba(255,210,122,.5),0 0 14px rgba(255,170,70,.5),0 3px 7px rgba(0,0,0,.55) !important}",
      X + ".tt-node.tt-tile.is-sel .tt-plate{outline:2px solid #ffc46e !important;outline-offset:1px !important}",
      // painted skill icons (ab-skillart: img inset 3px in the plate, with its own class rim): the frame moves to a ring on the
      // tile button that runs from 1px outside the plate to the icon's edge, so it wraps the picture and never covers it;
      // locked art keeps ab-skillart's readable dimming instead of the darker glyph dimming
      X + ".tt-node.tt-tile:has(img.skill-art) .tt-plate::after{display:none}",
      X + ".tt-node.tt-tile:has(img.skill-art)::before{content:'';position:absolute;inset:-" + (k.artRingOut || 1) + "px;pointer-events:none;z-index:1;border:0 solid transparent;border-image:" + v(fr.locked || "frame_common") + " " + nine(fr.locked || "frame_common", 17) + " / " + (k.artRing || 4) + "px / 0 stretch}",
      X + ".tt-node.tt-tile.st-unlocked:has(img.skill-art)::before{border-image-source:" + v(fr.unlocked || "frame_epic") + "}",
      X + ".tt-node.tt-tile.is-ult:has(img.skill-art)::before{border-image-source:" + v(fr.ult || "frame_unique") + "}",
      X + ".tt-node.tt-tile.st-locked .tt-plate:has(img.skill-art){opacity:.9;filter:none}",
      X + ".tt-node.tt-tile .tt-plate .tt-at," + X + ".tt-node.tt-tile .tt-plate .tt-rank," + X + ".tt-node.tt-tile .tt-plate .tt-ult{z-index:3 !important}",
      X + "#detail .tt-dico{border:0 solid transparent;border-image:" + v(fr.unlocked || "frame_epic") + " " + nine(fr.unlocked || "frame_epic", 17) + " / 5px / 3px stretch;box-shadow:0 2px 6px rgba(0,0,0,.55)}",
      // level and rank badges: small iron / gold chips (same size and place)
      X + ".tt-node.tt-tile .tt-at{background:radial-gradient(circle,#2a1a10,#0c0806) !important;border:1px solid #8a6438 !important;color:#e8d2a8 !important;font-family:var(--ua-label);border-radius:2px !important}",
      X + ".tt-node.tt-tile.st-unlocked .tt-at{background:linear-gradient(#ffb35a,#c8641e) !important;border-color:#ffd9a0 !important;color:#1a0f08 !important}",
      X + ".tt-node.tt-tile .tt-rank{background:linear-gradient(#2a1a10,#0c0806) !important;border-color:#e8c36a !important;color:#ffd98a !important;font-family:var(--ua-label);border-radius:2px !important}",
      X + ".tt-node.tt-tile .tt-ult{font-family:var(--ua-label);color:#1a0f08 !important;background:linear-gradient(#ffe0a0,#d0902e) !important;border-radius:2px}",
      X + ".tt-node.tt-tile .tt-nm{color:#efdcb8;background:linear-gradient(180deg,transparent,rgba(8,5,3,.9) 45%)}",
      // tree columns: framed dark parchment; the open tree glows ember
      X + ".tt-col{" + plate("rgba(14,10,8,.8)") + "border-color:transparent !important;border-radius:2px !important;border-image:" + v("hud_frame") + " " + hn + " / " + (k.colFrame || 9) + "px / " + (k.colOutset || 2) + "px stretch !important;box-shadow:0 3px 10px rgba(0,0,0,.5) !important}",
      X + ".tt-col.is-on{" + plate("rgba(30,18,10,.82)") + "box-shadow:0 0 0 1px rgba(255,170,80,.28),0 0 16px rgba(255,140,50,.35),0 3px 10px rgba(0,0,0,.5) !important}",
      // tree headers: ember-veined title plaques (the gear tab's title piece); the open tree burns brighter, the others are cooled
      X + ".tt-col .tt-tab{border-image:" + v("title_plaque") + " 0 " + three("title_plaque", 100) + " fill / 0 " + (k.plaqueEnd || 14) + "px stretch !important;font-family:var(--ua-title) !important;font-weight:700;letter-spacing:.05em;color:#e8d2a8 !important;text-shadow:0 1px 2px #000 !important}",
      X + ".tt-col .tt-tab.is-on{border-image-source:" + v("title_plaque") + " !important;color:#ffc27a !important;text-shadow:0 1px 2px #000,0 0 10px rgba(255,140,60,.7) !important;filter:drop-shadow(0 0 6px rgba(255,130,50,.45))}",
      X + ".tt-col:not(.is-on) .tt-tab{filter:saturate(.55) brightness(.8)}",
      // action-bar slots in the detail pane: recessed iron wells (44px kept)
      X + "#detail .bar-slot{border-image:" + v("slot_well") + " " + sw + " fill / 7px / 0 stretch !important;background:none !important;box-shadow:inset 0 2px 6px rgba(0,0,0,.7) !important;font-family:var(--ua-title) !important;font-weight:700;color:#e8c890 !important;text-shadow:0 1px 2px #000,0 0 6px rgba(255,140,60,.35) !important}",
      X + "#detail .bar-slot.is-on," + X + "#detail .bar-slot[aria-pressed=true]{box-shadow:inset 0 0 0 1px rgba(255,170,80,.7),0 0 10px rgba(255,140,50,.5) !important;color:#ffd9a0 !important}",
      // 41-50 strip: framed band, points as ember sockets
      X + ".tt-band{" + plate("rgba(12,8,6,.92)") + "border-color:transparent !important;border-radius:2px !important;border-image:" + v("banner") + " " + (k.bandSliceY || 30) + " " + three("banner", 120) + " / " + (k.bandEdgeY || 5) + "px " + (k.bandEdgeX || 14) + "px / 1px " + (k.bandOut || 6) + "px stretch !important;font-family:var(--ua-label);color:#d8c19a}",
      X + ".tt-band b{font-family:var(--ua-title);color:#ffc27a;letter-spacing:.03em}",
      X + ".tt-band .tt-pip{background:none !important;border-color:transparent !important;border-radius:1px !important;transform:rotate(45deg) scale(.78);border-image:" + v(k.pipOff || "slot_well") + " " + sw + " fill / 3px / 0 stretch !important}",
      X + ".tt-band .tt-pip.on{border-image-source:" + v(k.pipOn || "chip_ember") + " !important;border-image-slice:20 !important;background:radial-gradient(circle at 50% 45%,#ffe6b0,#ff9a3c 45%,#8a3a10) !important;box-shadow:0 0 6px rgba(255,150,60,.8) !important}",
      X + ".tt-track{background:linear-gradient(#0b0705,#1d130d) !important;border:1px solid #5a4128 !important;box-shadow:inset 0 1px 3px #000 !important}",
      X + ".tt-track .tt-fill{background:linear-gradient(90deg,#8a4a16,#ffb35a 70%,#ffe0a0) !important;box-shadow:0 0 6px rgba(255,160,60,.6)}",
      // detail pane: gear-tab type, fade matches the painted card
      X + "#detail .tt-points b{font-family:var(--ua-title);color:#ffc27a;text-shadow:0 1px 2px #000,0 0 8px rgba(255,140,60,.35)}",
      X + "#detail .detail-head strong{font-family:var(--ua-title);font-weight:700;letter-spacing:.02em;color:#ecd6b0;text-shadow:0 1px 2px #000}",
      X + "#detail .tt-tip h4{font-family:var(--ua-label);letter-spacing:.06em;color:#ffb067;border-bottom:1px solid rgba(200,140,70,.35)}",
      X + "#detail .tt-tip-fade{background:linear-gradient(180deg,rgba(16,11,8,0),rgba(16,11,8,.96) 80%) !important}"
    ].join("\n");
  }

  // ---- popups (death, victory, rift stone, season) and NPC dialog: painted kiln-iron frame on dark parchment ----
  function popupCss(c, t) {
    var k = c.popups || {}, pf = nine("panel_frame", 86), fb = k.frame || 20, sw = nine("slot_well", 34);
    var CARD = "html.ua-ready.rk .overlay-card.ornate";
    return [
      CARD + "," + P + "#say.ornate{" + plate("rgba(13,9,7,.95)") + "border-color:transparent !important;border-radius:2px !important;box-shadow:0 0 0 1px rgba(0,0,0,.6),0 16px 40px rgba(0,0,0,.7),0 0 30px rgba(255,120,40,.12) !important;border-image:" + v("panel_frame") + " " + pf + " / " + fb + "px / 4px stretch !important}",
      CARD + " .corner," + P + "#say .corner{display:none !important}",
      // a popup over the game shows only its own card, not the empty full-screen panel frame behind it
      P + "body.scene-card #panel::before{display:none !important}",
      CARD + " h2{font-family:var(--ua-title) !important;font-weight:700;letter-spacing:.06em;color:#ffc27a !important;text-shadow:0 1px 2px #000,0 0 12px rgba(255,140,60,.35)}",
      CARD + " p{color:#e6d6ba}",
      CARD + " .btn:not(.icon-x)," + P + "#say .btn{background:none !important;border-color:transparent !important;box-shadow:0 2px 4px rgba(0,0,0,.45) !important;border-radius:0 !important;border-image:" + v("btn_iron") + " 0 " + three("btn_iron", 112) + " fill / 0 16px stretch;font-family:var(--ua-label);letter-spacing:.02em;color:#d6c09c;text-shadow:0 1px 1px #000}",
      CARD + " .btn.primary," + P + "#say .btn.primary{border-image-source:" + v("btn_ember") + ";color:#ffeccc}",
      CARD + " canvas," + P + "#say-portrait{border-radius:2px !important;border:0 solid transparent !important;border-image:" + v("slot_well") + " " + sw + " / 6px / 2px stretch !important;background:radial-gradient(circle at 50% 35%,#2a1c14,#0a0705) !important}",
      // NPC dialog: speaker in Cinzel ember, text in a readable serif, 'more' in small caps
      P + "#say-name{font-family:var(--ua-title);font-weight:700;letter-spacing:.06em;color:#ffc27a;text-shadow:0 1px 2px #000}",
      P + "#say-text{color:#efe2cb;text-shadow:0 1px 1px #000}",
      P + "#say-more{font-family:var(--ua-label);color:#bfa880}",
      // act banner ('Act I ...') gets a rune rule instead of the plain line
      P + "#act-banner h2{font-family:var(--ua-title);font-weight:700;letter-spacing:.08em;border-bottom:0;padding-bottom:10px;background:linear-gradient(90deg,rgba(255,150,60,0),rgba(255,170,80,.85),rgba(255,150,60,0)) bottom/100% 2px no-repeat}",
      P + "#banner-kicker{font-family:var(--ua-label)}"
    ].join("\n");
  }

  // ---- title + character-create screens ----
  function screenCss(c, t) {
    var hn = nine("hud_frame", 26), S = "html.ua-ready.rk .screen ";
    return [
      S + ".wordmark{font-family:var(--ua-title) !important;font-weight:900;color:#f3d9a8;background:linear-gradient(180deg,#fff0cf 0%,#e8b86a 45%,#a8561e 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 2px 0 #1a0c05) drop-shadow(0 0 14px rgba(255,130,40,.35))}",
      S + ".tag{font-family:var(--ua-label);letter-spacing:.14em;color:#c9ab7c}",
      S + ".eyebrow{font-family:var(--ua-label)}",
      S + ".btn{background:none !important;border-color:transparent !important;box-shadow:0 2px 6px rgba(0,0,0,.5) !important;border-radius:0 !important;border-image:" + v("btn_iron") + " 0 " + three("btn_iron", 112) + " fill / 0 18px stretch;font-family:var(--ua-label);letter-spacing:.04em;color:#dcc6a0;text-shadow:0 1px 1px #000}",
      S + ".btn.primary{border-image-source:" + v("btn_ember") + ";color:#ffeccc}",
      S + ".btn:disabled{filter:grayscale(.8) brightness(.6)}",
      S + ".btn:active{filter:brightness(1.25)}",
      S + ".hero-pick," + S + ".slot-card," + S + ".class-card{" + plate("rgba(14,10,8,.86)") + "border-color:transparent !important;border-radius:2px !important;border-image:" + v("hud_frame") + " " + hn + " / 10px / 1px stretch !important;box-shadow:0 4px 12px rgba(0,0,0,.55) !important}",
      S + ".hero-pick.is-sel{box-shadow:0 0 0 1px rgba(255,170,80,.4),0 0 16px rgba(255,140,50,.55),0 4px 12px rgba(0,0,0,.55) !important;filter:brightness(1.08)}",
      S + ".hero-pick strong," + S + ".hero-pick b," + S + ".hero-pick .name{font-family:var(--ua-title);letter-spacing:.03em;color:#ecd6b0}",
      S + "label," + S + ".small{font-family:var(--ua-label)}",
      S + "input[type=text]{background:#0b0806 !important;color:#f0e0c4;border:1px solid #6a4a2a !important;border-radius:2px !important;box-shadow:inset 0 2px 6px #000;font-family:var(--ua-title)}"
    ].join("\n");
  }

  var SECTIONS = [["hud", hudCss], ["dock", dockCss], ["orbs", orbCss], ["cast", castCss], ["belt", beltCss], ["prompt", promptCss], ["panels", panelCss], ["tree", treeCss], ["popups", popupCss], ["screens", screenCss]];
  function css() {
    var c = cfg() || {}, t = c.text || {}, out = [];
    st.areas = [];
    SECTIONS.forEach(function (s) { if (area(s[0])) { out.push("/* " + s[0] + " */\n" + s[1](c, t)); st.areas.push(s[0]); } });
    return out.join("\n");
  }
  function install() {
    if (off() || !root.ABUiArt || !ABUiArt.ready()) return false;
    var s = document.getElementById("ab-reskin-style");
    if (!s) { s = document.createElement("style"); s.id = "ab-reskin-style"; }
    document.head.appendChild(s); // always last, so it wins ties with ab-ui / le-ui sheets
    s.textContent = css(); st.css = s.textContent.length;
    document.documentElement.classList.add("rk"); st.on = true; return true;
  }
  function start() {
    if (off()) return;
    if (root.ABUiArt && ABUiArt.whenReady) ABUiArt.whenReady().then(function (ok) { if (ok) install(); });
  }
  root.ABReskin = { install: install, on: function () { return st.on; }, off: off, stats: function () { return { on: st.on, areas: st.areas.slice(), css: st.css }; } };
  if (root.ASHBOUND_DATA_READY && root.ASHBOUND_DATA_READY.then) root.ASHBOUND_DATA_READY.then(start);
})(typeof window !== "undefined" ? window : self);
