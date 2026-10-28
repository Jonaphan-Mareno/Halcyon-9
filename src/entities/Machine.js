import * as THREE from 'three';

// The rogue maintenance machines (story bible, "Rogue Machines"): a nervous system
// with no mind behind it. No pathfinding. Each one walks a fixed path, notices the
// player inside a radius, telegraphs (its light turns red and it winds up), then makes
// one scripted lunge that hits hard. Every machine is DEFEATED by the player, never just
// avoided: crawlers are stomped (jump on them) or crushed under a dropped container, and
// each wing's big machine only goes down to its item (coolant, pry bar, flare).
//
//   PATROL -> ALERT (wind-up, light red) -> LUNGE (one dash) -> RESET (pause) -> PATROL
//   any state -> DISABLED (lights fade, goes still)
//
// The bodies are simple placeholders until the real models are made.

export const MACHINE_TYPES = {
  welder: { name: 'welding drone', counter: 'coolant', detect: 10, speed: 2.4, lunge: 13, lungeTime: 0.45, damage: 34, hover: 0, windup: 0.8 },
  loader: { name: 'cargo loader', counter: 'prybar', detect: 10, speed: 1.6, lunge: 9, lungeTime: 0.6, damage: 34, hover: 0, windup: 1.1 },
  drone: { name: 'security drone', counter: 'flare', detect: 13, speed: 3.4, lunge: 15, lungeTime: 0.4, damage: 25, hover: 1.6, windup: 0.7 },
  crawler: { name: 'scrap crawler', counter: null, detect: 6, speed: 2.6, lunge: 10, lungeTime: 0.35, damage: 15, hover: 0, windup: 0.55 }
};

const CALM = 0x2f9bff;
const ALERT = 0xff2a2a;
const RECOVER = 0xffb040;

const dark = () => new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.55, metalness: 0.5 });
const trimMat = () => new THREE.MeshStandardMaterial({ color: 0x2c333c, roughness: 0.5, metalness: 0.6 });

export class Machine {
  // path: array of Vector3 (feet position), walked back and forth.
  // radial: [min, max] horizontal distance from the hub's centre the machine may not leave
  constructor(type, path, { radial = null } = {}) {
    this.type = type;
    this.spec = MACHINE_TYPES[type];
    this.path = path.map((p) => p.clone());
    this.radial = radial;

    this.group = new THREE.Group();
    this.eyeMat = new THREE.MeshBasicMaterial({ color: CALM });
    // No real light: a point light per machine would make every surface's shader heavier.
    // The glowing eye (and the bloom around it) carries the colour instead.
    this.light = { color: new THREE.Color(CALM), intensity: 0 };
    this._to = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._build();

    this.reset();
  }

  reset() {
    this.state = 'PATROL';
    this.idx = 1;
    this.group.position.copy(this.path[0]);
    this.group.scale.set(1, 1, 1);
    this.timer = 0;
    this.hitDone = false;
    this.bob = Math.random() * 6;
    this._setLight(CALM, 30);
  }

  get active() {
    return this.state !== 'DISABLED';
  }

  disable() {
    this.state = 'DISABLED';
    this.timer = 0;
    if (this.type === 'crawler') this.group.scale.set(1.15, 0.3, 1.15);   // squashed flat
  }

  // Back to walking after the player was revived: forget the chase
  calm() {
    if (this.state === 'DISABLED') return;
    this.state = 'PATROL';
    this._setLight(CALM, 30);
  }

  _setLight(color, intensity) {
    this.eyeMat.color.setHex(color);
    this.light.color.setHex(color);
    this.light.intensity = intensity;
  }

  _build() {
    const g = this.group;
    const eye = (r, x, y, z) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), this.eyeMat);
      m.position.set(x, y, z);
      g.add(m);
    };
    if (this.type === 'welder') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 1.2), dark());
      base.position.y = 0.25;
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.55), trimMat());
      torso.position.y = 0.95;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 1.0), dark());
      arm.position.set(0.45, 1.2, 0.45);
      g.add(base, torso, arm);
      eye(0.12, 0.45, 1.2, 0.98);   // the welding tip
      eye(0.1, 0, 1.3, 0.3);        // sensor
    } else if (this.type === 'loader') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 3.2), dark());
      body.position.y = 1.0;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.9, 1.2), trimMat());
      cab.position.set(0, 2.1, -0.6);
      g.add(body, cab);
      for (const x of [-0.7, 0.7]) {
        const fork = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 2.0), trimMat());
        fork.position.set(x, 0.5, 2.5);
        g.add(fork);
      }
      for (const [x, z] of [[-1.25, -1.1], [1.25, -1.1], [-1.25, 1.1], [1.25, 1.1]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.4, 12), dark());
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.45, z);
        g.add(w);
      }
      eye(0.18, 0, 1.7, 1.65);
    } else if (this.type === 'crawler') {
      // a low scuttling thing: a plated body on six legs
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.32, 0.95), dark());
      body.position.y = 0.42;
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), trimMat());
      shell.position.y = 0.56;
      shell.scale.set(1, 0.6, 1.2);
      g.add(body, shell);
      for (const side of [-1, 1]) {
        for (const z of [-0.32, 0, 0.32]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.06), dark());
          leg.position.set(side * 0.58, 0.26, z);
          leg.rotation.z = side * 0.6;
          g.add(leg);
        }
      }
      eye(0.09, -0.16, 0.5, 0.5);
      eye(0.09, 0.16, 0.5, 0.5);
    } else {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.7, 0.28, 16), dark());
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), trimMat());
      dome.position.y = 0.14;
      g.add(disc, dome);
      for (const a of [0.8, 2.4, 4.0, 5.5]) {
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 10), trimMat());
        rotor.position.set(Math.cos(a) * 0.95, 0.2, Math.sin(a) * 0.95);
        g.add(rotor);
      }
      eye(0.2, 0, 0, 0.78);
      this.group.position.y = this.hoverY;
    }
  }

  get hoverY() {
    return this.spec.hover;
  }

  // Where the machine "looks from", for the line-of-sight check
  eyePosition(out) {
    return out.set(this.group.position.x, this.group.position.y + (this.type === 'loader' ? 1.7 : this.type === 'drone' ? 0.1 : this.type === 'crawler' ? 0.5 : 1.3), this.group.position.z);
  }

  _clamp() {
    if (!this.radial) return;
    const p = this.group.position;
    const r = Math.hypot(p.x, p.z);
    const c = Math.min(Math.max(r, this.radial[0]), this.radial[1]);
    if (r > 1e-3 && c !== r) {
      p.x *= c / r;
      p.z *= c / r;
    }
  }

  _face(dir, dt) {
    const target = Math.atan2(dir.x, dir.z);
    let d = target - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * (1 - Math.exp(-8 * dt));
  }

  // ctx: { playerPos, canSee(from, to), onHit(damage) }
  update(dt, ctx) {
    const p = this.group.position;
    const player = ctx.playerPos;
    const spec = this.spec;

    if (this.type === 'drone' && this.state !== 'DISABLED') {
      this.bob += dt * 2.2;
      p.y = this.path[0].y + spec.hover + Math.sin(this.bob) * 0.12;
    }

    const dx = player.x - p.x;
    const dz = player.z - p.z;
    const flat = Math.hypot(dx, dz);
    const dy = Math.abs(player.y - this.path[0].y);

    switch (this.state) {
      case 'PATROL': {
        const target = this.path[this.idx];
        const to = this._to.set(target.x - p.x, 0, target.z - p.z);
        const dist = to.length();
        if (dist < 0.25) {
          this.idx = (this.idx + 1) % this.path.length;
        } else {
          to.normalize();
          p.x += to.x * spec.speed * dt;
          p.z += to.z * spec.speed * dt;
          this._face(to, dt);
        }
        this._clamp();
        // Noticed? Close enough, on the same level, and a clear line of sight
        if (flat < spec.detect && dy < 3.5 && ctx.canSee(this, player)) {
          this.state = 'ALERT';
          this.timer = spec.windup;
          this._setLight(ALERT, 90);
        }
        break;
      }
      case 'ALERT': {
        // The telegraph: stops, turns to face the player, light flickers red
        this._face(this._look.set(dx, 0, dz), dt * 2);
        this.timer -= dt;
        this.eyeMat.color.setHex(Math.sin(this.timer * 18) > 0 ? ALERT : 0x661010);
        if (this.timer <= 0) {
          // The lunge goes where the player WAS, so moving aside beats it
          (this.lungeDir ||= new THREE.Vector3()).set(dx, 0, dz).normalize();
          this.state = 'LUNGE';
          this.timer = spec.lungeTime;
          this.hitDone = false;
        }
        break;
      }
      case 'LUNGE': {
        p.x += this.lungeDir.x * spec.lunge * dt;
        p.z += this.lungeDir.z * spec.lunge * dt;
        this._clamp();
        this.timer -= dt;
        if (!this.hitDone && flat < 1.5 && dy < 1.8) {
          this.hitDone = true;
          ctx.onHit(spec.damage, this);
        }
        if (this.timer <= 0) {
          this.state = 'RESET';
          this.timer = 1.8;
          this._setLight(RECOVER, 30);
        }
        break;
      }
      case 'RESET': {
        // Dazed after the lunge: the player's window to act
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'PATROL';
          this._setLight(CALM, 30);
        }
        break;
      }
      case 'DISABLED': {
        // Lights fade and it goes still
        this.light.intensity = Math.max(0, this.light.intensity - dt * 40);
        const c = this.eyeMat.color;
        c.multiplyScalar(Math.max(0, 1 - dt * 3));
        break;
      }
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material !== this.eyeMat) o.material.dispose();
    });
    this.eyeMat.dispose();
  }
}
