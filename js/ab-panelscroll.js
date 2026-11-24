/* Keep every #panel menu's scroll when So() rebuilds it with innerHTML
   (skills, Gear/Pack, Stash, Stats, Menu, Test Tools, shop, bench, journal…).
   Click/focus can zero scrollTop before the render frame, so we arm a snapshot
   on pointerdown and reuse it if the live capture already jumped to the top.
   After restore, we re-apply on animation frames so a late focus() cannot
   yank the list back to the top. */
(function (root) {
  var armed = null;
  var bound = false;
  var styled = false;
  var applying = 0;

  function bind() {
    if (bound || !root.document) return;
    bound = true;
    style();
    root.document.addEventListener("pointerdown", onPointer, true);
    root.document.addEventListener("click", onPointer, true);
  }

  function style() {
    if (styled || !root.document) return;
    styled = true;
    var s = root.document.createElement("style");
    s.id = "ab-panelscroll-style";
    s.textContent = "#panel,#panel .panel-body,#panel .detail-scroll,#panel .craft-scroll,#panel .stack{overflow-anchor:none;}";
    root.document.head.appendChild(s);
  }

  function onPointer(e) {
    var panel = root.document.getElementById("panel");
    if (!panel || !e || !e.target) return;
    if (panel.classList && panel.classList.contains("hidden")) return;
    if (!panel.contains(e.target)) return;
    arm(panel, e.target);
  }

  function focusKey(el, panel) {
    if (!el || !panel || !el.closest) return null;
    var hit = el.closest("[data-uid],[data-skill],[data-act],[data-tab],[data-panel]");
    if (!hit || !panel.contains(hit)) return null;
    var parts = [];
    if (hit.getAttribute("data-uid")) parts.push('[data-uid="' + hit.getAttribute("data-uid") + '"]');
    if (hit.getAttribute("data-skill")) parts.push('[data-skill="' + hit.getAttribute("data-skill") + '"]');
    if (hit.getAttribute("data-act")) parts.push('[data-act="' + hit.getAttribute("data-act") + '"]');
    if (hit.getAttribute("data-tab")) parts.push('[data-tab="' + hit.getAttribute("data-tab") + '"]');
    if (hit.getAttribute("data-slot")) parts.push('[data-slot="' + hit.getAttribute("data-slot") + '"]');
    if (hit.getAttribute("data-index")) parts.push('[data-index="' + hit.getAttribute("data-index") + '"]');
    if (hit.getAttribute("data-n")) parts.push('[data-n="' + hit.getAttribute("data-n") + '"]');
    return parts.length ? parts.join("") : null;
  }

  function keyFor(el, panel) {
    if (!el || el === panel) return ":root";
    if (el.id) return "#" + el.id;
    if (el.classList) {
      if (el.classList.contains("panel-body")) return ".panel-body";
      if (el.classList.contains("detail-scroll")) return ".detail-scroll";
      if (el.classList.contains("tree-wrap")) return ".tree-wrap";
      if (el.classList.contains("craft-scroll")) return ".craft-scroll";
      if (el.classList.contains("stats-tab")) return ".stats-tab";
      if (el.classList.contains("stats-sets")) return ".stats-sets";
      if (el.classList.contains("grid") && el.closest && el.closest(".gear-bag")) return ".gear-bag .grid";
    }
    var tag = (el.tagName || "div").toLowerCase();
    var cls = el.classList && el.classList[0] ? "." + el.classList[0] : "";
    var i = 1, sib = el;
    while ((sib = sib.previousElementSibling)) {
      if (sib.tagName === el.tagName) i++;
    }
    return tag + cls + ":nth-of-type(" + i + ")";
  }

  function isScrollable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.scrollTop || el.scrollLeft) return true;
    var st;
    try { st = root.getComputedStyle(el); } catch (err) { return false; }
    if (!st) return false;
    var ox = st.overflowX, oy = st.overflowY;
    if (!/(auto|scroll|overlay)/.test(String(ox)) && !/(auto|scroll|overlay)/.test(String(oy))) return false;
    return el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;
  }

  function snapshot(panel) {
    var page = { x: root.scrollX || 0, y: root.scrollY || 0 };
    var snaps = [];
    if (!panel) return { page: page, snaps: snaps };
    var nodes = [panel];
    if (panel.querySelectorAll) {
      var all = panel.querySelectorAll("*");
      for (var i = 0; i < all.length; i++) nodes.push(all[i]);
    }
    for (var j = 0; j < nodes.length; j++) {
      var el = nodes[j];
      if (!isScrollable(el)) continue;
      snaps.push({ key: keyFor(el, panel), top: el.scrollTop || 0, left: el.scrollLeft || 0 });
    }
    return { page: page, snaps: snaps };
  }

  function maxTop(shot) {
    var m = 0;
    var snaps = (shot && shot.snaps) || [];
    for (var i = 0; i < snaps.length; i++) {
      if ((snaps[i].top || 0) > m) m = snaps[i].top || 0;
      if ((snaps[i].left || 0) > m) m = snaps[i].left || 0;
    }
    if (shot && shot.page) {
      if ((shot.page.y || 0) > m) m = shot.page.y || 0;
      if ((shot.page.x || 0) > m) m = shot.page.x || 0;
    }
    return m;
  }

  function find(panel, key) {
    if (!panel || !key) return null;
    if (key === ":root") return panel;
    if (key.charAt(0) === "#" && panel.id === key.slice(1)) return panel;
    try { return panel.querySelector(key); } catch (err) { return null; }
  }

  function apply(panel, shot) {
    if (!shot) return;
    if (shot.page) {
      try { root.scrollTo(shot.page.x, shot.page.y); } catch (err) {}
    }
    if (!panel || !shot.snaps) return;
    for (var i = 0; i < shot.snaps.length; i++) {
      var s = shot.snaps[i];
      var el = find(panel, s.key);
      if (!el) continue;
      el.scrollTop = s.top;
      el.scrollLeft = s.left;
    }
  }

  function refocus(panel, key) {
    if (!panel || !key) return;
    var el = null;
    try { el = panel.querySelector(key); } catch (err) { el = null; }
    if (!el || !el.focus) return;
    try { el.focus({ preventScroll: true }); } catch (err) {
      try { el.focus(); } catch (e2) {}
    }
  }

  function arm(panel, target) {
    bind();
    if (!panel) return;
    armed = {
      shot: snapshot(panel),
      at: root.performance ? performance.now() : Date.now(),
      focus: focusKey(target, panel)
    };
  }

  function capture(panel) {
    bind();
    var live = snapshot(panel);
    if (armed && ((root.performance ? performance.now() : Date.now()) - armed.at) < 1200) {
      var armedMax = maxTop(armed.shot);
      var liveMax = maxTop(live);
      if (armedMax > 4 && armedMax >= liveMax) return armed.shot;
    }
    return live;
  }

  function restore(panel, shot) {
    bind();
    if (!shot) return;
    apply(panel, shot);
    var focus = armed && armed.focus;
    refocus(panel, focus);
    if (applying) return;
    applying = 1;
    var steps = 0;
    function again() {
      apply(panel, shot);
      refocus(panel, focus);
      steps++;
      if (steps < 3 && root.requestAnimationFrame) root.requestAnimationFrame(again);
      else applying = 0;
    }
    if (root.requestAnimationFrame) root.requestAnimationFrame(again);
    else applying = 0;
    if (root.setTimeout) {
      root.setTimeout(function () { apply(panel, shot); refocus(panel, focus); }, 40);
    }
  }

  bind();
  root.ABPanelScroll = { capture: capture, restore: restore, arm: arm, snapshot: snapshot };
})(typeof window !== "undefined" ? window : this);
