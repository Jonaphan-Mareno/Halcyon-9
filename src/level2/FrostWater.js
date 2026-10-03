import * as THREE from 'three';

// Water you can freeze. The surface is split into a grid of cells; frost sprayed on it builds
// up in the cells it hits, and a cell that gets cold enough turns to ice.
//
//   kind 'pool': deep water. A frozen cell becomes a solid slab of ice you can stand on.
//   kind 'film': a thin layer of water over a solid floor or ramp. It slows you down (wading);
//                frozen, it is slippery, so on a slope it becomes a slide.
//
// One mesh per body of water. A small data texture (one texel per cell) tells the shader how
// frozen each cell is, and the shader blends rippling water into cracked ice cell by cell.

const vertexShader = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */`
  uniform sampler2D uMask;
  uniform float uTime;
  uniform vec2 uSize;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    float f = texture2D(uMask, vUv).r;
    vec2 p = vUv * uSize;

    // water: teal, gently rippling, with small glints
    float rip = sin(p.x * 2.1 + uTime * 1.7) * sin(p.y * 1.7 - uTime * 1.3) * 0.5 + 0.5;
    rip = mix(rip, noise(p * 1.3 + uTime * 0.3), 0.4);
    vec3 water = mix(vec3(0.01, 0.07, 0.10), vec3(0.04, 0.22, 0.27), rip);
    water += vec3(0.7, 0.95, 1.0) * pow(rip, 10.0) * 0.35;

    // ice: pale blue-white, cloudy, with cracks along irregular plates
    float n = noise(p * 2.5);
    vec2 g = fract(p * 0.7 + noise(p * 0.8) * 0.4) - 0.5;
    float crack = smoothstep(0.46, 0.5, max(abs(g.x), abs(g.y)));
    vec3 ice = mix(vec3(0.78, 0.9, 0.97), vec3(0.96, 0.99, 1.0), n) - crack * 0.3;

    float frozen = smoothstep(0.8, 1.0, f);
    float frosting = smoothstep(0.05, 0.8, f) * (1.0 - frozen);   // white frost spreading before it locks
    vec3 col = mix(water, ice, frozen);
    col = mix(col, vec3(0.85, 0.95, 1.0), frosting * 0.65);
    gl_FragColor = vec4(col, mix(0.82, 1.0, max(frozen, frosting)));
  }
`;

export class FrostWater {
  // origin: centre of the surface; tilt: rotation about x (radians) for a sloping film
  constructor({ physics, width, length, cell = 1, origin, tilt = 0, kind = 'pool' }) {
    this.physics = physics;
    this.kind = kind;
    this.cell = cell;
    this.width = width;
    this.length = length;
    this.cols = Math.round(width / cell);
    this.rows = Math.round(length / cell);
    this.frost = new Float32Array(this.cols * this.rows);
    this.colliders = new Array(this.cols * this.rows).fill(null);
    this.frozenCount = 0;

    this.group = new THREE.Group();
    this.group.position.copy(origin);
    this.group.rotation.x = tilt;
    this.group.updateMatrixWorld(true);
    this._inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();

    this.maskData = new Uint8Array(this.cols * this.rows * 4);
    this.mask = new THREE.DataTexture(this.maskData, this.cols, this.rows);
    this.mask.magFilter = THREE.LinearFilter;
    this.mask.minFilter = THREE.LinearFilter;
    this.mask.needsUpdate = true;

    const geo = new THREE.PlaneGeometry(width, length);
    geo.rotateX(-Math.PI / 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true,
      uniforms: { uMask: { value: this.mask }, uTime: { value: 0 }, uSize: { value: new THREE.Vector2(width, length) } }
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.group.add(this.mesh);

    // which way is downhill, for sliding (world space, flat)
    const down = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    this.slope = Math.abs(Math.sin(tilt));
    this.downhill = new THREE.Vector3(down.x, 0, down.z).normalize().multiplyScalar(Math.sign(down.y) < 0 ? 1 : -1);
    this._v = new THREE.Vector3();
    this._dirty = false;
  }

  _local(world) {
    return this._v.copy(world).applyMatrix4(this._inv);
  }

  _index(local) {
    const c = Math.floor((local.x + this.width / 2) / this.cell);
    const r = Math.floor((local.z + this.length / 2) / this.cell);
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return -1;
    return r * this.cols + c;
  }

  // Is a world point above (or on) this water, within `height` of the surface?
  covers(world, height = 0.8) {
    const l = this._local(world);
    return Math.abs(l.x) <= this.width / 2 && Math.abs(l.z) <= this.length / 2 && l.y > -height && l.y < height;
  }

  isFrozenAt(world) {
    const i = this._index(this._local(world));
    return i >= 0 && this.frost[i] >= 1;
  }

  // Is there ice anywhere under a footprint of this radius? (Voss can stand on the edge of a
  // frozen cell while his centre is over the next one.)
  isFrozenNear(world, radius = 0.4) {
    const l = this._local(world).clone();
    for (const [dx, dz] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]]) {
      const i = this._index(this._v.set(l.x + dx, l.y, l.z + dz));
      if (i >= 0 && this.frost[i] >= 1) return true;
    }
    return false;
  }

  // Add frost around a world point. Returns how many cells froze solid just now.
  applyFrost(world, radius, amount) {
    const l = this._local(world).clone();
    let froze = 0;
    const span = Math.ceil(radius / this.cell);
    const c0 = Math.floor((l.x + this.width / 2) / this.cell);
    const r0 = Math.floor((l.z + this.length / 2) / this.cell);
    for (let r = r0 - span; r <= r0 + span; r++) {
      for (let c = c0 - span; c <= c0 + span; c++) {
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) continue;
        const cx = -this.width / 2 + (c + 0.5) * this.cell;
        const cz = -this.length / 2 + (r + 0.5) * this.cell;
        const d = Math.hypot(cx - l.x, cz - l.z);
        if (d > radius) continue;
        const i = r * this.cols + c;
        if (this.frost[i] >= 1) continue;
        this.frost[i] = Math.min(1, this.frost[i] + amount * (1 - (d / radius) * 0.6));
        // texture rows run the other way along the plane (v = 0 is the far, +z edge)
        this.maskData[((this.rows - 1 - r) * this.cols + c) * 4] = Math.round(this.frost[i] * 255);
        this._dirty = true;
        if (this.frost[i] >= 1) {
          froze++;
          this.frozenCount++;
          if (this.kind === 'pool') this._addIce(c, r);
        }
      }
    }
    return froze;
  }

  // A frozen pool cell becomes a solid slab of ice
  _addIce(c, r) {
    const R = this.physics.RAPIER;
    const p = new THREE.Vector3(-this.width / 2 + (c + 0.5) * this.cell, -0.2, -this.length / 2 + (r + 0.5) * this.cell)
      .applyMatrix4(this.group.matrixWorld);
    const q = this.group.quaternion;
    const body = this.physics.world.createRigidBody(R.RigidBodyDesc.fixed()
      .setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    this.physics.world.createCollider(R.ColliderDesc.cuboid(this.cell / 2, 0.2, this.cell / 2), body);
    this.colliders[r * this.cols + c] = body;
  }

  reset() {
    this.frost.fill(0);
    this.maskData.fill(0);
    this._dirty = true;
    this.frozenCount = 0;
    this.colliders.forEach((b, i) => {
      if (b) this.physics.world.removeRigidBody(b);
      this.colliders[i] = null;
    });
  }

  update(dt) {
    this.material.uniforms.uTime.value += dt;
    if (this._dirty) {
      this.mask.needsUpdate = true;
      this._dirty = false;
    }
  }
}
