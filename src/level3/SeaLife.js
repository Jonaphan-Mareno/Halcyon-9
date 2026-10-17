import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Life outside the station (Level 3), all built here in code:
//   - fish schools: one mesh per school (instanced: a draw call each however many fish). Each
//     fish steers like a flock (keep with the school, match its heading, keep apart, run from Voss)
//     after a point that wanders round the school's home; its body wags in the vertex shader
//     (more toward the tail, each fish out of step). Silver fish by the platform, dark ones low
//     round the vents, and small lanternfish with rows of glowing spots
//   - jellyfish (the intro has them): glowing bells that pulse and push themselves up, trailing
//     tentacles that wave, drifting back down out of sight to come up again
//   - something big: one huge, dark fish shape on a slow round far out in the murk, seen only now
//     and then as a shadow
//   - bubbles streaming up from the vents
// Positions are in the level's world metres (three.js axes: y up).

// the canyon floor, as the Blender script shapes it (its axes: x, -z)
export function seabed(x, z) {
  const by = -z;
  return -30 - 0.07 * Math.max(0, -40 - x) + 2.2 * Math.sin(x * 0.05) * Math.cos(by * 0.07);
}

const SCHOOLS = [
  // what, how many, its home (where it wanders round), how far it wanders, length, speed, look
  { name: 'silver', count: 64, home: [-44, -3, -16], range: [9, 4, 9], length: 0.34, speed: 2.4, color: 0xa9bcc6, metal: 0.65 },
  { name: 'vent', count: 44, home: [-54, -21, -20], range: [11, 3, 10], length: 0.55, speed: 1.6, color: 0x3a3330, metal: 0.2 },
  { name: 'lantern', count: 40, home: [-66, -10, -42], range: [14, 6, 12], length: 0.2, speed: 2.0, color: 0x2a3a44, metal: 0.4, glow: 0x5fd6ff }
];

export class SeaLife {
  // scene: where it goes (SeaScene's group, so it shows and hides with the outside)
  constructor(parent, vents) {
    this.parent = parent;
    this.time = 0;
    this.uniforms = { uTime: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.02 } };
    this.schools = SCHOOLS.map((def) => this._school(def));
    this._jellies();
    this._leviathan();
    this._ventBubbles(vents || []);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._zero = new THREE.Vector3();
    this._yUp = new THREE.Vector3(0, 1, 0);
  }

  // ---------------------------------------------------------------- fish
  _fishMaterial(color, metal, glow) {
    const mat = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: 0.38, side: THREE.DoubleSide });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.uniforms.uGlow = { value: new THREE.Color(glow || 0x000000) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          attribute float aTail;
          attribute float aSpot;
          varying float vSpot;
          varying float vBelly;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            // the swimming wag: a wave down the body, growing toward the tail, each fish its own beat
            float ph = float(gl_InstanceID) * 2.37;
            float rate = 9.0 + mod(float(gl_InstanceID), 5.0);
            transformed.x += sin(uTime * rate + ph - aTail * 4.0) * 0.13 * aTail * aTail;
            vSpot = aSpot;
            vBelly = clamp(-position.y * 6.0, 0.0, 1.0);
          }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uGlow;
          varying float vSpot;
          varying float vBelly;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // dark back, pale belly (as fish are)
          diffuseColor.rgb *= mix(0.55, 1.25, vBelly);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += uGlow * vSpot * 2.5;`);
    };
    mat.customProgramCacheKey = () => 'sea-fish' + (glow ? '-glow' : '');
    return mat;
  }

  _school(def) {
    const geo = fishGeometry({ spots: !!def.glow });
    const mesh = new THREE.InstancedMesh(geo, this._fishMaterial(def.color, def.metal, def.glow), def.count);
    mesh.frustumCulled = false;
    this.parent.add(mesh);
    const home = new THREE.Vector3(...def.home);
    const fish = [];
    for (let i = 0; i < def.count; i++) {
      const p = home.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6));
      const v = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.2, Math.random() - 0.5).setLength(def.speed);
      fish.push({ p, v, size: def.length * (0.8 + Math.random() * 0.45) });
    }
    return { def, mesh, home, fish, target: home.clone(), seed: Math.random() * 100 };
  }

  _schoolStep(sc, dt, player) {
    const { def, fish, home, target } = sc;
    const t = this.time + sc.seed;
    // the point the school follows wanders round its home
    target.set(home.x + Math.sin(t * 0.07) * def.range[0], home.y + Math.sin(t * 0.11) * def.range[1], home.z + Math.cos(t * 0.06) * def.range[2]);
    const avg = this._v.set(0, 0, 0);
    for (const f of fish) avg.add(f.v);
    avg.divideScalar(fish.length);
    const steer = new THREE.Vector3();
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      steer.set(0, 0, 0);
      steer.addScaledVector(this._s.copy(target).sub(f.p), 0.35);                 // keep with the school
      steer.addScaledVector(this._s.copy(avg).sub(f.v), 0.8);                     // swim the way it swims
      for (let j = 0; j < fish.length; j++) {                                      // keep apart
        if (j === i) continue;
        const o = fish[j];
        const dx = f.p.x - o.p.x, dy = f.p.y - o.p.y, dz = f.p.z - o.p.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 0.5 && d2 > 1e-6) steer.x += dx / d2 * 0.6, steer.y += dy / d2 * 0.6, steer.z += dz / d2 * 0.6;
      }
      if (player) {                                                                // run from the diver
        const dx = f.p.x - player.x, dy = f.p.y - (player.y + 1), dz = f.p.z - player.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < 5) steer.x += dx / d * 14 / d, steer.y += dy / d * 14 / d, steer.z += dz / d * 14 / d;
      }
      const floor = seabed(f.p.x, f.p.z) + 2.5;                                    // stay off the seabed
      if (f.p.y < floor) steer.y += (floor - f.p.y) * 4;
      f.v.addScaledVector(steer, dt);
      const sp = f.v.length();
      const max = def.speed * 1.8, min = def.speed * 0.5;
      if (sp > max) f.v.multiplyScalar(max / sp);
      else if (sp < min) f.v.multiplyScalar(min / Math.max(sp, 1e-4));
      f.v.y *= 0.96;                                                               // (fish swim level)
      f.p.addScaledVector(f.v, dt);
      // face the way it swims (the model's nose is -z)
      this._m.lookAt(this._zero, this._s.copy(f.v).normalize(), this._yUp);
      this._q.setFromRotationMatrix(this._m);
      this._m.compose(f.p, this._q, this._s.setScalar(f.size));
      sc.mesh.setMatrixAt(i, this._m);
    }
    sc.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- jellyfish
  _jellies() {
    const n = 14;
    const geo = jellyGeometry();
    const u = this.uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute float aPart;      // 0 the bell, 1 a tentacle
        attribute float aAlong;     // down a tentacle 0..1 (the bell: how far out from the top)
        uniform float uTime;
        varying float vPart;
        varying float vAlong;
        varying float vRim;
        varying float vDepth;
        varying float vHue;
        void main() {
          float id = float(gl_InstanceID);
          float beat = pow(0.5 + 0.5 * sin(uTime * 1.9 + id * 1.7), 3.0);    // the bell squeezes, then lets go
          vec3 p = position;
          if (aPart < 0.5) {
            p.xz *= 1.0 - 0.22 * beat * aAlong;
            p.y += 0.06 * beat * aAlong;
          } else {
            float w = uTime * 1.6 + id * 2.1 + aAlong * 5.0;
            p.x += sin(w) * 0.12 * aAlong;
            p.z += cos(w * 0.8) * 0.12 * aAlong;
            p.y *= 1.0 - 0.15 * beat;
          }
          vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vec4 mv = viewMatrix * world;
          gl_Position = projectionMatrix * mv;
          vec3 n = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
          vRim = 1.0 - abs(dot(normalize(-mv.xyz), n));
          vPart = aPart;
          vAlong = aAlong;
          vDepth = -mv.z;
          vHue = fract(id * 0.37);
        }`,
      fragmentShader: /* glsl */`
        uniform float uFogDensity;
        varying float vPart;
        varying float vAlong;
        varying float vRim;
        varying float vDepth;
        varying float vHue;
        void main() {
          vec3 a = vec3(0.45, 0.35, 1.0), b = vec3(0.3, 0.95, 1.0), c = vec3(1.0, 0.45, 0.85);
          vec3 col = vHue < 0.4 ? mix(a, b, vHue / 0.4) : mix(b, c, (vHue - 0.4) / 0.6);
          // the bell is clear in the middle and glows at its rim and its crown
          float glow = vPart < 0.5 ? (0.04 + pow(vRim, 2.5) * 0.95 + pow(1.0 - vAlong, 3.0) * 0.12) : (1.0 - vAlong) * 0.4;
          float through = exp(-pow(uFogDensity * vDepth * 0.8, 2.0));
          gl_FragColor = vec4(col * glow * through * 0.55, 1.0);
        }`
    });
    this.jellyMesh = new THREE.InstancedMesh(geo, mat, n);
    this.jellyMesh.frustumCulled = false;
    this.jellyMesh.renderOrder = 6;
    this.parent.add(this.jellyMesh);
    this.jelly = [];
    for (let i = 0; i < n; i++) {
      this.jelly.push({
        p: new THREE.Vector3(-30 - Math.random() * 45, -24 + Math.random() * 30, -48 + Math.random() * 52),
        size: 0.6 + Math.random() * 0.9, spin: Math.random() * Math.PI * 2, drift: new THREE.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1)
      });
    }
  }

  _jellyStep(dt) {
    for (let i = 0; i < this.jelly.length; i++) {
      const j = this.jelly[i];
      // each squeeze pushes it up a little; between them it sinks back a touch
      const beat = Math.pow(0.5 + 0.5 * Math.sin(this.time * 1.9 + i * 1.7), 3);
      j.p.y += (beat * 0.42 - 0.06) * dt;
      j.p.addScaledVector(j.drift, dt);
      j.spin += dt * 0.1;
      if (j.p.y > 12) j.p.y = -26;          // (gone up out of sight: comes up again from the deep)
      this._q.setFromAxisAngle(this._yUp, j.spin);
      this._m.compose(j.p, this._q, this._s.setScalar(j.size));
      this.jellyMesh.setMatrixAt(i, this._m);
    }
    this.jellyMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- something big, far out
  _leviathan() {
    const geo = fishGeometry({ long: true });
    const mat = new THREE.MeshStandardMaterial({ color: 0x0b1114, roughness: 0.85, metalness: 0.0 });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aTail;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.x += sin(uTime * 1.3 - aTail * 3.0) * 0.1 * aTail * aTail;`);
    };
    mat.customProgramCacheKey = () => 'sea-leviathan';
    this.big = new THREE.Mesh(geo, mat);
    this.big.scale.setScalar(14);
    this.parent.add(this.big);
  }

  _leviathanStep() {
    // a wide slow round out in the murk, rising and falling
    const t = this.time * 0.012 + 1.3;
    const x = -80 + Math.cos(t * Math.PI * 2) * 48, z = -14 + Math.sin(t * Math.PI * 2) * 40, y = -10 + Math.sin(t * 9.0) * 6;
    const nx = -80 + Math.cos((t + 0.002) * Math.PI * 2) * 48, nz = -14 + Math.sin((t + 0.002) * Math.PI * 2) * 40;
    this.big.position.set(x, y, z);
    this._m.lookAt(this._zero, this._s.set(nx - x, 0, nz - z).normalize(), this._yUp);
    this.big.quaternion.setFromRotationMatrix(this._m);
  }

  // ---------------------------------------------------------------- vent bubbles
  _ventBubbles(vents) {
    const per = 70;
    const n = vents.length * per;
    if (!n) return;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = vents[Math.floor(i / per)].top;
      pos[i * 3] = v.x + (Math.random() - 0.5) * 1.2;
      pos[i * 3 + 1] = v.y - 0.3;
      pos[i * 3 + 2] = v.z + (Math.random() - 0.5) * 1.2;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.PointsMaterial({ color: 0xcfeeff, size: 0.12, transparent: true, opacity: 0.55, depthWrite: false, map: bubbleTexture() });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aSeed;')
        .replace('#include <begin_vertex>', `
          // rising from the chimney, wobbling, faster as they go; each starts again at the bottom
          float age = fract(uTime / 9.0 + aSeed);
          vec3 transformed = position + vec3(sin(uTime * 3.0 + aSeed * 40.0) * 0.25, age * age * 24.0 + age * 4.0,
                                             cos(uTime * 2.6 + aSeed * 31.0) * 0.25);`);
    };
    mat.customProgramCacheKey = () => 'sea-vent-bubbles';
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.parent.add(pts);
  }

  // player: where Voss is (the fish keep away), fog: the scene's fog
  update(dt, player, fog) {
    this.time += dt;
    const u = this.uniforms;
    u.uTime.value = this.time;
    u.uFogColor.value.copy(fog.color);
    u.uFogDensity.value = fog.density;
    for (const sc of this.schools) this._schoolStep(sc, dt, player);
    this._jellyStep(dt);
    this._leviathanStep();
  }
}

// A fish, nose toward -z, one unit long: a lathed body (oval in section: taller than wide), a
// forked tail, a back fin and two side fins. aTail: 0 at the nose to 1 at the tail's tip (how much
// that part wags); aSpot: glowing spots along the belly (lanternfish).
function fishGeometry({ spots = false, long = false } = {}) {
  const prof = long
    ? [[0, 0], [0.05, 0.04], [0.08, 0.14], [0.09, 0.3], [0.08, 0.5], [0.06, 0.68], [0.035, 0.82], [0.02, 0.9]]
    : [[0, 0], [0.07, 0.05], [0.12, 0.16], [0.14, 0.32], [0.12, 0.5], [0.08, 0.66], [0.04, 0.78], [0.025, 0.84]];
  const pts = prof.map(([r, t]) => new THREE.Vector2(r, -(t - 0.5)));
  let body = new THREE.LatheGeometry(pts, 10);
  body.rotateX(-Math.PI / 2);          // the lathe's axis (y) becomes z: nose at -z
  body.scale(0.75, 1.0, 1.0);          // narrower than tall
  body = body.toNonIndexed();
  // fins as thin triangles
  const tri = (a, b, c) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    return g;
  };
  const tz = 0.34, tip = 0.5;
  const parts = [body,
    tri([0, 0, tz], [0, long ? 0.2 : 0.17, tip], [0, 0.02, tz - 0.04]),           // the tail's two lobes
    tri([0, 0, tz], [0, long ? -0.12 : -0.17, tip], [0, -0.02, tz - 0.04]),
    tri([0, 0.1, -0.12], [0, long ? 0.26 : 0.2, 0.02], [0, 0.08, 0.12]),           // the back fin
    tri([0.07, -0.04, -0.12], [0.16, -0.08, 0.0], [0.06, -0.05, 0.02]),            // side fins
    tri([-0.07, -0.04, -0.12], [-0.16, -0.08, 0.0], [-0.06, -0.05, 0.02])];
  const g = mergeGeometries(parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k);
    return q;
  }));
  const pos = g.attributes.position;
  const tail = new Float32Array(pos.count), spot = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    tail[i] = THREE.MathUtils.clamp((z + 0.5) / 1.0, 0, 1);
    // lanternfish: little lights in a row along the lower flank
    if (spots && pos.getY(i) < -0.05 && z > -0.3 && z < 0.25 && Math.abs(Math.sin(z * 40)) > 0.6) spot[i] = 1;
  }
  g.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
  g.setAttribute('aSpot', new THREE.BufferAttribute(spot, 1));
  g.computeVertexNormals();
  return g;
}

// A jellyfish, about a metre: a domed bell with a frilled edge, and tentacles hanging below.
// aPart: 0 bell, 1 tentacle; aAlong: how far down a tentacle (on the bell: out from its top).
function jellyGeometry() {
  const prof = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 0.5;
    prof.push(new THREE.Vector2(Math.sin(a) * 0.36, Math.cos(a) * 0.28));
  }
  prof.push(new THREE.Vector2(0.38, -0.03), new THREE.Vector2(0.33, -0.06));     // the frill
  const bell = new THREE.LatheGeometry(prof, 20).toNonIndexed();
  for (const k of Object.keys(bell.attributes)) if (!['position', 'normal', 'uv'].includes(k)) bell.deleteAttribute(k);
  const parts = [bell];
  const N = 10;
  for (let t = 0; t < N; t++) {
    const a = (t / N) * Math.PI * 2;
    const r = 0.22 + (t % 2) * 0.08;
    const len = 0.9 + (t % 3) * 0.45;
    const strip = new THREE.PlaneGeometry(0.025, len, 1, 8).toNonIndexed();
    strip.translate(0, -len / 2 - 0.02, 0);
    strip.rotateY(a);
    strip.translate(Math.cos(a) * r, 0, Math.sin(a) * r);
    for (const k of Object.keys(strip.attributes)) if (!['position', 'normal', 'uv'].includes(k)) strip.deleteAttribute(k);
    parts.push(strip);
  }
  const g = mergeGeometries(parts);
  const pos = g.attributes.position;
  const part = new Float32Array(pos.count), along = new Float32Array(pos.count);
  const bellCount = bell.attributes.position.count;
  for (let i = 0; i < pos.count; i++) {
    if (i < bellCount) {
      along[i] = THREE.MathUtils.clamp(Math.hypot(pos.getX(i), pos.getZ(i)) / 0.38, 0, 1);
    } else {
      part[i] = 1;
      along[i] = THREE.MathUtils.clamp(-pos.getY(i) / 2.0, 0, 1);
    }
  }
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  return g;
}

// a bubble: a thin bright ring, clear in the middle
function bubbleTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 6, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,0.15)');
  grad.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(16, 16, 15, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
