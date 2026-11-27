/* v84n (TTPC-52): the gear panel fills the whole screen on phones in landscape. On the Pack tab, Sort / Fill belt / Stow
   sit in one row along the bottom of the bag (beside the consume strip), and the bag grid cells and item art grow into
   the freed room. Equipped-item (doll) slots keep their size. Content stays inside the safe area (Dynamic Island, home
   bar) through the --safe-* vars from js/ab-safearea.js. All numbers: data/ui.json "invFull". Pure CSS: no per-frame cost. */
(function (root) {
  var DEF = { enabled: true, profile: "phoneLandscape", padX: 10, padTop: 2, padBottom: 4, headH: 44, rowH: 44, gap: 4, colGap: 10, btnGap: 6, maxCell: 64, slack: 8, artPad: 1, matsMaxW: 240 };
  function cfg() {
    var u = (root.ASHBOUND_DATA && root.ASHBOUND_DATA.ui) || {}, b = u.invFull || {}, o = {};
    for (var k in DEF) o[k] = b[k] != null ? b[k] : DEF[k];
    return o;
  }
  function css() {
    var c = cfg();
    if (!c.enabled) return "";
    var B = "html body[data-inv-profile=" + c.profile + "] ", P = B + "#panel:has(.gear-board)", K = B + "#panel .gear-board.pack-board";
    var I = " !important";
    var w = "calc((100vw - var(--safe-l,0px) - var(--safe-r,0px) - " + (2 * c.padX + c.colGap + c.slack) + "px - var(--le-dollw,262px)) / var(--cols))";
    var h = "calc((100vh - var(--safe-t,0px) - var(--safe-b,0px) - " + (c.padTop + c.padBottom + c.headH + 3 * c.gap + c.rowH + c.slack) + "px) / var(--rows))";
    return "@media (orientation:landscape){\n" + [
      P + "{position:fixed" + I + ";inset:0" + I + ";left:0" + I + ";top:0" + I + ";width:auto" + I + ";height:auto" + I + ";max-width:none" + I + ";max-height:none" + I + ";transform:none" + I + ";margin:0" + I + ";border-radius:0" + I + ";box-sizing:border-box" + I +
        ";padding:calc(var(--safe-t,0px) + " + c.padTop + "px) calc(var(--safe-r,0px) + " + c.padX + "px) calc(var(--safe-b,0px) + " + c.padBottom + "px) calc(var(--safe-l,0px) + " + c.padX + "px)" + I +
        ";grid-template-rows:" + c.headH + "px 0 minmax(0,1fr)" + I + ";row-gap:" + c.gap + "px" + I + "}",
      P + " .panel-body{min-height:0" + I + ";padding-bottom:0" + I + "}",
      K + "{grid-template-columns:var(--le-dollw,262px) minmax(0,1fr) max-content" + I + ";grid-template-rows:minmax(0,1fr) " + c.rowH + "px" + I + ";column-gap:" + c.colGap + "px" + I + ";row-gap:" + c.gap + "px" + I + ";height:100%" + I + ";align-content:stretch" + I + "}",
      K + " > .doll-compact," + K + " > .gear-doll{grid-column:1" + I + ";grid-row:1 / 3" + I + ";align-self:start" + I + "}",
      K + " .gear-bag{display:contents" + I + "}",
      K + " .gear-bag > .grid{grid-column:2 / 4" + I + ";grid-row:1" + I + ";align-self:start" + I + ";justify-self:start" + I + ";--cell:min(" + c.maxCell + "px," + w + "," + h + ")" + I + "}",
      K + " > .consume-slot-wrap{grid-column:2" + I + ";grid-row:2" + I + ";align-self:stretch" + I + ";min-width:0" + I + ";display:flex" + I + "}",
      K + " > .consume-slot-wrap .consume-slot{flex:1 1 auto" + I + ";min-height:0" + I + ";height:100%" + I + "}",
      K + " .gear-bag > .row{grid-column:3" + I + ";grid-row:2" + I + ";display:flex" + I + ";flex-direction:row" + I + ";align-items:stretch" + I + ";gap:" + c.btnGap + "px" + I + ";margin:0" + I + "}",
      K + " .gear-bag .gitem{padding:0" + I + "}", K + " .gear-bag .gitem > .ico{padding:" + c.artPad + "px" + I + "}",
      K + " .gear-bag > .row .btn{min-height:" + c.rowH + "px" + I + ";height:" + c.rowH + "px" + I + ";padding:2px 12px" + I + "}"
      ,K + " .gear-bag > .row .le-mats{display:flex" + I + ";flex-direction:row" + I + ";gap:4px" + I + ";width:auto" + I + ";max-width:" + c.matsMaxW + "px" + I + ";overflow-x:auto" + I + ";overflow-y:hidden" + I + "}",
      K + " .gear-bag > .row .le-mat{min-height:" + c.rowH + "px" + I + ";height:" + c.rowH + "px" + I + ";min-width:" + c.rowH + "px" + I + ";flex:0 0 auto" + I + "}"
    ].join("\n") + "\n}";
  }
  function install() {
    if (!root.document || !root.document.head) return;
    var s = root.document.getElementById("ab-invfull-style");
    if (!s) { s = root.document.createElement("style"); s.id = "ab-invfull-style"; }
    s.textContent = css();
    root.document.head.appendChild(s); // re-appended after le-ui so it is last
  }
  root.addEventListener("ab-uiart", function () { setTimeout(install, 0); });
  if (root.document && root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", install); else install();
  root.ABInvFull = { cfg: cfg, css: css, install: install };
})(typeof window !== "undefined" ? window : self);
