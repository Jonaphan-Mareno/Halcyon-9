"""
Level 2, Wing 1: the Cargo Bay. Reached through door A of the hub (straight across from the
elevator). Built in the hub's coordinates, so it lines up when both models are loaded.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_wing1_cargo.py -- \
      Blender/wing1-cargo.blend public/assets/models/wing1-cargo.glb

Layout, Blender coordinates (x across, y away from the hub, z up):
  y 33.6..42   entrance corridor (the dark-corridor reference: ribs, pipes, lit floor)
  y 42..92     the bay, 28 m wide, 16 m high, with an overhead crane on rails
                 y 50..56  electrified water channel across the whole width
                 x 8..14, y 64..80, z 3.6   catwalk along the right wall (coolant at its end)
                 y 80..92  the welding drone's floor, in front of the gate
  y 92         GATE_W1 into Quarters A (y 92..101)

The crane, the containers, consoles and robots are made by the game
(src/levels/wing1/CargoBayCourse.js), on a slot grid that matches this room.
"""
import sys, os, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kit import *

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_BLEND = argv[0] if len(argv) > 0 else None
OUT_GLB = argv[1] if len(argv) > 1 else None

begin('Wing1')
random.seed(12)

Y0, YC, Y1 = 33.6, 42.0, 92.0
WX, H = 14.0, 16.0
PIT0, PIT1 = 50.0, 56.0
CW = 3.0            # corridor half width
CH = 5.0            # corridor height

# ------------------------------------------------------------------ entrance corridor
cor = A('W1_Corridor')
box(cor, 'floor_dark', (-CW, Y0, -0.5), (CW, YC, 0), col=True)
box(cor, 'hull_mid', (-CW - 0.3, Y0, 0), (-CW, YC, CH + 0.3), col=True)
box(cor, 'hull_mid', (CW, Y0, 0), (CW + 0.3, YC, CH + 0.3), col=True)
box(cor, 'hull_dark', (-CW, Y0, CH), (CW, YC, CH + 0.3), col=True)
y = Y0 + 0.4
while y < YC - 0.3:
    box(cor, 'hull_dark', (-CW, y, 0), (-CW + 0.45, y + 0.4, CH), )        # rib posts
    box(cor, 'hull_dark', (CW - 0.45, y, 0), (CW, y + 0.4, CH))
    box(cor, 'hull_dark', (-CW, y, CH - 0.45), (CW, y + 0.4, CH))           # rib top
    y += 1.6
for side in (-1, 1):
    for zz in (0.55, 0.85, 3.9, 4.2):
        cyl(cor, 'pipe_black', (side * (CW - 0.7), (Y0 + YC) / 2, zz), 0.08, YC - Y0, 10, axis='Y')
    box(cor, 'blue_glow', (side * (CW - 0.65) - 0.05, Y0, 0.0), (side * (CW - 0.65) + 0.05, YC, 0.04))
for i in range(int(YC - Y0)):
    box(cor, 'tile_glow', (-0.9, Y0 + i + 0.06, 0.0), (0.9, Y0 + i + 0.94, 0.03))
for k in range(3):
    yy = Y0 + 1.6 + k * 2.6
    box(cor, 'white_glow', (-1.0, yy, CH - 0.02), (1.0, yy + 0.4, CH))

# ------------------------------------------------------------------ the bay shell
bay = A('W1_Bay')
box(bay, 'floor_dark', (-WX, YC, -3.7), (WX, PIT0, 0), col=True)          # near floor
box(bay, 'floor_dark', (-WX, PIT1, -3.7), (WX, Y1, 0), col=True)          # far floor
box(bay, 'hull_dark', (-WX, PIT0, -3.7), (WX, PIT1, -3.2), col=True)      # channel bed
box(bay, 'water', (-WX, PIT0, -1.05), (WX, PIT1, -1.0))                   # electrified water
for y0, y1 in ((PIT0 - 0.4, PIT0), (PIT1, PIT1 + 0.4)):
    box(bay, 'hazard', (-WX, y0, 0.0), (WX, y1, 0.02))
# walls (with openings for the corridor and the gate) and the ceiling
box(bay, 'hull_light', (-WX - 0.3, YC, -3.7), (-WX, Y1, H), col=True)
box(bay, 'hull_light', (WX, YC, -3.7), (WX + 0.3, Y1, H), col=True)
box(bay, 'hull_light', (-WX - 0.3, YC - 0.3, -3.7), (-CW, YC, H), col=True)
box(bay, 'hull_light', (CW, YC - 0.3, -3.7), (WX + 0.3, YC, H), col=True)
box(bay, 'hull_light', (-CW, YC - 0.3, CH), (CW, YC, H), col=True)
box(bay, 'hull_light', (-WX - 0.3, Y1, -3.7), (-2.5, Y1 + 0.3, H), col=True)
box(bay, 'hull_light', (2.5, Y1, -3.7), (WX + 0.3, Y1 + 0.3, H), col=True)
box(bay, 'hull_light', (-2.5, Y1, 4.5), (2.5, Y1 + 0.3, H), col=True)
box(bay, 'hull_mid', (-WX - 0.3, YC - 0.3, H), (WX + 0.3, Y1 + 0.3, H + 0.4), col=True)

# wall dressing: ribs, tube bundles, light strips
dress = A('W1_Dressing')
for side in (-1, 1):
    x_in = side * WX
    for k in range(13):
        yy = YC + 1.0 + k * 4.0
        box(dress, 'hull_mid', (min(x_in, x_in - side * 0.7), yy - 0.35, 0), (max(x_in, x_in - side * 0.7), yy + 0.35, H))
        if k < 12:
            z = random.uniform(1.5, 11.0)
            for i in range(4):
                cyl(dress, 'pipe_black', (x_in - side * 0.35, yy + 2.0, z + i * 0.22), 0.07, 3.3, 8, axis='Y')
    for zz in (3.0, 9.5):
        box(dress, 'blue_glow', (min(x_in, x_in - side * 0.1), YC, zz), (max(x_in, x_in - side * 0.1), Y1, zz + 0.12))
# crane rails along the ceiling
for side in (-1, 1):
    box(dress, 'hull_dark', (side * 13.2 - 0.3, YC + 0.5, 13.4), (side * 13.2 + 0.3, Y1 - 0.5, 14.2))
    for k in range(7):
        yy = YC + 3 + k * 8
        box(dress, 'hull_mid', (side * 13.2 - 0.25, yy - 0.2, 14.2), (side * 13.2 + 0.25, yy + 0.2, H))
for k in range(6):
    yy = YC + 4 + k * 8.5
    box(dress, 'white_glow', (-3.0, yy, H - 0.05), (3.0, yy + 0.6, H))

# ------------------------------------------------------------------ catwalk along the right wall
cat = A('W1_Catwalk')
box(cat, 'hull_light', (8.0, 64.0, 3.2), (WX, 80.0, 3.6), col=True)
box(cat, 'blue_glow', (8.0, 64.0, 3.52), (8.12, 80.0, 3.64))
for (x, yy) in ((8.4, 64.6), (8.4, 72.0), (8.4, 79.4), (13.5, 64.6), (13.5, 79.4)):
    cyl(cat, 'hull_dark', (x, yy, 1.6), 0.18, 3.2, 10)
# railing only past the climbing spot (y 72..80), so the stairs can meet the catwalk
for zz in (4.1, 4.6):
    box(cat, 'hull_dark', (7.97, 72.0, zz), (8.05, 80.0, zz + 0.06))
for yy in range(72, 81, 2):
    box(cat, 'hull_dark', (7.97, yy, 3.6), (8.05, yy + 0.06, 4.66))
col_box((7.95, 72.0, 3.6), (8.05, 80.0, 4.66))

# ------------------------------------------------------------------ gate and Quarters A
gate = A('GATE_W1')
box(gate, 'hull_dark', (-2.5, Y1 - 0.15, 0.0), (2.5, Y1 + 0.15, 4.5))
box(gate, 'door_a_glow', (-2.3, Y1 - 0.2, 2.1), (2.3, Y1 - 0.15, 2.3))
box(gate, 'door_a_glow', (-0.08, Y1 - 0.2, 0.2), (0.08, Y1 - 0.15, 4.3))
frame = A('W1_GateFrame')
box(frame, 'hull_mid', (-3.2, Y1 - 0.9, 0), (-2.5, Y1, 5.2))
box(frame, 'hull_mid', (2.5, Y1 - 0.9, 0), (3.2, Y1, 5.2))
box(frame, 'hull_mid', (-3.2, Y1 - 0.9, 4.5), (3.2, Y1, 5.2))
box(frame, 'door_a_glow', (-3.2, Y1 - 0.95, 4.75), (3.2, Y1 - 0.9, 4.95))
for x0 in (-10, 6):  # hazard markings on the drone's floor
    box(frame, 'hazard', (x0, 82.0, 0.0), (x0 + 4, 82.3, 0.02))

q = A('W1_QuartersA')
QY0, QY1, QW = Y1 + 0.3, Y1 + 9.0, 3.5
box(q, 'floor_dark', (-QW, QY0, -0.5), (QW, QY1, 0), col=True)
box(q, 'hull_mid', (-QW - 0.3, QY0, 0), (-QW, QY1, 4.8), col=True)
box(q, 'hull_mid', (QW, QY0, 0), (QW + 0.3, QY1, 4.8), col=True)
box(q, 'hull_mid', (-QW - 0.3, QY1, 0), (QW + 0.3, QY1 + 0.3, 4.8), col=True)
box(q, 'hull_mid', (-QW - 0.3, QY0, 4.8), (QW + 0.3, QY1 + 0.3, 5.1), col=True)
box(q, 'white_glow', (-1.5, QY0 + 3.5, 4.78), (1.5, QY0 + 4.0, 4.8))
box(q, 'hull_dark', (-QW, QY1 - 2.4, 0), (-QW + 1.2, QY1, 0.6), col=True)              # bed
box(q, 'hull_mid', (-QW + 0.05, QY1 - 2.35, 0.6), (-QW + 1.15, QY1 - 0.05, 0.75))
box(q, 'hull_light', (QW - 2.4, QY1 - 0.8, 0), (QW - 0.4, QY1, 0.9), col=True)        # desk
box(q, 'door_a_glow', (QW - 1.9, QY1 - 0.12, 1.2), (QW - 0.9, QY1 - 0.02, 1.75))       # tape player
box(q, 'hull_dark', (QW - 0.9, QY0 + 0.5, 0), (QW, QY0 + 1.4, 2.0), col=True)          # locker
empty('TAPE_A', (QW - 1.4, QY1 - 1.1, 1.0))
empty('PT_Checkpoint', (0.0, 37.0, 0.1))

finish(OUT_BLEND, OUT_GLB)
