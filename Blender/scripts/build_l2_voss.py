"""
Level 2: Voss's crew quarter (the "Bedroom" asset), built as its own model in the atrium's
shared world coordinates so it sits behind DOOR_VOSS, exactly like the lab (build_l2_lab.py)
sits behind the lab doors.

The Bedroom asset's outer `Cube` was meant to be the room shell, but its solidify left two
inverted, overlapping skins, so no boolean can cut a clean doorway in it and no door gap
survives in the saved file. So this script keeps the asset's FURNITURE and builds a clean room
shell (floor, four walls with a 1.2 x 2.1 doorway, ceiling) around it:
  * normalise the asset to human scale by measuring the BED (a bed is ~1.95 m long whatever
    scale the file was saved at) and re-centre it on the origin,
  * grow the room shell from the furniture footprint so the proportions follow the layout,
  * build the shell in local coordinates, doorway in the +Y wall,
  * move/turn the room so that doorway faces the atrium's Voss gap (angle 0, east) and the
    atrium's own DOOR_VOSS panel slides in front of it,
  * add a bulkhead closing the rest of the wide atrium gap around the room,
  * add COL_ collision so the player can stand in the room and not walk out of it.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_l2_voss.py -- \
      Blender/l2-voss.blend public/assets/models/l2-voss.glb
"""
import sys, os, math, bpy, bmesh
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'Bedroom.blend')
OUT_BLEND = argv[0] if len(argv) > 0 else os.path.join(HERE, '..', 'l2-voss.blend')
OUT_GLB = argv[1] if len(argv) > 1 else os.path.join(HERE, '..', '..', 'public', 'assets', 'models', 'l2-voss.glb')

Z = 5.5                  # gallery floor, same as the atrium and the lab
DOOR_X = 17.45           # outer face of the room's west wall; DOOR_VOSS slides just in front
BED_LEN = 1.95           # real-world bed length: the ruler everything is normalised by
H = 2.6                  # ceiling height
T = 0.12                 # wall thickness
DOOR_W, DOOR_H = 1.2, 2.1
GAP_Y, GAP_Z1 = 2.05, 8.7   # half-width and top of the atrium's Voss opening
IX0, IX1 = -2.75, 2.75   # room interior, local x: a real crew quarter, wider than the gap
IY0, IY1 = -3.60, 2.20   # room interior, local y (the doorway is in the +Y wall)

bpy.ops.wm.open_mainfile(filepath=SRC)
D = bpy.data
shell = D.objects['Cube']
meshes = lambda: [o for o in D.objects if o.type == 'MESH']


def bounds(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn[i], w[i]) for i in range(3)))
            mx = Vector((max(mx[i], w[i]) for i in range(3)))
    return mn, mx


# ---- normalise by the bed: whatever scale the asset was saved at, the bed (frame + mattress)
# is BED_LEN long along local y, so measure it and scale everything by that
bed = [o for o in (D.objects.get(n) for n in ('Cube.001', 'Cube.002', 'Cube.003', 'Cube.004')) if o]
mn, mx = bounds(bed or [shell])
F = BED_LEN / max(0.01, (mx - mn).y)
S = Matrix.Scale(F, 4)
for o in meshes():
    o.matrix_world = S @ o.matrix_world
bpy.context.view_layer.update()
mn, mx = bounds([shell])
Tm = Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z)))
for o in meshes():
    o.matrix_world = Tm @ o.matrix_world
bpy.context.view_layer.update()

# ---- drop the broken shell and anything parked outside the room footprint
mn, mx = bounds([shell])
hx, hy = (mx.x - mn.x) / 2 + 1.0, (mx.y - mn.y) / 2 + 1.0
for o in [o for o in meshes() if o is not shell and
          (min(o.scale) < 1e-6 or abs(o.location.x) > hx or abs(o.location.y) > hy)]:
    D.objects.remove(o, do_unlink=True)
D.objects.remove(shell, do_unlink=True)

# ---- keep the low table clear of the doorway (as authored it sat right against the door wall)
for n in ('Cube.010', 'Cube.011'):
    o = D.objects.get(n)
    if o:
        o.matrix_world = Matrix.Translation((0, -0.9, 0)) @ o.matrix_world
# ---- the light slats were authored at the diorama's ceiling; hang them at the real one
for n in ('Cube.014', 'Cube.015', 'Cube.016', 'Cube.017', 'Cube.018'):
    o = D.objects.get(n)
    if o:
        dz = (H - 0.06) - o.matrix_world.translation.z
        o.matrix_world = Matrix.Translation((0, 0, dz)) @ o.matrix_world
bpy.context.view_layer.update()

# ---- stand the furniture against the walls like a real room: the diorama's own shell was
# smaller than its furniture, so the layout never touched a wall and would otherwise float
# in the middle of the quarter
def group(names):
    return [o for o in (D.objects.get(n) for n in names) if o]


def shift(objs, dx, dy):
    for o in objs:
        o.matrix_world = Matrix.Translation((dx, dy, 0)) @ o.matrix_world


bed_g = group(('Cube.001', 'Cube.002', 'Cube.003', 'Cube.004', 'Cube.005', 'Cube.006',
               'Cube.007', 'Cube.008', 'Cube.009', 'Cube.020'))          # bed, shelves, bin
if bed_g:
    b0, b1 = bounds(bed_g)
    shift(bed_g, IX1 - 0.05 - b1.x, IY0 + 0.05 - b0.y)                   # into the far corner
dr_g = group(('Cube.013', 'Cube.019'))                                   # lockers
if dr_g:
    b0, b1 = bounds(dr_g)
    shift(dr_g, IX0 + 0.05 - b0.x, 0)                                    # against the left wall
tb_g = group(('Cube.010', 'Cube.011'))                                   # desk plank + crate
if tb_g:
    b0, b1 = bounds(tb_g)
    shift(tb_g, IX0 + 0.05 - b0.x, 0.2 - (b0.y + b1.y) / 2)              # left wall, mid-room
scr = group(('Cube.012',))                                               # wall screen
if scr:
    b0, b1 = bounds(scr)
    c = (b0 + b1) / 2
    shift(scr, IX0 + 0.08 - b0.x, 0.17 - c.y)                            # on the left wall, over the desk
    for o in scr:
        o.matrix_world = Matrix.Translation((0, 0, 1.05 - o.matrix_world.translation.z)) @ o.matrix_world
lit = group(('Cube.014', 'Cube.015', 'Cube.016', 'Cube.017', 'Cube.018'))
if lit:
    shift(lit, 0, -1.0)                                                  # centre the light grid over the room
bpy.context.view_layer.update()

# ---- report the furniture footprint; the room itself keeps its own generous dimensions:
# the atrium gap is only a hole in the cylinder and the room behind it may be wider than the
# gap, since the room's west wall closes the gap from behind
mn, mx = bounds(meshes())
print('furniture footprint x %.2f..%.2f y %.2f..%.2f  ->  interior x %.2f..%.2f y %.2f..%.2f'
      % (mn.x, mx.x, mn.y, mx.y, IX0, IX1, IY0, IY1))


def wall_mat():
    m = D.materials.get('voss_wall')
    if m is None:
        m = D.materials.new('voss_wall')
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = (0.62, 0.67, 0.72, 1)
        b.inputs['Roughness'].default_value = 0.55
    return m


wm = wall_mat()
shell_bm = bmesh.new()
shell_mats = []


def box(bx0, bx1, by0, by1, bz0, bz1, bm=None, mat=None, name=None):
    target = bm if bm is not None else shell_bm
    verts = bmesh.ops.create_cube(target, size=1.0)['verts']
    bmesh.ops.transform(target, matrix=Matrix.Translation(((bx0 + bx1) / 2, (by0 + by1) / 2, (bz0 + bz1) / 2)) @
                        Matrix.Diagonal((bx1 - bx0, by1 - by0, bz1 - bz0, 1.0)), verts=verts)
    if bm is None and mat is not None:
        if mat not in shell_mats:
            shell_mats.append(mat)
        i = shell_mats.index(mat)
        faces = set()
        for v in verts:
            faces.update(v.link_faces)
        for f in faces:
            f.material_index = i
    if bm is None:
        return None
    me = D.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if mat:
        me.materials.append(mat)
    ob = D.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


# ---- clean room shell in local coordinates: floor, ceiling, four walls, doorway in +Y
box(IX0 - T, IX1 + T, IY0 - T, IY1 + T, -T, 0.0, mat=wm)              # floor
box(IX0 - T, IX1 + T, IY0 - T, IY1 + T, H, H + T, mat=wm)             # ceiling
box(IX0 - T, IX0, IY0 - T, IY1 + T, 0, H, mat=wm)                     # -X wall
box(IX1, IX1 + T, IY0 - T, IY1 + T, 0, H, mat=wm)                     # +X wall
box(IX0 - T, IX1 + T, IY0 - T, IY0, 0, H, mat=wm)                     # -Y wall
box(IX0 - T, -DOOR_W / 2, IY1, IY1 + T, 0, H, mat=wm)                 # +Y wall, left of door
box(DOOR_W / 2, IX1 + T, IY1, IY1 + T, 0, H, mat=wm)                  # +Y wall, right of door
box(-DOOR_W / 2, DOOR_W / 2, IY1, IY1 + T, DOOR_H, H, mat=wm)         # +Y wall, over the door
bmesh.ops.recalc_face_normals(shell_bm, faces=shell_bm.faces[:])
me = D.meshes.new('Voss_Room')
shell_bm.to_mesh(me)
shell_bm.free()
for m in shell_mats:
    me.materials.append(m)
room = D.objects.new('Voss_Room', me)
bpy.context.scene.collection.objects.link(room)

# ---- place the room behind the Voss gap: local +Y (the doorway wall) faces west, into the hall
M = Matrix.Translation((DOOR_X + IY1 + T, 0, Z)) @ Matrix.Rotation(math.radians(90), 4, 'Z')
for o in meshes():
    o.matrix_world = M @ o.matrix_world
bpy.context.view_layer.update()

# ---- world-space extents of the room (world_x = TX - local_y), for the bulkhead and collision
TX = DOOR_X + IY1 + T
x0, x1 = DOOR_X + T, TX - IY0 + T          # interior west .. outer east
y0, y1 = IX0 - T, IX1 + T
z0, z1 = Z, Z + H + T


def wbox(name, bx0, bx1, by0, by1, bz0, bz1, mat=None):
    return box(bx0, bx1, by0, by1, bz0, bz1, bm=bmesh.new(), mat=mat, name=name)


# ---- close the atrium gap above the room; the room's west wall is wider than the gap, so it
# closes the gap's sides from behind and no side panels are needed
wbox('Voss_Bulkhead', DOOR_X, DOOR_X + T, -GAP_Y, GAP_Y, z1, GAP_Z1, wm)

# ---- collision: floor, the three solid walls, and the doorway wall split around the opening
wbox('COL_VossFloor', x0, x1 - T, IX0, IX1, z0 - 0.12, z0)
wbox('COL_VossWallN', x0, x1, y1 - T, y1, z0, z1)
wbox('COL_VossWallS', x0, x1, y0, y0 + T, z0, z1)
wbox('COL_VossWallE', x1 - T, x1, y0, y1, z0, z1)
wbox('COL_VossWallW1', DOOR_X, DOOR_X + T, y0, -DOOR_W / 2, z0, z1)
wbox('COL_VossWallW2', DOOR_X, DOOR_X + T, DOOR_W / 2, y1, z0, z1)
wbox('COL_VossWallWTop', DOOR_X, DOOR_X + T, -DOOR_W / 2, DOOR_W / 2, z0 + DOOR_H, z1)

bpy.ops.wm.save_mainfile(filepath=OUT_BLEND)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_apply=True, export_yup=True)
print('VOSS ROOM built:', OUT_BLEND, OUT_GLB)
print('room bounds x %.2f..%.2f y %.2f..%.2f z %.2f..%.2f' % (DOOR_X, x1, y0, y1, z0, z1))
