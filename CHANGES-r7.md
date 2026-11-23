# Ashbound r7 (overhaul of r6 / v55)

Local only. Nothing uploaded, live not touched. Staging copies are built into `../staging-upload/` at stable milestones for a person to upload.

## Step 1 — scaffold

Copied r6 / v55 into this folder. `index.html`, `config.js`, `sw.js`, icons, and manifest are unchanged from v55. `VERSION` is still `"v55"` so this step is a true baseline.

- README explains how to change things, the frozen list, staging rules, and the architecture rule.
- `TESTS.md` is rerunnable against `http://127.0.0.1:8907/`. Baseline: `tests/r5_ai.py`, `tests/r6_v55.py`.
- Test script defaults point at this folder and port 8907.
- Restore points are git commits in this folder.

Behavior must match v55 until a later step names a change.


## Step 2 — data and config files

Moved tuning, content, and text tables out of `index.html` into `data/*.json`. The game fetches them at boot via `js/ab-data.js` and then starts as before. Values are the v55 tables; this step is a move, not a balance or wording change. Item-roll tables live in `data/items.json` and were not retuned.

`sw.js` precaches the data files and the loader so offline still works. `VERSION` is still `"v55"`.


## Step 3 — approved Koto text and named last-revives

`lore-rewrites.json` (2) and `rewrites.json` (40) were already present in the v55 game text (death-card kiln line, Glassmere capitalization, quest/skill/intro/UI wording). No old strings remained to replace.

`/workspace/ashbound-lore/LORE.md` (restore: `ashbound-writing/restore/LORE.md.20261122-2103`): applied the first three `rewrites-r4.json` edits after a uniqueness check. Did not apply `LORE.telling.last_stand` as written. The telling line now lists Last Coal (Cinder Warden), Last Reed (Reed Caller), Last Briar (Briar Stalker), Last Salt (Salt Reaver), and Last Bell (Bell Chanter). Class paragraphs use those names. Morra still “keeps the last bell under the water.” The five in-game skill names were not renamed. Branch about-text in `data/classes.json` now uses the same names.

## Step 4 — The telling, and characters.json for later

Title → The telling plays skippable narrated pages from `data/telling.json` (from Koto’s `the-telling.md`), in the existing cinematic panel styling. Skip or Done returns to the title. A film in `window.ASHBOUND_INTRO` still overrides. `data/characters.json` is loaded at boot and exported as `ASHBOUND.characters` with no gameplay effect. `SAVE_VERSION` is still 4. Test: `tests/r7_telling.py`.

## Step 5.1: targeting hold-to-walk and in-range latch

- `Bl(range)` (out-of-range hold-to-walk at 7.5 tiles) now picks through `abPickTarget` using the Settings targeting mode, still requiring line of sight. It used to always take the nearest living monster with LOS.
- `Ol()` latches `player.targetId` when an in-range hold hits, so the target stays sticky the same way a tap does (`El()` keeps that uid while it stays in melee range with LOS).
- Proven with `tests/r7_targeting.py` (all four modes: in-range first latch matches the mode pick; walk-in first latch matches `abPickTarget`, not nearest). `r5_ai` passed. `r6_v55` targeting and persist passed; cleave / `walk_away` / `stop_at_reach` still flake as on the v55 baseline.
- No `SAVE_VERSION` change.

## Step 5.2: crowd separation

- Monster-monster and monster-player overlap now resolve in one `abSeparate` pass per frame, using a cheap 1-tile spatial hash (the old per-monster O(n²) `Zs` call is no longer on the tick).
- Exact stacks unstick along a hashed angle. Melee chasers take slots on concentric rings around the player (about eight on the inner melee ring, more on outer rings) so a 40-pack is not packed onto one point.
- Heavies no longer shove the player from mere overlap. Attack shove is capped (`hitShove` 0.06, `shoveFrameCap` 0.03, `shoveSecCap` 0.12 in `data/tune.json`).
- Tests (`tests/r7_crowd.py`, High, 8s): 30 hounds still shift 0; stack-40 overlap pairs 34 (v55 was 780); mixed-30 shift 0.29 (v55 mixed packs were 1.4–3.8 tiles); run-through actually travels (~6 tiles vs v55 stuck at ~1.4). `r5_ai` passed. `r6_v55` no_push / no_overlap / stop_at_reach passed; `walk_away` still flakes as on the v55 baseline.
- No `SAVE_VERSION` change.

## Step 5.3: 3D baker off the game frame, bounded cache

- `ab3Pump` no longer runs inside the canvas draw (`fo`). Jobs are scheduled with `requestAnimationFrame` + `setTimeout(0)` so they run after paint. `stats3d().onFrameHits` stays 0 in the baker test.
- LRU eviction: `data/models.json` `camera.maxFrames` 360 and `maxBytesMB` 32. `ASHBOUND.bakerCap` can tighten the cap for tests.
- `tests/r7_baker.py`: after an 8s 40-pack, 204 frames baked at ~2.2 ms avg, queue 82 (v55 endurance sat at 2,500–2,750), evicted under the cap, no page errors. `r5_ai` passed.
- No `SAVE_VERSION` change.

## Step 5.4: active-monster cap

- `AB_TUNE.activeCap` is 40 (`data/tune.json`). Each tick, the nearest chasing units (bosses and chargers first) get full AI; the rest use a cheap `abLodChase` (no pathfinding) and `ab3Get` will not queue new 3D frames for them. Bosses stay active even if that slightly exceeds the cap.
- Packs of 30 or fewer are unchanged (all active). `tests/r7_cap.py`: 120-pack has 40 active / 82 lod, High fps 26.2 / 16.8 (v55 dpr-120 High was 19.9 / 8.1), baker queue 0, 30-pack all active, four bosses all active. `r5_ai` passed (flee still flakes occasionally, same as the v55 baseline).
- No `SAVE_VERSION` change.

## Step 5.5: Koto text batch 1

Applied all 14 entries from `/workspace/ashbound-writing/r7-edits/batch-1.json` to `data/*.json`. Every current value still matched `old`; none were skipped. Structure check (`scripts/check_structure.py`, and r7/data vs the same originals) passed. Touched files (`content.json`, `classes.json`, `skills.json`, `items.json`) are equal to Koto's `r7-edits/edited/` copies.

`r7_telling.py` passed. `r5_ai` passed on retry (flee still flakes). `r6_v55` targeting / no_push / no_overlap / stop_at_reach passed; `walk_away` still flakes. No `SAVE_VERSION` change.

## Step 5 milestone (v57)

Proven against the STRESS-v55 carry numbers. Harness unchanged: headless Chromium + SwiftShader, 844×390, deviceScaleFactor 3, real `qo()` Low dpr 2 / High dpr 3. Report: `tests/r7-stress-v57.json`.

Real Low-dpr packs (12s), v55 → r7:

| Scenario | v55 fps | r7 fps | v55 pairs / shift | r7 pairs / shift |
|---|---|---|---|---|
| dpr-30 High | 25.2 / 14.8 | 29.4 / 15.6 | 23 / 0.22 | 12 / 0.33 |
| dpr-30 Low | 38.2 / 15.6 | 49.6 / 23.4 | 26 / 0.20 | 11 / 0.46 |
| dpr-60 High | 23.4 / 13.5 | 25.0 / 16.3 | 58 / 1.37 | 26 / 0.09 |
| dpr-60 Low | 33.4 / 14.2 | 44.9 / 22.7 | 62 / 1.14 | 34 / 0.26 |
| dpr-100 High | 20.2 / 11.1 | 24.8 / 15.4 | 114 / 1.69 | 72 / 0.25 |
| dpr-100 Low | 29.6 / 14.1 | 42.7 / 17.3 | 93 / 3.61 | 58 / 0.26 |
| dpr-120 High | 19.9 / 8.1 | 23.5 / 14.5 | 148 / 3.42 | 83 / 0.25 |
| dpr-120 Low | 27.8 / 10.5 | 39.0 / 19.1 | 132 / 3.76 | 74 / 0.33 |

Other v55 cases: stack-40 pairs 54 (was 780), shift 0; run-through actually travels (3.2–6.1 tiles vs v55 stuck at ~1.4); corners shift 0.2 (was ~1.8); bosses+40 shift 0, fps 28 / 17.5. Zone travel cinderwood → hearthveil → cinderwood stayed in play. Mid-fight save/load restored 18/18 monsters in the same zone.

Fresh-tab 3-minute endurance (60 mixed, High, real dpr 3, kite): started at 8.2 MB / 0 cached frames. fps 27.5 / 10.7 (chunks 28, 26.9, 27.6). Heap 9.21 → 38.92 MB (**+29.7 MB**, v55 same-tab was +179). Baker queue 0–46 (v55 sat at 2,500–2,750), avg bake ~1.9–2.1 ms, cache capped at 79 frames / 32 MB, `onFrameHits` 0. Jitter in large packs is still high and not solved.

`VERSION` is `"v57"`. Staging only; nothing uploaded, live not touched.

## Step 6.1: Red Line says blade

`data/skills.json` `red_line.about` now reads "A spin with the blade." The skill is a generic melee spin (Salt Reaver starts with a glass dirk; no saber check). `r5_ai` passed. No `SAVE_VERSION` change.

## Step 6.2: NPC lines in data/npc-lines.json

Idle barks (`Ti`), first-greet lines by act and class (`_i`), and side-quest offer/waiting/thanks (`Ge`) now load from `data/npc-lines.json` the same way as the other data files (`js/ab-data.js`, precached in `sw.js`). In-game bindings are `Ti=ABDATA.npcLines.idle`, `_i=ABDATA.npcLines.greet`, `Ge=ABDATA.npcLines.quests`. `Si`, `Ri`, and `ke` stay in `index.html`. `SAVE_VERSION` is still 4. Test: `tests/r7_npc_lines.py`.

## Step 6.3: Event bus module

Added `js/ab-bus.js` (`ABBus.on` / `off` / `emit`), loaded before the game IIFE and precached in `sw.js`. No gameplay change yet; later steps hook combat, FX, loot, and save through it. `SAVE_VERSION` is still 4. Test: `tests/r7_bus.py`.

## Step 6.4: Combat talks through the event bus

`D()` (damage) and `Oi()` (monster death) now emit `combat:miss`, `combat:block`, `combat:friendlyHit`, `combat:playerHurt`, `combat:struck`, `combat:hit`, and `combat:killed` on `ABBus`. A binder in the game IIFE (`abBindCombatBus`) subscribes: floats, flash, shake, hit-stop, particles, sfx, XP, loot, quest-kill credit, and `pendingSave` / boss-victory UI all run from those events. Hit math, HP, status, knockback, leech, thorns, and last-stand stay in combat. `SAVE_VERSION` is still 4. Test: `tests/r7_combat_events.py` plus `r5_ai`.

## Step 6.5: Physics module

Crowd physics (`abSeparate`, `abAssignRing`, `abShoveTick`, `abHitShove`, `abPlayerResolve`, hash/ring helpers) now lives in `js/ab-physics.js`. The game attaches it with `{ dist: $, move: me, getTune: () => AB_TUNE }` so the module does not close over `o`. Call sites in `index.html` still use the same function names. `SAVE_VERSION` is still 4. Tests: `tests/r7_physics.py`, `tests/r7_crowd.py`.

## Step 6.6: hitStop no longer stalls the whole sim

`Cr()` no longer returns early when `o.hitStop>0`. Time, particles, damage floats, toasts, camera, AI movement/separation, and save all keep running. New attacks, projectile hits, poison/lava ticks, and telegraph resolution stay frozen until hit-stop ends. This is an intended feel change so combat can later be lifted out without pausing the rest of the game. `SAVE_VERSION` is still 4. Test: `tests/r7_hitstop.py` plus `r5_ai`.

## Step 6.7: Narrow save DTO

Save snapshots now go through `js/ab-save.js` (`ABSave.toDTO`, `migrate`, monster snapshot). The on-disk shape is still `{ v: 4, savedAt, player, world }`, `abStore()` and slot keys are unchanged, and mid-fight load still works. The DTO is a deep clone of persistent fields (not the live player or monster objects); presentation flags such as `flash` are omitted. `ASHBOUND.save` remains the existing flush helper; the module is exported as `ASHBOUND.saveDto`. Test: `tests/r7_save_dto.py`.

## Step 6.8: AI module

`abMarkActive`, `abLodChase`, and `abMoveCap` now live in `js/ab-ai.js`. The sim tick goes through `ABAI.tick` (the game attaches the existing `Js` implementation). The module only talks to the world through `{ dist, move, getTune, tick }`. Active-cap behavior is unchanged. `SAVE_VERSION` is still 4. Test: `tests/r7_ai.py`.

## Step 6.9: Thin render/baker interface

Added `js/ab-render.js` (`ABRender.attach` / `pump` / `getFrame` / `schedule` / `evict` / `cap` / `stats`). The 3D baker still pumps off the game frame (step 5.3); this wrapper is the seam so rendering can later be lifted without calling into combat, AI, or save. `SAVE_VERSION` is still 4. Test: `tests/r7_render.py`.

## v58 milestone

Step 6 is done: blade wording, NPC lines in data, event bus, combat events, physics/AI/save/render modules, and hitStop no longer stalling the whole sim. `SAVE_VERSION` is still 4. Staging copy is rebuilt as v58; not uploaded from this tree.

## Batch 2a (after v58 stress)

Applied all 3 entries from `/workspace/ashbound-writing/r7-edits/batch-2a.json` (current text matched `old` in each case; nothing skipped):

- `data/characters.json` `characters[5]` (Senn): `pronouns` `"unspecified"` → `"he/him"`. Other characters were left unspecified.
- `data/monsters.json` `monsters[38]` display name `"Glass Kiter"` → `"Glass Kite"`; id stays `glass_kiter`.
- `data/monsters.json` `monsters[43]` display name `"Pale Kiter"` → `"Pale Kite"`; id stays `pale_kiter`.

Monster defs are looked up by id (`ee()` uses `ti.find(t=>t.id===e)`; zones and tests spawn `glass_kiter` / `pale_kiter`). No code compares those display names. `SAVE_VERSION` is still 4.

## Story and coach lines in data/npc-lines.json

Act/class coach and town-entry lines (`Si`) and act intro/end story cards (`Ma`) now live in `data/npc-lines.json` as `coach` and `story`, loaded with the same `ab-data.js` pattern as the other NPC lines. Bindings are `Si=ABDATA.npcLines.coach` and `Ma=ABDATA.npcLines.story`. `SAVE_VERSION` is still 4. Test: `tests/r7_story_lines.py`.

## v59 milestone

After the v58 regression/stress pass: Koto batch 2a (Senn he/him, Glass Kite, Pale Kite) and coach/story lines moved into `data/npc-lines.json`. `SAVE_VERSION` is still 4. Staging copy is rebuilt as v59; not uploaded from this tree.

## v60 milestone

`VERSION` bumped to v60. Restore point for the Phase A rarity work: git tag `pre-phaseA-v60`.

## Phase A — eight ranks, v61 (`SAVE_VERSION` 5)

Display and save-migration only. Drop tables still use the old five-grade roll; uniques and sets stamp their floor as `tier`. Family stays on `rarity` / `uniqueId` / `setId` (so existing unique/set checks keep working). The eight ranks live on `item.tier` plus CSS and tooltips.

- Ranks 1–8 in `data/rarity.json`: Common, Magic, Rare, Elite, Epic, Legendary, Fabled, Mythical, with colors, pips, rank numbers, and affix counts (0/1/2/3/3/4/5/5). Uniques and sets in `data/items.json` carry `baseRarity` (most uniques Epic; eight Legendary, eight Fabled; most set pieces Epic, Pale Watch and Name-Oath Fabled).
- New `js/ab-craft.js` (`ABCraft`). Combat, AI, and render do not import it. `js/ab-save.js` calls `ABCraft.migrateSave` when present. Placeholder strings stay in the data file for Koto.
- `SAVE_VERSION` is 5. v1–v4 saves still load; existing uniques map to their new floor (Epic unless a higher floor is listed). Ordinary items whose affix count is above the new cap keep the rolls and get `legacyAffixes`. Shared stash migrates too.
- Slot load (`cr`) and pasted-save import (`Ha`) now accept v5 through `ABSave.supported` (they still listed only v1–v4).
- UI: rank label, floor line, and rank-number pip; set names stay green (`family-set`). `VERSION` is v61. Tests: `tests/r7_phaseA_migrate.py`, `tests/r7_phaseA_display.py`, `tests/r7_phaseA_play.py`. Staging copy is rebuilt as v61; not uploaded from this tree.

## v62 — skill onboarding

Learning an active skill already placed it on the first empty bar slot; that still works, and v3–v5 saves keep their hotbar through the v4-to-v5 item migration. What was broken was the onboarding: the "Tap here to spend your skill point" bubble was forced off in CSS (`display: none !important`) and in `ashPointHint()` (an early `return`), so a new hero saw four `+` slots and a `1` badge with no pointer. The bubble is on again. Pressing 1–4 on an empty slot now opens Skills, same as tapping `+`. Tapping an empty slot already did that. Restore point: git tag `pre-skillfix-v61`. Test: `tests/r7_skills_play.py`. Staging copy is rebuilt as v62; not uploaded from this tree.

## v63 — campaign intro difficulty

Starting fights were too hard. Monster life and XP in campaign fight zones now start at 0.25 of the current base in Cinderwood and rise linearly by zone to 1.0 at The First Kiln, the last campaign zone. Towns are not on the list (no packs). Ember Rifts and any other post-campaign zone stay at 1.0. Loot and gold are unchanged; the curve lives in `data/difficulty.json` (`campaignIntro`). Restore point: git tag `pre-difficulty`. Test: `tests/r7_campaign_scale.py`. Staging copy is rebuilt as v63; not uploaded from this tree.


## v64 — skills and Strike while moving

Cause: skill buttons (and flasks, Use) fired on the browser's `click`. A `click` is only made from a single-finger tap; while the left thumb holds the move stick, the right thumb's tap is part of a two-finger gesture and no `click` is sent, so the skill never cast. Strike already used `pointerdown`, so it worked. Fix: `cast`, `drink` and `interact` buttons now act on `pointerdown`; the following `click` is ignored if it matches (no double cast). The cast aims through `abSkillAim` as before, and the stick is untouched so movement continues. Keyboard (WASD held + 1-4 / Space) already worked and is now covered by a test. New test `tests/r7_move_cast.py` (CDP multi-touch).


## v64 — iPhone 3D fix (baked frames instead of pixel sprites)

Cause: v56 added a second `function ab3Cap()` (the cache-limit getter). In JavaScript the later one wins, so it replaced `ab3Cap(a,b,r,pt)`, the capsule-part builder used by every biped 3D model. Every bake threw (`Cannot read properties of undefined`), was swallowed, and the type stayed queued forever, so `ab3Get` never returned a frame and the game kept drawing the old pixel sprites. It was not iPhone specific; it hit every device from v56 on (desktop looked fine only where cached or non-biped models drew). Fix: rename the limit getter to `ab3Limits()`. Hardening on top: bake canvas DPR capped at 2 (`ab3BakeDpr`), urgent queue and 32 ms budget (`camera.urgentMs`) for frames needed on screen, failed types are marked bad after 3 errors (no endless re-queue), warm set trimmed to idle/walk/run, cache cap 48 MB. `?debug3d=1` shows baked vs pixel counts, queue, errors; `ASHBOUND.stats3d()` exposes the same. New test `tests/r7_3d_mobile.py` (DPR 3, 844x390, 4x CPU throttle).


## v65 — inventory layout (Gear > Sheet)

Bigger equipment slots around a taller hero figure, a roomier pack, stats that no longer clip, and a tooltip that has its own place. The ten slot ids (`helm amulet weapon offhand armor gloves belt boots ring1 ring2`) and the save format are unchanged. Sizes live in `data/inventory-layout.json` (profiles `phonePortrait`, `phoneLandscape`, `desktop`) and are applied as `--inv-*` CSS variables by `abInvApply()`; the profile is picked from the window size and re-applied on resize/rotation. Portrait: 74px slots, stats beside the doll, pack below, tooltip as a bottom sheet with a close button (new `deselect` action). Landscape: 58px slots (a 390px-tall screen cannot fit 72), tabs share the title row, stats under the pack, tooltip on the right. Desktop: a wide inset sheet, 108px slots, 74px pack cells, larger type. New test `tests/r7_inventory_layout.py`.


## v66 — Koto's full text pass

Applied the rewrites in `/workspace/ashbound-writing/full-text-pass/` (all batch files plus `extra-skill-notes.json` and `extra-misc.json`): 230 strings in `data/*.json` and 27 in `index.html` (toasts, tutor, What's new, rotate prompt, death card). Ids, key paths, placeholders and numbers are unchanged (`check_keys.py` passes; the rest were already live or identical). Effect text was checked against the code and two lines corrected: Warden Shrine now says it also raises fire resist (+40 armor, +15 fire resist), and Quill's blurb no longer says the lamp works "near" Quill (the aura applies whenever Quill is hired and up, and includes +8% fire resist). Fortune Shrine (+45 magic find) and Ember Shrine (+20% fire damage) already matched. Notes: `full-text-pass/code-check-notes.md`. New test `tests/r7_text_pass.py`.


## v67 — isometric (2.5D) camera

The view is now tilted like Diablo/PoE: the world is turned 45° and seen from 35° above, the hero stays locked in the middle of the screen and the world scrolls under them. Walls are raised blocks, houses are boxes with walls, windows, doors and gable roofs (stalls get awnings, the smithy a chimney), fences and tall props stand up, and everything is depth-sorted by iso depth so the hero walks behind a house (which fades to show them) or in front of it. Moving up the screen walks into the scene, down walks out of it. Camera settings live in `data/camera.json` (`mode`, yaw, pitch, bake pitch, zoom, height scale, wall/house/roof heights, hero screen position, ground texel, occluder fade, projectile lift). `?flat=1` (or `mode: "flat"` in the file) falls back to the old top-down view. Input: a tap is converted back through the same projection (`isoWorld`), a tap on a monster body picks it (`isoPick`), and the stick and WASD are turned so "right on screen" is right on screen at the same speed (`isoDv`). Rendering: the floor is drawn once per zone into a cached canvas and blitted with one transform; fog is baked into that canvas per changed tile; house sprites and wall blocks are cached. 3D models are baked at the iso pitch and their facing is turned by the camera yaw. Minimap is turned to match the view. Telegraphs, strike arcs and auras lie on the ground plane; damage numbers, labels, target rings and the objective arrow use projected positions. Ids, keys and saves are unchanged. Restore point: git tag `pre-iso`. Commits: iso 1/5 to 5/5. Tests: `tests/r7_iso_camera.py`, `tests/r7_iso_perf.py`.

## v67 — 3D heroes on character creation

The five class previews on the create screen now draw baked 3D frames with a slow idle turn (one eighth turn every 3 s, light breathing). The pixel sprite shows only until the first frame is baked. The title screen has no hero images, so nothing changed there. Restore point: git tag `pre-create3d`. Test: `tests/r7_create_3d.py`.


## v68 — iso performance + extruded props

Goal: get the isometric view back to v66 speed on the iPhone profile (4x CPU throttle) without changing the look. Restore point: git tag `pre-isoperf` (= v67).
- **Pre-tilted ground.** The floor (with fog baked in) is drawn once per zone into a picture that is already turned and squashed (`pretiltTexel` pixels per tile, default 32; opaque, filled with the zone's void colour). Each frame it is a straight copy at the screen's pixel grid instead of a rotated draw. Fog changes redraw only the tiles that changed. Lava/exit glows are still drawn in the ground plane. Switch off with `pretiltGround: false` in `data/camera.json`.
- **Cheap far crowd.** During big pulls only the `crowd.inactiveFull` (10) inactive monsters nearest the hero are drawn as full 3D models; the rest (frozen, far, not bosses) are drawn as shaded blobs with a shadow. In the 120-monster stress test about 115 monsters were on screen per frame in v67 vs 81 in v66; now most of the extra are blobs. `-1` draws all.
- **House cache** is cropped to the drawn pixels (about 40% fewer pixels than v67) and the smithy chimney flame is drawn live over it, so houses are not re-baked every couple of seconds.
- **Pitch** stays 35 (40 was measured and gave no gain in town or fights, so the look is unchanged).
- **Extruded props.** Town: Warm Well (fountain: basin, water ring, spout), Public Kiln (brick box, glowing mouth, chimney, light), Warden Chest (box, lid, clasp), Ash Bench (seat, back, legs) and Ashmarch Gate (two pillars, lintel, glowing portal) are no longer flat sprites (the bench used to draw the house sprite and the well and kiln shared one arch sprite). Wild zones: shrine (obelisk), crate, cursed chest, relic (pedestal + floating gem) and marker/post (post + sign) are also solid now. Still flat sprites for the graphics pass: exit doors (`exit`), rifts (`rift`), set pieces (`setpiece`), decor (trees and similar), fences use a skewed sprite, and wild-zone trees and clutter are baked sprites.
- Debug: `ASHBOUND.iso()` now reports `drawMs`, `pretilt`, `crowdFull` and `stats.cheap`/`p3k`. Tests: `tests/r7_iso_camera.py` covers pretilt, extruded town props and the cheap crowd; `tests/r7_cap.py` passes again.


## v69 — XP back to x1, mob density ramp

Scott: enemy damage still too high, and lower XP stopped leveling. Restore point: git tag `pre-density` (= v68).
- **XP is x1.0 everywhere.** `campaignIntro.xp` in `data/difficulty.json` is now `false`; monsters pay their normal XP in every zone. The monster life ramp (25% in Cinderwood rising evenly to 100% at First Kiln over the 20 campaign zones) is unchanged.
- **Mob density ramp.** New `campaignIntro.density` block: the number of packs in a zone is 25% of its normal count in the first campaign fight zone and rises evenly to 100% at First Kiln (same 20-zone list). `minPacks` (2) keeps a zone from being empty. Pack size, the named monster and the mini-boss are unchanged. Towns, Ember Rifts, boss rooms and any zone not on the list stay at 100%.
- Debug: `ASHBOUND.campaignDensity(zoneId, kind)`. Test: `tests/r7_campaign_scale.py` now also checks XP x1 and the density ramp (data, API and live packs with the ramp on vs off).
- No change to saves, storage keys or characters.


## v70 — graphics and UI pass (icons, ground loot, 3D props, UI polish)

One restore tag per step: `pre-icons`, `pre-groundloot`, `pre-props3d`, `pre-uipolish`. Saves (`SAVE_VERSION` 5), storage keys, characters and gameplay do not change. Enemy damage is untouched. Art and style settings live in data files.

### Step 1 — item icons
- Every item base now has its own picture (25 bases), plus flasks (life/mana), gems (tinted by gem colour), runes (glyph picked from the rune), lenses, gold, and the three charm sizes. Pictures are drawn once on a canvas from `data/icons.json` (recipes, palettes, rarity frames, style) by the new `js/ab-icons.js` and cached. No external art, nothing to license.
- Shown in the pack, the ten gear slots (empty slots show a grey silhouette), the stall rows (bigger, with a frame) and the tooltip header.
- Rarity: border colour, tile tint and glow per rank class (common calm, magic blue, rare gold, set green, unique/legendary orange, elite purple, epic red, fabled teal, mythical bright gold, plus rune and gem). Higher ranks get an outer and inner glow and a glow on the picture itself; the jewel and trim colours on the item picture follow the rank.
- If `data/icons.json` is missing or fails to load, the game uses the old pixel icons (the file is optional in `js/ab-data.js`).
- `tools/gen_icons.py` regenerates `data/icons.json` (authoring helper only; the game reads the JSON).
- Test: `tests/r7_item_icons.py`. Screenshots: `gfx-icons-{before,after}-{landscape,desktop}.png` and `...-shop-...`.

### Step 2 — ground loot
- Dropped items are drawn as a small version of their picture (same pictures as the pack) standing on a soft shadow, with a rarity-coloured glow behind and a slow bob for anything above common, runes and gems. Gold is a coin stack. The beams, labels, colour-blind markers, bounce on drop, tap/pick-up range and loot save format are unchanged.
- Size, glow and bob are set in `data/icons.json` under `ground`. Without icon data the old flat shapes are used.
- Test: `tests/r7_ground_loot.py` (pictures used, gold coins, pickup unchanged, 40 drops cost under 4 ms of draw time, fallback). Screenshots: `gfx-groundloot-{before,after}-{landscape,desktop}.png`.

### Step 3 — props in 3D
- `data/props3d.json` (generated by `tools/gen_props3d.py`, then edit freely): 42 grid-prop recipes (trees, charred trees, stumps, spires, bones, cairns, rocks, brambles, saplings, reeds, ...), 6 decor recipes, 4 fence styles (any length, along the world x axis so they skew with the camera), and recipes for the exit arch, rift stone, plank bridge (up and broken), glass shards, rows of trees (with sway) and wind lines. Each recipe is a short list of solids (box, cylinder, cone, pyramid, sphere, flat poly/disc, line, glow, shadow). Three size variants make rows of the same tree look different; style and colours live in the file.
- `js/ab-props3d.js` draws each recipe once per scale into a small cached image (cap `cacheMax`, 160) and then copies it like the old sprites, so a frame costs one drawImage per prop. Glow pulses on braziers, arches and embers are live. Hero-behind fade and the HUD edge dimming work as before.
- Missing data or `?flat=1` keeps the old flat pictures. Gameplay, hitboxes, saves and storage keys are untouched.
- Test: `tests/r7_props3d.py`. Screenshots: `gfx-props3d-{before,after}-{landscape,desktop}.png` (plus `-town-`, `-salt-`, `-bridge-`, `-exit-` views).

### Step 4 — UI polish
- `data/ui.json` + `js/ab-ui.js`: one stylesheet added on top of the base CSS (`<style id="ab-ui-style">`). Everything numeric lives in the data file: colours of the frame, bevels and orbs, tooltip line height, and sizes per screen kind (`desktop`, `phoneLandscape`, `phonePortrait`).
- Panels, cards, top bar, quest card, toasts and tooltips get a double border, an inner ring, corner marks and a soft shadow. Buttons get a bevel and pressed state; the primary button and Strike are warmer. Life/mana orbs are cleaner (dark rim, deeper centre, gloss, bigger number); flasks, skill slots and the dock use the same bevel; key numbers sit on a small chip.
- Tooltips: larger name, more line spacing, a divider under the head and above the actions, and a soft shadow at the top/bottom of the text when it scrolls (iPhone landscape shows about 6 lines and scrolls the rest).
- Desktop (wide and tall windows) gets a larger HUD: top bar, quest card, orbs, dock, flasks, skill slots, Strike, minimap, hints and joystick all bigger and re-spaced. Phones keep their layout; only text and button sizes grow (tap targets >= 44px, including the Details, Sort and Fill belt buttons).
- Missing `data/ui.json` keeps the v69 look. Gameplay, saves and storage keys are untouched.
- Test: `tests/r7_ui_polish.py`. Screenshots: `gfx-uipolish-{before,after}-{landscape,desktop,portrait}.png` plus `-town-`, `-menu-`, `-gear-`, `-skills-` views.


## v71 — first-quest guidance, HUD, Stats, Test Tools, richer character art

Restore point for the art step: git tag `pre-charart`. Saves stay `SAVE_VERSION` 5. Storage key names and `abStore()` logic are unchanged. Staging uses a new prefix so existing staging saves are left in place (see below). Gameplay combat numbers are untouched.

### A — first-quest guidance
- New heroes skip the "What's new" news card and get a stepped objective: learn a skill, walk to the North Gate, cross into Cinderwood. Gate glow, a tidy tip, and the objective arrow lead the way (`data/guide.json`, quest split `wood` / `wood_far`).
- Test: `tests/r7_questguide.py`. Shots: `gfx-questflow-*.png`.

### B — town gate on the north wall
- In all four towns the gate sits on the north wall at (11, 1.3) with a 2-wide path from the square. Also fixes a v68–v70 save bug that stored `props: []` (render cache `_isoC`) so a saved town reloads with houses, people and the gate.
- Test: `tests/r7_town_gate.py`.

### C — no identify
- Items are named on drop and on load. The ident lens no longer drops or appears in the stall; the bench has no identify recipe; tooltips have no Identify button. A leftover lens sells for 15 gold.
- Test: `tests/r7_noid.py`.

### D — skill arc
- The four skill slots hug Strike in a bounding-box-safe arc (`js/ab-hudarc.js`, `data/ui.json` `arc`). Orbs sit higher; the belt and dock stay clear of the arc; the objective arrow avoids HUD boxes. Turning the arc off in the data file restores the old row.
- Test: `tests/r7_skillarc.py`. Shots: `gfx2-skillarc-*.png`.

### E — skill tree
- The Skills tab shows each branch as a rail of nodes with locked/open/ready/learned/maxed states and reasons from `data/ui.json` `skillTree.labels`.
- Test: `tests/r7_skilltree.py`. Shots: `gfx2-skilltree-*.png`.

### F — rune tooltips
- Every rune tooltip is "Rune · Tier N" (no "Rune Rune"), with its socket effect and the runewords that use it. The Journal runes tab lists each runeword's effects (`data/ui.json` `runeTips`).
- Test: `tests/r7_runetips.py`. Shots: `gfx2-runetips-*.png`.

### G — monster count
- The top-bar zone line reads "<zone> · N left" (living hostiles only), "Cleared" at zero, hidden in towns (`data/ui.json` `mobCount`).
- Test: `tests/r7_mobcount.py`. Shots: `gfx2-mobcount-*.png`.

### Stats tab
- Gear → Stats. Per-point gains are measured with the real sheet formula; base / gear / bonus breakdown; derived stats and chance to be hit. Labels and rows live in `data/ui.json` `statsTab`.
- Test: `tests/r7_statstab.py`. Shots: `gfx2-statstab-*.png`.

### Test Tools (staging only)
- Staging Menu has a TEST tools panel: spawn items, set level / points / gold, ignore requirements, teleport. Live (`STAGING` false) never loads `js/ab-testtools.js` and has no TEST button.
- Test: `tests/r7_testtools.py`. Shots: `gfx2-testtools-*.png`.

### H — richer character art
- Hero classes, town NPCs, common monsters and the paperdoll (the paperdoll is the hero type) get modest extra baked detail: hair, beards, hats, aprons, quivers, packs, emblems, tassets, kneepads, bandoliers, spikes, trophies, golem runes, imp wings, and a few quad extras (fangs, back spikes, moss, a collar). Built from the same capsule / sphere / disk primitives as before.
- All of it is data-driven in `data/models.json`: a `rich.enabled` switch and per-type `detail` flags plus new `parts` colours. Camera, LOD (`Ppx`), the 360-frame / 48 MB cap, animation tables and the bake budget are unchanged from the `pre-charart` tag. `rich.enabled: false` bakes pixel-identical sheets to that tag. A full human-proportion model rework is later work and was not done here.
- Bosses that extend a changed type do not inherit the new kit. Existing part colours (reaver hair, imp trim, inherited NPC trim) are left alone so the off switch stays honest. Merchant and elder still wear a hood when the switch is off; with it on, a hat or hair replaces the hood.
- Test: `tests/r7_charart.py` (sheets differ when on, identical when off, bake cost +32% / under the 40% cap, every type × pose still bakes, caps hold after a Cinderwood fight, Gear panel opens). Before/after sheets: `/workspace/ashbound-overhaul/gfx-charart-{before,after}-{heroes,npcs,monsters}[-back].png`.

### Staging saves
- Staging `config.js` (`config.staging.js` in this tree; the upload copy) uses `STORAGE_PREFIX: "ashbound-staging-v71:"` so a fresh character list starts on staging. Existing `ashbound-staging:` keys are left in the browser and are not read or deleted. Live `config.js` is unchanged (`STAGING: false`, prefix field unused while the flag is false). `abStore()` still only prefixes keys when `STAGING` is true.

### Perf (same probe as v70: iPhone landscape 844×390, DPR 3, 4× CPU throttle)
- `r7_iso_perf`: town walk 6.39 fps (v70 7.3), Cinderwood fight 7.68 fps (v70 6.9).
- `r7_cap` pack-120: 19.4 fps avg (v70 18.2, pass line 18). `all_pass: true`.


## v72 — timing and feel

Attack feel, movement, stamina, and built-in boot run speed. All of those numbers live in `data/feel.json`, read through `js/ab-feel.js` (`ABFeel`). Restore points: `pre-version`, `pre-hitfeel`, `pre-runspeed`, `pre-stamina`, `pre-movespeed`. Commits: `12ce023` (version), `6da7f61` (hit feel), `d907af6` (run speed), `9fa81e0` (stamina), `a351219` (boot move speed).

### Attack and hit feel
- Swing windup/recovery is tighter than v71 (`swingMin` 0.08, `swingMax` 0.18, `swingApsRef` 0.28; v71 was 0.112–0.256 with a 0.38 APS ref). Skill swings use `skillSwing` 0.11.
- Hit pause, flash and the impact ring come from the file: hit 0.07s, crit 0.11s, kill 0.13s, a big player-hurt 0.055s (threshold 16). Changing a number in the data file changes the next hit.
- Test: `tests/r7_hitfeel.py`.

### Run speed and gait
- Run is 15% slower (`runMul` 0.85). Walk is distinctly slower (`walkMul` 0.4 of run, was 0.5). Stick below `walkStick` 0.62 walks. Accel 16 and decel 22 tiles/s².
- Walk/run animation follows `player.gait`. Walk and run cycle lengths still differ in `data/models.json`.
- Cinder Warden, no gear: run 3.825 tiles/s (was 4.5), walk 1.53 (was 2.25). In-world vx matches those figures after accel settles.
- Test: `tests/r7_runspeed.py`.

### Stamina (D2-style)
- Max = 80 + Vitality × 2.5 (Cinder Warden at 22 Vitality: 135). Drain 16/s while running outside town; regen 22/s walking, 36/s idle; no drain in towns (idle regen still applies). Empty forces a walk until 28% is back.
- A small gold bar sits just above the life orb (`#stam-bar`, placed by `js/ab-hudarc.js`) and does not overlap the skill arc, Strike, orbs, flasks, dock or stick.
- Stats tab: Stamina and Stamina per Vitality rows, and the Vitality card lists +2.5 stamina per point.
- Test: `tests/r7_stamina.py`. Before/after shots: `/workspace/ashbound-overhaul/gfx3-stambar-{before,after}.png`, `gfx3-statstab-{before,after}.png`.

### Boot move speed
- Every boot has a built-in Faster Run amount by rarity, from `data/feel.json` `bootMove`: Common 5, Magic 8, Rare 12, Elite 16, Epic 22, Legendary 28, Fabled 34, Mythical 40.
- Fleet is +8% on boots and +5% on rings (`slotMods`); of the Path is +15% on boots. The total FRW cap stays 80% (`frwFloor` −20, `frwCap` 80).
- Paragon +1% move speed per 10 levels is not built yet (no paragon). Noted in `data/feel.json` `notes.paragon`.
- Test: `tests/r7_movespeed.py`.

### Staging
- `VERSION` is v72 in `config.js` and `config.staging.js`. Staging `STORAGE_PREFIX` stays `ashbound-staging-v71:`. Live `config.js` stays `STAGING: false`. The `../staging-upload/` copy was not touched (still the v71 pack).

### Tests
- New: `r7_version`, `r7_hitfeel`, `r7_runspeed`, `r7_stamina`, `r7_movespeed` (TESTS.md 54–58).
- Full checklist run after step 5. Known: `r6_v55` still fails; `r7_text_pass` still fails (pre-existing). `r5_ai` passed on this run (it had been listed as a pre-existing fail). Flaky `r7_3d_mobile` (`frames_baked`) failed twice (including a retry); `r7_telling`, `r7_save_dto`, `r7_move_cast`, `r7_inventory_layout` passed. Version-pin checks in `r7_phaseA_migrate`, `r7_phaseA_play`, `r7_skills_play`, and `r7_campaign_scale` were updated from v71 to v72 (`staging-upload` is still asserted as v71).

### Perf (same probe as v71: iPhone landscape 844×390, DPR 3, 4× CPU throttle)
- `r7_iso_perf`: town walk 6.49 fps (v71 6.39), Cinderwood fight 7.23 fps (v71 7.68).
- `r7_cap` pack-120: 19.3 fps avg (v71 19.4, pass line 18). `all_pass: true`.

### Bigger Strike and even skill arc
- Strike is 22% larger (`data/ui.json` arc.strikeScale 1.22) than the CSS size at each breakpoint (64→78 portrait, 78→95 landscape, 112→137 desktop).
- The four skill slots use even angular spacing around Strike, packed as close as possible without overlapping (ringGap / slotGap still 6). Orbs, belt, dock and the stamina bar still clear the arc.
- Test: `tests/r7_bigstrike.py`. `r7_skillarc` overlap/tightness still applies. Shots: `/workspace/ashbound-overhaul/gfx3-bigstrike-{before,after}-{portrait,landscape,desktop}.png`.

### Overhead health and mana bars
- A Settings toggle (default off, saved with the other device settings through `abStore()`, so the staging prefix applies) shows small health and mana bars above the player. Sizes and labels live in `data/ui.json` `overheadBars`. Also listed in the pause menu.
- Test: `tests/r7_overheadbars.py`. Shots: `/workspace/ashbound-overhaul/gfx3-overheadbars-{before,after}[-settings]-{portrait,landscape,desktop}.png`.

### Bottom-centre orbs
- Health and mana orbs sit near the bottom centre (health left, mana right), D2/D4 style, instead of out at the left and right edges. The potion belts and the Gear / Skills / Journal / Menu dock move so they do not overlap the orbs, stamina bar, stick or skill arc. Dock buttons stay at least 44px with the profile dock font. Numbers live in `data/ui.json` `hudLayout`.
- Test: `tests/r7_hudlayout.py`. `r7_skillarc` overlap still passes (the old "orbs raised at the edges" check is now "orbs inboard"). Shots: `/workspace/ashbound-overhaul/gfx3-hudlayout-{before,after}-{portrait,landscape,desktop}.png`.

### Load-in sound
- The looping act drone no longer starts automatically on first tap (`Kr`), on spawn, or when a zone loads. That was the generic "enter the game" sound, not a fire effect. Default is silence (`data/feel.json` `audio.autoMusic` false, `loadCue.enabled` false). A very soft short cue can be turned on in that file. Mute and the music slider in Settings can still start music if you want it.
- Restore tag: `pre-loadsound`. Test: `tests/r7_loadsound.py`.

### HUD mute button
- A speaker-icon mute button sits in the top corner beside the minimap (48px, data in `data/ui.json` `muteBtn`). It toggles all game audio (`settings.muted`, already respected by SFX and music), shows the muted state clearly, and is saved with the other device settings through `abStore()` (staging prefix applies). The same control is in Settings and the pause menu.
- Test: `tests/r7_mutebtn.py`. Shots: `/workspace/ashbound-overhaul/gfx3-mutebtn-{before,after,after-muted,after-settings}-{portrait,landscape,desktop}.png`.

### Test Tools: random maxed mythic / set
- Staging Test Tools gains a "Spawn maxed" card: count 1 / 5 / 10, then "Spawn random mythic (maxed, awakened)" or "Spawn random set piece (maxed, awakened)".
- There is no separate awakened flag in the game, so "maxed + awakened" means best base defense, full sockets, and Mythical rank (the top upgrade tier) on a random unique or set piece.
- Test: `tests/r7_testtools.py` (extended). Shots: `/workspace/ashbound-overhaul/gfx3-spawnmythic-{before,after}-{portrait,landscape,desktop}.png` and `gfx3-spawnmythic-after-spawned-landscape.png`.

### Stats tab: armor defense percent and hideZero
- Dexterity's "each point gives" line is now "+0.15% armor defense" (percent per point) instead of a rounded-to-zero "+0.00 defense" when gear defense is tiny. The rate lives in `data/ui.json` (`mode: "rate"`).
- `hideZero` hides a value when it ROUNDS to zero at that row's display decimal places, not only when it is exact 0 (per-point and derived rows).
- Stats cards wrap on narrow widths (`minmax(min(100%, 196px), 1fr)`) so labels do not clip on phone or desktop.
- Test: `tests/r7_statstab.py` (extended). Shots: `/workspace/ashbound-overhaul/gfx3-statstab-{before,after}-{portrait,landscape,desktop}.png`.

### Main stat (D3-style)
- Each class has a `mainStat` and `mainBonuses` in `data/classes.json`. Cinder Warden: Strength. Briar Stalker and Salt Reaver: Dexterity. Reed Caller and Bell Chanter: Energy.
- Crit (0.08%/pt) and armor defense (0.15%/pt) now come from the main stat, not from Dex unless Dex is the main. Dexterity still grants attack rating for every class. Rates live in `mainStatRates`.
- Energy casters get spell damage %/pt on the existing `edmg` (enhancedDamage) sheet stat instead of armor defense, and they keep crit. Skill/spell and minion hits scale with `(1+edmg)` times a per-class `skillDamageMul` (also in `classes.json`) so casters play as glass cannons without running away from the pack in a DPS × eHP sim.
- The Stats tab lists those per-point rates on the main-stat card.
- Test: `tests/r7_mainstat.py` (L10/L30/L50 sim vs a 4-hound pack, all products within 15% of the level average). Shots: `/workspace/ashbound-overhaul/gfx3-mainstat-after-{warden,chanter}-{portrait,landscape,desktop}.png`.

### Pre-staging regression fixes
- Tap-to-move hard-stops when the hero reaches the tapped tile (accel leftover from v72 feel was still carrying them, so the next screen pick was stale). Far floor taps no longer land in the v72 HUD: `r7_iso_camera` skips tiles under the dock, belts, orbs, skill arc and the game's 14px control pad (the old 70px-bottom / 220px-right margins no longer match the bottom-centre layout). That also stopped a Skills-dock miss from opening a panel and freezing flat-mode stick and keyboard.
- Dock layout no longer forces 36px / 12px buttons. Phone profiles in `data/ui.json` set `dockH` 44 and `dockPad` 8; `ab-ui.js` applies `dockH` / `dockFont` / `dockPad` on every profile; `ab-hudarc.js` only positions the dock. `r7_ui_polish` 44px taps and dock font pass, and `r7_hudlayout` still has no overlap.
- Restore tag: `pre-regfix`. Tests: `tests/r7_iso_camera.py`, `tests/r7_ui_polish.py`, `tests/r7_hudlayout.py`. Shots: `/workspace/ashbound-overhaul/gfx3-hudlayout-after-{portrait,landscape,desktop}.png` (refreshed).
