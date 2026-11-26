/* v84g: read env(safe-area-inset-*) from a CSS probe and publish them as
   --safe-l/r/t/b plus ABSafeArea.insets() for canvas-drawn UI. Extra and
   minimum pads come from data/ui.json safeArea. */
(function (root) {
  "use strict";
  var listeners = [];
  var last = { left: 0, right: 0, top: 0, bottom: 0 };
  var forced = null;

  function cfg() {
    var u = (root.ASHBOUND_DATA && root.ASHBOUND_DATA.ui) || {};
    return u.safeArea || {};
  }

  function ensureProbe() {
    var el = root.document.getElementById("ab-safe-probe");
    if (el) return el;
    el = root.document.createElement("div");
    el.id = "ab-safe-probe";
    el.setAttribute("aria-hidden", "true");
    (root.document.body || root.document.documentElement).appendChild(el);
    return el;
  }

  function envInsets() {
    var el = ensureProbe();
    var cs = root.getComputedStyle(el);
    return {
      left: parseFloat(cs.width) || 0,
      top: parseFloat(cs.height) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0
    };
  }

  function one(env, extra, min) {
    return Math.max(min || 0, (env || 0) + (extra || 0));
  }

  function compute() {
    if (forced) {
      return { left: forced.left || 0, right: forced.right || 0, top: forced.top || 0, bottom: forced.bottom || 0 };
    }
    var e = envInsets(), c = cfg();
    return {
      left: one(e.left, c.extraLeft, c.minLeft),
      right: one(e.right, c.extraRight, c.minRight),
      top: one(e.top, c.extraTop, c.minTop),
      bottom: one(e.bottom, c.extraBottom, c.minBottom)
    };
  }

  function applyVars(s) {
    var r = root.document.documentElement.style;
    r.setProperty("--safe-l", s.left + "px");
    r.setProperty("--safe-r", s.right + "px");
    r.setProperty("--safe-t", s.top + "px");
    r.setProperty("--safe-b", s.bottom + "px");
  }

  function same(a, b) {
    return a && b && a.left === b.left && a.right === b.right && a.top === b.top && a.bottom === b.bottom;
  }

  function refresh() {
    var s = compute();
    applyVars(s);
    var ch = !same(last, s);
    last = s;
    if (ch) {
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](s); } catch (err) {}
      }
    }
    return s;
  }

  function apply(partial) {
    if (!partial) { forced = null; return refresh(); }
    var cur = forced ? { left: forced.left, right: forced.right, top: forced.top, bottom: forced.bottom } : compute();
    forced = {
      left: partial.left != null ? +partial.left : cur.left,
      right: partial.right != null ? +partial.right : cur.right,
      top: partial.top != null ? +partial.top : cur.top,
      bottom: partial.bottom != null ? +partial.bottom : cur.bottom
    };
    return refresh();
  }

  function insets() {
    return { left: last.left, right: last.right, top: last.top, bottom: last.bottom };
  }

  function listen(fn) { if (typeof fn === "function") listeners.push(fn); }

  function boot() {
    ensureProbe();
    refresh();
    root.addEventListener("resize", refresh);
    root.addEventListener("orientationchange", function () { root.setTimeout(refresh, 60); });
    if (root.ASHBOUND_DATA_READY && typeof root.ASHBOUND_DATA_READY.then === "function") {
      root.ASHBOUND_DATA_READY.then(refresh);
    }
  }

  if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", boot);
  else boot();

  root.ABSafeArea = { insets: insets, refresh: refresh, apply: apply, listen: listen, envInsets: envInsets };
})(self);
