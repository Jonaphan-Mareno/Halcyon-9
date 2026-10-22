import * as THREE from 'three';
import { createGLTFLoader } from '../core/loaders.js';

// The kraken (Level 3), from "Kraken" by toro ardido modelos 3d (CC-BY-4.0, see CREDITS.md), taken
// apart by Blender/scripts/build_l3_kraken.py into its body, one thick arm and one long tentacle.
// The source holds four tentacles out straight; this one has ten, and they move: the arm repeated
// eight times round the underside of the body and the long tentacle twice, from its sides.
//
// Each tentacle is a curve through five points (Catmull-Rom), worked out here every frame, and the
// vertex shader lays the straight model along it (its length along the curve, its cross-section
// turned to follow), so one draw call draws all eight arms and one both long tentacles. The five
// points come from a chain: each link a quarter of the tentacle long, each turned a little from the
// last (waves running down it, a curl toward the tip). When a tentacle reaches for something, its
// chain is pulled toward it (FABRIK), so it keeps its length whatever it does.
//
// The textures are one atlas (see the Blender script): each vertex's u carries its tile as whole
// hundreds, and the shader samples (tile + fract(uv)) / 4.
//
// What it does is driven from outside (Trench.js): where it sits, what each tentacle reaches for,
// how much a tentacle glows (the warning before it strikes) and how wide the mouth glows (its weak
// spot). Positions handed in and out are world positions.

const MODEL = './assets/models/l3-kraken.glb';
const ARMS = 8, WHIPS = 2;
const LINKS = 4;                       // links in each tentacle's chain (five points)
// the body, in the model's own units (it faces +z, its belly at y ~ -0.5)
const ARM_RING = { y: 0.25, z: 0.55, rx: 1.55, rz: 1.25 };   // where the arms leave the body
const WHIP_ROOT = { x: 2.45, y: 0.45, z: 1.5 };                // and the long tentacles, at its sides
export const MOUTH = new THREE.Vector3(0, 2.05, 2.15);        // its screaming mouth: the weak spot
const EYES = [new THREE.Vector3(-0.5, 2.95, 2.25), new THREE.Vector3(0.5, 2.95, 2.25)];

export class Kraken {
  // parent: what it goes in (the sea's group); scale: model units to metres
  constructor(parent, { position, yaw = 0, scale = 1.6 } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'Kraken';
    this.root.scale.setScalar(scale);
    if (position) this.root.position.copy(position);
    this.root.rotation.y = yaw;
    parent.add(this.root);
    this.scale = scale;
    this.time = 0;
    this.tents = [];
    this.mouthGlow = 0;                 // 0..1: its mouth lit (open to the harpoon)
    this.eyeGlow = 0.35;
    this.uniforms = { uTime: { value: 0 } };
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._q = new THREE.Quaternion();
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
    this._eyes();
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
      curl: 0.25,                       // how far it curls (radians a link)
      thick: kind === 'arm' ? 1.25 : 1.0,
      floor: null                       // a height (model units) the points keep above, or null
    };
  }

  // ------------------------------------------------------------------ the shader
  // tentacle: null for the body; for the tentacles, their straight length (model units)
  _material(map, tentacle) {
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.0, side: THREE.DoubleSide, alphaTest: 0.5 });
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = u.uTime;
      shader.uniforms.uLen = { value: tentacle || 1 };
      shader.uniforms.uMouth = { value: MOUTH };
      shader.uniforms.uMouthGlow = this._mouthU ||= { value: 0 };
      let vs = shader.vertexShader.replace('#include <common>', `#include <common>
        uniform float uTime;
        uniform float uLen;
        varying vec2 vKTile;
        varying float vKGlow;
        varying vec3 vKLocal;
        #ifdef TENTACLE
          attribute vec3 aC0;
          attribute vec3 aC1;
          attribute vec3 aC2;
          attribute vec3 aC3;
          attribute vec3 aC4;
          attribute vec3 aSide;     // which way its suckers face (near enough)
          attribute vec4 aShape;    // x: thickness, y: twist over its length, z: tip glow
          vec3 kCR(vec3 a, vec3 b, vec3 c, vec3 d, float f) {
            return 0.5 * (2.0 * b + (c - a) * f + (2.0 * a - 5.0 * b + 4.0 * c - d) * f * f + (3.0 * b - a - 3.0 * c + d) * f * f * f);
          }
          vec3 kCRd(vec3 a, vec3 b, vec3 c, vec3 d, float f) {
            return 0.5 * ((c - a) + 2.0 * (2.0 * a - 5.0 * b + 4.0 * c - d) * f + 3.0 * (3.0 * b - a - 3.0 * c + d) * f * f);
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
          vec3 kP[7];
          kP[0] = 2.0 * aC0 - aC1; kP[1] = aC0; kP[2] = aC1; kP[3] = aC2; kP[4] = aC3; kP[5] = aC4; kP[6] = 2.0 * aC4 - aC3;
          float ks = kt * 4.0;
          int ki = int(min(floor(ks), 3.0));
          float kf = ks - float(ki);
          vec3 kCentre = kCR(kP[ki], kP[ki + 1], kP[ki + 2], kP[ki + 3], kf);
          vec3 kT = normalize(kCRd(kP[ki], kP[ki + 1], kP[ki + 2], kP[ki + 3], kf) + vec3(0.0, 1e-5, 0.0));
          vec3 kRef = abs(dot(normalize(aSide), kT)) > 0.97 ? vec3(1.0, 0.0, 0.0) : aSide;
          vec3 kS = normalize(kRef - dot(kRef, kT) * kT);
          float ka = aShape.y * kt + sin(uTime * 1.3 + kt * 6.0 + aShape.w) * 0.12;
          kS = kS * cos(ka) + cross(kT, kS) * sin(ka);
          vec3 kX = cross(kT, kS);
          vec3 objectNormal = kX * normal.x + kT * normal.y + kS * normal.z;
          vKGlow = aShape.z * smoothstep(0.45, 1.0, kt);`);
        vs = vs.replace('#include <begin_vertex>', `
          vec3 transformed = kCentre + (kX * position.x + kS * position.z) * aShape.x;
          vKLocal = transformed;`);
      } else {
        vs = vs.replace('#include <begin_vertex>', `#include <begin_vertex>
          vKGlow = 0.0;
          vKLocal = position;`);
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
    const cps = [0, 1, 2, 3, 4].map((j) => attr('aC' + j, 3));
    const side = attr('aSide', 3), shape = attr('aShape', 4);
    src.computeBoundingBox();
    const len = src.boundingBox.max.y;
    // (culled as a whole: a sphere round everything its tentacles can reach)
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), len * 1.35);
    const mesh = new THREE.Mesh(geo, this._material(map, len));
    this.root.add(mesh);
    return { mesh, cps, side, shape, len };
  }

  // two small lights in its eyes, always faintly on (brighter when it hunts)
  _eyes() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,240,200,1)');
    grad.addColorStop(0.25, 'rgba(255,170,60,0.8)');
    grad.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.eyeMat = new THREE.SpriteMaterial({ map: tex, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    this.eyeSprites = EYES.map((p) => {
      const s = new THREE.Sprite(this.eyeMat);
      s.position.copy(p);
      s.scale.setScalar(0.4);
      this.root.add(s);
      return s;
    });
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
    const a = i === 0 ? this._w.copy(P[0]).multiplyScalar(2).sub(P[1]) : P[i - 1];
    const b = P[i], c = P[i + 1];
    const d = i + 2 <= LINKS ? P[i + 2] : this._v.copy(P[LINKS]).multiplyScalar(2).sub(P[LINKS - 1]);
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
    const p = new THREE.Vector3();
    for (let k = 0; k <= 12; k++) {
      const t = from + (1 - from) * k / 12;
      best = Math.min(best, this.pointOn(tent, t, p).distanceTo(world));
    }
    return best;
  }

  update(dt) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    if (!this.body) return;
    for (const tent of this.tents) this._pose(tent, dt);
    for (const g of [this.arms, this.whips]) {
      for (const a of [...g.cps, g.side, g.shape]) a.needsUpdate = true;
    }
    if (this._mouthU) this._mouthU.value = this.mouthGlow;
    const eye = 0.45 + this.eyeGlow * 0.9;
    for (const s of this.eyeSprites) s.scale.setScalar(eye * (0.92 + 0.08 * Math.sin(this.time * 5.3)));
    this.eyeMat.opacity = Math.min(1, 0.4 + this.eyeGlow * 0.6);
  }

  // A tentacle's five points this frame: its chain at rest (waves, a curl), pulled toward what it
  // reaches for, kept off the floor; then written to its instance's data
  _pose(tent, dt) {
    const t = this.time, P = tent.pts, seg = tent.len / LINKS;
    const dir = this._v.copy(tent.out);
    const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    const curlAxis = side;                          // curls down (toward its suckers)
    const swayAxis = new THREE.Vector3().crossVectors(side, dir).normalize();
    const rest = tent.rest;
    rest[0].copy(tent.root);
    const d = dir.clone();
    for (let j = 1; j <= LINKS; j++) {
      const w = t * (tent.kind === 'whip' ? 1.3 : 0.9) + tent.phase;
      const curl = tent.curl * (0.6 + j * 0.35) + Math.sin(w + j * 0.9) * 0.22;
      const sway = Math.sin(w * 0.7 + j * 1.4 + tent.phase) * 0.28;
      d.applyAxisAngle(curlAxis, curl * 0.5).applyAxisAngle(swayAxis, sway * 0.5).normalize();
      rest[j].copy(rest[j - 1]).addScaledVector(d, seg);
    }
    // what it reaches for (FABRIK, from the rest pose)
    if (tent.target && tent.reach > 0.001) {
      const R = REACH_PTS;
      for (let j = 0; j <= LINKS; j++) R[j].copy(rest[j]);
      for (let it = 0; it < 4; it++) {
        R[LINKS].copy(tent.target);
        for (let j = LINKS - 1; j >= 0; j--) R[j].sub(R[j + 1]).setLength(seg).add(R[j + 1]);
        R[0].copy(tent.root);
        for (let j = 1; j <= LINKS; j++) R[j].sub(R[j - 1]).setLength(seg).add(R[j - 1]);
      }
      // (eased toward it, so a strike sweeps through the water rather than jumping)
      const k = 1 - Math.exp(-14 * dt);
      for (let j = 0; j <= LINKS; j++) {
        const want = this._w.copy(rest[j]).lerp(R[j], tent.reach);
        P[j].lerp(want, dt > 0 ? k : 1);
      }
    } else {
      const k = 1 - Math.exp(-4 * dt);
      for (let j = 0; j <= LINKS; j++) P[j].lerp(rest[j], dt > 0 ? k : 1);
    }
    P[0].copy(tent.root);
    if (tent.floor !== null) for (let j = 1; j <= LINKS; j++) P[j].y = Math.max(P[j].y, tent.floor);
    // into the instance data
    const g = tent.group, i = tent.slot;
    for (let j = 0; j <= LINKS; j++) g.cps[j].setXYZ(i, P[j].x, P[j].y, P[j].z);
    // (the suckers face down and in, toward the body's middle line)
    g.side.setXYZ(i, -tent.out.x * 0.3, -1, -tent.out.z * 0.3);
    g.shape.setXYZ(i, tent.thick, 0.4, tent.glow);
    g.shape.setW(i, tent.phase);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const REACH_PTS = Array.from({ length: LINKS + 1 }, () => new THREE.Vector3());
