"""
Level 3's kraken, from "Kraken" by toro ardido modelos 3d (Sketchfab, CC-BY-4.0; its files are in
Blender/assets/kraken and it is credited in CREDITS.md). The model is one creature with two thick
jointed arms and two long thin tentacles, all held out straight and unrigged. This script takes it
apart for the game, which bends the tentacles in its vertex shader and repeats them round the body
(src/level3/Kraken.js):

  KRAKEN_Body  the head and body: the screaming face, the spiked crest, the clawed hands
  KRAKEN_Arm   one thick arm: its base at the origin, running straight up +z (the game's +y), the
               suckers toward -y (the game's +z), cut into short rings so that it bends smoothly
  KRAKEN_Whip  one long thin tentacle, laid out the same way

All three share one material and one texture: the model's ten 256 px textures packed into a 4 x 4
atlas. The model's own UVs repeat past 0..1 (the suckers along the tentacles), so each vertex keeps
its UV and gets its tile added on as whole hundreds in u (u + 100 * tile): the game reads the tile
back as floor((u + 50) / 100) and samples the atlas at (tile + fract(uv)) / 4.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_l3_kraken.py -- \
      Blender/l3-kraken.blend public/assets/models/l3-kraken.glb

(Not Draco-compressed: Draco's quantised UVs would lose the tile offsets.)
"""
import sys, os, math
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'assets', 'kraken', 'scene.gltf')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_BLEND = argv[0] if len(argv) > 0 else None
OUT_GLB = argv[1] if len(argv) > 1 else None

TILE, GRID = 256, 4
ARM_CUT = 1.2            # the arm leaves the body here (the source's y)
WHIP_CUT = 2.6           # and the long tentacle here (its x: where the body keeps its root)
RING = 0.4             # the tentacles are cut into rings this long (metres of the source)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC, merge_vertices=True)
parts = {o.name: o for o in bpy.context.scene.objects if o.type == 'MESH'}


def image_of(ob):
    m = ob.data.materials[0]
    return next(n.image for n in m.node_tree.nodes if n.type == 'TEX_IMAGE')


# ---------------------------------------------------------------- the atlas
images, tile_of = [], {}
for name in sorted(parts):
    img = image_of(parts[name])
    if img.name not in tile_of:
        tile_of[img.name] = len(images)
        images.append(img)
px = np.zeros((TILE * GRID, TILE * GRID, 4), np.float32)
for k, img in enumerate(images):
    if tuple(img.size) != (TILE, TILE):
        img.scale(TILE, TILE)
    a = np.array(img.pixels[:], np.float32).reshape(TILE, TILE, 4)     # (rows from the bottom)
    col, row = k % GRID, k // GRID                                     # (row counted from the top)
    y0 = (GRID - 1 - row) * TILE
    px[y0:y0 + TILE, col * TILE:(col + 1) * TILE] = a
atlas = bpy.data.images.new('kraken_atlas', TILE * GRID, TILE * GRID, alpha=True)
atlas.pixels = px.ravel()
atlas.file_format = 'PNG'
atlas.pack()
print('atlas tiles:', len(images))

mat = bpy.data.materials.new('kraken')
try:
    mat.use_nodes = True
except Exception:
    pass
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = atlas
mat.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.6


# ---------------------------------------------------------------- the parts, in world space
def part_bm(name, keep=None):
    """The part as a bmesh in world space, its tile added to u; keep(co) -> False drops a face"""
    ob = parts[name]
    me = ob.data.copy()
    me.transform(ob.matrix_world)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    uv = bm.loops.layers.uv.active
    t = tile_of[image_of(ob).name]
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv.x += 100.0 * t
    if keep:
        drop = [f for f in bm.faces if not keep(f.calc_center_median())]
        bmesh.ops.delete(bm, geom=drop, context='FACES')
    return bm


def cut(bm, co, no, clear_outer):
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=clear_outer, clear_inner=not clear_outer)


def join(bms):
    me = bpy.data.meshes.new('tmp')
    out = bmesh.new()
    for b in bms:
        b.to_mesh(me)
        out.from_mesh(me)
        b.free()
    bpy.data.meshes.remove(me)
    return out


def straighten(bm, axis):
    """Moves each slice across the axis so its middle sits on the axis (a straight tentacle)"""
    other = [i for i in range(3) if i != axis]
    lo = min(v.co[axis] for v in bm.verts)
    hi = max(v.co[axis] for v in bm.verts)
    n = max(2, int((hi - lo) / 0.25))
    sums = np.zeros((n, 3))
    for v in bm.verts:
        k = min(n - 1, int((v.co[axis] - lo) / (hi - lo) * n))
        sums[k] += (v.co[other[0]], v.co[other[1]], 1)
    mids = np.array([s[:2] / s[2] if s[2] else (np.nan, np.nan) for s in sums])
    good = ~np.isnan(mids[:, 0])
    xs = np.arange(n)
    mids = np.stack([np.interp(xs, xs[good], mids[good, j]) for j in range(2)], 1)
    # (smoothed, so the bumps of the skin stay)
    ker = np.ones(5) / 5
    mids = np.stack([np.convolve(np.pad(mids[:, j], 2, mode='edge'), ker, 'valid') for j in range(2)], 1)
    for v in bm.verts:
        f = (v.co[axis] - lo) / (hi - lo) * n - 0.5
        k0 = int(np.clip(math.floor(f), 0, n - 1)); k1 = min(n - 1, k0 + 1)
        w = float(np.clip(f - k0, 0, 1))
        m = mids[k0] * (1 - w) + mids[k1] * w
        v.co[other[0]] -= m[0]
        v.co[other[1]] -= m[1]


def rings(bm, length):
    """Cuts across the tentacle (along z) every RING metres, so that it bends smoothly"""
    n = int(length / RING)
    for k in range(1, n):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, k * length / n), plane_no=(0, 0, 1))


def to_object(name, bm):
    for f in bm.faces:
        f.material_index = 0
        f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    lo = [min(v.co[i] for v in me.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in me.vertices) for i in range(3)]
    print(name, 'triangles', tris, 'bounds', [round(x, 2) for x in lo], [round(x, 2) for x in hi])
    return ob


# The body: everything that is not a tentacle, with the tentacles' roots cut off short
body = [part_bm(n) for n in ('Object_3', 'Object_4', 'Object_5')]
body.append(part_bm('Object_12', keep=lambda c: c.y < 3.0))     # (less two stray sucker discs)
# (the face shares its texture and its mesh with the long tentacles: the middle of those is the body's)
for n in ('Object_10', 'Object_11'):
    b = part_bm(n)
    cut(b, (WHIP_CUT, 0, 0), (1, 0, 0), True)
    cut(b, (-WHIP_CUT, 0, 0), (-1, 0, 0), True)
    body.append(b)
b = part_bm('Object_2')
cut(b, (0, ARM_CUT, 0), (0, 1, 0), True)
body.append(b)
b = part_bm('Object_8')
cut(b, (WHIP_CUT, 0, 0), (1, 0, 0), True)
cut(b, (-WHIP_CUT, 0, 0), (-1, 0, 0), True)
body.append(b)
to_object('KRAKEN_Body', join(body))

# One thick arm (the right one): from where it leaves the body out to its claw, straightened, then
# turned to run up +z with its suckers (the source's +z) toward -y: (x, y, z) -> (x, -z, y)
arm = []
for n in ('Object_2', 'Object_7', 'Object_9', 'Object_6'):
    b = part_bm(n, keep=lambda c: c.x > 0)
    if n == 'Object_2':
        cut(b, (0, ARM_CUT, 0), (0, -1, 0), True)
    arm.append(b)
arm = join(arm)
straighten(arm, 1)
lo = min(v.co.y for v in arm.verts)
for v in arm.verts:
    x, y, z = v.co
    v.co = Vector((x, -z, y - lo))
arm_len = max(v.co.z for v in arm.verts)
rings(arm, arm_len)
to_object('KRAKEN_Arm', arm)

# One long tentacle (the right one), the same way: it runs along +x with its suckers below (the
# source's -z), so (x, y, z) -> (y, z, x)
whip = [part_bm(n, keep=lambda c: c.x > 0) for n in ('Object_8', 'Object_10', 'Object_11')]
whip = join(whip)
cut(whip, (WHIP_CUT, 0, 0), (-1, 0, 0), True)
straighten(whip, 0)
lo = min(v.co.x for v in whip.verts)
for v in whip.verts:
    x, y, z = v.co
    v.co = Vector((y, z, x - lo))
whip_len = max(v.co.z for v in whip.verts)
rings(whip, whip_len)
to_object('KRAKEN_Whip', whip)
print('arm length', round(arm_len, 3), 'whip length', round(whip_len, 3))

for o in list(parts.values()):
    bpy.data.objects.remove(o, do_unlink=True)
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)

if OUT_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(OUT_BLEND))
if OUT_GLB:
    bpy.ops.export_scene.gltf(filepath=os.path.abspath(OUT_GLB), export_format='GLB', export_yup=True,
                              export_apply=True, export_image_format='AUTO')
    print('exported', OUT_GLB)
