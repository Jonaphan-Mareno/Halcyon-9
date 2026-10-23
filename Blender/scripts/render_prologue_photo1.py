"""
Prologue photo 1 (our little Voss): a sunny garden; his mother, young (jet black hair, the teal
cardigan, the pendant), smiling, cradles baby Voss (Blender/assets/babyTpose.fbx, local only): a
newborn, swaddled in a pale yellow blanket (only his head is kept), asleep in the crook of her left
arm. Renders the whole frame; scripts/prologue/compose-photo1.mjs grades it and puts it in the
Polaroid, captioned "Our little Voss". His mother and the helpers are in prologue_common.py.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/render_prologue_photo1.py -- [out.png]
Set FACES=<dir> to render close-ups of the two faces instead.
"""
import sys, os, math
import bpy
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prologue_common import *   # noqa: E402,F403

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(ROOT, 'docs', 'reference-art', 'prologue-photo1-render.png')

cast = Cast()
scn = scene()
m_arm, m_root = cast.m_arm, cast.m_root
for o in cast.V:                                     # grown-up Voss sits this one out
    o.hide_render = True
cast.v_root.location = (50, 50, 0)

# ---------- her: young, smiling in the sun ----------
mom_face(cast, 1.3)
mom_close_eyes(cast, 0.3)                            # squinting a little
restyle_mom(cast, cardigan='#3f8c88', young=True)
to_height(mom_head(cast), m_root, 1.63)
m_root['yaw'] = math.radians(-12)
turn(m_root, -12)

# ---------- baby Voss: a newborn ----------
before = set(bpy.data.objects)
bpy.ops.import_scene.fbx(filepath=os.path.join(ROOT, 'Blender', 'assets', 'babyTpose.fbx'))
BABY = [o for o in bpy.data.objects if o not in before]
b_arm = next(o for o in BABY if o.type == 'ARMATURE')
b_arm.animation_data.action = None
b_arm.scale = [x * 0.85 for x in b_arm.scale]          # newborn size
body = bpy.data.objects['CC_Base_Body']
for k, w in {'Mouth_Smile': 0.5, 'Cheek_Raise_L': 0.5, 'Cheek_Raise_R': 0.5,
             'Eye_Blink_L': 0.85, 'Eye_Blink_R': 0.85}.items():      # asleep, content
    body.data.shape_keys.key_blocks[k].value = w
update()
# lying across her arms: his head toward her left (+x), his face to the camera and a little up
b_arm.rotation_euler = (math.radians(-30), math.radians(90), 0)
update()


chest = bone_world(m_arm, 'Spine4')
neck_b = bone_world(b_arm, 'NeckTwist01')
hips_b = bone_world(b_arm, 'Hip')
b_arm.location += chest + Vector((0.0, -0.2, -0.1)) - (neck_b + hips_b) / 2
update()

# only his head shows: the rest of him (and his nappy) is cut away, and the swaddle is shaped as a
# newborn's bundle is, about 32 cm from his chin to its foot, rounder at his bottom
neck_b = bone_world(b_arm, 'NeckTwist01')
hips_b = bone_world(b_arm, 'Hip')
down = (hips_b - neck_b).normalized()
import bmesh
for o in BABY:
    if o.type != 'MESH' or o.name in ('CC_Base_Eye', 'CC_Base_Tongue', 'Custom_Teeth'):
        continue
    dg = bpy.context.evaluated_depsgraph_get()
    e = o.evaluated_get(dg); m = e.to_mesh()
    head_c = bone_world(b_arm, 'Head', tail=True).lerp(bone_world(b_arm, 'Head'), 0.5)
    cut = {v.index for v in m.vertices
           if ((e.matrix_world @ v.co) - neck_b).dot(down) > 0.025 or ((e.matrix_world @ v.co) - head_c).length > 0.105}
    e.to_mesh_clear()
    bm = bmesh.new(); bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in cut], context='VERTS')
    bm.to_mesh(o.data); bm.free()
update()
length, rad = 0.34, 0.085
centre = neck_b + down * (length / 2 - 0.055)              # reaching up behind his head
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=centre, segments=48, ring_count=24)
swaddle = bpy.context.object
swaddle.scale = (length / 2, rad, rad * 0.9)
swaddle.rotation_mode = 'QUATERNION'
swaddle.rotation_quaternion = Vector((1, 0, 0)).rotation_difference(down)
bpy.ops.object.shade_smooth()
knit = bpy.data.materials.new('Swaddle'); knit.use_nodes = True
nt = knit.node_tree; kb = nt.nodes['Principled BSDF']
kb.inputs['Base Color'].default_value = (*srgb('#f3e2a6'), 1); kb.inputs['Roughness'].default_value = 0.95
wave = nt.nodes.new('ShaderNodeTexWave'); wave.inputs['Scale'].default_value = 60
bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.25
nt.links.new(wave.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], kb.inputs['Normal'])
swaddle.data.materials.append(knit)

# her arms under him: her left under his shoulders, his head in the crook of her elbow; her right
# under the bundle
reach(m_arm, +1, neck_b + Vector((-0.05, 0.03, -rad - 0.04)), (1, 0.3, -0.6))
reach(m_arm, -1, centre + down * 0.08 + Vector((0, 0.0, -rad + 0.01)), (-1, 0.2, -0.6))
lean(m_arm, m_root, 'Spine4', 6)
lean(m_arm, m_root, 'Head1', 12)                      # looking down at him
rotate_world(m_arm, 'Head1', 'Y', -8)
add_pendant(cast)

# ---------- the garden ----------
def box(name, loc, size, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    o.data.materials.append(mat)
    return o


grass = bpy.data.materials.new('Grass'); grass.use_nodes = True
gn = grass.node_tree; gb = gn.nodes['Principled BSDF']
noise = gn.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 40
ramp = gn.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (*srgb('#4f7f2f'), 1); ramp.color_ramp.elements[1].color = (*srgb('#86b04a'), 1)
gn.links.new(noise.outputs['Fac'], ramp.inputs['Fac']); gn.links.new(ramp.outputs['Color'], gb.inputs['Base Color'])
bpy.ops.mesh.primitive_plane_add(size=30); bpy.context.object.data.materials.append(grass)
white = flat('Fence', srgb('#f4f2ec'), 0.6)
for i in range(-14, 15):                                       # a white picket fence
    box('Picket', (i * 0.16, 3.0, 0.5), (0.08, 0.03, 1.0), white)
box('Rail', (0, 2.98, 0.75), (5, 0.02, 0.06), white)
box('Rail2', (0, 2.98, 0.3), (5, 0.02, 0.06), white)
leaf = flat('Hedge', srgb('#3f6b2a'), 0.9)
for i in range(-6, 7):                                         # a hedge behind it
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.6, location=(i * 0.75, 3.8, 0.7 + (i % 3) * 0.1))
    bpy.context.object.data.materials.append(leaf); bpy.ops.object.shade_smooth()
flowers = [flat('FlowerPink', srgb('#e86a9a'), 0.6), flat('FlowerYellow', srgb('#f2c53d'), 0.6), flat('FlowerWhite', srgb('#fbfbf5'), 0.6)]
import random
rnd = random.Random(2)
for i in range(60):                                            # flowers along the fence
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(rnd.uniform(-3, 3), rnd.uniform(2.6, 2.9), rnd.uniform(0.05, 0.3)))
    bpy.context.object.data.materials.append(rnd.choice(flowers))

# ---------- light: bright summer sun, a blue sky ----------
render_setup(transparent=False, world_rgb=(0.22, 0.45, 0.95), world_strength=1.3)
sun_d = bpy.data.lights.new('Sun', 'SUN'); sun_d.energy = 4.5; sun_d.color = (1.0, 0.95, 0.85); sun_d.angle = math.radians(3)
sun = bpy.data.objects.new('Sun', sun_d); scn.collection.objects.link(sun)
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))   # high, from in front and to the left
look = empty('look', (chest.x, chest.y - 0.1, chest.z - 0.02))
cam = camera((chest.x + 0.15, chest.y - 1.9, chest.z + 0.12), look, 50)

if os.environ.get('FACES'):
    for name, p in (('mom', bone_world(m_arm, 'Head1')), ('baby', bone_world(b_arm, 'Head'))):
        look.location = p + Vector((0, 0, 0.04)); cam.location = p + Vector((0.1, -0.9, 0.06)); cam.data.lens = 110
        render(os.path.join(os.environ['FACES'], f'face_{name}.png'))
    sys.exit(0)
render(OUT)
