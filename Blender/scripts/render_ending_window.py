"""
The Save-ARIA ending's narration, line 4 ("...and his mother was the first person to be cured"):
his mother, old now (silver hair, an oatmeal cardigan, a scarf), at the window of the memory care
ward in the morning, her hands on the sill, looking out and smiling. Seen from outside: the
hospital's cream wall around the window, a box of flowers on the sill, the low sun on her face; the
ward behind her (its sign, the bed's foot) soft in the depth of field. The cast and the helpers are
prologue_common.py's (the same model as the prologue's photos 4 to 6); this renders the whole frame,
and scripts/ending-shots/compose.mjs grades it and makes public/assets/textures/ending/mom-window.webp.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/render_ending_window.py -- [out.png]
Set FACES=<dir> to render close-ups of her face instead.
"""
import sys, os, math, random
import bpy
import bmesh
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prologue_common import *   # noqa: E402,F403

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(ROOT, 'docs', 'reference-art', 'ending-window-render.png')

cast = Cast()
scn = scene()
m_arm, m_root = cast.m_arm, cast.m_root
for o in cast.V:
    o.hide_render = True                             # (only her)

# The window, in the ward's wall (her room: floor z 0, she looks out toward -y)
WALL_IN, WALL_OUT = -0.35, -0.65                     # the wall's inside and outside faces (y)
WIN_X0, WIN_X1, SILL, WIN_TOP = -0.62, 0.62, 0.9, 2.15
FRAME_Y = -0.47                                      # the frame, set back from the outside face
HER = Vector((-0.08, -0.04, 0))                      # where she stands

# ---------- her: old, silver haired, smiling ----------
restyle_mom(cast, cardigan='#d6c6aa', grey=0.8, streaks=0.0)
head = cast.new_head


def hair_fix(head):
    """Her silver hair: the strands either side of her face are hers too (the mask is widened
    toward the cheeks there), and its lightest strands stop at silver, not white."""
    nt = head.data.materials[0].node_tree
    for n in nt.nodes:
        if n.type == 'MAP_RANGE' and abs(n.inputs['From Min'].default_value - 0.05) < 1e-6:
            n.inputs['From Min'].default_value = 0.044; n.inputs['From Max'].default_value = 0.049
    tone = next(n for n in nt.nodes if n.type == 'MATH' and n.operation == 'MULTIPLY_ADD' and n.inputs[1].default_value > 1)
    cap = nt.nodes.new('ShaderNodeMath'); cap.operation = 'MINIMUM'; cap.inputs[1].default_value = 0.6
    for link in list(tone.outputs['Value'].links):
        nt.links.new(cap.outputs['Value'], link.to_socket)
    nt.links.new(tone.outputs['Value'], cap.inputs[0])


def older_skin(head):
    """Her skin: a little paler and less rosy, with fine lines where age shows first (bump only):
    across the forehead, at the outer corners of the eyes, from the nose to the mouth's corners.
    (Object space of the head: from her nose tip, the face toward -y; her eyes at (+-0.025, 0.032).)"""
    nt = head.data.materials[0].node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    base = b.inputs['Base Color'].links[0].from_socket
    hsv = nt.nodes.new('ShaderNodeHueSaturation')
    hsv.inputs['Saturation'].default_value = 0.82; hsv.inputs['Value'].default_value = 1.03
    nt.links.new(base, hsv.inputs['Color']); nt.links.new(hsv.outputs['Color'], b.inputs['Base Color'])
    # the lines: a height field from object-space math, through a Bump node onto the normal it has
    tc = nt.nodes.new('ShaderNodeTexCoord')
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], xyz.inputs[0])

    def m(op, *args, clamp=False):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate(args):
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs['Value']

    X, Y, Z = xyz.outputs['X'], xyz.outputs['Y'], xyz.outputs['Z']
    ax = m('ABSOLUTE', X)
    front = m('LESS_THAN', Y, 0.05)                                   # the face, not the back of the head

    def band(v, lo, hi, soft):                                       # 1 between lo and hi, soft edges
        a = m('MULTIPLY', m('SUBTRACT', v, lo - soft), 1 / soft, clamp=True)
        c = m('MULTIPLY', m('SUBTRACT', hi + soft, v), 1 / soft, clamp=True)
        return m('MULTIPLY', a, c)

    # forehead: three shallow waves across, above the brows
    fh = m('MULTIPLY', m('MULTIPLY', band(Z, 0.058, 0.08, 0.006), band(ax, 0.0, 0.032, 0.008)),
           m('MULTIPLY_ADD', m('SINE', m('MULTIPLY', Z, 420.0)), 0.5, 0.5))
    # crow's feet: fans of lines from the outer corner of each eye
    dx, dz = m('SUBTRACT', ax, 0.043), m('SUBTRACT', Z, 0.031)
    r = m('SQRT', m('ADD', m('MULTIPLY', dx, dx), m('MULTIPLY', dz, dz)))
    ang = m('ARCTAN2', dz, dx)
    cf = m('MULTIPLY', m('MULTIPLY', band(r, 0.003, 0.014, 0.003), m('GREATER_THAN', dx, -0.002)),
           m('MULTIPLY_ADD', m('SINE', m('MULTIPLY', ang, 9.0)), 0.5, 0.5))
    # the folds from the nose's wings to the mouth's corners: a curve x(z), soft across
    curve_x = m('ADD', 0.018, m('MULTIPLY', m('SUBTRACT', 0.0, Z), 0.17))
    nl = m('MULTIPLY', band(Z, -0.026, -0.004, 0.005),
           m('MAXIMUM', m('SUBTRACT', 1.0, m('MULTIPLY', m('ABSOLUTE', m('SUBTRACT', ax, curve_x)), 400.0)), 0.0))
    height = m('MULTIPLY', m('ADD', m('ADD', m('MULTIPLY', fh, 0.6), m('MULTIPLY', cf, 0.5)), nl), front)
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.0006
    nt.links.new(height, bump.inputs['Height'])
    nb = b.inputs['Normal']
    if nb.is_linked:
        nt.links.new(nb.links[0].from_socket, bump.inputs['Normal'])
    bump.invert = True                                               # (lines are dips)
    nt.links.new(bump.outputs['Normal'], nb)


def smile(head, k=1.0):
    """A smile shaped into her new head (it has no expressions of its own): prologue_common's
    grin() with her new mouth (its line and corners measured on it: from the nose tip, in its
    units), on the face's front only."""
    mouth_z, corner_x = -0.0225, 0.0215
    co = [v.co.copy() for v in head.data.vertices]
    keep = [p.copy() for p in co]
    # grin() works on faces whose front is below y -0.02: shift the front there, and back after
    for p in co:
        p.y -= 0.06
    grin(co, mouth_z, corner_x, k)
    for v, p, q in zip(head.data.vertices, co, keep):
        p.y += 0.06
        v.co = p if q.y < 0.045 and abs(q.z) < 0.07 else q
    head.data.update()


hair_fix(head)
older_skin(head)
smile(head, 1.15)

# ---------- her pose: standing at the window, hands on the sill, looking out at the garden ----------
# (her head level or a little down, and the camera at her eye line: under her chin, where her new head
#  meets her old neck, stays out of sight)
pose_arm(m_arm, m_root, -1, (-0.1, 0.0, -1), (-0.05, -0.1, -1))
pose_arm(m_arm, m_root, +1, (0.1, 0.0, -1), (0.05, -0.1, -1))
standard_heights(cast)
m_root.location = HER
update()
lean(m_arm, m_root, 'Spine2', 4)                     # a little toward the window
rotate_world(m_arm, 'Neck1', 'Z', -14)               # her face turned toward the sun, past the camera
lean(m_arm, m_root, 'Head1', 5)                      # a little down: the garden below
rotate_world(m_arm, 'Head1', 'Y', -4)
for side, x in ((-1, -0.19), (+1, 0.17)):
    reach(m_arm, side, Vector((HER.x + x, WALL_IN + 0.08, SILL + 0.035)), (side * 0.35, 0.45, -1))
curl_hand(m_arm, -1, 16, 8)
curl_hand(m_arm, +1, 16, 8)




# ---------- the building ----------
def box(name, loc, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 3
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
    o.data.materials.append(mat)
    return o


def plaster(name, hexcol, scale=40.0, strength=0.25):
    m = flat(name, srgb(hexcol), 0.92)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale; n.inputs['Detail'].default_value = 8
    bu = nt.nodes.new('ShaderNodeBump'); bu.inputs['Strength'].default_value = strength; bu.inputs['Distance'].default_value = 0.002
    nt.links.new(n.outputs['Fac'], bu.inputs['Height']); nt.links.new(bu.outputs['Normal'], b.inputs['Normal'])
    return m


facade = plaster('Render', '#ece2cf', 60, 0.3)
reveal = plaster('Reveal', '#e3d8c3', 60, 0.25)
frame_m = flat('Frame', srgb('#f2f2ee'), 0.35)
stone = plaster('Sill', '#c9c3b6', 25, 0.4)
# the outside wall, with the window's hole in it (four slabs round it)
T = WALL_IN - WALL_OUT
cy = (WALL_IN + WALL_OUT) / 2
W_OUTER = 3.2                                        # how far the wall goes each side
# (left of the window, right of it, under it, over it)
box('WallL', ((WIN_X0 - W_OUTER) / 2, cy, 1.6), (W_OUTER + WIN_X0, T, 5.2), facade)
box('WallR', ((WIN_X1 + W_OUTER) / 2, cy, 1.6), (W_OUTER - WIN_X1, T, 5.2), facade)
box('WallUnder', (0, cy, (SILL - 1.0) / 2), (WIN_X1 - WIN_X0, T, SILL + 1.0), facade)
box('WallOver', (0, cy, (WIN_TOP + 4.2) / 2), (WIN_X1 - WIN_X0, T, 4.2 - WIN_TOP), facade)
# the reveals (the hole's sides, a shade darker), the stone sill outside, the window board inside
for x in (WIN_X0 + 0.005, WIN_X1 - 0.005):
    box('Reveal', (x, cy, (SILL + WIN_TOP) / 2), (0.012, T, WIN_TOP - SILL), reveal)
box('RevealTop', (0, cy, WIN_TOP - 0.005), (WIN_X1 - WIN_X0, T, 0.012), reveal)
box('StoneSill', (0, WALL_OUT - 0.02, SILL - 0.035), (WIN_X1 - WIN_X0 + 0.12, (FRAME_Y - WALL_OUT) + 0.07, 0.06), stone, 0.006)
box('Board', (0, WALL_IN + 0.05, SILL + 0.012), (WIN_X1 - WIN_X0 + 0.1, 0.2, 0.025), flat('Board', srgb('#efece4'), 0.4), 0.004)
# a band of render along the floor line under the window, and the next floor's ledge above
box('Ledge', (0, WALL_OUT - 0.03, -0.25), (7, 0.08, 0.14), stone, 0.01)
box('Ledge2', (0, WALL_OUT - 0.03, 3.6), (7, 0.08, 0.14), stone, 0.01)
# the frame: four sides, a transom near the top. No glass: in EEVEE its transparency speckles what
# the sun lights through it; the narration draws the sky's light sliding over the pane instead
fw, fd = 0.06, 0.07
box('FrameB', (0, FRAME_Y, SILL + fw / 2), (WIN_X1 - WIN_X0, fd, fw), frame_m, 0.006)
box('FrameT', (0, FRAME_Y, WIN_TOP - fw / 2), (WIN_X1 - WIN_X0, fd, fw), frame_m, 0.006)
box('FrameL', (WIN_X0 + fw / 2, FRAME_Y, (SILL + WIN_TOP) / 2), (fw, fd, WIN_TOP - SILL), frame_m, 0.006)
box('FrameR', (WIN_X1 - fw / 2, FRAME_Y, (SILL + WIN_TOP) / 2), (fw, fd, WIN_TOP - SILL), frame_m, 0.006)
TRANSOM = WIN_TOP - 0.36
box('Transom', (0, FRAME_Y, TRANSOM), (WIN_X1 - WIN_X0, fd, 0.05), frame_m, 0.006)

# ---------- flowers in a box on the sill outside ----------
random.seed(4)
pot = flat('Box', srgb('#b5643f'), 0.8)
box('FlowerBox', (0, WALL_OUT - 0.1, SILL - 0.04), (1.04, 0.17, 0.13), pot, 0.01)
box('Soil', (0, WALL_OUT - 0.1, SILL + 0.02), (1.0, 0.14, 0.01), flat('Soil', srgb('#3b2a1e'), 1.0))


def flower_x():
    """Mostly toward the box's ends (the middle low and thin: she is behind it); and how much lower."""
    if random.random() < 0.8:
        return random.choice((-1, 1)) * random.uniform(0.17, 0.48), 0.0
    return random.uniform(-0.17, 0.17), 0.05
leaf = flat('Leaf', srgb('#4d7a3a'), 0.6)
petals = [flat('Red', srgb('#d23a3c'), 0.55), flat('Pink', srgb('#e889a6'), 0.55), flat('White', srgb('#f4f1ea'), 0.55)]
for i in range(60):
    x, low = flower_x()
    y = WALL_OUT - 0.1 + (random.random() - 0.5) * 0.12
    z = SILL + 0.05 + random.random() * 0.06 - low
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03 + 0.015 * random.random(), location=(x, y, z), segments=10, ring_count=6)
    lf = bpy.context.object; lf.scale = (1.0, 0.8, 0.45)
    lf.rotation_euler = (random.random() * 0.8, random.random() * 0.8, random.random() * 3)
    lf.data.materials.append(leaf); bpy.ops.object.shade_smooth()
for i in range(40):
    x, low = flower_x()
    y = WALL_OUT - 0.11 + (random.random() - 0.5) * 0.12
    z = SILL + 0.1 + random.random() * 0.06 - low
    mat = petals[0] if random.random() < 0.55 else petals[1] if random.random() < 0.6 else petals[2]
    for j in range(5):                                  # a head of a few florets
        o = Vector((random.random() - 0.5, random.random() - 0.5, random.random() - 0.3)) * 0.035
        bpy.ops.mesh.primitive_ico_sphere_add(radius=0.012 + 0.006 * random.random(), location=(x + o.x, y + o.y, z + o.z), subdivisions=1)
        fl = bpy.context.object; fl.data.materials.append(mat)

# ---------- the ward behind her ----------
BACK = 2.4
wall = flat('Wall', srgb('#d2d8c6'), 0.85)                   # the ward's pale green (photo 6), warmer in the sun
bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 1.0, 0)); bpy.context.object.data.materials.append(flat('Lino', srgb('#a9aea4'), 0.4))
box('BackWall', (0, BACK, 1.5), (8, 0.1, 3), wall)
box('SideWallL', (-2.6, 1.0, 1.5), (0.1, 3.0, 3), wall)
box('SideWallR', (2.6, 1.0, 1.5), (0.1, 3.0, 3), wall)
box('Ceiling', (0, 1.0, 2.9), (5.4, 3.0, 0.05), flat('Ceiling', srgb('#e8ebe6'), 0.9))


def text(body, loc, size, mat, rot=(math.radians(90), 0, 0)):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    t = bpy.context.object
    t.data.body = body; t.data.size = size; t.data.align_x = 'CENTER'; t.data.align_y = 'CENTER'
    t.data.extrude = 0.0005
    t.data.materials.append(mat)
    return t


wy = BACK - 0.06
box('Sign', (0.0, wy, 1.74), (1.1, 0.02, 0.18), flat('SignBlue', srgb('#1f4e79'), 0.4))
text('MEMORY CARE UNIT', (0.0, wy - 0.015, 1.74), 0.088, flat('SignText', srgb('#f4f4f0'), 0.5))
# the foot of her bed, made, and a vase of flowers on the table beside it
sheet = flat('Sheet', srgb('#e9ece8'), 0.85)
box('Bed', (1.0, 1.6, 0.5), (1.0, 1.7, 0.22), sheet, 0.04)
box('BedFrame', (1.0, 1.6, 0.33), (1.04, 1.74, 0.12), flat('Steel', srgb('#b9bdc0'), 0.35, 1.0))
box('Table', (-0.85, 1.9, 0.38), (0.5, 0.45, 0.76), flat('Table', srgb('#dcdcd2'), 0.5), 0.015)   # the bedside cabinet
box('Drawer', (-0.85, 1.67, 0.62), (0.44, 0.01, 0.005), flat('Line', srgb('#9a9c96'), 0.5))
bpy.ops.mesh.primitive_cylinder_add(radius=0.055, depth=0.2, location=(-0.85, 1.9, 0.86))
bpy.context.object.data.materials.append(flat('Vase', srgb('#6f9fb8'), 0.2))
for i in range(9):
    o = Vector((random.random() - 0.5, random.random() - 0.5, 0)) * 0.16
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.03, location=(-0.85 + o.x, 1.9 + o.y, 1.02 + random.random() * 0.07), subdivisions=1)
    bpy.context.object.data.materials.append(petals[i % 3])
# curtains, gathered at each side of the window inside
cloth = flat('Curtain', srgb('#dfe3d6'), 0.9)
for side in (-1, 1):
    bm = bmesh.new()
    nx, nz = 24, 12
    x0 = WIN_X0 - 0.3 if side < 0 else WIN_X1 - 0.08
    grid = []
    for k in range(nz + 1):
        z = 0.55 + (WIN_TOP + 0.12 - 0.55) * k / nz
        row = []
        for i in range(nx + 1):
            u = i / nx
            x = x0 + 0.38 * u
            y = WALL_IN + 0.08 + 0.035 * math.sin(u * math.pi * 7)
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for k in range(nz):
        for i in range(nx):
            bm.faces.new([grid[k][i], grid[k][i + 1], grid[k + 1][i + 1], grid[k + 1][i]])
    me = bpy.data.meshes.new('Curtain'); bm.to_mesh(me); bm.free()
    c = bpy.data.objects.new('Curtain', me); scn.collection.objects.link(c)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.materials.append(cloth)
    c.modifiers.new('thick', 'SOLIDIFY').thickness = 0.006
box('Rail', (0, WALL_IN + 0.08, WIN_TOP + 0.14), (WIN_X1 - WIN_X0 + 0.5, 0.025, 0.025), frame_m)

# ---------- light: the low morning sun from the front left, the sky, a little light in the room ----------
render_setup(size=1600, transparent=False, world_rgb=(0.56, 0.68, 0.86), world_strength=0.4)
scn.render.resolution_x, scn.render.resolution_y = 1920, 1080
face = empty('face', bone_world(m_arm, 'Head1') + Vector((0, -0.07, 0.07)))
sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 6.0; sun_d.color = (1.0, 0.86, 0.68); sun_d.angle = math.radians(1.5)
sun = bpy.data.objects.new('sun', sun_d); scn.collection.objects.link(sun)
to = Vector((0.28, 0.88, -0.36)).normalized()         # the way its light goes
sun.rotation_euler = to.to_track_quat('-Z', 'Y').to_euler()
light((0.2, 1.2, 2.7), 80, 2.0, (1.0, 0.93, 0.82), face)                 # the room's light, low and warm
light((1.6, -2.4, 1.2), 60, 3.0, (1.0, 0.92, 0.82), face)                 # a soft warm bounce from outside
light((-0.9, -2.0, 2.1), 110, 1.5, (1.0, 0.88, 0.72), face)               # and the sun's own glow, on her face
frame_on = empty('frame_on', face.location + Vector((0.05, 0, -0.3)))   # (her face in the upper third)
cam = camera((0.45, -2.3, 1.6), frame_on, 40)
cam.data.dof.use_dof = True
cam.data.dof.focus_object = face
cam.data.dof.aperture_fstop = 2.8

if os.environ.get('FACES'):
    closeups(cast, cam, face, os.environ['FACES'])
    sys.exit(0)
render(OUT)


def in_frame(w):
    """Where a point falls in the frame (0..1 from the top left)."""
    from bpy_extras.object_utils import world_to_camera_view
    c = world_to_camera_view(scn, cam, Vector(w))
    return (round(c.x, 4), round(1 - c.y, 4))


# (for the narration: the push in goes toward her face; the glare runs over the glass)
update()
import json
with open(os.path.join(os.path.dirname(OUT), 'ending-window.json'), 'w') as fh:
    json.dump({'face': in_frame(face.location),
               'glass': [in_frame((x, FRAME_Y, z)) for x, z in ((WIN_X0 + fw, WIN_TOP - fw), (WIN_X1 - fw, WIN_TOP - fw), (WIN_X1 - fw, SILL + fw), (WIN_X0 + fw, SILL + fw))]}, fh)
