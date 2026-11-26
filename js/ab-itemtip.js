/* Floating full-item tooltip. Hover (pointer:fine) shows the entire item
   text with no inner scroll. Touch tap shows the same card as an overlay
   (in addition to the existing detail pane). */
(function (root) {
  "use strict";
  var tip = null, back = null, hideT = 0, lastUid = "", mode = "";

  function fine() {
    if (root.AB_FORCE_POINTER === "fine") return true;
    if (root.AB_FORCE_POINTER === "coarse") return false;
    return !!(root.matchMedia && root.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }

  function A() { return root.ASHBOUND; }

  function ensure() {
    if (tip) return;
    if (!document.getElementById("ab-itemtip-style")) {
      var st = document.createElement("style");
      st.id = "ab-itemtip-style";
      st.textContent = [
        "#ab-item-tip-back{display:none;position:absolute;inset:0;background:rgba(8,6,4,.55);z-index:3;pointer-events:auto;}",
        "#ab-item-tip-back.on{display:block;}",
        "#ab-item-tip{display:none;position:absolute;z-index:20;max-width:min(440px,94vw);padding:10px 12px 12px;border:1px solid var(--line);border-radius:14px;background:#1a1410;box-shadow:0 10px 40px rgba(0,0,0,.55),0 0 0 1px #000;color:var(--text);pointer-events:none;overflow:hidden;line-height:1.25;}",
        "#ab-item-tip.on{display:block;}",
        "#ab-item-tip.is-touch{pointer-events:auto;}",
        "#ab-item-tip .tip-close{display:none;position:absolute;top:6px;right:6px;width:36px;height:36px;min-height:36px;border-radius:10px;}",
        "#ab-item-tip.is-touch .tip-close{display:grid;place-items:center;}",
        "#ab-item-tip .detail-x,[data-act=item-details]{display:none;}",
        "#ab-item-tip .detail-head{padding-right:28px;}",
        "#ab-item-tip .detail-name{font-size:1.08em;}",
        "#ab-item-tip .tip-body{min-width:0;}",
        "#ab-item-tip.cols-2 .tip-body{-webkit-columns:2;columns:2;column-gap:16px;}",
        "#ab-item-tip.cols-2 .detail-head,#ab-item-tip.cols-2 .item-set{column-span:all;-webkit-column-span:all;}",
        "#ab-item-tip .item-set{margin:6px 0 8px;padding-bottom:6px;border-bottom:1px solid var(--line-dim);}",
        "#ab-item-tip .item-set-name{font-weight:700;}",
        "#ab-item-tip .compare{margin-top:6px;padding-top:6px;border-top:1px solid var(--line-dim);}",
        "#ab-item-tip .sockets{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0;}"
      ].join("");
      document.head.appendChild(st);
    }
    back = document.createElement("div");
    back.id = "ab-item-tip-back";
    back.addEventListener("click", function () { hide(); });
    tip = document.createElement("div");
    tip.id = "ab-item-tip";
    tip.setAttribute("role", "tooltip");
    tip.innerHTML = '<button type="button" class="btn slim tip-close" aria-label="Close">\u00d7</button><div class="tip-card"></div>';
    tip.querySelector(".tip-close").addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); hide(); });
    var host = document.getElementById("ui") || document.body;
    host.appendChild(back);
    host.appendChild(tip);
  }

  function lookup(el) {
    if (!el) return null;
    var uid = el.getAttribute("data-uid");
    var from = el.getAttribute("data-from") || (el.classList.contains("doll-slot") ? "equip" : "");
    var ash = A();
    if (!ash || !uid || !ash.findItem) return null;
    var found = ash.findItem(uid);
    if (!found) return null;
    return { item: found.item, where: found.where || from, el: el };
  }

  function render(item, where, asTouch) {
    ensure();
    var ash = A();
    if (!ash || !ash.itemTextHtml) return;
    var parts = ash.itemTextHtml(item, where || "", { setFirst: true, close: false, details: false, compare: true });
    var card = tip.querySelector(".tip-card");
    card.innerHTML = (parts.head || "") + '<div class="tip-body">' + (parts.body || "") + "</div>";
    tip.classList.toggle("is-touch", !!asTouch);
    tip.classList.add("on");
    back.classList.toggle("on", !!asTouch);
    tip.style.transform = "";
    tip.style.fontSize = "";
    tip.classList.remove("cols-2");
    mode = asTouch ? "touch" : "hover";
    lastUid = item.uid;
  }

  function fitAndPlace(anchor) {
    if (!tip) return;
    var pad = 8, vw = window.innerWidth, vh = window.innerHeight;
    var maxH = Math.max(80, vh - pad * 2), maxW = Math.max(160, vw - pad * 2);
    tip.style.maxWidth = Math.min(440, maxW) + "px";
    tip.style.maxHeight = "none";
    tip.style.fontSize = "";
    tip.style.transform = "";
    tip.classList.remove("cols-2");
    tip.style.left = "0px";
    tip.style.top = "0px";

    function taller() { return tip.offsetHeight > maxH + 1; }
    function wider() { return tip.offsetWidth > maxW + 1; }

    if (taller() || tip.offsetHeight > vh * 0.62) {
      tip.classList.add("cols-2");
      tip.style.maxWidth = Math.min(720, maxW) + "px";
    }
    var sizes = [16, 15, 14, 13, 12.5, 12, 11.5, 11, 10.5, 10];
    var i;
    for (i = 0; i < sizes.length && taller(); i++) tip.style.fontSize = sizes[i] + "px";
    if (taller()) {
      var scale = Math.min(1, maxH / Math.max(1, tip.offsetHeight), maxW / Math.max(1, tip.offsetWidth));
      tip.style.transformOrigin = "top left";
      tip.style.transform = "scale(" + Math.max(0.55, scale) + ")";
    }

    var w = tip.getBoundingClientRect().width;
    var h = tip.getBoundingClientRect().height;
    var ax = { left: pad, top: pad, right: vw - pad, bottom: vh - pad };
    var left, top;
    if (anchor) {
      left = anchor.right + 10;
      top = anchor.top;
      if (left + w > ax.right) left = anchor.left - 10 - w;
      if (left < ax.left) left = ax.left;
      if (top + h > ax.bottom) top = ax.bottom - h;
      if (top < ax.top) top = ax.top;
    } else {
      left = Math.max(ax.left, (vw - w) / 2);
      top = Math.max(ax.top, (vh - h) / 2);
    }
    if (left + w > ax.right) left = Math.max(ax.left, ax.right - w);
    if (top + h > ax.bottom) top = Math.max(ax.top, ax.bottom - h);
    if (mode === "touch" || tip.classList.contains("is-touch")) {
      var avoid = document.querySelector("#detail .detail-actions") || document.getElementById("detail");
      if (avoid) {
        var b = avoid.getBoundingClientRect();
        var overlap = left < b.right && left + w > b.left && top < b.bottom && top + h > b.top;
        if (overlap) {
          var alt = b.left - 10 - w;
          if (alt >= ax.left) left = alt;
          else {
            alt = b.right + 10;
            if (alt + w <= ax.right) left = alt;
            else top = Math.max(ax.top, Math.min(ax.bottom - h, b.top - h - 8));
          }
        }
      }
    }
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }

  function showHover(el) {
    var found = lookup(el);
    if (!found) return;
    if (el.getAttribute("title")) el.setAttribute("data-ab-title", el.getAttribute("title")), el.removeAttribute("title");
    render(found.item, found.where, false);
    fitAndPlace(el.getBoundingClientRect());
  }

  function showTouch(el) {
    if (document.body && document.body.classList.contains("item-pop-open")) return;
    var found = lookup(el);
    if (!found) return;
    render(found.item, found.where, true);
    fitAndPlace(null);
  }

  function hide() {
    if (hideT) { clearTimeout(hideT); hideT = 0; }
    if (!tip) return;
    tip.classList.remove("on", "is-touch", "cols-2");
    if (back) back.classList.remove("on");
    lastUid = "";
    mode = "";
  }

  function scheduleHide() {
    if (hideT) clearTimeout(hideT);
    hideT = setTimeout(function () { hideT = 0; hide(); }, 80);
  }

  function cancelHide() {
    if (hideT) { clearTimeout(hideT); hideT = 0; }
  }

  function onOver(ev) {
    if (!fine()) return;
    if (ev.pointerType && ev.pointerType !== "mouse") return;
    var el = ev.target && ev.target.closest && ev.target.closest('[data-act="select-item"]');
    if (!el) return;
    cancelHide();
    showHover(el);
  }

  function onOut(ev) {
    if (!fine() || mode !== "hover") return;
    var el = ev.target && ev.target.closest && ev.target.closest('[data-act="select-item"]');
    if (!el) return;
    var next = ev.relatedTarget;
    if (next && (el.contains(next) || (tip && tip.contains(next)))) return;
    scheduleHide();
  }

  function onClick(ev) {
    var t = ev.target;
    if (mode === "touch" && back && (t === back || (t && t.id === "ab-item-tip-back"))) { hide(); return; }
    var el = t && t.closest && t.closest('[data-act="select-item"]');
    if (!el) {
      if (mode === "touch" && tip && !tip.contains(t)) hide();
      return;
    }
    if (fine()) return;
    showTouch(el);
  }

  function onKey(ev) {
    if (ev.key === "Escape") hide();
  }

  function boot() {
    if (!A() || !A().itemTextHtml) { setTimeout(boot, 40); return; }
    ensure();
    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", function () { if (tip && tip.classList.contains("on")) fitAndPlace(null); });
    new MutationObserver(function () {
      if (document.body && document.body.classList.contains("item-pop-open")) hide();
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    root.ABItemTip = { showHover: showHover, showTouch: showTouch, hide: hide, fine: fine, el: function () { return tip; }, back: function () { return back; } };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof window !== "undefined" ? window : self);
