# Ashbound

A pocket action-RPG (Diablo-style) that runs in the browser and installs as an iPhone home-screen app. Everything lives in a flat bundle with no server and no accounts. Saves are kept in the browser on the device.

- Live: https://scottanium.github.io/ashbound/
- Staging (test site, its own saves): https://scottanium.github.io/ashbound-staging/

## Files
| File | What it is |
|------|------------|
| `index.html` | The whole game: styles, game code, and the `ab-models` data section (3D character models). |
| `config.js` | The only file that differs between live and staging (`STAGING: false/true`). |
| `sw.js` | Offline cache. The cache name comes from `config.js` (`ashbound-pages-vNN` live, `ashbound-staging-vNN` staging). This build is v55. |
| `manifest.webmanifest`, `icon-*.png` | Home-screen install info and icons. |

## Changing common things
- **Character looks, proportions, colours, materials, animation speeds:** edit the `<script type="application/json" id="ab-models">` block in `index.html` (source copy: `src3d/models.json`). `types.<name>.parts` maps body parts to a palette slot (`m` body, `a` accent, `f` skin, `w` metal, `b` dark accent, `n` deep shade) or a `#hex` colour, plus a material (`cloth`, `leather`, `metal`, `skin`, `fur`, `stone`, `bone`, `wood`, `glow`). `anim.*` holds the frame counts and swings; `anim.walk/run.cycleTiles` sets how far one step cycle travels, which keeps feet from sliding.
- **Camera zoom / character size:** `camera.unitsPerTile` in the models data (bigger number = smaller characters). World zoom is `Na()` in the game code.
- **Model kinds (r3):** biped and quad as in r2c, plus `moth`, `wisp`, `crawler`, `serpent`, `drake`, `shade`, `maw`, `bellward`. Bosses (Veyra, Morra, Sallow, Mael) add unique `detail` flags (`flameCrown`, `bellSkirt`, `branchCrown`, `greatHelm`, …). Each type in the models data has a `detail` block (on/off flags: `taper`, `armor`, `belt`, `pauldron`, `cuffs`, `face`, `cape`, `muscles`, `brute`, `loincloth`, `chunky`, `fur` (number of tufts), `mane`, `hooves`) and an optional `gaitFx` block (`sway`, `stomp`, `roll`, `pitch`). Bosses and town folk use `extends` to start from another type and change only what differs.
- **Shading:** `light.aoStrength` (crevice darkening), `light.contactBase` / `light.contactFoot` (darkening near the ground), `camera.outline` ([r,g,b,alpha] of the thin dark edge that keeps characters readable on dark floors; delete it to turn the edge off).
- **Render cost:** `camera.budgetMs` (ms per game frame spent rendering new character frames).
- **Graphics option:** Menu → Graphics: High/Low (Low = cheap lighting and a 2x render cap).
- **Targeting option:** Menu → Settings → Targeting: Closest (default), Lowest health, Highest max health, or Facing direction. Saved with the other settings under the existing storage prefix.
- **Playtest tuning (r6 / v55):** the `AB_TUNE` object in `index.html` holds monster speed caps (`normalMax` 2.52, 56% of run 4.5; `heavyMax` 1.65), monster HP (`hpMul` 1, the v52 values — the r4 ×1.20 is gone) and monster damage (`dmgMul` 1.18), player `playerApsMul` 1.25 and `playerDmgMul` 0.88, melee cone (`meleeArc` 1.56 rad, `meleeReach` 1.15) and the stop distance (`meleeStop` 0.88). Ordinary melee monsters stop at that hold and do not push the player; heavies, golems, chargers/leapers and bosses may shove lightly. The player still does not shove monsters, but can slide out if surrounded. Inventory cell size for short landscape is in the CSS (`--cell` on `.gear-bag .grid`).
- **New release:** bump `VERSION` in `config.js` so phones pick up the new files.
- **Staging vs live:** the same files are used for both. Only `config.js` changes (`STAGING: true` adds the small STAGING badge, the `ashbound-staging:` storage prefix and its own cache).

## Do NOT touch (frozen)
- Crafting, the cube, transmute, and item rolls/tiers/stats.
- The save format (`ashbound.save.N`, `SAVE_VERSION 4`). Old saves must keep loading.
- Storage key names, and the staging prefix logic in `abStore()`.

## Tests
See `TESTS.md`. Scripts are in `tests/`. v55 checks: `tests/r6_v55.py`. v54 stress notes (unchanged in this pass): [STRESS-v54.md](STRESS-v54.md).

## Architecture rule (Scott, Nov 22)

Keep systems loosely coupled. Combat, AI, rendering and save must not call each other directly. They talk through small, simple interfaces (events/messages or wrapper functions that hide internals), so any piece can later be lifted out into an engine without dragging the rest of the game along.

This is a target for the overhaul. v55 does not refactor the bundle, but new targeting goes through one small function, `abPickTarget(mode, candidates, player)`, so the menu mode is not copied into combat and skill code.

### Current couplings to unwind (from the v54 bundle + stress findings)

The full write-up with numbers is in [STRESS-v54.md](STRESS-v54.md). Short list:

- The whole game is one `index.html` bundle that closes over a single live state object `o`. Combat, AI, movement, loot, quests, UI, audio, the 3D baker, and save all read and write that object directly.
- Damage handling (`D()`) is a kitchen sink: hit-stop, floating numbers, particles, sound, poison, knockback, quest kills, death, XP / level-up, and loot.
- The monster tick (`Js()`) runs AI, auras (which deal damage), boss phases, collision, and death cleanup in one loop. Under a dense pack this shows up as jitter, doorway jams, and monsters occupying the same tile (collision is O(n²) and is not a separate physics step). AI (`al()`) calls melee / ranged attack functions that immediately deal damage or spawn projectiles.
- The main loop (`Cr()`) mixes particles, toasts, the save timer, and combat / AI ticks. `hitStop` pauses the entire simulation, including AI and movement.
- The draw path (`fo()` / `ab3Pump()`) reads combat fields directly (swing, flash, floats, effects, telegraphs, loot, HP). The 3D baker is pumped from the same frame as world draw, so entity count and first-seen models hitch the game frame. The v54 stress run saw the bake queue climb to ~2,500 jobs (each bake ~16 ms vs a 5 ms budget) and the JS heap grow by ~250 MB over three minutes as frames were cached.
- Save (`ne()` / `dr()` / `mr()`) is called from the game loop, input handlers, and `beforeunload`. The blob is a snapshot of live combat / AI / world objects, so mid-fight save/load and zone changes carry those internals with them.

Don't refactor these now; treat the list as overhaul work.

## Stress test (v54)

[STRESS-v54.md](STRESS-v54.md) — headless playtests of dense packs (30 / 60 / 100+), collision, AI, zone travel, mid-fight save/load, and a 3-minute endurance run. Script: `tests/r5_stress.py`.
