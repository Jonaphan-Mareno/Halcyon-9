"""
The two quarters in l2-atrium.blend, lived in: Voss's crew room (Bedroom1) and Kessler's room
(Bedroom2). Run after build_voss_bunk.py (the crew's bunks).

Voss's crew room, four people's (the bunks: Voss, Navarro, Park, Ito):
  - the old crew pod at its east end goes (BedCrew00.002 and its wall panel: Bedroom2's, parked in
    this room); the four crew lockers stand along that wall instead (RoomProps.js, in the game)
  - at that end: a rug, a small round table with two chairs (Ito's jacket over one), mugs, cards
    and a book on it, a kit bag by the lockers, a laundry basket by the bunks
  - a runner in front of the bunks, Voss's slippers by his
  - by the door, where the lockers stood: a coat rail (Navarro's and Park's coats, a cap), a bench
    with a bag on it and boots under it
  - a poster on the south wall
Kessler's room, neat:
  - her bed: a large single in the bunks' manner (a plinth with drawers, a padded headboard with a
    reading light), made: two pillows, the duvet's top turned down, a throw folded at the foot;
    in place of the sci-fi crew bed (Sci-fi-Bed, its mattress Cube.011 and the box on it) and the
    canister and crate that stood on its canopy
  - a nightstand with a lamp and a book, a rug by the bed, an armchair with a folded throw and a
    floor lamp, her lab coat on a hook by the door, a picture over the bed, books on her desk

Each group is an object of its own (VCol.Dress, its paint in a 'Col' corner colour like the
bedroom set): the exporter gives every object a collider from its bounds, so one object across
the room would wall it off. Kessler's room is turned about the atrium; her pieces are built in the
room's own plan (x along the bed's wall, y across, from the room's middle, z up from the floor)
and placed with it, so their colliders turn with the room. Retired pieces go to the RetiredProps
collection, outside the scene (kept, but neither exported nor solid).

Re-runnable. Saves l2-atrium.blend; then export with export_l2_atrium_with_rigs.py.

  blender -b --factory-startup Blender/l2-atrium.blend --python Blender/scripts/build_bedroom_dressing.py
"""
import math, random, bpy, bmesh
from mathutils import Vector, Matrix

D = bpy.data
FLOOR = 5.5


def lin(hex_):
    c = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


# the bedroom set's palette (as in build_voss_bunk.py), and the crew's coats (DrownedCrew.js)
DARK = (0.08, 0.08, 0.08)
METAL = (0.24, 0.24, 0.24)
PANEL = (0.48, 0.48, 0.48)
ORANGE = (1.0, 0.32, 0.0)
CYAN = (0.0, 0.83, 1.0)
CANVAS = (0.48, 0.39, 0.25)
SHEET = (0.70, 0.70, 0.67)
PILLOW = (0.82, 0.82, 0.79)
BLANKET = (0.10, 0.14, 0.50)
WHITE = (0.80, 0.80, 0.77)
RUST = (0.33, 0.09, 0.04)
TERRACOTTA = (0.55, 0.26, 0.11)
MIRROR = (0.60, 0.68, 0.70)
CREAM = (0.72, 0.62, 0.44)
SAGE = (0.30, 0.36, 0.25)
SLATE = (0.13, 0.17, 0.24)
WOOD = (0.30, 0.17, 0.08)
SHADE = (0.85, 0.66, 0.38)
NAVARRO, PARK, ITO = lin('#5a4a32'), lin('#46523f'), lin('#3b4a5e')

parts = []                 # (bmesh, colour, smooth) of the object being built
XF = Matrix.Identity(4)    # where the next parts go (a piece built about its own origin, then placed)


def _add(bm, color, smooth):
    bmesh.ops.transform(bm, matrix=XF, verts=bm.verts)
    parts.append((bm, color, smooth))


def box(a, b, color, bevel=0.0, segments=1, smooth=False, cuts=0, rumple=0.0, flare=0.0):
    """a box from corner a to corner b, edges bevelled; cuts subdivide it, rumple jitters its top
    (cloth) and flare widens it in x toward the bottom (a coat's skirt)"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    a, b = Vector(a), Vector(b)
    size = b - a
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.translate(bm, vec=(a + b) / 2, verts=bm.verts)
    if cuts:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    if rumple:
        rnd = random.Random(len(parts) * 7 + 3)
        for v in bm.verts:
            inner = min(v.co.x - a.x, b.x - v.co.x, v.co.y - a.y, b.y - v.co.y) > 1e-4
            if abs(v.co.z - b.z) < 1e-5 and inner:
                v.co.z += rnd.uniform(-rumple, rumple)
    if flare:
        mid = (a.x + b.x) / 2
        for v in bm.verts:
            t = (b.z - v.co.z) / size.z
            v.co.x = mid + (v.co.x - mid) * (1 + flare * t)
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=min(bevel, min(size) * 0.45),
                        segments=segments, affect='EDGES', profile=0.5, clamp_overlap=True)
    _add(bm, color, smooth)


def cyl(x, y, z0, z1, r0, color, r1=None, segments=20, smooth=True):
    """an upright cylinder (or cone: r0 at the bottom, r1 at the top)"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r0, radius2=r0 if r1 is None else r1, depth=z1 - z0)
    bmesh.ops.translate(bm, vec=(x, y, (z0 + z1) / 2), verts=bm.verts)
    _add(bm, color, smooth)


def place(x, y, z=FLOOR, turn=0.0, frame=None):
    """the transform for a piece built about its own origin: at (x, y, z), turned by `turn`
    (radians about z), in `frame` (a room's plan) if given"""
    m = Matrix.Translation((x, y, z)) @ Matrix.Rotation(turn, 4, 'Z')
    return (frame @ m) if frame is not None else m


def material():
    mat = D.materials.get('VCol.Dress') or D.materials.new('VCol.Dress')
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    pb = nt.nodes.new('ShaderNodeBsdfPrincipled')
    pb.inputs['Base Color'].default_value = (1, 1, 1, 1)
    pb.inputs['Roughness'].default_value = 0.9
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(vc.outputs['Color'], pb.inputs['Base Color'])
    nt.links.new(pb.outputs['BSDF'], out.inputs['Surface'])
    return mat


MAT = material()


def make(name, coll, frame=None):
    """the parts built so far as one object `name` in collection `coll`, placed by `frame` (the parts
    are in its coordinates; the identity for world coordinates)"""
    global parts
    old = D.objects.get(name)
    if old:
        me_old = old.data
        D.objects.remove(old, do_unlink=True)
        if me_old.users == 0:
            D.meshes.remove(me_old)
    bm = bmesh.new()
    tmp = D.meshes.new('tmp_part')
    colors, smooth = [], []
    for part, color, sm in parts:
        part.to_mesh(tmp)
        part.free()
        before = len(bm.faces)
        bm.from_mesh(tmp)
        n = len(bm.faces) - before
        colors += [color] * n
        smooth += [sm] * n
    D.meshes.remove(tmp)
    bm.faces.ensure_lookup_table()
    for f, sm in zip(bm.faces, smooth):
        f.smooth = sm
    me = D.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    col = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for poly, c in zip(me.polygons, colors):
        for li in poly.loop_indices:
            col.data[li].color = (*c, 1.0)
    me.color_attributes.active_color = col
    me.color_attributes.render_color_index = me.color_attributes.find('Col')
    me.materials.append(MAT)
    o = D.objects.new(name, me)
    D.collections[coll].objects.link(o)
    if frame is not None:
        o.matrix_world = frame
    parts = []
    print('  %s: %d faces' % (name, len(me.polygons)))
    return o


def retire(name):
    o = D.objects.get(name)
    if not o or 'RetiredProps' in [c.name for c in o.users_collection]:
        return
    retired = D.collections.get('RetiredProps') or D.collections.new('RetiredProps')
    retired.use_fake_user = True
    for c in list(o.users_collection):
        c.objects.unlink(o)
    retired.objects.link(o)
    print('  retired', name)


# ------------------------------------------------------------------ pieces, about their own origin
# (x across, y toward the front, z up; a piece's origin is on the floor under its middle, or at
# the hook a garment hangs from)

def rug(w, d, field, border, stripe=None):
    box((-w / 2, -d / 2, 0), (w / 2, d / 2, 0.008), border, bevel=0.003)
    box((-w / 2 + 0.09, -d / 2 + 0.09, 0.008), (w / 2 - 0.09, d / 2 - 0.09, 0.011), field)
    if stripe:
        for s in (-1, 1):
            box((-w / 2 + 0.16, s * (d / 2 - 0.2) - 0.03, 0.011), (w / 2 - 0.16, s * (d / 2 - 0.2) + 0.03, 0.013), stripe)


def coat(color, length=0.92, width=0.44):
    """a coat hanging from a hook at the origin, its front toward +y"""
    box((-0.2, -0.015, -0.06), (0.2, 0.015, -0.035), DARK, bevel=0.008)                       # the hanger
    box((-width / 2, -0.07, -length), (width / 2, 0.05, -0.05), color, bevel=0.03, segments=2, smooth=True, cuts=2, flare=0.25)
    box((-0.13, -0.05, -0.13), (0.13, 0.07, -0.02), color, bevel=0.025, segments=2, smooth=True)        # the collar
    for s in (-1, 1):                                                                                  # the sleeves
        box((s * width / 2 - 0.05, -0.05, -length * 0.72), (s * width / 2 + 0.03, 0.05, -0.08), color,
            bevel=0.025, segments=2, smooth=True)
    box((-0.008, 0.05, -length + 0.06), (0.008, 0.056, -0.14), DARK)                                 # its fastening


def chair(wood=WOOD, seat=SLATE):
    """a plain chair facing +y"""
    for x in (-0.2, 0.17):
        for y in (-0.2, 0.17):
            box((x, y, 0), (x + 0.03, y + 0.03, 0.45), wood, bevel=0.006)
    box((-0.22, -0.22, 0.42), (0.22, 0.22, 0.47), seat, bevel=0.015, segments=2, smooth=True)
    for x in (-0.2, 0.17):
        box((x, -0.22, 0.47), (x + 0.03, -0.19, 0.92), wood, bevel=0.006)
    box((-0.21, -0.23, 0.70), (0.21, -0.19, 0.90), wood, bevel=0.01)


def jacket_over_back(color):
    """a jacket slung over the back of a chair() built at the same origin"""
    box((-0.22, -0.30, 0.86), (0.22, -0.12, 0.94), color, bevel=0.03, segments=2, smooth=True)      # over the top
    box((-0.21, -0.32, 0.45), (0.21, -0.27, 0.90), color, bevel=0.02, smooth=True, cuts=2, rumple=0.0)  # down the back
    box((-0.2, -0.16, 0.62), (0.2, -0.12, 0.90), color, bevel=0.02, smooth=True)                     # down the front
    box((0.19, -0.30, 0.40), (0.25, -0.24, 0.88), color, bevel=0.02, smooth=True)                    # a sleeve


def duffel(color, l=0.62, r=0.16):
    box((-l / 2, -r, 0), (l / 2, r, 2 * r * 0.9), color, bevel=r * 0.9, segments=4, smooth=True)
    box((-0.12, -r - 0.01, 2 * r * 0.9 - 0.02), (-0.08, r + 0.01, 2 * r * 0.9 + 0.05), DARK, bevel=0.01)   # handles
    box((0.08, -r - 0.01, 2 * r * 0.9 - 0.02), (0.12, r + 0.01, 2 * r * 0.9 + 0.05), DARK, bevel=0.01)
    box((-l / 2 + 0.05, r - 0.01, 0.12), (l / 2 - 0.05, r + 0.005, 0.14), DARK)                    # its zip


def boot(x, y, turn=0.0, color=DARK):
    global XF
    keep = XF
    XF = XF @ Matrix.Translation((x, y, 0)) @ Matrix.Rotation(turn, 4, 'Z')
    box((-0.05, -0.06, 0), (0.05, 0.05, 0.24), color, bevel=0.025, segments=2, smooth=True)          # the shaft
    box((-0.05, 0.0, 0), (0.05, 0.2, 0.09), color, bevel=0.035, segments=2, smooth=True)             # the foot
    box((-0.052, -0.062, 0), (0.052, 0.205, 0.018), (0.03, 0.03, 0.03), bevel=0.008)                # the sole
    XF = keep


def mug(x, y, z, color):
    cyl(x, y, z, z + 0.095, 0.04, color, segments=14)
    cyl(x, y, z + 0.085, z + 0.092, 0.034, (0.12, 0.06, 0.03), segments=14)                           # coffee
    box((x + 0.035, y - 0.01, z + 0.02), (x + 0.065, y + 0.01, z + 0.075), color, bevel=0.008)        # handle


def book(x0, y0, z, w, d, h, cover, turn=0.0):
    global XF
    keep = XF
    XF = XF @ Matrix.Translation((x0, y0, z)) @ Matrix.Rotation(turn, 4, 'Z')
    box((-w / 2, -d / 2, 0), (w / 2, d / 2, h), cover, bevel=0.004)
    box((-w / 2 + 0.006, -d / 2 - 0.001, 0.004), (w / 2 - 0.004, d / 2 - 0.006, h - 0.004), (0.75, 0.72, 0.62))  # pages
    XF = keep


def lamp(h, shade_r, base_r=0.1):
    """a lamp standing at the origin, h tall to the top of its shade"""
    cyl(0, 0, 0, 0.025, base_r, DARK)
    cyl(0, 0, 0.025, h - 0.18, 0.012, METAL, segments=10)
    cyl(0, 0, h - 0.22, h, shade_r, SHADE, r1=shade_r * 0.7)


# ------------------------------------------------------------------ Voss's crew room (world)
print('Voss\'s crew room')
for n in ('BedCrew00.002', 'WallPanel00.002'):
    retire(n)
R1 = 'Bedroom1'

XF = place(26.05, 1.15)                                                                            # the rug
rug(2.6, 1.9, TERRACOTTA, RUST, CREAM)
make('Dress_VossRug', R1)

XF = place(24.55, 3.92)                                                                            # the runner
rug(4.0, 0.62, SLATE, (0.07, 0.09, 0.13))
make('Dress_VossRunner', R1)

ON_RUG = FLOOR + 0.013
XF = place(26.05, 1.15, ON_RUG)                                                                    # the table
cyl(0, 0, 0, 0.02, 0.26, DARK)
cyl(0, 0, 0.02, 0.70, 0.05, METAL, segments=12)
cyl(0, 0, 0.70, 0.74, 0.44, WOOD, segments=28)
mug(-0.16, 0.10, 0.74, ORANGE)
mug(0.18, -0.12, 0.74, WHITE)
box((0.02, 0.12, 0.74), (0.08, 0.21, 0.755), WHITE, bevel=0.002)                                     # the deck
for k, (x, y, t) in enumerate(((-0.05, -0.05, 0.3), (0.09, 0.02, -0.5), (-0.12, -0.18, 1.1), (0.14, 0.2, 0.2))):
    XF_ = XF
    XF = XF @ Matrix.Translation((x, y, 0.741 + 0.001 * k)) @ Matrix.Rotation(t, 4, 'Z')
    box((-0.03, -0.045, 0), (0.03, 0.045, 0.002), WHITE if k % 2 else (0.75, 0.2, 0.15))
    XF = XF_
book(-0.02, -0.26, 0.74, 0.16, 0.23, 0.035, BLANKET, turn=0.35)
make('Dress_VossTable', R1)

XF = place(25.35, 1.0, ON_RUG, turn=-math.pi / 2)                                                  # chairs, facing it
chair()
jacket_over_back(ITO)
make('Dress_VossChairA', R1)
XF = place(26.55, 1.85, ON_RUG, turn=math.pi * 0.85)
chair()
make('Dress_VossChairB', R1)

XF = place(27.55, -0.85, turn=0.2)                                                                 # a kit bag by the lockers
duffel(CANVAS)
make('Dress_VossBag', R1)

XF = place(27.55, 3.85)                                                                            # the laundry basket
cyl(0, 0, 0, 0.42, 0.24, PANEL, r1=0.26)
cyl(0, 0, 0.40, 0.44, 0.265, METAL)
box((-0.2, -0.17, 0.40), (0.18, 0.2, 0.50), SHEET, bevel=0.05, segments=2, smooth=True, cuts=4, rumple=0.03)
box((-0.12, -0.05, 0.44), (0.22, 0.12, 0.53), ITO, bevel=0.04, segments=2, smooth=True)
box((-0.24, 0.02, 0.30), (-0.16, 0.16, 0.50), PARK, bevel=0.03, smooth=True)                         # a sleeve over the rim
make('Dress_VossBasket', R1)

XF = place(23.25, 4.0, ON_RUG, turn=0.1)                                                           # his slippers
for x in (-0.07, 0.07):
    box((x - 0.05, -0.12, 0), (x + 0.05, 0.13, 0.045), (0.2, 0.22, 0.26), bevel=0.02, segments=2, smooth=True)
make('Dress_VossSlippers', R1)

# by the door, where the lockers stood: the coat rail on the south wall (its face at y -2.99) and a bench
SOUTH = -2.99
XF = Matrix.Translation((19.5, SOUTH, 0))         # (the room is +y of the wall)
box((-1.05, 0.0, 7.12), (1.05, 0.03, 7.22), WOOD, bevel=0.01)                                      # the rail
for x in (-0.75, -0.05, 0.65):
    box((x - 0.012, 0.03, 7.13), (x + 0.012, 0.11, 7.155), METAL, bevel=0.005)                    # hooks
XF = Matrix.Translation((19.5 - 0.75, SOUTH + 0.12, 7.14))
coat(NAVARRO)
XF = Matrix.Translation((19.5 - 0.05, SOUTH + 0.12, 7.14))
coat(PARK, length=0.86, width=0.42)
XF = Matrix.Translation((19.5 + 0.65, SOUTH + 0.10, 7.04))
cyl(0, 0.04, 0.0, 0.1, 0.1, SLATE, r1=0.095)                                                        # a cap on the last hook
box((-0.1, 0.06, 0.0), (0.1, 0.17, 0.02), SLATE, bevel=0.008)
box((-0.04, 0.0, -0.45), (0.04, 0.04, 0.0), TERRACOTTA, bevel=0.01, smooth=True)                    # and a scarf
make('Dress_VossCoats', R1)

XF = Matrix.Translation((19.5, SOUTH, FLOOR))
box((-0.9, 0.04, 0.40), (0.9, 0.42, 0.46), WOOD, bevel=0.012)                                       # the bench
for x in (-0.86, 0.82):
    box((x, 0.06, 0), (x + 0.04, 0.40, 0.40), METAL, bevel=0.006)
box((-0.84, 0.08, 0.12), (0.84, 0.38, 0.14), METAL, bevel=0.005)                                     # its shoe shelf
XF = Matrix.Translation((19.5 + 0.35, SOUTH + 0.24, FLOOR + 0.46))
duffel(SLATE, l=0.55, r=0.14)
XF = Matrix.Translation((19.5, SOUTH, FLOOR + 0.14))
boot(-0.62, 0.24, 0.0)
boot(-0.48, 0.24, 0.05)
boot(-0.12, 0.25, -0.1, color=CANVAS)
boot(0.02, 0.25, -0.05, color=CANVAS)
make('Dress_VossBench', R1)

XF = Matrix.Translation((26.05, SOUTH, FLOOR))                                                      # a poster
box((-0.32, 0.0, 1.05), (0.32, 0.012, 1.90), (0.7, 0.66, 0.55))
box((-0.27, 0.012, 1.45), (0.27, 0.016, 1.84), BLANKET)
box((-0.27, 0.012, 1.10), (0.27, 0.016, 1.42), (0.05, 0.25, 0.33))
box((-0.2, 0.016, 1.62), (0.12, 0.019, 1.66), ORANGE)
box((-0.2, 0.016, 1.56), (0.05, 0.019, 1.59), WHITE)
make('Dress_VossPoster', R1)

# ------------------------------------------------------------------ Kessler's room (its plan: z from its floor, so place(..., 0))
print('Kessler\'s room')
for n in ('Sci-fi-Bed', 'Cube.011', 'Box001', 'Canister00.001', 'ToolCrate03.002'):
    retire(n)
R2 = 'Bedroom2'
shell = D.objects['Cube.009']
ax = Vector((shell.matrix_world.col[0][0], shell.matrix_world.col[0][1], 0)).normalized()
ROT = Matrix.Rotation(math.atan2(ax.y, ax.x), 4, 'Z')
pts = [ROT.inverted() @ (shell.matrix_world @ v.co) for v in shell.data.vertices]
lo = Vector([min(p[i] for p in pts) for i in range(3)])
hi = Vector([max(p[i] for p in pts) for i in range(3)])
PLAN = Matrix.Translation(ROT @ Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))) @ ROT
HX, HY = (hi.x - lo.x) / 2, (hi.y - lo.y) / 2        # the walls: x -HX (the bed's head), y -HY (its side), +x the door's

# her bed, along the -y wall with its head on the -x wall: 2.15 long, 1.3 wide
BH, BF = -HX + 0.03, -HX + 0.03 + 2.15            # head, foot
BB, BX = -HY + 0.03, -HY + 0.03 + 1.30           # by the wall, the open side
XF = Matrix.Identity(4)
box((BH + 0.06, BB, 0), (BF, BX - 0.03, 0.30), METAL, bevel=0.008)                                 # the plinth
for xa, xb in ((BH + 0.25, BH + 1.05), (BH + 1.15, BF - 0.12)):                                    # its drawers
    box((xa, BX - 0.045, 0.04), (xb, BX - 0.03, 0.24), PANEL, bevel=0.004)
    m = (xa + xb) / 2
    box((m - 0.12, BX - 0.03, 0.07), (m + 0.12, BX - 0.01, 0.095), DARK, bevel=0.004)
box((BH, BB - 0.02, 0), (BH + 0.06, BX + 0.02, 1.20), METAL, bevel=0.01)                            # the headboard
box((BH + 0.06, BB + 0.06, 0.62), (BH + 0.09, BX - 0.04, 1.12), PANEL, bevel=0.025, segments=2, smooth=True)  # padded
box((BH + 0.065, BX - 0.36, 1.05), (BH + 0.10, BX - 0.10, 1.07), CYAN)                              # reading light
box((BH + 0.09, BB + 0.04, 0.30), (BF - 0.03, BX - 0.06, 0.48), SHEET, bevel=0.045, segments=3, smooth=True)   # mattress
for y0 in (BB + 0.10, BB + 0.66):                                                                    # pillows
    box((BH + 0.13, y0, 0.48), (BH + 0.55, y0 + 0.52, 0.61), PILLOW, bevel=0.055, segments=3, smooth=True)
box((BH + 0.62, BB + 0.02, 0.48), (BF - 0.01, BX - 0.03, 0.53), BLANKET, bevel=0.015, segments=2, smooth=True)   # the duvet
box((BH + 0.62, BX - 0.06, 0.20), (BF - 0.01, BX - 0.03, 0.53), BLANKET, bevel=0.012, smooth=True)              # over the edge
box((BH + 0.58, BB + 0.03, 0.53), (BH + 0.80, BX - 0.04, 0.565), WHITE, bevel=0.012, segments=2, smooth=True)     # turned down
box((BF - 0.48, BB + 0.02, 0.53), (BF - 0.10, BX - 0.02, 0.585), TERRACOTTA, bevel=0.02, segments=2, smooth=True)  # the throw
box((BF - 0.48, BX - 0.04, 0.33), (BF - 0.10, BX - 0.01, 0.585), TERRACOTTA, bevel=0.012, smooth=True)
make('Dress_KessBed', R2, PLAN)

XF = place(BH + 0.25, BX + 0.28, 0)                                                                 # the nightstand
box((-0.22, -0.22, 0), (0.22, 0.22, 0.55), WOOD, bevel=0.012)
box((-0.19, 0.22, 0.30), (0.19, 0.225, 0.50), (0.4, 0.24, 0.12), bevel=0.004)
box((-0.04, 0.225, 0.39), (0.04, 0.24, 0.41), METAL)
XF = place(BH + 0.18, BX + 0.22, 0.55)
lamp(0.42, 0.12, 0.07)
XF = place(BH + 0.25, BX + 0.28, 0)
book(0.08, 0.10, 0.55, 0.14, 0.2, 0.03, SAGE, turn=-0.2)
make('Dress_KessNightstand', R2, PLAN)

XF = place((BH + BF) / 2 + 0.2, BX + 0.75, 0)                                                         # the rug
rug(1.7, 1.15, CREAM, SAGE)
make('Dress_KessRug', R2, PLAN)

# a reading corner by the bed's foot, against the same wall: an armchair and a floor lamp
XF = place(BF + 0.65, -HY + 0.45, 0)
box((-0.38, -0.40, 0.0), (0.38, 0.36, 0.40), SAGE, bevel=0.04, segments=2, smooth=True)             # the seat
box((-0.38, -0.42, 0.40), (0.38, -0.20, 0.92), SAGE, bevel=0.05, segments=2, smooth=True)           # the back
for xa, xb in ((-0.38, -0.27), (0.27, 0.38)):                                                      # arms
    box((xa, -0.40, 0.40), (xb, 0.36, 0.60), SAGE, bevel=0.04, segments=2, smooth=True)
box((-0.27, -0.18, 0.40), (0.27, 0.32, 0.50), (0.38, 0.44, 0.31), bevel=0.04, segments=2, smooth=True)   # cushion
box((0.27, -0.25, 0.60), (0.38, 0.30, 0.64), CREAM, bevel=0.015, smooth=True)                        # a throw over the arm
box((0.36, -0.25, 0.35), (0.40, 0.30, 0.64), CREAM, bevel=0.012, smooth=True)
XF = place(BF + 1.25, -HY + 0.25, 0)
lamp(1.55, 0.2, 0.15)
make('Dress_KessReading', R2, PLAN)

XF = place(HX, -1.55, 0, turn=math.pi / 2)        # her lab coat, on a hook on the door's wall (+y here is into the room)
box((-0.05, 0.0, 1.66), (0.05, 0.03, 1.74), WOOD, bevel=0.008)
box((-0.012, 0.03, 1.68), (0.012, 0.11, 1.70), METAL)
XF = place(HX - 0.11, -1.55, 1.69, turn=math.pi / 2)
coat(WHITE, length=1.05, width=0.46)
make('Dress_KessCoat', R2, PLAN)

XF = place((BH + BF) / 2 + 0.1, -HY, 0)           # a picture over the bed, on the -y wall, facing in
box((-0.45, 0.0, 1.30), (0.45, 0.03, 1.90), WOOD, bevel=0.008)
box((-0.40, 0.03, 1.35), (0.40, 0.035, 1.85), (0.62, 0.6, 0.52))
box((-0.36, 0.035, 1.38), (0.36, 0.04, 1.58), SAGE)
box((-0.36, 0.035, 1.58), (0.36, 0.04, 1.82), (0.25, 0.42, 0.55))
box((0.05, 0.04, 1.62), (0.18, 0.045, 1.75), SHADE)
make('Dress_KessPicture', R2, PLAN)

# a tall, metal-framed mirror on the clear +y wall, opposite the bed's picture
XF = place(0.9, HY - 0.05, 0)
box((-0.49, -0.015, 0.12), (0.49, 0.035, 1.92), METAL, bevel=0.018, segments=2)
make('Dress_KessMirrorFrame', R2, PLAN)

XF = place(0.9, HY - 0.05, 0)
box((-0.425, -0.018, 0.19), (0.425, -0.010, 1.85), MIRROR, bevel=0.006)
make('Dress_KessMirror', R2, PLAN)

XF = Matrix.Identity(4)                            # books on her desk (its top at 1.16), squared up
for k, (c, h) in enumerate(((BLANKET, 0.035), (RUST, 0.03), (SAGE, 0.04))):
    book(-2.55, 3.85, 1.16 + sum((0.035, 0.03, 0.04)[:k]), 0.17, 0.24, h, c)
mug(-2.25, 3.62, 1.16, WHITE)
make('Dress_KessDesk', R2, PLAN)

bpy.ops.wm.save_mainfile()
print('done')
