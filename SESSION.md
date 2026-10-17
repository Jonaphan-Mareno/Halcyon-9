# Session Notes — Level 2 Atrium & Crew Quarters

Record of the 2026-10-17 session on the Level 2 habitat atrium: the re-export + integrity
check after the user's latest `.blend` edits, the rig-script fix and the permanent GLB
verifier, the bedroom JSON refresh, the root cause and exporter fix for the striped
Sci-fi-Bed, and the runtime metal cladding of Kessler's room shell — plus the
reload/re-export command lines and the pitfalls worth keeping.

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

## What was done this session

1. **Re-export + full check after the user's blend edit.** The user had re-added the
   RoboArm rigs by hand in the GUI, placed exactly right (0.0000 m offset, 0.000000 m
   rest-bbox delta in both rooms); the earlier "rollback" messages were a false alarm —
   `readd_roboarm_rigs.py` compared REST-pose bounds against the user's posed copy, which
   can never match. The script now skips rooms that are already wired (an ARMATURE
   modifier or armature parent) and leaves them exactly as placed.
2. **`Blender/scripts/verify_l2_glb.py`** promoted to a permanent post-export checker, and
   extended at the end of the session with a textured-prop list (it resolves images behind
   the `EXT_texture_webp` extension too), so a silently dropped texture shows up instead of
   shipping white.
3. **`Blender/bedroom1.json` (25 objects) / `bedroom2.json` (29 objects)** regenerated with
   positions/rotations/scales/dimensions, plus parent fields for the skinned meshes.
4. **The striped Sci-fi-Bed — root cause and fix.** See the dedicated section below: the
   fix lives in `export_l2_atrium.py` and runs on every export, in memory only.
5. **Metal cladding for Kessler's room shell** (`src/level2/ShellMetal.js`, new) — see
   below. `CREDITS.md` gained the Metal046B row in the ambientCG table.
6. **The re-export routine above** documented (it was previously only in chat).

## The striped Sci-fi-Bed (Bedroom2) — root cause and exporter fix

The bed is one of the user's own props (no `bedroom.blend` source). In the viewport it
looks right; in the game it went out white with orange stripes because the glTF exporter
**silently drops** image textures in three situations, all of which the bed hit:

- sampled through `Texture Coordinate → Generated` (or Object) — glTF can only sample by UV;
- routed through a **Mix Shader** surface (the carbon-fibre body: Generated → Diffuse → Mix);
- feeding the **Normal** input (the aluminium trim: Generated → Principled.Normal, over an
  orange metallic base colour — with the image dropped, that base colour *was* the stripes).

The bed's UV map also existed but was never unwrapped (every material group squashed into
the 0..1 square), so relinking alone would not have helped.

`export_l2_atrium.py` now repairs user-authored props at export time, in memory (the
`.blend` keeps the authored trees): textures wired through Generated/Object are rewired to
UV and their faces box-projected (dominant-axis projection normalised to the object bounds
— the mapping Generated shows in the viewport; `bmesh.ops.cube_project` no longer exists in
Blender 5.2, so it is manual), and a tree the exporter cannot carry is rebuilt around its
first image texture into a Principled Base Color. Shipped result: body `baseColorTexture` =
Fibra de carboni, trim `baseColorTexture` (+ normal) = aluminio, screen `emissiveTexture` =
Display. The one cosmetic deviation: the trim reads as brushed silver in-game rather than
the viewport's orange-brown, because that tint came from the texture-in-Normal wiring; to
keep a tint, author the texture into Base Color in the blend and the pipeline carries it
as-authored.

## Metal walls and roof for Kessler's quarter (runtime)

- `src/level2/ShellMetal.js` (new) loads the ambientCG Metal046B set from
  `public/assets/textures/Metals/` (Color sRGB, NormalGL, Roughness, Metalness; the
  Displacement and NormalDX files stay unused) and clads a named shell: **walls and roof
  take the metal as material slot 0; the floor slab band at the bottom of the box keeps the
  room's paint as slot 1** (the DoubleSide toon material shows that band as the floor).
- The shell's authored UVs are one 0..1 squash, so the tiny mesh is rebuilt unindexed and
  every corner gets a world-space box projection at 2.2 m per repeat (`TILE` in the module).
  DoubleSide + full PBR; level 2's PMREM environment gives the plate its reflections.
- Hooked in `HabitatSession._loadModel` right after `applyHubMaterials` and before the toon
  pass (so the kept floor still gets the room's toon look): `applyShellMetal(model,
  ['Cube.009'])`. `Cube.009` is Kessler's shell; **Voss's shell is a separate object named
  `Cube`** — add it to that list to clad both rooms. Load log:
  `Cube.009: 48/52 faces clad in metal`.

## Current state of the quarters

- **Two bedrooms** ship inside the atrium model (placed by hand in `l2-atrium.blend`):
  `Bedroom1` (Voss, east, behind `DOOR_VOSS`, scale 2.363, rot z −179.75°,
  loc (21.79, 2.038, 5.721)) and `Bedroom2` (Kessler, north-east, behind `DOOR_KESSLER`,
  scale 2.363, rot z −134.24°, loc (13.869, 16.843, 5.720)). Bedroom2 was a GUI
  full-duplicate of Bedroom1, so its objects are renamed (`Shelf00.001`, `Cube.005`…) — the
  exporter matches them back by geometry signature.
- **Collision** (per room): 8 thin envelope boxes plus exact OBB colliders for the furniture
  (Voss 23, Kess 29), baked world-space into Rapier trimeshes under `COL_Voss*` / `COL_Kess*`.
- **Quarter doors** slide up 3.4 m over 1.2 s within 4 m and close again beyond it; the
  collider is removed while open and re-baked at the closed position on fully closing.
- **Toon look + room lighting** as before: bedroom materials (`VCol.*` / `Material.00*`)
  convert to `MeshToonMaterial` at load, emissive panels keep their glow, one warm
  `PointLight` per panel cluster.
- **RoboArm**: the rigs and `RoboArmAtureAction` ship in the GLB again (2 skins, 2
  animations) — but `HabitatSession` still has no `AnimationMixer` for the atrium model, so
  the clip does not play at runtime yet; the arms render in bind pose. Adding a mixer +
  `clipAction` for the loaded atrium is all that is left.
- **Sci-fi-Bed** textures ship correctly (exporter fix above); **Kessler's shell** walls and
  roof are clad in metal at runtime, Voss's shell is still painted.
- Known nit: `BedCrew00` in both rooms inherited a ~4 % smaller scale (2.269 vs 2.363) from
  the GUI duplicate — visual only. Fix in the GUI + re-export if it bothers.

## Files

| File | Role |
|---|---|
| `Blender/bedroom.blend` | **Content source.** The room at the origin, vertex-coloured furniture, materials, the RoboArm rig + action. Edit geometry/colours here. |
| `Blender/l2-atrium.blend` | **Placement source.** Atrium + `Bedroom1` + `Bedroom2` collections. Edit placement here; save before exporting. |
| `Blender/scripts/export_l2_atrium.py` | Exports as placed to `public/assets/models/l2-atrium.glb`: grafts colours/materials from `bedroom.blend`, builds collision, repairs user-prop textures (the bed fix). Never writes to any `.blend`. |
| `Blender/scripts/export_l2_atrium_with_rigs.py` | Wrapper: restores missing RoboArm rigs in memory first (harmless when they exist), then runs the exporter on the open file. |
| `Blender/scripts/readd_roboarm_rigs.py` | The rig restore itself; skips rooms already wired and leaves them exactly as placed. |
| `Blender/scripts/verify_l2_glb.py` | Post-export checker: skins/animations/`COLOR_0`/colliders/textured props. Run after every export. |
| `Blender/scripts/export_bedroom_placements.py` | Dumps `Blender/bedroom1.json` / `bedroom2.json` (transforms + dimensions per room). |
| `src/level2/HabitatSession.js` | Loads the glb, colliders, doors, toon conversion, panel lights, and calls the shell cladding. |
| `src/level2/ShellMetal.js` | The Metal046B cladding for the bedroom shells (walls + roof). |
| `public/assets/textures/Metals/` | ambientCG Metal046B 1K-JPG set, as downloaded (folder name is capital-M). |
| `src/entities/Player.js` | Exports `makeToonRamp()` / `toonFrom()` — the shared toon material conversion. |

## What the export script does

1. Opens `l2-atrium.blend`; deletes leftover `COL_Voss*` / `COL_Kess*` / `*WallW` objects
   (idempotent re-runs).
2. Resolves every placed mesh back to its `bedroom.blend` source by exact name, geometry
   signature (vertex/polygon counts + rounded local bounds), or name with the `.NNN`
   duplicate suffix stripped; copies materials + the `Col` attribute onto the placed meshes
   (topology must match; an object edited past matching keeps its geometry and takes the
   source's slots only).
3. Rewires `Attribute → Diffuse BSDF` trees into `Color Attribute → Principled BSDF` so the
   glTF exporter emits `COLOR_0`; emission materials pass through unchanged.
4. Repairs user-authored props' textures (Generated/Object → UV, box projection, tree
   rebuild — the Sci-fi-Bed fix above), in memory only.
5. Builds the envelope colliders in each room's placement frame (sampled across the door
   gap, so any rotation works) plus exact furniture OBBs; objects flush with the open face
   inside the doorway band are skipped (the envelope seals them).
6. Exports GLB (`export_apply`, Y-up, WebP).

## Runtime (HabitatSession)

- `_loadModel()`: root nodes prefixed `COL_` / `DOOR_` get Rapier trimesh colliders; `COL_`
  nodes are removed from the render scene.
- Shell cladding (`applyShellMetal`) runs after `applyHubMaterials`, before the toon pass.
- Toon pass: bedroom materials swap to `MeshToonMaterial`, `vertexColors` on only for meshes
  carrying `COLOR_0` (the shells don't); material arrays (the clad shells) map fine.
- Quarter doors: trigger point is the node's `Box3` centre nudged 2.2 m into the hall (the
  `DOOR_` empties sit at the origin). Panel lights: emissive bedroom meshes clustered by
  proximity, one warm point light per cluster — a future Bedroom3 gets its light too.

## Authoring workflow

- **Change a room's look**: edit `bedroom.blend`, save, re-export. Names must stay the same
  and topology must not change — otherwise re-append the object into `l2-atrium.blend`.
- **Move / rotate / rescale a room**: edit `l2-atrium.blend`, save, re-export; collision
  follows automatically.
- **Your own props with textures**: wire images through **UV** coordinates into **Base
  Color** (or a live Emission) and they export as authored; Generated/Object coordinates are
  rewired + box-projected automatically, and anything else (Mix Shader, Normal) is rebuilt
  around the first image — so author the important wiring explicitly.
- Before saving `l2-atrium.blend`, check the Outliner shows `Bedroom1` and `Bedroom2`; do
  not run `build_l2_atrium.py` on the current file — it regenerates the atrium and discards
  the bedrooms.

## Pitfalls worth keeping

- **The export log can lie**: "exported" does not prove the glb is good. An export from a
  half-saved `.blend` once dropped every `COLOR_0` and all `COL_` nodes while reporting
  success. Run `verify_l2_glb.py`, not just the final line.
- **glTF drops textures silently** when sampled through Generated/Object coordinates, routed
  through a Mix Shader, or fed into Normal. It carries only Base Color of an output-feeding
  Principled/Diffuse and live Emission colours. Unwrapped UVs matter too: relinking a
  never-unwrapped map just spreads the squash.
- Blender 5.2: `bmesh.ops.cube_project` is gone (box-project by hand); `Object.materials`
  does not exist (iterate `material_slots`).
- Parsing a GLB by hand: walk the chunks (JSON then BIN); bufferView offsets are relative to
  the BIN chunk's data (do not add the 8-byte chunk header when the blob is already in
  memory); honour `byteStride`; indices are unsigned; images may sit behind
  `EXT_texture_webp` instead of a top-level `source`. Read the file in one pass — a
  concurrent export can rewrite it mid-read.
- The `.blend` and the `.glb` change between requests (renames like `Cube.010` →
  `Sci-fi-Bed` happened mid-investigation): re-survey the on-disk file before diagnosing.
- `bpy.data.libraries.load(path, link=False)` reuses an existing same-name local ID — rename
  stale IDs (`OLD_` prefix) before appending.
- `DOOR_` nodes get permanent static colliders in `_loadModel`; any door that opens must have
  its collider removed first, or the player bumps into an invisible wall.
- GLTFLoader strips dots from node names but keeps material names intact — the bedroom
  material scoping (`VCol.` / `Material.` prefixes) relies on that.
- Toon materials ignore `scene.environment` and need real lights — hence the per-room point
  lights; carry emissive or glowing things go dark.

## AI declaration

All code and script changes in this session — `Blender/scripts/export_l2_atrium.py` (the
prop-texture repair), `Blender/scripts/readd_roboarm_rigs.py` (wired-room skip),
`Blender/scripts/verify_l2_glb.py` (new checker + textured-prop list),
`src/level2/ShellMetal.js` (new), `src/level2/HabitatSession.js` (the cladding hook) and
`CREDITS.md` — were generated and reviewed by the Qoder AI coding assistant from the user's
instructions and the on-disk `.blend`/`.glb` state. The Blender assets themselves (modelling,
vertex colours, placement, the re-added RoboArm rigs, the Sci-fi-Bed and its textures) are
the user's own work.
