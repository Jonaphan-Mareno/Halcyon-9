"""
The crew bunks in Voss's quarter (l2-atrium.blend, the Bedroom1 collection): two bunks of real
proportions side by side against the north wall, four berths, in place of the sci-fi crew pod
(BedCrew00) that stood in the room as a 4 m white cabinet.

  - a full-height locker at the head of the first bunk, its door facing the room: the tally of his
    cycles is drawn on it (LogHead.js TALLY) and a crew log screen hangs under it (RoomProps.js)
  - each bunk: a plinth with two drawers under the lower berth, a padded back panel, a reading
    light under the upper berth, the upper berth's safety rail, a ladder at the foot, a foot board
  - the berths as their owners left them (RoomProps.js puts their name plates on the fronts):
      Voss, first bunk, lower: slept in, the blanket rumpled, turned back and falling over the edge
      S. Park, first bunk, upper: made, a kit bag at the foot
      R. Navarro, second bunk, lower: made, the blanket folded at the foot
      D. Ito, second bunk, upper: stripped, the bedding stacked on the bare mattress
  - the room's own palette (the bedroom set's vertex colours: the greys, the orange accent, the
    cyan light, the blue, the canvas brown)

BedCrew00 moves to a collection outside the scene (RetiredProps), so it is kept in the file but
neither exported nor given a collider; WallPanel00, which was mounted on its end, turns round onto
the second bunk's foot. One mesh (VossBunk) with a 'Col' corner colour and a VCol.* material (the
game gives VCol.* materials the bedroom's toon look and vertex colours, HabitatSession._loadModel);
the exporter keeps it as authored (no bedroom.blend source) and gives it a collider from its bounds.

Re-runnable. Saves l2-atrium.blend; then export with export_l2_atrium_with_rigs.py.

  blender -b --factory-startup Blender/l2-atrium.blend --python Blender/scripts/build_voss_bunk.py
"""
import math, random, bpy, bmesh
from mathutils import Vector, Matrix

D = bpy.data
ROOM = 'Bedroom1'
NAME = 'VossBunk'
FLOOR = 5.5

# the room's palette (linear, as the bedroom set's 'Col' attributes hold it)
DARK = (0.08, 0.08, 0.08)
METAL = (0.24, 0.24, 0.24)
PANEL = (0.48, 0.48, 0.48)
ORANGE = (1.0, 0.32, 0.0)
CYAN = (0.0, 0.83, 1.0)
CANVAS = (0.48, 0.39, 0.25)
SHEET = (0.70, 0.70, 0.67)
PILLOW = (0.82, 0.82, 0.79)
BLANKET = (0.10, 0.14, 0.50)
MATTRESS = (0.10, 0.13, 0.42)

# the plan (world, metres; the north wall is at y 5.44): the locker, then the bunks, each LENGTH
# long with GAP between them; their front and back; the berths' decks; the tops
X0 = 21.80                      # the locker's west face
LOCKER = 0.60
LENGTH, GAP = 2.12, 0.08
Y0, Y1 = 4.40, 5.40
LOWER, UPPER = 5.80, 6.92
TOP = 7.95                      # the locker's top
POSTS = 7.55                    # the bunks' posts' top
BUNKS = [X0 + LOCKER, X0 + LOCKER + LENGTH + GAP]      # each bunk's head end

parts = []          # (bmesh of one part, colour, smooth)


def box(a, b, color, bevel=0.0, segments=1, smooth=False, cuts=0, rumple=0.0):
    """an axis-aligned box from corner a to corner b, its edges bevelled; cuts subdivide it and
    rumple jitters the top's inner vertices up and down (cloth)"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    size = Vector(b) - Vector(a)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.translate(bm, vec=(Vector(a) + Vector(b)) / 2, verts=bm.verts)
    if cuts:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
    if rumple:
        rnd = random.Random(len(parts))
        top = max(v.co.z for v in bm.verts)
        for v in bm.verts:
            inner = min(v.co.x - a[0], b[0] - v.co.x, v.co.y - a[1], b[1] - v.co.y) > 1e-4
            if abs(v.co.z - top) < 1e-5 and inner:
                v.co.z += rnd.uniform(-rumple, rumple)
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=min(bevel, min(size) * 0.45),
                        segments=segments, affect='EDGES', profile=0.5, clamp_overlap=True)
    parts.append((bm, color, smooth))


# ---------------------------------------------------------------- the locker
XL = X0 + LOCKER
box((X0, Y0, FLOOR), (XL, Y1, TOP), METAL, bevel=0.01)
box((X0 + 0.04, Y0 - 0.015, FLOOR + 0.08), (XL - 0.04, Y0, TOP - 0.07), PANEL, bevel=0.004)      # the door
box((XL - 0.10, Y0 - 0.045, 6.55), (XL - 0.07, Y0 - 0.015, 6.95), DARK, bevel=0.006)             # its handle
for k in range(4):                                                                                 # vent slots
    z = FLOOR + 0.20 + k * 0.045
    box((X0 + 0.12, Y0 - 0.02, z), (XL - 0.12, Y0 - 0.014, z + 0.014), DARK)
box((X0 + 0.10, Y0 - 0.02, TOP - 0.25), (X0 + 0.25, Y0 - 0.014, TOP - 0.17), ORANGE)              # a label
box((X0 - 0.02, Y0 - 0.02, TOP), (XL + 0.02, Y1, TOP + 0.04), DARK, bevel=0.008)                  # the cap


# ---------------------------------------------------------------- a bunk
def bunk(h, head_board):
    """the frame of one bunk, its head end at x = h (against the locker, or a head board of its own)"""
    f = h + LENGTH                                                                                 # the foot
    posts = [(f - 0.06, Y0), (f - 0.06, Y1 - 0.06)]
    if head_board:
        posts += [(h, Y0), (h, Y1 - 0.06)]
        box((h + 0.01, Y0 + 0.06, LOWER - 0.02), (h + 0.05, Y1 - 0.06, POSTS - 0.05), PANEL, bevel=0.006)
    for x, y in posts:
        box((x, y, FLOOR), (x + 0.06, y + 0.06, POSTS), METAL, bevel=0.008)
    box((f - 0.05, Y0 + 0.06, LOWER - 0.02), (f - 0.01, Y1 - 0.06, POSTS - 0.05), PANEL, bevel=0.006)  # foot board
    box((h, Y0 + 0.04, FLOOR), (f - 0.06, Y1, LOWER), METAL, bevel=0.008)                          # the plinth
    for xa, xb in ((h + 0.10, h + 1.00), (h + 1.10, f - 0.16)):                                    # its drawers
        box((xa, Y0 + 0.025, FLOOR + 0.04), (xb, Y0 + 0.04, LOWER - 0.12), PANEL, bevel=0.004)
        m = (xa + xb) / 2
        box((m - 0.12, Y0 + 0.005, FLOOR + 0.07), (m + 0.12, Y0 + 0.025, FLOOR + 0.095), DARK, bevel=0.004)
    box((h, Y1 - 0.04, LOWER), (f - 0.06, Y1, UPPER), PANEL, bevel=0.01)                          # padded back
    box((h, Y0, UPPER), (f - 0.06, Y1, UPPER + 0.10), METAL, bevel=0.01)                          # upper deck
    box((h, Y0 - 0.005, UPPER + 0.075), (f - 0.06, Y0 + 0.002, UPPER + 0.09), ORANGE)             # its edge stripe
    box((h + 0.08, 4.95, UPPER - 0.015), (h + 0.42, 5.30, UPPER), CYAN)                           # reading light
    rail_end = f - 0.60
    box((h + 0.05, Y0, UPPER + 0.10), (h + 0.09, Y0 + 0.04, 7.44), METAL, bevel=0.008)            # rail posts
    box((rail_end - 0.04, Y0, UPPER + 0.10), (rail_end, Y0 + 0.04, 7.44), METAL, bevel=0.008)
    box((h + 0.05, Y0, 7.40), (rail_end, Y0 + 0.04, 7.44), METAL, bevel=0.012)                    # the rail
    # the ladder at the foot, in front of the frame
    for x in (f - 0.50, f - 0.135):
        box((x, Y0 - 0.05, FLOOR), (x + 0.035, Y0 - 0.015, 7.50), METAL, bevel=0.01)
    for z in (6.02, 6.36, 6.70, 7.16):
        box((f - 0.50, Y0 - 0.045, z), (f - 0.10, Y0 - 0.02, z + 0.03), DARK, bevel=0.008)
    return f


def mattress(h, f, deck, color):
    box((h + 0.03, Y0 + 0.07, deck), (f - 0.08, Y1 - 0.05, deck + 0.15), color, bevel=0.04, segments=3, smooth=True)
    return deck + 0.15


def pillow(h, top, w=0.44):
    box((h + 0.08, Y0 + 0.22, top), (h + 0.08 + w, Y1 - 0.10, top + 0.12), PILLOW, bevel=0.055, segments=3, smooth=True)


# the first bunk: Voss below (slept in), Park above (made, a kit bag)
h = BUNKS[0]
f = bunk(h, head_board=False)
top = mattress(h, f, LOWER, SHEET)
pillow(h, top)
box((h + 0.62, Y0 + 0.05, top), (f - 0.07, Y1 - 0.06, top + 0.04), BLANKET, bevel=0.012, segments=2,
    smooth=True, cuts=8, rumple=0.018)
box((h + 0.62, Y0 + 0.03, LOWER + 0.02), (f - 0.07, Y0 + 0.055, top + 0.04), BLANKET, bevel=0.01, smooth=True)   # over the edge
box((h + 0.55, Y0 + 0.06, top + 0.03), (h + 0.78, Y1 - 0.07, top + 0.065), SHEET, bevel=0.012, segments=2, smooth=True)  # turned back
top = mattress(h, f, UPPER + 0.10, SHEET)
pillow(h, top)
box((h + 0.58, Y0 + 0.06, top), (f - 0.07, Y1 - 0.06, top + 0.03), BLANKET, bevel=0.012, segments=2, smooth=True)
box((f - 0.80, Y0 + 0.22, top + 0.03), (f - 0.12, Y1 - 0.15, top + 0.30), CANVAS, bevel=0.12, segments=4, smooth=True)   # kit bag
box((f - 0.55, Y0 + 0.18, top + 0.17), (f - 0.30, Y0 + 0.24, top + 0.24), DARK, bevel=0.01)                              # its strap

# the second bunk: Navarro below (made, the blanket folded at the foot), Ito above (stripped)
h = BUNKS[1]
f = bunk(h, head_board=True)
top = mattress(h, f, LOWER, SHEET)
pillow(h + 0.04, top)
box((f - 0.62, Y0 + 0.10, top), (f - 0.10, Y1 - 0.10, top + 0.09), BLANKET, bevel=0.025, segments=2, smooth=True)
top = mattress(h, f, UPPER + 0.10, MATTRESS)
box((h + 0.30, Y0 + 0.30, top), (h + 0.80, Y1 - 0.18, top + 0.08), BLANKET, bevel=0.02, segments=2, smooth=True)
box((h + 0.32, Y0 + 0.32, top + 0.08), (h + 0.78, Y1 - 0.20, top + 0.12), SHEET, bevel=0.015, segments=2, smooth=True)
box((h + 0.36, Y0 + 0.36, top + 0.12), (h + 0.74, Y1 - 0.22, top + 0.21), PILLOW, bevel=0.035, segments=2, smooth=True)
FOOT = f

# ---------------------------------------------------------------- into one mesh
old = D.objects.get(NAME)
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
    added = len(bm.faces) - before
    colors += [color] * added
    smooth += [sm] * added
D.meshes.remove(tmp)
bm.faces.ensure_lookup_table()
for f_, sm in zip(bm.faces, smooth):
    f_.smooth = sm
me = D.meshes.new(NAME)
bm.to_mesh(me)
bm.free()

col = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
for poly, c in zip(me.polygons, colors):
    for li in poly.loop_indices:
        col.data[li].color = (*c, 1.0)
me.color_attributes.active_color = col
me.color_attributes.render_color_index = me.color_attributes.find('Col')

mat = D.materials.get('VCol.VossBunk') or D.materials.new('VCol.VossBunk')
mat.use_nodes = True
nt = mat.node_tree
nt.nodes.clear()
vc = nt.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Col'
pb = nt.nodes.new('ShaderNodeBsdfPrincipled')
pb.inputs['Base Color'].default_value = (1, 1, 1, 1)
pb.inputs['Roughness'].default_value = 0.85
out = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(vc.outputs['Color'], pb.inputs['Base Color'])
nt.links.new(pb.outputs['BSDF'], out.inputs['Surface'])
me.materials.append(mat)

obj = D.objects.new(NAME, me)
D.collections[ROOM].objects.link(obj)

# ---------------------------------------------------------------- the old pod, and its wall panel
pod = D.objects.get('BedCrew00')
if pod and ROOM in [c.name for c in pod.users_collection]:
    retired = D.collections.get('RetiredProps') or D.collections.new('RetiredProps')
    retired.use_fake_user = True
    for c in list(pod.users_collection):
        c.objects.unlink(pod)
    retired.objects.link(pod)

panel = D.objects.get('WallPanel00')
if panel and ROOM in [c.name for c in panel.users_collection]:
    cs = [panel.matrix_world @ Vector(c) for c in panel.bound_box]
    lo, hi = Vector(map(min, *cs)), Vector(map(max, *cs))
    if hi.x < X0 + 0.1:          # still on the old pod's end: turn it round onto the last bunk's foot
        centre = (lo + hi) / 2
        depth = hi.x - lo.x
        # (sunk into the foot board as deep as it was into the pod; its top no higher than the posts)
        to = Vector((FOOT + depth / 2 - (hi.x - X0), Y0 + 0.08 + (hi.y - lo.y) / 2, centre.z - max(0.0, hi.z - POSTS)))
        panel.matrix_world = (Matrix.Translation(to) @ Matrix.Rotation(math.pi, 4, 'Z')
                              @ Matrix.Translation(-centre) @ panel.matrix_world)

bpy.ops.wm.save_mainfile()
print('%s: %d vertices, %d faces; bunks at x %s, foot %.2f; BedCrew00 retired; WallPanel00 at the foot'
      % (NAME, len(me.vertices), len(me.polygons), ['%.2f' % b for b in BUNKS], FOOT))
