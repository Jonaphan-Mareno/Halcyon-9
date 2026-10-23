import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Joins a model's still meshes that share a material into one mesh each, so they are drawn in one
// go: every separate mesh costs the processor a draw call each frame, and a level made of a few
// hundred of them spends most of its frame just asking the graphics card to draw (the school PCs'
// Intel graphics most of all). The look does not change: the same materials, the same triangles.
//
// Left alone (so the code can still find, move, hide or animate them):
//   - anything whose own name, or an ancestor's, matches keep (a RegExp)
//   - glass and other see-through materials (drawn back to front, one by one), anything with its
//     own draw order, hidden things, rigged or morphing meshes, anything riding a bone
//   - meshes with several materials
// Call it once the model's materials, shadows and draw orders are all set. The joined meshes go
// under the model's root, so a later search of the model still finds them.
export function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  const kept = (o) => {
    for (let n = o; n && n !== root; n = n.parent) {
      if (n.isBone || (keep && keep.test(n.name))) return true;
    }
    return false;
  };
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material)) return;
    const m = o.material, geo = o.geometry;
    if (m.transparent || o.renderOrder !== 0 || !o.visible || geo.morphAttributes.position || geo.groups.length > 1) return;
    if (kept(o)) return;
    // only meshes made of the same kinds of data can be joined
    const attrs = Object.keys(geo.attributes).sort().map((k) => {
      const a = geo.attributes[k];
      return k + a.itemSize + (a.normalized ? 'n' : '') + a.array.constructor.name;
    }).join(',');
    const key = m.uuid + '|' + attrs + '|' + !!geo.index + '|' + o.castShadow + o.receiveShadow + '|' + (o.layers.mask);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  let before = 0, after = 0;
  const m4 = new THREE.Matrix4();
  for (const meshes of groups.values()) {
    before += meshes.length;
    if (meshes.length < 2) {
      after += 1;
      continue;
    }
    const geos = meshes.map((o) => {
      const g = o.geometry.clone();
      g.applyMatrix4(m4.multiplyMatrices(toRoot, o.matrixWorld));
      // (a mirrored part's triangles turn inside out when baked; flip them back)
      if (m4.determinant() < 0 && g.index) {
        const idx = g.index.array;
        for (let i = 0; i < idx.length; i += 3) {
          const t = idx[i + 1];
          idx[i + 1] = idx[i + 2];
          idx[i + 2] = t;
        }
      }
      return g;
    });
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) {
      after += meshes.length;
      continue;
    }
    const first = meshes[0];
    const mesh = new THREE.Mesh(merged, first.material);
    mesh.name = 'Merged_' + (first.material.name || 'mesh');
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.layers.mask = first.layers.mask;
    root.add(mesh);
    for (const o of meshes) o.removeFromParent();
    after += 1;
  }
  return { before, after };
}
