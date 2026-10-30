"""
The Stay ending's narration, its last lines ("...and his mother was the first person to be cured",
"He kept his promise to his mother after all..."): his mother, old (the window shot's model), in a
chair in her room in the memory care ward, slowly going through the prologue's Polaroids: both her
hands on the stack, her right sliding each photo off the top and tucking it behind. The last is one
the player has not seen: "Voss, my hero", him in his lab coat with her, old (mode hero;
scripts/ending-shots/compose-chair.mjs frames it, and mode frames needs that).

One continuous film: a moment of her from the front, then close over her shoulder onto her hands.
Nothing holds still: her breath and a slow sway run through everything, so a pause is not a freeze.

Modes:
  hero    the two of them for the Polaroid, on a transparent background
  frames  the film's frames, PNGs, FPS a second (a range: frames <dir> <width> <from> <to>)
  encode  those frames into public/assets/textures/ending/chair/chair.mp4
  test    a few frames, for checking

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/render_ending_chair.py -- <mode> <out dir> [width]
"""
import sys, os, math
import bpy
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prologue_common import *   # noqa: E402,F403
from old_mom import hair_fix, older_skin, smile, scarf   # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:]
MODE, OUT_DIR = argv[0], argv[1]
WIDTH = int(argv[2]) if len(argv) > 2 else 1280
os.makedirs(OUT_DIR, exist_ok=True)

# The film's timing (seconds). src/level3/chair-shot.js has the same numbers (FILM).
FPS = 15
FRONT = 2.6                                          # her, from the front
FLIP = 2.4                                           # each of the six photos, over her shoulder
FLIPS = 6
TAIL = 4.6                                           # "Voss, my hero", after the last
LENGTH = FRONT + FLIP * FLIPS + TAIL
# within a flip (share of FLIP): she looks at it, takes it, draws it off, tucks it behind, slides it in
TAKE, PULL, TUCK, BACK, LET_GO = 0.18, 0.3, 0.62, 0.72, 0.88

# ====================================================================== encode: the frames into a film
# (splice: <dir>'s frames replace the start of an already encoded film, argv[3], written to <dir>/chair.mp4)
if MODE in ('encode', 'splice'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    files = sorted(f for f in os.listdir(OUT_DIR) if f.startswith('film-') and f.endswith('.png'))
    se = scn.sequence_editor_create()
    strip = se.strips.new_image('film', os.path.join(OUT_DIR, files[0]), 2, 1)
    for f in files[1:]:
        strip.elements.append(f)
    strip.frame_final_duration = len(files)
    total = len(files)
    if MODE == 'splice':
        old = se.strips.new_movie('old', argv[3], 1, 1)
        total = old.frame_final_duration
        old.frame_offset_start = len(files)
    scn.frame_start, scn.frame_end = 1, total
    scn.render.fps = FPS
    scn.render.resolution_x, scn.render.resolution_y = WIDTH, round(WIDTH * 9 / 16)
    scn.render.resolution_percentage = 100
    scn.render.use_sequencer = True
    scn.view_settings.view_transform = 'Standard'
    scn.render.image_settings.media_type = 'VIDEO'
    scn.render.image_settings.file_format = 'FFMPEG'
    scn.render.ffmpeg.format = 'MPEG4'
    scn.render.ffmpeg.codec = 'H264'
    scn.render.ffmpeg.constant_rate_factor = 'HIGH'
    scn.render.ffmpeg.gopsize = 15
    scn.render.ffmpeg.audio_codec = 'NONE'
    scn.render.filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'assets', 'textures', 'ending', 'chair', 'chair.mp4')
    if MODE == 'splice':
        scn.render.filepath = os.path.join(OUT_DIR, 'chair.mp4')
    scn.render.use_file_extension = False
    bpy.ops.render.render(animation=True, write_still=False)
    print('ENCODED', scn.render.filepath, total)
    sys.exit(0)

cast = Cast()
scn = scene()
m_arm, m_root, v_arm, v_root = cast.m_arm, cast.m_root, cast.v_arm, cast.v_root


def old_her():
    restyle_mom(cast, cardigan='#3f8c88', grey=1.0, streaks=0.0)
    head = cast.new_head
    recolour_whites(bpy.data.materials['SciFem_Bdy_D'], srgb('#3f8c88'), 0.04, 0.14)
    hair_fix(head)
    older_skin(head)
    smile(head, 1.3)


# ====================================================================== hero: the unseen photo
if MODE == 'hero':
    voss_face(cast, {'mouth_smile': 1.1, 'mouth_wide': 0.5, 'brow_up': 0.2}, grin_k=0.8)
    old_her()
    v_root.location = (-0.24, 0, 0)
    m_root.location = (0.26, -0.05, 0)
    v_root['yaw'] = math.radians(6)
    m_root['yaw'] = math.radians(-10)
    update()
    freeze_clip(v_arm, 'Idle')
    # his left arm round her, his right at his side; her hands together in front of her
    pose_arm(v_arm, v_root, +1, (0.5, 0.3, -0.8), (0.85, 0.35, 0.3))
    pose_arm(v_arm, v_root, -1, (-0.12, 0.0, -1), (-0.05, -0.25, -1))
    rotate_world(v_arm, 'Head1', 'Y', 5)
    pose_arm(m_arm, m_root, -1, (-0.14, -0.25, -1), (0.3, -1, 0.12))
    pose_arm(m_arm, m_root, +1, (0.14, -0.25, -1), (-0.3, -1, 0.12))
    rotate_world(m_arm, 'Head1', 'Y', -7)
    curl_hand(m_arm, +1, 24, 14)
    curl_hand(m_arm, -1, 24, 14)
    standard_heights(cast)
    update()
    scarf(m_arm, scn)
    render_setup()
    aim_at = empty('aim', (0.02, 0, 1.25))
    light((-2.0, -2.6, 2.8), 480, 2.5, (1.0, 0.93, 0.82), aim_at)
    light((2.6, -2.0, 1.6), 170, 3.0, (0.9, 0.93, 1.0), aim_at)
    light((0.5, 2.5, 2.4), 280, 1.5, target=aim_at)
    camera((0.05, -2.6, 1.4), aim_at, 56)
    render(os.path.join(OUT_DIR, 'hero-figures.png'))
    sys.exit(0)

# ====================================================================== her, in the chair
for o in cast.V:
    o.hide_render = True                             # (only her)
old_her()
SEAT = 0.47                                          # the cushion's top
standard_heights(cast)
update()
# her thighs forward, level; her shins down
pose_leg(m_arm, m_root, -1, (-0.07, -1, 0.02), (-0.03, 0.12, -1))
pose_leg(m_arm, m_root, +1, (0.07, -1, 0.02), (0.03, 0.12, -1))
update()
drop = bone_world(m_arm, 'R_Thigh').z - (SEAT + 0.075)
m_root.location = (0, 0, -drop)
update()
lean(m_arm, m_root, 'Spine2', 7)                     # her head and shoulders over the photos
lean(m_arm, m_root, 'Spine4', 4)
lean(m_arm, m_root, 'Neck1', 2)
lean(m_arm, m_root, 'Head1', 12)
rotate_world(m_arm, 'Neck1', 'Z', -12)               # and turned to them, away from the camera
rotate_world(m_arm, 'Head1', 'Z', -8)
update()
scarf(m_arm, scn)
attach(bpy.data.objects['Scarf'], m_arm, 'Spine4')

# ---------- the photos: thin cards, a Polaroid's shape, a little larger than life ----------
CARD_W, CARD_H = 0.112, 0.132
PHOTO_DIR = os.path.join(ROOT, 'public', 'assets', 'textures', 'prologue')
HERO_FILE = os.path.join(OUT_DIR, 'photo-hero.png')
FRAME = (28 / 940, 22 / 1090, 912 / 940, 1062 / 1090)    # the print in the prologue's images (the rest is a table)
back_m = flat('CardBack', srgb('#d9d0bd'), 0.75)


def card(name, image=None):
    verts = [(-CARD_W / 2, -CARD_H / 2, 0), (CARD_W / 2, -CARD_H / 2, 0), (CARD_W / 2, CARD_H / 2, 0), (-CARD_W / 2, CARD_H / 2, 0)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    x0, y0, x1, y1 = FRAME
    for i, (u, v) in enumerate(((x0, 1 - y1), (x1, 1 - y1), (x1, 1 - y0), (x0, 1 - y0))):
        uv.data[i].uv = (u, v)
    o = bpy.data.objects.new(name, me)
    scn.collection.objects.link(o)
    # the picture carries its own light, so the room's does not wash it out; a little of the room
    # still falls on it, so it sits in her hands
    m = flat('Card_' + name, (1, 1, 1), 0.7)
    tex = m.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = bpy.data.images.load(image)
    b = m.node_tree.nodes['Principled BSDF']
    m.node_tree.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    m.node_tree.links.new(tex.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = 0.64
    b.inputs['Specular IOR Level'].default_value = 0.2
    me.materials.append(m)
    # its back: 1 mm behind, facing the other way
    bk = bpy.data.meshes.new(name + '_b')
    bk.from_pydata([(x, y, -0.001) for x, y, _ in verts], [], [(3, 2, 1, 0)])
    bk.materials.append(back_m)
    bo = bpy.data.objects.new(name + '_b', bk)
    scn.collection.objects.link(bo)
    bo.parent = o
    return o


def frame_of(right, up, centre):
    """A world matrix: the card's +x along right, +y along up, its face (+z) toward us."""
    r = Vector(right).normalized()
    u = Vector(up)
    n = r.cross(u).normalized()
    u = n.cross(r).normalized()
    m = Matrix((r, u, n)).transposed().to_4x4()
    m.translation = Vector(centre)
    return m


# Where the stack is held (over her left thigh, square to the camera over her shoulder). Her left is
# +x; her face looks toward -y, so a card she reads has its top toward -y and its right toward -x.
hip_z = bone_world(m_arm, 'R_Thigh').z
HELD = Vector((0.04, -0.47, hip_z + 0.25))
TO_CAM = Vector((-0.24, 0.31, 0.59)).normalized()
HANDS_CAM = HELD + TO_CAM * 0.5                      # close: the photo fills the middle of the picture
_r = Vector((-0.8, -0.6, 0)).normalized()
STACK = frame_of(_r, TO_CAM.cross(_r), HELD)
LAYER = 0.0016                                       # a card's thickness, in the stack
REACH = 0.135                                        # a hand: wrist to fingertips


def smooth(u):
    u = max(0.0, min(1.0, u))
    return u * u * u * (u * (u * 6 - 15) + 10)       # (eased at both ends, with no sudden starts)


def seg(v, a, b):
    return max(0.0, min(1.0, (v - a) / (b - a)))


def sway_at(t):
    """Everything she holds, moving a little with her breath and her hands: never still."""
    breath = math.sin(t * 2 * math.pi / 4.1)
    d = Vector((0.0022 * math.sin(t * 1.17 + 0.6) + 0.0009 * math.sin(t * 2.9),
                0.0018 * math.sin(t * 0.83 + 2.1),
                0.0028 * breath + 0.0008 * math.sin(t * 2.3 + 1.0)))
    tilt = Matrix.Rotation(math.radians(0.9) * math.sin(t * 0.71 + 1.0), 4, STACK.to_3x3() @ Vector((1, 0, 0))) \
        @ Matrix.Rotation(math.radians(1.1) * math.sin(t * 0.53 + 0.2), 4, STACK.to_3x3() @ Vector((0, 1, 0))) \
        @ Matrix.Rotation(math.radians(0.8) * math.sin(t * 0.37 + 2.4), 4, STACK.to_3x3() @ Vector((0, 0, 1)))
    # the last photo, once she has it: brought a little nearer, and held
    near = smooth(seg(t, FRONT + FLIP * (FLIPS - 1) + FLIP * BACK, FRONT + FLIP * FLIPS + 2.6))
    d += TO_CAM * 0.024 * near
    return Matrix.Translation(HELD + d) @ tilt @ Matrix.Translation(-HELD)


def local(x=0.0, y=0.0, z=0.0, turn=0.0):
    """A pose relative to the top of the stack."""
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(turn), 4, 'Z')


def under(i):
    return local(z=-LAYER * i)


def flip_pose(u, depth):
    """The moving card through its flip (u: 0..1, as FLIP's shares): drawn off to the right, a
    little up and turned; down behind the stack; slid in under it. depth: how many cards it goes under."""
    if u < PULL:
        return under(0)
    if u < TUCK:
        k = smooth(seg(u, PULL, TUCK))
        return local(CARD_W * 0.74 * k, -0.006 * k, 0.012 * math.sin(k * math.pi / 2), -7 * k)
    if u < BACK:
        k = smooth(seg(u, TUCK, BACK))
        return local(CARD_W * 0.74, -0.006, 0.012 * (1 - k) - (LAYER * depth + 0.003) * k, -7)
    k = smooth(seg(u, BACK, 1.0))
    return local(CARD_W * 0.74 * (1 - k), -0.006 * (1 - k), -(LAYER * depth + 0.003 * (1 - k)), -7 * (1 - k))


# ---------- her hands: the left round the stack's left edge, thumb on the front; the right resting
# by its right edge, or holding the card it is moving ----------
def stills_of(keys):
    return {pb.name: pb.rotation_quaternion.copy() for pb in m_arm.pose.bones if any(k in pb.name for k in keys)}


for pb in m_arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'
LEFT_POSE = Vector((-CARD_W / 2 - REACH + 0.045, -0.018, -0.03))
reach(m_arm, +1, STACK @ LEFT_POSE, (0.9, 0.0, -1))
aim_world(m_arm, 'L_Hand', 'L_Finger1_', (STACK.to_3x3() @ Vector((1, 0.12, 0.08))).normalized())
curl_hand(m_arm, +1, 15, 26)
update()
FINGERS = ['R_Finger']
OPEN = stills_of(FINGERS)
curl_hand(m_arm, -1, 16, 6)
RELAXED = stills_of(FINGERS)
for pb in m_arm.pose.bones:
    if pb.name in OPEN:
        pb.rotation_quaternion = OPEN[pb.name]
update()
curl_hand(m_arm, -1, 34, 28)
HOLDING = stills_of(FINGERS)
# from the front, her right holds the stack as her left does
for pb in m_arm.pose.bones:
    if pb.name in OPEN:
        pb.rotation_quaternion = OPEN[pb.name]
update()
curl_hand(m_arm, -1, 15, 26)
BOTH_HANDS = stills_of(FINGERS)
RIGHT_POSE = Vector((CARD_W / 2 + REACH - 0.045, -0.018, -0.03))

# her breath and a slow settling of her head, as poses to move between (no solving per frame)
BODY = ['Spine2', 'Head1']
BODY_REST = stills_of(BODY)
lean(m_arm, m_root, 'Spine2', 1.2)
lean(m_arm, m_root, 'Head1', 3.5)
BODY_DOWN = stills_of(BODY)


def between_poses(a, b, k):
    for name, q in a.items():
        m_arm.pose.bones[name].rotation_quaternion = q.slerp(b[name], k)


# ---------- the room: her room in the ward, a soft low light ----------
def box(name, loc, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 3
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
    o.data.materials.append(mat)
    return o


wood = flat('Wood', srgb('#5e3d26'), 0.45)
cushion = flat('Cushion', srgb('#8f6a48'), 0.9)
box('Seat', (0, 0.02, SEAT - 0.05), (0.56, 0.54, 0.1), cushion, 0.03)
box('Back', (0, 0.31, SEAT + 0.3), (0.56, 0.07, 0.62), cushion, 0.03)
for x in (-0.3, 0.3):
    box('Arm', (x, 0.03, SEAT + 0.16), (0.06, 0.52, 0.045), wood, 0.012)
    box('ArmPost', (x, -0.2, SEAT + 0.05), (0.04, 0.04, 0.2), wood, 0.006)
    for y in (-0.22, 0.28):
        box('Leg', (x, y, (SEAT - 0.1) / 2), (0.05, 0.05, SEAT - 0.1), wood, 0.006)
wall = flat('Wall', srgb('#8e8672'), 0.9)
bpy.ops.mesh.primitive_plane_add(size=9, location=(0, 0, 0))
bpy.context.object.data.materials.append(flat('Floor', srgb('#4a4238'), 0.6))
box('Rug', (0, -0.75, 0.004), (2.2, 1.5, 0.008), flat('Rug', srgb('#4b352a'), 0.95))
box('RugBand', (0, -0.75, 0.006), (1.9, 1.2, 0.008), flat('RugBand', srgb('#6a5340'), 0.95))
box('RugIn', (0, -0.75, 0.008), (1.7, 1.0, 0.008), flat('RugIn', srgb('#4b352a'), 0.95))
BACK_WALL = 1.7
box('BackWall', (0, BACK_WALL, 1.5), (9, 0.1, 3), wall)
box('SideWall', (-2.3, 0, 1.5), (0.1, 5, 3), wall)
box('Ceiling', (0, 0, 2.9), (9, 7, 0.05), flat('Ceiling', srgb('#8a8474'), 0.9))
box('Sign', (-0.75, BACK_WALL - 0.06, 1.74), (1.1, 0.02, 0.18), flat('SignBlue', srgb('#1f3f5e'), 0.4))
bpy.ops.object.text_add(location=(-0.75, BACK_WALL - 0.075, 1.74), rotation=(math.radians(90), 0, 0))
t_ = bpy.context.object
t_.data.body = 'MEMORY CARE UNIT'; t_.data.size = 0.088; t_.data.align_x = 'CENTER'; t_.data.align_y = 'CENTER'
t_.data.extrude = 0.0005; t_.data.materials.append(flat('SignText', srgb('#d8d6c8'), 0.5))
box('Table', (1.0, 1.2, 0.38), (0.5, 0.45, 0.76), flat('Table', srgb('#7a6a55'), 0.5), 0.015)
bpy.ops.mesh.primitive_cylinder_add(radius=0.055, depth=0.2, location=(1.0, 1.2, 0.86))
bpy.context.object.data.materials.append(flat('Vase', srgb('#54788c'), 0.2))
petals = [flat('Red', srgb('#b83234'), 0.55), flat('Pink', srgb('#c9708c'), 0.55), flat('White', srgb('#d8d4c8'), 0.55)]
for i in range(9):
    a = i * 2.4
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.03, location=(1.0 + math.cos(a) * 0.06, 1.2 + math.sin(a) * 0.06, 1.02 + (i % 3) * 0.03), subdivisions=1)
    bpy.context.object.data.materials.append(petals[i % 3])

# ---------- light: soft and low, from a window on her right; warm on her and on what she holds ----------
render_setup(size=1600, transparent=False, world_rgb=(0.5, 0.46, 0.4), world_strength=0.16)
scn.view_settings.view_transform = 'Standard'
scn.view_settings.look = 'None'
scn.render.resolution_x, scn.render.resolution_y = WIDTH, round(WIDTH * 9 / 16)
scn.eevee.taa_render_samples = 24
face = empty('face', bone_world(m_arm, 'Head1') + Vector((0, -0.07, 0.05)))
hands = empty('hands', HELD)
sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 1.25; sun_d.color = (1.0, 0.78, 0.55); sun_d.angle = math.radians(14)
sun = bpy.data.objects.new('sun', sun_d); scn.collection.objects.link(sun)
sun.rotation_euler = Vector((0.75, 0.45, -0.45)).normalized().to_track_quat('-Z', 'Y').to_euler()
light((0.2, -1.2, 2.6), 22, 2.5, (1.0, 0.86, 0.68), face)                 # the room's light
light((1.4, -2.2, 1.2), 14, 3.0, (1.0, 0.84, 0.66), face)                 # a soft warm bounce
light((-0.7, -0.9, 1.5), 12, 1.5, (1.0, 0.84, 0.66), hands)               # the window's glow on her hands

aim_front = empty('aim_front', (0.0, 0, hip_z + 0.36))
aim_hands = empty('aim_hands', HELD)
focus = empty('focus', HELD)                         # the photo in her hands, wherever they take it
CAM = camera((0.42, -1.65, 1.08), aim_front, 46)
CAM.data.dof.use_dof = True
AIM = CAM.constraints[0]


def use_front():
    CAM.location = (0.42, -1.65, 1.08)
    CAM.data.lens = 46
    AIM.target = aim_front
    CAM.data.dof.focus_object = face
    CAM.data.dof.aperture_fstop = 3.5


def use_hands():
    CAM.location = HANDS_CAM
    CAM.data.lens = 50
    AIM.target = aim_hands
    CAM.data.dof.focus_object = focus
    CAM.data.dof.aperture_fstop = 4


# ---------- the film ----------
FILES = [os.path.join(PHOTO_DIR, f'photo{i}.webp') for i in range(1, 7)] + [HERO_FILE]
CARDS = [card(f'c{i}', FILES[i]) for i in range(len(FILES))]
N = len(CARDS)


def pose_at(t):
    """Everything as it is t seconds into the film."""
    # her breath, and her head going a little lower over the photos, then settling
    breath = 0.5 + 0.5 * math.sin(t * 2 * math.pi / 4.1)
    between_poses(BODY_REST, BODY_DOWN, 0.35 * breath + 0.65 * smooth(t / 5))
    sway = sway_at(t)
    # which flip, how far through it
    s = t - FRONT
    f = int(s // FLIP) if s >= 0 else -1
    u = s / FLIP - f if 0 <= f < FLIPS else 0.0
    done = max(0, min(FLIPS, f))
    world = sway @ STACK
    # the cards: those already gone through go behind, in order
    order = list(range(done, N)) + list(range(done))
    moving = CARDS[done] if 0 <= f < FLIPS else None
    for depth, i in enumerate(order):
        c = CARDS[i]
        if c is moving:
            continue
        # (the next photo rises to the top as the one above it is tucked away)
        rank = depth - 1 if moving and u >= TUCK else depth
        c.matrix_world = world @ under(rank)
    held = world
    if moving:
        held = world @ flip_pose(u, N - 1)
        moving.matrix_world = held
    # her left hand, round the stack's edge
    reach(m_arm, +1, world @ LEFT_POSE, (0.9, 0.0, -1))
    aim_world(m_arm, 'L_Hand', 'L_Finger1_', (world.to_3x3() @ Vector((1, 0.12, 0.08))).normalized())
    # her right: resting by the stack, its fingers easing open and shut a little; taking the card; letting go
    if t < FRONT:
        # (from the front: both hands round the stack, her elbow down at her side)
        reach(m_arm, -1, world @ RIGHT_POSE, (-0.75, 0.15, -1))
        aim_world(m_arm, 'R_Hand', 'R_Finger1_', (world.to_3x3() @ Vector((-1, 0.12, 0.08))).normalized())
        between_poses(BOTH_HANDS, BOTH_HANDS, 0)
        focus.location = world.translation
        update()
        use_front()
        update()
        return
    grip = smooth(seg(u, TAKE, PULL)) * (1 - smooth(seg(u, LET_GO, 1.0))) if moving else 0.0
    # (from below and beyond the card, its fingers up to the right edge: off the picture and the caption)
    rest_at = world @ Vector((CARD_W / 2 + REACH + 0.075 + 0.003 * math.sin(t * 1.3), -0.012 + 0.004 * math.sin(t * 0.9), 0.02))
    hold_at = held @ Vector((CARD_W / 2 + REACH - 0.012, -0.002, 0.012))
    reach(m_arm, -1, rest_at.lerp(hold_at, grip), (-0.95, 0.1, -0.6))
    aim_world(m_arm, 'R_Hand', 'R_Finger1_', (held.to_3x3() @ Vector((-1, 0.3, -0.14))).normalized())
    between_poses(OPEN, RELAXED, 0.75 + 0.25 * math.sin(t * 0.8)) if grip == 0 else between_poses(RELAXED, HOLDING, grip)
    focus.location = world.translation
    update()
    if t < FRONT:
        use_front()
    else:
        use_hands()
    update()


if MODE == 'frames':
    total = round(LENGTH * FPS)
    first = int(argv[3]) if len(argv) > 3 else 0
    last = int(argv[4]) if len(argv) > 4 else total
    for k in range(first, last):
        pose_at(k / FPS)
        render(os.path.join(OUT_DIR, f'film-{k:04d}.png'))
    print('FRAMES', first, last, 'of', total)
elif MODE == 'test':
    for t in (FRONT + 0.3, FRONT + FLIP * 0.5, FRONT + FLIP * 0.8, LENGTH - 0.1):
        pose_at(t)
        render(os.path.join(OUT_DIR, f'test-{t:05.2f}.png'))
