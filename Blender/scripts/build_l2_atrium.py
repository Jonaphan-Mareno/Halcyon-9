"""
Level 2: the habitat atrium (see the "Halcyon-9 Level 2 Design Spec" doc). A bright two-storey
hall where the crew lived: a sunken lounge with sofas and a palm island in the middle, planter
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
palm_leaf (leaf material, cut out by its alpha).
"""
import sys, os, math, random
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
    dict(name='lab', a0=124, a1=146, z0=ZG, z1=ZG + 3.4),
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
for g in GAPS:
    if g['z0'] > 0:
        arc(wall, 'hull_light', R, R + T, g['a0'], g['a1'], 0, g['z0'], step=2, col=True)
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

# the palm island in the middle of the lounge
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

# sofas curving round the lounge, gaps at north and south so you can walk down into it
sofa = A('Atrium_Sofas')
for a0, a1 in ((110, 170), (190, 250), (290, 350), (10, 70)):
    arc(sofa, 'fabric', 4.2, 5.2, a0, a1, -0.6, -0.15, step=5, col=True)
    arc(sofa, 'fabric', 5.0, 5.35, a0, a1, -0.15, 0.45, step=5, col=True)
    for k in range(3):
        a = a0 + (a1 - a0) * (k + 0.5) / 3
        rbox(sofa, 'fabric_light', 4.55, a, -0.08, 0.5, 1.1, 0.16)
for a in (140, 320):                                                          # low tables with holo tops
    rbox(sofa, 'hull_dark', 3.3, a, -0.4, 1.0, 1.6, 0.4, col=True)
    rbox(sofa, 'aria_screen', 3.3, a, -0.19, 0.8, 1.4, 0.02)

# ------------------------------------------------------------------ growing food: raised beds and wall beds
# The crew grew their own food: tomatoes on stakes, rows of carrots, lettuce. Modelled here from
# simple leaf blades (light on the GPU, and our own work).
kit.mat('veg_leaf', (0.08, 0.26, 0.06), 0.75, 0.0)
kit.mat('veg_leaf_light', (0.15, 0.36, 0.09), 0.75, 0.0)
kit.mat('carrot', (0.90, 0.40, 0.06), 0.6, 0.0)
kit.mat('tomato', (0.72, 0.06, 0.04), 0.35, 0.0)
kit.mat('stake', (0.40, 0.30, 0.18), 0.8, 0.0)
for _nm in ('veg_leaf', 'veg_leaf_light'):
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


def carrot(acc, p):
    cyl(acc, 'carrot', (p.x, p.y, p.z + 0.02), 0.028, 0.05, 6)                 # orange top showing above the soil
    for k in range(6):
        ang = k / 6 * math.tau + random.uniform(-0.3, 0.3)
        d = Vector((math.cos(ang) * 0.35, math.sin(ang) * 0.35, 1)).normalized()
        leaf_blade(acc, 'veg_leaf_light', p + Vector((0, 0, 0.04)), d, random.uniform(0.2, 0.3), 0.03, 0.02)


def lettuce(acc, p):
    for k in range(9):
        ang = k / 9 * math.tau + random.uniform(-0.2, 0.2)
        d = Vector((math.cos(ang), math.sin(ang), 0.3 + (k % 3) * 0.25)).normalized()
        leaf_blade(acc, 'veg_leaf_light' if k % 2 else 'veg_leaf', p + Vector((0, 0, 0.02)), d, 0.2, 0.09, 0.0)


def tomato(acc, p):
    cyl(acc, 'stake', (p.x, p.y, p.z + 0.65), 0.015, 1.3, 6)
    for k in range(14):
        ang = random.uniform(0, math.tau)
        d = Vector((math.cos(ang), math.sin(ang), random.uniform(-0.2, 0.5))).normalized()
        leaf_blade(acc, 'veg_leaf', p + Vector((0, 0, random.uniform(0.15, 1.15))), d, random.uniform(0.18, 0.28), 0.07, 0.04)
    for k in range(5):
        ang = random.uniform(0, math.tau)
        q = p + Vector((math.cos(ang) * 0.12, math.sin(ang) * 0.12, random.uniform(0.3, 1.0)))
        verts = bmesh.ops.create_uvsphere(acc.bm, u_segments=8, v_segments=6, radius=0.045)['verts']
        bmesh.ops.translate(acc.bm, vec=q, verts=verts)
        acc.tag('tomato', _faces(verts))


CROPS = {'carrot': (carrot, 0.24), 'lettuce': (lettuce, 0.42), 'tomato': (tomato, 0.6)}


def jitter():
    return Vector((random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), 0))


def fill_rect_bed(rc, a, radial, tangential, top, crop):
    fn, spacing = CROPS[crop]
    nr, nt = max(1, int(radial / spacing)), max(1, int(tangential / spacing))
    for i in range(nr):
        for j in range(nt):
            rr = rc - radial / 2 + (i + 0.5) * radial / nr
            fn(veg, P(rr, a, top) + TV(a) * (-tangential / 2 + (j + 0.5) * tangential / nt) + jitter())


def fill_arc_bed(r0, r1, a0, a1, top, crop):
    if a1 < a0:
        a1 += 360
    fn, spacing = CROPS[crop]
    rows = max(1, int((r1 - r0) / spacing))
    for i in range(rows):
        rr = r0 + (i + 0.5) * (r1 - r0) / rows
        n = max(1, int(math.radians(a1 - a0) * rr / spacing))
        for j in range(n):
            fn(veg, P(rr, a0 + (j + 0.5) * (a1 - a0) / n, top) + jitter())


# raised beds on the floor, one crop each
beds = A('Atrium_Planters')
for a, crop in ((0, 'tomato'), (45, 'lettuce'), (135, 'carrot'), (225, 'tomato'), (315, 'lettuce')):
    rbox(beds, 'hull_light', 10.2, a, 0.4, 1.8, 4.2, 0.8, col=True)
    rbox(beds, 'accent', 10.2, a, 0.81, 1.86, 4.26, 0.04)
    rbox(beds, 'soil', 10.2, a, 0.82, 1.6, 4.0, 0.04)
    rbox(beds, 'blue_glow', 10.2, a, 0.02, 1.9, 4.3, 0.04)
    fill_rect_bed(10.2, a, 1.4, 3.7, 0.84, crop)

# long beds along the wall, under the gallery (gaps for the window, doors, lift and stairs)
for a0, a1, crop in ((336, 28, 'carrot'), (32, 58, 'tomato'), (124, 166, 'lettuce'), (192, 207, 'tomato')):
    arc(beds, 'hull_light', 15.2, 16.75, a0, a1, 0, 0.7, step=3, col=True)
    arc(beds, 'accent', 15.15, 15.25, a0, a1, 0.66, 0.74, step=3)
    arc(beds, 'soil', 15.3, 16.65, a0, a1, 0.7, 0.72, step=3)
    arc(beds, 'blue_glow', 15.17, 15.22, a0, a1, 0.02, 0.06, step=3)
    fill_arc_bed(15.45, 16.5, a0, a1, 0.72, crop)

# decorative plants always stand in a pot: white with an orange rim
pots = A('Atrium_Pots')


def pot(loc, r=0.36, h=0.58):
    cyl(pots, 'hull_light', (loc.x, loc.y, loc.z + h / 2), r, h, 20)
    cyl(pots, 'accent', (loc.x, loc.y, loc.z + h - 0.03), r + 0.025, 0.06, 20)
    cyl(pots, 'soil', (loc.x, loc.y, loc.z + h - 0.005), r - 0.03, 0.02, 20)
    kit.col_box((loc.x - r, loc.y - r, loc.z), (loc.x + r, loc.y + r, loc.z + h))
    return Vector((loc.x, loc.y, loc.z + h))


plant_spots = [(Vector((0.7, 0.6, 0.33)), 'palm_tall'), (Vector((-0.8, -0.5, 0.33)), 'palm'),   # (location, kind)
               (Vector((0.4, -1.3, 0.33)), 'pachira'), (Vector((-1.3, 0.9, 0.33)), 'fern')]
for k in range(10):                                                            # flowers round the island's edge
    plant_spots.append((P(1.85, k * 36 + 10, 0.33), 'sorrel'))
for a, kind in ((20, 'calathea'), (160, 'anthurium'), (200, 'fern'), (340, 'calathea')):   # round the lounge
    plant_spots.append((pot(P(8.0, a, 0.0)), kind))
plant_spots.append((pot(P(9.8, 254, 0.0)), 'fern'))                            # by the info kiosk
for a in (80, 100):                                                            # short palms by the window
    plant_spots.append((pot(P(14.8, a, 0.0), r=0.55, h=0.8), 'palm_short'))
for a, kind in ((31, 'calathea'), (150, 'fern'), (12, 'anthurium')):            # on the gallery, by the doors
    plant_spots.append((pot(P(16.2, a, ZG), r=0.3, h=0.5), kind))

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
for a0, a1 in deck_spans:
    arc(gal, 'floor_dark', GR, R, a0, a1, ZG - 0.35, ZG, step=4, col=True)
    arc(gal, 'hull_light', GR, R, a0, a1, ZG - 0.6, ZG - 0.35, step=4)
    arc(gal, 'blue_glow', GR, GR + 0.08, a0, a1, ZG - 0.34, ZG - 0.1, step=4)
    arc(gal, 'glass', GR, GR + 0.04, a0, a1, ZG, ZG + 1.08, step=4)
    arc(gal, 'accent', GR - 0.04, GR + 0.1, a0, a1, ZG + 1.05, ZG + 1.13, step=4)
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


for name, g in (('KESSLER', GAPS[5]), ('LAB', GAPS[1]), ('VOSS', GAPS[4])):
    d = A('DOOR_' + name)
    arc(d, 'hull_mid', R + 0.1, R + 0.4, g['a0'], g['a1'], g['z0'], g['z1'], step=1)
    arc(d, 'blue_glow', R + 0.05, R + 0.1, (g['a0'] + g['a1']) / 2 - 0.15, (g['a0'] + g['a1']) / 2 + 0.15, g['z0'] + 0.2, g['z1'] - 0.2, step=0.3)
    frame(g['a0'], g['a1'], g['z0'], g['z1'])
    empty('PT_Plate_' + name, P(R - 0.3, (g['a0'] + g['a1']) / 2, g['z1'] + 0.7))
    rbox(A('Atrium_RoomBacks'), 'hull_mid', R + 2.6, (g['a0'] + g['a1']) / 2, g['z0'] + 1.7, 0.3, 6.0, 3.6)   # until the rooms are built
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
for i, a in enumerate((20, 70, 110, 160, 200, 225, 315, 340)):
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
box(mon, 'hull_dark', (-2.25, -0.15, 7.25), (2.25, 0.15, 9.85))
box(mon, 'aria_screen', (-2.1, -0.2, 7.4), (2.1, -0.15, 9.7))
for x in (-1.8, 1.8):
    box(mon, 'hull_mid', (x - 0.04, -0.04, 9.85), (x + 0.04, 0.04, H))
empty('ARIA_M1', (0, -0.25, 8.55))
wall_screen('ARIA_M2', 281, 2.3)              # beside the lift
wall_screen('ARIA_M3', 247, 2.3)              # foot of the west stair
wall_screen('ARIA_M4', 293, 2.3)              # foot of the east stair
wall_screen('ARIA_M5', 57, ZG + 1.9)          # outside Dr. Kessler's door
wall_screen('ARIA_M6', 120, ZG + 1.9)         # outside the lab
# M10: the info kiosk by the lounge
kiosk = P(9.4, 240, 0)
rbox(mon, 'hull_light', 9.4, 240, 0.9, 0.55, 1.0, 1.8, col=True)
rbox(mon, 'accent', 9.4, 240, 1.82, 0.6, 1.05, 0.06)
rbox(mon, 'aria_screen', 9.12, 240, 1.15, 0.02, 0.8, 0.9)
empty('ARIA_M10', P(9.1, 240, 1.15))
# the crew photo board on the wall near the kiosk
rbox(mon, 'hull_mid', R - 0.06, 233, 1.7, 0.06, 2.4, 1.5)
empty('PT_PhotoBoard', P(R - 0.12, 233, 1.7))


# ------------------------------------------------------------------ palms (our own model)
# Palm leaves are real geometry (leaflet blades), so they need no transparency and always draw
kit.mat('palm_leaf', (0.07, 0.26, 0.06), 0.7, 0.0)
kit.MATS['palm_leaf'].use_backface_culling = False
kit.mat('palm_leaf_light', (0.12, 0.35, 0.08), 0.7, 0.0)
kit.MATS['palm_leaf_light'].use_backface_culling = False


def make_palm(name, height, lean=0.12, fronds=11):
    acc = kit.Acc(name)
    # trunk: tapering rings along a gentle curve
    segs = 14
    pts = [Vector((lean * height * (i / segs) ** 2, 0, height * i / segs)) for i in range(segs + 1)]
    for i in range(segs):
        r0 = 0.2 - 0.08 * i / segs
        c = (pts[i] + pts[i + 1]) / 2
        verts = bmesh.ops.create_cone(acc.bm, cap_ends=True, cap_tris=False, segments=10,
                                      radius1=r0 + 0.02, radius2=r0 - 0.01, depth=(pts[i + 1] - pts[i]).length)['verts']
        d = pts[i + 1] - pts[i]
        q = d.to_track_quat('Z', 'Y')
        bmesh.ops.transform(acc.bm, matrix=Matrix.Translation(c) @ q.to_matrix().to_4x4(), verts=verts)
        acc.tag('palm_trunk', _faces(verts))
    top = pts[-1]
    # fronds: a stem that arches up and droops, with pairs of leaflet blades along it
    up = Vector((0, 0, 1))
    for f in range(fronds):
        ang = f / fronds * math.tau + random.uniform(-0.2, 0.2)
        L = height * random.uniform(0.36, 0.46)
        lift = random.uniform(0.7, 1.1)
        dirv = Vector((math.cos(ang), math.sin(ang), 0))
        side = Vector((-math.sin(ang), math.cos(ang), 0))
        n = 14
        pts = [top + dirv * (L * (i / n)) + up * (L * (lift * (i / n) - 1.1 * (i / n) ** 2)) for i in range(n + 1)]
        tone = 'palm_leaf' if f % 2 else 'palm_leaf_light'
        for i in range(n):                              # the stem: a thin strip
            p0, p1 = pts[i], pts[i + 1]
            w0 = 0.05 * (1 - i / n) + 0.01
            w1 = 0.05 * (1 - (i + 1) / n) + 0.01
            vs = [acc.bm.verts.new(p0 - side * w0), acc.bm.verts.new(p0 + side * w0),
                  acc.bm.verts.new(p1 + side * w1), acc.bm.verts.new(p1 - side * w1)]
            acc.tag(tone, [acc.bm.faces.new(vs)])
        for i in range(1, n):                           # leaflets, longest in the middle of the frond
            sfrac = i / n
            t = (pts[i + 1] - pts[i - 1]).normalized()
            length = L * 0.42 * math.sin(math.pi * sfrac) ** 0.7
            for sgn in (-1, 1):
                tip = pts[i] + side * (sgn * length) + t * (length * 0.45) - up * (length * 0.35)
                b0 = pts[i] - t * 0.07
                b1 = pts[i] + t * 0.07
                mid = (pts[i] + tip) / 2 + t * 0.06
                vs = [acc.bm.verts.new(b0), acc.bm.verts.new(b1), acc.bm.verts.new(mid), acc.bm.verts.new(tip)]
                acc.tag(tone, [acc.bm.faces.new((vs[0], vs[1], vs[2])), acc.bm.faces.new((vs[0], vs[2], vs[3]))])
    return kit.flush(acc)


# tall enough that the crowns rise above the gallery railings, as in the reference
palm_a = make_palm('PLANT_palm_a', 7.2)
palm_b = make_palm('PLANT_palm_b', 8.6, lean=0.16, fronds=13)
palm_c = make_palm('PLANT_palm_c', 3.3, lean=0.08, fronds=9)                   # small, for pots


# ------------------------------------------------------------------ downloaded plants (Poly Haven, CC0)
def load_plant(pid, height, ratio=None):
    path = os.path.join(PLANT_DIR, pid, '%s_1k.gltf' % pid)
    if not os.path.exists(path):
        print('MISSING plant (run node Blender/scripts/fetch_plants.cjs):', pid)
        return None
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    new_names = [o.name for o in new]
    meshes = [o for o in new if o.type == 'MESH']
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
    'palm': palm_a, 'palm_tall': palm_b, 'palm_short': palm_c,
    'pachira': load_plant('pachira_aquatica_01', 3.4, 0.3),
    # potted_plant_02 is left out: two of its texture maps fail to convert and break the file
    'calathea': load_plant('calathea_orbifolia_01', 0.85, 0.6),
    'anthurium': load_plant('anthurium_botany_01', 0.75),
    'fern': load_plant('fern_02', 0.9),
    'sorrel': load_plant('shrub_sorrel_01', 0.4),
}
used = set()
for loc, kind in plant_spots:
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
    o.rotation_euler = (0, 0, random.uniform(0, math.tau))
    sc = random.uniform(0.85, 1.15)
    o.scale = (sc, sc, sc)

# keep the download small: plant textures at most 512 px (the game does not need more)
for img in bpy.data.images:
    if img.size[0] > 512 or img.size[1] > 512:
        img.scale(512, 512)

finish(OUT_BLEND, OUT_GLB, image_format='WEBP')
