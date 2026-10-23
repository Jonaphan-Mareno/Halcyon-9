import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Player } from '../entities/Player.js';

// Level 1 is built bigger than the physics levels: its eyes are at eyeHeight (2.6) where Voss's
// are at 1.62 m, so his body and the third-person camera are scaled up by this much
const LEVEL1_SCALE = 2.6 / 1.62;
// The third-person camera (in Voss's metres, like PlayerController's): behind and over his right shoulder
const THIRD_DISTANCE = 3.4;
const THIRD_SHOULDER = 0.45;
const THIRD_LIFT = 0.15;
// Level 1's own shader lights the rooms; his body (three.js materials) gets the same lights copied
// onto three.js ones each frame. The shader's falloff is I / (1 + d + d^2 / 2), three's I / d^2,
// and three's diffuse is divided by pi: these bring them to about the same brightness
const BODY_LIGHT_GAIN = 2 * Math.PI;
const BODY_AMBIENT_GAIN = 1.0;
const BODY_LIGHTS = 9;             // Level 1's MAX_LIGHTS
const HIDDEN_LAYER = 31;           // the room's exported lights go here, out of the camera's sight

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
    // How far above his own feet Voss can be pulled in one go. He cannot jump
    // in level 1, so anything taller than a step is not a floor he walked onto.
    this.maxStepUp = 0.45;

    // Wall collision
    this.collisionRadius = 0.5; // how close the camera can get to a wall

    this._raycaster = new THREE.Raycaster();
    this._downVec = new THREE.Vector3(0, -1, 0);
    this._rayOrigin = new THREE.Vector3();
    this._hitNormal = new THREE.Vector3();
    this._matCol = new THREE.Vector3(); // local X column of camera matrix
    this._rightDir = new THREE.Vector3();
    this._forwardDir = new THREE.Vector3();

    // V switches between first and third person. The camera stays at Voss's eyes for all of the
    // game's logic (reach, triggers, puzzles and the keypad all read it, and some save it to come
    // back to); for drawing the frame, and for what is under the crosshair, beginThirdPerson()
    // moves it behind him and endThirdPerson() puts it straight back.
    this.view = 'first';
    this.character = null;           // Voss: his body (third person) and his arms (first person)
    this.body = new THREE.Group();
    this.body.visible = false;
    this._eye = new THREE.Vector3();
    this._lastEye = null;
    this._facing = 0;
    this._speed = 0;
    this._displaced = false;
    this._camDistance = THIRD_DISTANCE * LEVEL1_SCALE;
    this._camDir = new THREE.Vector3();
    this._pivot = new THREE.Vector3();
    if (import.meta.env.DEV) window.__controls = this; // for poking at from the dev console
    this._loadBody();

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
      case 'KeyV':
        if (!event.repeat && this.instance.enabled) this.setView(this.view === 'third' ? 'first' : 'third');
        break;
    }
  }

  setView(view) {
    if (this._disposed) return;
    this.view = view;
    if (!this.character) this._loadBody();
    if (this.character.ready) this.character.setMode(view);
  }

  // The first-person arms show in plain play only (not over a puzzle, the keypad or a camera move)
  showArms(allowed) {
    const vm = this.character?.viewModel;
    if (vm) vm.visible = !!allowed && this.view === 'first' && this.character.ready;
  }

  // A click with nothing in hand: the right arm reaches out
  reach() {
    this.character?.reach();
  }

  _loadBody() {
    const scene = this.level?.scene;
    if (!scene) return;
    this.character = new Player(scene);
    this.character.scale *= LEVEL1_SCALE;
    scene.add(this.body);
    this._bodyLights = Array.from({ length: BODY_LIGHTS }, () => new THREE.PointLight(0xffffff, 0, 0, 2));
    this._bodyHemi = new THREE.HemisphereLight(0xffffff, 0xffffff, BODY_AMBIENT_GAIN);
    scene.add(this._bodyHemi);
    for (const l of this._bodyLights) scene.add(l);
    this.character.load().then(() => {
      if (this._disposed) return;
      this.character.setMode(this.view);
      this.body.add(this.character.body);
      this._armsOnTop(this.character.viewModel);
    }).catch((e) => console.warn('Level 1: Voss failed to load; staying in first person.', e));
  }

  // The first-person arms reach further than the camera keeps from a wall, so they are drawn after
  // everything else (glass included: they go in the transparent list, last), over a cleared depth
  // buffer: they never sink into a wall or a door. (Their own copies of the materials: the body's
  // stay as they are.)
  _armsOnTop(viewModel) {
    let cleared = -1;
    const clearOnce = (renderer) => {
      if (renderer.info.render.frame === cleared) return;
      cleared = renderer.info.render.frame;
      renderer.state.buffers.depth.setMask(true);   // (glass drawn just before leaves it off: no clear)
      renderer.clearDepth();
    };
    viewModel.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.blending = THREE.NoBlending;   // (drawn as solid as before: the texture's alpha is no see-through)
      o.renderOrder = 1000;
      o.onBeforeRender = clearOnce;
    });
  }

  // Each frame while he can move (after update): his body stands under the eyes, turns the way he
  // walks and walks as fast as he goes
  updateBody(delta) {
    if (!this.character?.ready || delta <= 0) return;
    const eye = this.camera.position;
    if (!this._lastEye) this._lastEye = eye.clone();
    const dx = eye.x - this._lastEye.x, dz = eye.z - this._lastEye.z;
    this._lastEye.copy(eye);
    const step = Math.hypot(dx, dz);
    const speed = step > 2 ? 0 : step / delta;     // (a teleport is not a walk)
    this._speed += (speed - this._speed) * (1 - Math.exp(-12 * delta));
    if (speed > 0.3 && step <= 2) {
      let d = Math.atan2(-dx, -dz) - this._facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this._facing += d * (1 - Math.exp(-12 * delta));
    }
    this._copyLevelLights();
    this.body.position.set(eye.x, eye.y - this.eyeHeight, eye.z);
    this.body.rotation.y = this._facing;
    this.character.update(delta, {
      grounded: true, speed: this._speed, verticalSpeed: 0, camera: this.camera, bodyYaw: this._facing
    });
  }

  // The lights Level 1's shader is using this frame (set by its update), onto his body's lights.
  // The room's exported three.js lights are kept off the camera's layer: they are only markers for
  // the shader (their strengths are the export's watts), and would burn his body white.
  _copyLevelLights() {
    const level = this.level;
    if (level.room && this._lightsHiddenFor !== level.room) {
      this._lightsHiddenFor = level.room;
      level.room.traverse((o) => { if (o.isLight) o.layers.set(HIDDEN_LAYER); });
    }
    const count = level._shared?.numLights.value ?? 0;
    for (let i = 0; i < this._bodyLights.length; i++) {
      const light = this._bodyLights[i];
      const cone = level._lightCones?.[i];
      // (the torch is a spot at his eyes, pointing away from him: left out. Unused lights are put
      // out rather than hidden: a change in the number of lights would recompile his materials)
      if (!(i < count && cone && cone.x < -1.5)) { light.intensity = 0; continue; }
      light.position.copy(level._lightWorldPositions[i]);
      light.color.copy(level._lightWorldColors[i]);
      light.intensity = level._lightWorldIntensities[i] * BODY_LIGHT_GAIN;
    }
    if (level._hemiSky) {
      this._bodyHemi.color.copy(level._hemiSky.value);
      this._bodyHemi.groundColor.copy(level._hemiGround.value);
    }
  }

  // Where Voss's eyes are, even while the camera is behind him
  get eyePosition() {
    return this._displaced ? this._eye : this.camera.position;
  }

  // Third person, until endThirdPerson(): the camera goes behind Voss ('render'), or onto the line
  // through the crosshair but level with him ('aim': picking then hits what the crosshair shows, and
  // reach is still measured from him). allowed: the game is in plain play (no puzzle, no camera move).
  // Returns whether the camera was moved.
  beginThirdPerson(allowed, mode = 'render') {
    if (!allowed || this.view !== 'third' || !this.character?.ready || this._displaced) return false;
    const cam = this.camera;
    const k = LEVEL1_SCALE;
    this._eye.copy(cam.position);
    cam.updateMatrixWorld();
    cam.getWorldDirection(this._camDir);
    this._rightDir.setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize();
    const room = this.level.room;

    // over the shoulder, not through a wall beside him
    let shoulder = THIRD_SHOULDER * k;
    if (room) {
      this._raycaster.set(this._eye, this._rightDir);
      this._raycaster.far = shoulder + 0.3 * k;
      const hit = this._raycaster.intersectObject(room, true)[0];
      if (hit) shoulder = Math.max(0, hit.distance - 0.3 * k);
    }
    this._pivot.copy(this._eye).addScaledVector(this._rightDir, shoulder);
    this._pivot.y += THIRD_LIFT * k;

    if (mode === 'render') {
      // back from there, in at once in front of a wall and easing back out
      const want = THIRD_DISTANCE * k;
      let allowedDist = want;
      if (room) {
        this._raycaster.set(this._pivot, this._forwardDir.copy(this._camDir).negate());
        this._raycaster.far = want + 0.3 * k;
        const hit = this._raycaster.intersectObject(room, true)[0];
        if (hit) allowedDist = Math.max(0.5 * k, hit.distance - 0.3 * k);
      }
      const now = performance.now();
      const dt = this._lastPlace ? Math.min((now - this._lastPlace) / 1000, 0.1) : 0;
      this._lastPlace = now;
      this._camDistance = allowedDist < this._camDistance
        ? allowedDist
        : this._camDistance + (allowedDist - this._camDistance) * (1 - Math.exp(-6 * dt));
      this._pivot.addScaledVector(this._camDir, -this._camDistance);
      this.body.visible = true;
    }
    cam.position.copy(this._pivot);
    cam.updateMatrixWorld();
    this._displaced = true;
    return true;
  }

  endThirdPerson() {
    if (!this._displaced) return;
    this.camera.position.copy(this._eye);
    this.camera.updateMatrixWorld();
    this.body.visible = false;
    this._displaced = false;
  }

  // Leaving level 1: his body goes with it
  disposeBody() {
    this._disposed = true;
    this.endThirdPerson();
    this.body.removeFromParent();
    for (const l of this._bodyLights || []) l.removeFromParent();
    this._bodyHemi?.removeFromParent();
    this.character?.viewModel.removeFromParent();
    this.character?.viewModel.traverse((o) => o.geometry?.dispose?.());
    this.body.traverse((o) => o.geometry?.dispose?.());
    this.character = null;
    this.view = 'first';
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
    // lift cabin in controlroom.glb, whose ceiling tops out at y=3.50 against
    // an interior height of only 3.35m.
    //
    // So snap to the ground instead of to whatever is nearest: the floor he is
    // standing on is the highest upward-facing surface within one step of his
    // feet. Descending stays unlimited, so drops and stairs still work, while
    // ceilings and tall props are never mistaken for floors — which also ends
    // the old "brush against a tank, get teleported on top of it" behaviour.
    // Hits come back sorted by distance, and the ray points down, so find()
    // yields the highest surface that passes.
    const feet = pos.y - this.eyeHeight;
    const floor = hits.find(
      (hit) => hit.point.y <= feet + this.maxStepUp && this._facesUp(hit)
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
