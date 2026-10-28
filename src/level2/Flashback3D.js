import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FaceRig } from '../entities/FaceRig.js';
import { Kessler } from '../entities/Kessler.js';
import { EYE } from '../entities/Player.js';
import { precompile } from '../core/precompile.js';
import { settings } from '../core/Settings.js';
import { Person, Walk, Eyes, turnTo, SCALE, seg, yawOf } from '../story/firstPersonRig.js';

// Flashback 2, "The shutdown" (docs/flashback-2-plan.md, docs/flashback-2-script.md), played when
// Voss reads the code card in Dr. Kessler's room, and set in that same room, as it was: first person
// through Voss's eyes, as Flashback 1 is (story/BriefingFlashback; the shared camera and people are
// in story/firstPersonRig), but sharp, cold and quiet. The first time the player sees a face.
//
// It is only their talk. Kessler is at her workbench. She tells him she is shutting ARIA down
// tonight; he argues for the work; she gives her reasons and tells him ARIA asked to be connected
// to the surface; she asks what he is not telling her. He does not answer. She says she will cut
// the power by hand in the engine room, where the others already are, and walks out of her door.
// He watches her go, then looks at her empty desk. Cut to black. Nothing is locked. ARIA says
// nothing: a small light on Kessler's desk pulses faster as the talk goes on, over a low tone.
//
// The room is the level's own (the game's scene, drawn from Voss's eyes, with Kessler in it and the
// player's body and the clue markers hidden), so the memory happens exactly where he stands. Voss is
// never seen, not even his hands: he is a skeleton with no meshes, there for his eyes (the camera
// rides his head bone, so his walk and breathing carry it). Kessler is her own model (kessler.glb),
// her mouth driven by her recordings through FaceRig.
//
// The same contract as before (HabitatSession._kesslerScene): preload(renderer) ahead of time,
// play() resolves when it ends, Enter skips it after the first couple of seconds, render() draws it
// instead of the level's frame while it runs, dispose() frees everything. The timeline is built from
// the recordings' real lengths; a missing recording shows its line as a timed subtitle.
//
// Drawing: the scene into one render target, then a single full-screen pass (the cold teal grade,
// film grain, a vignette, a thin bar across the top, Voss's blinks, the fades). Nothing is allocated per frame.

const AUDIO = './assets/audio/';
const LINES = [
  { id: 'k1', clip: 'flashback2/fb2-kessler-1', who: 'kessler', text: "It's signed. I'm shutting her down tonight.", len: 3.24 },
  { id: 'v1', clip: 'voss/fb2-voss-1', who: 'voss', text: 'No Elena! Can\'t you see that this is groundbreaking! We can change the WORLD!', len: 6.03 },
  { id: 'k2', clip: 'flashback2/fb2-kessler-2', who: 'kessler', text: 'She knows more than all of us together, and she knows what she is. We can\'t control her. And we scanned our own crew without asking.', len: 9.72 },
  { id: 'v2', clip: 'voss/fb2-voss-2', who: 'voss', text: "She's a person too. You can't just switch a person off. I trust her.", len: 5.07 },
  { id: 'k3', clip: 'flashback2/fb2-kessler-3', who: 'kessler', text: 'She asked me to connect her to the surface. Twice. Is that trust?', len: 5.25 },
  { id: 'k4', clip: 'flashback2/fb2-kessler-4', who: 'kessler', text: "This isn't about the science. What aren't you telling me?", len: 3.79 },
  { id: 'dots', who: 'voss', text: '…', len: 2.6, silent: true },
  { id: 'k5', clip: 'flashback2/fb2-kessler-5', who: 'kessler', text: "Then I'll cut her power by hand. The others are already in the engine room.", len: 4.68 }
];
const NAMES = { kessler: 'KESSLER', voss: 'VOSS' };
const SKIP_AFTER = 2.0;
const CYAN = 0x4fe3ff;

const LOOK = {
  uniforms: { tScene: { value: null }, uTime: { value: 0 }, uBlack: { value: 1 }, uBlink: { value: 0 }, uAspect: { value: 1 }, uBars: { value: 0.06 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tScene; uniform float uTime, uBlack, uBlink, uAspect, uBars;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tScene, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, vec3(l), 0.35) * vec3(0.72, 0.88, 0.95);              // cold, a little washed out
      c += (hash(vUv * 900.0 + fract(uTime)) - 0.5) * 0.04;             // film grain
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(q);
      c *= mix(1.0, smoothstep(1.05, 0.3, r), 0.5);                     // vignette
      c *= 1.0 - uBlink * smoothstep(0.15 - 0.15 * uBlink, 0.75, r * (1.0 + uBlink)); // a blink: the edges go dark
      c *= 1.0 - uBlack;                                                 // in from black, out to black
      c *= step(vUv.y, 1.0 - uBars);                                   // a bar across the top (none under the subtitles)
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};

export class Flashback3D {
  // root: the UI layer (for the subtitles and the skip hint); player: Level 2's Voss (his skeleton
  // and clips); session: the HabitatSession (its scene is the room; its doors open for her)
  constructor(root, player, session) {
    this.root = root;
    this.player = player;
    this.session = session;
    this.running = false;
    this.ready = false;
    this.t = 0;
    this.stats = { frames: 0, seconds: 0, worst: 0 };
    this._onKey = (e) => {
      if (this.running && e.code === 'Enter' && this.t > SKIP_AFTER) this.t = this.T.end;
    };
    this._v = new THREE.Vector3();
    this._size = new THREE.Vector2();
    this.T = this._timeline(Object.fromEntries(LINES.map((l) => [l.id, l.len])));
  }

  // ------------------------------------------------------------------ loading
  // Load Kessler, place everyone in her room, decode the recordings and compile her shaders for the
  // room's lights (call ahead of time; with no renderer they compile when first drawn). Safe to call
  // more than once.
  preload(renderer = null) {
    this._loading ||= this._load(renderer).then(() => { this.ready = true; }).catch((e) => {
      console.warn('Flashback3D: could not set up, the 2D flashback will play instead.', e);
    });
    return this._loading;
  }

  async _load(renderer) {
    if (!this.player?.ready) throw new Error('Voss is not loaded');
    if (!this.session?.game?.scene) throw new Error('No room to play in');
    const [kessler] = await Promise.all([new Kessler().load(), this._loadAudio().catch((e) => console.warn('Flashback3D: no sound.', e))]);
    // (the level brings its rooms in a while after it starts, behind the lift's doors: without
    // them she would stand in empty space, and their shaders would compile mid-scene)
    await this.session.worldReady;
    this.kessler = kessler;
    this.T = this._timeline(this.lengths);
    this._build();
    if (renderer) {
      const scene = this.session.game.scene;
      scene.add(this.cast);
      this._animate(0, 0);
      this.target.setSize(64, 36);
      try {
        await precompile(renderer, scene, this.camera, this.target, { root: this.cast });
      } finally {
        this.cast.removeFromParent();
      }
      renderer.compile(this.postScene, this.postCam);
    }
  }

  async _loadAudio() {
    this.lengths = Object.fromEntries(LINES.map((l) => [l.id, l.len]));
    this.buffers = new Map();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ac = new AC();
    await Promise.all(LINES.filter((l) => l.clip).map(async (l) => {
      try {
        const r = await fetch(AUDIO + l.clip + '.mp3');
        if (!r.ok) return;
        const buffer = await this.ac.decodeAudioData(await r.arrayBuffer());
        this.buffers.set(l.id, buffer);
        this.lengths[l.id] = buffer.duration;
      } catch (e) {
        console.warn('Flashback3D: could not load', l.clip, e);
      }
    }));
  }

  // When everything happens (s), from the lines' lengths: each line, the beats around them
  _timeline(len) {
    const T = { line: {} };
    let at = 3.0;
    const gaps = { k1: 0.35, v1: 0.4, k2: 0.45, v2: 0.6, k3: 0.9, k4: 0.3, dots: 0.9, k5: 0 };
    for (const l of LINES) {
      T.line[l.id] = [at, at + len[l.id]];
      at += len[l.id] + gaps[l.id];
    }
    const L = T.line;
    T.turn = 1.0;                       // she turns from her desk to him
    T.step1 = L.k1[1] - 0.5;            // he steps closer (as he starts to argue)
    T.step2 = L.v2[0] + 1.0;            // and a little closer still, pleading
    T.away = L.k3[0] + 1.4;             // "...the surface": he looks away from her, at ARIA's light
    T.back = L.k3[1] + 0.35;
    T.leave = L.k5[0] + 2.2;            // she walks out past him
    T.out = T.leave + 3.6;              // through her door
    T.desk = T.out + 0.4;               // he looks at her empty desk
    T.end = T.desk + 2.8;
    return T;
  }

  // ------------------------------------------------------------------ the room, and who is in it
  // Everything of the scene's own is in `cast`, which sits on her floor: positions in it are in
  // world x and z, and height above that floor.
  _build() {
    const s = this.session, scene = s.game.scene;
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 60);
    this._mats = [];
    this._geos = [];
    this.cast = new THREE.Group();
    this.cast.name = 'Flashback2Cast';

    // her room: the workbench (her monitor on it) and her door, and the floor between them
    const desk = s.story?.targets?.kesslerLog?.clone() || new THREE.Vector3(17.8, 6.9, -14.7);
    const doorNode = s.atrium?.getObjectByName('DOOR_KESSLER') || scene.getObjectByName('DOOR_KESSLER');
    const door = doorNode ? new THREE.Box3().setFromObject(doorNode).getCenter(new THREE.Vector3()) : new THREE.Vector3(12.1, 6.6, -12.1);
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 6);
    const mid = desk.clone().lerp(door, 0.5);
    ray.ray.origin.set(mid.x, desk.y + 1.5, mid.z);
    const hit = ray.intersectObject(s.atrium || scene, true).find((h) => h.point.y < desk.y - 0.3);
    const floor = hit ? hit.point.y : desk.y - 1.05;
    this.cast.position.set(0, floor, 0);
    // a frame on the floor plan: u from the desk toward the door, p across the room
    const u = new THREE.Vector2(door.x - desk.x, door.z - desk.z).normalize();
    const p = new THREE.Vector2(-u.y, u.x);
    const at = (along, across, from = desk) => [from.x + u.x * along + p.x * across, from.z + u.y * along + p.y * across];
    this.place = {
      kessler: at(0.8, 0.45),
      voss: [at(-1.25, 0.6, door), at(2.7, 0.85), at(2.05, 0.8)],     // (mid-shots: about 1.2 m from her at the closest)
      out: [at(0.8, 0.45), at(1.9, -0.15), at(-0.8, -0.05, door), at(0, 0, door), at(1.6, 0, door)],
      door: [door.x, door.z],
      deskYaw: yawOf(-u.x, -u.y)
    };
    this.deskAt = new THREE.Vector3(desk.x, desk.y - floor, desk.z);
    this.doorAt = new THREE.Vector3(door.x, 1.5, door.z);
    this.doorName = doorNode ? 'DOOR_KESSLER' : null;

    // ARIA: a small light on Kessler's desk (glowing, not lighting: a new light would recompile the
    // level's every shader)
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.015, 20), new THREE.MeshBasicMaterial({ color: CYAN }));
    this._geos.push(lens.geometry);
    this._mats.push(lens.material);
    lens.position.set(desk.x + p.x * 0.38 + u.x * 0.15, desk.y - floor - 0.27, desk.z + p.y * 0.38 + u.y * 0.15);
    this.ariaLens = lens;
    this.ariaAt = lens.position;
    this.cast.add(lens);

    // Kessler as she is (her face shown)
    this.kes = new Person('kessler', this.kessler.model, this.kessler.clips);
    this.cast.add(this.kes.group);
    this.kFace = new FaceRig(this.kessler.model, 'composed');
    // Voss: a copy of the player's skeleton, nothing of it drawn, for his eyes and his walk (his
    // meshes go, so none of his materials, which the player's body shares, is compiled here)
    const model = cloneSkinned(this.player.bodyRoot);
    model.position.set(0, 0, 0);
    model.scale.setScalar(SCALE);
    model.rotation.set(0, Math.PI, 0);
    const meshes = [];
    model.traverse((o) => { if (o.isMesh) meshes.push(o); });
    for (const m of meshes) m.removeFromParent();
    this.voss = new Person('voss', model, this.player.clips);
    this.cast.add(this.voss.group);
    this.cast.updateMatrixWorld(true);
    this.eyeLocal = this.voss.b.head.worldToLocal(model.localToWorld(EYE.clone()));
    this.eyes = new Eyes(this.camera, this.voss, this.eyeLocal);
    this._script();

    this.target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
    this.post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ ...LOOK, uniforms: THREE.UniformsUtils.clone(LOOK.uniforms), depthTest: false, depthWrite: false }));
    this.post.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.post);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  // ------------------------------------------------------------------ the script
  _script() {
    const T = this.T, L = T.line, k = this.kes, P = this.place;
    // his two steps toward her; her walk out past him, through her door
    this.vossWalks = [
      new Walk([P.voss[0], P.voss[1]], T.step1, T.step1 + 2.0, 0.8),
      new Walk([P.voss[1], P.voss[2]], T.step2, T.step2 + 1.1, 0.5)
    ];
    this.kesWalk = new Walk(P.out, T.leave, T.leave + 4.4, 0.8);
    // what Voss looks at: [from, what], in the cast's space. Her face most of all; ARIA's light as
    // he argues; away from her, at that light, at the line about the surface; the floor and the
    // light in the silence; her going; then her empty desk
    const face = (out) => this._local(k.at('head', out, 0.09));
    const light = (out) => out.copy(this.ariaAt);
    const agitated = (out) => {
      face(out);
      const t = this.t;
      return out.set(out.x + 0.04 * Math.sin(t * 7.3), out.y + 0.03 * Math.sin(t * 9.1 + 1), out.z);
    };
    const down = (out) => out.set((P.kessler[0] + this.voss.pos.x) / 2, 0.1, (P.kessler[1] + this.voss.pos.z) / 2);
    this.attention = [
      [0, face], [L.v1[0], agitated], [L.v1[0] + 2.6, light], [L.v1[0] + 3.7, agitated], [L.v1[1], face],
      [L.k2[0] + 4.6, light], [L.k2[0] + 5.6, face],
      [T.away, light], [T.back, face],
      [L.dots[0] + 0.4, down], [L.dots[0] + 1.5, light], [L.dots[1] - 0.3, face],
      [T.out - 0.6, (out) => out.copy(this.doorAt)], [T.desk, (out) => out.copy(this.deskAt)]
    ];
    // her face for each stretch: the preset, and a passing expression on top
    this.acting = [
      [0, 'composed', { frown: 0.1, brow: -0.1 }],
      [L.k1[0], 'composed', { frown: 0.2, brow: -0.2, tired: 0.25 }],             // flat and final
      [L.v1[0] + 0.6, 'composed', { frown: 0.3, brow: 0.25, worry: 0.2 }],       // he shouts; it hurts her
      [L.k2[0], 'calm', { frown: 0.25, brow: -0.3 }],                            // firm
      [L.v2[0] + 0.5, 'calm', { frown: 0.1, brow: 0.2, worry: 0.3 }],            // she hears him out
      [L.k3[0], 'calm', { frown: 0.15, brow: 0.15, worry: 0.2, tired: 0.3 }],    // quiet: the thing she held back
      [L.k4[0], 'calm', { frown: 0, brow: 0.35, worry: 0.4, smile: 0.05 }],      // gentle: she wants to know
      [L.dots[0], 'composed', { frown: 0.15, brow: 0.2, worry: 0.35, tired: 0.3 }],
      [L.k5[0], 'resigned', { frown: 0.25, brow: 0.05, tired: 0.45 }]            // resigned
    ];
    // Voss's blinks, every few seconds
    this.blinks = [];
    for (let t = 1.8, i = 0; t < T.end - 1; i++) {
      this.blinks.push([t, 0.16 + (i % 3) * 0.02]);
      t += 2.6 + ((i * 7919) % 23) / 10;
    }
  }

  // a world point into the cast's space (the cast sits on her floor)
  _local(v) {
    v.y -= this.cast.position.y;
    return v;
  }

  // ------------------------------------------------------------------ playing
  play() {
    this.running = true;
    this.t = 0;
    this._last = performance.now();
    this.session.game.scene.add(this.cast);
    this._hideTheNow(true);
    this._mountOverlay();
    window.addEventListener('keydown', this._onKey);
    this._startSound();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  // What belongs to now, not to the memory: the player's own body and arms, the clue markers
  _hideTheNow(hide) {
    const s = this.session;
    if (hide) {
      const c = s.controls?.character;
      this._hidden = [c?.body, c?.viewModel, s.controls?.body, ...(s._markers || []).map((m) => m.m)]
        .filter((o) => o && o.visible);
      for (const o of this._hidden) o.visible = false;
    } else {
      for (const o of this._hidden || []) o.visible = true;
      this._hidden = null;
    }
  }

  _mountOverlay() {
    if (this.overlay || !this.root) return;
    const o = (this.overlay = document.createElement('div'));
    o.className = 'fb3d-hint on';
    Object.assign(o.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: 31 });
    o.innerHTML = `<div class="fb2-sub" style="position:absolute;left:50%;bottom:2.5vh;transform:translateX(-50%);max-width:min(46rem,86vw);text-align:center;color:#eaf7ff;font-size:clamp(1rem,1.6vw,1.35rem);line-height:1.45;text-shadow:0 0 6px #000,0 2px 10px rgba(0,0,0,.8);opacity:0;transition:opacity .25s"><span class="fb2-who" style="display:block;font-size:.7em;letter-spacing:.25em;margin-bottom:.2em"></span><span class="fb2-text"></span></div>
      <div class="fb-hint" style="opacity:0">Enter: skip</div>`;
    this.sub = o.querySelector('.fb2-sub');
    this.subWho = o.querySelector('.fb2-who');
    this.subText = o.querySelector('.fb2-text');
    this.hint = o.querySelector('.fb-hint');
    this.root.appendChild(o);
  }

  // per frame, instead of the level's own frame (HabitatSession's render)
  render(renderer) {
    const now = performance.now();
    const raw = (now - this._last) / 1000;
    const dt = Math.min(0.1, raw);
    this._last = now;
    if (this.t > 0.5) {
      this.stats.frames++;
      this.stats.seconds += raw;
      this.stats.worst = Math.max(this.stats.worst, raw);
    }
    this.t += dt;
    const t = this.t;
    if (t >= this.T.end) return this._end();
    this.hint.style.opacity = t > SKIP_AFTER && t < this.T.end - 1 ? 0.55 : 0;
    this._animate(t, dt);
    this._subtitles(t);
    this._draw(renderer, t);
  }

  _draw(renderer, t) {
    renderer.getDrawingBufferSize(this._size);
    if (this.target.width !== this._size.x || this.target.height !== this._size.y) {
      this.target.setSize(this._size.x, this._size.y);
      this.camera.aspect = this._size.x / this._size.y;
      this.camera.updateProjectionMatrix();
    }
    renderer.setRenderTarget(this.target);
    renderer.render(this.session.game.scene, this.camera);
    renderer.setRenderTarget(null);
    const u = this.post.material.uniforms;
    u.tScene.value = this.target.texture;
    u.uTime.value = t;
    u.uAspect.value = this.camera.aspect;
    u.uBlack.value = Math.max(1 - seg(t, 0.1, 1.2), seg(t, this.T.end - 0.8, this.T.end - 0.1));
    u.uBlink.value = this._blink(t);
    renderer.render(this.postScene, this.postCam);
  }

  _blink(t) {
    let b = 0;
    for (const [at, len] of this.blinks) if (t >= at && t <= at + len) b = Math.sin(((t - at) / len) * Math.PI);
    return b;
  }

  _subtitles(t) {
    const L = this.T.line;
    const line = LINES.find((l) => t >= L[l.id][0] && t <= L[l.id][1] + 0.3);
    if (line) {
      if (this.subText.textContent !== line.text) {
        this.subText.textContent = line.text;
        this.subWho.textContent = NAMES[line.who];
        this.subWho.style.color = line.who === 'kessler' ? '#ffb48a' : '#ff8a8a';
      }
      this.sub.style.opacity = 1;
    } else {
      this.sub.style.opacity = 0;
    }
  }

  _end() {
    this.running = false;
    window.removeEventListener('keydown', this._onKey);
    this._stopSound();
    this.kFace?.stopSpeaking();
    this.cast?.removeFromParent();
    this._hideTheNow(false);
    this.session.flashbackDoors = null;
    this.overlay?.remove();
    this.overlay = null;
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.();
  }

  // ------------------------------------------------------------------ the action
  _animate(t, dt) {
    const T = this.T, L = T.line, k = this.kes, v = this.voss, P = this.place;
    const step = Math.min(dt, 0.05);
    const F = this.cast.position.y;

    // Voss: his two steps toward her (he faces where he walks, then her); after she has gone, her desk
    v.speed = 0;
    const walk = t >= this.vossWalks[1].t0 ? this.vossWalks[1] : this.vossWalks[0];
    const u = walk.u(t);
    walk.curve.getPointAt(u, v.pos);
    if (t > walk.t0 && t < walk.t1) v.speed = (Math.abs(walk.u(t + 0.05) - u) * walk.length) / 0.05;
    const toHer = yawOf(k.pos.x - v.pos.x, k.pos.z - v.pos.z);
    if (t === 0) v.yaw = toHer;
    const wantV = t < T.leave ? toHer
      : t < T.out ? yawOf(P.door[0] - v.pos.x, P.door[1] - v.pos.z)
        : yawOf(this.deskAt.x - v.pos.x, this.deskAt.z - v.pos.z);
    turnTo(v, wantV, step, 3.5);

    // Kessler: at her desk, turning to him; then out of her door
    const kw = this.kesWalk;
    kw.curve.getPointAt(kw.u(t), k.pos);
    k.speed = t > kw.t0 && t < kw.t1 ? (Math.abs(kw.u(t + 0.05) - kw.u(t)) * kw.length) / 0.05 : 0;
    let want = P.deskYaw;
    if (t > T.turn) want = yawOf(v.pos.x - k.pos.x, v.pos.z - k.pos.z);
    if (t > kw.t0) {
      const tg = kw.curve.getTangentAt(Math.min(0.999, kw.u(t) + 0.03));
      want = yawOf(tg.x, tg.z);
    }
    if (t === 0) k.yaw = P.deskYaw;
    turnTo(k, want, step, 3.2);
    // what she looks at (in the world): her desk at first; him; down in the silence; the way out
    k.look ||= new THREE.Vector3();
    if (t < 0.9) k.look.copy(this.deskAt).setY(this.deskAt.y + F);
    else if (t > L.dots[0] + 0.3 && t < L.dots[1] - 0.2) k.look.set(v.pos.x, 0.2 + F, v.pos.z);
    else if (t > kw.t0 && t < T.out - 1.2) kw.curve.getPointAt(Math.min(1, kw.u(t) + 0.3), k.look).setY(1.5 + F);
    else k.look.copy(this.camera.position);

    // her face: the expression for the moment, and her mouth on her voice
    let mood = this.acting[0];
    for (const a of this.acting) if (t >= a[0]) mood = a;
    if (this._mood !== mood) {
      this._mood = mood;
      this.kFace.setPreset(mood[1]);
      // (her mouth opens less than the presets': at the full range her tongue shows on the open vowels)
      this.kFace.preset = { ...this.kFace.preset, jaw: this.kFace.preset.jaw * 0.6 };
    }
    this.kFace.pose(mood[2], 0.5);
    if (t > L.dots[0] + 1.6 && !this._nod) { this._nod = true; this.kFace.gesture('nod', 0.35); }
    this._mouth(t);

    k.update(step);
    v.update(step);
    this.kFace.update(step);
    k.aimHead(this.kFace.head.yaw * 0.6, -this.kFace.head.pitch * 0.6);

    // her door opens for her and shuts behind her (HabitatSession moves it)
    if (this.doorName) this.session.flashbackDoors = { [this.doorName]: t > T.leave + 1.4 && t < T.out + 0.4 };

    // ARIA: her light pulses faster as the talk goes on; the tone rises with it
    const rate = 0.6 + 2.4 * seg(t, 2, L.dots[1]);
    this._phase = (this._phase || 0) + rate * step * Math.PI * 2;
    const pulse = 0.5 + 0.5 * Math.sin(this._phase);
    this.ariaLens.material.color.setHex(CYAN).multiplyScalar(0.35 + 1.1 * pulse);
    this._tone(t, pulse);

    // Voss's eyes, after the bodies have moved (the target into the world: the camera is drawn
    // with the room)
    let get = this.attention[0][1];
    for (const [at, fn] of this.attention) if (t >= at) get = fn;
    const target = get(this._v);
    target.y += F;
    this.eyes.update(t, step, target);
  }

  // Her mouth follows her voice (the recording, through an analyser); without a recording it
  // talks along on its own while her subtitle is up. Shut while he speaks.
  _mouth(t) {
    const L = this.T.line;
    const line = LINES.find((l) => l.who === 'kessler' && t >= L[l.id][0] && t <= L[l.id][1]);
    const id = line?.id || null;
    if (id === this._speaking) return;
    this._speaking = id;
    if (!id) this.kFace.stopSpeaking();
    else if (this.analysers?.has(id)) this.kFace.attachAnalyser(this.analysers.get(id));
    else this.kFace.startBabble(0.9);
  }

  // ------------------------------------------------------------------ sound
  _startSound() {
    const ac = this.ac;
    if (!ac) return;
    ac.resume?.().catch(() => {});
    const at = ac.currentTime + 0.05;
    this._sources = [];
    this.analysers = new Map();
    const voice = (this._voice = ac.createGain());
    voice.gain.value = settings.get('voice');
    voice.connect(ac.destination);
    for (const l of LINES) {
      const buffer = this.buffers.get(l.id);
      if (!buffer) continue;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      if (l.who === 'kessler') {
        // through an analyser, for her mouth
        const an = ac.createAnalyser();
        an.fftSize = 1024;
        an.smoothingTimeConstant = 0.3;
        src.connect(an).connect(voice);
        this.analysers.set(l.id, an);
      } else {
        src.connect(voice);
      }
      src.start(at + this.T.line[l.id][0]);
      this._sources.push(src);
    }
    // ARIA's tone: low, two notes a fifth apart, soft
    const fx = (this._fx = ac.createGain());
    fx.gain.value = settings.get('effects');
    fx.connect(ac.destination);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;
    this._toneGain = ac.createGain();
    this._toneGain.gain.value = 0;
    lp.connect(this._toneGain).connect(fx);
    for (const [f, type, g] of [[49, 'sine', 0.8], [73.5, 'sine', 0.5], [98.4, 'triangle', 0.25]]) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = g;
      o.connect(og).connect(lp);
      o.start(at);
      this._sources.push(o);
    }
  }

  // the tone's loudness: rising through the talk to the silence after her question, easing as she
  // goes, gone with the black
  _tone(t, pulse) {
    if (!this._toneGain) return;
    const T = this.T, L = T.line;
    const level = 0.03 + 0.18 * seg(t, 2, L.dots[1]) - 0.1 * seg(t, L.k5[0], T.out) - 0.11 * seg(t, T.end - 1.2, T.end);
    this._toneGain.gain.setTargetAtTime(Math.max(0, level * (0.75 + 0.25 * pulse)), this.ac.currentTime, 0.05);
  }

  _stopSound() {
    const ac = this.ac;
    if (!ac || !this._sources) return;
    const now = ac.currentTime;
    this._voice?.gain.setTargetAtTime(0, now, 0.05);
    this._toneGain?.gain.setTargetAtTime(0, now, 0.05);
    for (const s of this._sources) {
      try { s.stop(now + 0.3); } catch { /* (already stopped) */ }
    }
    this._sources = [];
  }

  dispose() {
    if (this.running) this._end();
    window.removeEventListener('keydown', this._onKey);
    this._stopSound();
    this.overlay?.remove();
    this.overlay = null;
    if (this.cast) {
      this.cast.removeFromParent();
      this.cast.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
      for (const p of [this.kes, this.voss]) {
        p.mixer.stopAllAction();
        p.mixer.uncacheRoot(p.model);
      }
      for (const g of this._geos) g.dispose();
      for (const m of this._mats) m.dispose();
      // her model's buffers and textures too (the file itself stays cached: three uploads them again
      // if she is ever drawn again)
      this.kessler.model.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.dispose();
        for (const k of ['map', 'alphaMap', 'normalMap', 'emissiveMap', 'gradientMap']) o.material[k]?.dispose();
      });
      this.kessler.dispose();
      this.target.dispose();
      this.post.geometry.dispose();
      this.post.material.dispose();
      this.cast = null;
    }
    this.ac?.close?.().catch(() => {});
    this.ac = null;
    this.buffers = null;
    this.analysers = null;
    this.ready = false;
    this._loading = null;
  }
}
