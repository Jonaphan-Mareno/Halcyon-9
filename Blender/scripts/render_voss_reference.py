# Renders front / three-quarter / profile reference stills of the fresh Voss
# (public/assets/models/human_scientist.glb) for the prologue illustrations.
# Run: blender -b -P Blender/scripts/render_voss_reference.py
import bpy, math, os
from mathutils import Vector

root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
src = os.path.join(root, 'public', 'assets', 'models', 'human_scientist.glb')
out = os.path.join(root, 'docs', 'reference-art')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
center = (lo + hi) / 2
height = hi.z - lo.z
print('BOUNDS', tuple(lo), tuple(hi))

scn = bpy.context.scene
scn.render.engine = 'BLENDER_EEVEE'
scn.render.resolution_x = 900; scn.render.resolution_y = 1200
scn.world = bpy.data.worlds.new('w'); scn.world.use_nodes = True
scn.world.node_tree.nodes['Background'].inputs[0].default_value = (0.82, 0.8, 0.76, 1)
scn.world.node_tree.nodes['Background'].inputs[1].default_value = 1.0

def light(loc, energy, kind='AREA'):
    d = bpy.data.lights.new('l', kind); d.energy = energy
    if kind == 'AREA': d.size = 3
    o = bpy.data.objects.new('l', d); o.location = loc; scn.collection.objects.link(o)
    t = o.constraints.new('TRACK_TO'); t.target = tgt; t.track_axis = 'TRACK_NEGATIVE_Z'; t.up_axis = 'UP_Y'
tgt = bpy.data.objects.new('t', None); scn.collection.objects.link(tgt)

cam_d = bpy.data.cameras.new('c'); cam_d.lens = 70
cam = bpy.data.objects.new('c', cam_d); scn.collection.objects.link(cam); scn.camera = cam
tc = cam.constraints.new('TRACK_TO'); tc.target = tgt; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'

def shoot(name, yaw_deg, focus_z, dist, ortho=None):
    tgt.location = (center.x, center.y, focus_z)
    a = math.radians(yaw_deg)
    cam.location = (center.x + math.sin(a) * dist, center.y - math.cos(a) * dist, focus_z)
    scn.render.filepath = os.path.join(out, name)
    bpy.ops.render.render(write_still=True)

light((2, -3, height * 1.2), 900); light((-3, -2, height), 400); light((0, 3, height), 300)
head_z = lo.z + height * 0.88
for n, yaw in (('front', 0), ('three-quarter', 40), ('profile', 90)):
    shoot(f'voss_{n}_head.png', yaw, head_z, 1.6)
