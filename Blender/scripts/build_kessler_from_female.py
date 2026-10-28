"""
Dr. Elena Kessler: the body of "Female scientist" by photon (that one larry), CC-BY-4.0
(https://sketchfab.com/3d-models/female-scientist-c34c0fb5c79d41a18436933f937b283c, the file
Blender/assets/female_scientist.glb) with the head of "Angelica - Female Head PBR Model with
Animation" by Sell Asset Store, CC-BY-4.0
(https://sketchfab.com/3d-models/angelica-female-head-pbr-model-with-animation-bada072816b74daeb860b8e0725c254d,
the file Blender/assets/angelica_head.glb); both credited in CREDITS.md. Made to sit beside Voss
(human_scientist_v2.glb): his skeleton, his clips and his face's morphs.

What is kept and what changes (Blender axes: z up, the face looks toward -y):
  - the scientist's body mesh (coat, shirt, trousers, shoes, hands) and her glasses (dark lenses:
    she keeps her shades); her own head, eyes and hair go
  - the skeleton becomes Voss's: her body is first posed into his rest pose (limb by limb, so his
    clips move her as they move him), his joints are then moved onto hers, and her skin is bound
    to them
  - Angelica's head, eyes, lashes and mouth take the old head's place: scaled to its height above
    the eyes, the neck brought forward onto the old neck and cut off inside the collar, thinned
    (the source is 5 MB, most of it hair) and skinned as the old head was; Voss's face morphs
    (jaw_open, blink, ...) are carried over
  - Angelica's hair, thinned, and red: coloured per vertex (no texture); her painted scalp and
    brows go red too, her eyes green
  - the clothes are repainted in Kessler's colours, flat, the way Voss's are

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_kessler_from_female.py -- \\
      [public/assets/models/kessler.glb] [preview_dir]
then compress:  node scripts/optimize-models.mjs kessler.glb
"""
import sys, os, math, re
import bpy
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
MODELS = os.path.join(ROOT, 'public', 'assets', 'models')
FEMALE = os.path.join(ROOT, 'Blender', 'assets', 'female_scientist.glb')
ANGELICA = os.path.join(ROOT, 'Blender', 'assets', 'angelica_head.glb')
VOSS = os.path.join(MODELS, 'human_scientist_v2.glb')
OUT = argv[0] if len(argv) > 0 and argv[0] else os.path.join(MODELS, 'kessler.glb')
PREVIEW = argv[1] if len(argv) > 1 else None

KEEP_CLIPS = ('Idle', 'Walk')


def log(*a):
    print('[kessler]', *a, flush=True)


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def gauss(*terms):
    return math.exp(-sum(t * t for t in terms))


def base(name):
    """A bone's name without the exporter's number: ValveBiped.Bip01_Pelvis_47 -> ...Pelvis"""
    return re.sub(r'_\d+$', '', name)


def select_only(o):
    bpy.ops.object.mode_set(mode='OBJECT') if bpy.context.object and bpy.context.object.mode != 'OBJECT' else None
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


# ====================================================================== load her, then Voss
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=FEMALE)
frig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
frig.name = 'F_Rig'
PARTS = {'Object_9': 'Head', 'Object_10': 'EyeL', 'Object_11': 'EyeR', 'Object_18': 'Hands', 'Object_20': 'Body',
         'Object_15': 'Lens', 'Object_16': 'Frame', 'Object_13': 'OldHair', 'Object_7': 'OldBun'}
her = {}
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name in PARTS:
        part = PARTS[o.name]
        o.name = 'F_' + part
        her[part] = o
    elif o.type == 'MESH':
        bpy.data.objects.remove(o)                 # (the importer's Icosphere)
for k in ('OldHair', 'OldBun'):                    # her new hair is built below
    bpy.data.objects.remove(her.pop(k))
for o in her.values():                             # Sketchfab's own lights and specular tints go
    o.data.name = 'F_' + o.data.name
log('her parts', sorted(her))

bpy.ops.import_scene.gltf(filepath=VOSS)
rig = bpy.data.objects['Scientist_Rig']
vhead = bpy.data.objects['Head']
vhead.name = 'V_Head'
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.parent == rig and o is not vhead:
        bpy.data.objects.remove(o)
    elif o.type == 'MESH' and o.name.startswith('Icosphere'):
        bpy.data.objects.remove(o)
for a in list(bpy.data.actions):
    if a.name not in KEEP_CLIPS:
        bpy.data.actions.remove(a)
rig.data.pose_position = 'REST'
frig.data.pose_position = 'POSE'
bpy.context.view_layer.update()

fbone = {base(b.name): b.name for b in frig.data.bones}
vbone = {base(b.name): b.name for b in rig.data.bones}
B = 'ValveBiped.Bip01_'

# Where each of her bones' weights go on Voss's rig. Her twist helpers (Wrist, Shoulder) and hand
# attachments go to the bones they ride on; she has three fingers' bones (thumb, index, middle).
def voss_for(fname):
    b = base(fname)
    b = (b.replace('_Wrist', '_Forearm').replace('_Shoulder', '_UpperArm')
          .replace('ValveBiped.Anim_Attachment_LH', B + 'L_Hand').replace('ValveBiped.Anim_Attachment_RH', B + 'R_Hand')
          .replace('ValveBiped.forward', B + 'Head1'))
    if b == 'ValveBiped.Bip01':
        b = B + 'Pelvis'
    return vbone.get(b)


# ====================================================================== pose her into Voss's rest pose
# Each bone turns (about its own joint, parents first) so the line to the joint it leads to points
# the way Voss's does; where a second line is given, the twist about the first is matched too (the
# forearms and hands: so her palms face as his do).
def chain(*names):
    return [B + n for n in names]


SIDES = ('L', 'R')
LEADS = {}                     # bone -> (bone whose head it points at, optional (a, b) for the twist)
for a, b in zip(chain('Pelvis', 'Spine', 'Spine1', 'Spine2', 'Spine4', 'Neck1'), chain('Spine', 'Spine1', 'Spine2', 'Spine4', 'Neck1', 'Head1')):
    LEADS[a] = (b, None)
for s in SIDES:
    p = s + '_'
    LEADS[B + p + 'Clavicle'] = (B + p + 'UpperArm', None)
    LEADS[B + p + 'UpperArm'] = (B + p + 'Forearm', None)
    LEADS[B + p + 'Forearm'] = (B + p + 'Hand', (B + p + 'Finger1', B + p + 'Finger2'))
    LEADS[B + p + 'Hand'] = (B + p + 'Finger2', (B + p + 'Finger1', B + p + 'Finger2'))
    for f in ('0', '1', '2'):
        LEADS[B + p + 'Finger' + f] = (B + p + 'Finger' + f + '1', None)
        LEADS[B + p + 'Finger' + f + '1'] = (B + p + 'Finger' + f + '2', None)
    LEADS[B + p + 'Thigh'] = (B + p + 'Calf', None)
    LEADS[B + p + 'Calf'] = (B + p + 'Foot', None)
    LEADS[B + p + 'Foot'] = (B + p + 'Toe0', None)


def vpos(b):           # Voss's joint, at rest (world)
    return rig.matrix_world @ rig.data.bones[vbone[b]].head_local


def fpos(b):           # her joint, as posed so far (world)
    return frig.matrix_world @ frig.pose.bones[fbone[b]].head


def turn_bone(pb, R):
    """Rotate a pose bone (world rotation R) about its head"""
    M = frig.matrix_world @ pb.matrix
    head = M.to_translation()
    M2 = Matrix.Translation(head) @ R.to_matrix().to_4x4() @ Matrix.Translation(-head) @ M
    pb.matrix = frig.matrix_world.inverted() @ M2
    bpy.context.view_layer.update()


# (her own spine and neck stay as they are: following his would hunch her and drop her head 5 cm;
# the limbs are what must match for his clips to hang her arms and move her legs as they do his)
OWN_POSTURE = set(chain('Pelvis', 'Spine', 'Spine1', 'Spine2', 'Spine4', 'Neck1'))
order = [b.name for b in frig.data.bones]          # parents come before children
for name in order:
    key = base(name)
    if key not in LEADS or key in OWN_POSTURE:
        continue
    lead, twist = LEADS[key]
    if lead not in fbone or lead not in vbone or key not in vbone:
        continue
    pb = frig.pose.bones[name]
    have = fpos(lead) - fpos(key)
    want = vpos(lead) - vpos(key)
    R = have.rotation_difference(want)
    turn_bone(pb, R)
    if twist and all(t in fbone and t in vbone for t in twist):
        axis = want.normalized()
        h = fpos(twist[0]) - fpos(twist[1])
        w = vpos(twist[0]) - vpos(twist[1])
        h -= axis * h.dot(axis)
        w -= axis * w.dot(axis)
        if h.length > 1e-5 and w.length > 1e-5:
            ang = h.normalized().angle(w.normalized())
            if h.cross(w).dot(axis) < 0:
                ang = -ang
            turn_bone(pb, Quaternion(axis, ang))

# her joints in that pose; then the pose goes into the meshes
fjoint = {b: fpos(b) for b in fbone}
for o in her.values():
    select_only(o)
    mod = next(m for m in o.modifiers if m.type == 'ARMATURE')
    bpy.ops.object.modifier_apply(modifier=mod.name)
log('posed into Voss rest pose')


# ====================================================================== Voss's skeleton on her joints
# His bones keep their directions and rolls (so his clips mean the same turns); each mapped bone's
# head goes to her joint and its length to hers. His bones she has no joint for (the twist
# helpers, the ring and little fingers, the glasses) ride along with their parents.
select_only(rig)
bpy.ops.object.mode_set(mode='EDIT')
eb = rig.data.edit_bones
for e in eb:
    e.use_connect = False
old = {e.name: (e.head.copy(), e.tail.copy(), e.roll) for e in eb}
shift = {}                                          # bone -> (old head, new head, length ratio)


def place(e):
    oh, ot, roll = old[e.name]
    key = base(e.name)
    if key in fjoint and key != 'GLTF_created_0_rootJoint':
        nh = fjoint[key]
        lead = LEADS.get(key, (None,))[0]
        ratio = ((fjoint[lead] - nh).length / (vpos(lead) - vpos(key)).length) if lead in fjoint and lead in vbone else (
            shift[e.parent.name][2] if e.parent else 1.0)
    elif e.parent:
        poh, pnh, pr = shift[e.parent.name]
        nh = pnh + (oh - poh) * pr
        ratio = pr
    else:
        nh, ratio = oh, 1.0
    shift[e.name] = (oh, nh, ratio)
    e.head = nh
    e.tail = nh + (ot - oh) * ratio
    e.roll = roll
    for c in e.children:
        place(c)


for e in [e for e in eb if e.parent is None]:
    place(e)
bpy.ops.object.mode_set(mode='OBJECT')
log('rig moved onto her joints')

# her weights onto his bones
for o in her.values():
    groups = {g.index: g.name for g in o.vertex_groups}
    target = {}
    for gi, gname in groups.items():
        vn = voss_for(gname)
        if vn:
            target[gi] = vn
    weights = {}                                    # (vertex, voss bone) -> weight
    for v in o.data.vertices:
        for g in v.groups:
            if g.weight > 0 and g.group in target:
                k = (v.index, target[g.group])
                weights[k] = weights.get(k, 0) + g.weight
    o.vertex_groups.clear()
    vg = {}
    for (vi, bn), w in weights.items():
        if bn not in vg:
            vg[bn] = o.vertex_groups.new(name=bn)
        vg[bn].add([vi], min(1.0, w), 'REPLACE')
    mw = o.matrix_world.copy()
    o.parent = rig
    o.matrix_world = mw
    mod = o.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
bpy.data.objects.remove(frig)
for o in list(bpy.data.objects):
    if o.type == 'EMPTY':
        bpy.data.objects.remove(o)
log('bound to Voss rig')



# ====================================================================== Angelica's head on her neck
# Angelica is scaled so her head is as tall above her eyes as the old head, her eyes at its eyes'
# height and her nose tip as far forward. Her head leans forward on her neck more than the old one
# did, so below the jaw her neck is brought forward onto the old neck, then cut off inside the
# collar (the bust below it goes; what is left of her shoulders is drawn in to the neck's width).
def centroid(o):
    return sum((o.matrix_world @ v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)


def components(me):
    """Each vertex's connected piece (index), and how many pieces"""
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    comp = np.full(len(bm.verts), -1, int)
    c = 0
    for v in bm.verts:
        if comp[v.index] >= 0:
            continue
        stack = [v]
        comp[v.index] = c
        while stack:
            x = stack.pop()
            for e in x.link_edges:
                y = e.other_vert(x)
                if comp[y.index] < 0:
                    comp[y.index] = c
                    stack.append(y)
        c += 1
    boundary = {v.index for e in bm.edges if e.is_boundary for v in e.verts}
    bm.free()
    return comp, c, boundary


old_head = her.pop('Head')
oco = np.array([old_head.matrix_world @ v.co for v in old_head.data.vertices])
OLD_EYES = [centroid(her.pop('EyeL')), centroid(her.pop('EyeR'))]
for o in [o for o in bpy.data.objects if o.name in ('F_EyeL', 'F_EyeR')]:
    bpy.data.objects.remove(o)
EYE_Z = (OLD_EYES[0].z + OLD_EYES[1].z) / 2
TOP = float(oco[:, 2].max())
NOSE_Y = float(oco[np.abs(oco[:, 0]) < 0.01, 1].min())
CHIN_Z, NECK_Z, NECK_CUT, NECK_FORWARD = EYE_Z - 0.077, EYE_Z - 0.1, EYE_Z - 0.127, 0.035

before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=ANGELICA, merge_vertices=True)
A_PARTS = {'Head_7': 'Head', 'Hair_6': 'Hair', 'EyeScleraReflect_5': 'Eyes', 'Mouth_9': 'Mouth'}
ang = {}
new = [o for o in bpy.data.objects if o not in before]
for o in new:
    part = A_PARTS.get(o.parent.name) if o.type == 'MESH' and o.parent else None
    if part:
        o.data.transform(o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix()
        o.name = o.data.name = 'A_' + part
        ang[part] = o
for o in new:
    if o not in ang.values():
        bpy.data.objects.remove(o)                 # (the empties, her corneas, tear lines and lashes: the lashes are painted on too)

aco = np.array([v.co for v in ang['Head'].data.vertices])
aeye = np.array([v.co for v in ang['Eyes'].data.vertices])
a_eye_z = float(aeye[:, 2].mean())
s = (TOP - EYE_Z) / (float(aco[:, 2].max()) - a_eye_z)
a_nose = float(aco[np.abs(aco[:, 0]) < 0.01 / s, 1].min())
FIT = Matrix.Translation((0, NOSE_Y, EYE_Z)) @ Matrix.Scale(s, 4) @ Matrix.Translation((0, -a_nose, -a_eye_z))
for o in ang.values():
    o.data.transform(FIT)
log(f'Angelica scaled {s:.5f}')

bm = bmesh.new()
bm.from_mesh(ang['Head'].data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < NECK_CUT], context='VERTS')
for v in bm.verts:
    v.co.y -= NECK_FORWARD * smooth(CHIN_Z, NECK_Z, v.co.z)
ring = np.array([v.co for v in bm.verts if abs(v.co.z - NECK_Z) < 0.003])
ncy, nrx, nry = (ring[:, 1].max() + ring[:, 1].min()) / 2, np.ptp(ring[:, 0]) / 2, np.ptp(ring[:, 1]) / 2
for v in bm.verts:
    if v.co.z < NECK_Z:
        e = math.hypot(v.co.x / nrx, (v.co.y - ncy) / nry)
        if e > 1:
            v.co.x /= e
            v.co.y = ncy + (v.co.y - ncy) / e
bm.to_mesh(ang['Head'].data)
bm.free()

# her landmarks, for the morphs
EYES = [Vector(aeye[aeye[:, 0] > 0].mean(0)), Vector(aeye[aeye[:, 0] < 0].mean(0))]
EYES = [FIT @ e for e in EYES]
EYE_X = (abs(EYES[0].x) + abs(EYES[1].x)) / 2
hco = np.array([v.co for v in ang['Head'].data.vertices])
prof = hco[(np.abs(hco[:, 0]) < 0.0015) & (hco[:, 2] < EYE_Z)]
NOSE = Vector(prof[np.argmin(prof[:, 1])])
# the mouth's opening in the face: the boundary ring between the nose and the chin
_, _, hbound = components(ang['Head'].data)
ring = hco[[i for i in hbound if NOSE.z - 0.05 < hco[i, 2] < NOSE.z - 0.015 and abs(hco[i, 0]) < 0.03 and hco[i, 1] < NOSE.y + 0.03]]
mid = ring[np.abs(ring[:, 0]) < 0.01]
MOUTH_Z = float(mid[:, 2].max() + mid[:, 2].min()) / 2
CORNER_X = float(np.abs(ring[:, 0]).max())
LIP_Y = float(hco[(np.abs(hco[:, 0]) < 0.004) & (np.abs(hco[:, 2] - MOUTH_Z) < 0.006), 1].min())
log(f'eyes z {EYE_Z:.4f} x {EYE_X:.4f}  mouth z {MOUTH_Z:.4f} corners {CORNER_X:.4f} lip y {LIP_Y:.4f}  nose {tuple(round(c, 4) for c in NOSE)}')

# ====================================================================== textures
def pixels(img):
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def new_image(name, arr):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=arr.shape[2] == 4 and bool((arr[..., 3] < 1).any()))
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], 2)
    img.pixels.foreach_set(np.clip(arr, 0, 1).ravel())
    img.pack()
    return img


def blur(a, r):
    """Box blur, r pixels each way, twice (close to a gaussian)"""
    if r < 1:
        return a
    for _ in range(2):
        for ax in (0, 1):
            c = np.cumsum(np.pad(a, [(r + 1, r) if i == ax else (0, 0) for i in range(a.ndim)], mode='edge'), axis=ax)
            a = (np.take(c, range(2 * r + 1, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - 2 * r - 1), axis=ax)) / (2 * r + 1)
    return a


def rgb(hex_):
    return np.array([int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)], np.float32)     # (sRGB, as 8-bit images hold it)


def mix(a, b, t):
    t = np.asarray(t, np.float32)[..., None] if np.ndim(t) else t
    return a + (b - a) * t


def lum(c):
    return c[..., 0] * 0.2126 + c[..., 1] * 0.7152 + c[..., 2] * 0.0722


def uv_islands(me):
    """Each loop triangle's UV island (triangles joined where they share a corner in UV space)"""
    me.calc_loop_triangles()
    uv = me.uv_layers['UVMap'].data
    tris = list(me.loop_triangles)
    parent = list(range(len(tris)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    corner = {}
    for ti, t in enumerate(tris):
        for li, vi in zip(t.loops, t.vertices):
            key = (vi, round(uv[li].uv.x, 5), round(uv[li].uv.y, 5))
            if key in corner:
                parent[find(ti)] = find(corner[key])
            else:
                corner[key] = ti
    return np.array([find(i) for i in range(len(tris))])


def raster(objs, size, islands=False):
    """Where each texel of a shared texture lies on the meshes: its 3D point, which object, which
    vertex's piece (by the nearest corner), and (islands=True) the triangle's UV island"""
    H = W = size
    pos = np.zeros((H, W, 3), np.float32)
    owner = np.full((H, W), -1, np.int16)
    piece = np.zeros((H, W), np.int16)
    isl = np.full((H, W), -1, np.int32)
    for oi, (o, vlabel) in enumerate(objs):
        me = o.data
        tri_isl = uv_islands(me) if islands else None
        me.calc_loop_triangles()
        uv = me.uv_layers['UVMap'].data
        M = o.matrix_world
        co = [M @ v.co for v in me.vertices]
        for ti, t in enumerate(me.loop_triangles):
            T = np.array([uv[li].uv for li in t.loops], np.float64) * [W, H] - 0.5
            P = np.array([co[vi] for vi in t.vertices])
            x0, y0 = np.floor(T.min(0)).astype(int)
            x1, y1 = np.ceil(T.max(0)).astype(int)
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W - 1), min(y1, H - 1)
            if x1 < x0 or y1 < y0:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
            (ax, ay), (bx, by), (cx, cy) = T
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-9:
                continue
            l0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
            l1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
            l2 = 1 - l0 - l1
            inside = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
            if not inside.any():
                continue
            L = np.stack([l0, l1, l2], -1)[inside]
            yy, xx = ys[inside], xs[inside]
            pos[yy, xx] = L @ P
            owner[yy, xx] = oi
            piece[yy, xx] = np.array([vlabel[vi] for vi in t.vertices])[np.argmax(L, 1)]
            if islands:
                isl[yy, xx] = tri_isl[ti]
    return (pos, owner, piece, isl) if islands else (pos, owner, piece)


def dilate(img, filled, n=6):
    """Grow the painted texels outward a few pixels, so seams never sample unpainted ground"""
    img, filled = img.copy(), filled.copy()
    for _ in range(n):
        acc = np.zeros_like(img)
        cnt = np.zeros(filled.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(np.roll(img * filled[..., None], dy, 0), dx, 1)
            cnt += np.roll(np.roll(filled.astype(np.float32), dy, 0), dx, 1)
        grow = (~filled) & (cnt > 0)
        img[grow] = acc[grow] / cnt[grow][:, None]
        filled = filled | grow
    return img


def base_image(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and any(l.to_socket.name == 'Base Color' for l in n.outputs['Color'].links):
            return n.image
    return None


def plain_material(name, img=None, color=(1, 1, 1, 1), alpha=None, rough=0.7, vcol=False):
    """A material with only a base colour (map, or the per-vertex colours 'Col'), as the game's
    toon shading reads it"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = rough
    if img:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if alpha == 'map':
            nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    if vcol:
        col = nt.nodes.new('ShaderNodeVertexColor')
        col.layer_name = 'Col'
        nt.links.new(col.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha is not None and alpha != 'map':
        bsdf.inputs['Alpha'].default_value = alpha
    if alpha is not None:
        m.surface_render_method = 'BLENDED' if alpha != 'map' else 'DITHERED'
    return m


# ---------------------------------------------------------------- Angelica's skin: her scalp and brows go red
# Her texture keeps its face; only the dark brown painted under her hair, and her brows, take
# Kessler's red (each texel's shade kept). Her eyes, nostrils and lips are left alone.
HAIR_DARK, HAIR, HAIR_LIGHT = rgb('#5A1A10'), rgb('#A3341A'), rgb('#D2602F')
BROW_DARK, BROW = rgb('#3E160E'), rgb('#7A3020')
TEETH, GUMS, THROAT = rgb('#EEE8DA'), rgb('#9A4650'), rgb('#3A141B')
head = ang['Head']
a_img = base_image(head.data.materials[0])
aorig = pixels(a_img)[..., :3]
S = a_img.size[0]
pos, owner, _ = raster([(head, np.zeros(len(head.data.vertices), int))], S)
filled = owner >= 0
x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
L = lum(blur(aorig, 1))
EYE_Y = (EYES[0].y + EYES[1].y) / 2
keep = np.zeros((S, S), bool)
for e in EYES:
    keep |= (((x - e.x) / 0.017) ** 2 + ((z - e.z) / 0.0105) ** 2 < 1) & (y < EYE_Y + 0.01)
keep |= (np.hypot(x - NOSE.x, z - (NOSE.z - 0.006)) < 0.014) & (y < NOSE.y + 0.025)          # nostrils
keep |= (np.abs(x) < 0.03) & (np.abs(z - MOUTH_Z) < 0.012) & (y < NOSE.y + 0.03)             # lips
hairy = np.clip((0.3 - L) / 0.1, 0, 1) * filled * ~keep
browzone = (z > EYE_Z + 0.004) & (z < EYE_Z + 0.03) & (np.abs(x) > 0.004) & (np.abs(x) < 0.06) & (y < EYE_Y + 0.006)
browy = np.clip((0.5 - L) / 0.12, 0, 1) * filled * browzone * ~keep
hairy = dilate(hairy[..., None], filled)[..., 0]
browy = dilate(browy[..., None], filled)[..., 0]
red = mix(HAIR_DARK, HAIR_LIGHT, np.clip(L / 0.32, 0, 1) ** 0.8)
brow = mix(BROW_DARK, BROW, np.clip(L / 0.5, 0, 1))
skin_img = mix(mix(aorig, red, hairy), brow, browy * (1 - hairy))
head_img = new_image('K_Head_albedo', skin_img)
# her skin tone (her cheeks), for the hands
cheeks = filled & (np.abs(np.abs(x) - 0.035) < 0.01) & (np.abs(z - (EYE_Z - 0.022)) < 0.007) & (y < EYE_Y)
SKIN = np.median(aorig[cheeks], 0) if cheeks.any() else rgb('#E8C2A8')
SKIN_SHADE = SKIN * 0.86
log('skin', np.round(SKIN, 3))

# ---------------------------------------------------------------- eyes: her own, the irises green
e_img = base_image(ang['Eyes'].data.materials[0])
eorig = pixels(e_img)[..., :3]
E = e_img.size[0]
yy, xx = np.mgrid[0:E, 0:E] + 0.5
r = np.hypot(xx - E / 2, yy - E / 2) / E
iris = np.clip((0.15 - r) / 0.01, 0, 1) * np.clip((r - 0.08) / 0.01, 0, 1)
el = lum(eorig)
irisl = el / max(1e-4, float(np.median(el[iris > 0.5])))
green = mix(rgb('#2F5E34'), rgb('#7FA65A'), np.clip(1 - (r - 0.08) / 0.07, 0, 1) * 0.7) * np.clip(irisl, 0.5, 1.4)[..., None]
eye_img = new_image('K_Eye_albedo', mix(eorig, green, iris * 0.92))

# ---------------------------------------------------------------- hands (Base_F_D, which they shared with the old head)
# Her skin tone, with only the broad shading of the old drawing kept
hands = her['Hands']
for d in hands.data.uv_layers['UVMap'].data:      # (they sit a tile below the texture, wrapping round)
    d.uv = (d.uv.x - math.floor(d.uv.x), d.uv.y - math.floor(d.uv.y))
old_head_img = base_image(hands.data.materials[0])
orig = pixels(old_head_img)[..., :3]
HS = old_head_img.size[0]
hpos, howner, _ = raster([(hands, np.zeros(len(hands.data.vertices), int))], HS)
hfill = howner >= 0
handl = lum(blur(orig, 2))
hand_med = float(np.median(handl[hfill])) if hfill.any() else 1
hand = mix(SKIN, SKIN_SHADE, 0.15)[None, None] * np.clip(1 + 0.6 * (handl / hand_med - 1), 0.75, 1.12)[..., None]
hand = dilate(np.where(hfill[..., None], hand, 0), hfill)
hands_img = new_image('K_Hands_albedo', hand)

# ---------------------------------------------------------------- clothes (SciFem_Bdy_D: coat, shirt, tie, trousers, belt, shoes)
# Each UV island is one cloth (by the hue most of it has in the photo: the coat's shadows are grey,
# not blue), painted in her colours with only the broad folds kept, the way Voss's clothes are
# painted. Only the near-black inside an island (the belt on the trousers, the soles) keeps its own.
body = her['Body']
old_body_img = base_image(body.data.materials[0])
borig = pixels(old_body_img)[..., :3]
BS = old_body_img.size[0]
bpos, bown, _, bisl = raster([(body, np.zeros(len(body.data.vertices), int))], BS, islands=True)
bfill = bown >= 0
CLOTH = {   # name: (the photo's colour, hers)
    'coat': ('#CBD7D4', '#EDEFEF'),
    'shirt': ('#7891AA', '#3C4A5C'),
    'tie': ('#962A22', '#7A1E22'),
    'trousers': ('#7D784B', '#30333A'),
    'shoe': ('#4B231E', '#1F1C1E'),
    'black': ('#1A1A1E', '#141416'),
}
names = list(CLOTH)
BLACK = names.index('black')
ref = np.array([rgb(CLOTH[n][0]) for n in names])
mine = np.array([rgb(CLOTH[n][1]) for n in names])
bsoft = blur(borig, 2)
chroma = lambda c: c / (c.sum(-1, keepdims=True) + 1e-4)
dist = ((chroma(bsoft)[..., None, :] - chroma(ref)[None, None]) ** 2).sum(-1)
dist[..., BLACK] = np.inf
cls = np.argmin(dist, -1)
L = lum(blur(borig, 1))
dark = lum(bsoft) < 0.12
for i in np.unique(bisl[bfill]):
    m = bisl == i
    counts = np.bincount(cls[m & ~dark], minlength=len(names))
    main = int(np.argmax(counts)) if counts.any() else BLACK
    cls[m] = main
    if main == names.index('shoe'):
        cls[m & (lum(bsoft) < 0.07)] = BLACK         # the soles
    elif (dark & m).sum() > 0.03 * m.sum():
        cls[m & dark] = BLACK                        # the belt
feet = bfill & (bpos[..., 2] < 0.1) & (cls != BLACK)
cls[feet] = names.index('shoe')                      # (everything below the ankle is shoe, whatever its island)
bout = np.zeros_like(borig)
for k in range(len(names)):
    m = (cls == k) & bfill
    if not m.any():
        continue
    med = float(np.median(L[m])) or 1e-4
    shade = np.clip(1 + 0.7 * (L / med - 1), 0.55, 1.35)
    bout = np.where(m[..., None], mine[k][None, None] * shade[..., None], bout)
bout = dilate(bout, bfill)
body_img = new_image('K_Clothes_albedo', bout)


# ---------------------------------------------------------------- materials
eye_mat = plain_material('M_Eye', eye_img, rough=0.2)
ang['Eyes'].data.materials.clear()
ang['Eyes'].data.materials.append(eye_mat)
head.data.materials.clear()
head.data.materials.append(plain_material('M_Head', head_img))
ang['Mouth'].data.materials.clear()
ang['Mouth'].data.materials.append(plain_material('M_MouthInner', vcol=True))
hands.data.materials.clear()
hands.data.materials.append(plain_material('M_Hands', hands_img))
body.data.materials.clear()
body.data.materials.append(plain_material('M_Clothes', body_img))
her['Frame'].data.materials.clear()
her['Frame'].data.materials.append(plain_material('M_GlassesFrame', color=(0.035, 0.037, 0.042, 1), rough=0.35))
her['Lens'].data.materials.clear()
her['Lens'].data.materials.append(plain_material('M_GlassesLens', color=(0.012, 0.016, 0.022, 1), alpha=0.85, rough=0.1))
log('painted')


# ====================================================================== thinning
# The source is far denser than anything else in the game (the hair alone is 57k vertices); a
# fraction of it keeps the shapes at the distances she is seen from
def decimate(o, ratio):
    select_only(o)
    mod = o.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=mod.name)


for part, ratio in (('Head', 0.3), ('Mouth', 0.3), ('Hair', 0.15)):
    n = len(ang[part].data.vertices)
    decimate(ang[part], ratio)
    log(f'{part}: {n} -> {len(ang[part].data.vertices)} vertices')


def set_colours(o, cols):
    """Per-vertex colours (sRGB) in the layer the materials read ('Col')"""
    a = o.data.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    a.data.foreach_set('color_srgb', np.concatenate([cols, np.ones((len(cols), 1), np.float32)], 1).ravel())


# inside the mouth: white teeth at the front, rose behind them, darker toward the throat
mco = np.array([v.co for v in ang['Mouth'].data.vertices])
depth = mco[:, 1] - float(mco[:, 1].min())
mcol = np.where(((depth < 0.005) & (np.abs(mco[:, 2] - MOUTH_Z) < 0.009))[:, None], TEETH[None],
                mix(GUMS, THROAT, np.clip((depth - 0.004) / 0.02, 0, 1) ** 0.7))
set_colours(ang['Mouth'], mcol)
set_colours(ang['Head'], np.ones((len(ang['Head'].data.vertices), 3), np.float32))   # (white: it only matters inside the mouth)


def join(objs, name):
    select_only(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


head = join([ang['Head'], ang['Mouth']], 'K_Head')
hm = head.data


# ====================================================================== skinned as the old head was
# Each vertex takes the weights of the old head's nearest vertices (from the old neck's down to
# the head's own), then the old head goes
from mathutils.kdtree import KDTree


def bind_like(o, src, src_co, k=4):
    kd = KDTree(len(src_co))
    for i, p in enumerate(src_co):
        kd.insert(Vector(p), i)
    kd.balance()
    names = {g.index: g.name for g in src.vertex_groups}
    sw = [{names[g.group]: g.weight for g in v.groups} for v in src.data.vertices]
    groups = {}
    M = o.matrix_world
    for v in o.data.vertices:
        acc = {}
        for _, i, d in kd.find_n(M @ v.co, k):
            for bn, w in sw[i].items():
                acc[bn] = acc.get(bn, 0) + w / (d + 1e-4)
        total = sum(acc.values()) or 1
        for bn, w in acc.items():
            if bn not in groups:
                groups[bn] = o.vertex_groups.new(name=bn)
            groups[bn].add([v.index], w / total, 'REPLACE')
    o.parent = rig
    o.matrix_world = Matrix()
    o.modifiers.new('Armature', 'ARMATURE').object = rig


bind_like(head, old_head, oco)
bind_like(ang['Eyes'], old_head, oco)
bpy.data.objects.remove(old_head)
log('head bound')


# ====================================================================== Voss's face morphs on hers
# Her face lies over his once it is lifted by the difference in eye height and its width matched
# (by the eyes up top, by the mouth's corners lower down). Each of her vertices takes the motion of
# the point of his face it lands on, scaled back to her width. Her lips touch, so near the mouth
# each lip looks a little above (or below) itself, to land on the same lip of his.
V_EYE_Z, V_EYE_X, V_MOUTH_Z, V_CORNER_X, V_NOSE_Y = 1.300, 0.0225, 1.2445, 0.021, -0.079   # (build_voss_face.py)


def to_voss(p):
    t = smooth(MOUTH_Z, EYE_Z, p.z)
    dz = (V_MOUTH_Z - MOUTH_Z) * (1 - t) + (V_EYE_Z - EYE_Z) * t
    sx = (V_CORNER_X / CORNER_X) * (1 - t) + (V_EYE_X / EYE_X) * t
    return Vector((p.x * sx, p.y + (V_NOSE_Y - NOSE.y), p.z + dz)), sx


vm = vhead.data
vm.calc_loop_triangles()
VM = vhead.matrix_world
vbasis = [VM @ v.co for v in vm.vertices]
vtris = [tuple(t.vertices) for t in vm.loop_triangles]
# only his skin (the biggest piece once welded): his eyeballs, lashes and teeth are pieces of their
# own, and her lids would otherwise land on his eyeballs, which never move
bmv = bmesh.new()
bmv.from_mesh(vm)
bmesh.ops.remove_doubles(bmv, verts=bmv.verts, dist=1e-6)
welded = bpy.data.meshes.new('V_Welded')
bmv.to_mesh(welded)
bmv.free()
wcomp, _, _ = components(welded)
main = np.bincount(wcomp).argmax()
skin_at = {tuple(np.round(v.co, 6)) for v in welded.vertices if wcomp[v.index] == main}
bpy.data.meshes.remove(welded)
vtris = [t for t in vtris if all(tuple(np.round(vm.vertices[j].co, 6)) in skin_at for j in t)]
vbvh = BVHTree.FromPolygons(vbasis, vtris)
vkeys = vm.shape_keys.key_blocks
morphs = [k.name for k in vkeys[1:]]
vdelta = {k: np.array([VM.to_3x3() @ (a.co - b.co) for a, b in zip(vkeys[k].data, vkeys[0].data)]) for k in morphs}

head.shape_key_add(name='Basis', from_mix=False)
hkeys = {k: head.shape_key_add(name=k, from_mix=False) for k in morphs}
for k in hkeys.values():
    k.value = 0.0                   # (new keys start fully on; the export carries these as her resting weights)
for v in hm.vertices:
    q, sx = to_voss(Vector(v.co))
    q.z += math.copysign(0.002, v.co.z - MOUTH_Z) * gauss(v.co.x / (CORNER_X * 1.3), (v.co.z - MOUTH_Z) / 0.008)
    loc, nrm, ti, dist = vbvh.find_nearest(q)
    if loc is None or dist > 0.02:
        continue
    fade = smooth(0.02, 0.01, dist)
    a, b, c = (Vector(vbasis[j]) for j in vtris[ti])
    # barycentric weights of loc in the triangle
    v0, v1, v2 = b - a, c - a, loc - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01 or 1e-12
    wb = (d11 * d20 - d01 * d21) / den
    wc = (d00 * d21 - d01 * d20) / den
    w = np.array([1 - wb - wc, wb, wc])
    for k in morphs:
        dd = (vdelta[k][list(vtris[ti])] * w[:, None]).sum(0) * fade
        if not dd.any():
            continue
        hkeys[k].data[v.index].co = v.co + Vector((dd[0] / sx, dd[1], dd[2]))
bpy.data.objects.remove(vhead)
log('morphs', morphs)


# ====================================================================== hair: Angelica's, red
# Coloured per vertex: each lock its own shade of red, darker deep in the hair (near her head)
# and toward the roots, lighter on the outside and at the ends. Bound to her head: it is
# shoulder length, so it turns with her head.
hair = ang['Hair']
hme = hair.data
while hme.uv_layers:
    hme.uv_layers.remove(hme.uv_layers[0])
rng = np.random.default_rng(7)
skull = BVHTree.FromPolygons([v.co for v in hm.vertices], [tuple(p.vertices) for p in hm.polygons])
hcomp, nlocks, _ = components(hme)
lock = rng.uniform(0, 1, nlocks)[hcomp]
hpts = np.array([v.co for v in hme.vertices])
deep = np.array([skull.find_nearest(Vector(p))[3] or 0.03 for p in hpts])
out_ = np.clip(deep / 0.025, 0, 1)
fall = np.clip((EYE_Z + 0.08 - hpts[:, 2]) / 0.2, 0, 1)
t = np.clip(0.25 + 0.45 * out_ + 0.2 * fall + 0.25 * (lock - 0.5), 0, 1)
hcol = np.where((t < 0.5)[:, None], mix(HAIR_DARK, HAIR, t / 0.5), mix(HAIR, HAIR_LIGHT, (t - 0.5) / 0.5))
set_colours(hair, hcol)
hme.materials.clear()
hme.materials.append(plain_material('M_Hair', vcol=True, rough=0.6))
hg = hair.vertex_groups.new(name=vbone[B + 'Head1'])
hg.add(list(range(len(hme.vertices))), 1.0, 'REPLACE')
hair.parent = rig
hair.matrix_world = Matrix()
hair.modifiers.new('Armature', 'ARMATURE').object = rig
log('hair', len(hme.vertices), 'verts', nlocks, 'locks')


# ====================================================================== names, tidy, export
head.name = 'Head'
hair.name = 'Hair'
ang['Eyes'].name = 'Eyes'
hands.name = 'Hands'
body.name = 'Body'
join([her['Frame'], her['Lens']], 'Glasses')
for o in rig.children:
    if o.type != 'MESH':
        continue
    o.data.name = o.name
    for u in [u for u in o.data.uv_layers if u.name != 'UVMap']:
        o.data.uv_layers.remove(u)
    for p in o.data.polygons:
        p.use_smooth = True
for img in [i for i in bpy.data.images if i.users == 0 or i in (old_head_img, old_body_img)]:
    bpy.data.images.remove(img)
bpy.data.orphans_purge(do_recursive=True)
for img in bpy.data.images:                         # (1024 is plenty at the sizes she is seen at)
    if max(img.size) > 1024:
        img.scale(*(max(1, d * 1024 // max(img.size)) for d in img.size))
for o in rig.children:                              # (the names the game looks for)
    for m in o.data.materials:
        m.name = m.name.split('.')[0]
    o.data.name = o.name
rig.name = 'Kessler_Rig'
rig.data.pose_position = 'POSE'

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    for img in (head_img, body_img, hands_img, eye_img):
        img.save(filepath=os.path.join(PREVIEW, img.name + '.png'))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PREVIEW, 'kessler_check.blend'))

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in rig.children:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='ACTIONS', export_morph=True,
    export_morph_normal=False, export_skins=True, export_yup=True, export_apply=False,
    export_image_format='JPEG', export_image_quality=85)        # (no texture of hers needs alpha)
log('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
