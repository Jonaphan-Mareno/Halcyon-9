"""
Level 3, the drowned works: what the kraken's cave became. Behind the cliff, past the cave's
mouth, the station's builders dug a great hall into the rock to reach the uplink relay, and left
their construction site to the sea: stacked containers, half-built module sections, scaffolding,
girder piles, pipe runs, cranes and floodlight masts, all rusted. The kraken lives in it.

All modelled here (our own work); the rock and metal are textured by the game (DeckMaterials.js,
by these material names), the water, the glow and the kraken are the game's.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_l3_works.py -- \
      Blender/l3-works.blend public/assets/models/l3-works.glb
  npm run optimize-models -- l3-works.glb

The layout (metres; x east, y north, z up: the same axes as build_l3_outside.py, so it lines up):
  - the cave's throat, rebuilt exactly as build_l3_outside.py builds it (the game hides that cave),
    opening into a hall 90 m long and 68 m wide, its rock roof 18 to 27 m up
  - the hall is a grid of 5 m cells (MAP below). Most of it is a maze 7.5 m tall: wreckage blocks,
    and corridors roofed with grating decks; over the roofs is open water the kraken swims through
    (the player cannot get up there: the pockets and the clearing are walled to 17 m, and the game
    keeps him below 16 m). Arms come down through the decks; it watches through barred windows
    and bursts through walls
  - E  the entry
  - the yard (west): the maze on the way in: a barred window into its den, a crawl pipe, a wall
    panel it bursts out through, a pocket open to the dark above
  - the clearing (middle): the arena, with floodlight masts, a fallen drill, a gantry overhead
    and a crane that come down in the finale
  - X  the east end: the excavation shaft down to the buried relay, and a crack in the rock the
    kraken escapes into
  - under it all: the shaft, a sloping tunnel half full of sand, and the relay room
  - at the cave's mouth: the works' lit entrance (the lights seen from far above)

Names the game reads (Works.js, Trench.js): COL_ collision; GATE_ doors, shutters, gates and the
shaft's cover (the game opens and smashes them); BURST_ a wall panel the kraken bursts through;
FALL_ pieces that fall in the finale (each one's origin is its hinge); PT_ points (the hunts'
routes: PT_H<hunt>_<step>[_<event>]); WL_ where the borrowed lights go.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import bmesh
from mathutils import Vector, Matrix, noise
import kit
from kit import A, box, beam, cyl, empty, col_box

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_BLEND = argv[0] if len(argv) > 0 else None
OUT_GLB = argv[1] if len(argv) > 1 else None

random.seed(23)
kit.begin('L3Works', palette='lab')
M = kit.mat
# (the game swaps the textured ones by name, as outside)
M('l3_wall', (0.30, 0.31, 0.32), 0.7, 0.6)
M('l3_rust', (0.42, 0.22, 0.10), 0.85, 0.5)
M('l3_grate', (0.40, 0.25, 0.15), 0.8, 0.6)
M('l3_dark', (0.07, 0.07, 0.075), 0.6, 0.5)
M('l3_hazard', (0.70, 0.55, 0.10), 0.7, 0.2)
M('l3_hull', (0.32, 0.34, 0.36), 0.7, 0.6)
M('l3_rock', (0.10, 0.13, 0.15), 0.9, 0.0)
M('l3_concrete', (0.50, 0.50, 0.48), 0.9, 0.0)
M('l3_navy', (0.10, 0.18, 0.30), 0.7, 0.4)          # painted containers (rusting through)
M('l3_orange', (0.60, 0.25, 0.08), 0.7, 0.4)
M('l3_lamp', (1.0, 0.85, 0.6), 0.4, 0, (1.0, 0.82, 0.55), 3.0)
M('l3_flood', (1.0, 0.95, 0.85), 0.4, 0, (1.0, 0.95, 0.85), 4.0)     # the clearing's floodlights (switched by the game)
M('l3_alarm', (1.0, 0.1, 0.05), 0.4, 0, (1.0, 0.08, 0.04), 2.5)
M('l3_o2', (0.2, 0.9, 0.5), 0.4, 0, (0.2, 1.0, 0.55), 2.2)            # the air stations
M('l3_screen', (0.05, 0.2, 0.25), 0.3, 0.0, (0.25, 0.85, 1.0), 1.4)
M('l3_bone', (0.62, 0.58, 0.5), 0.7, 0.0)

# ---------------------------------------------------------------- the plan
MX, CY, F = 21.7, 22.5, -40.3        # the cave's mouth (x), the canyon's middle line (y), the cave's floor
X0 = MX + 7.0                        # the hall's west wall
CELL = 5.0
COLS, ROWS = 18, 13
Y0 = CY - 32.5                       # the south edge of row 0
ROOF, TALL = 7.5, 17.0               # the maze's decks; the walls round the open places
HALL = (X0 - 0.5, X0 + 90.5, CY - 34.0, CY + 34.0)

# The hall from above, north at the top, west on the left (row 12 first). Cells:
#   #  wreckage (solid to the decks)     .  corridor (decked over)     p  a crawl pipe through wreckage
#   O  open pocket (no deck: the kraken can drop in)                   g  corridor with barred windows
#   w  corridor with a panel the kraken bursts through                 h  its den (only it goes there)
#   E  the entry       -  the clearing       X  the east end    s  the shaft    k  the crack
MAP = [
    "##################",   # 12
    "##################",   # 11
    "###OO...##########",   # 10
    "###OO##.-----#####",   # 9
    "EEE#.hh#-----#####",   # 8
    "EEE#.w.g-----XXXX#",   # 7
    "EEE###p#-----XXsXk",   # 6
    "EEE###.#-----XXXX#",   # 5
    "EEE##..#-----#####",   # 4
    "#.#hh#.#-----#####",   # 3
    "#.#hh#.###########",   # 2
    "#..gg..###########",   # 1
    "##################",   # 0
]
GRID = {}
for i, row in enumerate(MAP):
    assert len(row) == COLS, row
    for c, chr_ in enumerate(row):
        GRID[(c, ROWS - 1 - i)] = chr_


def ch(c, r):
    return GRID.get((c, r), '#')


CLASS = {'.': 'A', 'O': 'A', 'g': 'A', 'w': 'A', 'p': 'A', '-': 'C', 'E': 'E', 'X': 'X', 's': 'X', 'k': 'X',
         'h': 'H', '#': '#'}


def cls(c, r):
    return CLASS[ch(c, r)]


def roofed(c, r):
    return ch(c, r) in '.gw'


def open_top(c, r):
    return ch(c, r) in 'OE-XskH' or ch(c, r) == 'h'


def x0(c):
    return X0 + CELL * c


def y0(r):
    return Y0 + CELL * r


def centre(c, r, z=0.0):
    return Vector((x0(c) + 2.5, y0(r) + 2.5, F + z))


# the doorways between parts (the game opens, shuts and smashes what is in them)
OPENINGS = {
    frozenset({(1, 4), (1, 3)}): ('arch', 'E'),
    frozenset({(7, 9), (8, 9)}): ('shutter', 'W1'),
    frozenset({(12, 6), (13, 6)}): ('gate', 'X'),
}
DOOR_H = 6.2                         # how tall the doorways are

# ---------------------------------------------------------------- helpers
def rnd(a, b):
    return random.uniform(a, b)


def rock_noise(p, s=0.16):
    q = Vector((p.x * s, p.y * s, p.z * s))
    return noise.noise(q) + 0.5 * noise.noise(q * 2.3 + Vector((5, 1, 3))) + 0.25 * noise.noise(q * 5.1 + Vector((2, 7, 1)))


def obj_from_bm(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(kit.MATS[mat])
    ob = bpy.data.objects.new(name, me)
    kit.VIS.objects.link(ob)
    return ob


def face_toward(bm, faces, want):
    flip = [f for f in faces if f.normal.dot(want(f.calc_center_median())) < 0]
    if flip:
        bmesh.ops.reverse_faces(bm, faces=flip)


def smooth_shade(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def collider_copy(name, ob):
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    me.transform(ob.matrix_world)
    c = bpy.data.objects.new(name, me)
    kit.VIS.objects.link(c)
    return c


def tube(acc, mat, p0, p1, r, seg=8):
    """A round bar or pipe between two points."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    verts = bmesh.ops.create_cone(acc.bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length)['verts']
    rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.transform(acc.bm, matrix=Matrix.Translation((p0 + p1) / 2) @ rot, verts=verts)
    acc.tag(mat, kit._faces(verts))


def ball(acc, mat, c, r, sub=1, scale=(1, 1, 1)):
    verts = bmesh.ops.create_icosphere(acc.bm, subdivisions=sub, radius=r)['verts']
    bmesh.ops.transform(acc.bm, matrix=Matrix.Translation(Vector(c)) @ Matrix.Diagonal((*scale, 1)), verts=verts)
    acc.tag(mat, kit._faces(verts))


def ibeam(acc, mat, p0, p1, h=0.36, w=0.22):
    """An I-beam (two flanges and a web) from p0 to p1, its web upright (or across, if it stands)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0)
    L = d.length
    if L < 1e-4:
        return
    fwd = d / L
    up = Vector((0, 0, 1)) if abs(fwd.z) < 0.9 else Vector((1, 0, 0))
    side = fwd.cross(up).normalized()
    up = side.cross(fwd).normalized()
    t = 0.05
    for (o, hw, hh) in ((up * (h / 2 - t / 2), w / 2, t / 2), (-up * (h / 2 - t / 2), w / 2, t / 2), (Vector(), t / 2, h / 2 - t)):
        verts = bmesh.ops.create_cube(acc.bm, size=1.0)['verts']
        basis = Matrix((fwd, side, up)).transposed().to_4x4()
        mx = Matrix.Translation((p0 + p1) / 2 + o) @ basis @ Matrix.Diagonal((L, hw * 2, hh * 2, 1.0))
        bmesh.ops.transform(acc.bm, matrix=mx, verts=verts)
        acc.tag(mat, kit._faces(verts))


def quad(acc, mat, a, b, c, d):
    vs = [acc.bm.verts.new(Vector(p)) for p in (a, b, c, d)]
    f = acc.bm.faces.new(vs)
    acc.tag(mat, [f])
    return f


def obox(acc, mat, centre_, size, yaw=0.0, pitch=0.0, roll=0.0):
    """A box of a size (x, y, z) turned about z (yaw), then its own y (pitch) and x (roll)."""
    verts = bmesh.ops.create_cube(acc.bm, size=1.0)['verts']
    rot = Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(pitch, 4, 'Y') @ Matrix.Rotation(roll, 4, 'X')
    mx = Matrix.Translation(Vector(centre_)) @ rot @ Matrix.Diagonal((*size, 1.0))
    bmesh.ops.transform(acc.bm, matrix=mx, verts=verts)
    acc.tag(mat, kit._faces(verts))


def open_tube(bm, path, radius, seg=14, inward=True):
    """A tube's wall (no ends) along a list of points, facing in (or out). Returns its faces."""
    rings = []
    for i, p in enumerate(path):
        p = Vector(p)
        d = (Vector(path[min(i + 1, len(path) - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
        a = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        s = d.cross(a).normalized()
        u = s.cross(d).normalized()
        rings.append([bm.verts.new(p + (s * math.cos(t) + u * math.sin(t)) * radius)
                      for t in (2 * math.pi * k / seg for k in range(seg))])
    faces = []
    for i in range(len(rings) - 1):
        for k in range(seg):
            faces.append(bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k])))
    bm.normal_update()
    # (each face toward its ring's middle, or away)
    for i in range(len(rings) - 1):
        mid = (Vector(path[i]) + Vector(path[i + 1])) / 2
        group = faces[i * seg:(i + 1) * seg]
        face_toward(bm, group, (lambda m: (lambda c: (m - c) if inward else (c - m)))(mid))
    return faces


# ---------------------------------------------------------------- the throat (as the outside builds it)
# The same loft as build_l3_outside.py's cave, up to where the hall begins, so it meets the hole in
# the cliff exactly: rings across x (half width, half height), floor flat at F, rock noise
CAVE = [(-4, 10.5, 9.5), (-2, 8.5, 8.0), (0, 7.4, 7.0), (2, 7.0, 6.6), (4, 7.4, 6.8), (8, 12.0, 9.0), (13, 18.0, 12.0),
        (20, 22.0, 14.0)]


def cave_wh(dx):
    for (d0, w0, h0), (d1, w1, h1) in zip(CAVE, CAVE[1:]):
        if dx <= d1:
            t = max(0.0, (dx - d0) / (d1 - d0))
            return w0 + (w1 - w0) * t, h0 + (h1 - h0) * t
    return CAVE[-1][1], CAVE[-1][2]


bm = bmesh.new()
SEG = 32
rings = []
for k in range(11):                  # dx -4 .. 8.5 (the outside's own steps)
    dx = -4 + k * 1.25
    W, H = cave_wh(dx)
    zc = F + 0.55 * H
    ring = []
    for j in range(SEG):
        a = 2 * math.pi * j / SEG
        y = CY + W * math.cos(a)
        z = zc + H * math.sin(a)
        p = Vector((MX + dx, y, max(z, F)))
        if z <= F:
            p.z = F + 0.35 * rock_noise(p, 0.3)
        else:
            out = Vector((0, y - CY, z - zc)).normalized()
            p += out * (1.3 * min(1.0, min(W, H) / 7.0) * rock_noise(p))
        ring.append(bm.verts.new(p))
    rings.append(ring)
tf = []
for i in range(len(rings) - 1):
    for j in range(SEG):
        tf.append(bm.faces.new((rings[i][j], rings[i][(j + 1) % SEG], rings[i + 1][(j + 1) % SEG], rings[i + 1][j])))
bm.normal_update()
face_toward(bm, tf, lambda c: Vector((0, CY - c.y, F + 0.55 * cave_wh(c.x - MX)[1] - c.z)))
throat = obj_from_bm('TERRAIN_WorksThroat', bm, 'l3_rock')
smooth_shade(throat)
collider_copy('COL_WorksThroat', throat)

# ---------------------------------------------------------------- the hall
def ceil_z(x, y):
    u, v = x - X0, y - CY
    k = 1 - ((u - 52) / 50.0) ** 2 - (v / 40.0) ** 2
    return F + 18.0 + 9.0 * max(0.0, k)


SHAFT = centre(15, 6)                # the excavation shaft (x, y)
SHAFT_R = 2.2
STEP = 2.5
bm = bmesh.new()
faces_all = []


def sheet(nu, nv, at, keep=None):
    """A grid of quads, at(i, j) -> its corner; keep(face centre) leaves holes."""
    vs = [[bm.verts.new(at(i, j)) for i in range(nu + 1)] for j in range(nv + 1)]
    out = []
    for j in range(nv):
        for i in range(nu):
            q = (vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i])
            c = sum((v.co for v in q), Vector()) / 4
            if keep and not keep(c):
                continue
            out.append(bm.faces.new(q))
    return out


hx0, hx1, hy0, hy1 = HALL
nx = int((hx1 - hx0 + 2) / STEP) + 1
ny = int((hy1 - hy0 + 2) / STEP) + 1
fx = lambda i: hx0 - 1 + (hx1 - hx0 + 2) * i / nx
fy = lambda j: hy0 - 1 + (hy1 - hy0 + 2) * j / ny
# the floor (bumpy, smoother in the clearing), with a hole for the shaft and none where the throat's
# own floor is
def floor_at(i, j):
    p = Vector((fx(i), fy(j), F))
    calm = 0.06 if (x0(8) < p.x < x0(13) and y0(3) < p.y < y0(10)) else 0.14
    p.z = F + calm * rock_noise(p, 0.3)
    return p


floor_f = sheet(nx, ny, floor_at, keep=lambda c: not (c.x < X0 + 1.6 and abs(c.y - CY) < 10.0)
                and (Vector((c.x, c.y, 0)) - Vector((SHAFT.x, SHAFT.y, 0))).length > SHAFT_R + 0.6)
bm.normal_update()
face_toward(bm, floor_f, lambda c: Vector((0, 0, 1)))
# the roof: a vault, highest over the clearing
ceil_f = sheet(nx, ny, lambda i, j: (lambda p: Vector((p.x, p.y, ceil_z(p.x, p.y) + 0.9 * rock_noise(p, 0.12))))(Vector((fx(i), fy(j), 0))))
bm.normal_update()
face_toward(bm, ceil_f, lambda c: Vector((0, 0, -1)))
# the walls, rough rock pushed back a little from the plan's edge; a hole in the west one for the
# throat, a slit in the east one for the crack
WALL_N = 10


def wall(axis, at, lo, hi, outward, keep=None):
    n = int((hi - lo) / STEP) + 1
    def corner(i, j):
        s = lo + (hi - lo) * i / n
        x, y = (at, s) if axis == 'x' else (s, at)
        top = ceil_z(x, y) + 1.6
        z = F - 1.5 + (top - F + 1.5) * j / WALL_N
        p = Vector((x, y, z))
        push = 0.5 + 0.6 * (rock_noise(p, 0.18) + 1) / 2
        if axis == 'x':
            p.x += outward * push
        else:
            p.y += outward * push
        return p
    fs = sheet(n, WALL_N, corner, keep)
    bm.normal_update()
    want = Vector((-outward, 0, 0)) if axis == 'x' else Vector((0, -outward, 0))
    face_toward(bm, fs, lambda c: want)
    return fs


THROAT_ZC = F + 4.6
wall('x', hx0, hy0 - 1, hy1 + 1, -1, keep=lambda c: ((c.y - CY) / 7.5) ** 2 + ((c.z - THROAT_ZC) / 6.5) ** 2 > 1)
wall('x', hx1, hy0 - 1, hy1 + 1, 1, keep=lambda c: not (abs(c.y - CY) < 2.4 and c.z < F + 11.5))
wall('y', hy0, hx0 - 1, hx1 + 1, -1)
wall('y', hy1, hx0 - 1, hx1 + 1, 1)
hall = obj_from_bm('TERRAIN_Works', bm, 'l3_rock')
smooth_shade(hall)
collider_copy('COL_WorksHall', hall)

# the crack at the back: a fissure narrowing into the rock (the kraken escapes into it)
bm = bmesh.new()
cf = []
prev = None
for k in range(7):
    t = k / 6
    x = hx1 + 0.4 + t * 11
    half = 2.4 * (1 - t) + 0.35
    top = F + 11.5 * (1 - 0.6 * t)
    ring = []
    for (sy, sz) in ((-1, 0), (-1, 1), (1, 1), (1, 0)):
        p = Vector((x, CY + sy * half, F - 1 + sz * (top - F + 1)))
        p.y += sy * 0.4 * rock_noise(p, 0.4)
        ring.append(bm.verts.new(p))
    if prev:
        for j in range(3):
            cf.append(bm.faces.new((prev[j], prev[j + 1], ring[j + 1], ring[j])))
        cf.append(bm.faces.new((prev[3], prev[0], ring[0], ring[3])))
    prev = ring
cf.append(bm.faces.new(prev[::-1]))
bm.normal_update()
face_toward(bm, cf, lambda c: Vector((hx1 - c.x, CY - c.y, F + 4 - c.z)))
crack = obj_from_bm('TERRAIN_WorksCrack', bm, 'l3_rock')
collider_copy('COL_WorksCrack', crack)

# ---------------------------------------------------------------- the maze
blocks = A('W_Blocks')               # the wreckage
decks = A('W_Decks')                 # the corridors' grating roofs and their beams
walls = A('W_Walls')                 # walls, fences, windows, doorframes
debris = A('W_Debris')
lamps = A('W_Lamps')                 # glowing things

BLOCK_KIND = {}
for (c, r), v in GRID.items():
    if v in '#p':
        BLOCK_KIND[(c, r)] = random.choice(['containers', 'containers', 'sheeting', 'machine', 'girders', 'hull'])
PAINT = ['l3_navy', 'l3_orange', 'l3_rust', 'l3_hull', 'l3_navy', 'l3_orange']


def edge_frame(c, r, side):
    """The edge of cell (c, r) on a side ('E','W','N','S'): its two ends (on the floor) and the way
    into the neighbour."""
    xa, ya = x0(c), y0(r)
    if side == 'E':
        return Vector((xa + CELL, ya, F)), Vector((xa + CELL, ya + CELL, F)), Vector((1, 0, 0))
    if side == 'W':
        return Vector((xa, ya + CELL, F)), Vector((xa, ya, F)), Vector((-1, 0, 0))
    if side == 'N':
        return Vector((xa + CELL, ya + CELL, F)), Vector((xa, ya + CELL, F)), Vector((0, 1, 0))
    return Vector((xa, ya, F)), Vector((xa + CELL, ya, F)), Vector((0, -1, 0))


NEIGH = {'E': (1, 0), 'W': (-1, 0), 'N': (0, 1), 'S': (0, -1)}


def dress_face(c, r, side, kind):
    """The face of wreckage block (c, r) toward a corridor on its side: what can be seen of it."""
    a, b, out = edge_frame(c, r, side)
    along = (b - a).normalized()
    face = lambda s, z, o=0.0: a + along * s + out * o + Vector((0, 0, z))
    if kind == 'containers':
        for lvl in range(3):
            z0 = lvl * 2.5
            m = random.choice(PAINT)
            shift = rnd(-0.3, 0.3)
            end = random.random() < 0.35
            # the container's side (or its doors), standing a little proud of the block
            lo = face(0.1 + max(0, shift), z0 + 0.05, 0.0)
            hi = face(4.9 + min(0, shift), z0 + 2.45, 0.22)
            box(blocks, m, (min(lo.x, hi.x), min(lo.y, hi.y), lo.z), (max(lo.x, hi.x), max(lo.y, hi.y), hi.z))
            if end:
                for s in (1.3, 1.9, 3.1, 3.7):
                    tube(blocks, 'l3_rust', face(s, z0 + 0.3, 0.27), face(s, z0 + 2.2, 0.27), 0.04, 6)
                obox(blocks, 'l3_dark', face(2.5, z0 + 1.25, 0.24), (0.06, 0.06, 2.2) if abs(out.x) > 0.5 else (0.06, 0.06, 2.2))
            else:
                for s in [0.7 + 0.9 * k for k in range(5)]:
                    obox(blocks, m, face(s, z0 + 1.25, 0.25), (0.08 if abs(along.x) > 0.5 else 0.05, 0.08 if abs(along.y) > 0.5 else 0.05, 2.2))
            beam(blocks, 'l3_rust', face(0.1, z0 + 2.4, 0.25), face(4.9, z0 + 2.4, 0.25), 0.1, 0.1)
    elif kind == 'sheeting':
        for s in (0.15, 2.5, 4.85):
            p_ = face(s, 0, 0.12)
            box(blocks, 'l3_rust', (p_.x - 0.11, p_.y - 0.11, F), (p_.x + 0.11, p_.y + 0.11, F + ROOF))
        for z in (0.2, 2.6, 5.1, ROOF - 0.15):
            beam(blocks, 'l3_rust', face(0.1, z, 0.12), face(4.9, z, 0.12), 0.16, 0.18)
        for k in range(5):
            if random.random() < 0.2:
                continue
            s = 0.5 + k * 1.0
            m = 'l3_wall' if random.random() < 0.7 else 'l3_rust'
            obox(blocks, m, face(s, ROOF / 2, 0.05 + 0.04 * (k % 2)), (1.0 if abs(along.x) > 0.5 else 0.04, 1.0 if abs(along.y) > 0.5 else 0.04, ROOF - 0.3))
        box(blocks, 'l3_hazard', tuple(face(0.1, 0.9, 0.0)), tuple(face(4.9, 1.2, 0.2)))
    elif kind == 'machine':
        # a big tank's end, pipes along it, a control box
        R = rnd(1.5, 1.9)
        cz = rnd(2.2, 3.4)
        p = face(rnd(2.0, 3.0), cz, 0.35)
        cyl(blocks, 'l3_hull', tuple(p), R, 0.7, 16, 'X' if abs(out.x) > 0.5 else 'Y')
        cyl(blocks, 'l3_rust', tuple(p + out * 0.38), R * 0.45, 0.2, 12, 'X' if abs(out.x) > 0.5 else 'Y')
        for z in (5.6, 6.6):
            tube(blocks, 'l3_rust' if z > 6 else 'l3_hull', face(0.0, z, 0.3), face(5.0, z, 0.3), 0.22, 8)
        bx = face(rnd(0.6, 1.0), 1.2, 0.2)
        box(blocks, 'l3_dark', (bx.x - 0.35, bx.y - 0.35, bx.z - 0.5), (bx.x + 0.35, bx.y + 0.35, bx.z + 0.5))
        if random.random() < 0.5:
            ball(lamps, 'l3_alarm', tuple(bx + out * 0.3 + Vector((0, 0, 0.35))), 0.08)
        tube(blocks, 'l3_rust', face(4.4, 0.0, 0.3), face(4.4, ROOF, 0.3), 0.3, 8)
    elif kind == 'girders':
        z = 0.15
        while z < ROOF - 0.4:
            tilt = rnd(-0.25, 0.25)
            ibeam(blocks, 'l3_rust', face(-0.2 + rnd(0, 0.3), z, rnd(0.05, 0.3)), face(5.2 - rnd(0, 0.3), z + tilt, rnd(0.05, 0.3)), 0.42, 0.3)
            z += rnd(0.75, 1.15)
    elif kind == 'hull':
        # a curved module wall, plated, some plates gone to its ribs
        yaw = math.atan2(along.y, along.x)
        for k in range(5):
            for j in range(4):
                zm = ROOF * (j + 0.5) / 4
                if random.random() < 0.15:
                    continue
                tilt = math.atan(0.6 * math.pi / ROOF * math.cos(math.pi * zm / ROOF))
                obox(blocks, 'l3_hull', face(0.5 + k, zm, 0.6 * math.sin(math.pi * zm / ROOF)), (0.98, 0.06, ROOF / 4 * 1.02), yaw, 0, -tilt)
        for k in range(3):
            s = 0.8 + k * 1.7
            for j in range(3):
                za, zb = ROOF * j / 3, ROOF * (j + 1) / 3
                beam(blocks, 'l3_rust', face(s, za, 0.6 * math.sin(math.pi * za / ROOF) + 0.05), face(s, zb, 0.6 * math.sin(math.pi * zb / ROOF) + 0.05), 0.12, 0.12)


def block(c, r):
    """A wreckage block: dark mass to the decks (with its collision), dressed where it is seen."""
    kind = BLOCK_KIND[(c, r)]
    pipe = ch(c, r) == 'p'
    xa, ya = x0(c), y0(r)
    if pipe:
        # a crawl pipe runs through it north to south: the mass round it, the pipe's inside clear
        cx, pz = xa + 2.5, 1.3
        box(blocks, 'l3_dark', (xa + 0.02, ya + 0.02, F), (cx - 1.35, ya + CELL - 0.02, F + ROOF))
        box(blocks, 'l3_dark', (cx + 1.35, ya + 0.02, F), (xa + CELL - 0.02, ya + CELL - 0.02, F + ROOF))
        box(blocks, 'l3_dark', (cx - 1.35, ya + 0.02, F + 2.65), (cx + 1.35, ya + CELL - 0.02, F + ROOF))
        col_box((xa, ya, F - 0.5), (cx - 1.3, ya + CELL, F + ROOF))
        col_box((cx + 1.3, ya, F - 0.5), (xa + CELL, ya + CELL, F + ROOF))
        col_box((cx - 1.3, ya, F + 2.55), (cx + 1.3, ya + CELL, F + ROOF))
        path = [(cx, ya - 0.6, F + pz), (cx, ya + 2.5, F + pz), (cx, ya + CELL + 0.6, F + pz)]
        pb = bmesh.new()
        open_tube(pb, path, 1.15, 16, inward=True)
        po = obj_from_bm('W_Pipe', pb, 'l3_rust')
        smooth_shade(po)
        collider_copy('COL_WorksPipe', po)
        for y in (ya - 0.6, ya + CELL + 0.6):
            # a striped collar round each open end
            for k in range(16):
                a = 2 * math.pi * (k + 0.5) / 16
                obox(blocks, 'l3_hazard' if k % 2 else 'l3_dark', Vector((cx + 1.26 * math.cos(a), y, F + pz + 1.26 * math.sin(a))), (0.5, 0.3, 0.2), 0, 0, 0)
    else:
        box(blocks, 'l3_dark', (xa + 0.02, ya + 0.02, F - 0.3), (xa + CELL - 0.02, ya + CELL - 0.02, F + ROOF))
        out_ = {}
        for side, (dc, dr) in NEIGH.items():
            n = (c + dc, r + dr)
            out_[side] = (0.75 if kind == 'machine' else 0.4) if cls(*n) not in ('#', 'H') else 0.0
        col_box((xa - out_['W'], ya - out_['S'], F - 0.5), (xa + CELL + out_['E'], ya + CELL + out_['N'], F + ROOF))
    for side, (dc, dr) in NEIGH.items():
        n = (c + dc, r + dr)
        if cls(*n) in ('#',):
            continue
        if cls(*n) == 'H' or (pipe and side in 'NS'):
            continue
        dress_face(c, r, side, kind)


def wall_span(a, b, z0_, z1_, mat='l3_wall', grate=False, collide=True, thick=0.25):
    """A panel wall along the line a-b (floor points) from height z0 to z1: posts, rails and
    corrugated sheeting (or mesh, see-through, for the fences up high)."""
    a, b = Vector(a), Vector(b)
    along = (b - a)
    L = along.length
    along.normalize()
    n = Vector((-along.y, along.x, 0))
    if collide:
        lo = a - n * thick / 2 + Vector((0, 0, z0_))
        hi = b + n * thick / 2 + Vector((0, 0, z1_))
        col_box((min(lo.x, hi.x), min(lo.y, hi.y), lo.z), (max(lo.x, hi.x), max(lo.y, hi.y), hi.z))
    for s in (0.0, L / 2, L):
        post_ = a + along * s
        box(walls, 'l3_rust', tuple(post_ - Vector((0.12, 0.12, -z0_))), tuple(post_ + Vector((0.12, 0.12, z1_))))
    z = z0_
    while z <= z1_ + 0.01:
        beam(walls, 'l3_rust', a + Vector((0, 0, z)), b + Vector((0, 0, z)), 0.16, 0.18)
        z += 2.5
    if grate:
        # (the grating is drawn from both sides by the game: one sheet)
        quad(walls, 'l3_grate', a + Vector((0, 0, z0_)), b + Vector((0, 0, z0_)), b + Vector((0, 0, z1_)), a + Vector((0, 0, z1_)))
        return
    k = 0
    s = 0.0
    while s < L - 0.01:
        w = min(1.0, L - s)
        if random.random() > 0.05:
            m = mat if random.random() < 0.8 else 'l3_rust'
            c_ = a + along * (s + w / 2) + n * (0.04 if k % 2 else -0.04) + Vector((0, 0, (z0_ + z1_) / 2))
            yaw = math.atan2(along.y, along.x)
            obox(walls, m, c_, (w, 0.05, z1_ - z0_ - 0.05), yaw)
        s += 1.0
        k += 1


def bars_span(a, b, z0_, z1_):
    """A barred window between heights: sill and head walls, bars between (a solid collision)."""
    a, b = Vector(a), Vector(b)
    along = (b - a)
    L = along.length
    along.normalize()
    n = Vector((-along.y, along.x, 0))
    lo = a - n * 0.15 + Vector((0, 0, z0_))
    hi = b + n * 0.15 + Vector((0, 0, z1_))
    col_box((min(lo.x, hi.x), min(lo.y, hi.y), lo.z), (max(lo.x, hi.x), max(lo.y, hi.y), hi.z))
    sill, head = z0_ + 1.0, z0_ + 5.4
    wall_span(a, b, z0_, sill, collide=False)
    wall_span(a, b, head, z1_, collide=False)
    s = 0.25
    while s < L - 0.1:
        p = a + along * s
        tube(walls, 'l3_rust', p + Vector((0, 0, sill)), p + Vector((0, 0, head)), 0.055, 6)
        s += 0.32
    for z in (sill, head, (sill + head) / 2):
        beam(walls, 'l3_rust', a + Vector((0, 0, z)), b + Vector((0, 0, z)), 0.16, 0.16)


def doorway(a, b, kind, name, z_top):
    """A doorway in the line a-b (5 m): its frame, the wall over it, and what fills it (a shutter, a
    gate: separate objects, opened by the game)."""
    a, b = Vector(a), Vector(b)
    along = (b - a).normalized()
    n = Vector((-along.y, along.x, 0))
    mid = (a + b) / 2
    hw = 2.3
    p0, p1 = mid - along * hw, mid + along * hw
    # the frame: posts and a lintel, striped
    for p in (p0, p1):
        box(walls, 'l3_hazard', tuple(p - along * 0.35 - n * 0.3), tuple(p + along * 0.0 + n * 0.3 + Vector((0, 0, DOOR_H))))
    beam(walls, 'l3_rust', p0 + Vector((0, 0, DOOR_H + 0.25)), p1 + Vector((0, 0, DOOR_H + 0.25)), 0.6, 0.5)
    # (the frame's sides to the cell's corners, and over the door)
    for (u, v) in ((a, p0 - along * 0.35), (p1 + along * 0.35, b)):
        if (v - u).length > 0.05:
            wall_span(u, v, 0, z_top)
    wall_span(p0 - along * 0.35, p1 + along * 0.35, DOOR_H + 0.5, z_top)
    if kind == 'arch':
        return
    if kind == 'shutter':
        g = A('GATE_Shutter_' + name)
        yaw = math.atan2(along.y, along.x)
        for k in range(22):
            z = 0.15 + k * 0.28
            obox(g, 'l3_wall' if k % 2 else 'l3_rust', mid + Vector((0, 0, z)), (hw * 2 - 0.1, 0.08, 0.26), yaw)
        obox(g, 'l3_hazard', mid + Vector((0, 0, 0.1)), (hw * 2 - 0.1, 0.14, 0.2), yaw)
        box(walls, 'l3_dark', tuple(p0 - n * 0.45 + Vector((0, 0, DOOR_H - 0.1))), tuple(p1 + n * 0.45 + Vector((0, 0, DOOR_H + 0.6))))
    else:
        # a heavy gate, two leaves (the kraken tears them away)
        for side, (u, v) in (('A', (p0, mid)), ('B', (mid, p1))):
            g = A('GATE_Gate_' + name + side, origin=tuple(u if side == 'A' else v))
            yaw = math.atan2(along.y, along.x)
            c_ = (u + v) / 2
            obox(g, 'l3_rust', c_ + Vector((0, 0, DOOR_H / 2)), ((v - u).length - 0.04, 0.3, DOOR_H - 0.1), yaw)
            for z in (1.0, 3.0, 5.0):
                obox(g, 'l3_dark', c_ + n * 0.18 + Vector((0, 0, z)), ((v - u).length - 0.2, 0.08, 0.35), yaw)
            for k in range(4):
                s = (k + 0.5) / 4
                obox(g, 'l3_hazard', u.lerp(v, s) - n * 0.17 + Vector((0, 0, 0.6)), (0.4, 0.06, 0.8), yaw, 0, 0.6)


def pocket_dressing(c, r):
    """Something in the open pockets: a fallen container or a machine to dodge round, chains
    hanging out of the dark."""
    p = centre(c, r)
    if random.random() < 0.6:
        obox(debris, random.choice(PAINT), p + Vector((rnd(-1.2, 1.2), rnd(-1.2, 1.2), 1.2)), (2.4, 5.6, 2.45), rnd(0, 3.14), rnd(-0.15, 0.15))
        col_box(tuple(p + Vector((-1.4, -1.4, -0.3))), tuple(p + Vector((1.4, 1.4, 2.2))))
    for k in range(2):
        q = p + Vector((rnd(-2, 2), rnd(-2, 2), 0))
        tube(debris, 'l3_dark', q + Vector((0, 0, TALL)), q + Vector((0, 0, rnd(9, 12))), 0.05, 5)


def corridor(c, r):
    """A corridor cell: its grating deck, lamps, and things fallen in it (kept clear down the middle)."""
    xa, ya = x0(c), y0(r)
    z = F + ROOF
    # the deck: beams along the edges and across the middle, grating panels between (one or two of
    # them torn down and hanging), and its collision
    for y in (ya + 0.1, ya + 2.5, ya + CELL - 0.1):
        box(decks, 'l3_rust', (xa, y - 0.1, z - 0.4), (xa + CELL, y + 0.1, z - 0.02))
    for x in (xa + 0.1, xa + CELL - 0.1):
        box(decks, 'l3_rust', (x - 0.1, ya, z - 0.4), (x + 0.1, ya + CELL, z - 0.02))
    col_box((xa, ya, z - 0.05), (xa + CELL, ya + CELL, z + 0.4))
    torn = {random.randrange(16)} if random.random() < 0.7 else set()
    for i in range(4):
        for j in range(4):
            px, py = xa + i * 1.25, ya + j * 1.25
            if (i * 4 + j) in torn:
                # hanging from one edge
                d = 1.25
                a_ = Vector((px, py, z)); b_ = Vector((px + d, py, z))
                hang = Vector((0, 0.75, -0.95))
                quad(decks, 'l3_grate', a_, b_, b_ + hang, a_ + hang)
                continue
            quad(decks, 'l3_grate', (px, py, z - 0.02), (px + 1.25, py, z - 0.02), (px + 1.25, py + 1.25, z - 0.02), (px, py + 1.25, z - 0.02))
    # a work lamp under the deck (most of them still lit)
    if random.random() < 0.6:
        lx, ly = xa + rnd(1.2, 3.8), ya + rnd(1.2, 3.8)
        drop = rnd(0.4, 1.4)
        tube(decks, 'l3_dark', (lx, ly, z - 0.2), (lx, ly, z - drop), 0.02, 4)
        box(lamps if random.random() < 0.8 else debris, 'l3_lamp', (lx - 0.28, ly - 0.1, z - drop - 0.16), (lx + 0.28, ly + 0.1, z - drop))
    # cables hanging
    for k in range(random.randrange(3)):
        cx, cy = xa + rnd(0.5, 4.5), ya + rnd(0.5, 4.5)
        tube(debris, 'l3_dark', (cx, cy, z - 0.2), (cx + rnd(-0.6, 0.6), cy + rnd(-0.6, 0.6), z - rnd(1.5, 3.5)), 0.03, 4)
    # something fallen: crates against a wall, a pipe, a girder to get over or under
    roll = random.random()
    if roll < 0.35:
        for k in range(random.randint(1, 3)):
            s = rnd(0.7, 1.1)
            sx = xa + (rnd(0.3, 1.0) if random.random() < 0.5 else rnd(4.0, 4.7) - s)
            sy = ya + rnd(0.3, 4.7 - s)
            box(debris, random.choice(['l3_rust', 'l3_wall', 'l3_orange']), (sx, sy, F), (sx + s, sy + s, F + s * rnd(0.7, 1.0)))
            col_box((sx, sy, F), (sx + s, sy + s, F + s))
    elif roll < 0.55:
        # a girder across, high enough to swim under (or low, to go over)
        high = random.random() < 0.6
        zz = F + (rnd(2.6, 3.4) if high else rnd(0.5, 1.0))
        k_ = rnd(1, 4)
        if random.random() < 0.5:
            ibeam(debris, 'l3_rust', (xa - 0.3, ya + k_, zz), (xa + CELL + 0.3, ya + k_, zz), 0.42, 0.3)
            col_box((xa, ya + k_ - 0.18, zz - 0.22), (xa + CELL, ya + k_ + 0.18, zz + 0.22))
        else:
            ibeam(debris, 'l3_rust', (xa + k_, ya - 0.3, zz), (xa + k_, ya + CELL + 0.3, zz), 0.42, 0.3)
            col_box((xa + k_ - 0.18, ya, zz - 0.22), (xa + k_ + 0.18, ya + CELL, zz + 0.22))
    elif roll < 0.7:
        side = random.choice([0, 1])
        if random.random() < 0.5:
            x = xa + (0.9 if side else CELL - 0.9)
            tube(debris, 'l3_hull', (x, ya - 0.2, F + 0.8), (x, ya + CELL + 0.2, F + 0.8), 0.75, 12)
            col_box((x - 0.75, ya, F), (x + 0.75, ya + CELL, F + 1.55))
        else:
            y = ya + (0.9 if side else CELL - 0.9)
            tube(debris, 'l3_hull', (xa - 0.2, y, F + 0.8), (xa + CELL + 0.2, y, F + 0.8), 0.75, 12)
            col_box((xa, y - 0.75, F), (xa + CELL, y + 0.75, F + 1.55))


for (c, r), v in sorted(GRID.items()):
    if v in '#p':
        block(c, r)
    elif v in '.gw':
        corridor(c, r)
    elif v == 'O':
        pocket_dressing(c, r)

# the edges between cells: walls, windows, doorways, fences up high round the open places
done = set()
burst_spans = []
for (c, r), v in sorted(GRID.items()):
    for side in ('E', 'N'):
        dc, dr = NEIGH[side]
        nb = (c + dc, r + dr)
        if nb not in GRID:
            continue
        a_cell, b_cell = (c, r), nb
        ca, cb = cls(*a_cell), cls(*b_cell)
        if ca == '#' and cb == '#':
            continue
        p, q, _ = edge_frame(c, r, side)
        key = frozenset({a_cell, b_cell})
        top_open = open_top(*a_cell) or open_top(*b_cell)
        z_top = TALL if top_open else ROOF
        if key in OPENINGS:
            kind, name = OPENINGS[key]
            doorway(p, q, kind, name, z_top)
            continue
        if '#' in (ca, cb):
            # the block's own face below the decks; a fence above it round an open place
            if top_open:
                wall_span(p, q, ROOF, TALL, grate=True)
            continue
        if ca == cb:
            if ca == 'A' and roofed(*a_cell) != roofed(*b_cell):
                wall_span(p, q, ROOF, TALL, grate=True)
            continue
        # different parts meet: a wall, unless it is a window or a panel the kraken bursts
        corridor_cell = a_cell if ca == 'A' else b_cell if cb == 'A' else None
        other = b_cell if corridor_cell == a_cell else a_cell
        kind = ch(*corridor_cell) if corridor_cell else None
        if kind == 'g' and cls(*other) in ('H', 'C'):
            bars_span(p, q, 0, ROOF)
            wall_span(p, q, ROOF, TALL, grate=cls(*other) == 'C')
        elif kind == 'w' and cls(*other) == 'H':
            burst_spans.append((p, q))
            wall_span(p, q, DOOR_H, TALL)
        else:
            wall_span(p, q, 0, z_top)

# the panel the kraken bursts through (a separate object: the game knocks it into the corridor)
for i, (p, q) in enumerate(burst_spans):
    g = A('BURST_' + str(i), origin=tuple((p + q) / 2))
    along = (q - p).normalized()
    yaw = math.atan2(along.y, along.x)
    mid = (p + q) / 2
    obox(g, 'l3_wall', mid + Vector((0, 0, DOOR_H / 2)), ((q - p).length - 0.05, 0.25, DOOR_H), yaw)
    for z in (1.2, 3.1, 5.0):
        obox(g, 'l3_rust', mid + Vector((0, 0, z)), ((q - p).length - 0.2, 0.32, 0.25), yaw)
    empty('PT_BurstPanel_' + str(i), tuple(mid + Vector((0, 0, 2.5))))

# scaffold posts at the corridors' open corners (holding the decks)
for (c, r), v in GRID.items():
    if v not in '.gw':
        continue
    for (dx, dy) in ((0, 0), (1, 0), (0, 1), (1, 1)):
        x, y = x0(c) + dx * CELL, y0(r) + dy * CELL
        around = [ch(c + dx - 1 + i, r + dy - 1 + j) for i in (0, 1) for j in (0, 1)]
        if sum(1 for a in around if a in '.gwO') >= 3:
            box(decks, 'l3_rust', (x - 0.13, y - 0.13, F), (x + 0.13, y + 0.13, F + ROOF))

# ---------------------------------------------------------------- the dens (only the kraken goes in)
den = A('W_Den')
for (c, r), v in GRID.items():
    if v != 'h':
        continue
    p = centre(c, r)
    for k in range(5):
        a = rnd(0, 6.28)
        L = rnd(0.8, 2.0)
        q = p + Vector((rnd(-2, 2), rnd(-2, 2), 0.05))
        tube(den, 'l3_bone', q, q + Vector((L * math.cos(a), L * math.sin(a), 0.1)), rnd(0.06, 0.12), 6)
    ball(den, 'l3_rock', tuple(p + Vector((rnd(-1, 1), rnd(-1, 1), -0.3))), rnd(0.7, 1.2), 1, (1, 1, 0.6))
# a great ribcage in the yard's den, seen through the bars
rc = Vector((x0(3) + 5.0, y0(2) + 5.5, F))
for k in range(6):
    x = rc.x - 2.5 + k * 1.0
    prev = None
    for j in range(9):
        a = math.pi * j / 8
        span = 2.6 - abs(k - 2.5) * 0.3
        p = Vector((x, rc.y + span * math.cos(a), F - 0.3 + span * 0.85 * math.sin(a)))
        if prev is not None:
            tube(den, 'l3_bone', prev, p, 0.12, 6)
        prev = p
tube(den, 'l3_bone', rc + Vector((-3.2, 0, 0.0)), rc + Vector((3.4, 0, 0.1)), 0.2, 8)

# ---------------------------------------------------------------- the entry
ent = A('W_Entry')
ex = x0(0)
# the works' gate, fallen: two posts, the sign across them torn down
for y in (CY - 7.5, CY + 7.5):
    ibeam(ent, 'l3_rust', (ex + 2.0, y, F), (ex + 2.0, y, F + 9.0), 0.5, 0.4)
    col_box((ex + 1.7, y - 0.3, F), (ex + 2.3, y + 0.3, F + 9))
obox(ent, 'l3_hazard', Vector((ex + 4.0, CY + 3.0, F + 0.6)), (1.0, 9.0, 1.2), 0.35, 0.0, 0.25)
obox(ent, 'l3_dark', Vector((ex + 4.05, CY + 3.0, F + 0.7)), (0.9, 8.6, 0.8), 0.35, 0.0, 0.25)
col_box((ex + 3.0, CY - 1.5, F), (ex + 5.0, CY + 7.5, F + 1.2))
for k in range(6):
    q = Vector((ex + rnd(3, 13), CY + rnd(-11, 11), F))
    if abs(q.y - CY) < 3 and q.x < ex + 9:
        continue
    sx_, sy_, sz_ = rnd(0.8, 1.4), rnd(0.8, 1.4), rnd(0.6, 1.2)
    box(ent, random.choice(['l3_rust', 'l3_wall', 'l3_orange']), (q.x, q.y, F), (q.x + sx_, q.y + sy_, F + sz_))
    col_box((q.x, q.y, F - 0.3), (q.x + sx_, q.y + sy_, F + sz_))
# a dead floodlight on its stand, toppled
tube(ent, 'l3_rust', (ex + 11, CY - 9, F + 0.3), (ex + 14.5, CY - 7.5, F + 0.8), 0.12, 6)
obox(ent, 'l3_dark', Vector((ex + 14.8, CY - 7.3, F + 0.9)), (0.9, 0.5, 0.6), 0.4)

# ---------------------------------------------------------------- the clearing
clr = A('W_Clearing')
CC = Vector((x0(8) + 12.5, y0(3) + 17.5, F))     # its middle
# four floodlight masts at its corners (lattice, a lamp head aimed in); the south-east one falls
# (in the corners, clear of the doorways: the north-west one along the wall from the yard's shutter)
MASTS = [(x0(8) + 3.5, y0(9) + 4.2), (x0(12) + 3.8, y0(9) + 3.8), (x0(8) + 1.2, y0(3) + 1.2), (x0(12) + 3.8, y0(3) + 1.2)]


def mast(acc, base, h, head_acc):
    b = Vector(base)
    for (dx, dy) in ((-0.5, -0.5), (0.5, -0.5), (0.5, 0.5), (-0.5, 0.5)):
        ibeam(acc, 'l3_rust', b + Vector((dx, dy, 0)), b + Vector((dx * 0.6, dy * 0.6, h)), 0.16, 0.16)
    z = 0.0
    while z < h - 1:
        for (p0, p1) in (((-0.5, -0.5), (0.5, 0.5)), ((0.5, -0.5), (-0.5, 0.5))):
            f0 = 1 - 0.4 * z / h
            f1 = 1 - 0.4 * (z + 1.8) / h
            beam(acc, 'l3_rust', b + Vector((p0[0] * f0, p0[1] * f0, z)), b + Vector((p1[0] * f1, p1[1] * f1, z + 1.8)), 0.06, 0.06)
        z += 1.8
    # the head: a frame of lamps, aimed at the clearing's middle
    to = (CC - b)
    yaw = math.atan2(to.y, to.x)
    hc = b + Vector((math.cos(yaw) * 0.6, math.sin(yaw) * 0.6, h + 0.3))
    obox(acc, 'l3_dark', hc, (0.5, 2.2, 1.2), yaw, 0.35)
    for k in range(3):
        for j in range(2):
            p = hc + Vector((math.cos(yaw) * 0.27, math.sin(yaw) * 0.27, -0.25 + j * 0.5)) + Vector((-math.sin(yaw), math.cos(yaw), 0)) * (-0.7 + k * 0.7)
            obox(head_acc, 'l3_flood', p, (0.05, 0.6, 0.42), yaw, 0.35)
    return hc


floods = A('W_Flood')
flood_heads = []
for i, (mx_, my_) in enumerate(MASTS):
    if i == 3:
        g = A('FALL_Tower', origin=(mx_, my_, F))
        flood_heads.append(mast(g, (mx_, my_, F), 13.0, g))
    else:
        flood_heads.append(mast(clr, (mx_, my_, F), 13.0, floods))
        col_box((mx_ - 0.6, my_ - 0.6, F), (mx_ + 0.6, my_ + 0.6, F + 13))      # (the falling one's is the game's)
for i, hc in enumerate(flood_heads):
    empty('PT_Flood_' + str(i), tuple(hc))
# the drill: a great excavation bit lying on its side (its flights spiralling round a cone)
dc = Vector((x0(11) + 1.0, y0(6) + 1.0, F + 1.7))
cyl(clr, 'l3_hull', tuple(dc + Vector((-2.6, 0, 0))), 1.6, 2.0, 16, 'X')
cyl(clr, 'l3_rust', tuple(dc + Vector((-4.0, 0, 0))), 1.1, 1.2, 12, 'X')
for k in range(40):
    t = k / 40
    a = t * 6 * math.pi
    r_ = 1.6 * (1 - t) + 0.2
    p = dc + Vector((-1.6 + t * 6.0, r_ * math.cos(a), r_ * math.sin(a)))
    obox(clr, 'l3_rust', p, (0.25, 0.9 * (1 - t) + 0.2, 0.12), 0, 0, a)
bv = bmesh.new()
bmesh.ops.create_cone(bv, cap_ends=True, segments=16, radius1=1.5, radius2=0.12, depth=6.0)
bmesh.ops.transform(bv, matrix=Matrix.Translation(dc + Vector((1.4, 0, 0))) @ Matrix.Rotation(math.radians(90), 4, 'Y'), verts=bv.verts[:])
cone = obj_from_bm('W_DrillCone', bv, 'l3_hull')
col_box(tuple(dc + Vector((-4.6, -1.6, -1.7))), tuple(dc + Vector((1.0, 1.6, 1.6))))
col_box(tuple(dc + Vector((1.0, -1.0, -1.7))), tuple(dc + Vector((3.6, 1.0, 1.0))))
# tanks and a container to get behind
for (tx, ty, yaw) in ((x0(9) + 1.0, y0(7) + 2.0, 0.3), (x0(10) + 3.0, y0(4) + 1.0, -0.4)):
    cyl(clr, 'l3_hull', (tx, ty, F + 1.4), 1.4, 4.5, 16, 'X')
    col_box((tx - 2.3, ty - 1.4, F), (tx + 2.3, ty + 1.4, F + 2.8))
obox(clr, 'l3_orange', Vector((x0(9) + 2.0, y0(4) + 1.5, F + 1.25)), (5.8, 2.4, 2.5), 0.15)
col_box((x0(9) - 0.8, y0(4) + 0.2, F), (x0(9) + 4.8, y0(4) + 2.8, F + 2.5))
# boulders it can throw (the game picks these spots)
for k in range(8):
    a = k / 8 * 2 * math.pi + 0.2
    bx, by = CC.x + 9.5 * math.cos(a), CC.y + 13.5 * math.sin(a)
    rr = rnd(0.8, 1.2)
    ball(clr, 'l3_rock', (bx, by, F - 0.2), rr, 1, (1, 1, 0.8))
    col_box((bx - rr * 0.8, by - rr * 0.8, F - 0.5), (bx + rr * 0.8, by + rr * 0.8, F - 0.2 + rr * 0.7))
    empty('PT_LairRock_' + str(k), (bx, by, F + 0.6))
# the gantry overhead, end to end across it at 10 m (it comes down in the finale: hinged at its south end)
gx = x0(10) + 2.5
gy0, gy1 = y0(3) + 0.2, y0(10) - 0.2
g = A('FALL_Gantry', origin=(gx, gy0, F + 10.0))
for dx in (-0.9, 0.9):
    ibeam(g, 'l3_rust', (gx + dx, gy0, F + 10.0), (gx + dx, gy1, F + 10.0), 0.5, 0.25)
    ibeam(g, 'l3_rust', (gx + dx, gy0, F + 11.6), (gx + dx, gy1, F + 11.6), 0.3, 0.2)
    y = gy0
    while y < gy1 - 1:
        beam(g, 'l3_rust', (gx + dx, y, F + 10.0), (gx + dx, y + 1.6, F + 11.6), 0.08, 0.08)
        y += 1.6
quad(g, 'l3_grate', (gx - 0.9, gy0, F + 10.25), (gx + 0.9, gy0, F + 10.25), (gx + 0.9, gy1, F + 10.25), (gx - 0.9, gy1, F + 10.25))
for k in range(3):
    y = gy0 + (k + 0.5) / 3 * (gy1 - gy0)
    box(g, 'l3_lamp', (gx - 0.2, y - 0.3, F + 9.8), (gx + 0.2, y + 0.3, F + 10.0))
# the crane: a lattice jib standing at the clearing's north side, it falls across it
cb = Vector((x0(11) + 2.5, y0(9) + 3.0, F))           # (the north-east: clear of the way in)
g = A('FALL_Crane', origin=tuple(cb))
H_ = 15.0
for (dx, dy) in ((-0.6, -0.6), (0.6, -0.6), (0.6, 0.6), (-0.6, 0.6)):
    ibeam(g, 'l3_hazard', cb + Vector((dx, dy, 0)), cb + Vector((dx, dy, H_)), 0.18, 0.18)
z = 0.0
while z < H_ - 1.5:
    for (p0, p1) in (((-0.6, -0.6), (0.6, -0.6)), ((0.6, -0.6), (0.6, 0.6)), ((0.6, 0.6), (-0.6, 0.6)), ((-0.6, 0.6), (-0.6, -0.6))):
        beam(g, 'l3_rust', cb + Vector((p0[0], p0[1], z)), cb + Vector((p1[0], p1[1], z + 1.5)), 0.07, 0.07)
    z += 1.5
box(g, 'l3_dark', tuple(cb + Vector((-1.0, -1.0, H_))), tuple(cb + Vector((1.0, 1.0, H_ + 1.2))))
ball(g, 'l3_alarm', tuple(cb + Vector((0, 0, H_ + 1.4))), 0.15)
col_box(tuple(cb + Vector((-0.8, -0.8, 0))), tuple(cb + Vector((0.8, 0.8, 2.5))))
# scaffolding along its south side: three bays that topple in
for k in range(3):
    sx = x0(9) + k * 3.2
    sy = y0(3) + 0.6
    g = A('FALL_Scaff_' + str(k), origin=(sx, sy, F))
    for (dx, dy) in ((0, 0), (2.8, 0), (0, 1.2), (2.8, 1.2)):
        tube(g, 'l3_rust', (sx + dx, sy + dy, F), (sx + dx, sy + dy, F + 9.0), 0.06, 6)
    for z in (3.0, 6.0, 9.0):
        quad(g, 'l3_grate', (sx, sy, F + z), (sx + 2.8, sy, F + z), (sx + 2.8, sy + 1.2, F + z), (sx, sy + 1.2, F + z))
        beam(g, 'l3_rust', (sx, sy, F + z), (sx + 2.8, sy + 1.2, F + z - 2.8), 0.05, 0.05)
    box(g, 'l3_wall', (sx + 0.2, sy + 0.2, F + 6.05), (sx + 1.2, sy + 1.0, F + 6.9))
empty('PT_Clear', tuple(CC + Vector((0, 0, 1.2))))
empty('PT_Gantry', (gx, (gy0 + gy1) / 2, F + 10.0))

# ---------------------------------------------------------------- the east end: the shaft, the crack
xe = A('W_East')
s = SHAFT
# the collar round the shaft, and its headframe: four legs, a frame, the winding wheel
cb_ = bmesh.new()
for (r0, r1, z) in ((SHAFT_R, SHAFT_R + 2.6, F + 0.35),):
    seg = 24
    inner = [cb_.verts.new((s.x + r0 * math.cos(2 * math.pi * k / seg), s.y + r0 * math.sin(2 * math.pi * k / seg), z)) for k in range(seg)]
    outer = [cb_.verts.new((s.x + r1 * math.cos(2 * math.pi * k / seg), s.y + r1 * math.sin(2 * math.pi * k / seg), z)) for k in range(seg)]
    lowo = [cb_.verts.new((s.x + r1 * math.cos(2 * math.pi * k / seg), s.y + r1 * math.sin(2 * math.pi * k / seg), F - 0.4)) for k in range(seg)]
    cf_ = [cb_.faces.new((inner[k], outer[k], outer[(k + 1) % seg], inner[(k + 1) % seg])) for k in range(seg)]
    cf_ += [cb_.faces.new((outer[k], lowo[k], lowo[(k + 1) % seg], outer[(k + 1) % seg])) for k in range(seg)]
    cb_.normal_update()
    face_toward(cb_, cf_, lambda c: Vector((c.x - s.x, c.y - s.y, 2.0)))
collar = obj_from_bm('W_ShaftCollar', cb_, 'l3_concrete')
collider_copy('COL_WorksCollar', collar)
for (dx, dy) in ((-3, -3), (3, -3), (3, 3), (-3, 3)):
    ibeam(xe, 'l3_rust', (s.x + dx, s.y + dy, F), (s.x + dx * 0.4, s.y + dy * 0.4, F + 10), 0.3, 0.3)
    col_box((s.x + dx - 0.3, s.y + dy - 0.3, F), (s.x + dx + 0.3, s.y + dy + 0.3, F + 3))
box(xe, 'l3_rust', (s.x - 1.4, s.y - 1.4, F + 9.8), (s.x + 1.4, s.y + 1.4, F + 10.3))
cyl(xe, 'l3_dark', (s.x, s.y, F + 11.2), 1.3, 0.25, 20, 'Y')
cyl(xe, 'l3_rust', (s.x, s.y, F + 11.2), 0.25, 0.6, 8, 'Y')
tube(xe, 'l3_dark', (s.x, s.y, F + 10), (s.x, s.y, F + 0.5), 0.04, 4)
for k in range(4):
    a = k * math.pi / 2 + 0.4
    box(lamps, 'l3_lamp', (s.x + 3.2 * math.cos(a) - 0.15, s.y + 3.2 * math.sin(a) - 0.15, F + 2.6), (s.x + 3.2 * math.cos(a) + 0.15, s.y + 3.2 * math.sin(a) + 0.15, F + 2.9))
# the cover over the shaft (it opens once the kraken is beaten): two leaves
for side in (1, -1):
    g = A('GATE_ShaftCover' + ('A' if side > 0 else 'B'), origin=(s.x + side * (SHAFT_R + 0.3), s.y, F + 0.45))
    box(g, 'l3_rust', (s.x if side > 0 else s.x - SHAFT_R - 0.3, s.y - SHAFT_R - 0.3, F + 0.4), (s.x + SHAFT_R + 0.3 if side > 0 else s.x, s.y + SHAFT_R + 0.3, F + 0.6))
    box(g, 'l3_hazard', (s.x + (0.2 if side > 0 else -SHAFT_R), s.y - 0.3, F + 0.6), (s.x + (SHAFT_R if side > 0 else -0.2), s.y + 0.3, F + 0.65))
# the shaft itself: round, down 12.5 m, ladder rungs on its wall; at its foot a square chamber (its
# round wall sits on the chamber's ceiling) with a doorway in its south wall the tunnel's exact size,
# so the tunnel meets it flat, with no gaps
SHAFT_BOT = F - 12.5
CH_H = 3.7                            # the chamber's height
CH = 2.45                             # its half width
TUN_W, TUN_H = 1.8, 3.4               # the tunnel's half width and height (W_TunnelShell)
sb = bmesh.new()
segs = 18
sf = []
top_ = SHAFT_BOT + CH_H
zs = [F + 0.4, F - 3.0, F - 6.0, top_]
dirs = [(math.cos(2 * math.pi * k / segs), math.sin(2 * math.pi * k / segs)) for k in range(segs)]
rings_ = [[sb.verts.new((s.x + SHAFT_R * dx, s.y + SHAFT_R * dy, z_)) for (dx, dy) in dirs] for z_ in zs]
for i_ in range(len(rings_) - 1):
    for k in range(segs):
        sf.append(sb.faces.new((rings_[i_][k], rings_[i_][(k + 1) % segs], rings_[i_ + 1][(k + 1) % segs], rings_[i_ + 1][k])))
# the chamber's ceiling: from the round wall's foot out to the square
sq = [sb.verts.new((s.x + dx * CH / max(abs(dx), abs(dy)), s.y + dy * CH / max(abs(dx), abs(dy)), top_)) for (dx, dy) in dirs]
ceil_ = []
for k in range(segs):
    ceil_.append(sb.faces.new((rings_[-1][k], rings_[-1][(k + 1) % segs], sq[(k + 1) % segs], sq[k])))
# (the square's own corners, which the round ring's points miss)
for (cx_, cy_) in ((1, 1), (-1, 1), (-1, -1), (1, -1)):
    a_ = math.atan2(cy_, cx_)
    k0 = int(math.floor((a_ % (2 * math.pi)) / (2 * math.pi) * segs)) % segs
    corner = sb.verts.new((s.x + cx_ * CH, s.y + cy_ * CH, top_))
    ceil_.append(sb.faces.new((sq[k0], corner, sq[(k0 + 1) % segs])))


def wq(a, b, c, d):
    sf.append(sb.faces.new([sb.verts.new(Vector(v)) for v in (a, b, c, d)]))


x0_, x1_, y0_, y1_ = s.x - CH, s.x + CH, s.y - CH, s.y + CH
z0_, z1_ = SHAFT_BOT, top_
wq((x0_, y1_, z0_), (x1_, y1_, z0_), (x1_, y1_, z1_), (x0_, y1_, z1_))                 # north
wq((x1_, y0_, z0_), (x1_, y1_, z0_), (x1_, y1_, z1_), (x1_, y0_, z1_))                 # east
wq((x0_, y0_, z0_), (x0_, y1_, z0_), (x0_, y1_, z1_), (x0_, y0_, z1_))                 # west
# south, round the tunnel's doorway
wq((x0_, y0_, z0_), (s.x - TUN_W, y0_, z0_), (s.x - TUN_W, y0_, z1_), (x0_, y0_, z1_))
wq((s.x + TUN_W, y0_, z0_), (x1_, y0_, z0_), (x1_, y0_, z1_), (s.x + TUN_W, y0_, z1_))
wq((s.x - TUN_W, y0_, z0_ + TUN_H), (s.x + TUN_W, y0_, z0_ + TUN_H), (s.x + TUN_W, y0_, z1_), (s.x - TUN_W, y0_, z1_))
floor_ = sb.faces.new([sb.verts.new(Vector(v)) for v in ((x0_, y0_, z0_), (x1_, y0_, z0_), (x1_, y1_, z0_), (x0_, y1_, z0_))])
sb.normal_update()
face_toward(sb, sf, lambda c: Vector((s.x - c.x, s.y - c.y, 0.0)))
face_toward(sb, ceil_, lambda c: Vector((0, 0, -1)))
face_toward(sb, [floor_], lambda c: Vector((0, 0, 1)))
shaft = obj_from_bm('W_Shaft', sb, 'l3_concrete')
smooth_shade(shaft)
collider_copy('COL_WorksShaft', shaft)
z = F - 0.5
while z > SHAFT_BOT + 0.5:
    beam(xe, 'l3_rust', (s.x - 0.4, s.y + SHAFT_R - 0.15, z), (s.x + 0.4, s.y + SHAFT_R - 0.15, z), 0.05, 0.05)
    z -= 0.4
empty('PT_ShaftTop', (s.x, s.y, F + 1.5))
empty('PT_ShaftBottom', (s.x, s.y, SHAFT_BOT + 1.4))
empty('PT_Crack', (hx1 + 4.0, CY, F + 3.0))
empty('PT_KrakenLair', (hx1 + 4.0, CY, F + 2.0))
# crates and a work light by the shaft
for k in range(4):
    q = Vector((x0(13) + rnd(0.5, 3.5), y0(5) + rnd(0.5, 14), F))
    box(xe, random.choice(['l3_rust', 'l3_orange', 'l3_wall']), (q.x, q.y, F), (q.x + 1.1, q.y + 1.1, F + rnd(0.8, 1.1)))
    col_box((q.x, q.y, F), (q.x + 1.1, q.y + 1.1, F + 1.0))

# ---------------------------------------------------------------- the tunnel and the relay room
# from the shaft's foot south, sloping down 3 m over 16 m, half full of drifted sand; then the
# relay room, buried: 10 m square, the console and its screen on the north wall by the door
ROOM = (s.x - 5.0, s.x + 5.0, s.y - 28.0, s.y - 18.0)      # x0, x1, y0, y1
ROOM_Z = SHAFT_BOT - 3.0
ROOM_H = 4.5
tun = A('W_Tunnel')
tb = bmesh.new()
tfaces = []
TW, TH = TUN_W, TUN_H                # half width, height
y_a, y_b = s.y - CH + 0.05, ROOM[3] + 0.1     # (from the chamber's doorway)
z_a, z_b = SHAFT_BOT + 0.03, ROOM_Z          # (just over the shaft's floor where they overlap)
N_T = 8
prev = None
for k in range(N_T + 1):
    t = k / N_T
    y = y_a + (y_b - y_a) * t
    zf = z_a + (z_b - z_a) * t
    ring = [tb.verts.new((s.x - TW, y, zf)), tb.verts.new((s.x - TW, y, zf + TH * 0.75)), tb.verts.new((s.x - TW * 0.5, y, zf + TH)),
            tb.verts.new((s.x + TW * 0.5, y, zf + TH)), tb.verts.new((s.x + TW, y, zf + TH * 0.75)), tb.verts.new((s.x + TW, y, zf))]
    if prev:
        for j in range(6):
            tfaces.append(tb.faces.new((prev[j], prev[(j + 1) % 6], ring[(j + 1) % 6], ring[j])))
    prev = ring
tb.normal_update()
face_toward(tb, tfaces, lambda c: Vector((s.x - c.x, 0, (z_a + z_b) / 2 + 1.7 - c.z + (c.y - s.y) * 0.0)))
tunnel = obj_from_bm('W_TunnelShell', tb, 'l3_rock')
collider_copy('COL_WorksTunnel', tunnel)
# steel arches along it, and the drifted sand (mounds, kept low enough to swim over)
for k in range(1, N_T):
    t = k / N_T
    y = y_a + (y_b - y_a) * t
    zf = z_a + (z_b - z_a) * t
    for (pa, pb) in (((-TW + 0.1, 0), (-TW + 0.1, TH * 0.75)), ((-TW + 0.1, TH * 0.75), (-TW * 0.5, TH - 0.1)), ((-TW * 0.5, TH - 0.1), (TW * 0.5, TH - 0.1)),
                     ((TW * 0.5, TH - 0.1), (TW - 0.1, TH * 0.75)), ((TW - 0.1, TH * 0.75), (TW - 0.1, 0))):
        beam(tun, 'l3_rust', (s.x + pa[0], y, zf + pa[1]), (s.x + pb[0], y, zf + pb[1]), 0.18, 0.18)
for k in range(5):
    t = (k + 0.5) / 5
    y = y_a + (y_b - y_a) * t
    zf = z_a + (z_b - z_a) * t
    sx = s.x + rnd(-0.8, 0.8)
    rr = rnd(1.0, 1.5)
    hh = rnd(0.5, 0.8)
    ball(tun, 'l3_rock', (sx, y, zf - 0.2), rr, 1, (1.2, 1.6, hh))
    col_box((sx - rr * 0.9, y - rr * 1.2, zf - 0.5), (sx + rr * 0.9, y + rr * 1.2, zf - 0.2 + rr * hh * 0.75))
for k in range(3):
    t = (k + 0.5) / 3
    y = y_a + (y_b - y_a) * t
    zf = z_a + (z_b - z_a) * t
    box(lamps, 'l3_lamp', (s.x - 0.15, y - 0.4, zf + TH - 0.25), (s.x + 0.15, y + 0.4, zf + TH - 0.12))
for k in range(3):
    empty('PT_Tunnel_' + str(k), (s.x, y_a + (y_b - y_a) * (k + 0.5) / 3, z_a + (z_b - z_a) * (k + 0.5) / 3 + 1.4))

# the room
rx0, rx1, ry0, ry1 = ROOM
rm = A('W_Room')
rb = bmesh.new()
rfaces = []
def rq(a, b, c, d):
    rfaces.append(rb.faces.new([rb.verts.new(Vector(p)) for p in (a, b, c, d)]))
zt = ROOM_Z + ROOM_H
rq((rx0, ry0, ROOM_Z), (rx1, ry0, ROOM_Z), (rx1, ry1, ROOM_Z), (rx0, ry1, ROOM_Z))          # floor
rq((rx0, ry0, zt), (rx0, ry1, zt), (rx1, ry1, zt), (rx1, ry0, zt))                          # ceiling
rq((rx0, ry0, ROOM_Z), (rx0, ry1, ROOM_Z), (rx0, ry1, zt), (rx0, ry0, zt))                   # west
rq((rx1, ry0, ROOM_Z), (rx1, ry0, zt), (rx1, ry1, zt), (rx1, ry1, ROOM_Z))                   # east
# south: a real opening for the containment hatch, not a decal on a solid wall
hx = (rx0 + rx1) / 2 + 2.5
hx0, hx1, hz1 = hx - 1.0, hx + 1.0, ROOM_Z + 2.65
rq((rx0, ry0, ROOM_Z), (rx0, ry0, zt), (hx0, ry0, zt), (hx0, ry0, ROOM_Z))
rq((hx1, ry0, ROOM_Z), (hx1, ry0, zt), (rx1, ry0, zt), (rx1, ry0, ROOM_Z))
rq((hx0, ry0, hz1), (hx0, ry0, zt), (hx1, ry0, zt), (hx1, ry0, hz1))
# north: the doorway from the tunnel (its width and height), wall round it
dxl, dxr = s.x - TW, s.x + TW
rq((rx0, ry1, ROOM_Z), (dxl, ry1, ROOM_Z), (dxl, ry1, zt), (rx0, ry1, zt))
rq((dxr, ry1, ROOM_Z), (rx1, ry1, ROOM_Z), (rx1, ry1, zt), (dxr, ry1, zt))
rq((dxl, ry1, ROOM_Z + TH), (dxr, ry1, ROOM_Z + TH), (dxr, ry1, zt), (dxl, ry1, zt))
rb.normal_update()
rcx, rcy = (rx0 + rx1) / 2, (ry0 + ry1) / 2
face_toward(rb, rfaces, lambda c: Vector((rcx - c.x, rcy - c.y, ROOM_Z + ROOM_H / 2 - c.z)))
room = obj_from_bm('W_RoomShell', rb, 'l3_concrete')
collider_copy('COL_WorksRoom', room)
# its fittings: a dark wall band, the lamp strips, the console and its screen frame (the game draws
# the screen), the air station, the puzzle bay (striped tape), the sealed back hatch
for (a, b) in (((rx0 + 0.05, ry0), (rx0 + 0.12, ry1)), ((rx1 - 0.12, ry0), (rx1 - 0.05, ry1))):
    box(rm, 'l3_wall', (a[0], a[1], ROOM_Z + 1.4), (b[0], b[1], ROOM_Z + 3.6))
# (the south band stops at the hatch frame and continues above its opening)
for (a, b) in (((rx0 + 0.05, ry0 + 0.05), (hx0, ry0 + 0.12)), ((hx1, ry0 + 0.05), (rx1 - 0.05, ry0 + 0.12))):
    box(rm, 'l3_wall', (a[0], a[1], ROOM_Z + 1.4), (b[0], b[1], ROOM_Z + 3.6))
box(rm, 'l3_wall', (hx0, ry0 + 0.05, hz1), (hx1, ry0 + 0.12, ROOM_Z + 3.6))
for k in range(3):
    y = ry0 + 2 + k * 3
    box(lamps, 'l3_lamp', (rcx - 1.5, y - 0.12, zt - 0.12), (rcx + 1.5, y + 0.12, zt - 0.03))
cx_ = s.x + 3.0                     # the console: east of the door, against the north wall
box(rm, 'l3_dark', (cx_ - 1.4, ry1 - 0.9, ROOM_Z), (cx_ + 1.4, ry1 - 0.05, ROOM_Z + 1.0))
box(rm, 'l3_hull', (cx_ - 1.45, ry1 - 0.95, ROOM_Z + 1.0), (cx_ + 1.45, ry1 - 0.05, ROOM_Z + 1.08))
box(rm, 'l3_dark', (cx_ - 1.0, ry1 - 0.12, ROOM_Z + 1.5), (cx_ + 1.0, ry1 - 0.04, ROOM_Z + 2.6))
cyl(lamps, 'l3_screen', (cx_ + 0.9, ry1 - 0.5, ROOM_Z + 1.12), 0.08, 0.05, 10)
ROOM_PORT = Vector((cx_, ry1 - 0.92, ROOM_Z + 0.62))
box(rm, 'l3_hazard', (cx_ - 0.25, ry1 - 0.96, ROOM_Z + 0.45), (cx_ + 0.25, ry1 - 0.9, ROOM_Z + 0.8))
col_box((cx_ - 1.4, ry1 - 0.9, ROOM_Z), (cx_ + 1.4, ry1, ROOM_Z + 1.1))
air = Vector((rx0 + 0.5, rcy, ROOM_Z + 1.2))
box(rm, 'l3_dark', (rx0 + 0.05, rcy - 0.6, ROOM_Z + 0.2), (rx0 + 0.6, rcy + 0.6, ROOM_Z + 2.2))
cyl(lamps, 'l3_o2', (rx0 + 0.62, rcy, ROOM_Z + 1.4), 0.32, 0.06, 16, 'X')
for (a, b) in (((rx0 + 0.6, ry0 + 0.6), (rx0 + 4.2, ry0 + 0.7)), ((rx0 + 0.6, ry0 + 3.6), (rx0 + 4.2, ry0 + 3.7)),
               ((rx0 + 0.6, ry0 + 0.6), (rx0 + 0.7, ry0 + 3.7)), ((rx0 + 4.1, ry0 + 0.6), (rx0 + 4.2, ry0 + 3.7))):
    box(rm, 'l3_hazard', (a[0], a[1], ROOM_Z + 0.01), (b[0], b[1], ROOM_Z + 0.03))
# the hatch's frame, its moving pressure leaf, and a short sealed vestibule beyond it
for (a, b) in (((hx0 - 0.16, ry0 - 0.02, ROOM_Z), (hx0, ry0 + 0.28, hz1 + 0.16)),
               ((hx1, ry0 - 0.02, ROOM_Z), (hx1 + 0.16, ry0 + 0.28, hz1 + 0.16)),
               ((hx0 - 0.16, ry0 - 0.02, hz1), (hx1 + 0.16, ry0 + 0.28, hz1 + 0.16))):
    box(rm, 'l3_hull', a, b)
hatch = A('GATE_RelayHatch', origin=(hx, ry0 + 0.12, ROOM_Z))
box(hatch, 'l3_rust', (hx0 + 0.04, ry0 + 0.03, ROOM_Z + 0.04), (hx1 - 0.04, ry0 + 0.21, hz1 - 0.04))
box(hatch, 'l3_dark', (hx0 + 0.18, ry0 + 0.215, ROOM_Z + 0.2), (hx1 - 0.18, ry0 + 0.24, hz1 - 0.2))
box(hatch, 'l3_hazard', (hx - 0.65, ry0 + 0.245, ROOM_Z + 1.12), (hx + 0.65, ry0 + 0.265, ROOM_Z + 1.43))
# beyond is a finished pocket for the next containment stage, with collision on every side
vy0 = ry0 - 3.2
box(rm, 'l3_concrete', (hx0 - 0.12, vy0 - 0.12, ROOM_Z - 0.14), (hx1 + 0.12, ry0, ROOM_Z))
col_box((hx0 - 0.12, vy0 - 0.12, ROOM_Z - 0.14), (hx1 + 0.12, ry0, ROOM_Z))
box(rm, 'l3_concrete', (hx0 - 0.12, vy0 - 0.12, zt), (hx1 + 0.12, ry0, zt + 0.14))
col_box((hx0 - 0.12, vy0 - 0.12, zt), (hx1 + 0.12, ry0, zt + 0.14))
for (a, b) in (((hx0 - 0.12, vy0, ROOM_Z), (hx0, ry0, zt)),
               ((hx1, vy0, ROOM_Z), (hx1 + 0.12, ry0, zt)),
               ((hx0, vy0 - 0.12, ROOM_Z), (hx1, vy0, zt))):
    box(rm, 'l3_wall', a, b)
    col_box(a, b)
box(lamps, 'l3_lamp', (hx - 0.65, vy0 + 0.25, zt - 0.12), (hx + 0.65, vy0 + 0.65, zt - 0.03))
for k in range(4):
    y = ry0 + 1 + k * 2.3
    box(rm, 'l3_dark', (rx1 - 0.8, y, ROOM_Z), (rx1 - 0.05, y + 1.6, ROOM_Z + 2.2))
    box(lamps, 'l3_screen', (rx1 - 0.82, y + 0.3, ROOM_Z + 1.5), (rx1 - 0.8, y + 0.5, ROOM_Z + 1.62))
    col_box((rx1 - 0.8, y, ROOM_Z), (rx1, y + 1.6, ROOM_Z + 2.2))
empty('PT_RelayInside', (rcx, rcy, ROOM_Z + 0.1))
empty('PT_RelayPort', tuple(ROOM_PORT))
empty('PT_RelayScreen', (cx_, ry1 - 0.14, ROOM_Z + 2.05))
empty('PT_AirRefill', tuple(air))
empty('PT_PuzzleBay', (rx0 + 2.4, ry0 + 2.1, ROOM_Z + 1.3))
empty('PT_RelayHatch', (hx, ry0 + 0.3, ROOM_Z + 1.25))
empty('PT_ContainmentBeyond', (hx, vy0 + 1.5, ROOM_Z + 1.25))
empty('PT_RoomDoor', (s.x, ry1 + 0.5, ROOM_Z + 1.4))

# ---------------------------------------------------------------- the works' entrance
# in the cave's mouth: a steel portal with a row of work lamps under its lintel, striped, and two
# floodlights on stands out on the trench floor aimed in (the lights seen from the platform)
gate = A('W_Gate')
glamps = A('W_GateLamps')             # (seen from out in the canyon: drawn with the throat, not the hall)
GX = MX + 0.5
for y in (CY - 5.6, CY + 5.6):
    box(gate, 'l3_rust', (GX - 0.35, y - 0.35, F - 1.0), (GX + 0.35, y + 0.35, F + 8.6))
    box(gate, 'l3_hazard', (GX - 0.37, y - 0.37, F + 0.2), (GX + 0.37, y + 0.37, F + 1.4))
    col_box((GX - 0.35, y - 0.35, F - 1.0), (GX + 0.35, y + 0.35, F + 8.6))
box(gate, 'l3_rust', (GX - 0.45, CY - 6.0, F + 8.2), (GX + 0.45, CY + 6.0, F + 9.2))
box(gate, 'l3_hazard', (GX - 0.47, CY - 5.2, F + 8.35), (GX - 0.44, CY + 5.2, F + 9.05))
for k in range(9):
    y = CY - 4.4 + k * 1.1
    box(glamps, 'l3_lamp', (GX - 0.2, y - 0.25, F + 7.95), (GX + 0.2, y + 0.25, F + 8.2))
for y in (CY - 7.5, CY + 7.5):
    sx = MX - 7.5
    tube(gate, 'l3_rust', (sx, y, F - 4.0), (sx, y, F + 4.6), 0.12, 8)
    for (dx, dy) in ((0.9, 0), (-0.9, 0), (0, 0.9), (0, -0.9)):
        tube(gate, 'l3_rust', (sx, y, F + 1.2), (sx + dx, y + dy, F - 3.5), 0.06, 6)
    yaw = math.atan2(CY - y, GX - sx)
    hc = Vector((sx, y, F + 4.9))
    obox(gate, 'l3_dark', hc, (0.5, 1.4, 0.9), yaw, 0.3)
    obox(glamps, 'l3_lamp', hc + Vector((math.cos(yaw) * 0.27, math.sin(yaw) * 0.27, 0)), (0.05, 1.2, 0.75), yaw, 0.3)
    col_box((sx - 0.2, y - 0.2, F - 4.0), (sx + 0.2, y + 0.2, F + 4.6))
empty('PT_WorksFront', (MX - 8.0, CY, F + 1.0))

# ---------------------------------------------------------------- the air stations
def o2(name, p):
    p = Vector(p)
    tube(xe, 'l3_dark', p, p + Vector((0, 0, 2.2)), 0.16, 8)
    cyl(lamps, 'l3_o2', tuple(p + Vector((0, 0, 1.6))), 0.34, 0.12, 16)
    cyl(lamps, 'l3_o2', tuple(p + Vector((0, 0, 2.25))), 0.12, 0.1, 8)
    box(xe, 'l3_hazard', tuple(p + Vector((-0.4, -0.4, 0))), tuple(p + Vector((0.4, 0.4, 0.15))))
    empty(name, tuple(p + Vector((0, 0, 1.4))))


o2('PT_O2_0', (x0(1) + 1.2, y0(8) + 3.6, F))           # the entry
o2('PT_O2_1', (x0(5) + 2.5, y0(4) + 2.5, F))           # the yard's dead end
o2('PT_O2_2', (x0(8) + 1.0, y0(8) + 3.5, F))           # the clearing, by the yard's way in
o2('PT_O2_3', (x0(14) + 1.0, y0(7) + 3.5, F))          # by the shaft

# ---------------------------------------------------------------- the hunts' routes and their moments
# a list of cells in order; an event on a cell: creep (it passes overhead), scare (the den's
# window), arm (an arm through the deck), grab (an arm takes him through the deck), burst (out of
# its den through the wall), end (the clearing)
HUNTS = {
    1: [((1, 3), None), ((1, 2), 'creep'), ((1, 1), None), ((2, 1), None), ((3, 1), 'scare'), ((4, 1), None), ((5, 1), None),
        ((6, 1), None), ((6, 2), 'arm'), ((6, 3), None), ((6, 4), None), ((6, 5), 'grab'), ((6, 6), None), ((6, 7), None),
        ((5, 7), 'burst'), ((4, 7), None), ((4, 8), None), ((4, 9), None), ((4, 10), 'creep'), ((5, 10), None), ((6, 10), None),
        ((7, 10), None), ((7, 9), None), ((8, 9), 'end')],
}
for hunt, steps in HUNTS.items():
    for k, (cell, ev) in enumerate(steps):
        empty('PT_H%d_%02d%s' % (hunt, k, '_' + ev if ev else ''), tuple(centre(*cell, 1.8)))
# where it goes for them: its dens behind the window, the panel and the bars; the pockets
empty('PT_Den_Scare', tuple(centre(3, 2) + Vector((2.5, 2.5, 0.8))))
empty('PT_Den_Burst', tuple(centre(5, 8) + Vector((2.5, 0, 0.8))))
empty('PT_Pocket_1', tuple(centre(3, 9) + Vector((2.5, 2.5, 0.8))))
empty('PT_KrakenLurk', (X0 + 6.0, CY, F + 0.6))
empty('PT_CaveMouth', (MX - 3.0, CY, F + 3.0))
empty('PT_CaveInside', (MX + 9.0, CY, F + 3.0))
empty('PT_Respawn', (MX - 5.0, CY + 4.0, F + 2.0))
empty('PT_Entry', tuple(centre(1, 6, 2.0)))
for name, cells in (('W1', ((7, 9), (8, 9))), ('X', ((12, 6), (13, 6)))):
    a_, b_ = centre(*cells[0]), centre(*cells[1])
    empty('PT_Door_' + name, tuple((a_ + b_) / 2 + Vector((0, 0, 2.5))))
# the borrowed lights: out in the trench (under the entrance's lintel, its two floodlights, the
# entry); in the works (two floodlights); down below (the room, the tunnel, the shaft's foot, its top)
for i, p in enumerate([(GX - 1.5, CY, F + 7.4), (MX - 6.8, CY - 6.8, F + 4.4), (MX - 6.8, CY + 6.8, F + 4.4), (X0 + 6.0, CY, F + 9.0)]):
    empty('WL_Trench_' + str(i), p)
empty('WL_Works_0', tuple(flood_heads[1] + Vector((0, 0, -0.5))))
empty('WL_Works_1', tuple(flood_heads[2] + Vector((0, 0, -0.5))))
for i, p in enumerate([(rcx, rcy, zt - 0.8), (s.x, (y_a + y_b) / 2, (z_a + z_b) / 2 + 2.6), (s.x, s.y, SHAFT_BOT + 2.5), (s.x, s.y, F + 6.0)]):
    empty('WL_Relay_' + str(i), p)


def post(objs):
    for ob in objs:
        if ob.name.startswith(('W_Blocks', 'W_Walls', 'W_Decks')):
            pass


kit.finish(OUT_BLEND, OUT_GLB, post=post)
