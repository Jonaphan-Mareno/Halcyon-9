# Session Notes — Voss Crew Quarter (Level 2)

> **Superseded.** The `build_l2_voss.py` pipeline described below was replaced: the room is now
> placed by hand in `Blender/l2-atrium.blend` (collection `Bedroom1`) and exported with
> `Blender/scripts/export_l2_atrium.py`. See **`docs/voss-crew-quarter.md`** for the current
> feature doc. The notes below are kept for history only.

Status snapshot of the work on attaching the `Bedroom.blend` asset to the Level 2 atrium as
Voss's crew quarter, plus the conventions and pitfalls discovered along the way.

## What was built

- **`Blender/scripts/build_l2_voss.py`** — generates `Blender/l2-voss.blend` and
  `public/assets/models/l2-voss.glb` from `Blender/Bedroom.blend`, in the atrium's shared world
  coordinates (x east, y north, z up; gallery floor z = 5.5; atrium cylinder R = 17).
  The room sits behind `DOOR_VOSS` (atrium gap angle 0 / east, gap z 5.5..8.7, half-width 2.05).
- **`src/level2/HabitatSession.js`** — loads `l2-voss.glb` alongside atrium + lab, captures
  `DOOR_` colliders in `this.doorColliders`, and opens `DOOR_VOSS` on proximity: collider is
  removed once, then the door slides up 3.4 m over 1.2 s (eased), staying open.
- **`Blender/scripts/build_l2_atrium.py`** — the `Atrium_RoomBacks` placeholder box is now only
  created for KESSLER (the Voss one was removed since the real room exists).

## Build pipeline (the repo's existing pattern)

Each room = its own generator script authored in shared world coords + its own `.blend`/`.glb`,
all loaded together by `HabitatSession._load()` via `Promise.all`. Naming conventions the game
reads: `COL_` (static collider, removed from render), `DOOR_` (sliding doors), `SPAWN_`, `PT_`,
`PLANT_`, `ARIA_`.

Rebuild command (from repo root):

```bash
/home/vmuser/Downloads/blender-5.2.2-linux-x64/blender -b --factory-startup \
  --python Blender/scripts/build_l2_voss.py -- Blender/l2-voss.blend public/assets/models/l2-voss.glb
```

Dev server: `npm run dev` (Vite; port 5173 or 5174 if taken). **Hard-refresh (Ctrl+Shift+R) after
rebuilding a `.glb`** — the browser caches the old model aggressively.

## How the Voss build normalises the asset

`Bedroom.blend` is authored as a ~1:1.3 diorama and keeps getting re-saved at arbitrary
scale/position from the GUI, so the build must be scale/position-agnostic:

1. **The bed is the ruler**: measure `Cube.001..004` (frame + mattress) and scale everything so
   the bed is exactly `BED_LEN = 1.95` m long. Never trust the shell's object scale.
2. Re-centre on the shell footprint; delete junk (zero-scale objects and anything parked
   outside the footprint, e.g. the cluster at y ≈ 10).
3. **The authored outer `Cube` is NOT used as walls.** Its solidify left two inverted,
   overlapping skins (3 faces per side, no surviving door gap), so booleans eat whole walls.
   The build deletes it and builds a clean shell: floor, ceiling, four walls, 1.2 × 2.1 doorway
   in the +Y wall (which faces west into the hall after placement).
4. Room interior is fixed generous constants: `IX ±2.75`, `IY -3.60..2.20`, `H = 2.6`,
   wall thickness `T = 0.12`. The room may be wider than the atrium gap because its west wall
   closes the gap from behind; only a header bulkhead (`Voss_Bulkhead`) closes the gap above it.
5. Furniture is stood against walls in named groups (bed+shelves+bin → far corner; lockers →
   left wall; desk counter → left wall mid-room; `Cube.012` screen mounted over the desk;
   light slats `Cube.014..018` re-hung at the ceiling). In the diorama the furniture never
   touched its own shell, so without this it floats mid-room.
6. Placement: `world_x = (DOOR_X + IY1 + T) - local_y`, `world_y = local_x`, `world_z = Z + local_z`
   (rotation +90° about Z), `DOOR_X = 17.45` so `DOOR_VOSS` (arc at R 17.1..17.4) slides in front.
7. Collision: `COL_VossFloor`, `COL_VossWallN/S/E`, and the west wall split into
   `W1/W2/WTop` around the doorway.

Current room bounds: `x 17.45..23.49, y ±2.87, z 5.50..8.22`.

## Pitfalls hit (and fixed)

- **`DOOR_VOSS` empty sits at the world origin** (its arc panels are world-placed children), so
  `getWorldPosition()` is useless for a trigger point. Use
  `new THREE.Box3().setFromObject(node).getCenter()` instead (`HabitatSession._load`).
- `DOOR_` nodes get permanent static colliders in `_loadModel`; any door that opens must have its
  collider removed from `this.physics.world` first, or the player bumps into an invisible wall.
- Boolean DIFFERENCE on the inverted-normal shell removed entire walls → recalc normals first,
  or (current approach) don't boolean the authored shell at all.
- Scaling a shell about its centre moves the floor; always drop the room so its floor lands on
  z = 5.5 after placement.
- Headless EEVEE: engine enum is `BLENDER_EEVEE_NEXT` in 5.2 but wrap in try/except; blends saved
  without a world need `sc.world` guarded before `use_nodes`.
- Combining two `.blend` files headless: `bpy.ops.wm.append(directory='/Collection/')` fails;
  use `bpy.data.libraries.load()` + linking `dst.objects`.
- `bpy.ops.wm.open_mainfile` clears `bpy.data` — create materials/objects only after opening.

## Verification renders (throwaway, in `Blender/`)

`_voss_ext.png` (west face + doorway), `_voss_in.png` / `_voss_in2.png` (interior eye-height),
`_shell_*.png` (authored shell side views). Regenerate with a temp SUN/CAMERA; never save them
into the room blends.

## Open items (not started, need user direction)

- Kessler quarter: still an `Atrium_RoomBacks` placeholder box.
- Image textures for the bedroom asset: deferred by user.
- Cloth collisions/physics in `Bedroom.blend`: "require proper reworking" per user.
- `panel_Light 0-6`: user's intended naming for the light cubes; the asset actually has five
  emissive slats `Cube.014..018`, none named `panel_Light`.
- Chairs: an `add_bedroom_chairs.py` script exists (reuses `office_chair()` from
  `build_l2_lab.py`) but the user's re-saves keep deleting the chairs from `Bedroom.blend`;
  the voss build does not add chairs itself.
- `Thick+C-Shaped+Handle` objects are intentionally large (imported that way) — not a bug.
