"""
The six people in the room in the narration of the Save-ARIA ending ("After ARIA got connected to
the mainland..."): three men and three women in suits and lab coats, nobody from the crew. Each is a
small file of their own, on Voss's skeleton, with his Idle clip and only the face morphs a shocked
face needs, for src/level3/ConferenceScene.js.

The men are Voss's body and head, the women Kessler's. What makes them other people is built here:
hair (a shell grown from their own scalp, so it follows the skull and the brows; a bun or a ponytail
on the head bone), a beard for one, the head's shape pushed about, their skin and clothes recoloured
in small textures (the badge and the fold detail blurred away), the bodies thinned.

Run (from the repo root), then compress with the last line:
  blender -b --factory-startup --python Blender/scripts/build_conference_people.py -- [name] [preview dir]
  npm run optimize-models -- conf-man-1.glb conf-man-2.glb conf-man-3.glb conf-woman-1.glb conf-woman-2.glb conf-woman-3.glb

Its FAMILY (old people and their young families, for render_ending_families.py; only the pictures
ship) go to a folder of your own instead, with a smile among their morphs:
  blender -b --factory-startup --python Blender/scripts/build_conference_people.py -- family <dir>
"""
import os, sys, math
import bpy, bmesh
import numpy as np
from mathutils import Vector

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
MODELS = os.path.join(ROOT, 'public', 'assets', 'models')
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
FAMILY_DIR = argv[1] if len(argv) > 1 and argv[0] == 'family' else None
ONLY = argv[0] if argv and argv[0] not in ('all', 'family') else None

KEEP_MORPHS = ('jaw_open', 'mouth_wide', 'mouth_frown', 'blink', 'brow_up', 'brow_inner_up')
TEX = 256            # the clothes, the hands
HEAD_TEX = 512       # the face

# clothes: what the base's white, shirt and trousers become. hair: which is built. shape: the head's
# proportions pushed (wide: jaw and cheeks; long: the face lengthened; brow: a heavier brow)
PEOPLE = {
    'conf-man-1': dict(base='voss', suit='#2b2f38', shirt='#e8e6e0', pants='#23262d', skin=(1.0, 0.93, 0.88), hair='short', hair_col='#8d8c88', brows='#6a6965', shape=dict(wide=0.5, long=0.1, brow=0.5)),
    'conf-man-2': dict(base='voss', suit='#efece4', shirt='#7d93a8', pants='#3c3f45', skin=(0.62, 0.45, 0.34), hair='fringe', hair_col='#8f8d87', brows='#3a2f28', shape=dict(wide=0.15, long=0.6, brow=0.1)),
    'conf-man-3': dict(base='voss', suit='#1f3250', shirt='#dfe5ea', pants='#1a2436', skin=(1.0, 0.88, 0.76), hair='parted', hair_col='#8a5b2e', brows='#6b4524', beard=True, shape=dict(wide=0.8, long=-0.2, brow=0.2)),
    'conf-woman-1': dict(base='kessler', suit='#f2efe8', shirt='#55606a', pants='#2d2f36', skin=(0.8, 0.66, 0.54), hair='bun', hair_col='#17130f', brows='#17130f', shape=dict(wide=0.3, long=-0.2)),
    'conf-woman-2': dict(base='kessler', suit='#5c1f2c', shirt='#ece4da', pants='#2a1a20', skin=(1.0, 0.92, 0.86), hair='bob', hair_col='#d8b56e', brows='#8c6e3f', shape=dict(wide=-0.2, long=0.5)),
    'conf-woman-3': dict(base='kessler', suit='#3a3d44', shirt='#d9dce0', pants='#26282d', skin=(0.46, 0.32, 0.24), hair='ponytail', hair_col='#120e0c', brows='#120e0c', shape=dict(wide=0.5, long=0.1)),
}
FAMILY = {
    'old-man': dict(base='voss', suit='#7b6a55', shirt='#e9e2d4', pants='#4a4640', skin=(0.98, 0.9, 0.86), hair='short', hair_col='#e8e6e0', brows='#d8d6d0', shape=dict(wide=0.2, long=0.5, brow=0.5)),
    'old-woman': dict(base='kessler', suit='#9c7f93', shirt='#efe7dc', pants='#4f4a4c', skin=(0.98, 0.9, 0.86), hair='bun', hair_col='#ecebe6', brows='#c9c7c2', shape=dict(wide=0.1, long=0.3)),
    'gran': dict(base='kessler', suit='#5f8078', shirt='#ece4d6', pants='#3e4442', skin=(0.5, 0.36, 0.28), hair='short', hair_col='#e6e4de', brows='#b8b6b0', shape=dict(wide=0.5, long=0.1)),
    'young-woman': dict(base='kessler', suit='#c4683a', shirt='#f0e8da', pants='#34405a', skin=(1.0, 0.9, 0.8), hair='bob', hair_col='#4a2f1c', brows='#3a2414', shape=dict(wide=-0.2, long=-0.1)),
    'young-man': dict(base='voss', suit='#3b6a8c', shirt='#ece8e0', pants='#2c3038', skin=(0.86, 0.68, 0.54), hair='short', hair_col='#241a14', brows='#241a14', shape=dict(wide=0.3, long=-0.3, brow=0.1)),
    'child': dict(base='kessler', suit='#e0b13c', shirt='#f4efe4', pants='#5c6f8c', skin=(1.0, 0.86, 0.74), hair='ponytail', hair_col='#6a3f1e', brows='#5a3518', shape=dict(wide=0.6, long=-0.8)),
}
FILES = {'voss': 'human_scientist_v2.glb', 'kessler': 'kessler.glb'}


def srgb(h):
    """As it is stored in the textures' pixels (encoded, as the file's are)."""
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def smooth(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def blur(a, r):
    """A box blur, three times over (a soft gaussian), wrapping nowhere."""
    for _ in range(3):
        for axis in (0, 1):
            a = sum(np.roll(a, k, axis) for k in range(-r, r + 1)) / (2 * r + 1)
    return a


def image_of(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            return n, n.image
    return None, None


def to_array(img):
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def from_array(name, arr):
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.pixels.foreach_set(arr.ravel())
    img.pack()
    return img


def small(img, size):
    c = img.copy()
    c.scale(size, size)
    a = to_array(c)
    bpy.data.images.remove(c)
    return a


def set_image(mat, arr):
    n, old = image_of(mat)
    n.image = from_array(mat.name + '_conf', arr)


def recolour_clothes(mat, whites, blues=None, darks=None, soft=2):
    """White cloth to its colour (its shading kept, softened: no badge, no lettering); on Kessler's
    one texture, the blue shirt and the dark trousers to theirs."""
    _, img = image_of(mat)
    a = small(img, TEX)
    rgb = a[..., :3]
    lum = rgb @ np.array([0.3, 0.6, 0.1])
    sat = rgb.max(-1) - rgb.min(-1)
    white = smooth(0.32, 0.55, lum) * (1 - smooth(0.06, 0.16, sat))
    shade = blur(lum, soft)
    out = np.empty_like(rgb)
    base = shade[..., None] / max(0.01, float(np.percentile(shade[white > 0.5], 80))) if (white > 0.5).any() else 1.0
    out[...] = np.clip(base, 0, 1.15) * whites
    if blues is not None:
        k = (1 - white)[..., None]
        blue = (smooth(0.02, 0.06, rgb[..., 2] - rgb[..., 0]) * smooth(0.2, 0.3, lum))[..., None]
        s = np.clip(shade[..., None] / max(0.01, float(np.percentile(shade[blue[..., 0] > 0.5], 70) if (blue > 0.5).any() else 0.2)), 0, 1.2)
        d = np.clip(shade[..., None] / 0.16, 0.75, 1.15)
        other = blue * s * blues + (1 - blue) * d * darks
        out = out * (1 - k) + other * k
    a[..., :3] = out
    set_image(mat, a)


def recolour_head(mat, skin, hair, brows, base, bald=False):
    """Their skin over the face's painted one. Kessler's red (scalp and brows) to their hair's colour;
    Voss's dark scalp to their hair's (or to skin, if they are bald), his brows to theirs. The eyes
    stay as they are."""
    _, img = image_of(mat)
    a = small(img, HEAD_TEX)
    rgb = a[..., :3]
    lum = rgb @ np.array([0.3, 0.6, 0.1])
    new = rgb * np.array(skin)
    shade = np.clip(lum[..., None] * 2 + 0.6, 0, 1.2)
    if base == 'kessler':
        painted = smooth(0.1, 0.25, rgb[..., 0] - 1.6 * rgb[..., 1])[..., None]     # (only her red is this red)
        a[..., :3] = new * (1 - painted) + hair * shade * painted
    else:
        # (the atlas's rows run bottom up: u, v as in the picture of it, v from its top)
        H, W = lum.shape
        rows, u = np.mgrid[0:H, 0:W]
        u, v = u / W, 1 - rows / H
        painted = (1 - smooth(0.05, 0.16, lum)) * (u < 0.72) * (v < 0.3)
        scalp = ((v < 0.115) | (((u < 0.125) | (u > 0.635)) & (v < 0.2)))
        out = new.copy()
        out[(painted > 0) & ~scalp] = (new * (1 - painted[..., None]) + brows * shade * painted[..., None])[(painted > 0) & ~scalp]
        if bald:
            face = new[int(H * 0.55), int(W * 0.37)]       # (a cheek's colour, over all the scalp)
            top = (v < 0.135) | (((u < 0.15) | (u > 0.61)) & (v < 0.22))
            out[top & (u < 0.72)] = face
        else:
            out[scalp & (painted > 0)] = (new * (1 - painted[..., None]) + hair * shade * painted[..., None])[scalp & (painted > 0)]
        a[..., :3] = out
    set_image(mat, a)


def flat_material(name, col, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough
    return m


def decimate(o, ratio):
    m = o.modifiers.new('thin', 'DECIMATE')
    m.ratio = ratio
    bpy.context.view_layer.objects.active = o
    for x in bpy.data.objects:
        x.select_set(False)
    o.select_set(True)
    bpy.ops.object.modifier_apply(modifier=m.name)


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def drop_morphs(o):
    keys = o.data.shape_keys
    if not keys:
        return
    for k in list(keys.key_blocks)[1:]:
        if k.name not in KEEP_MORPHS and not (FAMILY_DIR and k.name == 'mouth_smile'):
            o.shape_key_remove(k)


def noise(p, f):
    return (math.sin(p.x * f + 1.3) * math.sin(p.y * f * 0.8 + 0.4) + math.sin(p.z * f * 1.3 + 2.1) * 0.6)


def head_frame(o):
    """Where the head is, from the skin: its top, chin, centre and half width (mesh space)."""
    me = o.data
    idx = o.data.materials.find(next(m.name for m in o.data.materials if m.name.startswith('M_Head')))
    vs = set()
    for f in me.polygons:
        if f.material_index == idx:
            vs.update(f.vertices)
    co = np.array([me.vertices[i].co for i in vs])
    top = co[:, 2].max()
    # (the neck runs down from the head: the face is the top part; the head's height is about 1.1 widths)
    upper = co[co[:, 2] > top - 0.09]
    half = np.abs(upper[:, 0]).max()
    # the mouth, from the teeth: its height and half width
    t = next((i for i, m in enumerate(me.materials) if m.name.startswith('M_Teeth')), None)
    mv = set()
    for f in me.polygons:
        if f.material_index == t:
            mv.update(f.vertices)
    mc = np.array([me.vertices[i].co for i in mv])
    return dict(mz=float(mc[:, 2].mean()), mw=float(np.abs(mc[:, 0]).max()), top=float(top), half=float(half), cy=float((upper[:, 1].min() + upper[:, 1].max()) / 2), front=float(upper[:, 1].min()), back=float(upper[:, 1].max()), idx=idx, h=float(half * 2.5))


def shape_head(o, frame, wide=0.0, long=0.0, brow=0.0):
    """Push the head's proportions, in every morph alike (the morphs' differences are kept)."""
    keys = o.data.shape_keys.key_blocks
    top, h, half, front = frame['top'], frame['h'], frame['half'], frame['front']
    basis = np.empty(len(o.data.vertices) * 3)
    keys[0].data.foreach_get('co', basis)
    basis = basis.reshape(-1, 3)
    t = np.clip((top - basis[:, 2]) / h, 0, 1)          # 0 at the crown, 1 at the chin
    offs = np.zeros_like(basis)
    jaw = smooth(0.45, 0.8, t) * (1 - smooth(0.95, 1.2, t))
    offs[:, 0] = basis[:, 0] * (0.14 * wide * jaw + 0.03 * wide)
    offs[:, 2] = -long * 0.016 * smooth(0.35, 1.0, t)
    offs[:, 1] = (basis[:, 1] - frame['cy']) * (0.05 * long * jaw)
    if brow:
        front_k = smooth(0.0, 0.5, (frame['cy'] - basis[:, 1]) / max(1e-4, frame['cy'] - front))
        band = np.exp(-((t - 0.3) / 0.07) ** 2)
        offs[:, 1] -= 0.012 * brow * band * front_k
    for k in keys:
        a = np.empty(len(basis) * 3)
        k.data.foreach_get('co', a)
        k.data.foreach_set('co', (a.reshape(-1, 3) + offs).ravel())
    o.data.update()


def hairline(p, frame, kind):
    """How far inside the hair a point of the head is (positive: hair), in fractions of the head."""
    top, h, half, front, back = frame['top'], frame['h'], frame['half'], frame['front'], frame['back']
    d = (p.z - top) / h                                       # 0 at the crown, -1 at the chin
    fy = (p.y - front) / max(1e-4, back - front)              # 0 at the forehead, 1 at the back
    fx = abs(p.x) / max(1e-4, half)
    if kind == 'fringe':
        # bald on top: a band round the back and the sides only
        return min(-0.26 - 0.1 * (1 - fy) - d, d + 0.74, (fy - 0.58) * 1.2)
    if kind == 'beard':
        mz, mw = frame['mz'], frame['mw']
        x, z = abs(p.x), p.z - mz
        if fy > 0.62 or z > 0.03 or (x < mw * 1.1 and z > 0.018):
            return -1
        lips = (x / (mw * 1.2)) ** 2 + (z / 0.0095) ** 2 - 1      # (the mouth stays clear)
        return min((z + 0.044) / h, (0.03 - z) / h, 0.62 - fy, lips * 0.1)
    if kind == 'bob':
        low = -0.26 + (-0.62) * smooth(0.0, 0.45, fy)         # down to the jaw beside and behind the face
    else:
        nape = {'short': -0.56, 'parted': -0.58, 'bun': -0.6, 'ponytail': -0.6}[kind]
        low = -0.18 - 0.08 * fx + (nape + 0.2) * smooth(0.48, 0.8, fy)   # (down only behind the ears)
    return d - low


def grow(o, frame, kind, material, thick, lumps=1.0):
    """A shell of hair: the faces of the head's skin inside the hairline, copied and pushed out along
    their normals (in every morph, so it stays on when the brows go up), thinning to nothing at its
    edge, a little uneven so it catches the toon light in clumps."""
    me = o.data
    me.materials.append(material)
    mi = len(me.materials) - 1
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    layers = [bm.verts.layers.shape[k] for k in bm.verts.layers.shape.keys()]
    faces = [f for f in bm.faces if f.material_index == frame['idx'] and min(hairline(v.co, frame, kind) for v in f.verts) > -0.012]
    copy = bmesh.ops.duplicate(bm, geom=faces)
    new_faces = [g for g in copy['geom'] if isinstance(g, bmesh.types.BMFace)]
    new_verts = [g for g in copy['geom'] if isinstance(g, bmesh.types.BMVert)]
    bm.normal_update()
    for f in new_faces:
        f.material_index = mi
        f.smooth = True
    for v in new_verts:
        depth = hairline(v.co, frame, kind)
        k = float(smooth(0.0, 0.1, depth))
        push = v.normal * thick * ((0.02 if FAMILY_DIR else 0.12) + (0.98 if FAMILY_DIR else 0.88) * k) * (1 + lumps * 0.32 * noise(v.co, 95))
        v.co += push
        for l in layers:
            v[l] += push
    bm.to_mesh(me)
    bm.free()


def add_lump(arm, head_bone, name, material, verts_fn):
    """Hair on the head bone (a bun, a ponytail), rigid."""
    bm = bmesh.new()
    verts_fn(bm)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(material)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.parent = arm
    vg = o.vertex_groups.new(name=head_bone)
    vg.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    o.modifiers.new('Armature', 'ARMATURE').object = arm
    return o


def sphere(bm, centre, radius, scale=(1, 1, 1), subdiv=2):
    r = bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    for v in r['verts']:
        v.co = Vector((v.co.x * radius * scale[0], v.co.y * radius * scale[1], v.co.z * radius * scale[2])) + centre


def tube(bm, points, radii, sides=9):
    """A tapered tube along points (for the ponytail), closed at its end."""
    rings = []
    for i, (p, r) in enumerate(zip(points, radii)):
        ring = []
        for k in range(sides):
            a = 2 * math.pi * k / sides
            ring.append(bm.verts.new(p + Vector((math.cos(a) * r, math.sin(a) * r * 0.85, 0))))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
    bm.faces.new(rings[-1][::-1])
    bm.faces.new(rings[0])


def build(name, c):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(MODELS, FILES[c['base']]))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    head_bone = next(b.name for b in arm.data.bones if 'Head1' in b.name)
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name.startswith(('Icosphere', 'Hair', 'Glasses', 'Wound')):
            bpy.data.objects.remove(o)
    # his clips: Idle only, cut to one breath's worth of keys by the exporter's sampling
    idle = next(a for a in bpy.data.actions if a.name.startswith('Idle'))
    for a in list(bpy.data.actions):
        if a is not idle:
            bpy.data.actions.remove(a)
    arm.animation_data_create()
    arm.animation_data.action = idle
    tr = arm.animation_data.nla_tracks
    for t in list(tr):
        tr.remove(t)
    trk = tr.new()
    trk.name = 'Idle'
    trk.strips.new('Idle', int(idle.frame_range[0]), idle)
    arm.animation_data.action = None

    head = next(o for o in bpy.data.objects if o.type == 'MESH' and o.data.shape_keys)
    drop_morphs(head)
    # (Voss's head has hair cards of its own among its materials: his brows and stubble stay painted)
    for i, m in enumerate(head.data.materials):
        if m.name.startswith(('M_HairCards', 'M_LipSeal')):
            bm = bmesh.new()
            bm.from_mesh(head.data)
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == i], context='FACES')
            bm.to_mesh(head.data)
            bm.free()

    suit, shirt, pants = srgb(c['suit']), srgb(c['shirt']), srgb(c['pants'])
    for o in [x for x in bpy.data.objects if x.type == 'MESH']:
        for m in o.data.materials:
            n = m.name.split('.')[0]
            if n == 'M_Coat':
                recolour_clothes(m, suit, soft=12 if FAMILY_DIR else 3)   # (their clothes: no badge)
            elif n == 'M_Shirt':
                recolour_clothes(m, shirt)
            elif n == 'M_Pants':
                recolour_clothes(m, pants, soft=3)
            elif n == 'M_Clothes':
                recolour_clothes(m, suit, shirt, pants)
            elif n == 'M_Hands':
                _, img = image_of(m)
                a = small(img, TEX)
                a[..., :3] *= np.array(c['skin'])
                set_image(m, a)
            elif n == 'M_Head':
                recolour_head(m, c['skin'], srgb(c['hair_col']), srgb(c['brows']), c['base'], bald=c['hair'] == 'fringe')

    # (the family are not staff: the ID badge off the shirt's mesh, where it is a part of its own)
    if FAMILY_DIR:
        for o in [x for x in bpy.data.objects if x.type == 'MESH' and x.name.startswith('Shirt')]:
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bm.verts.ensure_lookup_table()
            seen, parts = set(), []
            for v in bm.verts:
                if v in seen:
                    continue
                part, todo = [], [v]
                seen.add(v)
                while todo:
                    u = todo.pop()
                    part.append(u)
                    for e in u.link_edges:
                        w = e.other_vert(u)
                        if w not in seen:
                            seen.add(w)
                            todo.append(w)
                parts.append(part)
            parts.sort(key=len, reverse=True)
            bmesh.ops.delete(bm, geom=[v for part in parts[1:] for v in part], context='VERTS')
            bm.to_mesh(o.data)
            bm.free()

    # bodies thinned (no morphs on them)
    parts = [o for o in bpy.data.objects if o.type == 'MESH' and o is not head]
    for o in parts:
        n = o.name.split('.')[0]
        if n == 'Eyes':
            continue
        if n == 'Hands':
            decimate(o, 0.28 if len(o.data.polygons) > 3000 else 0.75)
        elif len(o.data.polygons) > 1600:
            decimate(o, 0.3)

    frame = head_frame(head)
    print(name, 'head', {k: round(v, 3) for k, v in frame.items()})
    shape_head(head, frame, **c['shape'])
    hair = flat_material('M_Hair', srgb(c['hair_col']) ** 2.2, 0.6)
    kind = c['hair']
    thick = {'short': 0.0065, 'fringe': 0.005, 'parted': 0.0105, 'bun': 0.0075, 'ponytail': 0.0075, 'bob': 0.016}[kind] * frame['h'] / 0.2
    grow(head, frame, kind, hair, thick)
    if c.get('beard'):
        grow(head, frame, 'beard', hair, 0.005 * frame['h'] / 0.2, lumps=0.6)
    h, top, cy, back = frame['h'], frame['top'], frame['cy'], frame['back']
    if kind == 'bun':
        add_lump(arm, head_bone, 'HairBun', hair, lambda bm: sphere(bm, Vector((0, back + 0.1 * h, top - 0.14 * h)), 0.15 * h))
    if kind == 'ponytail':
        pts = [Vector((0, back + d * h, top - z * h)) for d, z in ((-0.02, 0.26), (0.1, 0.32), (0.14, 0.56), (0.12, 0.8), (0.1, 1.02))]
        add_lump(arm, head_bone, 'HairTail', hair, lambda bm: tube(bm, pts, [0.06 * h, 0.085 * h, 0.08 * h, 0.06 * h, 0.018 * h]))

    # everything skinned, sharing one armature; the file
    bpy.ops.object.select_all(action='SELECT')
    out = os.path.join(FAMILY_DIR or MODELS, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_force_sampling=True, export_frame_step=4, export_skins=True, export_morph=True, export_morph_normal=False,
                              export_image_format='WEBP', export_image_quality=72, export_apply=False)
    print('wrote', out, os.path.getsize(out) // 1024, 'KB')


for name, c in (FAMILY if FAMILY_DIR else PEOPLE).items():
    if not ONLY or ONLY == name:
        build(name, c)
