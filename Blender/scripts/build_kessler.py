"""
Dr. Elena Kessler, for the flashback in her room (scene 2.8) and anywhere else she appears.

Built in Blender from the six reference images in reference/kessler/ (with blond hair instead of
black): about 40, tall and slender, a calm stern face with a small mole on her right cheek beside
the nose, swept-back hair (short at the sides, tucked behind the ear, a few loose strands framing
her face), a small white hook earpiece over her right ear, and an all-white outfit: a long fitted
high-collar coat (mandarin collar, a strap and buckle across the upper chest, a centre seam, princess
seams) with a front slit and a longer flared back, quilted sleeves with zipped cuffs, fitted
trousers, and knee-high ribbed boots with chunky soles.

Her body and head start from Blender Foundation's Human Base Meshes (CC0, "Body Female - Realistic",
see CREDITS.md); everything she wears, her hair, her face's colours and rig are made here.

Her skeleton is Voss's (same bone names and the same bone orientations, moved to her joints), so his
clips play on her; the ones she needs are copied into her file (Idle, Walk) next to her own
(Reach: the shutdown lever). Her face has the same morph targets as Voss's (FaceRig drives both).

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_kessler.py -- \\
      [Blender/kessler.blend] [public/assets/models/kessler.glb] [preview_dir]
then compress:  node scripts/optimize-models.mjs kessler.glb

Needs Blender/assets/human-base-meshes/human_base_meshes_bundle.blend (Human Base Meshes v1.4.1,
https://www.blender.org/download/demo-files/ , not in git).

Units: Voss's model units (his glb is 1.394 tall and scaled to 1.8 m in the game, x1.291); she is
1.72 m in the game, so 1.332 here. Z up, facing -y (the glTF exporter turns it to y up, facing +z).
"""
import sys, os, math, random
import bpy, bmesh
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT_BLEND = argv[0] if len(argv) > 0 and argv[0] else os.path.join(ROOT, 'Blender', 'kessler.blend')
OUT_GLB = argv[1] if len(argv) > 1 and argv[1] else os.path.join(ROOT, 'public', 'assets', 'models', 'kessler.glb')
PREVIEW = argv[2] if len(argv) > 2 else None
STAGE = os.environ.get('KESSLER_STAGE', 'all')       # 'rig' stops after rigging (for checking)
VOSS_GLB = os.path.join(ROOT, 'public', 'assets', 'models', 'human_scientist.glb')
HBM = os.path.join(ROOT, 'Blender', 'assets', 'human-base-meshes', 'human_base_meshes_bundle.blend')

VOSS_H = 1.394
HEIGHT = 1.332
S = HEIGHT / VOSS_H                     # her size against Voss's
B = 'ValveBiped.Bip01_'

rad = math.radians
smooth = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(min(1.0, max(0.0, (x - a) / (b - a))))


def log(*a):
    print('[kessler]', *a)


def select_only(*objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def world_verts(o):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    return [ev.matrix_world @ v.co for v in ev.data.vertices]


# ====================================================================== 1. Voss's rig and clips
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 24
bpy.ops.import_scene.gltf(filepath=VOSS_GLB)
vrig = bpy.data.objects['Scientist_Rig']
vrig.data.pose_position = 'REST'
VJ = {b.name: (vrig.matrix_world @ b.head_local, vrig.matrix_world @ b.tail_local) for b in vrig.data.bones}
vossHands = world_verts(bpy.data.objects['Hands'])
for o in list(bpy.data.objects):
    if o.type == 'MESH':
        bpy.data.objects.remove(o)
for a in list(bpy.data.actions):
    if a.name not in ('Idle', 'Walk'):
        bpy.data.actions.remove(a)

# ====================================================================== 2. her base body
with bpy.data.libraries.load(HBM) as (src, dst):
    dst.objects = [n for n in src.objects if n.startswith('GEO-body_female_realistic')]
for o in dst.objects:
    bpy.context.scene.collection.objects.link(o)
body = bpy.data.objects['GEO-body_female_realistic']
eyes = [o for o in dst.objects if '.eye.' in o.name]
for o in [body] + eyes:
    o.hide_render = o.hide_viewport = False
    o.hide_set(False)
# the base level (for the clothes) and one subdivision (for the skin that shows: face, neck, hands)
body.modifiers[0].levels = 0
body_lo = body.copy()
body_lo.data = body.data.copy()
body_lo.name = 'K_BodyLo'
bpy.context.scene.collection.objects.link(body_lo)
select_only(body_lo)
bpy.ops.object.modifier_apply(modifier=body_lo.modifiers[0].name)
body.modifiers[0].levels = 1
select_only(body)
bpy.ops.object.modifier_apply(modifier=body.modifiers[0].name)
body.name = 'K_Skin'
for o in eyes:
    # free of the body (keeping their place), so the same move can be applied to them below
    w = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = w

# stand her at the origin, feet on the floor, at her height, facing -y like Voss
pts = world_verts(body)
lo = Vector([min(p[i] for p in pts) for i in range(3)])
hi = Vector([max(p[i] for p in pts) for i in range(3)])
k = HEIGHT / (hi.z - lo.z)
M = Matrix.Translation((0, 0, 0)) @ Matrix.Scale(k, 4) @ Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))
for o in [body, body_lo] + eyes:
    o.matrix_world = M @ o.matrix_world
    select_only(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
log('height', HEIGHT, 'scale', round(k, 4), 'eyes at', [[round(c, 3) for c in o.matrix_world @ (sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices))] for o in eyes])


# ====================================================================== 3. her arms raised to Voss's rest angle
def side_slice(pts, z, sgn, dz=0.012):
    """the points of one side (sgn: +1 her left, +x) within dz of height z"""
    return [p for p in pts if abs(p.z - z) < dz and p.x * sgn > 0]


def shoulder_of(pts, sgn):
    """the shoulder joint: at Voss's shoulder height (0.8 of the height), a deltoid in from the
    outside of the shoulder, halfway through it front to back"""
    z = HEIGHT * 0.80
    sl = side_slice(pts, z, sgn, 0.008)
    xo = max(abs(p.x) for p in sl)
    ys = [p.y for p in sl if abs(p.x) > xo - 0.025]
    return Vector((sgn * (xo - 0.042), (min(ys) + max(ys)) / 2, z))


def fingertip_of(pts, sgn):
    """the arms hang out from the body: the outermost point at hand height is on the hand; its
    lowest neighbour is the fingertip"""
    band = [p for p in pts if p.x * sgn > 0 and HEIGHT * 0.3 < p.z < HEIGHT * 0.6]
    out = max(band, key=lambda p: abs(p.x))
    return min((p for p in band if (p - out).length < 0.1), key=lambda p: p.z)


def arm_region(obj, sh, tip):
    """vertex -> how much of the arm it is (0..1): the whole arm and hand below a cut just under the
    armpit (found by flooding the mesh from the fingertip; the cut is moved down until the flood no
    longer leaks into the torso), blending to 0 over the shoulder above it"""
    me = obj.data
    V = [v.co.copy() for v in me.vertices]
    nb = [[] for _ in V]
    for e in me.edges:
        a, b = e.vertices
        nb[a].append(b)
        nb[b].append(a)
    d = (tip - sh).normalized()
    along = [(p - sh).dot(d) for p in V]
    start = min(range(len(V)), key=lambda i: (V[i] - tip).length)
    for cut in [0.05 + 0.01 * k for k in range(15)]:
        seen = {start}
        stack = [start]
        while stack:
            i = stack.pop()
            for j in nb[i]:
                if j not in seen and along[j] > cut:
                    seen.add(j)
                    stack.append(j)
        if len(seen) < len(V) * 0.12:
            break
    w = {i: 1.0 for i in seen}
    # the blend above the cut: the arm's own vertices up to the shoulder, by how far along they are
    ring = set(seen)
    frontier = list(seen)
    while frontier:
        nxt = []
        for i in frontier:
            for j in nb[i]:
                if j not in ring and cut - 0.09 < along[j] <= cut:
                    ring.add(j)
                    nxt.append(j)
                    w[j] = smooth(cut - 0.09, cut, along[j])
        frontier = nxt
    log('arm region', len(seen), 'verts below the cut at', round(cut, 2), 'and', len(ring) - len(seen), 'blending over the shoulder')
    return w


def pose_arms_to_voss(lo, his):
    """turn each arm about its shoulder in the front plane so it hangs at Voss's angle (worked out
    on the base-level body `lo`; the finer bodies in `his` follow their nearest base vertex)"""
    from mathutils.kdtree import KDTree
    kd = KDTree(len(lo.data.vertices))
    for v in lo.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    nearest = {o: [kd.find(v.co)[1] for v in o.data.vertices] for o in his}
    pts = [v.co.copy() for v in lo.data.vertices]
    for sgn, side in ((1, 'L'), (-1, 'R')):
        sh = shoulder_of(pts, sgn)
        tip = fingertip_of(pts, sgn)
        her = math.atan2(sh.z - tip.z, abs(tip.x - sh.x))
        vs = VJ[B + side + '_UpperArm_' + ('28' if side == 'L' else '49')][0]
        vh = VJ[B + side + '_Hand_' + ('24' if side == 'L' else '45')][0]
        voss = math.atan2(vs.z - vh.z, abs(vh.x - vs.x))
        log('arm', side, 'hers', round(math.degrees(her), 1), 'Voss', round(math.degrees(voss), 1))
        R = Matrix.Translation(sh) @ Matrix.Rotation(her - voss, 4, Vector((0, -sgn, 0))) @ Matrix.Translation(-sh)
        w = arm_region(lo, sh, tip)
        L = (tip - sh).length
        for o in [lo] + list(his):
            t = ARM_T.setdefault(o.name, [-1.0] * len(o.data.vertices))
            for v in o.data.vertices:
                i = v.index if o is lo else nearest[o][v.index]
                k = w.get(i, 0.0)
                if k > 0:
                    if k > 0.99:
                        t[v.index] = (v.co - sh).dot(tip - sh) / (L * L)   # how far down the arm (1: fingertip)
                    v.co = v.co.lerp(R @ v.co, k)
            o.data.update()
        ARMS[side] = (sh, R @ tip)


ARM_T = {}       # object name -> per vertex: how far down the arm (0 shoulder .. 1 fingertip), -1 off it
ARMS = {}        # 'L'/'R' -> (shoulder joint, fingertip)
pose_arms_to_voss(body_lo, [body])
pts = world_verts(body_lo)

# ====================================================================== 4. her skeleton: Voss's, moved to her joints
def slice_box(pts, z, cond, dz=0.012):
    sl = [p for p in pts if abs(p.z - z) < dz and cond(p)]
    if not sl:
        return None
    return (Vector([min(p[i] for p in sl) for i in range(3)]), Vector([max(p[i] for p in sl) for i in range(3)]))


def in_box(P, box_from, box_to):
    """P's place inside one slice box, carried to the same place in another"""
    (a0, a1), (b0, b1) = box_from, box_to
    out = Vector()
    for i in range(3):
        t = (P[i] - a0[i]) / (a1[i] - a0[i]) if a1[i] - a0[i] > 1e-6 else 0.5
        out[i] = b0[i] + t * (b1[i] - b0[i])
    return out


# Voss's body, as the same slices: his bare body is not in the file, so his rest-pose meshes
# (coat and all) stand in; only places within a slice are carried over, so the bulk cancels out
bpy.ops.import_scene.gltf(filepath=VOSS_GLB)
vmeshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.split('.')[0] in ('Coat_Torso', 'Pants', 'Head', 'Shirt', 'Sleeves', 'Hands')]
vr2 = [o for o in bpy.data.objects if o.type == 'ARMATURE' and o is not vrig][0]
vr2.data.pose_position = 'REST'
vpts = [p for o in vmeshes for p in world_verts(o)]
for o in list(bpy.data.objects):
    if o.type in ('MESH', 'EMPTY') and o not in (body, body_lo) + tuple(eyes) or o is vr2:
        bpy.data.objects.remove(o)
for a in list(bpy.data.actions):
    if a.name not in ('Idle', 'Walk'):
        bpy.data.actions.remove(a)

target = {}
centre = lambda p: abs(p.x) < 0.11
for name in ('Pelvis_65', 'Spine_54', 'Spine1_53', 'Spine2_52', 'Spine4_51', 'Neck1_6', 'Head1_4'):
    P = VJ[B + name][0]
    zk = P.z * S
    bv, bk = slice_box(vpts, P.z, centre), slice_box(pts, zk, centre)
    q = in_box(P, bv, bk)
    target[B + name] = Vector((0, q.y, zk))
for side, sgn in (('L', 1), ('R', -1)):
    for name in ('Thigh', 'Calf', 'Foot', 'Toe0'):
        full = [n for n in VJ if n.startswith(B + side + '_' + name + '_')][0]
        P = VJ[full][0]
        zk = max(0.004, P.z * S)
        leg = lambda p, s=sgn: p.x * s > 0.004
        bv, bk = slice_box(vpts, P.z, leg, 0.015), slice_box(pts, zk, leg, 0.015)
        target[full] = in_box(P, bv, bk) if bv and bk else P * S
        target[full].z = zk
    # the clavicle starts at the top of the chest; the arm hangs from the shoulder
    cl = [n for n in VJ if n.startswith(B + side + '_Clavicle_')][0]
    P = VJ[cl][0]
    bv, bk = slice_box(vpts, P.z, centre), slice_box(pts, P.z * S, centre)
    target[cl] = in_box(P, bv, bk)
    target[cl].z = P.z * S
    ua = [n for n in VJ if n.startswith(B + side + '_UpperArm_')][0]
    sh = shoulder_of(pts, sgn)
    vs = VJ[ua][0]
    vtip = max((p for p in vossHands if p.x * sgn > 0), key=lambda p: (p - vs).length)
    ktip = fingertip_of(pts, sgn)
    arm_k = (ktip - sh).length / (vtip - vs).length
    target[ua] = sh
    for n in VJ:
        b = vrig.data.bones[n]
        # everything down the arm keeps its place along it, scaled to her arm
        chain = b
        while chain and chain.name != ua:
            chain = chain.parent
        if chain and n != ua:
            target[n] = sh + (VJ[n][0] - vs) * arm_k
    log('arm', side, 'scale', round(arm_k, 3))

krig = vrig
krig.name = 'Kessler_Rig'
krig.data.name = 'Kessler_Rig'
select_only(krig)
bpy.ops.object.mode_set(mode='EDIT')
eb = krig.data.edit_bones
for b in eb:
    b.use_connect = False                 # (so moving a bone never drags its parent's tail)
moved = {}
order = []
def walk(b):
    order.append(b)
    for c in b.children:
        walk(c)
for b in eb:
    if b.parent is None:
        walk(b)
inv = krig.matrix_world.inverted()
for b in order:
    old_h = VJ[b.name][0]
    if b.name in target:
        new_h = target[b.name]
    elif b.parent is not None and b.parent.name in moved:
        ph_old = VJ[b.parent.name][0]
        new_h = moved[b.parent.name] + (old_h - ph_old) * S
    else:
        new_h = old_h * S
    moved[b.name] = new_h
for b in order:
    d = inv @ moved[b.name] - b.head
    roll = b.roll
    b.head += d
    b.tail += d
    b.roll = roll
bpy.ops.object.mode_set(mode='OBJECT')
for b in krig.data.bones:
    # the hands bend at the wrist; fingers, glasses and the twist helpers stay out of her skin
    b.use_deform = not any(k in b.name for k in ('Finger', 'pinky', 'ring', 'Glasses', 'forward', 'Ulna', 'Bicep', 'Quadricep', 'rootJoint'))

# Voss's clips on her: rotations as they are; positions only for the pelvis and root, scaled
def fcurves(action):
    try:
        return list(action.fcurves)
    except Exception:
        return [fc for l in action.layers for s in l.strips for cb in s.channelbags for fc in cb.fcurves]


def channelbags(action):
    return [cb for l in action.layers for s in l.strips for cb in s.channelbags]


for a in bpy.data.actions:
    for cb in channelbags(a):
        for fc in list(cb.fcurves):
            if fc.data_path.endswith('.location') or fc.data_path.endswith('.scale'):
                bone = fc.data_path.split('"')[1]
                if fc.data_path.endswith('.scale') or not any(k in bone for k in ('Pelvis', 'rootJoint')):
                    cb.fcurves.remove(fc)
                    continue
                for kp in fc.keyframe_points:
                    kp.co.y *= S
                    kp.handle_left.y *= S
                    kp.handle_right.y *= S

# ====================================================================== 5. skinning
# Voss's bones point backwards out of the joints (as his glb has them), not along the limbs, and
# Blender's automatic weights measure the distance to each bone, so the weights are worked out on a
# stand-in skeleton with the same names whose bones run joint to joint; her meshes then follow the
# real skeleton (the vertex groups are matched by name).
DEFORM = [b.name for b in krig.data.bones if b.use_deform]


def deform_child(name):
    """the next deforming bone down the chain (the middle one where it branches)"""
    queue = list(krig.data.bones[name].children)
    found = []
    while queue:
        c = queue.pop(0)
        if c.use_deform:
            found.append(c.name)
        else:
            queue.extend(c.children)
    return min(found, key=lambda n: abs(moved[n].x - moved[name].x)) if found else None


def weight_rig():
    arm = bpy.data.armatures.new('K_Weights')
    wo = bpy.data.objects.new('K_Weights', arm)
    bpy.context.scene.collection.objects.link(wo)
    select_only(wo)
    bpy.ops.object.mode_set(mode='EDIT')
    for name in DEFORM:
        h = moved[name]
        c = deform_child(name)
        if c:
            t = moved[c]
        elif 'Hand' in name:
            tip = [n for n in moved if n.startswith(B + name[len(B)] + '_Finger22_')]   # the middle fingertip
            t = moved[tip[0]] + (moved[tip[0]] - h) * 0.25 if tip else h + Vector((0, 0, -0.08))
        elif 'Toe' in name:
            t = h + Vector((0, -0.05 * S, 0))
        elif 'Head' in name:
            t = Vector((h.x, h.y, HEIGHT))
        else:
            t = h + Vector((0, 0, 0.05))
        if (t - h).length < 0.01:
            t = h + Vector((0, 0, 0.02))
        e = arm.edit_bones.new(name)
        e.head, e.tail = h, t
    bpy.ops.object.mode_set(mode='OBJECT')
    return wo


WRIG = weight_rig()


def bind(obj, rigid=None):
    """skin a mesh to her skeleton: automatic weights from the stand-in, or all to one bone"""
    if rigid:
        g = obj.vertex_groups.new(name=rigid)
        g.add(range(len(obj.data.vertices)), 1.0, 'REPLACE')
    else:
        select_only(obj, WRIG)
        bpy.context.view_layer.objects.active = WRIG
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
        for m in list(obj.modifiers):
            if m.type == 'ARMATURE':
                obj.modifiers.remove(m)
    w = obj.matrix_world.copy()
    obj.parent = krig
    obj.matrix_world = w
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = krig
    log('bound', obj.name, len(obj.vertex_groups), 'groups', 'rigid' if rigid else '')


if STAGE == 'rig':
    bind(body_lo)
    for o in eyes:
        bind(o, rigid=B + 'Head1_4')

if PREVIEW and STAGE == 'rig':
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x, sc.render.resolution_y = 900, 700
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 1.6
    sc.collection.objects.link(cam)
    sc.camera = cam
    body.hide_render = STAGE == 'rig'
    body_lo.hide_render = STAGE != 'rig'
    WRIG.hide_render = True
    def shot(name, loc, rot):
        cam.location, cam.rotation_euler = loc, rot
        sc.render.filepath = os.path.join(PREVIEW, name + '.png')
        bpy.ops.render.render(write_still=True)
    krig.data.pose_position = 'REST'
    shot('rest_front', (0, -4, 0.68), (math.pi / 2, 0, 0))
    krig.data.pose_position = 'POSE'
    for clip in ('Idle', 'Walk'):
        krig.animation_data_create()
        krig.animation_data.action = bpy.data.actions[clip]
        if hasattr(krig.animation_data, 'action_slot') and bpy.data.actions[clip].slots:
            krig.animation_data.action_slot = bpy.data.actions[clip].slots[0]
        for f in (0, 12):
            sc.frame_set(f)
            shot('%s_%d_front' % (clip, f), (0, -4, 0.68), (math.pi / 2, 0, 0))
            shot('%s_%d_side' % (clip, f), (4, 0, 0.68), (math.pi / 2, 0, math.pi / 2))

if STAGE == 'rig':
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    log('stopped after rigging; saved', OUT_BLEND)
    sys.exit(0)

Z_HIP = HEIGHT * 0.49            # the coat's skirt starts here
Z_NECK = HEIGHT * 0.835          # the collar's foot
T_CUFF = 0.73                    # down the arm: the sleeve ends here (1 is the fingertip)
REAL = HEIGHT / 1.72                      # model units per real metre
cm = lambda x: x * 0.01 * REAL
skin = body
# ====================================================================== 5b. the skin that shows: head and neck (above the collar's foot)
SKT = ARM_T['K_Skin']
skt = lambda i: SKT[i] if i < len(SKT) else -1.0      # (the vertices the lip cut added are not on the arms)
bm = bmesh.new()
bm.from_mesh(skin.data)
# only the head and neck stay: the hands come from the base-level body (lighter; they are only
# ever seen from a distance)
gone = [f for f in bm.faces if not all(v.co.z > Z_NECK - cm(1.5) and skt(v.index) < 0 for v in f.verts)]
bmesh.ops.delete(bm, geom=gone, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(skin.data)
bm.free()
log('head and neck', len(skin.data.polygons), 'faces')
# ====================================================================== 6. her face and head, measured
SV = [v.co.copy() for v in skin.data.vertices]
EC = {}
for o in eyes:
    c = sum((v.co for v in o.data.vertices), Vector()) / len(o.data.vertices)
    EC['L' if c.x > 0 else 'R'] = (c, (max(v.co.x for v in o.data.vertices) - min(v.co.x for v in o.data.vertices)) / 2)
EYE_Z = (EC['L'][0].z + EC['R'][0].z) / 2
EYE_Y = (EC['L'][0].y + EC['R'][0].y) / 2
mid = sorted((p for p in SV if abs(p.x) < 0.0015 and p.y < EYE_Y and EYE_Z - cm(16) < p.z < EYE_Z), key=lambda p: p.z)
NOSE = min(mid, key=lambda p: p.y)
log('eyes', [[round(c, 3) for c in EC[s][0]] for s in 'LR'], 'r', round(EC['L'][1], 4), 'nose tip', [round(c, 3) for c in NOSE])

def indent(v):
    """how far a vertex sits back (+y) from its neighbours: high along a crease"""
    return v.co.y - sum(e.other_vert(v).co.y for e in v.link_edges) / len(v.link_edges)


def lip_line(bm, near=None):
    """the lips' crease: from its deepest point on the midline (between the nose and the chin, or
    nearest `near`) along to each corner. Returns (the middle vertex, the vertices, the edges)"""
    cands = [v for v in bm.verts if abs(v.co.x) < 0.0015 and v.co.y < EYE_Y and NOSE.z - cm(4.5) < v.co.z < NOSE.z - cm(1.2)]
    if near is not None:
        cands = [v for v in cands if (v.co - near).length < cm(0.4)] or cands
    crease = max(cands, key=indent)
    path, edges = [crease], []
    for sgn in (1, -1):
        v = crease
        while True:
            nxt = [e for e in v.link_edges if (e.other_vert(v).co.x - v.co.x) * sgn > 1e-5]
            if not nxt:
                break
            e = max(nxt, key=lambda e: indent(e.other_vert(v)))
            w = e.other_vert(v)
            if indent(w) < indent(crease) * 0.25 or abs(w.co.x) > cm(3.2):
                break
            edges.append(e)
            path.append(w)
            v = w
    return crease, path, edges


bm = bmesh.new()
bm.from_mesh(skin.data)
crease, lip_path, lip_edges = lip_line(bm)
MOUTH = crease.co.copy()
CORNER_X = max(abs(v.co.x) for v in lip_path)
bm.free()
log('mouth at', [round(c, 3) for c in MOUTH], 'corners at x', round(CORNER_X, 4), 'lip line', len(lip_edges), 'edges')

# the head is the densest part of her: thinned, except round the mouth and eyes (kept exactly, for
# the lips' cut and the lids)
def keep_detail(p):
    mouth = abs(p.x) < CORNER_X + cm(2.2) and abs(p.z - MOUTH.z) < cm(2.6) and p.y < MOUTH.y + cm(3)
    eye = any(abs(p.x - EC[s][0].x) < cm(2.8) and abs(p.z - EYE_Z) < cm(2.6) and p.y < EYE_Y + cm(3) for s in 'LR')
    return mouth or eye


g = skin.vertex_groups.new(name='keep_detail')
g.add([v.index for v in skin.data.vertices if keep_detail(v.co)], 1.0, 'REPLACE')
thin = skin.modifiers.new('thin', 'DECIMATE')
thin.ratio = 0.6
thin.vertex_group = 'keep_detail'
thin.invert_vertex_group = True
thin.vertex_group_factor = 10.0
thin.use_symmetry = True
thin.symmetry_axis = 'X'
select_only(skin)
bpy.ops.object.modifier_apply(modifier='thin')
if skin.vertex_groups.get('keep_detail'):
    skin.vertex_groups.remove(skin.vertex_groups['keep_detail'])
log('head and neck thinned to', len(skin.data.polygons), 'faces')

# open the lips along the crease (the corners stay joined)
bm = bmesh.new()
bm.from_mesh(skin.data)
crease, lip_path, lip_edges = lip_line(bm, near=MOUTH)
bmesh.ops.split_edges(bm, edges=lip_edges)
bm.to_mesh(skin.data)
bm.free()
log('lips opened along', len(lip_edges), 'edges')


def add_mesh(name, verts, faces, color=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if color:
        set_colors(o, lambda p, i: color)
    return o


def lin(hex_):
    c = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def set_colors(o, fn):
    """per-vertex colour (linear RGBA) from fn(position, index)"""
    attr = o.data.color_attributes.get('Col') or o.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for v in o.data.vertices:
        attr.data[v.index].color = fn(v.co, v.index)
    o.data.color_attributes.active_color = attr


def ellipsoid(c, r, nu=12, nv=7, half=None):
    """a UV ellipsoid (half='back' keeps the half behind the front)"""
    verts, faces = [], []
    for j in range(nv + 1):
        a = math.pi * j / nv - math.pi / 2
        for i in range(nu):
            b = 2 * math.pi * i / nu
            verts.append(Vector((c.x + r[0] * math.cos(a) * math.cos(b), c.y + r[1] * math.cos(a) * math.sin(b), c.z + r[2] * math.sin(a))))
    for j in range(nv):
        for i in range(nu):
            q = (j * nu + i, j * nu + (i + 1) % nu, (j + 1) * nu + (i + 1) % nu, (j + 1) * nu + i)
            if half == 'back' and all(verts[k].y < c.y - r[1] * 0.2 for k in q):
                continue
            faces.append(q)
    return verts, faces


# the mouth behind the lips: a dark pocket, upper and lower teeth, a tongue
def arch(y0, z0, z1, n=14):
    verts, faces = [], []
    for i in range(n + 1):
        x = (i / n * 2 - 1) * CORNER_X * 0.78
        y = y0 + (x / (CORNER_X * 0.78)) ** 2 * cm(1.4)
        verts += [Vector((x, y, z0)), Vector((x, y, z1))]
        if i:
            faces.append((2 * i - 2, 2 * i, 2 * i + 1, 2 * i - 1))
    return verts, faces


ty = MOUTH.y + cm(0.55)
pocket = add_mesh('K_MouthPocket', *ellipsoid(Vector((0, MOUTH.y + cm(1.9), MOUTH.z - cm(0.2))), (CORNER_X * 1.05, cm(1.8), cm(1.25)), half='back'), color=lin('#2a0d0e'))
upper = add_mesh('K_TeethUp', *arch(ty, MOUTH.z + cm(0.08), MOUTH.z + cm(0.85)), color=lin('#e9e3d6'))
lower = add_mesh('K_TeethLow', *arch(ty + cm(0.15), MOUTH.z - cm(0.75), MOUTH.z - cm(0.08)), color=lin('#ddd6c8'))
tongue = add_mesh('K_Tongue', *ellipsoid(Vector((0, MOUTH.y + cm(1.9), MOUTH.z - cm(0.95))), (CORNER_X * 0.7, cm(1.6), cm(0.45)), 10, 5), color=lin('#7a3434'))

# the mole: a small dark spot on her right cheek beside the nose
skin_bvh = BVHTree.FromObject(skin, bpy.context.evaluated_depsgraph_get())


def on_skin(x, z, lift=0.0, frm=None, d=Vector((0, 1, 0))):
    o = frm or Vector((x, -0.5, z))
    hit, n, _, _ = skin_bvh.ray_cast(o, d)
    return (hit + n * lift, n) if hit else (None, None)


mp, mn = on_skin(-cm(2.3), NOSE.z + cm(0.9), cm(0.04))
ring = [mp] + [mp + (Matrix.Rotation(2 * math.pi * k / 8, 3, mn) @ mn.orthogonal().normalized()) * cm(0.17) for k in range(8)]
mole = add_mesh('K_Mole', ring, [(0, 1 + k, 1 + (k + 1) % 8) for k in range(8)], color=lin('#3b2618'))

# ====================================================================== 7. her clothes, from the base-level body
LO = [v.co.copy() for v in body_lo.data.vertices]
LOT = ARM_T['K_BodyLo']
Z_BOOT = HEIGHT * 0.30
COAT_RGB, TRIM_RGB = '#e9eef1', '#cfd8de'


def shell(name, keep, offset, src=body_lo):
    """a copy of the faces of `src` whose vertices all pass keep(p, i), pushed out along the normals
    by offset(p, i)"""
    bm = bmesh.new()
    bm.from_mesh(src.data)
    bm.verts.ensure_lookup_table()
    gone = [f for f in bm.faces if not all(keep(v.co, v.index) for v in f.verts)]
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts:
        v.co = v.co + v.normal * offset(v.co, v.index)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


coat = shell('K_Coat',
             lambda p, i: Z_HIP - cm(1) < p.z < Z_NECK and LOT[i] < T_CUFF,
             lambda p, i: cm(1.0) if LOT[i] >= 0 else cm(1.25) - cm(0.45) * smooth(Z_NECK - cm(6), Z_NECK, p.z))


def boundary_loops(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    loops, seen = [], set()
    for e in bm.edges:
        if e.is_boundary and e.index not in seen:
            loop, stack = set(), [e]
            seen.add(e.index)
            while stack:
                x = stack.pop()
                loop |= {x.verts[0].index, x.verts[1].index}
                for v in x.verts:
                    for e2 in v.link_edges:
                        if e2.is_boundary and e2.index not in seen:
                            seen.add(e2.index)
                            stack.append(e2)
            loops.append(loop)
    bm.free()
    return loops


def extrude_ring(o, loop, move):
    """extrude the open edge through these vertices, moving the new ones by move(p)"""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.verts.ensure_lookup_table()
    edges = [e for e in bm.edges if e.is_boundary and e.verts[0].index in loop and e.verts[1].index in loop]
    res = bmesh.ops.extrude_edge_only(bm, edges=edges)
    for v in [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]:
        v.co = move(v.co)
    bm.to_mesh(o.data)
    bm.free()


cv = lambda o: [v.co for v in o.data.vertices]
loops = boundary_loops(coat)
P = cv(coat)
neck_loop = max(loops, key=lambda L: sum(P[i].z for i in L) / len(L))
hip_loop = min(loops, key=lambda L: sum(P[i].z for i in L) / len(L))
cuff_loops = [L for L in loops if L is not neck_loop and L is not hip_loop]
NECK_C = sum((P[i] for i in neck_loop), Vector()) / len(neck_loop)
for i in neck_loop:                          # (the cut through the faces left it ragged: level it)
    coat.data.vertices[i].co.z = NECK_C.z
# the stand collar: two rings up the neck, leaning in a little
extrude_ring(coat, neck_loop, lambda p: Vector((NECK_C.x + (p.x - NECK_C.x) * 0.95, NECK_C.y + (p.y - NECK_C.y) * 0.95, p.z + cm(2.3))))
loops = boundary_loops(coat)
P = cv(coat)
top = max(loops, key=lambda L: sum(P[i].z for i in L) / len(L))
extrude_ring(coat, top, lambda p: Vector((NECK_C.x + (p.x - NECK_C.x) * 0.97, NECK_C.y + (p.y - NECK_C.y) * 0.97, p.z + cm(2.2))))
# the cuffs: a band turned out a little at the end of each sleeve
for side in ('L', 'R'):
    loops = boundary_loops(coat)
    P = cv(coat)
    sgn = 1 if side == 'L' else -1
    L = max((L for L in loops if all(P[i].x * sgn > 0.05 for i in L)), key=lambda L: abs(sum(P[i].x for i in L)), default=None)
    if L:
        c = sum((P[i] for i in L), Vector()) / len(L)
        sh, tip = ARMS[side]
        d = (tip - sh).normalized()
        extrude_ring(coat, L, lambda p, c=c, d=d: c + (p - c) * 1.08 + d * cm(0.6))

# the skirt: from the hips down to just below the knee, flared, open in a slit at the front,
# longer at the sides and back
N_COL, N_ROW = 56, 12
Z_TOP = Z_HIP + cm(2.5)
SLIT_TOP = HEIGHT * 0.43
hip = [v.co for v in body_lo.data.vertices if abs(v.co.z - Z_HIP) < cm(3) and LOT[v.index] < 0]
HC = sum(hip, Vector()) / len(hip)
HC.z = 0
def reach(pts, theta, window=0.22):
    d = Vector((math.sin(theta), -math.cos(theta), 0))
    best = 0.0
    for p in pts:
        q = Vector((p.x - HC.x, p.y - HC.y, 0))
        if q.length > 1e-6 and q.normalized().dot(d) > math.cos(window):
            best = max(best, q.dot(d))
    return best
skirt_v, skirt_f = [], []
cols = [2 * math.pi * (i + 0.5) / N_COL - math.pi for i in range(N_COL)]       # (no column right at the front)
for r in range(N_ROW + 1):
    k = r / N_ROW
    for th in cols:
        hem = HEIGHT * (0.255 - 0.035 * (1 - math.cos(th)) / 2)
        z = Z_TOP + (hem - Z_TOP) * k
        legs = reach([p for i_, p in enumerate(LO) if abs(p.z - z) < cm(2.5) and LOT[i_] < 0], th) if r else 0
        base = reach(hip, th) + cm(1.6)
        rad = max(base * (1 + 0.16 * k ** 1.3), legs + cm(2.2))
        # the slit opens a little toward the hem
        if z < SLIT_TOP and abs(th) < 0.2:
            th = th + math.copysign(0.05 * smooth(SLIT_TOP, SLIT_TOP - cm(25), z), th)
        skirt_v.append(Vector((HC.x + math.sin(th) * rad, HC.y - math.cos(th) * rad, z)))
for r in range(N_ROW):
    for i in range(N_COL):
        j = (i + 1) % N_COL
        a, b = skirt_v[r * N_COL + i], skirt_v[r * N_COL + j]
        front_gap = cols[i] < 0 < cols[j]
        if front_gap and skirt_v[(r + 1) * N_COL + i].z < SLIT_TOP:
            continue
        skirt_f.append((r * N_COL + i, r * N_COL + j, (r + 1) * N_COL + j, (r + 1) * N_COL + i))
skirt = add_mesh('K_CoatSkirt', skirt_v, skirt_f)

pants = shell('K_Pants', lambda p, i: Z_BOOT - cm(4) < p.z < Z_TOP and LOT[i] < 0, lambda p, i: cm(0.6))
boots = shell('K_Boots', lambda p, i: p.z < Z_BOOT and LOT[i] < 0, lambda p, i: cm(0.9) + cm(0.5) * smooth(cm(2.5), 0, p.z))
bm = bmesh.new()                             # (smoothed over the foot: a boot, not toes)
bm.from_mesh(boots.data)
foot = [v for v in bm.verts if v.co.z < HEIGHT * 0.065]
for _ in range(40):
    bmesh.ops.smooth_vert(bm, verts=foot, factor=1.0, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.normal_update()
for v in foot:                               # (and a rounded toe box over where the toes were)
    v.co += v.normal * cm(0.5) * smooth(HEIGHT * 0.065, HEIGHT * 0.02, v.co.z)
bm.to_mesh(boots.data)
bm.free()
thin = boots.modifiers.new('thin', 'DECIMATE')
thin.ratio = 0.35
select_only(boots)
bpy.ops.object.modifier_apply(modifier='thin')
for v in boots.data.vertices:
    if v.co.z < cm(0.6):
        v.co.z = 0.0                       # a flat, chunky sole on the floor
loops = boundary_loops(boots)
for L in loops:
    c = sum((boots.data.vertices[i].co for i in L), Vector()) / len(L)
    extrude_ring(boots, L, lambda p, c=c: Vector((c.x + (p.x - c.x) * 1.06, c.y + (p.y - c.y) * 1.06, p.z + cm(0.4))))

# the strap and buckle across the upper chest, two zip pulls, and the coat's seams (thin strips laid
# on the coat: the centre front and two princess seams)
coat_bvh = BVHTree.FromObject(coat, bpy.context.evaluated_depsgraph_get())


def on_coat(x, z, lift):
    hit, n, _, _ = coat_bvh.ray_cast(Vector((x, -0.6, z)), Vector((0, 1, 0)))
    return hit + n * lift if hit else Vector((x, -0.1, z))


def strip(name, pts, width, lift, color):
    """a flat strip along points on the coat's front"""
    verts, faces = [], []
    for k, (x, z) in enumerate(pts):
        if k + 1 < len(pts):
            dx, dz = pts[k + 1][0] - x, pts[k + 1][1] - z
        side = Vector((-dz, 0, dx)).normalized() * (width / 2)
        verts += [on_coat(x + side.x, z + side.z, lift), on_coat(x - side.x, z - side.z, lift)]
        if k:
            faces.append((2 * k - 2, 2 * k - 1, 2 * k + 1, 2 * k))
    return add_mesh(name, verts, faces, color=lin(color))


Z_STRAP = HEIGHT * 0.775
pieces = [
    strip('K_Strap', [(cm(-3.5) + cm(1.0) * i, Z_STRAP) for i in range(12)], cm(1.7), cm(0.35), '#dfe5e9'),
    strip('K_Buckle', [(cm(7.2), Z_STRAP - cm(1.2)), (cm(7.2), Z_STRAP + cm(1.2))], cm(2.0), cm(0.55), '#aab3ba'),
    strip('K_ZipL', [(cm(6.5), HEIGHT * 0.752), (cm(6.5), HEIGHT * 0.742)], cm(0.6), cm(0.3), '#8f979e'),
    strip('K_ZipR', [(cm(-6.5), HEIGHT * 0.752), (cm(-6.5), HEIGHT * 0.742)], cm(0.6), cm(0.3), '#8f979e'),
    strip('K_SeamC', [(0, Z_NECK - cm(1) - (Z_NECK - Z_HIP) * i / 20) for i in range(21)], cm(0.3), cm(0.12), '#c3ccd3'),
]
for sgn in (1, -1):
    pts = [(sgn * (cm(10) - cm(4.5) * smooth(0, 1, i / 16) + cm(1.5) * (i / 16) ** 2), Z_STRAP - cm(1) - (Z_STRAP - Z_HIP) * i / 16) for i in range(17)]
    pieces.append(strip('K_SeamP' + ('L' if sgn > 0 else 'R'), pts, cm(0.25), cm(0.12), '#c8d0d6'))

set_colors(coat, lambda p, i: lin(TRIM_RGB) if p.z > Z_NECK + cm(3.6) else lin(COAT_RGB))
set_colors(skirt, lambda p, i: lin(COAT_RGB))
set_colors(pants, lambda p, i: lin('#dde3e7'))
RIB = cm(1.5)
set_colors(boots, lambda p, i: lin('#cdd5db') if (HEIGHT * 0.07 < p.z < Z_BOOT - cm(1) and int(p.z / RIB) % 2) else lin('#eef1f3'))
select_only(coat, skirt, *pieces)
bpy.context.view_layer.objects.active = coat
bpy.ops.object.join()
log('coat', len(coat.data.polygons), 'faces')

# ====================================================================== 8. the hands (the base-level body's: lighter; only ever seen from a distance)
hands = shell('K_Hands', lambda p, i: LOT[i] > T_CUFF - 0.04, lambda p, i: 0.0)
SKIN_RGB = '#c99a7c'

# ====================================================================== 9. her hair: blond, swept back
HEAD = [v.co for v in skin.data.vertices if v.co.z > Z_NECK]
HC3 = Vector((0, (min(p.y for p in HEAD if abs(p.z - EYE_Z) < cm(1)) + max(p.y for p in HEAD if abs(p.z - EYE_Z) < cm(1))) / 2, EYE_Z + cm(1)))
TOP = max(p.z for p in HEAD)
BROW_Z = EYE_Z + cm(2.2)
NAPE_Z = MOUTH.z - cm(3.5)


def azimuth(p):
    return math.degrees(math.atan2(p.x - HC3.x, -(p.y - HC3.y)))      # 0 at the front, +90 her left


HAIRLINE = [(0, BROW_Z + cm(3.4)), (40, BROW_Z + cm(2.6)), (62, EYE_Z + cm(2.0)), (82, EYE_Z + cm(2.4)), (100, EYE_Z + cm(1.4)),
            (125, NAPE_Z + cm(4.0)), (155, NAPE_Z + cm(1.0)), (180, NAPE_Z)]


def hairline(p):
    a = abs(azimuth(p))
    for (a0, z0), (a1, z1) in zip(HAIRLINE, HAIRLINE[1:]):
        if a0 <= a <= a1:
            return z0 + (z1 - z0) * (a - a0) / (a1 - a0)
    return HAIRLINE[-1][1]


def is_ear(p):
    a = abs(azimuth(p))
    r = Vector((p.x - HC3.x, p.y - HC3.y, 0)).length
    return 70 < a < 115 and EYE_Z - cm(5) < p.z < EYE_Z + cm(2.2) and r > cm(7.3)


hair = shell('K_Hair', lambda p, i: p.z > hairline(p) and not is_ear(p), lambda p, i: 0.0, src=skin)
# thickness: full on the crown, less at the short sides, tapering to nothing at the hairline
bm = bmesh.new()
bm.from_mesh(hair.data)
bm.verts.ensure_lookup_table()
depth = {v.index: 0 for v in bm.verts if v.is_boundary}
frontier = list(depth)
while frontier:
    nxt = []
    for i in frontier:
        for e in bm.verts[i].link_edges:
            j = e.other_vert(bm.verts[i]).index
            if j not in depth:
                depth[j] = depth[i] + 1
                nxt.append(j)
    frontier = nxt
bm.normal_update()
for v in bm.verts:
    a = abs(azimuth(v.co))
    full = cm(1.2) + cm(1.0) * smooth(EYE_Z + cm(3), TOP, v.co.z) * smooth(165, 50, a)   # volume on top, swept back
    full *= 0.65 + 0.35 * smooth(70, 30, a) if a < 100 else 0.8                         # short at the sides
    v.co = v.co + v.normal * (cm(0.12) + full * smooth(0, 4, depth.get(v.index, 9)))
bm.to_mesh(hair.data)
bm.free()


def strand(start_x, start_z, length, curl, side_out):
    """a loose lock: a strip hanging from the hairline, just off the face, narrowing to its end"""
    verts, faces = [], []
    n = 9
    for k in range(n + 1):
        t = k / n
        x = start_x + curl * math.sin(t * 2.2) + side_out * t
        z = start_z - length * t
        p, nrm = on_skin(x, z, cm(0.45) + cm(0.3) * t)
        if p is None:
            break
        w = cm(0.55) * (1 - 0.7 * t)
        side = nrm.cross(Vector((0, 0, 1))).normalized() * w
        verts += [p + side, p - side]
        if k:
            faces.append((2 * k - 2, 2 * k - 1, 2 * k + 1, 2 * k))
    return add_mesh('K_Strand', verts, faces)


locks = [strand(-cm(6.4), BROW_Z + cm(2.2), cm(9.5), cm(0.5), -cm(0.7)), strand(-cm(5.8), BROW_Z + cm(2.6), cm(8.0), -cm(0.3), -cm(0.5)),
         strand(-cm(6.9), BROW_Z + cm(1.4), cm(7.0), cm(0.3), -cm(0.4)), strand(cm(6.5), BROW_Z + cm(1.8), cm(6.0), -cm(0.4), cm(0.5))]
BLOND, ROOT = lin('#C8A96A'), lin('#8C6E3F')
rnd = random.Random(7)
phase = [rnd.uniform(0, 6.28) for _ in range(5)]


def hair_colour(p, i, root=0.0):
    a = math.radians(azimuth(p))
    streak = 0.5 + 0.5 * math.sin(a * 23 + phase[0] + math.sin(p.z * 90 + phase[1]) * 1.3) * math.sin(a * 9 + phase[2])
    c = [ROOT[k] + (BLOND[k] - ROOT[k]) * (1 - root) for k in range(3)]
    shade = 0.86 + 0.24 * streak
    return [min(1.0, c[k] * shade) for k in range(3)] + [1.0]


set_colors(hair, lambda p, i: hair_colour(p, i, root=0.55 * smooth(EYE_Z + cm(3.5), BROW_Z + cm(4.5), p.z) * smooth(110, 20, abs(azimuth(p)))))
for o in locks:
    set_colors(o, lambda p, i: hair_colour(p, i, 0.15))
select_only(hair, *locks)
bpy.context.view_layer.objects.active = hair
bpy.ops.object.join()
# the scalp under the hair is never seen: it goes (all but a band inside the hairline)
bm = bmesh.new()
bm.from_mesh(skin.data)
gone = [f for f in bm.faces if all(v.co.z > hairline(v.co) + cm(1.5) and not is_ear(v.co) for v in f.verts)]
bmesh.ops.delete(bm, geom=gone, context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(skin.data)
bm.free()
log('head and neck without the scalp', len(skin.data.polygons), 'faces')
dec = hair.modifiers.new('thin', 'DECIMATE')
dec.ratio = 0.85
select_only(hair)
bpy.ops.object.modifier_apply(modifier='thin')
log('hair', len(hair.data.polygons), 'faces')

# ====================================================================== 10. the earpiece: a white hook over her right ear
ear = [p for p in HEAD if is_ear(p) and p.x < 0]
ER0 = Vector([min(p[i] for p in ear) for i in range(3)])
ER1 = Vector([max(p[i] for p in ear) for i in range(3)])
x_out = min(p.x for p in ear) + cm(0.25)
path = []
for k in range(9):
    t = k / 8 * math.pi
    path.append(Vector((x_out + cm(0.35), (ER0.y + ER1.y) / 2 - math.cos(t) * (ER1.y - ER0.y) * 0.62, ER1.z + cm(0.2) - (1 - math.sin(t)) * cm(1.6) - (cm(0.6) if k > 4 else 0) * (k - 4) / 4)))
verts, faces = [], []
for k, c in enumerate(path):
    d = (path[min(k + 1, 8)] - path[max(k - 1, 0)]).normalized()
    u = d.cross(Vector((1, 0, 0))).normalized()
    w = d.cross(u).normalized()
    for j in range(6):
        a = 2 * math.pi * j / 6
        verts.append(c + (u * math.cos(a) + w * math.sin(a)) * cm(0.28))
    if k:
        faces += [((k - 1) * 6 + j, (k - 1) * 6 + (j + 1) % 6, k * 6 + (j + 1) % 6, k * 6 + j) for j in range(6)]
pod_v, pod_f = ellipsoid(path[0] + Vector((0, -cm(0.9), -cm(0.2))), (cm(0.45), cm(1.1), cm(0.5)), 8, 5)
earpiece = add_mesh('K_EarPiece', verts + pod_v, faces + [tuple(i + len(verts) for i in f) for f in pod_f], color=lin('#f1f4f6'))

# ====================================================================== 11. colours of her face, and her eyes
def face_colour(p, i):
    c = list(lin(SKIN_RGB))
    def mix(col, w):
        for k in range(3):
            c[k] += (col[k] - c[k]) * max(0.0, min(1.0, w))
    x, z = p.x, p.z
    # lips
    lw = math.exp(-((x / (CORNER_X * 1.05)) ** 4 + ((z - MOUTH.z) / cm(0.75)) ** 2)) * smooth(MOUTH.y + cm(1.2), MOUTH.y - cm(0.2), p.y)
    mix(lin('#b06a62'), lw * 0.85)
    # rosy cheeks
    for sgn in (1, -1):
        mix(lin('#d18a7c'), 0.35 * math.exp(-(((x - sgn * cm(3.8)) / cm(1.8)) ** 2 + ((z - NOSE.z - cm(0.6)) / cm(1.4)) ** 2)))
    for s in ('L', 'R'):
        ec, er = EC[s]
        dx, dz = x - ec.x, z - ec.z
        # brows: a soft arch above each eye, light brown
        arch_z = ec.z + cm(1.75) + cm(0.35) * math.cos(dx / cm(2.2) * 1.2) - cm(0.25) * (dx * (1 if s == 'L' else -1) / cm(2.4))
        if abs(dx) < cm(2.6) and p.y < ec.y:
            mix(lin('#6e5139'), 0.95 * math.exp(-((z - arch_z) / cm(0.38)) ** 2) * smooth(cm(2.8), cm(1.8), abs(dx)))
        # the lid edges and lashes: a dark line round the eye opening
        r = Vector((x - ec.x, p.y - ec.y, z - ec.z)).length
        if r < er + cm(0.35) and p.y < ec.y - er * 0.3:
            mix(lin('#2c2019'), 0.85 * smooth(er + cm(0.35), er + cm(0.05), r))
        # a shadow in the eye socket under the brow
        mix(lin('#9c7462'), 0.3 * math.exp(-((dx / cm(1.6)) ** 2 + ((dz - cm(0.9)) / cm(0.7)) ** 2)))
    return c


set_colors(skin, face_colour)
set_colors(hands, lambda p, i: lin(SKIN_RGB))
for o in eyes:
    thin = o.modifiers.new('thin', 'DECIMATE')
    thin.ratio = 0.4
    select_only(o)
    bpy.ops.object.modifier_apply(modifier='thin')
for o in eyes:
    c, r = EC['L' if sum((v.co for v in o.data.vertices), Vector()).x > 0 else 'R']
    def eye_colour(p, i, c=c, r=r):
        a = math.degrees(math.acos(max(-1, min(1, (p - c).normalized().dot(Vector((0, -1, 0)))))))
        if a < 9:
            return lin('#120b08')
        if a < 22:
            return lin('#4a2e1c') if a < 18 else lin('#2c1a10')
        return lin('#eee9e2')
    set_colors(o, eye_colour)

# the mouth and the mole become part of the skin (they share its morphs and its skinning); each
# piece keeps a 'part' number so the face rig can tell them apart
PART = {'skin': 0, 'pocket': 1, 'teeth_up': 2, 'teeth_low': 3, 'tongue': 4, 'mole': 5}
for o, n in ((skin, 0), (pocket, 1), (upper, 2), (lower, 3), (tongue, 4), (mole, 5)):
    a = o.data.attributes.new('part', 'INT', 'POINT')
    for k in range(len(o.data.vertices)):
        a.data[k].value = n
select_only(skin, pocket, upper, lower, tongue, mole)
bpy.context.view_layer.objects.active = skin
bpy.ops.object.join()

# ====================================================================== 12. her face rig (the same morph targets as Voss)
me = skin.data
V = [v.co.copy() for v in me.vertices]
N = len(V)
part = [a.value for a in me.attributes['part'].data]
bm = bmesh.new()
bm.from_mesh(me)
bm.verts.ensure_lookup_table()
# which side of the opened lips each crease vertex is on (its faces lie above or below it)
lip_side = {}
for v in bm.verts:
    if part[v.index] == 0 and abs(v.co.x) <= CORNER_X + 1e-4 and abs(v.co.z - MOUTH.z) < cm(0.3) and v.co.y < MOUTH.y + cm(0.4) and v.link_faces:
        fz = [f.calc_center_median().z for f in v.link_faces]
        lip_side[v.index] = -1 if sum(fz) / len(fz) < v.co.z else 1
bm.free()


def rot_x(p, centre, a):
    d = p - centre
    c, s_ = math.cos(a), math.sin(a)
    return centre + Vector((d.x, d.y * c - d.z * s_, d.y * s_ + d.z * c))


SHAPES = ['jaw_open', 'mouth_wide', 'mouth_pucker', 'mouth_smile', 'mouth_frown', 'blink', 'eyes_tired', 'brow_up', 'brow_down']
D = {k: [Vector() for _ in range(N)] for k in SHAPES}
PIVOT = Vector((0, MOUTH.y + 0.070, MOUTH.z + 0.0175))
JAW = math.radians(13)
KX = CORNER_X / 0.021                     # (the lip shapes were sized on Voss's mouth)


def jaw_weight(i):
    p = V[i]
    if part[i] in (3, 4):
        return 1.0                        # lower teeth, tongue
    if part[i] == 2 or part[i] == 5:
        return 0.0                        # upper teeth, the mole
    if part[i] == 1:
        return 1.0 - smooth(MOUTH.z - cm(0.3), MOUTH.z + cm(0.3), p.z)
    t = min(1.0, max(0.0, (p.y - MOUTH.y) / (PIVOT.y - MOUTH.y)))
    zs = MOUTH.z + (PIVOT.z - MOUTH.z) * t
    soft = 1.0 - smooth(zs - 0.007, zs + 0.004, p.z)
    near = 1.0 - smooth(CORNER_X - 0.004, CORNER_X + 0.006, abs(p.x))
    if near > 0 and p.y < MOUTH.y + cm(1.5) and abs(p.z - MOUTH.z) < 0.012:
        hard = (1.0 if lip_side[i] < 0 else 0.0) if i in lip_side else (1.0 if p.z < MOUTH.z else 0.0)
        soft = soft * (1 - near) + hard * near
    return soft * smooth(MOUTH.z - 0.0525, MOUTH.z - 0.0225, p.z) * (1.0 - smooth(PIVOT.y - 0.004, PIVOT.y + 0.016, p.y))


for i in range(N):
    w = jaw_weight(i)
    if w > 0:
        D['jaw_open'][i] = rot_x(V[i], PIVOT, JAW * w) - V[i]
    p = V[i]
    if part[i] != 0 or p.y > MOUTH.y + cm(3):
        continue
    front = smooth(MOUTH.y + cm(3), MOUTH.y + cm(0.8), p.y)
    lips = math.exp(-((p.x / (0.027 * KX)) ** 2 + ((p.z - MOUTH.z) / 0.011) ** 2)) * front
    side = 1.0 if p.x >= 0 else -1.0
    corner = math.exp(-(((abs(p.x) - CORNER_X) / 0.011) ** 2 + ((p.z - MOUTH.z) / 0.011) ** 2)) * front
    if lips > 0.01:
        k = min(1.0, abs(p.x) / (0.016 * KX))
        D['mouth_wide'][i] = Vector((side * 0.0042 * k, 0.0016 * k, -(p.z - MOUTH.z) * 0.18)) * lips
        D['mouth_pucker'][i] = Vector((-p.x * 0.34, -0.0042, -(p.z - MOUTH.z) * 0.12)) * lips
    if corner > 0.01:
        D['mouth_smile'][i] = Vector((side * 0.0018, 0.0014, 0.0032)) * corner
        D['mouth_frown'][i] = Vector((-side * 0.0004, 0.0004, -0.0028)) * corner

# the lids: where each eye shows between them, found by looking at it through the skin
lid_bvh = BVHTree.FromPolygons(V, [tuple(pl.vertices) for pl in me.polygons if all(part[j] == 0 for j in pl.vertices)])
ang = lambda p, c: math.atan2(p.z - c.z, -(p.y - c.y))


def eye_shows(c, r, dx, a):
    """looking at the eyeball from in front, at height angle a: is it bare, or behind skin (a lid)?"""
    d = Vector((0, math.cos(a), -math.sin(a)))
    o = c + Vector((dx, 0, 0)) - d * (r + cm(15))          # (well outside the face: never inside the cheek)
    hit, _, _, dist = lid_bvh.ray_cast(o, d, cm(15))
    return hit is None


for s in ('L', 'R'):
    c, r = EC[s]
    up, lo = [], []
    for k in range(-9, 10):
        dx = r * 0.9 * k / 9
        seen = [a for a in [x * 0.02 for x in range(-60, 61)] if eye_shows(c, r, dx, a)]
        if seen:
            up.append((dx, max(seen)))
            lo.append((dx, min(seen)))
    def interp(pts, x):
        if x <= pts[0][0]:
            return pts[0][1]
        if x >= pts[-1][0]:
            return pts[-1][1]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x0 <= x <= x1:
                return y0 + (y1 - y0) * (x - x0) / (x1 - x0 or 1)
    log('eye', s, 'opening (deg) up', [round(math.degrees(a), 0) for _, a in up[::3]], 'low', [round(math.degrees(a), 0) for _, a in lo[::3]])
    if not up:
        continue
    for i in range(N):
        p = V[i]
        dx = p.x - c.x
        if part[i] != 0 or abs(dx) > r * 1.3 or p.y > c.y - r * 0.1 or (p - c).length > r + cm(1.4):
            continue
        a = ang(p, c)
        au, al = interp(up, dx), interp(lo, dx)
        gap = max(0.0, au - al)
        across = (1.0 - smooth(r * 0.85, r * 1.25, abs(dx))) * (1.0 - smooth(r + cm(0.45), r + cm(1.2), (p - c).length))
        if a >= (au + al) / 2:
            w = (1.0 - smooth(au + 0.02, au + 0.45, a)) * across
            if w > 0:
                D['blink'][i] = rot_x(p, c, (gap * 0.8 + 0.05) * w) - p + (p - c).normalized() * 0.00025 * w
                D['eyes_tired'][i] = rot_x(p, c, gap * 0.42 * w) - p
        else:
            w = (1.0 - smooth(al - 0.02, al - 0.3, a)) * across
            if w > 0:
                D['blink'][i] = rot_x(p, c, -(gap * 0.2) * w) - p

# the brows
for i in range(N):
    p = V[i]
    if part[i] != 0 or p.y > EYE_Y + cm(1) or p.z < EYE_Z + cm(0.4):
        continue
    up_ = smooth(EYE_Z + cm(0.4), EYE_Z + cm(1.5), p.z) * (1 - smooth(EYE_Z + cm(5.5), EYE_Z + cm(8), p.z)) * (1 - smooth(cm(5.5), cm(7.5), abs(p.x)))
    if up_ > 0:
        D['brow_up'][i] = Vector((0, 0, 0.0028 * up_))
    ix = abs(EC['L'][0].x) - cm(1.1)
    inner = math.exp(-(((abs(p.x) - ix) / cm(1.8)) ** 2 + ((p.z - EYE_Z - cm(2.0)) / cm(1.0)) ** 2)) * smooth(EYE_Z + cm(0.5), EYE_Z + cm(1.2), p.z)
    if inner > 0.01:
        side = 1.0 if p.x >= 0 else -1.0
        D['brow_down'][i] = Vector((-side * 0.0011, -0.0004, -0.0022)) * inner

skin.shape_key_add(name='Basis', from_mix=False)
for k in SHAPES:
    kb = skin.shape_key_add(name=k, from_mix=False)       # (from the basis: not a copy of the keys so far)
    kb.value = 0.0
    for i, d in enumerate(D[k]):
        if d.length > 1e-7:
            kb.data[i].co = V[i] + d
    log('shape', k, sum(1 for d in D[k] if d.length > 1e-7), 'vertices')

# ====================================================================== 13. names, materials, skinning
for o, n in ((skin, 'Head'), (hands, 'Hands'), (coat, 'Coat'), (pants, 'Pants'), (boots, 'Boots'), (hair, 'Hair'), (earpiece, 'EarPiece')):
    o.name = n
    o.data.name = n
select_only(*eyes)
bpy.context.view_layer.objects.active = eyes[0]
bpy.ops.object.join()
eyeball = eyes[0]
eyeball.name = eyeball.data.name = 'Eyes'
PARTS = [skin, hands, coat, pants, boots, hair, earpiece, eyeball]
MATS = {'Head': 'K_Skin', 'Hands': 'K_Skin', 'Coat': 'K_Coat', 'Pants': 'K_Pants', 'Boots': 'K_Boots', 'Hair': 'K_Hair', 'EarPiece': 'K_EarPiece', 'Eyes': 'K_Eyes'}
for o in PARTS:
    o.data.materials.clear()
    name = MATS[o.name]
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    attr = m.node_tree.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    m.node_tree.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.6
    o.data.materials.append(m)
    for pl in o.data.polygons:
        pl.use_smooth = True

# Blender's automatic weights fail quietly on parts made of several pieces (the coat with its skirt
# and strap, the head with the mouth inside), so the bare base-level body is weighted that way and
# every part copies its weights from the body's nearest vertices
bind(body_lo)
from mathutils.kdtree import KDTree
kd = KDTree(len(body_lo.data.vertices))
for v in body_lo.data.vertices:
    kd.insert(v.co, v.index)
kd.balance()
src_names = {g.index: g.name for g in body_lo.vertex_groups}
src_w = [{src_names[g.group]: g.weight for g in v.groups} for v in body_lo.data.vertices]


def copy_weights(o):
    groups = {}
    for v in o.data.vertices:
        near = kd.find_n(v.co, 4)
        acc, total = {}, 0.0
        for _, i, d in near:
            w = 1.0 / (d + 1e-4)
            total += w
            for n, x in src_w[i].items():
                acc[n] = acc.get(n, 0.0) + x * w
        for n, x in acc.items():
            if x / total > 1e-3:
                g = groups.get(n) or o.vertex_groups.get(n) or o.vertex_groups.new(name=n)
                groups[n] = g
                g.add([v.index], x / total, 'REPLACE')
    w = o.matrix_world.copy()
    o.parent = krig
    o.matrix_world = w
    mod = o.modifiers.new('Armature', 'ARMATURE')
    mod.object = krig
    log('weighted', o.name, len(o.vertex_groups), 'groups')


for o in (skin, hands, coat, pants, boots):
    copy_weights(o)
for o in (hair, earpiece, eyeball):
    bind(o, rigid=B + 'Head1_4')
# inside the mouth and the mole: wholly the head (the bone heat cannot reach inside the head)
head_g = skin.vertex_groups.get(B + 'Head1_4') or skin.vertex_groups.new(name=B + 'Head1_4')
inside = [i for i in range(N) if part[i] != 0]
for g in skin.vertex_groups:
    if g is not head_g:
        g.remove(inside)
head_g.add(inside, 1.0, 'REPLACE')
# the skirt swings with the hips more than with each leg, so it does not split apart walking
pelvis = coat.vertex_groups.get(B + 'Pelvis_65') or coat.vertex_groups.new(name=B + 'Pelvis_65')
for v in coat.data.vertices:
    if v.co.z < Z_HIP:
        legs = [(g.group, g.weight) for g in v.groups if 'Thigh' in coat.vertex_groups[g.group].name or 'Calf' in coat.vertex_groups[g.group].name]
        for gi, w in legs:
            coat.vertex_groups[gi].add([v.index], w * 0.45, 'REPLACE')
        pelvis.add([v.index], 0.55 * smooth(Z_HIP, Z_HIP - cm(10), v.co.z), 'ADD')

# ====================================================================== 14. clean up and export
for o in (body_lo, WRIG):
    bpy.data.objects.remove(o)
for a in list(bpy.data.actions):
    if a.name not in ('Idle', 'Walk'):
        bpy.data.actions.remove(a)
tris = sum(len(pl.vertices) - 2 for o in PARTS for pl in o.data.polygons)
log('parts', [(o.name, len(o.data.vertices)) for o in PARTS], 'triangles', tris)
krig.data.pose_position = 'POSE'
if krig.animation_data:
    krig.animation_data.action = None
os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)

select_only(krig, *PARTS)
opts = dict(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIONS',
            export_morph=True, export_morph_normal=False, export_skins=True, export_yup=True, export_vertex_color='ACTIVE',
            export_def_bones=False, export_force_sampling=True, export_optimize_animation_size=True, export_materials='EXPORT')
while True:
    try:
        bpy.ops.export_scene.gltf(**opts)
        break
    except TypeError as e:
        bad = [k for k in opts if k in str(e) and k != 'filepath']
        if not bad:
            raise
        log('exporter has no option', bad[0])
        opts.pop(bad[0])
log('wrote', OUT_GLB, round(os.path.getsize(OUT_GLB) / 1048576, 2), 'MB')

# ====================================================================== previews
if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'VERTEX'
    sc.render.resolution_x, sc.render.resolution_y = 700, 900
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    def shot(name, at, frm, lens=50, ortho=None):
        cam.data.type = 'ORTHO' if ortho else 'PERSP'
        if ortho:
            cam.data.ortho_scale = ortho
        cam.data.lens = lens
        cam.location = frm
        cam.rotation_euler = (at - frm).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(PREVIEW, name + '.png')
        bpy.ops.render.render(write_still=True)
    mid_ = Vector((0, 0, HEIGHT / 2))
    krig.data.pose_position = 'REST'
    for nm, d in (('front', Vector((0, -5, 0))), ('side', Vector((-5, 0, 0))), ('back', Vector((0, 5, 0))), ('three_quarter', Vector((-3.5, -3.5, 0)))):
        shot('k_' + nm, mid_, mid_ + d, ortho=1.5)
    face = Vector((0, EYE_Y, EYE_Z - cm(3)))
    sc.render.resolution_x = sc.render.resolution_y = 600
    shot('k_face', face, face + Vector((0, -0.45, 0.02)), lens=85)
    shot('k_face34', face, face + Vector((-0.32, -0.32, 0.02)), lens=85)
    kb = skin.data.shape_keys.key_blocks
    for k in ('jaw_open', 'blink', 'mouth_smile', 'brow_down'):
        for x in kb:
            x.value = 1.0 if x.name == k else 0.0
        shot('k_face_' + k, face, face + Vector((0, -0.45, 0.02)), lens=85)
    for x in kb:
        x.value = 0
    krig.data.pose_position = 'POSE'
    sc.render.resolution_x, sc.render.resolution_y = 700, 900
    for clip in ('Idle', 'Walk'):
        krig.animation_data_create()
        krig.animation_data.action = bpy.data.actions[clip]
        if hasattr(krig.animation_data, 'action_slot') and bpy.data.actions[clip].slots:
            krig.animation_data.action_slot = bpy.data.actions[clip].slots[0]
        sc.frame_set(12)
        shot('k_%s_front' % clip, mid_, mid_ + Vector((0, -5, 0)), ortho=1.5)
        shot('k_%s_side' % clip, mid_, mid_ + Vector((-5, 0, 0)), ortho=1.5)
    log('previews in', PREVIEW)
