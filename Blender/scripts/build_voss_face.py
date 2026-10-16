"""
Voss's face rig and head wound, worked out on human_scientist.glb (his source cvg.blend is not in
the repo). Nothing is exported from Blender here: the glb's rig, clips and materials must stay
exactly as they are (a Blender round trip changes the bones' rest turns, which the Mixamo run in
Player.js depends on). This script measures the head and writes Blender/voss_face.json; the node
script scripts/build-voss-v2.mjs adds what it describes to a copy of the glb.

What it makes:
  Morph targets on the Head mesh (both primitives: the skin, and the eyelashes):
    jaw_open      the lower face, lower lip, lower teeth, gums and tongue turn about the jaw hinge
    mouth_wide    lips stretched sideways (ee)
    mouth_pucker  lips pushed forward and together (oo)
    mouth_smile   mouth corners up and out
    mouth_frown   mouth corners down
    blink         upper lids (and lashes) rolled down over the eyeballs to meet the lower lids
    eyes_tired    upper lids lowered about 40% of the way (heavy lids)
    brow_up       brows and forehead raised
    brow_down     inner brows pulled down and together
  The same names as ARIA's face (AriaHead.js), plus eyes_tired and mouth_frown.

  The wound (Cycle 9 and the reconstructed Vosses): a shaved patch on the lower back of the skull,
  slightly right of centre, with a red gash (a darker rim, a touch of glow so it reads under the
  toon ramp) and a small dark neural port with a cyan point. Fitted to the scalp by casting rays
  at the head. The hair cards over the patch are cut away by the node script (hair_cut).

Voss's head already has a mouth (teeth, gums, a tongue behind separate lips) and eyeballs behind
open lids, so nothing is added inside.

Run (from the repo root), then the node script:
  blender -b --factory-startup --python Blender/scripts/build_voss_face.py -- \
      public/assets/models/human_scientist.glb Blender/voss_face.json [preview_dir]
  node scripts/build-voss-v2.mjs

Blender axes here (z up, the face looks down -y); the JSON is in glTF axes (y up, face +z):
glTF (x, y, z) = Blender (x, z, -y).
"""
import sys, os, json, math
import bpy, bmesh
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = argv[0] if len(argv) > 0 else os.path.join(HERE, '..', '..', 'public', 'assets', 'models', 'human_scientist.glb')
OUT = argv[1] if len(argv) > 1 else os.path.join(HERE, '..', 'voss_face.json')
PREVIEW = argv[2] if len(argv) > 2 else None

HEAD_BONE = 'ValveBiped.Bip01_Head1_4'

# ---------------------------------------------------------------- landmarks (metres, Blender axes)
MOUTH_Z = 1.2445            # the lip line
MOUTH_Y = -0.066            # front of the lips
CORNER_X = 0.021            # mouth corners
JAW_PIVOT = Vector((0.0, 0.004, 1.262))   # the jaw hinge, in front of the ears
JAW_ANGLE = math.radians(13)              # jaw_open at 1.0
NECK_FADE = (1.192, 1.222)  # below the chin the jaw's pull fades out into the neck
EYE_X = 0.0225              # eye centres (measured from the eyeballs below)

# The wound: centre on the back of the skull (his right is -x), patch half-size, gash half-length
WOUND_AT = (-0.013, 1.292)  # (x, z), cast forward onto the back of the head
PATCH_R = (0.027, 0.023)    # shaved patch radii (x, z)
GASH_LEN = 0.024            # half-length of the gash
GASH_W = 0.0042             # half-width of the gash at its middle
GASH_TILT = math.radians(-24)

smooth = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(min(1.0, max(0.0, (x - a) / (b - a))))


def gl(v):
    """Blender -> glTF axes"""
    return [round(v[0], 6), round(v[2], 6), round(-v[1], 6)]


# ---------------------------------------------------------------- load
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
rig = bpy.data.objects['Scientist_Rig']
rig.data.pose_position = 'REST'
head = bpy.data.objects['Head']
me = head.data
assert head.matrix_world == Matrix.Identity(4), 'Head is expected at the rig origin'
V = [v.co.copy() for v in me.vertices]
N = len(V)

bm = bmesh.new()
bm.from_mesh(me)
bm.verts.ensure_lookup_table()
bm.faces.ensure_lookup_table()

# Parts of the head by connectivity (the skin is one connected piece; the eyes, lashes, teeth,
# gums and tongue are separate pieces, some touching the skin, so nothing is welded by position)
parent = list(range(N))
def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i
def union(a, b):
    a, b = find(a), find(b)
    if a != b:
        parent[a] = b
for e in bm.edges:
    union(e.verts[0].index, e.verts[1].index)
comps = {}
for i in range(N):
    comps.setdefault(find(i), []).append(i)
mat_of = [0] * N
for f in bm.faces:
    for v in f.verts:
        mat_of[v.index] = f.material_index


def bbox(ids):
    return (Vector([min(V[i][a] for i in ids) for a in range(3)]), Vector([max(V[i][a] for i in ids) for a in range(3)]))


main = max(comps.values(), key=len)       # the face and neck skin
main_set = set(main)
eyeballs = {+1: [], -1: []}
lashes = []                                # (ids, side, upper)
mouth_jaw, mouth_static = [], []
for ids in comps.values():
    if ids is main:
        continue
    lo, hi = bbox(ids)
    c = (lo + hi) / 2
    if mat_of[ids[0]] == 1:                # the eyelash cards
        lashes.append(ids)
    elif abs(abs(c.x) - EYE_X) < 0.01 and 1.285 < c.z < 1.315 and c.y < -0.03:
        eyeballs[1 if c.x > 0 else -1] += ids
    elif abs(c.x) < 0.03 and -0.065 < c.y < -0.005 and 1.228 < c.z < 1.265:
        # inside the mouth: what sits below the lip line goes with the jaw
        (mouth_jaw if sum(V[i].z for i in ids) / len(ids) < MOUTH_Z else mouth_static).append(ids)
print('parts: main', len(main), 'lashes', len(lashes), 'mouth jaw/static', len(mouth_jaw), len(mouth_static))

# Eye centres: the eyeball fronts are spheres; centre = front + radius
EYE_C = {}
for s, ids in eyeballs.items():
    lo, hi = bbox(ids)
    r = (hi.x - lo.x) / 2
    EYE_C[s] = Vector(((lo.x + hi.x) / 2, lo.y + r, (lo.z + hi.z) / 2))
    print('eye', s, [round(a, 4) for a in EYE_C[s]], 'r', round(r, 4))


# ---------------------------------------------------------------- the lip line and lid lines
def boundary_side(v):
    """For an open-edge vertex: +1 if its faces lie above it (an upper lip / lid), -1 if below"""
    fz = [f.calc_center_median().z for f in v.link_faces]
    return 1 if sum(fz) / len(fz) > v.co.z else -1


lip_side = {}
for v in bm.verts:
    if v.index in main_set and v.is_boundary and abs(v.co.x) < CORNER_X + 0.004 and v.co.y < -0.048 and abs(v.co.z - MOUTH_Z) < 0.005:
        lip_side[v.index] = boundary_side(v)

def ang(p, c):
    """angle of p above the eye's forward horizontal, seen from the side"""
    return math.atan2(p.z - c.z, -(p.y - c.y))


def open_loops():
    """The skin's open edges, as closed loops of vertex indices"""
    edges = [e for e in bm.edges if e.is_boundary and e.verts[0].index in main_set]
    nxt = {}
    for e in edges:
        a, b = e.verts[0].index, e.verts[1].index
        nxt.setdefault(a, []).append(b)
        nxt.setdefault(b, []).append(a)
    seen, loops = set(), []
    for start in nxt:
        if start in seen:
            continue
        loop, prev, cur = [start], None, start
        seen.add(start)
        while True:
            options = [n for n in nxt[cur] if n != prev and n not in seen]
            if not options:
                break
            prev, cur = cur, options[0]
            seen.add(cur)
            loop.append(cur)
        loops.append(loop)
    return loops


# Each eye's opening is the biggest open loop just in front of the eyeball. Its two corners (the
# vertices furthest left and right) split it into the upper and the lower lid edge.
lid = {}
for s, c in EYE_C.items():
    best = None
    for loop in open_loops():
        ctr = sum((V[i] for i in loop), Vector()) / len(loop)
        if abs(ctr.x - c.x) < 0.006 and abs(ctr.z - c.z) < 0.006 and ctr.y < c.y - 0.005:
            if best is None or len(loop) > len(best):
                best = loop
    a = min(range(len(best)), key=lambda k: V[best[k]].x)
    best = best[a:] + best[:a]
    b = max(range(len(best)), key=lambda k: V[best[k]].x)
    paths = [best[:b + 1], best[b:] + best[:1]]
    paths.sort(key=lambda p: -sum(V[i].z for i in p) / len(p))
    lid[s] = {k: sorted((V[i].x - c.x, ang(V[i], c)) for i in p) for k, p in zip(('up', 'lo'), paths)}
    print('lid', s, 'loop', len(best), 'up', [round(x, 2) for _, x in lid[s]['up']], 'lo', [round(x, 2) for _, x in lid[s]['lo']])


def interp(pts, x):
    if x <= pts[0][0]:
        return pts[0][1]
    if x >= pts[-1][0]:
        return pts[-1][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * ((x - x0) / (x1 - x0) if x1 > x0 else 0)
    return pts[-1][1]


def rot_x(p, centre, a):
    d = p - centre
    c, s = math.cos(a), math.sin(a)
    return centre + Vector((d.x, d.y * c - d.z * s, d.y * s + d.z * c))


# ---------------------------------------------------------------- the shapes
SHAPES = ['jaw_open', 'mouth_wide', 'mouth_pucker', 'mouth_smile', 'mouth_frown', 'blink', 'eyes_tired', 'brow_up', 'brow_down']
D = {k: [Vector() for _ in range(N)] for k in SHAPES}

# Inside the mouth: a tooth goes whole (with the jaw if it sits below the lip line); the big soft
# pieces (gums, tongue, the mouth's lining) bend at the lip line, vertex by vertex
inner_w = {}
for ids in mouth_jaw + mouth_static:
    if len(ids) >= 40:
        for i in ids:
            inner_w[i] = 1.0 - smooth(MOUTH_Z - 0.0025, MOUTH_Z + 0.0025, V[i].z)
    else:
        for i in ids:
            inner_w[i] = 1.0 if ids in mouth_jaw else 0.0

def jaw_weight(i):
    p = V[i]
    if i in inner_w:
        return inner_w[i]
    if i not in main_set:
        return 0.0
    # the split between the moving lower face and the still upper face: a line (seen from the
    # side) from the lip line at the front to the hinge, softened over a few millimetres
    t = min(1.0, max(0.0, (p.y - MOUTH_Y) / (JAW_PIVOT.y - MOUTH_Y)))
    zs = MOUTH_Z + (JAW_PIVOT.z - MOUTH_Z) * t
    soft = 1.0 - smooth(zs - 0.007, zs + 0.004, p.z)
    # across the lips themselves the split is sharp: the lower lip goes, the upper lip stays
    near = 1.0 - smooth(CORNER_X - 0.004, CORNER_X + 0.006, abs(p.x))
    if near > 0 and p.y < -0.045 and abs(p.z - MOUTH_Z) < 0.012:
        if i in lip_side:
            hard = 1.0 if lip_side[i] < 0 else 0.0
        else:
            hard = 1.0 if p.z < MOUTH_Z else 0.0
        soft = soft * (1 - near) + hard * near
    neck = smooth(NECK_FADE[0], NECK_FADE[1], p.z)
    back = 1.0 - smooth(0.0, 0.02, p.y)
    return soft * neck * back


JW = [jaw_weight(i) for i in range(N)]
for i in range(N):
    if JW[i] > 0:
        D['jaw_open'][i] = rot_x(V[i], JAW_PIVOT, JAW_ANGLE * JW[i]) - V[i]

# The lips are sealed along the front crease by a row of tiny faces joining the upper lip to the
# lower one; opened, they would stretch into a curtain. The node script moves them to a primitive
# of their own (M_LipSeal) that the game hides while the mouth is open, so the shut mouth looks
# exactly as before.
lip_seal = []
for f in bm.faces:
    ids = [v.index for v in f.verts]
    if not all(i in main_set for i in ids):
        continue
    if all(abs(V[i].x) < CORNER_X + 0.0015 and V[i].y < -0.05 and abs(V[i].z - MOUTH_Z) < 0.003 for i in ids):
        ws = [JW[i] for i in ids]
        if max(ws) - min(ws) > 0.5:
            lip_seal.append(f)
print('lip seal faces cut', len(lip_seal))

# the lips (skin only)
for i in main:
    p = V[i]
    if p.y > -0.035:
        continue
    front = smooth(-0.035, -0.055, p.y)
    lips = math.exp(-((p.x / 0.027) ** 2 + ((p.z - MOUTH_Z) / 0.011) ** 2)) * front
    side = 1.0 if p.x >= 0 else -1.0
    corner = math.exp(-(((abs(p.x) - CORNER_X) / 0.011) ** 2 + ((p.z - MOUTH_Z) / 0.011) ** 2)) * front
    if lips > 0.01:
        k = min(1.0, abs(p.x) / 0.016)
        D['mouth_wide'][i] = Vector((side * 0.0042 * k, 0.0016 * k, -(p.z - MOUTH_Z) * 0.18)) * lips
        D['mouth_pucker'][i] = Vector((-p.x * 0.34, -0.0042, -(p.z - MOUTH_Z) * 0.12)) * lips
    if corner > 0.01:
        D['mouth_smile'][i] = Vector((side * 0.0018, 0.0014, 0.0032)) * corner
        D['mouth_frown'][i] = Vector((-side * 0.0004, 0.0004, -0.0028)) * corner

# the lids: rolled about the eyeball's centre, so they slide over the eye and never through it
def lid_shapes(i, p, upper_only=False):
    s = 1 if p.x > 0 else -1
    c = EYE_C[s]
    dx = p.x - c.x
    if abs(dx) > 0.017 or p.y > c.y - 0.002:
        return
    a = ang(p, c)
    au = interp(lid[s]['up'], dx)
    al = interp(lid[s]['lo'], dx)
    gap = max(0.0, au - al)
    across = 1.0 - smooth(0.0115, 0.0165, abs(dx))
    if a >= (au + al) / 2:
        w = (1.0 - smooth(au + 0.02, au + 0.62, a)) * across
        if w <= 0:
            return
        d = rot_x(p, c, (gap * 0.78 + 0.05) * w) - p
        d += (p - c).normalized() * 0.00025 * w      # rides just over the lower lid when closed
        D['blink'][i] = d
        D['eyes_tired'][i] = rot_x(p, c, (gap * 0.42) * w) - p
    else:
        w = (1.0 - smooth(al - 0.02, al - 0.38, a)) * across
        if w > 0:
            D['blink'][i] = rot_x(p, c, -(gap * 0.22) * w) - p

for i in main:
    p = V[i]
    if abs(abs(p.x) - EYE_X) < 0.02 and abs(p.z - 1.300) < 0.03:
        lid_shapes(i, p)
# the lashes follow their lid edge
for ids in lashes:
    lo, hi = bbox(ids)
    s = 1 if lo.x + hi.x > 0 else -1
    c = EYE_C[s]
    upper = sum(V[i].z for i in ids) / len(ids) > c.z - 0.0005 and (hi.z - c.z) > 0.0005
    for i in ids:
        p = V[i]
        dx = p.x - c.x
        au, al = interp(lid[s]['up'], dx), interp(lid[s]['lo'], dx)
        gap = max(0.0, au - al)
        across = 1.0 - smooth(0.0115, 0.0165, abs(dx))
        if upper:
            D['blink'][i] = rot_x(p, c, (gap * 0.78 + 0.05) * across) - p + (p - c).normalized() * 0.00025
            D['eyes_tired'][i] = rot_x(p, c, (gap * 0.42) * across) - p
        else:
            D['blink'][i] = rot_x(p, c, -(gap * 0.22) * across) - p
print('lashes upper/lower', [(round(bbox(ids)[1].z, 4)) for ids in lashes])

# the brows
for i in main:
    p = V[i]
    if p.y > -0.03 or p.z < 1.296:
        continue
    front = smooth(-0.03, -0.045, p.y)
    up = front * smooth(1.300, 1.312, p.z) * (1 - smooth(1.345, 1.375, p.z)) * (1 - smooth(0.045, 0.06, abs(p.x)))
    if up > 0:
        D['brow_up'][i] = Vector((0, 0, 0.0028 * up))
    inner = math.exp(-(((abs(p.x) - 0.014) / 0.014) ** 2 + ((p.z - 1.320) / 0.008) ** 2)) * front * smooth(1.302, 1.31, p.z)
    if inner > 0.01:
        side = 1.0 if p.x >= 0 else -1.0
        D['brow_down'][i] = Vector((-side * 0.0011, -0.0004, -0.0022)) * inner


# ---------------------------------------------------------------- the wound
dg = bpy.context.evaluated_depsgraph_get()
skull = [i for ids in comps.values() for i in ids if mat_of[i] == 0]   # skin and scalp (not the lashes)
tris = []
for f in bm.faces:
    if f.material_index == 0:
        vs = [v.index for v in f.verts]
        for k in range(1, len(vs) - 1):
            tris.append((vs[0], vs[k], vs[k + 1]))
bvh = BVHTree.FromPolygons(V, tris)


def on_scalp(x, z, lift):
    """The point on the back of the skull at (x, z), raised `lift` off the skin"""
    hit, n, _, _ = bvh.ray_cast(Vector((x, 0.3, z)), Vector((0, -1, 0)))
    if hit is None:
        raise RuntimeError('wound ray missed the head at %.3f, %.3f' % (x, z))
    if n.y < 0:
        n = -n
    return hit + n * lift, n


wound = {'positions': [], 'normals': [], 'groups': {}}
def add_tris(material, pts2d, faces, lift):
    g = wound['groups'].setdefault(material, [])
    base = len(wound['positions'])
    for (x, z) in pts2d:
        p, n = on_scalp(x, z, lift)
        wound['positions'].append(gl(p))
        wound['normals'].append(gl(n))
    for f in faces:
        g.extend(base + k for k in f)


def ellipse(cx, cz, rx, rz, n, rot=0.0, jitter=None):
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        r = 1.0 + (jitter[k % len(jitter)] if jitter else 0)
        x, z = math.cos(a) * rx * r, math.sin(a) * rz * r
        pts.append((cx + x * math.cos(rot) - z * math.sin(rot), cz + x * math.sin(rot) + z * math.cos(rot)))
    return pts


def fan(material, cx, cz, rim, lift, rings=3):
    """A filled shape: a centre point and concentric copies of the outline, so it bends with the skull"""
    pts = [(cx, cz)]
    for r in range(1, rings + 1):
        k = r / rings
        pts += [(cx + (x - cx) * k, cz + (z - cz) * k) for (x, z) in rim]
    n = len(rim)
    faces = [(0, 1 + (j + 1) % n, 1 + j) for j in range(n)]
    for r in range(rings - 1):
        a, b = 1 + r * n, 1 + (r + 1) * n
        for j in range(n):
            j2 = (j + 1) % n
            faces += [(a + j, a + j2, b + j2), (a + j, b + j2, b + j)]
    add_tris(material, pts, faces, lift)     # (the node script turns each face to look outward)


cx, cz = WOUND_AT
jit = [0.06, -0.04, 0.09, 0.0, -0.07, 0.05, -0.02, 0.08, -0.05, 0.03, -0.08, 0.04, 0.07, -0.03, 0.02, -0.06]
fan('M_WoundSkin', cx, cz, ellipse(cx, cz, PATCH_R[0], PATCH_R[1], 32, 0.2, jit), 0.0012, rings=4)
# the gash: a long lens, ragged, slightly open, with a dark crusted rim around it
def lens(half_len, half_w, n=24, wobble=0.0):
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        x = math.cos(a) * half_len
        w = half_w * (1 - (x / half_len) ** 2) ** 0.6 * (1 + wobble * math.sin(k * 2.7))
        z = math.sin(a) * (w + 0.0004)
        pts.append((cx + x * math.cos(GASH_TILT) - z * math.sin(GASH_TILT), cz + x * math.sin(GASH_TILT) + z * math.cos(GASH_TILT)))
    return pts
fan('M_WoundRim', cx, cz, lens(GASH_LEN * 1.12, GASH_W * 1.9, 28, 0.18), 0.0017, rings=3)
fan('M_Wound', cx, cz, lens(GASH_LEN, GASH_W, 24, 0.12), 0.0021, rings=3)
# stitch marks across the gash, and the port at its lower end
for k in range(-3, 4):
    t = k / 3.6 * GASH_LEN
    sx, sz = cx + t * math.cos(GASH_TILT), cz + t * math.sin(GASH_TILT)
    nx, nz = -math.sin(GASH_TILT), math.cos(GASH_TILT)
    tx, tz = math.cos(GASH_TILT), math.sin(GASH_TILT)
    L, W = GASH_W * 2.3, 0.0005
    quad = [(sx - nx * L - tx * W, sz - nz * L - tz * W), (sx - nx * L + tx * W, sz - nz * L + tz * W),
            (sx + nx * L + tx * W, sz + nz * L + tz * W), (sx + nx * L - tx * W, sz + nz * L - tz * W)]
    add_tris('M_WoundRim', quad, [(0, 2, 1), (0, 3, 2)], 0.0025)
px, pz = cx + GASH_LEN * 0.55 * math.cos(GASH_TILT) + 0.007, cz + GASH_LEN * 0.55 * math.sin(GASH_TILT) - 0.008
fan('M_WoundRim', px, pz, ellipse(px, pz, 0.0042, 0.0042, 14), 0.0020, rings=2)
fan('M_WoundPort', px, pz, ellipse(px, pz, 0.0016, 0.0016, 10), 0.0026, rings=1)

# the hair over the patch (and a little round it) is cut away, seen from behind
hair_cut = {'center': [cx, cz], 'radii': [PATCH_R[0] + 0.006, PATCH_R[1] + 0.008], 'behind_y': 0.02}

# ---------------------------------------------------------------- face texture landmarks
# Where the face's features sit on M_Head_albedo, for FaceWear.js (the tired look is painted on a
# copy of the texture): each landmark is found by casting a ray at the skin and reading the UV
# there. The face is laid out on the texture as seen from the front (his left on the image's
# right), so one scale, CM (UV units for 1 cm across and down the face), serves the whole face.
# UVs are glTF's (origin top left, as the image is stored).
uv_layer = bm.loops.layers.uv.active
tri_uv = []
for f in bm.faces:
    if f.material_index == 0:
        uvs = [l[uv_layer].uv.copy() for l in f.loops]
        for k in range(1, len(uvs) - 1):
            tri_uv.append((uvs[0], uvs[k], uvs[k + 1]))
from mathutils.geometry import barycentric_transform


def uv_at(origin, direction):
    hit, _, ti, _ = bvh.ray_cast(origin, direction)
    if hit is None:
        return None
    a, b, c = (V[i] for i in tris[ti])
    ua, ub, uc = (Vector((t.x, t.y, 0)) for t in tri_uv[ti])
    u = barycentric_transform(hit, a, b, c, ua, ub, uc)
    return [round(u.x, 4), round(1 - u.y, 4)]


FRONT = Vector((0, 1, 0))
LANDMARKS = {
    # name: (x, z) seen from the front, or ('side', y, z) seen from the character's left
    'underEye': (0.0225, 1.2895), 'eyeInner': (0.0115, 1.2975), 'eyeOuter': (0.0335, 1.2985),
    'lidUpper': (0.0225, 1.3035), 'brow': (0.024, 1.318), 'cheek': (0.036, 1.268),
    'cheekbone': (0.045, 1.285), 'forehead': (0.02, 1.345), 'mouthCorner': (0.0235, 1.2445),
    'lipLower': (0.008, 1.2395), 'chinSide': (0.012, 1.224), 'nostril': (0.011, 1.268),
    'temple': ('side', -0.035, 1.312), 'jaw': ('side', -0.02, 1.232), 'earFront': ('side', 0.0, 1.27),
}
CENTRE = {'noseBridge': (0, 1.300), 'noseTip': (0, 1.272), 'foreheadMid': (0, 1.345), 'chin': (0, 1.222), 'philtrum': (0, 1.256)}
face_uv = {}
for name, spec in list(LANDMARKS.items()) + list(CENTRE.items()):
    for side, tag in ((1, 'L'), (-1, 'R')) if name in LANDMARKS else ((1, ''),):
        if spec[0] == 'side':
            o = Vector((side * 0.2, spec[1], spec[2]))
            d = Vector((-side, 0, 0))
        else:
            o = Vector((side * spec[0], -0.2, spec[1]))
            d = FRONT
        p = uv_at(o, d)
        if p is None:
            print('landmark missed', name + tag)
            continue
        face_uv[name + tag] = {'uv': p}
# the whites of the eyes (the eyeballs are on the same texture): the UV box of each eyeball
uv_of_vert = {}
for f in bm.faces:
    for l in f.loops:
        uv_of_vert[l.vert.index] = l[uv_layer].uv
for s, tag in ((1, 'L'), (-1, 'R')):
    us = [uv_of_vert[i] for i in eyeballs[s] if i in uv_of_vert]
    front_i = min(eyeballs[s], key=lambda i: V[i].y)
    face_uv['eyeball' + tag] = {'box': [round(min(u.x for u in us), 4), round(1 - max(u.y for u in us), 4), round(max(u.x for u in us), 4), round(1 - min(u.y for u in us), 4)],
                                'pupil': [round(uv_of_vert[front_i].x, 4), round(1 - uv_of_vert[front_i].y, 4)]}
# the scale: across, between the outer eye corners; down, from mid-forehead to chin
cm_x = abs(face_uv['eyeOuterL']['uv'][0] - face_uv['eyeOuterR']['uv'][0]) / (2 * 3.35)
cm_y = abs(face_uv['chin']['uv'][1] - face_uv['foreheadMid']['uv'][1]) / ((1.345 - 1.222) * 100)
UV_JS = os.path.join(HERE, '..', '..', 'src', 'entities', 'vossFaceUV.js')
with open(UV_JS, 'w') as f:
    f.write("// Where Voss's face features sit on his head texture (M_Head_albedo, 1024 px), for FaceWear.js.\n")
    f.write('// Generated by Blender/scripts/build_voss_face.py (do not edit by hand). glTF UV (0..1, origin top\n')
    f.write('// left); the face is laid out as seen from the front, so his left (L) is on the right of the image.\n')
    f.write('// eyeball: the UV box of each eyeball [u0, v0, u1, v1] and the UV at its front (the pupil).\n\n')
    f.write('// UV units for 1 cm across [0] and down [1] the face\n')
    f.write('export const CM = [%.4f, %.4f];\n\n' % (cm_x, cm_y))
    f.write('export const FACE_UV = {\n')
    for k, lm in face_uv.items():
        f.write('  %s: { %s },\n' % (k, ', '.join('%s: %s' % (a, json.dumps(b)) for a, b in lm.items())))
    f.write('};\n')
print('wrote', UV_JS, len(face_uv), 'landmarks')

# ---------------------------------------------------------------- write
out = {
    'note': 'Generated by Blender/scripts/build_voss_face.py from human_scientist.glb. glTF axes.',
    'targets': SHAPES,
    'vertexCount': N,
    'deltas': {},
    'check': [],            # a few base positions, so the node script can confirm the vertex order
    'wound': {'bone': HEAD_BONE, **wound},
    'hairCut': {'center_x': gl(Vector((cx, 0, cz)))[0], 'center_y': gl(Vector((cx, 0, cz)))[1],
                'radius_x': hair_cut['radii'][0], 'radius_y': hair_cut['radii'][1],
                'behind_z': -hair_cut['behind_y']},
    # the gums, tongue and the mouth's lining: textured pink, they fill an open mouth, so the node
    # script gives them a dark material of their own (they never show while the mouth is shut)
    'mouthInner': sorted(i for ids in mouth_jaw + mouth_static if len(ids) >= 40 for i in ids),
    # triangles (vertex index triples) of the sealed lip crease (M_LipSeal in the node script)
    'cutFaces': [sorted(v.index for v in f.verts) for f in lip_seal],
}
for k in SHAPES:
    rows = []
    for i, d in enumerate(D[k]):
        if d.length > 1e-6:
            rows.append([i] + gl(d))
    out['deltas'][k] = rows
    print('shape', k, 'moves', len(rows), 'verts, max', round(max((Vector(r[1:]).length for r in rows), default=0) * 1000, 2), 'mm')
for i in range(0, N, max(1, N // 40)):
    out['check'].append([i] + gl(V[i]))
out['check'].append([N - 1] + gl(V[N - 1]))
with open(OUT, 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print('wrote', OUT)

# ---------------------------------------------------------------- previews (optional)
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    bmesh.ops.delete(bm, geom=lip_seal, context='FACES_ONLY')   # as the game does with the mouth open
    bm.to_mesh(me)
    head.shape_key_add(name='Basis')
    for k in SHAPES:
        kb = head.shape_key_add(name=k)
        for i, d in enumerate(D[k]):
            kb.data[i].co = V[i] + d
    # the wound as an object, for the back view
    wm = bpy.data.meshes.new('Wound')
    P = [Vector((p[0], -p[2], p[1])) for p in wound['positions']]
    F = []
    for g in wound['groups'].values():
        F += [tuple(g[j:j + 3]) for j in range(0, len(g), 3)]
    wm.from_pydata(P, [], F)
    wo = bpy.data.objects.new('Wound', wm)
    bpy.context.scene.collection.objects.link(wo)
    red = bpy.data.materials.new('red')
    red.diffuse_color = (0.6, 0.05, 0.05, 1)
    wm.materials.append(red)
    dark = bpy.data.materials.new('M_MouthInner')
    dark.use_nodes = True
    px = bpy.data.images.new('mouth_dark', 1, 1)
    px.pixels = [0.09, 0.025, 0.025, 1.0]
    tex = dark.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = px
    dark.node_tree.links.new(tex.outputs['Color'], dark.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
    me.materials.append(dark)
    inner = set(out['mouthInner'])
    for f in me.polygons:
        if all(v in inner for v in f.vertices):
            f.material_index = len(me.materials) - 1
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x = sc.render.resolution_y = 420
    for o in bpy.data.objects:
        if o.name == 'Icosphere':
            o.hide_render = True
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 100
    sc.collection.objects.link(cam)
    sc.camera = cam
    def shoot(name, at, frm):
        cam.location = frm
        cam.rotation_euler = (at - frm).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(PREVIEW, name + '.png')
        bpy.ops.render.render(write_still=True)
    face = Vector((0, -0.05, 1.27))
    for k in ['none'] + SHAPES:
        for kb in head.data.shape_keys.key_blocks[1:]:
            kb.value = 1.0 if kb.name == k else 0.0
        shoot('face_' + k, face, face + Vector((0, -0.55, 0.02)))
    for kb in head.data.shape_keys.key_blocks[1:]:
        kb.value = 0
    mouth = Vector((0, -0.06, 1.245))
    for v in (0.5, 1.0):
        head.data.shape_keys.key_blocks['jaw_open'].value = v
        shoot('mouth_jaw_%d' % (v * 10), mouth, mouth + Vector((0.06, -0.22, 0.02)))
    shoot('side_jaw', face, face + Vector((-0.45, -0.3, 0.0)))
    head.data.shape_keys.key_blocks['jaw_open'].value = 0
    head.data.shape_keys.key_blocks['blink'].value = 1
    shoot('eye_blink', Vector((0.022, -0.05, 1.30)), Vector((0.022, -0.05, 1.30)) + Vector((0.05, -0.25, 0.03)))
    head.data.shape_keys.key_blocks['blink'].value = 0
    shoot('eye_open', Vector((0.022, -0.05, 1.30)), Vector((0.022, -0.05, 1.30)) + Vector((0.05, -0.25, 0.03)))
    bpy.data.objects['Hair'].hide_render = True
    shoot('back_wound', Vector((cx, 0.07, cz)), Vector((cx, 0.6, cz + 0.05)))
    head.data.shape_keys.key_blocks['jaw_open'].value = 0
    bpy.data.objects['Hair'].hide_render = False
    shoot('mouth_closed', mouth, mouth + Vector((0.0, -0.16, 0.01)))
    # the head texture with the landmarks dotted on, to check them by eye
    import numpy as np
    img = bpy.data.images['M_Head_albedo']
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    for name, lm in face_uv.items():
        pts = [lm['uv']] if 'uv' in lm else [lm['pupil'], lm['box'][:2], lm['box'][2:]]
        for (u, v) in pts:
            x, y = int(u * w), int((1 - v) * h)
            px[max(0, y - 4):y + 5, max(0, x - 4):x + 5] = (1, 0, 1, 1) if name.endswith('L') else (0, 1, 0, 1)
    dbg = bpy.data.images.new('uvdbg', w, h)
    dbg.pixels = px.ravel()
    dbg.filepath_raw = os.path.join(PREVIEW, 'face_uv_landmarks.png')
    dbg.file_format = 'PNG'
    dbg.save()
