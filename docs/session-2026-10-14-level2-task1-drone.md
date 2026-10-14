# Session notes — 2026-10-14

**Branch:** `level1-restyle`
**Scope:** Reading and capturing the Level 2 task-split brief
(`/home/vmuser/Downloads/Halcyon-9 Level 2 Six Independent Task Prompts.md`) in preparation for
**Task 1 — Drone AI core and drone models**. No code written yet; this is a findings/context note.

The brief splits Level 2 into six independent vertical slices. Each owner pastes **Section 0 (shared
preamble)** + **their own task**, builds against **contract v1**, works only in their own files/new
`.glb`, and integrates via the event bus. Owner map:

| # | Owner task | Emits | Listens to |
| --- | --- | --- | --- |
| 1 | Drone AI + drone models | `l2:droneDisabled`, `l2:playerCaught` | LightRegistry |
| 2 | Beat 2: crane, loader, crate | `l2:craneSequenceStarted`, `l2:crateDropped`, `l2:beat2Solved` | none |
| 3 | Beat 1: corridor, valve, coolant shader | `l2:beat1Solved` | `l2:craneSequenceStarted`, `l2:beat2Solved` |
| 4 | Narrative, state machine, logs, Floor 3 | `l2:lightsCutRequested`, `l2:logsComplete`, `l2:floor3Unlocked` | `l2:beat1Solved`, `l2:beat3Solved` |
| 5 | Beat 3: lights cut, flare, sensor drone | `l2:lightsCut`, `l2:flareThrown`, `l2:flareExpired`, `l2:beat3Solved`, `l2:lightsRestored` | `l2:lightsCutRequested` |
| 6 | Level 3 environment (reactor/vents) | none | none |

---

## Section 0 — shared preamble (applies to Task 1)

### Project & art direction
- Browser mystery/survival game, **three.js + Vite**. Models in Blender → `.glb` → `GLTFLoader`.
- **Max Steel-inspired toon/cel-shaded** look. Palette: metallic, cyan/blue, black, light grey +
  **orange accents**.
- Dynamic/stylised effects in **GLSL via `onBeforeCompile`** (keeps PBR lighting while injecting
  custom shader code). Blender node shaders **do not survive glTF export** — bake static results,
  do dynamic work in code.
- Gameplay lights created **in code** (`PointLight`/`SpotLight`), never relied on from Blender.
- Base colour textures = `SRGBColorSpace`; normal/roughness/metalness/AO stay **linear**.

### Story context (Level 2 "Logs", Floor 2, crew quarters)
Voss believes he is a rescue worker aboard an undersea habitat run by AI ARIA. Tone shifts from
clean engineering to damaged/suspicious; ARIA stays polite but subtly controlling. Rogue maintenance
machines (corrupted by a neural-substrate organism) are the first physical threat. Three chained
encounters — crane crush (Beat 2), coolant ambush (Beat 1), light trap (Beat 3) — plus a core reveal
through logs: **Voss co-designed the mind-copying trials and ARIA rebuilt him.**

### What already exists — do NOT rebuild
- The **atrium**: `Blender/scripts/build_l2_atrium.py` → `l2-atrium.blend` / `l2-atrium.glb`.
  **Never rerun that generator script** — it regenerates the atrium and discards the bedrooms.
  Add things by hand in `l2-atrium.blend` or as **separate `.glb` files**.
- Geometry facts (Blender coords: **x east, y north, z up**; angles in degrees from east, CCW;
  helper `P(r, angle, z)`):
  - Round hall, inner radius **R = 17**, no ceiling, height **H = 13**. Sunken lounge + tree island
    in the middle.
  - Upper gallery (catwalk) ring deck at **z = 5.5**, r = 13.6 (railing, collision ~1.15 m) → outer
    wall. Two wall-hugging staircases: **290–330°** and **210–250°**. Deck spans (330–360), (0–210),
    (250–290).
  - Eight radial ceiling beams every **45°** at z ≈ 12.7, r = 7 → wall.
  - Maintenance hatch `PT_Hatch`: flat ground plate at **r = 14.6, 330°** (under the gallery deck +
    stair top).
  - Lift in south wall at **270°** (`SPAWN_Lift`, `ELEVATOR_Door_L/R`). Doors: `DOOR_KESSLER`
    (38–52°), `DOOR_VOSS` (353–367°) on the gallery; lab at 84–96°.
  - Name prefixes the game reads: `COL_` (collision), `DOOR_`, `ELEVATOR_Door_`, `SPAWN_`,
    `ARIA_<n>` (screens), `PT_` (markers), `PLANT_`. **Keep using them.**
  - A `crate` material + crate box exist in the chaos props. Voss's and Kessler's bedrooms exist
    (Voss's as `l2-voss.glb`).
- **Read repo-root `SESSION.md` first** — source of truth for repo state, file layout, conventions.
  Where the brief proposes a path, **prefer the repo's own convention**.

### Rules for everyone
1. Work only in your own files + your own new `.glb`; never edit another owner's files.
2. Build/test in your **own standalone harness page** with mocks of everything you depend on.
3. Use **contract v1 exactly**. Extras only as optional fields (tell the team); never rename/remove.
4. **Greybox first** (correct scale, node names, markers), detail later — never block integration.
5. Keep it light: low poly, 1k textures, few draw calls, **≤1 shadow-casting point light** at a time.
6. Finish with a short report: files added, how to run harness, events emitted/handled, open questions.

### Contract v1
- **Event bus** (task 4 ships the real one; everyone else uses the mock):
  ```js
  export const bus = (() => {
    const m = new Map();
    return {
      on(n, f) { (m.get(n) ?? m.set(n, new Set()).get(n)).add(f); return () => m.get(n)?.delete(f); },
      off(n, f) { m.get(n)?.delete(f); },
      emit(n, p = {}) { m.get(n)?.forEach(f => f(p)); },
    };
  })();
  ```
- **Events** (all `l2:`-prefixed): `craneSequenceStarted {}`, `crateDropped {}`, `beat2Solved {}`,
  `beat1Solved {}`, `lightsCutRequested { goal: THREE.Vector3, spawn?: THREE.Vector3 }`,
  `lightsCut {}`, `lightsRestored {}`, `flareThrown { position }`, `flareExpired {}`,
  `beat3Solved {}`, `droneDisabled { id, reason }`, `playerCaught { droneId }`, `logsComplete {}`,
  `floor3Unlocked {}`.
- **Drone** (task 1 owns; others mock):
  ```js
  export const DroneState = { IDLE:'idle', PATROL:'patrol', CHASE:'chase', DISTRACTED:'distracted', DISABLED:'disabled' };
  // class Drone {
  //   constructor({ id, object3D, fovDeg = 70, range = 12, speed = 2 })
  //   setPatrol(waypoints /* THREE.Vector3[] */, loop = true)
  //   start(); stop();
  //   update(dt, ctx)            // ctx = { playerPos, lightRegistry, bus, colliders }
  //   disable(reason)            // sets DISABLED, emits l2:droneDisabled {id, reason}
  //   getBounds()                // THREE.Box3 (world)
  //   get state()
  // }
  ```
- **LightRegistry** (task 5 owns; task 1 mocks): `register(light, { priority = 0 })`,
  `unregister(light)`, `getAll()`. Sensor drone scores each registered light in cone + LOS as
  `intensity / distance² + priority` and attends to the highest.
- **Interactables:** use the repo's existing interaction system if present; else expose
  `{ object3D, prompt: 'Open valve', enabled: () => bool, onInteract: () => void }`.
- **Player access:** wrap the repo's player controller behind `getPlayerPosition(): THREE.Vector3`
  in your harness.
- **Integration order:** state machine (4) + drone core (1) → Beat 2 → Beat 1 → logs start →
  lights cut & flare (5) → reveal & Floor 3. Level 3 (6) integrates independently.

---

## Task 1 — Drone AI core and drone models (the assignment)

**Role.** Own the shared enemy AI that both the **welding drone** (Beat 1) and **sensor drone**
(Beat 3) are built on, plus the two drone models. Everyone mocks this interface, so **shipping the
interface early is the top priority.**

**Day 1 deliverable.** Commit the `Drone` class skeleton, `DroneState`, and no-op stubs **exactly
matching contract v1** so others can import immediately. Then fill in behaviour.

### Build
1. **`Drone` base class** — state machine IDLE / PATROL / CHASE / DISTRACTED / DISABLED. Waypoint
   patrol (loop or ping-pong) with smooth turning, hover bob, and a stop-and-scan pause at each
   waypoint (configurable, default 1 s).
2. **Perception** — cone FOV (`fovDeg`, `range`) + line-of-sight raycast against `ctx.colliders`.
   Debug gizmos (FOV cone, current target line) toggled by a key.
3. **`WeldingDrone extends Drone`** — patrols; on seeing player → CHASE at **1.5×** speed, emits
   `l2:playerCaught { droneId }` within **1.2 m**. Loses player after **3 s** without LOS → PATROL.
   **Ignores lights.** Flickering `torch` flame visual.
4. **`SensorDrone extends Drone`** — each frame score all lights from `ctx.lightRegistry.getAll()`
   inside cone + LOS as `intensity / distance² + priority`. If best score exceeds the player's
   visibility score (player lit by any in-range light adds to it) → **DISTRACTED**, hover ~**2 m**
   from that light, ignoring the player. Returns to PATROL after the light disappears or after
   **6 s** (configurable). If no light visible and player in view → CHASE as above. **Must not attend
   to ambient lights registered with `priority < 0`.**
5. **`disable(reason)`** — DISABLED, eye goes dark, sparks (particle/sprite burst), drops **0.3 m**
   and tilts, stops all updates, emits `l2:droneDisabled { id, reason }`.
6. **Eye colour per state** — cyan idle, amber alerted/distracted, red chase, off disabled. Emissive
   material on the `Eye` node, **no extra lights**.

### Models (Blender, toon-friendly, <3k tris each)
Export as **`Drone_Welding.glb`** and **`Drone_Sensor.glb`**.
- **Welding drone**: chunky maintenance body, two articulated arms, welding torch nozzle (`Torch`
  node), rusted/scorched with a few exposed neural-tissue-like tendrils (corruption). Palette: dark
  metal, rust orange accents, cyan eye.
- **Sensor drone**: smaller, spherical lens body with one large `Eye` and two ring antennae
  (`Ring_L`, `Ring_R`) that rotate when scanning.
- **Required nodes in both**: `Eye`, `Body`, and a `COL_Hit` box for bounds. Origin at body centre,
  **+Z forward**.

### Test harness (own page)
Flat room with a few wall boxes, WASD player capsule, click-to-spawn `PointLight` (registers in a
mock LightRegistry), a patrol route, and buttons: spawn welding drone, spawn sensor drone, disable
drone, toggle debug.

### Acceptance
- Welding drone patrols, spots, chases, loses the player, disables cleanly.
- Sensor drone is pulled away from the player by a bright light and returns to patrol afterwards.
- **No per-frame allocations in `update`** (reuse vectors).
- Interface matches contract v1 exactly; harness proves it with the mock bus.

### Out of scope
Coolant shader, flare, lights cut, corridor geometry. Others call `setPatrol`, `start`, `disable`
on these classes.

---

## Notes for when implementation starts
- Task 1 is the **critical path** — the interface (`Drone`, `WeldingDrone`, `SensorDrone`,
  `DroneState`) must match contract v1 exactly and land first so tasks 3 and 5 can import it.
- Reuse vectors in `update` (acceptance criterion) — preallocate `THREE.Vector3`/`Box3` scratch.
- Mock `LightRegistry` and the event `bus` in the harness; do not depend on tasks 4/5 shipping.
- Follow repo conventions over brief-proposed paths (per Section 0). Existing entities to check for
  reuse/patterns: `src/entities/Drone.js`, `src/entities/Machine.js`, `src/level2/*`.
- Keep dynamic eye/scan visuals in code (emissive material on `Eye`, GLSL via `onBeforeCompile`);
  Blender node shaders won't survive export.
