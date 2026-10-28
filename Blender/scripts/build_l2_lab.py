"""
Level 2: the research lab, upstairs across the hall from the lift (its doors are in the atrium,
build_l2_atrium.py). A busy, lived-in biology lab styled after the team's reference: smooth navy
and soft black furniture with orange and blue details, white walls with a blue lower band, curved
transparent holo screens (drawn by the game), and lots of recognisable science kit. The electrical
organism is split across a row of five tubes at the back; two organism test tubes lie broken on
the floor. All modelled here (our own work).

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_l2_lab.py -- \
      Blender/l2-lab.blend public/assets/models/l2-lab.glb

Same coordinates as the atrium (x east, y north, z up). The lab doorway is at y = 17.5, x -1.8..1.8,
on the gallery floor (z 5.5); the lab runs north from there.

Names the game reads: COL_ collision, ORG_<n> organism tube centres (bottom of the glass),
ORGFRAG_<n> organism pieces in the spills, PT_LabScreen_<n> workstation screens (facing east),
PT_Holo_<n>_<w>_<h>_<deg> curved holo screens (width, height in cm, facing angle in degrees),
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

# ------------------------------------------------------------------ materials
# Smooth materials (no panel texture) for the walls and furniture: navy, soft black, blues, orange
kit.mat('lab_wall', (0.76, 0.83, 0.90), 0.55, 0.0)                 # white with a hint of blue
kit.mat('lab_wall_low', (0.42, 0.55, 0.68), 0.6, 0.0)     # the blue lower band
kit.mat('lab_seam', (0.62, 0.67, 0.72), 0.5, 0.0)
kit.mat('navy', (0.055, 0.10, 0.19), 0.45, 0.1)
kit.mat('navy_light', (0.10, 0.18, 0.31), 0.45, 0.1)
kit.mat('soft_black', (0.035, 0.038, 0.045), 0.55, 0.05)
kit.mat('lab_blue', (0.10, 0.48, 0.66), 0.4, 0.05)       # teal-blue, like the reference's benches and chair
kit.mat('orange', (0.95, 0.48, 0.08), 0.4, 0.05)
kit.mat('smooth_white', (0.86, 0.88, 0.91), 0.35, 0.05)
kit.mat('steel', (0.62, 0.64, 0.67), 0.32, 0.9)            # brushed steel
kit.mat('chair_fabric', (0.10, 0.48, 0.66), 0.85, 0.0)    # the chairs' woven seat
kit.mat('whiteboard', (0.95, 0.96, 0.97), 0.2, 0.0)
kit.mat('marker_blue', (0.08, 0.25, 0.8), 0.6, 0.0)
kit.mat('marker_red', (0.8, 0.1, 0.08), 0.6, 0.0)
kit.mat('panel_blue', (0.82, 0.94, 1.0), 0.4, 0.0, (0.75, 0.9, 1.0), 1.6)
kit.mat('panel_mint', (0.80, 1.0, 0.92), 0.4, 0.0, (0.75, 1.0, 0.88), 1.6)
kit.mat('mint_glow', (0.35, 1.0, 0.75), 0.4, 0.0, (0.35, 1.0, 0.72), 2.2)
kit.mat('goo_glow', (0.03, 0.16, 0.13), 0.08, 0.0, (0.2, 0.9, 0.6), 1.0)   # dark teal goo, faintly glowing
kit.mat('liq_mint', (0.35, 0.95, 0.70), 0.2, 0.0, (0.25, 0.8, 0.55), 0.6)
kit.mat('liq_violet', (0.55, 0.30, 0.95), 0.2, 0.0, (0.45, 0.2, 0.85), 0.6)
kit.mat('liq_amber', (0.85, 0.45, 0.08), 0.2, 0.0)
kit.mat('liq_blue', (0.15, 0.45, 0.95), 0.2, 0.0)
kit.mat('liq_red', (0.7, 0.08, 0.08), 0.2, 0.0)
kit.mat('amber_glass', (0.45, 0.20, 0.04), 0.15, 0.0)
kit.mat('label', (0.95, 0.95, 0.92), 0.8, 0.0)
kit.mat('paper', (0.93, 0.93, 0.90), 0.9, 0.0)
kit.mat('sticky', (0.98, 0.86, 0.25), 0.9, 0.0)
kit.mat('board', (0.45, 0.32, 0.20), 0.8, 0.0)
kit.mat('rubber', (0.04, 0.04, 0.045), 0.9, 0.0)
kit.mat('coat', (0.95, 0.95, 0.94), 0.95, 0.0)
kit.mat('screen_ui', (0.04, 0.10, 0.16), 0.3, 0.0, (0.30, 0.72, 1.0), 0.7)
kit.mat('rack_light', (0.9, 0.95, 1.0), 0.4, 0.0, (0.9, 0.95, 1.0), 1.4)
kit.mat('glass_broken', (0.70, 0.88, 0.96), 0.05, 0.0, alpha=0.4)   # smashed glass: a little more visible
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


def local(c, rz, dx, dy, dz=0.0):
    """A point offset (dx forward, dy left) from c in the frame turned rz degrees."""
    a = rad(rz)
    return Vector((c[0] + dx * math.cos(a) - dy * math.sin(a), c[1] + dx * math.sin(a) + dy * math.cos(a), c[2] + dz))


def knock_over(acc, pivot, axis, angle, floor):
    """Tip everything in acc over about a horizontal axis through pivot, then rest it on floor."""
    verts = acc.bm.verts[:]
    bmesh.ops.rotate(acc.bm, verts=verts, cent=Vector(pivot), matrix=Matrix.Rotation(rad(angle), 3, Vector(axis)))
    low = min(v.co.z for v in verts)
    bmesh.ops.translate(acc.bm, vec=Vector((0, 0, floor - low)), verts=verts)


# ------------------------------------------------------------------ the room shell
box(room, 'floor_dark', (X0 - 0.3, 17.35, Z - 0.3), (X1 + 0.3, Y1 + 0.3, Z), col=True)
box(room, 'lab_wall', (X0 - 0.3, 17.35, HL), (X1 + 0.3, Y1 + 0.3, HL + 0.3), col=True)
box(room, 'lab_wall', (X0 - 0.3, Y1, Z), (X1 + 0.3, Y1 + 0.3, HL), col=True)
box(room, 'lab_wall', (X0 - 0.3, 17.35, Z), (X0, Y1, HL), col=True)
box(room, 'lab_wall', (X1, 17.35, Z), (X1 + 0.3, Y1, HL), col=True)
box(room, 'lab_wall', (X0, 17.35, Z), (-DW, Y0, HL), col=True)              # front wall, left of the door
box(room, 'lab_wall', (DW, 17.35, Z), (X1, Y0, HL), col=True)               # and right of it
box(room, 'lab_wall', (-DW, 17.35, Z + 3.4), (DW, Y0, HL), col=True)        # over the door
# wall styling: a navy skirting, a blue lower band, a light blue LED line, soft panel seams,
# and a dark ceiling trim
WALLS = ((X0, Y1 - 0.04, X1, Y1), (X0, Y0, X0 + 0.04, Y1), (X1 - 0.04, Y0, X1, Y1),
         (X0, Y0, -DW, Y0 + 0.04), (DW, Y0, X1, Y0 + 0.04))
for (x0, y0, x1, y1) in WALLS:
    box(room, 'navy', (x0, y0, Z), (x1, y1, Z + 0.14))
    box(room, 'lab_wall_low', (x0, y0, Z + 0.14), (x1, y1, Z + 1.15))
    box(room, 'navy', (x0, y0, Z + 1.15), (x1, y1, Z + 1.19))
    box(room, 'blue_glow', (x0, y0, Z + 1.19), (x1, y1, Z + 1.22))
    box(room, 'navy', (x0, y0, HL - 0.18), (x1, y1, HL))
    box(room, 'blue_glow', (x0, y0, HL - 0.21), (x1, y1, HL - 0.18))
for x in [X0 + 1.75 * k for k in range(1, 8)]:
    box(room, 'lab_seam', (x - 0.012, Y1 - 0.05, Z + 1.22), (x + 0.012, Y1, HL - 0.21))
for y in [Y0 + 1.65 * k for k in range(1, 6)]:
    box(room, 'lab_seam', (X0, y - 0.012, Z + 1.22), (X0 + 0.05, y + 0.012, HL - 0.21))
    box(room, 'lab_seam', (X1 - 0.05, y - 0.012, Z + 1.22), (X1, y + 0.012, HL - 0.21))
for z in (Z + 2.45,):
    for (x0, y0, x1, y1) in WALLS:
        box(room, 'lab_seam', (x0, y0, z - 0.01), (x1, y1, z + 0.01))
# soft blue and mint ceiling panels in recessed dark frames
for i, x in enumerate((-4.2, 0.0, 4.2)):
    for j, y in enumerate((19.8, 23.4)):
        box(room, 'navy', (x - 1.15, y - 0.75, HL - 0.08), (x + 1.15, y + 0.75, HL))
        box(room, 'panel_mint' if (i + j) % 3 == 1 else 'panel_blue', (x - 1.0, y - 0.6, HL - 0.1), (x + 1.0, y + 0.6, HL - 0.07))
# dashed light strips in the floor along the aisle to the tubes
for x in (-1.15, 1.15):
    y = Y0 + 0.5
    while y < 24.4:
        box(glow, 'blue_glow', (x - 0.04, y, Z), (x + 0.04, y + 0.55, Z + 0.006))
        y += 0.95

# ------------------------------------------------------------------ the organism tubes
BROKEN_TUBE = 3        # this one is smashed: jagged stumps of glass, its liquid drained across the floor


def jagged_glass(cx, cy, r, z0, hmin, hmax, down=False, seg=32):
    """The stump of a smashed glass tube: a ring of glass with a ragged edge (drawn both sides)."""
    hs = [random.uniform(hmin, hmax) for _ in range(seg)]
    hs.append(hs[0])
    sign = -1 if down else 1
    for k in range(seg):
        a0, a1 = k / seg * math.tau, (k + 1) / seg * math.tau
        b0 = Vector((cx + r * math.cos(a0), cy + r * math.sin(a0), z0))
        b1 = Vector((cx + r * math.cos(a1), cy + r * math.sin(a1), z0))
        t0 = b0 + Vector((0, 0, sign * hs[k]))
        t1 = b1 + Vector((0, 0, sign * hs[k + 1]))
        for quad in ((b0, b1, t1, t0), (t0, t1, b1, b0)):
            v = [glass.bm.verts.new(p) for p in quad]
            glass.tag('glass_broken', [glass.bm.faces.new(v)])


def glass_piece(c, r, ang0, ang1, h, yaw, tilt):
    """A big curved piece of the tube lying on the floor."""
    pts = []
    for i in range(4):
        a = ang0 + (ang1 - ang0) * i / 3
        for zz in (0.0, h):
            pts.append(Vector((r * math.cos(a), r * math.sin(a) - r, zz)))
    mat = Matrix.Translation(Vector(c)) @ Matrix.Rotation(rad(yaw), 4, 'Z') @ Matrix.Rotation(rad(tilt), 4, 'X')
    pts = [mat @ p for p in pts]
    for i in range(3):
        q = (pts[2 * i], pts[2 * i + 2], pts[2 * i + 3], pts[2 * i + 1])
        for quad in (q, q[::-1]):
            v = [glass.bm.verts.new(p) for p in quad]
            glass.tag('glass_broken', [glass.bm.faces.new(v)])


TUBE_Y = 25.75
TUBE_X = (-4.6, -2.3, 0.0, 2.3, 4.6)
GLASS_BOTTOM = Z + 0.5
GLASS_TOP = HL - 0.7
for i, x in enumerate(TUBE_X):
    r = 0.8 if i == 2 else 0.55
    hb = GLASS_TOP - GLASS_BOTTOM
    cyl(tubes, 'smooth_white', (x, TUBE_Y, Z + 0.25), r + 0.18, 0.5, 32)            # base
    cyl(tubes, 'navy', (x, TUBE_Y, Z + 0.03), r + 0.22, 0.06, 32)
    cyl(tubes, 'mint_glow', (x, TUBE_Y, GLASS_BOTTOM + 0.02), r + 0.04, 0.05, 32)  # light ring at the foot
    cyl(tubes, 'soft_black', (x, TUBE_Y, GLASS_BOTTOM + 0.01), r - 0.02, 0.02, 32)
    if i == BROKEN_TUBE:
        jagged_glass(x, TUBE_Y, r, GLASS_BOTTOM, 0.15, 0.95)                  # what is left at the bottom
        jagged_glass(x, TUBE_Y, r, GLASS_TOP, 0.1, 0.6, down=True)             # and hanging from the top
        cyl(glow, 'goo_glow', (x, TUBE_Y, GLASS_BOTTOM + 0.02), r - 0.03, 0.02, 32)   # the dregs, pooled in the bottom
    else:
        cyl(glass, 'glass', (x, TUBE_Y, GLASS_BOTTOM + hb / 2), r, hb, 32)
    cyl(tubes, 'smooth_white', (x, TUBE_Y, GLASS_TOP + 0.2), r + 0.14, 0.4, 32)      # top cap
    cyl(tubes, 'navy', (x, TUBE_Y, GLASS_TOP + 0.41), r + 0.1, 0.03, 32)
    cyl(tubes, 'mint_glow', (x, TUBE_Y, GLASS_TOP - 0.02), r + 0.03, 0.04, 32)
    cyl(tubes, 'soft_black', (x, TUBE_Y, (GLASS_TOP + 0.4 + HL) / 2), 0.18, HL - GLASS_TOP - 0.4, 12)   # feed pipe
    # a control drawer on the front of the base, with an orange handle and a little screen
    box(tubes, 'navy', (x - 0.3, TUBE_Y - r - 0.2, Z + 0.1), (x + 0.3, TUBE_Y - r - 0.1, Z + 0.42))
    box(tubes, 'orange', (x - 0.13, TUBE_Y - r - 0.24, Z + 0.17), (x + 0.13, TUBE_Y - r - 0.2, Z + 0.21))
    box(tubes, 'screen_ui', (x - 0.22, TUBE_Y - r - 0.205, Z + 0.27), (x + 0.22, TUBE_Y - r - 0.2, Z + 0.37))
    kit.col_box((x - r - 0.2, TUBE_Y - r - 0.25, Z), (x + r + 0.2, TUBE_Y + r + 0.2, HL))
    empty('ORG_%d' % i + ('_broken' if i == BROKEN_TUBE else ''), (x, TUBE_Y, GLASS_BOTTOM))
box(tubes, 'navy_light', (X0 + 1.0, TUBE_Y - 0.95, Z), (X1 - 1.0, Y1, Z + 0.04))   # the plinth they stand on
# pipes running along the back wall above the tubes (as in the reference)
for k, z in enumerate((HL - 0.45, HL - 0.62)):
    cyl(tubes, 'smooth_white' if k == 0 else 'soft_black', (0, Y1 - 0.15 - k * 0.12, z), 0.06, X1 - X0 - 0.2, 12, axis='X')


def robot_arm(base, elbow, wrist, tip):
    """A white industrial arm: base, two segments, dark joints and an orange gripper."""
    cyl(tubes, 'smooth_white', (base.x, base.y, base.z + 0.15), 0.28, 0.3, 20)
    cyl(tubes, 'soft_black', (base.x, base.y, base.z + 0.33), 0.2, 0.06, 20)
    sh = base + Vector((0, 0, 0.45))
    for a, b, w in ((sh, elbow, 0.18), (elbow, wrist, 0.13), (wrist, tip, 0.08)):
        beam(tubes, 'smooth_white', a, b, w, w)
    for j, r in ((sh, 0.16), (elbow, 0.13), (wrist, 0.1)):
        sphere(tubes, 'soft_black', j, r, 12)
    d = (tip - wrist).normalized()
    for s in (-1, 1):
        side = d.cross(Vector((0, 0, 1))).normalized() * 0.05 * s
        beam(tubes, 'orange', tip + side, tip + side + d * 0.12, 0.03, 0.03)
    kit.col_box((base.x - 0.3, base.y - 0.3, base.z), (base.x + 0.3, base.y + 0.3, base.z + 1.2))


robot_arm(Vector((-3.45, 24.75, Z)), Vector((-3.45, 24.85, Z + 1.7)), Vector((-2.95, 25.15, Z + 2.2)), Vector((-2.82, 25.3, Z + 1.9)))
robot_arm(Vector((3.45, 24.75, Z)), Vector((3.45, 24.8, Z + 1.4)), Vector((2.95, 25.15, Z + 1.75)), Vector((2.84, 25.35, Z + 1.5)))
robot_arm(Vector((1.25, 24.55, Z)), Vector((1.2, 24.6, Z + 1.9)), Vector((0.85, 24.95, Z + 2.5)), Vector((0.72, 25.08, Z + 2.25)))


# ------------------------------------------------------------------ science kit (life-size and readable)
def paper(c, rz, n=1):
    for k in range(n):
        rbox(clut, 'paper', (c[0] + random.uniform(-0.04, 0.04), c[1] + random.uniform(-0.04, 0.04), c[2] + 0.01 + k * 0.004),
             (0.21, 0.297, 0.002), rz + random.uniform(-14, 14))


def bottle(c, m='amber_glass', h=0.3, r=0.065):
    """A reagent bottle with a white label and a black cap."""
    cyl(clut, m, (c[0], c[1], c[2] + h / 2), r, h, 16)
    cyl(clut, 'label', (c[0], c[1], c[2] + h * 0.45), r + 0.002, h * 0.35, 16)
    cyl(clut, m, (c[0], c[1], c[2] + h + 0.03), r * 0.45, 0.06, 10)
    cyl(clut, 'soft_black', (c[0], c[1], c[2] + h + 0.075), r * 0.5, 0.04, 10)


def flask(c, liquid, h=0.26):
    """A conical flask, part filled."""
    cone(glass, 'glass', (c[0], c[1], c[2] + h * 0.35), 0.11, 0.035, h * 0.7, 14)
    cyl(glass, 'glass', (c[0], c[1], c[2] + h * 0.85), 0.033, h * 0.3, 10)
    cone(clut, liquid, (c[0], c[1], c[2] + h * 0.17), 0.1, 0.07, h * 0.32, 14)


def beaker(c, liquid, h=0.2, r=0.075):
    cyl(glass, 'glass', (c[0], c[1], c[2] + h / 2), r, h, 14)
    cyl(clut, liquid, (c[0], c[1], c[2] + h * 0.3), r * 0.92, h * 0.55, 14)
    for k in range(3):                                    # measuring marks
        rbox(clut, 'label', (c[0] + r + 0.001, c[1], c[2] + h * (0.3 + 0.18 * k)), (0.003, 0.03, 0.004))


def tube_rack(c, rz):
    """A blue rack of eight test tubes in different colours."""
    rbox(clut, 'lab_blue', tuple(local(c, rz, 0, 0, 0.012)), (0.12, 0.44, 0.024), rz)
    rbox(clut, 'lab_blue', tuple(local(c, rz, 0, 0, 0.11)), (0.12, 0.44, 0.02), rz)
    for s in (-1, 1):
        rbox(clut, 'lab_blue', tuple(local(c, rz, 0, s * 0.21, 0.06)), (0.12, 0.02, 0.12), rz)
    for k in range(8):
        p = local(c, rz, 0, -0.175 + k * 0.05, 0)
        cyl(glass, 'glass', (p.x, p.y, p.z + 0.12), 0.016, 0.22, 8)
        cyl(clut, random.choice(['liq_mint', 'liq_violet', 'liq_amber', 'liq_blue', 'liq_red']), (p.x, p.y, p.z + 0.08), 0.014, 0.13, 8)


def microscope(c, rz, acc=None):
    """A big white microscope: base, curved arm, stage, turret, angled head with two eyepieces."""
    clut = acc or globals()['clut']
    f = lambda dx, dy, dz: local(c, rz, dx, dy, dz)
    rbox(clut, 'smooth_white', tuple(f(0, 0, 0.035)), (0.3, 0.22, 0.07), rz)
    rbox(clut, 'soft_black', tuple(f(0.02, 0, 0.072)), (0.2, 0.16, 0.006), rz)
    beam(clut, 'smooth_white', f(-0.11, 0, 0.06), f(-0.12, 0, 0.36), 0.08, 0.1)           # the arm
    beam(clut, 'smooth_white', f(-0.12, 0, 0.36), f(-0.02, 0, 0.44), 0.08, 0.09)
    rbox(clut, 'soft_black', tuple(f(0.03, 0, 0.2)), (0.17, 0.16, 0.018), rz)                # stage
    rbox(clut, 'paper', tuple(f(0.03, 0, 0.21)), (0.07, 0.025, 0.003), rz)                   # a slide
    cyl(clut, 'soft_black', tuple(f(0.02, 0, 0.33)), 0.05, 0.04, 12)                         # turret
    for k in range(3):
        q = f(0.02 + 0.03 * math.cos(k * 2.1), 0.03 * math.sin(k * 2.1), 0.28)
        cyl(clut, 'smooth_white', (q.x, q.y, q.z), 0.012, 0.06, 8)
    beam(clut, 'smooth_white', f(-0.04, 0, 0.42), f(0.02, 0, 0.36), 0.1, 0.1)               # head
    for s in (-1, 1):                                                                        # eyepieces
        beam(clut, 'soft_black', f(-0.05, s * 0.03, 0.44), f(-0.13, s * 0.035, 0.53), 0.035, 0.035)
    for s in (-1, 1):                                                                        # focus knobs
        q = f(-0.11, s * 0.07, 0.17)
        cyl(clut, 'soft_black', (q.x, q.y, q.z), 0.035, 0.03, 12, axis='Y' if abs(math.sin(rad(rz))) < 0.7 else 'X')
    rbox(clut, 'lab_blue', tuple(f(-0.11, 0, 0.25)), (0.085, 0.105, 0.04), rz)               # blue band


def centrifuge(c):
    cyl(clut, 'smooth_white', (c[0], c[1], c[2] + 0.13), 0.24, 0.26, 24)
    cyl(clut, 'soft_black', (c[0], c[1], c[2] + 0.265), 0.2, 0.02, 24)
    cyl(glass, 'glass', (c[0], c[1], c[2] + 0.285), 0.16, 0.02, 24)
    rbox(clut, 'screen_ui', (c[0], c[1] - 0.235, c[2] + 0.15), (0.14, 0.008, 0.06))
    rbox(clut, 'orange', (c[0] + 0.12, c[1] - 0.232, c[2] + 0.15), (0.03, 0.01, 0.03))


def analyser(c, rz):
    """A benchtop analyser: a white box with a dark window, a screen and a sample tray."""
    rbox(clut, 'smooth_white', tuple(local(c, rz, 0, 0, 0.2)), (0.45, 0.5, 0.4), rz)
    rbox(clut, 'soft_black', tuple(local(c, rz, 0.226, 0.08, 0.24)), (0.005, 0.26, 0.22), rz)
    rbox(clut, 'screen_ui', tuple(local(c, rz, 0.227, -0.17, 0.3)), (0.005, 0.11, 0.08), rz)
    rbox(clut, 'lab_blue', tuple(local(c, rz, 0.27, 0.08, 0.05)), (0.1, 0.28, 0.03), rz)
    rbox(clut, 'orange', tuple(local(c, rz, 0.227, -0.17, 0.16)), (0.006, 0.06, 0.03), rz)


def petri_stack(c, n):
    for k in range(n):
        cyl(glass, 'glass', (c[0], c[1], c[2] + 0.012 + k * 0.022), 0.075, 0.02, 16)
        cyl(clut, random.choice(['liq_mint', 'liq_violet', 'paper', 'liq_amber']), (c[0], c[1], c[2] + 0.006 + k * 0.022), 0.068, 0.008, 16)


def sample_boxes(c, n, rz):
    for k in range(n):
        rbox(clut, 'lab_blue' if k % 2 == 0 else 'smooth_white', (c[0], c[1], c[2] + 0.06 + k * 0.12), (0.24, 0.24, 0.12), rz + k * 6)
        rbox(clut, 'label', (c[0], c[1], c[2] + 0.121 + k * 0.12), (0.12, 0.06, 0.002), rz + k * 6)


def binders(c, rz, n=4):
    for k in range(n):
        p = local(c, rz, 0, k * 0.07, 0)
        rbox(clut, random.choice(['orange', 'lab_blue', 'navy', 'smooth_white']), (p.x, p.y, p.z + 0.16), (0.27, 0.06, 0.32), rz)
        rbox(clut, 'label', tuple(local(c, rz, -0.136, k * 0.07, 0.22)), (0.002, 0.04, 0.08), rz)


def mug(c, m='smooth_white'):
    cyl(clut, m, (c[0], c[1], c[2] + 0.055), 0.045, 0.11, 12)
    cyl(clut, 'rubber', (c[0], c[1], c[2] + 0.105), 0.04, 0.012, 12)
    rbox(clut, m, (c[0] + 0.055, c[1], c[2] + 0.055), (0.03, 0.014, 0.07))


def tablet(c, rz):
    rbox(clut, 'soft_black', (c[0], c[1], c[2] + 0.006), (0.27, 0.19, 0.012), rz)
    rbox(clut, 'screen_ui', (c[0], c[1], c[2] + 0.0125), (0.24, 0.16, 0.002), rz)


def laptop(c, rz):
    rbox(clut, 'soft_black', tuple(local(c, rz, 0, 0, 0.01)), (0.24, 0.34, 0.02), rz)
    hinge = local(c, rz, -0.12, 0, 0.02)
    lid = local(c, rz, -0.17, 0, 0.13)
    beam(clut, 'soft_black', hinge, lid + (lid - hinge) * 0.0, 0.34, 0.012)
    beam(clut, 'screen_ui', local(c, rz, -0.115, 0, 0.03), local(c, rz, -0.163, 0, 0.13), 0.3, 0.004)


def clipboard(c, rz):
    rbox(clut, 'board', (c[0], c[1], c[2] + 0.004), (0.23, 0.32, 0.008), rz)
    rbox(clut, 'paper', (c[0], c[1], c[2] + 0.009), (0.21, 0.28, 0.002), rz)
    rbox(clut, 'soft_black', (c[0], c[1], c[2] + 0.012), (0.08, 0.03, 0.01), rz)


def goggles(c, rz):
    p = Vector(c)
    rbox(clut, 'orange', tuple(local(c, rz, 0, 0, 0.035)), (0.06, 0.2, 0.06), rz)
    for s in (-1, 1):
        q = local(c, rz, 0.01, s * 0.05, 0.035)
        cyl(glass, 'glass', (q.x, q.y, q.z), 0.045, 0.06, 12)


def pipette_stand(c):
    cyl(clut, 'soft_black', (c[0], c[1], c[2] + 0.015), 0.09, 0.03, 14)
    cyl(clut, 'steel', (c[0], c[1], c[2] + 0.2), 0.016, 0.38, 10)
    for k in range(3):
        a = k * 2.1
        q = (c[0] + math.cos(a) * 0.055, c[1] + math.sin(a) * 0.055)
        cyl(clut, 'smooth_white', (q[0], q[1], c[2] + 0.22), 0.016, 0.24, 8)
        cyl(clut, 'lab_blue', (q[0], q[1], c[2] + 0.36), 0.02, 0.05, 8)


def office_chair(c, rz, coat=False, acc=None):
    """A teal-blue lab chair on a black base (like the reference)."""
    furn = acc or globals()['furn']
    p = Vector(c)
    for k in range(5):                                   # star base
        a = rad(rz + k * 72)
        beam(furn, 'steel', (p.x, p.y, Z + 0.08), (p.x + math.cos(a) * 0.3, p.y + math.sin(a) * 0.3, Z + 0.05), 0.05, 0.04)
        sphere(furn, 'soft_black', (p.x + math.cos(a) * 0.3, p.y + math.sin(a) * 0.3, Z + 0.03), 0.03, 8)   # castor
    cyl(furn, 'steel', (p.x, p.y, Z + 0.3), 0.035, 0.44, 12)
    rbox(furn, 'soft_black', (p.x, p.y, Z + 0.5), (0.46, 0.46, 0.03), rz)
    rbox(furn, 'chair_fabric', (p.x, p.y, Z + 0.55), (0.5, 0.5, 0.08), rz)
    back = local(c, rz, -0.25, 0, 0)
    beam(furn, 'soft_black', local(c, rz, -0.2, 0, Z - c[2] + 0.55), (back.x, back.y, Z + 0.7), 0.05, 0.05)
    rbox(furn, 'chair_fabric', (back.x, back.y, Z + 0.92), (0.06, 0.46, 0.48), rz)
    if coat:                                             # a lab coat thrown over the back
        rbox(furn, 'coat', tuple(local(c, rz, -0.295, 0, Z - c[2] + 1.02)), (0.03, 0.42, 0.34), rz)
        rbox(furn, 'coat', tuple(local(c, rz, -0.33, 0, Z - c[2] + 0.72)), (0.03, 0.36, 0.34), rz + 4)


# ------------------------------------------------------------------ two work islands: navy cabinets, soft black tops
TZ = Z + 0.97
for x0, x1 in ((-4.4, -1.45), (1.45, 4.4)):
    y0, y1 = 20.55, 21.95
    box(furn, 'navy', (x0, y0, Z + 0.1), (x1, y1, Z + 0.92), col=True)
    box(furn, 'soft_black', (x0 + 0.05, y0 + 0.05, Z), (x1 - 0.05, y1 - 0.05, Z + 0.1))
    box(furn, 'soft_black', (x0 - 0.06, y0 - 0.06, Z + 0.92), (x1 + 0.06, y1 + 0.06, TZ))
    box(furn, 'blue_glow', (x0, y0 - 0.065, Z + 0.86), (x1, y0 - 0.055, Z + 0.89))
    for side_y, sgn in ((y0, -1), (y1, 1)):            # drawer fronts with orange handles
        n = int((x1 - x0) / 0.72)
        w = (x1 - x0) / n
        for k in range(n):
            dx0, dx1 = x0 + k * w + 0.03, x0 + (k + 1) * w - 0.03
            for zz0, zz1 in ((Z + 0.14, Z + 0.5), (Z + 0.54, Z + 0.84)):
                box(furn, 'navy_light', (dx0, side_y + sgn * 0.001 - 0.004, zz0), (dx1, side_y + sgn * 0.001 + 0.004, zz1))
                hz = zz1 - 0.07
                box(furn, 'orange', ((dx0 + dx1) / 2 - 0.1, side_y + sgn * 0.012 - 0.008, hz), ((dx0 + dx1) / 2 + 0.1, side_y + sgn * 0.012 + 0.008, hz + 0.025))
    # a black frame at the back of the island that holds two curved holo screens (the game draws them)
    for sx in (x0 + 0.75, x1 - 0.75):
        for s in (-0.45, 0.45):
            box(furn, 'soft_black', (sx + s - 0.02, y1 - 0.14, TZ), (sx + s + 0.02, y1 - 0.1, TZ + 0.75))
        box(furn, 'soft_black', (sx - 0.5, y1 - 0.15, TZ + 0.72), (sx + 0.5, y1 - 0.09, TZ + 0.76))
        empty('PT_Holo_%s%s_100_60_270' % ('A' if x0 < 0 else 'B', '1' if sx < (x0 + x1) / 2 else '2'),
              (sx, y1 - 0.12, TZ + 1.08))

# island A (left): biology - two big microscopes, test tubes, petri dishes, samples
microscope((-3.85, 20.95, TZ), 90)
fallen_scope = A('Lab_ScopeFallen')                                                       # knocked onto its side
microscope((-2.05, 21.1, TZ), 70, acc=fallen_scope)
knock_over(fallen_scope, (-2.05, 21.1, TZ), (0, 1, 0), 95, TZ)
for k in range(16):                                                                         # papers all over the floor
    paper((random.uniform(-4.5, 4.5), random.uniform(18.6, 23.4), Z), random.uniform(0, 360))
tube_rack((-3.05, 20.85, TZ), 0)
petri_stack((-2.75, 21.5, TZ), 4)
petri_stack((-2.55, 21.45, TZ), 2)
flask((-1.75, 20.75, TZ), 'liq_mint')
beaker((-1.78, 21.5, TZ), 'liq_violet')
sample_boxes((-4.15, 21.6, TZ), 3, 5)
clipboard((-3.3, 21.5, TZ), -15)
goggles((-2.5, 20.75, TZ), 30)
mug((-1.65, 21.15, TZ), 'orange')
paper((-3.5, 20.75, TZ), 20, 2)
empty('PT_Clue_2', (-3.3, 21.5, TZ + 0.05))
# island B (right): chemistry - a centrifuge, an analyser, reagents, flasks, a laptop
centrifuge((1.95, 21.45, TZ))
analyser((4.0, 21.35, TZ), 270)
pipette_stand((2.55, 21.55, TZ))
for k, m in enumerate(('amber_glass', 'liq_blue', 'amber_glass', 'amber_glass')):
    bottle((3.05 + (k % 2) * 0.15, 21.55 - (k // 2) * 0.15, TZ), m, h=0.26 + 0.05 * (k % 2))
flask((2.25, 20.8, TZ), 'liq_amber')
flask((2.55, 20.85, TZ), 'liq_blue', h=0.22)
beaker((2.85, 20.78, TZ), 'liq_red', h=0.16)
tube_rack((3.55, 20.85, TZ), 0)
laptop((1.85, 20.85, TZ), 285)
paper((3.95, 20.8, TZ), -10, 3)
mug((3.35, 21.2, TZ))
goggles((4.2, 20.75, TZ), -40)

# ------------------------------------------------------------------ the workstation (left wall)
WZ = Z + 0.75
box(furn, 'navy', (X0, 18.5, Z + 0.08), (X0 + 0.95, 21.3, WZ - 0.04), col=True)
box(furn, 'soft_black', (X0, 18.45, WZ - 0.04), (X0 + 1.0, 21.35, WZ))
box(furn, 'blue_glow', (X0 + 1.0, 18.45, WZ - 0.035), (X0 + 1.005, 21.35, WZ - 0.015))
box(furn, 'orange', (X0 + 0.955, 18.5, Z + 0.4), (X0 + 0.96, 21.3, Z + 0.43))
for k, y in enumerate((19.3, 20.4)):
    box(furn, 'soft_black', (X0 + 0.15, y - 0.05, WZ), (X0 + 0.25, y + 0.05, WZ + 0.3))     # stand
    rbox(furn, 'soft_black', (X0 + 0.25, y, WZ + 0.55), (0.05, 1.0, 0.62), 0)            # monitor body
    empty('PT_LabScreen_%d' % k, (X0 + 0.285, y, WZ + 0.55))
    for s in range(3 if k == 0 else 2):                                                  # sticky notes
        rbox(clut, 'sticky', (X0 + 0.28, y - 0.45 + s * 0.09, WZ + 0.86 - (s % 2) * 0.03), (0.004, 0.07, 0.07), 0)
box(clut, 'soft_black', (X0 + 0.45, 19.5, WZ), (X0 + 0.65, 20.2, WZ + 0.02))           # keyboard
mug((X0 + 0.7, 19.0, WZ))
mug((X0 + 0.55, 20.95, WZ), 'lab_blue')
paper((X0 + 0.6, 18.85, WZ), 70, 2)
rbox(clut, 'soft_black', (X0 + 0.2, 21.05, WZ + 0.09), (0.03, 0.14, 0.18), 0)          # a photo in a frame
rbox(clut, 'paper', (X0 + 0.22, 21.05, WZ + 0.09), (0.005, 0.11, 0.14), 0)
rbox(clut, 'orange', (X0 + 0.75, 20.6, WZ + 0.012), (0.09, 0.14, 0.02), 35)          # a snack wrapper
empty('PT_Clue_1', (X0 + 0.6, 20.0, WZ + 0.05))
# a big curved holo screen on the wall above the workstation (as in the reference)
for y in (18.9, 20.9):
    box(furn, 'soft_black', (X0, y - 0.03, Z + 1.55), (X0 + 0.32, y + 0.03, Z + 1.6))
empty('PT_Holo_W_260_120_0', (X0 + 0.35, 19.9, Z + 2.2))

# chairs: at the workstation, in front of both islands, and pushed back behind them
office_chair((X0 + 1.55, 19.85, Z), 200)
for x in (-3.6, -2.3, 2.3):
    office_chair((x, 19.95, Z), 90 + random.uniform(-25, 25))
office_chair((0.6, 19.3, Z), 35)                                                         # rolled away into the aisle


fallen_chair = A('Lab_ChairFallen')                                                      # a chair on its back
office_chair((3.7, 19.6, Z), 80, acc=fallen_chair)
knock_over(fallen_chair, (3.7, 19.6, Z), (1, 0, 0), 82, Z)
office_chair((-3.1, 22.55, Z), 250, coat=True)
office_chair((2.9, 22.6, Z), 300)

# ------------------------------------------------------------------ right wall: sink, upper cupboards, fume hood, shelves, fridge
sx0, sy0, sy1 = X1 - 0.65, 18.35, 19.35
box(furn, 'navy', (sx0, sy0, Z + 0.1), (X1, sy1, Z + 0.88), col=True)
box(furn, 'soft_black', (sx0 - 0.01, sy0, Z), (X1, sy1, Z + 0.1))
box(furn, 'soft_black', (sx0 - 0.01, sy0, Z + 0.7), (X1, sy1, Z + 0.78))
box(furn, 'blue_glow', (sx0 - 0.02, sy0 + 0.15, Z + 0.73), (sx0 - 0.01, sy1 - 0.15, Z + 0.75))
box(furn, 'orange', (sx0 - 0.02, sy1 - 0.06, Z + 0.15), (sx0 - 0.01, sy1 - 0.03, Z + 0.65))
box(furn, 'smooth_white', (sx0 - 0.05, sy0 - 0.03, Z + 0.88), (X1, sy1 + 0.03, Z + 0.95))
box(furn, 'lab_seam', (sx0 + 0.08, sy0 + 0.12, Z + 0.8), (X1 - 0.1, sy1 - 0.12, Z + 0.951))   # basin
beam(furn, 'steel', (X1 - 0.08, 18.85, Z + 0.95), (X1 - 0.08, 18.85, Z + 1.25), 0.04, 0.04)
beam(furn, 'steel', (X1 - 0.08, 18.85, Z + 1.25), (X1 - 0.3, 18.85, Z + 1.18), 0.035, 0.035)
bottle((X1 - 0.12, 19.2, Z + 0.95), 'lab_blue', h=0.18, r=0.04)                         # soap
rbox(clut, 'lab_blue', (X1 - 0.15, 18.5, Z + 1.0), (0.14, 0.24, 0.1), 0)                # box of gloves
for k, y in enumerate((18.35, 18.85)):                                                     # cupboards above the sink
    box(furn, 'navy', (X1 - 0.38, y, Z + 1.7), (X1, y + 0.5, Z + 2.4), col=True)
    box(furn, 'orange', (X1 - 0.39, y + (0.42 if k == 0 else 0.05), Z + 1.78), (X1 - 0.38, y + (0.45 if k == 0 else 0.08), Z + 2.0))
# fume hood: a navy cabinet with a glass-fronted hood above, lit inside
fy0, fy1 = 19.9, 21.7
box(furn, 'navy', (X1 - 0.85, fy0, Z), (X1, fy1, Z + 0.9), col=True)
box(furn, 'soft_black', (X1 - 0.9, fy0 - 0.03, Z + 0.9), (X1, fy1 + 0.03, Z + 0.95))
box(furn, 'smooth_white', (X1 - 0.85, fy0, Z + 0.95), (X1, fy0 + 0.08, Z + 2.4), col=True)
box(furn, 'smooth_white', (X1 - 0.85, fy1 - 0.08, Z + 0.95), (X1, fy1, Z + 2.4), col=True)
box(furn, 'smooth_white', (X1 - 0.85, fy0, Z + 2.1), (X1, fy1, Z + 2.4))
box(furn, 'orange', (X1 - 0.88, fy0, Z + 2.1), (X1 - 0.85, fy1, Z + 2.16))
box(furn, 'panel_blue', (X1 - 0.6, fy0 + 0.2, Z + 2.09), (X1 - 0.1, fy1 - 0.2, Z + 2.1))
box(glass, 'glass', (X1 - 0.86, fy0 + 0.08, Z + 1.45), (X1 - 0.84, fy1 - 0.08, Z + 2.1))
kit.col_box((X1 - 0.86, fy0, Z + 0.95), (X1 - 0.84, fy1, Z + 2.1))
for k in range(3):
    bottle((X1 - 0.35, fy0 + 0.4 + k * 0.45, Z + 0.95), random.choice(['amber_glass', 'liq_blue']))
flask((X1 - 0.55, fy0 + 1.2, Z + 0.95), 'liq_violet')
# shelves full of bottles, binders and boxes (soft black frames, orange shelf edges)
for (wx, face, y0, y1) in ((X1, -1, 22.2, 23.7), (X0, 1, 21.6, 23.1)):
    xin = wx + face * 0.42
    lo, hi = (min(wx, xin), max(wx, xin))
    box(furn, 'soft_black', (lo, y0, Z), (hi, y0 + 0.04, Z + 2.2), col=True)
    box(furn, 'soft_black', (lo, y1 - 0.04, Z), (hi, y1, Z + 2.2), col=True)
    for k in range(5):
        z = Z + 0.08 + k * 0.52
        box(furn, 'soft_black', (lo, y0, z), (hi, y1, z + 0.035))
        box(furn, 'orange', (xin - 0.006, y0, z + 0.005), (xin + 0.006, y1, z + 0.03))
        if k == 0 or k == 4:
            continue
        top = z + 0.035
        y = y0 + 0.17
        cx = wx + face * 0.2
        while y < y1 - 0.17:
            roll = random.random()
            if roll < 0.4:
                bottle((cx, y, top), random.choice(['amber_glass', 'liq_blue', 'amber_glass', 'liq_mint']), h=random.uniform(0.2, 0.3))
                y += 0.16
            elif roll < 0.7:
                binders((cx, y, top), 90 if face < 0 else 270, random.randint(2, 4))
                y += 0.32
            else:
                sample_boxes((cx, y, top), random.randint(1, 2), random.uniform(-8, 8))
                y += 0.3
# the sample fridge: glass door, shelves of glowing organism vials (a clue spot)
gx0, gy0, gy1 = X1 - 0.75, 24.0, 24.9
box(furn, 'navy', (gx0, gy0, Z), (X1, gy1, Z + 1.95), col=True)
box(furn, 'soft_black', (gx0 - 0.01, gy0 + 0.05, Z + 0.1), (gx0, gy1 - 0.05, Z + 1.85))
box(glass, 'glass', (gx0 - 0.03, gy0 + 0.07, Z + 0.12), (gx0 - 0.02, gy1 - 0.07, Z + 1.83))
box(furn, 'orange', (gx0 - 0.05, gy1 - 0.12, Z + 0.8), (gx0 - 0.03, gy1 - 0.09, Z + 1.3))
box(furn, 'blue_glow', (gx0 - 0.02, gy0 + 0.1, Z + 1.88), (gx0 - 0.01, gy1 - 0.1, Z + 1.9))
for k in range(4):
    z = Z + 0.3 + k * 0.4
    box(furn, 'lab_seam', (gx0 + 0.02, gy0 + 0.08, z - 0.02), (X1 - 0.05, gy1 - 0.08, z))
    for j in range(6):
        cyl(clut, 'liq_mint' if (j + k) % 3 else 'liq_violet', (gx0 + 0.15, gy0 + 0.17 + j * 0.11, z + 0.08), 0.022, 0.16, 8)
empty('PT_Clue_3', (gx0 - 0.1, (gy0 + gy1) / 2, Z + 1.0))
# a big curved holo screen on the right wall, above the shelves
empty('PT_Holo_E_220_110_180', (X1 - 0.5, 22.95, Z + 2.85))
for y in (22.15, 23.75):
    box(furn, 'soft_black', (X1 - 0.5, y - 0.03, Z + 2.35), (X1, y + 0.03, Z + 2.4))
# server racks (left wall, near the back): dark, an orange stripe, a screen and drive lights
for y0 in (23.65, 24.55):
    y1 = y0 + 0.82
    box(furn, 'soft_black', (X0, y0, Z), (X0 + 0.75, y1, Z + 2.05), col=True)
    box(furn, 'orange', (X0 + 0.75, y0 + 0.2, Z + 0.1), (X0 + 0.76, y0 + 0.24, Z + 1.95))
    box(furn, 'screen_ui', (X0 + 0.75, y0 + 0.32, Z + 1.45), (X0 + 0.76, y1 - 0.08, Z + 1.85))
    for k in range(7):
        z = Z + 0.2 + k * 0.17
        box(furn, 'navy_light', (X0 + 0.75, y0 + 0.32, z), (X0 + 0.755, y1 - 0.08, z + 0.12))
        box(furn, 'rack_light' if k % 3 else 'accent_glow', (X0 + 0.755, y1 - 0.2, z + 0.04), (X0 + 0.76, y1 - 0.12, z + 0.08))

# ------------------------------------------------------------------ front wall: whiteboard, lab coat, ARIA's monitor
wb0, wb1 = -6.7, -4.1
box(furn, 'soft_black', (wb0 - 0.04, Y0, Z + 1.3), (wb1 + 0.04, Y0 + 0.05, Z + 2.55))
box(furn, 'whiteboard', (wb0, Y0 + 0.05, Z + 1.34), (wb1, Y0 + 0.06, Z + 2.51))
box(furn, 'soft_black', (wb0, Y0, Z + 1.27), (wb1, Y0 + 0.1, Z + 1.31))                  # marker tray
for k, m in enumerate(('marker_blue', 'marker_red', 'soft_black')):
    rbox(clut, m, (wb0 + 0.3 + k * 0.15, Y0 + 0.07, Z + 1.325), (0.12, 0.02, 0.02))
yy = Y0 + 0.065
# a sketch of the organism and some notes, in marker
cx, cz = -5.9, Z + 1.95
for k in range(10):                                                                         # the body
    a0, a1 = k / 10 * math.tau, (k + 1) / 10 * math.tau
    beam(furn, 'marker_blue', (cx + 0.16 * math.cos(a0), yy, cz + 0.16 * math.sin(a0)), (cx + 0.16 * math.cos(a1), yy, cz + 0.16 * math.sin(a1)), 0.012, 0.004)
for k in range(7):                                                                          # tendrils
    a = k / 7 * math.tau + 0.3
    p0 = (cx + 0.16 * math.cos(a), yy, cz + 0.16 * math.sin(a))
    p1 = (cx + 0.4 * math.cos(a + 0.2), yy, cz + 0.36 * math.sin(a + 0.2))
    beam(furn, 'marker_blue', p0, p1, 0.01, 0.004)
    beam(furn, 'marker_red', p1, (p1[0] + 0.07 * math.cos(a - 0.6), yy, p1[2] + 0.07 * math.sin(a - 0.6)), 0.008, 0.004)
for k in range(6):                                                                          # lines of notes
    beam(furn, 'soft_black', (-5.2, yy, Z + 2.3 - k * 0.14), (-4.3 - random.uniform(0, 0.3), yy, Z + 2.3 - k * 0.14), 0.012, 0.004)
beam(furn, 'marker_red', (-5.25, yy, Z + 1.55), (-4.35, yy, Z + 1.55), 0.014, 0.004)
# the lab coat on its hook
box(furn, 'soft_black', (-3.3, Y0, Z + 1.95), (-3.2, Y0 + 0.1, Z + 2.0))
verts = bmesh.ops.create_cone(furn.bm, cap_ends=True, cap_tris=False, segments=4, radius1=0.4, radius2=0.25, depth=1.0)['verts']
bmesh.ops.rotate(furn.bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rad(45), 3, 'Z'))
bmesh.ops.scale(furn.bm, vec=(1.0, 0.22, 1.0), verts=verts)
bmesh.ops.translate(furn.bm, vec=Vector((-3.25, Y0 + 0.1, Z + 1.42)), verts=verts)
furn.tag('coat', _faces(verts))
for s in (-1, 1):
    beam(furn, 'coat', (-3.25 + s * 0.2, Y0 + 0.1, Z + 1.88), (-3.25 + s * 0.29, Y0 + 0.12, Z + 1.02), 0.11, 0.1)
    beam(furn, 'lab_seam', (-3.25 + s * 0.02, Y0 + 0.165, Z + 1.9), (-3.25 + s * 0.11, Y0 + 0.17, Z + 1.62), 0.05, 0.01)
    box(furn, 'lab_seam', (-3.25 + s * 0.17 - 0.07, Y0 + 0.17, Z + 1.12), (-3.25 + s * 0.17 + 0.07, Y0 + 0.175, Z + 1.13))
box(furn, 'lab_blue', (-3.16, Y0 + 0.17, Z + 1.6), (-3.05, Y0 + 0.176, Z + 1.7))          # name badge
# ARIA's monitor
box(furn, 'soft_black', (3.0, Y0, Z + 1.85), (4.6, Y0 + 0.08, Z + 2.85))
box(furn, 'aria_screen', (3.07, Y0 + 0.08, Z + 1.92), (4.53, Y0 + 0.1, Z + 2.78))
empty('ARIA_Lab', (3.8, Y0 + 0.14, Z + 2.35))

# a snake plant in a sci-fi pot in the far corner (our own model)
pc = Vector((X1 - 0.6, Y1 - 0.6, Z))
cone(furn, 'smooth_white', (pc.x, pc.y, Z + 0.35), 0.28, 0.36, 0.7, 8)
cone(furn, 'orange', (pc.x, pc.y, Z + 0.71), 0.38, 0.38, 0.05, 8)
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
    verts = bmesh.ops.create_circle(glow.bm, cap_ends=True, segments=28, radius=0.32)['verts']
    ph1, ph2 = random.uniform(0, 6.28), random.uniform(0, 6.28)
    for v in verts:                     # a smooth, blobby outline (no spikes)
        if v.co.length > 1e-4:
            ang = math.atan2(v.co.y, v.co.x)
            v.co *= 1 + 0.22 * math.sin(3 * ang + ph1) + 0.12 * math.sin(5 * ang + ph2)
    bmesh.ops.scale(glow.bm, vec=(1.3, 0.85, 1), verts=verts)
    bmesh.ops.rotate(glow.bm, verts=verts, cent=(0, 0, 0), matrix=Matrix.Rotation(random.uniform(0, 6.28), 3, 'Z'))
    bmesh.ops.translate(glow.bm, vec=p + Vector((0, 0, 0.01)), verts=verts)
    glow.tag('goo_glow', _faces(verts))
    # the two halves of the tube and its stopper
    cyl(glass, 'glass', (p.x + 0.25, p.y + 0.05, p.z + 0.025), 0.025, 0.14, 8, axis='X')
    cyl(glass, 'glass', (p.x - 0.2, p.y + 0.18, p.z + 0.025), 0.025, 0.09, 8, axis='Y')
    cyl(clut, 'rubber', (p.x - 0.29, p.y + 0.25, p.z + 0.02), 0.028, 0.04, 8, axis='Y')
    for s in range(9):                  # glass shards
        q = p + Vector((random.uniform(-0.45, 0.45), random.uniform(-0.35, 0.35), 0.003))
        v = [glass.bm.verts.new(q + Vector((random.uniform(-0.035, 0.035), random.uniform(-0.035, 0.035), random.uniform(0, 0.01)))) for _ in range(3)]
        glass.tag('glass', [glass.bm.faces.new(v)])
    empty('ORGFRAG_%d' % k, (p.x, p.y, p.z + 0.01))


bx = TUBE_X[BROKEN_TUBE]
verts = bmesh.ops.create_circle(glow.bm, cap_ends=True, segments=36, radius=1.0)['verts']   # the drained liquid
for v in verts:
    if v.co.length > 1e-4:
        ang = math.atan2(v.co.y, v.co.x)
        v.co *= 1 + 0.25 * math.sin(3 * ang + 1.3) + 0.15 * math.sin(7 * ang + 0.4)
bmesh.ops.scale(glow.bm, vec=(1.25, 1.0, 1), verts=verts)
bmesh.ops.translate(glow.bm, vec=Vector((bx - 0.2, TUBE_Y - 1.5, Z + 0.012)), verts=verts)
glow.tag('goo_glow', _faces(verts))
for k, (dx, dy, yaw, tilt) in enumerate(((-0.6, -1.3, 20, 82), (0.5, -1.7, 140, 86), (0.1, -2.2, 260, 88), (-1.0, -1.9, 75, 84))):
    glass_piece((bx + dx, TUBE_Y + dy, Z + 0.02), 0.55, -0.5, 0.5, random.uniform(0.25, 0.5), yaw, tilt)
for s_ in range(40):
    q = Vector((bx + random.uniform(-1.4, 1.4), TUBE_Y - random.uniform(0.6, 2.6), Z + 0.016))
    v = [glass.bm.verts.new(q + Vector((random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), random.uniform(0, 0.01)))) for _ in range(3)]
    glass.tag('glass', [glass.bm.faces.new(v)])
empty('PT_Clue_5', (bx, TUBE_Y - 1.0, Z + 0.05))

broken_tube((0.75, 23.55, Z), 0)       # in the aisle in front of the tubes: you see it as you walk in
broken_tube((-0.85, 21.2, Z), 1)       # fallen off the end of island A
empty('PT_Clue_4', (0.75, 23.55, Z + 0.05))
empty('PT_LabLight', (0.0, TUBE_Y - 1.5, Z + 3.2))


def polish_all(objs):
    widths = {'Lab_Furniture': 0.012, 'Lab_Clutter': 0.004, 'Lab_Tubes': 0.01, 'Lab_ChairFallen': 0.01, 'Lab_ScopeFallen': 0.004}
    for ob in objs:
        if ob.name in widths:
            kit.polish(ob, widths[ob.name])


finish(OUT_BLEND, OUT_GLB, post=polish_all)
