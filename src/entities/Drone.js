import * as THREE from 'three';

// Base class for flying attack units (drones, robots, etc.) that share the same state machine:
//   drop       swoops down from above to its hover position
//   circle     keeps a position round the player, drifting slowly, always coming back round to
//              the player's front (never overhead or behind)
//   telegraph  stops, locks on (eye/sensor turns red), pauses briefly
//   dive       rushes the player's last known position; a direct hit or graze hurts
//   recover    flies back out to its circle position
//   frozen     a cold snap froze it (only when wet): drops and shatters
//   dead       removed from the scene
//
// Subclasses provide their own visual representation by overriding `_buildVisual()`.
// The base class manages the group, state machine, movement, and combat logic.

const RANGE = [3.5, 5.0];       // metres from Voss it keeps (tightened so they feel close)
const HOVER = [1.8, 2.2];       // its height: just above his eyes (1.6 m)
const SPREAD = 0.9;
const BEHIND = 1.1;
const COME_ROUND = 0.9;
const DRIFT = 0.12;
const TELEGRAPH = 1.2;
const DIVE_SPEED = 9.5;
const RECOVER = 0.9;
const DRY_SECONDS = 9;
const FREEZE_WET = 0.3;
const MAX_SPEED = 6;
const HIT_RADIUS = 0.5;        // direct hit: drone must be this close (3D) to the player
const GRAZE_RADIUS = 0.9;      // graze: drone passed within this distance
const HIT_HEIGHT = 1.2;        // but only if the drone is within this much above/below the player

export class Drone {
  constructor(scene, start) {
    this.group = new THREE.Group();
    this.group.name = this.constructor.name || 'Drone';

    // Subclass hook: build the visual representation and add to this.group
    // Must set this.eyeMat (MeshBasicMaterial for the sensor eye) and optionally
    // this.eyeMount (Group for the eye that can twitch/lock-on)
    this._buildVisual(scene);

    this.group.position.copy(start);
    scene.add(this.group);

    this.state = 'drop';
    this.hoverY = HOVER[0] + Math.random() * (HOVER[1] - HOVER[0]);
    this.slot = (Math.random() * 2 - 1) * SPREAD;
    this.angle = null;
    this.slotPhase = Math.random() * 10;
    this.range = RANGE[0] + Math.random() * (RANGE[1] - RANGE[0]);
    this.timer = 0;
    this.wet = 0;
    this.time = Math.random() * 10;
    this.fallV = 0;
    this.hitDone = false;
    this.closest = Infinity;
    this.target = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this._twitchAt = 0;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._shownWet = 0;
    this.floorY = null;
  }

  // Subclasses override this to build their visual representation.
  // Must add meshes to this.group. Should set:
  //   this.eyeMat    - MeshBasicMaterial for the sensor eye (turns red on lock-on)
  //   this.eyeMount  - Group containing the eye (for twitch/lock-on rotation)
  //   this.blades    - array of rotating parts (for spin animation)
  //   this.bodyMat   - main body material (for wet darkening effect), optional
  //   this.ice       - ice mesh (frozen state), optional
  _buildVisual(/* scene */) {
    // Default: no visual (subclasses must override)
    this.eyeMat = null;
    this.eyeMount = null;
    this.blades = [];
    this.bodyMat = null;
    this.ice = null;
  }

  get alive() {
    return this.state !== 'dead';
  }

  get position() {
    return this.group.position;
  }

  // The manager lets one unit at a time attack: start the lock-on
  attack(targetPos) {
    if (this.state !== 'circle') return false;
    this.state = 'telegraph';
    this.timer = TELEGRAPH;
    this.target.copy(targetPos);
    return true;
  }

  soak(amount) {
    if (this.state === 'frozen' || this.state === 'dead') return;
    this.wet = Math.min(1, this.wet + amount);
  }

  get freezable() {
    return this.wet >= FREEZE_WET && this.state !== 'frozen' && this.state !== 'dead' && this.state !== 'scripted';
  }

  freeze() {
    if (!this.freezable) return false;
    this.state = 'frozen';
    this.fallV = 0;
    if (this.ice) this.ice.visible = true;
    if (this.eyeMat) this.eyeMat.color.setRGB(0.15, 0.2, 0.25);
    return true;
  }

  remove() {
    this.state = 'dead';
    this.group.removeFromParent();
    if (this.bodyMat && this.bodyMat.dispose) this.bodyMat.dispose();
  }

  // ctx: { dt, player (Vector3), facing (Vector3), centre (Vector3), leash (metres),
  //        onHit(kind), onShatter(position), onSpark(position), onDrip(position) }
  update(ctx) {
    const { dt, player } = ctx;
    this.time += dt;
    const p = this.group.position;
    const slow = this.wet >= FREEZE_WET ? 0.6 : 1;

    if (this.state !== 'frozen') {
      for (const b of this.blades) b.rotation.y += dt * 38 * slow;
      if (this.wet > 0) {
        this.wet = Math.max(0, this.wet - dt / DRY_SECONDS);
        if (this.wet >= FREEZE_WET && Math.random() < dt * 6) ctx.onSpark?.(p);
        if (Math.random() < dt * 14 * this.wet) ctx.onDrip?.(p);
      }
      if (this.bodyMat && Math.abs(this.wet - this._shownWet) > 0.03) {
        this._shownWet = this.wet;
        this._applyWetLook();
      }
    }

    switch (this.state) {
      case 'drop': {
        this._hold(ctx, dt, slow);
        if (Math.abs(p.y - this.hoverY) < 0.3) this.state = 'circle';
        this._lookAt(player, dt);
        this._twitch();
        break;
      }
      case 'circle': {
        this._hold(ctx, dt, slow);
        this._lookAt(player, dt);
        this._twitch();
        break;
      }
      case 'telegraph': {
        this.timer -= dt;
        if (this.eyeMat) this.eyeMat.color.setRGB(2.2, 0.15, 0.1);
        if (this.eyeMount) this.eyeMount.rotation.set(0, 0, 0);
        this._lookAt(this.target, dt * 4);
        p.y += Math.sin(this.time * 30) * 0.003;
        if (this.timer <= 0) {
          this.state = 'dive';
          this.hitDone = false;
          this.closest = Infinity;
          this.velocity.subVectors(this.target, p).normalize().multiplyScalar(DIVE_SPEED * slow);
          this.timer = 1.6;
        }
        break;
      }
      case 'dive': {
        p.addScaledVector(this.velocity, dt);
        const d = p.distanceTo(player);
        const dy = Math.abs(p.y - player.y);
        if (d < this.closest && dy < HIT_HEIGHT) this.closest = d;
        if (!this.hitDone && d < HIT_RADIUS && dy < HIT_HEIGHT) {
          this.hitDone = true;
          ctx.onHit?.('direct');
        }
        this.timer -= dt;
        if (this.timer <= 0 || p.y < 0.6 || (this.closest < 3 && d > this.closest + 1.2)) {
          if (!this.hitDone && this.closest < GRAZE_RADIUS) ctx.onHit?.('graze');
          this.state = 'recover';
          this.timer = RECOVER;
          if (this.eyeMat) this.eyeMat.color.setRGB(0.3, 1.6, 1.8);
        }
        break;
      }
      case 'recover': {
        this.timer -= dt;
        this._hold(ctx, dt, slow * 1.4);
        if (p.y < 0.8) p.y = 0.8;
        if (this.timer <= 0) this.state = 'circle';
        break;
      }
      case 'frozen': {
        this.fallV += 14 * dt;
        p.y -= this.fallV * dt;
        this.group.rotation.x += dt * 1.5;
        const ground = (this.floorY ?? 0) + 0.3;
        if (p.y <= ground) {
          p.y = ground;
          ctx.onShatter?.(p);
          this.remove();
        }
        break;
      }
    }
  }

  // Apply the wet look: darker and glossier body
  _applyWetLook() {
    // Subclasses with a bodyMat can override for custom wet effects
  }

  // Fly towards its position round the player
  _hold(ctx, dt, speed) {
    const { player, facing } = ctx;
    const p = this.group.position;
    const face = Math.atan2(facing.x, facing.z);
    if (this.angle === null) this.angle = face + this.slot;
    const rel = Math.atan2(Math.sin(this.angle - face), Math.cos(this.angle - face));
    if (Math.abs(rel) > BEHIND) this.angle -= Math.sign(rel) * COME_ROUND * dt;
    this.angle += Math.sin(this.time * 0.3 + this.slotPhase) * DRIFT * dt;
    const a = this.angle;
    this._v.set(player.x + Math.sin(a) * this.range, 0, player.z + Math.cos(a) * this.range);
    const leash = ctx.leash ?? 15;
    this._w.subVectors(this._v, ctx.centre).setY(0);
    if (this._w.length() > leash) this._v.copy(ctx.centre).addScaledVector(this._w.normalize(), leash);
    this._v.y = this.hoverY + Math.sin(this.time * 1.7) * 0.2;
    this._w.subVectors(this._v, p);
    const gap = this._w.length();
    const move = Math.min(gap * Math.min(1, dt * 1.6 * speed), MAX_SPEED * speed * dt);
    if (gap > 1e-4) p.addScaledVector(this._w, move / gap);
  }

  // Turn to face a point (the body yaws, smoothly)
  _lookAt(point, rate) {
    const p = this.group.position;
    const want = Math.atan2(point.x - p.x, point.z - p.z);
    let d = want - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * Math.min(1, rate * 3);
  }

  // The sensor eye snaps between fixed points, never tracking smoothly
  _twitch() {
    if (!this.eyeMount || this.time < this._twitchAt) return;
    this._twitchAt = this.time + 0.25 + Math.random() * 0.6;
    this.eyeMount.rotation.set((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.4, 0);
  }
}
