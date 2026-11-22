# Ashbound

A pocket action-RPG (Diablo-style) that runs in the browser and installs as an iPhone home-screen app. Everything lives in a flat bundle with no server and no accounts. Saves are kept in the browser on the device.

- Live: https://scottanium.github.io/ashbound/
- Staging (test site, its own saves): https://scottanium.github.io/ashbound-staging/

## Files
| File | What it is |
|------|------------|
| `index.html` | The whole game: styles, game code, and the `ab-models` data section (3D character models). |
| `config.js` | The only file that differs between live and staging (`STAGING: false/true`). |
| `sw.js` | Offline cache. The cache name comes from `config.js` (`ashbound-pages-vNN` live, `ashbound-staging-vNN` staging). This build is v54. |
| `manifest.webmanifest`, `icon-*.png` | Home-screen install info and icons. |

## Changing common things
- **Character looks, proportions, colours, materials, animation speeds:** edit the `<script type="application/json" id="ab-models">` block in `index.html` (source copy: `src3d/models.json`). `types.<name>.parts` maps body parts to a palette slot (`m` body, `a` accent, `f` skin, `w` metal, `b` dark accent, `n` deep shade) or a `#hex` colour, plus a material (`cloth`, `leather`, `metal`, `skin`, `fur`, `stone`, `bone`, `wood`, `glow`). `anim.*` holds the frame counts and swings; `anim.walk/run.cycleTiles` sets how far one step cycle travels, which keeps feet from sliding.
- **Camera zoom / character size:** `camera.unitsPerTile` in the models data (bigger number = smaller characters). World zoom is `Na()` in the game code.
- **Model kinds (r3):** biped and quad as in r2c, plus `moth`, `wisp`, `crawler`, `serpent`, `drake`, `shade`, `maw`, `bellward`. Bosses (Veyra, Morra, Sallow, Mael) add unique `detail` flags (`flameCrown`, `bellSkirt`, `branchCrown`, `greatHelm`, …). Each type in the models data has a `detail` block (on/off flags: `taper`, `armor`, `belt`, `pauldron`, `cuffs`, `face`, `cape`, `muscles`, `brute`, `loincloth`, `chunky`, `fur` (number of tufts), `mane`, `hooves`) and an optional `gaitFx` block (`sway`, `stomp`, `roll`, `pitch`). Bosses and town folk use `extends` to start from another type and change only what differs.
- **Shading:** `light.aoStrength` (crevice darkening), `light.contactBase` / `light.contactFoot` (darkening near the ground), `camera.outline` ([r,g,b,alpha] of the thin dark edge that keeps characters readable on dark floors; delete it to turn the edge off).
- **Render cost:** `camera.budgetMs` (ms per game frame spent rendering new character frames).
- **Graphics option:** Menu → Graphics: High/Low (Low = cheap lighting and a 2x render cap).
- **Playtest tuning (r4):** the `AB_TUNE` object in `index.html` holds monster speed caps (`normalMax` 2.52, 56% of run 4.5; `heavyMax` 1.65), HP/damage multipliers, damage-number timing, drop-beam sizes, and swing duration. Player–monster overlap is resolved by stopping the player; the player never shoves a monster. Inventory cell size for short landscape is in the CSS (`--cell` on `.gear-bag .grid`).
- **New release:** bump `VERSION` in `config.js` so phones pick up the new files.
- **Staging vs live:** the same files are used for both. Only `config.js` changes (`STAGING: true` adds the small STAGING badge, the `ashbound-staging:` storage prefix and its own cache).

## Do NOT touch (frozen)
- Crafting, the cube, transmute, and item rolls/tiers/stats.
- The save format (`ashbound.save.N`, `SAVE_VERSION 4`). Old saves must keep loading.
- Storage key names, and the staging prefix logic in `abStore()`.

## Tests
See `TESTS.md`. Scripts are in `tests/`.
