import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Player } from '../entities/Player.js';
import { Physics } from './Physics.js';

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

// Walking with physics, as in Levels 2 and 3 (player/PlayerController.js): a capsule moved by
// Rapier's character controller, with gravity, jumping, running and crouching. The numbers are
// PlayerController's, at Level 1's size (K).
const K = LEVEL1_SCALE;
const P = {
  RADIUS: 0.5,                     // (the old wall distance: the cell's gaps were made for it)
  HEIGHT: 2.75,                    // (not 1.8 * K: the rooms were built for eyes at 2.6 and nothing over
                                   // them, and the cell's doorway is only 3 high)
  EYE: 2.6,
  CROUCH_HEIGHT: 2.75 * 1.35 / 1.8,
  CROUCH_EYE: 1.19 * K,
  CROUCH_EASE: 12,
  WALK: 6.0 * K,
  SPRINT: 9.0 * K,
  CROUCH: 2.6 * K,
  CROUCH_SPRINT: 9.0 * 0.75 * K,
  GRAVITY: 25.0 * K,
  FALL_GRAVITY: 1.4,
  JUMP: 8.94 * K,                  // a 1.6 m jump, at Level 1's size
  TERMINAL: 40.0 * K,
  COYOTE: 0.12,
  JUMP_BUFFER: 0.12,
  STEP: 0.62 * K,                  // walks up stairs and low ledges without jumping
  SNAP: 0.35 * K
};

export class Controls {
  constructor(camera, domElement, currentLevel, { viewLocked = false } = {}) {
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

    // Physics (once Rapier has loaded and the room is built; until then the walk below, without it)
    this.physics = null;
    this.keys = { sprint: false, crouch: false, jumpHeld: false };
    this.jumpBuffer = 0;
    this.coyote = 0;
    this.grounded = false;
    this.crouched = false;
    this.height = P.HEIGHT;
    this.eye = P.EYE;
    this.feet = new THREE.Vector3();
    this.vel = new THREE.Vector3();      // (velocity is the old walk's)
    this.lastSafe = new THREE.Vector3();
    this._safeTimer = 0;
    this._renderY = null;
    this._placed = new THREE.Vector3();  // where physics last put the camera: anything else moving it is a teleport
    this._hasPlaced = false;
    this._worldLevel = null;
    this._moving = [];
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._wish = new THREE.Vector3();

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
    this.viewLocked = viewLocked;
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
    this.keys.sprint = this.keys.crouch = this.keys.jumpHeld = false;
    this.velocity.set(0, 0, 0);
    this.vel.x = this.vel.z = 0;
    this.instance.enabled = false;
  }

  onKeyDown(event) {
    //if (!this.inputEnabled) return;

    switch (event.code) {
      case 'ArrowUp': case 'KeyW': this.moveForward = true; break;
      case 'ArrowLeft': case 'KeyA': this.moveLeft = true; break;
      case 'ArrowDown': case 'KeyS': this.moveBackward = true; break;
      case 'ArrowRight': case 'KeyD': this.moveRight = true; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.sprint = true; break;
      case 'KeyC': this.keys.crouch = true; break;
      case 'Space':
        if (!event.repeat) this.jumpBuffer = P.JUMP_BUFFER;
        this.keys.jumpHeld = true;
        break;
      case 'KeyV':
        if (!event.repeat && this.instance.enabled && !this.viewLocked) this.setView(this.view === 'third' ? 'first' : 'third');
        break;
    }
  }

  setView(view) {
    if (this._disposed || (this.viewLocked && view !== 'first')) return;
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

  // Let the world cover his arms for a while, instead of their being drawn over it (_armsOnTop).
  // For a scripted reach that puts his hand through something and behind it - the cell door's
  // broken window - being hidden is the whole point of the shot.
  armsBehindWorld(on) {
    this._armsBehind = !!on;
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
  // stay as they are.) armsBehindWorld() turns the clear off where that is the wrong answer.
  _armsOnTop(viewModel) {
    let cleared = -1;
    const clearOnce = (renderer) => {
      if (renderer.info.render.frame === cleared) return;
      cleared = renderer.info.render.frame;
      renderer.state.buffers.depth.setMask(true);   // (glass drawn just before leaves it off: no clear)
      if (!this._armsBehind) renderer.clearDepth();
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
  // walks and walks as fast as he goes. False when there was nothing to do (no body yet, or no time
  // passed): his clips did not run, so nothing may be posed on top of them this frame either.
  updateBody(delta) {
    if (!this.character?.ready || delta <= 0) return false;
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
    const phys = !!this.physics;
    this.body.position.set(eye.x, phys ? this._renderY : eye.y - this.eyeHeight, eye.z);
    this.body.rotation.y = this._facing;
    this.character.update(delta, {
      crouch: phys ? (P.EYE - this.eye) / (P.EYE - P.CROUCH_EYE) : 0,
      running: phys && this.keys.sprint && !this.crouched,
      grounded: phys ? this.grounded : true,
      speed: this._speed,
      verticalSpeed: phys ? this.vel.y : 0,
      camera: this.camera,
      bodyYaw: this._facing
    });
    return true;
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
    this._freeWorld();
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
      case 'ShiftLeft': case 'ShiftRight': this.keys.sprint = false; break;
      case 'KeyC': this.keys.crouch = false; break;
      case 'Space': this.keys.jumpHeld = false; break;
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
    this._ensureWorld();
    if (this.physics) return this._updatePhysics(delta);
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

  // ---------------------------------------------------------------------------------------------
  // Physics
  // ---------------------------------------------------------------------------------------------

  // A new level (the game's start, or a restart): its own physics world, once its room is in
  _ensureWorld() {
    const level = this.level;
    if (!level || this._disposed || this._worldLevel === level) return;
    this._worldLevel = level;
    this._freeWorld();
    Promise.all([Physics.create(), Promise.resolve(level.ready)]).then(([physics]) => {
      if (this._worldLevel !== level || this._disposed || !level.room) { physics.dispose(); return; }
      this._buildWorld(physics, level);
    }).catch((e) => console.warn('Level 1: no physics; walking without it.', e));
  }

  // The room is one static collider, except what moves: the cell door (its leaf, handle and the
  // filler in its window), the window's glass (gone once broken) and the lift's doors. Those
  // follow their meshes each frame.
  _buildWorld(physics, level) {
    const room = level.room;
    const moving = new Set();
    const addTree = (o) => o?.traverse((m) => { if (m.isMesh) moving.add(m); });
    addTree(level.doorPivot);
    addTree(level.window?.glass);
    addTree(level.window?.source);
    for (const action of level.doorActions || []) {
      for (const track of action.getClip().tracks) {
        addTree(room.getObjectByName(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
      }
    }
    // Left out of the static collider too: the glass shards (debris, hidden in the window until it
    // breaks) and anything else hidden (the filler in the door's window is hidden but moves, so it
    // is one of the moving ones and still blocks)
    const shards = new Set(level._shards || []);
    physics.addStaticObject(room, (m) => moving.has(m) || shards.has(m) || !m.visible,
      { oriented: false });   // (its faces point every which way)
    this._moving = [...moving].map((mesh) => this._movingCollider(physics, mesh)).filter(Boolean);
    physics.step(1 / 60);       // (new colliders only answer rays after a step: the floor below him is found next)

    const R = physics.RAPIER;
    this.body_rb = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    this.collider = physics.world.createCollider(R.ColliderDesc.capsule((P.HEIGHT - P.RADIUS * 2) / 2, P.RADIUS), this.body_rb);
    const kcc = physics.world.createCharacterController(0.02);
    kcc.setUp({ x: 0, y: 1, z: 0 });
    kcc.setSlideEnabled(true);
    kcc.enableAutostep(P.STEP, 0.15 * K, false);
    kcc.enableSnapToGround(P.SNAP);
    kcc.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    this.kcc = kcc;
    this.physics = physics;
    this.crouched = false;
    this.height = P.HEIGHT;
    this.eye = P.EYE;
    this._teleportToCamera();
  }

  // A kinematic body for a mesh that moves: its triangles in its own space (scale baked in)
  _movingCollider(physics, mesh) {
    const pos = mesh.geometry?.attributes.position;
    if (!pos) return null;
    mesh.updateWorldMatrix(true, false);
    mesh.matrixWorld.decompose(this._p, this._q, this._s);
    const verts = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      verts[i * 3] = pos.getX(i) * this._s.x;
      verts[i * 3 + 1] = pos.getY(i) * this._s.y;
      verts[i * 3 + 2] = pos.getZ(i) * this._s.z;
    }
    const index = mesh.geometry.index;
    const indices = index ? Uint32Array.from(index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
    if (indices.length < 3) return null;
    const R = physics.RAPIER;
    const body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(this._p.x, this._p.y, this._p.z)
      .setRotation({ x: this._q.x, y: this._q.y, z: this._q.z, w: this._q.w }));
    physics.world.createCollider(R.ColliderDesc.trimesh(verts, indices), body);
    return { mesh, body };
  }

  // Each frame the moving colliders follow their meshes (one taken out of the room, like the
  // broken glass, loses its collider)
  _syncMoving() {
    const room = this.level.room;
    for (const m of this._moving) {
      if (!m.body) continue;
      let o = m.mesh;
      while (o && o !== room) o = o.parent;
      if (!o) {
        this.physics.world.removeRigidBody(m.body);
        m.body = null;
        continue;
      }
      m.mesh.updateWorldMatrix(true, false);
      m.mesh.matrixWorld.decompose(this._p, this._q, this._s);
      m.body.setNextKinematicTranslation({ x: this._p.x, y: this._p.y, z: this._p.z });
      m.body.setNextKinematicRotation({ x: this._q.x, y: this._q.y, z: this._q.z, w: this._q.w });
    }
  }

  _freeWorld() {
    if (!this.physics) return;
    this.kcc?.free();
    this.physics.dispose();
    this.physics = null;
    this.kcc = null;
    this._moving = [];
    this._hasPlaced = false;
  }

  // Put the capsule under the camera (the game moved it: the spawn, a checkpoint, a restart), on
  // the floor below it if there is one near: the game's eye heights are not exactly his, and a
  // capsule started inside the floor stays stuck in it
  _teleportToCamera() {
    const c = this.camera.position;
    this.feet.set(c.x, c.y - this.eye, c.z);
    const floor = this.physics.castRay(c, this._downVec, this.eye + 1.5);
    if (floor !== null) this.feet.y = c.y - floor + 0.02;
    this.lastSafe.copy(this.feet);
    this.vel.set(0, 0, 0);
    this._renderY = null;
    const p = { x: this.feet.x, y: this.feet.y + this.height / 2, z: this.feet.z };
    this.body_rb.setTranslation(p, true);
    this.body_rb.setNextKinematicTranslation(p);
    this.physics.world.propagateModifiedBodyPositionsToColliders();
  }

  _setCrouched(on) {
    this.crouched = on;
    this.height = on ? P.CROUCH_HEIGHT : P.HEIGHT;
    this.collider.setHalfHeight((this.height - P.RADIUS * 2) / 2);
    const p = { x: this.feet.x, y: this.feet.y + this.height / 2, z: this.feet.z };
    this.body_rb.setTranslation(p, true);
    this.body_rb.setNextKinematicTranslation(p);
    this.physics.world.propagateModifiedBodyPositionsToColliders();
  }

  // Is there room to stand up? Sweeps a ball from the crouched head up to the standing head.
  _canStand() {
    const R = this.physics.RAPIER;
    const f = this.feet;
    const hit = this.physics.world.castShape(
      { x: f.x, y: f.y + P.CROUCH_HEIGHT - P.RADIUS, z: f.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 1, z: 0 },
      new R.Ball(P.RADIUS * 0.9), 0, P.HEIGHT - P.CROUCH_HEIGHT, true, R.QueryFilterFlags.EXCLUDE_KINEMATIC
    );
    return hit === null;
  }

  // One frame of walking with physics (PlayerController.update, at Level 1's size)
  _updatePhysics(delta) {
    const dt = Math.min(delta, 0.05);
    if (dt <= 0) return;
    const cam = this.camera.position;
    if (!this._hasPlaced || cam.distanceToSquared(this._placed) > 1e-4) this._teleportToCamera();
    this._syncMoving();
    const k = this.keys;
    const canMove = this.instance.isLocked && this.instance.enabled;

    // Which way he wants to go, relative to where the camera looks
    this._rightDir.setFromMatrixColumn(this.camera.matrix, 0).setY(0).normalize();
    this._forwardDir.crossVectors(this.camera.up, this._rightDir);
    this._wish.set(0, 0, 0);
    if (canMove) {
      if (this.moveForward) this._wish.add(this._forwardDir);
      if (this.moveBackward) this._wish.sub(this._forwardDir);
      if (this.moveRight) this._wish.add(this._rightDir);
      if (this.moveLeft) this._wish.sub(this._rightDir);
    }
    if (this._wish.lengthSq() > 0) this._wish.normalize();

    // Crouch while C is held (only from the ground); stand again once there is room overhead
    if (k.crouch && canMove && this.grounded && !this.crouched) this._setCrouched(true);
    else if ((!k.crouch || !canMove) && this.crouched && this._canStand()) this._setCrouched(false);

    const speed = this.crouched ? (k.sprint ? P.CROUCH_SPRINT : P.CROUCH) : k.sprint ? P.SPRINT : P.WALK;
    const ease = 1 - Math.exp(-(this.grounded ? 14 : 4) * dt);
    this.vel.x += (this._wish.x * speed - this.vel.x) * ease;
    this.vel.z += (this._wish.z * speed - this.vel.z) * ease;

    // Jumping: coyote time, buffered presses, and a shorter hop if Space is let go early
    this.coyote = this.grounded ? P.COYOTE : this.coyote - dt;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0 && canMove && this.crouched && this._canStand()) this._setCrouched(false);
    if (this.jumpBuffer > 0 && this.coyote > 0 && canMove && !this.crouched) {
      this.vel.y = P.JUMP;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.character?.jumped?.();
    }
    if (!k.jumpHeld && this.vel.y > 0) this.vel.y *= Math.exp(-14 * dt);
    this.vel.y -= P.GRAVITY * (this.vel.y < 0 ? P.FALL_GRAVITY : 1) * dt;
    if (this.vel.y < -P.TERMINAL) this.vel.y = -P.TERMINAL;

    // Ask the character controller where he can actually go
    this.kcc.computeColliderMovement(this.collider, { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt });
    const mv = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.vel.y < 0) this.vel.y = -1;
    if (this.vel.y > 0 && mv.y < this.vel.y * dt * 0.5) this.vel.y = 0;      // bumped a ceiling
    const t = this.body_rb.translation();
    this.body_rb.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    this.physics.step(dt);
    const n = this.body_rb.translation();
    this.feet.set(n.x, n.y - this.height / 2, n.z);

    // The last place he stood safely; falling out of the room brings him back there
    this._safeTimer += dt;
    if (this.grounded && this._safeTimer > 0.4) {
      this._safeTimer = 0;
      this.lastSafe.copy(this.feet);
    }
    if (this.level.bounds && this.feet.y < this.level.bounds.minY - 10) {
      cam.set(this.lastSafe.x, this.lastSafe.y + this.eye, this.lastSafe.z);
      this._teleportToCamera();
    }

    // The eyes: they sink when crouching, and ease up a step instead of jumping up it
    this.eye += ((this.crouched ? P.CROUCH_EYE : P.EYE) - this.eye) * (1 - Math.exp(-P.CROUCH_EASE * dt));
    if (this._renderY === null || Math.abs(this.feet.y - this._renderY) > 1.0 * K) this._renderY = this.feet.y;
    else this._renderY += (this.feet.y - this._renderY) * (1 - Math.exp(-16 * dt));
    cam.set(this.feet.x, this._renderY + this.eye, this.feet.z);
    this._placed.copy(cam);
    this._hasPlaced = true;
  }
}
