"""
Shared pieces for the prologue's Polaroid photos (render_prologue_photo*.py): Voss
(public/assets/models/human_scientist_v2.glb, no wound) and his mother (the female scientist body,
Blender/assets/female_scientist.glb, restyled: long straight hair with a centre parting built here,
glasses off, the coat recoloured, a gold pendant), posed by aiming bones, plus materials, lights
and the camera.

Blender axes: z up; each figure faces -y at rest, its left is +x.
"""
import os, math
import bpy
import bmesh
from mathutils import Vector, Matrix, Quaternion

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))


def scene():
    return bpy.context.scene


def update():
    bpy.context.view_layer.update()


# ====================================================================== loading
def imp(rel):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, rel))
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.name.startswith('Icosphere'):
            o.hide_render = True
    return new


class Cast:
    """Voss and his mother, loaded into an empty scene, no clip playing on either."""

    def __init__(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.V = imp('public/assets/models/human_scientist_v2.glb')
        self.M = imp('Blender/assets/female_scientist.glb')
        self.v_root = next(o for o in self.V if o.parent is None and o.type == 'ARMATURE')
        self.m_root = next(o for o in self.M if o.parent is None and o.type == 'EMPTY')
        self.v_arm = self.v_root
        self.m_arm = next(o for o in self.M if o.type == 'ARMATURE')
        for o in self.V:
            if o.name.startswith('Wound'):
                o.hide_render = True
        self.v_face = next(o for o in self.V if o.type == 'MESH' and o.data.shape_keys
                           and 'mouth_smile' in o.data.shape_keys.key_blocks)
        self.m_face = bpy.data.objects['Object_9']
        self.V_HEAD = [o for o in self.V if o.name in ('Head', 'Hair')]
        self.new_head = None
        self.eyes_shut = False
        for o in (self.v_arm, self.m_arm):
            if o.animation_data:
                o.animation_data.action = None


# ====================================================================== faces
def gauss(*t):
    return math.exp(-sum(x * x for x in t))


V_MOUTH_Z, V_CORNER_X = 1.2445, 0.021      # his lip line and mouth corners (build_voss_face.py)
M_MOUTH_Z, M_CORNER_X = 1.190, 0.0167      # hers (Object_9, measured)


def grin(co, mouth_z, corner_x, k=1.0):
    """A smile shaped into a face: co are the face's rest positions (model units, the face looks
    toward -y), moved in place. Mouth corners up, back and out; cheeks and lower lids lift.
    A negative k turns the corners down instead."""
    for p in co:
        x, y, z = p
        if y > -0.02:
            continue
        ax, dz = abs(x), z - mouth_z
        mouth = gauss(dz / (corner_x * 0.95), ax / (corner_x * 1.7))
        c = min(ax / corner_x, 1.3) ** 2
        p.z += 0.0042 * k * c * mouth                                  # corners up
        p.x *= 1 + 0.07 * abs(k) * mouth * min(ax / corner_x, 1)      # wider
        p.y += 0.0022 * abs(k) * c * mouth                             # back into the cheeks
        if k > 0:
            cheek = gauss((ax - corner_x * 1.8) / (corner_x * 0.7), (z - mouth_z - corner_x) / (corner_x * 0.7))
            p.z += 0.003 * k * cheek; p.y -= 0.002 * k * cheek        # cheeks lift
            lid = gauss((ax - corner_x * 1.5) / (corner_x * 0.6), (z - mouth_z - corner_x * 2.6) / (corner_x * 0.25))
            p.z += 0.0012 * k * lid                                    # lower lids: smiling eyes


def voss_face(cast, weights, grin_k=0.0):
    """His face: his own morphs (allowed past 1), plus a shaped grin on top if grin_k."""
    keys = cast.v_face.data.shape_keys.key_blocks
    for k, w in weights.items():
        keys[k].slider_max = 2
        keys[k].value = w
    if grin_k:
        g = cast.v_face.shape_key_add(name='grin', from_mix=False)
        co = [d.co.copy() for d in g.data]
        grin(co, V_MOUTH_Z, V_CORNER_X, grin_k)
        for d, p in zip(g.data, co):
            d.co = p
        g.value = 1.0


def mom_face(cast, grin_k):
    co = [v.co.copy() for v in cast.m_face.data.vertices]
    grin(co, M_MOUTH_Z, M_CORNER_X, grin_k)
    for v, p in zip(cast.m_face.data.vertices, co):
        v.co = p


M_EYE_X, M_EYE_Y, M_EYE_Z = 0.0248, -0.0513, 1.2418   # her eyeballs' centres (Object_10/11)


def mom_close_eyes(cast, amount=1.0):
    """Her lids shut: the upper lid comes down to just below the middle of the eye and over it,
    the lower one up to meet it (rest pose, model units)."""
    cast.eyes_shut = amount >= 0.7                       # (her new head: closed by lids, put_new_head)
    shut = M_EYE_Z - 0.0012
    for v in cast.m_face.data.vertices:
        x, y, z = v.co
        dx = abs(abs(x) - M_EYE_X)
        if dx > 0.012 or y > -0.044:
            continue
        across = 1 - (dx / 0.012) ** 2                     # most at the middle of the eye
        if shut < z < M_EYE_Z + 0.011:                      # upper lid
            w = across * (1 - (z - M_EYE_Z) / 0.011) ** 0.5
            v.co.z += (shut - z) * w * amount
            v.co.y -= 0.0022 * w * amount                   # over the eyeball
        elif M_EYE_Z - 0.008 < z <= shut:                   # lower lid
            w = across * (1 - (shut - z) / 0.008)
            v.co.z += (shut - z) * 0.6 * w * amount


# ====================================================================== her hair
def hairline(front):
    """How far down from the crown (degrees) the hair comes, by angle from the middle of the face:
    the forehead, curving down past the temples, then all the way round the back."""
    if front < 54:
        return 62 + 30 * (front / 54) ** 1.5
    return 92 + 16 * min((front - 54) / 16, 1)


def build_hair(grey=0.0, untidy=0.0, fall=True, streaks=True):
    """An ellipsoid cap over her scalp that falls straight to below her shoulders, open at the
    face (rest pose, model units). grey 0..1 turns it from black to grey; untidy 0..1 roughs up
    its surface (stray locks); fall=False leaves only the cap (for her lying down, where the
    length is laid out on the floor instead: hair_on_floor)."""
    C = Vector((0, 0.012, 1.245)); R = Vector((0.074, 0.092, 0.09))
    cols, cap_rows, drop_rows = 112, 24, 14
    top_z_end = 1.0
    bm = bmesh.new()
    grid = []
    for i in range(cap_rows + (drop_rows if fall else 0) + 1):
        row = []
        for j in range(cols):
            ph = 2 * math.pi * j / cols                  # 0 at the back (+y), pi at the face
            front = math.degrees(abs(math.pi - ph))       # 0 at the middle of the face
            if i <= cap_rows:
                th = math.radians(4 + (hairline(front) - 4) * i / cap_rows)
                t = 0
            else:
                th = math.radians(108)
                t = (i - cap_rows) / drop_rows
            s = 1 + 0.22 * t
            p = Vector((R.x * math.sin(th) * math.sin(ph) * s,
                        (R.y if math.cos(ph) > 0 else 0.084) * math.sin(th) * math.cos(ph) * s + 0.07 * t,
                        R.z * math.cos(th)))
            p = C + p
            if t:
                p.z = C.z + R.z * math.cos(th) - (C.z + R.z * math.cos(th) - top_z_end) * t
            if untidy:
                bump = math.sin(ph * 7 + i * 0.9) * math.sin(ph * 3 - i * 0.5)
                p += (p - C).normalized() * 0.006 * untidy * bump * (0.3 + t)
            if i <= cap_rows and front < 6 and th < math.radians(55):
                p -= (p - C).normalized() * 0.0015        # the parting
            cut = t > 0 and front < 54                     # the face stays open below the hairline
            row.append(None if cut else bm.verts.new(p))
        grid.append(row)
    uv = bm.loops.layers.uv.new('strands')               # u round the head, v from the crown down
    for i in range(len(grid) - 1):
        for j in range(cols):
            q = [grid[i][j], grid[i][(j + 1) % cols], grid[i + 1][(j + 1) % cols], grid[i + 1][j]]
            if all(q):
                f = bm.faces.new(q)
                for loop, (ii, jj) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
                    loop[uv].uv = (jj / cols, ii / (len(grid) - 1))
    me = bpy.data.meshes.new('MomHair')
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('MomHair', me)
    scene().collection.objects.link(o)
    for f in me.polygons:
        f.use_smooth = True
    sol = o.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.004; sol.offset = 1
    sub = o.modifiers.new('smooth', 'SUBSURF'); sub.levels = sub.render_levels = 2
    o.data.materials.append(hair_material(grey, streaks))
    o['cols'], o['rows'], o['centre'] = cols, len(grid), C     # the grid, for hair_strands_lying
    return o


def hair_material(grey, streaks=True):
    """Strands running down; black at grey 0 with a few grey strands (none if not streaks: her
    young), mostly grey at grey 1."""
    if grey >= 0.5:
        return grey_hair_material()
    m = bpy.data.materials.new('MomHairMat')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    wave = nt.nodes.new('ShaderNodeTexWave')
    wave.bands_direction = 'X'; wave.inputs['Scale'].default_value = 160 - 80 * grey
    wave.inputs['Distortion'].default_value = 4; wave.inputs['Detail'].default_value = 4
    nt.links.new(tc.outputs['Object'], wave.inputs['Vector'])
    dark = [(0.006, 0.005, 0.005), (0.018, 0.016, 0.016)]
    light = [(0.2, 0.196, 0.19), (0.24, 0.236, 0.23)]           # grey: soft strands, no moire
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    for e, d, l in zip(ramp.color_ramp.elements, dark, light):
        e.color = (*[a + (b_ - a) * grey for a, b_ in zip(d, l)], 1)
    if grey >= 0.5:                                           # grey: no banding (it reads as knitting),
        ramp.color_ramp.elements[1].color = ramp.color_ramp.elements[0].color   # salt-and-pepper strands instead
    nt.links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    noise = nt.nodes.new('ShaderNodeTexNoise')                # the other colour's strands
    noise.inputs['Scale'].default_value = 90
    stretch = nt.nodes.new('ShaderNodeMapping')               # long strands, not flecks
    stretch.inputs['Scale'].default_value = (1, 1, 0.08)
    nt.links.new(tc.outputs['Object'], stretch.inputs['Vector'])
    nt.links.new(stretch.outputs['Vector'], noise.inputs['Vector'])
    gm = nt.nodes.new('ShaderNodeMapRange')
    gm.inputs['From Min'].default_value = 0.66 if grey < 0.5 else 0.5; gm.inputs['From Max'].default_value = 0.72 if grey < 0.5 else 0.6
    gm.inputs['To Max'].default_value = (0.35 if streaks else 0.0) if grey < 0.5 else 0.8
    nt.links.new(noise.outputs['Fac'], gm.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    nt.links.new(gm.outputs['Result'], mix.inputs['Factor'])
    nt.links.new(ramp.outputs['Color'], mix.inputs['A'])
    mix.inputs['B'].default_value = (0.16, 0.155, 0.155, 1) if grey < 0.5 else (0.03, 0.028, 0.027, 1)
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.6
    b.inputs['Specular IOR Level'].default_value = 0.3
    if not streaks:                       # young: glossy jet black (rough, it reads as brown under warm light)
        for e in ramp.color_ramp.elements:
            e.color = (*[c * 0.3 for c in e.color[:3]], 1)
        b.inputs['Roughness'].default_value = 0.32
        b.inputs['Specular IOR Level'].default_value = 0.5
    return m


def grey_hair_material():
    """Salt and pepper: fine light and dark strands along the hair's 'strands' UVs (u across the
    strands, v along them), so they run from the crown down, and out across the floor."""
    m = bpy.data.materials.new('MomGreyHairMat')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'strands'
    strands = nt.nodes.new('ShaderNodeTexWave')                # thin lines across u
    strands.bands_direction = 'X'; strands.inputs['Scale'].default_value = 90
    strands.inputs['Distortion'].default_value = 6; strands.inputs['Detail'].default_value = 6
    strands.inputs['Detail Scale'].default_value = 2
    nt.links.new(uvn.outputs['UV'], strands.inputs['Vector'])
    clumps = nt.nodes.new('ShaderNodeTexNoise')                 # some locks greyer than others
    clumps.inputs['Scale'].default_value = 6
    stretch = nt.nodes.new('ShaderNodeMapping'); stretch.inputs['Scale'].default_value = (12, 1, 1)
    nt.links.new(uvn.outputs['UV'], stretch.inputs['Vector'])
    nt.links.new(stretch.outputs['Vector'], clumps.inputs['Vector'])
    add = nt.nodes.new('ShaderNodeMath'); add.operation = 'MULTIPLY_ADD'
    add.inputs[1].default_value = 0.6
    nt.links.new(strands.outputs['Fac'], add.inputs[0]); nt.links.new(clumps.outputs['Fac'], add.inputs[2])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.4; ramp.color_ramp.elements[0].color = (0.025, 0.023, 0.022, 1)
    ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = (0.24, 0.235, 0.23, 1)
    nt.links.new(add.outputs['Value'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.55
    b.inputs['Specular IOR Level'].default_value = 0.35
    return m


# ====================================================================== bones
def bone(arm, key):
    return next(pb for pb in arm.pose.bones if key in pb.name)


def bone_world(arm, key, tail=False):
    pb = bone(arm, key)
    return arm.matrix_world @ (pb.tail if tail else pb.head)


def rotate_axis(arm, key, axis_w, deg):
    """Rotate a pose bone about a world axis through its head."""
    update()
    pb = bone(arm, key)
    aw = arm.matrix_world
    h = aw @ pb.head
    r = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg), 4, Vector(axis_w)) @ Matrix.Translation(-h)
    pb.matrix = aw.inverted() @ r @ aw @ pb.matrix
    update()


def rotate_world(arm, key, axis, deg):
    rotate_axis(arm, key, {'X': (1, 0, 0), 'Y': (0, 1, 0), 'Z': (0, 0, 1)}[axis], deg)


def turn(root, quat_or_deg):
    """Turn a figure: about world z by degrees, or by a world rotation (Quaternion), on top of the
    import's own axis conversion (the roots are in quaternion mode; their euler is ignored).
    The turn about z so far is kept as root['yaw'] for aim()."""
    q = quat_or_deg if isinstance(quat_or_deg, Quaternion) else Quaternion((0, 0, 1), math.radians(quat_or_deg))
    root.rotation_mode = 'QUATERNION'
    root.rotation_quaternion = q @ root.rotation_quaternion
    if not isinstance(quat_or_deg, Quaternion):
        root['yaw'] = root.get('yaw', 0.0) + math.radians(quat_or_deg)
    update()


def lean(arm, root, key, deg):
    """Bend a bone forward (positive) or back about the figure's own left-right axis."""
    rotate_axis(arm, key, Matrix.Rotation(root.get('yaw', 0.0), 3, 'Z') @ Vector((1, 0, 0)), deg)


def aim(arm, root, key, child_key, local_dir):
    """Turn a bone (about its head) so the line to its child's head points along local_dir,
    given in the figure's own frame (faces -y, its left is +x, z up; turned by root['yaw'])."""
    update()
    pb, ch = bone(arm, key), bone(arm, child_key)
    aw = arm.matrix_world
    h, c = aw @ pb.head, aw @ ch.head
    target = Matrix.Rotation(root.get('yaw', 0.0), 3, 'Z') @ Vector(local_dir).normalized()
    q = (c - h).normalized().rotation_difference(target)
    rot_w = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h)
    pb.matrix = aw.inverted() @ rot_w @ aw @ pb.matrix
    update()


def aim_world(arm, key, child_key, world_dir):
    """aim(), with the direction given in world axes."""
    update()
    pb, ch = bone(arm, key), bone(arm, child_key)
    aw = arm.matrix_world
    h, c = aw @ pb.head, aw @ ch.head
    q = (c - h).normalized().rotation_difference(Vector(world_dir).normalized())
    rot_w = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h)
    pb.matrix = aw.inverted() @ rot_w @ aw @ pb.matrix
    update()


def reach(arm, side, target, pole):
    """Bend an arm so the wrist lands on target (world), the elbow pushed toward pole (a world
    direction): a two-bone solve, then each bone aimed."""
    s = 'L' if side > 0 else 'R'
    update()
    S = bone_world(arm, f'{s}_UpperArm')
    l1 = (bone_world(arm, f'{s}_Forearm') - S).length
    l2 = (bone_world(arm, f'{s}_Hand') - bone_world(arm, f'{s}_Forearm')).length
    to = Vector(target) - S
    d = min(to.length, (l1 + l2) * 0.999)
    u = to.normalized()
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    h = math.sqrt(max(l1 * l1 - a * a, 0))
    side_dir = (Vector(pole) - u * Vector(pole).dot(u)).normalized()
    E = S + u * a + side_dir * h
    aim_world(arm, f'{s}_UpperArm', f'{s}_Forearm', E - S)
    aim_world(arm, f'{s}_Forearm', f'{s}_Hand', S + u * d - bone_world(arm, f'{s}_Forearm'))


def pose_arm(arm, root, side, upper, fore):
    s = 'L' if side > 0 else 'R'
    aim(arm, root, f'{s}_UpperArm', f'{s}_Forearm', upper)
    aim(arm, root, f'{s}_Forearm', f'{s}_Hand', fore)


def pose_leg(arm, root, side, thigh, calf):
    s = 'L' if side > 0 else 'R'
    aim(arm, root, f'{s}_Thigh', f'{s}_Calf', thigh)
    aim(arm, root, f'{s}_Calf', f'{s}_Foot', calf)


def freeze_clip(arm, clip, frame=1):
    """Hold a clip's pose as the bones' own pose and drop the action, so the manual
    aims are not overridden (the import leaves 'Crouch' playing on Voss)."""
    if not arm.animation_data:
        arm.animation_data_create()
    arm.animation_data.action = bpy.data.actions[clip]
    scene().frame_set(frame)
    mats_ = {pb.name: pb.matrix.copy() for pb in arm.pose.bones}
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
    update()
    for pb in sorted(arm.pose.bones, key=lambda b: len(b.parent_recursive)):
        pb.matrix = mats_[pb.name]
        update()


def curl_hand(arm, side, deg, thumb_deg):
    """Close a hand: each finger joint turns about the line across the knuckles; the thumb swings
    across the palm about the line from the wrist to the knuckles."""
    s_ = 'L' if side > 0 else 'R'
    across = (bone_world(arm, f'{s_}_Finger2_') - bone_world(arm, f'{s_}_Finger1_')).normalized()
    if side < 0:
        across = -across
    for f in ('1', '2'):
        for seg in ('', '1', '2'):
            rotate_axis(arm, f'{s_}_Finger{f}{seg}_', across, deg)
    along_hand = ((bone_world(arm, f'{s_}_Finger1_') + bone_world(arm, f'{s_}_Finger2_')) / 2
                  - bone_world(arm, f'{s_}_Hand')).normalized()
    rotate_axis(arm, f'{s_}_Finger0_', along_hand, thumb_deg * side)
    for seg in ('1', '2'):
        rotate_axis(arm, f'{s_}_Finger0{seg}_', across, deg * 0.5)


def grip(arm, s_):
    """Where a closed hand holds a bar: between the knuckles and the curled finger ends."""
    pts = [bone_world(arm, f'{s_}_Finger{f}_') for f in '12'] + [bone_world(arm, f'{s_}_Finger{f}2_') for f in '12']
    return sum(pts, Vector()) / len(pts)


def attach(obj, arm, key):
    """Parent obj to a pose bone, keeping its world transform."""
    update()
    mw = obj.matrix_world.copy()
    obj.parent = arm
    obj.parent_type = 'BONE'
    obj.parent_bone = bone(arm, key).name
    update()
    obj.matrix_world = mw


# ====================================================================== size
def bounds(objs, hidden=False):
    """World bounds of the meshes among objs; those hidden from the render only if hidden."""
    dg = bpy.context.evaluated_depsgraph_get()
    lo = Vector((1e9,) * 3); hi = -lo
    for o in objs:
        if o.type != 'MESH' or (o.hide_render and not hidden):
            continue
        e = o.evaluated_get(dg); m = e.to_mesh()
        for v in m.vertices:
            w = e.matrix_world @ v.co; lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        e.to_mesh_clear()
    return lo, hi


def to_height(objs, root, metres):
    """Scale so the top of the head (objs: the head's meshes, standing) is at metres; feet at z 0."""
    lo, hi = bounds(objs)
    root.scale = [x * metres / hi.z for x in root.scale]
    update()


def mom_head(cast):
    """Her head's meshes, to measure her height by: the new head once it is on (her old head is
    then only a neck), else the old one."""
    return [cast.new_head] if cast.new_head else [cast.m_face]


def standard_heights(cast):
    """Voss 1.80 m, his mother 1.63 m; call while both stand."""
    to_height(cast.V_HEAD, cast.v_root, 1.80)
    to_height(mom_head(cast), cast.m_root, 1.63)


# ====================================================================== materials
def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def flat(name, rgb, rough=0.7, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metallic
    return m


def tint(mat, rgb):
    """Multiply the material's base colour (texture or value) by rgb."""
    nt = mat.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    sock = b.inputs['Base Color']
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    if sock.is_linked:
        nt.links.new(sock.links[0].from_socket, mix.inputs['A'])
    else:
        mix.inputs['A'].default_value = sock.default_value
    mix.inputs['B'].default_value = (*rgb, 1)
    nt.links.new(mix.outputs['Result'], sock)


def recolour_whites(mat, rgb, lo=0.55, hi=0.75):
    """Recolour only the bright, colourless parts of a texture: her lab coat becomes a cardigan,
    the shirt and trousers keep their colours."""
    nt = mat.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    src = b.inputs['Base Color'].links[0].from_socket
    hsv = nt.nodes.new('ShaderNodeSeparateColor'); hsv.mode = 'HSV'; nt.links.new(src, hsv.inputs[0])
    bright = nt.nodes.new('ShaderNodeMapRange')            # bright...
    bright.inputs['From Min'].default_value = lo; bright.inputs['From Max'].default_value = hi
    nt.links.new(hsv.outputs['Blue'], bright.inputs['Value'])
    grey = nt.nodes.new('ShaderNodeMapRange')               # ...and colourless (not the blue shirt)
    grey.inputs['From Min'].default_value = 0.42; grey.inputs['From Max'].default_value = 0.22
    nt.links.new(hsv.outputs['Green'], grey.inputs['Value'])
    mr = nt.nodes.new('ShaderNodeMath'); mr.operation = 'MULTIPLY'
    nt.links.new(bright.outputs['Result'], mr.inputs[0]); nt.links.new(grey.outputs['Result'], mr.inputs[1])
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1
    nt.links.new(src, mul.inputs['A']); mul.inputs['B'].default_value = (*rgb, 1)
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    nt.links.new(mr.outputs['Value'], mix.inputs['Factor'])
    nt.links.new(src, mix.inputs['A']); nt.links.new(mul.outputs['Result'], mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])


def roughen(mat, r):
    b = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Specular IOR Level'].default_value = 0.25
    b.inputs['Coat Weight'].default_value = 0
    if b.inputs['Roughness'].is_linked:
        mat.node_tree.links.remove(b.inputs['Roughness'].links[0])
    b.inputs['Roughness'].default_value = r


def gold():
    m = bpy.data.materials.get('Gold')
    return m or flat('Gold', srgb('#c8a24a'), 0.35, 0.6)


# ====================================================================== his mother, restyled
def restyle_mom(cast, cardigan='#3f8c88', grey=0.0, untidy=0.0, fall=True, young=False, new_head=True, streaks=0.0):
    """Her hair (rebuilt, on her head bone), the coat as a cardigan, glasses off. young (photos
    1-3): jet black hair, no grey in it, and young_skin(). Call before moving or posing her (the
    hair is built at her rest pose)."""
    mats = bpy.data.materials
    for o in cast.M:
        if o.type != 'MESH':
            continue
        names = {s.material.name for s in o.material_slots if s.material}
        if names & {'hair_trans_blonde', 'glasslens', 'glasses_d'}:
            o.hide_render = True
    hair = build_hair(grey, untidy, fall, streaks=not young)
    if young:
        young_skin()
    cast.M.append(hair)
    update()
    mw = hair.matrix_world.copy()
    hair.parent = cast.m_arm
    hair.parent_type = 'BONE'
    hair.parent_bone = next(b.name for b in cast.m_arm.data.bones if 'Head1' in b.name)
    update()
    hair.matrix_world = mw
    recolour_whites(mats['SciFem_Bdy_D'], srgb(cardigan), 0.12, 0.32)
    roughen(mats['SciFem_Bdy_D'], 0.8)
    roughen(mats['Base_F_D'], 0.6)
    cast.mom_hair = hair
    if new_head:
        put_new_head(cast, grey, streaks)
        hair.hide_render = True                          # (her new head has its own hair; lying, the
                                                         #  strands still follow this hidden cap)


# ====================================================================== her new head
# "Woman Head" by Malcolm (Blender/assets/woman_head, CC-BY-4.0). In its own units it faces +x,
# z up; its nose tip is at (1.492, 0, -0.35), and it is 0.064 of a metre to one of its units next
# to her old face (eye to chin). It takes her old face's place: the nose tips meet.
NEW_HEAD = os.path.join(ROOT, 'Blender', 'assets', 'woman_head', 'scene.gltf')
NEW_NOSE, NEW_SCALE = Vector((1.492, 0.0, -0.35)), 0.066
OLD_NOSE = Vector((0.0, -0.0769, 1.213))                # her old nose tip (Object_9, at rest)
OLD_NECK_TOP = 1.165                                    # her old head is kept below this: her neck
HEAD_SIZE = 0.86                                        # nose to nose it is too big for her body: shrunk
                                                        # about where it meets her neck


def put_new_head(cast, grey=0.0, streaks=0.0):
    """Her new head on her neck, on her head bone; her old face, eyes and scalp gone. Its hair is
    darkened to black, or turned grey by grey (0..1); hair is told from skin by where it is on the
    head (behind the face or above the brow) and by how dark it is, so her eyes keep their colour."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=NEW_HEAD)
    new = [o for o in bpy.data.objects if o not in before]
    parts = [o for o in new if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    head = bpy.context.object
    before.add(head)
    head.name = 'MomNewHead'
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)   # its own units, faces +x
    for o in [o for o in bpy.data.objects if o not in before]:   # (the joined parts are gone already)
        bpy.data.objects.remove(o)
    d = head.modifiers.new('fewer', 'DECIMATE'); d.ratio = 0.12
    bpy.ops.object.modifier_apply(modifier=d.name)
    # into her units: faces -y (a quarter turn), scaled, its nose tip on hers
    head.data.transform(Matrix.Translation(-NEW_NOSE))
    head.data.transform(Matrix.Rotation(math.radians(-90), 4, 'Z') @ Matrix.Scale(NEW_SCALE, 4))
    head.data.polygons.foreach_set('use_smooth', [True] * len(head.data.polygons))
    # smaller, by the object's scale (its object space, which the hair mask below is in, unchanged),
    # about the middle of the neck at the join
    ring = [v.co for v in head.data.vertices if abs(v.co.z + OLD_NOSE.z - OLD_NECK_TOP) < 0.01]
    pivot = Vector((0.0, sum(c.y for c in ring) / len(ring), OLD_NECK_TOP - OLD_NOSE.z)) + OLD_NOSE
    head.location = pivot + (OLD_NOSE - pivot) * HEAD_SIZE
    head.scale = (HEAD_SIZE,) * 3

    # her old head: only the neck kept; her old eyes hidden (they stay, for their positions)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(cast.m_face.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z > OLD_NECK_TOP], context='VERTS')
    bm.to_mesh(cast.m_face.data); bm.free()
    for n in ('Object_10', 'Object_11'):
        bpy.data.objects[n].hide_render = True

    # the hair's colour
    mat = head.data.materials[0]
    nt = mat.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    src = b.inputs['Base Color'].links[0].from_socket
    tc = nt.nodes.new('ShaderNodeTexCoord')
    xyz = nt.nodes.new('ShaderNodeSeparateXYZ'); nt.links.new(tc.outputs['Object'], xyz.inputs[0])
    # (object space: metres from her nose tip, face toward -y; her eyes are at about (+-0.025, 0.026,
    #  0.032), her brows at z 0.045, |x| < 0.047: the face is |x| < 0.05, y < 0.06, z < 0.056)
    behind = nt.nodes.new('ShaderNodeMapRange')
    behind.inputs['From Min'].default_value = 0.06; behind.inputs['From Max'].default_value = 0.07
    nt.links.new(xyz.outputs['Y'], behind.inputs['Value'])          # 1 behind the face
    above = nt.nodes.new('ShaderNodeMapRange')
    above.inputs['From Min'].default_value = 0.056; above.inputs['From Max'].default_value = 0.062
    nt.links.new(xyz.outputs['Z'], above.inputs['Value'])           # 1 above the hairline
    absx = nt.nodes.new('ShaderNodeMath'); absx.operation = 'ABSOLUTE'
    nt.links.new(xyz.outputs['X'], absx.inputs[0])
    beside = nt.nodes.new('ShaderNodeMapRange')
    beside.inputs['From Min'].default_value = 0.05; beside.inputs['From Max'].default_value = 0.055
    nt.links.new(absx.outputs['Value'], beside.inputs['Value'])     # 1 out beside her face
    region0 = nt.nodes.new('ShaderNodeMath'); region0.operation = 'MAXIMUM'
    nt.links.new(behind.outputs['Result'], region0.inputs[0]); nt.links.new(above.outputs['Result'], region0.inputs[1])
    region = nt.nodes.new('ShaderNodeMath'); region.operation = 'MAXIMUM'
    nt.links.new(region0.outputs['Value'], region.inputs[0]); nt.links.new(beside.outputs['Result'], region.inputs[1])
    hsv = nt.nodes.new('ShaderNodeSeparateColor'); hsv.mode = 'HSV'; nt.links.new(src, hsv.inputs[0])
    dark = nt.nodes.new('ShaderNodeMapRange')
    dark.inputs['From Min'].default_value = 0.42; dark.inputs['From Max'].default_value = 0.3
    nt.links.new(hsv.outputs['Blue'], dark.inputs['Value'])           # 1 where dark: hair, not skin
    mask = nt.nodes.new('ShaderNodeMath'); mask.operation = 'MULTIPLY'
    nt.links.new(region.outputs['Value'], mask.inputs[0]); nt.links.new(dark.outputs['Result'], mask.inputs[1])
    bw = nt.nodes.new('ShaderNodeRGBToBW'); nt.links.new(src, bw.inputs[0])
    tone = nt.nodes.new('ShaderNodeMath'); tone.operation = 'MULTIPLY_ADD'      # its strands' light and shade kept
    tone.inputs[1].default_value = 0.35 + 1.6 * grey; tone.inputs[2].default_value = 0.004 + 0.12 * grey
    nt.links.new(bw.outputs['Val'], tone.inputs[0])
    hair_col = nt.nodes.new('ShaderNodeCombineColor')
    for i, k in enumerate((1.0, 0.97, 0.95)):
        m = nt.nodes.new('ShaderNodeMath'); m.operation = 'MULTIPLY'; m.inputs[1].default_value = k
        nt.links.new(tone.outputs['Value'], m.inputs[0]); nt.links.new(m.outputs['Value'], hair_col.inputs[i])
    if streaks:                                          # grey strands through it: thin, running down
        stretch = nt.nodes.new('ShaderNodeMapping'); stretch.inputs['Scale'].default_value = (1, 1, 0.07)
        nt.links.new(tc.outputs['Object'], stretch.inputs['Vector'])
        noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 170
        noise.inputs['Detail'].default_value = 4
        nt.links.new(stretch.outputs['Vector'], noise.inputs['Vector'])
        sm = nt.nodes.new('ShaderNodeMapRange')
        sm.inputs['From Min'].default_value = 0.66 - 0.05 * streaks; sm.inputs['From Max'].default_value = 0.7 - 0.05 * streaks
        nt.links.new(noise.outputs['Fac'], sm.inputs['Value'])
        inky = nt.nodes.new('ShaderNodeMapRange')                        # and only on the darkest: hair,
        inky.inputs['From Min'].default_value = 0.16; inky.inputs['From Max'].default_value = 0.09   # not shadowed skin
        nt.links.new(hsv.outputs['Blue'], inky.inputs['Value'])
        where2 = nt.nodes.new('ShaderNodeMath'); where2.operation = 'MULTIPLY'
        nt.links.new(region.outputs['Value'], where2.inputs[0]); nt.links.new(inky.outputs['Result'], where2.inputs[1])
        # grown out: grey at the roots by her scalp, black toward the ends (her hair hangs down: by height)
        roots = nt.nodes.new('ShaderNodeMapRange')
        roots.inputs['From Min'].default_value = 0.01; roots.inputs['From Max'].default_value = 0.1
        nt.links.new(xyz.outputs['Z'], roots.inputs['Value'])
        salt = nt.nodes.new('ShaderNodeMath'); salt.operation = 'MULTIPLY_ADD'    # strands, not a solid cap
        salt.inputs[1].default_value = 0.6; salt.inputs[2].default_value = 0.45
        nt.links.new(noise.outputs['Fac'], salt.inputs[0])
        rootgrey = nt.nodes.new('ShaderNodeMath'); rootgrey.operation = 'MULTIPLY'; rootgrey.use_clamp = True
        nt.links.new(roots.outputs['Result'], rootgrey.inputs[0]); nt.links.new(salt.outputs['Value'], rootgrey.inputs[1])
        both = nt.nodes.new('ShaderNodeMath'); both.operation = 'MAXIMUM'
        nt.links.new(sm.outputs['Result'], both.inputs[0]); nt.links.new(rootgrey.outputs['Value'], both.inputs[1])
        few = nt.nodes.new('ShaderNodeMath'); few.operation = 'MULTIPLY'
        nt.links.new(both.outputs['Value'], few.inputs[0]); nt.links.new(where2.outputs['Value'], few.inputs[1])
        silver = nt.nodes.new('ShaderNodeMix'); silver.data_type = 'RGBA'
        nt.links.new(few.outputs['Value'], silver.inputs['Factor'])
        nt.links.new(hair_col.outputs['Color'], silver.inputs['A'])
        silver.inputs['B'].default_value = (0.3, 0.295, 0.29, 1)
        hair_out = silver.outputs['Result']
    else:
        hair_out = hair_col.outputs['Color']
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    nt.links.new(mask.outputs['Value'], mix.inputs['Factor'])
    nt.links.new(src, mix.inputs['A']); nt.links.new(hair_out, mix.inputs['B'])
    nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])

    update()
    lids = shut_new_eyes(head) if cast.eyes_shut else []
    mw = head.matrix_world.copy()
    head.parent = cast.m_arm
    head.parent_type = 'BONE'
    head.parent_bone = next(bn.name for bn in cast.m_arm.data.bones if 'Head1' in bn.name)
    update()
    head.matrix_world = mw
    for lid in lids:
        attach(lid, cast.m_arm, 'Head1')
    cast.M.append(head)
    cast.new_head = head
    return head


def shut_new_eyes(head):
    """Her eyes closed on the new head (it has no lids to move): over each eye a lid, a flattened
    ellipsoid in her skin's colour taken from her cheek just below, laid on the surface where a ray
    from in front meets it, with a dark line of lashes along its lower edge. Returns the lids."""
    import numpy as np
    img = next(n.image for n in head.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE' and 'baseColor' in n.image.name)
    img.pixels[0]
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(h, w, 4)
    head.data.calc_loop_triangles()
    uvl = head.data.uv_layers.active.data
    lids = []
    k = head.scale.x                                     # (lids and lashes sized with the head)
    for side in (-1, 1):
        eye = Vector((side * 0.025, 0.0, 0.032))           # (its object space: from the nose tip)
        hit, loc, nrm, fi = head.ray_cast(Vector((eye.x, -0.5, eye.z)), Vector((0, 1, 0)))
        if not hit:
            continue
        # skin colour: the texture on the cheek just below (above is the brow)
        _, _, _, fb = head.ray_cast(Vector((eye.x, -0.5, eye.z - 0.022)), Vector((0, 1, 0)))
        poly = head.data.polygons[fb]
        u, v = uvl[poly.loop_indices[0]].uv
        skin = px[min(int(v * h), h - 1), min(int(u * w), w - 1), :3]
        lin = tuple(float(c) / 12.92 if c <= 0.04045 else ((float(c) + 0.055) / 1.055) ** 2.4 for c in skin)
        lid_m = flat(f'Lid{side}', lin, 0.6)              # (the texture's pixels are sRGB)
        world = head.matrix_world @ loc
        bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=world - Vector((0, 0.0025 * k, 0)), segments=24, ring_count=12)
        lid = bpy.context.object
        lid.scale = (0.0125 * k, 0.0045 * k, 0.0062 * k)
        lid.rotation_euler[1] = math.radians(-side * 6)
        lid.data.materials.append(lid_m); bpy.ops.object.shade_smooth()
        lash = bpy.data.curves.new('Lash', 'CURVE'); lash.dimensions = '3D'; lash.bevel_depth = 0.0007 * k
        sp = lash.splines.new('POLY'); sp.points.add(6)
        for i, pt in enumerate(sp.points):
            t = i / 6 * 2 - 1
            pt.co = (*(world + Vector((t * 0.011, -0.006, -0.0045 + 0.002 * t * t)) * k), 1)
        lo = bpy.data.objects.new('Lash', lash); scene().collection.objects.link(lo)
        lash.materials.append(flat('LashMat', srgb('#1c1614'), 0.6))
        lids += [lid, lo]
    return lids


def lying_hair_dir(cast):
    """For her lying down: the middle of her skull, and the floor direction her hair spreads in
    (behind her head and past its top)."""
    dg = bpy.context.evaluated_depsgraph_get()
    eye_pts = []
    for n in ('Object_10', 'Object_11'):
        e = bpy.data.objects[n].evaluated_get(dg)
        eye_pts += [e.matrix_world @ v.co for v in e.data.vertices]
    eyes = sum(eye_pts, Vector()) / len(eye_pts)
    lo, hi = bounds([cast.mom_hair], hidden=True)
    skull = (lo + hi) / 2
    crown = bone_world(cast.m_arm, 'Head1', tail=True) - bone_world(cast.m_arm, 'Head1')
    flat_ = lambda v: Vector((v.x, v.y, 0)).normalized()
    return skull, (flat_(skull - eyes) + flat_(crown)).normalized()


def hair_on_floor(cast, length=0.11, z=0.002):
    """A dark fan on the floor behind her head, under hair_strands_lying's strands, so the floor
    does not show through them (call once she lies)."""
    skull, back = lying_hair_dir(cast)
    centre = Vector((skull.x, skull.y, z)) - back * 0.03
    bm = bmesh.new()
    rings, spokes = 8, 40
    grid = []
    for i in range(rings + 1):
        row = []
        for j in range(spokes + 1):
            a = math.radians(-95 + 190 * j / spokes)
            d = Matrix.Rotation(a, 3, 'Z') @ back
            ragged = 1 + 0.14 * math.sin(j * 0.55) + 0.07 * math.sin(j * 1.4 + 1)      # loose, wavy locks
            r = 0.05 + (length * ragged * (1 - 0.4 * abs(a) / math.radians(95))) * i / rings
            row.append(bm.verts.new(centre + d * r))
        grid.append(row)
    uv = bm.loops.layers.uv.new('strands')               # u across the fan, v out from her head
    for i in range(rings):
        for j in range(spokes):
            f = bm.faces.new([grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]])
            for loop, (ii, jj) in zip(f.loops, ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))):
                loop[uv].uv = (jj / spokes * 2.5, ii / rings)
    me = bpy.data.meshes.new('MomHairFloor')
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('MomHairFloor', me)
    scene().collection.objects.link(o)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    o.modifiers.new('thick', 'SOLIDIFY').thickness = 0.006
    o.modifiers['thick'].offset = -1                    # thickened downward: the strands lie on top
    o.data.materials.append(flat('MomHairShadow', srgb('#6f6b67'), 0.8))   # under the strands: their mid grey
    cast.M.append(o)
    return o


def hair_strands_lying(cast, count=2600, length=(0.16, 0.3), z=0.004, seed=3):
    """Real strands over the cap (restyle_mom(fall=False)) for her lying down: each starts near
    her crown, follows the cap down the back or side of her head to its edge, then runs out across
    the floor, a little wavy. Salt and pepper: each strand its own shade (the 'tone' attribute)."""
    import random
    rnd = random.Random(seed)
    hair = cast.mom_hair
    cols, rows = hair['cols'], hair['rows']
    mw = hair.matrix_world
    skull = mw @ Vector(hair['centre'])
    base = [mw @ v.co for v in hair.data.vertices]
    _, back = lying_hair_dir(cast)

    def at(i, jf):
        j0 = int(math.floor(jf)) % cols
        j1 = (j0 + 1) % cols
        t = jf - math.floor(jf)
        return base[i * cols + j0].lerp(base[i * cols + j1], t)

    strands = []
    while len(strands) < count:
        jf = rnd.uniform(0, cols)
        front = math.degrees(abs(math.pi - 2 * math.pi * jf / cols))
        if front < 45:                                    # not over her face
            continue
        pts = []
        for i in range(rnd.randint(0, 3), rows):
            p = at(i, jf)
            pts.append(p + (p - skull).normalized() * 0.0055)      # on the cap's outer surface (it is solidified outward)
        edge = pts[-1]
        out = (Vector((edge.x - skull.x, edge.y - skull.y, 0)).normalized() + back * 1.6).normalized()   # out into the fan
        side = Vector((-out.y, out.x, 0))
        L = rnd.uniform(*length)
        phase, amp = rnd.uniform(0, 6.3), rnd.uniform(0.004, 0.012)
        n = 12
        for k in range(1, n + 1):
            f = k / n
            q = edge + out * (L * f) + side * amp * math.sin(phase + f * 7)
            q.z = z + rnd.uniform(0, 0.002) + (edge.z - z) * max(0.0, 1 - f * 2.2) ** 2   # arcing down onto the floor, then along it
            pts.append(q)
        strands.append(pts)

    c = bpy.data.hair_curves.new('MomStrands')
    c.add_curves([len(p) for p in strands])
    flat_pts = [x for p in strands for v in p for x in v]
    c.attributes['position'].data.foreach_set('vector', flat_pts)
    radius = c.attributes.new('radius', 'FLOAT', 'POINT')
    radius.data.foreach_set('value', [0.0009] * (len(flat_pts) // 3))
    tone = c.attributes.new('tone', 'FLOAT', 'CURVE')
    tone.data.foreach_set('value', [rnd.random() for _ in strands])
    o = bpy.data.objects.new('MomStrands', c)
    scene().collection.objects.link(o)

    m = bpy.data.materials.new('MomStrandsMat'); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    attr = nt.nodes.new('ShaderNodeAttribute'); attr.attribute_name = 'tone'
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0; ramp.color_ramp.elements[0].color = (0.075, 0.072, 0.069, 1)
    ramp.color_ramp.elements[1].position = 1.0; ramp.color_ramp.elements[1].color = (0.5, 0.49, 0.48, 1)
    mid = ramp.color_ramp.elements.new(0.5); mid.color = (0.2, 0.195, 0.19, 1)       # grey: no black strands
    nt.links.new(attr.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = 0.45
    c.materials.append(m)
    cast.M.append(o)
    return o


def young_skin(material='Base_F_D', detail=0.42, saturation=1.35, warmth=1.04, radius=5):
    """Skin younger (photos 1-3): the face texture's fine detail (its creases) damped, the broad
    tones kept (frequency separation: a blur, plus detail times the original's fine detail), and
    the colour livelier. Works on a copy of the texture (her Base_F_D, or his M_Head)."""
    import numpy as np
    mat = bpy.data.materials[material]
    node = next(n for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.size[0] > 256)
    src = node.image
    w, h = src.size
    src.pixels[0]                                        # (loads the packed image; until then it reads as zeros)
    px = np.empty(w * h * 4, dtype=np.float32)
    src.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    rgb = px[..., :3]

    def box(a, r, axis):
        c = np.cumsum(np.pad(a, [(r + 1, r) if i == axis else (0, 0) for i in range(3)], mode='edge'), axis=axis)
        hi = np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis)
        lo = np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)
        return (hi - lo) / (2 * r + 1)

    blur = rgb
    for _ in range(3):                                   # three box passes: near enough a gaussian
        blur = box(box(blur, radius, 0), radius, 1)
    out = blur + (rgb - blur) * detail
    grey = out.mean(axis=2, keepdims=True)
    out = grey + (out - grey) * saturation               # livelier
    out *= np.array([warmth, 1.0, 1.0 / warmth])         # a touch warmer
    px[..., :3] = np.clip(out, 0, 1)
    import tempfile
    young = bpy.data.images.new(src.name + '_young', w, h, alpha=True)
    young.pixels.foreach_set(px.ravel())
    path = os.path.join(tempfile.gettempdir(), f'prologue_young_{material}.png')
    young.filepath_raw = path; young.file_format = 'PNG'
    young.save()                                         # (a generated image renders black; one loaded from a file does not)
    bpy.data.images.remove(young)
    node.image = bpy.data.images.load(path)
    node.image.colorspace_settings.name = src.colorspace_settings.name


# ====================================================================== Voss at fifteen
V_HAIR_TO_Z = 1.268          # (rest pose, model units) his teenage hair ends here: the middle of his ears


def teen_voss(cast, blazer='#26324a', head_scale=1.07):
    """Voss at about fifteen (photo 3): his hair cut short (pulled up to his ears and in to his
    head), a rounder, fuller face (a shape key), a head a little big for his body, his skin younger,
    the lab coat a dark school blazer. Call once he is posed (freeze_clip resets bone scale); then
    set his height: to_height(cast.V_HEAD, cast.v_root, 1.65)."""
    head = bpy.data.objects['Head']
    hco = [v.co for v in head.data.vertices]
    axis = sum(hco, Vector()) / len(hco)
    hair = bpy.data.objects['Hair']
    for v in hair.data.vertices:
        if v.co.z < V_HAIR_TO_Z:
            v.co.z = V_HAIR_TO_Z - (V_HAIR_TO_Z - v.co.z) * 0.15          # the length gone
            off = Vector((v.co.x - axis.x, v.co.y - axis.y, 0))
            v.co.x, v.co.y = axis.x + off.x * 0.93, axis.y + off.y * 0.93  # and close to his head
    # a fuller lower face: cheeks and jaw out a little, the chin a touch shorter
    k = cast.v_face.shape_key_add(name='young', from_mix=False)
    for d in k.data:
        p = d.co
        if p.y > 0.0:
            continue
        w = gauss((p.z - 1.215) / 0.045)                                   # cheeks to jaw
        p.x *= 1 + 0.06 * w
        p.y -= 0.002 * w * min(abs(p.x) / 0.03, 1)
        if p.z < 1.2:
            p.z += (1.2 - p.z) * 0.12                                      # the chin up a little
    k.value = 1.0
    bone(cast.v_arm, 'Head1').scale = (head_scale,) * 3
    update()
    young_skin('M_Head', detail=0.5, saturation=1.15, warmth=1.02)
    tint(bpy.data.materials['M_Coat'], srgb(blazer))


def add_pendant(cast):
    """Her gold pendant, on her chest (call once she is placed and posed)."""
    neck = bone_world(cast.m_arm, 'Neck1')
    chest = bone_world(cast.m_arm, 'Spine4')
    p = neck.lerp(chest, 0.55)
    fwd = cast.m_root.matrix_world.to_3x3().normalized() @ Vector((-0.02, -0.13, 0))   # out of her chest
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, location=p + fwd)
    pend = bpy.context.object; pend.data.materials.append(gold())
    bpy.ops.object.shade_smooth()
    attach(pend, cast.m_arm, 'Spine4')
    return pend


# ====================================================================== render
def light(loc, energy, size, color=(1, 1, 1), target=None, kind='AREA'):
    d = bpy.data.lights.new('l', kind); d.energy = energy; d.color = color
    if kind == 'AREA':
        d.size = size
    elif kind in ('POINT', 'SPOT'):
        d.shadow_soft_size = size
    o = bpy.data.objects.new('l', d); o.location = loc; scene().collection.objects.link(o)
    if target is not None:
        c = o.constraints.new('TRACK_TO'); c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return o


def camera(loc, target, lens):
    cd = bpy.data.cameras.new('cam'); cd.lens = lens
    cam = bpy.data.objects.new('cam', cd); scene().collection.objects.link(cam); scene().camera = cam
    cam.location = loc
    c = cam.constraints.new('TRACK_TO'); c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return cam


def empty(name, loc):
    e = bpy.data.objects.new(name, None); scene().collection.objects.link(e)
    e.location = loc
    return e


def render_setup(size=1600, transparent=True, world_rgb=(0.75, 0.78, 0.82), world_strength=0.6):
    scn = scene()
    scn.render.engine = 'BLENDER_EEVEE'
    scn.render.film_transparent = transparent
    scn.render.resolution_x = scn.render.resolution_y = size
    scn.view_settings.view_transform = 'AgX'
    scn.world = bpy.data.worlds.new('w')
    scn.world.use_nodes = True
    bg = scn.world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (*world_rgb, 1)
    bg.inputs[1].default_value = world_strength


def render(out):
    scene().render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('WROTE', out)


def closeups(cast, cam, aim_obj, out_dir, extra=()):
    """Close-ups of both faces (and any (name, arm, bone) in extra), for checking expressions."""
    scn = scene()
    scn.render.resolution_x = scn.render.resolution_y = 700
    lens = cam.data.lens
    cam.data.lens = 120
    shots = [('voss', cast.v_arm, 'Head1'), ('mom', cast.m_arm, 'Head1'), *extra]
    for name, arm, key in shots:
        h = bone_world(arm, key)
        aim_obj.location = h + Vector((0, 0, 0.05))
        cam.location = h + Vector((0.15, -1.2, 0.08))
        render(os.path.join(out_dir, f'face_{name}.png'))
    cam.data.lens = lens
