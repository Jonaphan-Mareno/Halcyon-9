"""
Prologue photo 6 (the hospital): a memory care ward under cold strip light. His mother, frail now
(grey hair spread on the pillow, eyes heavy, the pendant), lies under a pale blanket, her right hand
out over its edge; Voss kneels at the bedside in his lab coat, his head bowed, holding it in both
of his. On the wall above her: MEMORY CARE UNIT; beside it the whiteboard the nurses write for her
(the day, and that her son is coming). A heart monitor and a drip stand. Renders the whole frame;
scripts/prologue/compose-photo6.mjs grades it and puts it in the Polaroid. The cast and the helpers
are in prologue_common.py.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/render_prologue_photo6.py -- [out.png]
Set FACES=<dir> to render close-ups of the faces instead.
"""
import sys, os, math
import bpy
import bmesh
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prologue_common import *   # noqa: E402,F403

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(ROOT, 'docs', 'reference-art', 'prologue-photo6-render.png')

cast = Cast()
scn = scene()
v_arm, m_arm, v_root, m_root = cast.v_arm, cast.m_arm, cast.v_root, cast.m_root

BED_X, BED_TOP = 0.0, 0.62           # the bed's long axis is y (her head toward the wall, +y)

# ---------- faces: his grief; hers tired ----------
voss_face(cast, {'brow_inner_up': 1.0, 'mouth_frown': 0.8, 'eyes_tired': 0.8})
mom_close_eyes(cast, 0.75)
restyle_mom(cast, cardigan='#9fb4c4', grey=0.7, untidy=0.2, fall=False)     # (the cardigan: a hospital gown blue)

freeze_clip(v_arm, 'Idle')
standard_heights(cast)
v_root.location = (50, 50, 0)                       # out of the way until he is placed (the blanket is traced from above)

# ---------- her: posed standing (arms at her sides, head bent forward onto the pillow), laid in the bed ----------
pose_arm(m_arm, m_root, -1, (-0.1, 0.0, -1), (-0.05, -0.1, -1))
pose_arm(m_arm, m_root, +1, (0.1, 0.0, -1), (0.05, -0.1, -1))
lean(m_arm, m_root, 'Neck1', 24)                    # her head propped on the pillow
rotate_world(m_arm, 'Head1', 'Z', 24)               # turned a little to her left: toward the camera
# lying on her back, head toward +y, face up: rotate +90 degrees about x
turn(m_root, Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0))).to_quaternion())   # (rows; columns: x -> x, y -> -z, z -> +y)
lo, hi = bounds(cast.M)
m_root.location = Vector((BED_X, 0.0, 0)) + Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2 - 0.05, BED_TOP - lo.z + 0.01))
update()
add_pendant(cast)

# ---------- the bed, the pillow ----------
def box(name, loc, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 4
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
    o.data.materials.append(mat)
    return o


lo, hi = bounds(cast.M)
foot_y, head_y = lo.y - 0.25, hi.y + 0.15
bed_len = head_y - foot_y
sheet = flat('Sheet', srgb('#e9ece8'), 0.85)
steel = flat('Steel', srgb('#b9bdc0'), 0.35, 1.0)
box('Mattress', (BED_X, (foot_y + head_y) / 2, BED_TOP - 0.08), (0.95, bed_len, 0.16), sheet, 0.03)
box('BedFrame', (BED_X, (foot_y + head_y) / 2, BED_TOP - 0.22), (1.0, bed_len + 0.04, 0.12), steel)
box('Headboard', (BED_X, head_y + 0.02, BED_TOP + 0.15), (1.0, 0.05, 0.75), flat('Headboard', srgb('#d7d2c6'), 0.5), 0.02)
for x in (-0.45, 0.45):
    for y in (foot_y + 0.05, head_y - 0.05):
        box('Leg', (BED_X + x, y, (BED_TOP - 0.28) / 2), (0.04, 0.04, BED_TOP - 0.28), steel)

# the pillow: under the back of her head
cap_lo, cap_hi = bounds([cast.mom_hair], hidden=True)
pillow_top = cap_lo.z + 0.01
box('Pillow', (BED_X, (cap_lo.y + head_y) / 2 + 0.02, (BED_TOP + pillow_top) / 2), (0.62, head_y - cap_lo.y + 0.12, pillow_top - BED_TOP), sheet, 0.05)

# her hair spread on the pillow
hair_on_floor(cast, length=0.09, z=pillow_top + 0.001)
hair_strands_lying(cast, count=2200, length=(0.08, 0.16), z=pillow_top + 0.003)

# her right hand out from under the blanket, over the edge of the bed toward him; her left stays
# at her side, under it
chest = bone_world(m_arm, 'Spine4')
her_hand = Vector((BED_X - 0.6, chest.y - 0.28, BED_TOP - 0.03))
reach(m_arm, -1, her_hand, (-0.2, 0, 1))

# ---------- the blanket: draped over her from her feet to her chest ----------
update()
dg = bpy.context.evaluated_depsgraph_get()
blanket_top = chest.y - 0.02
nx, ny = 70, 110
x0, x1 = BED_X - 0.48, BED_X + 0.5
y0, y1 = foot_y - 0.02, blanket_top
heights = []
for i in range(ny + 1):
    row = []
    for j in range(nx + 1):
        x, y = x0 + (x1 - x0) * j / nx, y0 + (y1 - y0) * i / ny
        hit, loc, *_ = scn.ray_cast(dg, Vector((x, y, 2.0)), Vector((0, 0, -1)))
        row.append((loc.z if hit else BED_TOP) + 0.03)
    heights.append(row)
raw = [row[:] for row in heights]                    # what it rests on
heights = [[max(heights[a][b] for a in range(max(i - 1, 0), min(i + 2, ny + 1))   # (widened a little: her toes)
                for b in range(max(j - 1, 0), min(j + 2, nx + 1))) for j in range(nx + 1)] for i in range(ny + 1)]
for _ in range(14):                                   # drape: soften the body's shape under the cloth
    heights = [[(heights[i][j] * 2 + sum(heights[a][b] for a, b in ((i - 1, j), (i + 1, j), (i, j - 1), (i, j + 1))
                                          if 0 <= a <= ny and 0 <= b <= nx) / 2) / 4
                if 0 < i < ny and 0 < j < nx else heights[i][j] for j in range(nx + 1)] for i in range(ny + 1)]
heights = [[max(h, r - 0.02) for h, r in zip(hr, rr)] for hr, rr in zip(heights, raw)]   # never sinking into her (it gives a little over her toes)
bm = bmesh.new()
grid = [[bm.verts.new((x0 + (x1 - x0) * j / nx, y0 + (y1 - y0) * i / ny, heights[i][j])) for j in range(nx + 1)] for i in range(ny + 1)]
for i in range(ny):
    for j in range(nx):
        bm.faces.new([grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]])
for j in (0, nx):                                    # hanging over the sides
    for i in range(ny + 1):
        grid[i][j].co.z -= 0.18
        grid[i][j].co.x += 0.04 if j else -0.04
me = bpy.data.meshes.new('Blanket'); bm.to_mesh(me); bm.free()
blanket = bpy.data.objects.new('Blanket', me); scn.collection.objects.link(blanket)
me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
blanket.modifiers.new('thick', 'SOLIDIFY').thickness = 0.01
blanket.data.materials.append(flat('Blanket', srgb('#c9d4d8'), 0.9))
update()

# ---------- him: kneeling at the bedside, head bowed, her hand in both of his ----------
freeze_clip(v_arm, 'Crouch')
turn(v_root, 90)                                     # facing the bed (+x)
v_root.location = (BED_X - 0.95, her_hand.y + 0.05, 0)
update()
lean(v_arm, v_root, 'Spine2', 26)
lean(v_arm, v_root, 'Spine4', 10)
lean(v_arm, v_root, 'Head1', 34)                     # bowed over her hand
hand = bone_world(m_arm, 'R_Hand')
reach(v_arm, -1, hand + Vector((-0.03, -0.05, -0.02)), (0, -1, -0.2))
reach(v_arm, +1, hand + Vector((-0.02, 0.05, 0.03)), (0, 1, -0.2))

# ---------- the room ----------
wall = flat('Wall', srgb('#c7d3c6'), 0.85)                   # institutional pale green
floor_m = flat('Lino', srgb('#a9aea4'), 0.4)
bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0)); bpy.context.object.data.materials.append(floor_m)
box('BackWall', (0, head_y + 0.3, 1.5), (8, 0.1, 3), wall)
box('SideWall', (2.2, 0, 1.5), (0.1, 8, 3), wall)


def text(body, loc, size, mat, align='CENTER', rot=(math.radians(90), 0, 0), extrude=0.0005):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    t = bpy.context.object
    t.data.body = body; t.data.size = size; t.data.align_x = align; t.data.align_y = 'CENTER'
    t.data.extrude = extrude
    t.data.materials.append(mat)
    return t


wall_y = head_y + 0.24
# the sign over the bed
box('Sign', (BED_X, wall_y, 2.05), (1.25, 0.02, 0.2), flat('SignBlue', srgb('#1f4e79'), 0.4))
text('MEMORY CARE UNIT', (BED_X, wall_y - 0.015, 2.05), 0.1, flat('SignText', srgb('#f4f4f0'), 0.5))
# the whiteboard the nurses keep for her
BOARD_X = BED_X - 1.25                                # on the wall behind him
box('Whiteboard', (BOARD_X, wall_y, 1.45), (0.8, 0.02, 0.6), flat('Board', srgb('#f6f7f4'), 0.15), 0.005)
box('BoardFrame', (BOARD_X, wall_y + 0.005, 1.45), (0.84, 0.015, 0.64), steel)
marker_blue = flat('MarkerBlue', srgb('#1d3f9a'), 0.5)
marker_red = flat('MarkerRed', srgb('#b3262d'), 0.5)
text('Today is TUESDAY', (BOARD_X, wall_y - 0.02, 1.64), 0.07, marker_blue)
text('You are in\nSt. Brigid\'s Hospital', (BOARD_X, wall_y - 0.02, 1.47), 0.055, marker_blue)
text('Your son is\ncoming today', (BOARD_X, wall_y - 0.02, 1.27), 0.055, marker_red)

# the heart monitor on its arm, and the drip
box('MonitorArm', (BED_X + 0.75, wall_y - 0.15, 1.6), (0.04, 0.3, 0.04), steel)
box('Monitor', (BED_X + 0.75, wall_y - 0.32, 1.6), (0.36, 0.06, 0.26), flat('MonitorCase', srgb('#d9dcdc'), 0.4), 0.01)
screen = bpy.data.materials.new('Screen'); screen.use_nodes = True
sb = screen.node_tree.nodes['Principled BSDF']
sb.inputs['Base Color'].default_value = (0.01, 0.02, 0.02, 1)
box('Screen', (BED_X + 0.75, wall_y - 0.352, 1.61), (0.3, 0.005, 0.19), screen)
# the trace: a flat line with a beat in it, glowing green
trace = bpy.data.curves.new('Trace', 'CURVE'); trace.dimensions = '3D'; trace.bevel_depth = 0.002
sp = trace.splines.new('POLY')
beat = [(0, 0), (0.08, 0), (0.1, 0.02), (0.115, -0.05), (0.13, 0.07), (0.145, -0.01), (0.17, 0), (0.25, 0)]
sp.points.add(len(beat) - 1)
for p, (dx, dz) in zip(sp.points, beat):
    p.co = (BED_X + 0.75 - 0.125 + dx, wall_y - 0.356, 1.6 + dz, 1)
glow = bpy.data.materials.new('Glow'); glow.use_nodes = True
gb = glow.node_tree.nodes['Principled BSDF']
gb.inputs['Emission Color'].default_value = (0.2, 1.0, 0.35, 1); gb.inputs['Emission Strength'].default_value = 6
tobj = bpy.data.objects.new('Trace', trace); scn.collection.objects.link(tobj); trace.materials.append(glow)
# drip stand on her other side, at the head of the bed
bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=1.9, location=(BED_X + 0.62, head_y - 0.3, 0.95))
bpy.context.object.data.materials.append(steel)
bag = box('DripBag', (BED_X + 0.62, head_y - 0.3, 1.75), (0.12, 0.04, 0.2), flat('Bag', srgb('#e8eef0'), 0.2), 0.02)

# ---------- light: cold strip light overhead, a little grey daylight ----------
render_setup(transparent=False, world_rgb=(0.6, 0.66, 0.7), world_strength=0.15)
look = empty('look', (BED_X - 0.3, chest.y + 0.1, BED_TOP + 0.25))
light((BED_X, chest.y, 2.8), 300, 1.6, (0.88, 0.95, 1.0), look)          # the ceiling strip
light((BED_X + 2.0, chest.y - 1.0, 1.8), 120, 2.0, (0.8, 0.86, 0.95), look)  # the window
light((BED_X - 1.5, chest.y - 2.5, 1.8), 60, 3.0, (1.0, 0.97, 0.92), look)   # fill from the door
cam = camera((BED_X + 1.3, chest.y - 1.9, 2.25), look, 30)

if os.environ.get('FACES'):
    closeups(cast, cam, look, os.environ['FACES'])
    sys.exit(0)
render(OUT)
