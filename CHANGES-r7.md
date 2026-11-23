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
