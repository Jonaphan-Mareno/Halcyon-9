import * as THREE from 'three';

// What a frozen drone leaves on the floor when it shatters (scene 2.3): shards of ice glowing
// mint and violet with the organism inside, a soft glow on the floor round them, and tiny
// organisms that wriggle out of the ice and crawl about the spot, never far from it. They stay
// for the rest of the level, the first proof that the drones were infected.
//
// Every pile shares three instanced meshes (shards, crawlers, floor glows): three draw calls
// however many drones have fallen. Glowing colours go above 1 so the bloom picks them up.

const MAX_PILES = 10;
const SHARDS = 10;              // per pile
const CRAWLERS = 16;            // per pile
const ROAM = 0.9;               // metres a crawler wanders from its pile
const MINT = new THREE.Color(0x5dffc0);
const VIOLET = new THREE.Color(0xa560ff);

const rand = (a, b) => a + Math.random() * (b - a);

// a soft round spot, bright in the middle
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Remains {
  constructor(scene) {
    const shardGeo = new THREE.OctahedronGeometry(0.07, 0);
    shardGeo.scale(0.55, 1.6, 0.55);
    this.shards = new THREE.InstancedMesh(shardGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PILES * SHARDS);
    const wormGeo = new THREE.CapsuleGeometry(0.017, 0.075, 2, 6);
    wormGeo.rotateX(Math.PI / 2);                       // lying along +z, its heading
    this.crawlers = new THREE.InstancedMesh(wormGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_PILES * CRAWLERS);
    const glowGeo = new THREE.PlaneGeometry(2.4, 2.4);
    glowGeo.rotateX(-Math.PI / 2);
    this.glows = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }), MAX_PILES);
    for (const m of [this.shards, this.crawlers, this.glows]) {
      m.count = 0;
      m.frustumCulled = false;
      m.setColorAt(0, MINT);                            // makes the per-instance colour buffer
      scene.add(m);
    }
    this.piles = [];
    this.worms = [];
    this.time = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  // A drone shattered at `at`, over a floor at height floorY
  add(at, floorY) {
    if (this.piles.length >= MAX_PILES) return;
    const pile = { x: at.x, z: at.z, y: floorY, age: 0, hue: Math.random() };
    const k = this.piles.length;
    this.piles.push(pile);
    // the shards: scattered, tipped over, some standing up out of the floor
    for (let i = 0; i < SHARDS; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.7;
      this._p.set(at.x + Math.cos(a) * r, floorY + 0.03, at.z + Math.sin(a) * r);
      this._q.setFromEuler(this._e.set(rand(0.6, 1.57), Math.random() * Math.PI * 2, rand(-0.4, 0.4)));
      const s = rand(0.8, 1.8);
      this._m.compose(this._p, this._q, this._s.set(s, s, s));
      this.shards.setMatrixAt(k * SHARDS + i, this._m);
      this.shards.setColorAt(k * SHARDS + i, this._c.copy(i % 3 ? MINT : VIOLET).lerp(new THREE.Color(1, 1, 1), 0.1).multiplyScalar(1.35));
    }
    this.shards.count = this.piles.length * SHARDS;
    this.shards.instanceMatrix.needsUpdate = true;
    this.shards.instanceColor.needsUpdate = true;
    // the crawlers start in the middle and spread out
    for (let i = 0; i < CRAWLERS; i++) {
      this.worms.push({
        pile, x: at.x + rand(-0.15, 0.15), z: at.z + rand(-0.15, 0.15),
        heading: Math.random() * Math.PI * 2, speed: rand(0.05, 0.16), phase: Math.random() * 10,
        mint: Math.random() < 0.6, size: rand(0.7, 1.3)
      });
    }
    this.crawlers.count = this.worms.length;
    this.glows.count = this.piles.length;
  }

  update(dt) {
    if (!this.piles.length) return;
    this.time += dt;
    const t = this.time;
    // the floor glows: bright at first, settling into a slow breathing pulse
    for (let k = 0; k < this.piles.length; k++) {
      const p = this.piles[k];
      p.age += dt;
      const flare = Math.max(0, 1 - p.age / 4);
      this._m.compose(this._p.set(p.x, p.y + 0.02, p.z), this._q.identity(), this._s.set(1, 1, 1));
      this.glows.setMatrixAt(k, this._m);
      const pulse = 0.45 + 0.15 * Math.sin(t * 1.6 + p.hue * 6) + flare * 0.9;
      this.glows.setColorAt(k, this._c.copy(MINT).lerp(VIOLET, 0.5 + 0.5 * Math.sin(t * 0.5 + p.hue * 6)).multiplyScalar(pulse));
    }
    this.glows.instanceMatrix.needsUpdate = true;
    this.glows.instanceColor.needsUpdate = true;
    // the crawlers: wander, wriggle, turn back towards their pile, and pulse
    for (let i = 0; i < this.worms.length; i++) {
      const w = this.worms[i];
      w.heading += (Math.sin(t * 1.3 + w.phase) * 1.8 + (Math.random() - 0.5) * 3) * dt;
      const dx = w.pile.x - w.x, dz = w.pile.z - w.z;
      if (dx * dx + dz * dz > ROAM * ROAM) {
        // steer back home
        const home = Math.atan2(dx, dz);
        let d = home - w.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        w.heading += d * Math.min(1, dt * 3);
      }
      const crawl = w.speed * (0.6 + 0.4 * Math.sin(t * 7 + w.phase));   // inching along
      w.x += Math.sin(w.heading) * crawl * dt;
      w.z += Math.cos(w.heading) * crawl * dt;
      const wiggle = Math.sin(t * 9 + w.phase) * 0.5;
      this._q.setFromEuler(this._e.set(0, w.heading + wiggle, 0));
      const s = w.size * (1 + 0.15 * Math.sin(t * 9 + w.phase));
      this._m.compose(this._p.set(w.x, w.pile.y + 0.012, w.z), this._q, this._s.set(s, s, s * 1.2));
      this.crawlers.setMatrixAt(i, this._m);
      const glow = 1.8 + 0.8 * Math.sin(t * 2.2 + w.phase);
      this.crawlers.setColorAt(i, this._c.copy(w.mint ? MINT : VIOLET).multiplyScalar(glow));
    }
    this.crawlers.instanceMatrix.needsUpdate = true;
    this.crawlers.instanceColor.needsUpdate = true;
  }
}
