import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FaceRig } from '../entities/FaceRig.js';
import { FaceCreases } from '../entities/FaceCreases.js';
import { CrewMember } from '../entities/CrewMember.js';
import { EYE, showWound } from '../entities/Player.js';
import { precompile } from '../core/precompile.js';
import { settings } from '../core/Settings.js';
import { Person, Walk, Eyes, turnTo, SCALE, clamp, seg, ease, yawOf, v3 } from '../story/firstPersonRig.js';
import { pose, grip } from '../story/gestures.js';
import { buildLockPanel, Sparks, crackle, PANEL_SIZE } from './LockPanel.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { EyeShader } from '../intro/intro-cinematic.js';
import { heartbeat } from '../story/BriefingFlashback.js';
import { voiceBus, dbGain } from './endingAudio.js';

// Flashback 3, "The lock" (docs/flashback-3-script.md, revision 2): played the first time Voss looks
// through the engine room door's window in Level 3 (headache() is the way in, on the level's own
// frame). First person through his eyes, in the engine room as it was, dry and lit: Kessler
// confesses the scans to the crew in a few words and tells them ARIA goes off tonight; Park cuts the
// main feed, the hum dies, four seconds of silence, and ARIA's light on the corner console stays on.
// One by one they turn and stare at Voss. He tells them he moved her to the emergency supply;
// Kessler turns on him, he flares up ("one last chance"), Lindqvist and Navarro round on him, Park
// hides his face. "Guess that settles it." They rush him; he steps out, swings the door shut and
// tears the lock out of its panel (his hands, sparks); then his hands shake and his breath goes
// ragged, until he steadies. "Stay here until I finish my research." He walks away; as the door
// seals, Park asks why the floor is wet. Voss stops, does not turn, and walks on. Cut to black.
//
// The four crew are their own models (CrewMember: kessler, lindqvist, navarro, park), their mouths
// driven by their recordings through FaceRig, creases in their brows (FaceCreases) and their hands
// and bodies acting (story/gestures). Voss is a copy of the player's body without its head (the
// camera is there), so his arms and hands are his own, posed by ArmIK (firstPersonRig). ARIA says
// nothing: she is the light on the console.
//
// Its own small scene (like Flashback 1's room), laid out as l3-drowned.glb's engine room and the
// end of its corridor (Blender/scripts/build_l3_drowned.py, in the game's axes: the door at
// z -24.0..-24.3, the room behind it to z -34, the corridor toward +z), so the memory is the room
// the player has just looked into through the window. Built of boxes and cylinders, merged by
// material; Lambert shading, no shadows, five point lights (all there before the compile).
//
// The same contract as Flashback 2 (level2/Flashback3D): preload(renderer) ahead of time, play()
// resolves when it ends, Enter skips it after the first couple of seconds, render() draws it
// instead of the level, dispose() frees everything. The timeline is built from the recordings'
// real lengths; a missing recording shows its line as a timed subtitle (its length estimated from
// the words), and plays as soon as the file is there.
//
// On a slow machine (judged in its first seconds, or before it starts: play({ still: true })) it
// falls back to stills: the scene is drawn again only when a new line or beat begins, the voices,
// sound and subtitles go on as before.

const AUDIO = './assets/audio/';
const SFX = './assets/audio/sfx/l3/';       // Level 3's own effects (CC0, see CREDITS.md)
const LINES = [
  { id: 'k1', who: 'kessler', clip: 'flashback3/fb3-kessler-1', text: "The B-lab scans weren't calibration. We copied your minds. Nobody asked you. I signed it." },
  { id: 'l1', who: 'lindqvist', clip: 'flashback3/fb3-lindqvist-1', text: 'You signed it?' },
  { id: 'p1', who: 'park', clip: 'flashback3/fb3-park-1', text: 'The headaches. The ones we all had after B-lab. That was…?' },
  { id: 'k2', who: 'kessler', clip: 'flashback3/fb3-kessler-2', text: 'Yes.' },
  { id: 'k3', who: 'kessler', clip: 'flashback3/fb3-kessler-3', text: "And ARIA's awake. Whatever she wants, it isn't what we want. She goes off tonight." },
  { id: 'l2', who: 'lindqvist', clip: 'flashback3/fb3-lindqvist-2', text: 'Then we do it now. Park.' },
  { id: 'p2', who: 'park', clip: 'flashback3/fb3-park-2', text: 'Cutting it—' },
  { id: 'p3', who: 'park', clip: 'flashback3/fb3-park-3', text: "…She's still on." },
  { id: 'k4', who: 'kessler', clip: 'flashback3/fb3-kessler-4', text: 'Voss.' },
  { id: 'l3', who: 'lindqvist', clip: 'flashback3/fb3-lindqvist-3', text: 'What did you do?' },
  { id: 'v1', who: 'voss', clip: 'voss/fb3-voss-1', text: 'Moved her to the emergency supply. Two days ago.' },
  { id: 'k5', who: 'kessler', clip: 'flashback3/fb3-kessler-5', text: 'Why are you doing things behind my back, Voss?!' },
  { id: 'v2', who: 'voss', clip: 'voss/fb3-voss-2', text: 'Look, I want to give you guys one last chance. Just a few more days of research, okay?' },
  { id: 'l4', who: 'lindqvist', clip: 'flashback3/fb3-lindqvist-4', text: "Voss, you're senile." },
  { id: 'n1', who: 'navarro', clip: 'flashback3/fb3-navarro-1', text: 'Voss, who do you think you are?!' },
  { id: 'v3', who: 'voss', clip: 'voss/fb3-voss-3', text: 'Guess that settles it.' },
  // (through the glass, once the door is shut: muffled)
  { id: 'k6', who: 'kessler', clip: 'flashback3/fb3-kessler-6', text: 'VOSS! Open it!', glass: true },
  { id: 'p4', who: 'park', clip: 'flashback3/fb3-park-4', text: "Please, we're your friends—", glass: true },
  { id: 'n2', who: 'navarro', clip: 'flashback3/fb3-navarro-2', text: 'Oh no.', glass: true },
  { id: 'v4', who: 'voss', clip: 'voss/fb3-voss-4', text: 'Stay here until I finish my research.' },
  { id: 'p5', who: 'park', clip: 'flashback3/fb3-park-5', text: 'Elena… why is the floor wet?', glass: true, far: true }
];
// Until a recording is there (or if it cannot be decoded): its length from its words, at about
// 2.4 words a second, and a breath
const WORDS_PER_SECOND = 2.4;
// Each line's gain (dB), so all the voices come out about alike whoever recorded them and however:
// taken as raw files they run from -29 LUFS (v3) to -15 (n1). Each is set by measuring it as it is
// played here (scripts/confrontation/loudness.html, __chain: its muffling, this gain, the dialogue
// bus) to -16 LUFS; the quietest deliveries a little under (k2, p3 -18; v3, n2, p5 -17.5; v1, v4, k6,
// p4 -16.5) and the two real shouts a little over (k5, n1 -15.5).
const VOICE_GAIN_DB = {
  k1: 0, l1: -1.9, p1: -4.5, k2: 1.2, k3: 1.8, l2: 0.6, p2: -3.1, p3: -3.5, k4: 2.9, l3: -3.9, v1: 0, k5: -1.4, v2: 0, l4: 1.4,
  n1: -8.2, v3: 2.3, k6: -5.6, p4: -5.4, n2: -6, v4: 3.4, p5: -5.4
};
export const FALLBACK_LENGTHS = Object.fromEntries(LINES.map((l) => [l.id, +(l.text.split(/\s+/).length / WORDS_PER_SECOND + 0.3).toFixed(2)]));

const CREW = ['kessler', 'lindqvist', 'navarro', 'park'];
const NAMES = { kessler: 'KESSLER', lindqvist: 'LINDQVIST', navarro: 'NAVARRO', park: 'PARK', voss: 'VOSS' };
const COLOURS = { kessler: '#ffb48a', lindqvist: '#c9d8ff', navarro: '#e8d39a', park: '#a8e8b8', voss: '#ff8a8a' };
const EFFECTS = ['machine-hum', 'clank-1', 'clank-2', 'metal-bang-1', 'metal-bang-2', 'metal-bang-3', 'slam', 'door-creak-1',
  'latch', 'click', 'air-hiss', 'seal', 'ratchet-1', 'ratchet-2', 'punch', 'water-pour'];
const SKIP_AFTER = 2.0;
const RENDER_SCALE = 0.8;     // drawn at 80% of the screen's resolution (it is a memory: soft anyway)
const CYAN = 0x4fe3ff;

// Where things are (the game's axes; the floor is y 0)
const DOOR_Z = -24.0;                        // the corridor face of the door's wall (PT_Window)
const HINGE = v3(-1.0, 0, -24.02);           // the door swings into the corridor about its west edge
const PANEL_AT = v3(1.34, 1.12, DOOR_Z + PANEL_SIZE.d / 2);
const LUG = v3(1.33, 1.2, -27.45);          // the main feed's coupling: the nut the wrench goes on
const ARIA_AT = v3(2.62, 1.2, -24.86);       // her light, on the corner console
const P = {
  voss: { door: [0, -24.12], in: [0.1, -24.36], out: [[0.1, -24.36], [0, -24.12], [0.05, -23.0], [-0.1, -21.95]], panel: [0.98, -23.42], watch: [0.18, -22.75] },
  // (her near and close spots are off to his right, so the others are seen past her)
  kessler: { start: [1.05, -25.85], near: [0.78, -25.4], close: [0.58, -25.02], glass: [0.24, -24.66] },
  lindqvist: { start: [-0.55, -26.45], fore: [-0.65, -25.85], glass: [-0.36, -24.62] },
  navarro: { start: [-0.05, -27.25], glass: [-0.62, -25.2] },
  park: { start: [0.6, -27.2], feed: [0.98, -27.45], back: [0.5, -26.95], recoil: [0.6, -27.3], glass: [0.72, -25.2] }
};
const CREW_MID = v3(0.0, 1.6, -26.95);
const SCENE_MID = v3(0.45, 1.55, -26.4);       // the crew and Kessler, all in one look

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
      c = mix(c, vec3(l), 0.28) * vec3(1.0, 0.95, 0.86);                // a memory: a little faded, sodium-warm
      c += (hash(vUv * 900.0 + fract(uTime)) - 0.5) * 0.035;            // film grain
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(q);
      c *= mix(1.0, smoothstep(1.05, 0.3, r), 0.5);                     // vignette
      c *= 1.0 - uBlink * smoothstep(0.15 - 0.15 * uBlink, 0.75, r * (1.0 + uBlink)); // a blink
      c *= 1.0 - uBlack;
      c *= step(vUv.y, 1.0 - uBars);                                   // a bar across the top (none under the subtitles)
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};

export class LockFlashback {
  // root: the UI layer (subtitles, the skip hint; null: none); player: Level 3's Voss (a loaded
  // Player: his body and clips)
  constructor(root, player) {
    this.root = root;
    this.player = player;
    this.running = false;
    this.ready = false;
    this.still = false;
    this.t = 0;
    this.stats = { frames: 0, seconds: 0, worst: 0, still: null };
    this._onKey = (e) => {
      if (!this.running || e.code !== 'Enter' || this.t < SKIP_AFTER) return;
      e.preventDefault();
      this._skip = true;
    };
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._size = new THREE.Vector2();
    this.T = this._timeline(FALLBACK_LENGTHS);
  }

  // ------------------------------------------------------------------ loading
  preload(renderer = null) {
    this._loading ||= this._load(renderer).then(() => { this.ready = true; }).catch((e) => {
      console.warn('Flashback 3: could not set up; it will not play.', e);
    });
    return this._loading;
  }

  async _load(renderer) {
    if (!this.player?.bodyRoot || !this.player.clips) throw new Error('Voss is not loaded');
    const [crew] = await Promise.all([
      Promise.all(CREW.map((n) => new CrewMember(n).load())),
      this._loadAudio().catch((e) => console.warn('Flashback 3: no sound.', e))
    ]);
    this.src = Object.fromEntries(CREW.map((n, i) => [n, crew[i]]));
    this.T = this._timeline(this.lengths || FALLBACK_LENGTHS);
    this._build();
    this._script();
    this._animate(0, 0);
    if (renderer) {
      this.target.setSize(64, 36);
      await precompile(renderer, this.scene, this.camera, this.target);
      renderer.compile(this.postScene, this.postCam);
    }
  }

  async _loadAudio() {
    this.lengths = { ...FALLBACK_LENGTHS };
    this.buffers = new Map();
    this.fx = new Map();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ac ||= new AC();           // (headache() may have made it already)
    const get = async (url) => {
      try {
        const r = await fetch(url);
        if (!r.ok) return null;
        return await this.ac.decodeAudioData(await r.arrayBuffer());
      } catch (e) {
        return null;
      }
    };
    await Promise.all([
      ...LINES.map(async (l) => {
        const b = await get(AUDIO + l.clip + '.mp3');
        if (!b) return console.info('Flashback 3: no recording yet for', l.clip, '(its subtitle is shown instead)');
        this.buffers.set(l.id, b);
        this.lengths[l.id] = b.duration;
      }),
      ...EFFECTS.map(async (name) => {
        const b = await get(SFX + name + '.ogg');
        if (b) this.fx.set(name, b);
      })
    ]);
  }

  // When everything happens (s), from the lines' lengths
  _timeline(len) {
    const T = { line: {} };
    let at = 3.2;                                  // (he stands in the doorway; nobody speaks yet)
    const say = (id, gap = 0) => {
      at += gap;
      T.line[id] = [at, at + len[id]];
      at += len[id];
    };
    // the confession, short
    say('k1');
    say('l1', 0.3);
    say('p1', 0.55);
    say('k2', 0.5);
    T.signed = T.line.k1[0] + 0.84 * (T.line.k1[1] - T.line.k1[0]);   // "I signed it" (after the last pause in her take)
    say('k3', 0.9);
    say('l2', 0.45);
    const L = T.line;
    // Park goes to the main feed on "Park." and puts the wrench on its coupling; he heaves; it gives
    T.parkGo = L.l2[1] - 0.3;
    T.parkThere = T.parkGo + 1.1;
    T.wrenchOn = [T.parkThere + 0.05, T.parkThere + 0.65];
    at = Math.max(at + 0.35, T.wrenchOn[1] + 0.15);
    say('p2');
    T.heave = [L.p2[0] + 0.1, L.p2[0] + 1.8];
    T.cut = T.heave[0] + 0.62 * (T.heave[1] - T.heave[0]);   // (stuck, stuck, then it goes)
    T.parkBack = T.cut + 1.5;
    // four seconds of silence; ARIA's light still on
    at = T.cut + 4.0;
    say('p3');
    // one by one they turn to him and stare; nobody speaks. Park takes half a step back.
    T.turn = L.p3[1] + 0.5;
    T.turnOf = { kessler: T.turn, lindqvist: T.turn + 0.45, navarro: T.turn + 0.8, park: T.turn + 1.2 };
    T.recoil = T.turn + 1.5;
    at = T.turn + 2.5;
    say('k4');
    say('l3', 0.7);
    say('v1', 0.8);
    say('k5', 0.45);
    say('v2', 0.55);
    say('l4', 0.4);
    say('n1', 0.25);
    T.hide = L.n1[0] + 0.4;                        // Park's hands over his face
    say('v3', 1.0);
    // they rush him: he backs out, swings the door shut, tears the lock out
    T.rush = at + 0.3;
    T.grab = T.rush + 1.0;                         // his hand on the door's handle
    T.swing = [T.rush + 1.15, T.rush + 1.6];       // he swings it (and lets go)
    T.shut = T.rush + 1.95;                        // it slams
    T.toPanel = T.shut + 0.15;
    T.cover = T.shut + 1.45;                       // both hands on the panel's cover
    T.coverOff = T.shut + 1.95;                    // torn off
    T.module = T.shut + 2.4;                       // his hand in, round the lock's module
    T.rip = T.shut + 3.0;                          // ripped out: the lock is dead
    T.shake = [T.rip + 0.35, T.rip + 3.6];         // his hands shake, his breath goes ragged; then he steadies
    T.watch = T.shake[1] - 0.3;                    // he steps back to the window
    // through the glass, over each other; the pounding stops on "Oh no"
    at = T.shut + 0.45;
    say('k6');
    say('p4', -0.25);
    at = Math.max(at + 0.2, T.rip + 0.8);
    say('n2');
    at = Math.max(at + 0.6, T.watch + 1.3);
    say('v4');
    T.leave = L.v4[1] + 0.6;                       // he turns and walks away
    T.seal = T.leave + 0.7;                        // the door seals behind him
    at = T.leave + 1.7;
    say('p5');
    // on "wet" he stops, does not turn, and walks on
    T.stop = [L.p5[1] - 0.15, L.p5[1] + 1.9];
    T.end = T.stop[1] + 2.4;
    return T;
  }

  // ------------------------------------------------------------------ the scene
  _build() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x07090a);
    scene.fog = new THREE.Fog(0x07090a, 11, 26);
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.04, 40);
    this._mats = [];
    this._geos = [];
    this._textures = [];
    this._room();
    this._cast();

    this.target = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
    this.post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ ...LOOK, uniforms: THREE.UniformsUtils.clone(LOOK.uniforms), depthTest: false, depthWrite: false }));
    this.post.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.post);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  _mat(m) {
    this._mats.push(m);
    return m;
  }

  _canvas(w, h, draw, repeat = false) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    this._textures.push(tex);
    return tex;
  }

  // The engine room and the end of the corridor (see the build script for the same layout)
  _room() {
    const scene = this.scene;
    // grime: one tiling texture, mapped by world position (2 m a tile)
    const grime = this._canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#c8c8c8';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const s = 2 + Math.random() * 18;
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,30,20' : '255,250,240'},${0.015 + Math.random() * 0.035})`;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, s, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 60; i++) {                   // streaks running down
        g.fillStyle = `rgba(50,35,20,${0.03 + Math.random() * 0.04})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 20 + Math.random() * 80);
      }
    }, true);
    const hazard = this._canvas(64, 64, (g, w, h) => {
      g.fillStyle = '#d9a81e';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#1c1b18';
      for (let k = -2; k < 3; k++) {
        g.beginPath();
        g.moveTo(k * 32, 0); g.lineTo(k * 32 + 16, 0); g.lineTo(k * 32 + 16 + 64, h); g.lineTo(k * 32 + 64, h);
        g.fill();
      }
    }, true);
    const lam = (color, map = grime) => this._mat(new THREE.MeshLambertMaterial({ color, map }));
    const M = {
      wall: lam(0x76808a), floor: lam(0x6c665c), grate: lam(0x45484a), dark: lam(0x33383b), engine: lam(0x4f5f53),
      rust: lam(0x7a4630), steel: lam(0x8a9096), pipe: lam(0x616a70), feed: lam(0xb0841e), hazard: lam(0xffffff, hazard),
      console: lam(0x4a5157), cabinet: lam(0x5d6a72)
    };
    const glow = (color) => this._mat(new THREE.MeshBasicMaterial({ color }));
    this.bulbMat = glow(0xffe2b0);
    this.stripMat = glow(0x9fe0c8);
    this.engineLampMat = glow(0x56ff7a);
    this.screenMat = glow(0x3d8f86);

    // every piece goes into its material's pile, and each pile becomes one mesh
    const piles = new Map();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = v3(1, 1, 1);
    const put = (mat, geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
      geo.applyMatrix4(m4.compose(v3(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), one));
      if (!piles.has(mat)) piles.set(mat, []);
      piles.get(mat).push(geo);
    };
    const box = (mat, x0, y0, z0, x1, y1, z1) => put(mat, new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const cylY = (mat, x, y, z, r, len, n = 14) => put(mat, new THREE.CylinderGeometry(r, r, len, n), x, y, z);
    const cylX = (mat, x, y, z, r, len, n = 14) => put(mat, new THREE.CylinderGeometry(r, r, len, n), x, y, z, 0, 0, Math.PI / 2);
    const cylZ = (mat, x, y, z, r, len, n = 14) => put(mat, new THREE.CylinderGeometry(r, r, len, n), x, y, z, Math.PI / 2);
    const pipeZ = (mat, x, y, z0, z1, r) => cylZ(mat, x, y, (z0 + z1) / 2, r, Math.abs(z1 - z0), 12);

    // ---- the corridor (z -24 .. -11), and the way west at its end (to x -4.5)
    box(M.floor, -4.5, -0.1, -24.0, 1.5, 0, -11.0);
    box(M.wall, 1.5, 0, -24.0, 1.7, 3.0, -11.0);
    box(M.wall, -1.7, 0, -21.0, -1.5, 3.0, -11.0);
    box(M.wall, -4.5, 0, -21.0, -1.7, 3.0, -20.8);
    box(M.wall, -4.7, 0, -24.0, -4.5, 3.0, -21.0);
    box(M.wall, -4.7, 3.0, -24.3, 1.7, 3.15, -11.0);
    box(M.dark, -1.7, 0, -11.2, 1.7, 3.0, -11.0);
    for (const z of [-13.5, -16.5, -19.5]) {
      box(M.rust, -1.5, 0, z - 0.1, -1.36, 3.0, z + 0.1);
      box(M.rust, 1.36, 0, z - 0.1, 1.5, 3.0, z + 0.1);
      box(M.rust, -1.5, 2.84, z - 0.1, 1.5, 3.0, z + 0.1);
    }
    pipeZ(M.pipe, 1.27, 2.66, -24.0, -11.0, 0.14);
    pipeZ(M.dark, 1.32, 2.22, -24.0, -11.0, 0.07);
    pipeZ(M.wall, 1.3, 1.62, -24.0, -11.0, 0.1);
    pipeZ(M.pipe, -1.3, 2.62, -21.0, -11.0, 0.11);
    pipeZ(M.dark, -1.33, 2.36, -21.0, -11.0, 0.065);
    pipeZ(M.wall, -1.31, 1.72, -21.0, -11.0, 0.09);
    pipeZ(M.rust, -1.28, 0.78, -21.0, -11.0, 0.12);
    for (let z = -21.8; z < -11; z += 1.5) box(M.dark, 1.1, 1.75, z - 0.03, 1.5, 2.8, z + 0.03);
    box(M.cabinet, 1.05, 0, -22.6, 1.5, 1.9, -21.6);
    box(M.dark, 1.03, 0.3, -22.5, 1.06, 1.7, -21.7);
    box(this.stripMat, 1.46, 0.3, -24.0, 1.48, 0.34, -11.0);
    box(this.stripMat, -1.48, 0.3, -21.0, -1.46, 0.34, -11.0);
    // a caged lamp on each wall
    for (const [x, z, s] of [[1.42, -21.2, -1], [-1.42, -16.5, 1]]) {
      box(M.dark, x - 0.06 * s, 2.32, z - 0.14, x + 0.04 * s, 2.5, z + 0.14);
      box(this.bulbMat, x + 0.07 * s - 0.03, 2.36, z - 0.1, x + 0.07 * s + 0.03, 2.46, z + 0.1);
    }

    // ---- the door's wall (z -24.0 .. -24.3), the doorway x -1..1 up to 2.3
    box(M.wall, -5.2, 0, -24.3, -1.0, 4.6, -24.0);
    box(M.wall, 1.0, 0, -24.3, 5.2, 4.6, -24.0);
    box(M.wall, -1.0, 2.3, -24.3, 1.0, 4.6, -24.0);
    box(M.hazard, -1.18, 0, -24.0, -1.0, 2.48, -23.98);
    box(M.hazard, 1.0, 0, -24.0, 1.18, 2.48, -23.98);
    box(M.hazard, -1.18, 2.3, -24.0, 1.18, 2.48, -23.98);
    cylZ(glow(0x5a1a12), 0, 2.72, -23.93, 0.08, 0.14, 10);        // the beacon, off (nothing is wrong yet)

    // ---- the engine room (x -5..5, z -24.3..-34, 4.6 high)
    box(M.floor, -5.0, -0.2, -34.0, 5.0, 0, -24.3);
    box(M.wall, -5.2, 0, -34.2, -5.0, 4.6, -24.3);
    box(M.wall, 5.0, 0, -34.2, 5.2, 4.6, -24.3);
    box(M.wall, -5.0, 0, -34.2, 5.0, 4.6, -34.0);
    box(M.wall, -5.2, 4.6, -34.2, 5.2, 4.8, -24.3);
    for (const z of [-26.5, -29.5, -32.5]) box(M.rust, -5.0, 4.35, z - 0.12, 5.0, 4.6, z + 0.12);
    box(M.grate, -1.6, 0, -34.0, 1.6, 0.06, -24.3);
    for (const side of [-1, 1]) {
      const ex = side * 2.6;
      box(M.dark, ex - 1.0, 0, -32.2, ex + 1.0, 1.25, -25.6);
      box(M.engine, ex - 0.85, 1.25, -32.0, ex + 0.85, 1.55, -25.8);
      for (let k = 0; k < 6; k++) {
        const cz = -(26.4 + k);
        cylY(M.steel, ex, 1.95, cz, 0.32, 0.8);
        cylY(M.engine, ex, 2.4, cz, 0.37, 0.12);
        cylX(M.dark, ex + side * 0.3, 2.55, cz, 0.06, 0.4, 8);
      }
      pipeZ(M.rust, ex + side * 0.55, 2.75, -32.4, -25.8, 0.16);
      cylY(M.rust, ex + side * 0.55, (2.75 + 4.6) / 2, -32.4, 0.2, 4.6 - 2.75, 12);
      cylZ(M.steel, ex, 1.0, -25.45, 0.75, 0.22, 24);
      cylZ(M.dark, ex, 1.0, -25.32, 0.16, 0.08, 12);
      // its running lights (they go out with the feed)
      box(this.engineLampMat, ex - 0.55, 0.95, -25.62, ex - 0.48, 1.02, -25.58);
      box(this.engineLampMat, ex + 0.48, 0.95, -25.62, ex + 0.55, 1.02, -25.58);
      // the catwalk along the wall above, its rail and the wall's pipes
      const wx = side * 4.5;
      box(M.grate, wx - 0.5, 2.95, -34.0, wx + 0.5, 3.0, -24.3);
      for (let k = 0; k < 7; k++) cylY(M.rust, wx - side * 0.5, 3.47, -(25.0 + 1.5 * k), 0.025, 0.95, 6);
      pipeZ(M.rust, wx - side * 0.5, 3.95, -34.0, -24.3, 0.03);
      pipeZ(M.pipe, side * 4.85, 3.9, -34.0, -24.3, 0.15);
      pipeZ(M.dark, side * 4.88, 1.6, -34.0, -24.3, 0.11);
    }
    // the generator across the far end
    cylX(M.engine, 0, 1.3, -33.0, 0.95, 3.6, 24);
    box(M.dark, -2.0, 0, -33.8, 2.0, 0.45, -32.2);
    for (const x of [-1.9, 1.9]) cylX(M.dark, x, 1.3, -33.0, 1.05, 0.12, 24);
    // two lamps hanging over the aisle
    for (const z of [-27.2, -31.0]) {
      cylY(M.dark, 0, 4.17, z, 0.012, 0.86, 5);
      cylY(M.dark, 0, 3.68, z, 0.24, 0.16, 14);
      put(this.bulbMat, new THREE.SphereGeometry(0.09, 12, 8), 0, 3.58, z);
    }
    // the console in the corner, just inside the door (ARIA's light is on it)
    box(M.console, 1.8, 0, -25.2, 3.2, 1.0, -24.6);
    put(M.console, new THREE.BoxGeometry(1.4, 0.06, 0.34), 2.5, 1.12, -24.92, -0.5);
    put(this.screenMat, new THREE.PlaneGeometry(0.42, 0.2), 2.2, 1.155, -24.88, -Math.PI / 2 - 0.5);
    // the main feed: a fat yellow conduit up the side of the right-hand engine, into the ceiling and
    // along it to the wall, with its coupling at chest height
    box(M.feed, 1.38, 0.55, -27.7, 1.6, 0.95, -27.2);
    cylY(M.feed, 1.47, 1.02, -27.45, 0.09, 0.14, 14);
    cylY(M.feed, 1.47, 2.975, -27.45, 0.09, 3.25, 14);
    pipeZ(M.feed, 1.47, 4.5, -27.45, -24.3, 0.09);
    cylY(M.steel, 1.47, 1.17, -27.45, 0.14, 0.16, 16);           // the coupling's lower collar
    cylX(M.dark, LUG.x + 0.04, LUG.y, LUG.z, 0.05, 0.12, 6);     // its nut
    box(M.hazard, 1.36, 0.95, -27.56, 1.58, 1.0, -27.34);

    for (const [mat, list] of piles) {
      for (const g of list) planarUV(g);
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      this._geos.push(merged);
      scene.add(new THREE.Mesh(merged, mat));
    }

    // the coupling's upper collar: it jumps when the feed is cut
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 16), M.steel);
    this._geos.push(collar.geometry);
    collar.position.set(1.47, 1.3, -27.45);
    scene.add(collar);
    this.collar = collar;

    // the plates: ARIA, PRIMARY on the feed (turned to the door), ENGINE ROOM 2 over the door
    const plate = (w, h, draw, x, y, z, ry) => {
      const tex = this._canvas(Math.round(w * 800), Math.round(h * 800), draw);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this._mat(new THREE.MeshLambertMaterial({ map: tex })));
      this._geos.push(m.geometry);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      scene.add(m);
    };
    plate(0.5, 0.17, (g, w, h) => {
      g.fillStyle = '#d9a81e';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#16140f';
      g.fillRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#e6c25a';
      g.font = `bold ${Math.round(h * 0.42)}px Courier New, monospace`;
      g.textAlign = 'center';
      g.fillText('ARIA · PRIMARY', w / 2, h * 0.55);
      g.font = `bold ${Math.round(h * 0.2)}px Courier New, monospace`;
      g.fillText('MAIN FEED  11 kV', w / 2, h * 0.84);
    }, 1.36, 2.3, -27.3, yawOf(-1.36, 3.2) + Math.PI);
    plate(1.4, 0.35, (g, w, h) => {
      g.fillStyle = '#2b2a26';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d8c79a';
      g.font = `bold ${Math.round(h * 0.45)}px Courier New, monospace`;
      g.textAlign = 'center';
      g.fillText('ENGINE ROOM 2', w / 2, h * 0.65);
    }, 0, 2.62, -23.97, 0);

    // ARIA: a lens on the console, glowing (no light of her own), and a soft halo round it
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.02, 20), this._mat(new THREE.MeshBasicMaterial({ color: CYAN })));
    this._geos.push(lens.geometry);
    lens.position.copy(ARIA_AT);
    lens.rotation.x = -0.5;
    scene.add(lens);
    this.ariaLens = lens;
    const haloTex = this._canvas(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(160,240,255,0.9)');
      r.addColorStop(0.3, 'rgba(79,227,255,0.35)');
      r.addColorStop(1, 'rgba(79,227,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
    });
    this.halo = new THREE.Sprite(this._mat(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    this.halo.scale.setScalar(0.32);
    this.halo.position.copy(ARIA_AT).add(v3(0, 0.03, 0.02));
    scene.add(this.halo);

    // the door: on its hinge at the west edge; open (into the corridor) to start with
    this.door = new THREE.Group();
    this.door.position.copy(HINGE);
    const dm = lam(0x6a737b);
    const dbox = (mat, x0, y0, z0, x1, y1, z1) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      this._geos.push(m.geometry);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      this.door.add(m);
      return m;
    };
    dbox(dm, 0, 0, -0.22, 2.0, 1.0, 0);
    dbox(dm, 0, 1.9, -0.22, 2.0, 2.3, 0);
    dbox(dm, 0, 1.0, -0.22, 0.4, 1.9, 0);
    dbox(dm, 1.6, 1.0, -0.22, 2.0, 1.9, 0);
    for (const [x0, y0, x1, y1] of [[0.32, 0.92, 1.68, 1.0], [0.32, 1.9, 1.68, 1.98], [0.32, 1.0, 0.4, 1.9], [1.6, 1.0, 1.68, 1.9]]) dbox(M.rust, x0, y0, 0, x1, y1, 0.05);
    dbox(M.dark, 1.72, 0.9, 0.0, 1.76, 1.25, 0.06);                // its handle, both sides
    dbox(M.dark, 1.72, 0.9, -0.28, 1.76, 1.25, -0.22);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), this._mat(new THREE.MeshLambertMaterial({ color: 0x9cc4bc, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })));
    this._geos.push(glass.geometry);
    glass.position.set(1.0, 1.45, -0.11);
    glass.renderOrder = 3;
    this.door.add(glass);
    this.handleLocal = v3(1.74, 1.1, -0.28);       // (the room side's: it faces him while the door stands open)
    this.doorLook = v3(1.1, 1.35, -0.11);
    scene.add(this.door);

    // the lock panel beside it (whole), the wrench, the sparks
    this.panel = buildLockPanel({ broken: false });
    this.panel.group.position.copy(PANEL_AT);
    scene.add(this.panel.group);
    this.wrench = new THREE.Group();
    const wm = lam(0x5a5f63), grip = lam(0x7a2a22, null);
    const wbox = (mat, w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      this._geos.push(m.geometry);
      m.position.set(x, y, z);
      this.wrench.add(m);
    };
    wbox(wm, 0.034, 0.5, 0.018, 0, 0.29, 0);
    wbox(grip, 0.044, 0.16, 0.026, 0, 0.46, 0);
    wbox(wm, 0.12, 0.05, 0.024, 0, 0.02, 0);
    wbox(wm, 0.028, 0.08, 0.024, -0.046, -0.03, 0);
    wbox(wm, 0.028, 0.08, 0.024, 0.046, -0.03, 0);
    scene.add(this.wrench);
    this.sparks = new Sparks(70, { size: 0.016 });
    scene.add(this.sparks.points);

    // the lights: the sky and floor of the room, its two hanging lamps, the corridor's lamp, and
    // one for the sparks (dark until they fly)
    this.hemi = new THREE.HemisphereLight(0xb4bec4, 0x4a4136, 1.7);
    scene.add(this.hemi);
    this.lamps = [];
    for (const [x, y, z, i, d] of [[0, 3.45, -27.2, 11, 14], [0, 3.45, -31.0, 7, 12], [0.4, 3.1, -25.3, 6, 8], [0.2, 2.55, -21.6, 5, 10]]) {
      const l = new THREE.PointLight(0xffd9ad, i, d, 1.3);
      l.position.set(x, y, z);
      l.userData.base = i;
      scene.add(l);
      this.lamps.push(l);
    }
    this.sparkLight = new THREE.PointLight(0xffc070, 0, 4, 1.6);
    scene.add(this.sparkLight);
  }

  // ------------------------------------------------------------------ the people
  _cast() {
    this.people = {};
    this.faces = {};
    this.creases = [];
    for (const n of CREW) {
      const src = this.src[n];
      const p = new Person(n, src.model, src.clips);
      this.people[n] = p;
      this.scene.add(p.group);
      this.faces[n] = new FaceRig(src.model, 'neutral');
      const head = src.parts.Head?.find((m) => m.morphTargetDictionary);
      if (head) {
        const c = new FaceCreases(head);
        this.creases.push(c);
        this.faces[n].attachCreases(c);
      }
    }
    // Voss: a copy of the player's body without its head (the camera is there): his arms and hands
    // are seen, his own clips carry his eyes. (His materials are copies: this is another scene.)
    const model = cloneSkinned(this.player.bodyRoot);
    model.position.set(0, 0, 0);
    model.scale.setScalar(SCALE);
    model.rotation.set(0, Math.PI, 0);
    showWound(model, false);
    const made = new Map();
    model.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.material?.name || '';
      if (/M_Head|M_Hair|M_Glasses|M_Mouth|M_Teeth|M_LipSeal|M_Wound/.test(name) || /^(Head|Hair|Glasses|Wound)/.test(o.name)) {
        o.visible = false;
        return;
      }
      o.visible = true;
      o.frustumCulled = false;
      o.castShadow = o.receiveShadow = false;
      if (!made.has(o.material)) {
        const m = o.material.clone();
        m.onBeforeCompile = o.material.onBeforeCompile;
        made.set(o.material, m);
        this._mats.push(m);
      }
      o.material = made.get(o.material);
    });
    this.voss = new Person('voss', model, this.player.clips);
    this.scene.add(this.voss.group);
    this.voss.group.updateMatrixWorld(true);
    this.eyeLocal = this.voss.b.head.worldToLocal(model.localToWorld(EYE.clone()));
    // cold: a still camera, slow breathing, hardly any sway
    this.eyes = new Eyes(this.camera, this.voss, this.eyeLocal, { wander: 0.3, sway: 0.35, steady: 0.75, breath: 0.005 });
  }

  // ------------------------------------------------------------------ the script
  _script() {
    const T = this.T, L = T.line;
    const W = (pts, t0, t1, ramp) => new Walk(pts, t0, t1, ramp);
    const len = (id) => L[id][1] - L[id][0];
    // the walks (the first one's start is where each stands before it)
    this.walks = {
      kessler: [W([P.kessler.start, P.kessler.near], L.v1[0] + 0.6, L.v1[0] + 2.2, 0.6), W([P.kessler.near, P.kessler.close], L.k5[0] - 0.25, L.k5[0] + 0.7, 0.35),
        W([P.kessler.close, P.kessler.glass], T.rush + 0.5, T.shut + 0.9, 0.4)],
      lindqvist: [W([P.lindqvist.start, P.lindqvist.fore], L.l3[0] - 0.4, L.l3[0] + 0.6, 0.35),
        W([P.lindqvist.fore, [-0.45, -25.0], P.lindqvist.glass], T.rush + 0.1, T.shut + 0.1, 0.3)],
      navarro: [W([P.navarro.start, [-0.6, -26.0], P.navarro.glass], T.rush + 0.45, T.shut + 0.7, 0.35)],
      park: [W([P.park.start, P.park.feed], T.parkGo, T.parkThere, 0.4), W([P.park.feed, P.park.back], T.parkBack, T.parkBack + 1.0, 0.4),
        W([P.park.back, P.park.recoil], T.recoil, T.recoil + 1.0, 0.4),
        W([P.park.recoil, [0.65, -25.9], P.park.glass], T.rush + 0.7, T.shut + 0.9, 0.35)],
      voss: [W([P.voss.door, P.voss.in], L.v2[0] + 0.2, L.v2[0] + 1.1, 0.4),             // (half a step in, as he flares up)
        W(P.voss.out, T.rush, T.rush + 1.15, 0.35), W([[-0.1, -21.95], [0.55, -22.5], P.voss.panel], T.toPanel, T.toPanel + 1.15, 0.4),
        W([P.voss.panel, P.voss.watch], T.watch, T.watch + 1.0, 0.45),
        W([P.voss.watch, [0.3, -21.8], [0.35, -18.0], [0.25, -14.0]], T.leave, T.leave + 7.6, 0.8)]
    };
    // on "wet" he stops dead (the walk's own clock held), then walks on
    const away = this.walks.voss[4];
    const [s0, s1] = T.stop, held = [];
    for (let t = s0, h = 0; t <= s1 + 0.01; t += 0.01) {
      held.push(h);
      h += 0.01 * seg(t, s0, s0 + 0.35) * (1 - seg(t, s1 - 0.6, s1));
    }
    away.warp = (t) => t - (t < s0 ? 0 : held[Math.min(held.length - 1, Math.round((t - s0) / 0.01))]);

    // what Voss looks at: his gaze is fixed, it moves rarely
    const head = (n) => (out) => this.people[n].at('head', out, 0.09);
    const point = (p) => (out) => out.copy(p);
    const coupling = v3(LUG.x, LUG.y + 0.15, LUG.z);
    const glassMid = (out) => out.set(0.0, 1.6, -24.6);
    // (as he flares up: his eyes jitter on her face, as in Flashback 2)
    const agitated = (n) => (out) => {
      this.people[n].at('head', out, 0.09);
      return out.set(out.x + 0.035 * Math.sin(this.t * 7.3), out.y + 0.025 * Math.sin(this.t * 9.1 + 1), out.z);
    };
    // his own shaking hands, between them
    const hands = (out) => {
      this.voss.ik.R.hand.getWorldPosition(out);
      return out.add(this.voss.ik.L.hand.getWorldPosition(this._v3)).multiplyScalar(0.5);
    };
    const ahead = (out) => out.set(this.voss.pos.x * 0.5, 1.62, this.voss.pos.z + 6);
    // when he stops: down and over his right shoulder, as if he would turn (he walks toward +z: his right is -x)
    const aside = (out) => out.set(this.voss.pos.x - 0.8, 1.3, this.voss.pos.z + 0.9);
    this.attention = [
      [0, point(SCENE_MID)], [L.k1[0] + 1.0, head('kessler')],
      [L.l1[0], head('lindqvist')], [L.p1[0] + 0.2, head('park')], [L.k2[0] - 0.1, head('kessler')],
      [L.k3[0] + 0.25 * len('k3'), point(ARIA_AT)], [L.k3[0] + 0.25 * len('k3') + 1.5, head('kessler')],
      [L.l2[0] + 0.1, head('lindqvist')], [T.parkGo + 0.2, head('park')], [L.p2[0], point(coupling)],
      [T.cut + 0.9, point(v3(0, 3.6, -27.2))], [T.cut + 2.2, point(ARIA_AT)], [L.p3[0] + 0.3, head('park')],
      [T.turn + 0.2, head('kessler')], [T.turn + 1.1, point(CREW_MID)],
      [L.k4[0] - 0.2, head('kessler')], [L.l3[0] + 0.1, head('lindqvist')], [L.v1[0] + 1.2, head('kessler')],
      [L.v2[0], agitated('kessler')], [L.l4[0] + 0.1, head('lindqvist')], [L.n1[0] + 0.1, head('navarro')],
      [T.hide + 0.3, head('park')], [L.v3[0] + 0.2, head('kessler')],
      [T.rush + 0.1, head('lindqvist')], [T.rush + 0.75, (out) => this.door.localToWorld(out.copy(this.doorLook))],
      [T.swing[0] - 0.1, glassMid], [T.toPanel + 0.35, point(PANEL_AT)],
      [T.rip + 0.5, hands], [T.shake[1] - 0.5, head('kessler')], [T.watch + 1.2, head('park')], [L.v4[0] - 0.3, head('kessler')],
      [T.leave + 0.2, ahead], [T.stop[0] + 0.25, aside], [T.stop[1] - 0.5, ahead]
    ];

    // each face, stretch by stretch: the preset, and an expression on top (from the directions).
    // Anger is the brows hard down (brow -1 and past it: the creases show), the mouth pulled down,
    // the lids a little narrowed (tired) and the head lowered (bow); fear and grief are the brows up
    // and in (worry).
    const turned = (n) => T.turnOf[n];
    this.acting = {
      kessler: [
        [0, 'composed', { frown: 0.25, brow: 0.15, worry: 0.4, tired: 0.35, bow: 0.08 }],             // she can't look at them
        [L.k1[0], 'strained', { frown: 0.4, brow: 0.45, worry: 0.75, tired: 0.45, bow: 0.1 }],
        [T.signed, 'strained', { frown: 0.55, brow: 0.5, worry: 1.0, tired: 0.5, bow: 0.15 }],       // "I signed it"
        [L.l1[0], 'strained', { frown: 0.45, brow: 0.4, worry: 0.85, tired: 0.45, bow: 0.1 }],
        [L.k3[0], 'calm', { frown: 0.45, brow: -0.75, tired: 0.15, bow: 0.02 }],                     // firm: a leader
        [L.l2[0], 'calm', { frown: 0.35, brow: -0.55 }],
        [T.cut, 'composed', { frown: 0.2, brow: 0.75, worry: 0.5, bow: -0.06 }],                     // the lights
        [L.p3[0], 'composed', { frown: 0.35, brow: 0.6, worry: 0.85 }],                              // fear
        [turned('kessler'), 'composed', { frown: 0.55, brow: -0.95, tired: 0.1 }],                   // it was him
        [L.k4[0], 'composed', { frown: 0.6, brow: -0.6, worry: 0.45 }],                              // hurt and hard
        [L.v1[0] + 0.6, 'arguing', { frown: 0.7, brow: -1.2, tired: 0.12, bow: 0.04 }],
        [L.k5[0], 'arguing', { frown: 0.9, brow: -1.6, tired: 0.2, bow: 0.06 }],                     // she shouts
        [L.v2[0] + 0.5, 'arguing', { frown: 0.8, brow: -1.35, tired: 0.25, bow: 0.06 }],             // contempt
        [T.rush, 'arguing', { frown: 0.65, brow: -1.1, worry: 0.4 }],
        [L.k6[0], 'arguing', { frown: 0.85, brow: -1.45, worry: 0.3 }],                              // "VOSS! Open it!"
        [L.n2[0], 'strained', { frown: 0.5, brow: 0.6, worry: 1.05, tired: 0.3 }],                   // they're trapped
        [T.leave, 'resigned', { frown: 0.4, brow: 0.5, worry: 0.95, tired: 0.4 }]
      ],
      lindqvist: [
        [0, 'tense', { frown: 0.2, brow: 0.1, worry: 0.2 }],
        [L.k1[0] + 0.5 * len('k1'), 'tense', { frown: 0.4, brow: 0.5, worry: 0.45 }],                 // shock
        [L.l1[0], 'arguing', { frown: 0.7, brow: -1.15 }],                                           // "You signed it?"
        [L.l1[1] + 0.4, 'tense', { frown: 0.6, brow: -0.9 }],
        [L.k3[0], 'tense', { frown: 0.45, brow: -0.6 }],
        [L.l2[0], 'tense', { frown: 0.5, brow: -0.95, bow: 0.04 }],                                  // resolve
        [T.cut, 'tense', { frown: 0.2, brow: 0.65, worry: 0.45 }],
        [L.p3[0], 'tense', { frown: 0.4, brow: 0.5, worry: 0.75 }],
        [turned('lindqvist'), 'arguing', { frown: 0.75, brow: -1.35, bow: 0.05 }],
        [L.l3[0], 'arguing', { frown: 0.9, brow: -1.6, bow: 0.08 }],                                 // a growl
        [L.v2[0] + 0.5, 'arguing', { frown: 0.8, brow: -1.4, skew: -0.3 }],                          // disbelief
        [L.l4[0], 'arguing', { frown: 0.95, brow: -1.45, tired: 0.3, skew: 0.25 }],                  // contempt
        [T.rush, 'arguing', { frown: 0.85, brow: -1.6 }],
        [L.n2[0], 'strained', { frown: 0.6, brow: 0.45, worry: 0.95 }]
      ],
      navarro: [
        [0, 'calm', { brow: 0.1, worry: 0.2 }],
        [L.k1[0] + 0.5 * len('k1'), 'calm', { frown: 0.4, brow: 0.45, worry: 0.65 }],                 // hurt
        [L.k3[0], 'calm', { frown: 0.4, brow: -0.45, worry: 0.3 }],
        [L.l2[0], 'calm', { frown: 0.35, brow: -0.55 }],
        [T.cut, 'calm', { brow: 0.75, worry: 0.45 }],
        [L.p3[0], 'calm', { frown: 0.25, brow: 0.85, worry: 0.65 }],                                 // disbelief
        [turned('navarro'), 'tense', { frown: 0.6, brow: -0.95 }],
        [L.v1[0] + 0.5, 'arguing', { frown: 0.7, brow: -1.25 }],
        [L.n1[0] - 0.2, 'arguing', { frown: 0.9, brow: -1.6, bow: -0.03 }],                          // he shouts
        [L.n1[1] + 0.5, 'arguing', { frown: 0.8, brow: -1.35 }],
        [T.rush, 'arguing', { frown: 0.85, brow: -1.5 }],
        [L.n2[0], 'strained', { frown: 0.5, brow: 0.75, worry: 1.05, tired: 0.2 }],                  // "Oh no"
        [L.p5[0], 'strained', { frown: 0.3, brow: 0.85, worry: 0.95 }]
      ],
      park: [
        [0, 'neutral', { brow: 0.15, worry: 0.35 }],
        [L.k1[0] + 0.5 * len('k1'), 'neutral', { frown: 0.2, brow: 0.6, worry: 0.75 }],
        [L.p1[0], 'strained', { frown: 0.35, brow: 0.7, worry: 0.9 }],                               // understanding slowly
        [L.k3[0], 'neutral', { frown: 0.2, brow: 0.3, worry: 0.55 }],
        [L.p2[0], 'tense', { frown: 0.65, brow: -0.85 }],                                            // the effort
        [T.cut + 0.5, 'neutral', { brow: 0.85, worry: 0.65 }],
        [L.p3[0], 'strained', { frown: 0.4, brow: 0.95, worry: 1.05 }],                              // a frightened whisper
        [turned('park'), 'strained', { frown: 0.5, brow: 0.75, worry: 1.05 }],
        [L.v2[0], 'strained', { frown: 0.6, brow: 0.8, worry: 1.15, tired: 0.2 }],
        [T.hide, 'resigned', { frown: 0.6, brow: 0.6, worry: 1.15, tired: 0.5, bow: 0.25 }],         // (hidden in his hands)
        [T.rush, 'strained', { frown: 0.6, brow: 0.7, worry: 1.05 }],
        [L.p4[0], 'resigned', { frown: 0.65, brow: 0.7, worry: 1.25, tired: 0.3 }],                  // crying
        [L.p5[0], 'neutral', { frown: 0.2, brow: 0.6, worry: 0.65 }]                                 // a kid's question
      ]
    };
    // the moments on the faces, each once: [when, who, what]
    const set = (n, k, v) => () => { this.faces[n][k] = v; };
    this.cues = [
      [T.signed - 0.1, 'kessler', set('kessler', 'shut', 1)], [T.signed + 1.0, 'kessler', set('kessler', 'shut', 0)],     // her eyes shut on it
      [L.k2[0], 'kessler', (f) => f.gesture('nod', 0.4)],
      [L.p3[1] + 0.2, 'navarro', (f) => f.gesture('shake', 0.5)],
      [L.v2[1] + 0.1, 'lindqvist', (f) => f.gesture('shake', 0.45)], [L.v2[1] + 0.3, 'kessler', (f) => f.gesture('shake', 0.5)],
      [L.k1[0], 'park', (f) => f.nerves(0.35)], [T.cut, 'park', (f) => f.nerves(0.75)], [T.hide, 'park', (f) => f.nerves(0)],
      [T.rush, 'park', (f) => f.nerves(0.6)]
    ];
    for (const n of CREW) {
      this.cues.push([T.cut + 0.05, n, set(n, 'gape', 0.3)], [T.cut + 0.9, n, set(n, 'gape', 0)]);   // a gasp as the lights go
      this.cues.push([T.turnOf[n], n, (f) => f.stare(5)]);                                           // the stare
    }

    // the bodies: [from, to, right hand, left hand, lean, options]; each eases in and out
    const eye = (out) => out.copy(this.camera.position);
    const chest = (out) => out.copy(this.camera.position).setY(this.camera.position.y - 0.4);
    const parkHead = (out) => this.people.park.at('head', out, 0.05);
    this.body = {
      kessler: [
        [T.signed - 0.3, L.k2[1] + 0.4, 'chest', null, 0.08],                                          // guilt
        [L.k3[0] + 0.5, L.l2[1] + 0.3, null, 'hip', 0],                                               // firm
        [L.k5[0] + 0.1, L.k5[1] + 0.5, 'point', null, 0.14, { at: chest, reach: 0.45 }],              // at him
        [L.v2[0] + 0.7, T.rush - 0.1, 'cross', 'cross', 0]                                            // cold
      ],
      lindqvist: [
        [L.l1[0] - 0.1, L.l1[1] + 0.6, 'open', null, 0.08],
        [L.l2[0] + 0.6 * len('l2'), L.l2[1] + 0.9, 'point', null, 0.04, { at: parkHead, reach: 0.6 }], // "Park."
        [turned('lindqvist') + 0.5, L.l4[0] - 0.05, 'fist', 'fist', 0.1],
        [L.l4[0], L.l4[1] + 0.7, 'point', 'fist', 0.16, { at: eye, reach: 0.75 }],
        [L.l4[1] + 0.7, T.rush, 'fist', 'fist', 0.12]
      ],
      navarro: [
        [L.k1[0] + 1.2, L.k3[0] + 0.5, 'cross', 'cross', 0],                                         // listening, closed
        [turned('navarro') + 0.4, L.n1[0] - 0.15, 'hip', 'hip', 0.04],
        [L.n1[0] - 0.1, L.n1[1] + 0.6, 'open', 'open', 0.18],                                         // "who do you think you are?!"
        [L.n1[1] + 0.6, T.rush, 'fist', 'fist', 0.1]
      ],
      park: [
        [T.recoil, T.hide - 0.2, null, null, -0.07],                                                  // back from him
        [T.hide, T.rush + 0.1, 'face', 'face', 0.22]                                                  // he can't bear to see it
      ]
    };
    // Lindqvist's fists on the glass: when each lands (until "Oh no")
    this.pounds = [];
    for (let t = T.shut + 0.25, i = 0; t < L.n2[0]; i++) {
      this.pounds.push(t);
      t += 0.38 + ((i * 7919) % 5) * 0.03;
    }
    // Voss's blinks: few, and slow (he is cold)
    this.blinks = [];
    for (let t = 2.6, i = 0; t < T.end - 1; i++) {
      this.blinks.push([t, 0.17]);
      t += 4.2 + ((i * 7919) % 31) / 10;
    }
    // the stills (slow machines): a new picture at each line, and at each beat
    this.beats = [T.parkThere, T.cut, T.cut + 2.2, T.turn, T.turn + 1.2, T.hide + 0.5, T.rush, T.rush + 1.0, T.shut, T.coverOff, T.rip,
      T.shake[0] + 1.0, T.watch + 0.8, T.leave + 1.0, T.stop[0] + 0.4];
  }

  // The way in, on the level's own frame (as Flashback 1's, in the lift): his sight blurs and throbs
  // with a heartbeat, then goes black. composer: the level's; root: where the black goes. Resolves
  // when the screen is black (the black is left to the caller: it is returned).
  headache(composer, root) {
    const pass = new ShaderPass(EyeShader);
    pass.uniforms.uOpen.value = 1.25;
    pass.uniforms.uHaze.value = 0;
    pass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
    if (composer) composer.insertPass(pass, Math.max(0, composer.passes.length - 1));
    const black = document.createElement('div');
    black.className = 'fb3d-hint on';
    black.style.cssText = 'position:fixed;inset:0;background:#000;z-index:30;pointer-events:none;opacity:0';
    root?.appendChild(black);
    const beats = [0.15, 0.95, 1.65, 2.25, 2.75];
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      const ac = (this.ac ||= new AC());
      ac.resume?.().catch(() => {});
      const out = ac.createGain();
      out.gain.value = settings.get('effects');
      out.connect(ac.destination);
      for (const b of beats) heartbeat(ac, out, ac.currentTime + b);
    }
    const LENGTH = 3.4;
    const start = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const t = (performance.now() - start) / 1000;
        let throb = 0;
        for (const b of beats) throb = Math.max(throb, Math.exp(-Math.pow((t - b - 0.06) * 7, 2)));
        pass.uniforms.uHaze.value = clamp(0.15 + 0.6 * seg(t, 0, 2.6) + 0.35 * throb * (0.4 + t / LENGTH));
        pass.uniforms.uTime.value = t;
        black.style.opacity = seg(t, LENGTH - 1.0, LENGTH).toFixed(3);
        if (t < LENGTH) return requestAnimationFrame(tick);
        composer?.removePass(pass);
        pass.dispose();
        resolve(black);
      };
      tick();
    });
  }

  // One frame drawn out of sight (call while the screen is black, just before play()): the shaders
  // are compiled ahead, but the textures go to the graphics card the first time they are drawn
  warm(renderer) {
    if (!this.ready || this._warmed) return;
    this._warmed = true;
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  // ------------------------------------------------------------------ playing
  play({ still = false } = {}) {
    this.running = true;
    this.still = still;
    if (still) this.stats.still = 'before it started (the level was slow)';
    this.t = 0;
    this._last = performance.now();
    this._skip = false;
    this._mountOverlay();
    window.addEventListener('keydown', this._onKey);
    this._startSound();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  _mountOverlay() {
    if (this.overlay || !this.root) return;
    const o = (this.overlay = document.createElement('div'));
    o.className = 'fb3d-hint on';
    Object.assign(o.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: 31 });
    o.innerHTML = `<div class="fb3-sub" style="position:absolute;left:50%;bottom:2.5vh;transform:translateX(-50%);max-width:min(46rem,86vw);text-align:center;color:#f1f4f2;font-size:clamp(1rem,1.6vw,1.35rem);line-height:1.45;text-shadow:0 0 6px #000,0 2px 10px rgba(0,0,0,.8);opacity:0;transition:opacity .25s"><span class="fb3-who" style="display:block;font-size:.7em;letter-spacing:.25em;margin-bottom:.2em"></span><span class="fb3-text"></span></div>
      <div class="fb-hint" style="position:absolute;right:1.2rem;bottom:1rem;font-size:.72rem;letter-spacing:.15rem;color:#cfefff;opacity:0;transition:opacity .4s">Enter: skip</div>`;
    this.sub = o.querySelector('.fb3-sub');
    this.subWho = o.querySelector('.fb3-who');
    this.subText = o.querySelector('.fb3-text');
    this.hint = o.querySelector('.fb-hint');
    this.root.appendChild(o);
  }

  // per frame, instead of the level's own frame. Time is the sound's clock while it runs (the
  // voices stay in step even when frames are slow), else the frames'.
  render(renderer) {
    const now = performance.now();
    const raw = (now - this._last) / 1000;
    this._last = now;
    const ac = this.ac;
    let t = ac && ac.state === 'running' && this._t0 !== undefined ? Math.max(this.t, ac.currentTime - this._t0) : this.t + Math.min(0.1, raw);
    if (this._skip) t = this.T.end;
    const dt = Math.min(0.1, t - this.t);
    this.t = t;
    if (t > 0.5) {
      this.stats.frames++;
      this.stats.seconds += raw;
      if (raw > this.stats.worst) {
        this.stats.worst = raw;
        this.stats.worstAt = +t.toFixed(2);
      }
    }
    this._judge(raw, t);
    if (t >= this.T.end) return this._end();
    if (this.hint) this.hint.style.opacity = t > SKIP_AFTER && t < this.T.end - 1 ? 0.55 : 0;
    this._animate(t, dt);
    this._subtitles(t);
    this._draw(renderer, t);
  }

  // The machine keeps up, or the stills: judged over its first seconds (about 22 fps or better),
  // then on a running average (under about 18 fps for two seconds)
  _judge(raw, t) {
    if (this.still || raw > 0.5 || document.hidden) return;
    const q = (this._perf ||= { time: 0, frames: 0, ema: 0, slow: 0, judged: false });
    if (t < 1.0) return;
    q.ema = q.ema ? q.ema * 0.95 + raw * 0.05 : raw;
    if (!q.judged) {
      q.time += raw;
      q.frames++;
      if (q.time >= 2.5) {
        q.judged = true;
        if (q.time / q.frames > 1 / 22) this._goStill(`${Math.round(q.frames / q.time)} fps in its first seconds`);
      }
    } else if (q.ema > 1 / 18) {
      q.slow += raw;
      if (q.slow > 2) this._goStill(`${Math.round(1 / q.ema)} fps`);
    } else {
      q.slow = 0;
    }
  }

  _goStill(why) {
    this.still = true;
    this.stats.still = why;
    console.info('Flashback 3: the machine is slow (' + why + '): stills from here on.');
  }

  _draw(renderer, t) {
    renderer.getDrawingBufferSize(this._size);
    const w = Math.max(16, Math.round(this._size.x * RENDER_SCALE)), h = Math.max(16, Math.round(this._size.y * RENDER_SCALE));
    let fresh = !this.still;
    if (this.target.width !== w || this.target.height !== h) {
      this.target.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      fresh = true;
    }
    if (this.still) {
      // a new picture only when a new line or beat begins
      const line = this._lineAt(t);
      let beat = 0;
      for (const b of this.beats) if (t >= b) beat++;
      const key = (line?.id || '-') + beat;
      if (key !== this._shot) {
        this._shot = key;
        fresh = true;
      }
    }
    if (fresh) {
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, this.camera);
      renderer.setRenderTarget(null);
    }
    const u = this.post.material.uniforms;
    u.tScene.value = this.target.texture;
    u.uTime.value = t;
    u.uAspect.value = this.camera.aspect;
    u.uBlack.value = Math.max(1 - seg(t, 0.1, 1.4), seg(t, this.T.end - 0.9, this.T.end - 0.15));
    u.uBlink.value = this._blink(t);
    renderer.render(this.postScene, this.postCam);
  }

  _blink(t) {
    for (const [at, len] of this.blinks) if (t >= at && t <= at + len) return Math.sin(((t - at) / len) * Math.PI);
    return 0;
  }

  // the line being said (the latest to start, while it lasts)
  _lineAt(t, pad = 0) {
    const L = this.T.line;
    let found = null;
    for (const l of LINES) if (t >= L[l.id][0] && t <= L[l.id][1] + pad) found = l;
    return found;
  }

  _subtitles(t) {
    if (!this.sub) return;
    const line = this._lineAt(t, 0.3);
    if (line) {
      if (this.subText.textContent !== line.text) {
        this.subText.textContent = line.text;
        this.subWho.textContent = NAMES[line.who];
        this.subWho.style.color = COLOURS[line.who];
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
    for (const f of Object.values(this.faces || {})) f.stopSpeaking();
    this.overlay?.remove();
    this.overlay = null;
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.();
  }

  // ------------------------------------------------------------------ the action
  _animate(t, dt) {
    const T = this.T, L = T.line, v = this.voss, K = this.people;
    const step = Math.min(dt, 0.05);

    // ---- where everyone is, and which way they face
    const vw = this._follow(v, this.walks.voss, t);
    const vossFace = (out) => out.copy(this.camera.position);
    let want;
    if (t < T.rush + 0.55) want = yawOf(K.kessler.pos.x - v.pos.x, K.kessler.pos.z - v.pos.z) * 0.35;  // (into the room, barely turning)
    else if (t < T.toPanel) want = this._toward(v, this.door.localToWorld(this._v3.copy(this.handleLocal)));
    else if (t < T.watch) want = v.speed > 0.2 && t < T.toPanel + 0.7 ? this._tangentYaw(vw, t) : this._toward(v, PANEL_AT);
    else if (t < T.leave) want = this._toward(v, this._v3.set(0, 0, -24.4));
    else want = this._tangentYaw(vw, t);
    if (t === 0) v.yaw = want;
    turnTo(v, want, step, t > T.leave ? 3.0 : 4.0);

    const crewMid = this._v2.copy(CREW_MID);
    for (const n of CREW) {
      const p = K[n];
      const w = this._follow(p, this.walks[n], t);
      const backing = n === 'park' && t > T.recoil - 0.1 && t < T.recoil + 1.1;    // (half a step back, still facing him)
      if (backing) p.speed *= 0.35;
      let y;
      if (p.speed > 0.25 && !backing) y = this._tangentYaw(w, t);
      else if (n === 'park' && t > T.parkThere - 0.3 && t < T.parkBack) y = -Math.PI / 2;        // at the feed, facing it
      else if (t > T.shut - 0.2) y = Math.PI * 0.98 + 0.08 * Math.sin(n.length);                  // at the glass
      else if (n === 'kessler' && t < T.turnOf.kessler) y = this._toward(p, crewMid);
      else if (t > T.turnOf[n]) y = this._toward(p, this.camera.position) + (n === 'park' && t > T.hide && t < T.rush ? 0.55 : 0);
      else y = this._toward(p, K.kessler.pos);
      if (t === 0) p.yaw = y;
      turnTo(p, y, step, t > T.turnOf[n] && t < T.turnOf[n] + 1.5 ? 2.4 : 3.4);
      p.look ||= new THREE.Vector3();
      this._lookOf(n, t, p.look);
    }

    // ---- the props: the door, the wrench, the feed, the panel, the lights
    this._props(t, step);

    // ---- faces: the expression of the moment, mouths on their voices, then the bodies
    for (const n of CREW) {
      const f = this.faces[n];
      let mood = this.acting[n][0];
      for (const a of this.acting[n]) if (t >= a[0]) mood = a;
      if (f._mood !== mood) {
        f._mood = mood;
        f.setPreset(mood[1]);
        // (a mouth that opens a little less than the presets': their teeth show blocky wide open)
        f.preset = { ...f.preset, jaw: f.preset.jaw * (n === 'kessler' ? 0.65 : 0.72) };
      }
      f.pose(mood[2], 0.5);
    }
    for (const c of this.cues) {
      if (!c.done && t >= c[0] && t < c[0] + 1) {
        c.done = true;
        c[2](this.faces[c[1]]);
      }
    }
    this._mouths(t);
    for (const n of CREW) K[n].grips.R = K[n].grips.L = null;
    v.grips.R = v.grips.L = null;
    // (the wrench on the coupling before the hands that hold it; in his hand, after his arm has moved)
    const onLug = t >= this.T.wrenchOn[0];
    if (onLug) this._wrench(t);
    this._hands(t);
    for (const n of CREW) {
      K[n].update(step);
      this.faces[n].update(step);
      K[n].aimHead(this.faces[n].head.yaw * 0.6, -this.faces[n].head.pitch * 0.6);
    }
    v.update(step);
    if (!onLug) this._wrench(t);
    this._steps(t);

    // ---- Voss's eyes, after the bodies have moved
    let get = this.attention[0][1];
    for (const [at, fn] of this.attention) if (t >= at) get = fn;
    this.eyes.update(t, step, get(this._v));
    // after the lock: his breath goes ragged (fast, uneven heaves, a tremor in the head), then steadies
    const rag = seg(t, T.rip - 0.1, T.rip + 0.5) * (1 - seg(t, T.shake[1] - 0.8, T.watch + 1.2));
    if (rag > 0.001) {
      const heave = Math.sin(t * 4.6 + 0.8 * Math.sin(t * 1.3));
      this.camera.position.y += 0.011 * rag * heave;
      this.camera.rotateX(-0.012 * rag * heave);
      this.camera.rotateZ(rag * (0.004 * Math.sin(t * 23.0) + 0.003 * Math.sin(t * 31.7 + 1)));
    }
  }

  // where a person is on their walks at t (and how fast they go)
  _follow(p, walks, t) {
    let w = walks[0];
    for (const x of walks) if (t >= x.t0) w = x;
    const tw = w.warp ? w.warp(t) : t;
    const u = w.u(tw);
    w.curve.getPointAt(u, p.pos);
    p.speed = tw > w.t0 && tw < w.t1 ? (Math.abs(w.u(tw + 0.05) - u) * w.length) / 0.05 : 0;
    return w;
  }

  _tangentYaw(w, t) {
    const tg = w.curve.getTangentAt(Math.min(0.999, w.u(w.warp ? w.warp(t) : t) + 0.03), this._v3);
    return yawOf(tg.x, tg.z);
  }

  _toward(p, at) {
    return yawOf(at.x - p.pos.x, at.z - p.pos.z);
  }

  // what each of the crew looks at
  _lookOf(n, t, out) {
    const T = this.T, L = T.line, K = this.people;
    const line = this._lineAt(t, 0.4);
    const head = (who) => K[who].at('head', out, 0.09);
    const p = K[n];
    if (t > T.turnOf[n] - 0.1) {
      // on Voss from here on (Park, hiding his face, looks down; at the end they watch him go)
      if (n === 'park' && t > T.hide && t < T.rush) return out.set(p.pos.x, 0.5, p.pos.z + 0.5);
      if (n === 'park' && t > L.p5[0] - 0.3) return out.set(p.pos.x - 0.3, 0.0, p.pos.z - 0.6);   // the floor
      if (t > T.leave + 0.5) return out.set(this.voss.pos.x, 1.5, this.voss.pos.z);
      return out.copy(this.camera.position);
    }
    if (t > T.cut && t < T.cut + 1.3) return out.set(0, 3.6, -27.2 + (n.length - 5) * 0.4);   // the lights flicker
    if (t > T.cut + 1.3) return out.copy(ARIA_AT);                                               // her light, still on
    if (n === 'park' && t > T.parkGo && t < T.cut) return out.copy(LUG);
    if (n === 'kessler') {
      // she can't look at them at first; "And ARIA's awake": a glance at him
      if (t < L.k1[0] + 0.45 * (L.k1[1] - L.k1[0])) return out.copy(p.pos).lerp(CREW_MID, 0.5).setY(0.2);
      if (t > T.signed && t < L.l1[0]) return out.copy(p.pos).lerp(CREW_MID, 0.4).setY(0.3);
      if (t > L.k3[0] && t < L.k3[0] + 1.3) return out.copy(this.camera.position);
      if (line && line.who !== 'kessler' && line.who !== 'voss') return head(line.who);
      return out.copy(CREW_MID);
    }
    if (t > T.parkGo && t < T.cut) return out.copy(LUG);
    if (line && line.who !== n && line.who !== 'voss') return head(line.who);
    return head('kessler');
  }

  // Their mouths follow their voices (the recordings, through analysers); without a recording,
  // wordless talk while the subtitle is up
  _mouths(t) {
    const L = this.T.line;
    for (const n of CREW) {
      let id = null;
      for (const l of LINES) if (l.who === n && t >= L[l.id][0] && t <= L[l.id][1]) id = l.id;
      const f = this.faces[n];
      if (id === f._speaking) continue;
      f._speaking = id;
      if (!id) f.stopSpeaking();
      else if (this.analysers?.has(id)) f.attachAnalyser(this.analysers.get(id));
      else f.startBabble(1.0);
    }
  }

  // A grip object, kept for each use (nothing is made per frame)
  _grip(key, curl = [0.9, 1.0, 0.8], thumb = [0.6, 0.4]) {
    const g = ((this._grips ||= {})[key] ||= { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(), pole: new THREE.Vector3(), curl: [...curl], thumb: [...thumb], w: 0 });
    return g;
  }

  _hands(t) {
    const T = this.T, L = T.line, K = this.people, v = this.voss;
    // the body language (this.body): each gesture eased in and out; where two meet on one hand,
    // the stronger has it. The lean is their sum.
    for (const n of CREW) {
      const p = K[n];
      let lean = 0;
      for (const [i, [t0, t1, right, left, ln, opts]] of this.body[n].entries()) {
        const w = seg(t, t0 - 0.35, t0) * (1 - seg(t, t1, t1 + 0.4));
        if (w <= 0) continue;
        lean += ln * w;
        const at = opts?.at && opts.at(this._v2);
        for (const [side, kind] of [['R', right], ['L', left]]) {
          if (!kind) continue;
          const g = ((this._bodyGrips ||= {})[`${n}${i}${side}`] ||= grip());
          pose(p, kind, side, g, { at, reach: opts?.reach });
          if (kind === 'face') {                     // (a little tremor in hands held to the face)
            g.wrist.y += 0.003 * Math.sin(t * 37 + i + (side === 'R' ? 0 : 2));
          }
          g.w = w;
          if (!p.grips[side] || p.grips[side].w < w) p.grips[side] = g;
        }
      }
      p.lean = lean;
    }
    const k = K.kessler;
    // at the glass: Kessler's palms flat on it; Lindqvist's fists, pounding; then one fist resting
    const kg = seg(t, T.shut + 0.9, T.shut + 1.5);
    if (kg > 0) {
      for (const [side, dx] of [['R', -0.2], ['L', 0.17]]) {          // (facing out: her right is -x)
        const g = this._grip('kGlass' + side, [0.08, 0.1, 0.05], [0.1, 0.05]);
        g.wrist.set(k.pos.x + dx, 1.42 + (side === 'R' ? 0.04 : 0), -24.19);
        g.fingers.set(dx * 0.6, 1, 0).normalize();
        g.palm.set(0, 0, 1);
        g.pole.set(dx > 0 ? 1 : -1, -0.8, -0.3).normalize();
        g.w = kg;
        k.grips[side] = g;
      }
    }
    const lq = K.lindqvist;
    const pw = seg(t, T.shut, T.shut + 0.2) * (1 - seg(t, L.n2[0], L.n2[0] + 0.8) * 0.4);
    if (pw > 0) {
      for (const [side, dx, phase] of [['R', -0.17, 0], ['L', 0.15, 1]]) {
        // each fist lands on every other pound; between them it draws back
        let d = 1;
        for (let i = phase; i < this.pounds.length; i += 2) {
          const a = this.pounds[i];
          if (t >= a - 0.38 && t < a + 0.38) d = Math.min(d, Math.abs(t - a) / 0.38);
        }
        const pounding = t < L.n2[0];
        const back = pounding ? 0.15 * Math.pow(d, 0.6) : 0.02;
        const g = this._grip('lFist' + side, [1.3, 1.4, 1.2], [0.9, 0.6]);
        g.wrist.set(lq.pos.x + dx, 1.36 + (side === 'R' ? 0.05 : 0), -24.24 - back - 0.06);
        g.fingers.set(dx * 0.4, 0.15, 1).normalize();
        g.palm.set(side === 'R' ? 1 : -1, -0.4, 0).normalize();
        g.pole.set(side === 'R' ? -1 : 1, -1, -0.2).normalize();
        g.w = pw * (pounding || side === 'R' ? 1 : 0);
        lq.grips[side] = g;
      }
    }

    // Park's hands on the wrench, from when he puts it on the coupling until it gives
    const pk = K.park;
    const on = seg(t, T.wrenchOn[0] - 0.01, T.wrenchOn[0]) * (1 - seg(t, T.cut + 0.35, T.cut + 0.8));
    if (on > 0) {
      const ang = this._heave(t);
      const h = this._v3.set(0, Math.cos(ang), Math.sin(ang));
      for (const [side, along, w] of [['R', 0.38, on], ['L', 0.22, on * seg(t, T.wrenchOn[0] + 0.3, T.wrenchOn[1])]]) {
        if (w <= 0) continue;
        const g = this._grip('park' + side, [1.0, 1.1, 0.9], [0.7, 0.5]);
        this.wrench.localToWorld(g.wrist.set(0, along, 0));
        g.wrist.x -= 0.06;
        g.fingers.set(1, -0.2, 0).normalize();
        g.palm.set(0, -h.z, h.y).multiplyScalar(side === 'R' ? -1 : 1);
        g.pole.set(-0.3, -1, side === 'R' ? 0.6 : -0.6).normalize();
        g.w = w;
        pk.grips[side] = g;
      }
    }

    // Voss: his left hand on the door's handle, swinging it shut, and letting go
    const dw = seg(t, T.grab - 0.3, T.grab) * (1 - seg(t, T.swing[1], T.swing[1] + 0.25));
    if (dw > 0) {
      const g = this._grip('vDoor', [1.0, 1.1, 0.9], [0.6, 0.4]);
      this.door.localToWorld(g.wrist.copy(this.handleLocal));
      const a = this._v2.subVectors(g.wrist, v.pos).setY(0).normalize();
      g.wrist.addScaledVector(a, -0.05);
      g.fingers.set(a.z, -0.2, -a.x).normalize();
      g.palm.copy(a);
      g.pole.set(-a.z - 0.3, -1, a.x).normalize();
      g.w = dw;
      v.grips.L = g;
    }
    // ...both hands on the panel's cover, tearing it off; then the right hand in, round the module
    const cw = seg(t, T.cover - 0.35, T.cover) * (1 - seg(t, T.coverOff + 0.2, T.coverOff + 0.45));
    if (cw > 0) {
      const c = this.panel.cover.getWorldPosition(this._v2);
      for (const [side, s] of [['R', 1], ['L', -1]]) {
        const g = this._grip('vCover' + side, [1.1, 1.2, 1.0], [0.5, 0.4]);
        g.wrist.set(c.x + s * 0.17, c.y + 0.02, c.z + 0.04);
        g.fingers.set(-s * 0.55, 0, -0.85).normalize();
        g.palm.set(-s, 0, 0);
        g.pole.set(s, -0.7, 0.4).normalize();
        g.w = cw;
        v.grips[side] = g;
      }
    }
    const mw = seg(t, T.module - 0.4, T.module) * (1 - seg(t, T.rip + 0.3, T.rip + 0.6));
    if (mw > 0) {
      const g = this._grip('vModule', [1.0, 1.1, 0.9], [0.6, 0.4]);
      this.panel.module.getWorldPosition(g.wrist);
      g.wrist.z += 0.08;
      g.wrist.y += 0.02;
      g.fingers.set(0, -0.15, -1).normalize();
      g.palm.set(0, -1, 0);
      g.pole.set(1, -0.8, 0.3).normalize();
      const shut = seg(t, T.module - 0.1, T.module + 0.1);
      g.curl[0] = 0.3 + 0.9 * shut; g.curl[1] = 0.3 + 1.0 * shut; g.curl[2] = 0.25 + 0.8 * shut;
      g.w = mw;
      v.grips.R = g;
    }
    // ...then both hands come up in front of him, and shake (a tremor of about 10 a second, the
    // fingers twitching with it), less and less, until he lowers them
    const tw = seg(t, T.rip + 0.3, T.rip + 0.9) * (1 - seg(t, T.shake[1] - 0.4, T.shake[1] + 0.3));
    if (tw > 0) {
      const amp = 0.009 * (1 - 0.55 * seg(t, T.shake[0] + 1.2, T.shake[1]));
      for (const [side, ph] of [['R', 0], ['L', 2.1]]) {
        if ((v.grips[side]?.w || 0) > tw) continue;
        const g = pose(v, 'tremble', side, ((this._bodyGrips ||= {})['voss' + side] ||= grip()));
        g.wrist.x += amp * (0.6 * Math.sin(t * 67 + ph) + 0.4 * Math.sin(t * 41.3 + 2 * ph));
        g.wrist.y += amp * (0.6 * Math.sin(t * 59 + 3 * ph) + 0.4 * Math.sin(t * 37.1 + ph));
        g.wrist.z += amp * 0.5 * Math.sin(t * 53 + 1.7 * ph);
        const twitch = 0.07 * Math.sin(t * 47 + ph);
        g.curl[0] += twitch; g.curl[1] += twitch; g.curl[2] += 0.7 * twitch;
        g.w = tw;
        v.grips[side] = g;
      }
    }
  }

  // the wrench's turn on the coupling (radians): stuck, stuck, then it goes
  _heave(t) {
    const [h0, h1] = this.T.heave;
    const u = clamp((t - h0) / (h1 - h0));
    const give = 0.62;
    if (u < give) return 0.14 * (u / give) + 0.02 * Math.sin(u * 40) * (u > 0 ? 1 : 0);
    return 0.14 + 1.21 * ease((u - give) / (1 - give));
  }

  // The wrench: in Park's right hand until he puts it on the coupling, then on it
  _wrench(t) {
    const T = this.T, pk = this.people.park, w = this.wrench;
    const lugPose = (ang) => {
      this._q.setFromAxisAngle(this._v3.set(1, 0, 0), ang).multiply(this._q2.setFromAxisAngle(this._v3.set(0, 1, 0), Math.PI / 2));
      return this._q;
    };
    if (t < T.wrenchOn[0]) {
      // held: the handle through his fist, the head hanging forward and down
      const ik = pk.ik.R;
      if (!ik.ok) return;
      const wrist = ik.hand.getWorldPosition(this._v);
      const fingers = this._v2, palm = this._v3;
      ik.frame(fingers, palm);
      const grip = wrist.addScaledVector(fingers, 0.07).addScaledVector(palm, 0.025);
      const axis = (this._axis ||= new THREE.Vector3()).crossVectors(fingers, palm).normalize();
      const fwd = (this._fwd ||= new THREE.Vector3()).set(-Math.sin(pk.yaw), 0, -Math.cos(pk.yaw));
      if (axis.dot(fwd) < 0) axis.negate();
      axis.y -= 1.2;
      axis.normalize();
      w.position.copy(grip).addScaledVector(axis, 0.44);
      w.quaternion.setFromUnitVectors(fingers.set(0, 1, 0), axis.negate());
      (this._held ||= { p: new THREE.Vector3(), q: new THREE.Quaternion() }).p.copy(w.position);
      this._held.q.copy(w.quaternion);
    } else {
      const a = seg(t, T.wrenchOn[0], T.wrenchOn[1]);
      const q = lugPose(this._heave(t));
      this._held ||= { p: LUG.clone(), q: q.clone() };
      w.position.copy(this._held.p).lerp(this._v.copy(LUG).add(this._v2.set(-0.05, 0, 0)), a);
      w.quaternion.copy(this._held.q).slerp(q, a);
    }
    w.updateMatrixWorld(true);
  }

  // the door, the coupling, the panel, the lights, ARIA's light, the sparks
  _props(t, dt) {
    const T = this.T;
    // the door: open, swung (fast, then by its own weight), slammed with a small bounce
    let a = 0;
    if (t > T.swing[0]) {
      const s = clamp((t - T.swing[0]) / (T.shut - T.swing[0]));
      a = 0.45 * ease(Math.min(1, s / 0.55)) + 0.55 * Math.max(0, (s - 0.55) / 0.45) ** 1.6;
      if (t > T.shut) a = 1 - 0.015 * Math.exp(-(t - T.shut) * 9) * Math.sin((t - T.shut) * 40);
    }
    this.door.rotation.y = -Math.PI / 2 * (1 - clamp(a));
    this.door.updateMatrixWorld(true);

    // the coupling's collar jumps as the feed parts
    const jump = seg(t, T.cut - 0.02, T.cut + 0.08);
    this.collar.position.y = 1.3 + 0.05 * jump;
    this.collar.rotation.z = 0.12 * jump;

    // the room's lights: steady, then flickering as the feed goes, then dim (the backup); the
    // corridor's (the last) stays as it is
    let level = 1;
    if (t > T.cut) {
      const f = t - T.cut;
      const flick = f < 1.1 ? (Math.sin(t * 53) + Math.sin(t * 31.7 + 1) > 0.4 ? 0.12 : 0.85) : 1;
      level = (0.38 + 0.62 * Math.exp(-f * 6)) * flick;
    }
    for (let i = 0; i < 3; i++) this.lamps[i].intensity = this.lamps[i].userData.base * level;
    this.hemi.intensity = 1.7 * (0.55 + 0.45 * level);
    this.bulbMat.color.setRGB(1, 0.886, 0.69).multiplyScalar(0.35 + 0.65 * level);
    this.engineLampMat.color.setHex(t > T.cut ? 0x0c1a10 : 0x56ff7a);
    this.screenMat.color.setHex(t > T.cut + 0.3 ? 0x0e1f1d : 0x3d8f86);
    // ARIA: her light pulses slowly, the same before and after
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.9);
    this.ariaLens.material.color.setHex(CYAN).multiplyScalar(0.55 + 0.75 * pulse);
    this.halo.material.opacity = 0.45 + 0.45 * pulse;

    // the panel: the cover torn off and falling, the module ripped out and left hanging
    const pan = this.panel, cover = pan.cover;
    if (t < T.coverOff + 0.25) {
      const pry = seg(t, T.cover + 0.1, T.coverOff - 0.15) * 0.012 + seg(t, T.coverOff - 0.15, T.coverOff + 0.05) * 0.16;
      cover.position.set(0, -0.3 * seg(t, T.coverOff - 0.05, T.coverOff + 0.2) * 0.2, PANEL_SIZE.d / 2 - 0.006 + pry);
      cover.rotation.set(-0.3 * seg(t, T.coverOff - 0.1, T.coverOff + 0.2), 0, 0);
    } else {
      // let go: it falls to the floor (by its own weight, a quarter turn, then lies there)
      const f = t - (T.coverOff + 0.25);
      const y0 = PANEL_AT.y - 0.06, z0 = PANEL_AT.z + 0.2;
      const fall = Math.min(f, Math.sqrt((2 * (y0 - 0.01)) / 9.8));
      cover.position.set(0.12 * fall, y0 - 4.9 * fall * fall - PANEL_AT.y, z0 + 0.5 * fall - PANEL_AT.z);
      cover.rotation.set(-0.3 - 1.27 * clamp(fall / 0.45), 0.4 * fall, 0);
    }
    const mod = pan.module;
    const rip = seg(t, T.rip - 0.05, T.rip + 0.12);
    const hang = seg(t, T.rip + 0.35, T.rip + 0.75);
    const sway = t > T.rip + 0.6 ? 0.25 * Math.exp(-(t - T.rip - 0.6) * 2.5) * Math.sin((t - T.rip) * 6) : 0;
    mod.position.set(0.05 * rip - 0.015 * hang + sway * 0.1, 0.02 - 0.07 * rip - 0.22 * hang, -0.01 + 0.31 * rip - 0.19 * hang);
    mod.rotation.set(0.5 * hang, 0.35 * hang, 1.25 * hang + sway);
    pan.stretch();
    // its light: green, then a few red stutters as it dies, then dark
    const dead = t > T.rip;
    pan.led.color.setHex(!dead ? 0x3dff6a : t < T.rip + 0.7 && Math.sin(t * 47) > 0.2 ? 0xff3a2a : 0x150606);

    // the sparks, bursting at their moments (each once)
    this._bursts ||= [
      [T.cut, LUG, v3(-1, 0.3, 0.2), 26, 2.6, 1.0], [T.cut + 0.18, LUG, v3(-1, 0.5, -0.3), 10, 1.8, 0.5],
      [T.coverOff, PANEL_AT, v3(0, 0.3, 1), 10, 1.6, 0.6], [T.module + 0.08, PANEL_AT, v3(0, 0.2, 1), 6, 1.2, 0.4],
      [T.rip, PANEL_AT, v3(0.2, 0.3, 1), 32, 2.8, 1.2], [T.rip + 0.16, PANEL_AT, v3(-0.3, 0.6, 1), 14, 2.0, 0.7],
      [T.rip + 0.45, PANEL_AT, v3(0.1, 0.1, 1), 8, 1.5, 0.5], [T.rip + 1.1, PANEL_AT, v3(0, 0, 1), 5, 1.2, 0.3]
    ].map((b) => ({ t: b[0], at: b[1], dir: b[2].normalize(), n: b[3], speed: b[4], flash: b[5], done: false }));
    this._flash = (this._flash || 0) * Math.exp(-dt * 14);
    for (const b of this._bursts) {
      if (b.done || t < b.t) continue;
      b.done = true;
      if (t > b.t + 0.3) continue;                      // (skipped past)
      this.sparks.burst(this._v.copy(b.at).addScaledVector(b.dir, 0.06), b.dir, b.n, b.speed);
      this.sparkLight.position.copy(b.at).addScaledVector(b.dir, 0.3);
      this._flash = Math.max(this._flash, b.flash);
      this._sparkSound(b.flash);
    }
    this.sparkLight.intensity = 6 * this._flash;
    this.sparks.update(dt);
  }

  // ------------------------------------------------------------------ sound
  _startSound() {
    const ac = this.ac;
    if (!ac) return;
    ac.resume?.().catch(() => {});
    const at = ac.currentTime + 0.08;
    this._t0 = at;
    const T = this.T, L = T.line;
    this._sources = [];
    this.analysers = new Map();
    const bus = voiceBus(ac, ac.destination, settings.get('voice'));
    const voice = bus.input;
    this._voice = bus.output;
    const fx = (this._fx = ac.createGain());
    fx.gain.value = settings.get('effects');
    fx.connect(ac.destination);
    // through the door: muffled
    const glass = ac.createBiquadFilter();
    glass.type = 'lowpass';
    glass.frequency.value = 1300;
    glass.connect(voice);
    const far = ac.createBiquadFilter();
    far.type = 'lowpass';
    far.frequency.value = 800;
    far.connect(voice);
    for (const l of LINES) {
      const buffer = this.buffers.get(l.id);
      if (!buffer) continue;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const out = l.far ? far : l.glass ? glass : voice;
      if (l.who !== 'voss') {
        // through an analyser, for the mouth
        const an = ac.createAnalyser();
        an.fftSize = 1024;
        an.smoothingTimeConstant = 0.3;
        src.connect(an);
        this.analysers.set(l.id, an);
      }
      const gain = ac.createGain();
      gain.gain.value = dbGain(VOICE_GAIN_DB[l.id] ?? 0);
      src.connect(gain).connect(out);
      src.start(at + L[l.id][0]);
      this._sources.push(src);
    }

    // the effects, each at its moment
    const play = (name, when, { vol = 1, rate = 1, lp = 0, out = fx, loop = false, offset = 0 } = {}) => {
      const b = this.fx.get(name);
      if (!b) return null;
      const src = ac.createBufferSource();
      src.buffer = b;
      src.loop = loop;
      src.playbackRate.value = rate;
      const g = ac.createGain();
      g.gain.value = vol;
      let node = src;
      if (lp) {
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = lp;
        node = node.connect(f);
      }
      node.connect(g).connect(out);
      src.start(at + Math.max(0, when), offset);
      this._sources.push(src);
      return { src, gain: g };
    };
    // the engines' hum: the room's file, and a low tone under it; at the cut both run down and die.
    // Barely there (it sounded like rushing air over Kessler's lines)
    const HUM = 0.05, LOW = 0.03;
    const hum = play('machine-hum', 0, { vol: HUM, loop: true, lp: 1600 });
    const hz = ac.createGain();
    hz.gain.value = LOW;
    hz.connect(fx);
    for (const [f, type, g] of [[50, 'sine', 0.7], [100, 'triangle', 0.25], [150, 'sine', 0.12]]) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, at);
      o.frequency.setValueAtTime(f, at + T.cut);
      o.frequency.exponentialRampToValueAtTime(f * 0.3, at + T.cut + 2.8);
      const og = ac.createGain();
      og.gain.value = g;
      o.connect(og).connect(hz);
      o.start(at);
      o.stop(at + T.cut + 3.2);
      this._sources.push(o);
    }
    hz.gain.setValueAtTime(LOW, at + T.cut);
    hz.gain.exponentialRampToValueAtTime(0.0005, at + T.cut + 2.8);
    if (hum) {
      hum.src.playbackRate.setValueAtTime(1, at + T.cut);
      hum.src.playbackRate.exponentialRampToValueAtTime(0.35, at + T.cut + 2.6);
      hum.gain.gain.setValueAtTime(HUM, at + T.cut);
      hum.gain.gain.exponentialRampToValueAtTime(0.001, at + T.cut + 2.6);
    }
    // the wrench, the feed parting: a heavy clunk, relays clicking as the lights go
    play('ratchet-1', T.heave[0] + 0.1, { vol: 0.6, rate: 0.7 });
    play('ratchet-2', T.cut - 0.3, { vol: 0.5, rate: 0.6 });
    play('clank-1', T.cut, { vol: 1, rate: 0.6 });
    play('metal-bang-2', T.cut + 0.02, { vol: 0.8, rate: 0.55, lp: 1800 });
    this._thump(at + T.cut, 0.9);
    for (const d of [0.12, 0.38, 0.7, 1.0]) play('click', T.cut + d, { vol: 0.35, rate: 0.7 + d * 0.3 });
    // a thin electrical buzz from the console: it is still there when the hum has gone
    const buzz = ac.createOscillator();
    buzz.type = 'sawtooth';
    buzz.frequency.value = 120;
    const bf = ac.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 900;
    bf.Q.value = 4;
    const bg = ac.createGain();
    bg.gain.value = 0.0;
    bg.gain.setValueAtTime(0.0, at + T.cut + 1.5);
    bg.gain.linearRampToValueAtTime(0.012, at + T.cut + 3.5);
    bg.gain.setValueAtTime(0.012, at + T.rush);
    bg.gain.linearRampToValueAtTime(0.0, at + T.shut);
    buzz.connect(bf).connect(bg).connect(fx);
    buzz.start(at);
    this._sources.push(buzz);
    // the door: its creak as he swings it, the slam, the latch; later, the seal
    play('door-creak-1', T.swing[0] - 0.05, { vol: 0.7, rate: 0.75 });
    play('slam', T.shut, { vol: 1 });
    play('metal-bang-1', T.shut + 0.01, { vol: 0.8, rate: 0.6 });
    play('latch', T.shut + 0.08, { vol: 0.6, rate: 0.8 });
    this._thump(at + T.shut, 1);
    play('metal-bang-3', T.coverOff, { vol: 0.5, rate: 1.4 });
    play('clank-2', T.coverOff + 0.25 + Math.sqrt((2 * (PANEL_AT.y - 0.07)) / 9.8), { vol: 0.45, rate: 1.3 });
    play('click', T.rip + 0.05, { vol: 0.5, rate: 0.6 });
    play('air-hiss', T.seal, { vol: 0.5, rate: 0.7, lp: 2500 });
    play('seal', T.seal + 0.15, { vol: 0.45, rate: 0.75 });
    // fists on the glass: dull thuds and a rattle
    for (const p of this.pounds) {
      play('punch', p, { vol: 0.55, rate: 0.55 + Math.random() * 0.1, lp: 600 });
      this._thump(at + p, 0.45);
    }
    // the water, faint and muffled, behind the door at the end (loudest as he stands still)
    const water = play('water-pour', L.p5[0] - 0.6, { vol: 0.0, lp: 450 });
    if (water) {
      water.gain.gain.setValueAtTime(0.0, at + L.p5[0] - 0.6);
      water.gain.gain.linearRampToValueAtTime(0.2, at + T.stop[0] + 0.4);
      water.gain.gain.linearRampToValueAtTime(0.0, at + T.end);
    }
    // after the lock: his heart, fast, and his breath, ragged (in and out, uneven), dying down
    const beat = this._gainTo(fx, 0.55);
    for (let b = T.rip + 0.25, i = 0; b < T.shake[1] + 0.6; i++) {
      heartbeat(ac, beat, at + b);
      b += 0.5 + 0.12 * seg(b, T.shake[0], T.shake[1]) + ((i * 7919) % 5) * 0.012;
    }
    for (let b = T.rip + 0.15, i = 0; b < T.watch + 0.8; i++) {
      const fade = 1 - 0.6 * seg(b, T.shake[0] + 1.0, T.watch + 0.8);
      this._breath(at + b, 0.42, 1250, 0.07 * fade);                    // in
      this._breath(at + b + 0.5, 0.55, 750, 0.085 * fade);              // out
      b += 1.25 + ((i * 7919) % 7) * 0.05 + 0.3 * seg(b, T.shake[0], T.watch);
    }
  }

  _gainTo(out, value) {
    const g = this.ac.createGain();
    g.gain.value = value;
    g.connect(out);
    return g;
  }

  // a breath: a puff of noise through a band, swelling and dying (seconds long, at the band's Hz)
  _breath(when, length, hz, vol) {
    const ac = this.ac;
    if (!this._noise) {
      const n = (this._noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate));
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ac.createBufferSource();
    src.buffer = this._noise;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = hz;
    f.Q.value = 0.9;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol, when + length * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, when + length);
    src.connect(f).connect(g).connect(this._fx);
    src.start(when, Math.random() * 0.4, length + 0.05);
    this._sources.push(src);
  }

  // a low, heavy thud (felt more than heard)
  _thump(when, size) {
    const ac = this.ac;
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(70, when);
    o.frequency.exponentialRampToValueAtTime(32, when + 0.2);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.6 * size, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.3);
    o.connect(g).connect(this._fx);
    o.start(when);
    o.stop(when + 0.35);
    this._sources.push(o);
  }

  _sparkSound(size) {
    if (!this.ac || !this._fx || !this.running) return;
    crackle(this.ac, this._fx, this.ac.currentTime + 0.005, size);
  }

  // his footsteps: one each time a foot comes down (twice in a walk's cycle)
  _steps(t) {
    const v = this.voss;
    if (!this.running || !this.ac || !this._fx) return;
    const phase = Math.floor((v.walk.time / v.walk.getClip().duration) * 2);
    if (phase !== this._stepPhase) {
      const fresh = this._stepPhase !== undefined;
      this._stepPhase = phase;
      if (fresh && v.speed > 0.3) this._footstep(Math.min(1, v.speed / 1.2));
    }
  }

  _footstep(size) {
    const ac = this.ac, when = ac.currentTime + 0.005;
    this._thump(when, 0.18 * size);
    const b = this.fx.get('punch');
    if (!b) return;
    const src = ac.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = 1.6 + Math.random() * 0.2;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = ac.createGain();
    g.gain.value = 0.12 * size;
    src.connect(f).connect(g).connect(this._fx);
    src.start(when);
  }

  _stopSound() {
    const ac = this.ac;
    if (!ac || !this._sources) return;
    const now = ac.currentTime;
    this._voice?.gain.setTargetAtTime(0, now, 0.05);
    this._fx?.gain.setTargetAtTime(0, now, 0.05);
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
    if (this.scene) {
      for (const c of this.creases || []) c.dispose();
      this.creases = null;
      this.scene.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); });
      for (const p of [...Object.values(this.people), this.voss]) {
        p.mixer.stopAllAction();
        p.mixer.uncacheRoot(p.model);
      }
      // the crew's buffers and textures (their files stay cached: three uploads them again if
      // they are drawn again)
      for (const n of CREW) {
        this.src[n].model.traverse((o) => {
          if (!o.isMesh) return;
          o.geometry.dispose();
          // (all of them: their toon ramp too, which each load makes)
          for (const v of Object.values(o.material)) if (v?.isTexture) v.dispose();
        });
        this.src[n].dispose();
      }
      this.panel.dispose();
      this.sparks.dispose();
      for (const g of this._geos) g.dispose();
      for (const m of this._mats) m.dispose();
      for (const x of this._textures) x.dispose();
      this.target.dispose();
      this.post.geometry.dispose();
      this.post.material.dispose();
      this.scene.clear();
      this.scene = null;
      this.people = null;
      this.faces = null;
    }
    this.ac?.close?.().catch(() => {});
    this.ac = null;
    this.buffers = null;
    this.analysers = null;
    this.ready = false;
    this._loading = null;
  }
}

// texture co-ordinates from the world position, by which way each face looks (2 m a tile)
function planarUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let a, b;
    if (ay >= ax && ay >= az) { a = p.getX(i); b = p.getZ(i); }
    else if (ax >= az) { a = p.getZ(i); b = p.getY(i); }
    else { a = p.getX(i); b = p.getY(i); }
    uv[i * 2] = a * 0.5;
    uv[i * 2 + 1] = b * 0.5;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
