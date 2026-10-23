# Session Notes — Level 2 Atrium & Crew Quarters

Record of the session on the Level 2 habitat atrium: restoring the RoboArm animation and rigs, regenerating room collision and placements, fixing the Sci-fi-Bed export textures, clad texturing both entire bedroom shells (walls, roof, and floor) with Poly Haven Metal Plate 02, diagnosing and fixing the untextured bedroom corner (`Kess_WallW`), and adding the interactive Bedroom 2 FuseBox with the standard prompt textbox.

## Reload / re-export commands

From the repo root, in this order:

```bash
# 1. save the .blend in the Blender GUI (Ctrl+S). NEVER File > Export - a manual GUI
#    export bypasses the colour graft and the collider generation entirely.

# 2. export (the wrapper is safe whether or not the blend currently contains the
#    RoboArm rigs: it reports wired rooms as "already wired … left exactly as placed")
/home/vmuser/Downloads/blender-5.2.2-linux-x64/blender -b --factory-startup \
  Blender/l2-atrium.blend --python Blender/scripts/export_l2_atrium_with_rigs.py

#    plain variant (opens the blend itself; use once the rigs are saved into the blend)
/home/vmuser/Downloads/blender-5.2.2-linux-x64/blender -b --factory-startup \
  --python Blender/scripts/export_l2_atrium.py -- [out.glb]

# 3. verify the shipped file (skins, animations, COLOR_0, colliders, textured props)
python3 Blender/scripts/verify_l2_glb.py

# 4. optional: refresh the placement JSONs (only needed after moving/renaming props)
/home/vmuser/Downloads/blender-5.2.2-linux-x64/blender -b --factory-startup \
  --python Blender/scripts/export_bedroom_placements.py

# 5. hard-refresh the browser (Ctrl+Shift+R) - .glb files are cached aggressively.
#    Dev server: npm run dev, then http://localhost:5173/?level=2 spawns at the lift.
```

Export log lines to expect: the rig line per room (`already wired …` or the append +
verify), any prop-texture repairs (`Sci-fi-Bed: 2 texture(s) rewired to UV, rebuilt
['Material.008', 'Material.007'], 5851 faces box-projected`), the collider lines
(`Bedroom1: door local z …, 8 envelope + 23 object colliders`, `Bedroom2: … 8 envelope +
29 object colliders`), then `exported …/l2-atrium.glb`. The verifier's healthy output:

```
meshes 203  nodes 289  skins 2  animations 2  materials 91
meshes with COLOR_0: 41/203
collider nodes: 72   (Voss: 31, Kess: 37, each room's Floor bounds printed)
animation: RoboArmAtureAction (21 channels)  +  RoboArmAtureAction.001
textured prop: Sci-fi-Bed  Fibra de carbono / aluminio / Display
```

## Summary of work done this session

1. **Re-adding RoboArm animations & armature rigs.**
   - Restored the RoboArm armature modifier and parent wiring in both `Bedroom1` (Voss) and `Bedroom2` (Kessler).
   - `Blender/scripts/readd_roboarm_rigs.py` was updated so that it skips rooms already wired in the `.blend` rather than flagging false-alarm "rollbacks" when comparing rest poses against posed armatures.
   - Verified that `RoboArmAtureAction` and `RoboArmAtureAction.001` export cleanly into `l2-atrium.glb` (2 skins, 2 animations).
   - `Blender/bedroom1.json` and `Blender/bedroom2.json` regenerated with complete transforms, bounds, and parent fields.

2. **Reworking room models & collision pipeline.**
   - Regenerated room colliders: 8 envelope box colliders plus exact furniture OBB colliders per room, baked into Rapier trimeshes under `COL_Voss*` / `COL_Kess*`.
   - Fixed door gap bounds and doorway west wall closures (`Kess_WallW`, `Voss_WallW`).
   - Extended `Blender/scripts/verify_l2_glb.py` as a permanent validator for skins, animations, `COLOR_0`, colliders, and WebP textures.

3. **The striped Sci-fi-Bed — root cause and exporter fix.**
   - Investigated why the user-authored Sci-fi-Bed exported white with orange stripes.
   - Identified that glTF exporters drop textures using `Generated`/`Object` coordinates, `Mix Shader` nodes, or inputs routed through `Normal`.
   - `export_l2_atrium.py` was updated to repair user-authored props in memory during export: rewires coordinates to UV, performs world-normalized box projection, and rebuilds material trees into standard Principled Base Color and live Emission.

4. **Whole-room metal cladding (walls, roof, and floor).**
   - Created `src/level2/ShellMetal.js` to clad the bedroom shells in scratched industrial steel plate.
   - Switched from ambientCG Metal046B to Poly Haven **Metal Plate 02** (diffuse, normal GL, roughness, metalness), credited in `CREDITS.md`.
   - Expanded cladding from only walls/roof to clad **the whole room** (walls, ceiling, and floor slab), rebuilding geometry unindexed with dominant-axis world-space box-projected UVs (`TILE = 2.2m`) and `DoubleSide` rendering.
   - Applied metal cladding to both bedroom shells: Voss's shell (`Cube`) and Kessler's shell (`Cube009`).

5. **Diagnosing and fixing the untextured bedroom corner (`Kess_WallW` / `Voss_WallW`).**
   - Investigated the visual bug where the corner wall of Bedroom 2 showed the metal plate texture from the outside, but appeared flat grey on the inside.
   - **Root Cause**: In `export_l2_atrium.py`, the exporter generates separate wall closure slabs (`Kess_WallW` and `Voss_WallW`) to seal the side slivers of the open doorway. `applyShellMetal` was originally only called on `['Cube009', 'Cube']`, omitting `Kess_WallW`. Because `Kess_WallW` retained `Material.001`, the downstream toon pass converted it to untextured flat grey paint. Sitting on the interior side of `Cube009`, it concealed the outer shell's texture.
   - **Fix**: Updated `applyShellMetal(model, ['Cube009', 'Cube', 'Kess_WallW', 'Voss_WallW'])` in `HabitatSession.js`. Both closure slabs are now cladded with the exact same world-space UV projection, eliminating the flat grey wall and seamlessly texturing the entire corner.

6. **Interactive FuseBox in Bedroom 2.**
   - Registered `FuseBox00.001` in Bedroom 2 as an interactable spot using the game's `Interact` system.
   - Handled Three.js GLTF node name sanitization (`FuseBox00001` vs `FuseBox00.001` vs `COL_Kess_FuseBox00`).
   - Corrected a 4.6 m pivot offset by computing the mesh's true geometric bounding-box center (`Box3.setFromObject(...).getCenter(...)`) and nudging `fusePos.x` forward into the room so physics line-of-sight raycasts are completely unobstructed.
   - Bound to the standard in-game interaction prompt textbox (`#interact-prompt`) displaying `E   Use FuseBox`, with action feedback via `ui.showToast('FuseBox used.', 2500)` without triggering Voss speech.

---

## Detailed Technical Notes

### 1. The Striped Sci-fi-Bed (Bedroom 2)
The bed is authored directly in the atrium `.blend`. In the viewport it looks correct; in the game it went out white with orange stripes because the glTF exporter silently drops image textures when:
- Sampled through `Texture Coordinate → Generated` (or Object) — glTF only samples by UV.
- Routed through a **Mix Shader** surface (carbon-fibre body: `Generated → Diffuse → Mix`).
- Feeding the **Normal** input (aluminium trim: `Generated → Principled.Normal` over an orange metallic base colour; with the normal texture dropped, that base colour was the stripes).

`export_l2_atrium.py` repairs user-authored props at export time in memory: textures wired through Generated/Object are rewired to UV and their faces box-projected (dominant-axis projection normalized to object bounds), and trees the exporter cannot carry are rebuilt around their first image texture into a Principled Base Color.

### 2. Whole-Room Shell Metal Cladding (`ShellMetal.js`)
- `src/level2/ShellMetal.js` loads the Poly Haven Metal Plate 02 set from `public/assets/textures/Metals/Metal_plate/`:
  - `metal_plate_02_diff_1k.jpg` (sRGB Base Color)
  - `metal_plate_02_nor_gl_1k.jpg` (Normal GL, scale 1.5)
  - `metal_plate_02_rough_1k.jpg` (Roughness)
  - `metal_plate_02_metal_1k.jpg` (Metalness)
- Meshes are converted to non-indexed geometry (`toNonIndexed()`).
- UVs are reconstructed in world metres:
  ```javascript
  const ax = Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z) ? 0
    : (Math.abs(n.y) >= Math.abs(n.z) ? 1 : 2);
  uv.setXY(i, (ax === 0 ? p.z : p.x) / tile, (ax === 1 ? p.z : p.y) / tile);
  ```
- All faces (walls, roof, floor) take `bed_shell_metal` with `side: THREE.DoubleSide` and `TILE = 2.2`.
- Called in `HabitatSession.js`:
  ```javascript
  applyShellMetal(model, ['Cube009', 'Cube', 'Kess_WallW', 'Voss_WallW']);
  ```

### 3. The Untextured West Corner Bug
- **Geometry Setup**: `Cube009` (Kessler's shell) was authored as an open extrusion facing the west corridor. `export_l2_atrium.py` generated `Kess_WallW` (and `Voss_WallW`) to cap the side sliver next to the door.
- **The Bug**: `applyShellMetal` was originally called only on `['Cube009', 'Cube']`. `Kess_WallW` on the inside of the room kept `Material.001` and was converted to toon grey by `HabitatSession._loadModel`. From the outside, `Cube009` showed metal; from the inside, `Kess_WallW` covered it in flat grey.
- **The Solution**: Adding `Kess_WallW` and `Voss_WallW` to `applyShellMetal` clads both closure slabs in `bed_shell_metal` with the same world-space UV projection, ensuring complete, seamless metal plating throughout the room.

### 4. Bedroom 2 FuseBox Interaction
- In `HabitatSession.js`, the FuseBox was hooked into `this.interact`:
  ```javascript
  const fuseBoxObj = atrium.getObjectByName('FuseBox00001') || atrium.getObjectByName('FuseBox00.001') || atrium.getObjectByName('COL_Kess_FuseBox00');
  if (fuseBoxObj) {
    const fusePos = new THREE.Box3().setFromObject(fuseBoxObj).getCenter(new THREE.Vector3());
    fusePos.x += 0.12; // nudge into the room to ensure clear line of sight
    this.interact.add({
      id: 'fusebox',
      position: fusePos,
      radius: 0.6,
      reach: 2.8,
      label: 'Use FuseBox',
      use: () => this.game.ui.showToast('FuseBox used.', 2500)
    });
  }
  ```
- Using `Box3.getCenter()` fixed the 4.6 m pivot offset where `getWorldPosition()` pointed to the empty node origin far away in the wall.
- Using `label: 'Use FuseBox'` activates the standard `#interact-prompt` UI box (`E   Use FuseBox`).
- Using `ui.showToast()` provides clean interactive feedback without triggering Voss monologue subtitles.

---

## Files

| File | Role |
|---|---|
| `Blender/bedroom.blend` | **Content source.** The room at origin, vertex-coloured furniture, materials, the RoboArm rig + action. |
| `Blender/l2-atrium.blend` | **Placement source.** Atrium + `Bedroom1` + `Bedroom2` collections. Edit placement here; save before exporting. |
| `Blender/scripts/export_l2_atrium.py` | Exports to `public/assets/models/l2-atrium.glb`: grafts colours/materials, builds collision envelopes + furniture colliders, generates `Kess_WallW` / `Voss_WallW`, repairs user-prop textures. |
| `Blender/scripts/export_l2_atrium_with_rigs.py` | Export wrapper: verifies/restores missing RoboArm rigs in memory, then runs export. |
| `Blender/scripts/readd_roboarm_rigs.py` | Rig restore logic; skips rooms already wired and preserves manual posing. |
| `Blender/scripts/verify_l2_glb.py` | Post-export validator: skins, animations, `COLOR_0`, colliders, and textured props. |
| `Blender/scripts/export_bedroom_placements.py` | Generates `Blender/bedroom1.json` and `bedroom2.json` (transforms, dimensions, hierarchy). |
| `src/level2/HabitatSession.js` | Loads the GLB, colliders, doors, toon materials, panel lights, shell metal cladding, and interactions. Preloads Robot model. |
| `src/level2/ShellMetal.js` | Full-room metal cladding module (Poly Haven Metal Plate 02) with world-space box-projected UVs. |
| `src/level2/Interact.js` | Raycast-based interaction targeting system. |
| `src/level2/Garden.js` | Garden fight: spawns drones and robots, water hose, freeze mechanic, robot warning toast. |
| `src/entities/Drone.js` | Base drone class: state machine, movement, combat interface. Subclassed by Robot. |
| `src/entities/Robot.js` | Robot subclass of Drone: loads Robot.glb, A6 head-lamp danger light, ice block, fallback visual. |
| `src/level2/Drone.js` | Procedural garden drone (self-contained, unchanged). |
| `src/ui/UIManager.js` | Manages `#interact-prompt` (`E   <label>`), toasts, objective waypoints, and dialogue boxes. |
| `CREDITS.md` | Attribution for textures and CC0 assets. |

---

## Pitfalls & Key Rules to Remember

1. **GLTFLoader Node Name Sanitization**: Three.js `PropertyBinding.sanitizeNodeName` strips dots from node names (`FuseBox00.001` becomes `FuseBox00001`), but material names retain dots (`Material.001`). Always support both naming conventions when looking up nodes.
2. **Object Origin vs Mesh Geometry**: In Blender, an object's pivot point may not align with its vertices. Always compute bounding-box centers (`new THREE.Box3().setFromObject(obj).getCenter(...)`) when placing interaction spots or collision bounds.
3. **Physics Raycast Occlusion**: `Interact.js` casts a ray from the player's eye to `spot.position`. If `spot.position` lies inside a mesh or static collider, the ray hits the obstacle and fails the `_clear` test. Nudge interaction targets slightly off the wall into the room.
4. **glTF Texture Drops**: Always verify exported GLBs with `verify_l2_glb.py`. Generated coordinates, mix shaders, and texture-in-normal nodes are dropped silently by standard glTF exporters.
5. **Always Save Before Exporting**: The exporter runs on the on-disk `.blend` file. Never use Blender's manual GUI Export dialog; run `export_l2_atrium_with_rigs.py`.

---

## Robot Class Extension (Drones + Robots in the Atrium)

### Summary

Extended the drone system by creating a `Robot` class that inherits from a new base `Drone` class. Robots use the `Robot.glb` model from `public/assets/models` and spawn alongside the existing procedural drones during the garden fight (wave 2 onward). The robot's head lamp (node `A6`, mesh `Circle.008` inside Robot.glb) flashes red only when the robot is about to attack (telegraph state), otherwise it keeps its authored color.

### Changes Made

1. **Base Drone class (`src/entities/Drone.js`)**
   - Refactored from a stub into a full base class with the shared state machine: `drop`, `circle`, `telegraph`, `dive`, `recover`, `frozen`, `dead`.
   - Provides the movement logic (`_hold`, `_lookAt`, `_twitch`), combat interface (`attack`, `soak`, `freeze`), and wet/dry visual effects.
   - Subclasses override `_buildVisual()` to provide their own mesh representation.
   - The existing `src/level2/Drone.js` (procedural garden drone) remains unchanged and self-contained.

2. **Robot class (`src/entities/Robot.js`)**
   - Extends `Drone` from `src/entities/Drone.js`.
   - Loads `public/assets/models/Robot.glb` asynchronously; the model is loaded once and shared (cloned per instance).
   - Auto-scales the model to drone-hover height and centres it on the group origin.
   - Finds the A6 head lamp (mesh `Circle.008`) and uses it as the attack indicator: the lamp flashes red during the telegraph (about to dive), otherwise keeps its authored color. Darkens when frozen or removed.
   - Collects any rotating parts (`rotor`, `propeller`, `blade`, `fan`) as spinning blades.
   - Adds an ice block mesh for the frozen state.
   - Supports animation clips from the GLB via `AnimationMixer`.
   - Falls back to a simple box robot if the GLB fails to load.
   - `Robot.preload()` static method preloads the model during level init so the first spawn is instant.

3. **Garden integration (`src/level2/Garden.js`)**
   - Imports `Robot` from `../entities/Robot.js`.
   - Added `ROBOT_CHANCE = 0.4` constant (40% chance a spawn is a robot from wave 1 onward).
   - Modified `_spawn()` to sometimes create a `Robot` instead of a `Drone`.
   - Added `_activateDangerIndicator()` method: shows a one-time `WARNING: HOSTILE UNITS DETECTED` toast when the first robot spawns. The red light itself lives on the robot (see Robot.js), not in the atrium.

4. **HabitatSession integration (`src/level2/HabitatSession.js`)**
   - Imports `Robot` from `../entities/Robot.js`.
   - Calls `Robot.preload()` during the level load phase (parallel with other model loads).

### Architecture

```
src/entities/Drone.js   (base class: state machine, movement, combat)
       ^
       |
       +--- src/entities/Robot.js   (Robot.glb model, animation, sensor eye)
       |
       +--- src/level2/Drone.js     (procedural garden drone, unchanged)
```

Both `Robot` and the level2 `Drone` share the same behavioral interface (`attack`, `soak`, `freeze`, `remove`, `alive`, `position`, `update(ctx)`), so the Garden's update loop, water jet, freeze, and shatter logic work identically for both.

### Files

| File | Role |
|---|---|
| `src/entities/Drone.js` | Base drone class: state machine, movement, combat interface. |
| `src/entities/Robot.js` | Robot subclass: loads Robot.glb, A6 head-lamp danger light, ice block, fallback visual. |
| `src/level2/Garden.js` | Garden fight: spawns both drones and robots, robot warning toast. |
| `src/level2/HabitatSession.js` | Level 2 session: preloads Robot model. |
| `public/assets/models/Robot.glb` | The robot 3D model used by the Robot class. |

### Notes

- The first wave (2 drones) is always procedural drones so the player learns the mechanic.
- From wave 2 (10 spawns), exactly half are robots (alternating: drone, robot, drone, ...).
- The `A6` lamp (mesh `Circle.008`) is a node INSIDE Robot.glb, not an atrium object: it flashes red only during the telegraph (about to dive), otherwise keeps its authored material color. The lamp darkens when the robot freezes or is removed. The wet look skips it so spraying never greys it out.
- Robot.glb parts are named A1..A9 (+NurbsPath); the model is ~3.3 m tall as authored, scaled to 0.45 m in game.
- The model is centred with its feet at the group origin; the half-height offset must not be divided by the model scale (that bug floated the robots ~1.6 m above their hover height).
- If `Robot.glb` fails to load, a fallback box robot is used so gameplay is not blocked.
- Hover height tightened to 1.8–2.2 m and range to 3.5–5.0 m so drones/robots feel close to the player.
- Hit detection requires the drone to be within 1.2 m vertically of the player, preventing hits from directly overhead.
- Ice block is sized dynamically from the robot's bounding box with 0.35 m padding and parented to the robot group at the box centre, so it always wraps the whole robot.
