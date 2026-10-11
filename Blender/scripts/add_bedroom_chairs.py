"""
Add two lab-style office chairs to Blender/Bedroom.blend, placed beside Cube.011.

Reuses the chair geometry from build_l2_lab.py's office_chair() (star base + castors, gas
cylinder, seat pad and backrest), adapted to the bedroom's floor at z = 0. The bedroom file is
hand-made (not kit.py based), so this script opens it, builds the chairs into their own mesh
objects with the lab's chair materials, and saves it back.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/add_bedroom_chairs.py
"""
import os, math, bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
BLEND = os.path.join(HERE, '..', 'Bedroom.blend')
rad = math.radians
Z = 0.0                     # bedroom floor

# (position, facing) for the two chairs, tucked beside Cube.011 (the low table at x~0.33, y~0.85)
CHAIRS = [((0.33, 0.35, 0.0), 90.0), ((-0.30, 0.85, 0.0), 0.0)]

MATS = {}


def mat(name, color, rough=0.7, metal=0.1):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        b.inputs['Base Color'].default_value = (*color, 1)
        b.inputs['Roughness'].default_value = rough
        b.inputs['Metallic'].default_value = metal
        m.diffuse_color = (*color, 1)
    MATS[name] = m
    return m


# open first: open_mainfile clears bpy.data, so materials must be created after it
bpy.ops.wm.open_mainfile(filepath=BLEND)

# same chair palette as the lab
mat('chair_fabric', (0.10, 0.48, 0.66), 0.85, 0.0)
mat('soft_black', (0.035, 0.038, 0.045), 0.55, 0.05)
mat('steel', (0.62, 0.64, 0.67), 0.32, 0.9)


class Acc:
    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.mats = []

    def tag(self, m, faces):
        if m not in self.mats:
            self.mats.append(m)
        i = self.mats.index(m)
        for f in faces:
            f.material_index = i


def _faces(verts):
    out = set()
    for v in verts:
        out.update(v.link_faces)
    return out


def rbox(acc, m, c, s, rz=0.0):
    verts = bmesh.ops.create_cube(acc.bm, size=1.0)['verts']
    mx = Matrix.Translation(Vector(c)) @ Matrix.Rotation(rad(rz), 4, 'Z') @ Matrix.Diagonal((s[0], s[1], s[2], 1.0))
    bmesh.ops.transform(acc.bm, matrix=mx, verts=verts)
    acc.tag(m, _faces(verts))


def sphere(acc, m, c, r, seg=8):
    verts = bmesh.ops.create_uvsphere(acc.bm, u_segments=seg, v_segments=max(4, seg // 2 + 1), radius=r)['verts']
    bmesh.ops.translate(acc.bm, vec=Vector(c), verts=verts)
    acc.tag(m, _faces(verts))


def beam(acc, m, p0, p1, w, h):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    q = d.to_track_quat('X', 'Z')
    verts = bmesh.ops.create_cube(acc.bm, size=1.0)['verts']
    mx = Matrix.Translation((p0 + p1) / 2) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((d.length, w, h, 1.0))
    bmesh.ops.transform(acc.bm, matrix=mx, verts=verts)
    acc.tag(m, _faces(verts))


def cyl(acc, m, c, r, h, seg=16):
    verts = bmesh.ops.create_cone(acc.bm, cap_ends=True, cap_tris=False, segments=seg,
                                  radius1=r, radius2=r, depth=h)['verts']
    bmesh.ops.transform(acc.bm, matrix=Matrix.Translation(Vector(c)), verts=verts)
    acc.tag(m, _faces(verts))


def local(c, rz, dx, dy, dz=0.0):
    a = rad(rz)
    return Vector((c[0] + dx * math.cos(a) - dy * math.sin(a), c[1] + dx * math.sin(a) + dy * math.cos(a), c[2] + dz))


def office_chair(acc, c, rz):
    """The lab's office_chair geometry (build_l2_lab.py), on the bedroom floor."""
    p = Vector(c)
    for k in range(5):                                   # star base
        a = rad(rz + k * 72)
        beam(acc, 'steel', (p.x, p.y, Z + 0.08), (p.x + math.cos(a) * 0.3, p.y + math.sin(a) * 0.3, Z + 0.05), 0.05, 0.04)
        sphere(acc, 'soft_black', (p.x + math.cos(a) * 0.3, p.y + math.sin(a) * 0.3, Z + 0.03), 0.03, 8)   # castor
    cyl(acc, 'steel', (p.x, p.y, Z + 0.3), 0.035, 0.44, 12)
    rbox(acc, 'soft_black', (p.x, p.y, Z + 0.5), (0.46, 0.46, 0.03), rz)
    rbox(acc, 'chair_fabric', (p.x, p.y, Z + 0.55), (0.5, 0.5, 0.08), rz)
    back = local(c, rz, -0.25, 0, 0)
    beam(acc, 'soft_black', local(c, rz, -0.2, 0, Z - c[2] + 0.55), (back.x, back.y, Z + 0.7), 0.05, 0.05)
    rbox(acc, 'chair_fabric', (back.x, back.y, Z + 0.92), (0.06, 0.46, 0.48), rz)


def flush(acc):
    bmesh.ops.recalc_face_normals(acc.bm, faces=acc.bm.faces[:])
    me = bpy.data.meshes.new(acc.name)
    acc.bm.to_mesh(me)
    acc.bm.free()
    for mname in acc.mats:
        me.materials.append(MATS[mname])
    ob = bpy.data.objects.new(acc.name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


made = []
for i, (c, rz) in enumerate(CHAIRS, 1):
    acc = Acc('Chair_%02d' % i)
    office_chair(acc, c, rz)
    made.append(flush(acc))
    print('built', acc.name, 'at', c, 'facing', rz)

bpy.ops.wm.save_mainfile(filepath=BLEND)
print('saved', BLEND, 'objects now:', len(bpy.data.objects))
