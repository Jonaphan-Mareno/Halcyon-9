import * as THREE from 'three';

// The bedroom shells ship as plain painted boxes. This clads one in the team's metal set
// (public/assets/textures/Metals: ambientCG Metal046B, CC0, credited in CREDITS.md) - walls
// and roof only, the floor slab band at the bottom of the box keeps the room's own paint
// (the DoubleSide toon material shows that band as the floor you walk on).
//
// The shell's authored UVs are one 0..1 squash over the whole box, so every corner gets a
// world-space box projection at a fixed metre scale instead; the mesh is rebuilt unindexed
// (it is a few hundred corners) so each corner carries its own normal and the projection
// stays crisp across the hard edges.

const DIR = './assets/textures/Metals/';
const TILE = 2.2;   // metres per texture repeat

let metal = null;
function shellMetalMaterial() {
  if (metal) return metal;
  const loader = new THREE.TextureLoader();
  const load = (file, srgb) => {
    const t = loader.load(DIR + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  metal = new THREE.MeshStandardMaterial({
    name: 'bed_shell_metal',
    map: load('Metal046B_1K-JPG_Color.jpg', true),
    normalMap: load('Metal046B_1K-JPG_NormalGL.jpg', false),
    roughnessMap: load('Metal046B_1K-JPG_Roughness.jpg', false),
    metalnessMap: load('Metal046B_1K-JPG_Metalness.jpg', false),
    metalness: 1,
    roughness: 0.65,
    envMapIntensity: 2,
    side: THREE.DoubleSide        // like the room's toon shell: seen from the inside
  });
  return metal;
}

// Clad the named shells' walls + roof in metal (slot 0), leaving everything else - the
// floor slab band - on the object's existing material (slot 1, which the bedroom toon
// pass then picks up as usual)
export function applyShellMetal(root, names, tile = TILE) {
  const mat = shellMetalMaterial();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (const name of names) {
    const o = root.getObjectByName(name);
    if (!o || !o.isMesh) continue;
    o.updateWorldMatrix(true, false);
    const mw = o.matrixWorld;
    const nrmMat = new THREE.Matrix3().getNormalMatrix(mw);
    if (!o.geometry.attributes.position || !o.geometry.attributes.normal) continue;
    const split = o.geometry.index ? o.geometry.toNonIndexed() : null;
    const src = split || o.geometry;
    const pos = src.attributes.position;
    const nrm = src.attributes.normal;
    const box = new THREE.Box3().setFromObject(o);
    const floorY = box.min.y + 0.12 * (box.max.y - box.min.y);
    const tris = pos.count / 3;
    const clad = [], kept = [];
    for (let t = 0; t < tris; t++) {
      c.set(0, 0, 0);
      n.set(0, 0, 0);
      for (let k = 0; k < 3; k++) {
        c.add(p.fromBufferAttribute(pos, t * 3 + k).applyMatrix4(mw));
        n.add(p.fromBufferAttribute(nrm, t * 3 + k).applyMatrix3(nrmMat));
      }
      n.normalize();
      // the slab the room stands on: horizontal faces in the bottom band of the box
      (Math.abs(n.y) > 0.7 && c.y / 3 < floorY ? kept : clad).push(t);
    }
    if (!clad.length) {
      if (split) split.dispose();
      continue;
    }
    const order = clad.concat(kept);
    const g = new THREE.BufferGeometry();
    for (const key of Object.keys(src.attributes)) {
      if (key === 'uv') continue;                     // rebuilt below, in world space
      const a = src.attributes[key];
      const out = new a.array.constructor(order.length * 3 * a.itemSize);
      order.forEach((t, i) => {
        for (let k = 0; k < 3; k++) {
          const s = (t * 3 + k) * a.itemSize;
          const d = (i * 3 + k) * a.itemSize;
          for (let q = 0; q < a.itemSize; q++) out[d + q] = a.array[s + q];
        }
      });
      g.setAttribute(key, new THREE.BufferAttribute(out, a.itemSize));
    }
    // box projection along each corner's own dominant axis, in world metres
    const gp = g.attributes.position;
    const gn = g.attributes.normal;
    const uv = new THREE.BufferAttribute(new Float32Array(gp.count * 2), 2);
    for (let i = 0; i < gp.count; i++) {
      p.fromBufferAttribute(gp, i).applyMatrix4(mw);
      n.fromBufferAttribute(gn, i).applyMatrix3(nrmMat).normalize();
      const ax = Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z) ? 0
        : (Math.abs(n.y) >= Math.abs(n.z) ? 1 : 2);
      uv.setXY(i, (ax === 0 ? p.z : p.x) / tile, (ax === 1 ? p.z : p.y) / tile);
    }
    g.setAttribute('uv', uv);
    g.addGroup(0, clad.length * 3, 0);
    g.addGroup(clad.length * 3, kept.length * 3, 1);
    o.geometry = g;
    o.material = [mat, Array.isArray(o.material) ? o.material[0] : o.material];
    if (split) split.dispose();
    console.log('%s: %d/%d faces clad in metal', name, clad.length, tris);
  }
}
