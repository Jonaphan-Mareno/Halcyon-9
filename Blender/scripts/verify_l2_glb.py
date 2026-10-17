"""Verify a exported l2-atrium GLB: skins, animations, colour attributes, colliders.

Checks the things the export pipeline is responsible for - the RoboArm skins/animations,
the vertex colours grafted from bedroom.blend, and the generated COL_ colliders with
per-room envelopes that must cover the room shell (not the whole atrium). Run it after
every re-export:

  python3 Blender/scripts/verify_l2_glb.py [path/to/l2-atrium.glb]
"""
import json, struct, sys

path = sys.argv[1] if len(sys.argv) > 1 else '/home/vmuser/Halcyon-9/public/assets/models/l2-atrium.glb'
with open(path, 'rb') as f:
    magic, ver, total = struct.unpack('<III', f.read(12))
    assert magic == 0x46546C67, 'not a GLB'
    clen, ctype = struct.unpack('<II', f.read(8))
    doc = json.loads(f.read(clen))

meshes, nodes, skins, anims = doc.get('meshes', []), doc.get('nodes', []), doc.get('skins', []), doc.get('animations', [])
print('%s  (%.1f MB)' % (path.split('/')[-1], total / 1e6))
print('meshes %d  nodes %d  skins %d  animations %d  materials %d' % (
    len(meshes), len(nodes), len(skins), len(anims), len(doc.get('materials', []))))

coloured = sum(1 for me in meshes
               if any(a.startswith('COLOR') for p in me['primitives'] for a in p.get('attributes', {})))
print('meshes with COLOR_0: %d/%d' % (coloured, len(meshes)))

colliders = {n['name']: i for i, n in enumerate(nodes)
             if n.get('name', '').startswith(('COL_', 'MOVE_', 'ROT_', 'DOOR_', 'LIFT_', 'GATE_'))}
print('collider nodes: %d' % len(colliders))

for label, key in (('Voss', 'Voss'), ('Kess', 'Kess')):
    group = {n: i for n, i in colliders.items() if key in n}
    floors = [n for n in group if 'Floor' in n]
    print('  %s: %d colliders' % (label, len(group)))
    if floors:
        i = colliders[floors[0]]
        pos = meshes[nodes[i]['mesh']]['primitives'][0]['attributes']['POSITION']
        a = doc['accessors'][pos]
        print('    %s bounds %s .. %s' % (floors[0], ['%.2f' % v for v in a['min']], ['%.2f' % v for v in a['max']]))

for a in anims:
    print('animation: %s (%d channels)' % (a.get('name', '?'), len(a.get('channels', []))))
for s in skins:
    root = nodes[s['joints'][0]].get('name', '?')
    print('skin: root joint %s (%d joints)' % (root, len(s['joints'])))

# which nodes reference skins / carry JOINTS_0, and their names
skinned = [n.get('name', '?') for n in nodes if 'skin' in n]
print('skinned nodes: %s' % skinned)
armed = [n.get('name', '?') for n in nodes
         if 'mesh' in n and any('JOINTS_0' in p.get('attributes', {}) for p in meshes[n['mesh']]['primitives'])]
print('meshes with JOINTS_0: %s' % armed)

# props parked outside their room's shell still get their own colliders, named by the bedroom
# source (base name), so a .002 duplicate shares the base name with the original
for n in ('WallPanel00', 'BedCrew00', 'Canister00'):
    hit = [c for c in colliders if '_%s' % n in c]
    print('  colliders for %s*: %s' % (n, hit or 'NONE'))
