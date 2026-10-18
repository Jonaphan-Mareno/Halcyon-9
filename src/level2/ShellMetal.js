import * as THREE from 'three';

// The bedroom shells ship as plain painted boxes. This clads one in the team's metal set
// (public/assets/textures/Metals/Metal_plate: Poly Haven Metal Plate 02, CC0, credited in CREDITS.md) - walls,
// roof and floor clad in scratched steel plate.
//
// The shell's authored UVs are one 0..1 squash over the whole box, so every corner gets a
// world-space box projection at a fixed metre scale instead; the mesh is rebuilt unindexed
// (it is a few hundred corners) so each corner carries its own normal and the projection
// stays crisp across the hard edges.

const DIR = './assets/textures/Metals/Metal_plate/';
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
    color: 0xA8C8FF,
    map: load('metal_plate_02_diff_1k.jpg', true),
    normalMap: load('metal_plate_02_nor_gl_1k.jpg', false),
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughnessMap: load('metal_plate_02_rough_1k.jpg', false),
    metalnessMap: load('metal_plate_02_metal_1k.jpg', false),
    metalness: 1.0,
    roughness: 0.9,
    envMapIntensity: 1.5,
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
    const o = root.getObjectByName(name) || root.getObjectByName(name.replace(/\./g, ''));
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
      // Clad all faces (walls, roof, and floor)
      clad.push(t);
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
