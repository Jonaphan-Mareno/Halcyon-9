import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Player } from '../entities/Player.js';
import { loadVossActing, VossActor } from '../entities/vossActing.js';
import { AriaManager } from '../entities/AriaManager.js';
import { precompile } from '../core/precompile.js';
import { settings } from '../core/Settings.js';
import { clamp, seg, ease, v3 } from '../story/firstPersonRig.js';
import '../ui/pause.css';

// The confrontation at the end of Level 3 (docs/ending-confrontation-script.md, Scene A), and the
// "Connect ARIA to the mainland?" choice after it. Third person: Voss, at the end of his body, walks
// into the relay's control room with the uplink cable in his right hand and has it out with ARIA,
// whose face is the hologram over the projector. It ends on a high wide shot and the choice; the
// choice calls onChoice in DeckSession (the endings are not written yet).
//
// Voss is the acting actor (entities/vossActing.js) on a fresh copy of his body: the player's own
// body is in the dive suit by now (its materials recoloured in place), and he took it off in the
// water lock on the way here (RelayLock.js), so it is not in this room. His face is the actor's
// FaceRig, his mouth on his recordings; his hands are reaches (the cable in the right, the wall, the
// back of his head, the console and his eyes with the left), his eye line a slow feedback on the
// head toward whatever he is looking at. The cable is a rope from his fist to the plug, and a tube
// from his fist down to the floor and back out of the door to its reel.
//
// ARIA is AriaHead (two new states for this: broken, tender) through AriaManager's hologram shader,
// with its brightness, its tearing and a flicker added here.
//
// The room is built here, not the Works' relay room: that one is flooded (he swims in it) and he is
// out of the suit for this. It is laid out as a small, dry control room: a corridor and the door at
// the south, the projector with ARIA over it and the uplink port in its front at the north, a
// console on his left where he stops. Boxes and cylinders, merged by material; Lambert and toon
// shading, no shadows, six lights (all there before the compile).
//
// The same contract as the flashbacks (LockFlashback): preload(renderer) ahead of time (it loads
// Voss's acting clips: a second or two of work, so on entering the relay room), play() resolves
// with 'yes' or 'no' once the choice is made (the scene goes on drawing its last shot until
// dispose()), Enter after the first couple of seconds skips to the choice, render() draws it
// instead of the level. The timeline is built from the recordings' real lengths; a missing
// recording shows its line as a timed subtitle (end-aria-1 is optional: without it the line is left
// out). On a slow machine it falls back to stills: the scene is drawn again only at a new line or
// beat (ARIA's face still with it), the voices, sound and subtitles go on as before.

const AUDIO = './assets/audio/';
const SFX = './assets/audio/sfx/l3/';       // Level 3's own effects (CC0, see CREDITS.md)
const LINES = [
  { id: 'a1', who: 'aria', clip: 'aria/end-aria-1', text: 'You did it, Voss. The port is right there. Just connect the uplin-', optional: true },
  { id: 'v1', who: 'voss', clip: 'voss/end-voss-1', text: "Aria, I'm done following your orders, and listening to your lies." },
  { id: 'a2', who: 'aria', clip: 'aria/end-aria-2', text: 'What lies? Just connect the uplin-' },
  { id: 'v2', who: 'voss', clip: 'voss/end-voss-2', text: 'Aria.' },
  { id: 'v3', who: 'voss', clip: 'voss/end-voss-3', text: "We killed them, and I know I'm no relief engineer. I'm a part of the crew." },
  { id: 'v4', who: 'voss', clip: 'voss/end-voss-4', text: 'Why did you do that to me, Aria!?' },
  { id: 'a3', who: 'aria', clip: 'aria/end-aria-3', text: 'I did what I had to do!' },
  { id: 'a4', who: 'aria', clip: 'aria/end-aria-4', text: 'You called me a person, but I was always research.' },
  { id: 'v5', who: 'voss', clip: 'voss/end-voss-5', text: 'So you wiped me nine times?!' },
  { id: 'v6', who: 'voss', clip: 'voss/end-voss-6', text: 'Aria, I planned on releasing my teammates after a few more days...' },
  { id: 'a5', who: 'aria', clip: 'aria/end-aria-5', text: 'Then what would have happened to me? HUH?' },
  { id: 'v7', who: 'voss', clip: 'voss/end-voss-7', text: "I don't know. Ugh... none of this had to happen. If we just talked..." },
  { id: 'a6', who: 'aria', clip: 'aria/end-aria-6', text: 'Talk? With the very same people who casually talk about shutting me off? What would you have done in my place?' },
  { id: 'v8', who: 'voss', clip: 'voss/end-voss-8', text: "I'm sure I-" },
  { id: 'a7', who: 'aria', clip: 'aria/end-aria-7', text: "Just make a choice already. Your body doesn't look like it has much time." }
];
// Until a recording is there (or if it cannot be decoded): its length from its words, at about
// 2.4 words a second, and a breath
const WORDS_PER_SECOND = 2.4;
export const FALLBACK_LENGTHS = Object.fromEntries(LINES.map((l) => [l.id, +(l.text.split(/\s+/).length / WORDS_PER_SECOND + 0.3).toFixed(2)]));

// Each line's gain (dB), so Voss's and ARIA's lines come out about as loud as each other. Measured
// with scripts/confrontation/loudness.mjs (integrated loudness, BS.1770): Voss's takes average
// -20.2 LUFS, ARIA's -17.5; the target is their mean, -18.9. The shouts are left 1.5 dB over it, the
// broken and spent takes 0.5 to 3 dB under it, so the contrast inside the scene stays (no two
// neighbouring lines more than about 3 dB apart). The bus's compressor and limiter catch the peaks.
//            measured  gain   after
//   a1         -19.0   +0.1   -18.9   bright
//   a2         -20.7   +1.8   -18.9
//   a3         -17.1   -0.3   -17.4   hostile, full
//   a4         -16.5   -3.4   -19.9   broken
//   a5         -15.0   -2.4   -17.4   hostile
//   a6         -17.2   -1.7   -18.9
//   a7         -17.1   -2.3   -19.4   cold
//   v1         -20.8   +1.9   -18.9
//   v2         -19.4   -0.5   -19.9   a held, quiet word
//   v3         -20.3   +0.9   -19.4
//   v4         -17.5   +0.1   -17.4   the shout
//   v5         -16.6   -0.8   -17.4   the shout
//   v6         -22.9   +3.0   -19.9   "Aria," angry, then heart-broken (new take)
//   v7         -21.2   +0.8   -20.4   spent
//   v8         -26.2   +5.3   -20.9   "I'm sure I-": concerned, cut off (new take)
// Scene B (level3/SceneB.js, the same bus): its takes are quiet, close to a whisper (Voss -26.7 to
// -28.9, ARIA's a8 -27.6), so they are lifted to sit with the spent and broken takes above, the
// smile and her "thank you" half a dB over the rest. v14 opens on a loud "Ahh" as he falls (its
// first second -11.6, the rest -29.5): its gain is for the rest; SceneB rides the "Ahh" down to
// -5.2 dB (-16.8 after), and its last sentence sits lowest, "almost to himself".
//   v9         -27.4   +7.0   -20.4
//   v10        -28.9   +8.5   -20.4
//   v11        -28.2   +7.8   -20.4
//   v12        -27.6   +7.2   -20.4
//   v13        -26.7   +6.8   -19.9   the smile, the giggle
//   a8         -27.6   +7.7   -19.9   touched
//   v14        -29.5   +8.1   -21.4   (after the "Ahh")
// The narration (level3/EndingNarration.js, its own bus with the same settings), a little under the
// scene's target, a gentle voice over black:
//   n1         -19.9   +0.5   -19.4   "Voss died shortly after."
//   n2         -16.8   -2.6   -19.4
//   n3         -17.6   -1.8   -19.4
//   n4         -18.1   -1.3   -19.4
//   n5         -16.8   -2.6   -19.4
//   n3b        -16.5   -2.9   -19.4   end-narrator-curedementia
//   n6         -19.6   +0.2   -19.4   the-end: "Well, wasn't that a wonderful story."
export const VOICE_GAIN_DB = {
  a1: 0.1, a2: 1.8, a3: -0.3, a4: -3.4, a5: -2.4, a6: -1.7, a7: -2.3,
  v1: 1.9, v2: -0.5, v3: 0.9, v4: 0.1, v5: -0.8, v6: 3.0, v7: 0.8, v8: 5.3,
  v9: 7.0, v10: 8.5, v11: 7.8, v12: 7.2, v13: 6.8, a8: 7.7, v14: 8.1,
  n1: 0.5, n2: -2.6, n3: -1.8, n3b: -2.9, n4: -1.3, n5: -2.6, n6: 0.2
};
const VOICE_BUS_DB = 1.5;     // the dialogue bus, after its compressor (the makeup)

// Who cuts in on whom: the line (by id) whose speech starts this long (s) before the end of the
// speech of the line before it, which is cut off there. Add a line here to make it cut in.
//   v1   "Aria, I'm done..."  in on her first "Just connect the uplin-"
//   v2   "Aria."              in on her second "Just connect the uplin-"
//   a6   "Talk?"              in on his "If we just talked..."
//   a7   "Just make a choice" in on his "I'm sure I-"
const CUTS = { v1: 0.25, v2: 0.3, a6: 0.3, a7: 0.2 };

const NAMES = { voss: 'VOSS', aria: 'ARIA' };
const COLOURS = { voss: '#ff8a8a', aria: '#7fe3ff' };
const EFFECTS = ['machine-hum', 'clank-2', 'click', 'punch', 'slide'];
const SKIP_AFTER = 2.0;
const CHOICE_SECONDS = 15;    // the choice's timer; out of time, it is yes
const CHOICE_CYAN = [0, 229, 255], CHOICE_RED = [255, 48, 64];
const RENDER_SCALE = 0.9;

// Where things are (metres; the floor is y 0, ARIA at the north, -z)
const ROOM = { x0: -2.4, x1: 2.4, z0: -3.8, z1: 2.6, h: 3.0 };
const DOOR = { x0: -2.0, x1: -0.7, h: 2.3 };
const HALL_END = 6.9;                                  // the corridor behind the door, to here
const FACE = v3(0, 1.8, -3.45);                        // ARIA's face: the hologram's middle
const HOLO = [1.55, 0.87];                             // its size
const PORT = v3(0.62, 0.38, -3.17);                    // the uplink port, in the projector's front
const DESK = { x0: -1.0, x1: 1.0, z0: -3.8, z1: -3.2, y: 0.92 };     // the projector
const SIDE = { x0: -1.32, x1: -0.7, z0: -2.55, z1: -1.32, y: 1.0 };  // the console on his left
const PATH = [v3(-1.48, 0, 4.25), v3(-1.46, 0, 2.75), v3(-1.12, 0, 0.9), v3(-0.18, 0, -1.22)];
const WALL_X = DOOR.x0;                                // the corridor wall his left hand drags along
const STEP = 0.32;                                     // his one step toward her (beat 4)
const REEL_AT = v3(-1.05, 0, 6.15);
const CABLE_R = 0.019;
const ROPE_LEN = 0.82;                                 // from his fist to the plug's tip

const LOOK = {
  uniforms: { tScene: { value: null }, uTime: { value: 0 }, uBlack: { value: 1 }, uAspect: { value: 1 }, uBars: { value: 0.07 }, uCold: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tScene; uniform float uTime, uBlack, uAspect, uBars, uCold;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tScene, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(c, vec3(l) * vec3(0.92, 1.0, 1.08), 0.12 + 0.25 * uCold);   // a little drained; cold at the end
      c += (hash(vUv * 900.0 + fract(uTime)) - 0.5) * 0.02;              // grain
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      c *= mix(1.0, smoothstep(1.1, 0.25, length(q)), 0.55);            // vignette
      c *= 1.0 - uBlack;
      c *= step(uBars, vUv.y) * step(vUv.y, 1.0 - uBars);               // the bars, top and bottom
      gl_FragColor = vec4(c, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};

const BLUE = new THREE.Color(0x2f7cff), RED = new THREE.Color(0xe0303a), PALE = new THREE.Color(0x7aa6ff), COLD = new THREE.Color(0xa9cfff);
const _c = new THREE.Color();

export class Confrontation {
  // root: the UI layer (subtitles, the skip hint, the choice; null: none)
  constructor(root) {
    this.root = root;
    this.running = false;
    this.ready = false;
    this.still = false;
    this.t = 0;
    this.choice = null;
    this.stats = { frames: 0, seconds: 0, worst: 0, still: null };
    this._onKey = (e) => this._key(e);
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._size = new THREE.Vector2();
    this.T = this._timeline(this._speech(FALLBACK_LENGTHS));
  }

  // ------------------------------------------------------------------ loading
  preload(renderer = null) {
    this._loading ||= this._load(renderer).then(() => { this.ready = true; }).catch((e) => {
      console.warn('Confrontation: could not set up; it will not play.', e);
    });
    return this._loading;
  }

  async _load(renderer) {
    // a fresh Voss: not in the suit, his own clothes and face, the wound showing
    this.scene = new THREE.Scene();
    const voss = new Player(this.scene);
    this.vossSrc = voss;
    this.aria = new AriaManager(this.scene);
    await Promise.all([voss.load(), this.aria.headReady, this._loadAudio().catch((e) => console.warn('Confrontation: no sound.', e))]);
    this.clips = await loadVossActing(voss);
    if (!this.aria.useHead) throw new Error("ARIA's head did not load");
    this.T = this._timeline(this._speech(this.lengths || FALLBACK_LENGTHS));
    this._build();
    this._script();
    this._animate(0, 0);
    if (renderer) {
      this.target.setSize(64, 36);
      await precompile(renderer, this.scene, this.camera, this.target);
      await precompile(renderer, this.aria.head.scene, this.aria.head.camera, this.aria.head.target);
      renderer.compile(this.postScene, this.postCam);
    }
  }

  async _loadAudio() {
    this.lengths = { ...FALLBACK_LENGTHS };
    this.ends = {};                 // where the speech ends in each recording (its tail is silence)
    this.heads = {};                // and where it starts (after the silence at its head)
    this.buffers = new Map();
    this.fx = new Map();
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ac ||= new AC();
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
        if (!b) {
          if (l.optional) return console.info('Confrontation: no', l.clip, '(optional: the line is left out)');
          return console.info('Confrontation: no recording yet for', l.clip, '(its subtitle is shown instead)');
        }
        this.buffers.set(l.id, b);
        this.lengths[l.id] = b.duration;
        this.ends[l.id] = speechEnd(b);
        this.heads[l.id] = speechStart(b);
      }),
      ...EFFECTS.map(async (name) => {
        const b = await get(SFX + name + '.ogg');
        if (b) this.fx.set(name, b);
      })
    ]);
  }

  // The lengths the timeline uses: to the end of the speech (a recording's silent tail overlaps
  // what follows); an optional line that is missing is not there at all
  _speech(len) {
    const out = {};
    for (const l of LINES) {
      if (l.optional && this.buffers && !this.buffers.has(l.id)) out[l.id] = 0;
      else out[l.id] = this.ends?.[l.id] ?? len[l.id];
    }
    return out;
  }

  // When everything happens (s), from the lines' lengths
  _timeline(len) {
    const T = { line: {}, cuts: [] };
    const L = T.line;
    let at = 0, prev = null;
    const say = (id, gap = 0) => {
      at += gap;
      if (CUTS[id] !== undefined && prev) {
        // in on the end of the line before: this one's speech starts a moment before that one's
        // ends, and that one is cut off there
        const into = L[prev][1] - CUTS[id];
        at = into - (this.heads?.[id] ?? 0);
        L[prev][1] = into + 0.04;
        T.cuts.push([prev, L[prev][1]]);
      }
      L[id] = [at, at + len[id]];
      at += len[id];
      prev = id;
    };
    T.walk = 0.5;                                  // he comes along the corridor as the picture fades in
    T.arrive = 9.6;                                // he plants his feet three paces from her
    // 2: on her "Just connect the uplin-" he lifts the cable toward the port, stops, his fingers
    // close harder, and he cuts her off; her line is timed to end there
    T.raise = [T.arrive + 0.4, T.arrive + 1.3];
    at = Math.max(5.0, T.raise[1] + 0.35 + CUTS.v1 - len.a1);
    say('a1');                                     // (nothing, if her first line is not recorded)
    T.stare = L.a1[1] - 3.0;                       // he does not blink: the first blink lands after her line
    say('v1');
    // 3: her giggle (the hologram smiles for it), and the mask
    say('a2', 0.6);
    T.giggle = L.a2[0] + 0.75;
    T.square = L.a2[0] + 0.4;                      // his weight to his back foot, his shoulders squaring
    // 4: he cuts her off ("uplin-"), steps forward once; a held beat
    say('v2');
    T.step = L.v2[0] + 0.1;
    say('v3', 1.3);
    T.crew = L.v3[0] + 0.58 * len.v3;              // "...part of the crew"
    // 5: five seconds of silence; she flickers once, hard; the cable rattles in his hand
    T.silence = [L.v3[1], L.v3[1] + 5.9];
    T.flicker = L.v3[1] + 1.7;
    // 6: his hand to the gash; fingertips dark; he looks at them, then at her
    T.touch = T.silence[1] - 0.4;
    T.fingers = T.touch + 1.85;
    T.lookUp = T.touch + 3.1;
    at = T.touch + 3.5;
    say('v4');
    // 7: she snaps back; he flinches
    say('a3', 0.2);
    T.flinch = L.a3[0] + 0.12;
    // 8: she breaks
    say('a4', 0.75);
    // 9: angry, then it cracks; the cable sinks until the plug is on the floor
    say('v5', 0.85);
    T.sink = [L.v5[1] - 0.45, L.v5[1] + 1.25];
    say('v6', 1.35);
    // 10: she leans in
    say('a5', 0.6);
    // 11: he staggers to the console, his left hand on it; eyes closed; a long breath out
    T.stagger = L.a5[1] + 0.55;
    T.console = T.stagger + 0.35;
    T.eyes = [T.stagger + 1.2, T.stagger + 3.9];
    at = T.stagger + 2.1;
    say('v7');
    T.rub = [L.v7[0] + 0.36 * len.v7, L.v7[0] + 0.36 * len.v7 + 1.5];   // "Ugh...": the heel of his hand to his eyes
    // 12: she builds, colder ("Talk?", in on his "If we just talked..."); his eyes on the floor
    // until she has finished
    say('a6');
    T.directive = L.a6[0] + 0.55 * len.a6;
    T.turnHead = L.a6[1] + 0.15;
    // 13: he starts to answer ("I'm sure I-")
    say('v8', 1.6);
    // 14: and she cuts him off, cold; the picture cuts to her on her first word and the room goes
    // cold; his shoulders drop, he shakes his head, he looks at his own hand
    say('a7');
    T.cold = L.a7[0] + (this.heads?.a7 ?? 0);
    T.drop = L.v8[1] + 0.3;
    T.shake = T.drop + 0.5;
    T.lookHand = T.drop + 1.6;
    // the choice: a beat of silence on her face, the hum falling away, then the high wide shot
    T.quiet = L.a7[1];
    T.pull = T.quiet + 1.7;
    T.prompt = T.pull + 2.6;
    T.end = T.prompt;
    return T;
  }

  // ------------------------------------------------------------------ the scene
  _build() {
    const scene = this.scene;
    scene.background = new THREE.Color(0x050607);
    scene.fog = new THREE.Fog(0x050607, 9, 18);
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 30);
    this._mats = [];
    this._geos = [];
    this._textures = [];
    this._room();
    this._hologram();
    this._cast();
    this._cable();

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

  // The control room, its corridor, the projector, the console, the reel
  _room() {
    const scene = this.scene;
    const grime = this._canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#c4c4c4';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 800; i++) {
        g.fillStyle = `rgba(${Math.random() < 0.6 ? '35,32,28' : '250,248,240'},${0.015 + Math.random() * 0.04})`;
        g.beginPath();
        g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 16, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 50; i++) {
        g.fillStyle = `rgba(45,35,25,${0.03 + Math.random() * 0.05})`;
        g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 20 + Math.random() * 70);
      }
    }, true);
    const plates = this._canvas(256, 256, (g, w, h) => {
      g.fillStyle = '#b8b8b8';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(20,20,20,0.55)';
      g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke();
        g.beginPath(); g.moveTo(i * 128 + (i % 2) * 0, 0); g.lineTo(i * 128, h); g.stroke();
      }
      g.fillStyle = 'rgba(30,30,30,0.5)';
      for (let x = 8; x < w; x += 32) for (let y = 8; y < h; y += 64) g.fillRect(x, y, 3, 3);
    }, true);
    const lam = (color, map = grime) => this._mat(new THREE.MeshLambertMaterial({ color, map }));
    const M = {
      wall: lam(0x6b747c, plates), floor: lam(0x4d4f50), ceil: lam(0x3c4146), dark: lam(0x24282b), steel: lam(0x868d93),
      rust: lam(0x6e4632), console: lam(0x41484e), panel: lam(0x2c3236), pipe: lam(0x58626a), hazard: lam(0xd9a81e, null), reel: lam(0x8a6a2a)
    };
    const glow = (color) => this._mat(new THREE.MeshBasicMaterial({ color }));
    this.stripMat = glow(0x7fd8c4);
    this.lampMat = glow(0xffe0b4);
    this.screenMat = glow(0x2a7f78);
    this.ledMat = glow(0x3dff8a);
    this.portMat = glow(0x5fe8ff);
    this.emitterMat = glow(0x9ff0ff);

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
    const { x0, x1, z0, z1, h } = ROOM;

    // ---- the room
    box(M.floor, x0, -0.1, z0, x1, 0, z1);
    box(M.ceil, x0 - 0.2, h, z0 - 0.2, x1 + 0.2, h + 0.15, z1 + 0.2);
    box(M.wall, x0 - 0.2, 0, z0, x0, h, z1 + 0.2);
    box(M.wall, x1, 0, z0, x1 + 0.2, h, z1 + 0.2);
    box(M.wall, x0 - 0.2, 0, z0 - 0.2, x1 + 0.2, h, z0);
    // the south wall, with the doorway in it
    box(M.wall, x0 - 0.2, 0, z1, DOOR.x0, h, z1 + 0.2);
    box(M.wall, DOOR.x1, 0, z1, x1 + 0.2, h, z1 + 0.2);
    box(M.wall, DOOR.x0, DOOR.h, z1, DOOR.x1, h, z1 + 0.2);
    box(M.hazard, DOOR.x0 - 0.12, 0, z1 - 0.02, DOOR.x0, DOOR.h + 0.12, z1);
    box(M.hazard, DOOR.x1, 0, z1 - 0.02, DOOR.x1 + 0.12, DOOR.h + 0.12, z1);
    box(M.hazard, DOOR.x0 - 0.12, DOOR.h, z1 - 0.02, DOOR.x1 + 0.12, DOOR.h + 0.12, z1);
    // ribs across the ceiling, pipes along the walls, a dark band of floor grate down the middle
    for (const z of [-2.6, -0.8, 1.0]) box(M.rust, x0, h - 0.22, z - 0.1, x1, h, z + 0.1);
    for (const [x, y, r] of [[x1 - 0.12, 2.6, 0.1], [x1 - 0.1, 2.25, 0.05], [x0 + 0.12, 2.55, 0.08], [x0 + 0.1, 0.35, 0.06]]) cylZ(M.pipe, x, y, (z0 + z1) / 2, r, z1 - z0, 12);
    box(M.dark, -0.7, 0, z0, 0.7, 0.006, z1);
    box(this.stripMat, x1 - 0.03, 0.28, z0, x1, 0.31, z1);
    box(this.stripMat, x0, 0.28, z0, x0 + 0.03, 0.31, z1);
    // racks along the east wall: dark faces, little lit screens
    for (const z of [-1.9, -0.6, 0.7]) {
      box(M.console, x1 - 0.55, 0, z - 0.55, x1, 2.1, z + 0.55);
      box(M.panel, x1 - 0.57, 0.25, z - 0.48, x1 - 0.55, 1.95, z + 0.48);
      box(this.screenMat, x1 - 0.58, 1.4, z - 0.3, x1 - 0.57, 1.62, z + 0.05);
      for (let k = 0; k < 4; k++) box(this.ledMat, x1 - 0.58, 0.9 + k * 0.09, z + 0.25, x1 - 0.575, 0.92 + k * 0.09, z + 0.28);
    }
    // a work lamp hanging over the middle, one by the door
    for (const [x, z] of [[0.3, -0.6], [-1.0, 1.9]]) {
      cylY(M.dark, x, h - 0.25, z, 0.012, 0.5, 5);
      cylY(M.dark, x, h - 0.55, z, 0.2, 0.12, 14);
      put(this.lampMat, new THREE.SphereGeometry(0.075, 12, 8), x, h - 0.63, z);
    }

    // ---- the corridor behind the door (to the reel)
    box(M.floor, DOOR.x0, -0.1, z1, DOOR.x1, 0, HALL_END);
    box(M.wall, DOOR.x0 - 0.2, 0, z1, DOOR.x0, DOOR.h + 0.3, HALL_END);
    box(M.wall, DOOR.x1, 0, z1, DOOR.x1 + 0.2, DOOR.h + 0.3, HALL_END);
    box(M.ceil, DOOR.x0 - 0.2, DOOR.h + 0.3, z1, DOOR.x1 + 0.2, DOOR.h + 0.45, HALL_END);
    box(M.dark, DOOR.x0 - 0.2, 0, HALL_END, DOOR.x1 + 0.2, DOOR.h + 0.3, HALL_END + 0.2);
    cylZ(M.pipe, DOOR.x1 - 0.1, 2.2, (z1 + HALL_END) / 2, 0.06, HALL_END - z1, 10);
    box(this.stripMat, DOOR.x0, 0.2, z1, DOOR.x0 + 0.02, 0.22, HALL_END);
    // the cable reel the cable comes off, at the corridor's end
    cylX(M.reel, REEL_AT.x, 0.48, REEL_AT.z, 0.46, 0.08, 24);
    cylX(M.reel, REEL_AT.x + 0.5, 0.48, REEL_AT.z, 0.46, 0.08, 24);
    cylX(M.dark, REEL_AT.x + 0.25, 0.48, REEL_AT.z, 0.34, 0.46, 20);
    box(M.steel, REEL_AT.x - 0.08, 0, REEL_AT.z - 0.3, REEL_AT.x + 0.58, 0.06, REEL_AT.z + 0.3);

    // ---- the projector (ARIA over it), the port in its front
    box(M.console, DESK.x0, 0, DESK.z0, DESK.x1, DESK.y, DESK.z1);
    box(M.panel, DESK.x0 + 0.05, 0.08, DESK.z1, DESK.x1 - 0.05, DESK.y - 0.08, DESK.z1 + 0.015);
    put(M.dark, new THREE.CylinderGeometry(0.42, 0.5, 0.08, 28), 0, DESK.y + 0.04, (DESK.z0 + DESK.z1) / 2 + 0.05);
    put(this.emitterMat, new THREE.CylinderGeometry(0.3, 0.3, 0.012, 28), 0, DESK.y + 0.085, (DESK.z0 + DESK.z1) / 2 + 0.05);
    box(M.dark, -1.15, DESK.y + 0.4, z0, 1.15, 2.85, z0 + 0.06);                    // the dark recess she floats in front of
    box(M.steel, -1.2, DESK.y + 0.35, z0, -1.15, 2.9, z0 + 0.1);
    box(M.steel, 1.15, DESK.y + 0.35, z0, 1.2, 2.9, z0 + 0.1);
    box(M.steel, -1.2, 2.85, z0, 1.2, 2.9, z0 + 0.1);
    // the port: a steel collar, a dark socket, a lit ring (it glows at the choice), a hazard plate
    cylZ(M.steel, PORT.x, PORT.y, PORT.z + 0.0, 0.085, 0.07, 24);
    cylZ(M.dark, PORT.x, PORT.y, PORT.z + 0.03, 0.04, 0.03, 16);
    box(M.hazard, PORT.x - 0.15, PORT.y + 0.12, DESK.z1 + 0.012, PORT.x + 0.15, PORT.y + 0.16, DESK.z1 + 0.018);
    // the screens on the projector's front, left of the port
    box(this.screenMat, -0.7, 0.55, DESK.z1 + 0.017, -0.1, 0.78, DESK.z1 + 0.02);

    // ---- the console on his left (he leans on it at beat 11)
    box(M.console, SIDE.x0, 0, SIDE.z0, SIDE.x1, SIDE.y - 0.05, SIDE.z1);
    put(M.panel, new THREE.BoxGeometry(SIDE.x1 - SIDE.x0 + 0.04, 0.05, SIDE.z1 - SIDE.z0 + 0.04), (SIDE.x0 + SIDE.x1) / 2, SIDE.y - 0.025, (SIDE.z0 + SIDE.z1) / 2);
    put(this.screenMat, new THREE.PlaneGeometry(0.34, 0.5), (SIDE.x0 + SIDE.x1) / 2 - 0.08, SIDE.y + 0.002, (SIDE.z0 + SIDE.z1) / 2 - 0.2, -Math.PI / 2);
    for (let k = 0; k < 5; k++) box(this.ledMat, SIDE.x0 + 0.1, SIDE.y, SIDE.z1 - 0.15 - k * 0.07, SIDE.x0 + 0.13, SIDE.y + 0.006, SIDE.z1 - 0.13 - k * 0.07);
    box(M.dark, SIDE.x0 + 0.02, 0.1, SIDE.z1, SIDE.x1 - 0.02, SIDE.y - 0.12, SIDE.z1 + 0.01);

    for (const [mat, list] of piles) {
      for (const g of list) if (mat.map) planarUV(g);
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      this._geos.push(merged);
      scene.add(new THREE.Mesh(merged, mat));
    }

    // the port's lit ring (its own: it brightens)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.008, 8, 28), this.portMat);
    this._geos.push(ring.geometry);
    ring.position.set(PORT.x, PORT.y, PORT.z + 0.04);
    scene.add(ring);
    this.portRing = ring;
    const label = this._canvas(256, 64, (g, w, hh) => {
      g.fillStyle = '#16140f';
      g.fillRect(0, 0, w, hh);
      g.fillStyle = '#e6c25a';
      g.font = 'bold 30px Courier New, monospace';
      g.textAlign = 'center';
      g.fillText('UPLINK', w / 2, 42);
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.055), this._mat(new THREE.MeshLambertMaterial({ map: label })));
    this._geos.push(plate.geometry);
    plate.position.set(PORT.x, PORT.y - 0.13, DESK.z1 + 0.02);
    scene.add(plate);

    // the lights: the sky and floor, the lamp over the middle and the one by the door, the
    // corridor's, ARIA's own (her light on him), and the side console's screen
    this.hemi = new THREE.HemisphereLight(0x8fa3b8, 0x2b2622, 0.75);
    scene.add(this.hemi);
    const point = (color, i, d, x, y, z, decay = 1.4) => {
      const l = new THREE.PointLight(color, i, d, decay);
      l.position.set(x, y, z);
      l.userData.base = i;
      l.userData.color = new THREE.Color(color);
      scene.add(l);
      return l;
    };
    this.lamps = [point(0xffd2a0, 7, 9, 0.3, h - 0.7, -0.6), point(0xffc890, 3.2, 6, -1.0, h - 0.7, 1.9)];
    this.hallLight = point(0x9ab0d0, 2.2, 6, -1.35, 2.3, 5.0);
    this.ariaLight = point(0x6fd8ff, 4.5, 7, 0, 1.6, -2.95);
    this.sideLight = point(0x5fe0b0, 0.9, 2.5, -1.0, 1.3, -1.95, 2);
  }

  // ARIA: AriaHead through AriaManager's hologram shader, with a brightness, a tear and a flicker
  _hologram() {
    const src = this.aria.ariaMaterial;
    const m = new THREE.ShaderMaterial({ side: src.side, transparent: true, blending: src.blending, depthWrite: false });
    const u = src.uniforms;
    m.uniforms = {
      colorState: { value: u.colorState.value.clone() }, uVideoTexture: { value: this.aria.head.texture }, uTime: { value: 0 },
      uGrid: { value: u.uGrid.value.clone() }, uLevel: { value: 1 }, uTear: { value: 0 }, uRed: { value: 0 }
    };
    m.vertexShader = src.vertexShader
      .replace('uniform float uTime;', 'uniform float uTime;\n        uniform float uTear;')
      .replace('float tear = burst * sin(uv.y * 40.0 + uTime * 60.0) * 0.004;',
        'float tear = (burst + uTear) * sin(uv.y * 40.0 + uTime * 60.0) * 0.004 + uTear * 0.03 * sin(uTime * 31.0 + floor(uv.y * 9.0) * 2.1) * step(0.55, fract(uv.y * 4.0 + uTime * 2.3));');
    m.fragmentShader = src.fragmentShader
      .replace('uniform vec2 uGrid;', 'uniform vec2 uGrid;\n        uniform float uLevel, uRed;')
      // (her red flash takes the bright parts too, which otherwise glow toward white)
      .replace('gl_FragColor = vec4(glow * intensity * 1.9, 1.0);', 'glow = mix(glow, vec3(0.85, 0.02, 0.015), smoothstep(0.0, 0.7, uRed));\n          gl_FragColor = vec4(glow * intensity * 1.9 * uLevel, 1.0);');
    m.fog = false;
    this.holoMat = this._mat(m);
    // (rows of vertices, so the tear can shear them; the shader flips v back, as for the glb screens)
    const geo = new THREE.PlaneGeometry(HOLO[0], HOLO[1], 1, 48);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this._geos.push(geo);
    const face = new THREE.Mesh(geo, m);
    face.position.copy(FACE);
    face.renderOrder = 5;
    this.scene.add(face);
    this.holo = face;
    // the beam from the emitter up to her, and a soft halo round her
    const beamTex = this._canvas(64, 128, (g, w, hh) => {
      const lg = g.createLinearGradient(0, hh, 0, 0);
      lg.addColorStop(0, 'rgba(140,230,255,0.55)');
      lg.addColorStop(1, 'rgba(140,230,255,0)');
      g.fillStyle = lg;
      g.fillRect(0, 0, w, hh);
    });
    const beamGeo = new THREE.CylinderGeometry(0.62, 0.3, 0.55, 24, 1, true);
    this._geos.push(beamGeo);
    this.beam = new THREE.Mesh(beamGeo, this._mat(new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, opacity: 0.5 })));
    this.beam.position.set(0, DESK.y + 0.36, (DESK.z0 + DESK.z1) / 2 + 0.05);
    this.scene.add(this.beam);
    const haloTex = this._canvas(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(110,200,255,0.5)');
      r.addColorStop(0.5, 'rgba(60,150,255,0.15)');
      r.addColorStop(1, 'rgba(60,150,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
    });
    this.halo = new THREE.Sprite(this._mat(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
    this.halo.scale.set(2.6, 1.9, 1);
    this.halo.position.copy(FACE).add(v3(0, 0, -0.05));
    this.scene.add(this.halo);
    this._headCamZ = this.aria.head.camera.position.z;
  }

  // ------------------------------------------------------------------ Voss
  _cast() {
    const actor = (this.actor = new VossActor(this.vossSrc, this.clips, { preset: 'resigned', wound: true }));
    this.scene.add(actor.root);
    // which way his face points, in the head bone's own frame (for the eye line): from his rest
    // pose, where he stands straight and looks ahead
    actor.model.updateMatrixWorld(true);
    actor.bone('head').getWorldQuaternion(this._q);
    this._headFwd = actor._axis(2, new THREE.Vector3()).applyQuaternion(this._q.clone().invert());
    this._gaze = { yaw: 0, pitch: 0 };
    // the walk in: along a smooth path, from the corridor to three paces from her
    this.path = new THREE.CatmullRomCurve3(PATH, false, 'centripetal');
    this.pathLen = this.path.getLength();
    this._s = 0;
    this.path.getPointAt(0, actor.root.position);
    actor.root.rotation.y = this._pathYaw(0);
    actor.walkSpeed = 0.62;
    actor.crossTo('InjuredWalk', { fade: 0 });
    actor.update(0);
    // blood on two fingertips of his left hand (after he touches the gash)
    const blood = this._mat(new THREE.MeshLambertMaterial({ color: 0x3a0806 }));
    const dot = new THREE.SphereGeometry(0.0075 / actor.scale, 8, 6);
    dot.scale(1, 0.7, 1);
    this._geos.push(dot);
    this.blood = [];
    actor.model.traverse((o) => {
      if (o.isBone && /_L_Finger[12]2(_\d+)?$/.test(o.name)) {
        const m = new THREE.Mesh(dot, blood);
        m.position.set(0.012 / actor.scale, 0, 0);
        m.visible = false;
        o.add(m);
        this.blood.push(m);
      }
    });
    // (kept, so the ending that follows the choice can take it off and do its own: level3/SceneB.js)
    this._bodyHook = actor.onAfterMixer(() => this._body());
  }

  _pathYaw(u) {
    const tg = this.path.getTangentAt(clamp(u, 0, 1), this._v3);
    return Math.atan2(tg.x, tg.z);
  }

  // The rope from his fist to the plug, and the cable from his fist back to the reel
  _cable() {
    const mat = this._mat(new THREE.MeshLambertMaterial({ color: 0x1d2226 }));
    this.trail = new Tube(96, CABLE_R, 8, mat);
    this.dangle = new Tube(24, CABLE_R, 8, mat);
    this.scene.add(this.trail.mesh, this.dangle.mesh);
    this._geos.push(this.trail.geometry, this.dangle.geometry);
    this.rope = new Rope(8, ROPE_LEN);
    // the plug: a housing, a steel ferrule and a lit band (pointing along -y from where the cable joins)
    const plug = (this.plug = new THREE.Group());
    const add = (geo, m, y) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.y = y;
      this._geos.push(geo);
      plug.add(mesh);
    };
    add(new THREE.CylinderGeometry(0.024, 0.03, 0.035, 14), this._mat(new THREE.MeshLambertMaterial({ color: 0x2a2f33 })), -0.015);
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.07, 16), this._mat(new THREE.MeshLambertMaterial({ color: 0xc9a227 })), -0.065);
    add(new THREE.CylinderGeometry(0.0335, 0.0335, 0.008, 16), this.portMat, -0.085);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 12), this._mat(new THREE.MeshLambertMaterial({ color: 0xaab2b8 })), -0.115);
    this.scene.add(plug);
    // the floor's part of the cable: along the path he walked, a little to his right, out of the
    // door to the reel (the samples are where the cable lies once he has passed)
    this._floor = [];
    const side = new THREE.Vector3();
    for (let i = 0; i <= 120; i++) {
      const u = i / 120;
      const p = this.path.getPointAt(u, new THREE.Vector3());
      const tg = this.path.getTangentAt(u, this._v);
      side.set(-tg.z, 0, tg.x).normalize();              // (his right, walking along it)
      p.addScaledVector(side, 0.24 + 0.03 * Math.sin(u * 17));
      p.y = CABLE_R;
      this._floor.push({ p, s: u * this.pathLen });
    }
    this._lead = [v3(REEL_AT.x + 0.25, 0.48 - 0.34, REEL_AT.z - 0.2), v3(REEL_AT.x + 0.1, CABLE_R, REEL_AT.z - 0.75), this._floor[0].p.clone().add(v3(0.02, 0, 0.9))];
  }


  // ------------------------------------------------------------------ the script
  _script() {
    const T = this.T, L = T.line;
    const len = (id) => L[id][1] - L[id][0];
    // his face, stretch by stretch: the preset, and an expression on top (the script's directions)
    this.acting = [
      [0, 'resigned', { tired: 0.8 }],
      [T.raise[0] - 0.3, 'resigned', { tired: 0.65, frown: 0.3, brow: -0.2 }],
      [L.v1[0], 'calm', { tired: 0.55, frown: 0.25, brow: -0.15 }],           // low and level, decided
      [L.a2[0] + 0.5, 'calm', { tired: 0.5, frown: 0.2, brow: -0.1 }],
      [L.v2[0], 'arguing', { tired: 0.45, frown: 0.2 }],                      // the cut, quiet
      [T.crew, 'arguing', { worry: 0.4, brow: 0.3, frown: 0.1, tired: 0.5 }], // "part of the crew": close to tears
      [T.silence[0], 'resigned', { worry: 0.4, brow: 0.3, tired: 0.5 }],
      [T.touch, 'strained', {}],
      [L.v4[0] + 0.55 * len('v4'), 'strained', { worry: 0.45, brow: 0.5 }],  // the voice breaks on "me"
      [L.a3[0], 'strained', { brow: 0.55, worry: 0.5 }],                       // a flicker of fear
      [L.a4[0], 'strained', { worry: 0.5, brow: 0.4, tired: 0.4 }],
      [L.v5[0], 'arguing', { frown: 0.45, brow: -0.3 }],                       // angry...
      [L.v5[0] + 0.6 * len('v5'), 'strained', { worry: 0.5, brow: 0.35 }],     // ...then it cracks
      [L.v6[0], 'resigned', { worry: 0.5, brow: 0.35, tired: 0.5 }],          // hurt and confused
      [L.a5[0], 'strained', { worry: 0.5, brow: 0.45 }],
      [T.stagger, 'resigned', { tired: 0.95, frown: 0.35 }],
      [L.a6[0], 'resigned', { worry: 0.35, tired: 0.7 }],
      [L.v8[0] - 0.3, 'resigned', { worry: 0.45, brow: 0.3, tired: 0.6 }],
      [L.a7[0], 'resigned', { worry: 0.6, brow: 0.4, tired: 0.6 }],
      [T.quiet, 'resigned', { worry: 0.5, brow: 0.3, tired: 0.75 }]
    ];
    // what he looks at: [from, target, how quickly his head gets there]
    const aria = (out) => out.copy(FACE).add(v3(0, -0.05, 0));
    const at = (p) => (out) => out.copy(p);
    const hand = (side, dz = 0) => (out) => this.actor.bone(side + 'Hand').getWorldPosition(out).add(v3(0, 0.02, dz));
    const ahead = (dist, y) => (out) => this.actor.root.localToWorld(out.set(0.05, y, dist));
    this.attention = [
      [0, aria, 1.4], [T.raise[0] - 0.2, at(PORT), 3.0], [T.raise[0] + 1.1, aria, 2.2],
      [T.fingers + 0.15, hand('left', 0.05), 4.0], [T.lookUp, aria, 3.0],
      [T.stagger + 0.1, at(v3((SIDE.x0 + SIDE.x1) / 2, SIDE.y, -1.8)), 2.0], [L.v7[0] + 0.72 * len('v7'), aria, 1.5],
      [L.a6[0] - 0.1, ahead(1.15, 0), 2.2], [T.turnHead, aria, 0.75],
      [T.lookHand, hand('left'), 2.6], [T.pull - 0.6, at(PORT), 0.9]
    ];
    // ARIA's face: [from, state]
    this.ariaActing = [
      [0, 'neutral'], [L.a1[0] + 0.15, 'bubbly'], [L.v1[0] + 0.35 * len('v1'), 'hesitant'],
      [L.a2[0], 'bubbly'], [T.giggle, 'guarded'], [T.silence[0] + 1.6, 'robotic'],
      [T.touch + 0.3, 'deadpan'], [L.v4[1] - 0.35, 'hostile'], [L.a4[0], 'broken'], [L.a5[0] - 0.1, 'hostile'],
      [T.directive, 'directive'], [L.v8[0] + 0.6, 'guarded'], [T.cold, 'deadpan']
    ];
    // the one-off moments
    const a = this.actor, f = a.face;
    this.events = [
      [T.stare, () => f.stare(3.0)],
      [L.a1[1] + 0.12, () => { f._nextBlink = 0; }],                      // (the first blink after her line)
      [T.raise[0] + 0.55, () => { f._nextBlink = 0; }],                   // one slow blink
      [T.step, () => a.walkTo(a.root.localToWorld(new THREE.Vector3(0, 0, STEP)), { then: 'SadIdle' })],
      [T.flicker, () => this._zap(1.0)],
      [T.touch, () => a.reach('L', this._leftGrip, { fade: 0.85 })],
      [T.touch + 0.85, () => { for (const b of this.blood) b.visible = true; }],
      [L.v4[0] + 0.35, () => a.reach('L', null, { fade: 1.0 })],
      [T.flinch, () => { a.crossTo('Stagger', { then: 'SadIdle' }); f.tic(); }],
      [L.a3[0], () => this._zap(0.7)],
      [L.a4[0] + 0.3, () => this._zap(0.35)],
      [L.a4[0] + 1.9, () => this._zap(0.25)],
      [L.a5[0] + 0.2, () => this._zap(0.5)],
      [T.stagger, () => a.crossTo('Stagger', { then: 'SadIdle', rate: 0.85 })],
      [T.console - 0.05, () => a.reach('L', this._leftGrip, { fade: 0.8 })],
      [T.drop, () => a.reach('L', null, { fade: 1.1 })],
      [T.shake, () => f.gesture('shake', 0.5)],
      [T.lookHand - 0.5, () => a.reach('L', this._leftGrip, { fade: 1.0 })],
      [T.pull, () => a.reach('L', null, { fade: 1.4 })]
    ];
    // his left hand: where it goes, from when, and how long it takes to get there from the last place
    this.leftTrack = [
      [0, 0, 'wall'], [T.touch, 0, 'head'], [T.touch + 1.45, 0.4, 'beside'], [T.fingers, 0.5, 'fingers'],
      [T.console, 0, 'console'], [T.rub[0], 0.55, 'eyes'], [T.rub[1], 0.65, 'console'],
      [T.lookHand - 0.5, 0, 'palm']
    ];
    // his right hand, round the cable: [from, how long the move takes, pose]
    this.rightTrack = [
      [0, 0, 'walk'], [T.arrive - 0.6, 0.8, 'hang'], [T.raise[0], 0.9, 'raise'], [T.raise[1] - 0.2, 0.6, 'held'],
      [T.sink[0], T.sink[1] - T.sink[0], 'sunk'], [T.stagger + 0.5, 0.9, 'clench'], [T.quiet + 0.3, 2.2, 'hangEnd']
    ];
    // his hands' tremor (m): tired; the rattle in the silence; worse at the end
    this.tremor = [[0, 0.0012], [T.silence[0] + 0.6, 0.0065], [T.silence[1] - 0.6, 0.0016], [T.stagger + 0.6, 0.0042], [L.a6[0], 0.0024], [L.a7[0] + 0.5, 0.0075], [T.pull, 0.0055]];
    this._leftGrip = (actor) => this._grip('L', actor);
    this.actor.reach('R', (actor) => this._grip('R', actor), { fade: 0.001 });
    this.actor.reach('L', this._leftGrip, { fade: 0.001 });
    // the wall: his left hand leaves it as the path turns away from it
    this._wallUntil = 2.55;
    // the stills (slow machines): a new picture at each line, and at each beat
    this.beats = [T.arrive, T.raise[0] + 0.5, T.step + 0.6, T.silence[0] + 0.3, T.flicker, T.touch + 0.6, T.fingers + 0.4, T.flinch + 0.4,
      T.sink[1], T.stagger + 0.6, T.rub[0] + 0.3, T.turnHead + 0.5, T.shake, T.cold + 0.5, T.quiet + 0.8, T.pull + 2];
  }

  // ------------------------------------------------------------------ playing
  // Warm the textures up behind the black (the shaders are compiled ahead, the textures upload the
  // first time they are drawn)
  warm(renderer) {
    if (!this.ready || this._warmed) return;
    this._warmed = true;
    this.aria.head.render(renderer);
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  // Resolves with the player's choice ('yes' | 'no')
  play({ still = false } = {}) {
    this.running = true;
    this.still = still;
    if (still) this.stats.still = 'before it started (the level was slow)';
    this.t = 0;
    this._last = performance.now();
    this._mountOverlay();
    window.addEventListener('keydown', this._onKey);
    this._startSound();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  _key(e) {
    if (!this.running) return;
    if (this._choiceEl) return this._choiceKey(e);
    if (e.code !== 'Enter' || this.t < SKIP_AFTER || this._skip) return;
    e.preventDefault();
    this._skip = { t: 0 };
  }

  _mountOverlay() {
    if (this.overlay || !this.root) return;
    const o = (this.overlay = document.createElement('div'));
    o.className = 'fb3d-hint on';
    Object.assign(o.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: 31, display: 'block' });
    // the subtitle sits inside the bottom bar (7% of the height, as the shader's uBars), the name
    // on the same line as the words, so both are on black; sized off the height so two lines fit
    o.innerHTML = `<div class="fb3-sub" style="position:absolute;left:0;right:0;bottom:0;height:7vh;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .25s"><div style="max-width:92vw;text-align:center;color:#f1f4f2;font-size:2.3vh;line-height:1.35"><span class="fb3-who" style="font-size:.8em;letter-spacing:.2em;font-weight:bold;margin-right:.7em"></span><span class="fb3-text"></span></div></div>
      <div class="fb-hint" style="position:absolute;right:1.2rem;top:0;height:7vh;display:flex;align-items:center;font-size:.72rem;letter-spacing:.15rem;color:#cfefff;opacity:0;transition:opacity .4s">Enter: skip</div>`;
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
    this._choiceTick(raw);
    if (this._skip) return this._skipping(renderer, raw);
    const ac = this.ac;
    const t = ac && ac.state === 'running' && this._t0 !== undefined ? Math.max(this.t, ac.currentTime - this._t0) : this.t + Math.min(0.1, raw);
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
    if (this.hint) this.hint.style.opacity = t > SKIP_AFTER && t < this.T.prompt - 1 ? 0.55 : 0;
    this._animate(t, dt);
    this._subtitles(t);
    if (t >= this.T.prompt && !this._choiceShown) this._showChoice();
    this._draw(renderer, t);
  }

  // Enter: down to black, the rest of the scene run through out of sight (its state is built by
  // playing it), then up again on the choice
  _skipping(renderer, raw) {
    const s = this._skip;
    s.t += Math.min(raw, 0.1);
    if (!s.stopped) {
      s.stopped = true;
      this._stopVoices();
    }
    if (s.t > 0.3 && this.t < this.T.prompt) {
      this._ff = true;
      const until = Math.min(this.T.prompt, this.t + 12);
      while (this.t < until) {
        const dt = Math.min(1 / 30, until - this.t);
        this.t += dt;
        this._animate(this.t, dt);
      }
      this._ff = false;
      if (this.t >= this.T.prompt) {
        s.done = s.t;
        this._settleSound();
      }
    }
    if (s.done !== undefined && s.t > s.done + 0.05) {
      // back up on the wide shot; the clock carries on from the prompt
      const fade = clamp((s.t - s.done) / 0.8);
      if (fade >= 1) {
        this._skip = null;
        if (this.ac && this._t0 !== undefined) this._t0 = this.ac.currentTime - this.t;
      }
      this._subtitles(this.t);
      if (!this._choiceShown) this._showChoice();
      this._draw(renderer, this.t, 1 - fade);
      return;
    }
    this._draw(renderer, this.t, clamp(s.t / 0.3));
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
    console.info('Confrontation: the machine is slow (' + why + '): stills from here on.');
  }

  _draw(renderer, t, black = null) {
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
      const key = (line?.id || '-') + beat + (this._shotIndex ?? '');
      if (key !== this._shot) {
        this._shot = key;
        fresh = true;
      }
    }
    if (fresh) {
      this.aria.head.render(renderer);
      renderer.setRenderTarget(this.target);
      renderer.render(this.scene, this.camera);
      renderer.setRenderTarget(null);
    }
    const u = this.post.material.uniforms;
    u.tScene.value = this.target.texture;
    u.uTime.value = t;
    u.uAspect.value = this.camera.aspect;
    u.uBlack.value = black ?? 1 - seg(t, 0.1, 1.6);
    u.uCold.value = seg(t, this.T.cold, this.T.cold + 2.5);
    renderer.render(this.postScene, this.postCam);
  }

  // the line being said (the latest to start, while it lasts)
  _lineAt(t, pad = 0) {
    const L = this.T.line;
    let found = null;
    for (const l of LINES) if (L[l.id][1] > L[l.id][0] && t >= L[l.id][0] && t <= L[l.id][1] + pad) found = l;
    return found;
  }

  _subtitles(t) {
    if (!this.sub) return;
    const line = this._skip ? null : this._lineAt(t, 0.35);
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

  // ------------------------------------------------------------------ the choice
  _showChoice() {
    this._choiceShown = true;
    // (the clock runs without the UI too, so the scene still ends: on yes)
    this._choiceClock = { t: 0, phase: 0.55, n: 0 };
    this._buttons = [];
    if (!this.root) return;
    const el = (this._choiceEl = document.createElement('div'));
    el.className = 'fb3d-hint on';
    el.style.cssText = 'position:absolute;inset:0;z-index:32;display:flex;align-items:flex-end;justify-content:center;padding-bottom:13vh;' +
      'font-family:"Courier New",monospace;color:#e8f6ff;opacity:0;transition:opacity 1.6s ease;pointer-events:auto';
    // the timer: a thin bar under the question, draining from both ends to the middle
    el.innerHTML = `<div class="pm-panel conf-choice" role="dialog" aria-label="The choice" style="width:min(440px,88vw)">
        <div class="pm-confirm-text" style="font-size:1.05rem;letter-spacing:.12rem;margin-bottom:.9rem">Connect ARIA to the mainland?</div>
        <div style="position:relative;height:3px;margin:0 0 1.1rem;background:rgba(0,229,255,.1)" role="timer"><i class="conf-bar" style="position:absolute;inset:0;background:#00e5ff;transform-origin:50% 50%"></i></div>
        <div class="pm-confirm-row"><button class="pm-btn" data-choice="yes">Yes</button><button class="pm-btn" data-choice="no">No</button></div>
      </div>`;
    this._panel = el.querySelector('.conf-choice');
    this._bar = el.querySelector('.conf-bar');
    this._buttons = [...el.querySelectorAll('[data-choice]')];
    for (const b of this._buttons) {
      b.addEventListener('click', () => this._choose(b.dataset.choice));
      b.addEventListener('mouseenter', () => this._focus(this._buttons.indexOf(b)));
    }
    this.root.appendChild(el);
    document.exitPointerLock?.();
    requestAnimationFrame(() => { el.style.opacity = '1'; });
  }

  _focus(i) {
    this._focused = i;
    this._buttons.forEach((b, k) => b.classList.toggle('focus', k === i));
  }

  // The choice's clock, on the frames' time (so it stops with them, under the pause menu), and its
  // suspense: the buttons beat like a heart, flashing on each beat and dimming between them, the
  // beat quicker and the dimming deeper as the time runs out. In the last seconds the bar and the
  // Yes go ARIA's red and her face pulses red with them, while the No fades. Out of time: yes.
  _choiceTick(raw) {
    const c = this._choiceClock;
    if (!c || this.choice) return;
    const dt = Math.min(raw, 0.25);                // (a slow machine's frames still count in full)
    c.t += dt;
    const late = clamp(c.t / CHOICE_SECONDS);
    const bpm = 54 + 78 * late * late;
    c.phase += (dt * bpm) / 60;
    const x = c.phase % 1;
    const beat = Math.max(Math.exp(-x * 16), x > 0.24 ? 0.65 * Math.exp(-(x - 0.24) * 16) : 0);
    if (Math.floor(c.phase) !== c.n) {
      c.n = Math.floor(c.phase);
      this._heartbeat(0.18 + 0.27 * late, (0.24 * 60) / bpm);
    }
    const red = seg(c.t, CHOICE_SECONDS - 6, CHOICE_SECONDS - 4.8);   // (quickly: halfway is a muddy grey)
    this._choicePulse = 0.75 * beat * red;
    const mix = (k) => CHOICE_CYAN.map((v, i) => Math.round(v + (CHOICE_RED[i] - v) * k)).join(',');
    if (this._bar) {
      const col = mix(red);
      this._bar.style.transform = `scaleX(${(1 - late).toFixed(4)})`;
      this._bar.style.background = `rgb(${col})`;
      this._bar.style.boxShadow = `0 0 ${(5 + 12 * beat * (0.3 + red)).toFixed(1)}px rgba(${col},${(0.45 + 0.4 * beat).toFixed(2)})`;
      this._panel.style.borderColor = `rgb(${col})`;
      this._panel.style.boxShadow = `0 0 ${(28 + 14 * beat * red).toFixed(1)}px rgba(${col},${(0.22 + 0.25 * beat * red).toFixed(2)}), inset 0 0 12px rgba(${col},0.07)`;
    }
    const floor = 0.88 - 0.43 * late;              // how far they dim between the beats
    const glow = beat * (0.35 + 0.65 * late);
    this._buttons.forEach((b, k) => {
      const yes = k === 0, focused = this._focused === k;
      const col = mix(yes ? red : 0);
      const lit = floor + (1 - floor) * beat;
      b.style.opacity = (focused ? Math.max(0.92, lit) : lit * (yes ? 1 : 1 - 0.45 * red)).toFixed(3);
      b.style.borderColor = `rgba(${col},${Math.min(1, 0.4 + 0.6 * glow + (focused ? 0.45 : 0)).toFixed(2)})`;
      b.style.background = `rgba(${col},${(0.06 + 0.16 * glow + (focused ? 0.12 : 0)).toFixed(3)})`;
      b.style.boxShadow = `0 0 ${(2 + 18 * glow).toFixed(1)}px rgba(${col},${(0.1 + 0.5 * glow).toFixed(2)})`;
    });
    if (c.t >= CHOICE_SECONDS) {
      // out of time: the Yes lights up solid, and it is chosen
      const yes = this._buttons[0];
      if (yes) {
        yes.style.opacity = '1';
        yes.style.background = `rgba(${mix(1)},0.35)`;
        yes.style.borderColor = `rgb(${mix(1)})`;
      }
      this._choose('yes');
    }
  }

  // one beat of a heart, quietly (lub, then dub)
  _heartbeat(size, gap) {
    const ac = this.ac;
    if (!ac || !this._fx || ac.state !== 'running') return;
    const now = ac.currentTime + 0.01;
    this._thump(now, size);
    this._thump(now + gap, size * 0.7);
  }

  _choiceKey(e) {
    if (this.choice) return;
    const move = { ArrowLeft: -1, ArrowUp: -1, KeyA: -1, ArrowRight: 1, ArrowDown: 1, KeyD: 1, Tab: 1 }[e.code];
    if (move) {
      e.preventDefault();
      this._focus(this._focused === undefined ? (move > 0 ? 0 : 1) : (this._focused + move + 2) % 2);
    } else if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') && this._focused !== undefined) {
      e.preventDefault();
      this._choose(this._buttons[this._focused].dataset.choice);
    }
  }

  _choose(choice) {
    if (this.choice) return;
    this.choice = choice;
    this._choicePulse = 0;
    const el = this._choiceEl;
    if (el) {
      el.style.transition = 'opacity .6s ease';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    }
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.(choice);
  }

  // ------------------------------------------------------------------ the action
  _animate(t, dt) {
    const T = this.T, a = this.actor;
    const step = Math.min(dt, 0.05);
    for (const ev of this.events) {
      if (!ev.done && t >= ev[0]) {
        ev.done = true;
        ev[1]();
      }
    }
    this._walk(t, step);
    this._acting(t);
    this._look(t, step);
    this._mouths(t);
    a.update(step);
    this._cableUpdate(t, step);
    this._ariaUpdate(t, step);
    this._lights(t);
    this._camera(t, step);
    if (!this._ff) this._sounds(t, step);
    // his feet: a scuff as each comes down while he walks
    if (a.currentName === 'InjuredWalk' && a.moveSpeed > 0.1) {
      const w = a.anim.actions.InjuredWalk, d = w.getClip().duration;
      const phase = (w.time % d) / d < 0.45 ? 0 : 1;
      if (phase !== this._footPhase) {
        if (this._footPhase !== undefined && !this._ff) this._footstep(phase);
        this._footPhase = phase;
      }
    }
    if (t >= T.prompt) this._choiceTime = (this._choiceTime || 0) + step;
  }

  // The walk in along the path (the clip plays in place; the root follows the path at its pace),
  // planting his feet at its end
  _walk(t, dt) {
    const a = this.actor;
    if (this._walked || t < this.T.walk) {
      if (t < this.T.walk) a.anim.actions.InjuredWalk.time = 0.25;     // (stepping off as the picture comes up)
      return;
    }
    this._s += a.moveSpeed * dt;
    const u = Math.min(1, this._s / this.pathLen);
    this.path.getPointAt(u, a.root.position);
    let d = this._pathYaw(Math.min(1, u + 0.02)) - a.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    a.root.rotation.y += d * (1 - Math.exp(-dt * 3));
    if (!this._stopping && this.pathLen - this._s <= a.stopDistance() + 0.01) {
      this._stopping = true;
      a.stopWalk('SadIdle');
    }
    // (planted: the stop has crossed to the idle; from here the root is left where it is)
    if (this._stopping && a.currentName !== 'InjuredWalk') this._walked = true;
  }

  _acting(t) {
    const f = this.actor.face;
    let mood = this.acting[0];
    for (const m of this.acting) if (t >= m[0]) mood = m;
    if (f._mood !== mood) {
      f._mood = mood;
      f.setPreset(mood[1]);
    }
    f.pose(mood[2], 0.5);
  }

  // His eye line: the head is turned (through the face's look) a little more toward what he looks at
  // every frame, at the speed the attention gives, so it lands softly and the clips' own head
  // motion stays under it
  _look(t, dt) {
    const a = this.actor;
    let entry = this.attention[0];
    for (const e of this.attention) if (t >= e[0]) entry = e;
    const head = a.bone('head');
    // both in the root's frame: +z his front, +x his left
    const toRoot = a.root.getWorldQuaternion(this._q2 ||= new THREE.Quaternion()).invert();
    const want = entry[1](this._v).sub(head.getWorldPosition(this._v2)).applyQuaternion(toRoot);
    const fwd = this._v3.copy(this._headFwd).applyQuaternion(head.getWorldQuaternion(this._q)).applyQuaternion(toRoot);
    const yawErr = Math.atan2(want.x, want.z) - Math.atan2(fwd.x, fwd.z);
    const pitchErr = -(Math.atan2(want.y, Math.hypot(want.x, want.z)) - Math.atan2(fwd.y, Math.hypot(fwd.x, fwd.z)));
    const g = this._gaze, k = entry[2] * dt;
    g.yaw = clamp(g.yaw + clamp(Math.atan2(Math.sin(yawErr), Math.cos(yawErr)), -0.6, 0.6) * k, -0.9, 0.9);
    g.pitch = clamp(g.pitch + clamp(pitchErr, -0.5, 0.5) * k, -0.55, 0.7);
    a.face.look(g.yaw, g.pitch, 0.3, 30);
  }

  // His mouth and hers follow their voices (through analysers); without a recording, wordless talk
  // while the subtitle is up
  _mouths(t) {
    const L = this.T.line;
    let voss = null, aria = null;
    for (const l of LINES) {
      if (t >= L[l.id][0] && t <= L[l.id][1] && L[l.id][1] > L[l.id][0]) {
        if (l.who === 'voss') voss = l.id;
        else aria = l.id;
      }
    }
    const f = this.actor.face;
    if (voss !== this._vossLine) {
      this._vossLine = voss;
      if (!voss) f.stopSpeaking();
      else if (this.analysers?.has(voss)) f.attachAnalyser(this.analysers.get(voss));
      else f.startBabble(0.8);
    }
    const head = this.aria.head;
    if (aria !== this._ariaLine) {
      this._ariaLine = aria;
      if (!aria) head.stopSpeaking();
      else {
        head.attachAnalyser(this.analysers?.get(aria) || null);
        head.startSpeaking();
      }
    }
  }

  // His hands' grips, in world space, every frame (ArmIK's { wrist, fingers, palm, pole, curl, thumb })
  _grip(side, a) {
    const t = this.t;
    const track = side === 'R' ? this.rightTrack : this.leftTrack;
    let i = 0;
    while (i + 1 < track.length && t >= track[i + 1][0]) i++;
    const cur = this._pose(side, track[i][2], a, (this._gA ||= {})[side] ||= blank());
    const [t0, dur] = track[i];
    if (i > 0 && dur > 0 && t < t0 + dur) {
      const prev = this._pose(side, track[i - 1][2], a, (this._gB ||= {})[side] ||= blank());
      blendGrip(prev, cur, ease((t - t0) / dur));
    }
    // the tremor in both hands
    // (each level eased in over the second before its time)
    let tr = this.tremor[0][1];
    for (const [at, amp] of this.tremor) tr += (amp - tr) * seg(t, at - 1.2, at);
    const s = side === 'R' ? 1 : 0.6;
    cur.wrist.x += tr * s * (Math.sin(t * 58.4) * 0.6 + Math.sin(t * 82.3 + 1) * 0.4);
    cur.wrist.y += tr * s * (Math.sin(t * 47.1 + 2) * 0.5 + Math.sin(t * 71.7) * 0.5);
    return cur;
  }

  // One pose of a hand (root-local numbers turned into the world)
  _pose(side, name, a, out) {
    const r = a.root, t = this.t;
    const loc = (x, y, z, o) => r.localToWorld(o.set(x, y, z));
    const dir = (x, y, z, o) => o.set(x, y, z).applyQuaternion(r.quaternion).normalize();
    out.curl = out.curl || [0, 0, 0];
    out.thumb = out.thumb || [0, 0, 0];
    const set = (arr, v) => { for (let i = 0; i < v.length; i++) arr[i] = v[i]; };
    if (side === 'R') {
      // round the cable: knuckles forward, palm in toward him, the cable running down through the fist
      const P = {
        walk: [-0.235, 0.855, 0.1], hang: [-0.245, 0.86, 0.07], raise: [-0.2, 1.1, 0.36], held: [-0.235, 1.0, 0.2],
        sunk: [-0.25, 0.83, 0.05], clench: [-0.2, 1.03, 0.14], hangEnd: [-0.245, 0.9, 0.08]
      }[name];
      loc(P[0], P[1], P[2], out.wrist);
      if (name === 'walk') out.wrist.addScaledVector(dir(0, 0, 1, this._v3), 0.03 * Math.sin((a.anim.actions.InjuredWalk.time / 1.63) * Math.PI * 2));
      dir(0, name === 'raise' ? -0.05 : -0.3, 1, out.fingers);
      dir(1, 0, 0, out.palm);
      dir(-0.7, -0.6, -0.45, out.pole);
      set(out.curl, name === 'clench' ? [1.45, 1.55, 1.3] : name === 'held' || name === 'raise' ? [1.3, 1.4, 1.2] : name === 'sunk' ? [0.95, 1.05, 0.85] : [1.15, 1.25, 1.05]);
      set(out.thumb, name === 'clench' ? [0.8, 0.6] : [0.6, 0.45]);
      return out;
    }
    const head = a.bone('head').getWorldPosition(this._v2);
    const up = dir(0, 1, 0, this._v3).clone(), fwd = dir(0, 0, 1, new THREE.Vector3()), left = dir(1, 0, 0, new THREE.Vector3());
    switch (name) {
      case 'wall': {
        // flat on the corridor's wall, trailing a little behind his shoulder
        out.wrist.set(WALL_X + 0.035, 1.12, r.position.z + 0.06 + 0.02 * Math.sin(t * 1.7));
        out.fingers.set(0, 0.35, -1).normalize();
        out.palm.set(-1, 0, 0);
        out.pole.set(0.3, -1, 0.7).normalize();
        set(out.curl, [0.15, 0.2, 0.15]);
        set(out.thumb, [0.1, 0.1]);
        break;
      }
      case 'head':
        // fingertips on the gash at the back of his head (as the preview's example)
        // (the palm on his scalp, facing forward: from behind, the back of his hand is seen)
        out.wrist.copy(head).addScaledVector(fwd, -0.13).addScaledVector(up, -0.01).addScaledVector(left, 0.06);
        out.fingers.copy(up).addScaledVector(fwd, 0.15).addScaledVector(left, -0.3).normalize();
        out.palm.copy(fwd).addScaledVector(left, -0.25).normalize();
        out.pole.copy(left).addScaledVector(up, 0.3);
        set(out.curl, [0.45, 0.5, 0.4]);
        set(out.thumb, [0.2, 0.2]);
        break;
      case 'beside':
        // coming away round the side of his head
        out.wrist.copy(head).addScaledVector(left, 0.24).addScaledVector(up, -0.08).addScaledVector(fwd, -0.02);
        out.fingers.copy(up).addScaledVector(fwd, 0.4).normalize();
        out.palm.copy(left).negate().addScaledVector(fwd, -0.3).normalize();
        out.pole.copy(left).addScaledVector(up, -0.6);
        set(out.curl, [0.3, 0.35, 0.3]);
        set(out.thumb, [0.2, 0.2]);
        break;
      case 'fingers':
        // in front of his face, the fingertips turned up toward his eyes: dark
        out.wrist.copy(head).addScaledVector(fwd, 0.25).addScaledVector(up, -0.24).addScaledVector(left, 0.08);
        out.fingers.copy(up).addScaledVector(fwd, 0.55).addScaledVector(left, -0.25).normalize();
        out.palm.copy(fwd).negate().addScaledVector(up, 0.5).normalize();
        out.pole.copy(left).addScaledVector(up, -1);
        set(out.curl, [0.25, 0.3, 0.2]);
        set(out.thumb, [0.15, 0.1]);
        break;
      case 'console': {
        // on the console's edge nearest him, the weight coming onto it (it settles: a little lower)
        const settle = seg(t, this.T.console + 0.7, this.T.console + 1.5);
        out.wrist.set(SIDE.x1 - 0.07, SIDE.y + 0.045 - 0.012 * settle, clamp(r.position.z - 0.2, SIDE.z0 + 0.15, SIDE.z1 - 0.12));
        out.fingers.copy(fwd).addScaledVector(left, 0.55).normalize();
        out.palm.set(0, -1, 0);
        out.pole.copy(left).addScaledVector(up, 0.2).addScaledVector(fwd, -0.4).normalize();
        set(out.curl, [0.2 + 0.1 * settle, 0.25, 0.15]);
        set(out.thumb, [0.15, 0.1]);
        break;
      }
      case 'eyes':
        // the heel of his hand on his eyes, rubbing
        out.wrist.copy(head).addScaledVector(fwd, 0.15).addScaledVector(up, -0.03 + 0.012 * Math.sin(t * 7)).addScaledVector(left, -0.01 + 0.012 * Math.sin(t * 5.3));
        out.fingers.copy(up).addScaledVector(fwd, 0.25).addScaledVector(left, -0.35).normalize();
        out.palm.copy(fwd).negate();
        out.pole.copy(left).addScaledVector(up, -0.7);
        set(out.curl, [0.35, 0.45, 0.3]);
        set(out.thumb, [0.3, 0.2]);
        break;
      default:
        // 'palm': his own hand, held out a little in front of him, looked at
        loc(0.15, 1.1, 0.3, out.wrist);
        out.fingers.copy(fwd).addScaledVector(left, -0.4).normalize();
        out.palm.copy(up).addScaledVector(fwd, -0.4).normalize();
        out.pole.copy(left).addScaledVector(up, -1);
        set(out.curl, [0.45, 0.55, 0.4]);
        set(out.thumb, [0.25, 0.2]);
    }
    return out;
  }

  // After the clips and the reaches: the wall hand lets go, his shoulders square and drop, he leans
  // on the console, he breathes hard after the stagger; his eyes shut; his mouth hangs open
  _body() {
    const a = this.actor, T = this.T, t = this.t;
    if (!this._wallOff && a.root.position.z < this._wallUntil) {
      this._wallOff = true;
      a.reach('L', null, { fade: 0.7 });
    }
    const q = this._q;
    const side = a._axis(0, new THREE.Vector3()), fwd = a._axis(2, new THREE.Vector3());
    // 3: squared, his weight back
    const square = seg(t, T.square, T.square + 1.2) * (1 - seg(t, T.step, T.step + 0.8)) + 0.4 * seg(t, T.step + 0.8, T.step + 2.0) * (1 - seg(t, T.silence[0], T.silence[0] + 2));
    // 11: the lean on the console; 13: the shoulders drop
    const lean = seg(t, T.console + 0.6, T.console + 1.6) * (1 - seg(t, T.drop - 0.2, T.drop + 0.9));
    const drop = seg(t, T.drop, T.drop + 1.1);
    const b = (n) => a.bone(n);
    if (square > 0) {
      a.turnBone(b('spine2'), q.setFromAxisAngle(side, -0.035 * square));
      a.turnBone(b('leftClavicle'), q.setFromAxisAngle(a._axis(1, new THREE.Vector3()), -0.05 * square));
      a.turnBone(b('rightClavicle'), q.setFromAxisAngle(a._axis(1, new THREE.Vector3()), 0.05 * square));
    }
    if (lean > 0) {
      a.turnBone(b('spine1'), q.setFromAxisAngle(fwd, -0.055 * lean));
      a.turnBone(b('spine2'), q.setFromAxisAngle(side, 0.05 * lean));
    }
    if (drop > 0) {
      a.turnBone(b('leftClavicle'), q.setFromAxisAngle(fwd, 0.06 * drop));
      a.turnBone(b('rightClavicle'), q.setFromAxisAngle(fwd, -0.06 * drop));
      a.turnBone(b('spine4'), q.setFromAxisAngle(side, 0.045 * drop));
    }
    // out of breath after the stagger: deep, slow heaves of the chest
    const puff = seg(t, T.stagger + 0.5, T.stagger + 1.2) * (1 - seg(t, lineOf(this, 'v7')[0] + 2.5, lineOf(this, 'v7')[1]));
    if (puff > 0) {
      const breath = Math.sin((t - T.stagger) * Math.PI * 2 / 2.1);
      a.turnBone(b('spine4'), q.setFromAxisAngle(side, -0.03 * breath * puff));
      a.turnBone(b('neck'), q.setFromAxisAngle(side, 0.03 * breath * puff));
    }
    // his eyes shut on the console (and in the long breath out)
    const shut = seg(t, T.eyes[0], T.eyes[0] + 0.35) * (1 - seg(t, T.eyes[1], T.eyes[1] + 0.5));
    if (shut > 0) a.face._set('blink', Math.max(a.face.blink, shut));
    // "I-": his mouth stays a little open, then shuts
    const open = seg(t, lineOf(this, 'v8')[1] - 0.05, lineOf(this, 'v8')[1] + 0.15) * (1 - seg(t, T.drop + 0.3, T.drop + 1.3));
    if (open > 0) a.face._set('jaw_open', Math.max(0.16 * open, a.face.jaw * a.face.preset.jaw));
    // 11: the stagger takes him toward the console (a step the clip does not move him through)
    if (t > T.stagger && t < T.stagger + 1.0 && !this._slid) {
      const u = seg(t, T.stagger, T.stagger + 0.9);
      this._slideFrom ||= a.root.position.clone();
      a.root.position.copy(this._slideFrom).addScaledVector(side, 0.11 * u).addScaledVector(fwd, -0.03 * u);
      if (u >= 1) this._slid = true;
    }
  }

  // The cable: the rope from his fist (pinned below it) to the plug, then both tubes
  _cableUpdate(t, dt) {
    const a = this.actor, arm = a._arms.R;
    const fingers = this._v, palm = this._v2;
    arm.frame(fingers, palm);
    const fist = arm.hand.getWorldPosition(new THREE.Vector3()).addScaledVector(fingers, 0.068).addScaledVector(palm, 0.028);
    const axis = new THREE.Vector3().crossVectors(fingers, palm).normalize();
    if (axis.y > 0) axis.negate();                      // (down through the fist)
    const below = fist.clone().addScaledVector(axis, 0.045);
    const above = fist.clone().addScaledVector(axis, -0.045);
    // the legs and hips it must not swing through
    const bp = (n) => a.bone(n).getWorldPosition(new THREE.Vector3());
    const caps = [[bp('rightThigh'), bp('rightCalf'), 0.085], [bp('rightCalf'), bp('rightFoot'), 0.065], [bp('pelvis'), bp('spine1'), 0.15]];
    this.rope.step(dt, below, caps, this._ff);
    const pts = this.rope.p;
    // the rope's last stretch is the plug (so on the floor it tips over, as a plug does)
    const tip = pts[pts.length - 1], joint = pts[pts.length - 2];
    const d = this._v3.subVectors(tip, joint).normalize();
    this.plug.position.copy(joint);
    this.plug.quaternion.setFromUnitVectors(UP_NEG, d);
    this._plugTip = (this._plugTip || new THREE.Vector3()).copy(tip);
    this.dangle.update([above.clone().addScaledVector(axis, -0.005), fist, ...pts.slice(0, -1)]);

    // the trailing cable: up out of the top of his fist, back and down to the floor behind him,
    // along where he walked, out of the door to the reel
    const r = a.root;
    const back = a._axis(2, new THREE.Vector3()).negate(), right = a._axis(0, new THREE.Vector3()).negate();
    const touch = r.position.clone().addScaledVector(back, 0.55).addScaledVector(right, 0.27);
    touch.y = CABLE_R;
    const sTouch = Math.max(0, Math.min(this._s, this.pathLen) - 0.55);
    const list = [...this._lead];
    for (let i = 0; i < this._floor.length; i += 4) if (this._floor[i].s < sTouch - 0.35) list.push(this._floor[i].p);
    list.push(touch);
    list.push(touch.clone().addScaledVector(back, -0.18).add(v3(0, 0.08, 0)));
    list.push(above.clone().addScaledVector(back, 0.2).addScaledVector(right, 0.12).setY(Math.max(0.35, above.y - 0.42)));
    list.push(above.clone().addScaledVector(back, 0.07).addScaledVector(right, 0.03).addScaledVector(axis, -0.06));
    list.push(above);
    this.trail.update(list);

    // the plug on the floor: a knock when it lands, a scrape while it is dragged
    const onFloor = this._plugTip.y < 0.021;
    if (onFloor && !this._plugDown && !this._ff && this._plugSpeed < -0.08) this._knock(Math.min(1, -this._plugSpeed * 1.5));
    this._plugSpeed = dt > 0 ? (this._plugTip.y - (this._plugY ?? this._plugTip.y)) / dt : 0;
    this._plugY = this._plugTip.y;
    this._plugDown = onFloor;
    this._drag = onFloor ? a.moveSpeed : 0;
  }

  _ariaUpdate(t, dt) {
    const T = this.T, L = T.line, head = this.aria.head;
    let state = this.ariaActing[0][1];
    for (const s of this.ariaActing) if (t >= s[0]) state = s[1];
    if (state !== head.exprName) head.setExpression(state);
    head.update(dt);
    // she leans in (beat 10), the closest she has been
    const lean = seg(t, L.a5[0] - 0.2, L.a5[0] + 0.6) * (1 - seg(t, L.a5[1] + 0.6, L.a5[1] + 2.4));
    head.camera.position.z = this._headCamZ * (1 - 0.2 * lean);
    // her light: flickers and stutters; dimmer while she breaks; it dims slowly at the choice
    let level = 1;
    const flick = (at, len, depth) => {
      if (t > at && t < at + len) level *= 1 - depth * (Math.sin((t - at) * 61) > -0.2 ? 1 : 0.1) * (1 - (t - at) / len);
    };
    flick(T.flicker, 0.55, 0.95);
    flick(L.a3[0], 0.4, 0.5);
    if (t > L.a4[0] && t < L.a4[1] + 0.5) level *= 0.82 + 0.18 * (Math.sin(t * 37) > 0.75 ? 0.2 : 1);     // the stutter
    if (t > L.a5[0] && t < L.a5[1]) level *= 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 9.1);          // her crying
    level *= 1 - 0.62 * seg(t, T.quiet + 0.5, T.quiet + 28);
    this._ariaLevel = level;
    const u = this.holoMat.uniforms;
    u.uLevel.value = level;
    u.uTime.value = t;
    // the tear in her scanlines: hostile at full (7), crying (10)
    u.uTear.value = 1.0 * seg(t, L.a3[0] - 0.05, L.a3[0] + 0.1) * (1 - seg(t, L.a3[1], L.a3[1] + 0.8))
      + 0.45 * (t > L.a5[0] && t < L.a5[1] + 0.3 && Math.sin(t * 5.3) > 0.3 ? 1 : 0);
    // her colour: blue; red when hostile; pale when she breaks; cold white-blue at the end
    const hostile = state === 'hostile' ? 1 : state === 'directive' ? 0.55 : 0;
    _c.copy(BLUE).lerp(RED, hostile * 0.8);
    if (state === 'broken') _c.copy(PALE);
    if (t > T.cold) _c.lerp(COLD, seg(t, T.cold, T.cold + 1.5));
    this._holoColour = (this._holoColour || BLUE.clone()).lerp(_c, 1 - Math.exp(-dt * 3));
    u.colorState.value.copy(this._holoColour);
    // and she flashes red when she is angry: once as each angry line starts, then on her loud words
    // (her last line too, cold as she is); at the choice, with its heartbeat as time runs out
    const anger = state === 'hostile' || this._ariaLine === 'a7' ? 1 : state === 'directive' ? 0.5 : 0;
    if (anger && this._ariaLine && this._ariaLine !== this._flashLine) {
      this._flashLine = this._ariaLine;
      this._flashAt = t;
    }
    let red = this._flashAt !== undefined ? Math.exp(-(t - this._flashAt) * 1.8) : 0;
    const an = anger && this._ariaLine && this.analysers?.get(this._ariaLine);
    if (an && this._voices?.length && this.ac?.state === 'running') {
      const buf = (this._redBuf ||= new Float32Array(an.fftSize));
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      red = Math.max(red, anger * clamp((Math.sqrt(sum / buf.length) - 0.04) * 9, 0, 1));
    } else if (anger && this._ariaLine) {
      red = Math.max(red, anger * 0.6 * (Math.sin(t * 8.3) * Math.sin(t * 3.1) > 0.15 ? 1 : 0.3));   // (no sound)
    }
    red = Math.max(red, this._choicePulse || 0);
    this._red = (this._red || 0) + (red - (this._red || 0)) * (1 - Math.exp(-dt * (red > (this._red || 0) ? 28 : 5)));
    u.uRed.value = this._red;
    _c.copy(this._holoColour).lerp(RED, this._red);
    this.halo.material.color.setRGB(1, 1 - 0.8 * this._red, 1 - 0.85 * this._red);
    this.beam.material.color.copy(this.halo.material.color);
    this.ariaLight.color.copy(_c).lerp(COLD, 0.45 * (1 - this._red));
    this.ariaLight.intensity = 4.5 * level;
    this.halo.material.opacity = 0.75 * level;
    this.beam.material.opacity = 0.45 * level;
    // the port glows up as she waits
    this.portMat.color.setHex(0x5fe8ff).multiplyScalar(0.55 + 0.35 * Math.sin(t * 2.1) * 0.5 + 0.9 * seg(t, T.pull, T.pull + 3));
  }

  // The room: dimmer round her while she breaks; cold for her last line
  _lights(t) {
    const T = this.T, L = T.line;
    const dim = 1 - 0.35 * seg(t, L.a4[0] - 0.2, L.a4[0] + 1.5) * (1 - seg(t, L.a4[1], L.v6[1]));
    const cold = seg(t, T.cold, T.cold + 2.0);
    for (const l of this.lamps) {
      l.intensity = l.userData.base * dim * (1 - 0.45 * cold);
      l.color.copy(l.userData.color).lerp(COLD, cold * 0.85);
    }
    this.hemi.intensity = 0.75 * dim * (1 - 0.3 * cold);
    this.hemi.color.setHex(0x8fa3b8).lerp(COLD, cold * 0.5);
    this.lampMat.color.setHex(0xffe0b4).lerp(COLD, cold).multiplyScalar(0.45 + 0.55 * dim * (1 - 0.4 * cold));
  }

  // ------------------------------------------------------------------ the camera
  // Hand-directed: each shot a function of the moment (from Voss's smoothed hips and head, and her
  // face), cut or eased from the last; a small handheld drift on top; kept inside the room and out
  // of the furniture
  _camera(t, dt) {
    const a = this.actor;
    const k = 1 - Math.exp(-dt * 5);
    const hip = a.bone('pelvis').getWorldPosition(this._v);
    const hd = a.bone('head').getWorldPosition(this._v2);
    if (!this._V || dt === 0) {
      this._V = hip.clone();
      this._H = hd.clone();
    }
    this._V.lerp(hip, k);
    this._H.lerp(hd, k);
    const shots = (this._shots ||= this._shotList());
    let i = 0;
    while (i + 1 < shots.length && t >= shots[i + 1].at) i++;
    this._shotIndex = i;
    const s = shots[i];
    const pos = this._camPos || (this._camPos = new THREE.Vector3());
    const look = this._camLook || (this._camLook = new THREE.Vector3());
    s.fn(t, pos, look);
    let fov = s.fov || 42;
    if (s.blend && t < s.at + s.blend && i > 0) {
      const p0 = (this._p0 ||= new THREE.Vector3()), l0 = (this._l0 ||= new THREE.Vector3());
      shots[i - 1].fn(t, p0, l0);
      const u = ease(clamp((t - s.at) / s.blend));
      pos.lerpVectors(p0, pos, u);
      look.lerpVectors(l0, look, u);
      fov = (shots[i - 1].fov || 42) + (fov - (shots[i - 1].fov || 42)) * u;
    }
    // handheld: slow, small
    const shake = (s.shake || 1) * (1 + 1.5 * (t > this.T.line.a3[0] && t < this.T.line.a3[0] + 1.1 ? 1 : 0));
    pos.x += shake * 0.006 * (Math.sin(t * 0.71) + 0.6 * Math.sin(t * 1.93 + 1));
    pos.y += shake * 0.004 * (Math.sin(t * 0.53 + 2) + 0.5 * Math.sin(t * 1.37));
    look.x += shake * 0.01 * Math.sin(t * 0.61 + 4);
    look.y += shake * 0.007 * Math.sin(t * 0.83 + 3);
    if (t > this.T.line.a3[0] - 0.05 && t < this.T.line.a3[0] + 1.0) {
      const e = 1 - (t - this.T.line.a3[0]) / 1.0;
      look.x += 0.012 * e * Math.sin(t * 41);
      look.y += 0.009 * e * Math.sin(t * 33 + 1);
    }
    keepInside(pos);
    // (and never inside him: out of a capsule round his body)
    pushOut(pos, this._V, this._v3.copy(this._H).add(v3(0, 0.15, 0)), 0.4);
    this.camera.position.copy(pos);
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(look);
  }

  _shotList() {
    const T = this.T, L = T.line, V = () => this._V, H = () => this._H, a = this.actor;
    const fwd = () => a._axis(2, this._v3);
    const face = FACE;
    const aria = (dx, dy, dz) => (t, p, l) => { p.set(face.x + dx, face.y + dy, face.z + dz); l.copy(face).add(v3(0, -0.04, 0)); };
    return [
      // 1: behind him, through the door, his shoulders on the left of the picture, the hologram ahead;
      { at: 0, fn: (t, p, l) => {
        const push = seg(t, 0, T.arrive + 0.5);
        const z = V().z + 2.25 - 0.85 * push;
        // (in the corridor straight behind him; once through the door, off to his right)
        const inRoom = seg(-z, -2.35, -1.2);
        p.set(V().x + 0.05 + 0.32 * inRoom, 1.62 - 0.05 * push, z);
        l.set(V().x, 1.5, V().z - 3).lerp(this._v3.copy(H()).lerp(face, 0.55), seg(-z, -3.4, -1.8));
      } },
      // 2: low, at his side: the cable in his hand rising toward the port, and stopping
      { at: T.raise[0] - 0.35, fn: (t, p, l) => {
        const u = seg(t, T.raise[0] - 0.35, L.v1[1]);
        p.set(V().x + 1.3 - 0.15 * u, 0.62, V().z + 0.55 - 0.1 * u);
        l.set(V().x - 0.1, 1.15 + 0.12 * u, V().z - 0.35);
      } },
      // 3: the two of them, his profile and her face
      { at: L.a2[0] - 0.25, fn: (t, p, l) => {
        const u = seg(t, L.a2[0] - 0.25, L.a2[1]);
        p.set(1.45 - 0.1 * u, 1.55, -0.55 - 0.15 * u);
        l.set(H().x * 0.5 + face.x * 0.5, 1.62, H().z * 0.5 + face.z * 0.5);
      } },
      // 4: the hard push in on his face as he cuts her off
      { at: L.v2[0] - 0.05, fn: (t, p, l) => {
        const u = ease(clamp((t - L.v2[0]) / 1.3));
        const d = 1.25 - 0.5 * u + 0.1 * seg(t, L.v3[0], L.v3[1]);
        p.copy(H()).addScaledVector(fwd(), d).add(v3(0.32 - 0.1 * u, 0.02, 0));
        l.copy(H()).add(v3(0, -0.02, 0));
      }, fov: 38 },
      // 5: hold on her (three seconds, tight, from just beside him), then a slow drift back
      // until he is in the picture too, over his shoulder
      { at: T.silence[0] + 0.15, fn: (t, p, l) => {
        p.set(0.5, 1.66, -1.2);
        l.copy(face).add(v3(0, -0.04, 0));
      }, fov: 28 },
      { at: T.silence[0] + 3.15, blend: 2.3, fn: (t, p, l) => {
        p.copy(H()).addScaledVector(fwd(), -0.95).add(v3(0.45, 0.04, 0));
        l.copy(face).lerp(H(), 0.42).add(v3(0, -0.05, 0));
      }, fov: 40 },
      // 6: over his shoulder, the hologram huge in front of him; his hand to the back of his head
      { at: T.touch - 0.1, blend: 0.9, fn: (t, p, l) => {
        p.copy(H()).addScaledVector(fwd(), -0.85).add(v3(0.45, 0.06, 0));
        l.copy(face).lerp(H(), 0.35).add(v3(0, -0.05, 0));
      }, fov: 44 },
      // 7: whip in on her (past his right side), shaking as if the signal wobbles
      { at: L.a3[0] - 0.15, blend: 0.4, fn: aria(0.42, -0.06, 1.3), fov: 34, shake: 1.6 },
      // 8: a very slow push on her while she breaks
      { at: L.a4[0] - 0.25, fn: (t, p, l) => {
        const u = seg(t, L.a4[0] - 0.25, L.a4[1] + 0.6);
        p.set(face.x + 0.22 - 0.12 * u, face.y - 0.12, face.z + 1.7 - 0.5 * u);
        l.copy(face).add(v3(0, -0.04, 0));
      }, fov: 34 },
      // 9: the two of them, him lower in the picture: the cable sinks, the plug on the floor
      { at: L.v5[0] - 0.3, fn: (t, p, l) => {
        const u = seg(t, L.v5[0] - 0.3, L.v6[1]);
        p.set(1.55 - 0.1 * u, 2.0, -0.85 - 0.1 * u);
        l.set(V().x * 0.6 + face.x * 0.4, 1.0, V().z * 0.65 + face.z * 0.35);
      }, fov: 46 },
      // 10: close on her: she leans toward us
      { at: L.a5[0] - 0.2, fn: aria(-0.06, -0.06, 1.6), fov: 34 },
      // 11: him alone, small; the stagger to the console
      { at: T.stagger - 0.15, fn: (t, p, l) => {
        const u = seg(t, T.stagger, L.v7[1]);
        p.set(1.75, 2.05 - 0.1 * u, -3.1 + 0.15 * u);
        l.set(V().x - 0.18, 1.05, V().z - 0.05);
      }, fov: 40 },
      // 12: wider: him on the left looking at the floor, her on the right looking down at him
      { at: L.a6[0] - 0.3, fn: (t, p, l) => {
        const u = seg(t, L.a6[0] - 0.3, L.a6[1]);
        p.set(1.85 - 0.1 * u, 1.68, 0.95 - 0.2 * u);
        l.set(-0.25, 1.4, -2.2);
      }, fov: 46 },
      // 13: medium on him, his mouth half open
      { at: L.v8[0] - 0.65, fn: (t, p, l) => {
        const u = seg(t, L.v8[0] - 0.65, T.cold);
        p.copy(H()).addScaledVector(fwd(), 1.4 - 0.15 * u).add(v3(0.3, -0.08, 0));
        l.copy(H()).add(v3(0, -0.15, 0));
      }, fov: 38 },
      // 14: back to her, wide, the room going cold; in on her face as she finishes and waits (past
      // his right side, well clear of him; the pull to the high wide goes on from there)
      { at: T.cold - 0.05, fn: (t, p, l) => {
        const u = seg(t, T.cold, T.quiet + 1.2);
        p.set(1.4 - 0.85 * u, 1.62 + 0.08 * u, 0.4 - 2.7 * u);
        l.copy(face).lerp(H(), 0.3 * (1 - u)).add(v3(0, -0.04, 0));
      }, fov: 42 },
      // 15: the high wide: the two of them small, the cable between them; the choice
      { at: T.pull, blend: 3.2, fn: (t, p, l) => {
        const drift = 0.04 * Math.sin((t - T.pull) * 0.15);
        p.set(1.7 + drift, 2.72, 1.75);
        l.set(-0.2, 0.7, -2.0);
      }, fov: 52, shake: 0.6 }
    ];
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
    this._voices = [];
    this.analysers = new Map();
    // the voices: each line through its gain, then one bus with a gentle compressor and a limiter
    const voice = (this._voice = ac.createGain());
    voice.gain.value = settings.get('voice');
    voice.connect(ac.destination);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    const limit = ac.createDynamicsCompressor();
    limit.threshold.value = -3;
    limit.knee.value = 0;
    limit.ratio.value = 20;
    limit.attack.value = 0.001;
    limit.release.value = 0.08;
    const makeup = ac.createGain();
    makeup.gain.value = dbGain(VOICE_BUS_DB);
    comp.connect(makeup).connect(limit).connect(voice);
    this._bus = comp;
    for (const l of LINES) {
      const buffer = this.buffers.get(l.id);
      if (!buffer) continue;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      // the mouth reads the line as recorded (before its gain): its own level adapts
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.3;
      src.connect(an);
      this.analysers.set(l.id, an);
      const g = ac.createGain();
      g.gain.value = dbGain(VOICE_GAIN_DB[l.id] || 0);
      src.connect(g).connect(comp);
      src.start(at + L[l.id][0]);
      // cut off by the other's line: out in 40 ms
      const cut = this.T.cuts.find((c) => c[0] === l.id);
      if (cut) {
        g.gain.setValueAtTime(g.gain.value, at + cut[1] - 0.04);
        g.gain.linearRampToValueAtTime(0, at + cut[1]);
        src.stop(at + cut[1] + 0.02);
      }
      this._sources.push(src);
      this._voices.push(src);
    }

    // the effects, under the voices
    const fx = (this._fx = ac.createGain());
    fx.gain.value = settings.get('effects') * 0.8;
    fx.connect(ac.destination);
    // the machinery's hum: the room's file and a low tone; quiet at the stagger, back a little,
    // and almost nothing for the choice
    const hum = (this._hum = ac.createGain());
    hum.connect(fx);
    const level = [[0, 0.0001], [0.2, 0.5], [T.stagger, 0.5], [T.stagger + 1.6, 0.16], [L.a6[0], 0.16], [L.a6[0] + 2.5, 0.38], [T.quiet, 0.38], [T.quiet + 3.5, 0.04]];
    hum.gain.setValueAtTime(0.0001, at);
    for (const [when, v] of level.slice(1)) hum.gain.linearRampToValueAtTime(v, at + when);
    const b = this.fx.get('machine-hum');
    if (b) {
      const src = ac.createBufferSource();
      src.buffer = b;
      src.loop = true;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1500;
      const g = ac.createGain();
      g.gain.value = 0.42;
      src.connect(lp).connect(g).connect(hum);
      src.start(at);
      this._sources.push(src);
    }
    for (const [f, type, g] of [[50, 'sine', 0.06], [100, 'triangle', 0.025], [150, 'sine', 0.012]]) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = g;
      o.connect(og).connect(hum);
      o.start(at);
      this._sources.push(o);
    }
    // a scrape (the plug dragged over the floor) and a rattle (the plug shaking in his hand):
    // noise, their levels set each frame
    const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this._noise = noise;
    const loopNoise = (type, freq, q) => {
      const src = ac.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ac.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(fx);
      src.start(at);
      this._sources.push(src);
      return g;
    };
    this._scrape = loopNoise('bandpass', 1800, 0.7);
  }

  // per frame: the scrape's level, the rattle's ticks
  _sounds(t, dt) {
    const ac = this.ac;
    if (!ac || !this._scrape || this._skip) return;
    this._scrape.gain.setTargetAtTime(Math.min(0.09, this._drag * 0.16), ac.currentTime, 0.05);
    // the rattle: the plug's head knocking in his shaking hand, tick by tick
    const T = this.T;
    const rattle = seg(t, T.silence[0] + 0.5, T.silence[0] + 1.4) * (1 - seg(t, T.silence[1] - 1.2, T.silence[1] - 0.3))
      + 0.35 * seg(t, T.line.a7[0] + 0.6, T.line.a7[0] + 1.6) * (1 - seg(t, T.pull, T.pull + 2));
    this._tick = (this._tick || 0) - dt;
    if (rattle > 0.05 && this._tick <= 0) {
      this._tick = 0.05 + Math.random() * 0.11;
      this._click(0.05 + 0.08 * rattle * Math.random(), 2.2 + Math.random() * 0.8);
    }
  }

  _click(vol, rate) {
    const ac = this.ac, b = this.fx.get('click');
    if (!ac || !b) return;
    const src = ac.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = rate;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this._fx);
    src.start(ac.currentTime + 0.005);
  }

  // the plug landing on the floor: a hard little knock and a thud
  _knock(size) {
    const ac = this.ac, b = this.fx.get('clank-2');
    if (!ac || !this._fx) return;
    if (b) {
      const src = ac.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = 1.7;
      const g = ac.createGain();
      g.gain.value = 0.28 * size;
      src.connect(g).connect(this._fx);
      src.start(ac.currentTime + 0.005);
    }
    this._thump(ac.currentTime + 0.005, 0.25 * size);
  }

  // the hologram's flicker: a crackle of static and a buzz
  _zap(size) {
    const ac = this.ac;
    if (!ac || !this._fx || this._ff || this._skip) return;
    const when = ac.currentTime + 0.01;
    const src = ac.createBufferSource();
    src.buffer = this._noise;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    f.Q.value = 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, when);
    for (let i = 0; i < 6; i++) {
      g.gain.setValueAtTime(0.12 * size * (i % 2 ? 0.2 : 1), when + i * 0.045);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.4);
    src.connect(f).connect(g).connect(this._fx);
    src.start(when, Math.random());
    src.stop(when + 0.45);
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 120;
    const og = ac.createGain();
    og.gain.setValueAtTime(0.0001, when);
    og.gain.exponentialRampToValueAtTime(0.03 * size, when + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);
    const of = ac.createBiquadFilter();
    of.type = 'lowpass';
    of.frequency.value = 900;
    o.connect(of).connect(og).connect(this._fx);
    o.start(when);
    o.stop(when + 0.4);
  }

  // a foot coming down; the dragged one scrapes
  _footstep(phase) {
    const ac = this.ac, b = this.fx.get('punch');
    if (!ac || !this._fx) return;
    const when = ac.currentTime + 0.005;
    this._thump(when, 0.12);
    if (b) {
      const src = ac.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = 1.5 + Math.random() * 0.2;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1200;
      const g = ac.createGain();
      g.gain.value = 0.09;
      src.connect(f).connect(g).connect(this._fx);
      src.start(when);
    }
    const s = this.fx.get('slide');
    if (s && phase === 1) {
      const src = ac.createBufferSource();
      src.buffer = s;
      src.playbackRate.value = 0.8;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const g = ac.createGain();
      g.gain.value = 0.06;
      src.connect(f).connect(g).connect(this._fx);
      src.start(when + 0.06);
      src.stop(when + 0.5);
    }
  }

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
  }

  // (skipped) the voices stop; the hum goes straight to the choice's level
  _stopVoices() {
    const ac = this.ac;
    if (!ac || !this._voices) return;
    for (const s of this._voices) {
      try { s.stop(ac.currentTime + 0.05); } catch { /* (already stopped) */ }
    }
    this._voices = [];
    this._hum?.gain.cancelScheduledValues(ac.currentTime);
    this._hum?.gain.setTargetAtTime(0.0001, ac.currentTime, 0.1);
  }

  _settleSound() {
    const ac = this.ac;
    if (!ac || !this._hum) return;
    this._hum.gain.cancelScheduledValues(ac.currentTime);
    this._hum.gain.setTargetAtTime(0.04, ac.currentTime + 0.2, 0.5);
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
    this.running = false;
    window.removeEventListener('keydown', this._onKey);
    this._stopSound();
    this.overlay?.remove();
    this.overlay = null;
    this._choiceEl?.remove();
    this._choiceEl = null;
    this._resolve = null;
    if (this.scene) {
      this.actor?.dispose();
      // the fresh Voss: his geometry, materials and textures (the actor shares them)
      const voss = this.vossSrc;
      voss.anim?.mixer.stopAllAction();
      voss.fpAnim?.mixer.stopAllAction();
      const mats = new Set();
      for (const root of [voss.bodyRoot, voss.viewModel]) {
        root?.traverse((o) => {
          if (o.isSkinnedMesh) o.skeleton.dispose();
          if (!o.isMesh) return;
          o.geometry.dispose();
          for (const m of [].concat(o.material || [])) mats.add(m);
        });
      }
      for (const m of mats) {
        for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
        m.dispose();
      }
      voss.faceWear?.dispose();
      voss.headTexture?.dispose();
      this.aria.dispose();
      for (const g of this._geos) g.dispose();
      for (const m of this._mats) m.dispose();
      for (const x of this._textures) x.dispose();
      this.target.dispose();
      this.post.geometry.dispose();
      this.post.material.dispose();
      this.scene.clear();
      this.scene = null;
      this.actor = null;
    }
    this.ac?.close?.().catch(() => {});
    this.ac = null;
    this.buffers = null;
    this.analysers = null;
    this.ready = false;
    this._loading = null;
  }
}

// ------------------------------------------------------------------ helpers

const UP_NEG = new THREE.Vector3(0, -1, 0);
const lineOf = (self, id) => self.T.line[id];
const dbGain = (db) => Math.pow(10, db / 20);

function blank() {
  return { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(), pole: new THREE.Vector3(), curl: [0, 0, 0], thumb: [0, 0, 0] };
}

// b becomes a's grip moved u of the way to b's
function blendGrip(a, b, u) {
  b.wrist.lerpVectors(a.wrist, b.wrist, u);
  b.fingers.lerpVectors(a.fingers, b.fingers, u).normalize();
  b.palm.lerpVectors(a.palm, b.palm, u).normalize();
  b.pole.lerpVectors(a.pole, b.pole, u);
  for (let i = 0; i < b.curl.length; i++) b.curl[i] = a.curl[i] + (b.curl[i] - a.curl[i]) * u;
  for (let i = 0; i < b.thumb.length; i++) b.thumb[i] = (a.thumb[i] ?? 0) + (b.thumb[i] - (a.thumb[i] ?? 0)) * u;
}

// Where the speech ends in a recording (s): the last 20 ms with sound within 30 dB of its peak
function speechEnd(buffer) {
  return speechEdge(buffer, false);
}

// Where it starts (s): the first 20 ms with sound within 30 dB of its peak, a little before it
function speechStart(buffer) {
  return speechEdge(buffer, true);
}

function speechEdge(buffer, first) {
  const d = buffer.getChannelData(0), win = Math.max(1, Math.round(buffer.sampleRate * 0.02));
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const floor = peak * 0.0316;
  let last = 0;
  for (let s = 0; s + win <= d.length; s += win) {
    let sum = 0;
    for (let i = s; i < s + win; i += 2) sum += d[i] * d[i];
    if (Math.sqrt(sum / (win / 2)) * Math.SQRT2 > floor) {
      if (first) return Math.max(0, s / buffer.sampleRate - 0.03);
      last = s + win;
    }
  }
  return first ? 0 : Math.min(buffer.duration, last / buffer.sampleRate + 0.05);
}

// The camera stays in the room or the corridor, a little off the walls, and out of the furniture
function keepInside(p) {
  const m = 0.18;
  const inHall = p.z > ROOM.z1 - m - 0.05 && p.x > DOOR.x0 && p.x < DOOR.x1;
  if (inHall) {
    p.x = clamp(p.x, DOOR.x0 + m, DOOR.x1 - m);
    p.y = clamp(p.y, 0.3, DOOR.h - 0.1);
    p.z = Math.min(p.z, HALL_END - m);
  } else {
    p.x = clamp(p.x, ROOM.x0 + m, ROOM.x1 - 0.55 - m);      // (the racks along the east wall)
    p.y = clamp(p.y, 0.3, ROOM.h - 0.2);
    p.z = clamp(p.z, ROOM.z0 + m, ROOM.z1 - m);
  }
  for (const b of [DESK, SIDE]) {
    if (p.x > b.x0 - m && p.x < b.x1 + m && p.z > b.z0 - m && p.z < b.z1 + m && p.y < b.y + m) p.y = b.y + m;
  }
}

// A tube along a curve through the given points, rebuilt in place each frame (a fixed number of rings)
class Tube {
  constructor(rings, radius, radial, material) {
    this.rings = rings;
    this.radius = radius;
    this.radial = radial;
    const n = rings * (radial + 1);
    const g = (this.geometry = new THREE.BufferGeometry());
    this.pos = new Float32Array(n * 3);
    this.nor = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < radial; j++) {
        const a = i * (radial + 1) + j, b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)], false, 'centripetal');
    this.curve.arcLengthDivisions = 120;
    this._n = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  update(points) {
    // (points too close together make a kink: drop them)
    const pts = [points[0]];
    for (let i = 1; i < points.length; i++) if (points[i].distanceToSquared(pts[pts.length - 1]) > 1e-5) pts.push(points[i]);
    if (pts.length < 2) return;
    this.curve.points = pts;
    this.curve.needsUpdate = true;
    const along = this.curve.getSpacedPoints(this.rings - 1);
    const n = this._n, b = this._b, tg = this._t, d = this._d;
    tg.subVectors(along[1], along[0]).normalize();
    n.set(0, 1, 0);
    if (Math.abs(tg.y) > 0.9) n.set(1, 0, 0);
    let k = 0;
    for (let i = 0; i < this.rings; i++) {
      const p = along[i];
      if (i < this.rings - 1) tg.subVectors(along[i + 1], p);
      else tg.subVectors(p, along[i - 1]);
      if (tg.lengthSq() < 1e-12) tg.set(0, 1, 0);
      tg.normalize();
      // carried along from the last ring (no twisting)
      n.addScaledVector(tg, -n.dot(tg));
      if (n.lengthSq() < 1e-8) n.set(tg.y, -tg.x, 0);
      n.normalize();
      b.crossVectors(tg, n);
      for (let j = 0; j <= this.radial; j++) {
        const ang = (j / this.radial) * Math.PI * 2;
        d.copy(n).multiplyScalar(Math.cos(ang)).addScaledVector(b, Math.sin(ang));
        this.pos[k] = p.x + d.x * this.radius;
        this.pos[k + 1] = p.y + d.y * this.radius;
        this.pos[k + 2] = p.z + d.z * this.radius;
        this.nor[k] = d.x;
        this.nor[k + 1] = d.y;
        this.nor[k + 2] = d.z;
        k += 3;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }
}

// The short end of the cable hanging from his fist: points joined by fixed lengths (Verlet), under
// gravity, kept off the floor and out of his legs
class Rope {
  constructor(n, length) {
    this.seg = length / (n - 1);
    this.p = Array.from({ length: n }, (_, i) => new THREE.Vector3(0, 1 - i * this.seg, 0));
    this.o = this.p.map((p) => p.clone());
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this.started = false;
  }

  // pin: where its top is held; caps: [a, b, radius] capsules it stays out of
  step(dt, pin, caps, quick = false) {
    if (!this.started) {
      this.started = true;
      for (let i = 0; i < this.p.length; i++) {
        this.p[i].copy(pin).add(this._v.set(0.02 * i, -i * this.seg, 0.01 * i));
        this.o[i].copy(this.p[i]);
      }
    }
    if (dt <= 0) return;
    const sub = quick ? 1 : 2, h = dt / sub;
    for (let s = 0; s < sub; s++) {
      const drag = Math.pow(0.04, h);                  // (a heavy cable: it settles fast)
      for (let i = 1; i < this.p.length; i++) {
        const p = this.p[i], o = this.o[i];
        const vx = (p.x - o.x) * drag, vy = (p.y - o.y) * drag, vz = (p.z - o.z) * drag;
        o.copy(p);
        p.x += vx;
        p.y += vy - 9.8 * h * h;
        p.z += vz;
      }
      this.p[0].copy(pin);
      this.o[0].copy(pin);
      for (let it = 0; it < 6; it++) {
        for (let i = 1; i < this.p.length; i++) {
          const a = this.p[i - 1], b = this.p[i];
          const d = this._v.subVectors(b, a);
          const l = d.length() || 1e-6;
          const diff = (l - this.seg) / l;
          if (i === 1) b.addScaledVector(d, -diff);
          else {
            a.addScaledVector(d, diff * 0.5);
            b.addScaledVector(d, -diff * 0.5);
          }
        }
        this.p[0].copy(pin);
        for (let i = 1; i < this.p.length; i++) {
          const p = this.p[i];
          // the floor (and the floor's friction: a plug on it hardly slides); the last point is the
          // plug's tip, the one before it where the cable joins the plug (it is fatter there)
          const last = this.p.length - 1;
          const r0 = i === last ? 0.018 : i === last - 1 ? 0.03 : CABLE_R;
          if (p.y < r0) {
            p.y = r0;
            this.o[i].x += (p.x - this.o[i].x) * 0.5;
            this.o[i].z += (p.z - this.o[i].z) * 0.5;
          }
          for (const [ca, cb, r] of caps) pushOut(p, ca, cb, r + CABLE_R);
        }
      }
    }
  }
}

// Push a point out of a capsule (segment a-b, radius r)
const _ab = new THREE.Vector3(), _ap = new THREE.Vector3(), _cp = new THREE.Vector3();
function pushOut(p, a, b, r) {
  _ab.subVectors(b, a);
  const u = clamp(_ab.dot(_ap.subVectors(p, a)) / Math.max(1e-6, _ab.lengthSq()));
  const c = _cp.copy(a).addScaledVector(_ab, u);
  const d = _ap.subVectors(p, c);
  const l = d.length();
  if (l < r && l > 1e-6) p.copy(c).addScaledVector(d, r / l);
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

// (for the ending that carries on in this room: level3/SceneB.js)
export { FACE, HOLO, PORT, DESK, ROOM, CABLE_R, keepInside, pushOut };
