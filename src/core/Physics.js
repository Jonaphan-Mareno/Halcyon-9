import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

// A thin wrapper around the Rapier physics world. Level geometry becomes static
// triangle-mesh colliders (baked into world space from the hub model's COL_ proxy
// meshes); the player is a kinematic capsule driven by a character controller
// (see player/PlayerController.js).
export class Physics {
  // Rapier's WebAssembly has to be initialised once before a world can exist
  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  constructor() {
    this.RAPIER = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this._v = new THREE.Vector3();
    this._ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  // Bake every mesh under `object` into one static trimesh collider, in world space
  addStaticObject(object) {
    object.updateWorldMatrix(true, true);
    const verts = [];
    const indices = [];
    let base = 0;
    object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const geo = mesh.geometry;
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        this._v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        verts.push(this._v.x, this._v.y, this._v.z);
      }
      if (geo.index) {
        for (let i = 0; i < geo.index.count; i++) indices.push(geo.index.getX(i) + base);
      } else {
        for (let i = 0; i < pos.count; i++) indices.push(i + base);
      }
      base += pos.count;
    });
    if (!indices.length) return null;
    // FIX_INTERNAL_EDGES stops the capsule catching on the seams between triangles
    const flags = RAPIER.TriMeshFlags ? RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES : undefined;
    const desc = RAPIER.ColliderDesc.trimesh(new Float32Array(verts), new Uint32Array(indices), flags);
    return this.world.createCollider(desc);
  }

  // Distance to the first solid thing along a ray, or null if nothing is hit
  // within maxDist. The kinematic player body is ignored.
  castRay(origin, direction, maxDist) {
    this._ray.origin.x = origin.x;
    this._ray.origin.y = origin.y;
    this._ray.origin.z = origin.z;
    this._ray.dir.x = direction.x;
    this._ray.dir.y = direction.y;
    this._ray.dir.z = direction.z;
    const hit = this.world.castRay(this._ray, maxDist, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
    return hit ? hit.timeOfImpact : null;
  }

  step(delta) {
    this.world.timestep = delta;
    this.world.step();
  }

  dispose() {
    this.world.free();
  }
}
