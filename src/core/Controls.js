import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

export class Controls {
  constructor(camera, domElement, currentLevel) {
    this.instance = new PointerLockControls(camera, domElement);
    this.camera = camera;
    this.level = currentLevel;
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    //this.inputEnabled = true;

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    this.speed = 40.0;

    // Floor-following (stairs, ramps)
    this.eyeHeight = 2.6;
    this.floorSmoothing = 15;
    this.maxRayDistance = 5;
    // The floor probe starts this far above the camera so steps and ramps are
    // still caught while descending. It must stay below the headroom of the
    // tightest space in a level: once the probe starts above a ceiling, that
    // ceiling reads as the floor (see updateFloorHeight).
    this.floorProbeLift = 1.0;
    // A surface this close to eye level or above is overhead, not underfoot
    this.floorEpsilon = 0.05;

    // Wall collision
    this.collisionRadius = 0.5; // how close the camera can get to a wall

    this._raycaster = new THREE.Raycaster();
    this._downVec = new THREE.Vector3(0, -1, 0);
    this._rayOrigin = new THREE.Vector3();
    this._hitNormal = new THREE.Vector3();
    this._matCol = new THREE.Vector3(); // local X column of camera matrix
    this._rightDir = new THREE.Vector3();
    this._forwardDir = new THREE.Vector3();

    document.addEventListener('keydown', (e) => this.onKeyDown(e));
    document.addEventListener('keyup', (e) => this.onKeyUp(e));
  }

  lock() {
    this.instance.lock();
  }
  // setInputEnabled(enabled) {
  //   this.inputEnabled = enabled;
  //   this.instance.enabled = enabled;

  //   if (!enabled) {
  //     this.stopMovement();
  //   }
  // }

// stopMovement() {
//   this.moveForward = false;
//   this.moveBackward = false;
//   this.moveLeft = false;
//   this.moveRight = false;

//   this.velocity.set(0, 0, 0);
// }

  // Freeze movement and mouse-look (used during dialogue)
  stop() {
    this.moveForward = this.moveBackward = this.moveLeft = this.moveRight = false;
    this.velocity.set(0, 0, 0);
    this.instance.enabled = false;
  }

  onKeyDown(event) {
    //if (!this.inputEnabled) return;

    switch (event.code) {
      case 'ArrowUp': case 'KeyW': this.moveForward = true; break;
      case 'ArrowLeft': case 'KeyA': this.moveLeft = true; break;
      case 'ArrowDown': case 'KeyS': this.moveBackward = true; break;
      case 'ArrowRight': case 'KeyD': this.moveRight = true; break;
    }
  }

  onKeyUp(event) {
    switch (event.code) {
      case 'ArrowUp': case 'KeyW': this.moveForward = false; break;
      case 'ArrowLeft': case 'KeyA': this.moveLeft = false; break;
      case 'ArrowDown': case 'KeyS': this.moveBackward = false; break;
      case 'ArrowRight': case 'KeyD': this.moveRight = false; break;
    }
  }

  updateFloorHeight(delta) {
    const room = this.level.room;
    if (!room) return;

    const pos = this.camera.position;
    this._rayOrigin.set(pos.x, pos.y + this.floorProbeLift, pos.z);
    this._raycaster.set(this._rayOrigin, this._downVec);
    this._raycaster.far = this.maxRayDistance;

    const hits = this._raycaster.intersectObject(room, true);

    // hits[0] is not necessarily the floor. The probe is lifted above the
    // camera, so in any space with less headroom than eyeHeight + that lift the
    // probe starts *above* the ceiling — and because every level material is
    // DoubleSide, the ray reports the ceiling's top face as the nearest hit.
    // Trusting hits[0] there floors the player onto the roof, and it is
    // self-sustaining: rising lifts the probe further above the ceiling, so the
    // same surface keeps being picked. This is what launched Voss out of the
    // lift cabin in controlroom.glb, whose ceiling tops out at y=3.50.
    //
    // The floor you stand on is always below your eyes and faces up, so filter
    // on that. Hits stay sorted by distance, so find() takes the nearest valid
    // one — the highest walkable surface under the camera, as before.
    const floor = hits.find(
      (hit) => hit.point.y < pos.y - this.floorEpsilon && this._facesUp(hit)
    );
    if (!floor) return;

    const targetY = floor.point.y + this.eyeHeight;
    pos.y += (targetY - pos.y) * Math.min(1, this.floorSmoothing * delta);
  }

  // World-space upward normal for a raycast hit. Geometry normals are not
  // flipped for backfaces, so under DoubleSide this cleanly separates the top
  // of a slab (walkable) from its underside (not).
  _facesUp(hit) {
    if (!hit.face) return false;
    this._hitNormal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    return this._hitNormal.y > 0;
  }

  // Clamps an intended movement distance along `dir` so the camera stops
  // collisionRadius short of any wall in that direction. dir must be a
  // unit vector; distance can be negative (moving backward along dir).
  _clampMovement(dir, distance) {
    const room = this.level.room;
    if (!room || distance === 0) return distance;

    const sign = Math.sign(distance);
    const travel = Math.abs(distance);

    this._raycaster.set(this.camera.position, dir.clone().multiplyScalar(sign));
    this._raycaster.far = this.collisionRadius + travel;

    const hits = this._raycaster.intersectObject(room, true);
    if (hits.length && hits[0].distance < this.collisionRadius + travel) {
      const allowed = Math.max(0, hits[0].distance - this.collisionRadius);
      return allowed * sign;
    }
    return distance;
  }

  update(delta) {
    if (!this.instance.isLocked) return;

    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * this.speed * delta;
    if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * this.speed * delta;

    this._matCol.setFromMatrixColumn(this.camera.matrix, 0);
    this._rightDir.copy(this._matCol);
    this._forwardDir.crossVectors(this.camera.up, this._matCol);

    let rightDist = -this.velocity.x * delta;
    let forwardDist = -this.velocity.z * delta;

    rightDist = this._clampMovement(this._rightDir, rightDist);
    forwardDist = this._clampMovement(this._forwardDir, forwardDist);

    this.instance.moveRight(rightDist);
    this.instance.moveForward(forwardDist);

    const pos = this.camera.position;
    if (this.level.bounds) {
      if (pos.x < this.level.bounds.minX) pos.x = this.level.bounds.minX + 0.5;
      if (pos.x > this.level.bounds.maxX) pos.x = this.level.bounds.maxX - 0.5;
      if (pos.z < this.level.bounds.minZ) pos.z = this.level.bounds.minZ + 0.5;
      if (pos.z > this.level.bounds.maxZ) pos.z = this.level.bounds.maxZ - 0.5;
    }

    this.updateFloorHeight(delta);

    // Y bounds — clamp after floor-following so a bad raycast (gap/miss)
    // can't push the camera outside the room's vertical extent
    if (this.level.bounds) {
      const minY = this.level.bounds.minY + this.eyeHeight;
      const maxY = this.level.bounds.maxY - 0.3; // headroom under ceiling
      if (pos.y < minY) pos.y = minY;
      if (pos.y > maxY) pos.y = maxY;
    }
  }
}
