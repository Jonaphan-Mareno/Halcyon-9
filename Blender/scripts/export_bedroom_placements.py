"""
Dump the hand-placed bedroom collections of Blender/l2-atrium.blend to JSON, one file per room:
Blender/bedroom1.json (Bedroom1 = Voss's quarter, bedroom.blend's exact names) and
Blender/bedroom2.json (Bedroom2 = Kessler's quarter, the .001 GUI duplicates).

Each object's authored transform is written as position / rotation (euler XYZ, radians) /
scale plus dimensions - the world-space bounding box size in metres, the figure the N-panel
shows - all in Blender's own convention (metres, Z-up), so the files can drive re-placement,
a third room, or game-side prop placement. Objects are dumped as placed: nothing is moved,
and the .blend on disk is never modified.

  blender -b --factory-startup --python Blender/scripts/export_bedroom_placements.py -- [out_dir]
"""
import sys, os, json, bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', 'l2-atrium.blend'))
OUT_DIR = os.path.normpath(argv[0]) if len(argv) > 0 else os.path.join(HERE, '..')

ROOMS = [
    ('Bedroom1', 'bedroom1.json'),   # east gallery, DOOR_VOSS
    ('Bedroom2', 'bedroom2.json'),   # north-east gallery, DOOR_KESSLER
]

bpy.ops.wm.open_mainfile(filepath=SRC)

for coll_name, filename in ROOMS:
    coll = bpy.data.collections.get(coll_name)
    if coll is None:
        print('no %s collection: nothing written' % coll_name)
        continue
    objects = []
    for o in sorted(coll.all_objects, key=lambda o: o.name):
        corners = [o.matrix_world @ Vector(c) for c in o.bound_box]
        dims = Vector(map(max, *corners)) - Vector(map(min, *corners))
        entry = {
            'name': o.name,
            'type': o.type,
            'position': [round(v, 6) for v in o.location],
            'rotation': [round(v, 6) for v in o.rotation_euler],
            'scale': [round(v, 6) for v in o.scale],
            'dimensions': [round(v, 6) for v in dims],
        }
        if o.parent:
            entry['parent'] = o.parent.name   # rotation/position above are parent-relative
        objects.append(entry)
    doc = {
        'source': 'Blender/l2-atrium.blend',
        'collection': coll_name,
        'convention': 'Blender axes: metres, Z-up, rotation_euler XYZ in radians; '
                      'dimensions = world-space bounding box size in metres',
        'generated_by': 'Blender/scripts/export_bedroom_placements.py',
        'objects': objects,
    }
    path = os.path.join(OUT_DIR, filename)
    with open(path, 'w') as f:
        json.dump(doc, f, indent=2)
        f.write('\n')
    print('%s: %d objects -> %s' % (coll_name, len(objects), path))
