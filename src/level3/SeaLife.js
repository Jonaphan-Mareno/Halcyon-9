import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createGLTFLoader } from '../core/loaders.js';

// Life outside the station (Level 3), all built here in code:
//   - fish schools: one mesh per school (instanced: a draw call each however many fish). Each
//     fish steers like a flock (keep with the school, match its heading, keep apart, run from Voss)
//     after a point that wanders round the school's home; its body wags in the vertex shader
//     (more toward the tail, each fish out of step). Silver fish by the platform and small quick
//     ones over it, more down in the trench, dark ones low round the vents, small lanternfish
//     with rows of glowing spots, and ghost fish: see-through deep-sea fish whose skeletons glow
//     (spine, ribs, skull, eyes and fin rays drawn in the shader, on a body that is barely there)
//   - jellyfish (the intro has them): glowing bells that swim as real ones do (a quick squeeze
//     that jets them up, a slow relax), their tentacles following the beat late and billowing
//   - anglerfish (modelled in Blender: build_l3_creatures.py) hanging low with glowing lures, which
//     turn to face Voss and ease nearer when he comes close
//   - gulper eels, 5 to 9 m long, huge-mouthed with glowing tail tips, rippling slowly along the
//     canyon floor
//   - something big: one huge, dark fish shape on a slow round far out in the murk, seen only now
//     and then as a shadow
//   - bubbles streaming up from the vents
// Positions are in the level's world metres (three.js axes: y up).

// the canyon floor, as the Blender script shapes it (its axes: x, -z), with the trench the
// station's leg stands in
export function seabed(x, z) {
  const by = -z;
  const trench = 16 * Math.exp(-((x + 2) ** 2 + (by - 22.5) ** 2) / (2 * 22 * 22));
  return -30 - 0.07 * Math.max(0, -40 - x) + 2.2 * Math.sin(x * 0.05) * Math.cos(by * 0.07) - trench;
}

const SCHOOLS = [
  // what, how many, its home (where it wanders round), how far it wanders, length, speed, look
  { name: 'silver', count: 64, home: [-44, -3, -16], range: [9, 4, 9], length: 0.34, speed: 2.4, color: 0xa9bcc6, metal: 0.65 },
  { name: 'darts', count: 40, home: [-41, 4, -31], range: [7, 3, 7], length: 0.22, speed: 2.8, color: 0xc4ccd0, metal: 0.7 },
  { name: 'trench', count: 50, home: [-16, -30, -36], range: [10, 4, 9], length: 0.4, speed: 2.0, color: 0x8fa3ad, metal: 0.55 },
  { name: 'vent', count: 44, home: [-54, -21, -20], range: [11, 3, 10], length: 0.55, speed: 1.6, color: 0x3a3330, metal: 0.2 },
  { name: 'lantern', count: 48, home: [-53, -9, -38], range: [12, 5, 10], length: 0.2, speed: 2.0, color: 0x2a3a44, metal: 0.4, glow: 0x5fd6ff },
  // the ghost fish (ghost: the colour their bones glow): off the platform, in the trench under the
  // atrium, by the vents, and at the kraken's door
  { name: 'ghost', count: 36, home: [-45, -2, -31], range: [10, 4, 9], length: 0.6, speed: 1.4, ghost: 0x62e6ff },
  { name: 'ghost-trench', count: 30, home: [-12, -33, -6], range: [9, 4, 9], length: 0.65, speed: 1.3, ghost: 0xb08cff },
  { name: 'ghost-vent', count: 28, home: [-70, -23, -26], range: [12, 3, 12], length: 0.55, speed: 1.4, ghost: 0x7dffc8 },
  { name: 'ghost-cave', count: 22, home: [12, -34, -36], range: [5, 2, 7], length: 0.7, speed: 1.2, ghost: 0x62e6ff }
];
const FAR = 75;                 // a school further than this from him is out of sight in the murk: not moved

export class SeaLife {
  // scene: where it goes (SeaScene's group, so it shows and hides with the outside)
  constructor(parent, vents) {
    this.parent = parent;
    this.time = 0;
    this.uniforms = { uTime: { value: 0 }, uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.02 } };
    this.schools = SCHOOLS.map((def) => this._school(def));
    this._jellies();
    this._leviathan();
    this._eels();
    this.ready = this._anglers();       // (the anglerfish are a model: loaded)
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
          totalEmissiveRadiance += uGlow * vSpot * 4.0;`);
    };
    mat.customProgramCacheKey = () => 'sea-fish' + (glow ? '-glow' : '');
    return mat;
  }

  // A ghost fish: a body you can see through, faint but for its edges, and a skeleton that glows:
  // the spine, ribs swept back toward the belly, the skull, a bright eye, the rays of its fins.
  // Drawn as light (added on, like the jellyfish), each line smoothed to the size it is on screen
  // (fwidth) so it stays a clean thin line near or far.
  _ghostMaterial(color) {
    const u = this.uniforms;
    return new THREE.ShaderMaterial({
      uniforms: { uTime: u.uTime, uFogDensity: u.uFogDensity, uColor: { value: new THREE.Color(color) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute float aTail;
        attribute float aFin;
        uniform float uTime;
        varying vec3 vLocal;
        varying vec2 vUv;
        varying float vFin;
        varying float vRim;
        varying float vDepth;
        varying float vPulse;
        void main() {
          float id = float(gl_InstanceID);
          vec3 p = position;
          // the swimming wag (as the other fish: a wave down the body, growing toward the tail)
          p.x += sin(uTime * (6.0 + mod(id, 4.0)) + id * 2.37 - aTail * 4.0) * 0.13 * aTail * aTail;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          vec3 n = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
          vRim = 1.0 - abs(dot(normalize(-mv.xyz), n));
          vLocal = position;
          vUv = uv;
          vFin = aFin;
          vDepth = -mv.z;
          vPulse = 0.8 + 0.2 * sin(uTime * 1.7 + id * 1.3);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uFogDensity;
        varying vec3 vLocal;
        varying vec2 vUv;
        varying float vFin;
        varying float vRim;
        varying float vDepth;
        varying float vPulse;
        // 1 on a thin line where x is 0 (hw either side), smooth at whatever size it is on screen
        float line(float x, float hw) {
          float w = fwidth(x);
          return 1.0 - smoothstep(hw - w, hw + w, abs(x));
        }
        // 1 on evenly spaced lines through k (one per unit), each hw of the spacing either side
        float lines(float k, float hw) {
          float w = fwidth(k);
          return 1.0 - smoothstep(hw - w, hw + w, abs(fract(k) - 0.5));
        }
        void main() {
          float z = vLocal.z, y = vLocal.y;    // (the nose at z -0.5, the tail's tip at +0.5)
          float body = 0.04 + pow(vRim, 3.0) * 0.28;
          float bone;
          if (vFin < 0.5) {
            // the spine, from the skull to the tail
            bone = line(y - 0.01, 0.011) * smoothstep(0.42, 0.32, z) * smoothstep(-0.36, -0.28, z);
            // the ribs: arcs down from the spine, swept back toward the belly
            float rib = lines((z + 0.3 * y + 0.26) / 0.045, 0.11) * step(-0.27, z) * step(z, 0.16) * step(y, 0.05);
            bone = max(bone, rib * 0.9);
            // the skull, dimly, and a bright eye
            bone += smoothstep(-0.3, -0.45, z) * 0.35;
            bone += smoothstep(0.03, 0.012, length(vec2(z + 0.37, y - 0.035))) * 2.0;
          } else {
            // the fins: rays fanning out from where each meets the body
            bone = lines(vUv.y / max(vUv.x + vUv.y, 1e-3) * 4.0, 0.12) * 0.7;
            body = 0.03;
          }
          float through = exp(-pow(uFogDensity * vDepth * 0.7, 2.0));
          gl_FragColor = vec4(uColor * (body + bone * 1.5) * vPulse * through, 1.0);
        }`
    });
  }

  _school(def) {
    const geo = fishGeometry({ spots: !!def.glow });
    const mat = def.ghost ? this._ghostMaterial(def.ghost) : this._fishMaterial(def.color, def.metal, def.glow);
    const mesh = new THREE.InstancedMesh(geo, mat, def.count);
    if (def.ghost) mesh.renderOrder = 6;          // (with the jellyfish: light, drawn after the solid things)
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
  // Swimming as jellyfish do: the bell squeezes quickly (narrower and taller), which jets it up,
  // then relaxes slowly, widening, its edge rippling, and it coasts. The tentacles follow the beat
  // late, the delay running down them: they trail straight while it jets and billow out as it
  // relaxes, and over a longer while they stretch out and draw in. Frilled mouth-arms hang in the
  // middle. (The beat is worked out the same way here and in the shader: jellyBeat.)
  _jellies() {
    const n = 16;
    const geo = jellyGeometry();
    const u = this.uniforms;
    const mat = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute float aPart;      // 0 the bell, 1 a tentacle, 2 a mouth-arm
        attribute float aAlong;     // the bell: 0 at its top to 1 at its edge; a tentacle or arm: 0 at its root to 1 at its tip
        uniform float uTime;
        varying float vPart;
        varying float vAlong;
        varying float vRim;
        varying float vDepth;
        varying float vHue;
        varying float vAng;
        // the beat: 0 relaxed .. 1 squeezed; a quick squeeze, a long slow relax
        float beat(float t, float id) {
          float period = 2.2 + fract(id * 0.37) * 1.3;
          float c = fract(t / period + fract(id * 0.618));
          return c < 0.2 ? sin(c / 0.2 * 1.5708) : 1.0 - smoothstep(0.2, 0.95, c);
        }
        void main() {
          float id = float(gl_InstanceID);
          vec3 p = position;
          vec2 out2 = length(p.xz) > 1e-4 ? normalize(p.xz) : vec2(1.0, 0.0);
          float k = beat(uTime, id);
          vAng = atan(p.z, p.x);
          if (aPart < 0.5) {
            // the bell: the edge draws in and the dome rises as it squeezes; the edge flares and
            // ripples as it relaxes
            float squeeze = 1.0 - 0.33 * k * pow(aAlong, 1.3);
            float flare = 1.0 + 0.1 * (1.0 - k) * smoothstep(0.7, 1.0, aAlong);
            p.xz *= squeeze * flare;
            p.y += 0.1 * k * (1.0 - aAlong);
            p.y += 0.018 * sin(vAng * 8.0 + uTime * 3.0) * smoothstep(0.75, 1.0, aAlong);
          } else {
            // the root moves with the bell's edge; further down, the beat arrives later
            float late = beat(uTime - aAlong * (aPart > 1.5 ? 0.5 : 0.8), id);
            float rootSqueeze = 1.0 - 0.33 * k;
            vec2 root = out2 * (length(position.xz) * rootSqueeze);
            float reach = 0.8 + 0.4 * (0.5 + 0.5 * sin(uTime * 0.21 + id * 2.3));    // stretching out, drawing in
            float y = position.y * reach * (1.0 + 0.15 * late);                        // trailing straight in the jet
            vec2 spread = out2 * aAlong * aAlong * (0.32 * (1.0 - late) - 0.08 * late); // billowing out as it relaxes
            float w = uTime * 1.4 + id * 1.9 + aAlong * 6.0;
            vec2 sway = vec2(sin(w), cos(w * 0.8 + 1.1)) * 0.1 * aAlong;
            if (aPart > 1.5) sway *= 1.6;                                              // (the arms curl more)
            p = vec3(root.x + spread.x + sway.x, y, root.y + spread.y + sway.y);
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
        uniform float uTime;
        varying float vPart;
        varying float vAlong;
        varying float vRim;
        varying float vDepth;
        varying float vHue;
        varying float vAng;
        void main() {
          vec3 a = vec3(0.45, 0.35, 1.0), b = vec3(0.3, 0.95, 1.0), c = vec3(1.0, 0.45, 0.85);
          vec3 col = vHue < 0.4 ? mix(a, b, vHue / 0.4) : mix(b, c, (vHue - 0.4) / 0.6);
          float glow;
          if (vPart < 0.5) {
            // clear in the middle, glowing at the rim; four faint lobes inside the crown
            float lobes = smoothstep(0.55, 1.0, cos(vAng * 4.0)) * smoothstep(0.55, 0.15, vAlong) * 0.25;
            glow = 0.035 + pow(vRim, 2.5) * 0.95 + pow(1.0 - vAlong, 3.0) * 0.1 + lobes;
          } else {
            // glowing near the root, fading down; sparks of light running down them
            float spark = pow(0.5 + 0.5 * sin(vAlong * 28.0 - uTime * 4.0), 10.0);
            glow = (1.0 - vAlong) * (vPart > 1.5 ? 0.5 : 0.38) + spark * 0.35 * (1.0 - vAlong * 0.7);
          }
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
      const tilt = new THREE.Euler((Math.random() - 0.5) * 0.5, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.5, 'YXZ');
      this.jelly.push({
        p: new THREE.Vector3(-30 - Math.random() * 45, -26 + Math.random() * 32, -48 + Math.random() * 52),
        size: 0.6 + Math.random() * 0.9, tilt, q: new THREE.Quaternion().setFromEuler(tilt),
        up: new THREE.Vector3(0, 1, 0).applyEuler(tilt), speed: 0
      });
    }
  }

  _jellyStep(dt) {
    for (let i = 0; i < this.jelly.length; i++) {
      const j = this.jelly[i];
      // the squeeze jets it along its own up; between squeezes it coasts and slows, sinking a touch
      const k = jellyBeat(this.time, i);
      j.speed += (0.62 * k * k * j.size - j.speed) * (1 - Math.exp(-(k > 0.6 ? 6 : 1.2) * dt));
      j.p.addScaledVector(j.up, j.speed * dt);
      j.p.y -= 0.03 * dt;
      // it turns slowly, leaning a little one way then the other
      j.tilt.y += dt * 0.05;
      j.tilt.x = Math.sin(this.time * 0.13 + i) * 0.28;
      j.q.setFromEuler(j.tilt);
      j.up.set(0, 1, 0).applyQuaternion(j.q);
      if (j.p.y > 12) j.p.y = -28;          // (gone up out of sight: comes up again from the deep)
      this._m.compose(j.p, j.q, this._s.setScalar(j.size));
      this.jellyMesh.setMatrixAt(i, this._m);
    }
    this.jellyMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- anglerfish
  // Modelled in Blender (build_l3_creatures.py). A few hang low over the seabed and the rocks, their
  // lures glowing, drifting round small rounds; when Voss comes close they turn to face him and
  // ease nearer, the lure brightening. Their tails wag (vertex shader, by how far back a point is).
  async _anglers() {
    let gltf;
    try {
      gltf = await createGLTFLoader().loadAsync('./assets/models/l3-creatures.glb');
    } catch (e) {
      console.warn('The anglerfish failed to load.', e);
      return;
    }
    const src = gltf.scene.getObjectByName('ANGLER');
    const lure = gltf.scene.getObjectByName('PT_Lure')?.position.clone() || new THREE.Vector3(0, 0.4, -0.7);
    if (!src) return;
    const u = this.uniforms;
    src.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.name === 'l3_lure') { m.emissiveIntensity = 2.0; continue; }
        m.side = THREE.DoubleSide;
        m.onBeforeCompile = (shader) => {
          shader.uniforms.uTime = u.uTime;
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              {
                // (the model's nose is at -z: the further back, the more it wags)
                float back = clamp((transformed.z + 0.1) / 0.8, 0.0, 1.0);
                transformed.x += sin(uTime * 3.2 - back * 3.0) * 0.07 * back * back;
              }`);
        };
        m.customProgramCacheKey = () => 'angler-' + m.name;
      }
    });
    const glowTex = glowTexture();
    const spots = [[-40, -14, -27], [-57, -21, -12], [-49, -24, -38], [-33, -9, -9], [-66, -26, -30]];
    // each part of the model (skin, teeth, eyes, lure...) is one instanced mesh for all of them
    src.updateMatrixWorld(true);
    this.anglerParts = [];
    src.traverse((o) => {
      if (!o.isMesh) return;
      const part = new THREE.InstancedMesh(o.geometry, o.material, spots.length);
      part.frustumCulled = false;
      this.parent.add(part);
      this.anglerParts.push({ mesh: part, local: o.matrixWorld.clone() });
    });
    this.anglers = spots.map(([x, y, z], i) => {
      const fish = new THREE.Object3D();      // (only its matrix is used)
      const size = 0.9 + (i % 3) * 0.35;
      fish.scale.setScalar(size);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0x7fffe8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8
      }));
      halo.position.copy(lure);
      halo.scale.setScalar(0.5);
      fish.add(halo);
      this.parent.add(fish);
      const home = new THREE.Vector3(x, Math.max(y, seabed(x, z) + 1.5), z);
      return { fish, halo, home, p: home.clone(), yaw: Math.random() * Math.PI * 2, seed: i * 1.7, size, eager: 0 };
    });
  }

  _anglerStep(dt, player) {
    if (!this.anglers) return;
    for (const a of this.anglers) {
      const t = this.time * 0.15 + a.seed;
      // a slow small round about its spot, bobbing
      const want = this._v.set(a.home.x + Math.sin(t) * 2.5, a.home.y + Math.sin(t * 1.7) * 0.6, a.home.z + Math.cos(t * 0.8) * 2.5);
      let face = Math.atan2(-(want.x - a.p.x), -(want.z - a.p.z));
      let near = 0;
      if (player) {
        const dx = player.x - a.p.x, dy = player.y + 1 - a.p.y, dz = player.z - a.p.z;
        const d = Math.hypot(dx, dy, dz);
        near = THREE.MathUtils.smoothstep(9 - d, 0, 5);                 // within about 9 m it takes notice
        if (near > 0) {
          face = Math.atan2(-dx, -dz);                                   // turns to face him
          if (d > 2.6) want.lerp(this._s.set(player.x, player.y + 1, player.z), near * 0.35);
        }
      }
      a.p.lerp(want, 1 - Math.exp(-0.35 * dt));
      let d = face - a.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.yaw += d * (1 - Math.exp(-0.8 * dt));
      a.eager += (near - a.eager) * (1 - Math.exp(-2 * dt));
      a.fish.position.copy(a.p);
      a.fish.rotation.set(Math.sin(this.time * 0.9 + a.seed) * 0.06, a.yaw, 0);
      // the lure flickers, and brightens when it has noticed him
      const flick = 0.75 + 0.25 * Math.sin(this.time * 5.3 + a.seed * 3) * Math.sin(this.time * 2.1 + a.seed);
      a.halo.material.opacity = (0.45 + 0.55 * a.eager) * flick;
      a.halo.scale.setScalar((0.45 + 0.35 * a.eager) * flick);
    }
    // place every part of every fish
    for (let i = 0; i < this.anglers.length; i++) {
      const f = this.anglers[i].fish;
      f.updateMatrix();
      for (const part of this.anglerParts) {
        part.mesh.setMatrixAt(i, this._m.multiplyMatrices(f.matrix, part.local));
      }
    }
    for (const part of this.anglerParts) part.mesh.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- gulper eels
  // Long, thin, black, with a huge loose mouth-pouch and a whip of a tail ending in a pink light.
  // Each swims slowly along a wandering path low in the canyon, a ripple running down its body.
  _eels() {
    const u = this.uniforms;
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aAlong;\nvarying float vAlong;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            // the swimming ripple: a wave running from head to tail, growing along the body
            float ph = float(gl_InstanceID) * 2.0;
            transformed.x += sin(uTime * 2.0 + ph - aAlong * 14.0) * 0.06 * (0.15 + aAlong * 1.6);
            transformed.y += sin(uTime * 1.3 + ph - aAlong * 9.0) * 0.015 * aAlong;
            vAlong = aAlong;
          }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vAlong;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // the glowing tip of the tail, pulsing
          totalEmissiveRadiance += vec3(1.0, 0.25, 0.45) * smoothstep(0.965, 0.995, vAlong) * (1.6 + 0.8 * sin(uTime * 4.0));`);
    };
    mat.customProgramCacheKey = () => 'sea-eel';
    const geo = eelGeometry();
    const defs = [
      { len: 5.0, home: [-50, -22, -24], range: [14, 3, 12], speed: 0.09 },
      { len: 7.0, home: [-36, -30, -14], range: [10, 4, 14], speed: 0.07 },
      { len: 9.0, home: [-68, -24, -6], range: [16, 4, 18], speed: 0.055 }
    ];
    this.eelMesh = new THREE.InstancedMesh(geo, mat, defs.length);
    this.eelMesh.frustumCulled = false;
    this.parent.add(this.eelMesh);
    this.eels = defs.map((d, i) => ({ ...d, home: new THREE.Vector3(...d.home), p: new THREE.Vector3(...d.home), seed: i * 2.9 + 1, dir: new THREE.Vector3(1, 0, 0) }));
  }

  _eelStep(dt) {
    if (!this.eels) return;
    for (let i = 0; i < this.eels.length; i++) {
      const e = this.eels[i];
      // the head follows a wandering path; the body lies along the way it is going
      const t = this.time * e.speed + e.seed;
      const target = this._v.set(e.home.x + Math.sin(t) * e.range[0], e.home.y + Math.sin(t * 1.9) * e.range[1], e.home.z + Math.cos(t * 1.3) * e.range[2]);
      const floor = seabed(target.x, target.z) + 1.5;
      if (target.y < floor) target.y = floor;
      const step = this._s.copy(target).sub(e.p);
      if (step.lengthSq() > 1e-6) e.dir.lerp(step.normalize(), 1 - Math.exp(-0.8 * dt)).normalize();
      e.p.lerp(target, 1 - Math.exp(-0.6 * dt));
      this._m.lookAt(this._zero, e.dir, this._yUp);
      this._q.setFromRotationMatrix(this._m);
      this._m.compose(e.p, this._q, this._s.setScalar(e.len));
      this.eelMesh.setMatrixAt(i, this._m);
    }
    this.eelMesh.instanceMatrix.needsUpdate = true;
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
    for (const sc of this.schools) {
      if (player && sc.target.distanceTo(player) > FAR) continue;
      this._schoolStep(sc, dt, player);
    }
    this._jellyStep(dt);
    this._anglerStep(dt, player);
    this._eelStep(dt);
    this._leviathanStep();
  }
}

// A fish, nose toward -z, one unit long: a lathed body (oval in section: taller than wide), a
// forked tail, a back fin and two side fins. aTail: 0 at the nose to 1 at the tail's tip (how much
// that part wags); aSpot: glowing spots along the belly (lanternfish); aFin: 1 on the fins.
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
  const tail = new Float32Array(pos.count), spot = new Float32Array(pos.count), fin = new Float32Array(pos.count);
  const bodyCount = parts[0].attributes.position.count;     // (the body first, then the fins)
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    fin[i] = i >= bodyCount ? 1 : 0;
    tail[i] = THREE.MathUtils.clamp((z + 0.5) / 1.0, 0, 1);
    // lanternfish: little lights in a row along the lower flank
    if (spots && pos.getY(i) < -0.05 && z > -0.3 && z < 0.25 && Math.abs(Math.sin(z * 40)) > 0.6) spot[i] = 1;
  }
  g.setAttribute('aTail', new THREE.BufferAttribute(tail, 1));
  g.setAttribute('aSpot', new THREE.BufferAttribute(spot, 1));
  g.setAttribute('aFin', new THREE.BufferAttribute(fin, 1));       // (the ghost fish: fins have rays, not ribs)
  g.computeVertexNormals();
  return g;
}

// the jellyfish's beat, as the shader works it out: 0 relaxed .. 1 squeezed
function jellyBeat(t, id) {
  const fract = (x) => x - Math.floor(x);
  const period = 2.2 + fract(id * 0.37) * 1.3;
  const c = fract(t / period + fract(id * 0.618));
  return c < 0.2 ? Math.sin(c / 0.2 * 1.5708) : 1 - THREE.MathUtils.smoothstep(c, 0.2, 0.95);
}

// A jellyfish, about a metre across: a domed bell with a frilled edge, sixteen tentacles round its
// edge and four frilled mouth-arms in the middle. The tentacles and arms are laid out hanging in
// -y with their root at y 0 (the shader moves them). aPart: 0 bell, 1 tentacle, 2 mouth-arm;
// aAlong: the bell, 0 top to 1 edge; a tentacle or arm, 0 root to 1 tip.
function jellyGeometry() {
  const prof = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * Math.PI * 0.5;
    prof.push(new THREE.Vector2(Math.sin(a) * 0.36, Math.cos(a) * 0.3));
  }
  prof.push(new THREE.Vector2(0.39, -0.03), new THREE.Vector2(0.35, -0.065));     // the frilled edge
  const bell = new THREE.LatheGeometry(prof, 24).toNonIndexed();
  const keep = (g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; };
  keep(bell);
  const parts = [bell];
  const kinds = [0];
  // tentacles: thin tubes hanging from just inside the edge, long and short in turn
  for (let t = 0; t < 16; t++) {
    const a = (t / 16) * Math.PI * 2;
    const r = 0.33;
    const len = 1.0 + (t % 3) * 0.55 + (t % 2) * 0.25;
    const tube = new THREE.CylinderGeometry(0.008, 0.003, len, 3, 12, true);
    tube.translate(0, -len / 2, 0);
    tube.translate(Math.cos(a) * r, -0.05, Math.sin(a) * r);
    parts.push(keep(tube.toNonIndexed()));
    kinds.push(1);
  }
  // mouth-arms: four wider frilled ribbons from the middle, crossed so they show from any side
  for (let t = 0; t < 4; t++) {
    const a = (t / 4) * Math.PI * 2 + 0.4;
    const len = 0.7 + (t % 2) * 0.25;
    for (const turn of [0, Math.PI / 2]) {
      const strip = new THREE.PlaneGeometry(0.07, len, 1, 12);
      const pos = strip.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * (1 + 0.6 * Math.sin(pos.getY(i) * 22)));   // the frill
      strip.translate(0, -len / 2, 0);
      strip.rotateY(a + turn);
      strip.translate(Math.cos(a) * 0.06, -0.06, Math.sin(a) * 0.06);
      parts.push(keep(strip.toNonIndexed()));
      kinds.push(2);
    }
  }
  const g = mergeGeometries(parts);
  const pos = g.attributes.position;
  const part = new Float32Array(pos.count), along = new Float32Array(pos.count);
  let i = 0;
  parts.forEach((pg, n) => {
    const count = pg.attributes.position.count;
    const len = n === 0 ? 0 : (() => { let lo = 0; for (let k = 0; k < count; k++) lo = Math.min(lo, pg.attributes.position.getY(k)); return -lo; })();
    for (let k = 0; k < count; k++, i++) {
      part[i] = kinds[n];
      along[i] = kinds[n] === 0 ? THREE.MathUtils.clamp(Math.hypot(pos.getX(i), pos.getZ(i)) / 0.39, 0, 1)
        : THREE.MathUtils.clamp((-pos.getY(i) - 0.05) / Math.max(0.01, len - 0.05), 0, 1);
    }
  });
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  return g;
}

// A gulper eel, one unit long, head at -z: a big loose mouth-pouch (wide, deep, open at the front:
// a dark hollow), tiny eyes, then a long body thinning to a whip of a tail. aAlong: 0 at the
// mouth to 1 at the tail's tip.
function eelGeometry() {
  const rings = 90, sides = 10;
  const pos = [], along = [], idx = [];
  const radius = (t) => {
    // the mouth: wide open at the very front (a huge scoop, deeper below), narrowing quickly into
    // the body, then the whip
    if (t < 0.14) {
      const k = t / 0.14;
      const open = Math.pow(1 - k, 0.6);
      return [0.03 + 0.075 * open, 0.026 + 0.09 * open];
    }
    const k = (t - 0.14) / 0.86;
    const r = 0.022 * (1 - k) * (1 - k) + 0.0025;
    return [r, r * 1.15];
  };
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const z = -0.5 + t;
    const [rx, ry] = radius(t);
    for (let j = 0; j < sides; j++) {
      const a = (j / sides) * Math.PI * 2;
      // (the pouch hangs low: the lower half of the front deeper than the upper)
      const sag = t < 0.14 && Math.sin(a) < 0 ? 1.35 : 1.0;
      pos.push(Math.cos(a) * rx, Math.sin(a) * ry * sag, z);
      along.push(t);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + (j + 1) % sides, c = (i + 1) * sides + j, d = (i + 1) * sides + (j + 1) % sides;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// a soft round glow (the anglerfish's lure)
function glowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
