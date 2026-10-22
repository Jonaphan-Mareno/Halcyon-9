import * as THREE from 'three';
import { createGLTFLoader } from '../core/loaders.js';

// The kraken (Level 3), from "Kraken" by toro ardido modelos 3d (CC-BY-4.0, see CREDITS.md), taken
// apart by Blender/scripts/build_l3_kraken.py into its body, one thick arm and one long tentacle.
// The source holds four tentacles out straight; this one has ten, and they move: the arm repeated
// eight times round the underside of the body and the long tentacle twice, from its sides.
//
// Each tentacle is a curve through seventeen points (Catmull-Rom), worked out here every frame and
// handed to the shader in a small float texture (a row a tentacle); the vertex shader lays the
// straight model along it (its length along the curve, its cross-section turned to follow), so one
// draw call draws all eight arms and one both long tentacles. The points come from a chain of
// sixteen links, each turned a little from the last: waves run out along it
// from the body to the tip, up and down and side to side at different speeds, as an octopus's arms
// ripple, and the tip curls. When a tentacle reaches for something its chain is pulled toward it
// (FABRIK, so it keeps its length) and still ripples along the way. Or it can be laid along a path
// (wrapped round something: the relay station), stretching to fit, its grip squeezing. The shader
// adds a fine ripple of its own running down each one.
//
// The body breathes and rolls a little as it hangs in the water, and its lower jaw hinges (in the
// vertex shader: the face's lower half turns about a line behind the mouth), so it opens and
// shuts its mouth.
//
// The textures are one atlas (see the Blender script): each vertex's u carries its tile as whole
// hundreds, and the shader samples (tile + fract(uv)) / 4.
//
// What it does is driven from outside (KrakenFight.js): where it sits, what each tentacle reaches
// for, how much a tentacle glows (the warning before it strikes), the jaw, and how brightly its
// mouth glows (its weak spot). Positions handed in and out are world positions.

const MODEL = './assets/models/l3-kraken.glb';
const ARMS = 8, WHIPS = 2;
const LINKS = 16;                      // links in each tentacle's chain (seventeen points)
// the body, in the model's own units (it faces +z, its belly at y ~ -0.5)
const ARM_RING = { y: 0.25, z: 0.55, rx: 1.55, rz: 1.25 };   // where the arms leave the body
const WHIP_ROOT = { x: 2.45, y: 0.45, z: 1.5 };                // and the long tentacles, at its sides
export const MOUTH = new THREE.Vector3(0, 2.0, 1.95);         // in its mouth: the weak spot
const JAW = { y: 2.0, z: 1.0 };                                // the line its lower jaw turns about
// the waves along a tentacle: radians a link (more toward the tip), how fast, how long
const WAVE = { curl: 0.42, sway: 0.5, speed: { arm: 1.3, whip: 1.8 }, length: 5.5 };

export class Kraken {
  // parent: what it goes in (the sea's group); scale: model units to metres
  constructor(parent, { position, yaw = 0, scale = 1.6 } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'Kraken';
    this.root.scale.setScalar(scale);
    this.root.rotation.order = 'YXZ';
    if (position) this.root.position.copy(position);
    this.root.rotation.y = yaw;
    parent.add(this.root);
    this.scale = scale;
    this.time = 0;
    this.tents = [];
    this.mouthGlow = 0;                 // 0..1: its mouth lit (open to the harpoon)
    this.jaw = 0;                       // radians: + opens wider than the model's own scream, - shuts it
    this.jawTarget = -0.2;
    this.jawRate = 10;
    this.avoid = [];                    // [{ centre (world), radius, top }]: upright cylinders its tentacles keep out of
    this.uniforms = { uTime: { value: 0 }, uJaw: { value: 0 }, uMouthGlow: { value: 0 } };
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this.ready = this._load().catch((e) => console.error('The kraken failed to load.', e));
  }

  async _load() {
    const gltf = await createGLTFLoader().loadAsync(MODEL);
    const find = (name) => gltf.scene.getObjectByName(name);
    const body = find('KRAKEN_Body'), arm = find('KRAKEN_Arm'), whip = find('KRAKEN_Whip');
    const map = body.material.map;
    map.anisotropy = 4;
    this.body = new THREE.Mesh(body.geometry, this._material(map, null));
    this.root.add(this.body);
    this.arms = this._tentacles(arm.geometry, map, ARMS);
    this.whips = this._tentacles(whip.geometry, map, WHIPS);
    // its tentacles, each with a root on the body and a way it lies at rest
    for (let i = 0; i < ARMS; i++) {
      const a = (i + 0.5) / ARMS * Math.PI * 2;
      const root = new THREE.Vector3(ARM_RING.rx * Math.sin(a), ARM_RING.y, ARM_RING.z + ARM_RING.rz * Math.cos(a));
      const out = new THREE.Vector3(Math.sin(a), -0.3, Math.cos(a)).normalize();
      this.tents.push(this._tent('arm', i, root, out, this.arms));
    }
    for (let i = 0; i < WHIPS; i++) {
      const sx = i === 0 ? -1 : 1;
      const root = new THREE.Vector3(sx * WHIP_ROOT.x, WHIP_ROOT.y, WHIP_ROOT.z);
      const out = new THREE.Vector3(sx, -0.15, 0.55).normalize();
      this.tents.push(this._tent('whip', i, root, out, this.whips));
    }
    this.update(0);
  }

  _tent(kind, slot, root, out, group) {
    const len = group.len;
    const pts = [];
    for (let j = 0; j <= LINKS; j++) pts.push(root.clone().addScaledVector(out, len * j / LINKS));
    return {
      kind, slot, group, root, out, len,
      phase: Math.random() * 10, pts,
      rest: pts.map((p) => p.clone()),
      target: null,                     // a point (model units) it reaches for, or null
      reach: 0,                         // 0..1: how far it gives in to the reach
      glow: 0,                          // 0..1: its tip glows (about to strike)
      curl: 0.25,                       // how far it curls down along its length
      tip: 0.5,                         // and how far its tip curls in
      wave: 1,                          // how strongly the waves run along it
      thick: kind === 'arm' ? 1.25 : 1.0,
      floor: null,                      // a height (model units) the points keep above, or null
      path: null,                       // world points it lies along (from its root), or null
      grip: 0                           // 0..1: how far it is laid along its path
    };
  }

  // ------------------------------------------------------------------ the shader
  // tentacle: null for the body; for the tentacles, their straight length (model units)
  _material(map, tentacle, ctrl = null) {
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide, alphaTest: 0.5 });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.uniforms.uJaw = u.uJaw;
      shader.uniforms.uMouthGlow = u.uMouthGlow;
      shader.uniforms.uLen = { value: tentacle || 1 };
      shader.uniforms.uMouth = { value: MOUTH };
      if (ctrl) shader.uniforms.uCtrl = { value: ctrl };
      let vs = shader.vertexShader.replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uLen;
        uniform float uJaw;
        varying vec2 vKTile;
        varying float vKGlow;
        varying vec3 vKLocal;
        #ifdef TENTACLE
          uniform sampler2D uCtrl;  // its curve's points: a row a tentacle (this one's: gl_InstanceID)
          attribute vec3 aSide;     // which way its suckers face (near enough)
          attribute vec4 aShape;    // x: thickness, y: twist over its length, z: tip glow, w: its phase
          vec3 kCR(vec3 a, vec3 b, vec3 c, vec3 d, float f) {
            return 0.5 * (2.0 * b + (c - a) * f + (2.0 * a - 5.0 * b + 4.0 * c - d) * f * f + (3.0 * b - a - 3.0 * c + d) * f * f * f);
          }
          vec3 kCRd(vec3 a, vec3 b, vec3 c, vec3 d, float f) {
            return 0.5 * ((c - a) + 2.0 * (2.0 * a - 5.0 * b + 4.0 * c - d) * f + 3.0 * (3.0 * b - a - 3.0 * c + d) * f * f);
          }
          vec3 kPt(int i) {
            // (one past either end: carried on straight)
            if (i < 0) return 2.0 * texelFetch(uCtrl, ivec2(0, gl_InstanceID), 0).xyz - texelFetch(uCtrl, ivec2(1, gl_InstanceID), 0).xyz;
            if (i > ${LINKS}) return 2.0 * texelFetch(uCtrl, ivec2(${LINKS}, gl_InstanceID), 0).xyz - texelFetch(uCtrl, ivec2(${LINKS - 1}, gl_InstanceID), 0).xyz;
            return texelFetch(uCtrl, ivec2(i, gl_InstanceID), 0).xyz;
          }
        #endif`);
      vs = vs.replace('#include <uv_vertex>', `#include <uv_vertex>
        {
          float tile = floor((uv.x + 50.0) / 100.0);
          vKTile = vec2(mod(tile, 4.0), floor(tile / 4.0));
        }`);
      if (tentacle) {
        vs = vs.replace('#include <beginnormal_vertex>', `
          float kt = clamp(position.y / uLen, 0.0, 1.0);
          float ks = kt * ${LINKS}.0;
          int ki = int(min(floor(ks), ${LINKS - 1}.0));
          float kf = ks - float(ki);
          vec3 kA = kPt(ki - 1), kB = kPt(ki), kC = kPt(ki + 1), kD = kPt(ki + 2);
          vec3 kCentre = kCR(kA, kB, kC, kD, kf);
          vec3 kT = normalize(kCRd(kA, kB, kC, kD, kf) + vec3(0.0, 1e-5, 0.0));
          vec3 kRef = abs(dot(normalize(aSide), kT)) > 0.97 ? vec3(1.0, 0.0, 0.0) : aSide;
          vec3 kS = normalize(kRef - dot(kRef, kT) * kT);
          float ka = aShape.y * kt + sin(uTime * 1.3 + kt * 6.0 + aShape.w) * 0.15;
          kS = kS * cos(ka) + cross(kT, kS) * sin(ka);
          vec3 kX = cross(kT, kS);
          // a fine ripple running down it, more toward the tip
          kCentre += (kX * sin(uTime * 2.6 - kt * 14.0 + aShape.w) + kS * sin(uTime * 2.1 - kt * 11.0 + aShape.w * 1.7)) * 0.07 * kt;
          vec3 objectNormal = kX * normal.x + kT * normal.y + kS * normal.z;
          vKGlow = aShape.z * smoothstep(0.45, 1.0, kt);`);
        vs = vs.replace('#include <begin_vertex>', `
          vec3 transformed = kCentre + (kX * position.x + kS * position.z) * aShape.x;
          vKLocal = transformed;`);
      } else {
        // the jaw: the lower half of the face turns about a line behind the mouth (fading out
        // toward the hinge, the back of the head and its hands, so nothing tears)
        vs = vs.replace('#include <beginnormal_vertex>', `
          float kJw = smoothstep(${(JAW.y - 0.05).toFixed(2)}, ${(JAW.y - 0.5).toFixed(2)}, position.y)
            * smoothstep(1.25, 1.85, position.z) * smoothstep(1.55, 1.05, abs(position.x));
          float kJa = uJaw * kJw;
          float kJc = cos(kJa), kJs = sin(kJa);
          vec3 objectNormal = vec3(normal.x, normal.y * kJc - normal.z * kJs, normal.z * kJc + normal.y * kJs);`);
        vs = vs.replace('#include <begin_vertex>', `
          vec3 transformed = position;
          {
            vec2 kD = vec2(position.z - ${JAW.z.toFixed(2)}, position.y - ${JAW.y.toFixed(2)});
            transformed.z = ${JAW.z.toFixed(2)} + kD.x * kJc + kD.y * kJs;
            transformed.y = ${JAW.y.toFixed(2)} + kD.y * kJc - kD.x * kJs;
          }
          vKGlow = 0.0;
          vKLocal = transformed;`);
      }
      shader.vertexShader = vs;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uTime;
          uniform vec3 uMouth;
          uniform float uMouthGlow;
          varying vec2 vKTile;
          varying float vKGlow;
          varying vec3 vKLocal;`)
        .replace('#include <map_fragment>', `
          {
            vec2 kuv = vMapUv;
            vec2 kAt = (vKTile + 0.004 + fract(kuv) * 0.992) * 0.25;
            vec4 sampledDiffuseColor = textureGrad(map, kAt, dFdx(kuv) * 0.25, dFdy(kuv) * 0.25);
            diffuseColor *= sampledDiffuseColor;
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            // a dim sheen round its edge, so its shape reads in the dark water
            float kRim = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
            totalEmissiveRadiance += vec3(0.05, 0.13, 0.12) * kRim * 1.4 + diffuseColor.rgb * 0.06;
            // the warning: its tip glows hot before it strikes
            totalEmissiveRadiance += vec3(1.0, 0.3, 0.08) * vKGlow * 2.2;
            // its mouth lit from inside (open to the harpoon)
            float km = smoothstep(0.95, 0.0, distance(vKLocal, uMouth));
            totalEmissiveRadiance += vec3(1.0, 0.25, 0.1) * km * uMouthGlow * 3.0 * (0.8 + 0.2 * sin(uTime * 9.0));
          }`);
    };
    mat.defines = tentacle ? { TENTACLE: '' } : {};
    mat.customProgramCacheKey = () => (tentacle ? 'kraken-tentacle' : 'kraken-body');
    return mat;
  }

  // n tentacles of one kind: one mesh, drawn instanced, the curve of each in its instance data
  _tentacles(src, map, n) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = src.index;
    for (const k of ['position', 'normal', 'uv']) geo.setAttribute(k, src.getAttribute(k));
    geo.instanceCount = n;
    const attr = (name, size) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    // its curves' points, a row a tentacle (the shader reads them by instance)
    const ctrl = new THREE.DataTexture(new Float32Array((LINKS + 1) * n * 4), LINKS + 1, n, THREE.RGBAFormat, THREE.FloatType);
    ctrl.minFilter = ctrl.magFilter = THREE.NearestFilter;
    ctrl.needsUpdate = true;
    const side = attr('aSide', 3), shape = attr('aShape', 4);
    src.computeBoundingBox();
    const len = src.boundingBox.max.y;
    // (culled as a whole: a sphere round everything its tentacles can reach)
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), len * 1.35);
    const mesh = new THREE.Mesh(geo, this._material(map, len, ctrl));
    this.root.add(mesh);
    return { mesh, ctrl, side, shape, len };
  }

  // ------------------------------------------------------------------ moving
  // Where things are, in and out of its own space
  toLocal(world, out = new THREE.Vector3()) {
    return this.root.worldToLocal(out.copy(world));
  }

  toWorld(local, out = new THREE.Vector3()) {
    return this.root.localToWorld(out.copy(local));
  }

  mouthWorld(out = new THREE.Vector3()) {
    return this.toWorld(MOUTH, out);
  }

  // a tentacle's tip, or any point along it (t 0..1), in the world
  pointOn(tent, t, out = new THREE.Vector3()) {
    const s = Math.min(t, 0.9999) * LINKS;
    const i = Math.floor(s), f = s - i;
    const P = tent.pts;
    const a = i === 0 ? this._a.copy(P[0]).multiplyScalar(2).sub(P[1]) : P[i - 1];
    const b = P[i], c = P[i + 1];
    const d = i + 2 <= LINKS ? P[i + 2] : this._b.copy(P[LINKS]).multiplyScalar(2).sub(P[LINKS - 1]);
    const f2 = f * f, f3 = f2 * f;
    out.set(0, 0, 0)
      .addScaledVector(a, -0.5 * f + f2 - 0.5 * f3)
      .addScaledVector(b, 1 - 2.5 * f2 + 1.5 * f3)
      .addScaledVector(c, 0.5 * f + 2 * f2 - 1.5 * f3)
      .addScaledVector(d, -0.5 * f2 + 0.5 * f3);
    return this.toWorld(out, out);
  }

  // how near a world point comes to a tentacle (metres), sampled along it
  distanceTo(tent, world, from = 0.25) {
    let best = Infinity;
    const p = this._d;
    for (let k = 0; k <= 16; k++) {
      const t = from + (1 - from) * k / 16;
      best = Math.min(best, this.pointOn(tent, t, p).distanceTo(world));
    }
    return best;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.uniforms.uTime.value = t;
    if (!this.body) return;
    // the body: it breathes, and rolls and pitches a little as it hangs in the water
    const br = Math.sin(t * 1.4);
    this.body.scale.set(1 + 0.025 * br, 1 + 0.04 * Math.sin(t * 1.4 + 0.5), 1 + 0.03 * br);
    this.root.rotation.x = 0.06 * Math.sin(t * 0.7) + (this.pitch || 0);
    this.root.rotation.z = 0.05 * Math.sin(t * 0.53 + 1.0);
    this.root.updateMatrixWorld(true);
    // the jaw, eased (snaps shut fast)
    this.jaw += (this.jawTarget - this.jaw) * (1 - Math.exp(-this.jawRate * dt));
    this.uniforms.uJaw.value = this.jaw;
    this.uniforms.uMouthGlow.value = this.mouthGlow;
    // what its tentacles keep out of, in its own space
    this._avoidLocal = this.avoid.map((c) => ({
      c: this.toLocal(c.centre, new THREE.Vector3()), r: c.radius / this.scale,
      top: (c.top - this.root.position.y) / this.scale
    }));
    for (const tent of this.tents) {
      // (a path is laid in its own space each frame: the body moves)
      tent.grip += ((tent.path ? 1 : 0) - tent.grip) * (dt > 0 ? 1 - Math.exp(-(tent.path ? 3 : 1.2) * dt) : 1);
      if (tent.path) tent.pathLocal = tent.path.map((w, i) => this.toLocal(w, tent.pathLocal?.[i] || new THREE.Vector3()));
      this._pose(tent, dt);
    }
    for (const g of [this.arms, this.whips]) {
      g.ctrl.needsUpdate = true;
      g.side.needsUpdate = g.shape.needsUpdate = true;
    }
  }

  // A tentacle's nine points this frame: its chain at rest (waves running out along it, its tip
  // curling), pulled toward what it reaches for, kept off the floor and out of the avoided places;
  // then written to its instance's data
  _pose(tent, dt) {
    const t = this.time, P = tent.pts, seg = tent.len / LINKS;
    const rest = tent.rest;
    rest[0].copy(tent.root);
    const d = this._d.copy(tent.out);
    const speed = WAVE.speed[tent.kind];
    for (let j = 1; j <= LINKS; j++) {
      const s = j / LINKS;
      const w = t * speed + tent.phase;
      // (bending down/up about the axis across it, and side to side about the one over it)
      const across = this._a.crossVectors(d, UP);
      if (across.lengthSq() < 1e-4) across.set(1, 0, 0);
      across.normalize();
      const over = this._b.crossVectors(across, d).normalize();
      const tipCurl = s > 0.6 ? tent.tip * ((s - 0.6) / 0.4) ** 2 * (0.75 + 0.25 * Math.sin(w * 0.6)) : 0;
      const grow = 0.35 + 0.65 * s;      // (stiffer by the body, freer toward the tip)
      const curl = -tent.curl * 0.25 + tent.wave * WAVE.curl * grow * Math.sin(w - s * WAVE.length) - tipCurl;
      const sway = tent.wave * WAVE.sway * grow * Math.sin(w * 0.83 - s * WAVE.length * 0.85 + tent.phase * 1.7);
      d.applyAxisAngle(across, curl).applyAxisAngle(over, sway).normalize();
      rest[j].copy(rest[j - 1]).addScaledVector(d, seg);
    }
    let rate = 4;
    // what it reaches for (FABRIK, from the rest pose), still rippling along the way
    if (tent.target && tent.reach > 0.001) {
      const R = REACH_PTS;
      for (let j = 0; j <= LINKS; j++) R[j].copy(rest[j]);
      for (let it = 0; it < 4; it++) {
        R[LINKS].copy(tent.target);
        for (let j = LINKS - 1; j >= 0; j--) R[j].sub(R[j + 1]).setLength(seg).add(R[j + 1]);
        R[0].copy(tent.root);
        for (let j = 1; j <= LINKS; j++) R[j].sub(R[j - 1]).setLength(seg).add(R[j - 1]);
      }
      const chord = this._a.subVectors(R[LINKS], R[0]).normalize();
      const sideA = this._b.crossVectors(chord, UP);
      if (sideA.lengthSq() < 1e-4) sideA.set(1, 0, 0);
      sideA.normalize();
      const sideB = this._v.crossVectors(sideA, chord).normalize();
      const wobble = 0.55 * tent.wave * (1 - 0.7 * tent.glow);
      for (let j = 1; j < LINKS; j++) {
        const s = j / LINKS, env = Math.sin(Math.PI * s);
        const w = t * WAVE.speed[tent.kind] * 1.3 + tent.phase;
        R[j].addScaledVector(sideA, Math.sin(w - s * 7.0) * wobble * env).addScaledVector(sideB, Math.sin(w * 0.8 - s * 6.0 + 1.3) * wobble * env * 0.8);
      }
      for (let j = 0; j <= LINKS; j++) rest[j].lerp(R[j], tent.reach);
      rate = 10;
    }
    // laid along its path (wrapped round something): the path resampled into its links, from its
    // root; the free stretch before the wrap stirs, the grip squeezes
    if (tent.grip > 0.001 && tent.pathLocal) {
      const R = REACH_PTS;
      resample([tent.root, ...tent.pathLocal], R);
      const wrapAt = tent.wrapFrom ?? 0.5;
      for (let j = 1; j < LINKS; j++) {
        const s = j / LINKS;
        if (s < wrapAt) {
          const env = Math.sin(Math.PI * s / wrapAt);
          R[j].x += Math.sin(t * 0.9 + tent.phase + s * 9) * 0.22 * env;
          R[j].z += Math.cos(t * 0.7 + tent.phase + s * 7) * 0.22 * env;
        } else {
          R[j].y += Math.sin(t * 1.6 + tent.phase + s * 12) * 0.05;
        }
      }
      for (let j = 0; j <= LINKS; j++) rest[j].lerp(R[j], tent.grip);
      rate = 6;
    }
    const k = dt > 0 ? 1 - Math.exp(-rate * dt) : 1;
    for (let j = 0; j <= LINKS; j++) P[j].lerp(rest[j], k);
    P[0].copy(tent.root);
    if (tent.floor !== null && tent.grip < 0.01) for (let j = 1; j <= LINKS; j++) P[j].y = Math.max(P[j].y, tent.floor);
    for (const c of this._avoidLocal || []) {
      for (let j = 1; j <= LINKS; j++) {
        const p = P[j];
        if (p.y > c.top) continue;
        const dx = p.x - c.c.x, dz = p.z - c.c.z, dist = Math.hypot(dx, dz);
        if (dist < c.r && dist > 1e-4) {
          p.x = c.c.x + dx / dist * c.r;
          p.z = c.c.z + dz / dist * c.r;
        }
      }
    }
    // into its row of the points texture, and its instance data
    const g = tent.group, i = tent.slot, px = g.ctrl.image.data;
    for (let j = 0; j <= LINKS; j++) {
      const o = (i * (LINKS + 1) + j) * 4;
      px[o] = P[j].x; px[o + 1] = P[j].y; px[o + 2] = P[j].z;
    }
    // (the suckers face down and in, toward the body's middle line)
    g.side.setXYZ(i, -tent.out.x * 0.3, -1, -tent.out.z * 0.3);
    g.shape.setXYZW(i, tent.thick, 0.4, tent.glow, tent.phase);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const REACH_PTS = Array.from({ length: LINKS + 1 }, () => new THREE.Vector3());

// points along a polyline at even steps (out.length of them, end to end)
function resample(line, out) {
  const lens = [0];
  for (let i = 1; i < line.length; i++) lens.push(lens[i - 1] + line[i].distanceTo(line[i - 1]));
  const total = lens[lens.length - 1] || 1;
  let seg = 1;
  for (let j = 0; j < out.length; j++) {
    const want = total * j / (out.length - 1);
    while (seg < line.length - 1 && lens[seg] < want) seg++;
    const a = lens[seg - 1], b = lens[seg];
    out[j].lerpVectors(line[seg - 1], line[seg], b > a ? (want - a) / (b - a) : 0);
  }
}
