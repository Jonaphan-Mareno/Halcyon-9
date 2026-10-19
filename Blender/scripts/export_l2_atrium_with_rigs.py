"""
Export l2-atrium.glb WITH the RoboArm rigs, without l2-atrium.blend on disk having to contain
them: readd_roboarm_rigs.py restores the rigs in memory, then export_l2_atrium.py runs on the
already-open file (its own open_mainfile is skipped) so the skins/animations make it into the
GLB. Neither script saves, so the .blend stays exactly as the user last saved it.

Use this while the blend is missing the rigs (they were restored once, then lost to later GUI
editing). It is harmless when the blend already contains them: readd_roboarm_rigs.py then
reports each room as already wired and leaves it exactly as placed. Once readd_roboarm_rigs.py
has been run in the GUI and the file saved, the plain export script carries the rigs on its
own again:

  blender -b --factory-startup l2-atrium.blend --python Blender/scripts/export_l2_atrium_with_rigs.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# 1. the rigs - operates on the already-open file
readd = os.path.join(HERE, 'readd_roboarm_rigs.py')
exec(compile(open(readd).read(), readd, 'exec'), {'__name__': 'readd_roboarm_rigs'})

# 2. the export - its own open_mainfile is skipped; the file is already open with the rigs
export = os.path.join(HERE, 'export_l2_atrium.py')
src = open(export).read()
patched = src.replace("bpy.ops.wm.open_mainfile(filepath=SRC)",
                      "pass  # already open: rigs were re-added in memory above")
assert patched != src, 'export script no longer opens SRC - drop this wrapper'
exec(compile(patched, export, 'exec'), {'__name__': 'export_l2_atrium', '__file__': export})
