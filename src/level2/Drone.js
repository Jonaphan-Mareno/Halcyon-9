import * as THREE from 'three';
import { withHubLighting } from '../graphics/HubMaterials.js';

// A garden maintenance drone gone wrong (scene 2.3): faded safety-yellow, four rotors, pruning
// shears underneath, and one sensor eye on a stalk that twitches between fixed points instead of
// tracking smoothly, which is the first sign something is wrong with it.
//
// What it does (the Garden decides when it may attack):
//   drop       descends from the grilles above the beds
//   circle     orbits Voss at a few metres, bobbing
//   telegraph  one second: it stops, the eye locks on and turns red
//   dive       rushes his last position; a direct hit or a graze hurts
//   recover    climbs back up and circles again
//   frozen     ARIA froze it (only works when it is wet): it drops and shatters on the floor
//
// Wet (from the water jet) it darkens and glistens, drips, sparks and slows down: sparking means
// ARIA can freeze it. Nothing here allocates per frame.

const ORBIT_RADIUS = 4.6;
const ORBIT_HEIGHT = 2.6;
const TELEGRAPH = 1.2;
const DIVE_SPEED = 9.5;
const RECOVER = 0.9;
const DRY_SECONDS = 9;           // a soaked drone dries out again in this long
const FREEZE_WET = 0.3;          // this wet (a third of a second under the jet) and it can be frozen
const MAX_SPEED = 6;             // metres a second while circling (so one far off comes in, not teleports)
const YELLOW = new THREE.Color(0xb8952a);

let shared = null;
function parts() {
  if (shared) return shared;
  const grime = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x3a3a32, roughness: 0.8, metalness: 0.3 }));
  const steel = withHubLighting(new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.3, metalness: 0.85 }));
  shared = {
    grime, steel,
    body: new THREE.BoxGeometry(0.62, 0.22, 0.62),
    top: new THREE.BoxGeometry(0.4, 0.1, 0.4),
    arm: new THREE.BoxGeometry(0.95, 0.05, 0.08),
    ring: new THREE.TorusGeometry(0.17, 0.025, 6, 16),
    blade: new THREE.BoxGeometry(0.3, 0.008, 0.04),
    stalk: new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6),
    eye: new THREE.SphereGeometry(0.06, 10, 8),
    shear: new THREE.BoxGeometry(0.03, 0.03, 0.3),
    ice: new THREE.BoxGeometry(1.15, 0.6, 1.15),
    iceMat: new THREE.MeshStandardMaterial({ color: 0xbfe8ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false })
  };
  return shared;
}

export class Drone {
  constructor(scene, start) {
    const P = parts();
    this.group = new THREE.Group();
    this.group.name = 'Drone';
    // its own body material, so it can darken and glisten when wet
    this.bodyMat = withHubLighting(new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.62, metalness: 0.25 }));
    this.group.add(new THREE.Mesh(P.body, this.bodyMat));
    this._shownWet = 0;
    const top = new THREE.Mesh(P.top, P.grime);
    top.position.y = 0.15;
    this.group.add(top);
    const armA = new THREE.Mesh(P.arm, P.grime);
    armA.rotation.y = Math.PI / 4;
    const armB = new THREE.Mesh(P.arm, P.grime);
    armB.rotation.y = -Math.PI / 4;
    this.group.add(armA, armB);
    this.blades = [];
    for (const [x, z] of [[0.34, 0.34], [-0.34, 0.34], [0.34, -0.34], [-0.34, -0.34]]) {
      const ring = new THREE.Mesh(P.ring, P.grime);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.05, z);
      const blade = new THREE.Mesh(P.blade, P.steel);
      blade.position.set(x, 0.06, z);
      this.group.add(ring, blade);
      this.blades.push(blade);
    }
    // the eye on its stalk, at the front
    this.eyeMount = new THREE.Group();
    this.eyeMount.position.set(0, 0.06, 0.34);
    const stalk = new THREE.Mesh(P.stalk, P.steel);
    stalk.rotation.x = Math.PI / 2;
    stalk.position.z = 0.08;
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 1.8) });
    this.eye = new THREE.Mesh(P.eye, this.eyeMat);
    this.eye.position.z = 0.2;
    this.eyeMount.add(stalk, this.eye);
    this.group.add(this.eyeMount);
    // the shears underneath
    for (const s of [-1, 1]) {
      const shear = new THREE.Mesh(P.shear, P.steel);
      shear.position.set(s * 0.06, -0.15, 0.2);
      shear.rotation.y = s * 0.2;
      this.group.add(shear);
    }
    // the ice it is locked in once frozen
    this.ice = new THREE.Mesh(P.ice, P.iceMat);
    this.ice.visible = false;
    this.ice.renderOrder = 3;
    this.group.add(this.ice);

    this.group.position.copy(start);
    scene.add(this.group);

    this.state = 'drop';
    this.hoverY = ORBIT_HEIGHT + (Math.random() - 0.5) * 0.8;
    this.orbit = Math.random() * Math.PI * 2;      // where round Voss it circles
    this.orbitDir = Math.random() < 0.5 ? 1 : -1;
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
  }

  get alive() {
    return this.state !== 'dead';
  }

  get position() {
    return this.group.position;
  }

  // The Garden lets one drone at a time attack: start the one-second lock-on
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

  // ARIA's cold snap: only a wet drone freezes. Returns true if it froze.
  freeze() {
    if (!this.freezable) return false;
    this.state = 'frozen';
    this.fallV = 0;
    this.ice.visible = true;
    this.eyeMat.color.setRGB(0.15, 0.2, 0.25);
    return true;
  }

  remove() {
    this.state = 'dead';
    this.group.removeFromParent();
    this.bodyMat.dispose();
  }

  // ctx: { dt, player (Vector3, his head), centre (Vector3, the garden), leash (metres from the
  //        centre it may circle, default 9), onHit(kind), onShatter(position), onSpark(position),
  //        onDrip(position) }
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
      // wet: darker and glossier
      if (Math.abs(this.wet - this._shownWet) > 0.03) {
        this._shownWet = this.wet;
        this.bodyMat.color.copy(YELLOW).multiplyScalar(1 - 0.5 * this.wet);
        this.bodyMat.roughness = 0.62 - 0.45 * this.wet;
      }
    }

    switch (this.state) {
      case 'drop': {
        p.y += (this.hoverY - p.y) * Math.min(1, dt * 1.6);
        if (Math.abs(p.y - this.hoverY) < 0.15) this.state = 'circle';
        this._lookAt(player, dt);
        this._twitch(dt);
        break;
      }
      case 'circle': {
        this.orbit += this.orbitDir * dt * 0.55 * slow;
        // round Voss, but kept over the garden so the fight stays where it belongs
        this._v.set(player.x + Math.cos(this.orbit) * ORBIT_RADIUS, 0, player.z + Math.sin(this.orbit) * ORBIT_RADIUS);
        const leash = ctx.leash ?? 9;
        this._w.subVectors(this._v, ctx.centre).setY(0);
        if (this._w.length() > leash) this._v.copy(ctx.centre).addScaledVector(this._w.normalize(), leash);
        this._v.y = this.hoverY + Math.sin(this.time * 1.7) * 0.25;
        this._w.subVectors(this._v, p);
        const gap = this._w.length();
        const move = Math.min(gap * Math.min(1, dt * 1.4 * slow), MAX_SPEED * slow * dt);
        if (gap > 1e-4) p.addScaledVector(this._w, move / gap);
        this._lookAt(player, dt);
        this._twitch(dt);
        break;
      }
      case 'telegraph': {
        this.timer -= dt;
        this.eyeMat.color.setRGB(2.2, 0.15, 0.1);       // locked on: red, no more twitching
        this.eyeMount.rotation.set(0, 0, 0);
        this._lookAt(this.target, dt * 4);
        p.y += Math.sin(this.time * 30) * 0.003;          // a shiver before it goes
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
        if (d < this.closest) this.closest = d;
        if (!this.hitDone && d < 0.75) {
          this.hitDone = true;
          ctx.onHit?.('direct');
        }
        this.timer -= dt;
        // past him (getting further away), into the floor, or out of time: pull up
        if (this.timer <= 0 || p.y < 0.6 || (this.closest < 3 && d > this.closest + 1.2)) {
          if (!this.hitDone && this.closest < 1.4) ctx.onHit?.('graze');
          this.state = 'recover';
          this.timer = RECOVER;
          this.eyeMat.color.setRGB(0.3, 1.6, 1.8);
        }
        break;
      }
      case 'recover': {
        this.timer -= dt;
        p.y += (this.hoverY - p.y) * Math.min(1, dt * 2.5);
        if (p.y < 0.8) p.y = 0.8;
        if (this.timer <= 0) this.state = 'circle';
        break;
      }
      case 'frozen': {
        // falls to whatever is under it (the Garden sets floorY when it freezes)
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

  // turn to face a point (the body yaws, smoothly)
  _lookAt(point, rate) {
    const p = this.group.position;
    const want = Math.atan2(point.x - p.x, point.z - p.z);
    let d = want - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * Math.min(1, rate * 3);
  }

  // the eye snaps between fixed points, never tracking smoothly
  _twitch() {
    if (this.time < this._twitchAt) return;
    this._twitchAt = this.time + 0.25 + Math.random() * 0.6;
    this.eyeMount.rotation.set((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.4, 0);
  }
}
