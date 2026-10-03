import * as THREE from 'three';

// The electrical organism in the lab, split across the row of tubes (and the two pieces lying in
// the spills on the floor). Everything is generated here: branching tendrils built as thin tubes,
// a soft central body in the middle tube, specks drifting in the liquid, and lightning arcs.
//
// The look comes from one custom shader (shared by every piece): the body is a dim violet glow
// that is brighter at its silhouette, mint pulses travel outward along each tendril from the
// body, violet sparks flicker on and off, and the tendrils sway. Every so often a "surge" lights
// up all the tubes at once and arcs jump between the tendrils, as if the pieces are still connected.

const MINT = new THREE.Color(0x5dffc0);
const VIOLET = new THREE.Color(0xa560ff);

const vertexShader = /* glsl */`
  attribute float aDist;
  attribute float aSeed;
  uniform float uTime;
  uniform float uWobble;
  uniform float uWobbleSpeed;
  varying float vDist;
  varying float vSeed;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vDist = aDist;
    vSeed = aSeed;
    vec3 p = position;
    // tendrils sway, more toward their tips
    float sway = uWobble * min(aDist, 1.5);
    p.x += sin(uTime * uWobbleSpeed + aDist * 3.1 + aSeed * 6.0) * sway;
    p.z += cos(uTime * uWobbleSpeed * 0.8 + aDist * 2.7 + aSeed * 4.0) * sway;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */`
  uniform float uTime;
  uniform float uSurge;
  uniform float uBright;
  uniform vec3 uMint;
  uniform vec3 uViolet;
  varying float vDist;
  varying float vSeed;
  varying vec3 vNormal;
  varying vec3 vView;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    // a dim violet body, brighter where you see it edge-on (so the tendrils look round and soft)
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.6);
    vec3 col = uViolet * (0.10 + 0.45 * rim);
    // mint pulses travelling outward from the body along every tendril
    float p = fract(vDist * 0.85 - uTime * 0.55 + vSeed * 0.37);
    float pulse = smoothstep(0.86, 0.97, p) * (1.0 - smoothstep(0.97, 1.0, p));
    col += uMint * pulse * 2.2;
    // violet sparks: little segments that flash on for a moment
    float cell = floor(vDist * 7.0) + vSeed * 91.0;
    float spark = step(0.965, hash(cell + floor(uTime * 9.0) * 1.7));
    col += uViolet * spark * 1.6;
    // the body glows mint from inside, brightest at the centre
    col += uMint * 0.35 * exp(-vDist * 4.0);
    // a surge lights the whole organism up
    col += mix(uMint, vec3(0.85, 1.0, 0.95), 0.4) * uSurge * (0.6 + 0.6 * rim);
    gl_FragColor = vec4(col * uBright, 1.0);
  }
`;

function makeMaterial(wobble, wobbleSpeed) {
  return new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uTime: { value: 0 }, uSurge: { value: 0 }, uBright: { value: 1 },
      uWobble: { value: wobble }, uWobbleSpeed: { value: wobbleSpeed },
      uMint: { value: MINT }, uViolet: { value: VIOLET }
    },
    // front faces only: drawing both sides of every tendril doubles the added light and washes it to white
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide
  });
}

// Builds tube geometry along polylines, with the distance from the body (aDist) and a per-branch
// random number (aSeed) on every vertex for the shader.
class TendrilBuilder {
  constructor(radial = 5) {
    this.radial = radial;
    this.pos = []; this.nrm = []; this.dist = []; this.seed = []; this.idx = [];
    this.tips = [];
  }

  // pts: Vector3[]; r0/r1 radius at start/end; d0 distance from the body at the first point
  tube(pts, r0, r1, d0, seed) {
    const n = pts.length;
    const base = this.pos.length / 3;
    const up = new THREE.Vector3(0, 1, 0);
    let d = d0;
    for (let i = 0; i < n; i++) {
      const t = pts[Math.min(i + 1, n - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize();
      const a = Math.abs(t.dot(up)) > 0.9 ? new THREE.Vector3(1, 0, 0) : up;
      const u = new THREE.Vector3().crossVectors(t, a).normalize();
      const v = new THREE.Vector3().crossVectors(t, u).normalize();
      if (i > 0) d += pts[i].distanceTo(pts[i - 1]);
      const r = r0 + (r1 - r0) * (i / (n - 1));
      for (let k = 0; k < this.radial; k++) {
        const ang = (k / this.radial) * Math.PI * 2;
        const nx = u.clone().multiplyScalar(Math.cos(ang)).add(v.clone().multiplyScalar(Math.sin(ang)));
        this.pos.push(pts[i].x + nx.x * r, pts[i].y + nx.y * r, pts[i].z + nx.z * r);
        this.nrm.push(nx.x, nx.y, nx.z);
        this.dist.push(d);
        this.seed.push(seed);
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let k = 0; k < this.radial; k++) {
        const a = base + i * this.radial + k;
        const b = base + i * this.radial + ((k + 1) % this.radial);
        const c = a + this.radial;
        const e = b + this.radial;
        this.idx.push(a, b, c, b, e, c);       // wound so the faces point outward
      }
    }
    this.tips.push(pts[n - 1].clone());
    return d;
  }

  // a soft lumpy body (an icosphere pushed in and out), its distance growing from the centre
  blob(centre, radius, seed) {
    const g = new THREE.IcosahedronGeometry(radius, 3);
    const p = g.attributes.position;
    const base = this.pos.length / 3;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = v.clone().normalize();
      const lump = 1 + 0.18 * Math.sin(n.x * 5 + seed) * Math.sin(n.y * 4 + seed * 2) * Math.sin(n.z * 6);
      v.copy(n).multiplyScalar(radius * lump);
      this.pos.push(centre.x + v.x, centre.y + v.y * 1.25, centre.z + v.z);
      this.nrm.push(n.x, n.y, n.z);
      this.dist.push(0.25 * (1 - n.y * 0.3));
      this.seed.push(seed);
    }
    const index = g.index ? g.index.array : [...Array(p.count).keys()];
    for (const i of index) this.idx.push(base + i);
    g.dispose();
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aDist', new THREE.Float32BufferAttribute(this.dist, 1));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.seed, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// A wandering, branching tendril from `start` in direction `dir`, kept inside a tube of
// radius `limitR` around `axis` (x, z) and between heights y0..y1.
function growTendril(builder, rng, start, dir, length, radius, d0, depth, limit) {
  const pts = [start.clone()];
  const steps = Math.max(4, Math.round(length / 0.09));
  const p = start.clone();
  const dv = dir.clone().normalize();
  const stepLen = length / steps;
  for (let i = 0; i < steps; i++) {
    dv.x += (rng() - 0.5) * 0.5; dv.y += (rng() - 0.5) * 0.35; dv.z += (rng() - 0.5) * 0.5;
    dv.normalize();
    p.addScaledVector(dv, stepLen);
    // stay inside the glass
    const dx = p.x - limit.x, dz = p.z - limit.z;
    const rr = Math.hypot(dx, dz);
    if (rr > limit.r) {
      p.x = limit.x + (dx / rr) * limit.r; p.z = limit.z + (dz / rr) * limit.r;
      dv.x -= dx / rr * 0.8; dv.z -= dz / rr * 0.8; dv.normalize();
    }
    p.y = Math.min(limit.y1, Math.max(limit.y0, p.y));
    pts.push(p.clone());
  }
  const seed = rng();
  const dEnd = builder.tube(pts, radius, radius * 0.25, d0, seed);
  if (depth > 0) {
    const branches = depth > 1 ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2);
    for (let b = 0; b < branches; b++) {
      const at = Math.floor(steps * (0.35 + rng() * 0.5));
      const from = pts[at];
      const t = pts[Math.min(at + 1, pts.length - 1)].clone().sub(pts[at]).normalize();
      const off = new THREE.Vector3(rng() - 0.5, (rng() - 0.5) * 0.6, rng() - 0.5).normalize();
      const nd = t.clone().multiplyScalar(0.6).add(off).normalize();
      const dAt = d0 + (dEnd - d0) * (at / steps);
      growTendril(builder, rng, from, nd, length * (0.4 + rng() * 0.25), radius * 0.6, dAt, depth - 1, limit);
    }
  }
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function softDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Organism {
  // tubes: [{ base: Vector3 (bottom of the glass), radius, height }], fragments: [Vector3 on the floor]
  constructor(scene, tubes, fragments) {
    this.group = new THREE.Group();
    this.material = makeMaterial(0.012, 0.9);
    this.fragMaterial = makeMaterial(0.025, 3.2);      // the pieces on the floor twitch
    this.liquidMaterial = new THREE.MeshStandardMaterial({
      color: 0x03161a, emissive: 0x062a26, emissiveIntensity: 0.55, roughness: 0.7, envMapIntensity: 0.1,
      transparent: true, opacity: 0.93, depthWrite: false, side: THREE.DoubleSide
    });
    this.tubes = [];
    this.time = 0;
    this.surge = 0;
    this.nextSurge = 4;
    const dot = softDotTexture();

    tubes.forEach((t, i) => {
      const rng = seededRandom(101 + i * 977);
      const b = new TendrilBuilder(5);
      const limit = { x: t.base.x, z: t.base.z, r: t.radius - 0.08, y0: t.base.y + 0.12, y1: t.base.y + t.height - 0.12 };
      if (t.broken) {
        // the smashed tube: drained, its piece of the organism slumped in a heap at the bottom
        limit.y1 = t.base.y + 0.35;
        for (let k = 0; k < 4; k++) {
          const a = rng() * Math.PI * 2;
          const start = new THREE.Vector3(t.base.x + Math.cos(a) * 0.1, t.base.y + 0.06, t.base.z + Math.sin(a) * 0.1);
          growTendril(b, rng, start, new THREE.Vector3(Math.cos(a + 1), 0.25, Math.sin(a + 1)), 0.9 + rng() * 0.4, 0.07, 0.3, 1, limit);
        }
      } else if (t.radius > 0.7) {
        // the middle tube: the body, with tendrils reaching out in every direction
        const c = new THREE.Vector3(t.base.x, t.base.y + t.height * 0.52, t.base.z);
        b.blob(c, 0.36, 1.3);
        const arms = 10;
        for (let k = 0; k < arms; k++) {
          const a = (k / arms) * Math.PI * 2 + rng() * 0.3;
          const dir = new THREE.Vector3(Math.cos(a), (rng() - 0.45) * 1.6, Math.sin(a));
          growTendril(b, rng, c.clone().addScaledVector(dir.clone().normalize(), 0.26), dir, 1.1 + rng() * 0.5, 0.07, 0.25, 2, limit);
        }
      } else {
        // the side tubes: a large severed tendril section, its fronds spreading out
        const start = new THREE.Vector3(t.base.x + (rng() - 0.5) * 0.15, t.base.y + 0.25, t.base.z + (rng() - 0.5) * 0.15);
        growTendril(b, rng, start, new THREE.Vector3(0, 1, 0), t.height * 0.85, 0.085, 0.15 + i * 0.2, 2, limit);
        for (let k = 0; k < 2; k++) {
          const s2 = new THREE.Vector3(t.base.x, t.base.y + t.height * (0.3 + rng() * 0.4), t.base.z);
          growTendril(b, rng, s2, new THREE.Vector3(rng() - 0.5, 0.3, rng() - 0.5), 0.8, 0.05, 0.6, 1, limit);
        }
      }
      // dark teal liquid filling the tube, so the glow stands out (drawn first, then the organism)
      // (the smashed tube has none: it drained out across the floor)
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(t.radius - 0.015, t.radius - 0.015, t.height, 32, 1, true), this.liquidMaterial);
      liquid.position.set(t.base.x, t.base.y + t.height / 2, t.base.z);
      liquid.renderOrder = 1;
      if (!t.broken) this.group.add(liquid);
      const mesh = new THREE.Mesh(b.build(), this.material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);

      // specks drifting up through the liquid
      const count = t.broken ? 0 : t.radius > 0.7 ? 90 : 50;
      const pos = new Float32Array(count * 3);
      for (let k = 0; k < count; k++) {
        const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * (t.radius - 0.05);
        pos[k * 3] = t.base.x + Math.cos(a) * rr;
        pos[k * 3 + 1] = t.base.y + rng() * t.height;
        pos[k * 3 + 2] = t.base.z + Math.sin(a) * rr;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const specks = new THREE.Points(pg, new THREE.PointsMaterial({
        color: MINT, size: 0.035, map: dot, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.8
      }));
      specks.frustumCulled = false;
      this.group.add(specks);

      // lightning arcs between tendril tips (hidden until one fires)
      const ag = new THREE.BufferGeometry();
      ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 2 * 10 * 3), 3));
      ag.setDrawRange(0, 0);
      const arcs = new THREE.LineSegments(ag, new THREE.LineBasicMaterial({
        color: 0xd9b8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      arcs.frustumCulled = false;
      this.group.add(arcs);

      this.tubes.push({ t, tips: b.tips, specks, arcs, arcTime: 0, nextArc: 1 + rng() * 4, rng });
    });

    // the pieces in the spills on the floor: a few short tendrils, twitching
    fragments.forEach((f, i) => {
      const rng = seededRandom(7 + i * 31);
      const b = new TendrilBuilder(5);
      const limit = { x: f.x, z: f.z, r: 0.35, y0: f.y + 0.02, y1: f.y + 0.06 };
      for (let k = 0; k < 4; k++) {
        const a = rng() * Math.PI * 2;
        growTendril(b, rng, new THREE.Vector3(f.x, f.y + 0.03, f.z), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 0.25 + rng() * 0.2, 0.018, 0.1, 1, limit);
      }
      const mesh = new THREE.Mesh(b.build(), this.fragMaterial);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    });

    scene.add(this.group);
  }

  _fireArc(tube, count) {
    const { tips, arcs, rng } = tube;
    if (tips.length < 2) return;
    const arr = arcs.geometry.attributes.position.array;
    let o = 0;
    for (let n = 0; n < count; n++) {
      const a = tips[Math.floor(rng() * tips.length)];
      const b = tips[Math.floor(rng() * tips.length)];
      if (a === b) continue;
      let prev = a.clone();
      const segs = 10;
      for (let s = 1; s <= segs; s++) {
        const p = a.clone().lerp(b, s / segs);
        if (s < segs) p.add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(0.09));
        arr[o++] = prev.x; arr[o++] = prev.y; arr[o++] = prev.z;
        arr[o++] = p.x; arr[o++] = p.y; arr[o++] = p.z;
        prev = p;
      }
    }
    arcs.geometry.attributes.position.needsUpdate = true;
    arcs.geometry.setDrawRange(0, o / 3);
    tube.arcTime = 0.12;
  }

  update(dt) {
    this.time += dt;
    // every 7-12 seconds a surge runs through every piece at once
    this.nextSurge -= dt;
    if (this.nextSurge <= 0) {
      this.nextSurge = 7 + Math.random() * 5;
      this.surge = 1;
      for (const tube of this.tubes) this._fireArc(tube, 3);
    }
    this.surge = Math.max(0, this.surge - dt * 1.8);
    const flicker = 0.9 + 0.1 * Math.sin(this.time * 13.0) * Math.sin(this.time * 7.3);
    for (const m of [this.material, this.fragMaterial]) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uSurge.value = this.surge;
      m.uniforms.uBright.value = flicker;
    }

    for (const tube of this.tubes) {
      // a stray arc now and then between surges
      tube.nextArc -= dt;
      if (tube.nextArc <= 0) {
        tube.nextArc = 2 + Math.random() * 5;
        this._fireArc(tube, 1);
      }
      if (tube.arcTime > 0) {
        tube.arcTime -= dt;
        if (tube.arcTime <= 0) tube.arcs.geometry.setDrawRange(0, 0);
      }
      // specks drift upward and wrap round to the bottom
      const attr = tube.specks.geometry.attributes.position;
      const arr = attr.array;
      const { base, height } = tube.t;
      for (let k = 1; k < arr.length; k += 3) {
        arr[k] += dt * 0.08;
        if (arr[k] > base.y + height) arr[k] = base.y + 0.05;
      }
      attr.needsUpdate = true;
    }
  }
}
