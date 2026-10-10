"""
Level 2: the habitat atrium (see the "Halcyon-9 Level 2 Design Spec" doc). A bright two-storey
hall where the crew lived: a sunken lounge with sofas and a tree island in the middle, planter
beds, angled black pillars with cyan rings, a big window onto the sea, an upper gallery with the
doors to Dr. Kessler's room, the lab and Voss's room, and ARIA's monitors everywhere.

Run (from the repo root; fetch the plants first with node Blender/scripts/fetch_plants.cjs):
  blender -b --factory-startup --python Blender/scripts/build_l2_atrium.py -- \
      Blender/l2-atrium.blend public/assets/models/l2-atrium.glb

Blender coordinates: x east, y north, z up. Angles are degrees from east, counter-clockwise
(north = 90). The lift is in the south wall; you walk out facing north toward the lounge and the
windows.

Names the game reads: COL_ collision, DOOR_ doors, ELEVATOR_Door_ lift doors, SPAWN_Lift,
ARIA_<n> monitor screens (where ARIA appears), PT_ markers, PLANT_ plants (no collision),
leaf materials (cut out by their alpha).
"""
import sys, os, math, random, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
import kit
from kit import A, box, beam, cyl, empty, finish, _faces

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_BLEND = argv[0] if len(argv) > 0 else None
OUT_GLB = argv[1] if len(argv) > 1 else None
PLANT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'plants')

kit.begin('Atrium', palette='habitat')
random.seed(3)

R = 17.0          # inner radius of the outer wall
T = 0.5           # wall thickness
H = 13.0          # ceiling height
ZG = 5.5          # gallery floor height
GR = 13.6         # gallery inner edge (railing)
rad = math.radians


def P(r, a, z):
    return Vector((r * math.cos(rad(a)), r * math.sin(rad(a)), z))


def TV(a):
    return Vector((-math.sin(rad(a)), math.cos(rad(a)), 0.0))


# ------------------------------------------------------------------ extra helpers (arcs, rotated boxes)
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
        fs.append(bm.faces.new((it[i], ot[i], ot[i + 1], it[i + 1])))
        fs.append(bm.faces.new((ib[i + 1], ob[i + 1], ob[i], ib[i])))
        fs.append(bm.faces.new((ob[i], ob[i + 1], ot[i + 1], ot[i])))
        fs.append(bm.faces.new((it[i], it[i + 1], ib[i + 1], ib[i])))
    fs.append(bm.faces.new((ib[0], ob[0], ot[0], it[0])))
    fs.append(bm.faces.new((it[n], ot[n], ob[n], ib[n])))
    acc.tag(m, fs)


def arc(acc, m, r0, r1, a0, a1, z0, z1, step=4.0, col=False):
    _arc(acc, m, r0, r1, a0, a1, z0, z1, step)
    if col:
        _arc(kit.CS, 'col', r0, r1, a0, a1, z0, z1, step)


def _rbox(acc, m, c, s, rz):
    verts = bmesh.ops.create_cube(acc.bm, size=1.0)['verts']
    mx = Matrix.Translation(c) @ Matrix.Rotation(rad(rz), 4, 'Z') @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
    bmesh.ops.transform(acc.bm, matrix=mx, verts=verts)
    acc.tag(m, _faces(verts))


def rbox(acc, m, r, a, z, sx, sy, sz, t=0.0, col=False):
    """Box in polar space: sx radial, sy tangential, sz tall, centred at height z."""
    c = P(r, a, z) + TV(a) * t
    _rbox(acc, m, c, (sx, sy, sz), a)
    if col:
        _rbox(kit.CS, 'col', c, (sx, sy, sz), a)


def ccyl(acc, m, c, r, h, seg=24, col=False):
    cyl(acc, m, c, r, h, seg)
    if col:
        cyl(kit.CS, 'col', c, r, h, seg)


# ------------------------------------------------------------------ openings in the outer wall
GAPS = [
    dict(name='window', a0=62, a1=118, z0=0.8, z1=5.0),
    dict(name='lab', a0=84, a1=96, z0=ZG, z1=ZG + 3.4),        # across the hall from the lift, above the window
    dict(name='pods', a0=172, a1=188, z0=0.0, z1=3.4),
    dict(name='lift', a0=263, a1=277, z0=0.0, z1=3.6),
    dict(name='voss', a0=353, a1=367, z0=ZG, z1=ZG + 3.2),
    dict(name='kessler', a0=38, a1=52, z0=ZG, z1=ZG + 3.2),
]


def free_spans():
    gs = sorted(((g['a0'] % 360, g['a1'] % 360 if g['a1'] % 360 > g['a0'] % 360 else g['a1'] % 360 + 360) for g in GAPS))
    out, cur = [], 7.0          # start after the Voss door, which wraps through 0
    for a0, a1 in gs:
        if a0 < 7.0:
            continue
        if a0 > cur:
            out.append((cur, a0))
        cur = max(cur, a1)
    if cur < 353.0:
        out.append((cur, 353.0))
    return out


wall = A('Atrium_Wall')
for a0, a1 in free_spans():
    arc(wall, 'hull_light', R, R + T, a0, a1, 0, H, col=True)
LAB = GAPS[1]
for g in GAPS:
    if g['name'] == 'lab':
        continue                        # the lab doorway sits inside the wall above the window (below)
    if g['z0'] > 0:
        arc(wall, 'hull_light', R, R + T, g['a0'], g['a1'], 0, g['z0'], step=2, col=True)
    if g['name'] == 'window':           # above the window, leaving the lab doorway open
        arc(wall, 'hull_light', R, R + T, g['a0'], LAB['a0'], g['z1'], H, step=2, col=True)
        arc(wall, 'hull_light', R, R + T, LAB['a1'], g['a1'], g['z1'], H, step=2, col=True)
        arc(wall, 'hull_light', R, R + T, LAB['a0'], LAB['a1'], g['z1'], LAB['z0'], step=2, col=True)
        arc(wall, 'hull_light', R, R + T, LAB['a0'], LAB['a1'], LAB['z1'], H, step=2, col=True)
        continue
    arc(wall, 'hull_light', R, R + T, g['a0'], g['a1'], g['z1'], H, step=2, col=True)
# light blue LED lines and a grey skirting along the wall
dress = A('Atrium_WallDetail')
for a0, a1 in free_spans():
    arc(dress, 'hull_mid', R - 0.12, R, a0, a1, 0, 0.35)
    for z in (3.4, 9.6):
        arc(dress, 'blue_glow', R - 0.1, R - 0.04, a0, a1, z, z + 0.08)
    a = a0 + 3.75
    while a < a1 - 1:          # vertical panel seams
        rbox(dress, 'hull_mid', R - 0.05, a, H / 2, 0.1, 0.12, H)
        a += 7.5

# ------------------------------------------------------------------ floor and the sunken lounge
floor = A('Atrium_Floor')
arc(floor, 'floor_dark', 7.3, R + T, 0, 360, -0.4, 0.0, step=6, col=True)
arc(floor, 'floor_dark', 6.5, 7.3, 0, 360, -0.7, -0.3, step=6, col=True)     # the step down
arc(floor, 'floor_dark', 0.3, 6.5, 0, 360, -1.0, -0.6, step=6, col=True)     # the lounge floor
arc(floor, 'blue_glow', 7.22, 7.3, 0, 360, -0.32, -0.01, step=6)              # lit edge of the step
paint = A('Atrium_FloorPaint')
for ring in (8.6, 11.8):                                                       # orange hexagon trim lines
    for k in range(6):
        a0, a1 = k * 60 + 30, k * 60 + 90
        p0, p1 = P(ring, a0, 0.012), P(ring, a1, 0.012)
        beam(paint, 'accent', p0, p1, 0.14, 0.024)
for k in range(6):
    beam(paint, 'accent', P(8.6, k * 60 + 30, 0.012), P(11.8, k * 60 + 30, 0.012), 0.12, 0.024)

# the tree island in the middle of the lounge
island = A('Atrium_Island')
ccyl(island, 'hull_light', (0, 0, -0.15), 2.4, 0.9, 40, col=True)
ccyl(island, 'accent', (0, 0, 0.12), 2.43, 0.1, 40)
ccyl(island, 'soil', (0, 0, 0.31), 2.25, 0.04, 40)
ccyl(island, 'blue_glow', (0, 0, -0.56), 2.45, 0.04, 40)
kit.mat('pebble', (0.50, 0.47, 0.42), 0.8, 0.0)
for k in range(170):                    # pebbles scattered over the soil, so the trees look planted
    q = P(math.sqrt(random.random()) * 2.15, random.uniform(0, 360), 0.335)
    verts = bmesh.ops.create_icosphere(island.bm, subdivisions=1, radius=random.uniform(0.025, 0.055))['verts']
    bmesh.ops.scale(island.bm, vec=(1, 1, 0.55), verts=verts)
    bmesh.ops.translate(island.bm, vec=q, verts=verts)
    island.tag(random.choice(['pebble', 'pebble', 'hull_mid']), _faces(verts))

# ------------------------------------------------------------------ soft furnishings
# Pillows and cushions are soft shapes, not boxes: a sphere pushed out into a rounded box, its
# thinnest side puffed up in the middle and pinched toward the edges, like a stuffed pillow.
# Smooth shaded (no hard edges), in woven fabric.
kit.mat('cushion_orange', (0.90, 0.44, 0.12), 0.9, 0.0)
kit.mat('cushion_blue', (0.30, 0.60, 0.70), 0.9, 0.0)
kit.mat('cap_orange', (0.92, 0.47, 0.10), 0.5, 0.0)        # smooth orange trim on the sofas (no metal texture)
cush = A('Atrium_Cushions')


def pillow(m, c, size, yaw=0.0, pitch=0.0, roll=0.0, pinch=0.5, round_=0.35):
    acc = cush
    island = bmesh.ops.create_icosphere(acc.bm, subdivisions=3, radius=1.0)['verts']
    thin = min(range(3), key=lambda i: size[i])     # the axis that gets puffed and pinched
    others = [i for i in range(3) if i != thin]
    e = 0.25 + round_                              # below 1 pushes the sphere out toward a rounded box
    for v in island:
        n = v.co.normalized()
        q = [math.copysign(abs(n[i]) ** e, n[i]) for i in range(3)]
        q[thin] *= (1 - pinch * min(1.0, q[others[0]] ** 2)) * (1 - pinch * min(1.0, q[others[1]] ** 2))
        v.co = Vector((q[0] * size[0] / 2, q[1] * size[1] / 2, q[2] * size[2] / 2))
    mat = (Matrix.Translation(Vector(c)) @ Matrix.Rotation(rad(yaw), 4, 'Z') @
           Matrix.Rotation(rad(pitch), 4, 'Y') @ Matrix.Rotation(rad(roll), 4, 'X'))
    bmesh.ops.transform(acc.bm, matrix=mat, verts=list(island))
    acc.tag(m, _faces(island))


# sofas curving round the lounge, gaps at north and south so you can walk down into it. Styled after
# the team's sci-fi operator chair: a black plinth with a light blue LED line, black cushions in a
# white shell, white armrests with orange pads, an orange cap on top of the back.
sofa = A('Atrium_Sofas')
for a0, a1 in ((110, 170), (190, 250), (290, 350), (10, 70)):
    mid = (a0 + a1) / 2
    arc(sofa, 'hull_dark', 4.4, 5.2, a0 + 1, a1 - 1, -0.6, -0.42, step=5)                # plinth
    arc(sofa, 'blue_glow', 4.38, 4.4, a0 + 1, a1 - 1, -0.53, -0.49, step=5)              # LED line round it
    arc(kit.CS, 'col', 4.2, 5.4, a0, a1, -0.6, -0.16, step=5)
    arc(sofa, 'hull_light', 5.05, 5.42, a0, a1, -0.42, 0.62, step=5, col=True)           # white back shell
    arc(sofa, 'hull_dark', 5.05, 5.42, mid - 7, mid + 7, 0.62, 0.66, step=2)
    arc(sofa, 'cap_orange', 5.08, 5.39, mid - 6, mid + 6, 0.66, 0.74, step=2)            # orange cap (smooth, padded)
    span = (a1 - a0 - 6.4) / 3
    chord = 2 * 4.62 * math.sin(rad(span / 2)) - 0.03
    for k in range(3):                                          # three plump seat cushions, three back cushions
        ac = a0 + 3.2 + (k + 0.5) * span
        pillow('fabric', P(4.62, ac, -0.28), (0.82, chord, 0.3), yaw=ac, pinch=0.12, round_=0.3)
        pillow('fabric', P(4.93, ac, 0.17), (0.2, chord, 0.6), yaw=ac, pitch=12, pinch=0.15, round_=0.3)
    for e0, e1 in ((a0, a0 + 3.0), (a1 - 3.0, a1)):                                       # armrests
        arc(sofa, 'hull_light', 4.2, 5.05, e0, e1, -0.42, 0.04, step=1, col=True)
        am = (e0 + e1) / 2
        pillow('cushion_orange', P(4.62, am, 0.09), (0.78, 2 * 4.62 * math.sin(rad(1.25)), 0.12), yaw=am, pinch=0.15, round_=0.3)
        arc(sofa, 'blue_glow', 4.18, 4.2, e0 + 0.5, e1 - 0.5, -0.24, -0.2, step=1)
    for k, m in enumerate(('cushion_blue', 'cushion_orange')):                           # throw pillows
        a = a0 + (a1 - a0) * (0.22 if k == 0 else 0.8)
        pillow(m, P(4.74, a, 0.12), (0.17, 0.46, 0.46), yaw=a + random.uniform(-15, 15), pitch=14,
               roll=random.uniform(-12, 12), pinch=0.6, round_=0.35)
for a, twist, rr in ((140, 31, 2.95), (320, 0, 3.3)):                         # low tables with holo tops
    c = P(rr, a + twist * 0.15, -0.4)                                          # (the first one shoved askew)
    _rbox(sofa, 'hull_dark', c, (1.0, 1.6, 0.4), a + twist)
    _rbox(kit.CS, 'col', c, (1.0, 1.6, 0.4), a + twist)
    _rbox(sofa, 'aria_screen', c + Vector((0, 0, 0.21)), (0.8, 1.4, 0.02), a + twist)
# a round rug under the lounge, light blue with an orange edge
kit.mat('rug', (0.24, 0.44, 0.52), 0.95, 0.0)
arc(sofa, 'rug', 2.6, 4.1, 0, 360, -0.6, -0.585, step=6)
arc(sofa, 'accent', 3.95, 4.02, 0, 360, -0.585, -0.582, step=6)
arc(sofa, 'accent', 2.68, 2.75, 0, 360, -0.585, -0.582, step=6)

# ------------------------------------------------------------------ growing food: raised beds and wall beds
# The crew grew their own food: tomatoes on stakes, rows of carrots, lettuce. Modelled here from
# simple leaf blades (light on the GPU, and our own work).
kit.mat('veg_leaf', (0.08, 0.26, 0.06), 0.75, 0.0)
kit.mat('veg_leaf_light', (0.15, 0.36, 0.09), 0.75, 0.0)
kit.mat('carrot', (0.90, 0.40, 0.06), 0.6, 0.0)
kit.mat('tomato', (0.72, 0.06, 0.04), 0.35, 0.0)
kit.mat('stake', (0.40, 0.30, 0.18), 0.8, 0.0)
kit.mat('veg_dead', (0.26, 0.19, 0.07), 0.9, 0.0)           # wilted, brown
kit.mat('veg_yellow', (0.42, 0.37, 0.10), 0.85, 0.0)        # yellowing
kit.mat('tomato_rotten', (0.20, 0.09, 0.035), 0.95, 0.0)    # shrivelled, blackened
for _nm in ('veg_leaf', 'veg_leaf_light', 'veg_dead', 'veg_yellow'):
    kit.MATS[_nm].use_backface_culling = False
veg = A('PLANT_Vegetables')


def leaf_blade(acc, m, base, direction, length, width, droop):
    side = direction.cross(Vector((0, 0, 1)))
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    tip = base + direction * length - Vector((0, 0, droop))
    mid = base + direction * (length * 0.5) + Vector((0, 0, length * 0.12))
    v = [acc.bm.verts.new(p) for p in (base, mid - side * width, tip, mid + side * width)]
    acc.tag(m, [acc.bm.faces.new((v[0], v[1], v[2])), acc.bm.faces.new((v[0], v[2], v[3]))])


def carrot(acc, p, rot=False):
    cyl(acc, 'carrot', (p.x, p.y, p.z + 0.02), 0.028, 0.05, 6)                 # orange top showing above the soil
    for k in range(6):
        ang = k / 6 * math.tau + random.uniform(-0.3, 0.3)
        lift = 0.35 if rot else 1.0                                             # a rotten one's leaves flop over
        d = Vector((math.cos(ang) * 0.35, math.sin(ang) * 0.35, lift)).normalized()
        leaf_blade(acc, 'veg_dead' if rot else 'veg_leaf_light', p + Vector((0, 0, 0.04)), d,
                   random.uniform(0.2, 0.3), 0.03, 0.1 if rot else 0.02)


def lettuce(acc, p, rot=False):
    for k in range(9):
        ang = k / 9 * math.tau + random.uniform(-0.2, 0.2)
        d = Vector((math.cos(ang), math.sin(ang), (0.05 if rot else 0.3) + (k % 3) * (0.08 if rot else 0.25))).normalized()
        m = random.choice(['veg_dead', 'veg_yellow']) if rot else ('veg_leaf_light' if k % 2 else 'veg_leaf')
        leaf_blade(acc, m, p + Vector((0, 0, 0.02)), d, 0.2, 0.09, 0.04 if rot else 0.0)


def tomato(acc, p, rot=False):
    cyl(acc, 'stake', (p.x, p.y, p.z + 0.65), 0.015, 1.3, 6)
    for k in range(14):
        ang = random.uniform(0, math.tau)
        d = Vector((math.cos(ang), math.sin(ang), random.uniform(-0.6, 0.0) if rot else random.uniform(-0.2, 0.5))).normalized()
        m = random.choice(['veg_dead', 'veg_yellow', 'veg_leaf']) if rot else 'veg_leaf'
        leaf_blade(acc, m, p + Vector((0, 0, random.uniform(0.15, 1.15))), d, random.uniform(0.18, 0.28), 0.07, 0.04)
    for k in range(5):
        ang = random.uniform(0, math.tau)
        q = p + Vector((math.cos(ang) * 0.12, math.sin(ang) * 0.12, random.uniform(0.3, 1.0)))
        bad = rot and random.random() < 0.7
        verts = bmesh.ops.create_uvsphere(acc.bm, u_segments=8, v_segments=6, radius=0.034 if bad else 0.045)['verts']
        if bad:
            bmesh.ops.scale(acc.bm, vec=(1.0, 0.85, 0.7), verts=verts)          # shrivelled
        bmesh.ops.translate(acc.bm, vec=q, verts=verts)
        acc.tag('tomato_rotten' if bad else 'tomato', _faces(verts))


def plant_or_not(fn, p):
    """The garden was left to itself: some plants are gone, some have rotted, the rest still grow."""
    roll = random.random()
    if roll < 0.22:
        return
    fn(veg, p, roll < 0.42)


CROPS = {'carrot': (carrot, 0.24), 'lettuce': (lettuce, 0.42), 'tomato': (tomato, 0.6)}


def jitter():
    return Vector((random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), 0))


def fill_rect_bed(rc, a, radial, tangential, top, crop):
    fn, spacing = CROPS[crop]
    nr, nt = max(1, int(radial / spacing)), max(1, int(tangential / spacing))
    for i in range(nr):
        for j in range(nt):
            rr = rc - radial / 2 + (i + 0.5) * radial / nr
            plant_or_not(fn, P(rr, a, top) + TV(a) * (-tangential / 2 + (j + 0.5) * tangential / nt) + jitter())


def fill_arc_bed(r0, r1, a0, a1, top, crop):
    if a1 < a0:
        a1 += 360
    fn, spacing = CROPS[crop]
    rows = max(1, int((r1 - r0) / spacing))
    for i in range(rows):
        rr = r0 + (i + 0.5) * (r1 - r0) / rows
        n = max(1, int(math.radians(a1 - a0) * rr / spacing))
        for j in range(n):
            plant_or_not(fn, P(rr, a0 + (j + 0.5) * (a1 - a0) / n, top) + jitter())


# raised beds on the floor, one crop each
beds = A('Atrium_Planters')
for a, crop in ((0, 'tomato'), (45, 'lettuce'), (135, 'carrot'), (225, 'tomato'), (315, 'lettuce')):
    rbox(beds, 'hull_light', 10.2, a, 0.4, 1.8, 4.2, 0.8, col=True)
    rbox(beds, 'accent', 10.2, a, 0.81, 1.86, 4.26, 0.04)
    rbox(beds, 'soil', 10.2, a, 0.82, 1.6, 4.0, 0.04)
    rbox(beds, 'blue_glow', 10.2, a, 0.02, 1.9, 4.3, 0.04)
    fill_rect_bed(10.2, a, 1.4, 3.7, 0.84, crop)

# long beds along the wall, under the gallery (gaps for the window, doors, lift and stairs)
for a0, a1, crop in ((336, 28, 'carrot'), (32, 58, 'tomato'), (124, 163, 'lettuce'), (196, 207, 'tomato')):
    arc(beds, 'hull_light', 15.2, 16.75, a0, a1, 0, 0.7, step=3, col=True)
    arc(beds, 'accent', 15.15, 15.25, a0, a1, 0.66, 0.74, step=3)
    arc(beds, 'soil', 15.3, 16.65, a0, a1, 0.7, 0.72, step=3)
    arc(beds, 'blue_glow', 15.17, 15.22, a0, a1, 0.02, 0.06, step=3)
    fill_arc_bed(15.45, 16.5, a0, a1, 0.72, crop)

# decorative plants always stand in a pot: an eight-sided sci-fi planter (white body tapering to a
# black plinth, a black band with a light blue LED line, an orange rim)
pots = A('Atrium_Pots')


def _cone(acc, m, c, r_bottom, r_top, h, seg=8):
    verts = bmesh.ops.create_cone(acc.bm, cap_ends=True, cap_tris=False, segments=seg,
                                  radius1=r_bottom, radius2=r_top, depth=h)['verts']
    bmesh.ops.rotate(acc.bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rad(22.5), 3, 'Z'))
    bmesh.ops.translate(acc.bm, vec=Vector(c), verts=verts)
    acc.tag(m, _faces(verts))


def pot(loc, r=0.5, h=0.75):
    x, y, z = loc
    _cone(pots, 'hull_dark', (x, y, z + 0.04), r * 0.72, r * 0.72, 0.08)              # plinth
    _cone(pots, 'hull_light', (x, y, z + 0.08 + (h - 0.08) / 2), r * 0.78, r, h - 0.08)   # body, wider at the top
    _cone(pots, 'hull_dark', (x, y, z + h * 0.42), r * 0.91, r * 0.93, h * 0.16)       # band
    _cone(pots, 'blue_glow', (x, y, z + h * 0.42), r * 0.935, r * 0.945, 0.03)        # LED line in the band
    _cone(pots, 'accent', (x, y, z + h - 0.03), r + 0.03, r + 0.03, 0.06)             # rim
    _cone(pots, 'soil', (x, y, z + h - 0.005), r - 0.04, r - 0.04, 0.02)
    kit.col_box((x - r, y - r, z), (x + r, y + r, z + h))
    return Vector((x, y, z + h))


# (location, kind, widest the plant may be). Potted plants are scaled to stay close to their pot,
# so no leaves hang out in the air away from it.
plant_spots = [(Vector((0.6, 0.55, 0.33)), 'tree_big', None), (Vector((-0.85, -0.45, 0.33)), 'tree_mid', None),
               (Vector((0.4, -1.3, 0.33)), 'pachira', None), (Vector((-1.3, 0.9, 0.33)), 'fern', 1.4),
               (Vector((1.4, -0.3, 0.33)), 'anthurium', 1.0)]
for k in range(22):                                                            # flowers round the island's edge
    plant_spots.append((P(random.uniform(1.6, 2.0), k * 360 / 22 + random.uniform(-4, 4), 0.33), 'sorrel', 0.5))
plant_spots.append((pot(P(8.0, 20, 0.0)), 'pachira_pot', 1.5))                    # a small tree by the lounge
plant_spots.append((P(14.8, 80, 0.0), 'potted', None))                             # real potted plants by the window
plant_spots.append((P(14.6, 101, 0.0) + Vector((0, 0, 0.32)), 'potted', None, (rad(84), 0, rad(30))))   # (knocked over)
for a, kind in ((31, 'anthurium'), (150, 'fern')):                             # on the gallery, by the doors
    plant_spots.append((pot(P(16.15, a, ZG), r=0.45, h=0.6), kind, 1.35))

# ------------------------------------------------------------------ the angled black pillars
pil = A('Atrium_Pillars')
for k in range(8):
    a = 22.5 + k * 45
    # they rise from just inside the gallery's edge and lean inwards, so they never cross the walkway
    beam(pil, 'hull_dark', P(13.0, a, 0), P(10.8, a, H), 1.0, 1.4)
    beam(pil, 'blue_glow', P(12.45, a, 0.6), P(10.25, a, H - 0.6), 0.1, 0.1)   # LED line up the inner face
    ring = P(13.0 - 2.2 * (3.2 / H), a, 3.2)
    cyl(pil, 'hull_dark', (ring.x, ring.y, ring.z), 1.0, 0.35, 24)
    cyl(pil, 'blue_glow', (ring.x, ring.y, ring.z), 1.03, 0.12, 24)
    kit.col_box((ring.x - 0.6, ring.y - 0.6, 0), (ring.x + 0.6, ring.y + 0.6, 2.6))

# ------------------------------------------------------------------ the upper gallery
gal = A('Atrium_Gallery')
STAIR_OPENINGS = [(290, 330), (210, 250)]
deck_spans = [(330, 570)]     # 330 -> 210 (wraps), split round the openings
deck_spans = [(330, 360), (0, 210), (250, 290)]
BROKEN = (149.0, 157.0)        # a smashed railing panel (glass gone, top rail bent down)
for a0, a1 in deck_spans:
    arc(gal, 'floor_dark', GR, R, a0, a1, ZG - 0.35, ZG, step=4, col=True)
    arc(gal, 'hull_light', GR, R, a0, a1, ZG - 0.6, ZG - 0.35, step=4)
    arc(gal, 'blue_glow', GR, GR + 0.08, a0, a1, ZG - 0.34, ZG - 0.1, step=4)
    pieces = [(a0, a1)]
    if a0 < BROKEN[0] and a1 > BROKEN[1]:
        pieces = [(a0, BROKEN[0]), (BROKEN[1], a1)]
    for p0, p1 in pieces:
        arc(gal, 'glass', GR, GR + 0.04, p0, p1, ZG, ZG + 1.08, step=4)
        arc(gal, 'accent', GR - 0.04, GR + 0.1, p0, p1, ZG + 1.05, ZG + 1.13, step=4)
    arc(kit.CS, 'col', GR - 0.03, GR + 0.08, a0, a1, ZG, ZG + 1.15)
# a railing across the low end of each stair opening
for a in (290, 250):
    rbox(gal, 'glass', (GR + R) / 2, a, ZG + 0.54, R - GR, 0.04, 1.08, col=True)
    rbox(gal, 'accent', (GR + R) / 2, a, ZG + 1.09, R - GR, 0.12, 0.08)


# two staircases hugging the wall, from the ground up to the gallery
def stair(a_lo, a_hi):
    n = 24
    acc = A('Atrium_Stairs')
    r = 15.3
    for i in range(n):
        a = a_lo + (a_hi - a_lo) * (i + 0.5) / n
        zt = ZG * (i + 1) / n
        tl = abs(math.radians(a_hi - a_lo) / n) * r
        rbox(acc, 'floor_dark', r, a, zt - 0.06, 2.6, tl * 1.08, 0.12)
        rbox(kit.CS, 'col', r, a, zt - 0.25, 2.6, tl * 1.08, 0.5)
        rbox(acc, 'hull_light', r, a, (zt - 0.12) / 2, 2.6, tl * 1.08, zt - 0.12)     # solid under the steps
    for i in range(n):
        a0 = a_lo + (a_hi - a_lo) * i / n
        a1 = a_lo + (a_hi - a_lo) * (i + 1) / n
        z0 = ZG * i / n + 1.0
        z1 = ZG * (i + 1) / n + 1.0
        beam(acc, 'accent', P(14.0, a0, z0), P(14.0, a1, z1), 0.08, 0.08)
        beam(acc, 'glass', P(14.0, a0, z0 - 0.5), P(14.0, a1, z1 - 0.5), 0.03, 1.0)
        beam(kit.CS, 'col', P(14.0, a0, z0 - 0.5), P(14.0, a1, z1 - 0.5), 0.1, 1.1)


stair(290, 330)
stair(250, 210)

# ------------------------------------------------------------------ ceiling and the big skylight panel
ceil = A('Atrium_Ceiling')
arc(ceil, 'hull_light', 7.0, R + T, 0, 360, H, H + 0.4, step=6, col=True)
arc(ceil, 'white_glow', 0.3, 7.0, 0, 360, H - 0.06, H, step=6)
for r in (7.1, 11.0):
    arc(ceil, 'blue_glow', r, r + 0.12, 0, 360, H - 0.1, H, step=6)
for k in range(8):
    beam(ceil, 'hull_mid', P(7.0, k * 45, H - 0.3), P(R, k * 45, H - 0.3), 0.5, 0.5)

# ------------------------------------------------------------------ the window wall onto the sea
win = A('Atrium_Window')
for a in (76, 90, 104):
    arc(win, 'hull_dark', R - 0.2, R + T, a - 0.6, a + 0.6, 0.8, 5.0, step=1)
arc(win, 'accent', R - 0.25, R + T, 62, 118, 0.6, 0.8, step=2)
arc(win, 'accent', R - 0.25, R + T, 62, 118, 5.0, 5.2, step=2)
arc(win, 'glass', R + 0.3, R + 0.34, 62, 118, 0.8, 5.0, step=2)
empty('PT_Window', P(R + 2, 90, 2.9))

# ------------------------------------------------------------------ doors
door = A('Atrium_DoorFrames')


def frame(a0, a1, z0, z1):
    arc(door, 'accent', R - 0.25, R, a0 - 1.2, a0, z0, z1 + 0.35, step=1)
    arc(door, 'accent', R - 0.25, R, a1, a1 + 1.2, z0, z1 + 0.35, step=1)
    arc(door, 'accent', R - 0.25, R, a0 - 1.2, a1 + 1.2, z1, z1 + 0.35, step=1)


# the lab: wide sliding double doors (the game opens them as you walk up; the lab itself is
# Blender/scripts/build_l2_lab.py)
frame(LAB['a0'], LAB['a1'], LAB['z0'], LAB['z1'])
empty('PT_Plate_LAB', P(R - 0.3, 90, LAB['z1'] + 0.7))
for nm, s in (('LABDOOR_L', -0.9), ('LABDOOR_R', 0.9)):
    c = P(R + 0.25, 90, LAB['z0'] + 1.7) + TV(90) * s
    e = A(nm, origin=tuple(c))
    rbox(e, 'hull_mid', R + 0.25, 90, LAB['z0'] + 1.7, 0.18, 1.8, 3.4, t=s)
    rbox(e, 'blue_glow', R + 0.14, 90, LAB['z0'] + 1.7, 0.04, 0.06, 2.6, t=s - 0.85 * (1 if s > 0 else -1))
    rbox(e, 'accent', R + 0.14, 90, LAB['z0'] + 2.6, 0.04, 1.2, 0.08, t=s)
for name, g in (('KESSLER', GAPS[5]), ('VOSS', GAPS[4])):
    d = A('DOOR_' + name)
    arc(d, 'hull_mid', R + 0.1, R + 0.4, g['a0'], g['a1'], g['z0'], g['z1'], step=1)
    arc(d, 'blue_glow', R + 0.05, R + 0.1, (g['a0'] + g['a1']) / 2 - 0.15, (g['a0'] + g['a1']) / 2 + 0.15, g['z0'] + 0.2, g['z1'] - 0.2, step=0.3)
    frame(g['a0'], g['a1'], g['z0'], g['z1'])
    empty('PT_Plate_' + name, P(R - 0.3, (g['a0'] + g['a1']) / 2, g['z1'] + 0.7))
    if name == 'KESSLER':   # Voss's quarter is a real room now (build_l2_voss.py, l2-voss.glb)
        rbox(A('Atrium_RoomBacks'), 'hull_mid', R + 2.6, (g['a0'] + g['a1']) / 2, g['z0'] + 1.7, 0.3, 6.0, 3.6)   # until the room is built
# the locked pod doors (ground floor, west) and the lift (south)
pods = A('DOOR_PODS')
arc(pods, 'hull_mid', R + 0.1, R + 0.4, 172, 188, 0, 3.4, step=1)
arc(pods, 'accent_glow', R + 0.05, R + 0.1, 173, 187, 1.7, 1.9, step=1)
frame(172, 188, 0, 3.4)
empty('PT_PodDoor', P(R - 0.4, 180, 2.0))
frame(263, 277, 0, 3.6)
for nm, s in (('ELEVATOR_Door_L', -1.05), ('ELEVATOR_Door_R', 1.05)):
    c = P(R + 0.25, 270, 1.8) + TV(270) * s
    e = A(nm, origin=tuple(c))
    rbox(e, 'hull_mid', R + 0.25, 270, 1.8, 0.2, 2.05, 3.6, t=s)
# sealed crew doors around the gallery (their nameplates introduce the crew)
for i, a in enumerate((20, 128, 142, 160, 200, 225, 315, 340)):    # (clear of the lab doors at 84-96)
    rbox(door, 'hull_mid', R - 0.06, a, ZG + 1.6, 0.12, 2.4, 3.2)
    rbox(door, 'accent', R - 0.08, a, ZG + 3.25, 0.1, 2.7, 0.15)
    rbox(door, 'blue_glow', R - 0.13, a, ZG + 1.5, 0.04, 0.3, 0.12)
    empty('PT_CrewDoor_%d' % i, P(R - 0.3, a, ZG + 3.7))

# the lift cab (Voss arrives in it); ARIA is on a screen inside
cab = A('Atrium_LiftCab')
r0, r1 = R + T, R + T + 3.2
rc = (r0 + r1) / 2
rbox(cab, 'floor_dark', rc, 270, -0.2, 3.2, 3.8, 0.4, col=True)
for s in (-1.95, 1.95):
    rbox(cab, 'hull_light', rc, 270, 1.8, 3.2, 0.2, 3.6, t=s, col=True)
rbox(cab, 'hull_light', r1 + 0.1, 270, 1.8, 0.2, 4.0, 3.6, col=True)
rbox(cab, 'hull_light', rc, 270, 3.7, 3.4, 4.0, 0.2, col=True)
rbox(cab, 'white_glow', rc, 270, 3.58, 2.0, 0.4, 0.04)
rbox(cab, 'hull_dark', r1 - 0.02, 270, 2.1, 0.06, 1.5, 0.95)
rbox(cab, 'aria_screen', r1 - 0.06, 270, 2.1, 0.03, 1.3, 0.78)
empty('ARIA_Lift', P(r1 - 0.1, 270, 2.1))
empty('SPAWN_Lift', P(rc - 0.2, 270, 0.05))

# the maintenance hatch in the floor (the way out, later)
hatch = A('Atrium_Hatch')
rbox(hatch, 'hull_dark', 14.6, 330, 0.01, 1.8, 1.8, 0.03)
for k in range(5):
    rbox(hatch, 'accent', 14.6, 330, 0.03, 0.2, 1.8, 0.02, t=-0.8 + k * 0.4)
empty('PT_Hatch', P(14.6, 330, 0.05))

# ------------------------------------------------------------------ ARIA's monitors (spec: M1 to M10)
mon = A('Atrium_Monitors')


def wall_screen(name, a, z, w=1.5, h=0.85, r=R):
    rbox(mon, 'hull_dark', r - 0.06, a, z, 0.08, w + 0.14, h + 0.14)
    rbox(mon, 'aria_screen', r - 0.11, a, z, 0.02, w, h)
    empty(name, P(r - 0.15, a, z))


# M1: the big screen hanging above the lounge, facing the lift
# (hung high, above the tree tops, so the trees never hide it)
box(mon, 'hull_dark', (-2.25, -0.15, 9.85), (2.25, 0.15, 12.45))
box(mon, 'aria_screen', (-2.1, -0.2, 10.0), (2.1, -0.15, 12.3))
for x in (-1.8, 1.8):
    box(mon, 'hull_mid', (x - 0.04, -0.04, 12.45), (x + 0.04, 0.04, H))
empty('ARIA_M1', (0, -0.25, 11.15))
wall_screen('ARIA_M2', 281, 2.3)              # beside the lift
wall_screen('ARIA_M3', 247, 2.3)              # foot of the west stair
wall_screen('ARIA_M4', 293, 2.3)              # foot of the east stair
wall_screen('ARIA_M5', 57, ZG + 1.9)          # outside Dr. Kessler's door
wall_screen('ARIA_M6', 77, ZG + 1.9)          # beside the lab doors
# M10: the info kiosk by the lounge
kiosk = P(9.4, 240, 0)
rbox(mon, 'hull_light', 9.4, 240, 0.9, 0.55, 1.0, 1.8, col=True)
rbox(mon, 'accent', 9.4, 240, 1.82, 0.6, 1.05, 0.06)
rbox(mon, 'aria_screen', 9.12, 240, 1.15, 0.02, 0.8, 0.9)
empty('ARIA_M10', P(9.1, 240, 1.15))
# the crew photo board on the wall near the kiosk
rbox(mon, 'hull_mid', R - 0.06, 233, 1.7, 0.06, 2.4, 1.5)
empty('PT_PhotoBoard', P(R - 0.12, 233, 1.7))

# ------------------------------------------------------------------ lived-in props (our own low-poly models)
# In the style of the team's references: white bodies, glossy black, orange caps, light blue LEDs.
props = A('Atrium_Props')
kit.mat('screen_ui', (0.04, 0.10, 0.16), 0.3, 0.0, (0.30, 0.72, 1.0), 0.7)
kit.mat('mug_white', (0.90, 0.90, 0.88), 0.4, 0.0)
kit.mat('coffee', (0.12, 0.06, 0.03), 0.2, 0.0)


def rot_box(acc, m, c, s, rz):
    _rbox(acc, m, Vector(c), s, rz)


def mug(p, m='mug_white', rz=0.0):
    cyl(props, m, (p.x, p.y, p.z + 0.05), 0.04, 0.1, 10)
    cyl(props, 'coffee', (p.x, p.y, p.z + 0.095), 0.034, 0.012, 10)
    d = Vector((math.cos(rad(rz)), math.sin(rad(rz)), 0))
    rot_box(props, m, p + d * 0.05 + Vector((0, 0, 0.05)), (0.025, 0.012, 0.06), rz)


def tablet(p, rz):
    rot_box(props, 'hull_dark', p + Vector((0, 0, 0.006)), (0.27, 0.19, 0.012), rz)
    rot_box(props, 'screen_ui', p + Vector((0, 0, 0.0125)), (0.24, 0.16, 0.002), rz)


# vending machine between the lift and the east stairs
va, vr = 284, 16.55
rbox(props, 'hull_light', vr, va, 1.0, 0.85, 1.1, 2.0, col=True)
rbox(props, 'hull_dark', vr, va, 0.08, 0.9, 1.14, 0.16)
rbox(props, 'hull_dark', vr, va, 2.02, 0.88, 1.12, 0.06)
rbox(props, 'hull_dark', vr - 0.41, va, 1.25, 0.04, 0.72, 1.2, t=-0.12)               # dark inside
for row in range(4):                                                                  # snacks on the shelves
    z = 0.82 + row * 0.27
    rbox(props, 'hull_mid', vr - 0.4, va, z - 0.05, 0.06, 0.68, 0.02, t=-0.12)
    for j in range(5):
        m = ('accent', 'fabric_light', 'tomato', 'mug_white', 'blue_glow')[(row + j) % 5]
        rbox(props, m, vr - 0.42, va, z + 0.05, 0.05, 0.1, 0.16, t=-0.4 + j * 0.14)
VEND_FRONT = (vr - 0.46, va)                                                     # (its glass is smashed: see the chaos section)
rbox(props, 'hull_dark', vr - 0.43, va, 1.3, 0.03, 0.18, 0.9, t=0.4)                  # keypad strip
for k in range(5):
    rbox(props, 'blue_glow', vr - 0.45, va, 1.05 + k * 0.13, 0.02, 0.1, 0.06, t=0.4)
rbox(props, 'accent', vr - 0.43, va, 1.0, 0.03, 0.05, 1.9, t=0.53)
rbox(props, 'hull_dark', vr - 0.43, va, 0.38, 0.03, 0.72, 0.2, t=-0.12)               # the drop slot
rbox(props, 'blue_glow', vr - 0.45, va, 0.24, 0.02, 0.72, 0.03, t=-0.12)

# double lockers beside the sleeping pods door
for la in (168.5, 191.5):
    lr = 16.72
    rbox(props, 'hull_light', lr, la, 1.05, 0.55, 1.0, 2.1, col=True)
    rbox(props, 'hull_dark', lr, la, 0.075, 0.57, 1.02, 0.15)
    rbox(props, 'hull_dark', lr - 0.28, la, 1.1, 0.02, 0.02, 1.85)                    # seam between the doors
    for t in (-0.25, 0.25):
        for z in (1.72, 1.82, 1.92):
            rbox(props, 'hull_dark', lr - 0.28, la, z, 0.02, 0.3, 0.03, t=t)          # vents
        rbox(props, 'accent', lr - 0.285, la, 1.1, 0.03, 0.03, 0.4, t=t * 0.24)       # handles
        rbox(props, 'accent', lr - 0.28, la, 2.03, 0.02, 0.36, 0.05, t=t)
    rbox(props, 'blue_glow', lr - 0.28, la, 0.18, 0.02, 0.9, 0.02)

# kitchenette counter with a coffee machine, mugs and a bowl of tomatoes from the beds
ca, cr = 257.5, 16.65
rbox(props, 'hull_light', cr, ca, 0.45, 0.7, 2.2, 0.9, col=True)
rbox(props, 'hull_dark', cr - 0.02, ca, 0.925, 0.74, 2.24, 0.05)
rbox(props, 'hull_dark', cr + 0.03, ca, 0.05, 0.66, 2.2, 0.1)
rbox(props, 'blue_glow', cr - 0.36, ca, 0.86, 0.02, 2.1, 0.03)
for t in (-0.55, 0.55):
    rbox(props, 'hull_mid', cr - 0.355, ca, 0.5, 0.01, 1.0, 0.7, t=t)                 # cupboard doors
    rbox(props, 'accent', cr - 0.365, ca, 0.78, 0.02, 0.3, 0.03, t=t)
top = 0.95
mt = -0.55                                                                             # the coffee machine
rbox(props, 'hull_light', cr + 0.05, ca, top + 0.32, 0.45, 0.48, 0.64, t=mt)
rbox(props, 'hull_dark', cr - 0.17, ca, top + 0.22, 0.04, 0.34, 0.3, t=mt)            # dispensing bay
rbox(props, 'hull_dark', cr - 0.12, ca, top + 0.68, 0.55, 0.5, 0.1, t=mt)             # top panel
rbox(props, 'screen_ui', cr - 0.39, ca, top + 0.68, 0.01, 0.22, 0.06, t=mt - 0.08)
for k in range(3):
    rbox(props, 'accent', cr - 0.39, ca, top + 0.68, 0.012, 0.04, 0.04, t=mt + 0.1 + k * 0.06)
rbox(props, 'blue_glow', cr - 0.18, ca, top + 0.04, 0.2, 0.36, 0.02, t=mt)            # lit drip tray
mug(P(cr - 0.25, ca, top + 0.05) + TV(ca) * mt, 'mug_white', ca)
for k, m in enumerate(('accent', 'mug_white', 'fabric_light')):
    mug(P(cr - 0.15 + (k % 2) * 0.12, ca, top) + TV(ca) * (-0.1 + k * 0.14), m, ca + 40 * k)
bowl = P(cr - 0.08, ca, top) + TV(ca) * 0.6
cyl(props, 'hull_light', (bowl.x, bowl.y, bowl.z + 0.05), 0.15, 0.1, 14)
for k in range(6):
    q = bowl + Vector((math.cos(k) * 0.07, math.sin(k) * 0.07, 0.11 + (k % 2) * 0.03))
    verts = bmesh.ops.create_uvsphere(props.bm, u_segments=8, v_segments=6, radius=0.045)['verts']
    bmesh.ops.translate(props.bm, vec=q, verts=verts)
    props.tag('tomato', _faces(verts))
tablet(P(cr - 0.2, ca, top) + TV(ca) * 0.95, ca + 15)

# mugs and tablets left round the lounge
for a in (320,):
    c = P(3.3, a, -0.18)
    mug(c + TV(a) * 0.4, 'mug_white', a + 30)
    mug(c + TV(a) * 0.55 + P(0.12, a, 0), 'accent', a - 60)
    tablet(c + TV(a) * -0.3, a + 20)
tablet(P(4.6, 125, -0.16), 160)
tablet(P(4.6, 300, -0.16), 40)
mug(P(4.62, 68.5, 0.1), 'fabric_light', 10)                                             # on an armrest

# honeycomb wall planters on the gallery walls (above the window and above the lift)
def hex_cell(a, t, z, r_out=0.35, r_in=0.285, depth=0.32):
    """One hollow hexagonal wall planter: a white frame, a dark back panel, soil and leaves inside."""
    def pt(u, v, d):                    # u along the wall, v up, d out from the wall
        return P(R - d, a, z + v) + TV(a) * (t + u)
    ang = [rad(k * 60) for k in range(6)]
    bm = props.bm
    of = [bm.verts.new(pt(r_out * math.cos(q), r_out * math.sin(q), depth)) for q in ang]
    inf = [bm.verts.new(pt(r_in * math.cos(q), r_in * math.sin(q), depth)) for q in ang]
    ob = [bm.verts.new(pt(r_out * math.cos(q), r_out * math.sin(q), 0.01)) for q in ang]
    ib = [bm.verts.new(pt(r_in * math.cos(q), r_in * math.sin(q), 0.01)) for q in ang]
    fs = []
    for i in range(6):
        j = (i + 1) % 6
        fs.append(bm.faces.new((of[i], of[j], inf[j], inf[i])))     # front rim
        fs.append(bm.faces.new((ob[i], ob[j], of[j], of[i])))       # outer side
        fs.append(bm.faces.new((inf[i], inf[j], ib[j], ib[i])))     # inner side
        fs.append(bm.faces.new((ob[j], ob[i], ib[i], ib[j])))       # back rim (closed, so the normals face out)
    props.tag('hull_light', fs)
    bf = [bm.verts.new(pt(r_in * math.cos(q), r_in * math.sin(q), 0.03)) for q in ang]
    bb = [bm.verts.new(pt(r_in * math.cos(q), r_in * math.sin(q), 0.015)) for q in ang]
    panel = [bm.faces.new(bf), bm.faces.new(list(reversed(bb)))]
    for i in range(6):
        j = (i + 1) % 6
        panel.append(bm.faces.new((bb[i], bb[j], bf[j], bf[i])))
    props.tag('hull_dark', panel)
    # a short light blue line on the upper right edge of the rim
    q0, q1 = ang[0], ang[1]
    beam(props, 'blue_glow', pt(r_out * 0.98 * math.cos(q0), r_out * 0.98 * math.sin(q0), depth + 0.005),
         pt(r_out * 0.98 * math.cos(q1), r_out * 0.98 * math.sin(q1), depth + 0.005), 0.025, 0.012)
    floor_v = -r_in * math.sin(rad(60))
    rbox(props, 'soil', R - 0.16, a, z + floor_v + 0.05, 0.28, 0.32, 0.1, t=t)
    base = pt(0, floor_v + 0.1, 0.16)
    for k in range(7):
        q = rad(a + 180) + random.uniform(-1.0, 1.0)
        d = Vector((math.cos(q) * 0.5, math.sin(q) * 0.5, 1)).normalized()
        leaf_blade(veg, 'veg_leaf_light' if k % 2 else 'veg_leaf', base + TV(a) * random.uniform(-0.08, 0.08),
                   d, random.uniform(0.26, 0.36), 0.055, 0.03)


for wa in (102.5, 270):                  # a little honeycomb of four (beside the lab doors, above the lift)
    for u, v in ((-0.27, 0.0), (0.27, 0.32), (0.27, -0.32), (0.81, 0.0)):
        hex_cell(wa, u, ZG + 1.9 + v)


# ------------------------------------------------------------------ chaos: the hall was left in a hurry
# Things knocked over and broken: pots tipped with soil spilled, cushions thrown about, papers
# everywhere, a smashed railing panel and vending machine, a locker hanging open, a wall panel
# torn off with sparking cables, a ceiling light dangling, food dropped and soil kicked out of a bed.
chaos = A('Atrium_Chaos')
RUG = -0.583            # the top of the lounge rug (things in the lounge lie on it)
kit.mat('paper', (0.93, 0.93, 0.90), 0.9, 0.0)
kit.mat('shard', (0.38, 0.55, 0.62), 0.05, 0.0)          # broken glass: darker so it reads on the pale floor
kit.mat('flicker_glow', (0.95, 0.98, 1.0), 0.4, 0.0, (0.9, 0.96, 1.0), 2.0)
kit.mat('rubber', (0.04, 0.04, 0.045), 0.9, 0.0)
kit.mat('cable_red', (0.6, 0.08, 0.06), 0.6, 0.0)
kit.mat('crate', (0.32, 0.36, 0.40), 0.6, 0.2)


def xform(acc, m, verts, mat):
    bmesh.ops.transform(acc.bm, matrix=mat, verts=verts)
    acc.tag(m, _faces(verts))


def lying_cyl(acc, m, centre, r, h, yaw, seg=16, roll=90.0):
    """A cylinder turned onto its side (roll degrees from upright), its axis pointing along yaw."""
    verts = bmesh.ops.create_cone(acc.bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r, depth=h)['verts']
    xform(acc, m, verts, Matrix.Translation(Vector(centre)) @ Matrix.Rotation(rad(yaw), 4, 'Z') @ Matrix.Rotation(rad(roll), 4, 'Y'))


def spill(acc, m, centre, radius, squash=0.03, seg=20):
    """A low, blobby mound (spilled soil, a puddle)."""
    verts = bmesh.ops.create_circle(acc.bm, cap_ends=True, segments=seg, radius=radius)['verts']
    ph1, ph2 = random.uniform(0, 6.28), random.uniform(0, 6.28)
    for v in verts:
        if v.co.length > 1e-4:
            ang = math.atan2(v.co.y, v.co.x)
            v.co *= 1 + 0.25 * math.sin(3 * ang + ph1) + 0.12 * math.sin(5 * ang + ph2)
    bmesh.ops.translate(acc.bm, vec=Vector(centre), verts=verts)
    acc.tag(m, _faces(verts))
    if squash > 0.005:                  # a little hump in the middle
        top = bmesh.ops.create_uvsphere(acc.bm, u_segments=10, v_segments=5, radius=radius * 0.55)['verts']
        bmesh.ops.scale(acc.bm, vec=(1.0, 1.0, squash / (radius * 0.55)), verts=top)
        bmesh.ops.translate(acc.bm, vec=Vector(centre), verts=top)
        acc.tag(m, _faces(top))


def shards(acc, centre, spread, n, z):
    for _ in range(n):
        q = Vector((centre[0] + random.uniform(-spread, spread), centre[1] + random.uniform(-spread, spread), z))
        v = [acc.bm.verts.new(q + Vector((random.uniform(-0.06, 0.06), random.uniform(-0.06, 0.06), random.uniform(0, 0.008)))) for _ in range(3)]
        acc.tag('shard', [acc.bm.faces.new(v)])


def paper_scatter(centre, spread, n, z):
    for _ in range(n):
        c = Vector((centre[0] + random.uniform(-spread, spread), centre[1] + random.uniform(-spread, spread), z + random.uniform(0.012, 0.022)))   # (clear of the floor, so it never flickers behind it)
        _rbox(chaos, 'paper', c, (0.21, 0.297, 0.002), random.uniform(0, 360))


def paper_ring(r0, r1, a0, a1, n, z):
    """Papers scattered over a ring-shaped area (the rug, the walkway, the gallery)."""
    for _ in range(n):
        c = P(random.uniform(r0, r1), random.uniform(a0, a1), z + random.uniform(0.012, 0.022))
        _rbox(chaos, 'paper', c, (0.21, 0.297, 0.002), random.uniform(0, 360))


def tipped_pot(loc, yaw, r=0.5, h=0.75):
    """A sci-fi pot knocked onto its side, soil spilling out of its mouth."""
    d = Vector((math.cos(rad(yaw)), math.sin(rad(yaw)), 0))
    c = Vector(loc) + Vector((0, 0, r * 0.9))
    lying_cyl(pots, 'hull_light', c, r * 0.9, h, yaw, 8)
    lying_cyl(pots, 'accent', c + d * (h / 2), r + 0.03, 0.06, yaw, 8)
    lying_cyl(pots, 'hull_dark', c - d * (h / 2 - 0.03), r * 0.75, 0.06, yaw, 8)
    spill(chaos, 'soil', Vector(loc) + d * (h / 2 + 0.35) + Vector((0, 0, 0.015)), 0.45, 0.06)
    for k in range(6):
        sphere_p = Vector(loc) + d * (h / 2 + random.uniform(0.2, 0.9)) + Vector((random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), 0.03))
        verts = bmesh.ops.create_icosphere(chaos.bm, subdivisions=1, radius=random.uniform(0.03, 0.06))['verts']
        bmesh.ops.translate(chaos.bm, vec=sphere_p, verts=verts)
        chaos.tag('soil', _faces(verts))
    return Vector(loc) + d * (h / 2 + 0.25) + Vector((0, 0, 0.12))     # where the plant lies


# knocked-over pots: one by the lounge (its tree lying out of it), soil spilled
fallen_tree_at = tipped_pot(P(8.2, 203, 0.0), 120)

# cushions pulled off the sofas and thrown about the lounge
for k in range(7):
    a = random.uniform(0, 360)
    c = P(random.uniform(3.0, 4.1), a, RUG + 0.08)
    pillow(random.choice(['cushion_blue', 'cushion_orange']), c, (0.46, 0.46, 0.17), yaw=random.uniform(0, 360),
           pitch=random.uniform(-12, 12), pinch=0.6)
pillow('fabric', P(6.9, 300, -0.15), (0.8, 0.55, 0.28), yaw=210, pitch=18, pinch=0.12, round_=0.3)   # a seat cushion on the step

# the shoved table's mugs and tablet on the floor: a tipped mug and its coffee, a cracked tablet
tc = P(3.4, 150, RUG)
lying_cyl(chaos, 'mug_white', tc + Vector((0, 0, 0.045)), 0.04, 0.1, 40, 10)
spill(chaos, 'coffee', tc + Vector((0.18, 0.1, 0.012)), 0.22, 0.0)
lying_cyl(chaos, 'accent', P(2.7, 128, RUG + 0.04), 0.04, 0.1, 160, 10)
tp = P(3.9, 133, RUG + 0.01)
_rbox(chaos, 'hull_dark', tp + Vector((0, 0, 0.006)), (0.27, 0.19, 0.012), 70)
_rbox(chaos, 'screen_ui', tp + Vector((0, 0, 0.0125)), (0.24, 0.16, 0.002), 70)
for k in range(5):                                                                   # cracks across the screen
    a = rad(70 + random.uniform(-80, 80))
    beam(chaos, 'mug_white', tp + Vector((0, 0, 0.014)), tp + Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, 0.014)), 0.003, 0.001)

# papers everywhere: across the lounge, in front of the kiosk, along the gallery to the lab
paper_ring(2.8, 4.0, 100, 200, 16, RUG)          # over the rug
paper_ring(2.8, 4.0, 290, 350, 7, RUG)
paper_ring(7.6, 12.5, 120, 260, 22, 0.0)        # across the walkway, trailing toward the lift
paper_ring(7.6, 12.0, 300, 400, 10, 0.0)
paper_scatter(P(9.0, 245, 0), 1.0, 7, 0.0)
paper_scatter(P(15.2, 70, 0), 1.0, 8, ZG)
paper_scatter(P(15.2, 110, 0), 1.0, 6, ZG)
paper_scatter(P(12.0, 170, 0), 1.4, 9, 0.0)

# the smashed railing panel: glass all over the gallery floor and the ground below, the top rail
# hanging down
mid = (BROKEN[0] + BROKEN[1]) / 2
shards(chaos, P(14.4, mid, 0), 0.7, 26, ZG)
shards(chaos, P(12.6, mid, 0), 1.1, 40, 0.0)
beam(chaos, 'accent', P(GR + 0.03, BROKEN[0], ZG + 1.09), P(GR - 0.25, BROKEN[0] + 2.5, ZG + 0.35), 0.1, 0.07)
beam(chaos, 'accent', P(GR + 0.03, BROKEN[1], ZG + 1.09), P(GR + 0.1, BROKEN[1] - 1.2, ZG + 0.75), 0.1, 0.07)

# the vending machine: its glass smashed, jagged pieces left in the frame, snacks spilled out
fx, fa = VEND_FRONT
for k in range(9):
    edge = random.choice([-1, 1])
    t0 = -0.12 + edge * 0.36
    z0 = random.uniform(0.7, 1.8)
    p0 = P(fx, fa, z0) + TV(fa) * t0
    p1 = P(fx, fa, z0 + random.uniform(0.1, 0.3)) + TV(fa) * t0
    p2 = P(fx, fa, z0 + random.uniform(0.0, 0.2)) + TV(fa) * (t0 - edge * random.uniform(0.08, 0.2))
    v = [chaos.bm.verts.new(p) for p in (p0, p1, p2)]
    chaos.tag('shard', [chaos.bm.faces.new(v)])
shards(chaos, P(15.4, fa, 0), 0.8, 30, 0.0)
for k in range(9):
    c = P(random.uniform(14.9, 15.8), fa + random.uniform(-2.5, 2.5), 0.025)
    _rbox(chaos, random.choice(['accent', 'fabric_light', 'tomato', 'mug_white']), c, (0.05, 0.1, 0.16), random.uniform(0, 360))

# a locker hanging open, clothes pulled out onto the floor
la, lr = 191.5, 16.72
rbox(chaos, 'hull_dark', lr - 0.281, la, 1.1, 0.004, 0.46, 1.8, t=0.25)          # the dark inside of the open half
hinge = P(lr - 0.28, la, 0) + TV(la) * 0.5
door_dir = (P(1, la, 0) * -1).normalized()
door_c = hinge + Vector((door_dir.x * 0.25 * 0.5 + TV(la).x * -0.18, door_dir.y * 0.25 * 0.5 + TV(la).y * -0.18, 1.05))
_rbox(chaos, 'hull_light', door_c, (0.02, 0.48, 1.9), la + 62)
for k in range(5):
    c = P(lr - random.uniform(0.6, 1.4), la + random.uniform(-2.5, 3.0), 0.05)
    _rbox(chaos, random.choice(['fabric_light', 'fabric', 'mug_white']), c, (random.uniform(0.3, 0.5), random.uniform(0.25, 0.4), 0.06), random.uniform(0, 360))

# a wall panel torn off on the gallery: exposed wiring, cables spilling out (they spark), the panel
# lying on the floor
wa, wz = 182.0, ZG + 1.9
rbox(chaos, 'hull_dark', R - 0.03, wa, wz, 0.05, 1.1, 1.5)
for k in range(9):
    m = random.choice(['cable_red', 'rubber', 'blue_glow', 'accent', 'rubber'])
    p0 = P(R - 0.06, wa, wz + random.uniform(-0.4, 0.6)) + TV(wa) * random.uniform(-0.4, 0.4)
    p1 = P(R - random.uniform(0.25, 0.6), wa, wz - random.uniform(0.3, 1.2)) + TV(wa) * random.uniform(-0.6, 0.6)
    beam(chaos, m, p0, p1, 0.025, 0.025)
empty('PT_Sparks_0', P(R - 0.4, wa, wz - 0.6))
_rbox(chaos, 'hull_light', P(R - 1.0, wa + 2.5, ZG + 0.06), (1.1, 1.5, 0.06), wa + 18)

# a ceiling light hanging by one wire, the other snapped (it flickers and sparks)
lc = P(10.5, 60, H - 2.3)
beam(chaos, 'rubber', P(10.1, 60, H), lc + TV(60) * -0.55 + Vector((0, 0, 0.1)), 0.015, 0.015)
beam(chaos, 'rubber', P(10.9, 60.5, H), P(10.9, 60.5, H - 0.7), 0.015, 0.015)
verts = bmesh.ops.create_cube(chaos.bm, size=1.0)['verts']
xform(chaos, 'hull_mid', verts, Matrix.Translation(lc) @ Matrix.Rotation(rad(60), 4, 'Z') @ Matrix.Rotation(rad(38), 4, 'X') @ Matrix.Diagonal((0.5, 1.4, 0.08, 1.0)))
verts = bmesh.ops.create_cube(chaos.bm, size=1.0)['verts']
xform(chaos, 'flicker_glow', verts, Matrix.Translation(lc - Vector((0, 0, 0.02))) @ Matrix.Rotation(rad(60), 4, 'Z') @ Matrix.Rotation(rad(38), 4, 'X') @ Matrix.Diagonal((0.4, 1.3, 0.07, 1.0)))
empty('PT_Sparks_1', lc + TV(60) * -0.55)
empty('PT_Flicker', lc)

# soil kicked out of a vegetable bed, lettuces knocked onto the floor; a tomato plant's stake
# fallen across its bed, tomatoes on the floor
spill(chaos, 'soil', P(8.7, 47, 0.015), 0.55, 0.07)
spill(chaos, 'soil', P(8.2, 40, 0.015), 0.3, 0.04)
for k in range(3):
    lettuce(veg, P(random.uniform(7.9, 8.9), 45 + random.uniform(-7, 7), 0.02))
beam(chaos, 'stake', P(10.2, 2, 0.95), P(8.9, -4, 0.05), 0.03, 0.03)
for k in range(6):
    q = P(random.uniform(8.6, 9.3), random.uniform(-8, 4), 0.045)
    verts = bmesh.ops.create_uvsphere(chaos.bm, u_segments=8, v_segments=6, radius=0.045)['verts']
    bmesh.ops.translate(chaos.bm, vec=q, verts=verts)
    chaos.tag('tomato', _faces(verts))

# carrots pulled up and dropped, roots and all; tomatoes splattered; rotten lettuces kicked out
def pulled_carrot(p, yaw):
    d = Vector((math.cos(rad(yaw)), math.sin(rad(yaw)), 0))
    verts = bmesh.ops.create_cone(chaos.bm, cap_ends=True, cap_tris=False, segments=8, radius1=0.028, radius2=0.004, depth=0.17)['verts']
    xform(chaos, 'carrot', verts, Matrix.Translation(Vector(p) + d * 0.085 + Vector((0, 0, 0.028))) @
          Matrix.Rotation(rad(yaw), 4, 'Z') @ Matrix.Rotation(rad(90), 4, 'Y'))
    for k in range(5):
        ang = rad(yaw + 180 + random.uniform(-35, 35))
        leaf_blade(veg, random.choice(['veg_leaf_light', 'veg_yellow']), Vector(p) + Vector((0, 0, 0.03)),
                   Vector((math.cos(ang), math.sin(ang), 0.15)).normalized(), random.uniform(0.18, 0.26), 0.03, 0.04)


for k in range(6):
    pulled_carrot(P(random.uniform(8.6, 9.2), 135 + random.uniform(-9, 9), 0.0), random.uniform(0, 360))
for k in range(4):
    pulled_carrot(P(random.uniform(14.2, 14.8), random.uniform(-15, 15), 0.0), random.uniform(0, 360))
for a0 in (0, 225, 40):
    for k in range(5):
        q = P(random.uniform(8.5, 9.4), a0 + random.uniform(-8, 8), 0.012)
        spill(chaos, 'tomato' if k % 2 else 'tomato_rotten', q, random.uniform(0.04, 0.08), 0.0, seg=10)
        if k % 2:
            verts = bmesh.ops.create_uvsphere(chaos.bm, u_segments=8, v_segments=6, radius=0.045)['verts']
            bmesh.ops.scale(chaos.bm, vec=(1.0, 1.0, 0.55), verts=verts)        # a squashed tomato on its splat
            bmesh.ops.translate(chaos.bm, vec=q + Vector((0, 0, 0.02)), verts=verts)
            chaos.tag('tomato_rotten' if k == 3 else 'tomato', _faces(verts))
for k in range(3):
    lettuce(veg, P(random.uniform(8.4, 9.2), 315 + random.uniform(-8, 8), 0.02), True)

# a harvest tray dropped by the kitchenette, food rolled across the floor (real food models below)
tray_c = P(14.4, 250, 0.12)
_rbox(chaos, 'hull_light', tray_c, (0.06, 0.5, 0.25), 250 + 65)
food_spots = [(P(random.uniform(12.8, 14.6), 250 + random.uniform(-6, 6), 0.0), random.choice(['lime', 'apple', 'onion', 'sweet_potato', 'lemon'])) for _ in range(11)]
food_spots += [(P(random.uniform(8.3, 9.3), a + random.uniform(-10, 10), 0.0), random.choice(['onion', 'sweet_potato']))
               for a in (45, 135, 315) for _ in range(2)]

# crates and cushions dragged in front of the sleeping pods door, as if to block it
for k, (t, z, rz) in enumerate(((-0.7, 0.3, 4), (0.55, 0.3, -7), (-0.1, 0.9, 12))):
    c = P(R - 0.8, 180, z) + TV(180) * t
    _rbox(chaos, 'crate', c, (0.6, 0.9, 0.6), 180 + rz)
    _rbox(kit.CS, 'col', c, (0.6, 0.9, 0.6), 180 + rz)
    _rbox(chaos, 'accent', c + Vector((0, 0, 0.301)), (0.62, 0.2, 0.004), 180 + rz)
pillow('fabric', P(R - 1.6, 177, 0.42), (0.26, 0.9, 0.78), yaw=180 + 70, pitch=-14, pinch=0.12, round_=0.3)
pillow('cushion_blue', P(R - 1.4, 184, 0.09), (0.46, 0.46, 0.17), yaw=33, pinch=0.6)


# ------------------------------------------------------------------ downloaded plants (Poly Haven, CC0)
def load_plant(pid, height, ratio=None, variant='b', exclude=()):
    """Each Poly Haven file holds several plants laid out side by side (named _a, _b, ...).
    Only the one called `variant` is kept, so a placement is one plant, not a scattered group."""
    path = os.path.join(PLANT_DIR, pid, '%s_1k.gltf' % pid)
    if not os.path.exists(path):
        print('MISSING plant (run node Blender/scripts/fetch_plants.cjs):', pid)
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    new_names = [o.name for o in new]
    meshes = [o for o in new if o.type == 'MESH']
    for o in [o for o in meshes if any(x in o.name for x in exclude)]:
        meshes.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    keep = [o for o in meshes if re.sub(r'\.\d+$', '', o.name).endswith('_' + variant)]
    if keep:
        for o in meshes:
            if o not in keep:
                bpy.data.objects.remove(o, do_unlink=True)
        meshes = keep
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    # keep the world transform but drop the importer's parent empties
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for n in new_names:                 # importer empties and anything left over (joined meshes are gone already)
        if n != obj.name and n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
    # a model loaded more than once (the tree variants) shares its images instead of copying them
    for slot in obj.material_slots:
        m = slot.material
        if not m or not m.node_tree:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                base = re.sub(r'\.\d+$', '', n.image.name)
                if base != n.image.name and base in bpy.data.images:
                    n.image = bpy.data.images[base]
    # drop the roughness/metal maps: some fail to convert on export (breaking the file), and a
    # plain roughness looks the same at game distance and keeps the download smaller
    for slot in obj.material_slots:
        m = slot.material
        if not m or not m.node_tree:
            continue
        for link in list(m.node_tree.links):
            if link.to_node.type == 'BSDF_PRINCIPLED' and link.to_socket.name in ('Roughness', 'Metallic'):
                m.node_tree.links.remove(link)
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                n.inputs['Roughness'].default_value = 0.75
                n.inputs['Metallic'].default_value = 0.0
    if ratio:
        mod = obj.modifiers.new('thin', 'DECIMATE')
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # scale to the wanted height and put the origin at the bottom centre
    zs = [v.co.z for v in obj.data.vertices]
    xs = [v.co.x for v in obj.data.vertices]
    ys = [v.co.y for v in obj.data.vertices]
    s = height / max(1e-6, max(zs) - min(zs))
    obj.data.transform(Matrix.Translation((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, -min(zs))))
    obj.data.transform(Matrix.Scale(s, 4))
    obj.location = (0, 0, 0)
    obj.name = 'PLANT_' + pid
    for c in obj.users_collection:
        c.objects.unlink(obj)
    kit.VIS.objects.link(obj)
    return obj


templates = {
    'tree_big': load_plant('pachira_aquatica_01', 7.2, 0.3, variant='a'),
    'tree_mid': load_plant('pachira_aquatica_01', 5.6, 0.3, variant='c'),
    'tree_fallen': load_plant('pachira_aquatica_01', 1.9, 0.3, variant='d'),
    'potted': load_plant('potted_plant_01', 1.35, 0.08),
    'succulent': load_plant('potted_plant_04', 0.3, 0.3, exclude=('ground',)),
    'lime': load_plant('food_lime_01', 0.055, 0.06),
    'apple': load_plant('food_apple_01', 0.075, 0.06),
    'sweet_potato': load_plant('sweet_potato', 0.07, 0.1),
    'onion': load_plant('yellow_onion', 0.075, 0.08),
    'lemon': load_plant('lemon', 0.06, 0.08),
    'pachira': load_plant('pachira_aquatica_01', 3.4, 0.3),
    'pachira_pot': load_plant('pachira_aquatica_01', 1.9, 0.3),
    # potted_plant_02 is left out: two of its texture maps fail to convert and break the file
    'anthurium': load_plant('anthurium_botany_01', 0.75, 0.5),
    'fern': load_plant('fern_02', 0.9),
    'sorrel': load_plant('shrub_sorrel_01', 0.4, variant='k'),
}
plant_spots.append((fallen_tree_at, 'tree_fallen', None, (rad(-88), 0, rad(120 + 90))))
for loc, kind in food_spots:
    plant_spots.append((loc, kind, None, (random.uniform(0, 6.28), random.uniform(0, 6.28), random.uniform(0, 6.28))))
plant_spots.append((P(16.55, 260.5, 0.95), 'succulent', None))                    # on the kitchenette counter
plant_spots.append((P(3.3, 320, -0.18) + TV(320) * 0.15, 'succulent', None))         # on the coffee table


def width(o):
    xs = [v.co.x for v in o.data.vertices]
    ys = [v.co.y for v in o.data.vertices]
    return max(max(xs) - min(xs), max(ys) - min(ys))


widths = {k: width(t) for k, t in templates.items() if t is not None and t.type == 'MESH'}
print('plant widths:', {k: round(w, 2) for k, w in widths.items()})
used = set()
for spot in plant_spots:
    loc, kind, max_w = spot[:3]
    tpl = templates.get(kind)
    if tpl is None:
        continue
    if kind not in used:                # the template itself becomes the first copy
        o = tpl
        used.add(kind)
    else:
        o = tpl.copy()                  # linked copy: same mesh, so the file stores it once
        kit.VIS.objects.link(o)
    o.location = loc
    o.rotation_mode = 'XYZ'             # (imported models use quaternions, which would ignore the angles below)
    o.rotation_euler = spot[3] if len(spot) > 3 else (0, 0, random.uniform(0, math.tau))
    sc = random.uniform(0.85, 1.15) if kind not in ('lime', 'apple', 'sweet_potato', 'onion', 'lemon') else 1.0
    if max_w and kind in widths:
        sc = min(sc, max_w / widths[kind])
    o.scale = (sc, sc, sc)
for kind, tpl in templates.items():     # a template nobody used would stand at the centre of the hall
    if tpl is not None and kind not in used and tpl.name in bpy.data.objects:
        bpy.data.objects.remove(tpl, do_unlink=True)

# keep the download small: plant textures at most 512 px (the game does not need more)
for img in bpy.data.images:
    if img.size[0] > 512 or img.size[1] > 512:
        img.scale(512, 512)

def polish_all(objs):
    for ob in objs:
        if ob.name == 'Atrium_Cushions':
            kit.smooth(ob)
    widths = {'Atrium_Sofas': 0.015, 'Atrium_Props': 0.006, 'Atrium_Pots': 0.01, 'Atrium_Chaos': 0.005,
              'Atrium_Monitors': 0.01, 'Atrium_Planters': 0.012}
    for ob in objs:
        if ob.name in widths:
            kit.polish(ob, widths[ob.name])


finish(OUT_BLEND, OUT_GLB, image_format='WEBP', post=polish_all)
