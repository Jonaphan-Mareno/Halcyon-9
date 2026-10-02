import * as THREE from 'three';

// The scrubber: a station cleaning robot gone rogue. It skates over floors and water toward
// the player and rams them.
//
// Beating it follows the world's rules:
//   frost builds up on it while sprayed -> it freezes solid inside a block of ice
//   and the water under it freezes too (so frozen scrubbers leave ice behind)
//   a frozen scrubber shatters when Voss slides into it fast, or lands on it
// Left alone, a frozen scrubber thaws after a while and comes back for you.

const SPEED = 3.0;
const SEE = 11;
const HIT_DAMAGE = 10;
const THAW_SECONDS = 7;

export class Scrubber {
  constructor(scene, start) {
    this.start = start.clone();
    this.group = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xe6ecf0, roughness: 0.4, metalness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.6, metalness: 0.4 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: 0x4ff0ff });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.26, 20), white);
    body.position.y = 0.28;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), white);
    dome.position.y = 0.41;
    this.brush = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 6, 20), dark);
    this.brush.rotation.x = Math.PI / 2;
    this.brush.position.y = 0.12;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20), this.eyeMat);
    band.position.y = 0.36;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6), this.eyeMat);
    eye.position.set(0, 0.46, -0.24);
    this.robot = new THREE.Group();
    this.robot.add(body, dome, this.brush, band, eye);

    // the block of ice it gets locked in
    this.ice = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.9, 1.25),
      new THREE.MeshStandardMaterial({ color: 0xbfe6f5, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.62 }));
    this.ice.position.y = 0.42;
    this.ice.visible = false;
    this.group.add(this.robot, this.ice);
    scene.add(this.group);
    this.vel = new THREE.Vector3();
    this.reset();
  }

  reset() {
    this.group.position.copy(this.start);
    this.group.visible = true;
    this.state = 'IDLE';            // IDLE, CHASE, FROZEN, SHATTERED
    this.frost = 0;
    this.thaw = 0;
    this.cooldown = 0;
    this.vel.set(0, 0, 0);
    this.ice.visible = false;
    this.ice.scale.setScalar(1);
    this.eyeMat.color.setHex(0x4ff0ff);
  }

  get alive() { return this.state !== 'SHATTERED'; }
  get frozen() { return this.state === 'FROZEN'; }
  get position() { return this.group.position; }

  // Frost from the hose (amount per frame while it is in the spray). Returns true if this froze it.
  addFrost(amount) {
    if (this.state === 'FROZEN' || this.state === 'SHATTERED') return false;
    this.frost = Math.min(1, this.frost + amount);
    if (this.frost >= 1) {
      this.state = 'FROZEN';
      this.thaw = THAW_SECONDS;
      this.vel.set(0, 0, 0);
      this.ice.visible = true;
      this.eyeMat.color.setHex(0x8899aa);
      return true;
    }
    return false;
  }

  shatter() {
    this.state = 'SHATTERED';
    this.group.visible = false;
  }

  // ctx: { player (position), surfaceY(pos) -> height to skate on, onIce(pos) -> bool, onHit(dmg, from) }
  update(dt, ctx) {
    const p = this.group.position;
    if (this.state === 'SHATTERED') return;
    this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.state === 'FROZEN') {
      // creaks back to life if left alone
      this.thaw -= dt;
      this.ice.scale.setScalar(0.9 + 0.1 * Math.min(1, this.thaw / 2));
      if (this.thaw <= 0) {
        this.state = 'CHASE';
        this.frost = 0;
        this.ice.visible = false;
        this.eyeMat.color.setHex(0xff5a4a);
      }
      return;
    }

    // frost wears off slowly when no longer sprayed; the eye turns from cyan to red as it chases
    this.frost = Math.max(0, this.frost - dt * 0.35);
    const pl = ctx.player;
    const dx = pl.x - p.x, dz = pl.z - p.z;
    const dist = Math.hypot(dx, dz);
    if (this.state === 'IDLE' && dist < SEE) this.state = 'CHASE';
    if (this.state === 'CHASE') {
      this.eyeMat.color.setHex(this.frost > 0.05 ? 0x9fdcff : 0xff5a4a);
      // on ice it skids: it can barely change direction
      const grip = ctx.onIce(p) ? 0.6 : 5;
      const slow = 1 - this.frost * 0.7;
      const tx = (dx / (dist || 1)) * SPEED * slow, tz = (dz / (dist || 1)) * SPEED * slow;
      const e = 1 - Math.exp(-grip * dt);
      this.vel.x += (tx - this.vel.x) * e;
      this.vel.z += (tz - this.vel.z) * e;
      p.x += this.vel.x * dt;
      p.z += this.vel.z * dt;
      this.robot.rotation.y = Math.atan2(-this.vel.x, -this.vel.z);
      if (dist < 1.0 && this.cooldown <= 0 && Math.abs(pl.y - p.y) < 1.2) {
        this.cooldown = 1.2;
        ctx.onHit(HIT_DAMAGE, p);
      }
    }
    p.y = ctx.surfaceY(p);
    this.brush.rotation.z += dt * 12;
  }
}
