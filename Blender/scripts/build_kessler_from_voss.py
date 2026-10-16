"""
Dr. Elena Kessler, made from Voss (human_scientist_v2.glb) so the two look like they come from the
same game: the same painted toon style, the same skeleton and clips, the same face morphs.

What changes (Blender axes: z up, the face looks toward -y):
  - shorter (RIG_SCALE), narrower shoulders, a waist, hips and a bust
  - the face: a narrower jaw, a smaller chin and nose, a softer brow, fuller lips, a slimmer neck
  - the face texture: no beard shadow, light-brown brows, blond at the hairline, tinted lips,
    the small mole on her right cheek
  - the hair: blond (#C8A96A with darker #8C6E3F in the shade), swept back off the face and shorter
  - white clothes (the shirt and trousers; the shoes become white boots), a coat to below the knee
  - no glasses, no wound; a small white earpiece over her right ear
Voss's eyes are already brown, as hers are.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_kessler_from_voss.py -- \\
      [public/assets/models/kessler.glb] [preview_dir]
then compress:  node scripts/optimize-models.mjs kessler.glb
"""
import sys, os, math
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'public', 'assets', 'models', 'human_scientist_v2.glb')
OUT = argv[0] if len(argv) > 0 and argv[0] else os.path.join(ROOT, 'public', 'assets', 'models', 'kessler.glb')
PREVIEW = argv[1] if len(argv) > 1 else None

RIG_SCALE = 0.94            # 1.8 m * 0.94 = about 1.69 m in the game
HAIR = '#C8A96A'            # her blond, and its shade
HAIR_DARK = '#8C6E3F'
BROW = '#7a5a3a'
LIPS = '#b25e66'
KEEP_CLIPS = ('Idle', 'Walk')

# Voss's face (see build_voss_face.py)
MOUTH_Z, MOUTH_Y, CORNER_X = 1.2445, -0.066, 0.021


def log(*a):
    print('[kessler]', *a)


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def gauss(*terms):
    return math.exp(-sum(t * t for t in terms))


def srgb(hex_):
    return np.array([int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)])


# ====================================================================== load Voss
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
rig = bpy.data.objects['Scientist_Rig']
rig.data.pose_position = 'REST'
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere') or o.name in ('Glasses', 'Wound'):
        bpy.data.objects.remove(o)
for a in list(bpy.data.actions):
    if a.name not in KEEP_CLIPS:
        bpy.data.actions.remove(a)
obj = {o.name: o for o in bpy.data.objects if o.type == 'MESH'}
log('parts', sorted(obj))


def move(o, fn):
    """Move every vertex of o by fn(position) -> Vector delta, keeping its morphs relative"""
    me = o.data
    keys = me.shape_keys.key_blocks if me.shape_keys else None
    base = keys[0].data if keys else me.vertices
    deltas = [fn(v.co.copy()) for v in base]
    for i, d in enumerate(deltas):
        if d is None:
            continue
        me.vertices[i].co += d
        if keys:
            for k in keys:
                k.data[i].co += d
    me.update()


# ====================================================================== the face
NOSE_C = Vector((0, -0.066, 1.278))


def face(p):
    d = Vector()
    front = smooth(0.0, -0.04, p.y)                         # the face, not the back of the head
    # a narrower jaw and a smaller chin: the lower face, more toward the jaw's corners
    low = smooth(1.262, 1.232, p.z) * smooth(1.17, 1.205, p.z)
    d.x -= p.x * 0.15 * low * (0.4 + 0.6 * smooth(0.015, 0.05, abs(p.x)))
    chin = low * gauss(p.x / 0.025, (p.z - 1.222) / 0.018) * front
    d.z += 0.005 * chin
    d.y += 0.004 * chin
    # a shorter lower face: below the lips it all comes up a little (most at the chin)
    d.z += 0.006 * smooth(MOUTH_Z - 0.002, 1.215, p.z) * smooth(1.17, 1.2, p.z) * front
    # fuller, rounder cheeks
    for s_ in (-1, 1):
        d.y -= 0.0022 * gauss((p.x - s_ * 0.036) / 0.016, (p.z - 1.268) / 0.014) * front
    # a softer, flatter brow ridge
    d.y += 0.004 * gauss(p.x / 0.05, (p.z - 1.317) / 0.011) * front
    # a smaller nose
    w = gauss(p.x / 0.02, (p.z - 1.282) / 0.022) * smooth(-0.05, -0.065, p.y)
    d += Vector(((NOSE_C.x - p.x) * 0.15, (NOSE_C.y - p.y) * 0.28, (NOSE_C.z - p.z) * 0.1)) * w
    # fuller lips (thicker about the lip line, a little forward)
    lips = gauss(p.x / 0.026, (p.z - MOUTH_Z) / 0.012) * smooth(-0.045, -0.06, p.y)
    d.z += (p.z - MOUTH_Z) * 0.07 * lips
    d.y -= 0.0005 * lips
    # a slimmer neck, without the Adam's apple
    neck = smooth(1.215, 1.19, p.z) * smooth(1.06, 1.1, p.z)
    d.x -= p.x * 0.08 * neck
    d.y -= (p.y - 0.035) * 0.06 * neck
    d.y += 0.003 * neck * gauss(p.x / 0.015, (p.z - 1.185) / 0.02) * smooth(-0.02, -0.05, p.y)
    return d


move(obj['Head'], face)

# eyes a little more open: the upper lids go up by a fraction of what eyes_tired brings them down
_keys = obj['Head'].data.shape_keys.key_blocks
_tired = [(k.co - b.co) for k, b in zip(_keys['eyes_tired'].data, _keys[0].data)]
move(obj['Head'], lambda p, it=iter(_tired): -0.3 * next(it))

# ====================================================================== the body
def shoulders(p):
    # narrower shoulders: everything out past the neck comes in (the whole arm with it)
    return Vector((-math.copysign(0.013, p.x) * smooth(0.06, 0.14, abs(p.x)) * smooth(0.95, 1.05, p.z), 0, 0))


def figure(p):
    d = shoulders(p)
    front = smooth(0.03, -0.03, p.y)
    # a bust
    for s in (-1, 1):
        d.y -= 0.024 * gauss((p.x - s * 0.047) / 0.042, (p.z - 1.03) / 0.05) * front
    d.z += 0.006 * gauss(p.x / 0.09, (p.z - 1.03) / 0.05) * front
    # a waist
    w = gauss((p.z - 0.88) / 0.08)
    d.x -= p.x * 0.10 * w
    d.y -= (p.y - 0.04) * 0.06 * w
    # hips
    d.x += p.x * 0.06 * gauss((p.z - 0.71) / 0.08)
    return d


for name in ('Coat_Torso', 'Shirt', 'Sleeves', 'Hands'):
    move(obj[name], figure)
move(obj['Pants'], lambda p: Vector((p.x * 0.06 * gauss((p.z - 0.71) / 0.08) - p.x * 0.06 * gauss((p.z - 0.84) / 0.06), 0, 0)))

# slimmer sleeves: pulled in toward the arm's bones (upper arm, forearm)
def arm_axis(side):
    names = ['UpperArm', 'Forearm', 'Hand']
    pts = []
    for n in names:
        bone = next(b for b in rig.data.bones if f'_{side}_{n}' in b.name)
        pts.append(bone.head_local + shoulders(bone.head_local))
    return pts


def toward_bone(p, pts, k):
    best = None
    for a, b in zip(pts, pts[1:]):
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        q = a + ab * t
        if best is None or (p - q).length < (p - best).length:
            best = q
    return (best - p) * k


AXES = {1: arm_axis('L'), -1: arm_axis('R')}
move(obj['Sleeves'], lambda p: toward_bone(p, AXES[1 if p.x > 0 else -1], 0.15 * smooth(0.12, 0.17, abs(p.x))))

# slimmer hands, about each wrist
for s, bone in ((1, 'ValveBiped.Bip01_L_Hand_24'), (-1, 'ValveBiped.Bip01_R_Hand_45')):
    c = rig.data.bones[bone].head_local + shoulders(rig.data.bones[bone].head_local)
    move(obj['Hands'], lambda p, s=s, c=c: (c - p) * 0.09 if p.x * s > 0.3 else None)

# the coat to below the knee, flaring a little toward the hem
WAIST, HEM, NEW_HEM = 0.80, 0.511, 0.33
def coat(p):
    if p.z >= WAIST:
        return None
    z = WAIST - (WAIST - p.z) * (WAIST - NEW_HEM) / (WAIST - HEM)
    t = (WAIST - z) / (WAIST - NEW_HEM)
    return Vector((p.x * 0.14 * t, (p.y - 0.03) * 0.1 * t, z - p.z))
move(obj['Coat_Torso'], coat)

# ====================================================================== the hair
head_me = obj['Head'].data
head_bvh = BVHTree.FromPolygons([v.co.copy() for v in head_me.vertices], [tuple(f.vertices) for f in head_me.polygons])


BUN = Vector((0, 0.088, 1.238))      # a low bun at the nape


def hair(p):
    q = p.copy()
    # swept back: what hangs beside the face goes back behind the ears
    side = smooth(0.03, 0.055, abs(p.x)) * smooth(0.03, -0.03, p.y) * smooth(1.34, 1.30, p.z)
    q.y += 0.055 * side
    # the front of the hairline lifts and goes back too
    top = smooth(1.33, 1.36, p.z) * smooth(-0.02, -0.06, p.y)
    q.y += 0.012 * top
    q.z += 0.004 * top
    # shorter: below the ears it is gathered up and in toward the nape
    if p.z < 1.27:
        k = (1.27 - p.z)
        q.z = 1.27 - k * 0.45
        g = smooth(0, 0.05, k)
        q.z = 1.27 - k * 0.4
        q.x *= 1 - 0.7 * g
        q.y += (BUN.y - p.y) * 0.6 * g
    # never inside the head: at least a few millimetres out from its skin
    loc, n, _, dist = head_bvh.find_nearest(q)
    if loc is not None and (q - loc).dot(n) < 0.004:
        q = loc + n * 0.004
    return q - p


move(obj['Hair'], hair)
# the bun: a squashed ball of hair at the nape, mapped onto a strand area of the hair texture
import bmesh
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
uvl = bm.loops.layers.uv.new('UVMap')
for f in bm.faces:
    for l in f.loops:
        c = l.vert.co
        a = (math.atan2(c.y, c.x) / (2 * math.pi)) % 1.0
        l[uvl].uv = (0.70 + 0.27 * a, 1 - (0.03 + 0.42 * (c.z * 0.5 + 0.5)))     # Blender uv (origin bottom left)
for v in bm.verts:
    c = v.co
    twist = 0.25 * c.z
    x, y = c.x * math.cos(twist) - c.y * math.sin(twist), c.x * math.sin(twist) + c.y * math.cos(twist)
    v.co = BUN + Vector((x * 0.030, y * 0.022, c.z * 0.024))
bun_me = bpy.data.meshes.new('Bun')
bm.to_mesh(bun_me)
bm.free()
for f in bun_me.polygons:
    f.use_smooth = True
bun = bpy.data.objects.new('Bun', bun_me)
bpy.context.scene.collection.objects.link(bun)
bun.parent = rig
bvg = bun.vertex_groups.new(name='ValveBiped.Bip01_Head1_4')
bvg.add(list(range(len(bun_me.vertices))), 1.0, 'REPLACE')
bun.modifiers.new('Armature', 'ARMATURE').object = rig
bun_me.materials.append(None)

# the living look: the cards over Voss's wound are just hair again
hair_me = obj['Hair'].data

# ====================================================================== textures
def pixels(img):
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def new_image(name, arr):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.pixels.foreach_set(np.ascontiguousarray(arr, np.float32).ravel())
    img.pack()
    return img


def blur(a, r):
    """box blur (twice, about a gaussian) of an h x w x c array"""
    for _ in range(2):
        for axis in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == axis else (0, 0) for i in range(a.ndim)], mode='edge'), axis=axis)
            a = (np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis) - np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)) / (2 * r + 1)
    return a


def uv_grid(h, w):
    v, u = np.mgrid[0:h, 0:w]
    return (u + 0.5) / w, 1 - (v + 0.5) / h       # glTF uv (origin top left); Blender rows go up


def lum(c):
    return c[..., 0] * 0.3 + c[..., 1] * 0.59 + c[..., 2] * 0.11


def mat_image(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE':
            return n


def swap_texture(mat, img):
    mat_image(mat).image = img


# --- the face
head_mat = bpy.data.materials['M_Head']
src = pixels(mat_image(head_mat).image)
H, W = src.shape[:2]
U, V = uv_grid(H, W)
rgb = src[..., :3].copy()
L = lum(rgb)
ell = lambda cu, cv, ru, rv: np.exp(-(((U - cu) / ru) ** 2 + ((V - cv) / rv) ** 2))

# no beard shadow: the lower face's local colour is moved to the cheeks' (its detail kept)
avg = blur(rgb, 18)
cheek = (avg[int((1 - 0.30) * H), int(0.24 * W)] + avg[int((1 - 0.30) * H), int(0.51 * W)]) / 2
beard = np.clip(ell(0.375, 0.43, 0.2, 0.11) * 1.6, 0, 1) * (1 - np.clip(ell(0.3755, 0.386, 0.085, 0.03) * 1.5, 0, 1))
beard *= (U < 0.74)
rgb += (cheek - avg) * (beard[..., None] * 0.8)

# Voss's thick straight brows go (filled from the skin round them), thin arched light-brown ones
# are drawn instead
box = (V > 0.105) & (V < 0.18) & (U > 0.18) & (U < 0.58)
old = (box & (L < 0.5)).astype(np.float32)
old = np.clip(blur(old[..., None], 3)[..., 0] * 2.5, 0, 1)
keep = (1 - old)[..., None]
fill = blur(rgb * keep, 14) / np.maximum(blur(keep, 14), 1e-3)
rgb += (fill - rgb) * old[..., None]


def brow(inner_u, outer_u):
    s = np.linspace(0, 1, 80)
    u = inner_u + (outer_u - inner_u) * s
    v = 0.156 - 0.016 * np.sin(np.pi * np.clip(s / 1.3, 0, 1)) - 0.002 * s     # arch, peak two thirds out
    half = 0.0125 * (1 - s) + 0.0050 * s                                       # tapering
    r0, r1 = int((1 - 0.17) * H), int((1 - 0.11) * H)
    c0, c1 = int(min(inner_u, outer_u) * W) - 8, int(max(inner_u, outer_u) * W) + 8
    uu, vv = U[r0:r1, c0:c1, None], V[r0:r1, c0:c1, None]
    d = np.hypot((uu - u) * 1.0, (vv - v) * 1.38) / half                       # (v is squashed on the image)
    a = np.clip(1.25 - d.min(axis=2), 0, 1) ** 1.2
    hair_ = 0.94 + 0.06 * np.sin(uu[..., 0] * 900 + vv[..., 0] * 300)          # a little stroke texture
    region = rgb[r0:r1, c0:c1]
    region += (srgb(BROW) - region) * (a * 0.85 * hair_)[..., None]


brow(0.352, 0.205)    # her right (the image's left)
brow(0.398, 0.546)    # her left

# blond at the hairline (the dark scalp under the hair), not the eyes or brows
face_box = (U > 0.18) & (U < 0.57) & (V > 0.11)
scalp = ((V < 0.24) & ~face_box & (U < 0.74)).astype(np.float32)
m = blur(scalp[..., None], 4)[..., 0] * np.clip((0.5 - L) / 0.3, 0, 1)
tone = srgb(HAIR) * (0.82 + 0.6 * L[..., None])
rgb += (tone - rgb) * m[..., None]

# lips
lipm = np.clip(ell(0.3755, 0.386, 0.068, 0.0135) * 1.5, 0, 1) * (U < 0.74)
rgb += (srgb(LIPS) * (0.75 + 0.5 * L[..., None]) - rgb) * (lipm[..., None] * 0.42)

# a thin line along each upper lid, with a small wing at the outer corner
def liner(inner, top, outer):
    s = np.linspace(0, 1, 60)[:, None]
    a, b, c = (np.array(x) for x in (inner, top, outer))
    pts = (1 - s) ** 2 * a + 2 * (1 - s) * s * (2 * b - (a + c) / 2) + s ** 2 * c    # through the top
    wing = c + (c - a) * np.array([0.14, 0]) * s[::-1] * 0 + np.array([np.sign(c[0] - a[0]) * 0.012, -0.007]) * s
    pts = np.vstack([pts, wing])
    half = np.concatenate([0.0012 + 0.0022 * s[:, 0], 0.0034 * (1 - s[:, 0]) + 0.0006])
    r0, r1 = int((1 - 0.235) * H), int((1 - 0.17) * H)
    c0, c1 = int(min(a[0], c[0]) * W) - 20, int(max(a[0], c[0]) * W) + 20
    uu, vv = U[r0:r1, c0:c1, None], V[r0:r1, c0:c1, None]
    d = np.hypot(uu - pts[:, 0], (vv - pts[:, 1]) * 1.38) / half
    al = np.clip(1.4 - d.min(axis=2), 0, 1)
    region = rgb[r0:r1, c0:c1]
    region += (np.array([0.16, 0.1, 0.08]) - region) * (al * 0.85)[..., None]


liner((0.3218, 0.2166), (0.2851, 0.1943), (0.2386, 0.2058))
liner((0.428, 0.2168), (0.4647, 0.1939), (0.5107, 0.2055))

# a little colour on the cheekbones
blush = (ell(0.25, 0.29, 0.05, 0.035) + ell(0.50, 0.29, 0.05, 0.035)) * (U < 0.74)
rgb += (np.array([0.86, 0.55, 0.52]) - rgb) * (blush[..., None] * 0.12)

# the mole: her right cheek beside the nose (her right is on the image's left)
mole = np.clip((1 - np.hypot((U - 0.305) / 0.0045, (V - 0.296) / 0.0045)) * 2, 0, 1)
rgb += (np.array([0.27, 0.16, 0.12]) - rgb) * mole[..., None]

out = src.copy()
out[..., :3] = np.clip(rgb, 0, 1)
swap_texture(head_mat, new_image('K_Head_albedo', out))
mi = bpy.data.materials.get('M_MouthInner')
if mi:
    swap_texture(mi, mat_image(head_mat).image)
for m_ in bpy.data.materials:
    if m_.name.startswith('M_LipSeal'):
        swap_texture(m_, mat_image(head_mat).image)

# --- the hair: its own blond material; the eyelashes keep the dark one
lash_mat = bpy.data.materials['M_HairCards']
lash_mat.name = 'M_Lashes'
hair_mat = lash_mat.copy()
hair_mat.name = 'M_HairCards'
hp = pixels(mat_image(lash_mat).image)
Lh = lum(hp[..., :3])
t = np.clip((Lh - 0.03) / 0.2, 0, 1)[..., None] ** 0.8
hp2 = hp.copy()
hp2[..., :3] = srgb(HAIR_DARK) * 0.8 + (srgb(HAIR) * 1.12 - srgb(HAIR_DARK) * 0.8) * t
hair_mat.node_tree.nodes[mat_image(hair_mat).name].image = new_image('K_Hair_albedo', np.clip(hp2, 0, 1))
for i, slot in enumerate(obj['Hair'].material_slots):
    slot.material = hair_mat
bun.material_slots[0].material = hair_mat
# (one material for all the hair now: drop the patch slot's faces into slot 0)
for f in hair_me.polygons:
    f.material_index = 0

# --- white clothes: the shirt, the trousers and shoes (white boots)
def whiten(mat_name, base, spread):
    mat = bpy.data.materials[mat_name]
    px = pixels(mat_image(mat).image)
    l = lum(px[..., :3])
    mean = l[px[..., 3] > 0.5].mean() if (px[..., 3] > 0.5).any() else l.mean()
    v = np.clip(base + (l - mean) * spread, 0, 1)[..., None]
    px[..., :3] = v * np.array([0.97, 0.985, 1.0])
    swap_texture(mat, new_image('K_' + mat_name[2:] + '_albedo', px))


whiten('M_Shirt', 0.9, 0.8)
whiten('M_Pants', 0.86, 0.9)

# ====================================================================== the earpiece
bpy.ops.mesh.primitive_torus_add(major_radius=0.0125, minor_radius=0.0019, major_segments=24, minor_segments=6,
                                 location=(-0.069, 0.022, 1.287), rotation=(0, math.radians(90), 0))
ear = bpy.context.active_object
ear.name = 'EarPiece'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = ear.data
# keep the hook over the top and behind the ear; the bud sits at the front of it
import bmesh
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < 1.284 and v.co.y < 0.024], context='VERTS')
bud = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.0042)
bmesh.ops.translate(bm, verts=bud['verts'], vec=Vector((-0.07, 0.009, 1.281)))
bm.to_mesh(me)
bm.free()
white = bpy.data.materials.new('K_EarPiece')
white.use_nodes = True
white.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.9, 0.92, 0.95, 1)
me.materials.append(white)
for f in me.polygons:
    f.use_smooth = True
vg = ear.vertex_groups.new(name='ValveBiped.Bip01_Head1_4')
vg.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
ear.parent = rig
mod = ear.modifiers.new('Armature', 'ARMATURE')
mod.object = rig

# ====================================================================== the mouth's inside, shaded to the throat
hm = obj['Head'].data
for a in list(hm.color_attributes):
    hm.color_attributes.remove(a)
col = hm.color_attributes.new('Color', 'FLOAT_COLOR', 'CORNER')
inner = hm.materials.find('M_MouthInner')
vals = np.ones(len(hm.loops) * 4, np.float32)
for f in hm.polygons:
    if f.material_index != inner:
        continue
    for li in f.loop_indices:
        y = hm.vertices[hm.loops[li].vertex_index].co.y
        t = min(1, max(0, (-y - 0.016) / 0.0444))
        s = 0.15 + 0.65 * t ** 0.7
        vals[li * 4:li * 4 + 3] = s
col.data.foreach_set('color', vals)
hm.color_attributes.active_color = col

# ====================================================================== names, size, export
obj['Coat_Torso'].name = 'Coat'
rig.name = 'Kessler_Rig'
rig.scale = (RIG_SCALE,) * 3

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PREVIEW, 'kessler_check.blend'))

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in rig.children:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='ACTIONS', export_morph=True,
    export_morph_normal=False, export_vertex_color='ACTIVE', export_skins=True,
    export_yup=True, export_apply=False)
log('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
