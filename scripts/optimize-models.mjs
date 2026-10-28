// Make the big static models smaller to download and lighter to draw:
//
//   npm run optimize-models
//
// 1. Thins the heaviest meshes (control room only): the wall's screws and pipework, the chairs and
//    the generator's rings were modelled far denser than they show on screen (about 470k of the
//    room's 555k triangles). Simplified with meshoptimizer, within a small error, so the shapes
//    keep their outline.
// 2. Compresses every mesh with Draco (three.js decodes it while loading, in web workers; the
//    decoder ships with three.js). The control room goes from ~21 MB to ~1-2 MB, which matters
//    on the school server.
//
// Safe to run again after a teammate re-exports a model: files that are already compressed are
// skipped. Nothing else in the files changes (node names, empties, animations, materials).
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { weldPrimitive, simplifyPrimitive, dedup, draco, normals, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import { statSync } from 'node:fs';

const MODELS = 'public/assets/models/';

// per file: mesh name pattern -> [fraction of triangles to keep, error allowed (a fraction of
// the mesh's size)]. The error bound keeps simple parts from being over-thinned; the screws are
// tiny separate parts that only collapse with a looser bound (they show as small dark dots).
const THIN = {
  'controlroom.glb': [
    [/^srouby/, 0.12, 0.05, true],  // the screws on the monitor wall: 213k triangles (flat shaded)
    [/^kolecka/, 0.15],       // its round fittings: 115k
    [/^Chair/, 0.3],          // three office chairs, 26k each
    [/^Circle00[1-4]$/, 0.3]  // the generator's glowing rings, 16k each
  ]
};

const FILES = process.argv.slice(2).length ? process.argv.slice(2)
  : ['controlroom.glb', 'l2-atrium.glb', 'l2-lab.glb', 'l3-drowned.glb'];

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule()
  });
await MeshoptSimplifier.ready;

const mb = (path) => (statSync(path).size / 1048576).toFixed(1) + ' MB';
const tris = (doc) => doc.getRoot().listMeshes().reduce((n, m) => n + m.listPrimitives()
  .reduce((k, p) => k + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0), 0);

for (const name of FILES) {
  const path = MODELS + name;
  const doc = await io.read(path);
  if (doc.getRoot().listExtensionsUsed().some((e) => e instanceof KHRDracoMeshCompression)) {
    console.log(`${name}: already compressed, skipped`);
    continue;
  }
  const before = mb(path), trisBefore = tris(doc);

  const rules = THIN[name] || [];
  if (rules.length) {
    // the mesh's own name, or its node's (the exporter names either)
    const nodeNames = new Map();
    for (const node of doc.getRoot().listNodes()) if (node.getMesh()) nodeNames.set(node.getMesh(), node.getName());
    for (const mesh of doc.getRoot().listMeshes()) {
      const label = (nodeNames.get(mesh) || mesh.getName() || '').replace(/\./g, '');
      const rule = rules.find(([re]) => re.test(label) || re.test((mesh.getName() || '').replace(/\./g, '')));
      if (!rule) continue;
      for (const prim of mesh.listPrimitives()) {
        // Flat-shaded parts store each triangle's corners separately (their normals differ), so
        // nothing could be welded or collapsed: drop the normals, simplify on the shape alone,
        // then rebuild them (below)
        if (rule[3]) {
          prim.setAttribute('NORMAL', null);
          prim.setAttribute('TEXCOORD_0', null);
        }
        weldPrimitive(prim);   // (vertices must be shared for the simplifier to collapse edges)
        simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: rule[1], error: rule[2] ?? 0.002 });
      }
    }
  }

  // (prune: only the vertex data left unused by the thinning; empties and other nodes stay)
  await doc.transform(normals({ overwrite: false }), prune({ propertyTypes: [PropertyType.ACCESSOR] }),
    // (dedup: shared vertex data and textures only. Merging identical MESHES would rename their
    // parts: the game finds monitors and screens by those names)
    dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.TEXTURE] }), draco({ method: 'edgebreaker' }));
  await io.write(path, doc);
  console.log(`${name}: ${before} -> ${mb(path)}, ${Math.round(trisBefore)} -> ${Math.round(tris(doc))} triangles`);
}
