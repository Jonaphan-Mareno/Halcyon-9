"""
Prologue photo 3 (the science fair): Voss at fifteen (short hair, a school blazer, smiling) beside
his project, LIFE IN THE DEEP: a trifold board with a blue 1st place rosette, and a little tank
with a glowing jellyfish in it. His mother (still young: jet black hair, smooth skin, the teal
cardigan, the pendant) stands at his side, beaming, her hand on his shoulder. A school hall
behind them, its SCIENCE FAIR banner. Renders the whole frame; scripts/prologue/compose-photo3.mjs
grades it and puts it in the Polaroid, captioned "He's top of the class again". The cast and the
helpers are in prologue_common.py.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/render_prologue_photo3.py -- [out.png]
Set FACES=<dir> to render close-ups of the faces instead.
"""
import sys, os, math
import bpy
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prologue_common import *   # noqa: E402,F403

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(ROOT, 'docs', 'reference-art', 'prologue-photo3-render.png')

cast = Cast()
scn = scene()
v_arm, m_arm, v_root, m_root = cast.v_arm, cast.m_arm, cast.v_root, cast.m_root

# ---------- faces: both proud and smiling ----------
voss_face(cast, {'mouth_smile': 1.5, 'mouth_wide': 0.6, 'jaw_open': 0.15, 'brow_up': 0.3}, grin_k=1.0)
mom_face(cast, 1.1)
restyle_mom(cast, cardigan='#3f8c88', young=True)               # still young: jet black hair, smooth skin

# ---------- him at fifteen; their heights ----------
freeze_clip(v_arm, 'Idle')
teen_voss(cast)
to_height(cast.V_HEAD, v_root, 1.6)
to_height(mom_head(cast), m_root, 1.63)

v_root.location = (-0.22, 0, 0)
m_root.location = (0.24, 0.06, 0)
v_root['yaw'] = math.radians(6)
m_root['yaw'] = math.radians(-10)
update()

# ---------- his project ----------
def box(name, loc, size, mat, rot_z=0.0, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size; o.rotation_euler[2] = rot_z
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 3
    o.data.materials.append(mat)
    return o


def text(body, loc, size, mat, rot_z=0.0, align='CENTER'):
    bpy.ops.object.text_add(location=loc, rotation=(math.radians(90), 0, rot_z))
    t = bpy.context.object
    t.data.body = body; t.data.size = size; t.data.align_x = align; t.data.align_y = 'CENTER'
    t.data.extrude = 0.0006
    t.data.materials.append(mat)
    return t


TX, TY, TH = -0.95, 0.05, 0.74                     # the table: beside him, to his right
cloth = flat('TableCloth', srgb('#2f4f7a'), 0.85)
box('Table', (TX, TY, TH - 0.02), (0.95, 0.6, 0.04), cloth)
box('TableSkirt', (TX, TY - 0.29, TH / 2), (0.95, 0.02, TH), cloth)
board = flat('Board', srgb('#f3efe4'), 0.8)
panel_w, panel_h = 0.42, 0.6
bz = TH + panel_h / 2
box('BoardMid', (TX, TY + 0.2, bz), (panel_w, 0.01, panel_h), board)
box('BoardL', (TX - panel_w / 2 - 0.13, TY + 0.1, bz), (0.3, 0.01, panel_h), board, math.radians(-38))
box('BoardR', (TX + panel_w / 2 + 0.13, TY + 0.1, bz), (0.3, 0.01, panel_h), board, math.radians(38))
navy = flat('Ink', srgb('#1d2c4f'), 0.6)
text('LIFE IN\nTHE DEEP', (TX, TY + 0.19, bz + 0.2), 0.055, navy)
deep = flat('DeepPhoto', srgb('#0d3a5c'), 0.5)
box('Photo1', (TX - 0.08, TY + 0.192, bz + 0.03), (0.16, 0.004, 0.12), deep)
box('Photo2', (TX + 0.1, TY + 0.192, bz + 0.03), (0.13, 0.004, 0.12), flat('Chart', srgb('#d9e6ef'), 0.5))
for i in range(4):                                  # lines of writing
    box('Line', (TX - 0.06, TY + 0.192, bz - 0.09 - i * 0.03), (0.2, 0.003, 0.008), flat('Writing', srgb('#7a7f8a'), 0.7))
for side, rz in ((-1, -38), (1, 38)):
    cx = TX + side * (panel_w / 2 + 0.13)
    for i in range(3):
        o = box('SideBit', (cx, TY + 0.094, bz + 0.12 - i * 0.12), (0.2, 0.004, 0.08),
                deep if i % 2 == 0 else flat('Chart2', srgb('#e8d9b0'), 0.6), math.radians(rz))
# the 1st place rosette, pinned to the middle panel under the title
blue = flat('Rosette', srgb('#1f4fb3'), 0.45)
bpy.ops.mesh.primitive_cylinder_add(radius=0.055, depth=0.008, location=(TX + 0.13, TY + 0.185, bz - 0.17), rotation=(math.radians(90), 0, 0))
bpy.context.object.data.materials.append(blue)
bpy.ops.mesh.primitive_cylinder_add(radius=0.035, depth=0.01, location=(TX + 0.13, TY + 0.18, bz - 0.17), rotation=(math.radians(90), 0, 0))
bpy.context.object.data.materials.append(gold())
for dx in (-0.02, 0.02):
    box('Tail', (TX + 0.13 + dx, TY + 0.186, bz - 0.24), (0.025, 0.004, 0.1), blue, 0)
text('1st', (TX + 0.13, TY + 0.174, bz - 0.17), 0.028, navy)
# the little tank: glass, blue water, a glowing jellyfish
glass = bpy.data.materials.new('Glass'); glass.use_nodes = True
gb = glass.node_tree.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value = (0.8, 0.9, 0.95, 1); gb.inputs['Alpha'].default_value = 0.18
gb.inputs['Roughness'].default_value = 0.05; glass.surface_render_method = 'BLENDED'
water = bpy.data.materials.new('Water'); water.use_nodes = True
wb = water.node_tree.nodes['Principled BSDF']
wb.inputs['Base Color'].default_value = (*srgb('#1b6fa8'), 1); wb.inputs['Alpha'].default_value = 0.55
wb.inputs['Emission Color'].default_value = (*srgb('#1b6fa8'), 1); wb.inputs['Emission Strength'].default_value = 0.4
water.surface_render_method = 'BLENDED'
box('Tank', (TX - 0.05, TY - 0.12, TH + 0.12), (0.34, 0.2, 0.22), glass)
box('Water', (TX - 0.05, TY - 0.12, TH + 0.1), (0.33, 0.19, 0.18), water)
jelly = bpy.data.materials.new('Jelly'); jelly.use_nodes = True
jb = jelly.node_tree.nodes['Principled BSDF']
jb.inputs['Emission Color'].default_value = (*srgb('#9ff3ff'), 1); jb.inputs['Emission Strength'].default_value = 4
jb.inputs['Base Color'].default_value = (*srgb('#c9f8ff'), 1)
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.04, location=(TX - 0.05, TY - 0.12, TH + 0.14))
bell = bpy.context.object; bell.scale = (1, 1, 0.6); bell.data.materials.append(jelly)
bpy.ops.object.shade_smooth()
for i in range(6):
    a = i / 6 * 2 * math.pi
    bpy.ops.mesh.primitive_cylinder_add(radius=0.002, depth=0.07, location=(TX - 0.05 + math.cos(a) * 0.022, TY - 0.12 + math.sin(a) * 0.022, TH + 0.1))
    bpy.context.object.data.materials.append(jelly)

# ---------- poses ----------
# him: his right hand resting on the edge of his table, his left at his side
reach(v_arm, -1, Vector((TX + 0.4, TY - 0.22, TH + 0.04)), (-0.5, 0.6, -0.3))
pose_arm(v_arm, v_root, +1, (0.12, 0.02, -1), (0.08, -0.15, -1))
rotate_world(v_arm, 'Head1', 'Y', 4)
# her: her right hand on his shoulder, her left at her heart
reach(m_arm, -1, bone_world(v_arm, 'L_UpperArm') + Vector((0.07, 0.05, -0.03)), (0.3, 0.8, -0.6))
reach(m_arm, +1, bone_world(m_arm, 'Spine4') + Vector((0.0, -0.16, -0.1)), (1, 0.2, -0.8))
rotate_world(m_arm, 'Head1', 'Y', -8)                 # leaning toward him
add_pendant(cast)

# ---------- the hall ----------
floor_m = bpy.data.materials.new('Boards'); floor_m.use_nodes = True
nt = floor_m.node_tree; fb = nt.nodes['Principled BSDF']
brick = nt.nodes.new('ShaderNodeTexBrick')                  # long wooden boards
brick.inputs['Scale'].default_value = 3; brick.inputs['Mortar Size'].default_value = 0.004
brick.inputs['Brick Width'].default_value = 1.6; brick.inputs['Row Height'].default_value = 0.12
brick.inputs['Color1'].default_value = (*srgb('#a87545'), 1); brick.inputs['Color2'].default_value = (*srgb('#8f6038'), 1)
brick.inputs['Mortar'].default_value = (*srgb('#5a3c22'), 1)
nt.links.new(brick.outputs['Color'], fb.inputs['Base Color']); fb.inputs['Roughness'].default_value = 0.35
bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, 0)); bpy.context.object.data.materials.append(floor_m)
box('Wall', (0, 3.2, 2.0), (12, 0.1, 4.0), flat('HallWall', srgb('#d8cdb4'), 0.85))
box('WallLow', (0, 3.14, 0.5), (12, 0.04, 1.0), flat('HallDado', srgb('#6f8a6a'), 0.7))
box('Banner', (0.2, 3.1, 2.55), (2.6, 0.02, 0.5), flat('BannerRed', srgb('#a3262c'), 0.7))
text('SCIENCE FAIR', (0.2, 3.08, 2.55), 0.26, flat('BannerText', srgb('#f6efe0'), 0.6))
for x, y in ((-2.6, 1.6), (2.2, 1.9), (3.2, 1.0)):             # other children's tables
    box('OtherTable', (x, y, TH - 0.02), (0.95, 0.6, 0.04), flat('OtherCloth', srgb('#6d3b5a' if x < 0 else '#3c6b47'), 0.85))
    box('OtherSkirt', (x, y - 0.29, TH / 2), (0.95, 0.02, TH), flat('OtherCloth2', srgb('#6d3b5a' if x < 0 else '#3c6b47'), 0.85))
    box('OtherBoard', (x, y + 0.2, TH + 0.3), (0.5, 0.01, 0.6), board)

# ---------- light: the hall's warm lights, and the camera's flash ----------
render_setup(transparent=False, world_rgb=(0.9, 0.82, 0.7), world_strength=0.25)
look = empty('look', (-0.3, 0, 1.1))
light((-1.0, -1.0, 3.2), 380, 3.0, (1.0, 0.86, 0.68), look)           # the hall lights
light((2.0, 0.5, 3.0), 200, 3.0, (1.0, 0.86, 0.68), look)
cam = camera((0.15, -3.1, 1.4), look, 38)
flash = light(cam.location + Vector((0.05, 0, 0.1)), 140, 0.05, (1.0, 0.98, 0.95), look, kind='SPOT')
flash.data.spot_size = math.radians(70); flash.data.spot_blend = 0.8

if os.environ.get('FACES'):
    closeups(cast, cam, look, os.environ['FACES'])
    sys.exit(0)
render(OUT)
