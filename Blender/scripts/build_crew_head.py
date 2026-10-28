"""
Voss's crewmates (Lindqvist, Navarro; Park when a model is supplied): the head of a supplied
Sketchfab model on a body of the game's (Voss's for Navarro; Kessler's, kessler.glb, for Lindqvist),
with that body's skeleton and clips and Voss's face morphs, the way Kessler was made
(build_kessler_from_female.py, which this generalises; Kessler keeps her own script and body).

  lindqvist  "Female Character athletic woman" by 3dUVpro, CC-BY-4.0
             https://sketchfab.com/3d-models/female-character-athletic-woman-0b2bdf1b3b1f41d4b3faa7a3bccc0842
             (Blender/assets/lindqvist.glb): one baked sculpt (hair, painted eyes and closed lips
             are all one surface on a scattered texture atlas)
  park       "FREE DOWNLOAD Athletic African man walking 223" by deep3dstudio, CC-BY-4.0
             https://sketchfab.com/3d-models/free-download-athletic-african-man-walking-223-f9a8e3b108f04e998815593f78f163b1
             (Blender/assets/park.glb): a body scan, one surface (as Lindqvist's), close-cropped hair
  navarro    "Man base mesh" by BlakkMato, CC-BY-4.0
             https://sketchfab.com/3d-models/man-base-mesh-a870a28384fb428da535b6a816fea73e
             (Blender/assets/navarro.glb): a low base mesh, hair and beard cards, painted lips
  Both get the eyeballs of "Angelica" by Sell Asset Store, CC-BY-4.0 (Blender/assets/angelica_head.glb,
  as Kessler's), their irises recoloured. All credited in CREDITS.md.

What is kept and what changes (Blender axes: z up, the face looks toward -y):
  - the body as it is (Voss's coat, sleeves, shirt, trousers and hands; or Kessler's clothes and
    hands), on its own skin weights; Voss's glasses (clear lenses) for Lindqvist; only the colours change: each
    character's coat (DrownedCrew.js), shirt and trousers, and the hands take the new face's skin
  - the body's head (and Voss's hair and wound, Kessler's hair and eyes) go. The new head is built
    in Voss's space (his face's morphs and his mouth are measured there): scaled so its eyes are as
    far apart as his, at his eyes' height, its nose tip as far forward. Below it, its neck is drawn
    onto the body's old neck (neck_fit.py: gradually, from under the chin at the front and from
    below the skull at the back, so the borrowed neck never stands out over the collar) and cut
    off inside the collar; then it is moved onto the body (Kessler's head is smaller than Voss's)
  - the head is thinned, and its colours baked into one compact texture
  - eyes: the painted ones (Lindqvist) are cut out to the lid line; Angelica's eyeballs behind
  - mouth: a slit cut along the lip line (the sources' lips are closed or only painted), and Voss's
    own mouth (gums, tongue, throat and teeth, with their jaw_open motion) moved in behind it
  - Voss's face morphs (jaw_open, blink, ...) carried over as for Kessler; beard cards ride the
    skin under them
  - skinned as his head was (each vertex takes the weights of his head's nearest vertices)

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_crew_head.py -- <name> \\
      [public/assets/models/<name>.glb] [preview_dir]
then compress:  node scripts/optimize-models.mjs <name>.glb
"""
import sys, os, math
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from neck_fit import neck_rings, neck_at, fit_neck, ring

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
MODELS = os.path.join(ROOT, 'public', 'assets', 'models')
ASSETS = os.path.join(ROOT, 'Blender', 'assets')
VOSS = os.path.join(MODELS, 'human_scientist_v2.glb')
KESSLER = os.path.join(MODELS, 'kessler.glb')
ANGELICA = os.path.join(ASSETS, 'angelica_head.glb')

KEEP_CLIPS = ('Idle', 'Walk')
MIN_MOVE = 1e-4            # (smaller morph motions are left out: unseen, and they fill the file)
BLINK_GAIN = 1.25          # (his lids, carried over, stopped just short of closing these eyes)

# Voss's face (build_voss_face.py), Blender axes
V_EYE_Z, V_EYE_X, V_MOUTH_Z, V_CORNER_X, V_NOSE_Y, V_LIP_Y = 1.300, 0.0225, 1.2445, 0.021, -0.079, -0.066

# The bodies a head goes on, and their necks (heights below the eyes, in the body's own units):
# the new neck is drawn onto the body's from `front` (under the chin) and `back` (below the skull)
# down to `fit`, and cut at `cut`, inside the collar. flare: below `fit` it follows the body's old
# neck out where that widens (Kessler's open collar showed her skin there)
BASES = {
    'voss': dict(front=0.085, back=0.035, fit=0.102, cut=0.155, flare=False),
    'kessler': dict(front=0.077, back=0.035, fit=0.100, cut=0.127, flare=True),
}

# Each source in its own units, once centred (x - centre) and scaled (unit): z up, the face
# toward -y. eyes: the eyeballs' centres (x, y, z; y None = found on the surface) and radius;
# lips: the lip line's height at the middle, the corners' half-width, and how far the corners sit
# above it (negative: below); crease: find the lip line's curve on the surface instead
CHARS = {
    'lindqvist': dict(
        src='lindqvist.glb', centre=-0.1268, unit=1.0, scan=True,
        eyes=((-0.0350, None, 0.7905), (0.0365, None, 0.7905)), eye_r=0.0135,
        aperture=(0.0136, 0.0047), own_blink=True, teeth_w=1.0,                  # the painted eyes' openings (half width, half height), cut out
        lips=(0.7165, 0.0250, -0.0012), crease=True,
        base='kessler',                             # (Kessler's body, recoloured)
        hair_cut=0.115,                             # (below the eyes, in the body's units) her long hair ends here, at the collar
        decimate=0.4,
        iris=('#3F5A57', '#8FA89C'),                # grey-green, as hers
        coat='#3B4A5E', shirt='#D9D5CC', tie='#4E6178', pants='#2B2E35', glasses=True,
    ),
    'navarro': dict(
        src='navarro.glb', centre=-577.2, unit=0.01,
        eyes=((-0.02888, -0.0619, 1.7332), (0.03355, -0.0619, 1.7332)), eye_r=0.0150,
        lips=(1.6614, 0.0290, 0.0), crease=False,
        subdivide=1, base='voss',
        iris=('#2E4F7A', '#7FA3CF'),                # blue, as his
        coat='#5A4A32', shirt='#DCD3C2', pants='#2E2B28', glasses=False,
    ),
    'park': dict(
        src='park.glb', centre=-1.65, unit=0.01, scan=True,
        eyes=((-0.0351, None, 1.5356), (0.0357, None, 1.5356)), eye_r=0.0135,
        aperture=(0.0140, 0.0055), own_blink=True,
        turn=(5.7, -0.13),                          # (his head is turned a little in the scan: degrees, and where the eyes are front to back)
        slim_neck=True, nape=0.044, drop=0.02, shoulders=((0.075, 0.040, 0.012), 0.050), head_scale=1.07,
        # (slim_neck: only what lies inside the body's own neck column is kept as neck, his shoulders
        # rise to his jaw; shoulders: below that height (in front of / behind y) and wider than that,
        # his scanned shoulders go)
        lips=(1.4660, 0.0270, 0.0), crease=True,
        decimate=0.7, base='voss',
        iris=('#24160E', '#5A3B26'),                # dark brown, as his
        coat='#46523F', shirt='#C9D3DA', pants='#2A2C2E', glasses=False,
    ),
}

NAME = (argv[0] if argv else 'lindqvist').lower()
C = CHARS[NAME]
BASE = C.get('base', 'voss')
OUT = argv[1] if len(argv) > 1 and argv[1] else os.path.join(MODELS, NAME + '.glb')
PREVIEW = argv[2] if len(argv) > 2 else None


def log(*a):
    print(f'[{NAME}]', *a, flush=True)


def smooth(a, b, x):
    t = np.clip((np.asarray(x, float) - a) / (b - a), 0.0, 1.0)
    r = t * t * (3 - 2 * t)
    return float(r) if np.ndim(r) == 0 else r


def gauss(*terms):
    return math.exp(-sum(t * t for t in terms))


def select_only(o):
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def join(objs, name):
    select_only(objs[0])
    for o in objs[1:]:
        o.select_set(True)
    bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


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
    bm.free()
    return comp, c


def coords(o):
    a = np.empty(len(o.data.vertices) * 3)
    o.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def import_meshes(path, **kw):
    """Import a glb; its meshes with their transforms applied, unparented (the rest removed)"""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path, **kw)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = []
    for o in new:
        if o.type == 'MESH':
            o.data.transform(o.matrix_world)
            o.parent = None
            o.matrix_world = Matrix()
            meshes.append(o)
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o)
    return meshes


# ====================================================================== textures (as Kessler's)
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
    img.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
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


def raster(o, size, islands=False):
    """Where each texel of the object's texture lies on it: the 3D point, whether it is used, and
    (islands=True) the triangle's UV island"""
    H = W = size
    pos = np.zeros((H, W, 3), np.float32)
    filled = np.zeros((H, W), bool)
    isl = np.full((H, W), -1, np.int32)
    me = o.data
    tri_isl = uv_islands(me) if islands else None
    me.calc_loop_triangles()
    uv = me.uv_layers['UVMap'].data
    co = coords(o)
    for ti, t in enumerate(me.loop_triangles):
        T = np.array([uv[li].uv for li in t.loops], np.float64) * [W, H] - 0.5
        P = co[list(t.vertices)]
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
        pos[ys[inside], xs[inside]] = L @ P
        filled[ys[inside], xs[inside]] = True
        if islands:
            isl[ys[inside], xs[inside]] = tri_isl[ti]
    return (pos, filled, isl) if islands else (pos, filled)


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


def sample(img_arr, uv):
    """Bilinear lookup of an (h, w, c) image at uv (n, 2), wrapping round"""
    h, w = img_arr.shape[:2]
    x = (uv[:, 0] % 1.0) * w - 0.5
    y = (uv[:, 1] % 1.0) * h - 0.5
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    x0, x1, y0, y1 = x0 % w, (x0 + 1) % w, y0 % h, (y0 + 1) % h
    return (img_arr[y0, x0] * (1 - fx) * (1 - fy) + img_arr[y0, x1] * fx * (1 - fy)
            + img_arr[y1, x0] * (1 - fx) * fy + img_arr[y1, x1] * fx * fy)


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


def set_colours(o, cols):
    """Per-vertex colours (sRGB) in the layer the materials read ('Col')"""
    for a in list(o.data.color_attributes):
        o.data.color_attributes.remove(a)
    a = o.data.color_attributes.new('Col', 'BYTE_COLOR', 'POINT')
    a.data.foreach_set('color_srgb', np.concatenate([cols, np.ones((len(cols), 1), np.float32)], 1).ravel())


def new_uvs(o, margin=0.004):
    """Replace the object's UVs with one compact layout ('UVMap')"""
    me = o.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name='UVMap')
    select_only(o)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0)
    bpy.ops.object.mode_set(mode='OBJECT')


def bake_from(dst, src, src_img_arr, size):
    """dst's new texture: each texel takes the colour of the nearest point of src (its own UVs into
    src_img_arr). Returns the image array and which texels are used."""
    pos, filled = raster(dst, size)
    sme = src.data
    sme.calc_loop_triangles()
    tris = list(sme.loop_triangles)
    sco = coords(src)
    bvh = BVHTree.FromPolygons([Vector(p) for p in sco], [tuple(t.vertices) for t in tris])
    suv = sme.uv_layers['UVMap'].data
    tri_uv = np.array([[suv[l].uv[:] for l in t.loops] for t in tris])
    tri_co = sco[np.array([t.vertices[:] for t in tris])]
    ys, xs = np.nonzero(filled)
    pts = pos[ys, xs]
    loc = np.empty_like(pts)
    ti = np.empty(len(pts), int)
    for k, p in enumerate(pts):
        l, _, i, _ = bvh.find_nearest(Vector(p))
        loc[k] = l
        ti[k] = i
    a, b, c = tri_co[ti, 0], tri_co[ti, 1], tri_co[ti, 2]
    v0, v1, v2 = b - a, c - a, loc - a
    d00, d01, d11 = (v0 * v0).sum(1), (v0 * v1).sum(1), (v1 * v1).sum(1)
    d20, d21 = (v2 * v0).sum(1), (v2 * v1).sum(1)
    den = d00 * d11 - d01 * d01
    den[np.abs(den) < 1e-20] = 1e-20
    wb = (d11 * d20 - d01 * d21) / den
    wc = (d00 * d21 - d01 * d20) / den
    wa = 1 - wb - wc
    uv = tri_uv[ti, 0] * wa[:, None] + tri_uv[ti, 1] * wb[:, None] + tri_uv[ti, 2] * wc[:, None]
    out = np.zeros((size, size, src_img_arr.shape[2]), np.float32)
    out[ys, xs] = sample(src_img_arr, uv)
    return dilate(out, filled), filled


def recolour(img, colour, keep_dark=0.0, k=0.7):
    """An image repainted in one colour, its shading (the broad folds) kept; texels darker than
    keep_dark stay as they were (shoes, belts)"""
    a = pixels(img)[..., :3]
    L = lum(blur(a, 1))
    med = float(np.median(L)) or 1e-4
    shade = np.clip(1 + k * (L / med - 1), 0.55, 1.35)
    out = rgb(colour)[None, None] * shade[..., None]
    if keep_dark:
        out = mix(out, a, np.clip((keep_dark - L) / (keep_dark * 0.4), 0, 1))
    img.pixels.foreach_set(np.concatenate([np.clip(out, 0, 1), np.ones(out.shape[:2] + (1,), np.float32)], 2).ravel())
    img.pack()


def decimate(o, ratio):
    select_only(o)
    mod = o.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = ratio
    bpy.ops.object.modifier_apply(modifier=mod.name)


# ====================================================================== Voss, and the body
# Voss always: his face's morphs and his mouth come from him. The body (and its skeleton, clips and
# skin weights) is his, or Kessler's.
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=VOSS)
vrig = bpy.data.objects['Scientist_Rig']
vhead = bpy.data.objects['Head']
vhead.name = 'V_Head'
vrig.data.pose_position = 'REST'
bpy.context.view_layer.update()
vco = np.array([vhead.matrix_world @ v.co for v in vhead.data.vertices])

# his teeth, with their morphs and weights (moved in below)
mouth = vhead.copy()
mouth.data = vhead.data.copy()
bpy.context.collection.objects.link(mouth)
mouth.name = 'V_Mouth'
keep_mats = {i for i, m in enumerate(mouth.data.materials) if m.name == 'M_Teeth'}      # (his lining belongs to his own lips: a pocket of this mouth's own is made below)
bm = bmesh.new()
bm.from_mesh(mouth.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index not in keep_mats], context='FACES')
bm.to_mesh(mouth.data)
bm.free()
mouth.data.transform(mouth.matrix_world, shape_keys=True)
mouth.matrix_world = Matrix()

if BASE == 'voss':
    rig = vrig
    bhead = vhead                                   # (the body's own head: its neck, its skin weights)
    BODY_PARTS = ['Coat_Torso', 'Sleeves', 'Shirt', 'Pants']
    body = {n: bpy.data.objects[n] for n in BODY_PARTS + ['Hands']}
    glasses = bpy.data.objects['Glasses']
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and (o.name in ('Hair', 'Wound') or o.name.startswith('Icosphere')):
            bpy.data.objects.remove(o)
    B2V = Matrix()
else:
    # his body, rig and clips go (his glasses stay, for Lindqvist: Kessler has none); Kessler's come
    # in (her head stays until the end, for its neck and its weights; her hair and eyes go)
    glasses = bpy.data.objects['Glasses']
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o not in (vhead, mouth, glasses):
            bpy.data.objects.remove(o)
    glasses.data.transform(glasses.matrix_world)
    for o in (vhead, mouth, glasses):
        o.parent = None
        o.matrix_world = Matrix()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for m in list(vhead.modifiers):
        vhead.modifiers.remove(m)
    bpy.data.objects.remove(vrig)
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=KESSLER)
    new = {o.name.split('.')[0]: o for o in bpy.data.objects if o not in before}
    rig = next(o for o in new.values() if o.type == 'ARMATURE')
    bhead, keyes = new['Head'], new['Eyes']
    BODY_PARTS = ['Body']
    body = {'Body': new['Body'], 'Hands': new['Hands']}
    for o in list(new.values()):
        if o.type == 'EMPTY' or o.name.startswith('Icosphere'):
            bpy.data.objects.remove(o)
    bpy.data.objects.remove(new['Hair'])
    rig.data.pose_position = 'REST'
    bpy.context.view_layer.update()
    # her eyes, eye spacing and nose: the head is built in Voss's space, then moved onto her
    kco = np.array([keyes.matrix_world @ v.co for v in keyes.data.vertices])
    kl, kr = kco[kco[:, 0] < 0].mean(0), kco[kco[:, 0] > 0].mean(0)
    k_eye_z, k_eye_x = float((kl[2] + kr[2]) / 2), float((kr[0] - kl[0]) / 2)
    bco_ = np.array([bhead.matrix_world @ v.co for v in bhead.data.vertices])
    kprof = bco_[(np.abs(bco_[:, 0]) < 0.004) & (bco_[:, 2] < k_eye_z - 0.01) & (bco_[:, 2] > k_eye_z - 0.05)]
    k_nose_y = float(kprof[:, 1].min())
    sB = V_EYE_X / k_eye_x
    B2V = Matrix.Translation((0, V_NOSE_Y, V_EYE_Z)) @ Matrix.Scale(sB, 4) @ Matrix.Translation((0, -k_nose_y, -k_eye_z))
    bpy.data.objects.remove(keyes)
    # his glasses onto her (out of his space into hers), on her skeleton (it has his glasses' bones)
    glasses.data.transform(B2V.inverted())
    for m in list(glasses.modifiers):
        glasses.modifiers.remove(m)
    glasses.parent = rig
    glasses.matrix_world = Matrix()
    glasses.modifiers.new('Armature', 'ARMATURE').object = rig
    log(f'on Kessler: eyes z {k_eye_z:.4f} x {k_eye_x:.4f}, nose y {k_nose_y:.4f}; her space to his x{sB:.4f}')
V2B = B2V.inverted()
sB = B2V.to_scale()[0]
if not C.get('glasses') and glasses:
    bpy.data.objects.remove(glasses)
    glasses = None
for a in list(bpy.data.actions):
    if a.name.split('.')[0] not in KEEP_CLIPS:
        bpy.data.actions.remove(a)
for a in bpy.data.actions:
    a.name = a.name.split('.')[0]
HEAD_BONE = next(b.name for b in rig.data.bones if 'Head1' in b.name)
bco = np.array([bhead.matrix_world @ v.co for v in bhead.data.vertices])          # (the body's head, its own space)
bco_v = np.array([B2V @ Vector(p) for p in bco])                                   # (the same, in Voss's)

# the body's neck, in Voss's space: heights, and its cross-sections from the cut up to `fit`
NB = BASES[BASE]
NB = dict(NB, **C.get('neck', {}))
NECK_TOP, NECK_BACK, NECK_FIT, NECK_CUT = (V_EYE_Z - NB[k] * sB for k in ('front', 'back', 'fit', 'cut'))
NZS, NRS = neck_rings(bco_v, NECK_CUT, NECK_FIT, flare=NB['flare'])
log('the body\'s neck at', round(NECK_FIT, 4), np.round(NRS[-1], 4))


# ====================================================================== the source head
src = import_meshes(os.path.join(ASSETS, C['src']), merge_vertices=True)
NORM = Matrix.Scale(C['unit'], 4) @ Matrix.Translation((-C['centre'], 0, 0))
if C.get('turn'):
    # (a scan with the head turned a little: straightened, about the point between the eyes)
    ex, ey, ez = (C['eyes'][0][0] + C['eyes'][1][0]) / 2, C['turn'][1], C['eyes'][0][2]
    NORM = (Matrix.Translation((ex, ey, ez)) @ Matrix.Rotation(math.radians(C['turn'][0]), 4, 'Z')
            @ Matrix.Translation((-ex, -ey, -ez)) @ NORM)
for o in src:
    o.data.transform(NORM)


def src_image(o):
    img = base_image(o.data.materials[0])
    return pixels(img), img


def piece_bbox(co, comp, k):
    p = co[comp == k]
    return p.min(0), p.max(0)


hair_objs, cards = [], None
if C.get('scan'):                                   # (one surface: join its pieces, weld them)
    skin = join(src, 'N_Skin')
    bm = bmesh.new()
    bm.from_mesh(skin.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(skin.data)
    bm.free()
    for u in [u for u in skin.data.uv_layers if u.name != 'UVMap']:
        skin.data.uv_layers.remove(u)
else:
    by = {o.name: o for o in src}
    skin = by['Object_4']
    skin.name = 'N_Skin'
    cards = by['Object_5']
    cards.name = 'N_Beard'
    hair_objs = [by['Object_%d' % i] for i in range(6, 12)]
    for k in ('Object_2', 'Object_3'):                      # (the shorts; the nails and ear bits)
        bpy.data.objects.remove(by[k])
    # his own eyeballs (two small pieces of the body mesh) go: Angelica's take their place
    comp, n = components(skin.data)
    sizes = np.bincount(comp)
    bm = bmesh.new()
    bm.from_mesh(skin.data)
    bm.verts.ensure_lookup_table()
    main = int(np.argmax(sizes))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if comp[v.index] != main], context='VERTS')
    bm.to_mesh(skin.data)
    bm.free()
skin_img_arr, skin_img = src_image(skin)
log('source skin', len(skin.data.vertices), 'vertices; texture', skin_img.size[:])

# ---------------------------------------------------------------- landmarks, then the fit onto Voss
EYES_SRC = [Vector((e[0], e[1] if e[1] is not None else 0, e[2])) for e in C['eyes']]
eye_mid = (EYES_SRC[0] + EYES_SRC[1]) / 2
sco = coords(skin)
prof = sco[(np.abs(sco[:, 0] - eye_mid.x) < 0.006) & (sco[:, 2] < eye_mid.z) & (sco[:, 2] > C['lips'][0])]
nose_y = float(prof[:, 1].min())
s = 2 * V_EYE_X / (EYES_SRC[1].x - EYES_SRC[0].x) * C.get('head_scale', 1.0)    # (head_scale: a narrow face's head came out small)
FIT = Matrix.Translation((0, V_NOSE_Y, V_EYE_Z)) @ Matrix.Scale(s, 4) @ Matrix.Translation((-eye_mid.x, -nose_y, -eye_mid.z))
for o in [skin] + hair_objs + ([cards] if cards else []):
    o.data.transform(FIT)
log(f'scaled {s:.4f}, nose y {nose_y:.4f}')


def fit(p):
    return FIT @ Vector(p)


EYE_R = C['eye_r'] * s
MOUTH_Z = V_EYE_Z + (C['lips'][0] - eye_mid.z) * s
CORNER_X = C['lips'][1] * s
CORNER_LIFT = C['lips'][2] * s



def surface_bvh(o):
    me = o.data
    me.calc_loop_triangles()
    return BVHTree.FromPolygons([Vector(p) for p in coords(o)], [tuple(t.vertices) for t in me.loop_triangles])


def front_y(bvh, x, z):
    hit = bvh.ray_cast(Vector((x, -1.0, z)), Vector((0, 1, 0)))
    return hit[0].y if hit[0] else None


sbvh = surface_bvh(skin)
EYES = []
for e, es in zip(C['eyes'], EYES_SRC):
    p = fit(es)
    if e[1] is None:                                # (her eyes are painted on the surface: the ball sits behind them)
        p.y = front_y(sbvh, p.x, p.z) + EYE_R
    EYES.append(p)
log('eyes', [tuple(round(c, 4) for c in e) for e in EYES], 'r', round(EYE_R, 4))

# ---------------------------------------------------------------- which of her vertices are hair (a pale grey, not her pale pink skin)
def vertex_colours(o, img_arr):
    me = o.data
    uv = me.uv_layers['UVMap'].data
    acc = np.zeros((len(me.vertices), 3))
    cnt = np.zeros(len(me.vertices))
    li = np.array([l.vertex_index for l in me.loops])
    uvs = np.array([d.uv[:] for d in uv])
    col = sample(img_arr[..., :3], uvs)
    np.add.at(acc, li, col)
    np.add.at(cnt, li, 1)
    return acc / np.maximum(cnt, 1)[:, None]


vcol = vertex_colours(skin, skin_img_arr)
sat = vcol.max(1) - vcol.min(1)
hairy = (sat < 0.09) & (vcol[:, 0] - vcol[:, 1] < 0.045) & (lum(vcol) > 0.42) if C.get('hair_cut') else np.zeros(len(vcol), bool)

# ---------------------------------------------------------------- what is below the head cut away, then the neck onto the body's
# Below the chin only the new neck (a column a little wider than its own) is kept, and hair; the
# shoulders, chest and the rest go. Then the neck is drawn onto the body's (neck_fit.py).
co = coords(skin)
SRC_ZS = np.arange(NECK_CUT - 0.01, NECK_TOP + 0.006, 0.004)
src_rings = [ring(co[~hairy], z, xmax=0.06) for z in SRC_ZS]
SRC_ZS = np.array([z for z, r in zip(SRC_ZS, src_rings) if r is not None])
SRC_RS = np.array([r for r in src_rings if r is not None], float)
if C.get('slim_neck'):
    SRC_ZS, SRC_RS = NZS, NRS                       # (his own measure takes in his shoulders)
in_column = np.zeros(len(co), bool)
for i, p in enumerate(co):
    if p[2] > NECK_TOP + 0.01 or hairy[i]:
        continue
    cy, rx, ry = neck_at(SRC_ZS, SRC_RS, p[2])
    if p[1] > cy and not C.get('hair_cut') and not C.get('slim_neck'):
        in_column[i] = abs(p[0]) < rx * 1.3         # (the nape, by its width only: it slopes back to the shoulders, and is drawn in, not cut)
    else:
        in_column[i] = ((p[0] / (rx * 1.25)) ** 2 + ((p[1] - cy) / (ry * 1.25)) ** 2) < 1
    if C.get('hair_cut') and p[1] > cy + ry * 0.6:
        in_column[i] = False                        # (behind the neck: her hair lies there, it is not to be drawn in)
HAIR_CUT = V_EYE_Z - C['hair_cut'] * sB if C.get('hair_cut') else None
if HAIR_CUT:
    # behind the neck it is all hair (some of hers there is in shadow, and read as skin); in front
    # of it, below the jaw, the pale pieces are her top's straps, not hair
    for i, p in enumerate(co):
        if NECK_CUT < p[2] < NECK_TOP and not in_column[i]:
            cy, rx, ry = neck_at(SRC_ZS, SRC_RS, p[2])
            if p[1] > cy + ry * 0.6 and p[2] > HAIR_CUT and abs(p[0]) < rx * 1.6:
                hairy[i] = True
            elif p[1] < cy + ry * 0.5:
                hairy[i] = False                    # (beside and in front of the neck: her shoulders, under the hair's ends)
cut = (co[:, 2] < NECK_CUT) | ((co[:, 2] < NECK_TOP) & ~in_column & ~hairy)
if C.get('slim_neck'):
    # (all of it is pressed onto Voss's neck below: only what is well outside it goes, so his neck
    # reaches down into the coat all round; trimmed closer, the side of it left a gap to see through)
    _cy, _rx, _ry = NRS[-1]
    cut = (co[:, 2] < NECK_CUT) | ((co[:, 2] < NECK_TOP) & (((co[:, 0] / _rx) ** 2 + ((co[:, 1] - _cy) / _ry) ** 2) > 2.6 ** 2))
elif C.get('shoulders'):
    # (out at the sides: his shoulders rise to his ears behind the jaw; in front of that, only below
    # the jaw, so its corners stay)
    (szf, szb, yb), sx = C['shoulders']
    zs_ = V_EYE_Z - np.where(co[:, 1] > yb, szb, szf) * sB
    cut |= (co[:, 2] < zs_) & (np.abs(co[:, 0]) > np.where(co[:, 1] < NRS[-1][0], sx, sx * 0.88))
if C.get('nape') and not C.get('slim_neck'):
    # (behind and beside his neck, below his skull: his tank top's back and his shoulders, outside
    # the column; not in front, where his jaw is)
    zn = V_EYE_Z - C['nape'] * sB
    for i, p in enumerate(co):
        if p[2] < zn and not hairy[i]:
            cy, rx, ry = neck_at(NZS, NRS, p[2])
            if p[1] > cy - 0.25 * ry and ((p[0] / (rx * 1.25)) ** 2 + ((p[1] - cy) / (ry * 1.25)) ** 2) > 1:
                cut[i] = True
if HAIR_CUT:
    cut |= hairy & (co[:, 2] < HAIR_CUT)
bm = bmesh.new()
bm.from_mesh(skin.data)
bm.verts.ensure_lookup_table()
is_hair = bm.verts.layers.int.new('hair')
for v in bm.verts:
    v[is_hair] = int(hairy[v.index])
bmesh.ops.delete(bm, geom=[v for v in bm.verts if cut[v.index]], context='VERTS')
# what is left of the shoulders, the chest and her back (not joined to the head) goes too
bm.verts.ensure_lookup_table()
seen = set()
pieces = []
for v in bm.verts:
    if v.index in seen:
        continue
    stack, piece = [v], []
    seen.add(v.index)
    while stack:
        x = stack.pop()
        piece.append(x)
        for e in x.link_edges:
            y = e.other_vert(x)
            if y.index not in seen:
                seen.add(y.index)
                stack.append(y)
    pieces.append(piece)
pieces.sort(key=len, reverse=True)
bmesh.ops.delete(bm, geom=[v for p in pieces[1:] for v in p], context='VERTS')
n = fit_neck(bm.verts, NZS, NRS, NECK_TOP, NECK_BACK, NECK_FIT, keep=lambda v: not v[is_hair])
# (smoothed where it was drawn in hardest: its surface creases; then back onto the body's neck)
nv = [v for v in bm.verts if v.co.z < NECK_FIT + 0.006 and not v[is_hair]]
for _ in range(8 if not C.get('slim_neck') else 20):
    bmesh.ops.smooth_vert(bm, verts=nv, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=False)
fit_neck(nv, NZS, NRS, NECK_FIT + 0.006, NECK_FIT + 0.006, NECK_FIT)
if C.get('slim_neck'):
    # His neck pressed onto Voss's own (his head's skin below the jaw, which the collar was made
    # round): every vertex below the skull, and below the jaw at the front, goes to the nearest
    # point of that surface, gradually from the top. Drawing his thick nape in instead folded it
    # into a fin behind the ears.
    vm_ = bhead.data
    skin_i = {k for k, m in enumerate(vm_.materials) if m and m.name.split('.')[0] == 'M_Head'}
    vm_.calc_loop_triangles()
    tris_ = [tuple(t.vertices) for t in vm_.loop_triangles if t.material_index in skin_i
             and max(bco_v[k][2] for k in t.vertices) < V_EYE_Z - 0.03]
    nbvh = BVHTree.FromPolygons([Vector(p) for p in bco_v], tris_)
    z_back, z_front = V_EYE_Z - 0.03 * sB, NECK_TOP
    cy0, _, ry0 = NRS[-1]
    for v in bm.verts:
        back = smooth(cy0 - ry0, cy0 + 0.3 * ry0, v.co.y)
        top = z_front + (z_back - z_front) * back
        if v.co.z >= top:
            continue
        loc, _, _, _ = nbvh.find_nearest(v.co)
        if loc is None:
            continue
        t = smooth(top, top - 0.025, v.co.z)
        v.co = v.co.lerp(loc, t)
    nv2 = [v for v in bm.verts if v.co.z < z_back + 0.005]
    for _ in range(4):
        bmesh.ops.smooth_vert(bm, verts=nv2, factor=0.4, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.verts.layers.int.remove(is_hair)
bm.to_mesh(skin.data)
bm.free()
log('neck drawn onto the body\'s:', n, 'vertices')
log('head cut:', len(skin.data.vertices), 'vertices')
# the surface as it now is, before it is thinned: the colours are baked from it (not from the
# uncut one: under her hair the nearest point was her shoulders)
skin_src = skin.copy()
skin_src.data = skin.data.copy()
bpy.context.collection.objects.link(skin_src)
skin_src.name = 'N_SkinSource'

# ---------------------------------------------------------------- thinned / refined
if C.get('decimate'):
    decimate(skin, C['decimate'])
if C.get('subdivide'):
    select_only(skin)
    mod = skin.modifiers.new('Subdivide', 'SUBSURF')
    mod.levels = C['subdivide']
    mod.uv_smooth = 'PRESERVE_BOUNDARIES'
    bpy.ops.object.modifier_apply(modifier=mod.name)
log('head:', len(skin.data.vertices), 'vertices')

# ---------------------------------------------------------------- her painted eyes cut out to the lid line
sbvh = surface_bvh(skin)
if C.get('aperture'):
    ax, az = (a * s for a in C['aperture'])
    bm = bmesh.new()
    bm.from_mesh(skin.data)
    gone = []
    for f in bm.faces:
        c = f.calc_center_median()
        for e in EYES:
            if ((c.x - e.x) / ax) ** 2 + ((c.z - e.z) / az) ** 2 < 1 and c.y < e.y - EYE_R * 0.5:
                gone.append(f)
                break
    bmesh.ops.delete(bm, geom=gone, context='FACES')
    # the lids' edge: onto the almond, and onto the eyeball
    for v in bm.verts:
        if not v.is_boundary:
            continue
        for e in EYES:
            dx, dz = v.co.x - e.x, v.co.z - e.z
            q = math.hypot(dx / ax, dz / az)
            if 0.4 < q < 1.8 and v.co.y < e.y:
                dx, dz = dx / q, dz / q
                v.co.x, v.co.z = e.x + dx, e.z + dz
                v.co.y = e.y - math.sqrt(max(0.0, EYE_R ** 2 - dx * dx - dz * dz)) - 0.0004
    bm.to_mesh(skin.data)
    bm.free()
    log('eyes cut out')

# ---------------------------------------------------------------- the lip line
sbvh = surface_bvh(skin)
if C.get('crease'):
    # where the surface is deepest between the lips (the crease), across the mouth
    xs_, zs_ = [], []
    for x in np.linspace(-0.8, 0.8, 11) * CORNER_X:
        # (the groove between the lips is a dip in the profile; the deepest point overall is the
        # hollow under the lower lip, so: the dip nearest the line measured on the photo)
        zz = np.arange(MOUTH_Z - 0.004, MOUTH_Z + 0.004, 0.0001)
        yy_ = np.array([front_y(sbvh, x, z) or np.nan for z in zz])
        dips = [i for i in range(2, len(zz) - 2) if yy_[i] >= np.nanmax(yy_[i - 2:i + 3]) - 1e-7]
        best = None
        if dips:
            i = min(dips, key=lambda i: abs(zz[i] - MOUTH_Z))
            best = (yy_[i], zz[i])
        if best:
            xs_.append(x)
            zs_.append(best[1])
    A = np.stack([np.ones(len(xs_)), (np.array(xs_) / CORNER_X) ** 2], 1)
    c0, c2 = np.linalg.lstsq(A, np.array(zs_), rcond=None)[0]
    LIP = np.array([c0, 0.0, c2])
    log('lip line from the crease', np.round(LIP, 5), 'samples', np.round(zs_, 4))
else:
    LIP = np.array([MOUTH_Z, 0.0, CORNER_LIFT])


def lip_z(x):
    return LIP[0] + LIP[1] * x + LIP[2] * (x / CORNER_X) ** 2


MOUTH_Z = float(LIP[0])
LIP_Y = min(front_y(sbvh, 0.0, MOUTH_Z + dz) or 0 for dz in (-0.004, 0.004))       # the front of the lips

# the slit: the surface is cut along the line between the corners and the two sides pulled apart
me = skin.data
for v in me.vertices:
    v.co.z -= lip_z(v.co.x) - MOUTH_Z               # (the line made straight for the cut, then put back)
bm = bmesh.new()
bm.from_mesh(me)
# (every face that crosses the line between the corners: a thinned face can be bigger than the lips,
# and left whole it held them together, stretched into spikes as the jaw opened)
region = [f for f in bm.faces if any(abs(v.co.x) < CORNER_X * 1.2 for v in f.verts)
          and min(v.co.z for v in f.verts) < MOUTH_Z + 1e-6 < max(v.co.z for v in f.verts) + 2e-6
          and all(v.co.y < LIP_Y + 0.03 for v in f.verts)]
geom = list({x for f in region for x in list(f.verts) + list(f.edges)}) + region
res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, MOUTH_Z), plane_no=(0, 0, 1), dist=1e-6)
on_line = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)
           and all(abs(v.co.x) < CORNER_X and abs(v.co.z - MOUTH_Z) < 1e-5 for v in e.verts)]
bmesh.ops.split_edges(bm, edges=on_line)
SLIT_Y = float(np.mean([v.co.y for e in on_line for v in e.verts])) if on_line else LIP_Y + 0.003
bm.to_mesh(me)
bm.free()
for v in me.vertices:
    v.co.z += lip_z(v.co.x) - MOUTH_Z
# which side of the slit each vertex is on (the two copies along it sit at the same place)
side = np.zeros(len(me.vertices))
for p in me.polygons:
    cz = sum(me.vertices[i].co.z - lip_z(me.vertices[i].co.x) for i in p.vertices) / len(p.vertices)
    for i in p.vertices:
        side[i] += cz
side = np.sign(side)
# The lips' inner surfaces: each lip's cut edge rolled back into the mouth and away from the other
# lip, over the teeth, as Voss's lips are (cut alone, they were paper thin, and the teeth's edges
# showed past them). Thinning out to nothing at the corners, so the corners stay closed.
ROLL = ((0.0012, 0.0012), (0.0026, 0.0034))       # (back, away) for each new row
bm = bmesh.new()
bm.from_mesh(me)
bm.verts.ensure_lookup_table()
lip_edges = [e for e in bm.edges if e.is_boundary and e.link_faces
             and all(abs(v.co.x) < CORNER_X * 1.05 and abs(v.co.z - lip_z(v.co.x)) < 0.0008 and v.co.y < LIP_Y + 0.012 for v in e.verts)]
rows = {}                                           # boundary vertex -> its new rows
inner_src = []                                      # (new vertex, the lip vertex it follows)
for e in lip_edges:
    f = e.link_faces[0]
    sgn = 1.0 if f.calc_center_median().z > lip_z(f.calc_center_median().x) else -1.0
    for v in e.verts:
        if v in rows:
            continue
        t = max(0.0, 1 - (v.co.x / (CORNER_X * 1.05)) ** 2)
        chain = []
        for back, away in ROLL:
            nv = bm.verts.new(v.co + Vector((0, back * t, sgn * away * t)))
            chain.append(nv)
            inner_src.append((nv, v.index, sgn))
        rows[v] = chain
    a, b = e.verts
    prev = (a, b)
    for k in range(len(ROLL)):
        nxt = (rows[a][k], rows[b][k])
        try:
            bm.faces.new((prev[0], prev[1], nxt[1], nxt[0]))
        except ValueError:
            pass
        prev = nxt
bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
bm.verts.index_update()
inner_src = [(nv.index, src, sgn) for nv, src, sgn in inner_src]
bm.to_mesh(me)
bm.free()
side = np.concatenate([side, np.array([sg for _, _, sg in inner_src])])
log(f'lips rolled in: {len(inner_src)} vertices')
log(f'slit: {len(on_line)} edges, lips at y {LIP_Y:.4f}, slit at y {SLIT_Y:.4f}, mouth z {MOUTH_Z:.4f}')

# ---------------------------------------------------------------- his mouth moved in behind it
# His mouth keeps its shape: scaled the same way every way (to this mouth's width, and no taller
# than this face's mouth is below its eyes: on a short face his gums came up into the nose), its
# teeth set behind the lips' rolled-in edges
sxm = CORNER_X / V_CORNER_X
szm = min(1.0, (V_EYE_Z - MOUTH_Z) / (V_EYE_Z - V_MOUTH_Z))
km = min(sxm, szm)
dz = MOUTH_Z - V_MOUTH_Z
teeth_front = LIP_Y + (min(v.co.y for v in mouth.data.vertices) - V_LIP_Y) * km
dy = max(0.0, SLIT_Y + ROLL[-1][0] + 0.001 - teeth_front)


TEETH_W = C.get('teeth_w', 0.9)                    # (narrower than the mouth: the pocket closes toward the corners)


def to_mouth(p):
    return Vector((p.x * km * TEETH_W, LIP_Y + (p.y - V_LIP_Y) * km + dy, MOUTH_Z + (p.z - V_MOUTH_Z) * km))     # (a little narrower: the pocket closes toward the corners)


keys = mouth.data.shape_keys.key_blocks
basis = [k.co.copy() for k in keys[0].data]
for kb in keys:
    for i, d in enumerate(kb.data):
        delta = d.co - basis[i]
        d.co = to_mouth(basis[i]) + Vector((delta.x * TEETH_W, delta.y, delta.z)) * km
for i, v in enumerate(mouth.data.vertices):
    v.co = keys[0].data[i].co
# nothing of it in front of the skin (the teeth showed through his thin upper lip and under the nose)
behind = 0.0
for v in mouth.data.vertices:
    if abs(v.co.x) > CORNER_X * 1.3:
        continue
    # (at the slit's height the ray would pass through it: the lips just above and below it count)
    zl = lip_z(v.co.x)
    probes = (v.co.z,) if abs(v.co.z - zl) > 0.0025 else (zl + 0.0025, zl - 0.0025)
    ys = [y for y in (front_y(sbvh, v.co.x, z) for z in probes) if y is not None and y < LIP_Y + 0.02]
    if ys:
        behind = max(behind, max(ys) + 0.0015 - v.co.y)
if behind > 0:
    for kb in keys:
        for d in kb.data:
            d.co.y += behind
    for i, v in enumerate(mouth.data.vertices):
        v.co = keys[0].data[i].co
    dy += behind
log(f'mouth pushed back {behind:.4f}')
log(f'mouth moved in: x{km:.3f} every way, y {dy:+.4f}, z {dz:+.4f}')


# ====================================================================== colours
SIZE = 1024
new_uvs(skin)
head_arr, hfill = bake_from(skin, skin_src, skin_img_arr[..., :3], SIZE)
bpy.data.objects.remove(skin_src)
# the skin tone (the cheeks), for the hands and the inside of the lids' edge
pos, _ = raster(skin, SIZE)
cheeks = hfill & (np.abs(np.abs(pos[..., 0]) - 0.03) < 0.008) & (np.abs(pos[..., 2] - (V_EYE_Z - 0.022)) < 0.006) & (pos[..., 1] < -0.04)
SKIN = np.median(head_arr[cheeks], 0) if cheeks.any() else rgb('#D8A890')
log('skin', np.round(SKIN, 3))
# a dark line along the lids' edge (the lashes), and the slit's edges a little darker (the lips' inside)
x, y, z = pos[..., 0], pos[..., 1], pos[..., 2]
if C.get('aperture'):
    for e in EYES:
        q = np.hypot((x - e.x) / ax, (z - e.z) / az)
        upper = (z > e.z - az * 0.3).astype(np.float32)
        line = np.clip(1 - np.abs(q - 1.0) / (0.16 + 0.1 * upper), 0, 1) * (y < e.y) * hfill
        head_arr = mix(head_arr, head_arr * np.array([0.32, 0.27, 0.26], np.float32), line * (0.5 + 0.4 * upper))
# the neck below the jaw: smooth skin (it was drawn out onto his longer neck, and showed her
# collarbones and her top's edge); the hair stays as it is
neck = hfill & (z < NECK_TOP + 0.012) & ((lum(head_arr) < 0.55) | (head_arr.max(-1) - head_arr.min(-1) > 0.1))
nt = smooth(NECK_TOP + 0.012, NECK_TOP - 0.004, z) * neck
if C.get('slim_neck'):
    # (the back of his neck too: pressed onto Voss's, it took colours from his tank top behind it)
    _zb = V_EYE_Z - 0.03 * sB
    nt = np.maximum(nt, smooth(_zb + 0.004, _zb - 0.01, z) * (y > NRS[-1][0] - 0.3 * NRS[-1][2]) * hfill)
    nt = np.maximum(nt, smooth(NECK_TOP - 0.002, NECK_TOP - 0.012, z) * hfill)       # (and all below the jaw: his tank top lay there)
_above = hfill & (z > NECK_TOP + 0.014) & (z < NECK_TOP + 0.024) & (y < NRS[-1][0])
NECK_SKIN = (np.median(head_arr[_above], 0) if _above.sum() > 20 else SKIN) if C.get('slim_neck') else SKIN    # (his face's colour; Park's scan, his throat's)
calm = NECK_SKIN[None, None] * np.clip(1 + 0.15 * (lum(blur(head_arr, 12)) / max(1e-4, lum(NECK_SKIN)) - 1), 0.9, 1.05)[..., None]   # (gentle shading only: the dark streaks there went brown)
head_arr = mix(head_arr, calm, nt)
lipd = np.abs(z - lip_z(x))
inner = np.clip(1 - lipd / 0.0012, 0, 1) * (np.abs(x) < CORNER_X) * (y < LIP_Y + 0.012) * hfill
# (the lips' rolled-in surfaces, behind the cut: the inside of a lip, not the skin baked onto them)
taper = np.clip(1 - (x / (CORNER_X * 1.05)) ** 2, 0, 1)              # (as the rolled surfaces thin toward the corners)
rolled = (y > SLIT_Y + 0.0003 * taper) & (lipd < ROLL[-1][1] * taper + 0.0004) & (taper > 0) & (y < LIP_Y + 0.02) & hfill
head_arr = np.where(rolled[..., None], rgb('#7A3A3C')[None, None], head_arr)
head_arr = mix(head_arr, head_arr * np.array([0.55, 0.4, 0.4], np.float32), inner * 0.7)
head_img = new_image(NAME[0].upper() + '_Head_albedo', head_arr)
skin.data.materials.clear()
skin.data.materials.append(plain_material('M_Head', head_img))
set_colours(skin, np.ones((len(skin.data.vertices), 3), np.float32))      # (white: only the mouth reads these)

# ---------------------------------------------------------------- the mouth's materials (its per-vertex colours, as Voss's)
mouth_cols = mouth.data.color_attributes[0] if mouth.data.color_attributes else None
if mouth_cols is not None:
    mc = np.empty(len(mouth_cols.data) * 4, np.float32)
    mouth_cols.data.foreach_get('color_srgb', mc)
    mc = mc.reshape(-1, 4)[:, :3]
    if mouth_cols.domain == 'CORNER':
        per = np.zeros((len(mouth.data.vertices), 3))
        for l in mouth.data.loops:
            per[l.vertex_index] = mc[l.index]
        mc = per
else:
    mc = np.ones((len(mouth.data.vertices), 3), np.float32) * 0.6
set_colours(mouth, (mc * 0.86).astype(np.float32))     # (his teeth a little off-white: bare in these mouths, pure white glared)
for i, m in enumerate(mouth.data.materials):
    mouth.data.materials[i] = plain_material(m.name, vcol=True, rough=0.5 if m.name == 'M_Teeth' else 0.8)

# ---------------------------------------------------------------- eyes: Angelica's, the irises recoloured
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=ANGELICA, merge_vertices=True)
ang_eyes = None
for o in [o for o in bpy.data.objects if o not in before]:
    if o.type == 'MESH' and o.parent and o.parent.name == 'EyeScleraReflect_5':
        o.data.transform(o.matrix_world)
        o.parent = None
        o.matrix_world = Matrix()
        ang_eyes = o
for o in [o for o in bpy.data.objects if o not in before and o is not ang_eyes]:
    bpy.data.objects.remove(o)
eco = coords(ang_eyes)
for sgn, target in ((-1, EYES[0]), (1, EYES[1])):
    idx = np.nonzero(np.sign(eco[:, 0]) == sgn)[0]
    p = eco[idx]
    centre = (p.min(0) + p.max(0)) / 2
    r = (p[:, 2].max() - p[:, 2].min()) / 2
    k = EYE_R / r
    for i in idx:
        q = (eco[i] - centre) * k
        ang_eyes.data.vertices[i].co = Vector(target) + Vector(q)
ang_eyes.name = 'Eyes'
e_img = base_image(ang_eyes.data.materials[0])
eorig = pixels(e_img)[..., :3]
E = e_img.size[0]
yy, xx = np.mgrid[0:E, 0:E] + 0.5
r = np.hypot(xx - E / 2, yy - E / 2) / E
# the iris drawn larger (Angelica's is small for these eyes: they stared); the white squeezed outward
P, R0, R1 = 0.06, 0.15, 0.17                     # (the pupil keeps its size; the ring around it widens)
r_src = np.where(r < P, r, np.where(r < R1, P + (r - P) * (R0 - P) / (R1 - P), R0 + (r - R1) * (0.5 - R0) / (0.5 - R1)))
k = np.where(r > 1e-6, r_src / np.maximum(r, 1e-6), 1)
uv = np.stack([(0.5 + (xx / E - 0.5) * k).ravel(), (0.5 + (yy / E - 0.5) * k).ravel()], 1)
eorig = sample(eorig, uv).reshape(E, E, 3)
r = r_src
iris = np.clip((0.15 - r) / 0.01, 0, 1) * np.clip((r - 0.08) / 0.01, 0, 1)
el = lum(eorig)
irisl = el / max(1e-4, float(np.median(el[iris > 0.5])))
tint = mix(rgb(C['iris'][0]), rgb(C['iris'][1]), np.clip(1 - (r - 0.08) / 0.07, 0, 1) * 0.7) * np.clip(irisl, 0.5, 1.4)[..., None]
eye_arr = mix(eorig, tint, iris * 0.92)
if E > 512:
    eye_arr = eye_arr[::E // 512, ::E // 512]
eye_img = new_image(NAME[0].upper() + '_Eye_albedo', eye_arr)
ang_eyes.data.materials.clear()
ang_eyes.data.materials.append(plain_material('M_Eye', eye_img, rough=0.2))

# ---------------------------------------------------------------- hair and beard cards: one small cut-out texture
if cards:
    bimg, himg = base_image(cards.data.materials[0]), base_image(hair_objs[0].data.materials[0])
    BW = 256
    barr = pixels(bimg)
    harr = pixels(himg)
    barr = barr[::barr.shape[0] // BW, ::barr.shape[1] // BW][:BW, :BW]
    hh = BW
    harr = harr[::harr.shape[0] // hh, ::max(1, harr.shape[1] // (hh // 4))][:hh, :hh // 4]
    atlas = np.concatenate([barr, harr], 1)                      # beard | hair
    AW = atlas.shape[1]
    hair_img = new_image(NAME[0].upper() + '_HairCards_albedo', atlas)
    hair_mat = plain_material('M_HairCards', hair_img, alpha='map', rough=0.6)
    for o, x0, w in [(cards, 0, BW)] + [(h, BW, hh // 4) for h in hair_objs]:
        for d in o.data.uv_layers['UVMap'].data:
            d.uv = ((x0 + (d.uv.x % 1.0) * w) / AW, d.uv.y % 1.0)
        o.data.materials.clear()
        o.data.materials.append(hair_mat)
    hair = join(hair_objs, 'Hair')
    n = len(hair.data.vertices)
    decimate(hair, 0.2)
    log(f'hair cards: {n} -> {len(hair.data.vertices)} vertices; beard {len(cards.data.vertices)}')
    hair_objs = [hair]


# ====================================================================== skinned as his head was
def bind_like(o, k=4):
    """(the body's head's weights; it and o both in Voss's space here)"""
    kd = KDTree(len(bco_v))
    for i, p in enumerate(bco_v):
        kd.insert(Vector(p), i)
    kd.balance()
    names = {g.index: g.name for g in bhead.vertex_groups}
    sw = [{names[g.group]: g.weight for g in v.groups} for v in bhead.data.vertices]
    for g in list(o.vertex_groups):
        o.vertex_groups.remove(g)
    groups = {}
    for v in o.data.vertices:
        acc = {}
        for _, i, d in kd.find_n(v.co, k):
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


def bind_rigid(o):
    for g in list(o.vertex_groups):
        o.vertex_groups.remove(g)
    o.vertex_groups.new(name=HEAD_BONE).add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    o.parent = rig
    o.matrix_world = Matrix()
    o.modifiers.new('Armature', 'ARMATURE').object = rig


bind_like(skin)
if cards:
    bind_like(cards)
bind_rigid(ang_eyes)
for h in hair_objs:
    bind_rigid(h)
mouth.parent = rig
mouth.matrix_world = Matrix()
for m in list(mouth.modifiers):
    mouth.modifiers.remove(m)
log('bound')


# ====================================================================== Voss's face morphs on the new one
# The new face lies close over his (same eye height and spacing); each vertex takes the motion of
# the point of his face it lands on once the mouths are matched too (height and width), scaled back
# to its width. Along the slit, each lip looks a little above (or below) itself, to land on the
# same lip of his.
def to_voss(p):
    t = smooth(MOUTH_Z, V_EYE_Z, p.z)
    dzv = (V_MOUTH_Z - MOUTH_Z) * (1 - t)
    sx = (V_CORNER_X / CORNER_X) * (1 - t) + 1.0 * t
    return Vector((p.x * sx, p.y + (V_LIP_Y - LIP_Y) * (1 - t), p.z + dzv)), sx


vm = vhead.data
vm.calc_loop_triangles()
vbasis = [Vector(p) for p in vco]
vtris = [tuple(t.vertices) for t in vm.loop_triangles]
bmv = bmesh.new()
bmv.from_mesh(vm)
bmesh.ops.remove_doubles(bmv, verts=bmv.verts, dist=1e-6)
welded = bpy.data.meshes.new('V_Welded')
bmv.to_mesh(welded)
bmv.free()
wcomp, _ = components(welded)
wmain = np.bincount(wcomp).argmax()
skin_at = {tuple(np.round(v.co, 6)) for v in welded.vertices if wcomp[v.index] == wmain}
bpy.data.meshes.remove(welded)
vtris = [t for t in vtris if all(tuple(np.round(vm.vertices[j].co, 6)) in skin_at for j in t)]
vbvh = BVHTree.FromPolygons(vbasis, vtris)
vkeys = vm.shape_keys.key_blocks
morphs = [k.name for k in vkeys[1:]]
VM3 = vhead.matrix_world.to_3x3()
vdelta = {k: np.array([VM3 @ (a.co - b.co) for a, b in zip(vkeys[k].data, vkeys[0].data)]) for k in morphs}


def bary(p, tri, pts):
    a, b, c = (Vector(pts[j]) for j in tri)
    v0, v1, v2 = b - a, c - a, p - a
    d00, d01, d11, d20, d21 = v0.dot(v0), v0.dot(v1), v1.dot(v1), v2.dot(v0), v2.dot(v1)
    den = d00 * d11 - d01 * d01 or 1e-12
    wb = (d11 * d20 - d01 * d21) / den
    wc = (d00 * d21 - d01 * d20) / den
    return np.array([1 - wb - wc, wb, wc])


hm = skin.data
skin.shape_key_add(name='Basis', from_mix=False)
hkeys = {k: skin.shape_key_add(name=k, from_mix=False) for k in morphs}
for k in hkeys.values():
    k.value = 0.0
sdelta = {k: np.zeros((len(hm.vertices), 3)) for k in morphs}
for v in hm.vertices:
    q, sx = to_voss(Vector(v.co))
    sgn = side[v.index] if side[v.index] != 0 else math.copysign(1, v.co.z - lip_z(v.co.x))
    if abs(v.co.z - lip_z(v.co.x)) < 0.005 and abs(v.co.x) < CORNER_X * 1.1:
        # (on the lips: the front of his lip of the same side, straight ahead of it. The nearest point
        # of his face there was often the inside of his upper lip, which curls down behind it, and
        # the lower lip's edge stayed up as the jaw opened)
        loc, nrm, ti, dist = vbvh.ray_cast(Vector((q.x, -1.0, q.z + sgn * 0.0025)), Vector((0, 1, 0)))
        dist = 0.0
    else:
        q.z += sgn * 0.002 * gauss(v.co.x / (CORNER_X * 1.3), (v.co.z - lip_z(v.co.x)) / 0.008)
        loc, nrm, ti, dist = vbvh.find_nearest(q)
    if loc is None or dist > 0.02:
        continue
    fade = smooth(0.02, 0.01, dist)
    w = bary(loc, vtris[ti], vbasis)
    for k in morphs:
        dd = (vdelta[k][list(vtris[ti])] * w[:, None]).sum(0) * fade
        if np.abs(dd).max() < MIN_MOVE:
            continue
        dd = np.array([dd[0] / sx, dd[1], dd[2]]) * (BLINK_GAIN if k in ('blink', 'eyes_tired') else 1.0)
        sdelta[k][v.index] = dd
        hkeys[k].data[v.index].co = v.co + Vector(dd)
log('morphs', morphs)

if cards:
    comp_c, n_c = components(cards.data)
    cco_ = coords(cards)
    cy0, rx0, ry0 = NRS[-1]
    gone = []
    for c in range(n_c):
        idx = np.nonzero(comp_c == c)[0]
        m = cco_[idx].mean(0)
        if m[2] < NECK_TOP + 0.004 and (m[1] > cy0 - 0.3 * ry0 or abs(m[0]) > rx0 * 0.9):
            gone.extend(idx.tolist())
    if gone:
        bm = bmesh.new()
        bm.from_mesh(cards.data)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.verts[i] for i in gone], context='VERTS')
        bm.to_mesh(cards.data)
        bm.free()
    log('beard cards under the jaw, behind the throat, removed:', len(gone), 'vertices')

# Her lids, cut to the eyes' opening, are not where his were: her blink is made here instead. The
# upper lid comes down over the ball to the lower lid's line (less and less higher up the lid),
# keeping its distance in front of the ball.
if C.get('own_blink'):
    def ball_y(e, x, z, r):
        return e.y - math.sqrt(max(0.0, r * r - (x - e.x) ** 2 - (z - e.z) ** 2))
    for k, amount in (('blink', 1.0), ('eyes_tired', 0.4)):
        for v in hm.vertices:
            p = v.co
            for e in EYES:
                dx, dz = (p.x - e.x) / ax, (p.z - e.z) / az
                if abs(dx) > 1.4 or dz < -0.3 or dz > 4 or p.y > e.y:
                    continue
                c = math.sqrt(max(0.0, 1 - min(1.0, (dx / 1.2) ** 2)))     # (reaching into the corners)
                top, low = e.z + az * c, e.z - az * c * 1.2       # (a little past the lower lid: no sliver of eye)
                travel = (top - low) * amount
                h = max(0.0, p.z - top)
                w = max(0.0, 1 - h / (az * 2.2)) * smooth(1.4, 1.0, abs(dx))
                if p.z < top:
                    w *= smooth(e.z - az * 0.05, top, p.z)      # (the lower lid stays)
                if w <= 0:
                    continue
                z2 = p.z - travel * w
                off = p.y - ball_y(e, p.x, p.z, EYE_R + 0.0004)
                y2 = ball_y(e, p.x, z2, EYE_R + 0.0004) + min(off, 0.0) - 0.0003 * w   # (in front of the lower lid)
                hkeys[k].data[v.index].co = Vector((p.x, y2, z2))
                sdelta[k][v.index] = (0.0, y2 - p.y, z2 - p.z)
    log('her own blink')

# (the lower teeth drop with the lower lip: on a face whose lip drops less than his, they rose
# above it as the mouth opened and their front, top and back all showed, as bands)
lo_edge = [ni for ni, _, sg in inner_src if sg < 0 and abs(hm.vertices[ni].co.x) < CORNER_X * 0.3]
lip_drop = -float(np.mean([sdelta['jaw_open'][i][2] for i in lo_edge])) if lo_edge else 0.0
mk_ = mouth.data.shape_keys.key_blocks
jd = np.array([(mk_['jaw_open'].data[i].co - mk_[0].data[i].co)[:] for i in range(len(mouth.data.vertices))])
teeth_drop = float(np.percentile(-jd[:, 2], 95))
if lip_drop > 0 and teeth_drop > 0:
    g = min(1.6, lip_drop / teeth_drop)
    for i in range(len(jd)):
        mk_['jaw_open'].data[i].co = mk_[0].data[i].co + Vector(jd[i] * g)
    log(f'lower teeth drop x{g:.2f} (lip {lip_drop:.4f}, teeth {teeth_drop:.4f})')

# the lips' inner surfaces move as the lip edge they come from
for ni, src, _ in inner_src:
    for k in morphs:
        sdelta[k][ni] = sdelta[k][src]
        hkeys[k].data[ni].co = hm.vertices[ni].co + Vector(sdelta[k][src])

# The inside of the mouth: a pocket from the lips' rolled-in edges back toward the throat, its roof
# still, its floor (the tongue) riding the lower lip down as the jaw opens; Voss's teeth inside it.
GUMS, TONGUE, THROAT = rgb('#9A4650'), rgb('#B65A62'), rgb('#3A141B')
POCKET_DEPTH, POCKET_ROWS = 0.026 * km, 6
up_cols, lo_cols = [], []
for n, (ni, _, sgn) in enumerate(inner_src):
    if n % len(ROLL) == len(ROLL) - 1:
        (up_cols if sgn > 0 else lo_cols).append(ni)
up_cols.sort(key=lambda i: hm.vertices[i].co.x)
lo_x = np.array([hm.vertices[i].co.x for i in lo_cols])
pv, pdel, pcol, L = [], [], [], 2 * POCKET_ROWS + 1
# (each end closed at the mouth's corner: a column whose roof and floor meet there; the lips stop
# short of the corner, and through the gap the shirt showed)
cols = []
for ui in up_cols:
    li = lo_cols[int(np.argmin(np.abs(lo_x - hm.vertices[ui].co.x)))]
    cols.append((ui, li, hm.vertices[ui].co, hm.vertices[li].co))
for end in (0, -1):
    ui, li, pu_, pl_ = cols[end]
    sx_ = math.copysign(1.0, pu_.x)
    cx = sx_ * max(abs(pu_.x), CORNER_X) * 1.06
    corner = Vector((cx, (pu_.y + pl_.y) / 2 + 0.0015, lip_z(cx)))
    cols.insert(0 if end == 0 else len(cols), (ui, li, corner, corner))
up_cols = [c[0] for c in cols]
for ui, li, pu, pl in cols:
    h = max(0.0, 1 - (pu.x / (CORNER_X * 1.05)) ** 2) ** 0.5
    zb = lip_z(pu.x) - 0.002 * h
    yb = max(pu.y, pl.y) + POCKET_DEPTH * (0.35 + 0.65 * h)
    for j in range(POCKET_ROWS + 1):                # the roof, from the upper lip back
        t = j / POCKET_ROWS
        pv.append((pu.x * (1 - 0.25 * t), pu.y + (yb - pu.y) * t, pu.z * (1 - t) + zb * t + 0.009 * h * math.sin(math.pi * t)))
        pdel.append((ui, 1 - t))
        pcol.append(mix(GUMS, THROAT, min(1.0, t * 1.4)))
    for j in range(POCKET_ROWS - 1, -1, -1):        # the floor, from the back to the lower lip
        t = j / POCKET_ROWS
        pv.append((pl.x * (1 - 0.25 * t), pl.y + (yb - pl.y) * t, pl.z * (1 - t) + zb * t - 0.005 * h * math.sin(math.pi * t)))
        pdel.append((li, 1 - 0.4 * t))
        pcol.append(mix(TONGUE, THROAT, max(0.0, t - 0.35) * 1.5))
pf = [(c * L + k, (c + 1) * L + k, (c + 1) * L + k + 1, c * L + k + 1) for c in range(len(up_cols) - 1) for k in range(L - 1)]
pme = bpy.data.meshes.new('Pocket')
pme.from_pydata(pv, [], pf)
pocket = bpy.data.objects.new('Pocket', pme)
bpy.context.collection.objects.link(pocket)
pme.materials.append(next(m for m in mouth.data.materials if m.name.startswith('M_MouthInner')))
set_colours(pocket, np.array(pcol, np.float32))
pocket.shape_key_add(name='Basis', from_mix=False)
for k in morphs:
    kb = pocket.shape_key_add(name=k, from_mix=False)
    kb.value = 0.0
    for i, (src, w) in enumerate(pdel):
        kb.data[i].co = Vector(pv[i]) + Vector(sdelta[k][src] * w)
bind_like(pocket)
log(f'mouth pocket: {len(pv)} vertices')

# beard cards ride the skin under them (each card as one piece, by its root)
if cards:
    me = skin.data
    me.calc_loop_triangles()
    stris = [tuple(t.vertices) for t in me.loop_triangles]
    sbasis = [v.co.copy() for v in me.vertices]
    sbvh = BVHTree.FromPolygons(sbasis, stris)
    comp, n = components(cards.data)
    cco = coords(cards)
    cards.shape_key_add(name='Basis', from_mix=False)
    ckeys = {k: cards.shape_key_add(name=k, from_mix=False) for k in morphs}
    for k in ckeys.values():
        k.value = 0.0
    for c in range(n):
        idx = np.nonzero(comp == c)[0]
        best = None
        for i in idx:
            loc, _, ti, d = sbvh.find_nearest(Vector(cco[i]))
            if loc is not None and (best is None or d < best[0]):
                best = (d, loc, ti)
        if best is None:
            continue
        w = bary(best[1], stris[best[2]], sbasis)
        for k in morphs:
            dd = (sdelta[k][list(stris[best[2]])] * w[:, None]).sum(0)
            if np.abs(dd).max() < MIN_MOVE:
                continue
            for i in idx:
                ckeys[k].data[i].co = Vector(cco[i]) + Vector(dd)
    log('beard follows the skin:', n, 'cards')

# the mouth (its own keys, already his) joins the head; then the beard
if cards:
    set_colours(cards, np.ones((len(cards.data.vertices), 3), np.float32))
parts = [skin, mouth, pocket] + ([cards] if cards else [])
head = join(parts, 'Head')
select_only(head)
bpy.ops.object.material_slot_remove_unused()        # (the slots his mouth brought along: his skin's, his lashes')

# all of it from Voss's space onto the body (its morphs too); lower on the neck if asked (Park: his
# neck, longer than Voss's, showed as a thin column above the collar)
DROP = Matrix.Translation((0, 0, -C.get('drop', 0.0)))
for o in [head, ang_eyes] + hair_objs:
    o.data.transform(V2B @ DROP, shape_keys=True)
B_EYE_Z = (V2B @ Vector((0, 0, V_EYE_Z))).z
B_EYES = [V2B @ e for e in EYES]
if bhead is not vhead:
    bpy.data.objects.remove(bhead)
bpy.data.objects.remove(vhead)
head.name = 'Head'                                  # (the names the game looks for: hers held them till now)
ang_eyes.name = 'Eyes'


# ====================================================================== Lindqvist: Voss's glasses on her face
GLASSES_LIFT = 0.0025 / sB  # (her eyes sit a little higher behind them than his)
if glasses:
    gme = glasses.data
    gco = np.array([glasses.matrix_world @ v.co for v in gme.vertices])
    hco = np.array([v.co for v in head.data.vertices])

    def half_width(co, z, ylim):
        r = co[(np.abs(co[:, 2] - z) < 0.004) & (co[:, 1] > ylim[0]) & (co[:, 1] < ylim[1])]
        return float(np.percentile(np.abs(r[:, 0]), 98))
    ey = float(np.mean([e.y for e in B_EYES]))
    sxg = min(1.06, half_width(hco, B_EYE_Z, (ey, ey + 0.05)) / half_width(bco, B_EYE_Z, (ey, ey + 0.05)))   # (her solid hair widens the measure)
    hbvh = surface_bvh(head)
    clear = []
    for p in gco:
        if abs(p[0]) * sxg > 0.035 / sB or p[1] > ey:
            continue
        y = front_y(hbvh, p[0] * sxg, p[2])
        if y is not None:
            clear.append(y - p[1])
    shift = min(0.0, min(clear) - 0.003 / sB) if clear else 0.0
    for v in gme.vertices:
        p = glasses.matrix_world @ v.co
        v.co = glasses.matrix_world.inverted() @ Vector((p.x * sxg, p.y + shift, p.z + GLASSES_LIFT))
    gme.materials[0] = plain_material('M_GlassesFrame', color=(0.035, 0.037, 0.042, 1), rough=0.35)    # (by slot: clearing them loses which faces are lens)
    gme.materials[1] = plain_material('M_GlassesLens', color=(0.62, 0.72, 0.78, 1), alpha=0.07, rough=0.1)   # (clear: the shades are Kessler's)
    log(f'glasses: x {sxg:.3f}, y {shift:+.4f}')


# ====================================================================== clothes and hands
if BASE == 'voss':
    for n, colour, dark in (('Coat_Torso', C['coat'], 0), ('Shirt', C['shirt'], 0), ('Pants', C['pants'], 0.1)):
        recolour(base_image(body[n].data.materials[0]), colour, keep_dark=dark)
    # his ID card (painted in the shirt's texture, top right, reading VOSS) becomes a blank one with a
    # band in the coat's colour
    simg = base_image(body['Shirt'].data.materials[0])
    sa = pixels(simg)
    S = sa.shape[0]
    y0, y1, x0, x1 = (int(S * f) for f in (1 - 0.172, 1 - 0.008, 0.814, 0.986))     # (rows from the bottom)
    sa[y0:y1, x0:x1, :3] = rgb('#EEF0F0')
    sa[y0 + int(S * 0.02):y0 + int(S * 0.032), x0 + 4:x1 - 4, :3] = rgb(C['coat'])
    simg.pixels.foreach_set(sa.ravel())
    simg.pack()
else:
    # Kessler's clothes are painted flat in her colours (build_kessler_from_female.py: CLOTH); each
    # texel is read as the cloth it is closest to (its hue, then how far its shade is from that
    # colour), and painted in this character's, its shade kept
    KCLOTH = [('#EDEFEF', C['coat']), ('#3C4A5C', C['shirt']), ('#7A1E22', C['tie']),
              ('#30333A', C['pants']), ('#1F1C1E', '#1F1C1E'), ('#141416', '#141416')]
    cimg = base_image(body['Body'].data.materials[0])
    ca = pixels(cimg)
    bpos, bfill, bisl = raster(body['Body'], ca.shape[0], islands=True)
    waist = float(np.percentile(bpos[bfill][:, 2], 45))      # (her belt and shoes are below it)
    rgb_ = ca[..., :3]
    L = np.maximum(lum(rgb_), 1e-4)
    chroma = rgb_ / L[..., None]
    score, best, kbest = np.full(L.shape, np.inf), np.zeros(L.shape, int), np.ones(L.shape)
    for ci, (k, _) in enumerate(KCLOTH):
        kc = rgb(k)
        kL = max(float(lum(kc)), 1e-4)
        ratio = L / kL
        sc = ((chroma - kc / kL) ** 2).sum(-1) * 4 + np.abs(np.log(ratio))
        if ci >= 4:
            sc = np.where(bpos[..., 2] > waist, np.inf, sc)      # (above it, the shirt's shadows are not belt)
        better = sc < score
        score[better], best[better], kbest[better] = sc[better], ci, ratio[better]
    # each UV island is one cloth (the one most of it reads as); only the belt on the trousers and
    # the soles of the shoes keep their black (the shadows in the shirt's folds read as trousers)
    for i in np.unique(bisl[bfill]):
        m = bisl == i
        counts = np.bincount(best[m], minlength=len(KCLOTH))
        main = int(np.argmax(counts[:4])) if counts[:4].any() else int(np.argmax(counts))
        dark = m & (best >= 4)
        best[m] = main
        if main in (3, 4):
            best[dark] = 5
    out = np.zeros_like(rgb_)
    for ci, (_, new) in enumerate(KCLOTH):
        m = best == ci
        out[m] = rgb(new)[None] * np.clip(kbest[m], 0.55, 1.35)[:, None]
    ca[..., :3] = np.clip(out, 0, 1)
    cimg.pixels.foreach_set(ca.ravel())
    cimg.pack()
himg = base_image(body['Hands'].data.materials[0])
ha = pixels(himg)[..., :3]
hl = lum(blur(ha, 2))
hmed = float(np.median(hl))
hand = SKIN[None, None] * np.clip(1 + 0.6 * (hl / hmed - 1), 0.75, 1.12)[..., None]
himg.pixels.foreach_set(np.concatenate([np.clip(hand, 0, 1), np.ones(hand.shape[:2] + (1,), np.float32)], 2).ravel())
himg.pack()
bodyobj = join([body[n] for n in BODY_PARTS], 'Body') if len(BODY_PARTS) > 1 else body['Body']
log('clothes painted')


# ====================================================================== names, tidy, export
body['Hands'].name = 'Hands'
if glasses:
    glasses.name = 'Glasses'
for o in rig.children:
    if o.type != 'MESH':
        continue
    o.data.name = o.name
    for u in [u for u in o.data.uv_layers if u.name != 'UVMap']:
        o.data.uv_layers.remove(u)
    for p in o.data.polygons:
        p.use_smooth = True
bpy.data.orphans_purge(do_recursive=True)
for img in bpy.data.images:
    if max(img.size) > 1024:
        img.scale(*(max(1, d * 1024 // max(img.size)) for d in img.size))
for o in rig.children:
    for m in o.data.materials:
        m.name = m.name.split('.')[0]
rig.name = NAME.capitalize() + '_Rig'
rig.data.pose_position = 'POSE'

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    head_img.save(filepath=os.path.join(PREVIEW, head_img.name + '.png'))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(PREVIEW, NAME + '_check.blend'))

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in rig.children:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='ACTIONS', export_morph=True,
    export_morph_normal=False, export_skins=True, export_yup=True, export_apply=False,
    export_image_format='WEBP', export_image_quality=82)
log('wrote', OUT, os.path.getsize(OUT) // 1024, 'KB')
