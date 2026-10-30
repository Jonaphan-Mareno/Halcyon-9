# Renders a work-in-progress style turntable of a .blend file for the devlog (Blender, background):
#   blender -b <file.blend> -P devlog/video/blender_turntable.py -- <out dir> <mode> [seconds]
# mode: orbit (solid look, then random object colours, like the viewport while building),
#       build (the objects appear one by one, as if a build script were running), keys (shape keys
#       slide one after another: ARIA's face). Writes PNG frames and an outliner.json of object
#       names (for the fake Blender interface drawn round it). Nothing is saved back to the file.
import bpy, sys, os, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
out, mode = argv[0], argv[1]
seconds = float(argv[2]) if len(argv) > 2 else 6
view = argv[3] if len(argv) > 3 else 'orbit'      # orbit | in:<height share> (inside a room, panning) | char | orbit:<radius>
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
FPS = 24
N = int(seconds * FPS)

# a .glb to show instead of the open file (the game's own model): import:<path> among the arguments
for a in argv:
    if a.startswith('import:'):
        for o in list(sc.objects):
            bpy.data.objects.remove(o, do_unlink=True)
        bpy.ops.import_scene.gltf(filepath=a[7:])
# (some files keep their objects outside the scene: linked in here, only in memory)
if not any(o.type == 'MESH' for o in sc.objects):
    for o in bpy.data.objects:
        if o.name not in sc.collection.all_objects:
            try:
                sc.collection.objects.link(o)
            except Exception:
                pass
bpy.context.view_layer.update()
meshes = [o for o in sc.objects if o.type == 'MESH' and not o.hide_render and o.visible_get()
          and not o.name.upper().startswith('COL_')]
if not meshes:
    meshes = [o for o in sc.objects if o.type == 'MESH']
framed = meshes
if view == 'cut':
    # a dollhouse cutaway: the ceilings and roofs hidden (broad, flat meshes at the top), seen from above
    lo0 = Vector((1e9, 1e9, 1e9)); hi0 = Vector((-1e9, -1e9, -1e9))
    boxes = {}
    for o in meshes:
        ws = [o.matrix_world @ Vector(c) for c in o.bound_box]
        a = Vector((min(w.x for w in ws), min(w.y for w in ws), min(w.z for w in ws)))
        b = Vector((max(w.x for w in ws), max(w.y for w in ws), max(w.z for w in ws)))
        boxes[o] = (a, b)
        lo0 = Vector(map(min, lo0, a)); hi0 = Vector(map(max, hi0, b))
    span = hi0 - lo0
    for o, (a, b) in boxes.items():
        top = b.z > hi0.z - 0.12 * span.z
        broad = (b.x - a.x) > 0.45 * span.x and (b.y - a.y) > 0.45 * span.y
        if (top and broad) or any(k in o.name.lower() for k in ('ceil', 'roof', 'lid_top')):
            o.hide_render = True
    meshes = [o for o in meshes if not o.hide_render]
    framed = meshes
if view == 'char':
    # (a character: only the rigged meshes frame the shot)
    framed = [o for o in meshes if any(m.type == 'ARMATURE' for m in o.modifiers) or (o.parent and o.parent.type == 'ARMATURE')] or meshes
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
for o in framed:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
centre = (lo + hi) / 2
size = max((hi - lo).length, 0.5)

# the camera: a slow orbit, a little above, looking at the middle
cam_data = bpy.data.cameras.new('devlog_cam')
cam_data.lens = 32
cam_data.clip_end = size * 20
cam = bpy.data.objects.new('devlog_cam', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
radius = size * (float(view.split(':')[1]) if view.startswith('orbit:') else 1.25)
for f in range(N):
    u = f / max(1, N - 1)
    if view.startswith('in:'):
        # inside: from the middle of the room at some height, panning slowly round, a wide lens
        cam_data.lens = 16
        cam.location = Vector((centre.x, centre.y, lo.z + float(view.split(':')[1]) * (hi.z - lo.z)))
        yaw = math.radians(-60) + math.radians(150) * u
        look = cam.location + Vector((math.cos(yaw), math.sin(yaw), -0.12))
    elif view == 'cut':
        a = math.radians(-130) + math.radians(80) * u
        cam.location = centre + Vector((math.cos(a) * size * 0.75, math.sin(a) * size * 0.75, size * 0.85))
        look = centre
    else:
        a = math.radians(-140) + math.radians(100) * u   # (round the front: Blender's front is -Y)
        cam.location = centre + Vector((math.cos(a) * radius, math.sin(a) * radius, size * 0.28))
        look = centre
    d = look - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.keyframe_insert('location', frame=f + 1)
    cam.keyframe_insert('rotation_euler', frame=f + 1)

r = sc.render
r.engine = 'BLENDER_WORKBENCH'
if len(argv) > 4 and argv[4] == 'eevee':
    # (the file's own lights and materials: as it looked in the render)
    for cand in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try:
            r.engine = cand
            try:
                sc.eevee.taa_render_samples = 4
            except Exception:
                pass
            break
        except TypeError:
            pass
r.resolution_x, r.resolution_y, r.resolution_percentage = 1080, 506, 100
r.fps = FPS
r.image_settings.file_format = 'PNG'
r.film_transparent = False
d = sc.display
d.shading.light = 'STUDIO'
d.shading.show_cavity = True
d.shading.cavity_type = 'BOTH'
d.shading.show_object_outline = True
d.shading.background_type = 'VIEWPORT' if hasattr(d.shading, 'background_type') else d.shading.background_type
try:
    sc.world.color = (0.11, 0.11, 0.11)
except Exception:
    pass
d.shading.color_type = 'MATERIAL'

# the build: each object shown from its moment on (in the outliner's order)
if mode == 'build':
    order = sorted(meshes, key=lambda o: o.name)
    for i, o in enumerate(order):
        at = 1 + int((N * 0.8) * i / max(1, len(order)))
        o.hide_render = True
        o.keyframe_insert('hide_render', frame=max(1, at - 1))
        o.hide_render = False
        o.keyframe_insert('hide_render', frame=at)

# the shape keys: each slides up and down in turn
if mode == 'keys':
    keyed = [o for o in meshes if o.data.shape_keys and len(o.data.shape_keys.key_blocks) > 1]
    for o in keyed:
        blocks = list(o.data.shape_keys.key_blocks)[1:]
        span = max(1, N // max(1, len(blocks)))
        for i, k in enumerate(blocks):
            s = i * span
            for fr, v in ((s, 0), (s + span // 2, 1), (s + span, 0)):
                k.value = v
                k.keyframe_insert('value', frame=fr + 1)

sc.frame_start, sc.frame_end = 1, N
for f in range(1, N + 1):
    sc.frame_set(f)
    # orbit mode: the second half in random object colours, as in the viewport while building
    if mode == 'orbit' and r.engine == 'BLENDER_WORKBENCH':
        d.shading.color_type = 'MATERIAL' if f <= N // 2 else 'RANDOM'
    r.filepath = os.path.join(out, 'f%04d.png' % f)
    bpy.ops.render.render(write_still=True)

names = []
for o in sorted(sc.objects, key=lambda o: o.name):
    if o.name == 'devlog_cam':
        continue
    names.append({'name': o.name, 'type': o.type})
json.dump({'file': os.path.basename(bpy.data.filepath), 'objects': names[:400], 'count': len(names)},
          open(os.path.join(out, 'outliner.json'), 'w'), indent=1)
print('DEVLOG done', out, N)
