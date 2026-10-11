"""
Swap the vegetables in the hand-edited atrium (Blender/l2-atrium.blend) for a fresh build of them.

l2-atrium.blend is no longer just build_l2_atrium.py's output: the bedrooms (Bedroom1/Bedroom2)
are placed in it by hand, so rebuilding it from scratch would lose them. Instead:

  1. build the atrium into a scratch file (it holds the new vegetable meshes):
       blender -b --factory-startup --python Blender/scripts/build_l2_atrium.py -- <scratch.blend> <scratch.glb>
  2. swap only the vegetables into l2-atrium.blend (this script):
       blender -b Blender/l2-atrium.blend --python Blender/scripts/swap_l2_veg.py -- <scratch.blend>
  3. export as usual:
       blender -b --factory-startup --python Blender/scripts/export_l2_atrium.py

The old vegetable mesh (PLANT_Vegetables) and the old pulled-carrot cones in Atrium_Chaos (its
'carrot' faces) are removed; PLANT_Vegetables and every PLANT_Veg_* object come in from the scratch
file. Their textures are shrunk to 512 px and packed into the file (as the other plants' are), and
materials that already exist here are reused rather than duplicated. Nothing else is touched.
"""
import sys, os, re, tempfile, bpy, bmesh

src = sys.argv[sys.argv.index('--') + 1]

# 1. out with the old
for o in [o for o in bpy.data.objects if o.name.startswith('PLANT_Veg')]:
    bpy.data.objects.remove(o, do_unlink=True)
chaos = bpy.data.objects.get('Atrium_Chaos')
if chaos:
    idx = [i for i, s in enumerate(chaos.material_slots) if s.material and s.material.name == 'carrot']
    if idx:
        bm = bmesh.new()
        bm.from_mesh(chaos.data)
        dead = [f for f in bm.faces if f.material_index in idx]
        bmesh.ops.delete(bm, geom=dead, context='FACES')
        bm.to_mesh(chaos.data)
        bm.free()
        print('removed', len(dead), 'old carrot faces from Atrium_Chaos')

# 2. in with the new
with bpy.data.libraries.load(src, link=False) as (data_from, data_to):
    data_to.objects = [n for n in data_from.objects if n.startswith('PLANT_Veg')]
target = bpy.data.collections.get('Atrium_Visual') or bpy.context.scene.collection
added = []
for o in data_to.objects:
    if o is not None:
        target.objects.link(o)
        added.append(o)
print('added', [o.name for o in added])

# 3. reuse existing materials (an appended 'veg_dead.001' becomes this file's 'veg_dead')
# Only untextured ones: the models' own materials have generic names ('Material') that may
# already belong to something else in this file.
for o in added:
    for slot in o.material_slots:
        m = slot.material
        if not m or (m.node_tree and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes)):
            continue
        base = re.sub(r'\.\d{3}$', '', m.name)
        if base != m.name and base in bpy.data.materials:
            slot.material = bpy.data.materials[base]

# The models' own materials get names of their own ('Material.016' would be taken by the game for
# bedroom furniture and drawn as toon). 'veg_' also gives them the game's cheaper plant lighting.
for o in added:
    kind = o.name.split('.')[0][len('PLANT_Veg_'):]
    if not kind or kind.endswith(('_veg_dead', '_veg_yellow')) or o.name.startswith('PLANT_Vegetables'):
        continue
    for slot in o.material_slots:
        m = slot.material
        if m and m.node_tree and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes):
            m.name = 'veg_tex_' + kind.replace('_top', '')

# 4. keep only the colour textures, at most 512 px, packed
for o in added:
    for slot in o.material_slots:
        m = slot.material
        if not m or not m.node_tree:
            continue
        for n in list(m.node_tree.nodes):
            if n.type == 'TEX_IMAGE':
                if not any(l.to_socket.name == 'Base Color' for l in n.outputs['Color'].links):
                    m.node_tree.nodes.remove(n)           # the unused normal / roughness / emission maps
                    continue
                im = n.image
                if im and (im.size[0] > 512 or im.size[1] > 512):
                    # a fresh 512 px copy, saved and packed (the importer already packed the
                    # full-size file, and repacking a scaled image would keep that big original)
                    im.scale(512, 512)
                    small = bpy.data.images.new(im.name + '_512', 512, 512, alpha=True)
                    small.pixels = im.pixels[:]
                    small.filepath_raw = os.path.join(tempfile.gettempdir(), 'veg_%s.png' % re.sub(r'\W', '_', im.name))
                    small.file_format = 'PNG'
                    small.save()
                    small.pack()
                    n.image = small
                elif im and not im.packed_file:
                    im.pack()
for im in [i for i in bpy.data.images if i.users == 0]:
    bpy.data.images.remove(im)

bpy.ops.wm.save_mainfile()
print('saved', bpy.data.filepath)
