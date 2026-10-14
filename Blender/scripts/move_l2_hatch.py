"""
Move the maintenance hatch (the way down to Level 3) in the hand-edited Level 2 atrium.

l2-atrium.blend holds hand-placed rooms, so it is never rebuilt from build_l2_atrium.py; small
changes like this one are made to the saved file instead. The hatch (Atrium_Hatch, and the
PT_Hatch empty the game reads) moves to the middle of the north-east garden beds, so the drones
there stand between Voss and the way out. It is turned to face the same way round the atrium as
before. Run once, then export with export_l2_atrium.py and run npm run optimize-models.

  blender -b --factory-startup --python Blender/scripts/move_l2_hatch.py
"""
import os, math, bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', 'l2-atrium.blend'))

# polar placement in the atrium (metres from the centre, degrees with north = 90), as in the
# build script; the old spot was 14.6 m at 330 degrees, beside the east stairs
OLD = (14.6, 330.0)
NEW = (12.6, 30.0)


def P(r, a, z=0.0):
    return Vector((r * math.cos(math.radians(a)), r * math.sin(math.radians(a)), z))


bpy.ops.wm.open_mainfile(filepath=SRC)
hatch = bpy.data.objects.get('Atrium_Hatch')
marker = bpy.data.objects.get('PT_Hatch')
if hatch is None or marker is None:
    raise SystemExit('Atrium_Hatch or PT_Hatch is missing from l2-atrium.blend')

# turn the mesh about its old centre so it faces round the atrium at the new angle, then move it
old_c, new_c = P(*OLD), P(*NEW)
move = Matrix.Translation(new_c) @ Matrix.Rotation(math.radians(NEW[1] - OLD[1]), 4, 'Z') @ Matrix.Translation(-old_c)
mw = hatch.matrix_world.copy()
hatch.data.transform(mw.inverted() @ move @ mw)
hatch.data.update()
marker.location = P(NEW[0], NEW[1], marker.location.z)

bpy.ops.wm.save_mainfile(filepath=SRC)
print('Hatch moved to %.1f m at %.0f degrees: %s' % (NEW[0], NEW[1], tuple(round(v, 2) for v in marker.location)))
