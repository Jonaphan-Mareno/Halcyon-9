import * as THREE from 'three';

// The engine room door's lock panel, on the corridor side of the wall beside the door: a small
// steel box with a keypad cover, a status light and the lock's module inside. Voss tore it out
// (Flashback 3, story/LockFlashback.js), so in Level 3 it hangs open: the cover gone, the module
// dangling on its wires, a scorch round the hole, and now and then a spark. The flashback builds
// it whole and tears it apart.
//
// Built in code (not in l3-drowned.glb): a few boxes and tubes, one small canvas texture. The
// panel faces +z (the corridor); its middle is the group's origin.

export const PANEL_SIZE = { w: 0.26, h: 0.36, d: 0.07 };
const WIRES = [0xb8322a, 0xd6b23a, 0x2f5fa8, 0x1c1c1c, 0xd8d8d0];

// broken: as it is now (Level 3); otherwise whole, as it was (the flashback)
export function buildLockPanel({ broken = false } = {}) {
  const { w, h, d } = PANEL_SIZE;
  const group = new THREE.Group();
  group.name = 'PROP_LockPanel';
  const mats = [], geos = [], textures = [];
  const mat = (m) => { mats.push(m); return m; };
  const mesh = (geo, m, x, y, z, parent = group) => {
    geos.push(geo);
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  };
  const steel = mat(new THREE.MeshStandardMaterial({ color: 0x55595c, roughness: 0.55, metalness: 0.6 }));
  const dark = mat(new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.9 }));
  const board = mat(new THREE.MeshStandardMaterial({ color: 0x23402e, roughness: 0.7 }));

  // the housing: a back plate and four walls round a dark hole
  const t = 0.012;
  mesh(new THREE.BoxGeometry(w, h, t), steel, 0, 0, -d / 2 + t / 2);
  mesh(new THREE.BoxGeometry(t, h, d), steel, -w / 2 + t / 2, 0, 0);
  mesh(new THREE.BoxGeometry(t, h, d), steel, w / 2 - t / 2, 0, 0);
  mesh(new THREE.BoxGeometry(w, t, d), steel, 0, h / 2 - t / 2, 0);
  mesh(new THREE.BoxGeometry(w, t, d), steel, 0, -h / 2 + t / 2, 0);
  mesh(new THREE.BoxGeometry(w - 2 * t, h - 2 * t, 0.004), dark, 0, 0, -d / 2 + t + 0.002);

  // the cover: brushed steel with a keypad, a little screen and the light
  const cover = new THREE.Group();
  const tex = coverTexture();
  textures.push(tex);
  const face = mat(new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.5, metalness: 0.35 }));
  mesh(new THREE.BoxGeometry(w - 0.01, h - 0.01, 0.012), [steel, steel, steel, steel, face, steel], 0, 0, 0, cover);
  const led = mat(new THREE.MeshBasicMaterial({ color: 0x3dff6a }));
  const ledMesh = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 10), led, 0.075, 0.125, 0.008, cover);
  ledMesh.rotation.x = Math.PI / 2;
  cover.position.z = d / 2 - 0.006;
  group.add(cover);

  // the lock's module, its board and its bolt solenoid, wired to the back of the box
  const module = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.13, 0.1, 0.03), board, 0, 0, 0, module);
  mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.07, 10), steel, 0.02, -0.02, 0.022, module).rotation.z = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.03, 0.02, 0.012), dark, -0.04, 0.03, 0.02, module);
  module.position.set(0, 0.02, -0.01);
  group.add(module);

  // its wires: from the back of the box to the module (a bundle; when the module is pulled out,
  // the bundle stretches after it: wires.scale.z)
  const wires = new THREE.Group();
  wires.position.set(0, 0.02, -d / 2 + 0.015);
  for (let i = 0; i < WIRES.length; i++) {
    const a = (i / WIRES.length) * Math.PI * 2;
    const x = Math.cos(a) * 0.012, y = Math.sin(a) * 0.012;
    // (along +z, unit length: the bundle is scaled to the distance and turned toward the module)
    const curve = new THREE.CatmullRomCurve3([v(x, y, 0), v(x * 2.2, y * 2.2 - 0.01, 0.35), v(x * 1.6 + 0.004 * i, y * 1.6 - 0.02, 0.7), v(x, y, 1)]);
    const m = mat(new THREE.MeshStandardMaterial({ color: WIRES[i], roughness: 0.6 }));
    mesh(new THREE.TubeGeometry(curve, 10, 0.0035, 5, false), m, 0, 0, 0, wires);
  }
  group.add(wires);
  const panel = { group, cover, module, wires, led, mats, geos, textures, sparkAt: new THREE.Vector3(0, 0.02, d / 2) };
  panel.stretch = () => stretchWires(panel);
  stretchWires(panel);

  if (broken) {
    // the cover torn off (it went into the water), the module hanging out on its wires, the light
    // dead, the steel round the hole scorched
    cover.visible = false;
    module.position.set(0.035, -0.27, 0.11);
    module.rotation.set(0.5, 0.35, 1.25);
    stretchWires(panel);
    const scorch = scorchTexture();
    textures.push(scorch);
    const soot = mat(new THREE.MeshBasicMaterial({ map: scorch, transparent: true, depthWrite: false, color: 0x000000 }));
    mesh(new THREE.PlaneGeometry(w * 1.9, h * 1.7), soot, 0.01, 0.05, -d / 2 + 0.002).renderOrder = 1;
  }

  panel.dispose = () => {
    group.removeFromParent();
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const x of textures) x.dispose();
  };
  return panel;
}

// the wire bundle from the back of the box to wherever the module is
const _b = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
function stretchWires(panel) {
  const { wires, module } = panel;
  _b.copy(module.position).sub(wires.position);
  _b.z -= 0.012;
  const len = Math.max(0.01, _b.length());
  wires.scale.set(1, 1, len);
  wires.quaternion.setFromUnitVectors(_z, _b.divideScalar(len));
}

const v = (x, y, z) => new THREE.Vector3(x, y, z);

function coverTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 176;
  const g = c.getContext('2d');
  g.fillStyle = '#7d8286';
  g.fillRect(0, 0, 128, 176);
  for (let i = 0; i < 260; i++) {                      // brushed
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`;
    g.fillRect(0, Math.random() * 176, 128, 1);
  }
  g.fillStyle = '#1d2a26';                             // the little screen
  g.fillRect(16, 16, 74, 26);
  g.fillStyle = '#62d88a';
  g.font = 'bold 14px Courier New, monospace';
  g.fillText('LOCKED', 22, 34);
  g.fillStyle = '#2b2d2f';                             // the keys
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 3; k++) g.fillRect(22 + k * 30, 56 + r * 26, 22, 18);
  }
  g.fillStyle = '#c9c9c4';
  g.font = 'bold 11px Courier New, monospace';
  const keys = '123456789*0#';
  for (let i = 0; i < 12; i++) g.fillText(keys[i], 29 + (i % 3) * 30, 69 + Math.floor(i / 3) * 26);
  g.strokeStyle = '#3a3c3e';
  g.lineWidth = 3;
  g.strokeRect(2, 2, 124, 172);
  for (const [x, y] of [[8, 8], [120, 8], [8, 168], [120, 168]]) {   // screws
    g.fillStyle = '#4a4d50';
    g.beginPath();
    g.arc(x, y, 3.5, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function scorchTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 60, 18, 64, 64, 64);
  r.addColorStop(0, 'rgba(0,0,0,0.85)');
  r.addColorStop(0.5, 'rgba(0,0,0,0.45)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {                       // streaks up from the hole
    g.strokeStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.25})`;
    g.lineWidth = 1 + Math.random() * 3;
    g.beginPath();
    g.moveTo(44 + Math.random() * 40, 64);
    g.lineTo(30 + Math.random() * 68, 4 + Math.random() * 30);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------------------------
// Sparks: a pool of bright points thrown out of a spot, falling and fading (additive, no light of
// their own). burst() at a world point; update() each frame. Nothing is allocated after this.
// ---------------------------------------------------------------------------------------------
export class Sparks {
  constructor(count = 48, { size = 0.022 } = {}) {
    this.n = count;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.next = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,220,150,0.9)');
    r.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
    this.tex = new THREE.CanvasTexture(c);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size, map: this.tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -1000;
  }

  // n sparks out of `at`, mostly along `dir` (a unit vector), at about `speed` m/s
  burst(at, dir, n = 12, speed = 2.2) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      this.pos[i * 3] = at.x;
      this.pos[i * 3 + 1] = at.y;
      this.pos[i * 3 + 2] = at.z;
      const s = speed * (0.4 + Math.random() * 0.9);
      this.vel[i * 3] = (dir.x + (Math.random() - 0.5) * 1.3) * s;
      this.vel[i * 3 + 1] = (dir.y + Math.random() * 0.9 - 0.2) * s;
      this.vel[i * 3 + 2] = (dir.z + (Math.random() - 0.5) * 1.3) * s;
      this.life[i] = 0.35 + Math.random() * 0.55;
    }
  }

  update(dt) {
    const p = this.pos, vl = this.vel, c = this.col;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      vl[i * 3 + 1] -= 9.8 * dt;
      p[i * 3] += vl[i * 3] * dt;
      p[i * 3 + 1] += vl[i * 3 + 1] * dt;
      p[i * 3 + 2] += vl[i * 3 + 2] * dt;
      const k = Math.max(0, this.life[i]) / 0.9;
      c[i * 3] = Math.min(1, 0.4 + 1.6 * k);
      c[i * 3 + 1] = Math.min(1, 1.5 * k * k + 0.1 * k);
      c[i * 3 + 2] = 0.6 * k * k * k;
      if (this.life[i] <= 0) p[i * 3 + 1] = -1000;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
    this.tex.dispose();
  }
}

// A spark's crackle: a few dry clicks and a short electric fizz (synthesised; noise is one buffer,
// made once per audio context)
const noiseFor = new WeakMap();
export function crackle(ac, out, at = ac.currentTime, size = 1) {
  let noise = noiseFor.get(ac);
  if (!noise) {
    noise = ac.createBuffer(1, Math.ceil(ac.sampleRate * 0.5), ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseFor.set(ac, noise);
  }
  const clicks = 3 + Math.round(5 * size * Math.random()) + Math.round(3 * size);
  for (let k = 0; k < clicks; k++) {
    const t0 = at + Math.random() * 0.12 * (0.6 + size);
    const src = ac.createBufferSource();
    src.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1800 + Math.random() * 2600;
    const g = ac.createGain();
    const len = 0.006 + Math.random() * 0.02;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime((0.25 + Math.random() * 0.45) * size, t0 + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(f).connect(g).connect(out);
    src.start(t0, Math.random() * 0.4, len + 0.01);
  }
  // the fizz
  const src = ac.createBufferSource();
  src.buffer = noise;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3200;
  bp.Q.value = 0.8;
  const g = ac.createGain();
  const len = 0.12 + 0.25 * size;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.18 * size, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  src.connect(bp).connect(g).connect(out);
  src.start(at, 0, len + 0.02);
}
