"""
Prologue photo 4 (graduation): Voss in a black gown, his cap on and a crimson "PhD" sash, laughing,
one arm in the air and the other round his mother; she (black hair, a few grey strands, teal
cardigan, gold pendant) smiles and grips his rolled certificate. Renders the two figures on a
transparent background; scripts/prologue/compose-photo4.mjs puts them on the painted backdrop and
in the Polaroid frame. The cast and the helpers are in prologue_common.py.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/render_prologue_photo4.py -- [out.png]
Set FACES=<dir> to render close-ups of the faces and her hands instead.
"""
import sys, os, math
import bpy
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prologue_common import *   # noqa: E402,F403

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(ROOT, 'docs', 'reference-art', 'prologue-photo4-figures.png')

cast = Cast()
scn = scene()
v_arm, m_arm, v_root, m_root = cast.v_arm, cast.m_arm, cast.v_root, cast.m_root

# ---------- faces: both smiling ----------
voss_face(cast, {'mouth_smile': 1.7, 'mouth_wide': 0.9, 'jaw_open': 0.4, 'brow_up': 0.5}, grin_k=1.3)
mom_face(cast, 1.0)
restyle_mom(cast, cardigan='#3f8c88', grey=0.0, streaks=1.0)      # black, going grey
tint(bpy.data.materials['M_Coat'], srgb('#2a2d38'))          # his lab coat becomes the gown

# ---------- places and poses ----------
v_root.location = (-0.24, 0, 0)
m_root.location = (0.25, -0.04, 0)
# the arms below are aimed in frames turned toward each other (him 8 degrees, her -12); the
# bodies themselves face the camera
v_root['yaw'] = math.radians(8)
m_root['yaw'] = math.radians(-12)
update()

freeze_clip(v_arm, 'Idle')
# Voss: his left arm round his mother's back, his right punching the air
pose_arm(v_arm, v_root, +1, (0.5, 0.3, -0.8), (0.85, 0.35, 0.3))
pose_arm(v_arm, v_root, -1, (-0.55, -0.1, 0.75), (-0.12, -0.12, 1))
rotate_world(v_arm, 'Head1', 'Y', 6)       # head thrown a little toward her
# Mother: both hands in front of her, holding his certificate, leaning into him
pose_arm(m_arm, m_root, -1, (-0.14, -0.25, -1), (0.3, -1, 0.12))
pose_arm(m_arm, m_root, +1, (0.14, -0.25, -1), (-0.3, -1, 0.12))
rotate_world(m_arm, 'Spine4', 'Y', -5)
rotate_world(m_arm, 'Head1', 'Y', -9)

standard_heights(cast)

# ---------- mortarboard, on his head, tilted with it ----------
gown = flat('Cap', srgb('#16181f'), 0.6)
cap = empty('Cap', (0, 0, 0))
bpy.ops.mesh.primitive_cylinder_add(radius=0.088, depth=0.075, location=(0, 0, -0.03))
skull = bpy.context.object; skull.data.materials.append(gown)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.012))
board = bpy.context.object; board.scale = (0.25, 0.25, 0.01); board.rotation_euler[2] = math.radians(45)
board.data.materials.append(gown)
bpy.ops.mesh.primitive_cylinder_add(radius=0.005, depth=0.12, location=(0.115, -0.04, -0.045))
tassel = bpy.context.object; tassel.data.materials.append(gold())
for o in (skull, board, tassel):
    o.parent = cap

# sit it on the crown: the top of his hair, over the middle of his skull, turned as his head is turned
hb = bone(v_arm, 'Head1')
rest_up = (v_arm.matrix_world.to_3x3() @ (hb.bone.tail_local - hb.bone.head_local)).normalized()
pose_up = ((v_arm.matrix_world @ hb.tail) - (v_arm.matrix_world @ hb.head)).normalized()
tilt = rest_up.rotation_difference(pose_up)
crown = bounds(cast.V_HEAD)[1].z
hh = bone_world(v_arm, 'Head1')
cap.rotation_mode = 'QUATERNION'
cap.rotation_quaternion = tilt @ Matrix.Rotation(math.radians(8), 3, 'Z').to_quaternion()   # the board a little askew
cap.location = Vector((hh.x, hh.y, 0)) + Vector((0, -0.012, crown - 0.03))
attach(cap, v_arm, 'Head1')

# ---------- his sash: crimson, over his left shoulder to his right hip, "PhD" in gold ----------
coat = bpy.data.objects['Coat_Torso']
sh = bone_world(v_arm, 'L_Clavicle').lerp(bone_world(v_arm, 'L_UpperArm'), 0.6) + Vector((0, 0, 0.05))
hip = bone_world(v_arm, 'R_Thigh')
run = hip - sh
bpy.ops.mesh.primitive_plane_add(size=1)
sash = bpy.context.object
sash.scale = (0.085, run.length * 1.05, 1)
bpy.ops.object.transform_apply(scale=True)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.subdivide(number_cuts=40)
bpy.ops.object.mode_set(mode='OBJECT')
# lay the strip upright, facing the camera (-y), along the line shoulder -> hip, in front of him
sash.rotation_mode = 'QUATERNION'
along_ = run.normalized()
q1 = Vector((0, 0, 1)).rotation_difference(Vector((0, -1, 0)))          # face -y
q2 = (q1 @ Vector((0, 1, 0))).rotation_difference(along_)               # length along the run
sash.rotation_quaternion = q2 @ q1
sash.location = (sh + hip) / 2 + Vector((0, -0.25, 0))
sw = sash.modifiers.new('onto_coat', 'SHRINKWRAP')
sw.target = coat; sw.wrap_method = 'PROJECT'; sw.use_project_y = True; sw.use_negative_direction = True
sw.use_positive_direction = True; sw.wrap_mode = 'OUTSIDE_SURFACE'; sw.offset = 0.006
sash.modifiers.new('thick', 'SOLIDIFY').thickness = 0.003
sash.data.materials.append(flat('Sash', srgb('#8e1f2f'), 0.55))
for f in sash.data.polygons:
    f.use_smooth = True

bpy.ops.object.text_add()
txt = bpy.context.object
txt.data.body = 'PhD'
txt.data.align_x = 'CENTER'; txt.data.align_y = 'CENTER'
txt.data.size = 0.05; txt.data.extrude = 0.0008
txt.data.materials.append(gold())
bpy.ops.object.convert(target='MESH')
txt = bpy.context.object
txt.rotation_mode = 'QUATERNION'
# laid on the sash where a ray from the camera's side meets it, reading uphill (hip -> shoulder)
spot = sh.lerp(hip, 0.38)
txt.hide_set(True)
update()
hit, loc, nrm, _, _, _ = scn.ray_cast(bpy.context.evaluated_depsgraph_get(), Vector((spot.x, -2.0, spot.z)), Vector((0, 1, 0)))
txt.hide_set(False)
normal = -nrm if nrm.y > 0 else nrm
read = Vector((-along_.x, 0, -along_.z)).normalized()
read = (read - normal * read.dot(normal)).normalized()
txt.rotation_quaternion = Matrix((read, normal.cross(read), normal)).transposed().to_quaternion()
txt.location = loc + normal * 0.0015
for o in (sash, txt):
    attach(o, v_arm, 'Spine4')

add_pendant(cast)

# ---------- his certificate, rolled, gripped in both her hands ----------
curl_hand(m_arm, +1, 80, 45)
curl_hand(m_arm, -1, 80, 45)
gl, gr = grip(m_arm, 'L'), grip(m_arm, 'R')
mid = (gl + gr) / 2
along = (gl - gr).normalized()
bpy.ops.mesh.primitive_cylinder_add(radius=0.017, depth=max((gl - gr).length + 0.14, 0.3), location=mid)
scroll = bpy.context.object
scroll.rotation_mode = 'QUATERNION'
scroll.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(along)
scroll.data.materials.append(flat('Paper', srgb('#f1e7cf'), 0.8))
bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_cylinder_add(radius=0.019, depth=0.025, location=mid)
ribbon = bpy.context.object
ribbon.rotation_mode = 'QUATERNION'; ribbon.rotation_quaternion = scroll.rotation_quaternion
ribbon.data.materials.append(flat('Ribbon', srgb('#9b2f3b'), 0.6))
for o in (scroll, ribbon):
    attach(o, m_arm, 'R_Hand')

# ---------- camera and light: a sunny afternoon ----------
render_setup()
aim_at = empty('aim', (0.0, 0, 1.30))
light((-2.0, -2.6, 2.8), 520, 2.5, (1.0, 0.93, 0.82), aim_at)   # warm sun key
light((2.6, -2.0, 1.6), 160, 3.0, (0.85, 0.9, 1.0), aim_at)     # cool sky fill
light((0.5, 2.5, 2.4), 300, 1.5, target=aim_at)                  # rim
cam = camera((0.05, -2.75, 1.45), aim_at, 58)

if os.environ.get('FACES'):
    closeups(cast, cam, aim_at, os.environ['FACES'], [('hands', m_arm, 'R_Hand')])
    sys.exit(0)
render(OUT)
