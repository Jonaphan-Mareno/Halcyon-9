"""
His mother, old (the Save-ARIA window and the Stay ending's chair): her white hair, her older skin,
her smile and the cream scarf, on top of prologue_common.py's restyle_mom().
"""
import math
import bpy
import bmesh
from mathutils import Vector

from prologue_common import update, bone_world, grin, flat, srgb


def hair_fix(head):
    """Her white hair: the strands either side of her face are hers too (the mask is widened
    toward the cheeks there), and its lightest strands are white, not glaring."""
    nt = head.data.materials[0].node_tree
    for n in nt.nodes:
        if n.type == 'MAP_RANGE' and abs(n.inputs['From Min'].default_value - 0.05) < 1e-6:
            n.inputs['From Min'].default_value = 0.044; n.inputs['From Max'].default_value = 0.049
    tone = next(n for n in nt.nodes if n.type == 'MATH' and n.operation == 'MULTIPLY_ADD' and n.inputs[1].default_value > 1)
    tone.inputs[1].default_value = 2.4; tone.inputs[2].default_value = 0.42
    cap = nt.nodes.new('ShaderNodeMath'); cap.operation = 'MINIMUM'; cap.inputs[1].default_value = 0.9
    for link in list(tone.outputs['Value'].links):
        nt.links.new(cap.outputs['Value'], link.to_socket)
    nt.links.new(tone.outputs['Value'], cap.inputs[0])


def older_skin(head):
    """Her skin: a little paler and less rosy, with fine lines where age shows first (bump only):
    across the forehead, at the outer corners of the eyes, from the nose to the mouth's corners.
    (Object space of the head: from her nose tip, the face toward -y; her eyes at (+-0.025, 0.032).)"""
    nt = head.data.materials[0].node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    base = b.inputs['Base Color'].links[0].from_socket
    hsv = nt.nodes.new('ShaderNodeHueSaturation')
    hsv.inputs['Saturation'].default_value = 0.72; hsv.inputs['Value'].default_value = 1.04
    nt.links.new(base, hsv.inputs['Color']); nt.links.new(hsv.outputs['Color'], b.inputs['Base Color'])
    # the lines: a height field from object-space math, through a Bump node onto the normal it has
    tc = nt.nodes.new('ShaderNodeTexCoord')
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], xyz.inputs[0])

    def m(op, *args, clamp=False):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for i, v in enumerate(args):
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs['Value']

    X, Y, Z = xyz.outputs['X'], xyz.outputs['Y'], xyz.outputs['Z']
    ax = m('ABSOLUTE', X)
    front = m('LESS_THAN', Y, 0.05)                                   # the face, not the back of the head

    def band(v, lo, hi, soft):                                       # 1 between lo and hi, soft edges
        a = m('MULTIPLY', m('SUBTRACT', v, lo - soft), 1 / soft, clamp=True)
        c = m('MULTIPLY', m('SUBTRACT', hi + soft, v), 1 / soft, clamp=True)
        return m('MULTIPLY', a, c)

    # forehead: three shallow waves across, above the brows
    fh = m('MULTIPLY', m('MULTIPLY', band(Z, 0.058, 0.08, 0.006), band(ax, 0.0, 0.032, 0.008)),
           m('MULTIPLY_ADD', m('SINE', m('MULTIPLY', Z, 420.0)), 0.5, 0.5))
    # crow's feet: fans of lines from the outer corner of each eye
    dx, dz = m('SUBTRACT', ax, 0.043), m('SUBTRACT', Z, 0.031)
    r = m('SQRT', m('ADD', m('MULTIPLY', dx, dx), m('MULTIPLY', dz, dz)))
    ang = m('ARCTAN2', dz, dx)
    cf = m('MULTIPLY', m('MULTIPLY', band(r, 0.003, 0.014, 0.003), m('GREATER_THAN', dx, -0.002)),
           m('MULTIPLY_ADD', m('SINE', m('MULTIPLY', ang, 9.0)), 0.5, 0.5))
    # the folds from the nose's wings to the mouth's corners: a curve x(z), soft across
    curve_x = m('ADD', 0.018, m('MULTIPLY', m('SUBTRACT', 0.0, Z), 0.17))
    nl = m('MULTIPLY', band(Z, -0.026, -0.004, 0.005),
           m('MAXIMUM', m('SUBTRACT', 1.0, m('MULTIPLY', m('ABSOLUTE', m('SUBTRACT', ax, curve_x)), 400.0)), 0.0))
    height = m('MULTIPLY', m('ADD', m('ADD', m('MULTIPLY', fh, 0.6), m('MULTIPLY', cf, 0.5)), nl), front)
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 0.8; bump.inputs['Distance'].default_value = 0.0013
    nt.links.new(height, bump.inputs['Height'])
    # (and the lines drawn in, a little darker, or at this distance they do not show)
    lined = nt.nodes.new('ShaderNodeMix'); lined.data_type = 'RGBA'; lined.blend_type = 'MULTIPLY'
    lined.inputs['B'].default_value = (0.4, 0.28, 0.25, 1)
    nt.links.new(m('MULTIPLY', height, 0.75, clamp=True), lined.inputs['Factor'])
    nt.links.new(hsv.outputs['Color'], lined.inputs['A'])
    nt.links.new(lined.outputs['Result'], b.inputs['Base Color'])
    nb = b.inputs['Normal']
    if nb.is_linked:
        nt.links.new(nb.links[0].from_socket, bump.inputs['Normal'])
    bump.invert = True                                               # (lines are dips)
    nt.links.new(bump.outputs['Normal'], nb)


def smile(head, k=1.0):
    """A smile shaped into her new head (it has no expressions of its own): prologue_common's
    grin() with her new mouth (its line and corners measured on it: from the nose tip, in its
    units), on the face's front only."""
    mouth_z, corner_x = -0.0225, 0.0215
    co = [v.co.copy() for v in head.data.vertices]
    keep = [p.copy() for p in co]
    # grin() works on faces whose front is below y -0.02: shift the front there, and back after
    for p in co:
        p.y -= 0.06
    grin(co, mouth_z, corner_x, k)
    for v, p, q in zip(head.data.vertices, co, keep):
        p.y += 0.06
        v.co = p if q.y < 0.045 and abs(q.z) < 0.07 else q
    head.data.update()


# a cream scarf, loose round her neck (and over where her new head meets her old neck)
def scarf(m_arm, scn):
    update()
    bm = bmesh.new()
    n1 = bone_world(m_arm, 'Neck1')
    for dz, r_big, r_small, seed in ((0.0, 0.074, 0.024, 1.3), (-0.034, 0.094, 0.03, 4.1)):
        rings = []
        for i in range(48):
            a = i / 48 * 2 * math.pi
            big = r_big * (1 + 0.1 * math.sin(a * 3 + seed))
            c = Vector((math.cos(a) * big, math.sin(a) * big * 0.92 - 0.012, dz + 0.012 * math.sin(a * 2 + seed) - 0.018 * max(0, -math.sin(a))))
            out = Vector((math.cos(a), math.sin(a), 0))
            rings.append([bm.verts.new(n1 + c + out * math.cos(k / 10 * 2 * math.pi) * r_small + Vector((0, 0, math.sin(k / 10 * 2 * math.pi) * r_small * 1.35))) for k in range(10)])
        for i in range(48):
            for k in range(10):
                bm.faces.new((rings[i][k], rings[(i + 1) % 48][k], rings[(i + 1) % 48][(k + 1) % 10], rings[i][(k + 1) % 10]))
    me = bpy.data.meshes.new('Scarf'); bm.to_mesh(me); bm.free()
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.materials.append(flat('Scarf', srgb('#efe4d0'), 0.95))
    o = bpy.data.objects.new('Scarf', me); scn.collection.objects.link(o)


