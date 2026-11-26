/* le-ui (v85): Last Epoch-style inventory / stash look and feel for Ashbound, built on js/ab-uiart.js.
   Visual-only until later steps add stash tabs, search, rules, drag and drop. Everything is scoped under
   html.ua-ready (set when the painted atlases are in), so the old look stays if the art can't load.
   Ranks and families come from data/rarity.json; numbers from data/ui.json "leui". */
(function (root) {
  "use strict";
  var CUR = ["potion", "gem", "rune", "lens", "gold", "material"];
  function D() { return root.ASHBOUND_DATA || {}; }
  function cfg() { return (D().ui || {}).leui || {}; }
  function ranks() { return ((D().rarityTable || {}).ranks || []).slice().sort(function (a, b) { return a.rank - b.rank; }); }
  function pipCount(rankId) { var r = ranks().find(function (x) { return x.id === rankId; }); return r ? Math.max(0, r.rank - 3) : 0; }
  // 9-slice inset of a chrome piece at its packed size (data/ui-art.json chrome.nine)
  function nine(k) { var a = root.ABUiArt && ABUiArt.data(); return a && a.chrome.nine[k] || 17; }
  function v(k) { return "var(--ua-" + k.replace(/_/g, "-") + ")"; }
  function rarityCss() {
    var o = [], P = "html.ua-ready ";
    var ITEM = [".gitem", ".doll-slot.has-item", ".detail-ico", ".shop-ico", ".flask"];
    function sel(cls, extra) { return ITEM.map(function (s) { return P + s + cls + (extra || ""); }).join(","); }
    ranks().concat([{ id: "unique", fam: 1 }, { id: "set", fam: 1 }]).forEach(function (r) {
      var cls = r.fam ? ".family-" + r.id : ".rar-" + r.id;
      if (!r.fam) o.push(sel(cls, "::before") + "{border-image-source:" + v("plate_" + r.id) + "}");
      o.push(sel(cls, "::after") + "{border-image-source:" + v("frame_" + r.id) + "}");
      if (r.fam || pipCount(r.id) >= 3) o.push(sel(cls, ".is-sel") + "{--ua-glow:" + v("glow_" + r.id) + "}");
      var n = r.fam ? 0 : pipCount(r.id);
      if (n) o.push(P + ".gitem" + cls + " .rpip," + P + ".doll-slot" + cls + " .rpip{width:calc(var(--ua-pip) * " + n + ");background-image:" + v("pip_" + r.id) + "}");
    });
    CUR.forEach(function (c) {
      o.push(sel(".rar-" + c, "::before") + "{border-image-source:" + v("plate_currency") + "}");
      o.push(sel(".rar-" + c, "::after") + "{border-image-source:" + v("frame_currency") + "}");
    });
    // families keep their rank plate (a Mythical unique still reads Mythical) and swap the frame for the gilded family rim
    return o.join("\n");
  }
  function baseCss() {
    var nf = nine("frame_common"), np = nine("plate_common");
    return [
      ":root{--ua-pip:7px;--ua-rim:4.5px}",
      // item plate + frame drawn by two pseudo layers so the icon sits between them
      "html.ua-ready .gitem,html.ua-ready .doll-slot.has-item,html.ua-ready .detail-ico{background:transparent !important;border-color:transparent !important;box-shadow:none !important;isolation:isolate}",
      "html.ua-ready .gitem::before,html.ua-ready .doll-slot.has-item::before,html.ua-ready .detail-ico::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;border:var(--ua-rim) solid transparent;border-image-slice:" + np + " fill;border-image-width:var(--ua-rim);border-image-repeat:stretch;border-image-source:" + v("plate_common") + "}",
      "html.ua-ready .gitem::after,html.ua-ready .doll-slot.has-item::after,html.ua-ready .detail-ico::after{content:'';position:absolute;inset:0;z-index:2;pointer-events:none;border:var(--ua-rim) solid transparent;border-image-slice:" + nf + ";border-image-width:var(--ua-rim);border-image-repeat:stretch;border-image-source:" + v("frame_common") + "}",
      "html.ua-ready .gitem.is-sel,html.ua-ready .doll-slot.is-sel{outline:0 !important}",
      "html.ua-ready .gitem.is-sel::after,html.ua-ready .doll-slot.is-sel::after{filter:brightness(1.35) drop-shadow(0 0 4px rgba(255,170,80,.9))}",
      // rank pips: small painted gems along the top-left, one per rank above Rare
      "html.ua-ready .gitem .rpip,html.ua-ready .doll-slot .rpip{position:absolute;top:3px;left:3px;z-index:3;height:var(--ua-pip);min-width:0;width:0;padding:0;margin:0;font-size:0;color:transparent;background:none;background-repeat:repeat-x;background-size:var(--ua-pip) var(--ua-pip);border:0;border-radius:0;transform:none;box-shadow:none}",
      "html.ua-ready .gitem .ico,html.ua-ready .doll-slot .slot-ico{position:relative;z-index:1}",
      "html.ua-ready .gitem .ico{padding:2px}",
      "html.ua-ready .gitem .family-badge,html.ua-ready .doll-slot .family-badge,html.ua-ready .gitem .iname{display:none !important}"
    ].join("\n");
  }
  // step 4: panel skin. Decoration only (pseudo layers, border-image, backgrounds); boxes keep their size and place.
  function skinCss() {
    var pf = nine("panel_frame"), tp = (ABUiArt.data().chrome.three || {}).title_plaque || 75, bt = (ABUiArt.data().chrome.three || {}).btn_iron || 65;
    var P = "html.ua-ready ";
    return [
      "@font-face{font-family:'AB Cinzel';src:url(assets/fonts/cinzel.woff2) format('woff2');font-weight:400 900;font-display:swap}",
      "@font-face{font-family:'AB Marcellus';src:url(assets/fonts/marcellus-sc.woff2) format('woff2');font-display:swap}",
      ":root{--ua-title:'AB Cinzel',var(--serif);--ua-label:'AB Marcellus',var(--serif)}",
      P + "#panel{background:linear-gradient(180deg,rgba(40,22,12,.55),rgba(10,8,7,0) 90px),linear-gradient(rgba(13,10,9,.80),rgba(9,7,6,.88))," + v("panel_bg") + ";background-size:auto,auto,192px 192px;border-color:transparent !important;border-radius:4px;box-shadow:0 14px 44px rgba(0,0,0,.65) !important}",
      P + "#panel::before{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;border:26px solid transparent;border-image:" + v("panel_frame") + " " + pf + " / 26px stretch}",
      P + "#panel .panel-head h2{flex:0 1 auto;margin-right:auto;align-self:center;font-family:var(--ua-title);font-weight:700;letter-spacing:.1em;font-size:16px;line-height:26px;color:#ecd6b0;text-shadow:0 1px 2px #000,0 0 10px rgba(255,140,60,.25);padding:0 15px;max-width:92px;box-sizing:border-box;overflow:hidden;border:0 solid transparent;border-image:" + v("title_plaque") + " 0 " + tp + " fill / 0 15px stretch;white-space:nowrap}",
      // painted buttons: iron 3-slice, ember for primary/active. Layout box unchanged (border-image only draws)
      P + "#panel .tabs .btn," + P + "#panel .panel-head .btn," + P + "#panel .detail-actions .btn," + P + "#panel .gear-bag > .row .btn," + P + "#panel .le-btn{background:none !important;border-color:transparent !important;box-shadow:none !important;border-image:" + v("btn_iron") + " 0 " + bt + " fill / 0 16px stretch;font-family:var(--ua-label);letter-spacing:.02em;color:#cdb898;text-shadow:0 1px 1px #000}",
      P + "#panel .tabs .btn.primary," + P + "#panel .detail-actions .btn.primary," + P + "#panel .detail-actions .btn[data-act=equip]," + P + "#panel .le-btn.primary{border-image-source:" + v("btn_ember") + ";color:#ffe9c8;font-weight:400}",
      P + "#panel .btn.icon-x{border-image:" + v("slot_well") + " " + nine("slot_well") + " fill / 8px;font-size:0;color:transparent}",
      P + "#panel .btn.icon-x::after{content:'';position:absolute;inset:28%;background:" + v("g_close") + " center/contain no-repeat}",
      P + "#panel .btn.icon-x{position:relative}",
      // recessed grid cells and empty doll slots
      P + "#panel .grid{background:#070605 " + v("grid_cell") + " 0 0 / var(--cell) var(--cell) repeat;border-color:rgba(130,96,60,.65);border-radius:3px;box-shadow:inset 0 0 12px #000,0 0 0 1px #000}",
      P + "#panel .grid .cell{border-color:transparent}",
      P + "#panel .doll-slot:not(.has-item){background:none !important;border-color:transparent !important;border-style:solid !important;border-image:" + v("slot_well") + " " + nine("slot_well") + " fill / 6px}",
      P + "#panel .doll-slot .ghost-art{opacity:.5}",
      P + "#panel .doll-slot:not(.has-item){filter:brightness(.62) contrast(1.1)}",
      P + "#panel .panel-head #btn-mute," + P + "#panel .panel-head .btn:not(.icon-x):not(.slim){border-image:" + v("slot_well") + " " + nine("slot_well") + " fill / 8px;background:none !important;border-color:transparent !important;color:#e0c49a}",
      P + "#panel .doll-slot:not(.has-item) .slot-lab{color:rgba(200,180,150,.55)}"
    ].join("\n");
  }
  // step 5: Last Epoch-style doll. Phone landscape: a 262 px column over a painted alcove; weapon and off-hand tall
  // at the sides, armour centre, rings either side of the belt, gloves and boots in the bottom corners, name plate between.
  function dollCss() {
    var P = "html.ua-ready body[data-inv-profile=phoneLandscape] #panel ", Q = "html.ua-ready ";
    return [
      Q + ".doll-name{display:none}",
      P + ".gear-board{grid-template-columns:var(--le-dollw,262px) minmax(0,1fr);grid-template-rows:minmax(0,1fr) 34px;gap:4px 12px}",
      P + ".gear-doll p.small{display:none}",
      P + ".doll-compact{grid-column:1;grid-row:1 / 3;align-self:start;width:var(--le-dollw,262px);height:296px;grid-template-columns:58px minmax(0,1fr) 58px;grid-template-rows:repeat(5,56px);gap:4px 6px;position:relative;padding:0;isolation:isolate}",
      P + ".doll-compact .doll-hero{grid-area:1 / 1 / 6 / 4;z-index:-1;width:auto;height:auto;margin:-2px -4px;border:1px solid rgba(130,96,60,.7);border-radius:4px;background:linear-gradient(rgba(0,0,0,.15),rgba(0,0,0,.45))," + v("doll") + " center / cover no-repeat;box-shadow:inset 0 0 18px #000}",
      P + ".doll-compact .doll-hero img{display:none}",
      P + ".doll-compact .helm{grid-area:1 / 2;justify-self:center;width:64px}",
      P + ".doll-compact .amulet{grid-area:1 / 3}",
      P + ".doll-compact .weapon{grid-area:2 / 1 / 4 / 2;height:116px}",
      P + ".doll-compact .armor{grid-area:2 / 2 / 4 / 3;justify-self:center;width:92px;height:116px}",
      P + ".doll-compact .offhand{grid-area:2 / 3 / 4 / 4;height:116px}",
      P + ".doll-compact .ring1{grid-area:4 / 1}",
      P + ".doll-compact .belt{grid-area:4 / 2;justify-self:center;width:104px}",
      P + ".doll-compact .ring2{grid-area:4 / 3}",
      P + ".doll-compact .gloves{grid-area:5 / 1}",
      P + ".doll-compact .boots{grid-area:5 / 3}",
      P + ".doll-compact .doll-slot,html.ua-ready body[data-inv-profile=phoneLandscape] #panel .doll-compact button.doll-slot{border-radius:3px;padding:4px}",
      P + ".doll-compact .weapon,html.ua-ready body[data-inv-profile=phoneLandscape] #panel .doll-compact .offhand,html.ua-ready body[data-inv-profile=phoneLandscape] #panel .doll-compact .armor{height:116px;min-height:116px !important}",
      P + ".doll-compact .has-item .slot-ico{width:100%;height:100%}",
      P + ".doll-compact .has-item .slot-lab{display:none}",
      P + ".doll-compact .doll-slot:not(.has-item) .slot-ico{width:62%;height:62%}",
      P + ".doll-compact .doll-slot:not(.has-item) .slot-lab{position:absolute;bottom:3px;left:0;right:0;font-size:9px;font-family:var(--ua-label)}",
      P + ".doll-name{grid-area:5 / 2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;text-align:center;line-height:1.15;min-width:0;text-shadow:0 1px 2px #000}",
      P + ".doll-name b{font-family:var(--ua-title);font-weight:700;letter-spacing:.14em;font-size:12px;color:#ecd6b0;text-transform:uppercase}",
      P + ".doll-name span{font-size:10.5px;color:#a8977c;white-space:nowrap}",
      P + ".doll-name .doll-gold{color:#f0cf7a;font-weight:600}",
      P + ".consume-slot-wrap{grid-column:2;grid-row:2;align-self:end}"
    ].join("\n");
  }
  // step 6: pack grid at 42 px cells with the buttons in a column beside it (room for the 10x6 pack and the doll)
  function packCss() {
    var c = cfg(), P = "html.ua-ready body[data-inv-profile=phoneLandscape] #panel ";
    return [
      ":root{--le-cell:" + (c.packCell || 42) + "px;--le-scell:" + (c.stashCell || 32) + "px;--le-tool:" + (c.toolbarW || 104) + "px;--le-dollw:" + (c.dollW || 262) + "px}",
      P + ".gear-board:not(.stash-board) .gear-bag{display:grid;grid-template-columns:max-content minmax(0,1fr);column-gap:8px;align-items:start;align-content:start}",
      P + ".gear-board:not(.stash-board) .gear-bag > .grid{grid-column:1;grid-row:1;--cell:min(var(--le-cell),calc((100cqw - var(--le-tool) - 12px) / var(--cols)))}",
      P + ".gear-board:not(.stash-board) .gear-bag > .row{grid-column:2;grid-row:1;display:flex;flex-direction:column;align-items:stretch;gap:6px;margin:0;min-width:0}",
      P + ".gear-board:not(.stash-board) .gear-bag > .row .btn{min-height:44px;padding:2px 8px;font-size:13px;white-space:nowrap}",
      "html.ua-ready #panel .gitem .new-dot{position:absolute;top:2px;right:2px;width:11px;height:11px;border-radius:0;background:" + v("g_ashpip_on") + " center/contain no-repeat;box-shadow:none;z-index:3;animation:le-spark 1.6s ease-in-out infinite}",
      "@keyframes le-spark{50%{filter:brightness(1.6) drop-shadow(0 0 3px #ff9a3c)}}",
      "html.ua-ready #panel .gitem .sockdots{z-index:3;bottom:3px;right:3px}",
      "html.ua-ready #panel .gitem .sockdots i{width:5px;height:5px;background:#120c08;box-shadow:inset 0 0 0 1px #b89a72}",
      "html.ua-ready #panel .gitem .sockdots i.on{background:#ff9a3c;box-shadow:0 0 3px #ff9a3c}",
      "html.ua-ready #panel .gitem{margin:0;border-radius:2px}"
    ].join("\n");
  }
  // step 7: item card v2 — the v84g pop-up keeps its placement, strip, Drop confirm and Equip; only its look changes.
  // Rank-tinted rim, painted art card in the header, centred base lines, affix bands with prefix/suffix notches,
  // flavor in the rank colour, requirements footer, compare card wearing an EQUIPPED plaque.
  function cardCss() {
    var o = [], C = "html.ua-ready :is(#panel,body) .detail.item-pop", fam = (D().rarityTable || {}).families || {};
    ranks().forEach(function (r) {
      o.push(C + "[data-rk~=rar-" + r.id + "]{--rk:" + r.color + "}");
      var n = pipCount(r.id); if (n) o.push(C + "[data-rk~=rar-" + r.id + "] .detail-head .le-headpips.rpip{--n:" + n + ";background-image:" + v("pip_" + r.id) + "}");
    });
    ["unique", "set"].forEach(function (f) { if (fam[f] && fam[f].color) o.push(C + "[data-rk~=family-" + f + "]{--rk:" + fam[f].color + "}"); });
    CUR.forEach(function (c) { o.push(C + "[data-rk~=rar-" + c + "]{--rk:#c9a46a}"); });
    return o.concat([
      C + "{--rk:#c9b89a;background:linear-gradient(180deg,color-mix(in srgb,var(--rk) 13%,#1a120d) 0,#120d0a 92px,#0f0b09 100%)," + v("panel_bg") + ";background-blend-mode:normal,soft-light;border:2px solid color-mix(in srgb,var(--rk) 78%,#000);border-radius:4px;box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,220,170,.10),inset 0 0 18px rgba(0,0,0,.7),0 10px 28px rgba(0,0,0,.75),0 0 14px color-mix(in srgb,var(--rk) 30%,transparent);color:#e8dcc4}",
      // compact card (Scott 26 Nov): every line of the item visible at once on phone landscape, no inner scroll.
      // Small art card, base lines joined on one row, plain affix rows, quiet T# badges; fit levels (le-fit 1-3) tighten further only when needed.
      C + "{padding:6px 8px 6px !important}",
      C + " .detail-head{position:relative;display:grid;grid-template-columns:44px minmax(0,1fr);grid-template-areas:'ico name' 'ico kind' 'ico extra' 'ico ilvl';column-gap:8px;row-gap:0;align-items:center;min-height:58px;padding:3px 46px 3px 2px;margin:0 0 3px;border-bottom:1px solid color-mix(in srgb,var(--rk) 30%,transparent);background:none;box-shadow:none}",
      C + " .detail-head > *{grid-column:2;min-width:0;margin:0}",
      C + " .detail-head .detail-x{position:absolute;top:-2px;right:-4px;width:44px !important;min-width:44px !important;height:44px !important;min-height:44px !important;padding:0;font-size:0 !important;border:0 !important;border-radius:0;background:" + v("slot_well") + " center/30px 30px no-repeat !important;box-shadow:none !important}",
      C + " .detail-head .detail-x::after{content:'';position:absolute;inset:15px;background:" + v("g_close") + " center/contain no-repeat}",
      C + " .detail-name{grid-area:name;display:block;font-family:var(--ua-title);font-size:15px;font-weight:700;letter-spacing:.02em;line-height:1.1;color:var(--rk);text-shadow:0 1px 0 #000,0 0 8px color-mix(in srgb,var(--rk) 30%,transparent);overflow-wrap:anywhere}",
      C + " .detail-name strong{font-weight:700}",
      C + " .detail-name .detail-ico{position:absolute;left:2px;top:3px;width:44px !important;height:56px !important;min-width:0;margin:0;padding:3px;display:flex;align-items:center;justify-content:center;border-radius:2px}",
      C + " .detail-name .detail-ico .item-ico{width:100%;height:100%}",
      C + " .detail-head .le-kind{grid-area:kind;font-size:11px;line-height:1.25;color:#cdbfa6;opacity:1}",
      C + " .detail-head .le-ilvl{grid-area:ilvl;display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:0}",
      C + " .detail-head .le-ilvl .small{font-size:10.5px;color:#a8977c}",
      C + " .detail-head .le-ilvl .btn{min-height:26px;padding:0 8px;font-size:10.5px}",
      C + " .detail-head .le-headpips{position:static;display:inline-block;height:8px;min-width:0;width:calc(8px * var(--n,0));padding:0;margin:0;font-size:0;color:transparent;border:0;background:none;background-repeat:repeat-x;background-size:8px 8px;box-shadow:none;transform:none}",
      C + " .detail-scroll{padding:0 2px 2px;font-size:12.5px;line-height:1.3;text-align:center}",
      C + " .detail-scroll > *{margin-left:0;margin-right:0;flex-shrink:0}",
      C + " .detail-scroll .le-base{display:inline;text-align:center;color:#efe4cc;background:none;font-size:inherit}",
      C + " .detail-scroll .le-base + .le-base::before{content:'\\00b7';margin:0 6px;color:#7d6c55}",
      C + " .detail-scroll .le-base.bad{color:#ff7a5c}",
      C + " .detail-scroll .affix{position:relative;margin:0;padding:0 2px 0 12px;min-height:17px;display:flex;align-items:center;flex-wrap:wrap;gap:0 6px;text-align:left;color:#b9c6ff;background:none;border:0;border-radius:0;font-size:inherit;line-height:inherit}",
      C + " .detail-scroll .le-base + .affix," + C + " .detail-scroll .le-base + div:not(.le-base){margin-top:4px}",
      C + " .detail-scroll .affix::before{content:'';position:absolute;left:3px;top:50%;margin-top:-3px;border:3px solid transparent;border-left:4px solid #c9a050;border-right:0;opacity:.8}",
      C + " .detail-scroll .affix.suf::before{border-left:0;border-right:4px solid #7f9be0;left:2px}",
      C + " .detail-scroll .affix.cont::before{display:none}",
      C + " .detail-scroll .affix .affix-meta{font-size:10px;color:#8f86a8;order:8}",
      C + " .detail-scroll .le-flavor{margin:4px 6px 0;text-align:center;font-style:italic;font-size:11px;line-height:1.25;color:color-mix(in srgb,var(--rk) 65%,#e8dcc4);opacity:1}",
      C + " .detail-scroll .le-req{margin-top:3px;text-align:center;font-size:11px;color:#bfae92}",
      C + " .detail-scroll .le-req.bad{color:#ff7a5c}",
      C + " .detail-scroll .sockets{display:flex;justify-content:center;gap:5px;margin:3px 0}",
      C + " .detail-scroll .sockets .sock{display:inline-grid;place-items:center;width:15px;height:15px;min-width:0;min-height:0;padding:0;margin:0;border-radius:50%;font-size:8px;line-height:1;color:#8f806a;background:#0c0806;border:1px solid #6d5a44;box-shadow:inset 0 1px 2px #000}",
      C + " .detail-scroll .item-set{margin:2px 0 4px;font-size:11.5px;text-align:left}",
      C + " .detail-scroll-hint{display:none !important}",
      // compare deltas: quiet chips row at the foot (step 9)
      C + " .detail-scroll .compare{display:flex;flex-wrap:wrap;justify-content:center;gap:1px 9px;align-items:center;margin:4px 0 0;padding:3px 6px;background:rgba(0,0,0,.32);border:1px solid rgba(255,220,170,.08);border-radius:3px}",
      C + " .detail-scroll .compare-head{flex:0 0 auto;font-family:var(--ua-label);font-size:9.5px;letter-spacing:.06em;color:#8f806a;text-align:center}",
      C + " .detail-scroll .compare .le-delta{display:inline-flex;align-items:center;gap:3px;margin:0;padding:0;min-height:0;font-size:11px;font-weight:700;line-height:15px;white-space:nowrap}",
      C + " .detail-scroll .compare .le-delta.up{color:#7fe08a}",
      C + " .detail-scroll .compare .le-delta.down{color:#ff6a55}",
      C + " .detail-scroll .compare .le-delta::before{content:'';width:0;height:0;border:4px solid transparent}",
      C + " .detail-scroll .compare .le-delta.up::before{border-bottom:6px solid currentColor;border-top:0;margin-top:-2px}",
      C + " .detail-scroll .compare .le-delta.down::before{border-top:6px solid currentColor;border-bottom:0;margin-top:2px}",
      C + " .item-pop-worn{display:inline-block;margin:0 0 4px;padding:2px 14px;font-family:var(--ua-title);font-size:11px;letter-spacing:.14em;color:#f3dfb5;border:0 solid transparent;border-width:0 12px;border-image:" + v("title_plaque") + " 0 " + (c3("title_plaque")) + " fill / 0 12px stretch}",
      C + " .detail-actions{padding-top:4px}",
      // T# badge (step 8): small and quiet, tier colour outline; Scott decides from the shots whether it stays
      C + " .detail-scroll .affix .tchip{margin-left:auto;flex:0 0 auto;order:9;width:auto;min-width:0;height:auto;padding:0 3px;font:700 9px/11px var(--ua-label),sans-serif;letter-spacing:.02em;color:var(--tc,#9a8f80);background:none;border:1px solid color-mix(in srgb,var(--tc,#9a8f80) 55%,transparent);border-radius:2px;opacity:.8}",
      tierCss(C),
      // fit levels, applied one at a time by fitCard() only while the card would still need to scroll
      // header notes and unique signature: compact by default (declutter); they are notes, not stats
      C + " .detail-head .item-consume-tip{grid-column:2;margin:2px 0 1px !important;padding:2px 6px !important;font-size:10.5px !important;line-height:1.22 !important;border-radius:3px}",
      C + " .detail-head > .small.muted:not(.le-kind){font-size:11px;line-height:1.25;color:#bfae92}",
      C + " .detail-scroll .unique-sig{margin:4px 0 0;font-size:inherit;line-height:inherit;font-weight:600}",
      C + " .detail-scroll .unique-sig .unique-sig-name{font-size:inherit}",
      C + "[data-le-fit] .detail-scroll{font-size:11.5px;line-height:1.22}",
      C + "[data-le-fit] .detail-scroll .affix{min-height:15px}",
      C + "[data-le-fit] .detail-head{min-height:50px}",
      C + "[data-le-fit] .detail-name .detail-ico{width:38px !important;height:48px !important}",
      C + "[data-le-fit] .detail-head{grid-template-columns:38px minmax(0,1fr)}",
      // level 2 keeps the 11.5px text and tightens spacing; 3 also widens the card (ab-itembox data-le-wide);
      // 4 and 5 shrink the text and clamp the notes (never the stats). Only the biggest cards get past 3.
      C + ":is([data-le-fit='2'],[data-le-fit='3'],[data-le-fit='4'],[data-le-fit='5']) .detail-scroll{line-height:1.13}",
      C + ":is([data-le-fit='2'],[data-le-fit='3'],[data-le-fit='4'],[data-le-fit='5']) .detail-scroll .affix{min-height:0}",
      C + ":is([data-le-fit='2'],[data-le-fit='3'],[data-le-fit='4'],[data-le-fit='5']) .detail-scroll .le-flavor{font-size:10px;margin-top:2px}",
      C + ":is([data-le-fit='2'],[data-le-fit='3'],[data-le-fit='4'],[data-le-fit='5']) .detail-head .item-consume-tip{font-size:10px !important;line-height:1.15 !important;padding:1px 5px !important}",
      C + ":is([data-le-fit='2'],[data-le-fit='3'],[data-le-fit='4'],[data-le-fit='5']) .detail-head{min-height:44px;margin-bottom:2px}",
      C + ":is([data-le-fit='2'],[data-le-fit='3'],[data-le-fit='4'],[data-le-fit='5']) .detail-actions{padding-top:2px}",
      C + ":is([data-le-fit='4'],[data-le-fit='5']) .detail-head .item-consume-tip{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}",
      C + "[data-le-fit='5'] .detail-head .item-consume-tip{-webkit-line-clamp:1}",
      C + "[data-le-fit='5'] .detail-scroll .le-flavor{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden}",
      C + "[data-le-fit='4'] .detail-scroll{font-size:10.5px;line-height:1.12}",
      C + "[data-le-fit='5'] .detail-scroll{font-size:10px;line-height:1.1}",
      C + "[data-le-wide]{max-width:calc(100vw - 16px) !important}",
      C + ":is([data-le-fit='4'],[data-le-fit='5']) .detail-scroll .compare .le-delta{font-size:10px;line-height:13px}",
      // v84g side strip: square iron wells, the leading action (Unequip) lit with ember
      "html.ua-ready :is(#panel,body) .detail.item-pop .item-icon-btn{border:0 !important;border-radius:2px !important;background:" + v("slot_well") + " center/100% 100% no-repeat,#16100c !important;color:#e8d6b0 !important;box-shadow:0 2px 6px rgba(0,0,0,.6) !important;font-family:var(--ua-label);letter-spacing:.04em}",
      "html.ua-ready :is(#panel,body) .detail.item-pop .item-icon-btn.primary,html.ua-ready :is(#panel,body) .detail.item-pop .item-icon-btn.is-primary{background:" + v("slot_well") + " center/100% 100% no-repeat,radial-gradient(circle at 50% 60%,#a2461a,#3a1608) !important;color:#ffe2b8 !important}",
      // the corner mute button sits under an open card so the card's close box stays reachable
      "html.ua-ready body:has(.detail.item-pop) #btn-mute{z-index:1 !important}"
    ]).join("\n");
  }
  function tierCss(C) {
    var a = root.ABUiArt && ABUiArt.data(), tc = (a && a.tierColors) || {};
    return [1, 2, 3, 4, 5, 6, 7].map(function (t) { return C + " .detail-scroll .affix .tchip.t" + t + "{--tc:" + (tc[t] || "#9a8f80") + "}"; }).join("\n");
  }
  // no inner scroll: after ab-itembox places a card, tighten it one level at a time while it still overflows,
  // then lift it clear of the bottom safe inset (home bar). Desktop (zoomed panels) only gets the fit levels.
  function fitCard(box, cmp) {
    if (!root.document.documentElement.classList.contains("ua-ready")) return;
    var again = false, safe0 = (root.ABSafeArea && ABSafeArea.insets && ABSafeArea.insets()) || {}, room = (root.innerHeight || 0) - (safe0.top || 0) - (safe0.bottom || 0) - 16;
    [box, cmp].forEach(function (el) {
      if (!el) return;
      var mh = parseFloat(el.style.maxHeight) || 0; if (room > 120 && (!mh || mh > room)) el.style.maxHeight = room + "px";
      var sc = el.querySelector(".detail-scroll"); if (!sc) return;
      var lvl = +(el.getAttribute("data-le-fit") || 0);
      if (sc.scrollHeight > sc.clientHeight + 1 && lvl < 5) {
        el.setAttribute("data-le-fit", String(lvl + 1)); again = true;
        if (lvl + 1 >= 3 && el.id === "detail") el.setAttribute("data-le-wide", String(cfg().cardWide || 420));
      }
    });
    if (again && root.ABItemBox && ABItemBox.layout) { ABItemBox.layout(); return; }
    var safe = (root.ABSafeArea && ABSafeArea.insets && ABSafeArea.insets()) || { bottom: 0, top: 0 };
    var vh = root.innerHeight || 0, pad = 8;
    [box, cmp].forEach(function (el) {
      if (!el) return;
      var r = el.getBoundingClientRect(), lim = vh - (safe.bottom || 0) - pad;
      if (r.bottom > lim + 0.5) {
        var t = parseFloat(el.style.top) || 0, nt = Math.max((safe.top || 0) + pad - (r.top - t), t - (r.bottom - lim));
        if (Math.abs(r.top - t) < 1) el.style.top = Math.round(nt) + "px";
      }
    });
  }
  function hookItemBox() {
    if (root.ABItemBox && !ABItemBox.afterPlace) { ABItemBox.afterPlace = fitCard; ABItemBox.layout && ABItemBox.layout(); }
  }
  function c3(k) { var a = root.ABUiArt && ABUiArt.data(); return a && a.chrome.three && a.chrome.three[k] || 75; }
  // step 10: long-press drag & drop (js/ab-ledrag.js)
  function dragCss() {
    return [
      "html.ua-ready #panel .gitem,html.ua-ready #panel .doll-slot.has-item{touch-action:none;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}",
      "html.ua-ready #panel .le-drag-src{opacity:.35;filter:grayscale(.6)}",
      ".le-drag-ghost{position:fixed;left:0;top:0;z-index:200;pointer-events:none;opacity:.88;display:flex;align-items:center;justify-content:center;padding:4px;border-radius:2px;background:rgba(20,14,10,.55);box-shadow:0 14px 24px rgba(0,0,0,.7),0 0 0 2px rgba(255,190,120,.55);transform-origin:50% 100%;will-change:transform}",
      ".le-drag-ghost .ico{width:100%;height:100%;display:block;transform:scale(1.06)}",
      ".le-drag-ghost .ico svg,.le-drag-ghost .ico img{width:100%;height:100%}",
      ".le-drag-ghost.ok{box-shadow:0 14px 24px rgba(0,0,0,.7),0 0 0 2px #6fdc7a}",
      ".le-drag-ghost.swap{box-shadow:0 14px 24px rgba(0,0,0,.7),0 0 0 2px #ffb347}",
      ".le-drag-ghost.bad{box-shadow:0 14px 24px rgba(0,0,0,.7),0 0 0 2px #ff4a3d;filter:saturate(.6)}",
      ".le-drop-preview{position:fixed;z-index:210;pointer-events:none;border-radius:2px;border:2px solid;box-sizing:border-box}",
      ".le-drop-preview.ok{border-color:#6fdc7a;background:rgba(111,220,122,.22)}",
      ".le-drop-preview.swap{border-color:#ffb347;background:rgba(255,179,71,.22)}",
      ".le-drop-preview.bad{border-color:#ff4a3d;background:rgba(255,74,61,.28)}",
      "html.ua-ready #panel .doll-slot.le-slot-ok{box-shadow:0 0 0 2px #6fdc7a,0 0 12px rgba(111,220,122,.6) !important}",
      "html.ua-ready #panel .doll-slot.le-slot-bad{box-shadow:0 0 0 2px #ff4a3d,0 0 12px rgba(255,74,61,.6) !important}",
      "html.ua-ready #panel .le-drop-bad{animation:le-shake .4s}",
      "@keyframes le-shake{25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}",
      "html.le-dragging,html.le-dragging body{overscroll-behavior:none}"
    ].join("\n");
  }
  // step 12: LE stash — doll | category rail | tab ribbon over the 10x8 tab
  function stashCss() {
    var P = "html.ua-ready body[data-inv-profile=phoneLandscape] #panel ", c = cfg(), A = "html.ua-ready #panel ";
    return [
      P + ".gear-board.le-stash{grid-template-columns:var(--le-dollw) " + (c.railW || 54) + "px minmax(0,1fr);grid-template-rows:minmax(0,1fr);column-gap:8px}",
      P + ".gear-board.le-stash .gear-doll{grid-column:1;grid-row:1}",
      P + ".gear-board.le-stash .consume-slot-wrap{display:none}",
      P + ".gear-board.le-stash .le-rail{grid-column:2;grid-row:1;align-self:start}",
      P + ".gear-board.le-stash .stash-bag{grid-column:3;grid-row:1;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:38px auto;column-gap:6px;row-gap:5px;align-content:start;min-width:0}",
      P + ".gear-board.le-stash .stash-bag > .le-ribbon{grid-column:1;grid-row:1;min-width:0}",
      P + ".gear-board.le-stash .stash-bag > .row{grid-column:2;grid-row:1;margin:0;display:flex;gap:6px;align-items:center}",
      P + ".gear-board.le-stash .stash-bag > .row .btn{min-height:44px;padding:0 10px;font-size:12px}",
      P + ".gear-board.le-stash .stash-bag > .grid{grid-column:1 / -1;grid-row:2;--cell:min(var(--le-scell),calc((100cqw - 4px) / var(--cols)),calc((100vh - var(--safe-t,0px) - var(--safe-b,0px) - 126px) / var(--rows)))}",
      A + ".le-cat{border:0;border-radius:0;min-height:46px;color:#d8c8aa;font-family:var(--ua-label);font-size:8.5px;letter-spacing:.04em;background:" + v("slot_well") + " center/100% 100% no-repeat}",
      A + ".le-cat .le-ti{width:26px;height:26px;filter:saturate(.7) brightness(.85)}",
      A + ".le-cat.is-on{background:" + v("slot_well") + " center/100% 100% no-repeat,radial-gradient(circle at 50% 45%,rgba(255,140,60,.35),transparent 70%);color:#ffe2b8;box-shadow:0 0 0 1px rgba(255,170,90,.6),0 0 10px rgba(255,120,40,.35)}",
      A + ".le-cat.is-on .le-ti{filter:none}",
      A + ".le-cat-c{color:#ffcf8a;font-family:var(--ua-label)}",
      A + ".le-tab{border:0;border-radius:2px;min-height:36px;padding:0 10px 0 6px;color:#f0e2c6;font-family:var(--ua-label);font-size:12px;letter-spacing:.03em;background:var(--le-chip,linear-gradient(#3a2a1e,#1c140e)) center/100% 100% no-repeat;opacity:.72;box-shadow:inset 0 0 0 1px rgba(0,0,0,.6)}",
      A + ".le-tab.is-on{opacity:1;box-shadow:inset 0 0 0 1px rgba(255,220,170,.4),0 0 0 1px #000,0 2px 0 #ff9a3c}",
      A + ".le-tab .le-ti{width:20px;height:20px}",
      A + ".le-tab.le-buy{background:" + v("slot_well") + " center/100% 100% no-repeat;opacity:.9;color:#ffd38a;font-size:11px}",
      A + ".le-tab.le-buy b{font-size:16px;line-height:1}",
      A + ".le-edit{min-height:36px !important;padding:0 10px !important;font-size:11px !important}",
      A + ".le-sheet{background:linear-gradient(180deg,#1a130e,#0e0a08)," + v("panel_bg") + ";background-blend-mode:normal,soft-light;border:2px solid #6d5236;border-radius:3px;box-shadow:0 10px 30px rgba(0,0,0,.8)}",
      A + ".le-sheet-row span{font-family:var(--ua-label);color:#cdb894;letter-spacing:.06em}",
      A + ".le-pick{background:" + v("slot_well") + " center/100% 100% no-repeat}",
      A + ".le-pick .le-ti{width:26px;height:26px}"
    ].join("\n");
  }
  function installCss() {
    if (!root.ABUiArt || !ABUiArt.ready()) return false;
    var s = document.getElementById("ab-leui-style");
    if (!s) { s = document.createElement("style"); s.id = "ab-leui-style"; }
    s.textContent = baseCss() + "\n" + rarityCss() + "\n" + skinCss() + "\n" + dollCss() + "\n" + packCss() + "\n" + cardCss() + "\n" + dragCss() + "\n" + stashCss();
    document.head.appendChild(s); // always last, so it wins over the rarity css ABCraft/ABIcons add at boot
    hookItemBox();
    return true;
  }
  root.addEventListener("ab-uiart", function (e) { if (e.detail && e.detail.ready) installCss(); });
  root.ABLeUI = { fitCard: fitCard, installCss: installCss, pipCount: pipCount, cfg: cfg };
})(typeof window !== "undefined" ? window : self);
