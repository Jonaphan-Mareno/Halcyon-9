"""
Export the hand-edited Level 2 atrium (Blender/l2-atrium.blend) to public/assets/models/l2-atrium.glb.

build_l2_atrium.py generates the atrium from scratch; this script instead exports the file AS AUTHORED
in the Blender GUI, so hand-placed content (the Bedroom1/Bedroom2 collections = Voss's and Kessler's
quarters, placed behind the DOOR_VOSS/DOOR_KESSLER gaps) comes through untouched.

The bedroom meshes carry no collision of their own, so at export time COL_ boxes are generated and NOT
saved back into l2-atrium.blend: one per furniture object (its own bounds, so the bed, shelves and
crates are solid) plus a room envelope (floor, ceiling, side and back walls, and the open face sealed
outside the atrium door gap). The envelope is sized by the room shell - the big 'Cube' box - never
by the furniture, so props parked in another room's space or beyond the walls get their own collider
without stretching their room's floor and walls around them. It is built in the room's placement
frame and rotated into place, so a room placed at any angle around the atrium collides correctly.

Two-file workflow: model/colour the room in bedroom.blend; place it in l2-atrium.blend. At export
every bedroom object takes its vertex colours + materials from its bedroom.blend source (geometry
stays as placed, since the two copies are baked differently). A source is found by exact name, by
geometry signature (vertex/face counts + local bounds) against the rooms' exact-named originals, or
by name with Blender's .NNN duplicate suffix stripped - which also catches furniture re-added later
as fresh, differently-baked copies. An object edited past matching topology (the extended room
shell) keeps its geometry and takes the source's material slots only.

Props with no bedroom source are the user's own. glTF samples textures by UV only, so one whose
image textures are wired through Generated or Object coordinates would export with its textures
silently dropped (the sci-fi bed went out white with orange stripes that way): such textures are
rewired to UV and their faces box-projected - the mapping the Generated coordinates show in the
viewport - before the glTF export. In memory only; the .blend is never touched.

  blender -b --factory-startup --python Blender/scripts/export_l2_atrium.py -- [out.glb]
"""
import sys, os, math, re, bpy, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', 'l2-atrium.blend'))
BEDROOM = os.path.normpath(os.path.join(HERE, '..', 'bedroom.blend'))
OUT_GLB = os.path.normpath(argv[0] if len(argv) > 0 else os.path.join(HERE, '..', '..', 'public', 'assets', 'models', 'l2-atrium.glb'))

# placed collection -> collider prefix + the atrium door gap it opens onto (build_l2_atrium.py GAPS)
ROOMS = [
    ('Bedroom1', 'Voss', dict(a0=353, a1=367, z0=5.5, z1=8.7)),   # east gallery, DOOR_VOSS
    ('Bedroom2', 'Kess', dict(a0=38, a1=52, z0=5.5, z1=8.7)),     # north-east gallery, DOOR_KESSLER
]
R = 17.0          # inner radius of the atrium outer wall
T = 0.12          # collider thickness

bpy.ops.wm.open_mainfile(filepath=SRC)
D = bpy.data
bpy.context.view_layer.update()

# idempotent: drop anything a previous export generated
for o in [o for o in D.objects if o.name.startswith(('COL_Voss', 'COL_Kess')) or o.name in ('Voss_WallW', 'Kess_WallW')]:
    D.objects.remove(o, do_unlink=True)


def signature(o):
    """identity of the geometry that survives a GUI duplicate: counts + local bounds"""
    me = o.data
    bb = [Vector(c) for c in o.bound_box]
    lmn, lmx = Vector(map(min, *bb)), Vector(map(max, *bb))
    return (len(me.vertices), len(me.polygons),
            tuple(round(v, 4) for v in lmn), tuple(round(v, 4) for v in lmx))


rooms = []
for coll_name, prefix, gap in ROOMS:
    room = D.collections.get(coll_name)
    if room is None:
        print('no %s collection: exporting the atrium without it' % coll_name)
        continue
    # the GUI may have left the collection hidden; the export only takes visible objects
    room.hide_viewport = room.hide_render = False
    for o in list(room.all_objects):     # (a copy: unhiding while iterating can leave stale entries)
        o.hide_viewport = False
        o.hide_render = False
        o.hide_set(False)
    for lc in bpy.context.view_layer.layer_collection.children:
        if lc.name == coll_name:
            lc.exclude = False
            lc.hide_viewport = False
    objs = [o for o in room.all_objects if o.type == 'MESH']
    # placement frame: the collection move ended up as nearly every object's own transform, so the
    # most common transform is the room's frame (stragglers like the shell's nudge keep their own)
    groups = {}
    for o in objs:
        key = (tuple(round(v, 4) for v in o.location), tuple(round(v, 4) for v in o.rotation_euler),
               tuple(round(v, 4) for v in o.scale))
        groups.setdefault(key, []).append(o)
    frame = max(groups.values(), key=len)[0].matrix_world.copy()
    rooms.append(dict(coll=room, prefix=prefix, gap=gap, objs=objs, frame=frame))

# l2-atrium.blend holds the rooms' PLACEMENT; bedroom.blend holds their vertex colours and materials
# (the placed copies predate the colouring). The two copies share topology but not baking, so the
# geometry must stay as placed: only the colour attribute and material slots are copied across,
# per source object.
source_of = {}
for r in rooms:
    for o in r['objs']:
        source_of.setdefault(signature(o), o.name)

def base_name(n):
    """Blender's duplicate suffix stripped: Crate00.001 -> Crate00"""
    return re.sub(r'\.\d{3}$', '', n)

def resolve(o):
    """the bedroom.blend object a placed mesh takes its look from: its own exact name, the
    signature's first claimer (Bedroom1's originals claim the baked signatures; the rooms'
    duplicates inherit through them), then either with the .NNN suffix stripped - furniture
    the user re-added as fresh, differently-baked copies only matches that last way"""
    cands = [o.name, source_of.get(signature(o))]
    cands += [base_name(n) for n in cands]
    for cand in filter(None, cands):
        if cand in bedroom_names:
            return cand
    return None

# bpy.data is restricted inside libraries.load: read the names first, append later
with bpy.data.libraries.load(BEDROOM, link=False) as (src, _):
    bedroom_names = set(src.objects)
    bedroom_mats = set(src.materials)
pairs = [(o, resolve(o)) for r in rooms for o in r['objs']]

# append reuses a local ID of the same name instead of bringing in the fresh one, so materials
# that clash with bedroom.blend's names are renamed out of the way first - only those: anything
# the user authored in place (a textured prop) keeps its own names
for o, n in pairs:
    if n is None:
        continue
    for m in o.data.materials:
        if m and m.name in bedroom_mats and not m.name.startswith('OLD_'):
            m.name = 'OLD_' + m.name
wanted = sorted({n for _, n in pairs if n})
with bpy.data.libraries.load(BEDROOM, link=False) as (src, dst):
    dst.objects = list(wanted)                # a copy: Blender fills the list it is given in place
# appended objects arrive renamed (.001) because of the clash, but in request order
fresh = dict(zip(wanted, dst.objects))
known = {id(o) for o in D.objects}            # what existed before the append stays put

coloured, skipped = 0, []
for o, n in pairs:
    if n is None:
        skipped.append('%s (no bedroom.blend match - kept as authored)' % o.name)
        continue
    f = fresh.get(n)
    if f is None or f.type != 'MESH':
        skipped.append('%s (no %s in bedroom.blend)' % (o.name, n))
        continue
    if f is o or f.data == o.data:
        coloured += 1                         # its own source, e.g. a wired RoboArm mesh
        continue
    me, src_me = o.data, f.data
    if len(me.loops) != len(src_me.loops) or len(me.polygons) != len(src_me.polygons):
        if n == o.name:
            # edited since bedroom.blend (e.g. the extended room shell): the geometry stays as
            # placed, so only the material slots carry over - the shell never had vertex colours
            me.materials.clear()
            for m in src_me.materials:
                me.materials.append(m)
            skipped.append('%s (topology differs from %s - materials only)' % (o.name, n))
        else:
            skipped.append('%s (topology differs from %s - kept as authored)' % (o.name, n))
        continue
    me.materials.clear()
    for m in src_me.materials:
        me.materials.append(m)
    src_col = src_me.color_attributes.active_color or (src_me.color_attributes[0] if src_me.color_attributes else None)
    if src_col is not None:
        for a in list(me.color_attributes):
            me.color_attributes.remove(a)
        col = me.color_attributes.new(src_col.name, src_col.data_type, src_col.domain)
        buf = [0.0] * (len(src_col.data) * 4)
        src_col.data.foreach_get('color', buf)
        col.data.foreach_set('color', buf)
        me.color_attributes.active_color = col
        me.color_attributes.render_color_index = me.color_attributes.find(col.name)
    coloured += 1
for f in fresh.values():
    if f is not None and id(f) not in known:
        me, was_mesh = f.data, f.type == 'MESH'
        D.objects.remove(f, do_unlink=True)
        if me and me.users == 0:
            (D.meshes if was_mesh else D.armatures).remove(me)
print('coloured %d/%d meshes from bedroom.blend%s' % (coloured, len(pairs), (' (skipped: %s)' % skipped) if skipped else ''))

# props with no bedroom source are the user's own: glTF samples textures by UV only, so image
# textures wired through Generated/Object coordinates are silently dropped by the exporter and
# the prop ships in flat base colours. Rewire them to UV and box-project the faces that use
# them - the mapping the Generated coordinates show in the viewport.
for o, n in pairs:
    if n is not None:
        continue                              # bedroom-sourced: its materials come from bedroom.blend
    rewired, rebuilt, touched = 0, [], set()
    for mi, slot in enumerate(o.material_slots):
        m = slot.material
        if m is None or not m.use_nodes:
            continue
        nt = m.node_tree
        coord = next((x for x in nt.nodes if x.type == 'TEX_COORD'), None)
        imgs = [x for x in nt.nodes if x.type == 'TEX_IMAGE']
        for t in imgs:
            bad = next((l for l in nt.links if l.to_socket == t.inputs['Vector']
                        and l.from_node.type == 'TEX_COORD' and l.from_socket.name != 'UV'), None)
            if bad is None or coord is None:
                continue
            nt.links.remove(bad)
            nt.links.new(coord.outputs['UV'], t.inputs['Vector'])
            rewired += 1
            touched.add(mi)
        if not imgs:
            continue
        # a texture the exporter can carry: feeding a live Emission colour, or the Base Color
        # of the Principled/Diffuse that directly feeds the output. Anything else - through a
        # Mix Shader, or into Normal - is silently dropped, so rebuild the tree around the
        # first image texture (in memory; the .blend keeps the authored tree)
        out = next((x for x in nt.nodes if x.type == 'OUTPUT_MATERIAL'), None)
        surf = next((l for l in nt.links if out is not None and l.to_socket == out.inputs['Surface']), None)
        carries = any(l.from_node.type == 'TEX_IMAGE' and l.to_node.type == 'EMISSION' for l in nt.links) \
            or (surf is not None and surf.from_node.type in ('BSDF_PRINCIPLED', 'BSDF_DIFFUSE')
                and any(l.from_node.type == 'TEX_IMAGE' and l.to_node is surf.from_node
                        and l.to_socket.name in ('Base Color', 'Color') for l in nt.links))
        if carries:
            continue
        pb = next((x for x in nt.nodes if x.type == 'BSDF_PRINCIPLED'), None) \
            or nt.nodes.new('ShaderNodeBsdfPrincipled')
        nt.links.new(imgs[0].outputs['Color'], pb.inputs['Base Color'])
        if out is not None:
            nt.links.new(pb.outputs['BSDF'], out.inputs['Surface'])
        rebuilt.append(m.name)
        touched.add(mi)
    if not touched:
        continue
    bm = bmesh.new()
    bm.from_mesh(o.data)
    uv = bm.loops.layers.uv.active or bm.loops.layers.uv.new('UVMap')
    lo = Vector((min(v.co[a] for v in bm.verts) for a in range(3)))
    span = Vector((max(v.co[a] for v in bm.verts) for a in range(3))) - lo
    faces = 0
    for f in bm.faces:
        if f.material_index not in touched:
            continue
        faces += 1
        dom = max(range(3), key=lambda a: abs(f.normal[a]))
        pair = (1, 2) if dom == 0 else ((0, 2) if dom == 1 else (0, 1))
        for l in f.loops:
            l[uv].uv = tuple((l.vert.co[b] - lo[b]) / span[b] if span[b] > 1e-9 else 0.5 for b in pair)
    bm.to_mesh(o.data)
    bm.free()
    print('%s: %d texture(s) rewired to UV%s, %d faces box-projected' % (
        o.name, rewired, (', rebuilt %s' % rebuilt) if rebuilt else '', faces))

# the glTF exporter only carries vertex colours through a Color Attribute node feeding a
# Principled Base Color; rebuild the authored Attribute -> Diffuse BSDF trees that way
for m in {s.material for o, n in pairs if n is not None for s in o.material_slots if s.material}:
    if not m.use_nodes:
        continue
    nt = m.node_tree
    attr = next((n for n in nt.nodes if n.type == 'ATTRIBUTE'), None)
    diffuse = next((n for n in nt.nodes if n.type == 'BSDF_DIFFUSE'), None)
    out = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if not (attr and diffuse and out):
        continue
    layer = attr.attribute_name
    for n in (attr, diffuse):
        nt.nodes.remove(n)
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = layer
    pb = nt.nodes.new('ShaderNodeBsdfPrincipled')
    pb.inputs['Base Color'].default_value = (1, 1, 1, 1)
    pb.inputs['Roughness'].default_value = 0.85
    nt.links.new(vc.outputs['Color'], pb.inputs['Base Color'])
    nt.links.new(pb.outputs['BSDF'], out.inputs['Surface'])

for r in rooms:
    prefix, gap, objs, frame = r['prefix'], r['gap'], r['objs'], r['frame']
    inv = frame.inverted()
    Tl = T / frame.median_scale             # collider thickness in room-local units

    # per-object bounds in the placement frame (each object's own matrix folds in the stragglers
    # that kept a tweaked transform, like the shell's nudge or the bed's own scale)
    room_bb = {}
    for o in objs:
        cs = [inv @ o.matrix_world @ Vector(c) for c in o.bound_box]
        room_bb[o.name] = (Vector(map(min, *cs)), Vector(map(max, *cs)))

    # the envelope is sized by the room SHELL - the biggest 'Cube'-sourced mesh is the
    # architectural box - never by the furniture: props parked in another room's space or
    # beyond the walls must not stretch this room's floor and walls around them
    shell, vol = None, -1.0
    for o in objs:
        if resolve(o) != 'Cube':
            continue
        a, b = room_bb[o.name]
        v = (b.x - a.x) * (b.y - a.y) * (b.z - a.z)
        if v > vol:
            shell, vol = o, v
    if shell is not None:
        lmn, lmx = room_bb[shell.name]
    else:
        lmn = Vector(map(min, *[bb[0] for bb in room_bb.values()]))
        lmx = Vector(map(max, *[bb[1] for bb in room_bb.values()]))
    x0, x1, y0, y1, z0, z1 = lmn.x, lmx.x, lmn.y, lmx.y, lmn.z, lmx.z

    outside = []
    for o in objs:
        a, b = room_bb[o.name]
        if b.x < x0 - .01 or a.x > x1 + .01 or b.y < y0 - .01 or a.y > y1 + .01 or b.z < z0 - .01 or a.z > z1 + .01:
            outside.append(o.name)

    # the door gap is a span of the outer wall's circumference; sampled along it and read in the
    # room's frame it covers a band of local z (width) and y (height) on the open local +x face
    zs, ylo, yhi = [], [], []
    for i in range(17):
        ang = math.radians(gap['a0'] + (gap['a1'] - gap['a0']) * i / 16)
        for z in (gap['z0'], gap['z1']):
            q = inv @ Vector((R * math.cos(ang), R * math.sin(ang), z))
            zs.append(q.z)
            (ylo if z == gap['z0'] else yhi).append(q.y)
    zg0, zg1, yg0, yg1 = min(zs), max(zs), min(ylo), max(yhi)
    ytop = max(y1, yg1)

    wmn, wmx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            wmn, wmx = Vector(map(min, wmn, w)), Vector(map(max, wmx, w))
    print('%s bounds x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f%s' % (
        r['coll'].name, wmn.x, wmx.x, wmn.y, wmx.y, wmn.z, wmx.z,
        (' (+%d outside the shell envelope: %s)' % (len(outside), ', '.join(outside))) if outside else ''))

    col_coll = D.collections.new(prefix + '_Collision')
    bpy.context.scene.collection.children.link(col_coll)

    def box(name, a, b, mat=None, matrix=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=b - a, verts=bm.verts)
        bmesh.ops.translate(bm, vec=(a + b) / 2, verts=bm.verts)
        if matrix is not None:
            bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
        me = D.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        if mat:
            me.materials.append(mat)
        ob = D.objects.new(name, me)
        col_coll.objects.link(ob)
        return ob

    box('COL_%sFloor' % prefix, Vector((x0, y0 - Tl, z0)), Vector((x1, y0, z1)), matrix=frame)
    box('COL_%sCeil' % prefix, Vector((x0, ytop, z0)), Vector((x1, ytop + Tl, z1)), matrix=frame)
    box('COL_%sWallL' % prefix, Vector((x0, y0, z0 - Tl)), Vector((x1, ytop, z0)), matrix=frame)
    box('COL_%sWallR' % prefix, Vector((x0, y0, z1)), Vector((x1, ytop, z1 + Tl)), matrix=frame)
    box('COL_%sWallBack' % prefix, Vector((x0 - Tl, y0, z0)), Vector((x0, ytop, z1)), matrix=frame)
    # the open face is open all the way along; only the atrium door gap is a real opening, so
    # close the rest of it (and the stretch above the gap) against the back of the wall
    if zg0 - z0 > 0.01:
        box('COL_%sWallW1' % prefix, Vector((x1 - Tl, y0, z0)), Vector((x1, ytop, zg0)), matrix=frame)
    if z1 - zg1 > 0.01:
        box('COL_%sWallW2' % prefix, Vector((x1 - Tl, y0, zg1)), Vector((x1, ytop, z1)), matrix=frame)
    if ytop - yg1 > 0.01:
        box('COL_%sWallWTop' % prefix, Vector((x1 - Tl, yg1, zg0)), Vector((x1, ytop, zg1)), matrix=frame)
    if yg0 - y0 > 0.01:
        box('COL_%sWallWBot' % prefix, Vector((x1 - Tl, y0, zg0)), Vector((x1, yg0, zg1)), matrix=frame)
    n_env = len(col_coll.objects)

    # give the wider of the two sealed side slivers a face to look at, in the room shell's own
    # material (the narrow one hides behind the door frame); the shell itself was found when
    # the envelope was sized above
    if shell is not None and shell.data.materials:
        if z1 - zg1 >= zg0 - z0:
            box('%s_WallW' % prefix, Vector((x1 - Tl, y0, zg1)), Vector((x1, y1, z1)), mat=shell.data.materials[0], matrix=frame)
        else:
            box('%s_WallW' % prefix, Vector((x1 - Tl, y0, z0)), Vector((x1, y1, zg0)), mat=shell.data.materials[0], matrix=frame)

    # one collider per object, from its own bounds: the envelope already covers the shell, and
    # anything flush with the open face would sit in the doorway, so that is left to the envelope
    n_obj = 0
    for o in objs:
        ra, rb = room_bb[o.name]
        if rb.x >= x1 - 0.1 and rb.z > zg0 and ra.z < zg1:
            continue
        bb = [Vector(c) for c in o.bound_box]
        a, b = Vector(map(min, *bb)), Vector(map(max, *bb))
        box('COL_%s_%s' % (prefix, resolve(o)), a, b, matrix=o.matrix_world)
        n_obj += 1
    print('%s: door local z %.2f..%.2f, %d envelope + %d object colliders' % (r['coll'].name, zg0, zg1, n_env, n_obj))

bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_visible=True,
                          export_apply=True, export_yup=True, export_image_format='WEBP')
print('exported', OUT_GLB)
