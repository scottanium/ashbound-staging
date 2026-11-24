# Ashbound

A pocket action-RPG (Diablo-style) that runs in the browser and installs as an iPhone home-screen app. Everything lives in a flat bundle with no server and no accounts. Saves are kept in the browser on the device.

Read this file first before changing anything.

- Live: https://scottanium.github.io/ashbound/  (do not upload from this folder)
- Staging (test site, its own saves): https://scottanium.github.io/ashbound-staging/

This folder is **r7**, an overhaul of **r6 / v55**. Until a later step says otherwise, in-game behavior must stay the same as v55 except for the change you are making. Live is never touched from here. Staging files are built into `/workspace/ashbound-overhaul/staging-upload/` at stable milestones; a person, not a bot, uploads them.

## How to change things

1. Read this README, then `TESTS.md`.
2. Take a restore point (a git commit in this folder, or a dated copy) **before** the change.
3. Make **one** named change. Patch only that part.
4. Run the tests in `TESTS.md` that cover it. The baseline for r7 is `tests/r5_ai.py` and `tests/r6_v55.py`. Behavior must stay v55 except for the intended fix.
5. Do not put secrets in the code, data files, or comments. There are no accounts and no keys in this project.
6. Do not upload, and do not edit the live site. When a milestone is stable, build a staging copy (`STAGING: true`, storage prefix `ashbound-staging-v71:` from v71 on so older `ashbound-staging:` keys stay unused in the browser, TEST icons, manifest name “Ashbound TEST”) into `../up72/` (and `../staging-upload/` at upload time).

Local serve (this folder): `python3 -m http.server 8907`

## Files

| File | What it is |
|------|------------|
| `index.html` | The game: styles and game code. Loads data files at boot. |
| `js/ab-data.js` | Fetches the data files below before the game starts. |
| `js/ab-feel.js` | v72 feel helpers (`ABFeel`). Combat and movement read numbers from `data/feel.json` through this surface. |
| `js/ab-bus.js` | Shared event bus (`ABBus.on` / `ABBus.emit`). Combat, AI, rendering, and save should talk through this or other small wrappers, not by calling each other. |
| `js/ab-physics.js` | Crowd physics (spatial hash, separation, rings, shove). Attaches with `{ dist, move, getTune }` so it does not close over game state. |
| `js/ab-save.js` | Narrow save DTO (`ABSave.toDTO` / `migrate`). Writes `SAVE_VERSION` 5. v1–v4 saves still load and then map items to the eight ranks. Does not snapshot live combat objects by reference; mid-fight load still works. |
| `js/ab-craft.js` | Phase A rarity and tier helpers (`ABCraft`). Combat, AI, and render do not import this module. New strings live in `data/rarity.json`. |
| `js/ab-ai.js` | AI tick entry and helpers (`ABAI.tick`, active cap, LOD chase). Attaches with `{ dist, move, getTune, tick }` so it does not close over `o`. |
| `js/ab-render.js` | Thin render/baker interface (`ABRender`). The baker still pumps off the game frame; this is the seam to lift rendering later. |
| `data/tune.json` | Playtest tuning (`AB_TUNE`): speeds, HP/damage multipliers, melee cone, shove caps. |
| `data/feel.json` | v72 timing and feel (`ABFeel` in `js/ab-feel.js`): attack/hit timing, run/walk multipliers, accel/decel, stamina, built-in boot run speed by rarity, and FRW affix caps. |
| `data/models.json` | 3D character models (also kept as `src3d/models.json`). |
| `data/classes.json` | Classes and skill branches. |
| `data/skills.json` | Skill definitions and in-game skill text. |
| `data/content.json` | Quests, zones, bargains, shrines, hirelings, difficulties, runes/runewords, named-spawn and boss lines, stat-help text. |
| `data/monsters.json` | Monster catalog, monster affixes, and the four boss defs. |
| `data/items.json` | Item bases, uniques, sets, prefixes/suffixes, materials, gold rarity map, and `baseRarity` floors on uniques and sets. Do not retune numeric mods unless a later step names it. |
| `data/rarity.json` | Eight-rank table (Common through Mythical): names, colors, pips, rank numbers, affix counts, and placeholder strings for Koto. |
| `data/telling.json` | Narrated pages for The telling (title button). Edit the stills and lines here, not in the game code. |
| `data/characters.json` | Character bible for later use. Loaded at boot, no gameplay effect. |
| `data/npc-lines.json` | NPC idle barks, first-greet lines by act and class, side-quest offer/waiting/thanks, act/class coach and town-entry lines (`coach`), and act intro/end story cards (`story`). Edit here, not in the game code. |
| `config.js` | The only file that should differ between live and staging (`STAGING: false/true`, `VERSION`, storage prefix). No secrets. |
| `sw.js` | Offline cache. The cache name comes from `config.js` (`ashbound-pages-vNN` live, `ashbound-staging-vNN` staging). |
| `manifest.webmanifest`, `icon-*.png` | Home-screen install info and icons. Staging uses TEST icons and the name “Ashbound TEST”. |
| `src3d/` | Source copy of 3D models and renderer. Prefer editing models data, not a one-off patch in the bundle. |
| `tests/` | Rerunnable Playwright checks. See `TESTS.md`. |
| `TESTS.md` | The checklist every change should be able to rerun. |
| `PLAN-3d.md` | 3D plan plus the architecture rule and overhaul notes. |
| `STRESS-v54.md`, `STRESS-v55.md` | Pack, collision, baker, and endurance findings. |

Edit the JSON under `data/`, then reload. Do not paste a second copy of the same table back into `index.html`. The service worker caches these files; bump `VERSION` in `config.js` when they change so phones pick up the new records.

## Changing common things

- **Playtest tuning (from v55):** `data/tune.json` holds monster speed caps (`normalMax` 2.52, 56% of run 4.5; `heavyMax` 1.65), monster HP (`hpMul` 1, the v52 values) and monster damage (`dmgMul` 1.18), player `playerApsMul` 1.25 and `playerDmgMul` 0.88, melee cone (`meleeArc` 1.56 rad, `meleeReach` 1.15) and the stop distance (`meleeStop` 0.88). Ordinary melee monsters stop at that hold and do not push the player; heavies, golems, chargers/leapers and bosses may shove lightly. The player still does not shove monsters, but can slide out if surrounded.
- **Timing and feel (v72):** `data/feel.json` holds attack swing/recovery and hit pause/flash/impact, movement (`runMul` 0.85 so run is ~15% slower than the sheet, `walkMul` 0.4 of run, accel/decel), D2-style stamina (max = maxBase + Vitality × perVitality, drain while running outside town, forced walk until resumeFrac), built-in boot moveSpeed by rarity (5% Common through 40% Mythical), and the FRW affix caps (Fleet 8% boots / 5% rings, of the Path 15%, total cap 80%). Paragon +1% move speed per 10 levels is not built yet (no paragon). `tune.json` `runRef` 4.5 stays the monster-speed reference.
- **HUD and audio (v72):** Strike is 22% larger with even-spaced skill slots (`data/ui.json` `arc`). Optional overhead health/mana bars (Settings, default off). Life and mana orbs sit near the bottom centre. The generic load-in drone is off by default (`data/feel.json` `audio`). A speaker-icon mute button sits beside the minimap and is also in Settings.
- **Main stat (v72):** each class has a D3-style `mainStat` in `data/classes.json`. Crit (0.08%/pt) and armor defense (0.15%/pt) come from that stat. Dexterity still grants attack rating for every class. Energy casters (Reed Caller, Bell Chanter) get spell damage %/pt on the existing `edmg` (enhancedDamage) sheet stat instead of armor defense, and they keep crit. Staging Test Tools can spawn 1/5/10 random maxed Mythical-tier uniques or set pieces (best defense and full sockets; there is no separate awakened flag).
- **Item tooltips, sets, and rarity colors (v75):** hovering an item on a mouse or trackpad shows the entire tooltip (name, rarity, stats, affixes, unique effects, set name, worn pieces, and every set bonus tier, with active tiers lit). The tip stays on screen without an inner scroll. On touch, a tap shows the same card as an overlay, on top of the existing details pane. The Stats tab lists worn sets. A maxed Mythical unique keeps its rank through save/reload. Rarity colors live in `data/rarity.json` (Magic light blue, Elite darker blue, Epic orange, Legendary red, Fabled and Mythical purple; Mythical also has a gold outline). Common and Rare are unchanged.
- **XP, skills, and Paragon (v74):** monster and boss XP is ×2.85 so a normal full campaign clear ends around level 50 (the level curve itself is unchanged). You get 2 skill points per level (100 by 50, enough to max five skills at rank 20). There are no synergies. After 50, Paragon goes to a hard cap of 100: 5 spendable stat points each level (500 at the cap), 20 skill points by 100, +2 life per level, and +1% move speed every 10 Paragon levels on top of the 80% boot cap. The HUD and Stats tab show your Paragon level. Old saves keep their level and get the extra skill points once. Tuning is in `data/progress.json`.
- **Landscape-only (v73):** the game plays in landscape on phones (including small-phone landscape) and on desktop. Portrait phones get a full-screen “Rotate your phone” overlay; the game is paused and input is blocked until the phone is turned. The manifest asks for landscape, and a standalone or fullscreen session tries `screen.orientation.lock('landscape')` (errors ignored). HUD and inventory data keep desktop and phoneLandscape profiles only.
- **Character looks, proportions, colours, materials, animation speeds:** edit `data/models.json` (source copy: `src3d/models.json`). `types.<name>.parts` maps body parts to a palette slot (`m` body, `a` accent, `f` skin, `w` metal, `b` dark accent, `n` deep shade) or a `#hex` colour, plus a material (`cloth`, `leather`, `metal`, `skin`, `fur`, `stone`, `bone`, `wood`, `glow`). `anim.*` holds the frame counts and swings; `anim.walk/run.cycleTiles` sets how far one step cycle travels, which keeps feet from sliding.
- **Camera zoom / character size:** `camera.unitsPerTile` in the models data (bigger number = smaller characters). World zoom is `Na()` in the game code.
- **Model kinds:** biped and quad, plus `moth`, `wisp`, `crawler`, `serpent`, `drake`, `shade`, `maw`, `bellward`. Bosses and town folk use `extends` to start from another type and change only what differs.
- **Shading:** `light.aoStrength`, `light.contactBase` / `light.contactFoot`, `camera.outline` ([r,g,b,alpha]; delete it to turn the edge off).
- **Render cost:** `camera.budgetMs` (ms per game frame spent rendering new character frames).
- **Graphics option:** Menu → Graphics: High/Low (Low = cheap lighting and a 2x render cap). Changing Low/High must go through `qo()` so the canvas dpr updates (Low dpr 2, High dpr 3).
- **The telling:** Title → The telling. Skippable narrated pages from `data/telling.json`, same panel styling as the rest of the menus. A video or image list in `window.ASHBOUND_INTRO` still overrides this if set.
- **Targeting option:** Menu → Settings → Targeting: Closest (default), Lowest health, Highest max health, or Facing direction. Saved with the other settings under the existing storage prefix. Picks go through `abPickTarget(mode, candidates, player)`.
- **New release:** bump `VERSION` in `config.js` so phones pick up the new files. This r7 line starts on v55 behavior; bump when a milestone is built for staging.
- **Staging vs live:** the same files are used for both. Only `config.js` changes (`STAGING: true` adds the small STAGING badge, the storage prefix — `ashbound-staging-v71:` from v71, leaving older `ashbound-staging:` keys untouched — and its own cache). The live-shaped copy in this folder stays `STAGING: false`. Staging icons and the manifest name also differ. Source for the staging file: `config.staging.js`.

## Do NOT touch (frozen)

- Existing unique/set numeric mods and item-roll weights in `data/items.json`, except when a named step changes them. Later craft work belongs in `js/ab-craft.js` and `data/*.json`. Combat, AI, and render must not import craft internals.
- The save format (`ashbound.save.N`, `SAVE_VERSION` 5) unless you add a migration. v1–v4 saves must keep loading and map items onto the eight ranks.
- Storage key names, and the staging prefix logic in `abStore()`.
- Inventory capacity.

## Architecture rule (Scott, Nov 22)

Keep systems loosely coupled. Combat, AI, rendering and save must not call each other directly. They talk through small, simple interfaces (the `ABBus` event bus in `js/ab-bus.js`, or wrapper functions that hide internals), so any piece can later be lifted out into an engine without dragging the rest of the game along. Save goes through `ABSave.toDTO` in `js/ab-save.js` (version 5, no live-object snapshot). Item rank display and v4→v5 item mapping go through `ABCraft` in `js/ab-craft.js`, looked up at call time so other modules do not import craft internals. `hitStop` no longer returns out of the main `Cr()` tick: time, particles, floats, AI movement, and save keep running, while new attacks, projectiles, dots, and telegraphs wait. Combat applies hits and deaths, then emits `combat:miss`, `combat:hit`, `combat:playerHurt`, and `combat:killed`; FX, XP, loot, and save subscribe instead of being called from the damage function.

v55 still closes over one live state object `o`. New targeting already goes through `abPickTarget`. The overhaul unwinds the rest in small steps. The current couplings are listed in `PLAN-3d.md` and [STRESS-v54.md](STRESS-v54.md).

## Tests

See `TESTS.md`. Scripts are in `tests/`. v75: full item tooltips, Stats sets, Test Tools labels, mythic persist, rarity colors (`r7_version`, `r7_itemtip`, `r7_sets_stats`, `r7_testtools`, `r7_mythic_persist`, `r7_rarity_colors`). v74: XP, skills and Paragon (`r7_version`, `r7_progress`, `r7_mainstat`, `r7_campaign_scale`). v73: landscape-only on phones (`r7_version`, `r7_rotate`). v72: timing and feel (`r7_hitfeel`, `r7_runspeed`, `r7_stamina`, `r7_movespeed`); HUD (`r7_bigstrike`, `r7_overheadbars`, `r7_hudlayout`, `r7_mutebtn`); silenced load-in sound (`r7_loadsound`); Test Tools maxed mythic/set spawns (`r7_testtools`); Stats tab armor-defense percent and hideZero (`r7_statstab`); D3-style mainStat (`r7_mainstat`). Staging storage prefix stays `ashbound-staging-v71:`. v71: first-quest guidance, north-wall town gate, no identify, skill-slot arc, skill-tree rails, rune tooltips, monster count, Stats tab, staging-only Test Tools, and richer baked character art from `data/models.json` (`rich.enabled`, per-type `detail` flags; `tests/r7_charart.py`). Staging storage prefix is `ashbound-staging-v71:`. v70: item icons, ground loot icons, 3D props, UI polish (`data/icons.json` + `js/ab-icons.js`, `data/props3d.json` + `js/ab-props3d.js`, `data/ui.json` + `js/ab-ui.js`; delete a data file and that part falls back to the v69 look). v69: XP x1 and a mob density ramp (`data/difficulty.json`). v68: iso performance (pre-tilted ground, cheap far crowd) and solid 3D town props; settings in `data/camera.json` (`pretiltGround`, `pretiltTexel`, `crowd.inactiveFull`). v67: isometric 2.5D camera (settings in `data/camera.json`, `?flat=1` for the old view; `tests/r7_iso_camera.py`, `tests/r7_iso_perf.py`) and 3D class previews on character creation (`tests/r7_create_3d.py`). v62: the skill-point coach tip is visible again; learning an active skill still puts it on the bar; pressing an empty hotkey opens Skills. v66: Koto full text pass applied (`tests/r7_text_pass.py`). v65: Gear sheet redesign, sizes in `data/inventory-layout.json` (`tests/r7_inventory_layout.py`). v64: 3D frames bake again (a duplicate `ab3Cap` name broke every biped bake; `?debug3d=1` shows baked vs pixel counts, `tests/r7_3d_mobile.py`). v64: skills, flasks and Use fire on finger-down, so a skill works while the move stick is held (`tests/r7_move_cast.py`). v63: campaign monster life and XP start at a quarter in Cinderwood and rise by zone to full strength at The First Kiln (`data/difficulty.json`); rifts stay at the base. Baseline: `tests/r5_ai.py` and `tests/r6_v55.py` against `http://127.0.0.1:8907/index.html`. Stress: [STRESS-v55.md](STRESS-v55.md), [STRESS-v54.md](STRESS-v54.md).

## Overhaul (r7)

Work one change at a time. Planned order: (1) this scaffold, (2) move tuning, content, and text into data/config files, (3) approved Koto text plus class-named last-revive lines in lore and game text, (4) “The telling” as a skippable narrated screen from a data file, and `characters.json` in `data/` with no gameplay effect, (5) crowd separation, off-frame/worker baker, active-monster cap, and targeting hold-to-walk / in-range latch, (6) small modules and loose-coupling interfaces. Staging copies are built at those milestones; nothing goes live from here.
