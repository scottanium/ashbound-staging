// Tiny event bus so combat, AI, rendering, and save can talk without calling each other.
// Later a system can be lifted into an engine by keeping this same on/emit surface.
(function (root) {
  const subs = Object.create(null);
  function on(type, fn) {
    if (!type || typeof fn !== "function") return function () {};
    (subs[type] || (subs[type] = [])).push(fn);
    return function () { off(type, fn); };
  }
  function off(type, fn) {
    const list = subs[type];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  function emit(type, payload) {
    const list = subs[type];
    if (!list || !list.length) return;
    // slice so a handler can on/off safely mid-emit
    const snap = list.slice();
    for (let i = 0; i < snap.length; i++) snap[i](payload);
  }
  root.ABBus = { on, off, emit };
})(typeof window !== "undefined" ? window : self);
