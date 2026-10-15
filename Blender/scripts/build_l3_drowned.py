"""
Level 3, the drowned deck: the lowest deck of the station, flooded to the waist. The machinery
deck, not a habitat: grey and brown metal, rust, cracked concrete, banks of pipes along every
wall with flanges, valves and gauges, cabinets and ducts, emergency strips and caged lamps.
The materials are textured by the game (ambientCG rust and concrete, mapped by world position);
here they only need their names. All modelled here (our own work).

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_l3_drowned.py -- \
      Blender/l3-drowned.blend public/assets/models/l3-drowned.glb

Layout (metres; x east, y north, z up; the floor is z 0 and the water stands over it):
  - the pump room, where Voss drops in through the shaft in its ceiling: x -3..3, y -3..3
  - the corridor running straight ahead (north): x -1.5..1.5, y 3..24, with rust ribs every 3 m
  - at its end, facing you, the door to the engine room with a big window: behind it the engine
    room, flooded to the ceiling, where the crew were locked in and drowned (x -5..5, y 24.3..34)
  - the way on turns left (west) at the door, to a sealed bulkhead at x -9 (the first gate)
  - through it, a stairwell climbs west out of the water to the dry EVA prep room (x -21..-12.4,
    y 19.5..25.5, floor 1.5 m up): the dive suits, the uplink cable on its reel, a status console
  - past the prep room's west wall, the water lock (x -25..-21.2) and the outer hatch to the sea

Names the game reads: COL_ collision; FLOOD_ the flooded engine room (drawn murky, as seen
through water); GLASS_ the door's window; SPAWN_L3 where he lands; PT_Shaft the shaft opening; LAMP_<n>
caged lamps (a light each); PT_Window, PT_CrewSign (the plate over the door), PT_Gate1, PT_Beacon,
PT_EngineRoom; PT_Body_<n> where the drowned crew float. DOOR_<name> doors the game moves (Gate1 and
its wheel, LockInner, LockOuter); PROP_CableEnd the cable's free end; PREP_LIGHT_<n> the prep room's
and the lock's lights; PT_Suit, PT_Cable, PT_Screen, PT_LockPanel, PT_LockBeacon, PT_LockMid,
PT_PrepDoor, PT_Outside and the PT_*Sign plates.
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
M('l3_gauge', (0.85, 0.9, 0.8), 0.3, 0, (0.75, 0.85, 0.65), 0.5)  # a gauge's dial, faintly lit
# the EVA prep room: as rusted as the rest of the deck, but its kit still works (orange paint, steel,
# the cable, lit panels and the console's screen)
M('l3_orange', (0.62, 0.24, 0.07), 0.7, 0.1)         # faded safety orange: stripes, plates, the reel
M('l3_soft', (0.035, 0.037, 0.042), 0.75, 0.0)       # soft black: rubber, cushions, frames
M('l3_steel', (0.55, 0.58, 0.6), 0.3, 0.85)          # bare steel: the axle, the connector
M('l3_cable', (0.85, 0.62, 0.06), 0.55, 0.0)         # the uplink cable's yellow jacket
M('l3_panel', (0.85, 0.92, 1.0), 0.4, 0, (0.8, 0.9, 1.0), 3.0)    # ceiling light panels
M('l3_screen', (0.05, 0.12, 0.16), 0.3, 0, (0.3, 0.75, 0.95), 1.2)  # the console's screen

shell = A('L3_Shell')       # floors, walls, ceilings
struct = A('L3_Struct')     # ribs, pipes, brackets, frames
props = A('L3_Props')       # the pump, crates, catwalk, lamps, debris
glow = A('L3_Glow')         # strips, lamp lenses, LEDs, beacons
door = A('L3_Door')         # the engine room door (around its window)
flood = A('FLOOD_Room')     # everything inside the flooded engine room
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


def wheel(c, r, axis='Y', acc=None):
    """A valve wheel facing along an axis (Y or X): a hub, six spokes and a ring of short beams."""
    acc = acc or props
    cx, cy, cz = c
    def at(a, rr):
        if axis == 'X':
            return (cx, cy + rr * math.cos(a), cz + rr * math.sin(a))
        return (cx + rr * math.cos(a), cy, cz + rr * math.sin(a))
    cyl(acc, 'l3_rust', c, r * 0.18, 0.08, seg=10, axis=axis)
    n = 14
    for i in range(n):
        beam(acc, 'l3_rust', at(2 * math.pi * i / n, r), at(2 * math.pi * (i + 1) / n, r), 0.035, 0.035)
    for i in range(6):
        beam(acc, 'l3_rust', c, at(2 * math.pi * i / 6, r), 0.025, 0.025)


def pipe_y(x, y0, y1, z, r, m='l3_rust', every=2.0, acc=None):
    """A pipe running north-south (along y), with a flange every so often."""
    acc = acc or struct
    cyl(acc, m, (x, (y0 + y1) / 2, z), r, y1 - y0, seg=12, axis='Y')
    y = y0 + every / 2
    while y < y1:
        cyl(acc, 'l3_dark', (x, y, z), r + 0.035, 0.07, seg=12, axis='Y')
        y += every


def pipe_x(x0, x1, y, z, r, m='l3_rust', every=2.0, acc=None):
    """A pipe running east-west (along x), with flanges."""
    acc = acc or struct
    cyl(acc, m, ((x0 + x1) / 2, y, z), r, x1 - x0, seg=12, axis='X')
    x = x0 + every / 2
    while x < x1:
        cyl(acc, 'l3_dark', (x, y, z), r + 0.035, 0.07, seg=12, axis='X')
        x += every


def drop(x, y, z0, z1, r, m='l3_rust', acc=None):
    """A pipe dropping straight down (into the water), a flange at each end."""
    acc = acc or struct
    cyl(acc, m, (x, y, (z0 + z1) / 2), r, z1 - z0, seg=12)
    for z in (z0 + 0.1, z1 - 0.1):
        cyl(acc, 'l3_dark', (x, y, z), r + 0.035, 0.07, seg=12)


def gauge(x, y, z, facing_x):
    """A round pressure gauge on a wall facing along x (+1 east, -1 west), its dial faintly lit."""
    cyl(props, 'l3_dark', (x + facing_x * 0.03, y, z), 0.12, 0.06, seg=14, axis='X')
    cyl(glow, 'l3_gauge', (x + facing_x * 0.065, y, z), 0.095, 0.01, seg=14, axis='X')
    beam(props, 'l3_dark', (x + facing_x * 0.072, y, z), (x + facing_x * 0.072, y + 0.06, z + 0.05), 0.01, 0.01)


def cabinet(x0, y0, x1, y1, z1, face_x):
    """An electrical cabinet against a wall: a box, its door seams and a vent, conduit up to the ceiling."""
    box(props, 'l3_wall', (x0, y0, 0.0), (x1, y1, z1), col=True)
    fx = x1 if face_x > 0 else x0
    s = 0.012 * face_x
    box(props, 'l3_dark', (fx - 0.005, (y0 + y1) / 2 - 0.01, 0.1), (fx + s, (y0 + y1) / 2 + 0.01, z1 - 0.1))
    for k in range(4):
        box(props, 'l3_dark', (fx - 0.005, y0 + 0.08, z1 - 0.35 - k * 0.06), (fx + s, y1 - 0.08, z1 - 0.33 - k * 0.06))
    cyl(struct, 'l3_dark', ((x0 + x1) / 2, (y0 + y1) / 2, (z1 + 3.0) / 2), 0.04, 3.0 - z1, seg=8)


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
CW = 1.15
box(props, 'l3_grate', (-3.0, -1.4, CW - 0.06), (-1.6, 2.9, CW), col=True)
for x in (-2.95, -1.65):
    for y in (-1.35, 0.7, 2.85):
        beam(props, 'l3_rust', (x, y, 0.0), (x, y, CW - 0.06), 0.06, 0.06)
beam(props, 'l3_rust', (-1.62, -1.4, CW + 0.55), (-1.62, 2.9, CW + 0.55), 0.04, 0.04)   # its rail
for y in (-1.4, 0.7, 2.9):
    beam(props, 'l3_rust', (-1.62, y, CW), (-1.62, y, CW + 0.55), 0.04, 0.04)
# the pump room's control panel over the catwalk, gauges, and pipes along the south wall
box(props, 'l3_wall', (-3.0, -0.6, CW + 0.25), (-2.8, 1.2, CW + 1.35), col=True)
box(props, 'l3_dark', (-2.82, -0.5, CW + 0.95), (-2.78, 1.1, CW + 1.25))
for y in (-0.25, 0.3, 0.85):
    gauge(-2.8, y, CW + 0.6, 1)
pipe_x(-3.0, 3.0, -2.84, 2.75, 0.13)
pipe_x(-3.0, 1.0, -2.88, 2.4, 0.07, 'l3_dark')
pipe_x(-3.0, 1.0, -2.86, 1.55, 0.1, 'l3_wall')
drop(-0.6, -2.84, 0.0, 2.75, 0.1)
wheel((-0.6, -2.7, 1.35), 0.26)
drop(2.85, 2.2, 0.0, 3.4, 0.12)
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
# banks of pipes along both walls, big and small, with flanges, on brackets
pipe_y(-1.3, 3.2, 21.0, 2.62, 0.11)
pipe_y(-1.33, 3.2, 21.0, 2.36, 0.065, 'l3_dark', 3.0)
pipe_y(-1.31, 3.2, 21.0, 1.72, 0.09, 'l3_wall', 2.5)
pipe_y(-1.28, 3.2, 21.0, 0.78, 0.12, 'l3_rust', 3.0)          # half under the water
pipe_y(1.27, 3.2, 24.0, 2.66, 0.14)
pipe_y(1.32, 3.2, 24.0, 2.22, 0.07, 'l3_dark', 3.0)
pipe_y(1.3, 3.2, 24.0, 1.55, 0.1, 'l3_wall', 2.5)
for y in [3.8 + 1.5 * k for k in range(13)]:
    box(struct, 'l3_dark', (-1.5, y - 0.03, 0.6), (-1.15, y + 0.03, 2.75))
    box(struct, 'l3_dark', (1.1, y - 0.03, 1.4), (1.5, y + 0.03, 2.8))
# pipes dropping into the water, each with a valve wheel, and gauges between them
for y in (6.0, 12.8, 18.2):
    drop(-1.12, y, 0.0, 2.62, 0.09)
    wheel((-0.98, y, 1.45), 0.2, axis='X')
for y in (9.2, 16.2):
    drop(1.1, y, 0.0, 2.66, 0.1)
    wheel((0.96, y, 1.35), 0.22, axis='X')
for (x, y, f) in ((-1.5, 7.6, 1), (1.5, 11.3, -1), (-1.5, 15.4, 1), (1.5, 19.6, -1), (-1.5, 20.4, 1)):
    gauge(x, y, 1.95, f)
# electrical cabinets against the east wall, and a pump unit against the west
cabinet(1.1, 4.6, 1.5, 5.9, 2.0, -1)
cabinet(1.05, 21.6, 1.5, 22.6, 1.9, -1)
box(props, 'l3_wall', (-1.5, 13.4, 0.0), (-1.05, 14.6, 1.3), col=True)
cyl(props, 'l3_rust', (-1.18, 14.0, 1.55), 0.25, 1.0, seg=14, axis='Y')
cyl(props, 'l3_dark', (-1.18, 14.0, 1.55), 0.29, 0.1, seg=14, axis='Y')
# a ventilation duct along the ceiling, and a cable tray sagging where a hanger gave way
box(struct, 'l3_wall', (-0.95, 3.4, 2.45), (-0.2, 21.0, 2.82))
for y in [4.0 + 2.5 * k for k in range(7)]:
    box(struct, 'l3_dark', (-0.97, y - 0.04, 2.43), (-0.18, y + 0.04, 2.84))
box(struct, 'l3_grate', (0.15, 3.4, 2.78), (0.65, 14.0, 2.8))
beam(struct, 'l3_grate', (0.4, 14.0, 2.79), (0.4, 19.5, 2.2), 0.5, 0.02)
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
# the north wall, the engine room door in its middle (x -1..1)
NY = 24.0
D = 0.3
wall((-9.2, NY, 0), (-1.0, NY + D, 3.0))
wall((1.0, NY, 0), (1.7, NY + D, 3.0))
box(shell, 'l3_wall', (-1.0, NY, 2.3), (1.0, NY + D, 3.0), col=True)
# the way west, to the first gate
floor(-9.2, 21.0, -1.5, 24.0)
wall((-9.2, 21.0 - T, 0), (-1.5, 21.0, 3.0))
ceiling(-9.4, 20.8, -1.5, 24.2, 3.0)
# the west wall, with the gate's doorway (y 21.6..23.4, up to 2.4) and above it the taller stairwell
G0, G1, GZ = 21.6, 23.4, 2.4
wall((-9.2 - T, 20.8, 0), (-9.2, G0, 3.0))
wall((-9.2 - T, G1, 0), (-9.2, 24.2, 3.0))
wall((-9.2 - T, G0, GZ), (-9.2, G1, 3.0), band=False)
wall((-9.2 - T, G0 - T, 3.2), (-9.2, G1 + T, 4.6), band=False)
for x in (-4.5, -7.5):
    box(struct, 'l3_rust', (x - 0.1, 21.0, 0.0), (x + 0.1, 21.14, 3.0))
    box(struct, 'l3_rust', (x - 0.1, NY - 0.14, 0.0), (x + 0.1, NY, 3.0))
    box(struct, 'l3_rust', (x - 0.1, 21.0, 2.84), (x + 0.1, NY, 3.0))
cyl(struct, 'l3_rust', (-5.35, 21.2, 2.62), 0.11, 7.7, seg=10, axis='X')
empty('LAMP_4', (-6.0, 22.6, 2.3))
box(glow, 'l3_lamp', (-6.15, 23.86, 2.4), (-5.85, 24.0, 2.5))
# (no strip lights on this stretch: they are dead)
# the sealed bulkhead at the end of the west branch: a heavy door in a hazard-striped frame. The
# door and its wheel are their own objects (DOOR_Gate1, DOOR_Gate1Wheel): the game turns the wheel,
# then lifts the door into the ceiling, and gives the door its own collider while it is shut.
gate = A('DOOR_Gate1', origin=(-9.12, 22.5, 0.0))
gate_wheel = A('DOOR_Gate1Wheel', origin=(-8.98, 22.5, 1.3))
box(gate, 'l3_rust', (-9.2, G0, 0.0), (-9.05, G1, GZ))
for z in (0.6, 1.8):
    box(gate, 'l3_dark', (-9.06, G0 + 0.1, z - 0.04), (-9.03, G1 - 0.1, z + 0.04))
wheel((-8.98, 22.5, 1.3), 0.3, axis='X', acc=gate_wheel)
for y0, y1 in ((21.5, 21.62), (23.38, 23.5)):
    box(props, 'l3_hazard', (-9.05, y0, 0.0), (-9.0, y1, GZ))
box(props, 'l3_hazard', (-9.05, 21.5, GZ - 0.04), (-9.0, 23.5, GZ + 0.08))
cyl(glow, 'l3_alarm', (-9.0, 22.5, 2.62), 0.07, 0.12, seg=10)
empty('PT_Gate1', (-8.8, 22.5, 1.2))

# ------------------------------------------------------------------ the engine room door, with its window
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

# ------------------------------------------------------------------ the flooded engine room behind it
# The main engine room, where ARIA shut the crew in: two big engines with their rows of cylinders,
# exhausts rising into the ceiling, the generator at the far end, catwalks along the walls. Flooded
# to the ceiling; only ever seen through the door's window.
RX0, RX1, RY0, RY1, RH = -5.0, 5.0, NY + D, 34.0, 4.6
box(flood, 'l3_concrete', (RX0, RY0, -0.2), (RX1, RY1, 0.0))
box(flood, 'l3_wall', (RX0 - T, RY0, 0.0), (RX0, RY1 + T, RH))
box(flood, 'l3_wall', (RX1, RY0, 0.0), (RX1 + T, RY1 + T, RH))
box(flood, 'l3_wall', (RX0, RY1, 0.0), (RX1, RY1 + T, RH))
box(flood, 'l3_wall', (RX0 - T, RY0, RH), (RX1 + T, RY1 + T, RH + 0.2))
for y in (26.5, 29.5, 32.5):
    box(flood, 'l3_rust', (RX0, y - 0.12, RH - 0.25), (RX1, y + 0.12, RH))
box(flood, 'l3_grate', (-1.6, RY0, 0.0), (1.6, RY1, 0.06))       # the grated aisle between the engines
for side in (-1, 1):
    ex = side * 2.6
    # the engine block: its bed, its crankcase, six cylinders with their heads, an exhaust manifold
    box(flood, 'l3_dark', (ex - 1.0, 25.6, 0.0), (ex + 1.0, 32.2, 1.25))
    box(flood, 'l3_rust', (ex - 0.85, 25.8, 1.25), (ex + 0.85, 32.0, 1.55))
    for k in range(6):
        cy = 26.4 + k * 1.0
        cyl(flood, 'l3_wall', (ex, cy, 1.95), 0.32, 0.8, seg=14)
        cyl(flood, 'l3_rust', (ex, cy, 2.4), 0.37, 0.12, seg=14)
        cyl(flood, 'l3_dark', (ex + side * 0.3, cy, 2.55), 0.06, 0.4, seg=8, axis='X')
    pipe_y(ex + side * 0.55, 25.8, 32.4, 2.75, 0.16, acc=flood)
    drop(ex + side * 0.55, 32.4, 2.75, RH, 0.2, acc=flood)
    # a flywheel at the near end of each engine
    cyl(flood, 'l3_rust', (ex, 25.45, 1.0), 0.75, 0.22, seg=24, axis='Y')
    # catwalk along the wall above, on brackets, with a rail
    wx = side * 4.5
    box(flood, 'l3_grate', (wx - 0.5, RY0, 2.95), (wx + 0.5, RY1, 3.0))
    for y in [25.0 + 1.5 * k for k in range(7)]:
        beam(flood, 'l3_rust', (wx - side * 0.5, y, 3.0), (wx - side * 0.5, y, 3.95), 0.04, 0.04)
        beam(flood, 'l3_rust', (wx + side * 0.5, y, 2.95), (wx + side * 0.5, y, 2.4), 0.05, 0.05)
    beam(flood, 'l3_rust', (wx - side * 0.5, RY0, 3.95), (wx - side * 0.5, RY1, 3.95), 0.04, 0.04)
    # pipes along the walls
    pipe_y(side * 4.85, RY0, RY1, 3.9, 0.15, acc=flood)
    pipe_y(side * 4.88, RY0, RY1, 1.6, 0.11, 'l3_dark', acc=flood)
# the generator across the far end
cyl(flood, 'l3_rust', (0.0, 33.0, 1.3), 0.95, 3.6, seg=24, axis='X')
box(flood, 'l3_dark', (-2.0, 32.2, 0.0), (2.0, 33.8, 0.45))
for x in (-1.9, 1.9):
    cyl(flood, 'l3_dark', (x, 33.0, 1.3), 1.05, 0.12, seg=24, axis='X')
# a control console just inside the door, to one side
box(flood, 'l3_wall', (1.8, 24.6, 0.0), (3.2, 25.2, 1.0))
beam(flood, 'l3_dark', (1.8, 25.05, 1.15), (3.2, 25.05, 1.15), 0.3, 0.06)
# two lamps hanging over the aisle, one still faintly lit
for y in (27.2, 31.0):
    beam(flood, 'l3_dark', (0.0, y, RH), (0.0, y, 3.75), 0.02, 0.02)
    cyl(flood, 'l3_dark', (0.0, y, 3.68), 0.24, 0.16, seg=14)
empty('PT_EngineRoom', (0.0, 28.6, 2.2))
# where the drowned crew float, in the aisle (one drifting close behind the glass)
for i, p in enumerate([(0.15, 25.0, 0.82), (-0.6, 27.4, 2.3), (0.9, 28.6, 1.5), (-0.2, 30.8, 3.0)]):
    empty(f'PT_Body_{i}', p)

# ------------------------------------------------------------------ through the gate: up out of the water
# A stairwell climbs west out of the flood to the EVA prep room, which is dry: the suits, the uplink
# cable on its reel, a status console, and at the far end the water lock out to the sea.
FZ = 1.5                    # the prep room's floor, well above the water
SX0, SX1 = -12.4, -9.4      # the stairwell, x
floor(-9.6, G0, -9.2, G1)
STEPS = 6
RUN = (SX1 - 0.2 - (SX0 + 0.1)) / STEPS
for k in range(1, STEPS + 1):
    x1 = SX1 - 0.2 - RUN * (k - 1)
    top = FZ * k / STEPS
    box(shell, 'l3_concrete', (x1 - RUN, G0, -0.2), (x1, G1, top), col=True)
    box(props, 'l3_hazard', (x1 - 0.06, G0 + 0.05, top), (x1, G1 - 0.05, top + 0.005))
box(shell, 'l3_grate', (SX0 - 0.05, G0, FZ - 0.2), (SX0 + 0.1, G1, FZ), col=True)
wall((SX0, G0 - T, 0), (SX1, G0, 4.6))
wall((SX0, G1, 0), (SX1, G1 + T, 4.6))
ceiling(SX0, G0 - T, SX1, G1 + T, 4.6)
# a pipe up each side of the stairwell, rising with the steps, and a handrail on the right
beam(struct, 'l3_rust', (SX1, G0 + 0.12, 2.4), (SX0, G0 + 0.12, 2.4 + FZ), 0.14, 0.14)
beam(struct, 'l3_dark', (SX1, G1 - 0.1, 3.4), (SX0, G1 - 0.1, 3.4 + 0.6), 0.08, 0.08)
beam(props, 'l3_dark', (SX1 - 0.2, G1 - 0.08, 0.95), (SX0 + 0.1, G1 - 0.08, 0.95 + FZ), 0.05, 0.05)
for x in (SX1 - 0.4, (SX0 + SX1) / 2, SX0 + 0.3):
    h = FZ * (SX1 - 0.2 - x) / (SX1 - 0.2 - (SX0 + 0.1))
    beam(props, 'l3_dark', (x, G1 - 0.02, h + 0.95), (x, G1 - 0.13, h + 0.95), 0.04, 0.04)
# a caged lamp high on the stairwell's north wall
box(props, 'l3_dark', (-11.05, G1 - 0.06, 3.7), (-10.75, G1, 3.9))
box(glow, 'l3_lamp', (-11.0, G1 - 0.14, 3.72), (-10.8, G1 - 0.06, 3.86))
empty('PREP_LIGHT_0', (-10.9, 22.6, 3.6))

# ------------------------------------------------------------------ the EVA prep room
PX0, PX1, PY0, PY1, PZ = -21.0, -12.4, 19.5, 25.5, FZ + 3.0
room = A('L3_Prep')         # the prep room's walls and fittings
box(room, 'l3_grate', (PX0, PY0, FZ - 0.2), (PX1, PY1, FZ), col=True)
box(room, 'l3_wall', (PX0 - T, PY0 - T, FZ), (PX1 + T, PY0, PZ), col=True)          # south
box(room, 'l3_wall', (PX0 - T, PY1, FZ), (PX1 + T, PY1 + T, PZ), col=True)          # north
box(room, 'l3_wall', (PX1, PY0, FZ - 0.2), (PX1 + T, G0, PZ), col=True)             # east, by the door
box(room, 'l3_wall', (PX1, G1, FZ - 0.2), (PX1 + T, PY1, PZ), col=True)
box(room, 'l3_wall', (PX1, G0, FZ + 2.5), (PX1 + T, G1, 4.6), col=True)
L0, L1, LZ = 21.8, 23.2, FZ + 2.1       # the lock's hatchways, y and height
box(room, 'l3_wall', (PX0 - T, PY0, FZ), (PX0, L0, PZ), col=True)                   # west, by the hatch
box(room, 'l3_wall', (PX0 - T, L1, FZ), (PX0, PY1, PZ), col=True)
box(room, 'l3_wall', (PX0 - T, L0, LZ), (PX0, L1, PZ), col=True)
box(room, 'l3_rust', (PX0 - T, PY0 - T, PZ), (PX1 + T, PY1 + T, PZ + 0.2), col=True)   # ceiling
# a soft black skirting and an orange stripe round the walls at hip height
for (lo, hi) in (((PX0, PY0, FZ), (PX1, PY0 + 0.03, FZ + 0.12)), ((PX0, PY1 - 0.03, FZ), (PX1, PY1, FZ + 0.12)),
                 ((PX0, PY0, FZ + 1.0), (PX1, PY0 + 0.015, FZ + 1.07)), ((PX0, PY1 - 0.015, FZ + 1.0), (PX1, PY1, FZ + 1.07))):
    box(room, 'l3_soft' if lo[2] == FZ else 'l3_orange', lo, hi)
for (y0, y1) in ((PY0, G0), (G1, PY1)):
    box(room, 'l3_soft', (PX1 - 0.03, y0, FZ), (PX1, y1, FZ + 0.12))
    box(room, 'l3_orange', (PX1 - 0.015, y0, FZ + 1.0), (PX1, y1, FZ + 1.07))
for (y0, y1) in ((PY0, L0), (L1, PY1)):
    box(room, 'l3_soft', (PX0, y0, FZ), (PX0 + 0.03, y1, FZ + 0.12))
    box(room, 'l3_orange', (PX0, y0, FZ + 1.0), (PX0 + 0.015, y1, FZ + 1.07))
# the doorway in from the stairwell: an orange frame
for (y0, y1) in ((G0 - 0.12, G0), (G1, G1 + 0.12)):
    box(room, 'l3_orange', (PX1 - 0.03, y0, FZ), (PX1 + T + 0.02, y1, FZ + 2.5))
box(room, 'l3_orange', (PX1 - 0.03, G0 - 0.12, FZ + 2.5), (PX1 + T + 0.02, G1 + 0.12, FZ + 2.62))
empty('PT_PrepSign', (PX1 + T + 0.03, 22.5, FZ + 2.85))
empty('PT_PrepDoor', (PX1 - 0.6, 22.5, FZ + 1.2))

# two ceiling light panels
for i, x in enumerate((-18.6, -14.8)):
    box(room, 'l3_soft', (x - 1.0, 22.15, PZ - 0.07), (x + 1.0, 22.85, PZ))
    box(glow, 'l3_panel', (x - 0.92, 22.22, PZ - 0.08), (x + 0.92, 22.78, PZ - 0.07))
    empty(f'PREP_LIGHT_{i + 1}', (x, 22.5, PZ - 0.6))
# pipes and a cable tray along the top of the north and south walls
cyl(struct, 'l3_soft', ((PX0 + PX1) / 2, PY1 - 0.18, PZ - 0.3), 0.07, PX1 - PX0, seg=12, axis='X')
cyl(struct, 'l3_rust', ((PX0 + PX1) / 2, PY1 - 0.38, PZ - 0.22), 0.05, PX1 - PX0, seg=10, axis='X')
box(struct, 'l3_soft', (PX0, PY0 + 0.05, PZ - 0.42), (PX1, PY0 + 0.35, PZ - 0.38))

# the suit racks on the north wall (rusted frames, steel yokes): EVA 1 (empty) and EVA 2 (the suit hangs here)
for i, x in enumerate((-18.4, -16.0)):
    box(room, 'l3_rust', (x - 0.6, PY1 - 0.06, FZ + 0.12), (x + 0.6, PY1, FZ + 2.6))
    for dx in (-0.55, 0.55):
        box(room, 'l3_soft', (x + dx - 0.04, PY1 - 0.35, FZ), (x + dx + 0.04, PY1 - 0.06, FZ + 2.6))
    box(room, 'l3_soft', (x - 0.59, PY1 - 0.35, FZ + 2.52), (x + 0.59, PY1 - 0.06, FZ + 2.6))
    box(room, 'l3_soft', (x - 0.59, PY1 - 0.4, FZ), (x + 0.59, PY1 - 0.06, FZ + 0.06))         # its foot plate
    # the shoulder yoke the suit hangs from, on an arm out from the wall
    box(room, 'l3_steel', (x - 0.03, PY1 - 0.35, FZ + 1.95), (x + 0.03, PY1 - 0.06, FZ + 2.0))
    box(room, 'l3_steel', (x - 0.24, PY1 - 0.38, FZ + 1.9), (x + 0.24, PY1 - 0.3, FZ + 1.96))
    box(room, 'l3_orange', (x - 0.32, PY1 - 0.07, FZ + 2.66), (x + 0.32, PY1 - 0.03, FZ + 2.9))
    empty(f'PT_RackSign_{i + 1}', (x, PY1 - 0.075, FZ + 2.78))
empty('PT_Suit', (-16.0, PY1 - 0.5, FZ + 0.07))

# the uplink cable on its reel, on the east wall north of the door: a drum on an axle out from the
# wall, its flanges orange, wound with the yellow cable; the free end hangs down to a wall clip
RY, RZ, RR = 24.55, FZ + 1.45, 0.42
cyl(room, 'l3_steel', (PX1 - 0.4, RY, RZ), 0.05, 0.8, seg=12, axis='X')
box(room, 'l3_soft', (PX1 - 0.08, RY - 0.25, RZ - 0.25), (PX1, RY + 0.25, RZ + 0.25))
for x in (PX1 - 0.16, PX1 - 0.74):
    cyl(room, 'l3_orange', (x, RY, RZ), RR + 0.08, 0.04, seg=28, axis='X')
cyl(room, 'l3_cable', (PX1 - 0.45, RY, RZ), RR, 0.54, seg=28, axis='X')
for k in range(9):
    cyl(room, 'l3_soft', (PX1 - 0.2 - k * 0.06, RY, RZ), RR + 0.004, 0.006, seg=28, axis='X')
cyl(room, 'l3_soft', (PX1 - 0.79, RY, RZ), 0.1, 0.06, seg=14, axis='X')        # the crank's hub
beam(room, 'l3_soft', (PX1 - 0.82, RY, RZ), (PX1 - 0.82, RY + 0.22, RZ + 0.18), 0.04, 0.03)
# (the free end is its own object, so it can go with him: PROP_CableEnd)
cable_end = A('PROP_CableEnd')
beam(cable_end, 'l3_cable', (PX1 - 0.45, RY - RR + 0.02, RZ - 0.1), (PX1 - 0.45, RY - 0.55, FZ + 0.75), 0.035, 0.035)
cyl(cable_end, 'l3_soft', (PX1 - 0.45, RY - 0.55, FZ + 0.68), 0.04, 0.14, seg=12)
cyl(cable_end, 'l3_steel', (PX1 - 0.45, RY - 0.55, FZ + 0.57), 0.032, 0.09, seg=12)
box(room, 'l3_soft', (PX1 - 0.06, RY - 0.62, FZ + 0.6), (PX1, RY - 0.48, FZ + 0.76))
beam(room, 'l3_soft', (PX1 - 0.06, RY - 0.55, FZ + 0.68), (PX1 - 0.4, RY - 0.55, FZ + 0.68), 0.03, 0.03)
empty('PT_Cable', (PX1 - 0.45, RY - 0.1, RZ - 0.15))
empty('PT_ReelSign', (PX1 - 0.005, RY, RZ + 0.72))

# lockers along the south wall, with a bench in front
for k in range(6):
    x0 = -20.8 + k * 0.62
    box(room, 'l3_wall', (x0, PY0, FZ), (x0 + 0.6, PY0 + 0.5, FZ + 2.0), col=(k == 0))
    box(room, 'l3_soft', (x0 + 0.08, PY0 + 0.5, FZ + 1.7), (x0 + 0.52, PY0 + 0.51, FZ + 1.86))     # its vent
    box(room, 'l3_orange', (x0 + 0.22, PY0 + 0.5, FZ + 1.5), (x0 + 0.38, PY0 + 0.512, FZ + 1.58))  # its number tab
    box(room, 'l3_steel', (x0 + 0.48, PY0 + 0.5, FZ + 0.95), (x0 + 0.51, PY0 + 0.53, FZ + 1.15))   # its handle
col_box((-20.8, PY0, FZ), (-20.8 + 6 * 0.62, PY0 + 0.5, FZ + 2.0))
box(room, 'l3_soft', (-20.5, 20.25, FZ + 0.38), (-17.4, 20.65, FZ + 0.48), col=True)
for x in (-20.3, -17.6):
    box(room, 'l3_rust', (x - 0.05, 20.3, FZ), (x + 0.05, 20.6, FZ + 0.38))

# the status console in the south-east corner: a desk, a sloped panel and a screen
box(room, 'l3_wall', (-15.9, PY0, FZ), (-13.3, PY0 + 0.75, FZ + 0.85), col=True)
beam(room, 'l3_rust', (-15.85, PY0 + 0.45, FZ + 0.92), (-13.35, PY0 + 0.45, FZ + 0.92), 0.5, 0.12)
for k in range(8):
    box(glow, 'l3_led' if k % 3 else 'l3_alarm', (-15.6 + k * 0.28, PY0 + 0.55, FZ + 0.97), (-15.5 + k * 0.28, PY0 + 0.62, FZ + 1.0))
box(room, 'l3_soft', (-15.3, PY0, FZ + 1.15), (-13.9, PY0 + 0.1, FZ + 2.0))
box(glow, 'l3_screen', (-15.22, PY0 + 0.1, FZ + 1.22), (-13.98, PY0 + 0.105, FZ + 1.93))
empty('PT_Screen', (-14.6, PY0 + 0.11, FZ + 1.575))

# hazard stripes on the floor before the lock's hatch
for k in range(7):
    y = L0 + k * 0.2
    box(room, 'l3_hazard' if k % 2 == 0 else 'l3_soft', (PX0, y, FZ), (PX0 + 0.6, y + 0.2, FZ + 0.004))
empty('PT_LockSign', (PX0 + 0.005, 22.5, LZ + 0.42))

# ------------------------------------------------------------------ the water lock
# A small steel chamber between the prep room and the sea. In: the inner hatch slides shut, the lock
# floods from the floor vents until its pressure matches the sea's, and the outer hatch opens.
# Back in, it is pumped dry before the inner hatch will open.
KX0, KX1, KY0, KY1, KZ = -25.0, PX0 - T, 21.0, 24.0, FZ + 2.8
lock = A('L3_Lock')
box(lock, 'l3_grate', (KX0, KY0, FZ - 0.06), (KX1, KY1, FZ), col=True)
box(lock, 'l3_dark', (KX0, KY0, FZ - 0.45), (KX1, KY1, FZ - 0.4))                     # the sump below
box(lock, 'l3_wall', (KX0, KY0 - T, FZ - 0.45), (KX1, KY0, KZ), col=True)
box(lock, 'l3_wall', (KX0, KY1, FZ - 0.45), (KX1, KY1 + T, KZ), col=True)
box(lock, 'l3_wall', (KX0 - T, KY0 - T, KZ), (KX1, KY1 + T, KZ + 0.2), col=True)
box(lock, 'l3_wall', (KX0 - T, KY0 - T, FZ - 0.45), (KX0, L0, KZ), col=True)        # the outer wall
box(lock, 'l3_wall', (KX0 - T, L1, FZ - 0.45), (KX0, KY1 + T, KZ), col=True)
box(lock, 'l3_wall', (KX0 - T, L0, LZ), (KX0, L1, KZ), col=True)
box(lock, 'l3_wall', (KX1, KY0 - T, FZ - 0.45), (PX0 - T, KY1 + T, FZ))              # under the inner sill
# ribs, the flood vents along the foot of each side, and hazard paint round both hatchways
for x in (-24.0, -22.6):
    box(lock, 'l3_rust', (x - 0.08, KY0, FZ), (x + 0.08, KY0 + 0.1, KZ))
    box(lock, 'l3_rust', (x - 0.08, KY1 - 0.1, FZ), (x + 0.08, KY1, KZ))
    box(lock, 'l3_rust', (x - 0.08, KY0, KZ - 0.1), (x + 0.08, KY1, KZ))
for (y0, y1) in ((KY0, KY0 + 0.05), (KY1 - 0.05, KY1)):
    for k in range(4):
        x0 = -24.7 + k * 0.85
        box(lock, 'l3_dark', (x0, y0, FZ + 0.08), (x0 + 0.5, y1, FZ + 0.3))
for xf in (KX0, PX0 - T):
    sx = 0.04 if xf == KX0 else -0.04
    for (y0, y1) in ((L0 - 0.12, L0), (L1, L1 + 0.12)):
        box(lock, 'l3_hazard', (xf, y0, FZ), (xf + sx, y1, LZ))
    box(lock, 'l3_hazard', (xf, L0 - 0.12, LZ), (xf + sx, L1 + 0.12, LZ + 0.12))
# the panel that floods it, by the inner hatch, and a red beacon in the ceiling
box(lock, 'l3_dark', (-22.35, KY1 - 0.12, FZ + 0.95), (-21.75, KY1, FZ + 1.65))
box(glow, 'l3_alarm', (-22.2, KY1 - 0.14, FZ + 1.4), (-22.05, KY1 - 0.12, FZ + 1.52))
box(glow, 'l3_led', (-21.98, KY1 - 0.14, FZ + 1.4), (-21.88, KY1 - 0.12, FZ + 1.52))
box(glow, 'l3_screen', (-22.25, KY1 - 0.13, FZ + 1.08), (-21.85, KY1 - 0.12, FZ + 1.3))
empty('PT_LockPanel', (-22.05, KY1 - 0.2, FZ + 1.3))
cyl(lock, 'l3_dark', (-23.0, 22.5, KZ - 0.05), 0.12, 0.1, seg=12)
cyl(glow, 'l3_alarm', (-23.0, 22.5, KZ - 0.15), 0.09, 0.12, seg=12)
empty('PT_LockBeacon', (-23.0, 22.5, KZ - 0.45))
box(props, 'l3_dark', (-24.2, KY0, KZ - 0.5), (-23.9, KY0 + 0.06, KZ - 0.3))
box(glow, 'l3_lamp', (-24.15, KY0 + 0.06, KZ - 0.48), (-23.95, KY0 + 0.12, KZ - 0.32))
empty('PREP_LIGHT_3', (-24.0, 21.6, KZ - 0.6))
empty('PT_LockMid', (-23.1, 22.5, FZ + 1.2))

# the hatches: rusted steel slabs in orange frames, each with a porthole and a handle. They slide north into
# the wall (DOOR_LockInner, DOOR_LockOuter); the game moves them and gives each a collider.
def hatch(name, x):
    acc = A(name, origin=(x, (L0 + L1) / 2, FZ))
    box(acc, 'l3_wall', (x - 0.05, L0, FZ), (x + 0.05, L1, LZ))
    for s in (-1, 1):
        fx = x + s * 0.05
        box(acc, 'l3_orange', (fx, L0 + 0.05, FZ + 0.05), (fx + s * 0.015, L1 - 0.05, FZ + 0.12))
        box(acc, 'l3_orange', (fx, L0 + 0.05, LZ - 0.12), (fx + s * 0.015, L1 - 0.05, LZ - 0.05))
        cyl(acc, 'l3_soft', (fx + s * 0.012, 22.5, FZ + 1.5), 0.2, 0.03, seg=20, axis='X')
        cyl(acc, 'l3_glass', (fx + s * 0.03, 22.5, FZ + 1.5), 0.15, 0.01, seg=20, axis='X')
        box(acc, 'l3_steel', (fx, L1 - 0.3, FZ + 0.95), (fx + s * 0.05, L1 - 0.24, FZ + 1.25))
hatch('DOOR_LockInner', PX0 - 0.1)
hatch('DOOR_LockOuter', KX0 - 0.1)

# outside: a short black throat of hull past the outer hatch, open to the sea
box(lock, 'l3_dark', (-29.0, L0 - 0.6, FZ - 0.4), (KX0 - T, L1 + 0.6, FZ - 0.2), col=True)
box(lock, 'l3_dark', (-29.0, L0 - 0.8, FZ - 0.4), (KX0 - T, L0 - 0.6, LZ + 0.6), col=True)
box(lock, 'l3_dark', (-29.0, L1 + 0.6, FZ - 0.4), (KX0 - T, L1 + 0.8, LZ + 0.6), col=True)
box(lock, 'l3_dark', (-29.0, L0 - 0.8, LZ + 0.6), (KX0 - T, L1 + 0.8, LZ + 0.8), col=True)
col_box((-29.2, L0 - 0.8, FZ - 0.4), (-29.0, L1 + 0.8, LZ + 0.8))   # (the level ends before here)
empty('PT_Outside', (-26.6, 22.5, FZ + 1.0))


def post(objs):
    for ob in objs:
        if ob.name.startswith(('L3_Props', 'FLOOD_Room', 'L3_Door', 'L3_Prep', 'DOOR_', 'PROP_')):
            kit.polish(ob, 0.008)


finish(OUT_BLEND, OUT_GLB, post=post)
