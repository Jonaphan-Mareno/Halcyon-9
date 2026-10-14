# Halcyon-9 — Game State

Snapshot of the repository and game on branch **`level1-restyle`**.
Generated 2026-10-14.

---

## Repository

| Item | Value |
|---|---|
| Branch | `level1-restyle` (tracks `origin/level1-restyle`, in sync) |
| Commits ahead of `main` | 12 |
| Working tree | Clean except `package-lock.json` (modified, unstaged — npm churn) |
| HEAD | `acd5418` — "Level 2 arrives in level 1's lift, with ARIA on a screen in both" |
| Source size | ~16,181 lines of JS across `src/` |

### Engine / stack
- Vanilla JavaScript (ES Modules), no framework.
- **Three.js** `^0.185.1` — rendering, PBR materials, custom GLSL shaders, post-processing.
- **@dimforge/rapier3d-compat** `^0.21.0` — physics (used by Level 2 sessions).
- **Vite** `^8.2.2` — dev server + build (`base: './'` for subdirectory/LAMP deploy).
- Asset tooling: `@gltf-transform/*`, `draco3dgltf`, `meshoptimizer` (`npm run optimize-models`).
- Blender 5.2.2 used offline to author/export `.glb` models (`Blender/scripts/*.py`).

### Commands
```bash
npm run dev              # Vite dev server (http://localhost:5173)
npm run build            # production build -> /dist
npm run optimize-models  # thin + Draco-compress the .glb assets
npm run extract-lift     # extract lift.glb from the control room model
```
URL flags for testing: `?level=2` (habitat atrium), `?level=hose` (coolant hose test room),
`?level=reactor` (old cargo atrium).

---

## Game overview

Deep-sea 3D survival/puzzle game. You play **Voss**, a reconstructed consciousness trapped in a
flooding research station, guided by the AI **ARIA** (motivations unclear). First-person camera,
WASD + mouse-look, physics-based interaction, and a health/lives ("restore from backup") system.

---

## Level status

### Level 1 — "Reboot" (control room) — PLAYABLE, complete flow
The most developed level. `src/levels/Level1.js` (~2,670 lines) plus `src/Game.js` (~1,327 lines)
drive a full objective ladder:

1. **Starting cell** — concrete cell, real brick, see-through; door handle you must reach out to
   turn; a brick you can pick up, throw (click) or drop (E).
2. **Fix the wall panel** to bring the monitor online (circuit panel).
3. **Talk to ARIA** at her glowing monitor (intro dialogue sequence).
4. **Find the torch** on the floor (F toggles, I opens inventory, live 3D torch preview).
5. **Repair the generator circuit** — the timed "Overload" `CircuitPuzzle` (rotate tiles to carry
   power from battery to bulbs, avoid red fuses). Failure overloads, damages health, ARIA gives
   hints; each stage repaired heals Voss.
6. **Align the relay rings** — `RingPuzzle`: turn each ring until its marker lines up with the rail
   (rings are linked).
7. **Use the security keypad** beside the lift doors (6-digit code; TEMP code `123456`).
8. **Ride the lift down** — console screen closes the doors (reverse-played animation) and departs
   to Level 2.

Systems in place: aim-assist interaction picking, reticle prompts, waypoints + edge arrows,
per-stage objectives, ARIA idle quips, health/damage/death/revive, checkpoint restore,
restart-without-reload, adaptive quality (`PerfMonitor` + `LEVEL1_QUALITY` steps), FXAA
post-processing. Habitat "restyle" look: sci-fi monitor wall, glitching/smashed monitors,
parallax occlusion mapped floors, real brick, farm soil.

Known open item (deliberate): **the lift is not gated on finishing Level 1** — a player can go
straight to the keypad and descend without solving the relay. A one-line guard in
`Game.onKeypadSubmit` would lock it behind `relaySolved`.

### Level 2 — habitat atrium — ENVIRONMENT PREVIEW (no gameplay yet)
`src/level2/HabitatSession.js` (~607 lines). You arrive in Level 1's lift, doors open, and you can
walk the whole atrium. Includes the two hand-authored crew quarters (Voss + Kessler) with full
collision, sliding quarter doors (proximity-triggered), toon material conversion, per-room warm
panel lights, lab screens, holo screens, organism, and a deep-sea video window. Rapier physics via
`PlayerController`. **No interactables / pickups / objectives yet** — those are designed after the
environment is approved. See `SESSION.md` for the full atrium/bedroom authoring + export pipeline.

Other Level 2 sessions available via URL flag:
- `src/level2/HoseTestSession.js` — coolant hose test room.
- `src/levels/Level2Session.js` — old cargo atrium, kept to become Level 3's reactor room.

### Level 3 — "Containment" — STUB ONLY
`src/levels/Level3.js` is a placeholder class (`name = 'Containment'`, empty `update`). The rising
water shader / flooding endgame described in the rubric is not yet built here.

---

## Transition: Level 1 → Level 2

Fully wired (see `docs/session-2026-10-04-level1-ending.md`). `Game.onElevatorDepart` introduces a
`DEPARTING` state (freeze controls, hide UI, toast "Descending to the habitat deck..."), then
`_leaveForLevel2` disposes Level 1, removes its input listeners, prunes the UI layer (keeping the
welcome screen, reticle and reused UIManager elements), drops Level 1's post-processing/perf
monitor, flips `level2Mode`, and mounts `HabitatSession` **without** recreating the renderer,
camera, UIManager or animation loop (`startLoop` is a non-cancellable recursive rAF).

---

## Core systems (src/)

- `core/` — `Renderer` (WebGL + post/FXAA + resolution scaling), `Camera` (first-person + flashlight),
  `Controls` (raycast floor-follower, no physics, ground-snap step clamp), `Physics` (Rapier wrapper,
  preloaded), `PerfMonitor` (adaptive quality steps), `loaders` (GLTF + Draco).
- `entities/` — `Player` (toon material helpers), `PlayerStats` (health/lives/score), `ARIA` +
  `AriaHead` + `AriaManager` (mood, face shader, monitor pinning, subtitles/voice), `Drone`,
  `Machine`, `RingPuzzle`.
- `graphics/` — `Lighting`, `Shaders` (GLSL: water, ARIA glitch, toon ramp), `HubMaterials`,
  `HubDecals`, `DeepSeaWindow`, `VideoWindow`, `parallax`.
- `ui/` — `UIManager`, `HUD`, `Inventory`, `ItemPreview`, `KeypadUI`.
- `puzzles/` — `CircuitPuzzle` (~1,194 lines, the "Overload" generator minigame).
- `audio/` — `AudioManager` (spatial/ambient, hum, ticks, zaps, ARIA voice clips).
- `story/` — `IntroSequence` (opening Voss/ARIA conversation).

Audio assets present: ARIA intro lines 1–4, idle, puzzle start/success, overload 1–2, relay success.
Some referenced clips (hints, zaps, restore lines, idle quips) fall back to timed subtitles with a
talking face until recorded.

---

## Recent work on this branch (vs `main`)

37 files changed, +6,195 / −738. Highlights:
- Level 1 restyle: monitor wall (`MonitorWall.js`), damaged/glitching screens (`DamagedScreens.js`),
  brick texture (`brickTexture.js`), habitat control-room look (`level1Look.js`), lift cabin
  (`liftCabin.js`), parallax occlusion floors (`graphics/parallax.js`).
- Big `Shaders.js` rework (+292/−…) and `HubMaterials.js` (+137).
- CircuitPuzzle rewrite (+503/−…), easier cell-door handle, aim assist, tighter wiring hints.
- Model optimisation: `controlroom.glb` 21.7 MB → 637 KB, `l2-atrium.glb` 9.7 MB → 3.0 MB,
  `l2-lab.glb` 2.07 MB → 234 KB; new `lift.glb`; Draco compression.
- Performance pass (`PerfMonitor.js`, Renderer FXAA + adaptive resolution) for the school server /
  slower machines; atrium vegetables + farm soil slimmed down.
- Level 2 arrives in Level 1's lift with ARIA on a screen in both.

---

## Notable pitfalls / conventions (from session docs)

- **Relative paths only**; **lowercase-hyphenated filenames** (Linux servers are case-sensitive).
- **`.dispose()`** unused geometries/materials/textures on level teardown to avoid leaks.
- GLTFLoader strips `. : / [ ]` and spaces from node names but keeps material names intact — any
  name-matching/alias list must be dot-free and verified through the real loader.
- The export log can lie: verify `.glb` contents (materials/`COLOR_0`/`COL_` counts), not just the
  "exported" line. Hard-refresh (Ctrl+Shift+R) after re-export — `.glb` is cached aggressively.
- Toon materials ignore `scene.environment` and need real lights (hence per-room point lights).
- `startLoop()` is a recursive rAF with no cancel handle; `UIManager`'s constructor appends DOM —
  neither may be instantiated twice.

---

## Summary

Level 1 is a complete, playable, polished arc from waking in the cell to riding the lift down.
Level 2 (habitat atrium) is a walkable environment preview with collision, doors and lighting but
no gameplay objectives yet. Level 3 is a stub. The immediate next steps implied by the code and
docs are: gate the lift on Level 1 completion, design and add Level 2 interactables/objectives, and
build out Level 3's containment/flooding sequence.
