"""
Prologue photo 5 (the collapse): the kitchen floor, caught in a harsh flash. His mother (late
fifties: salt-and-pepper hair spread on the floor, a dusty rose cardigan, the pendant) lies on her
back where she fell, one knee up, an arm flung out, her eyes shut, her face turned toward the
camera; a plate lies smashed beside her hand and a glass on its side in a puddle of water. Voss,
dressed for work in his lab coat, has dropped down at her shoulder, one hand on her shoulder and one
at her head, his face open in panic. Renders the whole frame (not transparent);
scripts/prologue/compose-photo5.mjs grades it cold and puts it in the Polaroid, captioned
"Mom keeps falling". The cast and the helpers are in prologue_common.py.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/render_prologue_photo5.py -- [out.png]
Set FACES=<dir> to render close-ups of the faces instead.
"""
import sys, os, math, random
import bpy
import bmesh
from mathutils import Vector, Matrix, Quaternion

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prologue_common import *   # noqa: E402,F403

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(ROOT, 'docs', 'reference-art', 'prologue-photo5-render.png')

cast = Cast()
scn = scene()
v_arm, m_arm, v_root, m_root = cast.v_arm, cast.m_arm, cast.v_root, cast.m_root

# ---------- faces: his panic; hers slack, eyes shut ----------
voss_face(cast, {'jaw_open': 0.85, 'brow_inner_up': 1.2, 'brow_up': 0.6, 'mouth_wide': 0.35, 'mouth_frown': 0.6})
mom_close_eyes(cast, 1.35)
restyle_mom(cast, cardigan='#a8848f', grey=0.6, untidy=0.3, fall=False)

# ---------- heights, measured standing ----------
freeze_clip(v_arm, 'Idle')
standard_heights(cast)

# ---------- her, as she fell: posed standing, then laid down ----------
# legs: her left knee up, her right straight; arms: her right flung out, her left across her
pose_leg(m_arm, m_root, +1, (0.12, -0.75, -0.65), (0.05, 0.55, -1))
pose_leg(m_arm, m_root, -1, (-0.06, 0.0, -1), (-0.04, 0.05, -1))
pose_arm(m_arm, m_root, -1, (-1, 0.06, -0.15), (-0.9, 0.08, 0.45))   # (her forward is up, once she lies)
pose_arm(m_arm, m_root, +1, (0.28, -0.12, -1), (-0.85, -0.3, 0.35))
rotate_world(m_arm, 'Head1', 'Z', -50)            # face turned to her right: toward the camera
# lying on her back across the frame: her head toward -x, her face up (+z), her left side toward +y
lie = Matrix(((0, 0, -1), (1, 0, 0), (0, -1, 0)))   # columns: x -> +y, y -> -z, z -> -x
turn(m_root, lie.to_quaternion())
lo, hi = bounds(cast.M)
m_root.location = Vector((0.45, -0.05, 0)) + Vector((0, 0, -lo.z))
update()
add_pendant(cast)
hair_on_floor(cast)
hair_strands_lying(cast)

# ---------- him: dropped down at her shoulder, leaning over her ----------
head_m = bone_world(m_arm, 'Head1')
freeze_clip(v_arm, 'Crouch')
v_root.location = (head_m.x + 0.12, head_m.y + 0.5, 0)
turn(v_root, -28)                                  # facing the camera, turned toward her
lean(v_arm, v_root, 'Spine2', 22)                  # leaning in over her
lean(v_arm, v_root, 'Spine4', 6)
lean(v_arm, v_root, 'Head1', -24)                  # head up: his face to the flash, crying out
shoulder_m = bone_world(m_arm, 'R_UpperArm').lerp(bone_world(m_arm, 'L_UpperArm'), 0.3) + Vector((0, 0, 0.07))
cheek_m = bone_world(m_arm, 'Head1') + Vector((0.0, 0.08, 0.08))      # the top of her head
reach(v_arm, +1, shoulder_m, (1, 0.3, 0.2))
reach(v_arm, -1, cheek_m, (-1, 0.2, 0.3))

# ---------- the kitchen ----------
def box(name, loc, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    o.data.materials.append(mat)
    return o


tiles = bpy.data.materials.new('Tiles'); tiles.use_nodes = True
nt = tiles.node_tree; b = nt.nodes['Principled BSDF']
chk = nt.nodes.new('ShaderNodeTexChecker'); chk.inputs['Scale'].default_value = 28
chk.inputs['Color1'].default_value = (*srgb('#d6cdb8'), 1); chk.inputs['Color2'].default_value = (*srgb('#a99f8a'), 1)
nt.links.new(chk.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.35
bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
floor = bpy.context.object; floor.data.materials.append(tiles)

wall = flat('Wall', srgb('#c9c2a8'), 0.8)
wood = flat('Cabinet', srgb('#7a5a3e'), 0.55)
top = flat('Counter', srgb('#2e2c2a'), 0.3)
box('BackWall', (0, 1.6, 1.3), (8, 0.1, 2.6), wall)
box('Cabinets', (0, 1.25, 0.45), (5, 0.6, 0.9), wood)
box('Counter', (0, 1.22, 0.92), (5.04, 0.66, 0.04), top)
for x in (-1.6, -0.8, 0.0, 0.8, 1.6):                                    # the door seams
    box('Seam', (x, 0.945, 0.45), (0.01, 0.01, 0.8), flat('Seam', srgb('#3c2c1e'), 0.6))
box('Handle', (-0.45, 0.94, 0.7), (0.12, 0.02, 0.02), flat('Steel', srgb('#9a9a9a'), 0.3, 1.0))

# the plate, smashed by her hand: a few flat shards; a mug on its side in a spill
hand = bone_world(m_arm, 'R_Hand')
china = flat('China', srgb('#f2f0ea'), 0.25)
rim = flat('Rim', srgb('#2f5d8a'), 0.3)
random.seed(5)
for i in range(9):
    bm = bmesh.new()
    r = 0.03 + random.random() * 0.05
    pts = [bm.verts.new((math.cos(a) * r * (0.5 + random.random()), math.sin(a) * r * (0.5 + random.random()), 0))
           for a in sorted(random.random() * 2 * math.pi for _ in range(4))]
    bm.faces.new(pts)
    me = bpy.data.meshes.new('Shard'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('Shard', me); scn.collection.objects.link(o)
    o.location = hand + Vector((random.uniform(-0.35, 0.15), random.uniform(-0.45, 0.0), 0))
    o.location.z = 0.004
    o.rotation_euler = (random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1), random.uniform(0, 6.3))
    o.modifiers.new('t', 'SOLIDIFY').thickness = 0.006
    o.data.materials.append(china); o.data.materials.append(rim)
    o.modifiers[0].material_offset_rim = 1
# a clear glass, tipped over, its water run out across the tiles
glass_m = bpy.data.materials.new('Glass'); glass_m.use_nodes = True
gb = glass_m.node_tree.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value = (0.85, 0.9, 0.95, 1); gb.inputs['Roughness'].default_value = 0.04
gb.inputs['Alpha'].default_value = 0.22; gb.inputs['Specular IOR Level'].default_value = 1.0
glass_m.surface_render_method = 'BLENDED'
bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=0.11, location=hand + Vector((0.25, -0.35, 0)))
mug = bpy.context.object
bm = bmesh.new(); bm.from_mesh(mug.data)                   # open at the top: a tumbler
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z > 0.9], context='FACES')
bm.to_mesh(mug.data); bm.free()
mug.modifiers.new('wall', 'SOLIDIFY').thickness = 0.003
mug.rotation_euler = (math.radians(90), 0, math.radians(35)); mug.location.z = 0.036
mug.data.materials.append(glass_m)
bpy.ops.object.shade_smooth()
bm = bmesh.new()                                    # the spill: an uneven puddle from the mug's mouth
pts = []
for i in range(28):
    a = 2 * math.pi * i / 28
    r = 0.12 * (1 + 0.2 * math.sin(3 * a + 1) + 0.1 * math.sin(7 * a))
    pts.append(bm.verts.new((math.cos(a) * r * 1.6, math.sin(a) * r, 0)))
bm.faces.new(pts)
me = bpy.data.meshes.new('Spill'); bm.to_mesh(me); bm.free()
spill = bpy.data.objects.new('Spill', me); scn.collection.objects.link(spill)
spill.location = mug.location + Vector((0.14, -0.1, 0)); spill.location.z = 0.0015
spill.rotation_euler[2] = math.radians(35)
water = bpy.data.materials.new('Water'); water.use_nodes = True
wb = water.node_tree.nodes['Principled BSDF']
wb.inputs['Base Color'].default_value = (0.5, 0.55, 0.6, 1); wb.inputs['Roughness'].default_value = 0.02
wb.inputs['Alpha'].default_value = 0.3; wb.inputs['Specular IOR Level'].default_value = 1.0
water.surface_render_method = 'BLENDED'
spill.data.materials.append(water)
for o in (floor, spill):
    o.data.polygons.foreach_set('use_smooth', [False] * len(o.data.polygons))

# ---------- the flash: one hard light from the camera, the room falling off into the dark ----------
render_setup(transparent=False, world_rgb=(0.35, 0.4, 0.5), world_strength=0.02)
look = empty('look', (head_m.x + 0.35, head_m.y + 0.2, 0.35))
cam = camera((head_m.x + 0.95, head_m.y - 2.0, 1.95), look, 32)
flash = light(cam.location + Vector((0.08, 0, 0.12)), 420, 0.03, (1.0, 0.97, 0.92), look, kind='SPOT')
flash.data.spot_size = math.radians(64); flash.data.spot_blend = 0.85
light((head_m.x - 1.5, head_m.y + 0.5, 2.4), 25, 2.0, (0.75, 0.85, 1.0), look)   # cold window light

if os.environ.get('FACES'):
    closeups(cast, cam, look, os.environ['FACES'])
    sys.exit(0)
render(OUT)
