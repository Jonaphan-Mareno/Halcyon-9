import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createGLTFLoader } from '../core/loaders.js';
import { makeToonRamp, toonFrom } from '../entities/Player.js';
import { BriefingFlashback } from '../story/BriefingFlashback.js';
import { Person, SCALE, seg, v3, yawOf } from '../story/firstPersonRig.js';

// The narration's line 3 (EndingNarration.js): the conference room of Flashback 1, years on. Six
// people round its table (Blender/scripts/build_conference_people.py: nobody from the crew) listen
// to ARIA on the room's screen. On "...and how it can cure dementia." the picture cuts to
// their faces, and it lands: brows up, mouths open, a hand to a mouth, someone half out of the chair.
//
// It draws on a canvas of its own, under the narration's overlay, with a small renderer of its own
// (the narration runs with the game's drawing nothing, or, on the test link, with no game at all).
//   load()         the models, the room, ARIA's screen (no drawing yet)
//   warm()         the renderer, and the shaders compiled: while the picture is still black
//   draw(t, s, r)  the picture at t (s from the start of the shot, r from the reaction; r < 0 before it)

const FILES = './assets/models/';
const AVATAR = './assets/ending/aria-avatar.jpg';
const RENDER_SCALE = 0.85;

// Who sits where: the flashback's five chairs, and one on her feet by the wall. look: where they turn
// on the news ('screen', or another person's head). lean: back in the chair (-) or forward (+). rise:
// how far out of the chair. mouth: a hand to it ('R' or 'L'). wait: how long it takes them.
const SEATS = {
  'conf-man-1':   { seat: [0, 1.95], face: [0, -1], look: 'screen', lean: -0.14, rise: 0, wait: 0.2 },
  'conf-woman-2': { seat: [-0.7, 1.36], face: [0.89, -0.45], look: 'conf-man-1', lean: -0.08, rise: 0, wait: 0.12 },
  'conf-man-3':   { seat: [0.62, 1.42], face: [-0.89, -0.45], look: 'screen', lean: -0.16, rise: 0.22, wait: 0 },
  'conf-woman-1': { seat: [-0.8, 0.3], face: [0.89, -0.45], look: 'screen', lean: -0.05, rise: 0, wait: 0.05, mouth: 'L' },
  'conf-man-2':   { seat: [0.8, 0.3], face: [-0.89, -0.45], look: 'conf-woman-1', lean: -0.1, rise: 0, wait: 0.28 },
  'conf-woman-3': { stand: [1.62, 1.05], face: [-0.8, -0.6], look: 'screen', lean: -0.05, rise: 0, wait: 0.08, mouth: 'R' }
};
const SEAT_DROP = 0.42;       // how far the hips drop into a chair
const TABLE_Y = 0.74;
const WIDE = { from: v3(-2.3, 1.62, 2.75), to: v3(-2.05, 1.56, 2.4), aim: v3(0.42, 1.12, -1.25), fov: 52 };
// (closer on the screen, over their shoulders, so her mouth can be seen)
const SCREEN_SHOT = { from: v3(0.0, 1.3, 1.5), to: v3(0.03, 1.31, 1.2), aim: v3(0.28, 1.26, -2.57), fov: 36 };
const SCREEN_CUT = 3.6;       // s into the picture
const FACES = { from: v3(0.34, 1.26, -1.72), to: v3(0.34, 1.24, -1.42), aim: v3(0.05, 1.02, 1.25), fov: 44 };
const SHOCK = { jaw_open: 0.5, mouth_wide: 0.06, brow_up: 1.4, brow_inner_up: 1.0, blink: 0 };

// ARIA on the screen: her face in dots, as her hologram draws her, with her name along the bottom.
// While she speaks her own lips part: the picture is pulled apart along the line of her mouth in the
// avatar (LIPS, its slope, LIP_W; most in the middle, nothing at the corners), her lower lip and chin
// go down, and only a dim shade shows between. Her light
// moves with it; a scan line rolls down.
const ARIA_SCREEN = {
  uniforms: { tFace: { value: null }, uTime: { value: 0 }, uTalk: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tFace; uniform float uTime, uTalk;
    varying vec2 vUv;
    const vec2 LIPS = vec2(0.54, 0.206), FACE = vec2(0.5175, 0.92);
    const float SLOPE = 0.13, LIP_W = 0.2;
    void main() {
      vec2 q = (vUv - LIPS) / FACE;                      // from the middle of her lips, in shares of her face
      float y = q.y - SLOPE * q.x;                       // from the line of her mouth
      float gap = 0.05 * uTalk * max(0.0, 1.0 - q.x * q.x / (LIP_W * LIP_W));
      // below the line everything goes down by the gap, less and less toward her chin
      float drop = gap * smoothstep(-0.2, -0.05, y) * step(y, 0.0);
      vec3 c = texture2D(tFace, vUv + vec2(0.0, drop * FACE.y)).rgb;
      float inside = smoothstep(0.0, 0.004, y + gap) * smoothstep(0.0, -0.004, y) * step(0.001, gap);
      c = mix(c, vec3(0.03, 0.13, 0.16), inside * 0.9);
      float roll = fract(uTime * 0.17);
      c += vec3(0.015, 0.04, 0.05) * smoothstep(0.03, 0.0, abs(vUv.y - 1.0 + roll));
      c *= 0.94 + 0.06 * sin(vUv.y * 420.0);
      c *= 1.15 + 0.3 * uTalk + 0.04 * sin(uTime * 2.1);
      gl_FragColor = vec4(c, 1.0);
    }`
};

export class ConferenceScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = false;
    this.people = {};
    this._v = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._size = new THREE.Vector2();
    this._last = 0;
  }

  async load() {
    const [gltfs, avatar] = await Promise.all([
      Promise.all(Object.keys(SEATS).map((n) => createGLTFLoader().loadAsync(FILES + n + '.glb'))),
      new THREE.TextureLoader().loadAsync(AVATAR).catch(() => null)
    ]);
    // the room, as Flashback 1 builds it (its own look's pass, its chairs and table, no cast)
    const room = (this.room = new BriefingFlashback(null, { root: null }));
    room.buildRoom();
    this.scene = room.scene;
    this.camera = room.camera;
    this.screen = new THREE.ShaderMaterial({ ...ARIA_SCREEN, uniforms: THREE.UniformsUtils.clone(ARIA_SCREEN.uniforms) });
    this.face = this._faceTexture(avatar?.image);
    avatar?.dispose();
    this.screen.uniforms.tFace.value = this.face;
    room.screenMesh.material = this.screen;
    room.jug.visible = false;       // (it stands right in the way of their faces)
    room.screenGlow.color.setHex(0x8fdcff);
    room.screenGlow.intensity = 1.3;
    // (the chair the sixth has no need of stays empty; everyone else's is taken)
    this.ramp = makeToonRamp();
    this._mats = [];
    Object.keys(SEATS).forEach((name, i) => this._seat(name, gltfs[i]));
    this.ready = true;
    this._pose(0, -1, 1 / 30);
  }

  _seat(name, gltf) {
    const c = SEATS[name];
    const model = cloneSkinned(gltf.scene);
    model.scale.setScalar(SCALE);
    model.rotation.set(0, Math.PI, 0);
    const made = new Map();
    const morphs = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      if (!made.has(o.material)) made.set(o.material, toonFrom(o.material, this.ramp, { vertexColors: !!o.geometry.attributes.color }));
      o.material = made.get(o.material);
      o.frustumCulled = false;
      if (o.morphTargetDictionary) morphs.push(o);
    });
    this._mats.push(...made.values());
    // (Person wants a walk; nobody here goes anywhere)
    const idle = gltf.animations.find((a) => a.name === 'Idle') || gltf.animations[0];
    idle.name = 'Idle';
    const still = idle.clone();
    still.name = 'Walk';
    const p = new Person(name, model, [idle, still]);
    p.yaw = yawOf(c.face[0], c.face[1]);
    p.sit = c.seat ? 1 : 0;
    p.look = new THREE.Vector3();
    p.morphs = morphs;
    p.c = c;
    const spot = c.seat || c.stand;
    p.pos.set(spot[0], c.seat ? -SEAT_DROP : 0, spot[1]);
    this.people[name] = p;
    this.scene.add(p.group);
  }

  // Her avatar in dots on the screen's dark teal (a canvas: it costs the shader nothing)
  _faceTexture(img) {
    const W = 1024, H = 576, c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const bg = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.6);
    bg.addColorStop(0, '#0a2a38');
    bg.addColorStop(1, '#03090d');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    if (img) {
      const N = 96, s = document.createElement('canvas');
      s.width = s.height = N;
      const sg = s.getContext('2d');
      sg.drawImage(img, 0, 0, N, N);
      const d = sg.getImageData(0, 0, N, N).data;
      const size = H * 0.92, x0 = (W - size) / 2, y0 = (H - size) / 2, cell = size / N;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = (x + y * N) * 4;
          const l = Math.min(1, Math.max(0, ((d[i] * 0.3 + d[i + 1] * 0.6 + d[i + 2] * 0.1) / 255 - 0.12) * 1.6));
          if (l < 0.04) continue;
          g.fillStyle = `rgba(150,235,255,${(0.25 + 0.75 * l).toFixed(2)})`;
          g.beginPath();
          g.arc(x0 + (x + 0.5) * cell, y0 + (y + 0.5) * cell, cell * (0.12 + 0.34 * l), 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    g.fillStyle = 'rgba(4,28,36,0.9)';
    g.fillRect(40, H - 92, 270, 58);
    g.fillStyle = '#d6f6ff';
    g.font = 'bold 30px Arial, sans-serif';
    g.fillText('ARIA', 56, H - 56);
    g.font = '13px Arial, sans-serif';
    g.fillText('HALCYON-9  ·  LIVE', 138, H - 56);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  async warm() {
    if (this.renderer || !this.ready) return;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this._fit();
    this.camera.position.copy(WIDE.from);
    this.camera.lookAt(WIDE.aim);
    this.camera.updateMatrixWorld();
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.compile(this.room.postScene, this.room.postCam);
    // one frame, off the screen, so the textures are up before the picture needs them
    this.renderer.setRenderTarget(this.room.target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
  }

  _fit() {
    const w = Math.max(16, this.canvas.clientWidth), h = Math.max(16, this.canvas.clientHeight);
    if (this._w === w && this._h === h) return;
    this._w = w;
    this._h = h;
    this.renderer.setSize(w, h, false);
    this.room.target.setSize(Math.round(w * RENDER_SCALE), Math.round(h * RENDER_SCALE));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // Everyone, for the moment r from the reaction (negative: before it): calm, then each in their own time
  _pose(t, r, dt) {
    for (const p of Object.values(this.people)) {
      const c = p.c, k = r < 0 ? 0 : seg(r, c.wait, c.wait + 0.42);
      // a jolt back, an overshoot that settles
      const jolt = r < 0 ? 0 : 0.5 * seg(r, c.wait, c.wait + 0.18) * (1 - seg(r, c.wait + 0.18, c.wait + 0.8));
      p.lean = c.lean * (k + jolt);
      if (c.seat) {
        p.sit = 1 - c.rise * k;
        const spot = c.seat;
        p.pos.set(spot[0], -SEAT_DROP * p.sit, spot[1]);
      }
      // the screen until the news; then theirs
      const other = r > c.wait && c.look !== 'screen' ? this.people[c.look] : null;
      if (other) other.at('head', p.look, 0.03);
      else p.look.copy(this.room.screenCentre);
      for (const m of p.morphs) {
        const inf = m.morphTargetInfluences, d = m.morphTargetDictionary;
        for (const [name, amount] of Object.entries(SHOCK)) if (d[name] !== undefined) inf[d[name]] = amount * k;
      }
      this._hands(p, k);
      p.update(dt);
    }
  }

  // Hands on the table (or down by her side, for the one on her feet); one to the mouth on the news
  _hands(p, k) {
    const c = p.c;
    if (c.seat) {
      const [fx, fz] = c.face;
      for (const [side, s] of [['R', 1], ['L', -1]]) {
        const rx = -fz * s, rz = fx * s;
        const g = ((p._grips ||= {})[side] ||= { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: v3(0, -1, 0), pole: new THREE.Vector3(), curl: [0.25, 0.3, 0.2], thumb: [0.15, 0.1], w: 1 });
        g.wrist.set(c.seat[0] + fx * 0.47 + rx * 0.16, TABLE_Y + 0.035, c.seat[1] + fz * 0.47 + rz * 0.16);
        g.fingers.set(fx - rx * 0.35, 0, fz - rz * 0.35).normalize();
        g.pole.set(rx * 0.8 - fx * 0.3, -0.5, rz * 0.8 - fz * 0.3).normalize();
        g.w = 1;
        p.grips[side] = g;
      }
    }
    if (c.mouth && k > 0) {
      const fwd = this._aim.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const side = c.mouth;
      const g = (p._mouth ||= { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(), pole: new THREE.Vector3(), curl: [0.3, 0.35, 0.25], thumb: [0.2, 0.1], w: 0 });
      p.at('head', g.wrist, -0.09).addScaledVector(fwd, 0.16);
      g.fingers.set(0, 1, 0).addScaledVector(fwd, 0.2).normalize();
      g.palm.copy(fwd).multiplyScalar(-1);
      const s = side === 'R' ? 1 : -1;
      g.pole.set(Math.cos(p.yaw) * s, -0.9, -Math.sin(p.yaw) * s).normalize();
      g.w = k;
      p.grips[side] = g;
    }
  }

  // t: the narration's clock. shot: s since the picture came up. r: s from the reaction (negative
  // before it). talk: how far her mouth is open (0..1).
  draw(t, shot, r, talk) {
    if (!this.renderer) return;
    this._fit();
    // (a jump in the clock, as when a picture is checked at one moment: everyone settles first)
    let dt = t - this._last;
    if (dt < 0 || dt > 2) dt = 1.5;
    this._last = t;
    const steps = Math.min(45, Math.max(1, Math.ceil(dt / (1 / 30))));
    for (let i = 0; i < steps; i++) this._pose(t, r, dt / steps);
    // the camera: the slow push across the room, then its faces
    const cam = this.camera, shotDef = r >= 0 ? FACES : shot >= SCREEN_CUT ? SCREEN_SHOT : WIDE;
    const u = r >= 0 ? seg(r, 0, 3.4) : shot >= SCREEN_CUT ? seg(shot, SCREEN_CUT, SCREEN_CUT + 8) : seg(shot, 0, 7);
    cam.position.lerpVectors(shotDef.from, shotDef.to, u);
    cam.position.x += 0.006 * Math.sin(t * 0.63);
    cam.position.y += 0.004 * Math.sin(t * 0.91);
    if (cam.fov !== shotDef.fov) {
      cam.fov = shotDef.fov;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(shotDef.aim);
    cam.updateMatrixWorld();
    const su = this.screen.uniforms;
    su.uTime.value = t;
    su.uTalk.value = talk;
    this.room.screenGlow.intensity = 1.2 + 0.7 * talk;
    const room = this.room, u2 = room.post.material.uniforms;
    u2.uAspect.value = cam.aspect;
    u2.uTime.value = t;
    u2.uWhite.value = 0;
    u2.uBlink.value = 0;
    u2.uSoft.value = 0.45;
    const gl = this.renderer;
    gl.setRenderTarget(room.target);
    gl.render(this.scene, cam);
    gl.setRenderTarget(null);
    u2.tScene.value = room.target.texture;
    gl.render(room.postScene, room.postCam);
  }

  dispose() {
    for (const p of Object.values(this.people)) {
      p.mixer.stopAllAction();
      p.mixer.uncacheRoot(p.model);
      p.model.traverse((o) => {
        if (o.isSkinnedMesh) {
          o.skeleton.dispose();
          o.geometry.dispose();
        }
      });
      this.scene?.remove(p.group);
    }
    this.people = {};
    for (const m of this._mats || []) {
      m.map?.dispose();
      m.dispose();
    }
    this.ramp?.dispose();
    this.face?.dispose();
    this.screen?.dispose();
    this.room?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss?.();
    this.renderer = null;
    this.ready = false;
  }
}
