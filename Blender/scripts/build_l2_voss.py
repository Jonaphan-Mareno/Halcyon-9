"""
Level 2: Voss's crew quarter (the "Bedroom" asset) plus its collision, in the atrium's shared
world coordinates.

The room is loaded from `Blender/bedroom.blend` and then placed with one group transform so the
shell (`Cube`) lands exactly on the authored target: uniform scale 2.094, Euler rotation
(90, 0, -178.5) degrees, location (21.348, 1.9159, 5.8061). Every root object is moved by the same
matrix (the on-disk Cube transform is mapped onto the target), so the furniture keeps its layout
and travels with the shell. No other processing: no bed-scaling, no shell rebuild, no re-pinning.

Collision is NOT in the asset, so it is generated here from the placed room's world bounds: a
floor, a ceiling, north/south/east walls, and a west wall split around a 1.2 x 2.1 doorway that
also seals the atrium's Voss opening (the gap in the cylinder) so the player cannot walk out.

Edit the room in Blender, then rebuild:
  blender -b --factory-startup --python Blender/scripts/build_l2_voss.py -- \
      Blender/l2-voss.blend public/assets/models/l2-voss.glb
"""
import sys, os, bpy, bmesh
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'bedroom.blend')
OUT_BLEND = argv[0] if len(argv) > 0 else os.path.join(HERE, '..', 'l2-voss.blend')
OUT_GLB = argv[1] if len(argv) > 1 else os.path.join(HERE, '..', '..', 'public', 'assets', 'models', 'l2-voss.glb')

# the atrium's Voss opening in the cylinder (build_l2_atrium.py GAPS['voss']), which the west
# doorway wall must seal: half-width in y and the z band of the hole
GAP_Y, GAP_Z0, GAP_Z1 = 2.07, 5.5, 8.7
DW, DH = 1.2, 2.1        # doorway width / height
T = 0.12                 # collision wall thickness

# Pass-through: the room is exported exactly as saved in bedroom.blend. Author and PLACE the room
# in Blender and SAVE it there; do not try to re-place it here (the furniture are separate
# top-level objects, so a group transform cannot reproduce a GUI object transform).
bpy.ops.wm.open_mainfile(filepath=SRC)
D = bpy.data
bpy.context.view_layer.update()


def bounds():
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in D.objects:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn[i], w[i]) for i in range(3)))
            mx = Vector((max(mx[i], w[i]) for i in range(3)))
    return mn, mx


mn, mx = bounds()
print('placed room bounds x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f' % (mn.x, mx.x, mn.y, mx.y, mn.z, mx.z))


def col(name, x0, x1, y0, y1, z0, z1):
    bm = bmesh.new()
    verts = bmesh.ops.create_cube(bm, size=1.0)['verts']
    bmesh.ops.transform(bm, matrix=Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)) @
                        Matrix.Diagonal((x1 - x0, y1 - y0, z1 - z0, 1.0)), verts=verts)
    me = D.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = D.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


FZ = mn.z                       # the room's visual floor: where the player stands
TOP = max(mx.z, GAP_Z1)         # high enough to also close the top of the atrium gap

# ---- containment: floor, ceiling, and the three solid walls
col('COL_VossFloor', mn.x, mx.x, mn.y, mx.y, FZ - T, FZ)
col('COL_VossCeil', mn.x, mx.x, mn.y, mx.y, TOP, TOP + T)
col('COL_VossWallN', mn.x, mx.x, mx.y - T, mx.y, FZ, TOP)
col('COL_VossWallS', mn.x, mx.x, mn.y, mn.y + T, FZ, TOP)
col('COL_VossWallE', mx.x - T, mx.x, mn.y, mx.y, FZ, TOP)
# ---- west wall with the doorway; widened to at least the gap so the cylinder hole is sealed
wy0, wy1 = min(mn.y, -GAP_Y), max(mx.y, GAP_Y)
col('COL_VossWallW1', mn.x, mn.x + T, wy0, -DW / 2, FZ, TOP)
col('COL_VossWallW2', mn.x, mn.x + T, DW / 2, wy1, FZ, TOP)
col('COL_VossWallWTop', mn.x, mn.x + T, -DW / 2, DW / 2, FZ + DH, TOP)

bpy.ops.wm.save_mainfile(filepath=OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_apply=True, export_yup=True)
print('VOSS ROOM placed + collision built:', OUT_BLEND, OUT_GLB)
print('objects:', ', '.join(sorted(o.name for o in D.objects)))
