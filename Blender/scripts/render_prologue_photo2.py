"""
Prologue photo 2 (the explorer): Voss at about seven (the boy model,
Blender/assets/young_boy_in_olive_sweatshirt_and_jeans.glb, local only) in the living room, a
swimming mask pushed up on his forehead, his yellow toy submarine on the rug at his feet; his
mother (young: jet black hair, the teal cardigan, the pendant) stoops behind him, laughing, her
hands on his shoulders. A sofa, a lamp, a window of afternoon light. Renders the whole frame;
scripts/prologue/compose-photo2.mjs grades it and puts it in the Polaroid, captioned
"He wants to be an explorer". His mother and the helpers are in prologue_common.py.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/render_prologue_photo2.py -- [out.png]
Set FACES=<dir> to render a close-up of her face instead.
"""
import sys, os, math
import bpy
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prologue_common import *   # noqa: E402,F403

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(ROOT, 'docs', 'reference-art', 'prologue-photo2-render.png')

cast = Cast()
scn = scene()
m_arm, m_root = cast.m_arm, cast.m_root
for o in cast.V:                                     # grown-up Voss sits this one out
    o.hide_render = True
cast.v_root.location = (50, 50, 0)

# ---------- her: young, laughing ----------
mom_face(cast, 1.5)
restyle_mom(cast, cardigan='#3f8c88', young=True)
to_height(mom_head(cast), m_root, 1.63)

# ---------- him at seven: the boy model, 1.22 m, his feet on the floor ----------
BOY = imp('Blender/assets/young_boy_in_olive_sweatshirt_and_jeans.glb')
boy_root = next(o for o in BOY if o.parent is None)
BOY_H, BOY_FOOT = 1.897, -0.95                       # the model: 1.897 tall, its feet at z -0.95
s = 1.22 / BOY_H
boy_root.scale = [x * s for x in boy_root.scale]
BOY_AT = Vector((0.0, 0.0, -BOY_FOOT * s))
boy_root.location = BOY_AT
update()


def boy(p):
    """A point given in the boy model's own units (as imported) to the world."""
    return BOY_AT + Vector(p) * s


# the swimming mask, pushed up on his forehead (its strap round his head)
head_c = boy((-0.016, -0.028, 0.835))
fwd = Vector((-0.28, -0.96, 0)).normalized()        # his face: his head is turned a little to his right
rubber = flat('MaskRubber', srgb('#1e7fc4'), 0.5)
lens = bpy.data.materials.new('MaskLens'); lens.use_nodes = True
lb = lens.node_tree.nodes['Principled BSDF']
lb.inputs['Base Color'].default_value = (0.75, 0.9, 1.0, 1); lb.inputs['Alpha'].default_value = 0.35
lb.inputs['Roughness'].default_value = 0.05; lens.surface_render_method = 'BLENDED'
mask = empty('Mask', head_c + fwd * 0.06 + Vector((0, 0, 0.04)))          # on his forehead
mask.rotation_euler = (math.radians(-55), 0, math.atan2(fwd.x, -fwd.y))
bpy.ops.mesh.primitive_cube_add(size=1)
frame = bpy.context.object; frame.scale = (0.1, 0.025, 0.045)
b = frame.modifiers.new('round', 'BEVEL'); b.width = 0.02; b.segments = 6
frame.data.materials.append(rubber); frame.parent = mask
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.016, 0))
glass = bpy.context.object; glass.scale = (0.088, 0.004, 0.036)
gb_ = glass.modifiers.new('round', 'BEVEL'); gb_.width = 0.015; gb_.segments = 6
glass.data.materials.append(lens); glass.parent = mask
bpy.ops.mesh.primitive_torus_add(major_radius=0.078, minor_radius=0.006, location=head_c + Vector((0, 0, 0.035)))
strap = bpy.context.object; strap.scale = (1, 1.15, 1); strap.rotation_euler = (math.radians(-12), 0, 0)
strap.data.materials.append(rubber)

# ---------- her: stooping behind him, hands on his shoulders, laughing ----------
m_root.location = (0.04, 0.42, 0)
update()
lean(m_arm, m_root, 'Spine2', 16)
lean(m_arm, m_root, 'Spine4', 8)
lean(m_arm, m_root, 'Head1', -4)
rotate_world(m_arm, 'Head1', 'Y', -7)
shoulder_l = boy((0.13, -0.0, 0.57)) + Vector((0, 0.02, 0.02))
shoulder_r = boy((-0.16, -0.0, 0.57)) + Vector((0, 0.02, 0.02))
reach(m_arm, +1, shoulder_l, (1, 0.3, -0.5))
reach(m_arm, -1, shoulder_r, (-1, 0.3, -0.5))
add_pendant(cast)

# ---------- the living room ----------
def box(name, loc, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = 4
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
    o.data.materials.append(mat)
    return o


wood = flat('Floorboards', srgb('#9a6b44'), 0.45)
bpy.ops.mesh.primitive_plane_add(size=12); bpy.context.object.data.materials.append(wood)
bpy.ops.mesh.primitive_cylinder_add(radius=1.0, depth=0.01, location=(0.05, -0.1, 0.005))
rug = bpy.context.object; rug.scale = (1.3, 0.9, 1)
rug.data.materials.append(flat('Rug', srgb('#b5523b'), 0.95))
box('Wall', (0, 2.1, 1.6), (10, 0.1, 3.2), flat('Wallpaper', srgb('#e6d6b3'), 0.85))
sofa = flat('Sofa', srgb('#56708f'), 0.9)
box('SofaSeat', (-1.3, 1.6, 0.25), (1.8, 0.8, 0.45), sofa, 0.06)
box('SofaBack', (-1.3, 1.95, 0.65), (1.8, 0.25, 0.75), sofa, 0.06)
box('SofaArm', (-2.15, 1.6, 0.45), (0.2, 0.8, 0.5), sofa, 0.06)
box('Cushion', (-0.75, 1.75, 0.6), (0.4, 0.15, 0.35), flat('Cushion', srgb('#e2b44a'), 0.9), 0.05)
box('WindowFrame', (1.4, 2.04, 1.55), (1.3, 0.04, 1.2), flat('Frame', srgb('#f4f1ea'), 0.6))
glow = bpy.data.materials.new('Daylight'); glow.use_nodes = True
gl = glow.node_tree.nodes['Principled BSDF']
gl.inputs['Emission Color'].default_value = (1.0, 0.93, 0.78, 1); gl.inputs['Emission Strength'].default_value = 3.0
box('WindowPane', (1.4, 2.02, 1.55), (1.15, 0.02, 1.05), glow)
box('Mullion', (1.4, 2.0, 1.55), (0.04, 0.03, 1.05), flat('Frame2', srgb('#f4f1ea'), 0.6))
bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=1.5, location=(2.3, 1.7, 0.75))
bpy.context.object.data.materials.append(flat('LampPole', srgb('#3a3a3a'), 0.4, 0.8))
bpy.ops.mesh.primitive_cone_add(radius1=0.22, radius2=0.14, depth=0.3, location=(2.3, 1.7, 1.55))
bpy.context.object.data.materials.append(flat('Shade', srgb('#efe2c4'), 0.9))
box('Frame', (-0.6, 2.04, 1.75), (0.35, 0.02, 0.45), flat('PictureFrame', srgb('#5c3d24'), 0.5))
box('Picture', (-0.6, 2.025, 1.75), (0.28, 0.01, 0.37), flat('PictureSea', srgb('#3a7ea8'), 0.6))

# the toy submarine on the rug at his feet: yellow, a conning tower, a periscope, a propeller
# (its parts placed relative to it)
yellow = flat('ToyYellow', srgb('#f0c419'), 0.35)
sub = empty('ToySub', (0.32, -0.42, 0.072))
sub.rotation_euler[2] = math.radians(25)


def part(o, loc, rot=(0, 0, 0), mat=yellow):
    o.parent = sub
    o.location = loc; o.rotation_euler = rot
    o.data.materials.append(mat)
    return o


bpy.ops.mesh.primitive_uv_sphere_add(radius=0.07)
hull = part(bpy.context.object, (0, 0, 0)); hull.scale = (2.4, 1, 1); bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_cube_add(size=1)
tower = part(bpy.context.object, (0.02, 0, 0.075)); tower.scale = (0.08, 0.045, 0.05)
tb = tower.modifiers.new('round', 'BEVEL'); tb.width = 0.012; tb.segments = 3
bpy.ops.mesh.primitive_cylinder_add(radius=0.006, depth=0.07)
part(bpy.context.object, (0.03, 0, 0.13), mat=flat('Periscope', srgb('#555555'), 0.4, 0.8))
for x in (-0.07, 0.07):                                          # portholes
    bpy.ops.mesh.primitive_cylinder_add(radius=0.016, depth=0.01)
    part(bpy.context.object, (x, -0.066, 0.01), (math.radians(90), 0, 0), flat('Porthole', srgb('#7fc4e8'), 0.1))
bpy.ops.mesh.primitive_cone_add(radius1=0.035, depth=0.03)
part(bpy.context.object, (-0.18, 0, 0), (0, math.radians(-90), 0), flat('Prop', srgb('#c0392b'), 0.4))

# ---------- light: afternoon through the window, a lamp, the camera's flash ----------
render_setup(transparent=False, world_rgb=(0.95, 0.88, 0.75), world_strength=0.35)
look = empty('look', (0.05, 0.1, 0.85))
light((1.4, 1.6, 1.6), 260, 1.2, (1.0, 0.9, 0.72), look)          # the window
light((-1.5, -1.2, 2.6), 220, 2.5, (1.0, 0.9, 0.78), look)         # the room
cam = camera((0.1, -2.7, 1.05), look, 40)
flash = light(cam.location + Vector((0.05, 0, 0.1)), 90, 0.05, (1.0, 0.98, 0.95), look, kind='SPOT')
flash.data.spot_size = math.radians(70); flash.data.spot_blend = 0.8

if os.environ.get('FACES'):
    h = bone_world(m_arm, 'Head1')
    look.location = h + Vector((0, 0, 0.05)); cam.location = h + Vector((0.1, -1.1, 0.05)); cam.data.lens = 110
    render(os.path.join(os.environ['FACES'], 'face_mom.png'))
    look.location = head_c; cam.location = head_c + Vector((0.05, -1.0, 0.05))
    render(os.path.join(os.environ['FACES'], 'face_boy.png'))
    sys.exit(0)
render(OUT)
