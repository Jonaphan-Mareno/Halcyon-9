import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { seabed } from './SeaLife.js';

// Seaweed on the seabed outside the station (Level 3), all built here in code:
//   - giant kelp, 8 to 24 m tall: a wavy stalk with long blades off it in turn, each on a small
//     gas float. A forest of it below and beyond the platform (the tallest, nearly 40 m, sway up
//     level with it, so it shows from up there), round the station's foot in the trench under the atrium, by
//     the vents, and outside the kraken's cave. Some of it glows: its floats shine, a slow wave of
//     light running up the stalk
//   - ribbon weed, 1.5 to 6 m: clumps of long thin fronds, low on the floor round the vents and
//     the cave, and lining the kraken's tunnel and lair (there all of it glows, teal and violet)
// All of it leans and sways with a slow current (vertex shader: the root stays put, the top moves
// most), the blades and fronds fluttering on top of that. Each kind is one instanced mesh per
// area (west: the platform's side; east: the trench and the cave), so a few draw calls in all,
// each culled when it is out of view.
//
// Where it grows is found by casting rays down onto the real seabed (and across the cave to
// find its walls), so it is placed once the physics world can answer them (place(), called each
// frame until it has worked: a collider added before the world's first step cannot be hit yet).

const KELP_COLORS = [0x6a7a35, 0x5b7038, 0x7a7a3a, 0x4e6a3a, 0x75703a];
const WEED_COLORS = [0x3f6a4a, 0x5a6a2e, 0x4a5f3c, 0x6a5c33];
const GLOWS = [0x47f0ff, 0x6dffc8, 0xa98bff, 0x5fd6ff, 0xff8fd8];
const LAIR_GLOWS = [0x47f0ff, 0xa98bff, 0x6dffc8];
const LAIR_BRIGHT = 1.8;            // (the lair is darkest: its weed glows strongest)

export class SeaWeed {
  // parent: the sea's group; physics: for the rays; at: the cave's points (mouth, caveIn, lair)
  constructor(parent, physics, { vents = [], cave = {} } = {}) {
    this.parent = parent;
    this.physics = physics;
    this.vents = vents;
    this.cave = cave;
    this.uniforms = { uTime: { value: 0 } };
    this.material = this._material();
    this.kelpGeo = kelpGeometry();
    this.weedGeo = weedGeometry();
    this.placed = false;
    this._jobs = null;
    // (the meshes exist from the start, empty, so the shader is compiled with the rest of the sea)
    this.meshes = {
      westKelp: this._mesh(this.kelpGeo, 150), westWeed: this._mesh(this.weedGeo, 120),
      eastKelp: this._mesh(this.kelpGeo, 110), eastWeed: this._mesh(this.weedGeo, 220)
    };
  }

  _mesh(geo, max) {
    const mesh = new THREE.InstancedMesh(geo, this.material, max);
    mesh.count = 0;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    // the glow's colour (black: it does not glow) and each plant's own phase
    mesh.geometry = geo.clone();
    mesh.geometry.setAttribute('aTint', new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3));
    mesh.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(max), 1));
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.name = 'SEA_Weed';
    this.parent.add(mesh);
    return mesh;
  }

  // Lambert (no shine: cheaper than the standard material), with the current's sway, a little
  // light of its own so it is never quite black in the murk, and the glow
  _material() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          attribute float aGlow;
          attribute float aFlap;
          attribute vec3 aTint;
          attribute float aSeed;
          varying vec3 vTint;
          varying float vGlow;
          varying float vAlong;
          varying float vSeed;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          // the blades and fronds flutter, more toward their ends
          transformed.z += sin(uTime * 2.1 + position.y * 31.0 + aSeed * 6.28) * 0.07 * aFlap;
          transformed.x += cos(uTime * 1.7 + position.y * 23.0 + aSeed * 6.28) * 0.04 * aFlap;
          vTint = aTint;
          vGlow = aGlow;
          vAlong = position.y;
          vSeed = aSeed;`)
        .replace('#include <project_vertex>', `
          vec4 mvPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
          #endif
          {
            // the current: the whole plant leans and sways, more the higher up (its root stays put),
            // a wave running up it
            vec3 root = instanceMatrix[3].xyz;
            float tall = min(length(instanceMatrix[1].xyz), 22.0);   // (the tallest sway no further than this)
            float ph = root.x * 0.13 + root.z * 0.17 + aSeed * 2.0;
            float h = position.y;
            float bend = h * h * tall * 0.085;
            float s = 0.7 * sin(uTime * 0.42 + ph - h * 2.2) + 0.25 * sin(uTime * 0.93 + ph * 1.7 - h * 3.1);
            mvPosition.x += bend * (0.5 + s);
            mvPosition.z += bend * 0.55 * sin(uTime * 0.36 + ph * 2.1 - h * 1.8);
          }
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          varying vec3 vTint;
          varying float vGlow;
          varying float vAlong;
          varying float vSeed;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          // (the kelp's floats are darker than its blades)
          if (vGlow > 1.2) diffuseColor.rgb *= 0.5;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // a little light through the fronds: never quite black in the murk
          totalEmissiveRadiance += diffuseColor.rgb * 0.1;
          // the glowing ones: their floats and fronds shine, a slow wave of light running up them
          float wave = pow(0.5 + 0.5 * sin(vAlong * 10.0 - uTime * 1.3 + vSeed * 30.0), 5.0);
          float breathe = 0.75 + 0.25 * sin(uTime * 0.8 + vSeed * 17.0);
          totalEmissiveRadiance += vTint * vGlow * (0.5 * breathe + 1.6 * wave);`);
    };
    mat.customProgramCacheKey = () => 'sea-weed';
    return mat;
  }

  // Find where it all grows (rays onto the seabed), a part a frame; true once it is all placed
  place() {
    if (this.placed) return true;
    const ph = this.physics;
    if (!ph) return (this.placed = true);
    // (can the world answer a ray yet? straight down onto the seabed by the platform)
    if (!this._jobs) {
      if (!ph.castRayNormal({ x: -50, y: -6, z: -20 }, DOWN, 60)) return false;
      this._rand = mulberry(9);
      this._jobs = [() => this._forest(), () => this._trench(), () => this._vents(), () => this._caveMouth(), () => this._lair()];
    }
    this._jobs.shift()();
    if (this._jobs.length) return false;
    for (const m of Object.values(this.meshes)) {
      for (const k of ['instanceMatrix', 'instanceColor']) m[k].needsUpdate = true;
      m.geometry.attributes.aTint.needsUpdate = true;
      m.geometry.attributes.aSeed.needsUpdate = true;
      m.computeBoundingSphere();
      // (room for the sway: the plants lean up to a few metres off their own bounds)
      if (m.boundingSphere) m.boundingSphere.radius += 4;
    }
    return (this.placed = true);
  }

  // the forest below and beyond the platform, its tops rising out of the murk: what he sees
  // when he first steps out
  _forest() {
    const r = this._rand;
    // the tallest, round the platform, their tops swaying up level with it (kept off the deck,
    // the way out to the gate and the hull)
    for (let i = 0; i < 22; i++) {
      const x = -47 + r() * 15, z = -37 + r() * 29;
      if (x > -40 && z > -29 && z < -16) continue;
      const floor = this._floor(x, z);
      if (floor !== null) this._kelp('west', x, z, -3 + r() * 6 - floor, r() < 0.6);
    }
    for (let i = 0; i < 95; i++) {
      // most of it spread west of the platform; some right below it
      const below = i < 28;
      const x = below ? -42 + r() * 14 : -66 + r() * 26;
      const z = below ? -36 + r() * 28 : -50 + r() * 56;
      this._kelp('west', x, z, 13 + r() * 11, r() < 0.4);
      if (r() < 0.5) this._weed('west', x + (r() - 0.5) * 5, z + (r() - 0.5) * 5, 1.5 + r() * 2, r() < 0.25);
    }
  }

  // round the station's foot, in the trench under the atrium (clear of the relay station)
  _trench() {
    const r = this._rand;
    for (let i = 0; i < 80; i++) {
      const x = -28 + r() * 30, z = -48 + r() * 50;
      if (x > -4 && z > -30 && z < -15) continue;                   // the station's leg and the relay
      this._kelp('east', x, z, 10 + r() * 12, r() < 0.45);
      if (r() < 0.6) this._weed('east', x + (r() - 0.5) * 4, z + (r() - 0.5) * 4, 1.5 + r() * 2.5, r() < 0.3);
    }
  }

  // round each vent, kept back from its heat: low weed, a few kelp behind it
  _vents() {
    const r = this._rand;
    for (const v of this.vents) {
      const c = v.base;
      const side = c.x < -30 ? 'west' : 'east';
      for (let i = 0; i < 12; i++) {
        const a = r() * Math.PI * 2, d = 3.5 + r() * 6;
        this._weed(side, c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 1.8 + r() * 3, r() < 0.5);
      }
      for (let i = 0; i < 4; i++) {
        const a = r() * Math.PI * 2, d = 7 + r() * 5;
        this._kelp(side, c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 9 + r() * 9, r() < 0.5);
      }
    }
  }

  // outside the kraken's cave: the seabed in front of the cliff, either side of the way in
  _caveMouth() {
    const m = this.cave.mouth;
    if (!m) return;
    const r = this._rand;
    for (let i = 0; i < 36; i++) {
      const x = m.x - 12 + r() * 10;
      const z = m.z + (r() < 0.5 ? -1 : 1) * (5 + r() * 16);
      if (r() < 0.45) this._kelp('east', x, z, 8 + r() * 10, r() < 0.6);
      else this._weed('east', x, z, 2 + r() * 3.5, r() < 0.7);
    }
  }

  // the tunnel and the lair: glowing weed along the walls (none in the open middle, where the
  // fight is)
  _lair() {
    const { mouth, lair } = this.cave;
    if (!mouth || !lair) return;
    const r = this._rand, ph = this.physics;
    const y = mouth.y - 0.5, z0 = mouth.z;
    const along = new THREE.Vector3();
    // the tunnel: both walls, every couple of metres
    for (let x = mouth.x + 1; x < mouth.x + 12; x += 1.6) {
      for (const dir of [-1, 1]) {
        const hit = ph.castRayNormal({ x, y, z: z0 }, { x: 0, y: 0, z: dir }, 30);
        if (!hit) continue;
        const z = z0 + dir * Math.max(0.5, hit.distance - (0.6 + r() * 1.6));
        this._weed('east', x + (r() - 0.5), z, 1.5 + r() * 2.5, true, LAIR_GLOWS, y + 3, LAIR_BRIGHT);
      }
    }
    // the lair: all the way round its wall, found by rays out from its middle
    const centre = along.set((mouth.x + 12 + lair.x + 4) / 2, y, z0);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2 + r() * 0.08;
      const dir = { x: Math.cos(a), y: 0, z: Math.sin(a) };
      const hit = ph.castRayNormal(centre, dir, 40);
      if (!hit || hit.distance < 6) continue;
      const d = hit.distance - (0.8 + r() * 2.5);
      this._weed('east', centre.x + dir.x * d, centre.z + dir.z * d, 2 + r() * 4, true, LAIR_GLOWS, y + 3, LAIR_BRIGHT);
      if (i % 3 === 0) this._weed('east', centre.x + dir.x * (d - 1.5), centre.z + dir.z * (d - 1.5), 1.2 + r() * 2, true, LAIR_GLOWS, y + 3, LAIR_BRIGHT);
    }
  }

  // one giant kelp, h metres tall, rooted on the seabed under (x, z) if there is seabed there
  _kelp(side, x, z, h, glow) {
    const floor = this._floor(x, z);
    if (floor === null) return;
    const r = this._rand;
    this._add(this.meshes[side + 'Kelp'], x, floor - 0.3, z, 1, h, KELP_COLORS, glow ? GLOWS[Math.floor(r() * GLOWS.length)] : 0);
  }

  // one clump of ribbon weed, h metres tall (from: cast down from this height, for the cave;
  // bright: how strongly it glows)
  _weed(side, x, z, h, glow, glows = GLOWS, from, bright = 1) {
    const floor = this._floor(x, z, from);
    if (floor === null) return;
    const r = this._rand;
    const w = 0.8 + r() * 0.6;
    this._add(this.meshes[side + 'Weed'], x, floor - 0.15, z, w, h, WEED_COLORS, glow ? glows[Math.floor(r() * glows.length)] : 0, bright);
  }

  // the seabed's height under (x, z): the first ground a ray down meets, if it is flat enough and
  // near where the seabed should be (not a roof, a rail or the side of the cliff)
  _floor(x, z, from) {
    const top = from ?? -8;
    const hit = this.physics.castRayNormal({ x, y: top, z }, DOWN, 70);
    if (!hit || hit.normal.y < 0.7) return null;
    const y = top - hit.distance;
    if (from === undefined && y > seabed(x, z) + 3) return null;
    return y;
  }

  _add(mesh, x, y, z, w, h, colors, glow, bright = 1) {
    const i = mesh.count;
    if (i >= mesh.instanceMatrix.count) return;
    const r = this._rand;
    _q.setFromAxisAngle(_up, r() * Math.PI * 2);
    _m.compose(_p.set(x, y, z), _q, _s.set(w, h, w));
    mesh.setMatrixAt(i, _m);
    _c.setHex(colors[Math.floor(r() * colors.length)]).multiplyScalar(0.85 + r() * 0.3);
    mesh.setColorAt(i, _c);
    _c.setHex(glow || 0);
    if (glow) _c.multiplyScalar((0.7 + r() * 0.5) * bright);
    mesh.geometry.attributes.aTint.setXYZ(i, _c.r, _c.g, _c.b);
    mesh.geometry.attributes.aSeed.setX(i, r());
    mesh.count = i + 1;
  }

  update(dt) {
    this.uniforms.uTime.value += dt;
  }

  dispose() {
    this.kelpGeo.dispose();
    this.weedGeo.dispose();
  }
}

const DOWN = { x: 0, y: -1, z: 0 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();

// a small seeded random (the same forest every time)
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// keep just the attributes the material reads, so the parts merge
function tidy(g, glow, flap) {
  const q = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(q.attributes)) if (!['position', 'normal'].includes(k)) q.deleteAttribute(k);
  const n = q.attributes.position.count;
  const ga = new Float32Array(n), fa = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    ga[i] = typeof glow === 'function' ? glow(q.attributes.position, i) : glow;
    fa[i] = typeof flap === 'function' ? flap(q.attributes.position, i) : flap;
  }
  q.setAttribute('aGlow', new THREE.BufferAttribute(ga, 1));
  q.setAttribute('aFlap', new THREE.BufferAttribute(fa, 1));
  return q;
}

// A strip up through the points ([x, y, z] each, y 0..1), w(t) wide (metres), its flat side facing
// across `side`
function strip(points, w, side) {
  const pos = [], idx = [];
  points.forEach(([x, y, z], i) => {
    const t = i / (points.length - 1), hw = w(t) / 2;
    pos.push(x - side[0] * hw, y, z - side[1] * hw, x + side[0] * hw, y, z + side[1] * hw);
    if (i) {
      const a = (i - 1) * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Giant kelp, one unit tall (the instance's y scale gives its height; x and z stay in metres): a
// wavy stalk (two strips crossed, so it shows from every side), long blades up its length in
// turn, each on a gas float, and a long trailing blade at the top. On the glowing ones the floats
// shine, and the stalk faintly.
function kelpGeometry() {
  const parts = [];
  const rnd = mulberry(4);
  const M = 1 / 16;                           // a metre up, in the unit's height (for a kelp of about 16 m)
  const at = (t) => [Math.sin(t * 7.0) * 0.18, t, Math.cos(t * 5.0) * 0.12];
  const stalk = [];
  for (let i = 0; i <= 16; i++) stalk.push(at(i / 16));
  for (const side of [[1, 0], [0, 1]]) parts.push(tidy(strip(stalk, (t) => 0.1 * (1 - 0.5 * t), side), 0.45, 0));
  const BLADES = 18;
  for (let b = 0; b < BLADES; b++) {
    const t = 0.08 + (b / (BLADES - 1)) * 0.86;
    const [sx, sy, sz] = at(t);
    const a = b * 2.4 + rnd() * 0.6;                                   // round the stalk in turn
    const out = [Math.cos(a), Math.sin(a)];
    const len = 1.1 + rnd() * 0.7;                                     // metres
    const lean = 0.3 + rnd() * 0.2;                                    // how far out it leans (the rest is up)
    const pts = [];
    for (let k = 0; k <= 4; k++) {
      const f = k / 4;
      // out from the stalk quickly, then up along it, rippling
      const o = len * lean * Math.sqrt(f) + 0.03 * Math.sin(f * 11);
      pts.push([sx + out[0] * o, sy + len * f * M, sz + out[1] * o]);
    }
    // (rising steeply, its flat side faces out from the stalk: it shows from the side)
    const blade = strip(pts, (f) => 0.26 * Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.1 + 0.04)), 0.7) + 0.02, [-out[1], out[0]]);
    parts.push(tidy(blade, 0.1, (p, i) => Math.min(1, (p.getY(i) - sy) / (len * M))));
    // its gas float, where it meets the stalk
    const float = new THREE.TetrahedronGeometry(0.1, 0);
    float.scale(1, M, 1);                                               // (a unit is many metres tall: flattened, it comes out round)
    float.translate(sx + out[0] * 0.08, sy, sz + out[1] * 0.08);
    parts.push(tidy(float, 1.4, 0));
  }
  // the top: a long blade trailing off with the current
  const [tx, ty, tz] = at(1);
  const top = [];
  for (let k = 0; k <= 6; k++) top.push([tx + k * 0.22, ty + k * 0.12 * M, tz]);
  parts.push(tidy(strip(top, (f) => 0.3 * (1 - f) + 0.03, [0, 1]), (p, i) => 0.2 + 0.5 * Math.max(0, (p.getX(i) - tx) / 1.3), 1));
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}

// Ribbon weed, one unit tall: a clump of seven long, thin fronds from one root, leaning out and
// curling, the longest in the middle. Glowing clumps shine more toward their tips.
function weedGeometry() {
  const parts = [];
  const rnd = mulberry(7);
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * Math.PI * 2 + rnd() * 0.5;
    const len = 0.55 + rnd() * 0.45;
    const lean = 0.25 + rnd() * 0.35;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const out = lean * t * t + 0.05 * Math.sin(t * 8 + f);
      pts.push([Math.cos(a) * out, len * t, Math.sin(a) * out]);
    }
    // (each frond twisted a little differently, so the clump shows from every side)
    const turn = a + Math.PI / 2 + rnd() * 0.8;
    parts.push(tidy(strip(pts, (t) => 0.12 * (1 - t * 0.7), [Math.cos(turn), Math.sin(turn)]),
      (p, i) => 0.25 + 0.75 * p.getY(i) / len, (p, i) => p.getY(i) / len));
  }
  const g = mergeGeometries(parts);
  g.computeBoundingSphere();
  return g;
}
