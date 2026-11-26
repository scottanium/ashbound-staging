/* v84g: Diablo Immortal-style item pop-up. The detail box sits over or beside the
   tapped item, stays on screen, and closes when you tap outside it. A second
   box shows the currently equipped item when there is room. Equip stays a wide
   button on the bottom of the card; Unequip, Move to Stash, Drop and the other
   secondary actions sit in a narrow icon strip beside the card. Drop asks for
   confirmation. Sizes come from data/ui.json "itemBox". A unique's
   "A unique can be consumed…" tip is moved inside the box so it never draws over it. */
(function (root) {
  var DEF = {
    pad: 8,
    maxW: 340,
    maxH: 380,
    compareMaxW: 320,
    minW: 200,
    stackMin: 160,
    equipH: 44,
    icon: 44,
    iconGap: 6,
    stripGap: 6,
    z: 80,
    tipZ: 90
  };

  function cfg() {
    var u = (root.ASHBOUND_DATA && root.ASHBOUND_DATA.ui) || {};
    var b = u.itemBox || {};
    var o = {};
    for (var k in DEF) o[k] = b[k] != null ? b[k] : DEF[k];
    return o;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function applyVars() {
    var c = cfg();
    var s = document.getElementById("ab-itembox-style");
    if (!s) {
      s = document.createElement("style");
      s.id = "ab-itembox-style";
      document.head.appendChild(s);
    }
    s.textContent = [
      ":root{--ib-pad:" + c.pad + "px;--ib-icon:" + c.icon + "px;--ib-icon-gap:" + c.iconGap + "px;--ib-strip-gap:" + c.stripGap + "px;--ib-equip-h:" + c.equipH + "px;--ib-z:" + c.z + ";--ib-tip-z:" + c.tipZ + ";}",
      "#item-pop-back{z-index:calc(var(--ib-z) - 1);}",
      "#panel .detail.item-pop,.detail.item-pop{z-index:var(--ib-z);overflow:visible;max-width:min(" + c.maxW + "px, calc(100vw - 16px));max-height:min(74vh, " + c.maxH + "px);}",
      ".detail.item-pop-compare{z-index:calc(var(--ib-z) + 1);}",
      "body.item-pop-open #hud #toasts,body.item-pop-open #hud #hint{display:none !important;visibility:hidden;pointer-events:none;}",
      ".detail.item-pop .detail-actions{flex:0 0 auto;background:transparent;padding-top:8px;border-top:1px solid rgba(154,116,72,0.45);}",
      ".detail.item-pop .detail-actions .row{display:flex;flex-wrap:wrap;gap:6px;margin:0;}",
      ".detail.item-pop .detail-actions .btn[data-act=equip],.detail.item-pop .detail-actions .btn[data-act=buy]{flex:1 1 100%;min-height:var(--ib-equip-h);font-size:16px;font-weight:700;}",
      ".detail.item-pop .detail-actions.is-empty{display:none;}",
      ".detail.item-pop .detail-scroll{flex:1 1 auto;min-height:0;overflow:auto;}",
      ".item-side-strip{position:absolute;top:40px;display:flex;flex-direction:column;gap:var(--ib-icon-gap);z-index:2;pointer-events:auto;}",
      ".item-side-strip.strip-right{left:100%;right:auto;margin-left:var(--ib-strip-gap);margin-right:0;}",
      ".item-side-strip.strip-left{right:100%;left:auto;margin-right:var(--ib-strip-gap);margin-left:0;}",
      "#panel .detail.item-pop .item-icon-btn,.detail.item-pop .item-icon-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:var(--ib-icon) !important;min-width:var(--ib-icon) !important;min-height:var(--ib-icon) !important;max-width:var(--ib-icon);padding:4px 2px 3px;margin:0;border-radius:10px;font-size:9px !important;line-height:1.1;font-weight:600;letter-spacing:0.02em;flex:0 0 auto;}",
      ".item-icon-btn svg{width:18px;height:18px;flex:0 0 auto;fill:currentColor;}",
      ".item-icon-btn .item-icon-lab{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      ".item-icon-btn.primary{font-weight:700;}",
      ".item-drop-confirm{display:none;position:absolute;left:8px;right:8px;bottom:8px;z-index:6;margin:0;padding:8px;border-radius:10px;border:1px solid var(--line,#9a7448);background:#1a1410;box-shadow:0 8px 20px rgba(0,0,0,0.55);}",
      ".item-drop-confirm.on{display:block;}",
      ".item-drop-confirm .drop-ask{display:block;margin:0 0 6px;font-size:13px;}",
      ".item-drop-confirm .row{display:flex;gap:6px;margin:0;}",
      ".item-drop-confirm .btn{flex:1 1 40%;min-height:40px;}",
      ".item-flag.consume-hint{color:var(--ember-2,#e39a45);line-height:1.35;white-space:normal;margin:4px 0 6px;padding:5px 7px;border:1px solid rgba(224,177,90,0.45);border-radius:8px;background:rgba(20,14,10,0.6);}"
    ].join("\n");
  }

  function ICO(d) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  var ICONS = {
    unequip: ICO("M8 3l2 2h4l2-2 3 2v3l-3-1v12H8V7L5 8V5l3-2zm2 6v2h4V9h-4z"),
    stash: ICO("M4 7h16v3H4V7zm1 4h14v8H5v-8zm2 2v2h10v-2H7z"),
    drop: ICO("M12 3v10.2l3.5-3.5 1.4 1.4L12 16.9 7.1 11.1l1.4-1.4L11 13.2V3h1zM5 19h14v2H5v-2z"),
    consume: ICO("M12 2s5 5 5 9a5 5 0 1 1-10 0c0-4 5-9 5-9zm0 8c-1.2 0-2 .9-2 2.2 0 1.5 1 2.3 2 3.3 1-1 2-1.8 2-3.3 0-1.3-.8-2.2-2-2.2z"),
    sell: ICO("M12 2l2.2 4.5L19 7.2l-3.5 3.4.8 4.9L12 13.8 7.7 15.5l.8-4.9L5 7.2l4.8-.7L12 2z"),
    pack: ICO("M8 5l1-2h6l1 2h4v14H4V5h4zm2 3v2h4V8h-4z"),
    shared: ICO("M4 8h7v10H4V8zm9 0h7v10h-7V8zM7 5h3v2H7V5zm9 0h3v2h-3V5z"),
    cube: ICO("M3 7l9-4 9 4v10l-9 4-9-4V7zm9 2l6-2.6-6-2.7-6 2.7L12 9zm-7 1.2V16l6 2.7V12.4L5 10.2zm14 0l-6 2.2v6.3l6-2.7v-5.8z"),
    sleep: ICO("M13 3a8 8 0 1 0 8 9 6.5 6.5 0 0 1-8-9z"),
    awaken: ICO("M11 4h2v3h-2V4zm0 13h2v3h-2v-3zM4 11h3v2H4v-2zm13 0h3v2h-3v-2zM6.2 6.2l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1zm8.1 8.1l2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4zM6.2 17.8l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4zm8.1-8.1l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4zM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"),
    bind: ICO("M8 4h8v2H8V4zm-2 3h12v13H6V7zm3 3v7h2v-7H9zm4 0v7h2v-7h-2z"),
    insert: ICO("M11 3h2v10h3l-4 5-4-5h3V3zm-7 16h16v2H4v-2z"),
    pry: ICO("M7 4l10 10-2 2-3-3-5 5H4v-3l5-5-3-3 2-2zm9.5 9.5L19 16l-3 3-2.5-2.5 3-3z"),
    quill: ICO("M7 20l-3-3 9-11 5 5-11 9zm9-13l2-3 3 2-3 3-2-2z"),
    more: ICO("M6 11h12v2H6v-2z")
  };

  function metaFor(btn) {
    var act = btn.getAttribute("data-act") || "";
    var dest = btn.getAttribute("data-dest") || "";
    var text = (btn.textContent || "").replace(/\s+/g, " ").trim();
    if (act === "unequip" && dest === "stash") return { icon: "stash", label: "Stash" };
    if (act === "unequip") return { icon: "unequip", label: "Unequip" };
    if (act === "drop") return { icon: "drop", label: "Drop" };
    if (act === "to-stash") return { icon: "stash", label: "Stash" };
    if (act === "to-shared") return { icon: "shared", label: "Shared" };
    if (act === "to-pack") return { icon: "pack", label: "Pack" };
    if (act === "to-cube") return { icon: "cube", label: "Box" };
    if (act === "consume-into") return { icon: "consume", label: "Consume" };
    if (act === "consume-sleep") return { icon: "sleep", label: "Sleep" };
    if (act === "consume-awaken") return { icon: "awaken", label: "Awaken" };
    if (act === "sell") return { icon: "sell", label: text.replace(/^Sell\s*/i, "Sell") || "Sell" };
    if (act === "bind-set") return { icon: "bind", label: "Bind" };
    if (act === "insert") return { icon: "insert", label: "Insert" };
    if (act === "pry") return { icon: "pry", label: "Pry" };
    if (act === "equip-hire") return { icon: "quill", label: "Quill" };
    var short = text.split(" ")[0] || "Use";
    if (short.length > 8) short = short.slice(0, 8);
    return { icon: "more", label: short };
  }

  function isPrimary(btn) {
    var act = btn.getAttribute("data-act");
    return act === "equip" || act === "buy";
  }

  function restyleIcon(btn) {
    var m = metaFor(btn);
    var ico = ICONS[m.icon] || ICONS.more;
    btn.classList.add("item-icon-btn");
    btn.classList.remove("equip-btn", "slim");
    if (btn.getAttribute("data-act") === "consume-into" || btn.getAttribute("data-act") === "consume-awaken") {
      btn.classList.add("primary");
    }
    btn.innerHTML = ico + '<span class="item-icon-lab">' + m.label + "</span>";
    if (!btn.getAttribute("aria-label")) btn.setAttribute("aria-label", m.label);
    if (m.label === "Unequip" && (btn.textContent || "").indexOf("Unequip") < 0) {
      /* label is already Unequip in .item-icon-lab */
    }
    return btn;
  }

  function hideConfirm(box) {
    var conf = box && box.querySelector(".item-drop-confirm");
    if (conf) conf.classList.remove("on");
  }

  function showConfirm(box) {
    var conf = box && box.querySelector(".item-drop-confirm");
    if (!conf) return;
    conf.classList.add("on");
  }

  function decorate(box) {
    if (!box || !box.classList.contains("item-pop")) return;
    if (box.getAttribute("data-ab-decorated") === "1") return;
    box.setAttribute("data-ab-decorated", "1");
    var actions = box.querySelector(".detail-actions");
    var row = actions && actions.querySelector(".row");
    var scroll = box.querySelector(".detail-scroll");
    var strip = document.createElement("div");
    strip.className = "item-side-strip strip-right";
    strip.setAttribute("role", "group");
    strip.setAttribute("aria-label", "Item actions");

    function take(btn) {
      if (!btn || isPrimary(btn)) return;
      restyleIcon(btn);
      strip.appendChild(btn);
    }
    if (row) {
      [].slice.call(row.querySelectorAll("button")).forEach(take);
    }
    if (scroll) {
      [].slice.call(scroll.querySelectorAll("button[data-act]")).forEach(take);
    }
    if (strip.children.length) box.appendChild(strip);
    if (actions && row && !row.querySelector("button")) actions.classList.add("is-empty");

    if (!box.querySelector(".item-drop-confirm")) {
      var conf = document.createElement("div");
      conf.className = "item-drop-confirm";
      conf.innerHTML = '<span class="drop-ask">Drop this item?</span><div class="row">' +
        '<button type="button" class="btn slim" data-drop-cancel="1">Keep</button>' +
        '<button type="button" class="btn slim primary" data-act="drop" data-drop-ok="1">Drop</button>' +
        "</div>";
      box.appendChild(conf);
    }
  }

  function stripW(box) {
    var strip = box && box.querySelector(".item-side-strip");
    if (!strip || !strip.children.length) return 0;
    var c = cfg();
    var w = strip.getBoundingClientRect().width;
    return (w || c.icon) + c.stripGap;
  }

  function setStripSide(box, side) {
    var strip = box && box.querySelector(".item-side-strip");
    if (!strip) return;
    strip.classList.toggle("strip-left", side === "left");
    strip.classList.toggle("strip-right", side !== "left");
  }

  function sizeBox(el, vw, vh, width, maxH) {
    var c = cfg();
    el.style.position = "fixed";
    el.style.zIndex = el.id === "detail-compare" ? String(c.z + 1) : String(c.z);
    el.style.right = "auto";
    el.style.bottom = "auto";
    el.style.margin = "0";
    el.style.maxHeight = Math.min(vh - 2 * c.pad, maxH || c.maxH) + "px";
    el.style.width = Math.min(width || c.maxW, vw - 2 * c.pad) + "px";
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

  var heldHint = null;

  function consumeHintText(text) {
    return !!(text && String(text).indexOf("A unique can be consumed") === 0);
  }

  function takeConsumeToast() {
    var A = root.ASHBOUND, s = A && A.state, list = s && s.toasts;
    if (!list) return null;
    var i, t;
    for (i = 0; i < list.length; i++) {
      t = list[i];
      if (t && consumeHintText(t.text)) {
        list.splice(i, 1);
        return t.text;
      }
    }
    return null;
  }

  function styleTipOnce() {
    if (root.document.getElementById("ab-itembox-tip-style")) return;
    var st = root.document.createElement("style");
    st.id = "ab-itembox-tip-style";
    st.textContent = ".item-consume-tip{flex:0 0 auto;margin:0 0 8px;padding:6px 8px;border-radius:8px;border:1px solid var(--line-dim,#8d6840);background:rgba(40,28,18,0.95);color:var(--ember-2,#e0b15a);font-size:12px;line-height:1.35;}";
    (root.document.head || root.document.documentElement).appendChild(st);
  }

  function syncConsumeTip(box, open) {
    var taken = takeConsumeToast();
    if (taken) heldHint = taken;
    if (!open) {
      heldHint = null;
      return;
    }
    if (!box) return;
    var existing = box.querySelector(".item-flag.consume-hint, #item-consume-tip, .item-consume-tip");
    if (existing && !heldHint) {
      var txt = (existing.textContent || "").trim();
      if (txt) heldHint = txt;
    }
    if (!heldHint) return;
    styleTipOnce();
    var el = box.querySelector("#item-consume-tip") || existing;
    if (!el) {
      el = root.document.createElement("div");
      el.setAttribute("role", "note");
      var head = box.querySelector(".detail-head");
      if (head && head.parentNode === box) box.insertBefore(el, head.nextSibling);
      else box.insertBefore(el, box.firstChild);
    }
    el.id = "item-consume-tip";
    el.classList.add("item-consume-tip");
    if (existing && existing.classList.contains("consume-hint")) el.classList.add("item-flag", "consume-hint");
    el.textContent = heldHint;
  }

  function place() {
    applyVars();
    var c = cfg();
    var panel = root.document.getElementById("panel");
    var box = root.document.getElementById("detail");
    var cmp = root.document.getElementById("detail-compare");
    var open = !!(box && box.classList.contains("item-pop"));
    if (root.document.body) root.document.body.classList.toggle("item-pop-open", open);
    syncConsumeTip(box, open);
    if (!open) return;
    decorate(box);
    if (cmp) decorate(cmp);

    var vw = root.innerWidth || 0, vh = root.innerHeight || 0;
    var safe = (root.ABSafeArea && ABSafeArea.insets && ABSafeArea.insets()) || { left: 0, right: 0, top: 0, bottom: 0 };
    vw = Math.max(0, vw); vh = Math.max(0, vh);
    var A = root.ASHBOUND, uid = A && A.state && A.state.ui && A.state.ui.selected && A.state.ui.selected.uid;
    var anchor = anchorFor(uid, panel, box, cmp);
    var ar = anchor ? anchor.getBoundingClientRect() : { left: vw / 2, right: vw / 2, top: vh / 2, bottom: vh / 2, width: 0, height: 0 };

    var mainW = Math.min(c.maxW, vw - 2 * c.pad);
    var cmpW = Math.min(c.compareMaxW, vw - 2 * c.pad);
    var maxH = c.maxH;
    var swMain = stripW(box);
    var swCmp = cmp ? stripW(cmp) : 0;
    /* Portrait phones are narrower than maxW + the icon strip; shrink the card. */
    if (mainW + swMain > vw - 2 * c.pad) mainW = Math.max(c.minW, vw - 2 * c.pad - swMain);
    if (cmpW + swCmp > vw - 2 * c.pad) cmpW = Math.max(c.minW, vw - 2 * c.pad - swCmp);
    if (cmp && mainW + c.pad + cmpW + swMain + swCmp > vw - 2 * c.pad) {
      var each = Math.floor((vw - 2 * c.pad - c.pad - swMain - swCmp) / 2);
      mainW = Math.max(c.minW, each);
      cmpW = Math.max(c.minW, each);
    }
    /* le-ui fit level 3+: a crowded main card gets wider (fewer wrapped lines) while the compare card still fits beside it */
    var wide = +(box.getAttribute("data-le-wide") || 0);
    if (wide > mainW) {
      var wMain = Math.min(wide, vw - 2 * c.pad - swMain);
      if (cmp) {
        var wCmp = Math.min(cmpW, vw - 3 * c.pad - swMain - swCmp - wMain);
        if (wCmp >= c.minW) { mainW = wMain; cmpW = wCmp; }
      } else mainW = wMain;
    }
    if (cmp && 2 * 180 + c.pad > vh - 2 * c.pad) {
      maxH = Math.max(c.stackMin, Math.floor((vh - 3 * c.pad) / 2));
    }

    var br = sizeBox(box, vw, vh, mainW, maxH);
    var left, top;
    var needW = br.width + swMain;
    if (ar.right + c.pad + needW <= vw - c.pad) { left = ar.right + c.pad; top = ar.top; }
    else if (ar.left - c.pad - needW >= c.pad) { left = ar.left - c.pad - needW; top = ar.top; }
    else if (ar.bottom + c.pad + br.height <= vh - c.pad) { left = ar.left; top = ar.bottom + c.pad; }
    else if (ar.top - c.pad - br.height >= c.pad) { left = ar.left; top = ar.top - c.pad - br.height; }
    else { left = (vw - needW) / 2; top = (vh - br.height) / 2; }
    left = clamp(left, c.pad, vw - needW - c.pad);
    top = clamp(top, c.pad, Math.max(c.pad, vh - br.height - c.pad));

    if (cmp) {
      var cr = sizeBox(cmp, vw, vh, cmpW, maxH);
      var groupW = br.width + swMain + c.pad + cr.width + swCmp;
      var cmpLeft, cmpTop, sideBySide = groupW <= vw - 2 * c.pad;
      if (sideBySide) {
        /* main strip on the right of main, compare strip on the right of compare */
        setStripSide(box, "right");
        setStripSide(cmp, "right");
        if (left + br.width + swMain + c.pad + cr.width + swCmp <= vw - c.pad) {
          cmpLeft = left + br.width + swMain + c.pad; cmpTop = top;
        } else if (left - swMain - c.pad - cr.width - swCmp >= c.pad) {
          setStripSide(box, "left");
          setStripSide(cmp, "left");
          /* v85: leave room for main's own strip, which now sits on its left */
          cmpLeft = left - swMain - c.pad - cr.width; cmpTop = top;
          /* main has strip on its left, so shift main right by swMain if needed */
        } else {
          left = clamp(c.pad, c.pad, vw - c.pad - groupW);
          setStripSide(box, "right");
          setStripSide(cmp, "right");
          cmpLeft = left + br.width + swMain + c.pad; cmpTop = top;
        }
      } else {
        setStripSide(box, (left + br.width + swMain <= vw - c.pad) ? "right" : "left");
        setStripSide(cmp, (left + cr.width + swCmp <= vw - c.pad) ? "right" : "left");
        var stackH = br.height + c.pad + cr.height;
        if (stackH > vh - 2 * c.pad) {
          maxH = Math.max(c.stackMin, Math.floor((vh - 3 * c.pad) / 2));
          br = sizeBox(box, vw, vh, mainW, maxH);
          cr = sizeBox(cmp, vw, vh, cmpW, maxH);
        }
        var mainNeed = br.width + swMain;
        left = clamp(left, c.pad, vw - mainNeed - c.pad);
        if (top + br.height + c.pad + cr.height <= vh - c.pad) {
          cmpLeft = left; cmpTop = top + br.height + c.pad;
        } else if (top - c.pad - cr.height >= c.pad) {
          cmpLeft = left; cmpTop = top - c.pad - cr.height;
        } else {
          top = c.pad;
          cmpLeft = left; cmpTop = Math.min(top + br.height + c.pad, vh - cr.height - c.pad);
        }
      }
      if (sideBySide) {
        /* v85: slide the pair as one so neither card nor strip lands under a safe-area inset (Dynamic Island) */
        var mL = box.querySelector(".item-side-strip.strip-left") ? swMain : 0, mR = box.querySelector(".item-side-strip.strip-right") ? swMain : 0;
        var kL = cmp.querySelector(".item-side-strip.strip-left") ? swCmp : 0, kR = cmp.querySelector(".item-side-strip.strip-right") ? swCmp : 0;
        var gL = Math.min(left - mL, cmpLeft - kL), gR = Math.max(left + br.width + mR, cmpLeft + cr.width + kR);
        var minL = safe.left + c.pad, maxR = vw - safe.right - c.pad, sh = gL < minL ? minL - gL : (gR > maxR ? maxR - gR : 0);
        if (sh && gL + sh >= minL - 0.5 && gR + sh <= maxR + 0.5) { left += sh; cmpLeft += sh; }
      }
      top = clamp(top, c.pad, Math.max(c.pad, vh - br.height - c.pad));
      left = clamp(left, c.pad + (box.querySelector(".item-side-strip.strip-left") ? swMain : 0), vw - br.width - c.pad - (box.querySelector(".item-side-strip.strip-right") ? swMain : 0));
      var cmpNeedL = (cmp.querySelector(".item-side-strip.strip-left") ? swCmp : 0);
      var cmpNeedR = (cmp.querySelector(".item-side-strip.strip-right") ? swCmp : 0);
      setPos(box, left, top);
      setPos(cmp, clamp(cmpLeft, c.pad + cmpNeedL, vw - cr.width - c.pad - cmpNeedR), clamp(cmpTop, c.pad, Math.max(c.pad, vh - cr.height - c.pad)));
    } else {
      setStripSide(box, (left + br.width + swMain <= vw - c.pad) ? "right" : "left");
      if (box.querySelector(".item-side-strip.strip-left")) {
        left = clamp(left, c.pad + swMain, vw - br.width - c.pad);
      } else {
        left = clamp(left, c.pad, vw - br.width - swMain - c.pad);
      }
      setPos(box, left, top);
    }
    function stayInSafe(el, extraL, extraR) {
      if (!el) return;
      var r = el.getBoundingClientRect();
      var minX = safe.left + c.pad + (extraL || 0);
      var minY = safe.top + c.pad;
      var maxX = vw - safe.right - c.pad - r.width - (extraR || 0);
      var maxY = vh - safe.bottom - c.pad - r.height;
      if (maxX < minX) maxX = minX;
      if (maxY < minY) maxY = minY;
      if (r.left < minX - 0.5 || r.left > maxX + 0.5 || r.top < minY - 0.5 || r.top > maxY + 0.5) {
        setPos(el, clamp(r.left, minX, maxX), clamp(r.top, minY, maxY));
      }
    }
    stayInSafe(box,
      box.querySelector(".item-side-strip.strip-left") ? swMain : 0,
      box.querySelector(".item-side-strip.strip-right") ? swMain : 0);
    if (cmp) stayInSafe(cmp,
      cmp.querySelector(".item-side-strip.strip-left") ? swCmp : 0,
      cmp.querySelector(".item-side-strip.strip-right") ? swCmp : 0);
    /* le-ui (v85): a skin may tighten the card so nothing scrolls (js/ab-leui.js fitCard) */
    if (root.ABItemBox && typeof root.ABItemBox.afterPlace === "function") root.ABItemBox.afterPlace(box, cmp);
  }

  function schedule() {
    place();
    if (root.requestAnimationFrame) root.requestAnimationFrame(place);
  }

  function onClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var box = t.closest(".detail.item-pop");
    if (t.closest("[data-drop-cancel]")) {
      ev.preventDefault();
      ev.stopPropagation();
      if (box) hideConfirm(box);
      return;
    }
    var dropOk = t.closest("[data-act=drop][data-drop-ok]");
    if (dropOk) return;
    var dropBtn = t.closest("[data-act=drop]");
    if (!dropBtn) return;
    if (!root.document.body.classList.contains("item-pop-open")) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    var host = dropBtn.closest(".detail.item-pop") || document.getElementById("detail");
    if (host) showConfirm(host);
  }

  function boot() {
    applyVars();
    root.document.addEventListener("click", onClick, true);
    schedule();
  }

  root.ABItemBox = { place: schedule, layout: place, cfg: cfg };
  root.addEventListener("resize", schedule);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof self !== "undefined" ? self : window);
