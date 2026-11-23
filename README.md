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
6. Do not upload, and do not edit the live site. When a milestone is stable, build a staging copy (`STAGING: true`, `ashbound-staging:` storage prefix, TEST icons, manifest name “Ashbound TEST”) into `../staging-upload/`.

Local serve (this folder): `python3 -m http.server 8907`

## Files

| File | What it is |
|------|------------|
| `index.html` | The game: styles and game code. Loads data files at boot. |
| `js/ab-data.js` | Fetches the data files below before the game starts. |
| `js/ab-bus.js` | Shared event bus (`ABBus.on` / `ABBus.emit`). Combat, AI, rendering, and save should talk through this or other small wrappers, not by calling each other. |
| `js/ab-physics.js` | Crowd physics (spatial hash, separation, rings, shove). Attaches with `{ dist, move, getTune }` so it does not close over game state. |
| `js/ab-save.js` | Narrow save DTO (`ABSave.toDTO` / `migrate`). Writes `SAVE_VERSION` 4. Does not snapshot live combat objects by reference; mid-fight load still works. |
| `js/ab-ai.js` | AI tick entry and helpers (`ABAI.tick`, active cap, LOD chase). Attaches with `{ dist, move, getTune, tick }` so it does not close over `o`. |
| `js/ab-render.js` | Thin render/baker interface (`ABRender`). The baker still pumps off the game frame; this is the seam to lift rendering later. |
| `data/tune.json` | Playtest tuning (`AB_TUNE`): speeds, HP/damage multipliers, melee cone, shove caps. |
| `data/models.json` | 3D character models (also kept as `src3d/models.json`). |
| `data/classes.json` | Classes and skill branches. |
| `data/skills.json` | Skill definitions and in-game skill text. |
| `data/content.json` | Quests, zones, bargains, shrines, hirelings, difficulties, runes/runewords, named-spawn and boss lines, stat-help text. |
| `data/monsters.json` | Monster catalog, monster affixes, and the four boss defs. |
| `data/items.json` | Item bases, uniques, sets, prefixes/suffixes, materials, rarity, and related frozen item data. Do not change values unless a later step names it. |
| `data/telling.json` | Narrated pages for The telling (title button). Edit the stills and lines here, not in the game code. |
| `data/characters.json` | Character bible for later use. Loaded at boot, no gameplay effect. |
| `data/npc-lines.json` | NPC idle barks, first-greet lines by act and class, and side-quest offer/waiting/thanks text. Edit here, not in the game code. |
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
- **Character looks, proportions, colours, materials, animation speeds:** edit `data/models.json` (source copy: `src3d/models.json`). `types.<name>.parts` maps body parts to a palette slot (`m` body, `a` accent, `f` skin, `w` metal, `b` dark accent, `n` deep shade) or a `#hex` colour, plus a material (`cloth`, `leather`, `metal`, `skin`, `fur`, `stone`, `bone`, `wood`, `glow`). `anim.*` holds the frame counts and swings; `anim.walk/run.cycleTiles` sets how far one step cycle travels, which keeps feet from sliding.
- **Camera zoom / character size:** `camera.unitsPerTile` in the models data (bigger number = smaller characters). World zoom is `Na()` in the game code.
- **Model kinds:** biped and quad, plus `moth`, `wisp`, `crawler`, `serpent`, `drake`, `shade`, `maw`, `bellward`. Bosses and town folk use `extends` to start from another type and change only what differs.
- **Shading:** `light.aoStrength`, `light.contactBase` / `light.contactFoot`, `camera.outline` ([r,g,b,alpha]; delete it to turn the edge off).
- **Render cost:** `camera.budgetMs` (ms per game frame spent rendering new character frames).
- **Graphics option:** Menu → Graphics: High/Low (Low = cheap lighting and a 2x render cap). Changing Low/High must go through `qo()` so the canvas dpr updates (Low dpr 2, High dpr 3).
- **The telling:** Title → The telling. Skippable narrated pages from `data/telling.json`, same panel styling as the rest of the menus. A video or image list in `window.ASHBOUND_INTRO` still overrides this if set.
- **Targeting option:** Menu → Settings → Targeting: Closest (default), Lowest health, Highest max health, or Facing direction. Saved with the other settings under the existing storage prefix. Picks go through `abPickTarget(mode, candidates, player)`.
- **New release:** bump `VERSION` in `config.js` so phones pick up the new files. This r7 line starts on v55 behavior; bump when a milestone is built for staging.
- **Staging vs live:** the same files are used for both. Only `config.js` changes (`STAGING: true` adds the small STAGING badge, the `ashbound-staging:` storage prefix and its own cache). Staging icons and the manifest name also differ.

## Do NOT touch (frozen)

- Crafting, the cube, transmute, and item rolls/tiers/stats.
- The save format (`ashbound.save.N`, `SAVE_VERSION 4`) unless you add a migration. Old saves must keep loading.
- Storage key names, and the staging prefix logic in `abStore()`.
- Inventory capacity.

## Architecture rule (Scott, Nov 22)

Keep systems loosely coupled. Combat, AI, rendering and save must not call each other directly. They talk through small, simple interfaces (the `ABBus` event bus in `js/ab-bus.js`, or wrapper functions that hide internals), so any piece can later be lifted out into an engine without dragging the rest of the game along. Save goes through `ABSave.toDTO` in `js/ab-save.js` (version 4, no live-object snapshot). `hitStop` no longer returns out of the main `Cr()` tick: time, particles, floats, AI movement, and save keep running, while new attacks, projectiles, dots, and telegraphs wait. Combat applies hits and deaths, then emits `combat:miss`, `combat:hit`, `combat:playerHurt`, and `combat:killed`; FX, XP, loot, and save subscribe instead of being called from the damage function.

v55 still closes over one live state object `o`. New targeting already goes through `abPickTarget`. The overhaul unwinds the rest in small steps. The current couplings are listed in `PLAN-3d.md` and [STRESS-v54.md](STRESS-v54.md).

## Tests

See `TESTS.md`. Scripts are in `tests/`. Baseline: `tests/r5_ai.py` and `tests/r6_v55.py` against `http://127.0.0.1:8907/index.html`. Stress: [STRESS-v55.md](STRESS-v55.md), [STRESS-v54.md](STRESS-v54.md).

## Overhaul (r7)

Work one change at a time. Planned order: (1) this scaffold, (2) move tuning, content, and text into data/config files, (3) approved Koto text plus class-named last-revive lines in lore and game text, (4) “The telling” as a skippable narrated screen from a data file, and `characters.json` in `data/` with no gameplay effect, (5) crowd separation, off-frame/worker baker, active-monster cap, and targeting hold-to-walk / in-range latch, (6) small modules and loose-coupling interfaces. Staging copies are built at those milestones; nothing goes live from here.
