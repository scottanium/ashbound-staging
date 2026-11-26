/* v83f: Diablo 2-style item pop-up. The detail box sits over or beside the
   tapped item, stays on screen, and closes when you tap outside it. A second
   box shows the currently equipped item when there is room. */
(function (root) {
  var PAD = 8;
  var MAX_W = 340;
  var MAX_H = 380;

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function sizeBox(el, vw, vh, width, maxH) {
    el.style.position = "fixed";
    el.style.zIndex = el.id === "detail-compare" ? "37" : "36";
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.margin = "0";
    el.style.maxHeight = Math.min(vh - 2 * PAD, maxH || MAX_H) + "px";
    el.style.width = Math.min(width || MAX_W, vw - 2 * PAD) + "px";
    el.style.left = "0px";
    el.style.top = "0px";
    return el.getBoundingClientRect();
  }

  /* Desktop panels use CSS zoom, so style.left/top are not screen pixels. Solve the
     (linear) style->screen map with two probes and place the box where we want it on screen. */
  function setPos(el, x, y) {
    el.style.left = "0px"; el.style.top = "0px";
    var a = el.getBoundingClientRect();
    el.style.left = "100px"; el.style.top = "100px";
    var b = el.getBoundingClientRect();
    var kx = (b.left - a.left) / 100 || 1, ky = (b.top - a.top) / 100 || 1;
    el.style.left = ((x - a.left) / kx) + "px";
    el.style.top = ((y - a.top) / ky) + "px";
  }

  function anchorFor(uid, panel, box, cmp) {
    if (!uid || !panel) return null;
    var nodes = panel.querySelectorAll('[data-uid="' + uid + '"]');
    var i, el;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      if (box && box.contains(el)) continue;
      if (cmp && cmp.contains(el)) continue;
      return el;
    }
    return null;
  }

  function place() {
    var panel = root.document.getElementById("panel");
    var box = root.document.getElementById("detail");
    var cmp = root.document.getElementById("detail-compare");
    var open = !!(box && box.classList.contains("item-pop"));
    if (root.document.body) root.document.body.classList.toggle("item-pop-open", open);
    if (!open) return;
    var vw = root.innerWidth || 0, vh = root.innerHeight || 0;
    var A = root.ASHBOUND, uid = A && A.state && A.state.ui && A.state.ui.selected && A.state.ui.selected.uid;
    var anchor = anchorFor(uid, panel, box, cmp);
    var ar = anchor ? anchor.getBoundingClientRect() : { left: vw / 2, right: vw / 2, top: vh / 2, bottom: vh / 2, width: 0, height: 0 };

    var mainW = Math.min(MAX_W, vw - 2 * PAD);
    var cmpW = Math.min(320, vw - 2 * PAD);
    var maxH = MAX_H;
    if (cmp && mainW + PAD + cmpW > vw - 2 * PAD) {
      var each = Math.floor((vw - 2 * PAD - PAD) / 2);
      mainW = Math.max(200, each);
      cmpW = Math.max(200, each);
    }
    if (cmp && 2 * 180 + PAD > vh - 2 * PAD) {
      /* stacked on a short screen: split the height */
      maxH = Math.max(160, Math.floor((vh - 3 * PAD) / 2));
    }

    var br = sizeBox(box, vw, vh, mainW, maxH);
    var left, top;
    if (ar.right + PAD + br.width <= vw - PAD) { left = ar.right + PAD; top = ar.top; }
    else if (ar.left - PAD - br.width >= PAD) { left = ar.left - PAD - br.width; top = ar.top; }
    else if (ar.bottom + PAD + br.height <= vh - PAD) { left = ar.left; top = ar.bottom + PAD; }
    else if (ar.top - PAD - br.height >= PAD) { left = ar.left; top = ar.top - PAD - br.height; }
    else { left = (vw - br.width) / 2; top = (vh - br.height) / 2; }
    left = clamp(left, PAD, vw - br.width - PAD);
    top = clamp(top, PAD, Math.max(PAD, vh - br.height - PAD));

    if (cmp) {
      var cr = sizeBox(cmp, vw, vh, cmpW, maxH);
      var groupW = br.width + PAD + cr.width;
      var cmpLeft, cmpTop, sideBySide = groupW <= vw - 2 * PAD;
      if (sideBySide) {
        if (left + br.width + PAD + cr.width <= vw - PAD) {
          cmpLeft = left + br.width + PAD; cmpTop = top;
        } else if (left - PAD - cr.width >= PAD) {
          cmpLeft = left - PAD - cr.width; cmpTop = top;
        } else {
          left = clamp(PAD, PAD, vw - PAD - groupW);
          cmpLeft = left + br.width + PAD; cmpTop = top;
        }
      } else {
        /* stack, shrinking if needed */
        var stackH = br.height + PAD + cr.height;
        if (stackH > vh - 2 * PAD) {
          maxH = Math.max(160, Math.floor((vh - 3 * PAD) / 2));
          br = sizeBox(box, vw, vh, mainW, maxH);
          cr = sizeBox(cmp, vw, vh, cmpW, maxH);
        }
        left = clamp(left, PAD, vw - br.width - PAD);
        if (top + br.height + PAD + cr.height <= vh - PAD) {
          cmpLeft = left; cmpTop = top + br.height + PAD;
        } else if (top - PAD - cr.height >= PAD) {
          cmpLeft = left; cmpTop = top - PAD - cr.height;
        } else {
          top = PAD;
          cmpLeft = left; cmpTop = Math.min(top + br.height + PAD, vh - cr.height - PAD);
        }
      }
      top = clamp(top, PAD, Math.max(PAD, vh - br.height - PAD));
      left = clamp(left, PAD, vw - br.width - PAD);
      setPos(box, left, top);
      setPos(cmp, clamp(cmpLeft, PAD, vw - cr.width - PAD), clamp(cmpTop, PAD, Math.max(PAD, vh - cr.height - PAD)));
    } else {
      setPos(box, left, top);
    }
  }

  function schedule() {
    place();
    if (root.requestAnimationFrame) root.requestAnimationFrame(place);
  }

  root.ABItemBox = { place: schedule, layout: place };
  root.addEventListener("resize", schedule);
})(typeof self !== "undefined" ? self : window);
