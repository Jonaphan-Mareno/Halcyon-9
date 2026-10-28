# Session notes — 2026-10-04

**Branch:** `level1-ending-fix`
**Scope:** from the `controlroom.glb` / ARIA breakage through to the level 1 → level 2 elevator transition.
**State at end:** `node --check` clean, `npm run build` clean, floor-fix harness ALL CHECKS PASSED. Three files modified and **uncommitted**.

```
src/Game.js          | 101 ++++++++++++++++++++++++++++++++++-----
src/core/Controls.js |  21 ++++++----
src/levels/Level1.js |  97 +++++++++++++++++++++++++++++++++++
3 files changed, 202 insertions(+), 17 deletions(-)
```

Commits made along the way: `3b8c062` (merge of `Keypad-combination/exit`, tip `bcf1ab6`, base `9cba185`, plus the ARIA fix) and `8adbc21` (duplicate lights removed, elevator bounds updated).

---

## 1. The Blender issue: ARIA invisible, room lights dead

### Symptoms
After the merge brought in the re-exported `public/assets/models/controlroom.glb`, ARIA never appeared on the wall monitor once the first puzzle was solved, and the room lights never came on.

### Three separate root causes

**(a) The screen object was renamed between exports.**
`level-2-lab` exports the 881-vertex screen as node+mesh `Monitor_wall_01` (Material.074, clean 0..1 planar `TEXCOORD_0`). The `Keypad-combination/exit` lineage exports the **identical** geometry — same 881 verts, same transform `[2.784, 0.028, -5.996]`, same Material.074 — as node+mesh `Sphere.008`, and hands the freed name `Monitor_wall_01` to the 112-vertex **bezel** (mesh `Plane.070`, Material.072).

`AriaManager.collectMonitors()` matched names containing `"monitor"`, so it grabbed the bezel. The real screen kept its black material and rendered in front of it.

> An earlier conclusion — "hide `Sphere.008`, it's a leftover duplicate" — was **wrong** and would have discarded the real screen. When two coincident meshes look like duplicates, decide which is the visible surface *before* hiding either.

**(b) The screen lost `TEXCOORD_0`.**
`vUv` defaults to `(0,0)`, so ARIA's fragment shader hits its `luminance < 0.05` discard and renders nothing under `AdditiveBlending`.

**(c) Lights dropped, then came back duplicated.**
The first re-export shipped no `KHR_lights_punctual` at all (exporter option off), so `this.lights` was empty and the power/flicker logic modulated nothing. A later re-export restored the extension but with duplicates — `Point.007`–`.012` copying `.001`–`.006`, `Sun.001` copying `Sun` — giving 16 lights against `MAX_LIGHTS = 9`.

### Fix: code shims, not Blender edits

Deliberately implemented in code so the level **survives the next re-export** instead of depending on someone remembering exporter checkboxes.

| Where | What |
| --- | --- |
| `Level1.js` | `WALL_SCREEN_NAMES` alias list |
| `Level1._resolveWallScreen()` | Collects every alias present and keeps the one whose world `Box3` is **contained by** the others (glass always sits inside its own bezel); returns the rest as `frames` |
| `Level1._ensureMonitorUVs()` | **Unconditionally** rebuilds planar UVs along the thinnest local axis — `u = 1 - normalized local Y`, `v = normalized local Z`. Reproduces level-2-lab's shipped UVs to `1.3e-3` |
| `Level1._dedupeLights()` | Collapses duplicate punctual lights by transform + color + intensity, trims to `MAX_LIGHTS - 1`, shedding directional lights first |
| `AriaManager.collectMonitors(glb, { screen, ignore })` | Adds the resolved screen first, skips the bezels so they keep their room material |
| `AriaManager.pinMonitor(meshOrName)` | Accepts a mesh, not just a name |

Result: 16 lights → 8 on the merged export; 8 → 8 unchanged on level-2-lab.

### The gotcha that cost the most time

`THREE.GLTFLoader` runs every node name through `PropertyBinding.sanitizeNodeName`, which strips `. : / [ ]` and replaces spaces. So:

- GLB node `Sphere.008` → runtime `Sphere008`
- GLB node `Plane.066` → runtime `Plane066`

The first version of the fix used dotted names, **passed a headless harness** (which built meshes with raw GLB names), and only failed in the browser. Any alias list or name regex written from GLB/Blender names must be dot-free — and name matching must be verified through the real loader.

Two related traps:
- A `.blend` and its exported `.glb` on the same branch can be out of sync. `level-2-lab`'s `controlroom.blend` already names the screen `Sphere.008` while its `controlroom.glb` still says `Monitor_wall_01`. **Reading object names in Blender tells you nothing about what the running code sees** — diagnose against the GLB's JSON chunk.
- The presence of `TEXCOORD_0` is not proof of usable UVs. Blender's Smart UV Project produces present-but-fragmented islands that break full-screen sampling exactly as badly as a missing attribute. Validate the value distribution, not the feature flag.

---

## 2. "Apparently I still have unmerged files?"

`git status` still reported `UU src/Game.js` even though the working tree was correctly resolved.

**Cause:** merge resolution lives in the **index**, not the file. `UU` persists until `git add`, regardless of file contents.

Verified rather than trusted, then staged:

- 0 conflict markers; `node --check` OK
- Line counts — working **1151** / base 838 / ours 871 / theirs 1118
- Method-set union — base 36, ours 38, theirs 41, working **43**. Ours contributed `_initLevel2`, `updateLevel2`; theirs contributed `enterKeypadMode`, `exitKeypadMode`, `onKeypadSubmit`, `resumePlayerControls`, `updateCameraTransition`. All present, nothing extra.
- Line-level coverage (normalized/trimmed/non-blank) — ours 20 distinct changed lines, theirs 151; **0 dropped from either side**

### The trap worth remembering

Before committing, checked whether the ARIA fix was actually *in the index*:

```bash
git show :src/levels/Level1.js | grep -c "_resolveWallScreen\|WALL_SCREEN_NAMES\|ignore: frames"
```

It came back empty for both `Level1.js` and `AriaManager.js`. **Committing at that moment would have silently reverted the entire ARIA fix.** Staged `Level1.js`, `AriaManager.js` and `style.css` (the latter a genuine Vite path fix, `/public/assets/...` → `/assets/...`, not churn), re-grepped to confirm, and left the Blender binaries and `package-lock.json` unstaged as the user's call.

Lesson: a resolved conflict file with no markers still blocks the commit, and staging the resolution can hide the fact that *other* files' work is unstaged.

---

## 3. The elevator launch: "gets shot up into the ceiling"

### The user's diagnosis was geometrically correct

Facts pulled from `controlroom.glb` by parsing the GLB by hand (12-byte header, JSON chunk length at offset 12, BIN at `20 + jsonLen + 8`, `accessors[].min/max` for POSITION):

- True level bounds: x `[-9.88, 7.34]`, y `[-0.10, 6.56]`, z `[-9.09, 4.74]` → Y clamp `minY 2.50`, `maxY 6.26`
- The room shell `Cube` ends at **z = 2.0**
- `ElevatorCabin` spans z `[2.20, 4.74]` — literally **beyond the room bounds**, as reported
- `Cabin_Floor` y `[-0.10, 0.05]`, `Cabin_Ceiling` y `[3.40, 3.51]`, `Cabin_LightStrip` y `[3.37, 3.41]` → interior height only **3.35 m**

### Cause chain

Level 1 uses `src/core/Controls.js` — a raycast floor-follower, no physics, no jump. `updateFloorHeight` cast from `pos.y + 1.0` downward and **trusted `hits[0]`**.

Standing in the cabin puts the camera at `y = 2.65` (`eyeHeight 2.6`), so the probe origin sits at **3.65 — above the ceiling slab**. Every level material is `THREE.DoubleSide`, and `Mesh.raycast` reports both faces, so the downward ray's nearest hit is the ceiling's **top** face:

```
IN THE ELEVATOR CABIN   camera (4.48, 2.65, 3.47)   ray origin y=3.65
    Cabin_Ceiling    y=3.496  d=0.154  normal.y=+1.00   <-- taken as "the floor"
    Cabin_Ceiling    y=3.416  d=0.234  normal.y=-1.00
    Cabin_LightStrip y=3.401  d=0.249  normal.y=+1.00
 => targetY = 3.496 + 2.6 = 6.096 ; settles ~5.99-6.10 (maxY clamp 6.26 never catches it)

IN THE MAIN ROOM        camera (0.00, 2.60, -6.00)  ray origin y=3.60
    Cube             y=0.040  d=3.560  normal.y=+1.00   => targetY = 2.640
```

It is **self-sustaining**: rising lifts the probe further above the ceiling, so the same surface keeps being picked. The main room is unaffected only because its ceiling (~6.5) is above the 3.6 origin.

### First attempt was insufficient — and why that matters

Adding a below-eye + faces-up filter passed at the cabin centre (`2.636`) and left the main room unchanged (`2.640`), but a grid sweep still had **123** launched spots and the fine cabin grid **FAILED** at `(3.2, 2.7) → 6.09`.

The reason was a second-order chain: at that spot the player is *first* lifted onto `Console_Panel` (top `y = 1.357` → eye `3.957`), and **then** the ceiling (`3.487`) is below eye level again and becomes eligible. Runaway.

That spot is exactly where the player must stand to click the console screen — the two tasks were adjacent.

### The actual fix: ground snap, not nearest hit

> The floor he is standing on is the **highest upward-facing surface within one step of his feet**.

```js
const feet = pos.y - this.eyeHeight;
const floor = hits.find(
  (hit) => hit.point.y <= feet + this.maxStepUp && this._facesUp(hit)
);
if (!floor) return;
```

New fields: `floorProbeLift = 1.0`, `maxStepUp = 0.45`, `_hitNormal`, and `_facesUp(hit)` using the world-space normal (`> 0`). Descending stays unlimited, so drops and stairs still work; ascending is capped.

`maxStepUp` at 0.40 / 0.45 / 0.50 / 0.60 all give **identical** results, so the value is insensitive. 0.45 chosen as a generous stair riser, far below the 1.33 m console teleport.

### Verification (re-run at the end of the session, still green)

Drove the **real** `Controls.prototype` via `Object.create(Controls.prototype)` against 133 meshes rebuilt from the GLB with `sanitizeNodeName` + `DoubleSide`:

```
=== the reported bug: standing in the lift cabin ===
  OLD settled pos.y = 6.096
  PASS  NEW settles on Cabin_Floor at y=2.636 (expected ~2.65)
  PASS  player stays BELOW the cabin ceiling (3.40), not on the roof
=== no regression in the main room ===
  PASS  main room settles at y=2.640 (expected ~2.64, same as before)
=== grid sweep: every walkable spot, old vs new ===
  sampled 778 floor positions
  OLD: max settled y=6.26 at (-0.5,-8.3), 159 spot(s) launched above y=3.9
  NEW: max settled y=3.02, 0 spot(s) above y=3.9
  PASS  no position anywhere in the level launches the player
  PASS  the sweep does reproduce the old bug (159 bad spot(s))
  PASS  every sampled position still finds a floor (none sank)
=== cabin corner coverage ===
  PASS  all cabin floor positions stay under the ceiling
ALL CHECKS PASSED
```

Two bonuses: it also removed two **pre-existing** main-room launches (`Cylinder` 4.47 at `(-9.0,-5.8)`, 6.26 at `(-0.5,-8.3)`), and it ends the old "brush against a tank, get teleported on top of it" behaviour.

---

## 4. Console screen → doors close → level 2

### What "Cube.040" actually is

There is **no node named `Cube.040`**. `Cube.040` is the Blender **mesh data-block** name; the exported **node** is `Console_Screen`. `GLTFLoader` names runtime objects after the node, so `Cube.040` is invisible at runtime. (`Console_Panel` → `Cube.039`.)

The capture therefore matches **either** name, since a re-export has already renamed this object once:

```js
if (child.isMesh && (cleanName === 'Console_Screen' || cleanName === 'Cube040')) {
  this.elevatorConsoleScreen = child;
}
```

Measurements: centre `(3.10, 1.46, 2.75)`, size `(0.03, 0.18, 0.26)`, faces **+x into the cabin**, 1.41 m above the cabin floor, mounted on `Cabin_Wall_Right` (x `[2.95, 3.06]`).

### There is no "close" animation

Two clips only — `Object003Action` and `Object006Action` — both 1.25 s, 30 keys, LINEAR, both running **rest → open**:

- `Door_Left` x `5.050 → 6.609`
- `Door_Right` x `3.903 → 2.317`

So closing is the same clips played **backwards**: `reset()`, `setLoop(LoopOnce, 1)`, `clampWhenFinished = true`, `timeScale = -1`, `time = clip.duration`, `play()`. `closeElevatorDoor()` returns the seconds until shut so the Game can time the hand-off.

Verified headlessly through a real `AnimationMixer` on the actual clips at 60 fps:

```
OPEN   L.x=6.609 R.x=2.317  time=1.250
  f= 0 t=0.00 actionTime=1.250 L.x=6.609 R.x=2.317
  f= 1 t=0.02 actionTime=1.233 L.x=6.607 R.x=2.319
  f=30 t=0.50 actionTime=0.750 L.x=6.029 R.x=2.907
  f=60 t=1.00 actionTime=0.250 L.x=5.173 R.x=3.778
  f=75 t=1.25 actionTime=0.000 L.x=5.050 R.x=3.903
  f=90 t=1.50 actionTime=0.000 L.x=5.050 R.x=3.903   (clamped, does not wrap)
```

No first-frame snap, because the doors are already open when `closeElevatorDoor()` runs.

### `Level1.js` additions

- **State:** `doorClosed`, `elevatorConsoleScreen`, `elevatorRiding`, `_consoleCentre`, `onElevatorDepart`
- **Capture** in the `buildRoom()` traverse; `_consoleCentre` measured *after* `updateMatrixWorld(true)`, with a `console.warn` if the node ever goes missing again
- **`openElevatorDoor()`** now also calls `_rebuildInteractables()`, so the panel becomes usable when the doors open
- **`closeElevatorDoor()`** — reverse playback, returns the duration
- **`rideElevator()`** — guards on `elevatorRiding`/`doorOpened`, rebuilds interactables so the panel stops being clickable mid-ride, closes the doors, fires `onElevatorDepart(seconds)`
- **`_isConsoleScreenPart()`** — same parent-walk pattern as `_isKeypadPart`
- **`static CONSOLE_RANGE = 2.2`** — eye-to-screen is ≈1.29 m standing beside the console, ≈1.93 m from the doorway
- Branches in `getInteractPrompt` (`'Click or press E to ride the lift down'`), `canInteract`, `onInteract`
- `getWaypoint()` gained a `Keypad` stage and a `Lift` stage
- `dispose()` needed no change — the screen lives inside `this.room`

### `Game.js` additions — and the constraints that shaped them

Three facts about the existing architecture forced the design:

1. **`startLoop()` is a recursive `requestAnimationFrame` with no cancellation handle.** Calling it a second time doubles the loop.
2. **`UIManager`'s constructor creates DOM.** Instantiating it again duplicates every overlay element.
3. **Game's `click`/`keydown` listeners were anonymous arrows** — impossible to remove, so `tryInteract` would have thrown on `currentLevel === null`.

Changes:

- `_onDocClick` / `_onDocKeyDown` stored as named references so they can be taken back off
- `_departing` flag
- **`_mountLevel2(kind)`** extracted out of `_initLevel2()` — arriving from level 1, the renderer, camera, UIManager and the rAF loop all already exist and must not be remade
- **`onElevatorDepart(seconds)`** — introduces a `DEPARTING` state: freeze controls, unlock the pointer, hide reticle/prompt/waypoint/objective/HUD, fade the hum, toast `'Descending to the habitat deck...'`, then hand off after `seconds * 1000 + 700` ms
- **`_leaveForLevel2()`** — remove level 1's listeners; close puzzle/inventory/dialogue/toast; `currentLevel.dispose()`; drop `ringCloseBtn`; `replaceChildren(...keep)` on `#ui-layer` keeping `#welcome-screen`, `#reticle` and the seven UIManager elements; flip `level2Mode`; set `state = 'PLAYING'`; mount `HabitatSession`. Deliberately does **not** call `startLoop()` or `new UIManager()`.
- `update()` guards `if (!this.currentLevel) return;`

**Why `DEPARTING` had to join the `live` list:** `Level1.update()` is what drives `doorMixer.update(delta)`. Excluded from `live`, the doors would have frozen open mid-animation. `hud.setVisible` also had to exclude `DEPARTING`, or it re-shows the HUD every frame because `talkEnabled` is false by then.

`state = 'PLAYING'` matters because `HabitatSession`'s click-to-lock handler reads `game.state === 'PLAYING'` and nothing else sets it. `HabitatSession` reuses `game.camera.instance`, `game.scene`, `game.renderer.instance` and `game.ui`, installs its own `PlayerController` onto `game.controls`, and respawns the player at `SPAWN_Lift`.

---

## 5. Objectives for the way out

`OBJECTIVES` lost its terminal `'Power restored'` — the level no longer ends at the relay rings — and gained two actionable stages:

```js
  'Turn the relay rings until every marker lines up with the rail',
  'Use the security keypad beside the lift doors',
  'Step into the lift and press the call panel to go down'
```

`updateGuidance()`'s ladder was extended to match:

```js
    else if (!level.relaySolved) stage = 4;
    else if (!level.doorOpened) stage = 5;
    else stage = 6;
```

Notes:
- The "power restored" beat isn't lost — ARIA still says *"Perfect alignment! Look at those lights. Everything is back on."* Objectives are guidance, so pointing at the next action beats a dead end.
- Stages 5 and 6 fall outside `ARIA_IDLE_LINES` (5 entries) and `updateIdleQuip` already guards on `stage >= ARIA_IDLE_LINES.length`, so no idle quip fires on the way out.
- The waypoint ladder matches the objective ladder (`Keypad` at 5, `Lift` at 6), so arrow and text agree.

---

## Open items

| Item | Note |
| --- | --- |
| **The lift is not gated on finishing level 1** | `openElevatorDoor()` needs only the keypad code; `rideElevator()` only needs `doorOpened`. A player can walk straight to the keypad and descend without solving the relay. Deliberate, to keep the ending easy to test — a one-line guard in `onKeypadSubmit` would lock it behind `relaySolved`. |
| **Full end-to-end browser run not automated** | The keypad → walk in → click → descend path was not driven headlessly. A temporary `window.__game` hook was added to `main.js` for that purpose and then **reverted** (`git diff src/main.js` is empty). |
| **Blender assets still out of sync** | The code shims are deliberately tolerant, so a re-export won't regress. Cleaning up the duplicate lights in Blender is now optional, not required. |
| **`package-lock.json`** | One `"peer": true` removed — npm churn. Left unstaged. |
| **Working tree uncommitted** | `src/Game.js`, `src/core/Controls.js`, `src/levels/Level1.js`. |
| **Stray dev server** | Running in the background on port **5174** (5173 was already in use). |

---

## Analysis tooling

All throwaway scripts live in `/tmp/glbcmp/`, outside the repo, so there is nothing to clean out of git:

`elev.mjs` (world matrices + per-node AABBs) · `floor.mjs` (ray replay against rebuilt meshes) · `dbg.mjs` (per-hit dump) · `rule.mjs` (compares candidate floor rules) · `verify.mjs` (the harness quoted above, drives the real `Controls.prototype`) · `cube040.mjs` · `anim.mjs` (clip tracks) · `scr.mjs` (console geometry) · `doors.mjs` / `doors2.mjs` (reverse-playback check)

Plus `/tmp/mset.py` (method-set union) and `/tmp/lset.py` (line-level merge coverage) from the merge verification.
