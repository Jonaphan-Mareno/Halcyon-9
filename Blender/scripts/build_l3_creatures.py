"""
Level 3's creatures that need modelling (the rest are built in the game's code, src/level3/SeaLife.js):
the anglerfish. A deep-sea angler, about a metre long: a lumpy dark body that is mostly head, an
underbite with rows of needle teeth round a dark gaping mouth, small dead eyes, a spiny back,
ragged fins, and the lure: a rod arching forward from the head with a glowing bulb on its end.
All our own work.

Run (from the repo root):
  blender -b --factory-startup --python Blender/scripts/build_l3_creatures.py -- \
      Blender/l3-creatures.blend public/assets/models/l3-creatures.glb

The angler faces +y here (the game's -z), its belly at z ~ -0.3. Names the game reads: ANGLER (the
fish); PT_Lure where its lure's glow goes.
"""
import sys, os, math, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import bmesh
from mathutils import Vector, Matrix, noise
import kit
from kit import A, beam, empty, finish

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_BLEND = argv[0] if len(argv) > 0 else None
OUT_GLB = argv[1] if len(argv) > 1 else None

random.seed(4)
kit.begin('L3Creatures', palette='lab')
M = kit.mat
M('l3_angler', (0.07, 0.055, 0.05), 0.6, 0.0)                      # dark, slick skin
M('l3_angler_belly', (0.16, 0.12, 0.1), 0.65, 0.0)
M('l3_angler_mouth', (0.04, 0.008, 0.01), 0.5, 0.0, (0.05, 0.0, 0.01), 0.15)   # the dark red-black inside of the mouth
M('l3_teeth', (0.55, 0.5, 0.4), 0.3, 0.0)                          # yellowed, glassy
M('l3_eye', (0.02, 0.02, 0.025), 0.1, 0.3, (0.05, 0.12, 0.14), 0.4)
M('l3_angler_fin', (0.12, 0.09, 0.08), 0.6, 0.0)
M('l3_lure', (0.6, 1.0, 0.95), 0.3, 0.0, (0.45, 1.0, 0.9), 6.0)

fish = A('ANGLER')


def add_mesh(acc, mat, bm_src_verts):
    acc.tag(mat, kit._faces(bm_src_verts))


# ---------------------------------------------------------------- the body
# A sphere stretched along y, mostly head: wide in front, narrowing to the tail, flatter below,
# the lower jaw pushed forward (the underbite), and lumpy all over
bm = fish.bm
verts = bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=18, radius=0.32)['verts']
for v in verts:
    x, y, z = v.co
    y *= 1.55                                   # long
    t = (y + 0.5) / 1.0                         # 0 at the tail end, 1 at the nose
    narrow = 0.32 + 0.68 * math.sqrt(max(0.0, min(1.0, t * 1.15)))
    x *= narrow * 1.05
    z *= narrow
    if z < 0:
        z *= 0.8                                # flatter belly
    if z < -0.04 and y > 0.1:                   # the underbite
        y += 0.1 * min(1.0, (y - 0.1) / 0.35)
        z -= 0.03
    n = noise.noise(Vector((x * 9, y * 9, z * 9)))
    v.co = Vector((x, y, z)) * (1.0 + 0.05 * n)
fish.tag('l3_angler', kit._faces(verts))
belly = [f for f in kit._faces(verts) if f.calc_center_median().z < -0.12]
fish.tag('l3_angler_belly', belly)

# the mouth: a dark gaping hollow across the front, with teeth along its upper and lower edges
mouth = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.2)['verts']
bmesh.ops.transform(bm, matrix=Matrix.Translation((0, 0.42, -0.06)) @ Matrix.Diagonal((1.15, 0.45, 0.55, 1)), verts=mouth)
fish.tag('l3_angler_mouth', kit._faces(mouth))
for row, (zc, down) in enumerate(((0.02, True), (-0.15, False))):
    n = 22
    for k in range(n):
        a = -1.15 + 2.3 * k / (n - 1) + random.uniform(-0.04, 0.04)
        x = math.sin(a) * 0.21
        y = 0.43 + math.cos(a) * 0.12 + (0.05 if not down else 0.0)
        length = random.uniform(0.04, 0.1) * (1.4 if abs(a) < 0.5 and random.random() < 0.5 else 1.0)
        tip_z = zc - length if down else zc + length
        cone = bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.006, radius2=0.0008, depth=length)['verts']
        mid = Vector((x, y, (zc + tip_z) / 2))
        rot = Matrix.Rotation(math.pi if down else 0.0, 4, 'X') @ Matrix.Rotation(random.uniform(-0.35, 0.35), 4, 'Y') @ Matrix.Rotation(random.uniform(-0.3, 0.3), 4, 'X')
        bmesh.ops.transform(bm, matrix=Matrix.Translation(mid) @ rot, verts=cone)
        fish.tag('l3_teeth', kit._faces(cone))

# the eyes: small, dark, set high
for s in (-1, 1):
    eye = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=0.035)['verts']
    bmesh.ops.transform(bm, matrix=Matrix.Translation((s * 0.15, 0.3, 0.13)), verts=eye)
    fish.tag('l3_eye', kit._faces(eye))


# ---------------------------------------------------------------- fins
def tri_fan(points, mat):
    vs = [bm.verts.new(p) for p in points]
    faces = []
    for i in range(1, len(vs) - 1):
        f = bm.faces.new((vs[0], vs[i], vs[i + 1]))
        faces.append(f)
        # (and its back, so it shows from both sides)
        faces.append(bm.faces.new((vs[0], bm.verts.new(vs[i + 1].co + Vector((1e-4, 0, 0))), bm.verts.new(vs[i].co + Vector((1e-4, 0, 0))))))
    fish.tag(mat, faces)


# the tail fin: a ragged fan behind
tri_fan([(0, -0.48, 0.0), (0, -0.78, 0.17), (0, -0.82, 0.06), (0, -0.85, -0.04), (0, -0.78, -0.14)], 'l3_angler_fin')
# side fins: small paddles behind the head
for s in (-1, 1):
    tri_fan([(s * 0.25, 0.05, -0.08), (s * 0.42, -0.08, -0.02), (s * 0.44, -0.04, -0.12), (s * 0.38, 0.02, -0.2)], 'l3_angler_fin')
# a spiny back: thin spines in a low web
for k in range(6):
    y = 0.05 - k * 0.1
    zb = 0.27 - k * 0.03
    sp = bmesh.ops.create_cone(bm, cap_ends=True, segments=4, radius1=0.01, radius2=0.001, depth=0.12 - k * 0.01)['verts']
    bmesh.ops.transform(bm, matrix=Matrix.Translation((0, y, zb + 0.05)) @ Matrix.Rotation(-0.5, 4, 'X'), verts=sp)
    fish.tag('l3_angler_fin', kit._faces(sp))

# ---------------------------------------------------------------- the lure
# a rod from the top of the head arching up and forward, and the glowing bulb on its end
rod = [Vector((0, 0.18 + 0.5 * t, 0.3 + 0.32 * math.sin(t * math.pi * 0.85))) for t in [i / 10 for i in range(11)]]
for i in range(len(rod) - 1):
    beam(fish, 'l3_angler', tuple(rod[i]), tuple(rod[i + 1]), 0.014, 0.014)
bulb = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.045)['verts']
bmesh.ops.transform(bm, matrix=Matrix.Translation(rod[-1] + Vector((0, 0.02, -0.02))), verts=bulb)
fish.tag('l3_lure', kit._faces(bulb))
for k in range(3):                     # a few fine filaments hanging from the bulb
    a = k * 2.1
    beam(fish, 'l3_lure', tuple(rod[-1] + Vector((0, 0.02, -0.05))),
         tuple(rod[-1] + Vector((0.05 * math.cos(a), 0.05 * math.sin(a) + 0.02, -0.16))), 0.004, 0.004)
empty('PT_Lure', tuple(rod[-1] + Vector((0, 0.02, -0.02))))


def post(objs):
    for ob in objs:
        if ob.name == 'ANGLER':
            for p in ob.data.polygons:
                p.use_smooth = True


finish(OUT_BLEND, OUT_GLB, post=post)
