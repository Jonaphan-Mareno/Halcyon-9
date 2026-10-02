"""
Shared building kit for the level 2 Blender scripts (the wings). Same palette and the same
material names as the hub, so the game's textures and glow shaders apply to everything.

Use from a build script:
    import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from kit import *
    begin('Wing1')            # empty scene + collections
    ...build with box / beam / cyl ...
    finish(out_blend, out_glb)

Units are metres, Z is up (the glTF exporter converts to Y-up). Name prefixes the game reads:
COL_ collision only, GATE_ doors the game opens, SPAWN_ / TAPE_ / LAMP_ / PT_ empties.
"""
import bpy, bmesh, math
from mathutils import Vector, Matrix

rad = math.radians
VIS = None
COLL = None
MATS = {}
ACC = {}
CS = None


def mat(name, color, rough=0.7, metal=0.1, emit=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1)
        b.inputs['Emission Strength'].default_value = strength
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
    m.diffuse_color = (*color, 1)
    MATS[name] = m
    return m


def _palette():
    mat('hull_light', (0.36, 0.37, 0.39), 0.45, 0.55)
    mat('hull_mid', (0.23, 0.24, 0.26), 0.5, 0.55)
    mat('hull_dark', (0.08, 0.085, 0.095), 0.55, 0.55)
    mat('floor_dark', (0.14, 0.145, 0.16), 0.45, 0.5)
    mat('trim', (0.30, 0.32, 0.35), 0.45, 0.65)
    mat('rust', (0.30, 0.17, 0.13), 0.75, 0.3)
    mat('pipe_black', (0.04, 0.042, 0.048), 0.5, 0.7)
    mat('lamp_warm', (1.0, 0.85, 0.6), 0.4, 0, (1.0, 0.8, 0.5), 2.2)
    mat('tile_glow', (0.02, 0.08, 0.09), 0.6, 0, (0.2, 0.85, 0.95), 0.5)
    mat('blue_glow', (0.1, 0.5, 0.9), 0.4, 0, (0.15, 0.65, 1.0), 3.2)
    mat('white_glow', (0.8, 0.9, 1.0), 0.4, 0, (0.8, 0.9, 1.0), 5.0)
    mat('door_a_glow', (0.1, 0.9, 1.0), 0.4, 0, (0.15, 0.95, 1.0), 2.6)
    mat('hazard', (0.75, 0.5, 0.1), 0.5, 0.2, (0.9, 0.55, 0.1), 0.6)
    mat('water', (0.02, 0.06, 0.09), 0.08, 0.0, (0.1, 0.45, 0.8), 0.9)
    mat('col', (1, 0, 1), 1.0, 0)


def begin(name):
    global VIS, COLL, CS
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    VIS = bpy.data.collections.new(name + '_Visual')
    COLL = bpy.data.collections.new(name + '_Collision')
    scene.collection.children.link(VIS)
    scene.collection.children.link(COLL)
    _palette()
    CS = Acc('COL_' + name, COLL)


class Acc:
    def __init__(self, name, coll=None, origin=None):
        self.name = name
        self.coll = coll if coll is not None else VIS
        self.bm = bmesh.new()
        self.mats = []
        self.origin = origin

    def tag(self, mname, faces):
        if mname not in self.mats:
            self.mats.append(mname)
        i = self.mats.index(mname)
        for f in faces:
            f.material_index = i


def A(name, origin=None):
    if name not in ACC:
        ACC[name] = Acc(name, origin=origin)
    return ACC[name]


def _faces(verts):
    out = set()
    for v in verts:
        out.update(v.link_faces)
    return out


def _box(acc, m, lo, hi):
    """Axis-aligned box from corner lo to corner hi."""
    verts = bmesh.ops.create_cube(acc.bm, size=1.0)['verts']
    c = (Vector(lo) + Vector(hi)) / 2
    s = Vector(hi) - Vector(lo)
    mx = Matrix.Translation(c) @ Matrix.Diagonal((s.x, s.y, s.z, 1.0))
    bmesh.ops.transform(acc.bm, matrix=mx, verts=verts)
    acc.tag(m, _faces(verts))


def box(acc, m, lo, hi, col=False):
    _box(acc, m, lo, hi)
    if col:
        _box(CS, 'col', lo, hi)


def col_box(lo, hi):
    _box(CS, 'col', lo, hi)


def beam(acc, m, p0, p1, w, h):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = d.to_track_quat('X', 'Z')
    verts = bmesh.ops.create_cube(acc.bm, size=1.0)['verts']
    mx = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((d.length, w, h, 1.0))
    bmesh.ops.transform(acc.bm, matrix=mx, verts=verts)
    acc.tag(m, _faces(verts))


def cyl(acc, m, c, r, h, seg=16, axis='Z'):
    verts = bmesh.ops.create_cone(acc.bm, cap_ends=True, cap_tris=False, segments=seg,
                                  radius1=r, radius2=r, depth=h)['verts']
    rot = Matrix.Identity(4)
    if axis == 'X':
        rot = Matrix.Rotation(rad(90), 4, 'Y')
    elif axis == 'Y':
        rot = Matrix.Rotation(rad(90), 4, 'X')
    bmesh.ops.transform(acc.bm, matrix=Matrix.Translation(Vector(c)) @ rot, verts=verts)
    acc.tag(m, _faces(verts))


def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'
    e.location = loc
    VIS.objects.link(e)
    return e


def flush(acc):
    bm = acc.bm
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if acc.origin is not None:
        bmesh.ops.translate(bm, vec=-Vector(acc.origin), verts=bm.verts[:])
    me = bpy.data.meshes.new(acc.name)
    bm.to_mesh(me)
    bm.free()
    for mname in acc.mats:
        me.materials.append(MATS[mname])
    ob = bpy.data.objects.new(acc.name, me)
    acc.coll.objects.link(ob)
    if acc.origin is not None:
        ob.location = acc.origin
    if acc.coll is COLL:
        ob.display_type = 'WIRE'
    return ob


def finish(out_blend=None, out_glb=None):
    objs = [flush(a) for a in list(ACC.values())]
    flush(CS)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    print('objects:', len(objs), 'visible triangles ~', tris)
    if out_blend:
        bpy.ops.wm.save_as_mainfile(filepath=out_blend)
        print('saved', out_blend)
    if out_glb:
        bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_visible=True,
                                  export_apply=True, export_yup=True)
        print('exported', out_glb)
