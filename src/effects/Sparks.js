import * as THREE from 'three';

// A pooled spark emitter: short-lived glowing points thrown off the broken
// generator. Everything is allocated once up front and reused, so bursts cost
// no garbage. The look is a small custom vertex + fragment shader: points that
// shrink and cool from white-yellow to orange-red as they die, blended
// additively so they glow against the dark room.

const POOL_SIZE = 180;
const GRAVITY = 6.5;

const vertexShader = `
  attribute float aLife;   // remaining life, 1 -> 0
  attribute float aSize;
  uniform float uPixelScale;
  varying float vLife;

  void main() {
    vLife = aLife;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Shrink as it dies; nearer sparks look bigger (a few pixels at 3 units)
    gl_PointSize = aSize * aLife * uPixelScale / max(0.5, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  varying float vLife;

  void main() {
    // Soft round dot
    float d = length(gl_PointCoord - 0.5);
    float dot = smoothstep(0.5, 0.05, d);

    // Hot white-yellow when fresh, orange-red as it cools
    vec3 hot = vec3(1.0, 0.92, 0.65);
    vec3 cool = vec3(1.0, 0.28, 0.05);
    vec3 color = mix(cool, hot, vLife * vLife);

    gl_FragColor = vec4(color * dot * vLife * 2.0, 1.0);
  }
`;

export class Sparks {
  constructor(scene) {
    this.positions = new Float32Array(POOL_SIZE * 3);
    this.velocities = new Float32Array(POOL_SIZE * 3);
    this.life = new Float32Array(POOL_SIZE);        // seconds left
    this.maxLife = new Float32Array(POOL_SIZE).fill(1);
    this.aLife = new Float32Array(POOL_SIZE);       // 0..1 for the shader
    this.sizes = new Float32Array(POOL_SIZE);
    this.cursor = 0;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('aLife', new THREE.BufferAttribute(this.aLife, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: { uPixelScale: { value: window.devicePixelRatio || 1 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false; // positions change every frame
    scene.add(this.points);
  }

  // Throw `count` sparks from `origin`. `outward` is the horizontal direction
  // they mostly fly in (a unit vector); leave it null for a random spray.
  burst(origin, count = 12, outward = null) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % POOL_SIZE;

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 2.6;
      let vx = Math.cos(angle) * speed * 0.6;
      let vz = Math.sin(angle) * speed * 0.6;
      if (outward) {
        vx += outward.x * speed;
        vz += outward.z * speed;
      }

      const k = i * 3;
      this.positions[k] = origin.x;
      this.positions[k + 1] = origin.y;
      this.positions[k + 2] = origin.z;
      this.velocities[k] = vx;
      this.velocities[k + 1] = 1.0 + Math.random() * 3.2;
      this.velocities[k + 2] = vz;

      this.maxLife[i] = 0.45 + Math.random() * 0.75;
      this.life[i] = this.maxLife[i];
      this.sizes[i] = 30 + Math.random() * 34;
    }
  }

  update(delta) {
    for (let i = 0; i < POOL_SIZE; i++) {
      if (this.life[i] <= 0) {
        this.aLife[i] = 0;
        continue;
      }
      this.life[i] -= delta;
      const k = i * 3;
      this.velocities[k + 1] -= GRAVITY * delta;
      this.positions[k] += this.velocities[k] * delta;
      this.positions[k + 1] += this.velocities[k + 1] * delta;
      this.positions[k + 2] += this.velocities[k + 2] * delta;
      this.aLife[i] = Math.max(0, this.life[i] / this.maxLife[i]);
    }
    const attributes = this.points.geometry.attributes;
    attributes.position.needsUpdate = true;
    attributes.aLife.needsUpdate = true;
    attributes.aSize.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    this.points.removeFromParent();
  }
}
