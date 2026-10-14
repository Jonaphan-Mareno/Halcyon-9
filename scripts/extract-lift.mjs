// Cut the lift out of the control room, so level 2 arrives in the same lift level 1 leaves in:
//
//   npm run extract-lift
//
// Copies the cabin (walls, floor, ceiling, light strip, trim, bolts and the call panel), the door
// frame and the two doors from controlroom.glb into lift.glb. Nothing is remodelled: the parts,
// names and materials are the control room's own. The model's origin is moved to the middle of
// the door sill at the front of the frame, the point level 2 sets into its lift opening.
//
// Run again after a teammate re-exports controlroom.glb (and after npm run optimize-models).
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, draco, prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { statSync } from 'node:fs';

const SOURCE = 'public/assets/models/controlroom.glb';
const TARGET = 'public/assets/models/lift.glb';
const KEEP = ['ElevatorCabin', 'Door_Frame', 'Door_Left', 'Door_Right'];

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule()
  });
const doc = await io.read(SOURCE);
const root = doc.getRoot();
const scene = root.listScenes()[0];

// world-space bounds of one node's meshes (column-major matrices, as glTF stores them)
function bounds(node) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  node.traverse((n) => {
    const mesh = n.getMesh();
    if (!mesh) return;
    const m = n.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const a = prim.getAttribute('POSITION');
      const min = a.getMin([]), max = a.getMax([]);
      for (let c = 0; c < 8; c++) {
        const p = [c & 1 ? max[0] : min[0], c & 2 ? max[1] : min[1], c & 4 ? max[2] : min[2]];
        for (let i = 0; i < 3; i++) {
          const v = m[i] * p[0] + m[4 + i] * p[1] + m[8 + i] * p[2] + m[12 + i];
          lo[i] = Math.min(lo[i], v);
          hi[i] = Math.max(hi[i], v);
        }
      }
    }
  });
  return { lo, hi };
}

const kept = KEEP.map((name) => {
  const node = scene.listChildren().find((n) => n.getName() === name);
  if (!node) throw new Error(`${SOURCE} has no top-level node named ${name}`);
  return node;
});

// the new origin: the middle of the door frame, its front face, at the cabin's floor
const frame = bounds(kept[1]);
const floor = bounds(kept[0].listChildren().find((n) => n.getName() === 'Cabin_Floor'));
const origin = [(frame.lo[0] + frame.hi[0]) / 2, floor.hi[1], frame.lo[2]];

// everything else in the room goes (its animations too: level 2 slides the doors itself)
for (const node of scene.listChildren()) {
  if (kept.includes(node)) continue;
  const all = [];
  node.traverse((n) => all.push(n));
  for (const n of all) n.dispose();
}
for (const anim of root.listAnimations()) anim.dispose();

const lift = doc.createNode('Lift').setTranslation(origin.map((v) => -v));
for (const node of kept) {
  scene.removeChild(node);
  lift.addChild(node);
}
scene.addChild(lift);

await doc.transform(prune(), dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE] }),
  draco({ method: 'edgebreaker' }));
await io.write(TARGET, doc);
console.log(`${TARGET}: ${(statSync(TARGET).size / 1024).toFixed(0)} KB, origin moved from ` +
  origin.map((v) => v.toFixed(3)).join(', '));
