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
M('l3_glowmoss', (0.1, 0.5, 0.42), 0.6, 0.0, (0.15, 0.9, 0.7), 1.6)   # something growing on the cave's walls
M('l3_bone', (0.62, 0.58, 0.5), 0.7, 0.0)
M('l3_screen', (0.05, 0.2, 0.25), 0.3, 0.0, (0.25, 0.85, 1.0), 1.4)   # the relay's screens
M('l3_port', (0.9, 0.6, 0.2), 0.4, 0.3, (1.0, 0.6, 0.15), 2.0)        # the glowing rings round its sockets

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
SR = 44.0                     # the saucer's radius (at its windows)
WIN0, WIN1 = 15.6, 32.6       # its window band: tall, as in the cinematic
MR = 15.5                     # the machinery level's radius
TOP = 39.4                    # the saucer's top (the bridge stands on it)

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
           (R, 9.2), (30.0, 10.2), (38.0, 11.6), (42.6, 12.8), (SR + 0.6, 13.6), (SR + 0.6, WIN0)]   # (the dark floor band under the windows)
bm = bmesh.new()
revolve(bm, profile, CX, CY, 120, skip=door_hole, angle0=math.pi)   # (a seam of vertices straight out from the hatch)
smooth_shade(obj_from_bm('L3_HullShell', bm, 'l3_hull'))
# the saucer's roof: a thick rounded lid bulging out over the windows, then a gentle dome
ROOF = [(SR + 0.2, WIN1), (SR + 1.4, WIN1 + 0.6), (SR + 2.2, WIN1 + 1.8), (SR + 2.2, WIN1 + 3.2), (SR + 1.2, WIN1 + 4.4),
        (SR - 1.0, WIN1 + 5.2), (36.0, TOP - 0.6), (28.0, TOP - 0.15), (24.0, TOP), (0.6, TOP)]
bm = bmesh.new()
revolve(bm, ROOF, CX, CY, 120)
smooth_shade(obj_from_bm('L3_Roof', bm, 'l3_hull'))
# the machinery level below the deck level, narrowing into the leg
bm = bmesh.new()
revolve(bm, [(5.0, -22.4), (9.5, -21.0), (MR, -18.8), (MR, -12.6)], CX, CY, 64)
smooth_shade(obj_from_bm('L3_MachShell', bm, 'l3_hull'))

# ring ribs round the deck level, and vertical ribs every 12 degrees (not across the collar)
for (r0, z0, z1) in [(R, -6.25, -5.75), (R, -1.75, -1.25), (R, 6.3, 6.8), (R, 8.6, 9.2), (SR + 0.6, 13.6, 14.0), (SR + 0.6, 15.2, WIN0), (MR, -13.2, -12.6), (MR, -18.8, -18.2)]:
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
# (the glass shows the atrium inside: the game draws it there with its interior-mapping shader)
NB = 20                               # bays round the saucer
PANES = 4                             # each bay's glass in four panes, following the curve
for k in range(NB):
    a0, a1 = 2 * math.pi * k / NB, 2 * math.pi * (k + 1) / NB
    for j in range(PANES):
        b0, b1 = a0 + (a1 - a0) * j / PANES, a0 + (a1 - a0) * (j + 1) / PANES
        q = [polar(SR - 0.1, b0, WIN0), polar(SR - 0.1, b1, WIN0), polar(SR - 0.1, b1, WIN1), polar(SR - 0.1, b0, WIN1)]
        f = glass.bm.faces.new([glass.bm.verts.new(v) for v in q])
        glass.tag('l3_atrium_glass', [f])
    # a thick post at each bay's edge, and a strut across the bay, leaning one way then the other
    p = polar(SR + 0.2, a0, 0)
    beam(struct, 'l3_dark', (p.x, p.y, WIN0 - 0.2), (p.x, p.y, WIN1 + 0.2), 0.8, 1.0)
    s0, s1 = (polar(SR + 0.1, a0, WIN0 + 0.4), polar(SR + 0.1, a1, WIN1 - 0.4)) if k % 2 else (polar(SR + 0.1, a1, WIN0 + 0.4), polar(SR + 0.1, a0, WIN1 - 0.4))
    beam(struct, 'l3_dark', tuple(s0), tuple(s1), 0.4, 0.5)
    for j in range(3):                 # lights along the floor band, under the windows
        m = polar(SR + 0.65, a0 + (a1 - a0) * (j + 0.5) / 3, 14.5)
        box(glow, 'l3_sill_light', (m.x - 0.3, m.y - 0.3, 14.4), (m.x + 0.3, m.y + 0.3, 14.6))
for k in range(NB):                    # lamps under the lid's overhang, shining down the windows
    a = 2 * math.pi * (k + 0.5) / NB
    p = polar(SR + 1.5, a, WIN1 + 0.6)
    box(struct, 'l3_dark', (p.x - 0.4, p.y - 0.4, WIN1 + 0.5), (p.x + 0.4, p.y + 0.4, WIN1 + 0.85))
    box(glow, 'l3_lamp', (p.x - 0.3, p.y - 0.3, WIN1 + 0.42), (p.x + 0.3, p.y + 0.3, WIN1 + 0.5))
for k in range(32):                    # ribs over the roof
    a = 2 * math.pi * k / 24
    pts = [polar(r + 0.15, a, z + 0.12) for (r, z) in ROOF[1:-1]]
    for i in range(len(pts) - 1):
        beam(struct, 'l3_rust', tuple(pts[i]), tuple(pts[i + 1]), 0.28, 0.3)

# ---- the bridge on top
BX0, BX1, BY0, BY1, BZ = CX - 17.0, CX + 17.0, CY - 11.0, CY + 11.0, TOP + 5.5
bridge = A('L3_Bridge')
box(bridge, 'l3_hull', (BX0, BY0, TOP), (BX1, BY1, BZ))
box(bridge, 'l3_dark', (BX0 - 0.6, BY0 - 0.6, BZ), (BX1 + 0.6, BY1 + 0.6, BZ + 0.35))
# its window strip all round (lit), and lamps over the front
for (lo, hi) in (((BX0 - 0.05, BY0 + 0.6, TOP + 2.4), (BX0, BY1 - 0.6, TOP + 4.5)), ((BX1, BY0 + 0.6, TOP + 2.4), (BX1 + 0.05, BY1 - 0.6, TOP + 4.5)),
                 ((BX0 + 0.6, BY0 - 0.05, TOP + 2.4), (BX1 - 0.6, BY0, TOP + 4.5)), ((BX0 + 0.6, BY1, TOP + 2.4), (BX1 - 0.6, BY1 + 0.05, TOP + 4.5))):
    box(glow, 'l3_bridge_window', lo, hi)
for k in range(11):
    x = BX0 + 2 + k * 3.0
    box(bridge, 'l3_dark', (x - 0.15, BY0 - 0.08, TOP + 2.4), (x + 0.15, BY0, TOP + 4.5))
    box(bridge, 'l3_dark', (x - 0.15, BY1, TOP + 2.4), (x + 0.15, BY1 + 0.08, TOP + 4.5))
for y in (BY0 + 2.5, CY - 3.0, CY + 3.0, BY1 - 2.5):
    box(bridge, 'l3_dark', (BX0 - 0.3, y - 0.3, BZ - 0.5), (BX0, y + 0.3, BZ - 0.2))
    box(glow, 'l3_lamp', (BX0 - 0.32, y - 0.2, BZ - 0.48), (BX0 - 0.3, y + 0.2, BZ - 0.3))
for (x, y) in ((BX0, BY0), (BX1, BY0), (BX1, BY1), (BX0, BY1)):
    box(glow, 'l3_lamp', (x - 0.25, y - 0.25, BZ + 0.35), (x + 0.25, y + 0.25, BZ + 0.55))
# the second tier, set back, with its own windows
T2 = (CX - 9.0, CX + 11.0, CY - 6.5, CY + 6.5)
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
railing_ring(26.5, TOP, 80)
for (a, b) in (((BX0 - 0.5, BY0 - 0.5), (BX1 + 0.5, BY0 - 0.5)), ((BX1 + 0.5, BY0 - 0.5), (BX1 + 0.5, BY1 + 0.5)),
               ((BX1 + 0.5, BY1 + 0.5), (BX0 - 0.5, BY1 + 0.5)), ((BX0 - 0.5, BY1 + 0.5), (BX0 - 0.5, BY0 - 0.5))):
    beam(bridge, 'l3_rust', (a[0], a[1], BZ + 1.45), (b[0], b[1], BZ + 1.45), 0.07, 0.07)
    n = 6
    for i in range(n + 1):
        x, y = a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n
        box(bridge, 'l3_rust', (x - 0.05, y - 0.05, BZ + 0.35), (x + 0.05, y + 0.05, BZ + 1.45))
# radar domes, antennas with red lights, and some kit on the roof
for (dx, dy, r) in ((6.5, 3.5, 2.0), (-3.5, -3.8, 1.6)):
    cyl(bridge, 'l3_dark', (CX + dx, CY + dy, BZ + 0.9), 0.35, 1.1, seg=10)
    ball(bridge, 'l3_dome', (CX + dx, CY + dy, BZ + 1.45 + r * 0.8), r, 2)
for (dx, dy, h) in ((-13.0, 8.0, 18.0), (13.0, -8.0, 12.0)):
    x, y = CX + dx, CY + dy
    beam(bridge, 'l3_rust', (x, y, BZ + 0.35), (x, y, BZ + h), 0.2, 0.2)
    for zz in (BZ + h * 0.55, BZ + h * 0.8):
        beam(bridge, 'l3_rust', (x - 1.2, y, zz), (x + 1.2, y, zz), 0.08, 0.08)
    cyl(glow, 'l3_alarm', (x, y, BZ + h + 0.15), 0.18, 0.3, seg=10)
for (dx, dy) in ((-13.5, -8.0), (14.0, 8.0), (0.0, -9.5), (-14.5, 2.0)):
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
while z - 4.5 > FOOT + 6.0:             # (the bracing stops short of the floor: the way to the relay is clear)
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
# (its footing is just the four posts and the shaft: no block or coiled pipes round it, which stood
# in front of the relay station's door)
cyl(leg, 'l3_rust', (CX, CY, FOOT + 0.3), 2.6, 1.2, seg=16)

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
north = grid('TERRAIN_North', (-175.0, 82.0, -60.0), (196, 0, 0), (0, 0, 150), 84, 50, (0, -1, 0), 'l3_rock',
             shape=lambda co: Vector((co.x, co.y + 6.0 * math.sin(co.x * 0.03) + 0.12 * max(0.0, co.z), co.z)))
crag(north, 10.0, 3.0, 0.6)
south = grid('TERRAIN_South', (-175.0, -36.0, -60.0), (196, 0, 0), (0, 0, 150), 84, 50, (0, 1, 0), 'l3_rock',
             shape=lambda co: Vector((co.x, co.y + 5.0 * math.sin(co.x * 0.04 + 1.0) - 0.1 * max(0.0, co.z), co.z)))
crag(south, 10.0, 3.0, 0.6)
floor = grid('TERRAIN_Floor', (-180.0, -42.0, 0.0), (205, 0, 0), (0, 130, 0), 82, 52, (0, 0, 1), 'l3_rock',
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


# ---------------------------------------------------------------- the trench floor: the relay and the cave
# Down in the trench east of the leg, at the foot of the cliff: the uplink relay station, a squat
# flooded pod (inside: the uplink port where Voss plugs in the cable, an air refill, and a bay kept
# empty for the team's puzzles), with a door on the west, toward the station, and a hatch at the
# back. Its trunk line runs out of a socket on the back wall toward the cliff, where a cave opens:
# the kraken's lair. The game (Trench.js, Kraken.js) puts the kraken in it, its tentacles reaching
# out along the floor to the relay, and the torn trunk line in its grip.
#
# The cliff's surface is wherever its noise put it, so the cave is measured from the finished cliff:
# a hole is cut round the mouth, and the cave is one lofted rock surface through it: a lip, a
# narrow throat, a wide chamber, closing at the back.
dg = bpy.context.evaluated_depsgraph_get()

def evaluated_points(ob):
    """The object's vertices with its modifiers applied (same order as its own)."""
    me = ob.evaluated_get(dg).to_mesh()
    pts = [ob.matrix_world @ v.co for v in me.vertices]
    ob.evaluated_get(dg).to_mesh_clear()
    return pts

FLOOR_PTS = evaluated_points(floor)
FNU, FNV = 82, 52

def floor_h(x, y):
    """The seabed's height as it was built (its noise included): bilinear over the floor's grid."""
    fi = min(max((x + 180.0) / 205.0 * FNU, 0.0), FNU - 1e-3)
    fj = min(max((y + 42.0) / 130.0 * FNV, 0.0), FNV - 1e-3)
    i, j = int(fi), int(fj)
    a, b = fi - i, fj - j
    h = lambda ii, jj: FLOOR_PTS[jj * (FNU + 1) + ii].z
    return (h(i, j) * (1 - a) + h(i + 1, j) * a) * (1 - b) + (h(i, j + 1) * (1 - a) + h(i + 1, j + 1) * a) * b

# where the cliff stands at the mouth: the mean of its surface round there
cliff_base = [v.co.copy() for v in back.data.vertices]
cliff_pts = evaluated_points(back)
MX = 21.7
for _ in range(2):
    F = floor_h(MX - 4.0, CY) + 0.2
    near = [p.x for (b0, p) in zip(cliff_base, cliff_pts) if abs(b0.y - CY) < 7 and abs(b0.z - (F + 4)) < 6]
    MX = sum(near) / len(near)
F = floor_h(MX - 4.0, CY) + 0.2
print('cave mouth at x %.2f, floor %.2f' % (MX, F))

# the hole in the cliff (its noise is applied afterwards, on what is left)
bm = bmesh.new()
bm.from_mesh(back.data)
gone = [f for f in bm.faces if abs(f.calc_center_median().y - CY) < 6.0 and F - 1.0 < f.calc_center_median().z < F + 9.5]
bmesh.ops.delete(bm, geom=gone, context='FACES')
bm.to_mesh(back.data)
bm.free()

# (and the canyon floor's sheet stops at the cave's lip: inside, the cave's own floor)
bm = bmesh.new()
bm.from_mesh(floor.data)
gone = [f for f in bm.faces if f.calc_center_median().x > MX - 3.0 and abs(f.calc_center_median().y - CY) < 6.0]
bmesh.ops.delete(bm, geom=gone, context='FACES')
bm.to_mesh(floor.data)
bm.free()

# The cave: rings across x (half width, half height), floor flat at F, rock noise on the walls
# (the lair is a wide, high hall: room to fight the kraken in, to dodge and to be chased)
CAVE = [(-4, 10.5, 9.5), (-2, 8.5, 8.0), (0, 7.4, 7.0), (2, 7.0, 6.6), (4, 7.4, 6.8), (8, 12.0, 9.0), (13, 18.0, 12.0),
        (20, 22.0, 14.0), (28, 23.0, 14.5), (36, 21.0, 14.0), (43, 15.0, 11.0), (48, 8.0, 7.0), (51, 3.0, 3.0), (52, 0.3, 0.3)]

def cave_wh(dx):
    for (d0, w0, h0), (d1, w1, h1) in zip(CAVE, CAVE[1:]):
        if dx <= d1:
            t = max(0.0, (dx - d0) / (d1 - d0))
            return w0 + (w1 - w0) * t, h0 + (h1 - h0) * t
    return CAVE[-1][1], CAVE[-1][2]

def rock_noise(p, s=0.16):
    from mathutils import noise
    q = Vector((p.x * s, p.y * s, p.z * s))
    return noise.noise(q) + 0.5 * noise.noise(q * 2.3 + Vector((5, 1, 3))) + 0.25 * noise.noise(q * 5.1 + Vector((2, 7, 1)))

bm = bmesh.new()
SEG = 32
rings = []
dxs = [CAVE[0][0] + k * 1.25 for k in range(int((CAVE[-1][0] - CAVE[0][0]) / 1.25) + 1)]
for dx in dxs:
    W, H = cave_wh(dx)
    zc = F + 0.55 * H
    ring = []
    for k in range(SEG):
        a = 2 * math.pi * k / SEG
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
cave_faces = []
for i in range(len(rings) - 1):
    for k in range(SEG):
        cave_faces.append(bm.faces.new((rings[i][k], rings[i][(k + 1) % SEG], rings[i + 1][(k + 1) % SEG], rings[i + 1][k])))
cave_faces.append(bm.faces.new(rings[-1][::-1]))
bm.normal_update()
face_toward(bm, cave_faces, lambda c: Vector((0, CY - c.y, F + 0.55 * cave_wh(c.x - MX)[1] - c.z)))
cave_me = bpy.data.meshes.new('cave_tmp')
bm.to_mesh(cave_me)
# (a few glowing patches of something growing on its walls, picked from its faces)
moss_at = []
random.seed(31)
for f in random.sample(list(bm.faces), 140):
    c = f.calc_center_median()
    if c.x - MX > 6 and c.z > F + 1.5:
        moss_at.append((c, f.normal.copy()))
bm.free()
cave = bpy.data.objects.new('TERRAIN_Cave', cave_me)
cave_me.materials.append(kit.MATS['l3_rock'])
kit.VIS.objects.link(cave)
smooth_shade(cave)
glowc = A('L3_CaveGlow')
for (c, n) in moss_at[:44]:
    ball(glowc, 'l3_glowmoss', tuple(c + n * 0.15), random.uniform(0.25, 0.6), sub=1, scale=(1.0, 1.0, 0.45))
# bones on the lair's floor: a great ribcage, half sunk, and scattered pieces
bones = A('L3_Bones')
for r in range(7):
    x = MX + 30 + r * 1.6
    span = 4.2 - abs(r - 3) * 0.45
    prev = None
    for k in range(9):
        a = math.pi * k / 8
        p = Vector((x + 0.3 * math.sin(a * 2), CY - 3 + span * math.cos(a), F - 0.4 + span * 0.8 * math.sin(a)))
        if prev is not None:
            tube(bones, 'l3_bone', tuple(prev), tuple(p), 0.16 - 0.04 * abs(math.cos(a)), 6)
        prev = p
tube(bones, 'l3_bone', (MX + 29, CY - 3, F - 0.1), (MX + 41, CY - 3, F + 0.1), 0.28, 8)     # its spine
for k in range(14):
    x, y = MX + random.uniform(9, 44), CY + random.uniform(-14, 14)
    a = random.uniform(0, math.pi)
    L = random.uniform(0.6, 1.8)
    tube(bones, 'l3_bone', (x, y, F + 0.05), (x + L * math.cos(a), y + L * math.sin(a), F + 0.15), random.uniform(0.05, 0.12), 6)

# The relay station: a squat domed pod on legs, a little up off the bumpy floor
RX = MX - 11.0                      # (clear of the station's leg: its door faces it across open floor)
FR = floor_h(RX, CY)
RF = FR + 1.4                       # its floor
RR, RH = 5.0, 3.8                   # radius, height of its walls inside
DOOR_A = 0.14                       # the door and the hatch: two of its 48 faces wide (1.3 m), 2.5 m tall

def relay_hole(c):
    a = math.atan2(c.y - CY, c.x - RX)
    side = min(abs(a), abs(abs(a) - math.pi))
    return side < DOOR_A and RF < c.z < RF + 2.5

def relay_shell():
    bm = bmesh.new()
    outer = [(RR, RF - 0.6), (RR, RF), (RR, RF + 2.5), (RR, RF + RH), (RR - 0.6, RF + RH + 0.9), (RR - 2.2, RF + RH + 1.5), (0.3, RF + RH + 1.7)]
    inner = [(RR - 0.3, RF), (RR - 0.3, RF + 2.5), (RR - 0.3, RF + RH - 0.1), (RR - 0.9, RF + RH + 0.7), (RR - 2.4, RF + RH + 1.25), (0.3, RF + RH + 1.45)]
    fin = revolve(bm, outer, RX, CY, 48, skip=relay_hole)
    face_toward(bm, fin, lambda c: Vector((c.x - RX, c.y - CY, 0.3 * (c.z - RF - RH))))
    more = revolve(bm, inner, RX, CY, 48, skip=relay_hole)
    face_toward(bm, more, lambda c: Vector((RX - c.x, CY - c.y, RF + 1.0 - c.z)))
    return bm

bm = relay_shell()
relay_me = bpy.data.meshes.new('relay_tmp')
bm.to_mesh(relay_me)
bm.free()
relay = bpy.data.objects.new('L3_RelayShell', relay_me)
relay_me.materials.append(kit.MATS['l3_hull'])
kit.VIS.objects.link(relay)
rel = A('L3_Relay')
cyl(rel, 'l3_dark', (RX, CY, RF - 0.2), RR, 0.4, seg=48)                    # its floor
cyl(rel, 'l3_grate', (RX, CY, RF + 0.02), RR - 0.35, 0.04, seg=48)
cyl(rel, 'l3_hull', (RX, CY, RF + RH + 1.58), 0.5, 0.36, seg=16)                 # (closing the dome's top)
for k in range(6):                                                         # its legs, down into the silt
    a = k * math.pi / 3 + 0.5
    lx, ly = RX + 4.2 * math.cos(a), CY + 4.2 * math.sin(a)
    beam(rel, 'l3_rust', (lx, ly, RF - 0.3), (lx + 0.6 * math.cos(a), ly + 0.6 * math.sin(a), FR - 3.0), 0.35, 0.35)
# frames round the door and the hatch (they cover the wall's cut edges), and lamps over them
for sx in (-1, 1):
    x0 = RX + sx * (RR - 0.45)
    x1 = RX + sx * (RR + 0.2)
    lo, hi = min(x0, x1), max(x0, x1)
    for y in (CY - 0.78, CY + 0.66):
        box(rel, 'l3_hazard', (lo, y, RF), (hi, y + 0.12, RF + 2.62))
    box(rel, 'l3_hazard', (lo, CY - 0.78, RF + 2.5), (hi, CY + 0.78, RF + 2.72))
    box(rel, 'l3_hazard', (lo, CY - 0.78, RF - 0.05), (hi, CY + 0.78, RF + 0.05))
    box(rel, 'l3_lamp', (lo, CY - 0.22, RF + 2.78), (hi, CY + 0.22, RF + 2.88))
# portholes, dark, round the wall
for a in (0.8, 2.35, 3.95, 5.5):
    c = (RX + (RR + 0.02) * math.cos(a), CY + (RR + 0.02) * math.sin(a), RF + 2.0)
    verts = bmesh.ops.create_cone(rel.bm, cap_ends=True, segments=16, radius1=0.42, radius2=0.42, depth=0.12)['verts']
    bmesh.ops.transform(rel.bm, matrix=Matrix.Translation(Vector(c)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y'), verts=verts)
    rel.tag('l3_porthole', kit._faces(verts))
# a mast on the roof with a red light, and the conduit from the station's leg along the floor
beam(rel, 'l3_rust', (RX + 1.0, CY - 1.0, RF + RH + 1.3), (RX + 1.0, CY - 1.0, RF + RH + 5.0), 0.12, 0.12)
cyl(glow, 'l3_alarm', (RX + 1.0, CY - 1.0, RF + RH + 5.1), 0.1, 0.18, seg=10)
path = []
for k in range(13):
    t = k / 12
    x = (CX + 2.8) + (RX - RR - 0.2 - (CX + 2.8)) * t
    y = CY + 2.4
    path.append(Vector((x, y, floor_h(x, y) + 0.45)))
path[0].z = max(path[0].z, FOOT + 1.4)
path[-1].z = RF - 0.2
for p0, p1 in zip(path, path[1:]):
    tube(rel, 'l3_rust', tuple(p0), tuple(p1), 0.32, 10)
for p in path[1:-1:2]:
    box(rel, 'l3_dark', (p.x - 0.15, p.y - 0.5, floor_h(p.x, p.y) - 0.5), (p.x + 0.15, p.y + 0.5, p.z - 0.2))
# inside: the console with the uplink port (north), the air refill (south-west), the empty bay for
# the team's puzzles (south-east), lamps along the ceiling
box(rel, 'l3_dark', (RX - 1.2, CY + 3.3, RF), (RX + 1.2, CY + 4.2, RF + 1.0))
box(rel, 'l3_screen', (RX - 1.0, CY + 3.45, RF + 1.0), (RX + 1.0, CY + 4.05, RF + 1.04))
cyl(rel, 'l3_dark', (RX, CY + 3.27, RF + 0.62), 0.2, 0.08, seg=16, axis='Y')
cyl(rel, 'l3_port', (RX, CY + 3.22, RF + 0.62), 0.12, 0.05, seg=16, axis='Y')
box(rel, 'l3_screen', (RX - 0.9, CY + 4.38, RF + 1.5), (RX + 0.9, CY + 4.44, RF + 2.5))
cyl(rel, 'l3_hull', (RX - 2.6, CY - 3.5, RF + 0.8), 0.32, 1.6, seg=14)
cyl(rel, 'l3_hull', (RX - 1.9, CY - 3.9, RF + 0.8), 0.32, 1.6, seg=14)
box(rel, 'l3_screen', (RX - 2.5, CY - 3.25, RF + 1.0), (RX - 1.9, CY - 3.2, RF + 1.4))
box(rel, 'l3_rust', (RX + 0.4, CY - 4.25, RF), (RX + 2.6, CY - 3.45, RF + 0.9))
for y in (CY - 1.6, CY + 1.6):
    box(rel, 'l3_lamp', (RX - 1.6, y - 0.08, RF + RH - 0.12), (RX + 1.6, y + 0.08, RF + RH - 0.06))
# the trunk socket outside the hatch, where the line to the surface leaves the relay
box(rel, 'l3_dark', (RX + RR - 0.05, CY + 1.25, RF + 0.3), (RX + RR + 0.25, CY + 1.95, RF + 0.95))
cyl(rel, 'l3_port', (RX + RR + 0.27, CY + 1.6, RF + 0.62), 0.12, 0.05, seg=16, axis='X')
# the doors the game moves
door = A('GATE_RelayDoor')
box(door, 'l3_rust', (RX - RR - 0.12, CY - 0.66, RF), (RX - RR + 0.02, CY + 0.66, RF + 2.5))
box(door, 'l3_hazard', (RX - RR - 0.14, CY - 0.5, RF + 1.1), (RX - RR - 0.11, CY + 0.5, RF + 1.3))
hatch = A('GATE_RelayHatch')
box(hatch, 'l3_rust', (RX + RR - 0.02, CY - 0.66, RF), (RX + RR + 0.12, CY + 0.66, RF + 2.5))
box(hatch, 'l3_hazard', (RX + RR + 0.11, CY - 0.5, RF + 1.1), (RX + RR + 0.14, CY + 0.5, RF + 1.3))

# collision: the floor and the cliff as built, the cave, the relay's walls, the leg
def collider_copy(name, ob):
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    me.transform(ob.matrix_world)
    c = bpy.data.objects.new(name, me)
    kit.VIS.objects.link(c)
    return c

collider_copy('COL_Floor', floor)
collider_copy('COL_Cliff', back)
collider_copy('COL_Cave', cave)
collider_copy('COL_Relay', relay)
col_box((RX - RR, CY - RR, RF - 0.6), (RX + RR, CY + RR, RF))                 # the relay's floor
col_box((CX - 3.6, CY - 3.6, FOOT), (CX + 3.6, CY + 3.6, LEG_Z))              # the leg

empty('PT_RelayFront', (RX - RR - 3.0, CY, RF + 1.4))
empty('PT_RelayDoor', (RX - RR - 0.15, CY, RF + 1.25))
empty('PT_RelayInside', (RX, CY, RF + 0.1))
empty('PT_RelayPort', (RX, CY + 3.18, RF + 0.62))
empty('PT_RelayScreen', (RX, CY + 4.36, RF + 2.0))
empty('PT_AirRefill', (RX - 2.2, CY - 3.2, RF + 1.2))
empty('PT_PuzzleBay', (RX + 1.5, CY - 3.0, RF + 1.3))
empty('PT_RelayHatch', (RX + RR + 0.15, CY, RF + 1.25))
empty('PT_TrunkSocket', (RX + RR + 0.3, CY + 1.6, RF + 0.62))
empty('PT_CaveMouth', (MX - 3.0, CY, F + 3.0))
empty('PT_CaveInside', (MX + 9.0, CY, F + 3.0))
empty('PT_KrakenLurk', (MX + 6.5, CY, F + 0.6))
empty('PT_KrakenLair', (MX + 38.0, CY, F + 0.8))
# boulders on the lair's floor (the kraken tears them up and throws them: the game picks these spots)
for k in range(10):
    a = k / 10 * 2 * math.pi + 0.3
    bx, by = MX + 24 + 11 * math.cos(a), CY + 13 * math.sin(a)
    rock_lump('TERRAIN_Boulder', (bx, by, F - 0.4), random.uniform(0.8, 1.5), random.uniform(0.8, 1.4), seg=10)
    empty(f'PT_LairRock_{k}', (bx, by, F + 0.6))
empty('PT_Respawn', (MX - 5.0, CY + 4.0, F + 2.0))
empty('TRENCH_LIGHT_0', (RX, CY, RF + 3.2))            # in the relay
empty('TRENCH_LIGHT_1', (RX - RR - 2.0, CY, RF + 3.6)) # over its door, outside
empty('TRENCH_LIGHT_2', (MX + 24.0, CY, F + 11.0))     # in the lair
empty('TRENCH_LIGHT_3', (MX - 1.0, CY, F + 6.0))       # at the cave's mouth


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
