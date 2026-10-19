import * as THREE from 'three';

// The bedroom shells ship as plain painted boxes. This clads them in the team's metal set
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
    color: 0xC9DDFF,
    map: load('metal_plate_02_diff_1k.jpg', true),
    normalMap: load('metal_plate_02_nor_gl_1k.jpg', false),
    normalScale: new THREE.Vector2(1.5, 1.5),
    roughnessMap: load('metal_plate_02_rough_1k.jpg', false),
    metalnessMap: load('metal_plate_02_metal_1k.jpg', false),
    metalness: 0.3,
    roughness: 0.65,
    envMapIntensity: 2.2,
    side: THREE.DoubleSide        // like the room's toon shell: seen from the inside
  });
  return metal;
}

// Clad every mesh under each named object (the object itself, or all its child meshes
// if it is a Group/Empty) in metal. Logs any name that can't be found.
export function applyShellMetal(root, names, tile = TILE) {
  const mat = shellMetalMaterial();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (const name of names) {
    const top = root.getObjectByName(name) || root.getObjectByName(name.replace(/\./g, ''));
    if (!top) {
      console.warn('applyShellMetal: no object named', name);
      continue;
    }

    const meshes = [];
    top.traverse(m => { if (m.isMesh) meshes.push(m); });
    if (!meshes.length) {
      console.warn('applyShellMetal: no meshes under', name);
      continue;
    }

    for (const o of meshes) {
      // already cladded (e.g. called twice): skip so we don't re-project
      if (Array.isArray(o.material) && o.material[0] === mat) continue;
      if (!o.geometry.attributes.position || !o.geometry.attributes.normal) {
        console.warn('applyShellMetal: %s has no position/normal, skipped', o.name);
        continue;
      }

      o.updateWorldMatrix(true, false);
      const mw = o.matrixWorld;
      const nrmMat = new THREE.Matrix3().getNormalMatrix(mw);

      // Always work on a non-indexed copy to ensure per-face UVs.
      const src = o.geometry.toNonIndexed();
      const pos = src.attributes.position;
      const tris = pos.count / 3;
      if (!tris) {
        src.dispose();
        continue;
      }

      // Every face is clad (walls, roof and floor), so the geometry keeps its order.
      const g = new THREE.BufferGeometry();
      for (const key of Object.keys(src.attributes)) {
        if (key === 'uv') continue;                   // rebuilt below, in world space
        g.setAttribute(key, src.attributes[key].clone());
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

      // slot 0 = metal (all faces); slot 1 keeps the old material, unused but available
      g.addGroup(0, gp.count, 0);
      const old = Array.isArray(o.material) ? o.material[0] : o.material;
      o.geometry.dispose();
      o.geometry = g;
      o.material = [mat, old];
      src.dispose();
      console.log('%s: %d faces clad in metal', o.name || name, tris);
    }
  }
}

// Debug helper: logs meshes whose first material isn't the shell metal.
// Call after applyShellMetal(...) to see what was missed.
export function logUncladMeshes(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m !== metal) console.log('not clad:', o.name);
  });
}