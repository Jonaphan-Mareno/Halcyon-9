import * as THREE from 'three';
import { makeOrganismMaterial, TendrilBuilder, growTendril, seededRandom } from './Organism.js';

// What a frozen drone leaves on the floor when it shatters (scene 2.3): the organism that was
// inside it, exactly as it looks in the lab's tubes but small. A soft lumpy body with branching
// tendrils spread across the floor, mint pulses running out along them and violet sparks, with
// a couple of smaller pieces beside it. Under them is a dark wet spill (the melted ice) with a
// faint glow. They stay for the rest of the level, the first proof that the drones were infected.
//
// Each pile is one mesh (its pieces merged), all sharing the lab organism's shader; the spills
// and glows are two instanced meshes. Ten piles at most.

const MAX_PILES = 10;
const MINT = new THREE.Color(0x5dffc0);
const VIOLET = new THREE.Color(0xa560ff);

// a soft round spot, opaque in the middle
function spotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// one small organism: a body and its tendrils, flat across the floor around (0, 0, 0)
function growPiece(builder, rng, x, z, bodyR, arms, armLength, armR, depth) {
  const limit = { x, z, r: armLength * 1.1, y0: 0.008, y1: bodyR * 0.9 };
  const c = new THREE.Vector3(x, bodyR * 0.55, z);
  builder.blob(c, bodyR, rng() * 6);
  for (let k = 0; k < arms; k++) {
    const a = (k / arms) * Math.PI * 2 + rng() * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), -0.15, Math.sin(a));
    const start = new THREE.Vector3(x + Math.cos(a) * bodyR * 0.7, bodyR * 0.3, z + Math.sin(a) * bodyR * 0.7);
    growTendril(builder, rng, start, dir, armLength * (0.7 + rng() * 0.6), armR, 0.2, depth, limit);
  }
}

export class Remains {
  constructor(scene) {
    this.scene = scene;
    this.material = makeOrganismMaterial(0.006, 2.4);     // a small, twitchy sway
    const tex = spotTexture();
    const flat = new THREE.PlaneGeometry(1, 1);
    flat.rotateX(-Math.PI / 2);
    // the spill: dark teal, like the liquid in the lab's tubes
    this.spills = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({
      color: 0x03161a, map: tex, transparent: true, opacity: 0.8, depthWrite: false
    }), MAX_PILES);
    // the glow over it, breathing mint and violet
    this.glows = new THREE.InstancedMesh(flat, new THREE.MeshBasicMaterial({
      color: 0xffffff, map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }), MAX_PILES);
    this.spills.renderOrder = 1;
    this.glows.renderOrder = 2;
    for (const m of [this.spills, this.glows]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.glows.setColorAt(0, MINT);
    this.piles = [];
    this.time = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  // A drone shattered at `at`, over a floor at height floorY
  add(at, floorY) {
    if (this.piles.length >= MAX_PILES) return;
    const k = this.piles.length;
    const rng = seededRandom(1 + Math.floor(Math.random() * 1e6));
    // the main piece, and two or three smaller ones that broke off beside it
    const b = new TendrilBuilder(5);
    growPiece(b, rng, 0, 0, 0.095, 7, 0.45, 0.02, 2);
    const extra = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < extra; i++) {
      const a = rng() * Math.PI * 2, r = 0.45 + rng() * 0.35;
      growPiece(b, rng, Math.cos(a) * r, Math.sin(a) * r, 0.04 + rng() * 0.02, 4, 0.2, 0.011, 1);
    }
    const mesh = new THREE.Mesh(b.build(), this.material);
    mesh.position.set(at.x, floorY + 0.01, at.z);
    mesh.rotation.y = rng() * Math.PI * 2;
    mesh.scale.set(1, 0.6, 1);                       // settled flat on the floor
    mesh.renderOrder = 3;
    this.scene.add(mesh);
    const pile = { x: at.x, z: at.z, y: floorY, age: 0, hue: rng(), size: 1.3 + rng() * 0.4, mesh };
    this.piles.push(pile);
    this._m.compose(this._p.set(at.x, floorY + 0.006, at.z), this._q.identity(), this._s.set(pile.size, 1, pile.size));
    this.spills.setMatrixAt(k, this._m);
    this.spills.count = this.piles.length;
    this.spills.instanceMatrix.needsUpdate = true;
    this.glows.count = this.piles.length;
  }

  update(dt) {
    if (!this.piles.length) return;
    this.time += dt;
    const t = this.time;
    // the organism's pulses, and a flicker like the lab's
    this.material.uniforms.uTime.value = t;
    this.material.uniforms.uBright.value = 1.15 + 0.12 * Math.sin(t * 13) * Math.sin(t * 7.3);
    // a surge through every piece at once now and then, as in the lab
    const surge = Math.max(0, Math.sin(t * 0.7) - 0.93) * 12;
    this.material.uniforms.uSurge.value = surge;
    for (let k = 0; k < this.piles.length; k++) {
      const p = this.piles[k];
      p.age += dt;
      const flare = Math.max(0, 1 - p.age / 3);       // bright as it lands, then settling
      this._m.compose(this._p.set(p.x, p.y + 0.012, p.z), this._q.identity(), this._s.set(p.size * 0.9, 1, p.size * 0.9));
      this.glows.setMatrixAt(k, this._m);
      const pulse = 0.22 + 0.08 * Math.sin(t * 1.6 + p.hue * 6) + flare * 0.8 + surge * 0.3;
      this.glows.setColorAt(k, this._c.copy(MINT).lerp(VIOLET, 0.5 + 0.5 * Math.sin(t * 0.5 + p.hue * 6)).multiplyScalar(pulse));
    }
    this.glows.instanceMatrix.needsUpdate = true;
    this.glows.instanceColor.needsUpdate = true;
  }
}
