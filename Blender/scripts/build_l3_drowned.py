"""
Level 3, the drowned deck: the lowest deck of the station, flooded. A basement, not a habitat:
grey and brown metal, rust, cracked concrete, pipes overhead, emergency strips and caged lamps.
The materials are textured by the game (ambientCG rust and concrete, mapped by world position);
here they only need their names. All modelled here (our own work).

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_l3_drowned.py -- \
      Blender/l3-drowned.blend public/assets/models/l3-drowned.glb

Layout (metres; x east, y north, z up; the floor is z 0 and the water stands over it):
  - the pump room, where Voss drops in through the shaft in its ceiling: x -3..3, y -3..3
  - the corridor running straight ahead (north): x -1.5..1.5, y 3..24, with rust ribs every 3 m
  - at its end, facing you, the door to crew quarters C with a big window: behind it the crew
    room, flooded to the ceiling, where the drowned crew float (x -4..4, y 24.3..31)
  - the way on turns left (west) at the door, to a sealed bulkhead at x -9 (the first gate)

Names the game reads: COL_ collision; FLOOD_ the flooded crew room (drawn murky, as seen through
water); GLASS_ the door's window; SPAWN_L3 where he lands; PT_Shaft the shaft opening; LAMP_<n>
caged lamps (a light each); PT_Window, PT_CrewSign, PT_Gate1, PT_Beacon; PT_Body_<n> where the
drowned crew float.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import kit
from kit import A, box, beam, cyl, empty, finish, col_box

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_BLEND = argv[0] if len(argv) > 0 else None
OUT_GLB = argv[1] if len(argv) > 1 else None

kit.begin('L3', palette='lab')
M = kit.mat
# (the game swaps these for its textured versions by name)
M('l3_wall', (0.30, 0.31, 0.32), 0.7, 0.6)          # grey-blue metal with rust patches (Metal021)
M('l3_rust', (0.42, 0.22, 0.10), 0.85, 0.5)         # heavy rust (Metal022): ribs, pipes, frames
M('l3_concrete', (0.45, 0.44, 0.42), 0.9, 0.0)      # cracked concrete with rusty mesh (Concrete042C)
M('l3_grate', (0.40, 0.25, 0.15), 0.8, 0.6)         # rusty perforated walkway (MetalWalkway014)
M('l3_dark', (0.07, 0.07, 0.075), 0.6, 0.5)         # black paint, conduit, rubber
M('l3_hazard', (0.70, 0.55, 0.10), 0.7, 0.2)        # faded yellow warning paint
M('l3_cloth', (0.14, 0.15, 0.17), 0.95, 0.0)        # mattresses, bedding
M('l3_strip', (0.9, 0.35, 0.08), 0.4, 0, (1.0, 0.32, 0.06), 2.2)   # emergency strip lights
M('l3_lamp', (1.0, 0.85, 0.6), 0.4, 0, (1.0, 0.82, 0.55), 3.0)     # caged lamp lenses
M('l3_led', (0.3, 0.8, 1.0), 0.4, 0, (0.35, 0.85, 1.0), 2.5)       # the shaft's blue lights
M('l3_alarm', (1.0, 0.1, 0.05), 0.4, 0, (1.0, 0.08, 0.04), 2.5)    # red beacons
M('l3_glass', (0.45, 0.6, 0.55), 0.05, 0.0, alpha=0.3)

shell = A('L3_Shell')       # floors, walls, ceilings
struct = A('L3_Struct')     # ribs, pipes, brackets, frames
props = A('L3_Props')       # the pump, crates, catwalk, lamps, debris
glow = A('L3_Glow')         # strips, lamp lenses, LEDs, beacons
door = A('L3_Door')         # the crew room door (around its window)
flood = A('FLOOD_Room')     # everything inside the flooded crew room
glass = A('GLASS_Window')

T = 0.2       # wall thickness
BAND = 1.0    # the concrete band at the foot of every wall


def wall(lo, hi, band=True):
    """A wall slab: concrete up to BAND, grey metal above it. Solid."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    if band and z0 < BAND:
        box(shell, 'l3_concrete', (x0, y0, z0), (x1, y1, min(BAND, z1)))
        if z1 > BAND:
            box(shell, 'l3_wall', (x0, y0, BAND), (x1, y1, z1))
    else:
        box(shell, 'l3_wall', lo, hi)
    col_box(lo, hi)


def floor(x0, y0, x1, y1, mat='l3_concrete', acc=None):
    box(acc or shell, mat, (x0, y0, -0.2), (x1, y1, 0.0), col=True)


def ceiling(x0, y0, x1, y1, z, acc=None):
    box(acc or shell, 'l3_wall', (x0, y0, z), (x1, y1, z + 0.2), col=True)


def caged_lamp(i, x, y, z, facing):
    """A lamp in a cage on a wall; facing is +1/-1 along x (the way into the room)."""
    box(props, 'l3_dark', (x - (0.06 if facing > 0 else 0.0), y - 0.16, z - 0.1), (x + (0.0 if facing > 0 else 0.06), y + 0.16, z + 0.1))
    lx = x + facing * 0.09
    box(glow, 'l3_lamp', (lx - 0.05, y - 0.1, z - 0.06), (lx + 0.05, y + 0.1, z + 0.06))
    for dy in (-0.12, 0.0, 0.12):
        beam(props, 'l3_rust', (x + facing * 0.02, y + dy, z + 0.12), (x + facing * 0.18, y + dy, z + 0.12), 0.015, 0.015)
        beam(props, 'l3_rust', (x + facing * 0.02, y + dy, z - 0.12), (x + facing * 0.18, y + dy, z - 0.12), 0.015, 0.015)
        beam(props, 'l3_rust', (x + facing * 0.18, y + dy, z - 0.12), (x + facing * 0.18, y + dy, z + 0.12), 0.015, 0.015)
    empty(f'LAMP_{i}', (x + facing * 0.35, y, z - 0.1))


def strip(x, y0, y1, z, gaps=()):
    """An emergency strip light along a wall (x fixed), with dead sections."""
    y = y0
    for g0, g1 in sorted(gaps) + [(y1, y1)]:
        if g0 > y:
            box(glow, 'l3_strip', (x - 0.02, y, z), (x + 0.02, g0, z + 0.035))
        y = max(y, g1)


def wheel(c, r, axis='Y'):
    """A valve wheel facing along an axis (Y or X): a hub, six spokes and a ring of short beams."""
    cx, cy, cz = c
    def at(a, rr):
        if axis == 'X':
            return (cx, cy + rr * math.cos(a), cz + rr * math.sin(a))
        return (cx + rr * math.cos(a), cy, cz + rr * math.sin(a))
    cyl(props, 'l3_rust', c, r * 0.18, 0.08, seg=10, axis=axis)
    n = 14
    for i in range(n):
        beam(props, 'l3_rust', at(2 * math.pi * i / n, r), at(2 * math.pi * (i + 1) / n, r), 0.035, 0.035)
    for i in range(6):
        beam(props, 'l3_rust', c, at(2 * math.pi * i / 6, r), 0.025, 0.025)


# ------------------------------------------------------------------ the pump room (he lands here)
floor(-3.0, -3.0, 3.0, 3.0)
wall((-3.0 - T, -3.0 - T, 0), (-3.0, 3.0 + T, 3.4))            # west
wall((3.0, -3.0 - T, 0), (3.0 + T, 3.0 + T, 3.4))              # east
wall((-3.0, -3.0 - T, 0), (3.0, -3.0, 3.4))                    # south
wall((-3.0, 3.0, 0), (-1.5, 3.0 + T, 3.4))                     # north, either side of the corridor
wall((1.5, 3.0, 0), (3.0, 3.0 + T, 3.4))
box(shell, 'l3_wall', (-1.5, 3.0, 3.0), (1.5, 3.0 + T, 3.4), col=True)   # the lintel over the corridor
# the ceiling, round the shaft's square opening
S = 0.8
ceiling(-3.2, -3.2, 3.2, -S, 3.4)
ceiling(-3.2, S, 3.2, 3.2, 3.4)
ceiling(-3.2, -S, -S, S, 3.4)
ceiling(S, -S, 3.2, S, 3.4)
# the shaft going up into the dark, ringed with blue lights, a broken ladder on its north side
for z0 in (3.6,):
    box(shell, 'l3_wall', (-S - 0.1, -S - 0.1, z0), (-S, S + 0.1, z0 + 4.0))
    box(shell, 'l3_wall', (S, -S - 0.1, z0), (S + 0.1, S + 0.1, z0 + 4.0))
    box(shell, 'l3_wall', (-S, -S - 0.1, z0), (S, -S, z0 + 4.0))
    box(shell, 'l3_wall', (-S, S, z0), (S, S + 0.1, z0 + 4.0))
for z in (3.75, 4.7, 5.65, 6.6):
    box(glow, 'l3_led', (-S + 0.01, -S + 0.01, z), (-S + 0.04, S - 0.01, z + 0.04))
    box(glow, 'l3_led', (S - 0.04, -S + 0.01, z), (S - 0.01, S - 0.01, z + 0.04))
    box(glow, 'l3_led', (-S + 0.01, -S + 0.01, z), (S - 0.01, -S + 0.04, z + 0.04))
    box(glow, 'l3_led', (-S + 0.01, S - 0.04, z), (S - 0.01, S - 0.01, z + 0.04))
for x in (-0.25, 0.25):
    beam(struct, 'l3_rust', (x, S - 0.1, 4.3), (x, S - 0.1, 7.4), 0.04, 0.04)
for z in [4.4 + 0.3 * i for i in range(10)]:
    beam(struct, 'l3_rust', (-0.25, S - 0.1, z), (0.25, S - 0.1, z), 0.025, 0.025)
empty('PT_Shaft', (0, 0, 3.4))
empty('SPAWN_L3', (0, 0.2, 0.05))

# the pump: a big rusted drum on its side, its motor and the pipes rising out of it
cyl(props, 'l3_rust', (1.9, -1.2, 1.0), 0.8, 2.4, seg=20, axis='Y')
for y in (-2.45, 0.05):
    cyl(props, 'l3_dark', (1.9, y, 1.0), 0.88, 0.1, seg=20, axis='Y')
box(props, 'l3_wall', (1.3, 0.1, 0.0), (2.6, 1.3, 1.2))
box(props, 'l3_dark', (1.4, 0.2, 1.2), (2.5, 1.2, 1.3))
cyl(props, 'l3_rust', (1.9, -1.2, 2.5), 0.18, 1.4, seg=12)
cyl(props, 'l3_rust', (2.6, 0.7, 2.3), 0.14, 2.2, seg=12)
box(props, 'l3_dark', (1.0, -2.6, 0.0), (2.8, 0.2, 0.2))       # its skid
col_box((1.05, -2.6, 0.0), (2.8, 1.35, 1.85))
wheel((2.0, -2.6, 1.0), 0.32)
# crates stacked in the south-west corner
box(props, 'l3_wall', (-2.9, -2.9, 0.0), (-1.9, -1.9, 1.0), col=True)
box(props, 'l3_rust', (-2.8, -2.8, 1.0), (-2.0, -2.0, 1.7), col=True)
box(props, 'l3_dark', (-1.8, -2.9, 0.0), (-1.1, -2.3, 0.6), col=True)
# a grated catwalk along the west wall, a step up out of the water, on rusted legs
box(props, 'l3_grate', (-3.0, -1.4, 0.76), (-1.6, 2.9, 0.82), col=True)
for x in (-2.95, -1.65):
    for y in (-1.35, 0.7, 2.85):
        beam(props, 'l3_rust', (x, y, 0.0), (x, y, 0.76), 0.06, 0.06)
beam(props, 'l3_rust', (-1.62, -1.4, 0.95), (-1.62, 2.9, 0.95), 0.04, 0.04)   # its rail
for y in (-1.4, 0.7, 2.9):
    beam(props, 'l3_rust', (-1.62, y, 0.82), (-1.62, y, 0.95), 0.04, 0.04)
caged_lamp(0, 3.0, 1.6, 2.6, -1)
strip(-2.98, -3.0, 3.0, BAND, gaps=[(-0.6, 0.4)])
strip(2.98, 1.4, 3.0, BAND)

# ------------------------------------------------------------------ the corridor, straight ahead
floor(-1.5, 3.0, 1.5, 24.0)
wall((-1.5 - T, 3.0, 0), (-1.5, 21.0, 3.0))                    # west, up to the junction
wall((1.5, 3.0, 0), (1.5 + T, 24.0, 3.0))                      # east, all the way
ceiling(-1.7, 3.2, 1.7, 24.0, 3.0)
for i, y in enumerate([4.5 + 3 * k for k in range(6)]):
    # a rust rib: a post up each wall and a beam across the ceiling
    box(struct, 'l3_rust', (-1.5, y - 0.1, 0.0), (-1.36, y + 0.1, 3.0))
    box(struct, 'l3_rust', (1.36, y - 0.1, 0.0), (1.5, y + 0.1, 3.0))
    box(struct, 'l3_rust', (-1.5, y - 0.1, 2.84), (1.5, y + 0.1, 3.0))
# pipes along both walls, on brackets
cyl(struct, 'l3_rust', (-1.3, 12.0, 2.62), 0.11, 18.0, seg=10, axis='Y')
cyl(struct, 'l3_dark', (-1.32, 12.0, 2.36), 0.065, 18.0, seg=8, axis='Y')
cyl(struct, 'l3_rust', (1.27, 13.5, 2.66), 0.14, 21.0, seg=10, axis='Y')
for y in [3.8 + 1.5 * k for k in range(13)]:
    box(struct, 'l3_dark', (-1.5, y - 0.03, 2.3), (-1.15, y + 0.03, 2.34))
    box(struct, 'l3_dark', (1.1, y - 0.03, 2.48), (1.5, y + 0.03, 2.52))
# a cable tray hanging from the ceiling, sagging where a hanger gave way
box(struct, 'l3_grate', (0.1, 3.4, 2.78), (0.6, 14.0, 2.8))
beam(struct, 'l3_grate', (0.35, 14.0, 2.79), (0.35, 19.5, 2.2), 0.5, 0.02)
caged_lamp(1, -1.5, 7.5 + 1.5, 2.45, 1)
caged_lamp(2, 1.5, 13.5 + 1.5, 2.45, -1)
caged_lamp(3, -1.5, 19.5 - 1.2, 2.45, 1)
strip(-1.48, 3.2, 21.0, BAND, gaps=[(8.0, 10.5), (15.0, 15.8)])
strip(1.48, 3.2, 24.0, BAND, gaps=[(11.0, 13.2), (19.5, 21.0)])
# a fallen pipe across the corridor and a drift of debris against the east wall
beam(props, 'l3_rust', (-1.4, 10.6, 0.15), (1.3, 11.8, 1.1), 0.24, 0.24)
col_box((-1.2, 10.7, 0.0), (1.2, 11.7, 0.45))
box(props, 'l3_dark', (0.6, 15.6, 0.0), (1.4, 16.4, 0.5), col=True)
box(props, 'l3_wall', (0.9, 16.5, 0.0), (1.42, 17.6, 0.32), col=True)

# ------------------------------------------------------------------ the junction: the door ahead, the way left
# the north wall, the crew room door in its middle (x -1..1)
NY = 24.0
D = 0.3
wall((-9.2, NY, 0), (-1.0, NY + D, 3.0))
wall((1.0, NY, 0), (1.7, NY + D, 3.0))
box(shell, 'l3_wall', (-1.0, NY, 2.3), (1.0, NY + D, 3.0), col=True)
# the way west, to the first gate
floor(-9.2, 21.0, -1.5, 24.0)
wall((-9.2, 21.0 - T, 0), (-1.5, 21.0, 3.0))
ceiling(-9.4, 20.8, -1.5, 24.2, 3.0)
wall((-9.2 - T, 20.8, 0), (-9.2, 24.2, 3.0))
for x in (-4.5, -7.5):
    box(struct, 'l3_rust', (x - 0.1, 21.0, 0.0), (x + 0.1, 21.14, 3.0))
    box(struct, 'l3_rust', (x - 0.1, NY - 0.14, 0.0), (x + 0.1, NY, 3.0))
    box(struct, 'l3_rust', (x - 0.1, 21.0, 2.84), (x + 0.1, NY, 3.0))
cyl(struct, 'l3_rust', (-5.35, 21.2, 2.62), 0.11, 7.7, seg=10, axis='X')
empty('LAMP_4', (-6.0, 22.6, 2.3))
box(glow, 'l3_lamp', (-6.15, 23.86, 2.4), (-5.85, 24.0, 2.5))
# (no strip lights on this stretch: they are dead)
# the sealed bulkhead at the end of the west branch: a heavy door in a hazard-striped frame
box(props, 'l3_rust', (-9.2, 21.6, 0.0), (-9.05, 23.4, 2.4), col=True)
for z0, z1 in ((0.0, 0.12), (2.28, 2.4)):
    box(props, 'l3_hazard', (-9.05, 21.5, z0), (-9.0, 23.5, z1))
for y0, y1 in ((21.5, 21.62), (23.38, 23.5)):
    box(props, 'l3_hazard', (-9.05, y0, 0.0), (-9.0, y1, 2.4))
wheel((-8.98, 22.5, 1.3), 0.3, axis='X')
cyl(glow, 'l3_alarm', (-9.0, 22.5, 2.62), 0.07, 0.12, seg=10)
empty('PT_Gate1', (-8.8, 22.5, 1.2))

# ------------------------------------------------------------------ the crew room door, with its window
W0, W1 = -0.6, 0.6          # the window, x
WZ0, WZ1 = 1.0, 1.9         # and z
DY0, DY1 = NY + 0.04, NY + 0.26
box(door, 'l3_wall', (-1.0, DY0, 0.0), (1.0, DY1, WZ0))
box(door, 'l3_wall', (-1.0, DY0, WZ1), (1.0, DY1, 2.3))
box(door, 'l3_wall', (-1.0, DY0, WZ0), (W0, DY1, WZ1))
box(door, 'l3_wall', (W1, DY0, WZ0), (1.0, DY1, WZ1))
col_box((-1.0, NY, 0.0), (1.0, NY + D, 2.3))
# a thick rusted frame round the window, on the corridor side
F = 0.08
box(door, 'l3_rust', (W0 - F, DY0 - 0.06, WZ0 - F), (W1 + F, DY0, WZ0))
box(door, 'l3_rust', (W0 - F, DY0 - 0.06, WZ1), (W1 + F, DY0, WZ1 + F))
box(door, 'l3_rust', (W0 - F, DY0 - 0.06, WZ0), (W0, DY0, WZ1))
box(door, 'l3_rust', (W1, DY0 - 0.06, WZ0), (W1 + F, DY0, WZ1))
box(glass, 'l3_glass', (W0, NY + 0.13, WZ0), (W1, NY + 0.17, WZ1))
# hinges, the locking wheel under the window, and the hazard stripes round the doorway
for z in (0.35, 1.95):
    box(door, 'l3_dark', (-1.08, DY0 - 0.08, z), (-0.95, DY0, z + 0.25))
wheel((0.0, DY0 - 0.08, 0.6), 0.28)
for x0, x1 in ((-1.18, -1.0), (1.0, 1.18)):
    box(props, 'l3_hazard', (x0, NY - 0.02, 0.0), (x1, NY, 2.48))
box(props, 'l3_hazard', (-1.18, NY - 0.02, 2.3), (1.18, NY, 2.48))
cyl(glow, 'l3_alarm', (0.0, NY - 0.12, 2.72), 0.08, 0.14, seg=10, axis='Y')
empty('PT_Beacon', (0.0, NY - 0.4, 2.7))
empty('PT_CrewSign', (0.0, NY - 0.03, 2.62))
empty('PT_Window', (0.0, NY, 1.45))

# ------------------------------------------------------------------ the flooded crew room behind it
RX0, RX1, RY0, RY1, RH = -4.0, 4.0, NY + D, 31.0, 3.4
box(flood, 'l3_concrete', (RX0, RY0, -0.2), (RX1, RY1, 0.0))
box(flood, 'l3_wall', (RX0 - T, RY0, 0.0), (RX0, RY1 + T, RH))
box(flood, 'l3_wall', (RX1, RY0, 0.0), (RX1 + T, RY1 + T, RH))
box(flood, 'l3_wall', (RX0, RY1, 0.0), (RX1, RY1 + T, RH))
box(flood, 'l3_wall', (RX0 - T, RY0, RH), (RX1 + T, RY1 + T, RH + 0.2))
box(flood, 'l3_concrete', (RX0, RY0, 0.0), (RX1, RY0 + 0.02, BAND))
for x in (-2.0, 0.0, 2.0):
    box(flood, 'l3_rust', (x - 0.1, RY0, RH - 0.16), (x + 0.1, RY1, RH))
# bunks along the west wall: two tiers, two bunks
for y0 in (25.6, 28.3):
    y1 = y0 + 2.0
    for (x, y) in ((-3.95, y0), (-3.05, y0), (-3.95, y1), (-3.05, y1)):
        box(flood, 'l3_rust', (x, y - 0.04, 0.0), (x + 0.08, y + 0.04, 2.1))
    for z in (0.45, 1.55):
        box(flood, 'l3_rust', (-3.95, y0, z - 0.06), (-2.97, y1, z))
        box(flood, 'l3_cloth', (-3.9, y0 + 0.05, z), (-3.02, y1 - 0.05, z + 0.14))
# lockers along the east wall, two hanging open
for i, y in enumerate([25.0 + 0.62 * k for k in range(8)]):
    box(flood, 'l3_wall', (3.42, y, 0.0), (3.98, y + 0.58, 1.95))
    if i in (2, 5):
        beam(flood, 'l3_wall', (3.42, y + 0.02, 0.05), (3.0, y - 0.25, 0.05), 0.02, 0.02)   # (door hinge line)
        box(flood, 'l3_wall', (3.0, y - 0.28, 0.05), (3.04, y + 0.28, 1.85))
# a table, a fallen chair, a tipped-over shelf
box(flood, 'l3_wall', (-0.9, 27.2, 0.72), (0.9, 28.6, 0.78))
for (x, y) in ((-0.82, 27.28), (0.76, 27.28), (-0.82, 28.46), (0.76, 28.46)):
    box(flood, 'l3_dark', (x, y, 0.0), (x + 0.06, y + 0.06, 0.72))
beam(flood, 'l3_dark', (1.6, 26.0, 0.05), (2.2, 26.7, 0.25), 0.45, 0.06)
beam(flood, 'l3_wall', (-1.8, 30.6, 0.1), (0.4, 30.2, 0.9), 0.4, 0.5)
# a hanging lamp in the middle of the room, still glowing faintly
beam(flood, 'l3_dark', (0.0, 27.9, RH), (0.0, 27.9, 2.7), 0.02, 0.02)
cyl(flood, 'l3_dark', (0.0, 27.9, 2.62), 0.22, 0.16, seg=14)
empty('PT_CrewRoom', (0.0, 27.6, 1.7))
# where the drowned crew float (one drifting close behind the glass)
for i, p in enumerate([(0.15, 25.0, 0.82), (-1.1, 26.9, 1.9), (1.05, 27.6, 1.15), (-0.4, 29.4, 2.3)]):
    empty(f'PT_Body_{i}', p)


def post(objs):
    for ob in objs:
        if ob.name.startswith(('L3_Props', 'FLOOD_Room', 'L3_Door')):
            kit.polish(ob, 0.008)


finish(OUT_BLEND, OUT_GLB, post=post)
