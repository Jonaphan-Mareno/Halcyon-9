import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// The player for the physics levels (level 2 onwards): a kinematic capsule moved
// by Rapier's character controller, so it walks up stairs, slides along walls and
// stands on moving platforms. Mouse looks, WASD moves, Shift runs, Space jumps,
// V switches between first and third person.
//
// Sizes are metres: Voss is 1.8 m tall. A standing jump rises about 1.4 m and a
// running jump clears about 4 m.

const RADIUS = 0.35;
const HEIGHT = 1.8;
const EYE = 1.62;

const WALK_SPEED = 6.0;
const SPRINT_SPEED = 9.0;
const GRAVITY = 25.0;
const FALL_GRAVITY = 1.4;     // falling is a little heavier than rising, so jumps feel snappy
const JUMP_SPEED = 8.4;       // sqrt(2 * 25 * 1.4) = a 1.4 m jump
const TERMINAL_SPEED = 40.0;
const COYOTE = 0.12;          // still allowed to jump this long after walking off a ledge
const JUMP_BUFFER = 0.12;     // a jump pressed this early before landing still counts
const FALL_LIMIT = -12;       // below this the player has fallen out of the world

const THIRD_PERSON_DISTANCE = 4.2;

export class PlayerController {
  constructor(camera, domElement, scene) {
    this.camera = camera;
    this.instance = new PointerLockControls(camera, domElement);
    this.enabled = true;
    this.ready = false;

    this.view = 'third';
    this.viewLocked = false;     // true inside the crew quarters, where the camera network does not reach
    this.onViewChange = null;
    this.onRespawn = null;

    this.keys = { forward: false, back: false, left: false, right: false, sprint: false, jumpHeld: false };
    this.jumpBuffer = 0;

    this.position = new THREE.Vector3(); // feet
    this.velocity = new THREE.Vector3(); // horizontal x/z and vertical y
    this.coyote = 0;
    this.grounded = false;
    this.facing = 0;                     // body yaw
    this.lastSafe = new THREE.Vector3();
    this._safeTimer = 0;
    this._camDistance = THIRD_PERSON_DISTANCE;

    // A placeholder body until Voss's model is ready
    this.body = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.7 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(RADIUS, HEIGHT - RADIUS * 2, 6, 12), skin);
    torso.position.y = HEIGHT / 2;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x111418, emissive: 0x2fd0ff, emissiveIntensity: 0.9 }));
    visor.position.set(0, EYE - 0.02, -RADIUS + 0.04);
    this.body.add(torso, visor);
    scene.add(this.body);

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
    this._pivot = new THREE.Vector3();
    this._camDir = new THREE.Vector3();

    document.addEventListener('keydown', (e) => this._onKeyDown(e));
    document.addEventListener('keyup', (e) => this._onKeyUp(e));
  }

  // Called once the physics world and the level's colliders exist
  attach(physics, spawn, yaw = 0) {
    const R = physics.RAPIER;
    this.physics = physics;
    this.body_rb = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    const half = (HEIGHT - RADIUS * 2) / 2;
    this.collider = physics.world.createCollider(R.ColliderDesc.capsule(half, RADIUS), this.body_rb);

    const kcc = physics.world.createCharacterController(0.02);
    kcc.setUp({ x: 0, y: 1, z: 0 });
    kcc.setSlideEnabled(true);
    kcc.enableAutostep(0.45, 0.15, false);       // walks up stair treads
    kcc.enableSnapToGround(0.35);                // stays glued to stairs and ramps going down
    kcc.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    this.kcc = kcc;

    this.teleport(spawn);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(0, yaw, 0);
    this.facing = yaw;
    this.ready = true;
  }

  teleport(p) {
    this.position.copy(p);
    this.lastSafe.copy(p);
    this.velocity.set(0, 0, 0);
    this.body_rb.setTranslation({ x: p.x, y: p.y + HEIGHT / 2, z: p.z }, true);
    this.body_rb.setNextKinematicTranslation({ x: p.x, y: p.y + HEIGHT / 2, z: p.z });
  }

  lock() {
    this.instance.lock();
  }

  // Freeze movement and mouse-look (used for menus and dialogue)
  stop() {
    this.keys.forward = this.keys.back = this.keys.left = this.keys.right = false;
    this.keys.sprint = this.keys.jumpHeld = false;
    this.velocity.x = this.velocity.z = 0;
    this.instance.enabled = false;
  }

  setView(view) {
    if (view === this.view) return;
    this.view = view;
    this.onViewChange?.(view);
  }

  _onKeyDown(e) {
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': this.keys.forward = true; break;
      case 'ArrowLeft': case 'KeyA': this.keys.left = true; break;
      case 'ArrowDown': case 'KeyS': this.keys.back = true; break;
      case 'ArrowRight': case 'KeyD': this.keys.right = true; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.sprint = true; break;
      case 'Space':
        e.preventDefault();
        if (!e.repeat) this.jumpBuffer = JUMP_BUFFER;
        this.keys.jumpHeld = true;
        break;
      case 'KeyV':
        if (!e.repeat && !this.viewLocked) this.setView(this.view === 'third' ? 'first' : 'third');
        break;
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': this.keys.forward = false; break;
      case 'ArrowLeft': case 'KeyA': this.keys.left = false; break;
      case 'ArrowDown': case 'KeyS': this.keys.back = false; break;
      case 'ArrowRight': case 'KeyD': this.keys.right = false; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.sprint = false; break;
      case 'Space': this.keys.jumpHeld = false; break;
    }
  }

  // `canMove` is false while the player is frozen (e.g. the wake-up blink)
  update(delta, canMove = true) {
    if (!this.ready) return;
    const dt = Math.min(delta, 0.05);
    const k = this.keys;

    // Which way the player wants to go, relative to where the camera looks
    const yaw = this.camera.rotation.y;
    this._fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    this._right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    this._wish.set(0, 0, 0);
    if (canMove && this.instance.isLocked) {
      if (k.forward) this._wish.add(this._fwd);
      if (k.back) this._wish.sub(this._fwd);
      if (k.right) this._wish.add(this._right);
      if (k.left) this._wish.sub(this._right);
    }
    const moving = this._wish.lengthSq() > 0;
    if (moving) this._wish.normalize();

    // Horizontal velocity eases toward the wanted velocity; quicker on the ground
    const speed = k.sprint ? SPRINT_SPEED : WALK_SPEED;
    const ease = 1 - Math.exp(-(this.grounded ? 14 : 4) * dt);
    this.velocity.x += (this._wish.x * speed - this.velocity.x) * ease;
    this.velocity.z += (this._wish.z * speed - this.velocity.z) * ease;

    // Jumping: coyote time, buffered presses, and a shorter hop if Space is let go early
    this.coyote = this.grounded ? COYOTE : this.coyote - dt;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0 && canMove) {
      this.velocity.y = JUMP_SPEED;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
    }
    if (!k.jumpHeld && this.velocity.y > 0) this.velocity.y *= Math.exp(-14 * dt);

    this.velocity.y -= GRAVITY * (this.velocity.y < 0 ? FALL_GRAVITY : 1) * dt;
    if (this.velocity.y < -TERMINAL_SPEED) this.velocity.y = -TERMINAL_SPEED;

    // Ask the character controller where we can actually go
    this.kcc.computeColliderMovement(this.collider, {
      x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt
    });
    const mv = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.velocity.y < 0) this.velocity.y = -1;       // stay glued to the floor
    if (this.velocity.y > 0 && mv.y < this.velocity.y * dt * 0.5) this.velocity.y = 0; // bumped a ceiling

    const t = this.body_rb.translation();
    this.body_rb.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    this.physics.step(dt);
    const n = this.body_rb.translation();
    this.position.set(n.x, n.y - HEIGHT / 2, n.z);

    // Remember the last place the player stood still and safe; falling out of the world returns there
    this._safeTimer += dt;
    if (this.grounded && this._safeTimer > 0.4) {
      this._safeTimer = 0;
      this.lastSafe.copy(this.position);
    }
    if (this.position.y < FALL_LIMIT) {
      this.teleport(this.lastSafe);
      this.onRespawn?.();
    }

    this._placeBodyAndCamera(dt, moving);
  }

  _placeBodyAndCamera(dt, moving) {
    const third = this.view === 'third';
    this.body.visible = third;

    if (moving) {
      // Turn the body toward where it is walking
      const target = Math.atan2(-this._wish.x, -this._wish.z);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-12 * dt));
    }
    this.body.position.copy(this.position);
    this.body.rotation.y = this.facing;

    const cam = this.camera;
    if (!third) {
      cam.position.set(this.position.x, this.position.y + EYE, this.position.z);
      return;
    }

    // Behind and slightly over the right shoulder. A ray from the player keeps the camera
    // from pushing through walls: it moves in at once and eases back out.
    cam.getWorldDirection(this._camDir);
    this._pivot.set(this.position.x, this.position.y + EYE + 0.15, this.position.z);
    this._pivot.addScaledVector(this._right.set(Math.cos(cam.rotation.y), 0, -Math.sin(cam.rotation.y)), 0.45);

    const back = this._camDir.clone().negate();
    const hit = this.physics.castRay(this._pivot, back, THIRD_PERSON_DISTANCE + 0.3);
    const allowed = hit === null ? THIRD_PERSON_DISTANCE : Math.max(0.5, hit - 0.3);
    this._camDistance = allowed < this._camDistance
      ? allowed
      : this._camDistance + (allowed - this._camDistance) * (1 - Math.exp(-6 * dt));
    cam.position.copy(this._pivot).addScaledVector(back, this._camDistance);
  }
}
