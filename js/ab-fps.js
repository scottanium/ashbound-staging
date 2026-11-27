// v84m: on-screen FPS / frame-time readout (Menu > "Show FPS", off by default). Settings key and look come from data/perfhud.json.
// Its own requestAnimationFrame loop measures real frame intervals; it runs only while the readout is shown.
// Shows average fps and the 1% low (average fps of the slowest 1% of frames) over the last few seconds, plus average ms.
// Sits top-centre inside the safe area, so it stays clear of the Dynamic Island on either side in landscape.
(function (root) {
  "use strict";
  var CFG = { settingKey: "showFps", default: false, window: 600, updateMs: 500, top: 4 }, el = null, buf = [], last = 0, lastUi = 0, on = false, raf = 0;
  fetch("data/perfhud.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) for (var k in j) if (k[0] !== "_") CFG[k] = j[k]; }).catch(function () {});
  function S() { return root.ASHBOUND && root.ASHBOUND.state && root.ASHBOUND.state.settings; }
  function enabled() { var s = S(); if (!s) return false; var v = s[CFG.settingKey]; return v == null ? !!CFG.default : !!v; }
  function mkEl() {
    el = document.createElement("div"); el.id = "ab-fps"; el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + " + (CFG.top || 4) + "px);z-index:60;" +
      "pointer-events:none;font:600 11px/1.25 ui-monospace,Menlo,monospace;color:#e8f4ea;background:rgba(6,10,12,.62);padding:2px 7px;border-radius:6px;" +
      "border:1px solid rgba(255,255,255,.14);white-space:nowrap;letter-spacing:.02em";
    document.body.appendChild(el);
  }
  function frame(t) {
    if (!on) return;
    if (last) { var dt = t - last; if (dt > 0 && dt < 1000) { buf.push(dt); if (buf.length > (CFG.window || 600)) buf.shift(); } }
    last = t;
    if (t - lastUi > (CFG.updateMs || 500) && buf.length > 5) { lastUi = t; draw(); }
    raf = requestAnimationFrame(frame);
  }
  function stats() {
    var n = buf.length; if (!n) return null; var sum = 0; for (var i = 0; i < n; i++) sum += buf[i];
    var s = buf.slice().sort(function (a, b) { return b - a; }), k = Math.max(1, Math.round(n * .01)), w = 0; for (var j = 0; j < k; j++) w += s[j];
    return { fps: 1000 / (sum / n), low1: 1000 / (w / k), ms: sum / n, n: n };
  }
  function draw() { var st = stats(); if (!st || !el) return; el.textContent = Math.round(st.fps) + " fps · 1% low " + Math.round(st.low1) + " · " + st.ms.toFixed(1) + " ms"; }
  function sync() {
    var want = enabled();
    if (want && !on) { if (!el) mkEl(); el.style.display = ""; el.textContent = "… fps"; on = true; buf = []; last = 0; lastUi = 0; raf = requestAnimationFrame(frame); }
    else if (!want && on) { on = false; cancelAnimationFrame(raf); if (el) el.style.display = "none"; }
  }
  setInterval(sync, 500);
  function button(s) { var v = s && s[CFG.settingKey]; v = v == null ? !!CFG.default : !!v; return '<button class="btn" data-act="fps">Show FPS: ' + (v ? "on" : "off") + "</button>"; }
  function toggle(s) { var v = s[CFG.settingKey]; v = v == null ? !!CFG.default : !!v; s[CFG.settingKey] = !v; sync(); return s[CFG.settingKey] ? "FPS readout on." : "FPS readout off."; }
  root.ABFps = { button: button, toggle: toggle, stats: stats, sync: sync, cfg: function () { return CFG; } };
})(window);
