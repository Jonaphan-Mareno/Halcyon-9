"""
The Save-ARIA ending's narration, line 3 ("After ARIA got connected to the mainland she explained
everything..."): a conference hall on the mainland, rows of people in suits and coats seen from
behind, ARIA's face on a giant screen over the stage (her hologram's dots), the screen's cyan light
on their heads and shoulders. Two frames: the wide one from the back of the hall while she speaks,
and a closer one across the left-hand seats as the hall reacts ("...and how the organism can cure
dementia."): people on their feet clapping, others turning to each other, a hand to a mouth.

The people are the game's own characters, varied: Voss's body (human_scientist_v2), Navarro, Park,
Kessler and Lindqvist, each in a suit or coat of its own colour (their coats retinted), with their
hair recoloured, their heights and builds varied; only the backs of their heads are seen. The
helpers are prologue_common.py's. Renders both frames; scripts/ending-shots/compose.mjs grades them
into public/assets/textures/ending/conference-wide.webp and conference-react.webp, and prints where
the screen is in the wide one (the narration draws ARIA's talking on it).

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/render_ending_conference.py -- [out dir]
"""
import sys, os, math, random, json
import bpy
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prologue_common import *   # noqa: E402,F403

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_DIR = argv[0] if argv else os.path.join(ROOT, 'docs', 'reference-art')
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = scene()

# The hall: the audience faces +y; the screen on the stage's back wall
SCREEN_Y, SCREEN_W, SCREEN_H, SCREEN_Z0 = 15.0, 10.4, 5.85, 1.35
STAGE_Y, STAGE_H = 11.2, 0.6
ROWS = [8.2 - 1.05 * r for r in range(7)]          # the rows' seat lines (y), front to back
SEAT_W, AISLE, PER_BLOCK = 0.62, 1.9, 8
SEAT_Z = 0.46

# ---------- the people ----------
KINDS = {                                           # file, weight, coat material, hair materials
    'voss': ('public/assets/models/human_scientist_v2.glb', 0.24, 'M_Coat', ('M_HairCards', 'M_HairPatch')),
    'navarro': ('public/assets/models/navarro.glb', 0.2, 'M_Coat', ('M_HairCards',)),
    'park': ('public/assets/models/park.glb', 0.16, 'M_Coat', ()),
    'kessler': ('public/assets/models/kessler.glb', 0.24, 'M_Clothes', ('M_Hair',)),
    'lindqvist': ('public/assets/models/lindqvist.glb', 0.16, 'M_Clothes', ()),
}
SUITS = ['#1d2536', '#2b2d32', '#17181b', '#4d5158', '#463729', '#856545', '#26302a', '#42222a', '#a99b84', '#33405a']
HAIR = [None, 'dark', 'dark', 'black', 'black', 'grey']


class Person:
    def __init__(self, kind):
        path, _, coat, hair = KINDS[kind]
        before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, path))
        new = [o for o in bpy.data.objects if o not in before_o]
        self.kind = kind
        self.arm = next(o for o in new if o.type == 'ARMATURE')
        self.root = self.arm
        self.meshes = [o for o in new if o.type == 'MESH']
        for o in self.meshes:
            if o.name.startswith(('Icosphere', 'Glasses', 'Wound', 'Eyes')):
                o.hide_render = True
        self.head = [o for o in self.meshes if o.name.startswith(('Head', 'Hair')) and not o.hide_render]
        idle = next(a for a in bpy.data.actions if a not in before_a and a.name.startswith('Idle'))
        self._freeze(idle)
        self.coat, self.hair = coat, hair

    def _freeze(self, action):
        """Its Idle clip's first frame held as its pose (kept, to go back to). Kept as each bone's
        own channels, as the clip set them: written back through pb.matrix instead (as
        prologue_common's freeze_clip does), these rigs' finger bones land far from their hands."""
        arm = self.arm
        arm.animation_data.action = action
        scn.frame_set(1)
        self.rest = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy()) for pb in arm.pose.bones}
        arm.animation_data.action = None
        self.reset()

    def reset(self):
        for pb in self.arm.pose.bones:
            pb.location, pb.rotation_quaternion, pb.scale = self.rest[pb.name]
        update()

    def dress(self, suit, hair):
        for o in self.meshes:
            for s in o.material_slots:
                m = s.material
                if not m:
                    continue
                base = m.name.split('.')[0]
                if base == self.coat:
                    tint(m, srgb(suit)); roughen(m, 0.78)
                elif base in self.hair and hair:
                    hair_tone(m, hair)


def hair_tone(m, kind):
    if kind == 'grey':
        nt = m.node_tree
        b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        sock = b.inputs['Base Color']
        hs = nt.nodes.new('ShaderNodeHueSaturation')
        hs.inputs['Saturation'].default_value = 0.1; hs.inputs['Value'].default_value = 1.55
        nt.links.new(sock.links[0].from_socket, hs.inputs['Color'])
        nt.links.new(hs.outputs['Color'], sock)
    else:
        tint(m, {'dark': (0.5, 0.45, 0.42), 'black': (0.24, 0.22, 0.21), 'auburn': (1.0, 0.6, 0.42)}[kind])


def fwd(p):
    """The way a person faces (world), and their left."""
    q = p.root.matrix_world.to_3x3().normalized()
    return (q @ Vector((0, -1, 0))).normalized(), (q @ Vector((1, 0, 0))).normalized()


def sit(p, seat):
    """Seated on the chair whose seat is at seat (x, y): thighs forward, shins down, leaning back a
    little, hands in the lap; the hips moved onto the seat."""
    a, r = p.arm, p.root
    for s in (+1, -1):
        pose_leg(a, r, s, (s * 0.1, -1, -0.06), (s * 0.03, -0.12, -1))
    lean(a, r, 'Spine1', -4)
    for s in (+1, -1):
        pose_arm(a, r, s, (s * 0.12, -0.42, -0.9), (-s * 0.28, -0.95, -0.18))
    place_hips(p, Vector((seat.x, seat.y - 0.06, SEAT_Z + 0.1)))


def place_hips(p, at):
    update()
    mid = (bone_world(p.arm, 'L_Thigh') + bone_world(p.arm, 'R_Thigh')) / 2
    p.root.location += at - mid
    update()


def stand(p, seat):
    """On their feet between their seat and the row in front (the Idle pose)."""
    update()
    lo = min(bone_world(p.arm, 'L_Foot').z, bone_world(p.arm, 'R_Foot').z)
    mid = (bone_world(p.arm, 'L_Thigh') + bone_world(p.arm, 'R_Thigh')) / 2
    p.root.location += Vector((seat.x - mid.x, seat.y + 0.42 - mid.y, 0.08 - lo))   # (the ankles' height)
    update()


def clap(p, phase):
    """Both hands together in front of the chest (or just apart: phase 0..1), elbows out."""
    f, left = fwd(p)
    chest = bone_world(p.arm, 'Spine4')
    c = chest + f * 0.3 + Vector((0, 0, 0.06))
    gap = 0.015 + 0.1 * phase
    reach(p.arm, +1, c + left * gap, left * 1.0 + Vector((0, 0, -0.6)))
    reach(p.arm, -1, c - left * gap, -left * 1.0 + Vector((0, 0, -0.6)))


def hand_to_mouth(p, side):
    f, left = fwd(p)
    h = bone_world(p.arm, 'Head1')
    reach(p.arm, side, h + f * 0.12 + left * side * 0.02 + Vector((0, 0, -0.07)), left * side + Vector((0, 0, -0.8)))


def look(p, turn_deg=0.0, up_deg=0.0, tilt_deg=0.0):
    if turn_deg:
        rotate_world(p.arm, 'Neck1', 'Z', turn_deg * 0.4)
        rotate_world(p.arm, 'Head1', 'Z', turn_deg * 0.6)
    if up_deg:
        lean(p.arm, p.root, 'Head1', -up_deg)
    if tilt_deg:
        f, _ = fwd(p)
        rotate_axis(p.arm, 'Head1', f, tilt_deg)


people = []
weights = [k[1] for k in KINDS.values()]
for ri, y in enumerate(ROWS):
    for side in (-1, 1):
        for i in range(PER_BLOCK):
            x = side * (AISLE / 2 + SEAT_W / 2 + i * SEAT_W)
            full = 0.9 if ri < 5 else 0.78
            if random.random() > full:
                continue
            kind = random.choices(list(KINDS), weights)[0]
            p = Person(kind)
            p.seat = Vector((x, y))
            p.row, p.side, p.index = ri, side, i
            female = kind in ('kessler', 'lindqvist')
            # (scaled evenly: a scale on one axis would shear the bones as they are aimed)
            to_height(p.head, p.root, random.uniform(1.6, 1.74) if female else random.uniform(1.72, 1.9))
            p.dress(random.choice(SUITS), random.choice(HAIR) if p.hair else None)
            turn(p.root, 180)                                     # facing the screen (+y)
            p.root.location.x += x
            p.root.location.y += y
            update()
            p.mood = random.random()
            people.append(p)
print('PEOPLE', len(people))


def pose_listening(p):
    p.reset()
    sit(p, p.seat)
    look(p, random.uniform(-7, 7), random.uniform(2, 8), random.uniform(-5, 5))


def pose_reacting(p):
    """The hall on her last words: nearer the camera's side (the left), more on their feet."""
    p.reset()
    m = p.mood
    if m < 0.42 and p.row >= 1:
        stand(p, p.seat)
        clap(p, (p.index * 0.37) % 1)
        look(p, random.uniform(-8, 8), random.uniform(4, 10))
    elif m < 0.62:
        sit(p, p.seat)
        clap(p, (p.index * 0.53) % 1)
        look(p, random.uniform(-6, 6), random.uniform(3, 9))
    elif m < 0.7:
        sit(p, p.seat)
        hand_to_mouth(p, random.choice((-1, 1)))
        look(p, 0, 6)
    elif m < 0.88:
        sit(p, p.seat)
        toward = -1 if p.index % 2 else 1
        rotate_world(p.arm, 'Spine4', 'Z', toward * 6)
        look(p, toward * 34, -2, toward * 6)                   # to a neighbour
    else:
        sit(p, p.seat)
        look(p, random.uniform(-5, 5), 9)


# ---------- the hall ----------
def box(name, loc, size, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 3
        o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
    o.data.materials.append(mat)
    return o


wood = flat('Wood', srgb('#2e2119'), 0.85)
slat = flat('Slat', srgb('#3a2a1f'), 0.8)
carpet = flat('Carpet', srgb('#262b36'), 0.95)
fabric = flat('ChairFabric', srgb('#2a3142'), 0.9)
metal = flat('ChairMetal', srgb('#8d9096'), 0.35, 1.0)
box('Floor', (0, 6, -0.05), (20, 24, 0.1), carpet)
box('Ceiling', (0, 6, 8.2), (20, 24, 0.1), flat('CeilingM', srgb('#15171b'), 0.9))
for x in (-9.0, 9.0):
    box('SideWall', (x, 6, 4), (0.2, 24, 8.4), wood)
    for k in range(22):                                  # acoustic slats down the walls
        box('Slat', (x - math.copysign(0.13, x), -4.5 + k * 0.95, 4), (0.06, 0.12, 8.0), slat)
box('BackWall', (0, -5.5, 4), (20, 0.2, 8.4), wood)
box('StageWall', (0, SCREEN_Y + 0.15, 4), (20, 0.2, 8.4), flat('StageWallM', srgb('#101216'), 0.8))
box('Stage', (0, (STAGE_Y + SCREEN_Y) / 2, STAGE_H / 2), (16, SCREEN_Y - STAGE_Y + 0.2, STAGE_H), flat('StageM', srgb('#1a1c21'), 0.6))
box('StageEdge', (0, STAGE_Y - 0.02, STAGE_H - 0.03), (16, 0.06, 0.06), flat('EdgeLight', (0.4, 0.8, 1.0), 0.5))
# the lectern, stage left, and a low plant
box('Lectern', (5.2, STAGE_Y + 1.2, STAGE_H + 0.55), (0.7, 0.5, 1.1), wood, 0.02)
bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=0.5, location=(-6.2, STAGE_Y + 1.0, STAGE_H + 0.25))
bpy.context.object.data.materials.append(flat('Pot', srgb('#2b2b2e'), 0.6))
leaf = flat('Leaf', srgb('#2f4a2c'), 0.6)
for i in range(26):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, location=(-6.2 + random.uniform(-0.3, 0.3), STAGE_Y + 1.0 + random.uniform(-0.3, 0.3), STAGE_H + 0.6 + random.uniform(0, 0.9)), segments=8, ring_count=5)
    o = bpy.context.object; o.scale = (1, 0.5, 1.6); o.rotation_euler = (random.random(), random.random(), random.random() * 3)
    o.data.materials.append(leaf)

# the chairs: a seat, a back, a frame, every place in the rows (filled or not)
for y in ROWS:
    for side in (-1, 1):
        for i in range(PER_BLOCK):
            x = side * (AISLE / 2 + SEAT_W / 2 + i * SEAT_W)
            box('Seat', (x, y, SEAT_Z - 0.04), (0.52, 0.5, 0.09), fabric, 0.03)
            back = box('Back', (x, y - 0.27, 0.74), (0.52, 0.07, 0.52), fabric, 0.03)
            back.rotation_euler[0] = math.radians(-8)
            box('Frame', (x, y - 0.3, 0.3), (0.04, 0.04, 0.6), metal)

# ---------- the screen: ARIA, as her hologram draws her (dots), with a caption bar ----------
def aria_material():
    m = bpy.data.materials.new('AriaScreen'); m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    L = nt.links.new

    def vm(op, a, bval=None):
        n = nt.nodes.new('ShaderNodeVectorMath'); n.operation = op
        for i, v in enumerate((a, bval)):
            if v is None:
                continue
            if isinstance(v, tuple):
                n.inputs[i].default_value = v
            else:
                L(v, n.inputs[i])
        return n.outputs['Value' if op in ('DISTANCE', 'LENGTH', 'DOT_PRODUCT') else 'Vector']

    def mth(op, *args, clamp=False):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate(args):
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                L(v, n.inputs[i])
        return n.outputs['Value']

    tc = nt.nodes.new('ShaderNodeTexCoord')
    face_h = 0.9                                          # of the screen's height
    aspect = SCREEN_W / SCREEN_H
    # the face's square: (uv - (0.5, 0.53)) * (aspect, 1) / face_h + 0.5
    fuv = vm('ADD', vm('DIVIDE', vm('MULTIPLY', vm('SUBTRACT', tc.outputs['UV'], (0.5, 0.53, 0)), (aspect, 1, 1)), (face_h, face_h, 1)), (0.5, 0.5, 0))
    N = 78.0
    cell = vm('FLOOR', vm('MULTIPLY', fuv, (N, N, 1)))
    centre = vm('DIVIDE', vm('ADD', cell, (0.5, 0.5, 0)), (N, N, 1))
    img = nt.nodes.new('ShaderNodeTexImage')
    img.image = bpy.data.images.load(os.path.join(ROOT, 'public', 'assets', 'ending', 'aria-avatar.jpg'))
    img.extension = 'CLIP'; img.interpolation = 'Linear'
    L(centre, img.inputs['Vector'])
    bw = nt.nodes.new('ShaderNodeRGBToBW'); L(img.outputs['Color'], bw.inputs['Color'])
    lum = mth('POWER', mth('MULTIPLY', mth('SUBTRACT', bw.outputs['Val'], 0.12), 1.6, clamp=True), 0.85)
    f = vm('FRACTION', vm('MULTIPLY', fuv, (N, N, 1)))
    d = vm('DISTANCE', f, (0.5, 0.5, 0))
    radius = mth('MULTIPLY_ADD', lum, 0.3, 0.1)
    dot = mth('MULTIPLY', mth('SUBTRACT', radius, d), 14.0, clamp=True)
    # (the face's square only, and its edge faded)
    sx = nt.nodes.new('ShaderNodeSeparateXYZ'); L(fuv, sx.inputs[0])
    def edge(v):
        return mth('MULTIPLY', mth('MULTIPLY', v, 9.0, clamp=True), mth('MULTIPLY', mth('SUBTRACT', 1.0, v), 9.0, clamp=True))
    inside = mth('MULTIPLY', edge(sx.outputs['X']), edge(sx.outputs['Y']))
    lit = mth('MULTIPLY', mth('MULTIPLY', dot, lum), inside)
    # scanlines over all of it
    sv = nt.nodes.new('ShaderNodeSeparateXYZ'); L(tc.outputs['UV'], sv.inputs[0])
    scan = mth('MULTIPLY_ADD', mth('GREATER_THAN', mth('FRACT', mth('MULTIPLY', sv.outputs['Y'], 140.0)), 0.55), -0.25, 1.0)
    face_col = nt.nodes.new('ShaderNodeMix'); face_col.data_type = 'RGBA'
    face_col.inputs['A'].default_value = (0.002, 0.011, 0.018, 1)          # the screen's dark teal
    face_col.inputs['B'].default_value = (0.55, 0.95, 1.0, 1)              # her dots
    L(lit, face_col.inputs['Factor'])
    em = nt.nodes.new('ShaderNodeEmission')
    L(face_col.outputs['Result'], em.inputs['Color'])
    strength = mth('MULTIPLY', scan, 4.0)
    L(strength, em.inputs['Strength'])
    L(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
    return m


# (the screen in front of its bezel, the caption in front of the screen: none in the same plane)
bpy.ops.mesh.primitive_plane_add(size=1, location=(0, SCREEN_Y - 0.06, SCREEN_Z0 + SCREEN_H / 2), rotation=(math.radians(90), 0, 0))
screen = bpy.context.object; screen.name = 'Screen'
screen.scale = (SCREEN_W, SCREEN_H, 1)
screen.data.materials.append(aria_material())
box('Bezel', (0, SCREEN_Y + 0.0, SCREEN_Z0 + SCREEN_H / 2), (SCREEN_W + 0.22, 0.04, SCREEN_H + 0.22), flat('BezelM', srgb('#0b0c0e'), 0.4))
glow = bpy.data.materials.new('Caption'); glow.use_nodes = True
cb = glow.node_tree.nodes['Principled BSDF']
cb.inputs['Base Color'].default_value = (0, 0, 0, 1)
cb.inputs['Emission Color'].default_value = (0.8, 0.97, 1.0, 1); cb.inputs['Emission Strength'].default_value = 5
bar = box('CaptionBar', (-SCREEN_W / 2 + 2.25, SCREEN_Y - 0.09, SCREEN_Z0 + 0.62), (3.9, 0.01, 0.62), flat('BarM', srgb('#06222c'), 0.5))
for body, size, z in (('ARIA', 0.32, SCREEN_Z0 + 0.7), ('HALCYON-9  ·  LIVE', 0.14, SCREEN_Z0 + 0.43)):
    bpy.ops.object.text_add(location=(-SCREEN_W / 2 + 0.5, SCREEN_Y - 0.11, z), rotation=(math.radians(90), 0, 0))
    t = bpy.context.object
    t.data.body = body; t.data.size = size; t.data.align_x = 'LEFT'; t.data.align_y = 'CENTER'
    t.data.materials.append(glow)

# ---------- light ----------
render_setup(size=1600, transparent=False, world_rgb=(0.02, 0.024, 0.03), world_strength=1.0)
scn.render.resolution_x, scn.render.resolution_y = 1920, 1080
sd = bpy.data.lights.new('screen', 'AREA'); sd.shape = 'RECTANGLE'; sd.size = SCREEN_W; sd.size_y = SCREEN_H
sd.energy = 9000; sd.color = (0.55, 0.88, 1.0)
so = bpy.data.objects.new('screen', sd); scn.collection.objects.link(so)
so.location = (0, SCREEN_Y - 0.3, SCREEN_Z0 + SCREEN_H / 2); so.rotation_euler = (math.radians(-90), 0, 0)
for x in (-6.0, -2.0, 2.0, 6.0):                      # dim warm downlights over the seats
    for y in (-1.5, 2.5, 6.5):
        dl = bpy.data.lights.new('down', 'SPOT'); dl.energy = 260; dl.color = (1.0, 0.82, 0.6)
        dl.spot_size = math.radians(55); dl.spot_blend = 0.9; dl.shadow_soft_size = 0.15
        o = bpy.data.objects.new('down', dl); scn.collection.objects.link(o); o.location = (x, y, 8.0)
for x in (-8.7, 8.7):                                   # sconces along the walls
    for y in (0.0, 5.0, 10.0):
        pl = bpy.data.lights.new('sconce', 'POINT'); pl.energy = 60; pl.color = (1.0, 0.75, 0.5); pl.shadow_soft_size = 0.3
        o = bpy.data.objects.new('sconce', pl); scn.collection.objects.link(o); o.location = (x - math.copysign(0.3, x), y, 3.2)
back_aim = empty('back_aim', (0, 6, 1.0))
light((0, -4.8, 5.0), 900, 8.0, (1.0, 0.86, 0.7), back_aim)         # a soft warm wash from the back of the hall
cam_aim = empty('cam_aim', (0, SCREEN_Y, 3.3))
cam = camera((0.0, 0.3, 1.8), cam_aim, 34)     # (just behind the back row)


def screen_corners():
    """Where the screen's corners fall in the frame (0..1 from the top left)."""
    from bpy_extras.object_utils import world_to_camera_view
    update()
    out = []
    for sx, sz in ((-1, 1), (1, 1), (1, -1), (-1, -1)):
        w = Vector((sx * SCREEN_W / 2, SCREEN_Y - 0.06, SCREEN_Z0 + SCREEN_H / 2 + sz * SCREEN_H / 2))
        c = world_to_camera_view(scn, cam, w)
        out.append((round(c.x, 4), round(1 - c.y, 4)))
    return out


# ---------- the wide frame: listening ----------
for p in people:
    pose_listening(p)
render(os.path.join(OUT_DIR, 'ending-conference-wide-render.png'))
corners = screen_corners()
print('SCREEN', json.dumps(corners))
with open(os.path.join(OUT_DIR, 'ending-conference-screen.json'), 'w') as fh:
    json.dump({'corners': corners, 'face_h': 0.9, 'face_centre_v': 0.53}, fh)

# ---------- the closer frame: the hall reacting, from the left-hand seats ----------
for p in people:
    pose_reacting(p)
cam_aim.location = (-1.2, 11.5, 2.6)
cam.location = (-6.4, 0.2, 1.75)                  # (from the side aisle, across the left-hand seats)
cam.data.lens = 30
render(os.path.join(OUT_DIR, 'ending-conference-react-render.png'))
