"""
Level 3, outside the station: what Voss sees when the water lock's outer hatch opens. Matches
the opening cinematic: the research station stands against a cliff in a deep-sea canyon, with
hydrothermal vents smoking on the canyon floor far below. Level 3 is the station's lower part,
so out of the lock you are on its flank, on a small platform, with the station's lit upper
levels overhead, its machinery pod and leg below you, and the canyon falling away to the vents.

All modelled here (our own work); the rock is textured by the game (ambientCG Rock 035, mapped by
world position) and the sea itself (the skybox, fog, particles, smoke and glow) is the game's.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_l3_outside.py -- \
      Blender/l3-outside.blend public/assets/models/l3-outside.glb

Layout (metres; x east, y north, z up; the deck's coordinates, so it lines up with l3-drowned.glb):
  - the station, as in the cinematic: the bridge on top (antennas, radar domes), the atrium (a
    saucer 80 m across, its window band showing the lounge inside), the deck level (26.6 m in
    radius, where the lock is), the machinery level, and the leg down to the canyon floor; its
    east side is built into the cliff
  - the docking collar from the lock's outer hatch (x -25.2) out through the hull (x -28.6)
  - the platform outside it: x -36.4..-28.6, y 19.5..25.5, floor at 1.5 m, railed, with a
    floodlight mast
  - the canyon: the cliff behind the station (x ~20), walls north (y ~74) and south (y ~-36), the
    floor about 30 m down, deepening to the west; rock pillars far off; four vents with
    tube-worm clusters

Names the game reads: COL_ collision; TERRAIN_ rock (sediment settles on what faces up); VENT_
vent chimneys (lava glows in their cracks); SEA_LIGHT_<n> the lights out here (0 the floodlight,
1-3 over vents); PT_SeaBeacon the mast's red beacon; PT_Vent_<n> the top of each chimney (smoke),
PT_VentBase_<n> its foot (glow); PT_Platform the platform's middle, PT_Outside where the
objective marker points, PT_DiveGate the gap in the far rail, PT_CableAnchor where the cable leaves
the collar.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import bmesh
from mathutils import Vector, Matrix
import kit
from kit import A, box, beam, cyl, empty, finish, col_box

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_BLEND = argv[0] if len(argv) > 0 else None
OUT_GLB = argv[1] if len(argv) > 1 else None

random.seed(9)
kit.begin('L3Out', palette='lab')
M = kit.mat
# (the game swaps the textured ones by name, as on the deck)
M('l3_wall', (0.30, 0.31, 0.32), 0.7, 0.6)
M('l3_rust', (0.42, 0.22, 0.10), 0.85, 0.5)
M('l3_grate', (0.40, 0.25, 0.15), 0.8, 0.6)
M('l3_dark', (0.07, 0.07, 0.075), 0.6, 0.5)
M('l3_hazard', (0.70, 0.55, 0.10), 0.7, 0.2)
M('l3_hull', (0.32, 0.34, 0.36), 0.7, 0.6)          # the station's outer plating (Metal021, bigger)
M('l3_rock', (0.10, 0.13, 0.15), 0.9, 0.0)          # canyon rock (Rock035)
M('l3_vent', (0.08, 0.08, 0.08), 0.9, 0.0)          # vent chimneys: rock with glowing cracks
M('l3_lamp', (1.0, 0.85, 0.6), 0.4, 0, (1.0, 0.82, 0.55), 3.0)
M('l3_alarm', (1.0, 0.1, 0.05), 0.4, 0, (1.0, 0.08, 0.04), 2.5)
M('l3_window', (0.9, 0.7, 0.45), 0.3, 0, (1.0, 0.72, 0.42), 2.0)   # the garden level's lit windows
M('l3_porthole', (0.05, 0.12, 0.1), 0.1, 0.2, (0.05, 0.25, 0.18), 0.4)   # the flooded deck behind dark glass
M('l3_worm', (0.85, 0.82, 0.75), 0.6, 0.0)          # tube-worm tubes
M('l3_plume', (0.75, 0.08, 0.06), 0.5, 0.0, (0.6, 0.05, 0.03), 0.6)      # their red plumes
M('l3_lava', (1.0, 0.4, 0.08), 0.5, 0.0, (1.0, 0.35, 0.05), 4.0)        # the glow at the vents' feet
# the atrium's lounge, seen through its windows: warm, lit from inside (a little glow of their own)
M('l3_atrium_glass', (0.45, 0.62, 0.6), 0.05, 0.0, alpha=0.25)
M('l3_atrium_floor', (0.45, 0.3, 0.2), 0.6, 0.0, (0.5, 0.32, 0.18), 0.22)
M('l3_atrium_wall', (0.62, 0.52, 0.4), 0.7, 0.0, (0.6, 0.45, 0.3), 0.14)
M('l3_planter', (0.6, 0.58, 0.55), 0.6, 0.0, (0.5, 0.45, 0.4), 0.15)
M('l3_soil', (0.12, 0.08, 0.05), 0.95, 0.0)
M('l3_trunk', (0.3, 0.2, 0.12), 0.8, 0.0, (0.25, 0.15, 0.08), 0.15)
M('l3_leaves', (0.22, 0.42, 0.16), 0.7, 0.0, (0.18, 0.34, 0.1), 0.35)
M('l3_sofa', (0.72, 0.66, 0.56), 0.85, 0.0, (0.6, 0.52, 0.42), 0.25)
M('l3_ceiling_light', (1.0, 0.92, 0.75), 0.4, 0.0, (1.0, 0.88, 0.65), 3.0)
M('l3_sill_light', (1.0, 0.6, 0.3), 0.4, 0.0, (1.0, 0.55, 0.25), 2.0)
M('l3_bridge_window', (0.8, 0.85, 0.8), 0.2, 0.0, (0.85, 0.9, 0.8), 1.4)
M('l3_dome', (0.72, 0.74, 0.76), 0.35, 0.3)

FZ = 1.5                     # the lock's floor, and the platform's
CX, CY = -2.0, 22.5          # the station's axis
R = 26.6                     # its hull at the deck's level
HULL_X = CX - R              # where the hull is, straight out from the hatch (-28.6)

hull = A('L3_Hull')
struct = A('L3_OutStruct')   # collar, platform, mast, pipes, ribs
glow = A('L3_OutGlow')       # lamps, windows, lava
life = A('SEA_Life')         # tube worms


# ---------------------------------------------------------------- helpers
def obj_from_bm(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(kit.MATS[mat])
    ob = bpy.data.objects.new(name, me)
    kit.VIS.objects.link(ob)
    return ob


def face_toward(bm, faces, want):
    """Turn faces whose normal points away from want(face centre) (outward normals)."""
    flip = [f for f in faces if f.normal.dot(want(f.calc_center_median())) < 0]
    if flip:
        bmesh.ops.reverse_faces(bm, faces=flip)


def revolve(bm, profile, cx, cy, seg, skip=None, angle0=0.0):
    """A surface of revolution round a vertical axis at (cx, cy): profile is [(radius, z), ...]
    bottom to top. skip(centre) leaves a face out (a hole). Normals face away from the axis."""
    rings = []
    for (r, z) in profile:
        ring = []
        for k in range(seg):
            a = angle0 + 2 * math.pi * k / seg
            ring.append(bm.verts.new((cx + r * math.cos(a), cy + r * math.sin(a), z)))
        rings.append(ring)
    faces = []
    for i in range(len(rings) - 1):
        for k in range(seg):
            q = (rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k])
            c = sum((v.co for v in q), Vector()) / 4
            if skip and skip(c):
                continue
            faces.append(bm.faces.new(q))
    bm.normal_update()
    face_toward(bm, faces, lambda c: Vector((c.x - cx, c.y - cy, 0.0)) if abs(c.x - cx) + abs(c.y - cy) > 0.01 else Vector((0, 0, 1)))
    return faces


def displace(ob, scale, strength, depth=2, direction='NORMAL', seed=0):
    tex = bpy.data.textures.new(f'{ob.name}_n{seed}', 'CLOUDS')
    tex.noise_scale = scale
    tex.noise_depth = depth
    tex.noise_basis = 'ORIGINAL_PERLIN'
    mod = ob.modifiers.new(f'disp{seed}', 'DISPLACE')
    mod.texture = tex
    mod.texture_coords = 'GLOBAL'
    mod.direction = direction
    mod.strength = strength
    mod.mid_level = 0.5
    return mod


def smooth_shade(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def grid(name, origin, u, v, nu, nv, facing, mat, shape=None):
    """A terrain sheet: origin + u * i/nu + v * j/nv, facing a direction; shape(co) moves a
    vertex before the noise goes on."""
    bm = bmesh.new()
    o, u, v = Vector(origin), Vector(u), Vector(v)
    rows = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            co = o + u * (i / nu) + v * (j / nv)
            if shape:
                co = shape(co)
            row.append(bm.verts.new(co))
        rows.append(row)
    faces = []
    for j in range(nv):
        for i in range(nu):
            faces.append(bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i])))
    bm.normal_update()
    want = Vector(facing)
    face_toward(bm, faces, lambda c: want)
    ob = obj_from_bm(name, bm, mat)
    smooth_shade(ob)
    return ob


def floor_z(x, y):
    """The canyon floor: about 30 m down, deepening to the west, and a trench under the station
    (its leg stands in it). The game repeats this (SeaLife.seabed, SeaScene's worm sway)."""
    trench = 16.0 * math.exp(-((x + 2.0) ** 2 + (y - 22.5) ** 2) / (2 * 22.0 ** 2))
    return -30.0 - 0.07 * max(0.0, -40.0 - x) + 2.2 * math.sin(x * 0.05) * math.cos(y * 0.07) - trench


# ---------------------------------------------------------------- the station
# As in the opening cinematic, top to bottom:
#   - the bridge: a cabin with a lit window strip and a second tier, railings round the top deck,
#     two radar domes and two tall antennas with red lights
#   - the atrium: a wide saucer with a curved, ribbed roof and a band of tall windows held by posts
#     and angled struts; through them, the lounge (sofas round planted trees) in warm light
#   - the deck level (where the lock is): the narrower, ribbed hull under the saucer
#   - the machinery level: a narrower drum ringed with big flanged machines, lamps on them
#   - the leg: a lattice tower round a lift shaft down to the seabed, pipes coiled round its foot
# A hole is left in the deck level's hull where the collar goes through.
DOOR_Z0, DOOR_Z1 = 0.8, 4.9
SR = 40.0                     # the saucer's radius
WIN0, WIN1 = 13.5, 19.4       # its window band
CORE = 28.5                   # the lounge's inner wall (the lounge is the ring between it and the windows)
MR = 15.5                     # the machinery level's radius
TOP = 23.6                    # the saucer's flat top (the bridge stands on it)

def door_hole(c):
    return c.x < CX - 20 and abs(c.y - CY) < 2.9 and DOOR_Z0 < c.z < DOOR_Z1


def polar(r, a, z):
    return Vector((CX + r * math.cos(a), CY + r * math.sin(a), z))


def tube(acc, mat, p0, p1, r, seg=10):
    """A round pipe between two points."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    verts = bmesh.ops.create_cone(acc.bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=d.length)['verts']
    rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    bmesh.ops.transform(acc.bm, matrix=Matrix.Translation((p0 + p1) / 2) @ rot, verts=verts)
    acc.tag(mat, kit._faces(verts))


def ball(acc, mat, c, r, sub=2, scale=(1, 1, 1)):
    verts = bmesh.ops.create_icosphere(acc.bm, subdivisions=sub, radius=r)['verts']
    bmesh.ops.transform(acc.bm, matrix=Matrix.Translation(Vector(c)) @ Matrix.Diagonal((*scale, 1)), verts=verts)
    acc.tag(mat, kit._faces(verts))


def ring_sheet(name, mat, r0, r1, z, up, seg=96):
    """A flat ring (floor or ceiling), facing up or down."""
    bm = bmesh.new()
    inner = [bm.verts.new(polar(r0, 2 * math.pi * k / seg, z)) for k in range(seg)]
    outer = [bm.verts.new(polar(r1, 2 * math.pi * k / seg, z)) for k in range(seg)]
    faces = [bm.faces.new((inner[k], outer[k], outer[(k + 1) % seg], inner[(k + 1) % seg])) for k in range(seg)]
    bm.normal_update()
    face_toward(bm, faces, lambda c: Vector((0, 0, 1 if up else -1)))
    return obj_from_bm(name, bm, mat)


# the hull from the machinery level's top, up the deck level, out under the saucer to its rim
LEG_BOTTOM = floor_z(CX, CY) - 6
profile = [(MR, -12.6), (22.0, -12.0), (25.5, -11.2), (R, -10.5), (R, -6.0), (R, -1.5), (R, DOOR_Z0), (R, DOOR_Z1),
           (R, 9.2), (30.0, 10.0), (35.5, 11.0), (39.2, 11.9), (SR, 12.5), (SR, WIN0)]
bm = bmesh.new()
revolve(bm, profile, CX, CY, 120, skip=door_hole, angle0=math.pi)   # (a seam of vertices straight out from the hatch)
smooth_shade(obj_from_bm('L3_HullShell', bm, 'l3_hull'))
# the saucer's roof: a rounded rim bulging out over the windows, then a flatter top
ROOF = [(SR - 0.3, WIN1), (SR + 0.8, WIN1 + 0.5), (SR + 1.3, WIN1 + 1.4), (SR + 1.0, WIN1 + 2.3), (SR - 0.2, WIN1 + 3.0),
        (36.0, WIN1 + 3.5), (30.0, TOP - 0.1), (22.0, TOP), (0.6, TOP)]
bm = bmesh.new()
revolve(bm, ROOF, CX, CY, 120)
smooth_shade(obj_from_bm('L3_Roof', bm, 'l3_hull'))
# the machinery level below the deck level, narrowing into the leg
bm = bmesh.new()
revolve(bm, [(5.0, -22.4), (9.5, -21.0), (MR, -18.8), (MR, -12.6)], CX, CY, 64)
smooth_shade(obj_from_bm('L3_MachShell', bm, 'l3_hull'))

# ring ribs round the deck level, and vertical ribs every 12 degrees (not across the collar)
for (r0, z0, z1) in [(R, -6.25, -5.75), (R, -1.75, -1.25), (R, 6.3, 6.8), (R, 8.6, 9.2), (SR, 12.5, 13.1), (MR, -13.2, -12.6), (MR, -18.8, -18.2)]:
    bm = bmesh.new()
    revolve(bm, [(r0 + 0.25, z0), (r0 + 0.25, z1)], CX, CY, 120, skip=door_hole if r0 == R else None, angle0=math.pi)
    obj_from_bm('L3_Rib', bm, 'l3_rust')
for k in range(30):
    a = math.pi + 2 * math.pi * k / 30 + math.radians(6)
    if abs(math.sin(a - math.pi)) * R < 4.0 and math.cos(a) < 0:
        continue                       # (clear of the collar)
    p0 = polar(R + 0.15, a, 0)
    beam(struct, 'l3_rust', (p0.x, p0.y, -10.4), (p0.x, p0.y, 8.9), 0.35, 0.3)
for k in range(24):
    p0 = polar(MR + 0.12, 2 * math.pi * k / 24, 0)
    beam(struct, 'l3_rust', (p0.x, p0.y, -18.7), (p0.x, p0.y, -12.7), 0.3, 0.25)

# portholes along the deck level: the flooded rooms inside show as dark green glass
for k in range(40):
    a = math.pi + 2 * math.pi * (k + 0.5) / 40
    if abs(math.sin(a - math.pi)) * R < 5.0 and math.cos(a) < 0:
        continue
    d = Vector((math.cos(a), math.sin(a), 0))
    for zc in (2.6, -3.6):
        c = Vector((CX, CY, zc)) + d * (R + 0.02)
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        for (rad, depth, mat, off) in ((0.62, 0.18, 'l3_rust', 0.09), (0.48, 0.05, 'l3_porthole', 0.17)):
            acc = struct if mat == 'l3_rust' else glow
            verts = bmesh.ops.create_cone(acc.bm, cap_ends=True, segments=16, radius1=rad, radius2=rad, depth=depth)['verts']
            bmesh.ops.transform(acc.bm, matrix=Matrix.Translation(c + d * off) @ rot, verts=verts)
            acc.tag(mat, kit._faces(verts))

# pipes down the deck level either side of the collar
for (dy, r, mat) in ((-4.6, 0.3, 'l3_rust'), (-5.3, 0.18, 'l3_dark'), (4.8, 0.35, 'l3_rust'), (5.6, 0.14, 'l3_dark')):
    x = CX - math.sqrt(R * R - dy * dy) - r - 0.1
    cyl(struct, mat, (x, CY + dy, -0.7), r, 19.0, seg=12)
    for z in (-8.0, -3.0, 2.0, 7.0):
        box(struct, 'l3_dark', (x - r - 0.05, CY + dy - r - 0.05, z), (x + r + 0.3, CY + dy + r + 0.05, z + 0.12))

# ---- the atrium: the window band (glass, posts, angled struts), lights along its sill, roof ribs
glass = A('L3_AtriumGlass')
NB = 48                               # bays round the saucer
for k in range(NB):
    a0, a1 = 2 * math.pi * k / NB, 2 * math.pi * (k + 1) / NB
    q = [polar(SR - 0.1, a0, WIN0), polar(SR - 0.1, a1, WIN0), polar(SR - 0.1, a1, WIN1), polar(SR - 0.1, a0, WIN1)]
    f = glass.bm.faces.new([glass.bm.verts.new(v) for v in q])
    glass.tag('l3_atrium_glass', [f])
    # a post at each bay's edge, and a strut across the bay, leaning one way then the other
    p = polar(SR + 0.05, a0, 0)
    beam(struct, 'l3_dark', (p.x, p.y, WIN0), (p.x, p.y, WIN1), 0.32, 0.4)
    b0, b1 = (polar(SR + 0.02, a0, WIN0 + 0.2), polar(SR + 0.02, a1, WIN1 - 0.2)) if k % 2 else (polar(SR + 0.02, a1, WIN0 + 0.2), polar(SR + 0.02, a0, WIN1 - 0.2))
    beam(struct, 'l3_dark', tuple(b0), tuple(b1), 0.16, 0.2)
    m = polar(SR + 0.15, (a0 + a1) / 2, 12.85)
    box(glow, 'l3_sill_light', (m.x - 0.4, m.y - 0.4, 12.8), (m.x + 0.4, m.y + 0.4, 12.9))
for k in range(16):                    # lamps round the roof's edge, shining down the windows
    a = 2 * math.pi * (k + 0.5) / 16
    p = polar(SR + 0.6, a, WIN1 + 0.3)
    box(struct, 'l3_dark', (p.x - 0.35, p.y - 0.35, WIN1 + 0.15), (p.x + 0.35, p.y + 0.35, WIN1 + 0.45))
    box(glow, 'l3_lamp', (p.x - 0.25, p.y - 0.25, WIN1 + 0.07), (p.x + 0.25, p.y + 0.25, WIN1 + 0.15))
for k in range(24):                    # ribs over the roof
    a = 2 * math.pi * k / 24
    pts = [polar(r + 0.15, a, z + 0.12) for (r, z) in ROOF[1:-1]]
    for i in range(len(pts) - 1):
        beam(struct, 'l3_rust', tuple(pts[i]), tuple(pts[i + 1]), 0.28, 0.3)

# ---- the lounge inside the windows: a ring of floor, its inner wall and ceiling, and round it
# groups of sofas facing planted trees, lit warm from the ceiling
ring_sheet('L3_AtriumFloor', 'l3_atrium_floor', CORE, SR - 0.15, WIN0 + 0.02, True)
ring_sheet('L3_AtriumCeiling', 'l3_atrium_wall', CORE, SR - 0.15, WIN1 - 0.05, False)
bm = bmesh.new()
revolve(bm, [(CORE, WIN0), (CORE, WIN1)], CX, CY, 64)
obj_from_bm('L3_AtriumWall', bm, 'l3_atrium_wall')
lounge = A('L3_Lounge')
F = WIN0 + 0.02
for g in range(12):
    a = 2 * math.pi * g / 12 + 0.13
    c = polar(34.0, a, F)
    t = Vector((-math.sin(a), math.cos(a), 0))          # round the ring
    o = Vector((math.cos(a), math.sin(a), 0))           # out toward the windows
    # the planter and its tree
    cyl(lounge, 'l3_planter', (c.x, c.y, F + 0.3), 1.5, 0.6, seg=20)
    cyl(lounge, 'l3_soil', (c.x, c.y, F + 0.61), 1.35, 0.04, seg=20)
    cyl(lounge, 'l3_trunk', (c.x, c.y, F + 1.6), 0.14, 2.2, seg=8)
    for b in range(3):
        ba = b * 2.1 + g
        tube(lounge, 'l3_trunk', (c.x, c.y, F + 2.2), (c.x + 0.8 * math.cos(ba), c.y + 0.8 * math.sin(ba), F + 3.1), 0.07, 6)
    for (dx, dy, dz, r) in ((0, 0, 3.4, 1.35), (0.8, 0.3, 3.0, 1.0), (-0.7, 0.5, 3.1, 1.05), (0.1, -0.8, 3.0, 0.95)):
        ball(lounge, 'l3_leaves', (c.x + dx, c.y + dy, F + dz), r, 1, (1, 1, 0.75))
    # two sofas facing the tree from either side, a low table
    for s in (-1, 1):
        sc = c + t * (s * 3.0)
        facing = -t * s
        side = Vector((-facing.y, facing.x, 0))
        p0 = sc - side * 1.2
        p1 = sc + side * 1.2
        lo = Vector((min(p0.x, p1.x), min(p0.y, p1.y), 0))
        hi = Vector((max(p0.x, p1.x), max(p0.y, p1.y), 0))
        pad = Vector((abs(facing.x), abs(facing.y), 0)) * 0.45
        box(lounge, 'l3_sofa', (lo.x - pad.x, lo.y - pad.y, F), (hi.x + pad.x, hi.y + pad.y, F + 0.45))
        bk = sc - facing * 0.4
        lo2, hi2 = bk - side * 1.2, bk + side * 1.2
        box(lounge, 'l3_sofa', (min(lo2.x, hi2.x) - abs(facing.x) * 0.12, min(lo2.y, hi2.y) - abs(facing.y) * 0.12, F),
            (max(lo2.x, hi2.x) + abs(facing.x) * 0.12, max(lo2.y, hi2.y) + abs(facing.y) * 0.12, F + 0.95))
    tb = c + o * 2.4
    cyl(lounge, 'l3_trunk', (tb.x, tb.y, F + 0.22), 0.6, 0.06, seg=16)
    # a standing lamp, and a light panel in the ceiling over the group
    lp = c - o * 2.5 + t * 1.8
    beam(lounge, 'l3_dark', (lp.x, lp.y, F), (lp.x, lp.y, F + 1.7), 0.05, 0.05)
    cyl(glow, 'l3_window', (lp.x, lp.y, F + 1.8), 0.25, 0.35, seg=12)
    box(glow, 'l3_ceiling_light', (c.x - 1.6, c.y - 1.6, WIN1 - 0.1), (c.x + 1.6, c.y + 1.6, WIN1 - 0.06))

# ---- the bridge on top
BX0, BX1, BY0, BY1, BZ = CX - 15.0, CX + 15.0, CY - 9.5, CY + 9.5, TOP + 4.6
bridge = A('L3_Bridge')
box(bridge, 'l3_hull', (BX0, BY0, TOP), (BX1, BY1, BZ))
box(bridge, 'l3_dark', (BX0 - 0.6, BY0 - 0.6, BZ), (BX1 + 0.6, BY1 + 0.6, BZ + 0.35))
# its window strip all round (lit), and lamps over the front
for (lo, hi) in (((BX0 - 0.05, BY0 + 0.6, TOP + 2.2), (BX0, BY1 - 0.6, TOP + 3.7)), ((BX1, BY0 + 0.6, TOP + 2.2), (BX1 + 0.05, BY1 - 0.6, TOP + 3.7)),
                 ((BX0 + 0.6, BY0 - 0.05, TOP + 2.2), (BX1 - 0.6, BY0, TOP + 3.7)), ((BX0 + 0.6, BY1, TOP + 2.2), (BX1 - 0.6, BY1 + 0.05, TOP + 3.7))):
    box(glow, 'l3_bridge_window', lo, hi)
for k in range(9):
    x = BX0 + 2 + k * 3.25
    box(bridge, 'l3_dark', (x - 0.12, BY0 - 0.08, TOP + 2.2), (x + 0.12, BY0, TOP + 3.7))
    box(bridge, 'l3_dark', (x - 0.12, BY1, TOP + 2.2), (x + 0.12, BY1 + 0.08, TOP + 3.7))
for y in (BY0 + 2.5, CY - 3.0, CY + 3.0, BY1 - 2.5):
    box(bridge, 'l3_dark', (BX0 - 0.3, y - 0.3, BZ - 0.5), (BX0, y + 0.3, BZ - 0.2))
    box(glow, 'l3_lamp', (BX0 - 0.32, y - 0.2, BZ - 0.48), (BX0 - 0.3, y + 0.2, BZ - 0.3))
for (x, y) in ((BX0, BY0), (BX1, BY0), (BX1, BY1), (BX0, BY1)):
    box(glow, 'l3_lamp', (x - 0.25, y - 0.25, BZ + 0.35), (x + 0.25, y + 0.25, BZ + 0.55))
# the second tier, set back, with its own windows
T2 = (CX - 7.0, CX + 9.0, CY - 5.5, CY + 5.5)
box(bridge, 'l3_hull', (T2[0], T2[2], BZ + 0.35), (T2[1], T2[3], BZ + 2.6))
box(glow, 'l3_bridge_window', (T2[0] - 0.05, T2[2] + 0.5, BZ + 1.2), (T2[0], T2[3] - 0.5, BZ + 2.1))
box(glow, 'l3_bridge_window', (T2[0] + 0.5, T2[2] - 0.05, BZ + 1.2), (T2[1] - 0.5, T2[2], BZ + 2.1))
box(glow, 'l3_bridge_window', (T2[0] + 0.5, T2[3], BZ + 1.2), (T2[1] - 0.5, T2[3] + 0.05, BZ + 2.1))
# railings round the top deck and round the bridge's roof
def railing_ring(r, z, n):
    for k in range(n):
        p = polar(r, 2 * math.pi * k / n, z)
        box(bridge, 'l3_rust', (p.x - 0.06, p.y - 0.06, z), (p.x + 0.06, p.y + 0.06, z + 1.1))
        q = polar(r, 2 * math.pi * (k + 1) / n, z)
        beam(bridge, 'l3_rust', (p.x, p.y, z + 1.1), (q.x, q.y, z + 1.1), 0.07, 0.07)
        beam(bridge, 'l3_rust', (p.x, p.y, z + 0.55), (q.x, q.y, z + 0.55), 0.05, 0.05)
railing_ring(21.4, TOP, 64)
for (a, b) in (((BX0 - 0.5, BY0 - 0.5), (BX1 + 0.5, BY0 - 0.5)), ((BX1 + 0.5, BY0 - 0.5), (BX1 + 0.5, BY1 + 0.5)),
               ((BX1 + 0.5, BY1 + 0.5), (BX0 - 0.5, BY1 + 0.5)), ((BX0 - 0.5, BY1 + 0.5), (BX0 - 0.5, BY0 - 0.5))):
    beam(bridge, 'l3_rust', (a[0], a[1], BZ + 1.45), (b[0], b[1], BZ + 1.45), 0.07, 0.07)
    n = 6
    for i in range(n + 1):
        x, y = a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n
        box(bridge, 'l3_rust', (x - 0.05, y - 0.05, BZ + 0.35), (x + 0.05, y + 0.05, BZ + 1.45))
# radar domes, antennas with red lights, and some kit on the roof
for (dx, dy, r) in ((5.0, 3.0, 1.8), (-3.0, -3.2, 1.4)):
    cyl(bridge, 'l3_dark', (CX + dx, CY + dy, BZ + 0.9), 0.35, 1.1, seg=10)
    ball(bridge, 'l3_dome', (CX + dx, CY + dy, BZ + 1.45 + r * 0.8), r, 2)
for (dx, dy, h) in ((-11.0, 6.5, 16.0), (11.0, -6.5, 11.0)):
    x, y = CX + dx, CY + dy
    beam(bridge, 'l3_rust', (x, y, BZ + 0.35), (x, y, BZ + h), 0.2, 0.2)
    for zz in (BZ + h * 0.55, BZ + h * 0.8):
        beam(bridge, 'l3_rust', (x - 1.2, y, zz), (x + 1.2, y, zz), 0.08, 0.08)
    cyl(glow, 'l3_alarm', (x, y, BZ + h + 0.15), 0.18, 0.3, seg=10)
for (dx, dy) in ((-11.5, -6.5), (12.0, 6.5), (0.0, -8.0), (-12.5, 2.0)):
    box(bridge, 'l3_dark', (CX + dx - 0.8, CY + dy - 0.5, BZ + 0.35), (CX + dx + 0.8, CY + dy + 0.5, BZ + 1.2))

# ---- the machinery level's machines: big drums on their sides, flanged, with turbine-like ends,
# lamps over them and pipes between, mostly on the canyon side
mach = A('L3_Machines')
for (deg, zc, r, L) in ((180, -15.6, 2.7, 9.0), (150, -15.2, 2.3, 7.5), (210, -15.4, 2.5, 8.0), (120, -15.8, 2.0, 6.5),
                        (240, -15.6, 2.0, 6.5), (60, -15.5, 2.2, 7.0), (300, -15.5, 2.2, 7.0)):
    a = math.radians(deg)
    c = polar(MR + r * 0.9, a, zc)
    t = Vector((-math.sin(a), math.cos(a), 0))
    p0, p1 = c - t * (L / 2), c + t * (L / 2)
    tube(mach, 'l3_rust', tuple(p0), tuple(p1), r, 24)
    for f in (-0.42, -0.14, 0.14, 0.42):                        # flanges
        q = c + t * (L * f)
        tube(mach, 'l3_dark', tuple(q - t * 0.15), tuple(q + t * 0.15), r + 0.22, 24)
    for e in (-1, 1):                                            # the turbine-like ends: stepped rings
        base = c + t * (e * L / 2)
        for (rr, out) in ((r * 0.85, 0.25), (r * 0.6, 0.55), (r * 0.32, 0.85)):
            tube(mach, 'l3_hull' if rr > r * 0.5 else 'l3_dark', tuple(base), tuple(base + t * (e * out)), rr, 20)
    top = c + Vector((0, 0, r + 0.15))
    box(mach, 'l3_dark', (top.x - 0.35, top.y - 0.35, top.z), (top.x + 0.35, top.y + 0.35, top.z + 0.3))
    box(glow, 'l3_lamp', (top.x - 0.25, top.y - 0.25, top.z + 0.3), (top.x + 0.25, top.y + 0.25, top.z + 0.36))
    tube(mach, 'l3_dark', tuple(c + Vector((0, 0, -r * 0.6))), tuple(polar(MR - 0.2, a, zc - r * 0.6)), 0.45, 10)

# ---- the leg: a lattice tower round a lift shaft, down to the seabed; pipes coiled round its foot
LEG_Z = -22.0
FOOT = floor_z(CX, CY)
leg = A('L3_Leg')
cyl(leg, 'l3_hull', (CX, CY, (LEG_Z + FOOT) / 2), 1.9, LEG_Z - FOOT + 2, seg=16)
corners = [(CX + sx * 3.4, CY + sy * 3.4) for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
for (x, y) in corners:
    beam(leg, 'l3_rust', (x, y, LEG_Z + 0.5), (x, y, FOOT - 1.0), 0.45, 0.45)
z = LEG_Z
while z - 4.5 > FOOT:
    for i in range(4):
        (x0, y0), (x1, y1) = corners[i], corners[(i + 1) % 4]
        beam(leg, 'l3_rust', (x0, y0, z), (x1, y1, z - 4.5), 0.16, 0.16)
        beam(leg, 'l3_rust', (x1, y1, z), (x0, y0, z - 4.5), 0.16, 0.16)
        beam(leg, 'l3_rust', (x0, y0, z), (x1, y1, z), 0.2, 0.2)
    z -= 4.5
for dy in (-0.5, 0.5):                 # a ladder up the shaft on the canyon side
    beam(leg, 'l3_dark', (CX - 2.0, CY + dy, FOOT), (CX - 2.0, CY + dy, LEG_Z), 0.08, 0.08)
for k in range(int((LEG_Z - FOOT) / 0.6)):
    zz = FOOT + 0.3 + k * 0.6
    beam(leg, 'l3_dark', (CX - 2.0, CY - 0.5, zz), (CX - 2.0, CY + 0.5, zz), 0.05, 0.05)
box(leg, 'l3_dark', (CX - 6.5, CY - 6.5, FOOT - 4.0), (CX + 6.5, CY + 6.5, FOOT + 1.2))
for h in range(3):                     # three pipes coiled round the foot, like tentacles
    a0 = h * 2.1
    rr = 5.0 + h * 0.9
    prev = None
    for k in range(46):
        tt = k / 45
        a = a0 + tt * 2.6 * 2 * math.pi
        p = Vector((CX + rr * math.cos(a), CY + rr * math.sin(a), FOOT + 1.2 + tt * (7.0 + h * 2.5)))
        if prev is not None:
            tube(leg, 'l3_rust', tuple(prev), tuple(p), 0.5 - tt * 0.25, 8)
        prev = p

# ---------------------------------------------------------------- the collar and the platform
# The collar: a short square tunnel from the lock's outer hatch out through the hull, with a big
# flange where it meets the hull (covering the hole's edges)
C0, C1 = 21.0, 24.0                  # its inside, y
box(struct, 'l3_rust', (HULL_X - 0.4, C0, FZ - 0.3), (-25.2, C1, FZ), col=True)                  # floor
box(struct, 'l3_rust', (HULL_X - 0.4, C0 - 0.4, FZ - 0.3), (-25.2, C0, 4.6), col=True)           # sides
box(struct, 'l3_rust', (HULL_X - 0.4, C1, FZ - 0.3), (-25.2, C1 + 0.4, 4.6), col=True)
box(struct, 'l3_rust', (HULL_X - 0.4, C0 - 0.4, 4.6), (-25.2, C1 + 0.4, 5.0), col=True)          # roof
for (y0, y1, z0, z1) in ((CY - 3.1, C0, DOOR_Z0 - 0.3, DOOR_Z1 + 0.3), (C1, CY + 3.1, DOOR_Z0 - 0.3, DOOR_Z1 + 0.3),
                         (C0, C1, DOOR_Z0 - 0.3, FZ - 0.3), (C0, C1, 4.6, DOOR_Z1 + 0.3)):
    box(struct, 'l3_dark', (HULL_X - 0.55, y0, z0), (HULL_X + 0.35, y1, z1))
for (y0, y1) in ((C0 - 0.5, C0 - 0.38), (C1 + 0.38, C1 + 0.5)):
    box(struct, 'l3_hazard', (HULL_X - 0.6, y0, FZ), (HULL_X - 0.55, y1, 4.6))

# The platform: a grated deck on a frame, railed on three sides, braced back to the hull
PX0, PX1, PY0, PY1 = -36.4, HULL_X, 19.5, 25.5
box(struct, 'l3_grate', (PX0, PY0, FZ - 0.06), (PX1, PY1, FZ))
col_box((PX0, PY0, FZ - 0.3), (PX1, PY1, FZ))
for x in (PX0, -33.8, -31.2, PX1 - 0.15):
    box(struct, 'l3_rust', (x, PY0, FZ - 0.35), (x + 0.15, PY1, FZ - 0.06))
for y in (PY0, CY - 0.07, PY1 - 0.15):
    box(struct, 'l3_rust', (PX0, y, FZ - 0.35), (PX1, y + 0.15, FZ - 0.06))
for (y, x) in ((PY0 + 0.1, PX0 + 0.2), (PY1 - 0.1, PX0 + 0.2)):
    beam(struct, 'l3_rust', (x, y, FZ - 0.35), (HULL_X - 0.2, y, -5.5), 0.22, 0.22)
# rails: posts, a mid rail and a yellow top rail; an invisible wall stops anyone climbing over
def rail(p0, p1):
    p0, p1 = Vector(p0), Vector(p1)
    n = max(1, int((p1 - p0).length / 1.5))
    for i in range(n + 1):
        p = p0.lerp(p1, i / n)
        box(struct, 'l3_rust', (p.x - 0.05, p.y - 0.05, FZ), (p.x + 0.05, p.y + 0.05, FZ + 1.1))
    beam(struct, 'l3_rust', (p0.x, p0.y, FZ + 0.55), (p1.x, p1.y, FZ + 0.55), 0.05, 0.05)
    beam(struct, 'l3_hazard', (p0.x, p0.y, FZ + 1.1), (p1.x, p1.y, FZ + 1.1), 0.08, 0.06)
rail((PX0 + 0.1, PY0 + 0.1, 0), (PX1 - 0.3, PY0 + 0.1, 0))
rail((PX0 + 0.1, PY1 - 0.1, 0), (PX1 - 0.3, PY1 - 0.1, 0))
# the far rail has a gap, the dive gate, with striped posts and a striped edge: the way off
GATE = 1.0                           # half its width
rail((PX0 + 0.1, PY0 + 0.1, 0), (PX0 + 0.1, CY - GATE, 0))
rail((PX0 + 0.1, CY + GATE, 0), (PX0 + 0.1, PY1 - 0.1, 0))
for y in (CY - GATE, CY + GATE):
    box(struct, 'l3_hazard', (PX0 + 0.02, y - 0.08, FZ), (PX0 + 0.18, y + 0.08, FZ + 1.6))
for k in range(5):
    y0 = CY - GATE + k * 0.4
    box(struct, 'l3_hazard' if k % 2 == 0 else 'l3_dark', (PX0, y0, FZ), (PX0 + 0.5, y0 + 0.4, FZ + 0.01))
col_box((PX0 - 0.2, PY0 - 0.2, FZ), (PX1, PY0 + 0.1, FZ + 3.0))
col_box((PX0 - 0.2, PY1 - 0.1, FZ), (PX1, PY1 + 0.2, FZ + 3.0))
col_box((PX0 - 0.2, PY0 - 0.2, FZ), (PX0 + 0.1, CY - GATE, FZ + 3.0))
col_box((PX0 - 0.2, CY + GATE, FZ), (PX0 + 0.1, PY1 + 0.2, FZ + 3.0))
empty('PT_DiveGate', (PX0, CY, FZ + 1.0))
# where the uplink cable comes out of the collar onto the platform (it pays out from the reel inside)
empty('PT_CableAnchor', (HULL_X - 0.3, C1 - 0.35, FZ + 0.05))
# the floodlight mast in the far corner, a lamp on an arm, and a red beacon on top
MX, MY = PX0 + 0.45, PY1 - 0.45
beam(struct, 'l3_rust', (MX, MY, FZ), (MX, MY, FZ + 5.2), 0.18, 0.18)
beam(struct, 'l3_rust', (MX, MY, FZ + 4.6), (MX + 1.2, MY - 1.2, FZ + 4.4), 0.1, 0.1)
box(struct, 'l3_dark', (MX + 0.95, MY - 1.45, FZ + 4.1), (MX + 1.45, MY - 0.95, FZ + 4.45))
box(glow, 'l3_lamp', (MX + 1.0, MY - 1.4, FZ + 4.05), (MX + 1.4, MY - 1.0, FZ + 4.1))
cyl(glow, 'l3_alarm', (MX, MY, FZ + 5.3), 0.1, 0.18, seg=10)
empty('SEA_LIGHT_0', (MX + 1.6, MY - 1.6, FZ + 3.6))
empty('PT_SeaBeacon', (MX, MY, FZ + 5.6))
empty('PT_Platform', ((PX0 + PX1) / 2, CY, FZ + 1.0))
empty('PT_Outside', (PX0 + 1.6, CY, FZ + 1.2))

# ---------------------------------------------------------------- the canyon
# Rock sheets, each shaped by a broad noise (the lie of the cliff) and two finer ones (crags and
# grain); the noise is in world space, so neighbouring sheets agree where they meet
def crag(ob, big, mid, fine):
    displace(ob, 28.0, big, 2, seed=1)
    displace(ob, 7.0, mid, 3, seed=2)
    displace(ob, 1.8, fine, 2, seed=3)

back = grid('TERRAIN_Cliff', (19.0, -60.0, -64.0), (0, 170, 0), (0, 0, 160), 70, 52, (-1, 0, 0), 'l3_rock',
            shape=lambda co: Vector((co.x + 3.0 * math.sin(co.y * 0.05) - min(8.0, 0.24 * max(0.0, co.z - 10.0)), co.y, co.z)))
crag(back, 9.0, 3.0, 0.6)
north = grid('TERRAIN_North', (-175.0, 74.0, -60.0), (196, 0, 0), (0, 0, 150), 84, 50, (0, -1, 0), 'l3_rock',
             shape=lambda co: Vector((co.x, co.y + 6.0 * math.sin(co.x * 0.03) + 0.12 * max(0.0, co.z), co.z)))
crag(north, 10.0, 3.0, 0.6)
south = grid('TERRAIN_South', (-175.0, -36.0, -60.0), (196, 0, 0), (0, 0, 150), 84, 50, (0, 1, 0), 'l3_rock',
             shape=lambda co: Vector((co.x, co.y + 5.0 * math.sin(co.x * 0.04 + 1.0) - 0.1 * max(0.0, co.z), co.z)))
crag(south, 10.0, 3.0, 0.6)
floor = grid('TERRAIN_Floor', (-180.0, -42.0, 0.0), (205, 0, 0), (0, 122, 0), 82, 50, (0, 0, 1), 'l3_rock',
             shape=lambda co: Vector((co.x, co.y, floor_z(co.x, co.y))))
crag(floor, 4.0, 1.4, 0.35)

# rock pillars far down the canyon (silhouettes in the murk) and boulders on the floor
def rock_lump(name, c, radius, height, seg=10):
    bm = bmesh.new()
    prof = [(radius * 1.15, c[2] - 2.0), (radius * 1.05, c[2] + height * 0.15), (radius, c[2] + height * 0.35),
            (radius * 0.85, c[2] + height * 0.6), (radius * 0.6, c[2] + height * 0.85), (radius * 0.3, c[2] + height),
            (0.15, c[2] + height + radius * 0.15)]
    revolve(bm, prof, c[0], c[1], seg)
    ob = obj_from_bm(name, bm, 'l3_rock')
    displace(ob, max(1.2, radius * 0.7), radius * 0.6, 3, seed=4)
    displace(ob, max(0.6, radius * 0.3), radius * 0.18, 2, seed=14)
    return ob

for (x, y, r, h) in ((-98, 8, 6, 34), (-118, 40, 8, 46), (-140, 20, 7, 40), (-108, -12, 5, 28), (-130, 50, 6, 30)):
    rock_lump('TERRAIN_Pillar', (x, y, floor_z(x, y)), r, h, seg=12)
for i in range(26):
    x = random.uniform(-110, -10)
    y = random.uniform(-25, 50)
    if abs(x - CX) < 9 and abs(y - CY) < 9:
        continue
    r = random.uniform(1.2, 3.6)
    rock_lump('TERRAIN_Boulder', (x, y, floor_z(x, y) - 0.8), r, r * random.uniform(0.7, 1.4), seg=14)

# ---------------------------------------------------------------- the vents
# Hydrothermal chimneys: lumpy stacks of mineral, tapering, with glowing cracks (the game's
# shader) and pools of glow at their feet; giant tube worms crowd round them
VENTS = [(-44.0, 31.0, 11.0, 2.6), (-58.0, 11.0, 14.0, 3.2), (-73.0, 37.0, 9.0, 2.4), (-88.0, 17.0, 12.0, 3.0)]
for n, (vx, vy, h, r) in enumerate(VENTS):
    base = floor_z(vx, vy) - 1.0
    bm = bmesh.new()
    prof = [(r * 1.6, base - 1.0), (r * 1.3, base + 1.0), (r, base + h * 0.25), (r * 0.82, base + h * 0.5),
            (r * 0.7, base + h * 0.72), (r * 0.55, base + h * 0.9), (r * 0.62, base + h), (r * 0.35, base + h + 0.2)]
    revolve(bm, prof, vx, vy, 14)
    ob = obj_from_bm(f'VENT_{n}', bm, 'l3_vent')
    smooth_shade(ob)
    displace(ob, 1.6, 0.7, 2, seed=5 + n)
    # a smaller second chimney beside it
    ox, oy = vx + r * 1.8, vy - r * 1.2
    bm = bmesh.new()
    revolve(bm, [(r * 0.9, base - 1.0), (r * 0.6, base + h * 0.3), (r * 0.42, base + h * 0.55), (r * 0.25, base + h * 0.6)], ox, oy, 10)
    ob2 = obj_from_bm(f'VENT_{n}b', bm, 'l3_vent')
    smooth_shade(ob2)
    displace(ob2, 1.2, 0.5, 2, seed=15 + n)
    # glowing lava cracks pooled round the foot
    for k in range(9):
        a = random.uniform(0, 2 * math.pi)
        d = random.uniform(r * 1.2, r * 2.2)
        px, py = vx + d * math.cos(a), vy + d * math.sin(a)
        L = random.uniform(0.6, 1.4)
        b = a + random.uniform(0.8, 2.3)
        beam(glow, 'l3_lava', (px, py, floor_z(px, py) - 0.25),
             (px + L * math.cos(b), py + L * math.sin(b), floor_z(px, py) - 0.3), random.uniform(0.35, 0.7), 0.5)
    # tube worms: white tubes with red plumes, leaning in clumps round the base
    for k in range(34):
        a = random.uniform(0, 2 * math.pi)
        d = random.uniform(r * 1.3, r * 2.4)
        px, py = vx + d * math.cos(a), vy + d * math.sin(a)
        fz = floor_z(px, py) - 0.3
        tl = random.uniform(0.8, 2.2)
        lean = Vector((math.cos(a), math.sin(a), 0)) * random.uniform(0.05, 0.4)
        top = Vector((px, py, fz + tl)) + lean
        beam(life, 'l3_worm', (px, py, fz), tuple(top), 0.07, 0.07)
        beam(life, 'l3_plume', tuple(top), tuple(top + Vector((0, 0, 0.28)) + lean * 0.3), 0.16, 0.16)
    empty(f'PT_Vent_{n}', (vx, vy, base + h + 0.4))
    empty(f'PT_VentBase_{n}', (vx, vy, base + 1.5))
    if n < 3:
        empty(f'SEA_LIGHT_{n + 1}', (vx + r * 2.0, vy, base + 4.0))


# Many small pieces are fewer, bigger meshes for the game (fewer draw calls): the ribs, the rocks
# (boulders and pillars) and the vents are each merged into one, their noise applied first
def merge(prefixes, name, mat):
    dg = bpy.context.evaluated_depsgraph_get()
    parts = [o for o in list(kit.VIS.objects) if o.type == 'MESH' and o.name.startswith(prefixes)]
    bm = bmesh.new()
    for o in parts:
        me = o.evaluated_get(dg).to_mesh()
        me.transform(o.matrix_world)
        bm.from_mesh(me)
        o.evaluated_get(dg).to_mesh_clear()
    for o in parts:
        bpy.data.objects.remove(o, do_unlink=True)
    ob = obj_from_bm(name, bm, mat)
    return ob

merge(('L3_Rib',), 'L3_Ribs', 'l3_rust')

merge(('TERRAIN_Boulder', 'TERRAIN_Pillar'), 'TERRAIN_Rocks', 'l3_rock')
merge(('VENT_',), 'VENT_All', 'l3_vent')


def post(objs):
    for ob in objs:
        if ob.name.startswith(('L3_OutStruct', 'L3_Bridge')):
            kit.polish(ob, 0.01)


finish(OUT_BLEND, OUT_GLB, post=post)
