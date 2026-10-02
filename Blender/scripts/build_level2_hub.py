"""
Level 2 hub: the cargo atrium. Greybox + shape language, built entirely from code
so it can be regenerated and tweaked without anyone fighting over a binary file.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_level2_hub.py -- \
      Blender/level2-hub.blend public/assets/models/level2-hub.glb [preview_dir]

Units are metres, Z is up in Blender (the glTF exporter converts to Y-up).
Voss is about 1.8 m tall, a jump is about 1.4 m, a run-up jump clears about 4 m.

Name prefixes the game reads:
  COL_*    invisible collision proxy (never rendered)
  MOVE_*   platform the game moves (origin = its centre / pivot)
  ROT_*    ring segment the game rotates about the core axis (origin = 0,0,0)
  DOOR_*   sealed bedroom door the game slides open
  GLASS_*  the big window (the game replaces it with the skybox view)
  LIFT_*   the lift to level 3
  SPAWN_*  / ROOM_* empties: where things go
  REF_*    scale reference, not exported
"""
import bpy, bmesh, math, random, sys
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_BLEND = argv[0] if len(argv) > 0 else None
OUT_GLB = argv[1] if len(argv) > 1 else None
PREVIEW_DIR = argv[2] if len(argv) > 2 else None

# ------------------------------------------------------------------ dimensions
R = 32.0        # inner radius of the atrium wall
T = 1.6         # wall thickness
H = 32.0        # wall height
Z1 = 7.0        # tier 1 catwalk height
Z2 = 14.0       # tier 2 gantry height
DOOR_H = 4.5

rad = math.radians


def P(r, a, z):
    return Vector((r * math.cos(rad(a)), r * math.sin(rad(a)), z))


def TV(a):  # tangent direction at angle a
    return Vector((-math.sin(rad(a)), math.cos(rad(a)), 0.0))


# ------------------------------------------------------------------ scene setup
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
VIS = bpy.data.collections.new('Hub_Visual')
COLL = bpy.data.collections.new('Hub_Collision')
scene.collection.children.link(VIS)
scene.collection.children.link(COLL)

# ------------------------------------------------------------------ materials
MATS = {}


def mat(name, color, rough=0.7, metal=0.1, emit=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
    m.diffuse_color = (*color, 1)
    MATS[name] = m
    return m


# Dark gunmetal with cool blue lights (reference: dark metallic corridors with blue strip
# lights). The three bedroom doors are told apart by their glow: cyan, ice white, violet.
mat('hull_light', (0.25, 0.28, 0.32), 0.42, 0.6)
mat('hull_mid', (0.15, 0.17, 0.20), 0.5, 0.6)
mat('hull_dark', (0.045, 0.052, 0.065), 0.55, 0.6)
mat('floor_dark', (0.085, 0.095, 0.115), 0.45, 0.55)
mat('trim', (0.22, 0.26, 0.31), 0.45, 0.7)
mat('blue_glow', (0.1, 0.4, 0.9), 0.4, 0, (0.15, 0.55, 1.0), 3.2)
mat('white_glow', (0.8, 0.9, 1.0), 0.4, 0, (0.8, 0.9, 1.0), 5.0)
mat('door_a_glow', (0.1, 0.9, 1.0), 0.4, 0, (0.15, 0.95, 1.0), 4.0)
mat('door_b_glow', (0.55, 0.8, 1.0), 0.4, 0, (0.7, 0.88, 1.0), 4.0)
mat('door_c_glow', (0.45, 0.3, 1.0), 0.4, 0, (0.5, 0.35, 1.0), 4.0)
mat('glass', (0.03, 0.07, 0.10), 0.05, 0.0, alpha=0.3)
mat('cont_red', (0.17, 0.12, 0.12), 0.6, 0.5)
mat('cont_blue', (0.09, 0.14, 0.21), 0.6, 0.5)
mat('cont_mustard', (0.17, 0.165, 0.13), 0.6, 0.5)
mat('cont_grey', (0.18, 0.19, 0.215), 0.6, 0.5)
mat('col', (1, 0, 1), 1.0, 0)

# ------------------------------------------------------------------ geometry helpers
ACC = {}


class Acc:
    def __init__(self, name, coll=None, origin=None):
        self.name = name
        self.coll = coll or VIS
        self.bm = bmesh.new()
        self.mats = []
        self.origin = origin

    def tag(self, mname, faces):
        if mname not in self.mats:
            self.mats.append(mname)
        i = self.mats.index(mname)
        for f in faces:
            f.material_index = i


def A(name, origin=None):
    if name not in ACC:
        ACC[name] = Acc(name, origin=origin)
    return ACC[name]


CS = Acc('COL_Static', COLL)


def _faces(verts):
    out = set()
    for v in verts:
        out.update(v.link_faces)
    return out


def _box(acc, m, c, s, rz):
    verts = bmesh.ops.create_cube(acc.bm, size=1.0)['verts']
    mx = Matrix.Translation(c) @ Matrix.Rotation(rad(rz), 4, 'Z') @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
    bmesh.ops.transform(acc.bm, matrix=mx, verts=verts)
    acc.tag(m, _faces(verts))


def box(acc, m, c, s, rz=0.0, col=False):
    _box(acc, m, Vector(c), s, rz)
    if col:
        _box(CS, 'col', Vector(c), s, rz)


def rbox(acc, m, r, a, z, sx, sy, sz, t=0.0, col=False):
    """Box in polar space: sx radial, sy tangential, sz tall, t tangent offset."""
    box(acc, m, P(r, a, z) + TV(a) * t, (sx, sy, sz), rz=a, col=col)


def beam(acc, m, p0, p1, w, h, col=False):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = d.to_track_quat('X', 'Z')

    def one(target, mname):
        verts = bmesh.ops.create_cube(target.bm, size=1.0)['verts']
        mx = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((d.length, w, h, 1.0))
        bmesh.ops.transform(target.bm, matrix=mx, verts=verts)
        target.tag(mname, _faces(verts))
    one(acc, m)
    if col:
        one(CS, 'col')


def _cyl(acc, m, c, r, h, seg, r2, axis):
    try:
        verts = bmesh.ops.create_cone(acc.bm, cap_ends=True, cap_tris=False, segments=seg,
                                      radius1=r, radius2=(r if r2 is None else r2), depth=h)['verts']
    except TypeError:
        verts = bmesh.ops.create_cone(acc.bm, cap_ends=True, cap_tris=False, segments=seg,
                                      diameter1=r * 2, diameter2=(r if r2 is None else r2) * 2, depth=h)['verts']
    rot = Matrix.Rotation(rad(90), 4, 'Y') if axis == 'X' else Matrix.Identity(4)
    bmesh.ops.transform(acc.bm, matrix=Matrix.Translation(c) @ rot, verts=verts)
    acc.tag(m, _faces(verts))


def cyl(acc, m, c, r, h, seg=24, r2=None, axis='Z', col=False):
    _cyl(acc, m, Vector(c), r, h, seg, r2, axis)
    if col:
        _cyl(CS, 'col', Vector(c), r, h, seg, r2, axis)


def _arc(acc, m, r0, r1, a0, a1, z0, z1, step):
    if a1 < a0:
        a1 += 360.0
    n = max(1, int(math.ceil((a1 - a0) / step)))
    ang = [a0 + (a1 - a0) * i / n for i in range(n + 1)]
    bm = acc.bm
    ib = [bm.verts.new(P(r0, a, z0)) for a in ang]
    ob = [bm.verts.new(P(r1, a, z0)) for a in ang]
    it = [bm.verts.new(P(r0, a, z1)) for a in ang]
    ot = [bm.verts.new(P(r1, a, z1)) for a in ang]
    fs = []
    for i in range(n):
        fs.append(bm.faces.new((it[i], ot[i], ot[i + 1], it[i + 1])))      # top
        fs.append(bm.faces.new((ib[i + 1], ob[i + 1], ob[i], ib[i])))      # bottom
        fs.append(bm.faces.new((ob[i], ob[i + 1], ot[i + 1], ot[i])))      # outer
        fs.append(bm.faces.new((it[i], it[i + 1], ib[i + 1], ib[i])))      # inner
    fs.append(bm.faces.new((ib[0], ob[0], ot[0], it[0])))
    fs.append(bm.faces.new((it[n], ot[n], ob[n], ib[n])))
    acc.tag(m, fs)


def arc(acc, m, r0, r1, a0, a1, z0, z1, step=5.0, col=False):
    _arc(acc, m, r0, r1, a0, a1, z0, z1, step)
    if col:
        _arc(CS, 'col', r0, r1, a0, a1, z0, z1, step)


def minus(a0, a1, skips):
    """Angular interval (a0,a1) with the (centre, half-width) skips removed."""
    if a1 < a0:
        a1 += 360.0
    cuts = sorted((c - w, c + w) for c, w in skips)
    # shift cuts into the interval's range
    shifted = []
    for lo, hi in cuts:
        for k in (-360.0, 0.0, 360.0):
            shifted.append((lo + k, hi + k))
    shifted.sort()
    out, cur = [], a0
    for lo, hi in shifted:
        if hi <= cur or lo >= a1:
            continue
        if lo > cur:
            out.append((cur, lo))
        cur = max(cur, hi)
    if cur < a1:
        out.append((cur, a1))
    return out


def flush(acc):
    bm = acc.bm
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if acc.origin is not None:
        bmesh.ops.translate(bm, vec=-Vector(acc.origin), verts=bm.verts[:])
    me = bpy.data.meshes.new(acc.name)
    bm.to_mesh(me)
    bm.free()
    for mname in acc.mats:
        me.materials.append(MATS[mname])
    for p in me.polygons:
        p.use_smooth = False
    ob = bpy.data.objects.new(acc.name, me)
    acc.coll.objects.link(ob)
    if acc.origin is not None:
        ob.location = acc.origin
    if acc.coll is COLL:
        ob.display_type = 'WIRE'
    return ob


def empty(name, loc, rot_deg=0.0, kind='ARROWS'):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = kind
    e.empty_display_size = 1.5
    e.location = loc
    e.rotation_euler = (0, 0, rad(rot_deg))
    VIS.objects.link(e)
    return e


# ------------------------------------------------------------------ openings in the wall
GAPS = [
    dict(name='window', a0=15, a1=75, z0=16.0, z1=29.0),
    dict(name='A', a0=86.5, a1=93.5, z0=0.0, z1=DOOR_H, accent='door_a_glow'),
    dict(name='B', a0=196.5, a1=203.5, z0=Z1, z1=Z1 + DOOR_H, accent='door_b_glow'),
    dict(name='elev', a0=265.5, a1=274.5, z0=0.0, z1=5.0, accent='blue_glow'),
    dict(name='C', a0=316.5, a1=323.5, z0=Z2, z1=Z2 + DOOR_H, accent='door_c_glow'),
]


def free_spans():
    gs = sorted((g['a0'], g['a1']) for g in GAPS)
    out, cur = [], 0.0
    for a0, a1 in gs:
        if a0 > cur:
            out.append((cur, a0))
        cur = max(cur, a1)
    if cur < 360:
        out.append((cur, 360.0))
    return out


GAP_SKIPS = [((g['a0'] + g['a1']) / 2, (g['a1'] - g['a0']) / 2 + 3.5) for g in GAPS]

# ------------------------------------------------------------------ shell: wall, floor, ceiling
wall = A('Hub_Wall')
for a0, a1 in free_spans():
    arc(wall, 'hull_light', R, R + T, a0, a1, 0, H, col=True)
for g in GAPS:
    if g['z0'] > 0:
        arc(wall, 'hull_light', R, R + T, g['a0'], g['a1'], 0, g['z0'], col=True)
    if g['z1'] < H:
        arc(wall, 'hull_light', R, R + T, g['a0'], g['a1'], g['z1'], H, col=True)
# dark skirting and panel lines so the wall reads as plates, not a smooth cylinder
for a0, a1 in free_spans():
    arc(wall, 'hull_dark', R - 0.18, R, a0, a1, 0, 1.1)
    for z in (4.0, 9.5, 12.0, 19.5, 24.5, 28.0):
        arc(wall, 'hull_dark', R - 0.08, R, a0, a1, z, z + 0.12)

ribs = A('Hub_Ribs')
for a in range(0, 360, 15):
    if any(abs(((a - c + 180) % 360) - 180) < w for c, w in GAP_SKIPS):
        continue
    rbox(ribs, 'hull_mid', R - 0.55, a, H / 2, 1.1, 1.3, H)
    rbox(ribs, 'hull_dark', R - 1.15, a, H / 2, 0.15, 0.7, H)

lights = A('Hub_Lights')
for z in (2.4, 11.0, 17.5, 24.0):
    for a0, a1 in free_spans():
        arc(lights, 'blue_glow', R - 0.2, R - 0.08, a0, a1, z, z + 0.14)

floor = A('Hub_Floor')
arc(floor, 'floor_dark', 1.0, R + T, 0, 360, -1.0, 0.0, step=6, col=True)
for r in (8.6, 17.0, 26.8):
    arc(lights, 'blue_glow', r - 0.12, r + 0.12, 0, 360, 0.0, 0.03, step=6)
for a in range(0, 360, 30):  # radial hazard lines
    rbox(floor, 'hull_dark', 19.5, a, 0.015, 22.0, 0.18, 0.03)
arc(floor, 'hull_mid', 6.5, 12.0, 0, 360, 0.0, 0.5, step=6, col=True)
arc(lights, 'blue_glow', 11.75, 12.0, 0, 360, 0.45, 0.5, step=6)

ceil = A('Hub_Ceiling')
arc(ceil, 'hull_mid', 6.0, R + T, 0, 360, H, H + 1.2, step=6)
for r in (14.0, 24.0):
    arc(lights, 'white_glow', r, r + 1.0, 0, 360, H - 0.12, H, step=6)

# ------------------------------------------------------------------ the core
core = A('Hub_Core')
cyl(core, 'hull_dark', (0, 0, (H + 1) / 2), 1.8, H + 1, 32, col=True)
cyl(core, 'hull_mid', (0, 0, 0.6), 6.5, 1.2, 48, col=True)
cyl(core, 'floor_dark', (0, 0, 1.45), 5.3, 0.5, 48)
for k in range(6):
    a = k * 60 + 30
    rbox(core, 'hull_dark', 4.2, a, 1.7, 2.2, 2.6, 1.0, col=True)
    rbox(core, 'blue_glow', 3.05, a, 2.45, 0.1, 2.0, 0.5)
for z in range(3, 32, 4):
    cyl(core, 'hull_mid', (0, 0, z), 2.3, 0.35, 32)
    cyl(core, 'blue_glow', (0, 0, z), 2.34, 0.08, 32)
for z in (20.0, 25.0):
    arc(core, 'hull_mid', 4.0, 7.0, 0, 360, z, z + 0.6, step=6)
    arc(core, 'blue_glow', 4.0, 4.14, 0, 360, z + 0.5, z + 0.68, step=6)
    for a in (0, 90, 180, 270):
        rbox(core, 'hull_dark', 2.9, a, z + 0.3, 2.2, 0.4, 0.4)

lift = A('LIFT_Level3')
cyl(lift, 'hull_light', (0, 0, Z2 - 0.25), 5.0, 0.5, 48)
arc(lift, 'blue_glow', 4.75, 5.0, 0, 360, Z2 - 0.06, Z2 + 0.02, step=6)
for a in range(0, 360, 45):
    rbox(lift, 'hull_dark', 3.6, a, Z2 - 0.9, 3.0, 0.4, 0.5)

# ------------------------------------------------------------------ catwalks and gantries
walk = A('Hub_Walkways')


def rails(acc, r, a0, a1, z, skips=(), post_m=3.0):
    for lo, hi in minus(a0, a1, list(skips)):
        if acc.coll is VIS and acc.origin is None:
            _arc(CS, 'col', r - 0.03, r + 0.1, lo, hi, z, z + 1.05, 4)  # an invisible wall so you can't walk through the rail
        arc(acc, 'hull_dark', r, r + 0.07, lo, hi, z + 1.0, z + 1.08, step=4)
        arc(acc, 'hull_dark', r, r + 0.07, lo, hi, z + 0.5, z + 0.56, step=4)
        n = max(1, int(math.radians(hi - lo) * r / post_m))
        for i in range(n + 1):
            a = lo + (hi - lo) * i / n
            rbox(acc, 'hull_dark', r + 0.035, a, z + 0.5, 0.07, 0.07, 1.0)


def deck(acc, r0, r1, a0, a1, z, skips_in=(), skips_out=(), trim=True, col=True):
    arc(acc, 'hull_light', r0, r1, a0, a1, z - 0.5, z, col=col)
    if trim:
        arc(acc, 'blue_glow', r0, r0 + 0.1, a0, a1, z - 0.08, z + 0.01)
        arc(acc, 'blue_glow', r1 - 0.1, r1, a0, a1, z - 0.08, z + 0.01)
    rails(acc, r0, a0, a1, z, skips_in)
    rails(acc, r1 - 0.07, a0, a1, z, skips_out)


# tier 1 ring (R 21-26): three arcs; the gap between 112 and 160 is the restorable ROT piece
deck(walk, 21, 26, 160, 238, Z1, skips_out=[(200, 6)])
deck(walk, 21, 26, 256, 340, Z1, skips_in=[(300, 6)])
deck(walk, 21, 26, 358, 112, Z1)
rot1 = A('ROT_T1_Restore', origin=(0, 0, 0))
deck(rot1, 21, 26, 112, 160, Z1, col=False)

# tier 2 ring (R 26-30.5)
deck(walk, 26, 30.5, 300, 352, Z2, skips_in=[(330, 5)], skips_out=[(320, 6)])
deck(walk, 26, 30.5, 14, 112, Z2, skips_in=[(90, 5), (106, 8)])
deck(walk, 26, 30.5, 190, 230, Z2, skips_in=[(210, 5)])
rot2a = A('ROT_T2_RestoreA', origin=(0, 0, 0))
deck(rot2a, 26, 30.5, 112, 190, Z2, col=False)
rot2b = A('ROT_T2_RestoreB', origin=(0, 0, 0))
deck(rot2b, 26, 30.5, 230, 300, Z2, col=False)

# floating platforms across the short gaps (the game moves these)
for name, a, r0, r1, z in (('MOVE_T1_GapA', 247.0, 21.0, 26.0, Z1),
                           ('MOVE_T1_GapB', 349.0, 21.0, 26.0, Z1),
                           ('MOVE_T2_Gap', 3.0, 26.0, 30.5, Z2)):
    centre = P((r0 + r1) / 2, a, z - 0.25)
    m = A(name, origin=tuple(centre))
    rbox(m, 'hull_light', (r0 + r1) / 2, a, z - 0.25, r1 - r0, 3.2, 0.5)
    rbox(m, 'blue_glow', (r0 + r1) / 2, a, z + 0.01, r1 - r0 - 0.4, 0.15, 0.03)
    rbox(m, 'hull_dark', (r0 + r1) / 2, a, z - 0.7, 1.2, 1.2, 0.5)

# landings out to the doors
rbox(walk, 'hull_light', 29.0, 200, Z1 - 0.25, 6.0, 6.0, 0.5, col=True)
for s in (-3.0, 3.0):
    rbox(CS, 'col', 29.0, 200, Z1 + 0.525, 6.0, 0.1, 1.05, t=s)
    beam(walk, 'hull_dark', P(26, 200, Z1 + 1.0) + TV(200) * s, P(32, 200, Z1 + 1.0) + TV(200) * s, 0.07, 0.07)
rbox(walk, 'hull_light', 31.25, 320, Z2 - 0.25, 1.5, 6.0, 0.5, col=True)

# radial gantries from the lift out to the outer ring
for a in (90, 210, 330):
    rbox(walk, 'hull_light', 15.5, a, Z2 - 0.25, 21.0, 3.0, 0.5, col=True)
    rbox(walk, 'hull_dark', 15.5, a, Z2 - 0.85, 21.0, 0.5, 0.7)
    for s in (-1.5, 1.5):
        rbox(CS, 'col', 15.5, a, Z2 + 0.525, 21.0, 0.1, 1.05, t=s)
        beam(walk, 'hull_dark', P(5, a, Z2 + 1.0) + TV(a) * s, P(26, a, Z2 + 1.0) + TV(a) * s, 0.07, 0.07)
        beam(walk, 'hull_dark', P(5, a, Z2 + 0.5) + TV(a) * s, P(26, a, Z2 + 0.5) + TV(a) * s, 0.06, 0.06)
        for r in range(6, 26, 4):
            rbox(walk, 'hull_dark', r, a, Z2 + 0.5, 0.07, 0.07, 1.0, t=s)
    for r in (9.0, 17.0):  # light bars along the gantry
        rbox(walk, 'blue_glow', r, a, Z2 + 0.01, 0.3, 2.4, 0.02)

# stair A: ground to tier 1, straight, radial
stairs = A('Hub_Stairs')
ST_A = 300.0
n, r_a, r_b = 23, 12.5, 21.0
dr = (r_b - r_a) / n
for i in range(n):
    r = r_a + dr * (i + 0.5)
    zt = Z1 * (i + 1) / n
    rbox(stairs, 'hull_light', r, ST_A, zt - 0.06, dr * 1.06, 3.2, 0.12)
    rbox(CS, 'col', r, ST_A, zt - 0.25, dr * 1.06, 3.2, 0.5)
for s in (-1.6, 1.6):
    beam(stairs, 'hull_dark', P(r_a, ST_A, 0.1) + TV(ST_A) * s, P(r_b, ST_A, Z1 - 0.35) + TV(ST_A) * s, 0.15, 0.5)
for s in (-1.75, 1.75):
    beam(CS, 'col', P(r_a, ST_A, 0.5) + TV(ST_A) * s, P(r_b, ST_A, Z1 + 0.5) + TV(ST_A) * s, 0.1, 1.05)
    beam(stairs, 'hull_dark', P(r_a, ST_A, 1.0) + TV(ST_A) * s, P(r_b, ST_A, Z1 + 1.0) + TV(ST_A) * s, 0.07, 0.07)
    beam(stairs, 'hull_dark', P(r_a, ST_A, 0.5) + TV(ST_A) * s, P(r_b, ST_A, Z1 + 0.5) + TV(ST_A) * s, 0.06, 0.06)

# stair B: tier 1 to tier 2, curved so it hugs the ring
n, a_lo, a_hi = 24, 70.0, 106.0
da = (a_hi - a_lo) / n
RB = 23.5
for i in range(n):
    a = a_lo + da * (i + 0.5)
    zt = Z1 + (Z2 - Z1) * (i + 1) / n
    tl = math.radians(da) * RB
    rbox(stairs, 'hull_light', RB, a, zt - 0.06, 3.0, tl * 1.08, 0.12)
    rbox(CS, 'col', RB, a, zt - 0.25, 3.0, tl * 1.08, 0.5)
    if i % 4 == 3:
        for r in (22.2, 24.8):
            cyl(stairs, 'hull_dark', P(r, a, (Z1 + zt - 0.12) / 2), 0.14, zt - 0.12 - Z1, 8)
for r in (21.9, 25.1):
    for i in range(-1, n + 1):
        a0_ = a_lo + da * i
        a1_ = a_lo + da * (i + 1)
        z0_ = Z1 + (Z2 - Z1) * i / n + 1.0
        z1_ = Z1 + (Z2 - Z1) * (i + 1) / n + 1.0
        beam(stairs, 'hull_dark', P(r, a0_, z0_), P(r, a1_, z1_), 0.07, 0.07)
arc(stairs, 'hull_light', 22, 26, 106, 112, Z2 - 0.5, Z2)
arc(CS, 'col', 22, 26, 106, 112, Z2 - 0.5, Z2, 5.0)

# ------------------------------------------------------------------ doors
frames = A('Hub_Frames')
for g in GAPS:
    if g['name'] in ('A', 'B', 'C'):
        a0, a1, z0, z1, acc_m = g['a0'], g['a1'], g['z0'], g['z1'], g['accent']
        d = A('DOOR_' + g['name'])
        arc(d, 'hull_dark', R + 0.2, R + T - 0.2, a0, a1, z0, z1, step=1.5)
        arc(d, acc_m, R + 0.14, R + 0.24, a0 + 0.6, a1 - 0.6, z0 + 2.1, z0 + 2.3, step=1.5)
        c = (a0 + a1) / 2
        arc(d, acc_m, R + 0.14, R + 0.24, c - 0.12, c + 0.12, z0 + 0.2, z1 - 0.2, step=1.0)
        arc(frames, 'hull_mid', R - 0.9, R, a0 - 1.0, a0, z0, z1 + 0.6, step=1.0)
        arc(frames, 'hull_mid', R - 0.9, R, a1, a1 + 1.0, z0, z1 + 0.6, step=1.0)
        arc(frames, 'hull_mid', R - 0.9, R, a0 - 1.0, a1 + 1.0, z1, z1 + 0.6, step=1.0)
        arc(frames, acc_m, R - 0.96, R - 0.88, a0 - 1.0, a1 + 1.0, z1 + 0.2, z1 + 0.4, step=1.0)
        empty('ROOM_%s_Entry' % g['name'], P(R + 3.0, c, z0 + 0.05), c + 180)

        # the bedroom itself: a pod bolted to the outside of the atrium wall
        POD_D, POD_W = 9.0, 7.0
        r0, r1 = R + T, R + T + POD_D
        rc = (r0 + r1) / 2
        pod = A('Hub_Pod_' + g['name'])
        rbox(pod, 'floor_dark', rc, c, z0 - 0.25, POD_D, POD_W, 0.5, col=True)
        for s in (-POD_W / 2 + 0.15, POD_W / 2 - 0.15):
            rbox(pod, 'hull_mid', rc, c, z0 + 2.4, POD_D, 0.3, 4.8, t=s, col=True)
        rbox(pod, 'hull_mid', r1 - 0.15, c, z0 + 2.4, 0.3, POD_W, 4.8, col=True)
        rbox(pod, 'hull_mid', rc, c, z0 + 4.65, POD_D, POD_W, 0.3, col=True)
        rbox(pod, 'white_glow', rc, c, z0 + 4.48, 4.0, 0.5, 0.04)       # ceiling light
        rbox(pod, 'hull_dark', r1 - 1.2, c, z0 + 0.3, 1.2, 2.4, 0.6, t=-2.1, col=True)   # bed frame
        rbox(pod, 'hull_mid', r1 - 1.2, c, z0 + 0.65, 1.1, 2.3, 0.15, t=-2.1)            # mattress
        rbox(pod, 'hull_light', r1 - 0.8, c, z0 + 0.45, 0.8, 2.0, 0.9, t=1.7, col=True)  # desk
        rbox(pod, 'hull_dark', r0 + 1.3, c, z0 + 1.0, 0.6, 0.9, 2.0, t=2.8, col=True)    # locker
        rbox(pod, acc_m, r1 - 0.4, c, z0 + 1.45, 0.1, 0.9, 0.5, t=1.7)                   # tape player screen
        if z0 > 0:  # the upper pods stand on struts
            for dr, s in ((1.2, -3.0), (1.2, 3.0), (POD_D - 1.2, -3.0), (POD_D - 1.2, 3.0)):
                strut = P(r0 + dr, c, 0) + TV(c) * s
                cyl(pod, 'hull_dark', (strut.x, strut.y, (z0 - 0.5) / 2), 0.2, z0 - 0.5, 8)
        empty('TAPE_%s' % g['name'], P(r1 - 1.3, c, z0 + 1.0) + TV(c) * 1.7)

# window: glass, mullions, sill
gl = A('GLASS_Window')
arc(gl, 'glass', R + 0.5, R + 0.6, 15, 75, 16.0, 29.0, step=3)
mull = A('Hub_Mullions')
for a in [15 + 7.5 * k for k in range(9)]:
    arc(mull, 'hull_mid', R - 0.7, R + 0.3, a - 0.5, a + 0.5, 16.0, 29.0, step=1.0)
for z in (22.3,):
    arc(mull, 'hull_mid', R - 0.6, R + 0.3, 15, 75, z, z + 0.4)
arc(mull, 'hull_dark', R - 1.6, R, 15, 75, 15.6, 16.0)

# ------------------------------------------------------------------ arrival elevator (south wall, 270 degrees)
elev = A('Hub_Elevator')
EA = 270.0
r_in, r_out = R + T, R + T + 5.0
rc = (r_in + r_out) / 2
rbox(elev, 'floor_dark', rc, EA, -0.25, 5.0, 5.4, 0.5, col=True)
for s in (-2.65, 2.65):
    rbox(elev, 'hull_mid', rc, EA, 2.6, 5.2, 0.3, 5.6, t=s, col=True)
rbox(elev, 'hull_mid', r_out + 0.15, EA, 2.6, 0.3, 5.6, 5.6, col=True)
rbox(elev, 'hull_mid', rc, EA, 5.15, 5.2, 5.6, 0.3, col=True)
rbox(elev, 'white_glow', rc, EA, 4.95, 3.0, 0.5, 0.05)
rbox(elev, 'blue_glow', rc, EA, 2.5, 0.05, 3.0, 0.15, t=0)
for nm, s in (('ELEVATOR_Door_L', -1.2), ('ELEVATOR_Door_R', 1.2)):
    ctr = P(R + 0.4, EA, 2.5) + TV(EA) * s
    ed = A(nm, origin=tuple(ctr))
    rbox(ed, 'hull_dark', R + 0.4, EA, 2.5, 0.3, 2.4, 5.0, t=s)
    rbox(ed, 'blue_glow', R + 0.22, EA, 2.5, 0.06, 0.1, 4.6, t=s + (0.9 if s < 0 else -0.9))
arc(frames, 'hull_mid', R - 0.9, R, 265.5 - 1.2, 265.5, 0, 5.6, step=1.0)
arc(frames, 'hull_mid', R - 0.9, R, 274.5, 274.5 + 1.2, 0, 5.6, step=1.0)
arc(frames, 'hull_mid', R - 0.9, R, 265.5 - 1.2, 274.5 + 1.2, 5.0, 5.6, step=1.0)
arc(frames, 'blue_glow', R - 0.96, R - 0.88, 265.5 - 1.2, 274.5 + 1.2, 5.2, 5.4, step=1.0)
empty('SPAWN_Arrival', P(R - 4.0, EA, 0.05), EA + 180)

# ------------------------------------------------------------------ cargo yard (ground, west side)
random.seed(7)
yard = A('Hub_CargoYard')
CMATS = ['cont_red', 'cont_blue', 'cont_mustard', 'cont_grey']
for r in (18.5, 22.0, 25.5, 29.0):
    a = 128.0
    step = math.degrees(7.0 / r)
    while a < 190:
        if not (155 <= a <= 165) and random.random() > 0.22:
            layers = random.choice([1, 1, 2])
            m = random.choice(CMATS)
            jit = random.uniform(-3, 3)
            for L in range(layers):
                z = 2.6 * (L + 0.5)
                box(yard, m, P(r, a, z), (6.0, 2.45, 2.6), rz=a + 90 + jit, col=True)
                box(yard, 'hull_dark', P(r, a, z), (6.05, 2.5, 0.12), rz=a + 90 + jit)
                box(yard, 'hull_dark', P(r, a, z - 1.2), (6.05, 2.5, 0.12), rz=a + 90 + jit)
        a += step

# crane: a fixed tower, and an arm the game can swing
tw = A('Hub_Crane')
cyl(tw, 'hull_mid', P(31.0, 159, 8.2), 0.8, 16.4, 16, col=True)
pivot = P(31.0, 159, 16.8)
arm = A('MOVE_CraneArm', origin=tuple(pivot))
inward = -P(1.0, 159, 0)
tip = pivot + inward * 16.0
beam(arm, 'hull_mid', pivot, tip, 0.7, 0.9)
beam(arm, 'trim', pivot + Vector((0, 0, 0.45)), pivot + inward * 6 + Vector((0, 0, 0.45)), 0.2, 0.2)
cyl(arm, 'hull_dark', (tip.x, tip.y, 13.8), 0.05, 5.6, 6)
box(arm, 'trim', (tip.x, tip.y, 10.8), (0.7, 0.7, 0.9))

# ------------------------------------------------------------------ machinery bay (ground, east side)
mach = A('Hub_Machinery')
for r, a, cr, ch in ((20, 336, 2.4, 6.0), (24, 345, 2.0, 5.0), (27, 352, 2.8, 4.5),
                     (19, 358, 1.8, 5.5), (23, 5, 2.2, 6.0), (28, 12, 2.4, 5.0)):
    cyl(mach, 'hull_mid', P(r, a, ch / 2), cr, ch, 20, col=True)
    cyl(mach, 'blue_glow', P(r, a, ch * 0.62), cr + 0.03, 0.12, 20)
    cyl(mach, 'hull_dark', P(r, a, ch + 0.15), cr * 0.8, 0.3, 20)
    rbox(mach, 'hull_dark', r, a, 0.3, cr * 2 + 1.0, cr * 2 + 1.0, 0.6, col=True)
for r, a, lw, lh in ((17, 340, 3.0, 1.4), (21, 350, 2.4, 1.1), (25, 358, 3.2, 1.6)):
    rbox(mach, 'cont_mustard', r, a, lh / 2, lw, 2.0, lh, col=True)

# ------------------------------------------------------------------ pipes, trusses
pipes = A('Hub_Pipes')
for k, a in enumerate(range(7, 360, 15)):
    if any(abs(((a - c + 180) % 360) - 180) < w for c, w in GAP_SKIPS):
        continue
    cyl(pipes, 'hull_dark', P(R - 0.5, a, H / 2), 0.28 if k % 2 else 0.45, H, 10)
    if k % 3 == 0:
        cyl(pipes, 'trim', P(R - 0.5, a, 6.0), 0.5, 0.25, 10)
        cyl(pipes, 'trim', P(R - 0.5, a, 20.0), 0.5, 0.25, 10)
for a0, a1 in free_spans():
    for z in (6.0, 12.5, 25.5):
        arc(pipes, 'hull_dark', R - 1.0, R - 0.55, a0, a1, z, z + 0.45, step=5)

truss = A('Hub_Trusses')
for a in range(0, 360, 30):
    top, bot = H - 2.5, H - 4.5
    beam(truss, 'hull_dark', P(6.5, a, top), P(31.5, a, top), 0.4, 0.4)
    beam(truss, 'hull_dark', P(6.5, a, bot), P(31.5, a, bot), 0.4, 0.4)
    rs = [6.5 + 5.0 * i for i in range(6)]
    for i in range(len(rs) - 1):
        z0_, z1_ = (top, bot) if i % 2 == 0 else (bot, top)
        beam(truss, 'hull_dark', P(rs[i], a, z0_), P(rs[i + 1], a, z1_), 0.22, 0.22)
for r in (12.0, 22.0):
    arc(truss, 'hull_mid', r - 0.3, r + 0.3, 0, 360, H - 3.8, H - 3.2, step=6)

# ------------------------------------------------------------------ pipe canyon: the dense, cluttered part (ground, under the window)
random.seed(21)
canyon = A('Hub_PipeCanyon')
LANE = (44.0, 56.0)  # keep one clear lane through the middle
NOGO = [(23.0, 50.0), (21.5, 50.5)]  # the flare pickup and its log terminal (polar r, angle)


def near_nogo(r, a, pad=3.5):
    return any((P(r, a, 0) - P(nr, na, 0)).length < pad for nr, na in NOGO)


for i in range(58):
    a = random.uniform(20, 80)
    if LANE[0] < a < LANE[1]:
        continue
    r = random.uniform(15.5, 30.0)
    if near_nogo(r, a):
        continue
    if 21.0 <= r <= 26.4:
        h = random.uniform(2.0, 5.5)        # tier 1 ring is overhead here
    elif r > 26.4:
        h = random.uniform(3.0, 12.5)
    else:
        h = random.uniform(3.0, 20.0)
    cr = random.uniform(0.5, 1.5)
    kind = random.random()
    if kind < 0.55:  # tank
        cyl(canyon, random.choice(['hull_mid', 'hull_dark', 'hull_light']), P(r, a, h / 2), cr, h, 16, col=True)
        for bz in (h * 0.3, h * 0.7):
            cyl(canyon, 'trim' if random.random() < 0.3 else 'hull_dark', P(r, a, bz), cr + 0.06, 0.22, 16)
        cyl(canyon, 'hull_dark', P(r, a, h + 0.15), cr * 0.6, 0.3, 12)
    elif kind < 0.8:  # machine block
        bw, bd = random.uniform(1.6, 3.2), random.uniform(1.6, 3.2)
        rbox(canyon, random.choice(['hull_mid', 'cont_grey', 'hull_dark']), r, a, min(h, 4.5) / 2, bw, bd, min(h, 4.5), col=True)
        rbox(canyon, 'blue_glow', r, a, min(h, 4.5) * 0.7, bw + 0.04, 0.2, 0.15)
    else:  # glowing reactor coil
        cyl(canyon, 'hull_dark', P(r, a, h / 2), cr * 0.7, h, 12, col=True)
        for bz in range(1, int(h), 2):
            cyl(canyon, 'blue_glow', P(r, a, bz), cr * 0.7 + 0.05, 0.12, 12)

for i in range(26):  # pipe runs low enough to pass under the tier 1 ring
    a1 = random.uniform(20, 80)
    if LANE[0] < a1 < LANE[1]:
        continue
    r1 = random.uniform(15.5, 30.0)
    a2 = a1 + random.uniform(-6, 6)
    r2 = r1 + random.uniform(-5, 5)
    z = random.choice([1.2, 2.4, 3.6, 4.8])
    beam(canyon, 'hull_dark', P(r1, a1, z), P(r2, a2, z), random.uniform(0.2, 0.5), random.uniform(0.2, 0.5))
    cyl(canyon, 'trim', P(r1, a1, z), 0.4, 0.2, 10)

for (r, a) in ((17.0, 30.0), (28.0, 36.0), (18.0, 66.0), (29.0, 72.0)):  # scaffolds you can climb
    for dx, dy in ((-1.6, -1.6), (1.6, -1.6), (-1.6, 1.6), (1.6, 1.6)):
        pt = P(r, a, 0) + Vector((dx, dy, 0))
        cyl(canyon, 'hull_dark', (pt.x, pt.y, 2.6), 0.07, 5.2, 6)
    box(canyon, 'hull_mid', P(r, a, 1.3), (3.4, 3.4, 0.12), col=True)
    box(canyon, 'hull_mid', P(r, a, 2.6), (3.4, 3.4, 0.12), col=True)

for a in range(10, 360, 45):  # overhead pipe runs across the atrium
    beam(canyon, 'hull_dark', P(7.0, a, 26.6), P(31.0, a, 26.6), 0.55, 0.55)
    for r in (10, 16, 22, 28):
        rbox(canyon, 'trim', r, a, 26.6, 0.35, 0.8, 0.8)

# wall greebles: panels and vents so the wall reads as built, not smooth
random.seed(5)
panels = A('Hub_WallPanels')
for a in range(0, 360):
    if a % 5 != 2 or any(abs(((a - c + 180) % 360) - 180) < w for c, w in GAP_SKIPS):
        continue
    for _ in range(random.choice([1, 2, 2, 3])):
        z = random.uniform(2.0, 29.0)
        h = random.uniform(1.2, 3.5)
        m = random.choice(['hull_mid', 'hull_dark', 'hull_mid', 'hull_light'])
        rbox(panels, m, R - 0.18, a, z, 0.3, math.radians(3.2) * R * 0.8, h)
        if random.random() < 0.35:
            rbox(panels, random.choice(['blue_glow', 'blue_glow', 'door_b_glow']), R - 0.35, a, z + h * 0.2, 0.06, 0.9, 0.12)

# ------------------------------------------------------------------ reference figure (not exported)
ref = A('REF_Voss_1p8m')
box(ref, 'trim', P(R - 7, EA, 0.9), (0.5, 0.4, 1.8), rz=EA)

# ------------------------------------------------------------------ build objects
objs = {}
for name, acc in list(ACC.items()):
    objs[name] = flush(acc)
cs = flush(CS)
cs.name = 'COL_Static'

# ------------------------------------------------------------------ report
stats = {}
tris = 0
for o in objs.values():
    t = sum(len(p.vertices) - 2 for p in o.data.polygons)
    stats[o.name] = t
    tris += t
print('HUB objects:', len(objs), 'visible triangles ~', tris)
print('collision triangles ~', sum(len(p.vertices) - 2 for p in cs.data.polygons))
for k in sorted(stats, key=lambda k: -stats[k])[:8]:
    print('  %-22s %6d' % (k, stats[k]))

# ------------------------------------------------------------------ save + export
if OUT_BLEND:
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
    print('saved', OUT_BLEND)

if OUT_GLB:
    objs['REF_Voss_1p8m'].hide_viewport = True
    objs['REF_Voss_1p8m'].hide_render = True
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_visible=True,
                              export_apply=True, export_yup=True)
    print('exported', OUT_GLB)

# ------------------------------------------------------------------ preview renders (not saved)
if PREVIEW_DIR:
    import os
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    objs['REF_Voss_1p8m'].hide_viewport = False
    objs['REF_Voss_1p8m'].hide_render = False
    cs.hide_render = True
    for e in [o for o in bpy.data.objects if o.type == 'EMPTY']:
        e.hide_render = True

    world = bpy.data.worlds.new('W')
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    bg.inputs['Color'].default_value = (0.02, 0.03, 0.05, 1)
    bg.inputs['Strength'].default_value = 1.0
    scene.world = world

    def light(kind, loc, energy, color=(1, 1, 1), size=6.0):
        ld = bpy.data.lights.new('pl', kind)
        ld.energy = energy
        ld.color = color
        if kind == 'AREA':
            ld.size = size
        else:
            ld.shadow_soft_size = size
        lo = bpy.data.objects.new('pl', ld)
        scene.collection.objects.link(lo)
        lo.location = loc
        return lo

    light('POINT', (0, 0, 24), 90000, (0.75, 0.88, 1.0), 4)
    light('POINT', (0, 0, 9), 40000, (0.7, 0.85, 1.0), 3)
    light('POINT', P(24, 250, 10), 30000, (0.8, 0.9, 1.0), 3)
    light('POINT', P(24, 70, 10), 30000, (0.8, 0.9, 1.0), 3)
    light('POINT', P(24, 160, 12), 30000, (1.0, 0.8, 0.6), 3)
    light('POINT', P(22, 340, 12), 30000, (0.8, 0.9, 1.0), 3)

    eng = None
    for cand in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT', 'CYCLES', 'BLENDER_WORKBENCH'):
        try:
            scene.render.engine = cand
            eng = cand
            break
        except TypeError:
            continue
    print('render engine', eng)
    if eng == 'CYCLES':
        scene.cycles.samples = 48
        scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1280, 720
    scene.render.image_settings.file_format = 'PNG'
    try:
        scene.view_settings.view_transform = 'AgX'
    except Exception:
        pass

    cam_d = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cam_d)
    scene.collection.objects.link(cam)
    scene.camera = cam

    def shot(name, loc, target, lens, hide=()):
        cam_d.lens = lens
        cam.location = loc
        d = Vector(target) - Vector(loc)
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        for h in hide:
            objs[h].hide_render = True
        scene.render.filepath = os.path.join(PREVIEW_DIR, name + '.png')
        bpy.ops.render.render(write_still=True)
        for h in hide:
            objs[h].hide_render = False
        print('rendered', name)

    shot('overview', (0, -78, 62), (0, 0, 12), 30, hide=('Hub_Wall', 'Hub_Ceiling', 'Hub_Trusses', 'Hub_Ribs'))
    light('POINT', P(R + T + 2.5, EA, 4.5), 3000, (0.8, 0.9, 1.0), 1)
    shot('arrival', P(R + T + 3.8, EA, 1.7), (0, 0, 10), 22, hide=('ELEVATOR_Door_L', 'ELEVATOR_Door_R'))
    shot('canyon', P(9, 100, 1.7), P(24, 48, 4), 24)
    shot('yard', P(24, 300, Z1 + 1.7), P(24, 160, 3), 26)
