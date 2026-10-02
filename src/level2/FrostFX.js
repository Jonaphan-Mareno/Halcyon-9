import * as THREE from 'three';

// One particle system for every cold effect: the frost stream out of the hose, the mist where
// it lands, and the ice shards when something shatters. A fixed pool of particles (no
// allocation while playing), drawn as soft round points with a small custom shader.

const MAX = 900;

const vertexShader = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (260.0 / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */`
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vColor, vAlpha * soft);
  }
`;

export class FrostFX {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.color = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);      // remaining
    this.maxLife = new Float32Array(MAX);
    this.grow = new Float32Array(MAX);      // size change per second
    this.gravity = new Float32Array(MAX);
    this.drag = new Float32Array(MAX);
    this.next = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3));
    this.geo = geo;
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._v = new THREE.Vector3();
  }

  _spawn(x, y, z, vx, vy, vz, size, grow, life, r, g, b, gravity, drag) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.size[i] = size; this.grow[i] = grow;
    this.life[i] = life; this.maxLife[i] = life;
    this.color[i * 3] = r; this.color[i * 3 + 1] = g; this.color[i * 3 + 2] = b;
    this.gravity[i] = gravity; this.drag[i] = drag;
  }

  // The frost stream: fast, spreading, growing puffs from the nozzle along `dir`
  stream(from, dir, dt, rate = 240) {
    const n = Math.max(1, Math.round(rate * dt));
    for (let k = 0; k < n; k++) {
      const spread = 0.13;
      const vx = dir.x + (Math.random() - 0.5) * spread * 2;
      const vy = dir.y + (Math.random() - 0.5) * spread * 2;
      const vz = dir.z + (Math.random() - 0.5) * spread * 2;
      const speed = 13 + Math.random() * 5;
      const w = 0.75 + Math.random() * 0.25;
      this._spawn(from.x, from.y, from.z, vx * speed, vy * speed, vz * speed,
        0.12, 1.6, 0.42 + Math.random() * 0.18, 0.55 * w, 0.85 * w, 1.0 * w, -1.5, 2.6);
    }
  }

  // Mist curling up where the frost lands
  mist(at, dt, rate = 40) {
    const n = Math.max(0, Math.round(rate * dt + Math.random() * 0.5));
    for (let k = 0; k < n; k++) {
      this._spawn(at.x + (Math.random() - 0.5) * 0.8, at.y + 0.05, at.z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8,
        0.5, 1.8, 0.9 + Math.random() * 0.5, 0.35, 0.5, 0.6, 0.2, 1.5);
    }
  }

  // Ice shards bursting out of something that shattered
  shatter(at, count = 60) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const up = 2 + Math.random() * 5;
      const out = 2 + Math.random() * 5;
      this._spawn(at.x, at.y + 0.4, at.z, Math.cos(a) * out, up, Math.sin(a) * out,
        0.16 + Math.random() * 0.12, -0.1, 0.7 + Math.random() * 0.5, 0.75, 0.92, 1.0, -14, 0.6);
    }
    for (let k = 0; k < 14; k++) this.mist(at, 0.2, 40);
  }

  // Sparks from a live cable
  sparks(at, count = 6) {
    for (let k = 0; k < count; k++) {
      this._spawn(at.x, at.y, at.z, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6,
        0.08, -0.05, 0.25 + Math.random() * 0.2, 1.0, 0.85, 0.4, -12, 0.5);
    }
  }

  // Steam rising from a vent
  steam(at, dt, rate = 30) {
    const n = Math.max(0, Math.round(rate * dt + Math.random() * 0.5));
    for (let k = 0; k < n; k++) {
      this._spawn(at.x + (Math.random() - 0.5) * 0.5, at.y, at.z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.6, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 0.6,
        0.35, 1.4, 1.2 + Math.random() * 0.6, 0.32, 0.34, 0.36, 0.4, 0.8);
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.gravity[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = Math.max(0.02, this.size[i] + this.grow[i] * dt);
      this.alpha[i] = Math.min(1, t * 1.6) * 0.75;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }
}
