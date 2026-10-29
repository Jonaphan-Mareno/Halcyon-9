"""Create a quick, looping out-and-back action on Kessler's Bedroom 2 RoboArm.

Run this from Blender's Text Editor with Blender/l2-atrium.blend open, then inspect
the timeline and save the file. The action changes the three arm bones together:

  RoboArm00: Y 360 -> 300 degrees
  RoboArm01: X -20.385 -> 84.615 degrees
  RoboArm02: X -20.385 -> 84.615 degrees

The arm reaches the extended pose at frame 13 and returns to its start pose at
frame 25 (24 fps: half a second each way, one second for the full cycle).
"""
import bpy
from math import radians


RIG_NAME = 'RoboArmAture.001'
ACTION_NAME = 'KesslerRoboArmSwing'
START_FRAME = 1
EXTENDED_FRAME = 13
RETURN_FRAME = 25


rig = bpy.data.objects.get(RIG_NAME)
if rig is None or rig.type != 'ARMATURE':
    raise RuntimeError(
        'Could not find the Bedroom 2 armature "RoboArmAture.001". '
        'Open Blender/l2-atrium.blend and make sure its Bedroom 2 RoboArm rig is present.'
    )

bone_names = ('RoboArm00', 'RoboArm01', 'RoboArm02')
missing = [name for name in bone_names if rig.pose.bones.get(name) is None]
if missing:
    raise RuntimeError('Missing RoboArm pose bone(s): ' + ', '.join(missing))

# Keep any old action datablock intact. This creates and assigns a fresh action.
action = bpy.data.actions.new(ACTION_NAME)
anim_data = rig.animation_data_create()
anim_data.action = action
# Blender versions with slotted actions require the action's first slot to be bound.
slots = getattr(action, 'slots', None)
if slots is not None:
    if not len(slots):
        slots.new(id_type='OBJECT', name=rig.name)
    anim_data.action_slot = slots[0]

poses = {
    START_FRAME: {
        'RoboArm00': (0.0, 360.0, 0.0),
        'RoboArm01': (-20.385, 0.0, 0.0),
        'RoboArm02': (-20.385, 0.0, 0.0),
    },
    EXTENDED_FRAME: {
        'RoboArm00': (0.0, 300.0, 0.0),
        'RoboArm01': (84.615, 0.0, 0.0),
        'RoboArm02': (84.615, 0.0, 0.0),
    },
    RETURN_FRAME: {
        'RoboArm00': (0.0, 360.0, 0.0),
        'RoboArm01': (-20.385, 0.0, 0.0),
        'RoboArm02': (-20.385, 0.0, 0.0),
    },
}

for frame, bone_values in poses.items():
    bpy.context.scene.frame_set(frame)
    for bone_name, degrees_xyz in bone_values.items():
        bone = rig.pose.bones[bone_name]
        bone.rotation_mode = 'XYZ'
        bone.rotation_euler = tuple(radians(value) for value in degrees_xyz)
        bone.keyframe_insert(data_path='rotation_euler', frame=frame, group=bone_name)

# Linear interpolation makes the quick swing move at a steady speed.
if hasattr(action, 'fcurves'):
    for curve in action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = 'LINEAR'

scene = bpy.context.scene
scene.render.fps = 24
scene.frame_start = START_FRAME
scene.frame_end = RETURN_FRAME
scene.frame_set(START_FRAME)

print('Created %s on %s (frames %d–%d, one-second out-and-back).' % (
    action.name, rig.name, START_FRAME, RETURN_FRAME
))
