// Consume-slot UI and action helpers. Logic lives in ABCraft; this file
// draws the slot, injects buttons, and handles consume/sleep/awaken acts.
(function (root) {
  "use strict";

  function R(s) {
    return String(s ?? "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function style() {
    if (typeof document === "undefined" || document.getElementById("ab-consume-style")) return;
    const st = document.createElement("style");
    st.id = "ab-consume-style";
    st.textContent =
      ".consume-slot-wrap{margin-top:6px;width:164px;max-width:100%}" +
      ".consume-slot{display:grid;grid-template-columns:28px 1fr auto;grid-template-rows:auto auto;align-items:center;column-gap:6px;row-gap:2px;min-height:44px;border-radius:10px;" +
      "border:1px dashed var(--line-dim);background:#1a1410;padding:4px 6px;width:100%;text-align:left;color:inherit;font:inherit}" +
      ".consume-slot.has-item{border-style:solid;cursor:pointer}" +
      ".consume-slot.locked{opacity:.72}" +
      ".consume-slot .slot-lab{grid-column:1 / -1;font-size:10px;color:var(--muted);line-height:1}" +
      ".consume-slot .slot-ico{grid-column:1;grid-row:2;width:28px;height:28px;display:flex;align-items:center;justify-content:center}" +
      ".consume-slot .consume-name{grid-column:2;grid-row:2;min-width:0;font-size:12px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".consume-slot .consume-lvl{grid-column:3;grid-row:2;font-size:12px;font-weight:600;color:var(--ember-2,#e39a45)}" +
      ".item-flag{font-size:11px;margin:2px 0}" +
      ".item-flag.consume{color:var(--ember-2,#e39a45)}" +
      ".item-flag.dormant{color:#c4b089}" +
      ".item-flag.remnant{color:#9ad8ff}" +
      ".item-flag.milestone{color:#ffe7a0}";
    document.head.appendChild(st);
  }

  function icon(item, state) {
    if (item && typeof root.ASHBOUND !== "undefined") {
      try { /* filled by hook html from the game's bt() if provided */ } catch (e) {}
    }
    return item ? "◆" : "○";
  }

  function consumeSlotHtml(state, hooks) {
    style();
    hooks = hooks || {};
    const player = state && state.player;
    if (!player) return "";
    if (root.ABCraft && ABCraft.ensurePlayer) ABCraft.ensurePlayer(player);
    const item = player.consume;
    const unlocked = !!player.consumeUnlocked;
    const selected = state.ui && state.ui.selected && item && state.ui.selected.uid === item.uid;
    const lvl = item ? (item.consumeLevel || 0) : 0;
    const cap = (root.ABCraft && ABCraft.consumeCfg && ABCraft.consumeCfg().cap) || 20;
    if (!item) {
      const lab = unlocked ? "Consume" : "Consume · locked";
      const title = unlocked ? "Consume slot (empty)" : "Consume slot locked. Needs Heart-Cinder.";
      return '<div class="consume-slot-wrap"><div class="consume-slot' + (unlocked ? "" : " locked") + '" title="' + R(title) + '">' +
        '<span class="slot-lab">' + R(lab) + '</span>' +
        '<span class="consume-name muted">' + (unlocked ? "Empty" : "Heart-Cinder to open") + "</span></div></div>";
    }
    const name = item.name || "Unique";
    const cls = "consume-slot has-item" + (selected ? " is-sel" : "") + (hooks.cssClass ? (" " + hooks.cssClass(item)) : "");
    const ico = hooks.icon ? hooks.icon(item) : icon(item);
    const pip = hooks.pip ? hooks.pip(item) : "";
    return '<div class="consume-slot-wrap"><button type="button" class="' + cls + '" data-act="select-item" data-uid="' + R(item.uid) + '" data-from="consume" title="' + R(name) + ' · consume +' + lvl + '">' +
      '<span class="slot-lab">Consume</span>' +
      '<span class="slot-ico">' + ico + "</span>" +
      pip +
      '<span class="consume-name">' + R(name) + "</span>" +
      '<span class="consume-lvl">+' + lvl + (lvl >= cap ? "" : "") + "</span>" +
      "</button></div>";
  }

  function itemFlagsHtml(item, player) {
    if (!item) return "";
    const bits = [];
    const cur = player && player.consume;
    if (cur && cur.uid === item.uid) bits.push('<div class="item-flag consume">Consumed · +' + (item.consumeLevel || 0) + "</div>");
    else if (item.dormant) bits.push('<div class="item-flag dormant">Dormant · +' + (item.consumeLevel || 0) + " kept</div>");
    if (root.ABCraft && player) {
      const key = ABCraft.uniqueKey && ABCraft.uniqueKey(item);
      if (key && ABCraft.remnantActive && ABCraft.remnantActive(player, key)) {
        bits.push('<div class="item-flag remnant">Remnant (this unique) is on this hero</div>');
      }
    }
    if (root.ABCraft && ABCraft.isUnique && ABCraft.isUnique(item) && !(cur && cur.uid === item.uid) && !item.dormant) {
      if (!(player && player.consumeUnlocked)) {
        var hint = (ABCraft.consumeCfg && ABCraft.consumeCfg() && ABCraft.consumeCfg().hint) || "A unique can be consumed once this hero has Heart-Cinder.";
        bits.push('<div class="item-flag consume-hint">' + R(hint) + "</div>");
      }
    }
    const ench = item.enchantLevel || 0;
    const cons = (cur && cur.uid === item.uid) ? (item.consumeLevel || 0) : 0;
    const ms = [ench >= 5 ? "enchant +" + ench : null, cons >= 5 ? "consume +" + cons : null].filter(Boolean);
    if (ms.length) bits.push('<div class="item-flag milestone">Unlocked ' + ms.join(" · ") + "</div>");
    return bits.join("");
  }

  function itemActions(item, where, state) {
    if (!item || !root.ABCraft) return { pin: "", extra: "" };
    const player = state && state.player;
    const pin = [];
    const extra = [];
    if (where === "consume") {
      pin.push('<button class="btn slim" data-act="consume-sleep">Put to sleep</button>');
    } else if (item.dormant) {
      pin.push('<button class="btn slim primary" data-act="consume-awaken">Awaken (Wake-Oil)</button>');
    } else if (player && (where === "inventory" || where === "stash" || where === "equip" || where === "cube")) {
      const check = ABCraft.canConsume(item, player);
      if (check && check.ok) {
        pin.push('<button class="btn slim primary" data-act="consume-into">Consume</button>');
      }
    }
    return { pin: pin.join(""), extra: extra.join("") };
  }

  function handleAct(act, data, state, hooks) {
    hooks = hooks || {};
    if (!root.ABCraft || !state || !state.player) return null;
    const acts = { "consume-into": 1, "consume-sleep": 1, "consume-awaken": 1, "consume-unlock": 1 };
    if (!acts[act]) return null;
    const player = state.player;
    ABCraft.ensurePlayer(player);
    function selected() {
      if (hooks.selected) return hooks.selected();
      const uid = state.ui && state.ui.selected && state.ui.selected.uid;
      if (player.consume && (!uid || player.consume.uid === uid)) return player.consume;
      if (hooks.find) {
        const hit = hooks.find(uid);
        return hit && hit.item ? hit.item : null;
      }
      return null;
    }
    let result;
    if (act === "consume-unlock") {
      result = ABCraft.unlockConsume(player, Object.assign({ recipes: hooks.recipes }, hooks));
    } else if (act === "consume-into") {
      const item = selected();
      result = ABCraft.consumeInto(player, item, hooks);
    } else if (act === "consume-sleep") {
      result = ABCraft.sleepConsume(player, hooks);
    } else if (act === "consume-awaken") {
      const item = selected();
      result = ABCraft.awakenConsume(player, item, hooks);
    }
    if (!result) return { toast: "Nothing happened.", kind: "bad" };
    if (hooks.recalc) hooks.recalc();
    return result.ok
      ? { toast: result.already ? "The consume slot is already open." : (act === "consume-sleep" ? "The unique sleeps. A remnant stays with you." : act === "consume-awaken" ? "The unique is awake." : act === "consume-unlock" ? "The consume slot is open." : "Consumed."), kind: "good" }
      : { toast: result.reason || "That didn't work.", kind: "bad" };
  }

  root.ABConsume = { consumeSlotHtml: consumeSlotHtml, itemFlagsHtml: itemFlagsHtml, itemActions: itemActions, handleAct: handleAct, style: style };
  if (root.ABCraft) {
    root.ABCraft.consumeSlotHtml = consumeSlotHtml;
    root.ABCraft.itemFlagsHtml = itemFlagsHtml;
    root.ABCraft.itemActions = function (item, where, state) { return itemActions(item, where, state); };
    root.ABCraft.handleAct = handleAct;
  }
})(typeof window !== "undefined" ? window : self);
