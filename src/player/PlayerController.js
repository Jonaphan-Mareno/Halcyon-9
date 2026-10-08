import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Player } from '../entities/Player.js';

// The player for the physics levels (level 2 onwards): a kinematic capsule moved
// by Rapier's character controller, so it walks up stairs, slides along walls and
// stands on moving platforms. Mouse looks, WASD moves, double-tapping W runs,
// Shift (held) crouches, Space jumps, V switches between first and third person. The body is Voss's model
// (entities/Player.js): hands only in first person, the whole body in third.
//
// Sizes are metres: Voss is 1.8 m tall. A standing jump rises about 1.6 m (so a 1.2 m cargo
// container is an easy climb) and a running jump clears about 4.5 m.

const RADIUS = 0.35;
const HEIGHT = 1.8;
const EYE = 1.62;
// Crouched: a shorter capsule, lower eyes, slower feet
const CROUCH_HEIGHT = 1.35;
const CROUCH_EYE = 1.19;
const CROUCH_SPEED = 2.6;
const CROUCH_EASE = 12;       // how fast the eyes sink and rise
const DOUBLE_TAP = 0.3;       // seconds between two W presses that start a run

const WALK_SPEED = 6.0;
const SPRINT_SPEED = 9.0;
const GRAVITY = 25.0;
const FALL_GRAVITY = 1.4;     // falling is a little heavier than rising, so jumps feel snappy
const JUMP_SPEED = 8.94;      // sqrt(2 * 25 * 1.6) = a 1.6 m jump
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

    this.view = 'first';
    this.viewLocked = false;     // true inside the crew quarters, where the camera network does not reach
    this.onViewChange = null;
    this.onRespawn = null;

    this.keys = { forward: false, back: false, left: false, right: false, sprint: false, crouch: false, jumpHeld: false };
    this._lastForwardTap = -Infinity;
    this.crouched = false;
    this.height = HEIGHT;                // current capsule height (shorter while crouched)
    this.eye = EYE;                      // current eye height; eases between standing and crouched
    this.jumpBuffer = 0;

    this.position = new THREE.Vector3(); // feet
    this.velocity = new THREE.Vector3(); // horizontal x/z and vertical y
    this.impulse = new THREE.Vector3();  // knockback, fades out on its own
    this.coyote = 0;
    this.grounded = false;
    this.facing = 0;                     // body yaw
    // Set by the level each frame: what Voss is standing on, and how he is held
    this.surface = 'normal';             // 'normal' | 'ice' (slippery, keeps momentum) | 'wade' (slow)
    this.slopeAccel = new THREE.Vector3(); // extra push downhill (sliding on an icy slope)
    this.aimFacing = false;              // true: the body turns to face where the camera aims
    this.speedScale = 1;
    this.camDist = THIRD_PERSON_DISTANCE;
    this.shoulder = 0.45;
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

    // Voss replaces the placeholder once his model has loaded
    this.character = new Player(scene);
    this.character.setMode(this.view);
    this.character.load().then(() => {
      this.body.remove(torso, visor);
      this.body.add(this.character.body);
    }).catch((e) => console.warn('Player model failed to load; keeping the placeholder.', e));
    if (import.meta.env.DEV) window.__player = this; // for poking at from the dev console

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
    kcc.enableAutostep(0.62, 0.15, false);       // walks up stair treads and low ledges (0.5 m) without jumping
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
    this.renderY = null;
    this.impulse.set(0, 0, 0);
    this.lastSafe.copy(p);
    this.velocity.set(0, 0, 0);
    this.body_rb.setTranslation({ x: p.x, y: p.y + this.height / 2, z: p.z }, true);
    this.body_rb.setNextKinematicTranslation({ x: p.x, y: p.y + this.height / 2, z: p.z });
  }

  lock() {
    this.instance.lock();
  }

  // Thrown back by a hit: away from `from`, and a little up
  knockback(from, strength = 9) {
    const dx = this.position.x - from.x;
    const dz = this.position.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    this.impulse.set((dx / len) * strength, 0, (dz / len) * strength);
    this.velocity.y = Math.max(this.velocity.y, 5);
  }

  // Bounce off something stomped on
  bounce(speed = 7.5) {
    this.velocity.y = speed;
    this.coyote = 0;
  }

  // Freeze movement and mouse-look (used for menus and dialogue)
  stop() {
    this.keys.forward = this.keys.back = this.keys.left = this.keys.right = false;
    this.keys.sprint = this.keys.crouch = this.keys.jumpHeld = false;
    this.velocity.x = this.velocity.z = 0;
    this.instance.enabled = false;
  }

  setView(view) {
    if (view === this.view) return;
    this.view = view;
    this.character.setMode(view);
    this.onViewChange?.(view);
  }

  _onKeyDown(e) {
    switch (e.code) {
      case 'ArrowUp': case 'KeyW':
        // A second press soon after the first starts a run that lasts while W is held
        if (!e.repeat) {
          const now = performance.now() / 1000;
          if (now - this._lastForwardTap < DOUBLE_TAP) this.keys.sprint = true;
          this._lastForwardTap = now;
        }
        this.keys.forward = true;
        break;
      case 'ArrowLeft': case 'KeyA': this.keys.left = true; break;
      case 'ArrowDown': case 'KeyS': this.keys.back = true; break;
      case 'ArrowRight': case 'KeyD': this.keys.right = true; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.crouch = true; break;
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
      case 'ArrowUp': case 'KeyW': this.keys.forward = this.keys.sprint = false; break;
      case 'ArrowLeft': case 'KeyA': this.keys.left = false; break;
      case 'ArrowDown': case 'KeyS': this.keys.back = false; break;
      case 'ArrowRight': case 'KeyD': this.keys.right = false; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.crouch = false; break;
      case 'Space': this.keys.jumpHeld = false; break;
    }
  }

  // Shrink or restore the capsule. The capsule stays centred on its body (the character
  // controller does not handle an offset collider), so the body itself is moved to keep
  // the feet where they are.
  _setCrouched(on) {
    this.crouched = on;
    this.height = on ? CROUCH_HEIGHT : HEIGHT;
    this.collider.setHalfHeight((this.height - RADIUS * 2) / 2);
    const p = this.position;
    this.body_rb.setTranslation({ x: p.x, y: p.y + this.height / 2, z: p.z }, true);
    this.body_rb.setNextKinematicTranslation({ x: p.x, y: p.y + this.height / 2, z: p.z });
    // The character controller reads the collider this frame, before the next physics step
    this.physics.world.propagateModifiedBodyPositionsToColliders();
  }

  // Is there room to stand up? Sweeps a ball from the crouched head up to the standing head.
  _canStand() {
    const R = this.physics.RAPIER;
    const p = this.position;
    const hit = this.physics.world.castShape(
      { x: p.x, y: p.y + CROUCH_HEIGHT - RADIUS, z: p.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 1, z: 0 },
      new R.Ball(RADIUS * 0.9), 0, HEIGHT - CROUCH_HEIGHT, true, R.QueryFilterFlags.EXCLUDE_KINEMATIC
    );
    return hit === null;
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
    // On ice you barely grip: you keep your momentum and steer slowly. Wading is slow.
    const onIce = this.grounded && this.surface === 'ice';
    // Crouch while Shift is held (only from the ground); stand again once there is room overhead
    if (k.crouch && canMove && this.grounded && !this.crouched) this._setCrouched(true);
    else if ((!k.crouch || !canMove) && this.crouched && this._canStand()) this._setCrouched(false);

    let speed = (this.crouched ? CROUCH_SPEED : k.sprint ? SPRINT_SPEED : WALK_SPEED) * this.speedScale;
    if (this.surface === 'wade' && this.grounded) speed *= 0.55;
    if (onIce) speed *= 1.25;
    const grip = !this.grounded ? 4 : onIce ? 0.9 : 14;
    const ease = 1 - Math.exp(-grip * dt);
    if (!(onIce && !moving)) {
      this.velocity.x += (this._wish.x * speed - this.velocity.x) * ease;
      this.velocity.z += (this._wish.z * speed - this.velocity.z) * ease;
    } else {
      this.velocity.x *= Math.exp(-0.25 * dt);   // gliding: almost no friction
      this.velocity.z *= Math.exp(-0.25 * dt);
    }
    if (this.grounded) {
      this.velocity.x += this.slopeAccel.x * dt;
      this.velocity.z += this.slopeAccel.z * dt;
    }
    const flat = Math.hypot(this.velocity.x, this.velocity.z);
    if (flat > 16) { this.velocity.x *= 16 / flat; this.velocity.z *= 16 / flat; }

    // Jumping: coyote time, buffered presses, and a shorter hop if Space is let go early
    this.coyote = this.grounded ? COYOTE : this.coyote - dt;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0 && canMove && this.crouched && this._canStand()) this._setCrouched(false);
    if (this.jumpBuffer > 0 && this.coyote > 0 && canMove && !this.crouched) {
      this.velocity.y = JUMP_SPEED;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.character.jumped();
    }
    if (!k.jumpHeld && this.velocity.y > 0) this.velocity.y *= Math.exp(-14 * dt);

    this.velocity.y -= GRAVITY * (this.velocity.y < 0 ? FALL_GRAVITY : 1) * dt;
    if (this.velocity.y < -TERMINAL_SPEED) this.velocity.y = -TERMINAL_SPEED;

    // Ask the character controller where we can actually go
    this.kcc.computeColliderMovement(this.collider, {
      x: (this.velocity.x + this.impulse.x) * dt, y: this.velocity.y * dt, z: (this.velocity.z + this.impulse.z) * dt
    });
    this.impulse.multiplyScalar(Math.exp(-5 * dt));
    const mv = this.kcc.computedMovement();
    this.grounded = this.kcc.computedGrounded();
    if (this.grounded && this.velocity.y < 0) this.velocity.y = -1;       // stay glued to the floor
    if (this.velocity.y > 0 && mv.y < this.velocity.y * dt * 0.5) this.velocity.y = 0; // bumped a ceiling

    const t = this.body_rb.translation();
    this.body_rb.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    // How fast the body really moves over the ground (zero when pushing into a wall), for the walk cycle
    const groundSpeed = dt > 0 ? Math.hypot(mv.x, mv.z) / dt : 0;
    this._groundSpeed = (this._groundSpeed || 0) + (groundSpeed - (this._groundSpeed || 0)) * (1 - Math.exp(-12 * dt));
    this.physics.step(dt);
    const n = this.body_rb.translation();
    this.position.set(n.x, n.y - this.height / 2, n.z);

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

    this.eye += ((this.crouched ? CROUCH_EYE : EYE) - this.eye) * (1 - Math.exp(-CROUCH_EASE * dt));
    this._placeBodyAndCamera(dt, moving);
    this.character.update(dt, {
      crouch: (EYE - this.eye) / (EYE - CROUCH_EYE),
      running: this.keys.sprint && !this.crouched,
      grounded: this.grounded,
      speed: this._groundSpeed,
      verticalSpeed: this.velocity.y,
      camera: this.camera,
      bodyYaw: this.facing
    });
  }

  _placeBodyAndCamera(dt, moving) {
    const third = this.view === 'third';
    this.body.visible = third;

    if (this.aimFacing && third) {
      // Aiming: face where the camera looks
      let d = this.camera.rotation.y - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-18 * dt));
    } else if (moving) {
      // Turn the body toward where it is walking
      const target = Math.atan2(-this._wish.x, -this._wish.z);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * (1 - Math.exp(-12 * dt));
    }
    // Stepping up a ledge or stair happens in one physics frame; the body and camera ease up
    // to the new height instead, so it reads as a smooth walk up
    if (this.renderY === null || this.renderY === undefined || Math.abs(this.position.y - this.renderY) > 1.0) {
      this.renderY = this.position.y;
    } else {
      this.renderY += (this.position.y - this.renderY) * (1 - Math.exp(-16 * dt));
    }
    const baseY = this.renderY;
    this.body.position.set(this.position.x, baseY, this.position.z);
    this.body.rotation.y = this.facing;

    const cam = this.camera;
    if (!third) {
      cam.position.set(this.position.x, baseY + this.eye, this.position.z);
      return;
    }

    // Behind and slightly over the right shoulder. A ray from the player keeps the camera
    // from pushing through walls: it moves in at once and eases back out.
    cam.getWorldDirection(this._camDir);
    this._pivot.set(this.position.x, baseY + this.eye + 0.15, this.position.z);
    this._pivot.addScaledVector(this._right.set(Math.cos(cam.rotation.y), 0, -Math.sin(cam.rotation.y)), this.shoulder);

    const back = this._camDir.negate();
    const hit = this.physics.castRay(this._pivot, back, this.camDist + 0.3);
    const allowed = hit === null ? this.camDist : Math.max(0.5, hit - 0.3);
    this._camDistance = allowed < this._camDistance
      ? allowed
      : this._camDistance + (allowed - this._camDistance) * (1 - Math.exp(-6 * dt));
    cam.position.copy(this._pivot).addScaledVector(back, this._camDistance);
  }
}
