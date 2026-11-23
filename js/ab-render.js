// Thin render/baker interface. The 3D baker already pumps off the game
// frame; this wrapper is the seam to lift rendering into an engine later.
(function (root) {
  let hooks = {};
  function attach(api) { hooks = api || {}; }
  function pump(deadline) { return hooks.pump && hooks.pump(deadline); }
  function getFrame(t, col, acc, pose, face, r, quiet) {
    return hooks.get && hooks.get(t, col, acc, pose, face, r, quiet);
  }
  function schedule() { return hooks.schedule && hooks.schedule(); }
  function evict() { return hooks.evict && hooks.evict(); }
  function cap(frames, mb) { return hooks.cap && hooks.cap(frames, mb); }
  function stats() { return hooks.stats ? hooks.stats() : null; }
  root.ABRender = { attach, pump, getFrame, schedule, evict, cap, stats };
})(typeof window !== "undefined" ? window : self);
