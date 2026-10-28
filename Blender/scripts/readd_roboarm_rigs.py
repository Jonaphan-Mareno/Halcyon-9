"""
Re-add the RoboArm rig (armature + skinned RoboArm00 + RoboArmAtureAction) to both bedroom
collections of l2-atrium.blend.

Why: placing the rooms out of bedroom.blend baked every object's authored world position into
its mesh data - placed_data = Rx(-90) @ bedroom_world, verified to 1e-6 across the rooms'
static meshes - and the rig wiring did not survive it: the placed RoboArm00 copies have no
vertex groups and no Armature modifier, and the RoboArmAture object is gone from the file
entirely. bedroom.blend still holds the wired pair, so the rig is re-appended from there and
the armature placed at

    room placement frame @ Rx(-90) @ the armature's authored (bedroom.blend) world matrix

which lands the fresh mesh exactly where the old baked copy sat - verified against the old
copy's world bounds (the bake froze the rest pose) before anything of it is removed; on a
mismatch the append is rolled back and the room is left untouched, so a failed run costs
nothing (the script never saves). A copy that is already wired to an armature (an earlier
run of this script, or the rigs re-added by hand) is left exactly as placed instead.

Run it inside the OPEN l2-atrium.blend GUI session (Scripting tab > Open this file > Run
Script), then Ctrl+S. Do not run it headless while the GUI session has unsaved work.

  in Blender's Text Editor, with l2-atrium.blend open:   Run Script, then File > Save
"""
import os
import bpy
from math import radians
from mathutils import Vector, Matrix

BEDROOM = bpy.path.abspath('//bedroom.blend')    # sits next to l2-atrium.blend
PAIR = ['RoboArmAture', 'RoboArm00']
ROOMS = [('Bedroom1', 'RoboArm00', 'RoboArmAture'), ('Bedroom2', 'RoboArm00.001', 'RoboArmAture.001')]
BAKE = Matrix.Rotation(radians(-90), 4, 'X')     # folded into the placed meshes' data


def world_bbox(o):
    cs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return Vector(map(min, *cs)), Vector(map(max, *cs))


def room_frame(coll):
    """the placement frame: the transform nearly every object in the room carries"""
    groups = {}
    for o in coll.all_objects:
        if o.type != 'MESH':
            continue
        key = (tuple(round(v, 4) for v in o.location), tuple(round(v, 4) for v in o.rotation_euler),
               tuple(round(v, 4) for v in o.scale))
        groups.setdefault(key, []).append(o)
    return max(groups.values(), key=len)[0].matrix_world.copy()


def drop(o):
    data, is_mesh = o.data, o.type == 'MESH'
    bpy.data.objects.remove(o, do_unlink=True)
    if data and data.users == 0:
        (bpy.data.meshes if is_mesh else bpy.data.armatures).remove(data)


if not os.path.isfile(BEDROOM):
    print('cannot find bedroom.blend at %s - is l2-atrium.blend the open file?' % BEDROOM)
else:
    for room_name, old_name, arm_name in ROOMS:
        coll = bpy.data.collections.get(room_name)
        old = bpy.data.objects.get(old_name)
        if coll is None or old is None:
            print('%s: no collection or no %s object - skipped' % (room_name, old_name))
            continue
        # already wired (an earlier run, or the rigs re-added by hand): leave the room exactly
        # as placed - the verification below compares REST bounds, which a posed copy never
        # matches, so a wired room must not go through the append-and-check path at all
        mod = next((m for m in old.modifiers if m.type == 'ARMATURE' and m.object), None)
        wired = mod.object if mod else (old.parent if old.parent and old.parent.type == 'ARMATURE' else None)
        if wired is not None:
            ad = wired.animation_data
            print('%s: %s is already wired to %s (action %s) - left exactly as placed' % (
                room_name, old.name, wired.name,
                ad.action.name if ad and ad.action else 'none'))
            continue
        target = world_bbox(old)
        frame = room_frame(coll)

        stash = old.data.name
        old.data.name = stash + '_stash'     # keep the append from reusing the baked mesh data
        with bpy.data.libraries.load(BEDROOM, link=False) as (src, dst):
            wanted = list(PAIR)
            dst.objects = wanted
            dst.actions = ['RoboArmAtureAction']
        arm, mesh = wanted
        if arm is None or mesh is None:
            old.data.name = stash
            print('%s: RoboArmAture/RoboArm00 not found in bedroom.blend - skipped' % room_name)
            continue
        coll.objects.link(arm)
        coll.objects.link(mesh)
        # a freshly appended object's matrix_world cache is stale (identity) until the
        # depsgraph runs - evaluate once so the placement below reads the authored transform
        bpy.context.view_layer.update()
        arm.matrix_world = frame @ BAKE @ arm.matrix_world.copy()
        bpy.context.view_layer.update()

        # the bake folded the REST-pose mesh (it read raw .data.vertices), so the rest-pose
        # bounds are the exact thing to compare against the old copy
        err = max((a - b).length for a, b in zip(world_bbox(mesh), target))
        if err > 5e-3:
            drop(mesh)
            drop(arm)
            old.data.name = stash
            print('%s: fresh pair lands %.4f m off the old copy - rolled back, room untouched' % (room_name, err))
            continue

        drop(old)
        mesh.name = old_name
        arm.name = arm_name

        # the action does not always survive an append in 5.x's slotted actions - rebind it
        ad = arm.animation_data or arm.animation_data_create()
        if ad.action is None:
            act = bpy.data.actions.get('RoboArmAtureAction')
            if act:
                ad.action = act
        if ad.action is not None and getattr(ad, 'action_slot', None) is None and ad.action.slots:
            ad.action_slot = ad.action.slots[0]

        loc, rot, scl = arm.matrix_world.decompose()
        print('%s: %s + %s placed (within %.6f m of the old copy); action %s' % (
            room_name, arm.name, mesh.name, err,
            ad.action.name if ad.action else 'MISSING - pick RoboArmAtureAction in the Action Editor'))
        print('   armature at loc (%.4f, %.4f, %.4f)  rot XYZ (%.4f, %.4f, %.4f)  scale (%.4f, %.4f, %.4f)' % (
            *loc, *rot.to_euler('XYZ'), *scl))
    print('done - save with Ctrl+S in the GUI (this script never saves)')
