// r14: painted skill icons. The art mapping lives in data/skill-art.json (skill id -> file, class rim).
// ABSkillArt.html(def) returns an <img> for the skill, or "" when there is no art (or it failed to load),
// so callers fall back to the old pixel glyph. A broken image swaps itself back to the glyph.
(function (root) {
  const failed = new Set();
  function cfg() { const D = root.ASHBOUND_DATA; return (D && D.skillArt && D.skillArt.enabled !== false) ? D.skillArt : null; }
  function url(id) {
    const c = cfg(); if (!c || !c.skills || !id) return null;
    const e = c.skills[id]; if (!e) return null;
    const f = typeof e === "string" ? e : e.file; if (!f) return null;
    return (c.dir || "") + f;
  }
  function attr(s) { return String(s).replace(/[&"<>]/g, (ch) => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" }[ch])); }
  function html(d) {
    const id = d && d.id, u = url(id);
    if (!u || failed.has(u)) return "";
    return `<img class="skill-ico skill-art" src="${attr(u)}" alt="" aria-hidden="true" draggable="false" decoding="async" data-skill-art="${attr(id)}" onerror="window.ABSkillArt&&ABSkillArt.fail(this)">`;
  }
  function fail(img) {
    try {
      const u = img.getAttribute("src"); failed.add(u);
      const id = img.getAttribute("data-skill-art");
      const fn = root.ABSkillIco;
      const glyph = typeof fn === "function" ? fn({ id }) : "";
      if (glyph && glyph.indexOf("skill-art") < 0) img.outerHTML = glyph; else img.remove();
    } catch (err) { /* keep going */ }
  }
  function list() { const c = cfg(); return c && c.skills ? Object.keys(c.skills).map((id) => ({ id, url: url(id) })) : []; }
  const css = `
img.skill-ico.skill-art { display: block; object-fit: contain; image-rendering: auto; border-radius: 12%; -webkit-user-drag: none; user-select: none; pointer-events: none; }
.skill-btn img.skill-ico.skill-art { width: 86%; height: 86%; margin: 0 auto; }
.skill-node img.skill-ico.skill-art { width: 36px; height: 36px; image-rendering: auto; }
.tt-node.tt-tile .tt-plate img.skill-ico.skill-art { position: absolute; inset: 3px; width: calc(100% - 6px); height: calc(100% - 6px); margin: 0; z-index: 0; }
.tt-node.tt-tile .tt-plate > :not(img) { z-index: 1; }
/* locked art stays readable (dashed border + desaturated + dimmer, not near-black) */
.tt-node.tt-tile.st-locked:has(img.skill-art) { opacity: 0.9; }
.tt-node.tt-tile.st-locked .tt-plate:has(img.skill-art) { opacity: 0.9; }
.tt-node.tt-tile.st-locked .tt-plate img.skill-art { filter: saturate(0.55) brightness(0.9); }
.tt-dico { float: left; width: 52px; height: 52px; margin: 0 8px 2px 0; }
.tt-dico .skill-ico { width: 52px; height: 52px; }
`;
  function injectCss() {
    if (typeof document === "undefined" || document.getElementById("ab-skillart-css")) return;
    const s = document.createElement("style"); s.id = "ab-skillart-css"; s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }
  injectCss();
  root.ABSkillArt = { html, fail, url, list, failed };
})(typeof window !== "undefined" ? window : globalThis);
