import * as THREE from 'three';
import { frame } from '../ui/hudFrame.js';

// The chute: the way down from Level 2's hatch to the drowned deck, ridden at the start of Level 3
// (straight after its title). Under the hatch the shaft bends into a steep round steel pipe, and
// Voss slides the 300 m to the bottom on its worn floor like a bobsled, metal grinding under him
// and the pipe's joints clacking past: A and D steer him across the curved floor (and up its
// walls), Space ducks. Snapped cables hang sparking into it, burst pipes blast steam across half of
// it, fallen gratings lie on one side, and round shutters hang half shut (duck under them). Red lamps on the walls warn of each one. A hit jolts him and costs a
// little integrity, never all of it: it is a ride, not a test. At the bottom he shoots out into the
// pump room's water.
//
// Built far above the deck (out of sight: the camera sees 120 m, and the fog less), as one tube with
// its own shader (lit by its ring lamps, so it needs no lights), and taken down once he is through.

const ORIGIN = new THREE.Vector3(0, 420, 0);
const LENGTH = 300;               // metres of chute
const STEP = 0.5;                 // metres between the tube's rings of vertices
const R = 1.5;                    // its radius
const SIDES = 32;
const SPEED = [7, 12.5];          // metres a second at the top, and from 60 m down
const SIT = 0.75, DUCK = 0.35;    // his eyes above the floor, sitting and ducked
const WALL = 1.15;                // how far up the side he can ride (radians round from the bottom)
const STEER = 8, PULL = 5, DAMP = 4;   // steering, gravity back down to the bottom, damping
const BEND = 0.6;                 // how hard the bends throw him toward their outside
const HIT_COST = 8, HIT_FLOOR = 20;    // integrity a hit costs, and it never takes him below this
const WARN_AHEAD = 7;             // metres before each obstacle: its red lamps
const UP = new THREE.Vector3(0, 1, 0);

// What is in the way: [kind, metres down, where across (radians from the bottom, + = right)]
//   cable    snapped cables hanging from the roof, sparking: steer round them
//   spray    a burst pipe blasting steam across one half (+1 = from the right wall): keep to the other
//   debris   a fallen grating lying on the floor: steer round it
//   gate     a round shutter hanging half shut in the middle of the pipe: duck under it
const COURSE = [
  ['cable', 60, 0.35], ['cable', 78, -0.4], ['gate', 95],     // (the first after ARIA's warning)
  ['spray', 120, 1], ['debris', 140, -0.6], ['cable', 141, 0.55], ['gate', 165],
  ['spray', 185, -1], ['cable', 205, 0], ['gate', 222], ['debris', 230, 0.45],
  ['cable', 248, -0.5], ['cable', 256, 0.45], ['gate', 274]
];
const HALF = { cable: 0.36, debris: 0.34 };   // how wide each is (radians either side)
const HINTS = 2;                  // the first this many to steer round get a prompt too

const TUBE_VERT = /* glsl */`
  varying vec2 vUv;
  varying float vDist;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
// The pipe's wall: uv = (radians round from the floor, metres down). Dark steel with seams, the
// floor worn bright by everything that has slid down it (scratched along its length), a ring of
// lamps on the roof every 6 m that lights the wall round it, the light at the bottom, and the dark
// swallowing what is far off.
const TUBE_FRAG = /* glsl */`
  uniform float uEnd;
  varying vec2 vUv;
  varying float vDist;
  void main() {
    float th = vUv.x, s = vUv.y;
    float c = cos(th);                                   // 1 on the floor, -1 on the roof
    vec3 col = vec3(0.04, 0.047, 0.058);
    float worn = smoothstep(0.75, 0.95, c);
    float scratch = fract(sin(floor(th * 90.0) * 12.9898) * 43758.5453);
    col = mix(col, vec3(0.075, 0.08, 0.088) * (0.8 + 0.4 * scratch), worn);
    float ringSeam = 1.0 - smoothstep(0.01, 0.04, abs(fract(s / 2.0 + 0.5) - 0.5) * 2.0);
    float runSeam = 1.0 - smoothstep(0.01, 0.03, abs(fract(th / 0.7854 + 0.5) - 0.5) * 0.7854 * ${R.toFixed(2)});
    col *= 1.0 - 0.4 * max(ringSeam, runSeam);
    float dl = abs(fract(s / 6.0 + 0.5) - 0.5) * 6.0;    // metres to the nearest lamp ring
    float lamp = (1.0 - smoothstep(0.08, 0.14, dl)) * smoothstep(-0.2, -0.5, c);
    col += vec3(0.3, 1.2, 1.8) * 2.0 * lamp;
    col += vec3(0.02, 0.085, 0.15) * exp(-dl * 1.2) * (0.6 + 0.4 * (0.5 - 0.5 * c));
    col += vec3(0.6, 0.85, 1.0) * 1.6 * smoothstep(uEnd - 30.0, uEnd, s);
    col *= exp(-vDist * 0.045);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// A burst pipe's jet of steam: pale streaks billowing out along the cone
const JET_FRAG = /* glsl */`
  uniform float uTime;
  varying vec2 vUv;
  varying float vDist;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float lane = floor(vUv.x * 24.0);
    float r = hash(vec2(lane, floor(vUv.y * 4.0 - uTime * 9.0 + hash(vec2(lane, 1.0)) * 5.0)));
    float a = (0.1 + 0.55 * smoothstep(0.4, 1.0, r)) * (1.0 - vUv.y * 0.5);
    gl_FragColor = vec4(vec3(0.75, 0.78, 0.8) * a * exp(-vDist * 0.05), 1.0);
    #include <colorspace_fragment>
  }
`;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Chute {
  constructor(session) {
    this.s = session;
    this.game = session.game;
    this.active = false;
    this.group = new THREE.Group();
    this.group.name = 'Chute';
    this._f = { c: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3() };
    this._f2 = { c: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3() };
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._path();
    this._tube();
    this._course();
    this.game.scene.add(this.group);
  }

  // ------------------------------------------------------------------ building it
  // The line down the middle, sampled every STEP: it drops at about 35 degrees and swings gently
  // left and right. At each sample: the centre, the way down (t), the pipe's up (n) and right (b).
  _path() {
    const n = Math.round(LENGTH / STEP) + 1;
    this.C = [];
    this.T = [];
    this.N = [];
    this.B = [];
    const p = ORIGIN.clone();
    for (let i = 0; i < n; i++) {
      const s = i * STEP;
      const yaw = 0.55 * Math.sin(s / 45) + 0.3 * Math.sin(s / 21 + 1);
      const pitch = 0.6 + 0.08 * Math.sin(s / 31);
      const t = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const b = new THREE.Vector3().crossVectors(t, UP).normalize();
      this.C.push(p.clone());
      this.T.push(t);
      this.N.push(new THREE.Vector3().crossVectors(b, t));
      this.B.push(b);
      p.addScaledVector(t, STEP);
    }
  }

  // the frame at any distance down (between samples)
  _frame(s, out) {
    const f = THREE.MathUtils.clamp(s / STEP, 0, this.C.length - 1.001);
    const i = Math.floor(f), k = f - i;
    out.c.lerpVectors(this.C[i], this.C[i + 1], k);
    out.t.lerpVectors(this.T[i], this.T[i + 1], k).normalize();
    out.n.lerpVectors(this.N[i], this.N[i + 1], k).normalize();
    out.b.lerpVectors(this.B[i], this.B[i + 1], k).normalize();
    return out;
  }

  // a point on (or off) the wall: th radians round from the floor, h metres in from the wall
  _point(f, th, h, out) {
    const r = R - h;
    return out.copy(f.c).addScaledVector(f.n, -Math.cos(th) * r).addScaledVector(f.b, Math.sin(th) * r);
  }

  // A strip round the pipe from th0 to th1, h in from the wall, its uv (radians round, metres down)
  _strip(th0, th1, sides, h) {
    const rings = this.C.length;
    const pos = new Float32Array(rings * (sides + 1) * 3);
    const uv = new Float32Array(rings * (sides + 1) * 2);
    const f = { c: null, n: null, b: null };
    let k = 0, q = 0;
    for (let i = 0; i < rings; i++) {
      f.c = this.C[i];
      f.n = this.N[i];
      f.b = this.B[i];
      for (let j = 0; j <= sides; j++) {
        const th = th0 + (th1 - th0) * (j / sides);
        this._point(f, th, h, this._v);
        pos[k++] = this._v.x;
        pos[k++] = this._v.y;
        pos[k++] = this._v.z;
        uv[q++] = th;
        uv[q++] = i * STEP;
      }
    }
    const index = [];
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    return geo;
  }

  _tube() {
    this.uniforms = { uTime: { value: 0 }, uEnd: { value: LENGTH } };
    const wall = new THREE.Mesh(this._strip(-Math.PI, Math.PI, SIDES, 0),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, side: THREE.DoubleSide }));
    wall.frustumCulled = false;
    this.group.add(wall);
  }

  // Each obstacle in its own group, set in the pipe's cross-section: local x right, y up, z back
  _course() {
    const steel = new THREE.MeshStandardMaterial({ color: 0x3a4652, roughness: 0.45, metalness: 0.6, emissive: 0x0c1218 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.8, metalness: 0.1, emissive: 0x050608 });
    const hazardTex = canvasTexture(256, 256, (g, w, h) => {
      g.fillStyle = '#16181b';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#e07a22';
      for (let x = -h; x < w + h; x += 48) {
        g.beginPath();
        g.moveTo(x, h);
        g.lineTo(x + 24, h);
        g.lineTo(x + 24 + h, 0);
        g.lineTo(x + h, 0);
        g.closePath();
        g.fill();
      }
    });
    const hazard = new THREE.MeshStandardMaterial({ map: hazardTex, emissiveMap: hazardTex, emissive: 0x777777, roughness: 0.5, metalness: 0.3 });
    this._warnMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.15, 0.08) });
    const warnGeo = new THREE.BoxGeometry(0.16, 0.16, 0.3);
    this._jetMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: TUBE_VERT, fragmentShader: JET_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const sparkTex = canvasTexture(64, 64, (g, w) => {
      const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.3, 'rgba(255,200,120,0.9)');
      grad.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
    });
    this._sparkMat = new THREE.PointsMaterial({ map: sparkTex, color: new THREE.Color(2.5, 1.6, 0.8), size: 0.15,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

    this.obstacles = [];
    const f = this._f;
    const basis = new THREE.Matrix4();
    for (const [kind, at, across = 0] of COURSE) {
      this._frame(at, f);
      const g = new THREE.Group();
      g.position.copy(f.c);
      g.quaternion.setFromRotationMatrix(basis.makeBasis(f.b, f.n, this._v.copy(f.t).negate()));
      this.group.add(g);
      const o = { kind, at, across, group: g, passed: false };
      if (kind === 'cable') this._cable(o, rubber);
      else if (kind === 'spray') this._spray(o, steel);
      else if (kind === 'debris') this._debris(o, steel, hazard);
      else this._gate(o, steel, hazard);
      this.obstacles.push(o);
      // its warning: a red lamp on each wall a little before it
      this._frame(at - WARN_AHEAD, f);
      for (const side of [-1, 1]) {
        const lamp = new THREE.Mesh(warnGeo, this._warnMat);
        this._point(f, side * 1.45, 0.05, lamp.position);
        lamp.quaternion.setFromRotationMatrix(basis.makeBasis(f.b, f.n, this._v.copy(f.t).negate()));
        this.group.add(lamp);
      }
    }
  }

  // three cables from the roof down to near the floor at `across`, the longest sparking at its end
  _cable(o, rubber) {
    const x = Math.sin(o.across) * R * 0.92;
    const floor = -Math.cos(o.across) * R;
    o.sway = new THREE.Group();
    o.group.add(o.sway);
    o.sway.position.set(x, Math.sqrt(Math.max(0, R * R - x * x)), 0);
    const lens = [0, 0.35, 0.6];
    lens.forEach((short, i) => {
      const len = o.sway.position.y - floor - 0.22 - short;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 6), rubber);
      m.position.set((i - 1) * 0.12, -len / 2, (i - 1) * 0.06);
      o.sway.add(m);
    });
    o.tip = new THREE.Vector3(0, -(o.sway.position.y - floor - 0.22), 0);
    const n = 16;
    o.spark = { pos: new Float32Array(n * 3), vel: new Float32Array(n * 3), life: new Float32Array(n) };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(o.spark.pos, 3));
    o.points = new THREE.Points(geo, this._sparkMat);
    o.points.frustumCulled = false;
    o.sway.add(o.points);
  }

  // a pipe stub high on one wall, its jet across to just past the middle
  _spray(o, steel) {
    const side = o.across;
    const from = new THREE.Vector3(Math.sin(side * 1.25) * R * 0.95, -Math.cos(side * 1.25) * R * 0.95, 0);
    const to = new THREE.Vector3(-side * 0.15, -R + 0.45, 0.3);
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 10), steel);
    stub.position.copy(from);
    stub.lookAt(this._v.copy(from).multiplyScalar(2));
    stub.rotateX(Math.PI / 2);
    o.group.add(stub);
    const len = from.distanceTo(to);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.55, len, 14, 1, true), this._jetMat);
    jet.position.copy(from).lerp(to, 0.5);
    jet.quaternion.setFromUnitVectors(UP, this._v.copy(from).sub(to).normalize());
    o.group.add(jet);
  }

  // a fallen grating on the floor at `across`, its edge striped
  _debris(o, steel, hazard) {
    const th = o.across;
    const panel = new THREE.Group();
    panel.position.set(Math.sin(th) * (R - 0.2), -Math.cos(th) * (R - 0.2), 0);
    panel.rotation.z = th;                   // lying along the floor there
    panel.rotation.x = -0.35;                // propped up, its far edge on the floor
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 1.1), steel);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.1, 0.12), hazard);
    edge.position.z = -0.55;
    panel.add(slab, edge);
    for (let i = -2; i <= 2; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 1.05), steel);
      bar.position.x = i * 0.2;
      panel.add(bar);
    }
    o.group.add(panel);
  }

  // a round shutter in the middle of the pipe, held by three struts from the roof: the ring-shaped
  // gap round it is only low enough to get through ducked
  _gate(o, steel, hazard) {
    const r = R - 0.7;
    const plate = new THREE.Mesh(new THREE.CircleGeometry(r, 32), hazard);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 40), steel);
    o.group.add(plate, rim);
    for (const a of [Math.PI / 2, Math.PI / 2 + 0.9, Math.PI / 2 - 0.9]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), steel);
      strut.position.set(Math.cos(a) * (r + 0.35), Math.sin(a) * (r + 0.35), 0);
      strut.rotation.z = a - Math.PI / 2;
      o.group.add(strut);
    }
  }

  // ------------------------------------------------------------------ riding it
  // Starts the ride; resolves once he has shot out of the bottom
  ride() {
    const ui = this.game.ui;
    this.active = true;
    this.dist = 0;
    this.across = 0;
    this.spin = 0;
    this.duck = 0;
    this.shake = 0;
    this.slow = 0;
    this.look = { x: 0, y: 0 };
    this.keys = new Set();
    this.hinted = 0;
    this._onKeyDown = (e) => {
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouse = (e) => {
      if (!document.pointerLockElement || this.game.state !== 'PLAYING') return;
      this.look.x = THREE.MathUtils.clamp(this.look.x + e.movementX * 0.002, -0.5, 0.5);
      this.look.y = THREE.MathUtils.clamp(this.look.y + e.movementY * 0.002, -0.35, 0.35);
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouse);
    ui.setObjective('Slide down the chute to the deck below');
    ui.setWaypoint(null);
    this.help = document.createElement('div');
    this.help.id = 'chute-help';
    this.help.innerHTML = `
      <div class="fh-title">THE CHUTE</div>
      <div class="fh-row"><span class="fh-key">A / D</span><span>Steer round what is in the way</span></div>
      <div class="fh-row"><span class="fh-key">SPACE / SHIFT</span><span>Duck under the shutters</span></div>
      <div class="fh-tip">Red lamps on the walls: something is just ahead.</div>`;
    document.getElementById('ui-layer').appendChild(this.help);
    frame(this.help, { shape: 'slim' });
    requestAnimationFrame(() => this.help.classList.add('visible'));
    // and big in the middle of the screen as the ride starts, blinking for a few seconds, so no one
    // misses how to steer
    this.banner = document.createElement('div');
    this.banner.id = 'chute-banner';
    this.banner.innerHTML = `
      <div class="cb-row"><span class="cb-key">A</span><span class="cb-key">D</span><span>STEER LEFT AND RIGHT</span></div>
      <div class="cb-row"><span class="cb-key wide">SPACE</span><span class="cb-or">or</span><span class="cb-key wide">SHIFT</span><span>DUCK</span></div>`;
    document.getElementById('ui-layer').appendChild(this.banner);
    this._bannerT = 0;
    this.s.sfx?.startLoop('chute', 'chute-slide', { ui: true, vol: 0.55, rate: 0.8 });
    this.s.say?.('chute');           // ARIA: what is in the way, and what to do about it
    this._joint = 0;
    return new Promise((resolve) => { this._done = resolve; });
  }

  update(dt, playing) {
    if (!this.active) return;
    this.uniforms.uTime.value += dt;
    // the controls in the middle of the screen: on after the title has faded, blinking, gone after
    // four seconds
    if (this.banner && playing) {
      this._bannerT += dt;
      const t = this._bannerT;
      this.banner.classList.toggle('on', t > 0.7 && t < 4.7);
      this.banner.classList.toggle('dim', t > 0.7 && t < 3.7 && Math.floor((t - 0.7) / 0.5) % 2 === 1);
      if (t > 5.5) {
        this.banner.remove();
        this.banner = null;
      }
    }
    const k = this.keys;
    if (playing) {
      const steer = ((k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0) - ((k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0);
      const ducking = k.has('Space') || k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyC') || k.has('KeyS') ||
        k.has('ArrowDown') || k.has('ControlLeft');
      this.duck += ((ducking ? 1 : 0) - this.duck) * (1 - Math.exp(-14 * dt));
      // the bends throw him toward their outside; gravity pulls him back down to the bottom
      const speed = THREE.MathUtils.lerp(SPEED[0], SPEED[1], THREE.MathUtils.smoothstep(this.dist, 0, 60)) * (1 - 0.35 * this.slow);
      const f = this._frame(this.dist, this._f), g = this._frame(this.dist + 2, this._f2);
      const bend = this._w.subVectors(g.t, f.t).dot(f.b) / 2;          // which way, and how hard, it turns
      this.spin += (STEER * steer - PULL * Math.sin(this.across) - BEND * bend * speed * speed / (R - SIT) - DAMP * this.spin) * dt;
      this.across += this.spin * dt;
      if (Math.abs(this.across) > WALL) {
        this.across = Math.sign(this.across) * WALL;
        this.spin *= -0.3;
      }
      const before = this.dist;
      this.dist += speed * dt;
      this.slow = Math.max(0, this.slow - dt * 0.8);
      this._collide(before, this.dist);
      // the metal grinds faster as he speeds up, and each of the pipe's joints clacks under him
      const loop = this.s.sfx?.loops?.chute?.src;
      if (loop) loop.playbackRate.value = 0.75 + 0.4 * (speed / SPEED[1]);
      if (Math.floor(this.dist / 6) > Math.floor(before / 6)) {
        this.s.sfx?.play('chute-joint-' + (1 + (this._joint++ % 2)), { ui: true, vol: 0.35, rand: 0.08 });
      }
      this._prompt(speed);
      if (this.dist >= LENGTH - 4) return this._finish();
    }
    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (!document.pointerLockElement) {
      this.look.x *= Math.exp(-2 * dt);
      this.look.y *= Math.exp(-2 * dt);
    }
    // the red lamps blink; the cables near him spark and sway
    const blink = Math.sin(this.uniforms.uTime.value * 9) > 0 ? 2.2 : 0.35;
    this._warnMat.color.setRGB(blink, blink * 0.07, blink * 0.035);
    for (const o of this.obstacles) {
      if (o.kind !== 'cable' || Math.abs(o.at - this.dist) > 40) continue;
      o.sway.rotation.x = Math.sin(this.uniforms.uTime.value * 1.7 + o.at) * 0.12;
      this._sparks(o, dt);
    }
    this._camera();
  }

  // Did he just slide through something he was not clear of?
  _collide(before, after) {
    for (const o of this.obstacles) {
      if (o.passed || o.at > after) continue;
      if (o.at <= before && o.at > 0) {
        o.passed = true;
        continue;
      }
      o.passed = true;
      let hit;
      if (o.kind === 'gate') hit = this.duck < 0.6;
      else if (o.kind === 'spray') hit = o.across > 0 ? this.across > 0.02 : this.across < -0.02;
      else hit = Math.abs(this.across - o.across) < HALF[o.kind];
      if (hit) this._hit(o);
    }
  }

  _hit(o) {
    const p = this.s.player;
    if (p) p.integrity = Math.min(p.integrity, Math.max(HIT_FLOOR, p.integrity - HIT_COST));
    this.s.hud?.flash();
    this.shake = 0.35;
    this.slow = 1;
    this.spin += (Math.random() - 0.5) * 3;
    // a metal hit, or the steam's hiss
    if (o.kind === 'spray') this.s.sfx?.play('air-hiss', { ui: true, vol: 0.7, rate: 0.9, rand: 0.1 });
    else this.s.sfx?.play('metal-hit', { ui: true, vol: 0.9, rand: 0.06 });
  }

  // what to press, as each one comes up (the shutters always; the first couple of the rest)
  _prompt(speed) {
    const next = this.obstacles.find((o) => !o.passed);
    const ui = this.game.ui;
    if (!next || next.at - this.dist > speed * 1.4) {
      ui.setPrompt(null);
      return;
    }
    if (next.kind === 'gate') ui.setPrompt('SPACE / SHIFT   Duck!');
    else if (next.hint || this.hinted < HINTS) {
      if (!next.hint) {
        next.hint = true;
        this.hinted++;
      }
      ui.setPrompt('A / D   Steer round it');
    } else ui.setPrompt(null);
  }

  _sparks(o, dt) {
    const sp = o.spark, n = sp.life.length;
    for (let i = 0; i < n; i++) {
      sp.life[i] -= dt;
      if (sp.life[i] <= 0) {
        sp.life[i] = Math.random() < 0.6 ? 0.25 + Math.random() * 0.35 : 0.05;
        sp.pos[i * 3] = o.tip.x;
        sp.pos[i * 3 + 1] = o.tip.y;
        sp.pos[i * 3 + 2] = o.tip.z;
        sp.vel[i * 3] = (Math.random() - 0.5) * 2.5;
        sp.vel[i * 3 + 1] = Math.random() * 1.6;
        sp.vel[i * 3 + 2] = (Math.random() - 0.5) * 2.5;
      }
      sp.vel[i * 3 + 1] -= 6 * dt;
      sp.pos[i * 3] += sp.vel[i * 3] * dt;
      sp.pos[i * 3 + 1] += sp.vel[i * 3 + 1] * dt;
      sp.pos[i * 3 + 2] += sp.vel[i * 3 + 2] * dt;
    }
    o.points.geometry.attributes.position.needsUpdate = true;
  }

  // He sits on the floor where he is across it, looking a little way down the pipe; up the walls
  // the view rolls with him (half as far, so it does not turn the stomach)
  _camera() {
    const cam = this.game.camera.instance;
    const h = THREE.MathUtils.lerp(SIT, DUCK, this.duck);
    const f = this._frame(this.dist, this._f);
    const eye = this._point(f, this.across, h, this._v);
    const ahead = this._point(this._frame(this.dist + 7, this._f2), this.across, h, this._w);
    const fwd = ahead.sub(eye).normalize();
    const inward = this._f2.c.copy(f.c).sub(eye).normalize();
    const up = cam.up.copy(f.n).add(inward).normalize();
    // looking round with the mouse, a little
    fwd.applyAxisAngle(up, -this.look.x);
    fwd.applyAxisAngle(this._f2.t.crossVectors(fwd, up).normalize(), -this.look.y);
    if (this.shake > 0) eye.add(this._f2.t.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.shake * 0.25));
    cam.position.copy(eye);
    cam.lookAt(fwd.add(eye));
  }

  // Out of the bottom: a white flash as he drops into the pump room's water
  _finish() {
    this.active = false;
    const ui = this.game.ui;
    ui.setPrompt(null);
    this.help?.remove();
    this.banner?.remove();
    this.s.sfx?.stopLoop('chute', 0.6);
    this.s.sfx?.play('whoosh-2', { ui: true, vol: 0.8, rate: 0.8 });
    const splash = document.createElement('div');
    splash.id = 'chute-splash';
    document.getElementById('ui-layer').appendChild(splash);
    void splash.offsetWidth;
    splash.classList.add('on');
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouse);
    const cam = this.game.camera.instance;
    setTimeout(() => {
      cam.up.set(0, 1, 0);
      cam.rotation.order = 'YXZ';
      cam.rotation.set(0, 0, 0);
      this.dispose();
      this._done?.();
      splash.classList.remove('on');
      splash.classList.add('off');
      setTimeout(() => splash.remove(), 1000);
    }, 160);
  }

  dispose() {
    this.active = false;
    this.help?.remove();
    this.banner?.remove();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouse);
    if (!this.group.parent) return;
    this.group.parent.remove(this.group);
    const seen = new Set();
    this.group.traverse((o) => {
      o.geometry?.dispose();
      for (const m of [].concat(o.material || [])) {
        if (seen.has(m)) continue;
        seen.add(m);
        m.map?.dispose();
        m.dispose();
      }
    });
  }
}
