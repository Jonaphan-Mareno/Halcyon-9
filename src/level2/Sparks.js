import * as THREE from 'three';

// Bursts of sparks from damaged wiring (the torn-off wall panel, the dangling ceiling light).
// Each emitter fires a burst every few seconds: hot white-orange specks fly out, fall under
// gravity and fade. One small Points object per emitter, no lights, so they are cheap.

const PER_BURST = 26;
const LIFE = 0.7;

function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,220,150,0.9)');
  grad.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Sparks {
  constructor(scene, positions) {
    const tex = sparkTexture();
    this.emitters = positions.map((origin, i) => {
      const pos = new Float32Array(PER_BURST * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.06, map: tex, color: 0xffd9a0, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0
      });
      const points = new THREE.Points(g, mat);
      points.frustumCulled = false;
      scene.add(points);
      return { origin, points, vel: new Float32Array(PER_BURST * 3), age: LIFE, next: 1 + i * 1.3 + Math.random() * 2 };
    });
    this.burstNow = false;      // true on the frame any emitter fires (the flickering light follows)
  }

  _burst(e) {
    const p = e.points.geometry.attributes.position.array;
    for (let k = 0; k < PER_BURST; k++) {
      p[k * 3] = e.origin.x; p[k * 3 + 1] = e.origin.y; p[k * 3 + 2] = e.origin.z;
      const a = Math.random() * Math.PI * 2, up = Math.random() * 1.6 - 0.2, sp = 1.2 + Math.random() * 2.2;
      e.vel[k * 3] = Math.cos(a) * sp * 0.6;
      e.vel[k * 3 + 1] = up * sp * 0.6;
      e.vel[k * 3 + 2] = Math.sin(a) * sp * 0.6;
    }
    e.age = 0;
  }

  update(dt) {
    this.burstNow = false;
    for (const e of this.emitters) {
      e.next -= dt;
      if (e.next <= 0) {
        // usually one crackle, sometimes a quick double
        e.next = Math.random() < 0.3 ? 0.18 : 1.5 + Math.random() * 3.5;
        this._burst(e);
        this.burstNow = true;
      }
      if (e.age >= LIFE) { e.points.material.opacity = 0; continue; }
      e.age += dt;
      const attr = e.points.geometry.attributes.position;
      const p = attr.array;
      for (let k = 0; k < PER_BURST; k++) {
        e.vel[k * 3 + 1] -= 9.8 * dt;
        p[k * 3] += e.vel[k * 3] * dt;
        p[k * 3 + 1] += e.vel[k * 3 + 1] * dt;
        p[k * 3 + 2] += e.vel[k * 3 + 2] * dt;
      }
      attr.needsUpdate = true;
      e.points.material.opacity = Math.max(0, 1 - e.age / LIFE);
    }
  }
}
