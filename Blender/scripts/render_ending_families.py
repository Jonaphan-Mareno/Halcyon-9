"""
The Save-ARIA ending's narration, line 4 ("...countless people bring back a lifetime of memories"):
old people and their young families holding each other, eyes shut, smiling, in warm afternoon light.
Three frames; scripts/ending-shots/compose.mjs grades them into public/assets/textures/ending/
family-1.webp to family-3.webp.

The people come from build_conference_people.py (its FAMILY: white-haired old people, young adults,
a child, nobody from the crew). Build them first, into a folder of your own; they do not ship, only
the pictures do. The posing helpers are prologue_common.py's.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_conference_people.py -- family <dir>
  blender -b --factory-startup --python Blender/scripts/render_ending_families.py -- <dir> <out dir> [render width]
  node scripts/ending-shots/compose.mjs <out dir>
"""
import sys, os, math
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prologue_common import *   # noqa: E402,F403

argv = sys.argv[sys.argv.index('--') + 1:]
PEOPLE_DIR, OUT_DIR = argv[0], argv[1]
WIDTH = int(argv[2]) if len(argv) > 2 else 1920
HEIGHTS = {'old-man': 1.68, 'old-woman': 1.58, 'gran': 1.58, 'young-woman': 1.68, 'young-man': 1.76, 'child': 1.2}


class Person:
    def __init__(self, name):
        before_o, before_a = set(bpy.data.objects), set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=os.path.join(PEOPLE_DIR, name + '.glb'))
        new = [o for o in bpy.data.objects if o not in before_o]
        self.name = name
        self.arm = next(o for o in new if o.type == 'ARMATURE')
        self.root = self.arm
        self.meshes = [o for o in new if o.type == 'MESH']
        self.head = [o for o in self.meshes if o.name.startswith(('Head', 'Hair'))]
        self.face = next(o for o in self.meshes if o.data.shape_keys)
        idle = next(a for a in bpy.data.actions if a not in before_a)
        self.arm.animation_data.action = idle
        scene().frame_set(1)
        rest = {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy()) for pb in self.arm.pose.bones}
        self.arm.animation_data.action = None
        tracks = self.arm.animation_data.nla_tracks
        for t in list(tracks):
            tracks.remove(t)
        for pb in self.arm.pose.bones:
            pb.location, pb.rotation_quaternion, pb.scale = rest[pb.name]
        update()
        to_height(self.head, self.root, HEIGHTS[name])
        update()

    def put(self, x, y, yaw):
        """Standing at (x, y) on the floor, turned yaw degrees from facing -y."""
        turn(self.root, yaw)
        self.root.location.x += x
        self.root.location.y += y
        update()

    def expression(self, smile=1.0, shut=0.0, jaw=0.0, brow=0.0):
        keys = self.face.data.shape_keys.key_blocks
        for name, v in (('mouth_smile', smile), ('blink', shut), ('jaw_open', jaw), ('brow_inner_up', brow)):
            if name in keys:
                keys[name].slider_max = 2.0
                keys[name].value = v

    def fwd(self):
        return (self.root.matrix_world.to_3x3().normalized() @ Vector((0, -1, 0))).normalized()

    def left(self):
        return (self.root.matrix_world.to_3x3().normalized() @ Vector((1, 0, 0))).normalized()


def nestle(p, spine=8.0, neck=0.0, turn_head=0.0, tilt=0.0, down=0.0):
    """Into the hug: the back bent toward the other, the head turned aside and laid over."""
    for key, k in (('Spine1', 0.3), ('Spine2', 0.35), ('Spine4', 0.35)):
        lean(p.arm, p.root, key, spine * k)
    if neck:
        lean(p.arm, p.root, 'Neck1', neck)
    if turn_head:
        rotate_world(p.arm, 'Neck1', 'Z', turn_head * 0.45)
        rotate_world(p.arm, 'Head1', 'Z', turn_head * 0.55)
    if tilt:
        rotate_axis(p.arm, 'Head1', p.fwd(), tilt)
    if down:
        lean(p.arm, p.root, 'Head1', down)


def round_back(p, other, side, height, behind=0.15, across=0.05, curl=42):
    """One arm round the other's back: the wrist behind them at this height (m above the floor), on
    this arm's own side of them, the elbow pushed out so the arm goes round them, not through."""
    q = other.root.matrix_world.translation
    me = p.root.matrix_world.translation
    out = p.left() * side
    away = Vector((q.x - me.x, q.y - me.y, 0)).normalized()
    target = Vector((q.x, q.y, height)) + away * behind + out * across
    reach(p.arm, side, target, out + Vector((0, 0, -0.12)))
    curl_hand(p.arm, side, curl, 14)


# ---------- the set: a warm room, soft behind them ----------
def warm_room():
    wall = flat('Wall', srgb('#d9bf9b'), 0.9)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    bpy.context.object.data.materials.append(flat('Floor', srgb('#8c6b4a'), 0.7))
    for name, loc, size in (('WallBehind', (0, 5.0, 2.0), (16, 0.2, 6)), ('WallFront', (0, -6.0, 2.0), (16, 0.2, 6))):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        o = bpy.context.object
        o.name = name
        o.scale = size
        o.data.materials.append(wall)
    # the bright window behind them, its bars, a plant's dark shape
    glow = bpy.data.materials.new('Glow')
    glow.use_nodes = True
    b = glow.node_tree.nodes['Principled BSDF']
    b.inputs['Emission Color'].default_value = (1.0, 0.86, 0.62, 1)
    b.inputs['Emission Strength'].default_value = 5.0
    frame_m = flat('Bar', srgb('#6b4a2e'), 0.6)
    for wy, inner in ((4.85, -0.05), (-5.85, 0.05)):        # (windows on both walls: the camera faces either)
        for wx in (-2.2, 1.6):
            bpy.ops.mesh.primitive_cube_add(size=1, location=(wx, wy, 1.9))
            o = bpy.context.object
            o.scale = (2.3, 0.05, 2.0)
            o.data.materials.append(glow)
            for bx in (-0.6, 0.6):
                bpy.ops.mesh.primitive_cube_add(size=1, location=(wx + bx, wy + inner, 1.9))
                o = bpy.context.object
                o.scale = (0.05, 0.05, 2.0)
                o.data.materials.append(frame_m)
    leaf = flat('Leaf', srgb('#4d6b3a'), 0.6)
    for lx, ly, lz, r in ((-3.4, 3.6, 0.7, 0.5), (-3.2, 3.5, 1.3, 0.38), (3.5, 3.4, 0.8, 0.55)):
        bpy.ops.mesh.primitive_ico_sphere_add(radius=r, location=(lx, ly, lz), subdivisions=2)
        bpy.context.object.data.materials.append(leaf)


def lights(aim_at):
    sun_d = bpy.data.lights.new('sun', 'SUN')
    sun_d.energy = 5.5
    sun_d.color = (1.0, 0.8, 0.55)
    sun_d.angle = math.radians(6)
    sun = bpy.data.objects.new('sun', sun_d)
    scene().collection.objects.link(sun)
    # (low, from the window behind them: a warm rim on their hair and shoulders)
    sun.rotation_euler = Vector((0.25, -0.85, -0.42)).normalized().to_track_quat('-Z', 'Y').to_euler()
    a = empty('aim', aim_at)
    light((aim_at.x - 1.2, aim_at.y - 2.0, aim_at.z + 0.7), 95, 2.6, (1.0, 0.9, 0.78), a)      # soft fill on their faces
    light((aim_at.x + 1.6, aim_at.y - 1.5, aim_at.z + 0.1), 40, 2.0, (1.0, 0.84, 0.68), a)


def shoot(name, cam_at, focus, lens, f=2.0):
    render_setup(size=WIDTH, transparent=False, world_rgb=(0.82, 0.66, 0.48), world_strength=0.55)
    scn = scene()
    scn.render.resolution_x, scn.render.resolution_y = WIDTH, round(WIDTH * 9 / 16)
    aim_e = empty('frame', focus)
    cam = camera(cam_at, aim_e, lens)
    cam.data.dof.use_dof = True
    cam.data.dof.focus_object = aim_e
    cam.data.dof.aperture_fstop = f
    render(os.path.join(OUT_DIR, name + '-render.png'))


def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------- 1: an old man held by his daughter: his face over her shoulder ----------
def frame_1():
    fresh()
    man, girl = Person('old-man'), Person('young-woman')
    man.put(0, 0, 180)                               # facing +y
    girl.put(0.0, 0.25, 0)                           # facing -y, toward him
    nestle(man, spine=9, neck=3, turn_head=30, tilt=-6)
    nestle(girl, spine=5, turn_head=30, tilt=6, down=4)
    round_back(man, girl, +1, 1.1)
    round_back(man, girl, -1, 1.16)
    round_back(girl, man, +1, 1.34, across=0.08)
    round_back(girl, man, -1, 1.28, across=0.08)
    man.expression(smile=1.7, shut=0.45, brow=0.9)
    girl.expression(smile=1.2)
    warm_room()
    face = bone_world(man.arm, 'Head1') + Vector((0, 0.04, 0.05))
    lights(face)
    shoot('family-1', (face.x - 0.62, face.y + 2.3, face.z - 0.1), face + Vector((0.06, 0, -0.2)), 58)


# ---------- 2: a grandmother and her son, side on; her small granddaughter holding her from behind ----------
def frame_2():
    fresh()
    gran, son, kid = Person('old-woman'), Person('young-man'), Person('child')
    gran.put(0, 0, 90)                               # facing +x
    son.put(0.25, 0.0, -90)                          # facing -x
    kid.put(-0.3, 0.2, 37)                           # behind her, turned toward us
    nestle(gran, spine=8, neck=2, turn_head=-30, tilt=-7)
    nestle(son, spine=13, neck=6, turn_head=28, tilt=7, down=12)
    round_back(gran, son, +1, 1.24)
    round_back(gran, son, -1, 1.2)
    round_back(son, gran, +1, 1.2)
    round_back(son, gran, -1, 1.26)
    nestle(kid, spine=6, turn_head=-12, tilt=8)
    round_back(kid, gran, +1, 0.8, behind=0.08, across=0.13)
    round_back(kid, gran, -1, 0.84, behind=0.08, across=0.13)
    gran.expression(smile=1.7, brow=0.8)
    son.expression(smile=1.2, shut=0.45)
    kid.expression(smile=1.7)
    warm_room()
    face = bone_world(gran.arm, 'Head1')
    lights(face)
    shoot('family-2', (face.x - 0.2, face.y - 2.75, face.z - 0.2), face + Vector((0.0, 0, -0.2)), 46)


# ---------- 3: two faces, cheek to cheek: an old woman and her grown granddaughter ----------
def frame_3():
    fresh()
    gran, girl = Person('gran'), Person('young-woman')
    gran.put(0, 0, 90)                               # facing +x
    girl.put(0.25, 0.0, -90)                         # facing -x
    nestle(gran, spine=7, turn_head=-34, tilt=-8)
    nestle(girl, spine=9, neck=3, turn_head=34, tilt=8, down=8)
    round_back(gran, girl, +1, 1.08)
    round_back(gran, girl, -1, 1.14)
    round_back(girl, gran, +1, 1.32, across=0.09)
    round_back(girl, gran, -1, 1.24, across=0.09)
    gran.expression(smile=1.8, brow=0.8)
    girl.expression(smile=1.8, brow=0.4)
    warm_room()
    mid = (bone_world(gran.arm, 'Head1') + bone_world(girl.arm, 'Head1')) / 2
    lights(mid)
    shoot('family-3', (mid.x + 0.1, mid.y - 2.25, mid.z - 0.05), mid + Vector((0, 0, -0.14)), 58)


frame_1()
frame_2()
frame_3()
