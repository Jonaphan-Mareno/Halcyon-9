"""
Export the hand-edited Level 2 atrium (Blender/l2-atrium.blend) to public/assets/models/l2-atrium.glb.

build_l2_atrium.py generates the atrium from scratch; this script instead exports the file AS AUTHORED
in the Blender GUI, so hand-placed content (the Bedroom1 collection = Voss's quarter, appended from
bedroom.blend and positioned behind the DOOR_VOSS gap) comes through untouched.

The bedroom meshes carry no collision of their own, so COL_ boxes are generated around the Bedroom1
world bounds at export time (floor, ceiling, N/S/E walls, and the open west face sealed outside the
atrium door gap). They are NOT saved back into l2-atrium.blend.

Two-file workflow: model/colour the room in bedroom.blend; place it in l2-atrium.blend. At export
every Bedroom1 object takes its mesh + materials from the same-named object in bedroom.blend, so
the placement and the content can be edited independently.

  blender -b --factory-startup --python Blender/scripts/export_l2_atrium.py -- [out.glb]
"""
import sys, os, bpy, bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', 'l2-atrium.blend'))
BEDROOM = os.path.normpath(os.path.join(HERE, '..', 'bedroom.blend'))
OUT_GLB = os.path.normpath(argv[0] if len(argv) > 0 else os.path.join(HERE, '..', '..', 'public', 'assets', 'models', 'l2-atrium.glb'))

ROOM_COLL = 'Bedroom1'
GAP_Y, GAP_Z1 = 2.07, 8.7     # atrium DOOR_VOSS gap: half-width in y, top in z (see build_l2_atrium.py GAPS)
T = 0.12                      # collider thickness

bpy.ops.wm.open_mainfile(filepath=SRC)
D = bpy.data
bpy.context.view_layer.update()

# idempotent: drop anything a previous export generated
for o in [o for o in D.objects if o.name.startswith('COL_Voss') or o.name == 'Voss_WallW']:
    D.objects.remove(o, do_unlink=True)

room = D.collections.get(ROOM_COLL)
if room is None:
    print('no %s collection: exporting the atrium as is' % ROOM_COLL)
else:
    # the GUI may have left the collection hidden; the export only takes visible objects
    room.hide_viewport = room.hide_render = False
    for o in room.all_objects:
        o.hide_viewport = False
        o.hide_render = False
        o.hide_set(False)
    for lc in bpy.context.view_layer.layer_collection.children:
        if lc.name == ROOM_COLL:
            lc.exclude = False
            lc.hide_viewport = False

    # l2-atrium.blend holds the room's PLACEMENT; bedroom.blend holds its meshes, vertex colours and
    # materials (the appended copy predates the colouring). Swap each placed object's mesh for the
    # same-named one in bedroom.blend so edits there show up without re-placing anything.
    # Append reuses a local ID of the same name instead of bringing in the fresh one, so the stale
    # meshes/materials are renamed out of the way first.
    placed = [o for o in room.all_objects if o.type == 'MESH']
    names = [o.name for o in placed]          # bpy.data is restricted inside libraries.load
    for o in placed:
        o.data.name = 'OLD_' + o.data.name
        for m in o.data.materials:
            if m and not m.name.startswith('OLD_'):
                m.name = 'OLD_' + m.name
    with bpy.data.libraries.load(BEDROOM, link=False) as (src, dst):
        avail = list(src.objects)
        wanted = [n for n in names if n in avail]
        dst.objects = wanted
    print('bedroom.blend offers %d objects' % len(avail))
    # appended objects arrive renamed (.001) because of the clash, but in request order
    fresh = dict(zip(wanted, dst.objects))
    swapped = 0
    for o in placed:
        f = fresh.get(o.name)
        if f is not None and f.type == 'MESH':
            o.data = f.data
            swapped += 1
    for f in fresh.values():
        if f is not None:
            D.objects.remove(f, do_unlink=True)
    missing = [n for n in names if n not in fresh]
    print('refreshed %d/%d meshes from bedroom.blend%s' % (swapped, len(placed), (' (not found: %s)' % missing) if missing else ''))

    # the glTF exporter only carries vertex colours through a Color Attribute node feeding a
    # Principled Base Color; rebuild the authored Attribute -> Diffuse BSDF trees that way
    for m in {s.material for o in room.all_objects if o.type == 'MESH' for s in o.material_slots if s.material}:
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

    mn, mx = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in room.all_objects:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn, mx = Vector(map(min, mn, w)), Vector(map(max, mx, w))
    print('%s bounds x %.2f..%.2f  y %.2f..%.2f  z %.2f..%.2f' % (ROOM_COLL, mn.x, mx.x, mn.y, mx.y, mn.z, mx.z))

    col_coll = D.collections.new('Voss_Collision')
    bpy.context.scene.collection.children.link(col_coll)

    def box(name, x0, x1, y0, y1, z0, z1, mat=None):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(x1 - x0, y1 - y0, z1 - z0), verts=bm.verts)
        bmesh.ops.translate(bm, vec=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), verts=bm.verts)
        me = D.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        if mat:
            me.materials.append(mat)
        ob = D.objects.new(name, me)
        col_coll.objects.link(ob)
        return ob

    FZ, TOP = mn.z, max(mx.z, GAP_Z1)
    box('COL_VossFloor', mn.x, mx.x, mn.y, mx.y, FZ - T, FZ)
    box('COL_VossCeil',  mn.x, mx.x, mn.y, mx.y, TOP, TOP + T)
    box('COL_VossWallN', mn.x, mx.x, mx.y - T, mx.y, FZ, TOP)
    box('COL_VossWallS', mn.x, mx.x, mn.y, mn.y + T, FZ, TOP)
    box('COL_VossWallE', mx.x - T, mx.x, mn.y, mx.y, FZ, TOP)
    # the west face is open all the way along; only the atrium door gap (|y| < GAP_Y) is a real
    # opening, so close the rest against the back of the cylinder wall
    if mn.y < -GAP_Y:
        box('COL_VossWallW1', mn.x, mn.x + T, mn.y, -GAP_Y, FZ, TOP)
    if mx.y > GAP_Y:
        box('COL_VossWallW2', mn.x, mn.x + T, GAP_Y, mx.y, FZ, TOP)
        # and give it a face to look at, in the room shell's own material
        shell = D.objects.get('Cube')
        mat = shell.data.materials[0] if shell and shell.data.materials else None
        box('Voss_WallW', mn.x, mn.x + T, GAP_Y, mx.y, FZ, mx.z, mat)
    if TOP > GAP_Z1:
        box('COL_VossWallWTop', mn.x, mn.x + T, -GAP_Y, GAP_Y, GAP_Z1, TOP)

bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_visible=True,
                          export_apply=True, export_yup=True, export_image_format='WEBP')
print('exported', OUT_GLB)
