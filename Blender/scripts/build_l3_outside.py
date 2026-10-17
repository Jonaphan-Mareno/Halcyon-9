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
  - the station: a round hull centred on (-2, 22.5), 26.6 m in radius at the deck's level, wider
    above (the garden level, its windows lit), narrowing below to a machinery pod and a leg down
    to the canyon floor; its east side is built into the cliff
  - the docking collar from the lock's outer hatch (x -25.2) out through the hull (x -28.6)
  - the platform outside it: x -36.4..-28.6, y 19.5..25.5, floor at 1.5 m, railed, with a
    floodlight mast
  - the canyon: the cliff behind the station (x ~20), walls north (y ~58) and south (y ~-36), the
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
    """The canyon floor: about 30 m down by the station, deepening to the west."""
    return -30.0 - 0.07 * max(0.0, -40.0 - x) + 2.2 * math.sin(x * 0.05) * math.cos(y * 0.07)


# ---------------------------------------------------------------- the station
# Its hull, bottom to top: the leg, the cone under the deck, the deck level (where the lock is),
# the wider garden level with its windows, the roof. A hole is left where the collar goes through.
DOOR_Z0, DOOR_Z1 = 0.8, 4.9

def door_hole(c):
    return c.x < CX - 20 and abs(c.y - CY) < 2.9 and DOOR_Z0 < c.z < DOOR_Z1

LEG_BOTTOM = floor_z(CX, CY) - 6
profile = [(4.2, LEG_BOTTOM), (4.2, -24.0), (5.5, -23.0), (9.0, -21.5), (18.0, -16.0), (24.5, -12.0),
           (R, -10.5), (R, -6.0), (R, -1.5), (R, DOOR_Z0), (R, DOOR_Z1), (R, 9.0), (28.0, 10.5),
           (30.5, 12.2), (31.0, 13.5), (31.0, 19.0), (29.5, 20.6), (27.0, 21.8), (23.0, 23.4),
           (16.0, 25.4), (8.0, 26.8), (1.5, 27.4)]
bm = bmesh.new()
revolve(bm, profile, CX, CY, 120, skip=door_hole, angle0=math.pi)   # (a seam of vertices straight out from the hatch)
ob = obj_from_bm('L3_HullShell', bm, 'l3_hull')
smooth_shade(ob)

# ring ribs round the hull, and vertical ribs every 12 degrees (not across the collar)
for (r0, z0, z1) in [(R, -6.25, -5.75), (R, -1.75, -1.25), (R, 6.3, 6.8), (R, 8.6, 9.2), (24.8, -12.2, -11.6)]:
    bm = bmesh.new()
    revolve(bm, [(r0 + 0.25, z0), (r0 + 0.25, z1)], CX, CY, 120, skip=door_hole, angle0=math.pi)
    o = obj_from_bm('L3_Rib', bm, 'l3_rust')
for k in range(30):
    a = math.pi + 2 * math.pi * k / 30 + math.radians(6)
    if abs(math.sin(a - math.pi)) * R < 4.0 and math.cos(a) < 0:
        continue                       # (clear of the collar)
    d = Vector((math.cos(a), math.sin(a), 0))
    p0 = Vector((CX, CY, 0)) + d * (R + 0.15)
    beam(struct, 'l3_rust', (p0.x, p0.y, -10.4), (p0.x, p0.y, 8.9), 0.35, 0.3)

# portholes along the deck: the flooded rooms inside show as dark green glass
for k in range(40):
    a = math.pi + 2 * math.pi * (k + 0.5) / 40
    if abs(math.sin(a - math.pi)) * R < 5.0 and math.cos(a) < 0:
        continue
    d = Vector((math.cos(a), math.sin(a), 0))
    for zc in (2.6, -3.6):
        c = Vector((CX, CY, zc)) + d * (R + 0.02)
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        for (rad, depth, mat, off) in ((0.62, 0.18, 'l3_rust', 0.09), (0.48, 0.05, 'l3_porthole', 0.17)):
            verts = bmesh.ops.create_cone(struct.bm if mat == 'l3_rust' else glow.bm, cap_ends=True, segments=16,
                                          radius1=rad, radius2=rad, depth=depth)['verts']
            acc = struct if mat == 'l3_rust' else glow
            bmesh.ops.transform(acc.bm, matrix=Matrix.Translation(c + d * off) @ rot, verts=verts)
            acc.tag(mat, kit._faces(verts))

# the garden level's windows: a band of lit panes all round, with mullions
for k in range(48):
    a0 = 2 * math.pi * k / 48
    a1 = 2 * math.pi * (k + 0.82) / 48
    rr = 31.08
    p = [Vector((CX + rr * math.cos(a), CY + rr * math.sin(a), 0)) for a in (a0, a1)]
    verts = [glow.bm.verts.new((p[0].x, p[0].y, 14.2)), glow.bm.verts.new((p[1].x, p[1].y, 14.2)),
             glow.bm.verts.new((p[1].x, p[1].y, 18.3)), glow.bm.verts.new((p[0].x, p[0].y, 18.3))]
    f = glow.bm.faces.new(verts)
    f.normal_update()
    out = Vector((math.cos((a0 + a1) / 2), math.sin((a0 + a1) / 2), 0))
    if f.normal.dot(out) < 0:
        f.normal_flip()
    glow.tag('l3_window', [f])

# pipes down the hull either side of the collar, and a cable run
for (dy, r, mat) in ((-4.6, 0.3, 'l3_rust'), (-5.3, 0.18, 'l3_dark'), (4.8, 0.35, 'l3_rust'), (5.6, 0.14, 'l3_dark')):
    x = CX - math.sqrt(R * R - dy * dy) - r - 0.1
    cyl(struct, mat, (x, CY + dy, -0.7), r, 19.0, seg=12)
    for z in (-8.0, -3.0, 2.0, 7.0):
        box(struct, 'l3_dark', (x - r - 0.05, CY + dy - r - 0.05, z), (x + r + 0.3, CY + dy + r + 0.05, z + 0.12))

# the machinery pod under the deck, on the canyon side: a drum on its side with lamps
PODX = CX - 21.0
cyl(struct, 'l3_rust', (PODX, CY, -15.0), 2.4, 6.5, seg=24, axis='Y')
for y in (CY - 3.3, CY + 3.3):
    cyl(struct, 'l3_dark', (PODX, y, -15.0), 2.6, 0.25, seg=24, axis='Y')
box(struct, 'l3_hull', (PODX + 1.0, CY - 2.5, -14.0), (PODX + 5.0, CY + 2.5, -11.5))
for y in (CY - 1.8, CY, CY + 1.8):
    cyl(glow, 'l3_lamp', (PODX - 2.45, y, -14.6), 0.22, 0.1, seg=12, axis='X')
for k in range(6):                     # struts from the cone down round the leg
    a = 2 * math.pi * k / 6
    beam(struct, 'l3_rust', (CX + 15 * math.cos(a), CY + 15 * math.sin(a), -17.5),
         (CX + 4.6 * math.cos(a), CY + 4.6 * math.sin(a), -27.0), 0.6, 0.6)

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

back = grid('TERRAIN_Cliff', (19.0, -60.0, -48.0), (0, 170, 0), (0, 0, 98), 70, 42, (-1, 0, 0), 'l3_rock',
            shape=lambda co: Vector((co.x + 3.0 * math.sin(co.y * 0.05) - 0.06 * max(0.0, co.z - 10.0) * 4.0, co.y, co.z)))
crag(back, 9.0, 3.0, 0.6)
north = grid('TERRAIN_North', (-175.0, 58.0, -50.0), (196, 0, 0), (0, 0, 92), 84, 40, (0, -1, 0), 'l3_rock',
             shape=lambda co: Vector((co.x, co.y + 6.0 * math.sin(co.x * 0.03) + 0.12 * max(0.0, co.z), co.z)))
crag(north, 10.0, 3.0, 0.6)
south = grid('TERRAIN_South', (-175.0, -36.0, -50.0), (196, 0, 0), (0, 0, 92), 84, 40, (0, 1, 0), 'l3_rock',
             shape=lambda co: Vector((co.x, co.y + 5.0 * math.sin(co.x * 0.04 + 1.0) - 0.1 * max(0.0, co.z), co.z)))
crag(south, 10.0, 3.0, 0.6)
floor = grid('TERRAIN_Floor', (-180.0, -42.0, 0.0), (205, 0, 0), (0, 106, 0), 82, 44, (0, 0, 1), 'l3_rock',
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
        if ob.name.startswith(('L3_OutStruct',)):
            kit.polish(ob, 0.01)


finish(OUT_BLEND, OUT_GLB, post=post)
