# Feature: Voss Crew Quarter (Level 2 atrium)

Voss's bedroom is a hand-authored Blender room that sits behind the `DOOR_VOSS` gap on the east
side of the Level 2 atrium. It is placed by hand in the Blender GUI and shipped inside the atrium
model; a small export script adds collision and carries the vertex colours through to glTF.

This replaces the earlier `build_l2_voss.py` approach (procedural rebuild + separate `l2-voss.glb`),
which is now unused.

## Files

| File | Role |
|---|---|
| `Blender/bedroom.blend` | **Content source.** The room modelled at the origin, with vertex-coloured furniture (`Col` attribute) and its materials. Edit geometry/colours here. |
| `Blender/l2-atrium.blend` | **Placement source.** Contains the atrium plus a `Bedroom1` collection: a copy of the bedroom objects moved/rotated/scaled into position behind the gap. Edit placement here. |
| `Blender/scripts/export_l2_atrium.py` | Exports `l2-atrium.blend` as authored to `public/assets/models/l2-atrium.glb`, copying colours/materials from `bedroom.blend` and generating `COL_Voss*` collision. Never writes to any `.blend`. |
| `public/assets/models/l2-atrium.glb` | Runtime model: atrium + room + room collision in one file. |
| `src/level2/HabitatSession.js` | Loads `l2-atrium.glb` + `l2-lab.glb`; `COL_`/`DOOR_` nodes become static colliders; `DOOR_VOSS` opens on proximity. No separate room asset is loaded anymore. |
| `Blender/l2-atrium.no-bedroom.bak.blend` | Backup of the atrium file from before the `Bedroom1` collection was recovered. Safe to delete once the current file is trusted. |

Superseded (kept for history, not used by the game): `Blender/scripts/build_l2_voss.py`,
`Blender/l2-voss.blend`, `public/assets/models/l2-voss.glb`.

## Export

From the repo root:

```bash
/home/vmuser/Downloads/blender-5.2.2-linux-x64/blender -b --factory-startup \
  --python Blender/scripts/export_l2_atrium.py            # optional: -- path/to/out.glb
```

Expected log lines:

```
coloured 24/24 meshes from bedroom.blend
Bedroom1 bounds x 17.31..25.04  y -2.63..5.01  z 5.61..8.75
exported .../public/assets/models/l2-atrium.glb
```

Then **hard-refresh the browser (Ctrl+Shift+R)** at `http://localhost:5173/?level=2`; `.glb` files
are cached aggressively.

## What the export script does

1. Opens `l2-atrium.blend`; deletes any leftover `COL_Voss*` / `Voss_WallW` objects (idempotent).
2. Forces the `Bedroom1` collection and its objects visible (the exporter uses `use_visible=True`).
3. For every mesh object in `Bedroom1`, appends the same-named object from `bedroom.blend` and
   copies **only** its material slots and its `Col` colour attribute onto the placed mesh
   (loop/polygon counts must match; otherwise the object is skipped and reported). The placed
   geometry itself is left untouched — see "Why geometry is not swapped" below.
4. Rewires the authored `Attribute → Diffuse BSDF` material trees into
   `Color Attribute → Principled BSDF` (base white, roughness 0.85, metallic 0). The glTF exporter
   only emits `COLOR_0` through this node setup. Emission materials (light slats) pass through
   unchanged.
5. Computes the world bounds of `Bedroom1` and builds thin (`T = 0.12`) collision boxes around it in
   a `Voss_Collision` collection: `COL_VossFloor`, `COL_VossCeil`, `COL_VossWallN/S/E`, and the
   west face split around the atrium gap (`GAP_Y = ±2.07`, `GAP_Z1 = 8.7`): `COL_VossWallW1`,
   `COL_VossWallW2`, `COL_VossWallWTop`. A visible `Voss_WallW` panel (shell material) covers the
   portion of the open west face that lies outside the door gap so the player can't see out.
6. Exports GLB with `export_apply=True`, `export_yup=True`, WebP images — the same settings as
   `kit.finish()` used by the other room builders.

## Runtime (HabitatSession)

- `_loadModel()` iterates the GLB's root nodes: anything prefixed `COL_` or `DOOR_` gets a Rapier
  trimesh collider; `COL_` nodes are then removed from the render scene.
- `DOOR_VOSS` is read from the atrium model. Its empty sits at the world origin, so the trigger
  point is the `Box3` centre of the node, not `getWorldPosition()`. On proximity the collider is
  removed once and the door slides up.
- Room floor is at z 5.61 vs gallery floor 5.5; the 11 cm step is within the player controller's
  autostep (0.62 m).

## Authoring workflow

- **Change the room's look** (geometry, colours, materials): edit `bedroom.blend`, save, re-export.
  Object names must stay the same in both files, and topology must not change — otherwise re-append
  the object into `l2-atrium.blend`'s `Bedroom1` collection and re-place it.
- **Move / rotate / rescale the room**: edit the `Bedroom1` objects in `l2-atrium.blend`, save,
  re-export. Collision follows the new bounds automatically.
- **Before saving `l2-atrium.blend`**, check the Outliner shows the `Bedroom1` collection. The
  placement was lost once by saving a session that didn't contain it and had to be recovered from
  `/tmp/l2-atrium_<pid>_autosave.blend`.
- **Do not run `build_l2_atrium.py`** on the current file: it regenerates the atrium from scratch
  and would discard `Bedroom1`.

## Why geometry is not swapped

The `Bedroom1` copy in `l2-atrium.blend` and the objects in `bedroom.blend` share names and
topology but are baked differently: the placed copy has rotation/scale applied into its vertices
(e.g. `Shelf00` local dims 1.03×1.11×0.29 vs 0.4×1.4×1.51; `ShipDevice` 0.19 vs 5.0). Replacing the
placed mesh data with the source mesh data keeps the placed object transforms but puts
different-sized geometry under them, which produced squashed bunks and shelves. Copying only
colours and materials keeps the room exactly as placed.

## Blender API gotchas encountered

- `bpy.data.libraries.load(path, link=False)` **reuses an existing local ID of the same name**
  instead of importing a fresh copy. Rename the stale IDs (`OLD_` prefix) before appending.
- `data_to.objects = my_list` **fills `my_list` in place** with the loaded objects on exiting the
  `with` block. Pass a copy (`list(wanted)`) if you still need the names.
- `bpy.data` is restricted inside the `with libraries.load(...)` block — compute object names
  beforehand.
- Appended objects whose names clash arrive renamed (`AlarmLamp00.001`) but in request order, so
  `zip(wanted, data_to.objects)` maps them back.
- The user's visible Blender work may exist only in the open GUI session or in an autosave; always
  dump the on-disk file headlessly before concluding a build script is wrong.

## History of approaches (for context)

1. Procedural rebuild with bed-pinned scale (`build_l2_voss.py`) — fought the authored file every
   time it was re-saved. Removed at user request.
2. Pass-through export of `bedroom.blend` + numeric transform (scale 2.094, loc 21.348/1.916/5.806,
   rot 90/0/−178.5) — tipped the room on its side / left it at the origin, because the on-disk file
   was already upright and the furniture has no common parent.
3. Export the room as placed in `l2-atrium.blend` (current). Colours were missing because the
   `Bedroom1` copy predated the colouring; fixed by copying colours/materials from `bedroom.blend`.
   First fix swapped whole meshes and broke the scaling; corrected to attribute/material copy only.

## Open items

- Remove `build_l2_voss.py`, `l2-voss.blend`, `l2-voss.glb` once confirmed unneeded.
- Optionally make `build_l2_atrium.py` preserve the `Bedroom1` collection when regenerating.
- Kessler quarter still uses an `Atrium_RoomBacks` placeholder box.
- Image textures / cloth physics for the bedroom asset: deferred.
