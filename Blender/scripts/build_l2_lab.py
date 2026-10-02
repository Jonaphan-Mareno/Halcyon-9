"""
Level 2: the research lab, upstairs across the hall from the lift (its doors are in the atrium,
build_l2_atrium.py). A busy, lived-in biology lab: the electrical organism split across a row of
five tubes at the back, two cluttered work islands, one real workstation, a sink, a fume hood,
shelves, server racks, a sample fridge, a lab coat on a hook, and two organism test tubes broken
on the floor. All modelled here (our own work).

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_l2_lab.py -- \
      Blender/l2-lab.blend public/assets/models/l2-lab.glb

Same coordinates as the atrium (x east, y north, z up). The lab doorway is at y = 17.5, x -1.8..1.8,
on the gallery floor (z 5.5); the lab runs north from there.

Names the game reads: COL_ collision, ORG_<n> organism tube centres (bottom of the glass),
ORGFRAG_<n> organism pieces in the spills, PT_LabScreen_<n> workstation screens (facing east),
ARIA_Lab ARIA's monitor (facing north, into the lab), PT_Clue_<n> spots for story clues later,
PT_LabLight where the lab's one light goes.
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

kit.begin('Lab', palette='habitat')
random.seed(11)
rad = math.radians

Z = 5.5                 # lab floor (the gallery floor)
HL = Z + 4.2            # lab ceiling
X0, X1 = -7.0, 7.0      # inner faces of the side walls
Y0, Y1 = 17.65, 27.5    # inner faces of the front and back walls
DW = 1.8                # half width of the doorway

# ------------------------------------------------------------------ extra materials
kit.mat('panel_mint', (0.80, 1.0, 0.92), 0.4, 0.0, (0.75, 1.0, 0.88), 1.6)
kit.mat('panel_lilac', (0.92, 0.88, 1.0), 0.4, 0.0, (0.88, 0.82, 1.0), 1.6)
kit.mat('mint_glow', (0.35, 1.0, 0.75), 0.4, 0.0, (0.35, 1.0, 0.72), 2.2)
kit.mat('goo_glow', (0.03, 0.16, 0.13), 0.08, 0.0, (0.2, 0.9, 0.6), 1.0)   # dark teal goo, faintly glowing
kit.mat('liq_mint', (0.35, 0.95, 0.70), 0.2, 0.0, (0.25, 0.8, 0.55), 0.6)
kit.mat('liq_violet', (0.55, 0.30, 0.95), 0.2, 0.0, (0.45, 0.2, 0.85), 0.6)
kit.mat('liq_amber', (0.85, 0.45, 0.08), 0.2, 0.0)
kit.mat('liq_blue', (0.15, 0.45, 0.95), 0.2, 0.0)
kit.mat('amber_glass', (0.45, 0.20, 0.04), 0.15, 0.0)
kit.mat('paper', (0.93, 0.93, 0.90), 0.9, 0.0)
kit.mat('sticky', (0.98, 0.86, 0.25), 0.9, 0.0)
kit.mat('board', (0.45, 0.32, 0.20), 0.8, 0.0)
kit.mat('rubber', (0.04, 0.04, 0.045), 0.9, 0.0)
kit.mat('coat', (0.95, 0.95, 0.94), 0.95, 0.0)
kit.mat('screen_ui', (0.04, 0.10, 0.16), 0.3, 0.0, (0.30, 0.72, 1.0), 0.7)
kit.mat('rack_light', (0.9, 0.95, 1.0), 0.4, 0.0, (0.9, 0.95, 1.0), 1.4)
kit.mat('leaf', (0.10, 0.30, 0.10), 0.7, 0.0)
kit.MATS['leaf'].use_backface_culling = False

room = A('Lab_Room')
furn = A('Lab_Furniture')
tubes = A('Lab_Tubes')
glass = A('Lab_Glass')
clut = A('Lab_Clutter')
glow = A('Lab_Glow')


def rbox(acc, m, c, s, rz=0.0, col=False):
    """Box centred at c, size s, turned rz degrees about z."""
    for target, mm in ((acc, m),) + (((kit.CS, 'col'),) if col else ()):
        verts = bmesh.ops.create_cube(target.bm, size=1.0)['verts']
        mx = Matrix.Translation(Vector(c)) @ Matrix.Rotation(rad(rz), 4, 'Z') @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
        bmesh.ops.transform(target.bm, matrix=mx, verts=verts)
        target.tag(mm, _faces(verts))


def sphere(acc, m, c, r, seg=8):
    verts = bmesh.ops.create_uvsphere(acc.bm, u_segments=seg, v_segments=max(4, seg // 2 + 1), radius=r)['verts']
    bmesh.ops.translate(acc.bm, vec=Vector(c), verts=verts)
    acc.tag(m, _faces(verts))


def cone(acc, m, c, r0, r1, h, seg=12):
    verts = bmesh.ops.create_cone(acc.bm, cap_ends=True, cap_tris=False, segments=seg,
                                  radius1=r0, radius2=r1, depth=h)['verts']
    bmesh.ops.translate(acc.bm, vec=Vector(c), verts=verts)
    acc.tag(m, _faces(verts))


# ------------------------------------------------------------------ the room shell
box(room, 'floor_dark', (X0 - 0.3, 17.35, Z - 0.3), (X1 + 0.3, Y1 + 0.3, Z), col=True)
box(room, 'hull_light', (X0 - 0.3, 17.35, HL), (X1 + 0.3, Y1 + 0.3, HL + 0.3), col=True)
box(room, 'hull_light', (X0 - 0.3, Y1, Z), (X1 + 0.3, Y1 + 0.3, HL), col=True)
box(room, 'hull_light', (X0 - 0.3, 17.35, Z), (X0, Y1, HL), col=True)
box(room, 'hull_light', (X1, 17.35, Z), (X1 + 0.3, Y1, HL), col=True)
box(room, 'hull_light', (X0, 17.35, Z), (-DW, Y0, HL), col=True)              # front wall, left of the door
box(room, 'hull_light', (DW, 17.35, Z), (X1, Y0, HL), col=True)               # and right of it
box(room, 'hull_light', (-DW, 17.35, Z + 3.4), (DW, Y0, HL), col=True)        # over the door
# skirting, panel seams and a light blue LED line round the walls
for (x0, y0, x1, y1) in ((X0, Y1 - 0.06, X1, Y1), (X0, Y0, X0 + 0.06, Y1), (X1 - 0.06, Y0, X1, Y1),
                         (X0, Y0, -DW, Y0 + 0.06), (DW, Y0, X1, Y0 + 0.06)):
    box(room, 'hull_mid', (x0, y0, Z), (x1, y1, Z + 0.25))
    box(room, 'blue_glow', (x0, y0, Z + 3.2), (x1, y1, Z + 3.26))
for x in [X0 + 1.75 * k for k in range(1, 8)]:
    box(room, 'hull_mid', (x - 0.04, Y1 - 0.05, Z), (x + 0.04, Y1, HL))
for y in [Y0 + 1.6 * k for k in range(1, 7)]:
    box(room, 'hull_mid', (X0, y - 0.04, Z), (X0 + 0.05, y + 0.04, HL))
    box(room, 'hull_mid', (X1 - 0.05, y - 0.04, Z), (X1, y + 0.04, HL))
# soft mint and lilac ceiling panels in recessed frames, as in the reference
for i, x in enumerate((-4.2, 0.0, 4.2)):
    for j, y in enumerate((19.8, 23.4)):
        box(room, 'hull_mid', (x - 1.15, y - 0.75, HL - 0.08), (x + 1.15, y + 0.75, HL))
        box(room, 'panel_mint' if (i + j) % 2 else 'panel_lilac', (x - 1.0, y - 0.6, HL - 0.1), (x + 1.0, y + 0.6, HL - 0.07))
# dashed mint light strips in the floor, along the aisle to the tubes
for x in (-1.15, 1.15):
    y = Y0 + 0.5
    while y < 24.4:
        box(glow, 'mint_glow', (x - 0.04, y, Z), (x + 0.04, y + 0.55, Z + 0.006))
        y += 0.95

# ------------------------------------------------------------------ the organism tubes
TUBE_Y = 25.75
TUBE_X = (-4.6, -2.3, 0.0, 2.3, 4.6)
GLASS_BOTTOM = Z + 0.5
GLASS_TOP = HL - 0.7
for i, x in enumerate(TUBE_X):
    r = 0.8 if i == 2 else 0.55
    hb = GLASS_TOP - GLASS_BOTTOM
    cyl(tubes, 'hull_light', (x, TUBE_Y, Z + 0.25), r + 0.18, 0.5, 32)            # base
    cyl(tubes, 'hull_mid', (x, TUBE_Y, Z + 0.03), r + 0.22, 0.06, 32)
    cyl(tubes, 'mint_glow', (x, TUBE_Y, GLASS_BOTTOM + 0.02), r + 0.04, 0.05, 32)  # light ring at the foot
    cyl(tubes, 'hull_dark', (x, TUBE_Y, GLASS_BOTTOM + 0.01), r - 0.02, 0.02, 32)
    cyl(glass, 'glass', (x, TUBE_Y, GLASS_BOTTOM + hb / 2), r, hb, 32)
    cyl(tubes, 'hull_light', (x, TUBE_Y, GLASS_TOP + 0.2), r + 0.14, 0.4, 32)      # top cap
    cyl(tubes, 'mint_glow', (x, TUBE_Y, GLASS_TOP - 0.02), r + 0.03, 0.04, 32)
    cyl(tubes, 'hull_dark', (x, TUBE_Y, (GLASS_TOP + 0.4 + HL) / 2), 0.18, HL - GLASS_TOP - 0.4, 12)   # feed pipe
    # a little control drawer on the front of the base, with an orange handle
    box(tubes, 'hull_dark', (x - 0.28, TUBE_Y - r - 0.2, Z + 0.12), (x + 0.28, TUBE_Y - r - 0.12, Z + 0.4))
    box(tubes, 'accent', (x - 0.12, TUBE_Y - r - 0.24, Z + 0.22), (x + 0.12, TUBE_Y - r - 0.2, Z + 0.26))
    box(tubes, 'screen_ui', (x - 0.2, TUBE_Y - r - 0.205, Z + 0.3), (x + 0.2, TUBE_Y - r - 0.2, Z + 0.37))
    kit.col_box((x - r - 0.2, TUBE_Y - r - 0.25, Z), (x + r + 0.2, TUBE_Y + r + 0.2, HL))
    empty('ORG_%d' % i, (x, TUBE_Y, GLASS_BOTTOM))
# a raised plinth along the back wall that the tubes stand on
box(tubes, 'hull_mid', (X0 + 1.0, TUBE_Y - 0.95, Z), (X1 - 1.0, Y1, Z + 0.04))


def robot_arm(base, elbow, wrist, tip):
    """A white industrial arm: base, two segments, joints and an orange gripper."""
    cyl(tubes, 'hull_light', (base.x, base.y, base.z + 0.15), 0.28, 0.3, 20)
    cyl(tubes, 'hull_dark', (base.x, base.y, base.z + 0.33), 0.2, 0.06, 20)
    sh = base + Vector((0, 0, 0.45))
    for a, b, w in ((sh, elbow, 0.18), (elbow, wrist, 0.13), (wrist, tip, 0.08)):
        beam(tubes, 'hull_light', a, b, w, w)
    for j, r in ((sh, 0.16), (elbow, 0.13), (wrist, 0.1)):
        sphere(tubes, 'hull_dark', j, r, 12)
    d = (tip - wrist).normalized()
    for s in (-1, 1):
        side = d.cross(Vector((0, 0, 1))).normalized() * 0.05 * s
        beam(tubes, 'accent', tip + side, tip + side + d * 0.12, 0.03, 0.03)
    kit.col_box((base.x - 0.3, base.y - 0.3, base.z), (base.x + 0.3, base.y + 0.3, base.z + 1.2))


robot_arm(Vector((-3.45, 24.75, Z)), Vector((-3.45, 24.85, Z + 1.7)), Vector((-2.95, 25.15, Z + 2.2)), Vector((-2.82, 25.3, Z + 1.9)))
robot_arm(Vector((3.45, 24.75, Z)), Vector((3.45, 24.8, Z + 1.4)), Vector((2.95, 25.15, Z + 1.75)), Vector((2.84, 25.35, Z + 1.5)))
robot_arm(Vector((1.25, 24.55, Z)), Vector((1.2, 24.6, Z + 1.9)), Vector((0.85, 24.95, Z + 2.5)), Vector((0.72, 25.08, Z + 2.25)))

# ------------------------------------------------------------------ clutter helpers
TZ = Z + 0.97           # work island top


def paper(c, rz, n=1, m='paper'):
    for k in range(n):
        rbox(clut, m, (c[0] + random.uniform(-0.03, 0.03), c[1] + random.uniform(-0.03, 0.03), c[2] + 0.002 + k * 0.002),
             (0.21, 0.297, 0.002), rz + random.uniform(-12, 12))


def bottle(c, m='amber_glass', h=0.22, r=0.05):
    cyl(clut, m, (c[0], c[1], c[2] + h / 2), r, h, 10)
    cyl(clut, m, (c[0], c[1], c[2] + h + 0.03), r * 0.4, 0.06, 8)
    cyl(clut, 'rubber', (c[0], c[1], c[2] + h + 0.07), r * 0.45, 0.03, 8)


def beaker(c, liquid, h=0.14, r=0.05):
    cyl(glass, 'glass', (c[0], c[1], c[2] + h / 2), r, h, 12)
    cyl(clut, liquid, (c[0], c[1], c[2] + h * 0.3), r * 0.9, h * 0.55, 12)


def tube_rack(c, rz):
    rbox(clut, 'hull_light', (c[0], c[1], c[2] + 0.05), (0.3, 0.09, 0.1), rz)
    d = Vector((math.cos(rad(rz)), math.sin(rad(rz)), 0))
    for k in range(6):
        p = Vector(c) + d * (-0.125 + k * 0.05)
        cyl(glass, 'glass', (p.x, p.y, p.z + 0.1), 0.012, 0.16, 8)
        cyl(clut, random.choice(['liq_mint', 'liq_violet', 'liq_amber', 'liq_blue']), (p.x, p.y, p.z + 0.06), 0.01, 0.08, 8)


def microscope(c, rz):
    d = Vector((math.cos(rad(rz)), math.sin(rad(rz)), 0))
    p = Vector(c)
    rbox(clut, 'hull_light', (p.x, p.y, p.z + 0.03), (0.22, 0.16, 0.06), rz)
    beam(clut, 'hull_light', p - d * 0.06 + Vector((0, 0, 0.05)), p - d * 0.05 + Vector((0, 0, 0.32)), 0.06, 0.07)
    rbox(clut, 'hull_dark', tuple(p + d * 0.03 + Vector((0, 0, 0.14))), (0.14, 0.12, 0.015), rz)
    beam(clut, 'hull_light', p - d * 0.05 + Vector((0, 0, 0.3)), p + d * 0.04 + Vector((0, 0, 0.24)), 0.06, 0.06)
    beam(clut, 'hull_dark', p + d * 0.04 + Vector((0, 0, 0.24)), p + d * 0.04 + Vector((0, 0, 0.17)), 0.03, 0.03)
    beam(clut, 'hull_dark', p - d * 0.05 + Vector((0, 0, 0.32)), p - d * 0.13 + Vector((0, 0, 0.4)), 0.035, 0.035)


def centrifuge(c):
    cyl(clut, 'hull_light', (c[0], c[1], c[2] + 0.09), 0.17, 0.18, 20)
    cyl(clut, 'hull_dark', (c[0], c[1], c[2] + 0.185), 0.14, 0.012, 20)
    rbox(clut, 'screen_ui', (c[0], c[1] - 0.165, c[2] + 0.12), (0.08, 0.005, 0.04))


def petri(c):
    cyl(glass, 'glass', (c[0], c[1], c[2] + 0.008), 0.045, 0.016, 14)
    cyl(clut, random.choice(['liq_mint', 'liq_violet', 'paper']), (c[0], c[1], c[2] + 0.004), 0.04, 0.006, 14)


def sample_boxes(c, n, rz):
    for k in range(n):
        rbox(clut, 'fabric_light' if k % 2 == 0 else 'hull_light', (c[0], c[1], c[2] + 0.04 + k * 0.08), (0.16, 0.16, 0.08), rz + k * 7)


def binders(c, rz, n=4):
    d = Vector((math.cos(rad(rz)), math.sin(rad(rz)), 0))
    for k in range(n):
        p = Vector(c) + d * (k * 0.055)
        rbox(clut, random.choice(['accent', 'fabric_light', 'hull_dark', 'hull_light']), (p.x, p.y, p.z + 0.15), (0.05, 0.24, 0.3), rz)


def mug(c, m='hull_light'):
    cyl(clut, m, (c[0], c[1], c[2] + 0.05), 0.04, 0.1, 10)
    cyl(clut, 'rubber', (c[0], c[1], c[2] + 0.095), 0.034, 0.012, 10)
    rbox(clut, m, (c[0] + 0.05, c[1], c[2] + 0.05), (0.025, 0.012, 0.06))


def tablet(c, rz):
    rbox(clut, 'hull_dark', (c[0], c[1], c[2] + 0.006), (0.27, 0.19, 0.012), rz)
    rbox(clut, 'screen_ui', (c[0], c[1], c[2] + 0.0125), (0.24, 0.16, 0.002), rz)


def clipboard(c, rz):
    rbox(clut, 'board', (c[0], c[1], c[2] + 0.004), (0.23, 0.32, 0.008), rz)
    rbox(clut, 'paper', (c[0], c[1], c[2] + 0.009), (0.21, 0.28, 0.002), rz)
    rbox(clut, 'hull_dark', (c[0], c[1], c[2] + 0.012), (0.08, 0.03, 0.01), rz)


def goggles(c, rz):
    d = Vector((math.cos(rad(rz)), math.sin(rad(rz)), 0))
    p = Vector(c)
    rbox(clut, 'accent', (p.x, p.y, p.z + 0.03), (0.17, 0.05, 0.05), rz)
    for s in (-1, 1):
        q = p + d * (0.045 * s)
        cyl(glass, 'glass', (q.x, q.y, q.z + 0.03), 0.035, 0.05, 10)


def pipette_stand(c):
    cyl(clut, 'hull_dark', (c[0], c[1], c[2] + 0.01), 0.07, 0.02, 12)
    cyl(clut, 'hull_dark', (c[0], c[1], c[2] + 0.15), 0.012, 0.3, 8)
    for k in range(3):
        a = k * 2.1
        cyl(clut, 'hull_light', (c[0] + math.cos(a) * 0.04, c[1] + math.sin(a) * 0.04, c[2] + 0.16), 0.01, 0.2, 6)


# ------------------------------------------------------------------ two messy work islands
for x0, x1 in ((-4.4, -1.45), (1.45, 4.4)):
    y0, y1 = 20.55, 21.95
    box(furn, 'hull_light', (x0, y0, Z + 0.1), (x1, y1, Z + 0.92), col=True)
    box(furn, 'hull_dark', (x0 + 0.05, y0 + 0.05, Z), (x1 - 0.05, y1 - 0.05, Z + 0.1))
    box(furn, 'hull_dark', (x0 - 0.05, y0 - 0.05, Z + 0.92), (x1 + 0.05, y1 + 0.05, TZ))
    box(furn, 'blue_glow', (x0, y0 - 0.06, Z + 0.86), (x1, y0 - 0.05, Z + 0.89))
    for side_y in (y0 - 0.005, y1 + 0.005):
        x = x0 + 0.5
        while x < x1 - 0.3:
            box(furn, 'hull_mid', (x - 0.008, side_y - 0.004, Z + 0.15), (x + 0.008, side_y + 0.004, Z + 0.85))
            box(furn, 'accent', (x + 0.08, side_y - 0.012, Z + 0.7), (x + 0.24, side_y + 0.012, Z + 0.72))
            x += 0.65

# island A (left): the organism bench, microscopes and samples
microscope((-3.9, 21.1, TZ), 95)
microscope((-2.3, 21.45, TZ), 260)
tube_rack((-3.3, 20.8, TZ), 0)
tube_rack((-3.2, 21.6, TZ), 10)
for k in range(5):
    petri((-2.85 + (k % 3) * 0.11, 20.85 + (k // 3) * 0.11, TZ))
beaker((-1.85, 20.8, TZ), 'liq_mint')
beaker((-1.75, 21.0, TZ), 'liq_violet', h=0.18, r=0.06)
bottle((-4.15, 21.75, TZ))
bottle((-4.0, 21.8, TZ), 'liq_blue', h=0.18, r=0.04)
paper((-2.6, 21.2, TZ), 20, 3)
clipboard((-3.55, 21.45, TZ), -15)
goggles((-1.9, 21.6, TZ), 30)
mug((-2.0, 21.3, TZ), 'accent')
sample_boxes((-4.2, 20.85, TZ), 3, 5)
empty('PT_Clue_2', (-2.6, 21.2, TZ + 0.05))
# island B (right): chemistry, a centrifuge, a tablet, more papers
centrifuge((2.0, 21.3, TZ))
pipette_stand((2.6, 20.85, TZ))
for k, m in enumerate(('amber_glass', 'amber_glass', 'liq_blue', 'amber_glass')):
    bottle((3.7 + (k % 2) * 0.12, 21.6 - (k // 2) * 0.12, TZ), m, h=0.2 + 0.04 * (k % 2))
beaker((3.1, 20.8, TZ), 'liq_amber', h=0.12)
beaker((3.25, 20.85, TZ), 'liq_blue', h=0.1)
tube_rack((2.9, 21.55, TZ), 90)
tablet((2.45, 21.45, TZ), 25)
paper((3.5, 21.0, TZ), -10, 4)
binders((4.15, 20.75, TZ), 90, 3)
sample_boxes((1.75, 21.75, TZ), 2, -10)
mug((3.95, 21.25, TZ))
goggles((2.2, 20.75, TZ), -40)

# ------------------------------------------------------------------ the workstation (left wall), the only real screens
WZ = Z + 0.75
box(furn, 'hull_light', (X0, 18.5, Z + 0.08), (X0 + 0.95, 21.3, WZ - 0.04), col=True)
box(furn, 'hull_dark', (X0, 18.45, WZ - 0.04), (X0 + 1.0, 21.35, WZ))
box(furn, 'blue_glow', (X0 + 1.0, 18.45, WZ - 0.035), (X0 + 1.005, 21.35, WZ - 0.015))
for k, y in enumerate((19.3, 20.4)):
    box(furn, 'hull_dark', (X0 + 0.15, y - 0.05, WZ), (X0 + 0.25, y + 0.05, WZ + 0.3))     # stand
    rbox(furn, 'hull_dark', (X0 + 0.25, y, WZ + 0.55), (0.05, 1.0, 0.62), 0)            # monitor body
    empty('PT_LabScreen_%d' % k, (X0 + 0.285, y, WZ + 0.55))
    for s in range(3 if k == 0 else 2):                                                  # sticky notes
        rbox(clut, 'sticky', (X0 + 0.28, y - 0.45 + s * 0.09, WZ + 0.86 - (s % 2) * 0.03), (0.004, 0.07, 0.07), 0)
box(clut, 'hull_dark', (X0 + 0.45, 19.5, WZ), (X0 + 0.65, 20.2, WZ + 0.02))           # keyboard
mug((X0 + 0.7, 19.0, WZ))
mug((X0 + 0.55, 20.95, WZ), 'fabric_light')
paper((X0 + 0.6, 18.85, WZ), 70, 2)
rbox(clut, 'hull_dark', (X0 + 0.2, 21.05, WZ + 0.09), (0.03, 0.14, 0.18), 0)           # a photo in a frame
rbox(clut, 'paper', (X0 + 0.22, 21.05, WZ + 0.09), (0.005, 0.11, 0.14), 0)
rbox(clut, 'accent', (X0 + 0.75, 20.6, WZ + 0.012), (0.09, 0.14, 0.02), 35)          # a snack wrapper
empty('PT_Clue_1', (X0 + 0.6, 20.0, WZ + 0.05))


def office_chair(c, rz, coat=False):
    p = Vector(c)
    cyl(furn, 'hull_dark', (p.x, p.y, Z + 0.05), 0.3, 0.04, 10)
    cyl(furn, 'hull_dark', (p.x, p.y, Z + 0.27), 0.035, 0.4, 8)
    rbox(furn, 'fabric', (p.x, p.y, Z + 0.5), (0.5, 0.5, 0.08), rz)
    d = Vector((math.cos(rad(rz)), math.sin(rad(rz)), 0))
    back = p - d * 0.24
    rbox(furn, 'fabric', (back.x, back.y, Z + 0.85), (0.06, 0.46, 0.55), rz)
    rbox(furn, 'fabric_light', (back.x + d.x * 0.031, back.y + d.y * 0.031, Z + 0.85), (0.004, 0.3, 0.35), rz)
    if coat:                                                                              # a lab coat thrown over it
        rbox(furn, 'coat', (back.x - d.x * 0.045, back.y - d.y * 0.045, Z + 1.0), (0.03, 0.42, 0.34), rz)
        rbox(furn, 'coat', (back.x - d.x * 0.075, back.y - d.y * 0.075, Z + 0.7), (0.03, 0.36, 0.34), rz + 4)


office_chair((X0 + 1.55, 19.85, Z), 200)
office_chair((-3.1, 22.5, Z), 250, coat=True)                                            # pushed back behind island A

# ------------------------------------------------------------------ right wall: sink, fume hood, shelves, fridge
# sink cabinet (white, black bands, a light blue strip and an orange edge, like the reference)
sx0, sy0, sy1 = X1 - 0.65, 18.35, 19.35
box(furn, 'hull_light', (sx0, sy0, Z + 0.1), (X1, sy1, Z + 0.88), col=True)
box(furn, 'hull_dark', (sx0 - 0.01, sy0, Z), (X1, sy1, Z + 0.1))
box(furn, 'hull_dark', (sx0 - 0.01, sy0, Z + 0.7), (X1, sy1, Z + 0.78))
box(furn, 'blue_glow', (sx0 - 0.02, sy0 + 0.15, Z + 0.73), (sx0 - 0.01, sy1 - 0.15, Z + 0.75))
box(furn, 'accent', (sx0 - 0.02, sy1 - 0.06, Z + 0.15), (sx0 - 0.01, sy1 - 0.03, Z + 0.65))
box(furn, 'hull_light', (sx0 - 0.05, sy0 - 0.03, Z + 0.88), (X1, sy1 + 0.03, Z + 0.95))
box(furn, 'hull_mid', (sx0 + 0.08, sy0 + 0.12, Z + 0.8), (X1 - 0.1, sy1 - 0.12, Z + 0.951))   # basin
beam(furn, 'hull_dark', (X1 - 0.08, 18.85, Z + 0.95), (X1 - 0.08, 18.85, Z + 1.25), 0.04, 0.04)
beam(furn, 'hull_dark', (X1 - 0.08, 18.85, Z + 1.25), (X1 - 0.3, 18.85, Z + 1.18), 0.035, 0.035)
bottle((X1 - 0.12, 19.2, Z + 0.95), 'fabric_light', h=0.16, r=0.035)                   # soap
rbox(clut, 'fabric_light', (X1 - 0.15, 18.5, Z + 1.0), (0.12, 0.2, 0.1), 0)            # box of gloves
# fume hood: a cabinet with a glass-fronted hood above, lit inside
fy0, fy1 = 19.9, 21.7
box(furn, 'hull_light', (X1 - 0.85, fy0, Z), (X1, fy1, Z + 0.9), col=True)
box(furn, 'hull_dark', (X1 - 0.9, fy0 - 0.03, Z + 0.9), (X1, fy1 + 0.03, Z + 0.95))
box(furn, 'hull_light', (X1 - 0.85, fy0, Z + 0.95), (X1, fy0 + 0.08, Z + 2.4), col=True)
box(furn, 'hull_light', (X1 - 0.85, fy1 - 0.08, Z + 0.95), (X1, fy1, Z + 2.4), col=True)
box(furn, 'hull_light', (X1 - 0.85, fy0, Z + 2.1), (X1, fy1, Z + 2.4))
box(furn, 'hull_dark', (X1 - 0.88, fy0, Z + 2.1), (X1 - 0.85, fy1, Z + 2.18))
box(furn, 'panel_mint', (X1 - 0.6, fy0 + 0.2, Z + 2.09), (X1 - 0.1, fy1 - 0.2, Z + 2.1))
box(glass, 'glass', (X1 - 0.86, fy0 + 0.08, Z + 1.45), (X1 - 0.84, fy1 - 0.08, Z + 2.1))
kit.col_box((X1 - 0.86, fy0, Z + 0.95), (X1 - 0.84, fy1, Z + 2.1))
for k in range(3):
    bottle((X1 - 0.35, fy0 + 0.4 + k * 0.4, Z + 0.95), random.choice(['amber_glass', 'liq_blue']), h=0.2)
beaker((X1 - 0.5, fy0 + 1.2, Z + 0.95), 'liq_violet', h=0.16)
# shelves full of bottles, binders and boxes
for (wx, face, y0, y1) in ((X1, -1, 22.2, 23.7), (X0, 1, 21.6, 23.1)):
    xin = wx + face * 0.42
    lo, hi = (min(wx, xin), max(wx, xin))
    box(furn, 'hull_light', (lo, y0, Z), (hi, y0 + 0.05, Z + 2.2), col=True)
    box(furn, 'hull_light', (lo, y1 - 0.05, Z), (hi, y1, Z + 2.2), col=True)
    for k in range(5):
        z = Z + 0.08 + k * 0.52
        box(furn, 'hull_light', (lo, y0, z), (hi, y1, z + 0.04))
        box(furn, 'accent', (xin - face * 0.005 - 0.005, y0, z + 0.01), (xin - face * 0.005 + 0.005, y1, z + 0.03))
        if k == 0:
            continue
        top = z + 0.04
        y = y0 + 0.15
        while y < y1 - 0.15:
            roll = random.random()
            cx = wx + face * 0.2
            if roll < 0.4:
                bottle((cx, y, top), random.choice(['amber_glass', 'liq_blue', 'amber_glass', 'liq_mint']), h=random.uniform(0.14, 0.26))
                y += 0.12
            elif roll < 0.7:
                binders((cx, y, top), 90, random.randint(2, 4))
                y += 0.3
            else:
                sample_boxes((cx, y, top), random.randint(1, 3), random.uniform(-10, 10))
                y += 0.22
# the sample fridge: glass door, shelves of glowing organism vials (a clue spot)
gx0, gy0, gy1 = X1 - 0.75, 24.0, 24.9
box(furn, 'hull_light', (gx0, gy0, Z), (X1, gy1, Z + 1.95), col=True)
box(furn, 'hull_dark', (gx0 - 0.01, gy0 + 0.05, Z + 0.1), (gx0, gy1 - 0.05, Z + 1.85))
box(glass, 'glass', (gx0 - 0.03, gy0 + 0.07, Z + 0.12), (gx0 - 0.02, gy1 - 0.07, Z + 1.83))
box(furn, 'accent', (gx0 - 0.05, gy1 - 0.12, Z + 0.8), (gx0 - 0.03, gy1 - 0.09, Z + 1.3))
box(furn, 'blue_glow', (gx0 - 0.02, gy0 + 0.1, Z + 1.88), (gx0 - 0.01, gy1 - 0.1, Z + 1.9))
for k in range(4):
    z = Z + 0.3 + k * 0.4
    box(furn, 'hull_mid', (gx0 + 0.02, gy0 + 0.08, z - 0.02), (X1 - 0.05, gy1 - 0.08, z))
    for j in range(6):
        cyl(clut, 'liq_mint' if (j + k) % 3 else 'liq_violet', (gx0 + 0.15, gy0 + 0.17 + j * 0.11, z + 0.07), 0.018, 0.14, 8)
empty('PT_Clue_3', (gx0 - 0.1, (gy0 + gy1) / 2, Z + 1.0))
# server racks (left wall, near the back): dark, an orange stripe, a screen and drive lights
for y0 in (23.65, 24.55):
    y1 = y0 + 0.82
    box(furn, 'hull_dark', (X0, y0, Z), (X0 + 0.75, y1, Z + 2.05), col=True)
    box(furn, 'accent', (X0 + 0.75, y0 + 0.2, Z + 0.1), (X0 + 0.76, y0 + 0.24, Z + 1.95))
    box(furn, 'screen_ui', (X0 + 0.75, y0 + 0.32, Z + 1.45), (X0 + 0.76, y1 - 0.08, Z + 1.85))
    for k in range(7):
        z = Z + 0.2 + k * 0.17
        box(furn, 'hull_mid', (X0 + 0.75, y0 + 0.32, z), (X0 + 0.755, y1 - 0.08, z + 0.12))
        box(furn, 'rack_light' if k % 3 else 'accent_glow', (X0 + 0.755, y1 - 0.2, z + 0.04), (X0 + 0.76, y1 - 0.12, z + 0.08))

# ------------------------------------------------------------------ front wall: lab coat on a hook, ARIA's monitor
box(furn, 'hull_dark', (-3.3, Y0, Z + 1.95), (-3.2, Y0 + 0.1, Z + 2.0))
# the coat: narrow at the shoulders and flaring toward the hem, sleeves hanging at its sides,
# a collar, pockets and a name badge
verts = bmesh.ops.create_cone(furn.bm, cap_ends=True, cap_tris=False, segments=4, radius1=0.4, radius2=0.25, depth=1.0)['verts']
bmesh.ops.rotate(furn.bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rad(45), 3, 'Z'))
bmesh.ops.scale(furn.bm, vec=(1.0, 0.22, 1.0), verts=verts)
bmesh.ops.translate(furn.bm, vec=Vector((-3.25, Y0 + 0.1, Z + 1.42)), verts=verts)
furn.tag('coat', _faces(verts))
for s in (-1, 1):
    beam(furn, 'coat', (-3.25 + s * 0.2, Y0 + 0.1, Z + 1.88), (-3.25 + s * 0.29, Y0 + 0.12, Z + 1.02), 0.11, 0.1)
    beam(furn, 'hull_mid', (-3.25 + s * 0.02, Y0 + 0.165, Z + 1.9), (-3.25 + s * 0.11, Y0 + 0.17, Z + 1.62), 0.05, 0.01)   # collar
    box(furn, 'hull_mid', (-3.25 + s * 0.17 - 0.07, Y0 + 0.17, Z + 1.12), (-3.25 + s * 0.17 + 0.07, Y0 + 0.175, Z + 1.13))  # pocket tops
box(furn, 'fabric_light', (-3.16, Y0 + 0.17, Z + 1.6), (-3.05, Y0 + 0.176, Z + 1.7))   # name badge
box(furn, 'hull_dark', (3.0, Y0, Z + 1.85), (4.6, Y0 + 0.08, Z + 2.85))
box(furn, 'aria_screen', (3.07, Y0 + 0.08, Z + 1.92), (4.53, Y0 + 0.1, Z + 2.78))
empty('ARIA_Lab', (3.8, Y0 + 0.14, Z + 2.35))

# a snake plant in a sci-fi pot in the far corner (our own model)
pc = Vector((X1 - 0.6, Y1 - 0.6, Z))
cone(furn, 'hull_light', (pc.x, pc.y, Z + 0.35), 0.28, 0.36, 0.7, 8)
cone(furn, 'accent', (pc.x, pc.y, Z + 0.71), 0.38, 0.38, 0.05, 8)
cone(furn, 'soil', (pc.x, pc.y, Z + 0.72), 0.33, 0.33, 0.02, 8)
kit.col_box((pc.x - 0.36, pc.y - 0.36, Z), (pc.x + 0.36, pc.y + 0.36, Z + 0.7))
for k in range(9):
    a = k / 9 * math.tau + random.uniform(-0.2, 0.2)
    base = pc + Vector((math.cos(a) * 0.08, math.sin(a) * 0.08, 0.72))
    tip = base + Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, random.uniform(0.6, 0.95)))
    side = Vector((-math.sin(a), math.cos(a), 0)) * 0.05
    v = [clut.bm.verts.new(p) for p in (base - side, base + side, tip)]
    clut.tag('leaf', [clut.bm.faces.new(v)])

# ------------------------------------------------------------------ two organism test tubes broken on the floor
def broken_tube(c, k):
    p = Vector(c)
    # the spill: an irregular glowing puddle
    verts = bmesh.ops.create_circle(glow.bm, cap_ends=True, segments=28, radius=0.32)['verts']
    ph1, ph2 = random.uniform(0, 6.28), random.uniform(0, 6.28)
    for v in verts:                     # a smooth, blobby outline (no spikes)
        if v.co.length > 1e-4:
            ang = math.atan2(v.co.y, v.co.x)
            v.co *= 1 + 0.22 * math.sin(3 * ang + ph1) + 0.12 * math.sin(5 * ang + ph2)
    bmesh.ops.scale(glow.bm, vec=(1.3, 0.85, 1), verts=verts)
    bmesh.ops.rotate(glow.bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(random.uniform(0, 6.28), 3, 'Z'))
    bmesh.ops.translate(glow.bm, vec=p + Vector((0, 0, 0.004)), verts=verts)
    glow.tag('goo_glow', _faces(verts))
    # the two halves of the tube and its stopper
    cyl(glass, 'glass', (p.x + 0.25, p.y + 0.05, p.z + 0.02), 0.02, 0.12, 8, axis='X')
    cyl(glass, 'glass', (p.x - 0.2, p.y + 0.18, p.z + 0.02), 0.02, 0.07, 8, axis='Y')
    cyl(clut, 'rubber', (p.x - 0.28, p.y + 0.24, p.z + 0.015), 0.022, 0.03, 8, axis='Y')
    # glass shards
    for s in range(9):
        q = p + Vector((random.uniform(-0.45, 0.45), random.uniform(-0.35, 0.35), 0.003))
        v = [glass.bm.verts.new(q + Vector((random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), random.uniform(0, 0.01)))) for _ in range(3)]
        glass.tag('glass', [glass.bm.faces.new(v)])
    empty('ORGFRAG_%d' % k, (p.x, p.y, p.z + 0.01))


broken_tube((0.75, 23.55, Z), 0)       # in the aisle in front of the tubes: you see it as you walk in
broken_tube((-2.0, 20.05, Z), 1)       # fallen off island A
empty('PT_Clue_4', (0.75, 23.55, Z + 0.05))
empty('PT_LabLight', (0.0, TUBE_Y - 1.5, Z + 3.2))

finish(OUT_BLEND, OUT_GLB)
