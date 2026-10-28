import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Kessler } from '../entities/Kessler.js';
import { CrewMember } from '../entities/CrewMember.js';
import { makeToonRamp, showWound, EYE } from '../entities/Player.js';
import { Person, Walk, Eyes, turnTo, SCALE, clamp, seg, wrap, yawOf, v3 } from './firstPersonRig.js';
import { EyeShader } from '../intro/intro-cinematic.js';
import { precompile } from '../core/precompile.js';
import { settings } from '../core/Settings.js';

// Flashback 1, "The briefing" (docs/cutscenes-flashbacks-plan.md, section 2). A torn photograph on
// the Level 1 lift's wall gives Voss a headache, and the memory plays through his eyes: a warm
// conference room on the mainland, years ago. A man (never named, his face a blur) briefs four
// blurred colleagues and Voss. Everything he says is muffled except two passages: the bacterium,
// and Halcyon-9. The room cheers, drifts over to the window, arms go round shoulders, and the
// speaker takes their picture. At the flash the picture itself fills the screen (torn where Voss
// stood, the faces stained out), then the lift comes back.
//
// The same contract as Flashback3D (Level 2): play() resolves when it is over; Enter skips it
// after the first couple of seconds; the game's renderer draws this scene instead of the level
// while it runs (render(), no second WebGL context); dispose() frees everything.
//
//   headache(composer)   the transition in the lift: blur, heartbeat, white-out (before play())
//   preload(renderer)    build the room and the people, decode the recordings, compile the shaders
//   play()               the memory, then the photograph, then the fade back to the lift
//
// The crew are their own models (CrewMember: kessler.glb, lindqvist.glb, navarro.glb, park.glb, all
// on Voss's skeleton, so his clips fit them too); the speaker is a copy of Level 1's Voss in other
// clothes. Every face is blank and blurred: no face is ever seen here. Voss himself is a copy too, without a
// head: the camera is at his eyes, so his own arms (on the table, round a shoulder) are his real
// arms, posed by ArmIK, and the walk's bob is his real walk.
//
// The timeline is built from the recordings' real lengths (public/assets/audio/flashback1/), so a
// new take moves the scene with it. Passages A and B are played whole; the muffled clips around
// them are overlapped and trimmed, as nobody can make them out.

const AUDIO = './assets/audio/flashback1/';
export const BRIEFING_PHOTO = './assets/textures/flashback1/briefing-photo.webp';
const CLIPS = ['fb1-speaker-1', 'fb1-speaker-a', 'fb1-speaker-2', 'fb1-speaker-b', 'fb1-speaker-3', 'fb1-speaker-photo', 'fb1-room-cheer', 'fb1-room-photo'];
// Their lengths as recorded (s): used until (or if) the files themselves cannot be decoded
const FALLBACK_LENGTHS = {
  'fb1-speaker-1': 6.84, 'fb1-speaker-a': 11.23, 'fb1-speaker-2': 10.53, 'fb1-speaker-b': 6.61,
  'fb1-speaker-3': 8.05, 'fb1-speaker-photo': 8.59, 'fb1-room-cheer': 8.04, 'fb1-room-photo': 1.54
};

// The two passages that come through, as subtitles: each card's share of the passage follows its
// share of the words
const PASSAGE_A = [
  '…A bacterium, found in the vents at the bottom of the trench.',
  "It doesn't just make electricity. It answers it. Bends it.",
  'Nothing we know of does that…'
];
const PASSAGE_B = [
  '…Which is why Halcyon-9 sits right above the vent field.',
  "That's where you'll be working. All of you…"
];

const PHOTO_HOLD = 3.0;     // the photograph on screen after the flash (s)
const PHOTO_FADE = 0.9;     // then it fades to the lift
const SKIP_AFTER = 2.0;     // Enter skips from this long in
const RENDER_SCALE = 0.75;  // the memory is soft anyway: drawn at three quarters of the resolution

const MUFFLED_HZ = 330;     // the low-pass on everything but A and B: voices, but no words
const CLEAR_HZ = 7500;

const SEAT_Y = 0.46;
const TABLE_Y = 0.74;


// Who is who: where they sit (hips, on the floor plan), the way their chair faces, and where they
// end up for the photograph (in a line in front of the window on the back wall, facing the
// speaker at the front). Voss is at the end of the line: that is the part of the print torn off.
const CAST = {
  voss:      { seat: [0, 1.95], face: [0, -1], spot: [-1.3, 2.55] },
  lindqvist: { seat: [-0.7, 1.36], face: [0.89, -0.45], spot: [-0.68, 2.55], coat: 0xd9ccb2, shirt: 0x8a6f5a, pants: 0x3d3833, hair: 0xe6c67c, skin: 0xf2d2bf },
  kessler:   { seat: [0.62, 1.42], face: [-0.89, -0.45], spot: [0.36, 2.55], coat: 0x46645a, shirt: 0xd8d2c4, pants: 0x2e2d2b, hair: 0xc2471c, skin: 0xf0c9b2 },
  navarro:   { seat: [-0.8, 0.3], face: [0.89, -0.45], spot: [-0.16, 2.55], coat: 0x7a3b3a, shirt: 0xe8e2d6, pants: 0x34302c, hair: 0x2b1d15, skin: 0xc99b79 },
  park:      { seat: [0.8, 0.3], face: [-0.89, -0.45], spot: [0.88, 2.55], coat: 0x34465f, shirt: 0xcfd6dc, pants: 0x262a30, hair: 0x151515, skin: 0xe2ba96, glasses: true },
  speaker:   { stand: [-0.95, -1.95], spot: [-0.15, -1.72], coat: 0x3b3b42, shirt: 0xe9e6df, pants: 0x2b2b30, hair: 0x9b9893, skin: 0xd9b29b, glasses: true }
};
// (left to right along the line as Voss sees it, standing in it: his neighbour first)
const LINE = ['voss', 'lindqvist', 'navarro', 'kessler', 'park'];
// Who has a model of their own (CrewMember; Kessler's is loaded as before). Their clothes are their
// own; the colours above stay for their skin and for a stand-in, should a file fail to load.
const OWN_MODELS = ['lindqvist', 'navarro', 'park'];

// ---------------------------------------------------------------------------------------------
// The look: the scene (drawn at RENDER_SCALE) through one full-screen pass. A soft focus over
// everything, a heavy blur over every face, a warm grade, film grain, Voss's blinks (the edges go
// dark for a moment), and the white the memory comes out of.
// ---------------------------------------------------------------------------------------------
const HEADS = 5;
const LOOK = {
  uniforms: {
    tScene: { value: null }, uTime: { value: 0 }, uWhite: { value: 1 }, uBlink: { value: 0 },
    uSoft: { value: 1 }, uAspect: { value: 1 }, uHeads: { value: Array.from({ length: HEADS }, () => new THREE.Vector3()) }
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tScene; uniform float uTime, uWhite, uBlink, uSoft, uAspect;
    uniform vec3 uHeads[${HEADS}];
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // twelve taps on a spiral: a cheap, smooth disc blur (as the opening's waking eyes)
    vec3 disc(vec2 uv, float r) {
      vec3 sum = texture2D(tScene, uv).rgb; float total = 1.0;
      for (int i = 1; i < 12; i++) {
        float fi = float(i); float a = fi * 2.39996;
        vec2 off = vec2(cos(a) / uAspect, sin(a)) * r * sqrt(fi / 12.0);
        float w = 1.0 - 0.5 * fi / 12.0;
        sum += texture2D(tScene, uv + off).rgb * w; total += w;
      }
      return sum / total;
    }
    // five taps: the soft focus over the rest of the room (cheap)
    vec3 soft(vec2 uv, float r) {
      vec2 o = vec2(r / uAspect, r) * 0.7;
      return (texture2D(tScene, uv).rgb * 2.0 + texture2D(tScene, uv + o).rgb + texture2D(tScene, uv - o).rgb
        + texture2D(tScene, uv + vec2(o.x, -o.y)).rgb + texture2D(tScene, uv + vec2(-o.x, o.y)).rgb) / 6.0;
    }
    void main() {
      vec2 uv = vUv + 0.0018 * vec2(sin(uTime * 0.9), cos(uTime * 1.3));
      // faces: x, y on screen (0..1) and radius (in screen heights); 0 radius: none. The nearer
      // the face (the bigger on screen), the wider the blur
      float blur = 0.0035 * uSoft;
      for (int i = 0; i < ${HEADS}; i++) {
        vec3 h = uHeads[i];
        if (h.z <= 0.0) continue;
        float d = length((uv - h.xy) * vec2(uAspect, 1.0));
        blur = max(blur, smoothstep(h.z, h.z * 0.45, d) * clamp(h.z * 0.35, 0.03, 0.06));
      }
      vec3 c = blur > 0.0045 ? disc(uv, blur) : soft(uv, blur);   // (the heavy blur on faces only)
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c += c * smoothstep(0.55, 1.0, l) * 0.35;                    // a glow round the bright parts
      c = mix(vec3(l), c, 0.82) * vec3(1.07, 0.98, 0.84);          // warm, a little faded
      c = c / (1.0 + 0.22 * c);                                     // a gentle shoulder (no tone mapping in Level 1)
      vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
      float r = length(q);
      c *= mix(1.0, smoothstep(1.05, 0.25, r), 0.45);               // vignette
      c *= 1.0 - uBlink * smoothstep(0.15 - 0.15 * uBlink, 0.75, r * (1.0 + uBlink)); // a blink: the edges go dark
      c += (hash(vUv * 731.0 + fract(uTime)) - 0.5) * 0.035;        // grain
      c = mix(c, vec3(1.0, 0.985, 0.95), uWhite);
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`
};

// The slides behind the speaker: a title, the organism, the station. Each is a canvas; the
// organism's pulses travel out along its tendrils in the shader.
const SCREEN = {
  uniforms: { tA: { value: null }, tB: { value: null }, tC: { value: null }, uSlide: { value: 0 }, uTime: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tA, tB, tC; uniform float uSlide, uTime;
    varying vec2 vUv;
    void main() {
      vec3 a = texture2D(tA, vUv).rgb, b = texture2D(tB, vUv).rgb, c = texture2D(tC, vUv).rgb;
      float d = length((vUv - vec2(0.5, 0.48)) * vec2(1.78, 1.0));
      float p = pow(0.5 + 0.5 * sin(d * 22.0 - uTime * 2.4), 6.0);
      float tendril = smoothstep(0.25, 0.8, b.g);
      b += tendril * p * vec3(0.35, 1.0, 0.75);                    // mint pulses, outward
      b *= 0.85 + 0.15 * sin(uTime * 0.8);                          // the violet glow breathes
      vec3 col = mix(a, b, clamp(uSlide, 0.0, 1.0));
      col = mix(col, c, clamp(uSlide - 1.0, 0.0, 1.0));
      gl_FragColor = vec4(col * 1.25, 1.0);
    }`
};

const STYLE = `
#fb1-root { position: fixed; inset: 0; z-index: 60; pointer-events: none; font-family: 'Segoe UI', Arial, sans-serif; }
#fb1-white { position: absolute; inset: 0; background: #fffaf2; opacity: 0; }
#fb1-sub { position: absolute; left: 50%; bottom: 9vh; transform: translateX(-50%); max-width: min(46rem, 86vw);
  text-align: center; color: #fff7ea; font-size: clamp(1rem, 1.7vw, 1.45rem); line-height: 1.45; letter-spacing: 0.01em;
  text-shadow: 0 0 6px rgba(0,0,0,0.9), 0 2px 12px rgba(0,0,0,0.7); opacity: 0; transition: opacity 0.35s; font-style: italic; }
#fb1-sub.on { opacity: 1; }
#fb1-hint { position: absolute; right: 1.2rem; bottom: 1rem; font-size: 0.72rem; letter-spacing: 0.15rem; color: #fff1dc;
  opacity: 0; transition: opacity 0.4s; text-shadow: 0 0 4px #000; }
#fb1-photo { position: absolute; inset: 0; background: #070605; opacity: 0; display: flex; align-items: center; justify-content: center; }
#fb1-photo img { max-width: 80vw; max-height: 78vh; transform: rotate(-1.6deg) scale(1.04); box-shadow: 0 12px 50px rgba(0,0,0,0.75);
  transition: transform 3.6s ease-out; }
#fb1-photo.on img { transform: rotate(-1.2deg) scale(1); }
body.fb1 #ui-layer, body.fb1 .fps-counter { visibility: hidden !important; }
`;

export class BriefingFlashback {
  // root: where the overlay goes (null: none, for the photo tool); source: Level 1's Voss (a
  // loaded Player: bodyRoot and clips)
  constructor(source, { root = document.body } = {}) {
    this.source = source;
    this.root = root;
    this.running = false;
    this.ready = false;
    this.t = 0;
    this.stats = { frames: 0, seconds: 0, worst: 0 };
    this._onKey = (e) => {
      if (!this.running || e.code !== 'Enter' || this.t < SKIP_AFTER) return;
      e.preventDefault();
      e.stopPropagation();
      this._skip = true;
    };
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._size = new THREE.Vector2();
    this.T = this._timeline(FALLBACK_LENGTHS);
  }

  // ------------------------------------------------------------------ loading
  // Build everything; resolves when it can play. (Safe to call more than once.)
  preload(renderer) {
    this._loading ||= this._load(renderer).then(() => { this.ready = true; });
    return this._loading;
  }

  async _load(renderer) {
    if (!this.source?.bodyRoot || !this.source.clips) throw new Error('Voss is not loaded');
    const audio = this._loadAudio().catch((e) => console.warn('Flashback 1: no sound.', e));
    const photo = this._loadPhoto();
    // (without her file, Kessler is a copy of Voss's body, as the speaker is; so is any crewmate whose
    // file does not load)
    const crew = Promise.all(OWN_MODELS.map((n) => new CrewMember(n).load().catch((e) => {
      console.warn(`Flashback 1: ${n}.glb did not load; a copy of Voss stands in.`, e);
      return null;
    })));
    this.kesslerSrc = await new Kessler().load().catch((e) => {
      console.warn('Flashback 1: kessler.glb did not load; she wears a copy of Voss.', e);
      return null;
    });
    this.crewSrc = Object.fromEntries((await crew).map((c, i) => [OWN_MODELS[i], c]));
    this._build();
    await audio;
    this.T = this._timeline(this.lengths || FALLBACK_LENGTHS);
    this._script();
    await photo;
    if (renderer) await this._compile(renderer);
  }

  async _loadAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ac = new AC();
    this.buffers = new Map();
    this.lengths = { ...FALLBACK_LENGTHS };
    await Promise.all(CLIPS.map(async (clip) => {
      try {
        const r = await fetch(AUDIO + clip + '.mp3');
        if (!r.ok) return;
        const buffer = await this.ac.decodeAudioData(await r.arrayBuffer());
        this.buffers.set(clip, buffer);
        this.lengths[clip] = buffer.duration;
      } catch (e) {
        console.warn('Flashback 1: could not load', clip, e);
      }
    }));
  }

  _loadPhoto() {
    if (!this.root) return Promise.resolve();
    const img = (this.photoImg = new Image());
    img.decoding = 'async';
    img.alt = '';
    img.src = BRIEFING_PHOTO;
    return img.decode().catch(() => console.warn('Flashback 1: the photograph did not load.'));
  }

  // Everything the timeline hangs on, from the recordings' lengths (s from the start)
  _timeline(len) {
    const T = {};
    T.spk1 = 0.25;                                  // muffled, cut short under A
    T.a0 = 3.4;                                     // passage A, whole
    T.a1 = T.a0 + len['fb1-speaker-a'];
    T.spk2 = T.a1 - 0.15;                           // muffled: only its last 4.6 s
    T.spk2From = Math.max(0, len['fb1-speaker-2'] - 4.6);
    T.slide2 = T.a1 + 0.5;                          // the station schematic
    T.nudge = T.a1 + 1.0;                           // Lindqvist nudges his arm
    T.b0 = T.a1 + 3.9;                              // passage B, whole
    T.b1 = T.b0 + len['fb1-speaker-b'];
    T.cheer = T.b1 - 0.25;
    T.spk3 = T.b1 + 0.45;
    T.spk3From = Math.min(1.2, len['fb1-speaker-3'] * 0.15);
    T.photoVoice = T.b1 + 2.3;                      // "...over by the window... one, two, three": its last 5.6 s
    T.photoFrom = Math.max(0, len['fb1-speaker-photo'] - 5.6);
    T.flash = T.photoVoice + (len['fb1-speaker-photo'] - T.photoFrom) - 0.35;   // on "three"
    T.halcyon = T.flash - 1.05;                     // the room: "Halcyon!" (the shutter catches it)
    T.end = T.flash;
    return T;
  }

  // ------------------------------------------------------------------ the room
  _build() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x2a2018);
    this.camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 20);
    this.ramp = makeToonRamp();
    this._mats = [];
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

  _toon(color, emissive = 0x000000) {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: this.ramp, emissive });
    this._mats.push(m);
    return m;
  }

  _canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this._textures.push(tex);
    return tex;
  }

  // A small conference room on the mainland, warm afternoon light: the table down the middle,
  // the screen on the front wall (-z), the window on the back wall (+z)
  _room() {
    const scene = this.scene;
    const box = (w, h, d, mat, x, y, z, parent = scene) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const wall = this._toon(0xcbb595), wood = this._toon(0x6e4a2c), carpet = this._toon(0x5e5044);
    const ceiling = this._toon(0xe6dccb), trim = this._toon(0x8a6544), dark = this._toon(0x2e2a28), fabric = this._toon(0x5a4436);
    // shell: x -2.8..2.8, z -2.6..3.0, 2.7 high
    box(5.6, 0.1, 5.6, carpet, 0, -0.05, 0.2);
    box(5.6, 0.1, 5.6, ceiling, 0, 2.75, 0.2);
    box(5.6, 2.7, 0.1, wall, 0, 1.35, -2.65);
    box(0.1, 2.7, 5.6, wall, -2.85, 1.35, 0.2);
    box(0.1, 2.7, 5.6, wall, 2.85, 1.35, 0.2);
    // the back wall, round the window (x -1.6..1.4, y 0.95..2.3)
    box(1.2, 2.7, 0.1, wall, -2.2, 1.35, 3.05);
    box(1.4, 2.7, 0.1, wall, 2.1, 1.35, 3.05);
    box(3.0, 0.95, 0.1, wall, -0.1, 0.475, 3.05);
    box(3.0, 0.4, 0.1, wall, -0.1, 2.5, 3.05);
    // wainscot and a picture rail, all round
    box(5.6, 0.9, 0.04, wood, 0, 0.45, -2.58);
    box(0.04, 0.9, 5.6, wood, -2.78, 0.45, 0.2);
    box(0.04, 0.9, 5.6, wood, 2.78, 0.45, 0.2);
    box(5.6, 0.05, 0.05, trim, 0, 2.2, -2.58);
    box(0.05, 0.05, 5.6, trim, -2.78, 2.2, 0.2);
    box(0.05, 0.05, 5.6, trim, 2.78, 2.2, 0.2);
    // the window: a bright afternoon over the sea, the blinds half up; sill and frame
    const sky = this._canvasTexture(512, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#f4d9b0');
      grad.addColorStop(0.55, '#fbe8c8');
      grad.addColorStop(0.6, '#c9b8a0');
      grad.addColorStop(1, '#9c9384');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120, 104, 90, 0.55)';            // the coast across the water
      g.beginPath();
      g.moveTo(0, h * 0.6);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.6 - 6 - 10 * Math.abs(Math.sin(x * 0.013)) - 6 * Math.sin(x * 0.051));
      g.lineTo(w, h * 0.6);
      g.fill();
      g.fillStyle = 'rgba(210, 180, 140, 0.9)';            // the blinds
      for (let y = 0; y < h * 0.28; y += 9) g.fillRect(0, y, w, 6);
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 1.35), new THREE.MeshBasicMaterial({ map: sky, color: 0xfff2dc }));
    this._mats.push(glass.material);
    glass.position.set(-0.1, 1.625, 3.04);
    glass.rotation.y = Math.PI;
    scene.add(glass);
    box(3.1, 0.06, 0.2, trim, -0.1, 0.94, 2.98);
    box(0.06, 1.4, 0.08, trim, -0.1, 1.625, 3.0);
    // the screen on the front wall, with its slides
    const slides = this._slides();
    const scr = new THREE.ShaderMaterial({ ...SCREEN, uniforms: THREE.UniformsUtils.clone(SCREEN.uniforms) });
    scr.uniforms.tA.value = slides[0];
    scr.uniforms.tB.value = slides[1];
    scr.uniforms.tC.value = slides[2];
    this._mats.push(scr);
    this.screenMat = scr;
    box(2.14, 1.26, 0.05, dark, 0.3, 1.55, -2.6);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.125), scr);
    screen.position.set(0.3, 1.55, -2.57);
    scene.add(screen);
    this.screenCentre = v3(0.3, 1.55, -2.57);
    // the table and the chairs
    box(1.1, 0.05, 2.6, wood, 0, TABLE_Y - 0.025, 0.15);
    for (const [x, z] of [[-0.48, -1.08], [0.48, -1.08], [-0.48, 1.38], [0.48, 1.38]]) box(0.06, TABLE_Y - 0.05, 0.06, dark, x, (TABLE_Y - 0.05) / 2, z);
    for (const [name, c] of Object.entries(CAST)) {
      if (!c.seat) continue;
      const chair = new THREE.Group();
      chair.position.set(c.seat[0], 0, c.seat[1]);
      chair.rotation.y = yawOf(c.face[0], c.face[1]);
      box(0.46, 0.07, 0.44, fabric, 0, SEAT_Y - 0.035, 0.02, chair);
      box(0.44, 0.5, 0.06, fabric, 0, SEAT_Y + 0.3, 0.23, chair);
      box(0.05, SEAT_Y - 0.07, 0.05, dark, 0, (SEAT_Y - 0.07) / 2, 0.02, chair);
      box(0.4, 0.03, 0.05, dark, 0, 0.02, 0.02, chair);
      scene.add(chair);
      if (name === 'voss') this.vossChair = chair;
    }
    // a few things on the table: papers, cups, a jug
    const paper = this._toon(0xf1ebde), cup = this._toon(0xe9e3d8);
    for (const [x, z, r] of [[0.28, 1.0, 0.2], [-0.3, 0.95, -0.15], [0.3, -0.2, 0.1], [-0.32, -0.15, 0.3], [0.05, 1.32, 0.05]]) {
      const p = box(0.21, 0.004, 0.29, paper, x, TABLE_Y + 0.002, z);
      p.rotation.y = r;
    }
    for (const [x, z] of [[0.42, 0.72], [-0.42, 0.66], [0.4, -0.45], [-0.4, -0.4]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.09, 10), cup);
      c.position.set(x, TABLE_Y + 0.045, z);
      scene.add(c);
    }
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.22, 12), this._toon(0xbcd3d6, 0x10181a));
    jug.position.set(0, TABLE_Y + 0.11, -0.55);
    scene.add(jug);
    // a plant in the corner by the window, and ceiling lights
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.36, 10), this._toon(0x7b5a3e));
    pot.position.set(2.4, 0.18, 2.6);
    scene.add(pot);
    const leaves = this._toon(0x4f6b38);
    for (const [x, y, z, r] of [[2.4, 0.62, 2.6, 0.26], [2.3, 0.85, 2.52, 0.2], [2.5, 0.8, 2.68, 0.18]]) {
      const l = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaves);
      l.position.set(x, y, z);
      scene.add(l);
    }
    const panel = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
    this._mats.push(panel);
    for (const z of [-1.2, 1.2]) box(1.0, 0.03, 0.5, panel, 0, 2.69, z);

    // the light (every light is here from the start: the shaders are compiled for these)
    const sun = new THREE.DirectionalLight(0xffdcae, 2.4);
    sun.position.set(-0.6, 2.6, 5.5);
    sun.target.position.set(0.2, 0.6, -1);
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(0xfff0dc, 0x4a3a2c, 1.5));
    for (const z of [-1.2, 1.2]) {
      const p = new THREE.PointLight(0xffd29a, 3.2, 6, 1.6);
      p.position.set(0, 2.5, z);
      scene.add(p);
    }
    this.screenGlow = new THREE.PointLight(0x9fe2d2, 0.6, 3.5, 1.6);
    this.screenGlow.position.set(0.3, 1.5, -2.1);
    // the camera's flash (the photograph's light)
    this.flashLight = new THREE.PointLight(0xfff6ea, 0, 9, 1.2);
    scene.add(this.screenGlow, this.flashLight);
  }

  // The slides: the project's title card, the organism (as in the lab: branching tendrils, mint
  // pulses, a violet glow; younger and smaller here), and the station over the vent field
  _slides() {
    const W = 1024, H = 576;
    const title = this._canvasTexture(W, H, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0d2a3a');
      grad.addColorStop(1, '#06141d');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(140, 220, 230, 0.75)';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(W / 2, H / 2 - 30, 90, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 3; i++) {                   // waves through the circle
        g.beginPath();
        for (let x = -80; x <= 80; x += 4) g.lineTo(W / 2 + x, H / 2 - 30 + i * 28 - 20 + 9 * Math.sin(x * 0.07 + i));
        g.stroke();
      }
      g.fillStyle = 'rgba(200, 235, 240, 0.8)';
      g.fillRect(W / 2 - 160, H / 2 + 110, 320, 10);
      g.fillRect(W / 2 - 110, H / 2 + 140, 220, 8);
    });
    const organism = this._canvasTexture(W, H, (g) => {
      g.fillStyle = '#05040c';
      g.fillRect(0, 0, W, H);
      const glow = g.createRadialGradient(W / 2, H * 0.48, 10, W / 2, H * 0.48, 330);
      glow.addColorStop(0, 'rgba(150, 70, 255, 0.75)');
      glow.addColorStop(0.5, 'rgba(90, 30, 170, 0.3)');
      glow.addColorStop(1, 'rgba(20, 0, 40, 0)');
      g.fillStyle = glow;
      g.fillRect(0, 0, W, H);
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const branch = (x, y, a, len, width, depth) => {
        if (depth === 0 || len < 6) return;
        const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
        g.strokeStyle = `rgba(120, 255, 205, ${0.35 + depth * 0.09})`;
        g.lineWidth = width;
        g.shadowColor = 'rgba(110, 255, 210, 0.9)';
        g.shadowBlur = 12;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5, x2, y2);
        g.stroke();
        const n = 2 + (rnd() < 0.3 ? 1 : 0);
        for (let i = 0; i < n; i++) branch(x2, y2, a + (rnd() - 0.5) * 1.3, len * (0.62 + rnd() * 0.18), width * 0.7, depth - 1);
      };
      for (let i = 0; i < 7; i++) branch(W / 2, H * 0.48, (i / 7) * Math.PI * 2 + 0.3, 70 + rnd() * 30, 7, 6);
      g.shadowBlur = 30;
      g.fillStyle = 'rgba(210, 255, 240, 0.95)';
      g.beginPath();
      g.arc(W / 2, H * 0.48, 16, 0, Math.PI * 2);
      g.fill();
    });
    const station = this._canvasTexture(W, H, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0b2636');
      grad.addColorStop(1, '#020a10');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(150, 225, 240, 0.85)';
      g.fillStyle = 'rgba(150, 225, 240, 0.85)';
      g.lineWidth = 3;
      // the sea floor and the vent field, its plumes rising
      g.beginPath();
      g.moveTo(0, H * 0.82);
      for (let x = 0; x <= W; x += 20) g.lineTo(x, H * 0.82 + 12 * Math.sin(x * 0.02) + (Math.abs(x - W / 2) < 200 ? -20 * Math.cos((x - W / 2) * 0.0078) : 0));
      g.stroke();
      g.strokeStyle = 'rgba(255, 170, 110, 0.7)';
      for (const x of [-150, -60, 40, 120, 180]) {
        g.beginPath();
        g.moveTo(W / 2 + x, H * 0.79);
        for (let y = 0; y < 90; y += 6) g.lineTo(W / 2 + x + 8 * Math.sin(y * 0.15 + x), H * 0.79 - y);
        g.stroke();
      }
      // the station above it: a hub, two wings, the legs down
      g.strokeStyle = 'rgba(150, 225, 240, 0.9)';
      g.lineWidth = 4;
      g.strokeRect(W / 2 - 70, H * 0.36, 140, 70);
      g.strokeRect(W / 2 - 230, H * 0.4, 150, 44);
      g.strokeRect(W / 2 + 80, H * 0.4, 150, 44);
      g.beginPath();
      g.arc(W / 2, H * 0.36, 40, Math.PI, 0);
      g.stroke();
      for (const x of [-200, -40, 40, 200]) {
        g.beginPath();
        g.moveTo(W / 2 + x, H * 0.48);
        g.lineTo(W / 2 + x * 1.15, H * 0.76);
        g.stroke();
      }
      g.font = 'bold 44px Arial, sans-serif';
      g.textAlign = 'center';
      g.fillText('HALCYON-9', W / 2, H * 0.2);
      g.font = '22px Arial, sans-serif';
      g.fillText('DEEP SEA RESEARCH STATION', W / 2, H * 0.2 + 34);
    });
    return [title, organism, station];
  }

  // The people: copies of Voss's body in their own clothes, with blank faces (and blurred, in the
  // look's pass). Voss's copy has no head: the camera is there.
  _cast() {
    this.people = {};
    for (const [name, c] of Object.entries(CAST)) {
      const own = name === 'kessler' ? this.kesslerSrc : this.crewSrc?.[name] || null;
      const model = cloneSkinned(own ? own.model : this.source.bodyRoot);
      model.position.set(0, 0, 0);
      model.scale.setScalar(SCALE);
      model.rotation.set(0, Math.PI, 0);         // the model faces +z; the person faces -z
      if (own && name === 'kessler') this._dressKessler(model, c);
      else if (own) this._dressCrew(model);
      else this._dress(model, name === 'voss' ? null : c);
      const p = new Person(name, model, own ? own.clips : this.source.clips);
      this.people[name] = p;
      this.scene.add(p.group);
    }
    // (their copies have their own materials: the loaded files' go; the files themselves stay cached
    // for the later flashbacks)
    for (const src of [this.kesslerSrc, ...Object.values(this.crewSrc || {})]) src?.dispose();
    this.kesslerSrc = null;
    this.crewSrc = null;
    const voss = this.people.voss;
    // where his eyes are, on his head bone (so the head's own motion carries the camera)
    voss.group.updateMatrixWorld(true);
    const eye = voss.model.localToWorld(EYE.clone());
    this.eyeLocal = voss.b.head.worldToLocal(eye);
    // the hip height standing, for how far a person drops to sit
    voss.b.lThigh.getWorldPosition(this._v);
    this.drop = Math.max(0.2, this._v.y - (SEAT_Y + 0.09));

    // the speaker's camera: a small black body and a lens, in his hands at the end
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.085, 0.07), this._toon(0x1c1c1e));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.06, 12), this._toon(0x101012));
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.06;
    this.cameraProp = new THREE.Group();
    this.cameraProp.add(body, lens);
    this.cameraProp.visible = false;
    this.scene.add(this.cameraProp);
  }

  // Their own materials: clothes in their colours, hair, a blank face (no features at all)
  _dress(model, look) {
    const made = new Map();
    const hide = new Set(['M_MouthInner', 'M_Teeth', 'M_LipSeal', 'M_WoundSkin', 'M_WoundRim', 'M_Wound', 'M_WoundPort']);
    showWound(model, false);
    model.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material;
      const name = src.name;
      if (!look) {
        // Voss: no head, no hair, no glasses (the camera is where they would be)
        if (/M_Head|M_Hair|M_Glasses|M_Mouth|M_Teeth|M_LipSeal|M_Wound/.test(name)) { o.visible = false; return; }
        o.frustumCulled = false;
      } else if (hide.has(name) || (!look.glasses && name.startsWith('M_Glasses'))) {
        o.visible = false;
        return;
      }
      if (!made.has(name)) {
        let m;
        if (look && name === 'M_Head') {
          // the face: one flat, unlit colour, so no feature of the head's shape can catch the
          // light (and the look's pass blurs it on top)
          m = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.72), side: THREE.DoubleSide });
          m.name = name;
        } else {
          m = src.clone();
          m.onBeforeCompile = src.onBeforeCompile;
        }
        if (look) {
          const tint = { M_Coat: look.coat, M_Shirt: look.shirt, M_Pants: look.pants }[name];
          if (tint !== undefined) m.color.setHex(tint);
          // (Voss's clothes carry his name badge: on theirs it is too soft to read)
          if (tint !== undefined && m.map) m.map = this._softMap(m.map);
          if (name === 'M_Hands') m.color.setHex(look.skin).multiplyScalar(1.1);
          if (name === 'M_HairCards' || name === 'M_HairPatch') {
            m.color.setHex(look.hair).multiplyScalar(1.6);
            m.emissive = new THREE.Color(look.hair).multiplyScalar(0.25);
          }
        }
        this._mats.push(m);
        made.set(name, m);
      }
      o.material = made.get(name);
    });
  }

  // Kessler as she is (white coat, slate shirt, red tie, red curls), but with no face: one flat,
  // unlit colour for her head, and no eyes
  _dressKessler(model, look) {
    const made = new Map();
    const gone = [];                 // (no eyes: taken out, as their loaded material is disposed)
    model.traverse((o) => {
      if (!o.isMesh) return;
      let part = o;
      while (part.parent && part.parent !== model && !['Head', 'Eyes', 'Hands', 'Body', 'Glasses', 'Hair'].includes(part.name)) part = part.parent;
      if (part.name === 'Eyes') { gone.push(o); return; }
      const key = part.name === 'Head' ? 'face' : o.material;
      if (!made.has(key)) {
        let m;
        if (key === 'face') {
          m = new THREE.MeshBasicMaterial({ color: new THREE.Color(look.skin).multiplyScalar(0.72), side: THREE.DoubleSide });
        } else {
          m = o.material.clone();
          m.onBeforeCompile = o.material.onBeforeCompile;
        }
        this._mats.push(m);
        made.set(key, m);
      }
      o.material = made.get(key);
      o.frustumCulled = false;
    });
    for (const o of gone) o.removeFromParent();
  }

  // Lindqvist, Navarro and Park in their own clothes, with no face: their heads unlit, in their
  // texture's colours with every detail softened away (their hair stays its colour, the face is one
  // smooth patch of skin; the look's pass blurs it on top), and no eyes
  _dressCrew(model) {
    const made = new Map();
    const gone = [];                 // (no eyes: taken out, as their loaded material is disposed)
    model.traverse((o) => {
      if (!o.isMesh) return;
      let part = o;
      while (part.parent && part.parent !== model && !['Head', 'Eyes', 'Hands', 'Body', 'Glasses', 'Hair'].includes(part.name)) part = part.parent;
      if (part.name === 'Eyes') { gone.push(o); return; }
      const key = part.name === 'Head' ? 'face' : o.material;
      if (!made.has(key)) {
        let m;
        if (key === 'face') {
          m = new THREE.MeshBasicMaterial({ color: 0xb8b0a8, map: this._softMap(o.material.map), side: THREE.DoubleSide });
        } else {
          m = o.material.clone();
          m.onBeforeCompile = o.material.onBeforeCompile;
        }
        this._mats.push(m);
        made.set(key, m);
      }
      o.material = made.get(key);
      o.frustumCulled = false;
    });
    for (const o of gone) o.removeFromParent();
  }

  // A copy of a texture with its detail softened away (scaled right down, then up again): the
  // folds' shading stays, any lettering goes. One copy per texture.
  _softMap(map) {
    this._soft ||= new Map();
    if (this._soft.has(map)) return this._soft.get(map);
    const img = map.image;
    let tex = null;
    if (img?.width) {
      const small = document.createElement('canvas');
      small.width = small.height = 40;
      small.getContext('2d').drawImage(img, 0, 0, 40, 40);
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(small, 0, 0, 256, 256);
      tex = new THREE.CanvasTexture(c);
      tex.colorSpace = map.colorSpace;
      tex.flipY = map.flipY;
      tex.wrapS = map.wrapS;
      tex.wrapT = map.wrapT;
      tex.channel = map.channel;
      this._textures.push(tex);
    }
    this._soft.set(map, tex);
    return tex;
  }

  async _compile(renderer) {
    this.camera.position.set(0, 1.2, 1.95);
    this.camera.lookAt(this.screenCentre);
    this._animate(0, 0);
    this.target.setSize(64, 36);
    await precompile(renderer, this.scene, this.camera, this.target);
    renderer.compile(this.postScene, this.postCam);
  }

  // ------------------------------------------------------------------ the script
  // Who goes where and when (the times from the timeline)
  _script() {
    const T = this.T, P = this.people;
    // standing up and the walks to the window: the far ones lead, Voss passes behind the near
    // chairs before Lindqvist steps back to her place beside him
    const plan = {
      kessler: { stand: T.b1 + 0.3, walk: [T.b1 + 1.3, T.b1 + 3.0], via: [[0.75, 2.05]] },
      park: { stand: T.b1 + 0.5, walk: [T.b1 + 1.4, T.b1 + 4.1], via: [[1.25, 0.9], [1.2, 2.05]] },
      navarro: { stand: T.b1 + 0.2, walk: [T.b1 + 0.9, T.b1 + 3.6], via: [[-1.3, 0.75], [-1.3, 1.85], [-0.6, 2.3]] },
      voss: { stand: T.b1 + 1.0, walk: [T.b1 + 2.1, T.flash - 2.9], via: [[-0.35, 2.25], [-0.9, 2.3]] },
      lindqvist: { stand: T.b1 + 0.45, walk: [T.flash - 3.1, T.flash - 2.0], via: [[-0.72, 2.0]] }
    };
    for (const [name, p] of Object.entries(plan)) {
      const c = CAST[name];
      const fx = c.face[0], fz = c.face[1];
      // stood up, the chair pushed back a little
      const up = [c.seat[0] - fx * 0.22, c.seat[1] - fz * 0.22];
      p.up = up;
      p.yaw0 = yawOf(fx, fz);
      p.path = new Walk([up, ...p.via, c.spot], p.walk[0], p.walk[1]);
      P[name].plan = p;
    }
    P.speaker.plan = { path: new Walk([CAST.speaker.stand, [-0.6, -1.9], CAST.speaker.spot], T.b1 + 0.4, T.b1 + 2.4, 0.5) };

    // where Voss looks: [from, what]. What he looks at is led by the room, and his eyes wander
    // a little on their own between
    const at = (who, up = 0.08) => (out) => P[who].at('head', out, up);
    const screen = (dx = 0, dy = 0) => (out) => out.copy(this.screenCentre).add(this._v3.set(dx, dy, 0));
    // where he is going: a few steps along the way his body faces, a little below eye level
    const ahead = (out) => {
      const v = P.voss;
      return out.set(v.pos.x - Math.sin(v.yaw) * 3, 1.35, v.pos.z - Math.cos(v.yaw) * 3);
    };
    const lens = (out) => out.copy(this.cameraProp.visible ? this.cameraProp.position : P.speaker.at('head', out, 0.05));
    this.attention = [
      [0.0, at('lindqvist')], [1.1, at('speaker')], [2.4, at('kessler')], [3.0, at('speaker')],
      [T.a0 + 0.9, screen(0, 0.05)], [T.a0 + 4.2, at('speaker')], [T.a0 + 6.0, screen(-0.25, -0.1)],
      [T.a0 + 8.3, at('navarro')], [T.a0 + 9.3, at('speaker')],
      [T.a1 + 0.55, screen(0.2, 0)],
      [T.nudge + 0.3, (out) => P.voss.ik.L.fore.getWorldPosition(out).lerp(P.voss.ik.L.hand.getWorldPosition(this._tmp), 0.6)],
      [T.nudge + 1.2, at('lindqvist')], [T.nudge + 2.1, screen(0, 0.1)],
      [T.b0 + 1.6, at('speaker')], [T.b0 + 3.4, screen(0, 0.15)], [T.b1 - 1.9, at('speaker')],
      [T.b1 + 0.25, at('kessler')], [T.b1 + 0.75, at('lindqvist')], [T.b1 + 1.6, at('navarro')],
      [T.b1 + 2.2, ahead], [T.flash - 3.0, lens],
      [T.flash - 2.05, (out) => P.lindqvist.at('lArm', out, -0.12)],     // her arm, round him
      [T.flash - 1.3, lens]
    ];
    // what the others look at
    this.crewLooks = [
      [0, 'speaker'], [T.a0 + 0.6, 'screen'], [T.a0 + 4.5, 'speaker'], [T.a1 + 0.6, 'screen'], [T.b0 + 2.0, 'speaker'],
      [T.b1 + 0.3, 'each other'], [T.b1 + 1.5, 'walk'], [T.flash - 2.6, 'lens']
    ];
    // Voss's blinks: [time, length], every few seconds
    this.blinks = [];
    for (let t = 1.6, i = 0; t < T.flash - 1.4; i++) {          // (eyes open for the camera)
      this.blinks.push([t, 0.16 + (i % 3) * 0.02]);
      t += 2.4 + ((i * 7919) % 23) / 10;
    }
  }

  // ------------------------------------------------------------------ playing
  // The transition in the lift: the picture blurs and throbs with a heartbeat, then goes white.
  // Resolves when the screen is fully white. (composer: Level 1's; the white stays up until
  // play() starts.)
  headache(composer) {
    this._mountOverlay();
    const pass = (this.eyePass = new ShaderPass(EyeShader));
    pass.uniforms.uOpen.value = 1.25;
    pass.uniforms.uHaze.value = 0;
    pass.uniforms.uAspect.value = window.innerWidth / window.innerHeight;
    if (composer) composer.insertPass(pass, Math.max(0, composer.passes.length - 1));
    this._composer = composer;
    const beats = [0.15, 0.95, 1.65, 2.25, 2.75];
    const ac = this.ac;
    if (ac) {
      ac.resume?.().catch(() => {});
      const out = this._sfxOut();
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
        this.white.style.opacity = seg(t, LENGTH - 1.0, LENGTH).toFixed(3);
        if (t >= LENGTH) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  _mountOverlay() {
    if (this.overlay || !this.root) return;
    this.style = document.createElement('style');
    this.style.textContent = STYLE;
    document.head.appendChild(this.style);
    const el = (id, parent) => {
      const d = document.createElement('div');
      d.id = id;
      parent.appendChild(d);
      return d;
    };
    this.overlay = el('fb1-root', this.root);
    this.white = el('fb1-white', this.overlay);
    this.sub = el('fb1-sub', this.overlay);
    this.hint = el('fb1-hint', this.overlay);
    this.hint.textContent = 'Enter: skip';
    this.photoEl = el('fb1-photo', this.overlay);
    if (this.photoImg) this.photoEl.appendChild(this.photoImg);
    window.addEventListener('keydown', this._onKey, true);
  }

  play() {
    this._mountOverlay();
    document.body.classList.add('fb1');
    if (this.eyePass && this._composer) this._composer.removePass(this.eyePass);
    this.white.style.opacity = 0;
    this.running = true;
    this._skip = false;
    this.t = 0;
    this._last = performance.now();
    this._slept = false;
    this._startSound();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  // per frame, instead of the level's own frame
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
    if (this._skip) return this._finish(true);
    if (this.t >= this.T.end) return this._finish(false);
    this.hint.style.opacity = this.t > SKIP_AFTER && this.t < this.T.end - 1 ? 0.55 : 0;
    this._animate(this.t, dt);
    this._subtitles(this.t);
    this._draw(renderer, this.t);
  }

  _draw(renderer, t) {
    renderer.getDrawingBufferSize(this._size);
    const w = Math.max(16, Math.round(this._size.x * RENDER_SCALE)), h = Math.max(16, Math.round(this._size.y * RENDER_SCALE));
    if (this.target.width !== w || this.target.height !== h) {
      this.target.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    const u = this.post.material.uniforms;
    u.uAspect.value = this.camera.aspect;
    u.uTime.value = t;
    u.uWhite.value = 1 - seg(t, 0.1, 1.6);
    u.uBlink.value = this._blink(t);
    // the room goes a little sharper while the words come through
    const clear = Math.max(seg(t, this.T.a0, this.T.a0 + 0.8) * (1 - seg(t, this.T.a1 - 0.3, this.T.a1 + 0.5)),
      seg(t, this.T.b0, this.T.b0 + 0.8) * (1 - seg(t, this.T.b1 - 0.3, this.T.b1 + 0.5)));
    u.uSoft.value = 1 - 0.55 * clear;
    this._faces(u.uHeads.value);
    renderer.setRenderTarget(this.target);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
    u.tScene.value = this.target.texture;
    renderer.render(this.postScene, this.postCam);
  }

  // every face on screen, as a circle to blur: x, y (0..1) and a radius in screen heights
  _faces(out) {
    const cam = this.camera;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    let i = 0;
    for (const name of ['lindqvist', 'kessler', 'navarro', 'park', 'speaker']) {
      const p = this.people[name];
      const o = out[i++];
      // (the middle of the face: a little under the eyes, which are where Voss's are on his head)
      p.b.head.localToWorld(this._v.copy(this.eyeLocal));
      this._v.y -= 0.035;
      const view = this._v2.copy(this._v).applyMatrix4(cam.matrixWorldInverse);
      if (view.z > -0.08) { o.set(0, 0, 0); continue; }
      this._v.project(cam);
      o.set(this._v.x * 0.5 + 0.5, this._v.y * 0.5 + 0.5, (0.24 / (-view.z * tanHalf)) * 0.5);
    }
  }

  _blink(t) {
    let b = 0;
    for (const [at, len] of this.blinks) {
      if (t < at || t > at + len) continue;
      b = Math.sin(((t - at) / len) * Math.PI);
    }
    return b;
  }

  _subtitles(t) {
    const T = this.T;
    const card = (cards, from, to) => {
      if (t < from || t > to) return null;
      const total = cards.reduce((n, c) => n + c.length, 0);
      let at = from;
      for (const c of cards) {
        at += ((to - from) * c.length) / total;
        if (t < at) return c;
      }
      return cards[cards.length - 1];
    };
    // (each recording has about half a second of silence at either end)
    const text = card(PASSAGE_A, T.a0 + 0.45, T.a1 - 0.35) || card(PASSAGE_B, T.b0 + 0.45, T.b1 - 0.35);
    if (text) {
      if (this.sub.textContent !== text) this.sub.textContent = text;
      this.sub.classList.add('on');
    } else {
      this.sub.classList.remove('on');
    }
  }

  // Everyone, for time t
  _animate(t, dt) {
    const T = this.T, P = this.people;
    this._dt = Math.min(dt, 0.05);

    // the slides, and the screen's light on the room
    const su = this.screenMat.uniforms;
    su.uTime.value = t;
    su.uSlide.value = seg(t, T.a0 - 0.6, T.a0 + 0.4) + seg(t, T.slide2, T.slide2 + 0.8);
    this.screenGlow.color.setHex(su.uSlide.value > 0.5 && su.uSlide.value < 1.5 ? 0xb69cff : 0x9fe2d2);
    this.screenGlow.intensity = 0.5 + 0.25 * Math.sin(t * 1.3);

    for (const name of ['kessler', 'park', 'navarro', 'voss', 'lindqvist']) this._crewMember(P[name], t);
    this._speaker(P.speaker, t);
    this._crewLooks(t);
    this._hands(t);
    for (const p of Object.values(P)) p.update(dt);
    // after their poses: the camera in the speaker's hands, Voss's eyes
    this._camera(t, dt);
  }

  // sitting, standing, walking to the window and turning to the camera
  _crewMember(p, t) {
    const plan = p.plan, c = CAST[p.name], w = plan.path;
    const stand = seg(t, plan.stand, plan.stand + 0.95);
    p.sit = 1 - stand;
    if (t < w.t0) {
      // in the chair (a slow shift of weight now and then), then pushed back as they stand
      p.pos.set(c.seat[0] + (plan.up[0] - c.seat[0]) * stand, -this.drop * p.sit, c.seat[1] + (plan.up[1] - c.seat[1]) * stand);
      p.pos.x += 0.012 * Math.sin(t * 0.37 + c.seat[1] * 5) * p.sit;
      p.yaw = plan.yaw0;
      p.speed = 0;
      // (Voss pushes his chair back and aside as he gets up, out of the way)
      if (p.name === 'voss') {
        this.vossChair.position.set(c.seat[0] + 0.12 * stand, 0, c.seat[1] + 0.24 * stand);
        this.vossChair.rotation.y = 0.25 * stand;
      }
      return;
    }
    const u = w.u(t);
    w.curve.getPointAt(u, p.pos);
    const dtv = 0.05;
    p.speed = t < w.t1 ? (Math.abs(w.u(t + dtv) - u) * w.length) / dtv : 0;
    // facing: along the way while walking, the camera once there
    const want = t < w.t1 - 0.25 ? (() => { const tg = w.curve.getTangentAt(Math.min(0.999, u + 0.02)); return yawOf(tg.x, tg.z); })() : 0;
    turnTo(p, want, this._dt, 4.5);
  }

  _speaker(p, t) {
    const T = this.T, w = p.plan.path;
    const u = w.u(t);
    w.curve.getPointAt(u, p.pos);
    p.speed = t > w.t0 && t < w.t1 ? (Math.abs(w.u(t + 0.05) - u) * w.length) / 0.05 : 0;
    // facing the room; half round toward the screen as passage A starts
    const toScreen = seg(t, T.a0 - 0.2, T.a0 + 0.8) * (1 - seg(t, T.a0 + 3.4, T.a0 + 4.4));
    let want = Math.PI + 1.0 * toScreen;
    if (t > w.t0 && t < w.t1 - 0.3) {
      const tg = w.curve.getTangentAt(Math.min(0.999, u + 0.02));
      want = yawOf(tg.x, tg.z);
    }
    if (t < 0.01) p.yaw = Math.PI;
    turnTo(p, want, this._dt, 4);
    p.pos.y = 0;
    p.sit = 0;
  }

  _crewLooks(t) {
    const P = this.people;
    let what = 'speaker';
    for (const [at, w] of this.crewLooks) if (t >= at) what = w;
    for (const name of ['kessler', 'park', 'navarro', 'lindqvist']) {
      const p = P[name];
      p.look ||= new THREE.Vector3();
      if (what === 'speaker') P.speaker.at('head', p.look, 0.05);
      else if (what === 'screen') p.look.copy(this.screenCentre);
      else if (what === 'lens') p.look.copy(this.cameraProp.position);
      else if (what === 'walk') {
        const w = p.plan.path;
        w.curve.getPointAt(Math.min(1, w.u(t) + 0.3), p.look);
        p.look.y = 1.4;
      } else {
        // each other: the room turns to its neighbours
        const other = { kessler: 'park', park: 'kessler', navarro: 'lindqvist', lindqvist: 'voss' }[name];
        P[other].at('head', p.look, 0.05);
      }
    }
    // the speaker looks at the room, the screen while A starts, then into his camera's finder
    const sp = P.speaker;
    sp.look ||= new THREE.Vector3();
    const T = this.T;
    if (t > T.a0 && t < T.a0 + 3.4) sp.look.copy(this.screenCentre);
    else if (t > T.flash - 2.4) sp.look.set(-0.15, 1.45, 2.55);
    else P[['voss', 'lindqvist', 'kessler', 'park', 'navarro'][Math.floor(t / 2.7) % 5]].at('head', sp.look, 0);
  }

  // Hands: on the table while they sit, Lindqvist's nudge and her clap on his shoulder, Park's on
  // Kessler's, the speaker's gestures and his camera, and the arms round shoulders for the photo
  _hands(t) {
    const T = this.T, P = this.people;
    const down = v3(0, -1, 0), up = v3(0, 1, 0);
    // resting on the table: the wrist in front of the person, palm down
    const onTable = (p, side, w) => {
      const c = CAST[p.name];
      const fx = c.face[0], fz = c.face[1];
      const s = side === 'R' ? 1 : -1;
      const rx = -fz * s, rz = fx * s;                     // the person's right (or left)
      const g = (p._tableGrip ||= {})[side] ||= { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: down.clone(), pole: new THREE.Vector3(), curl: [0.25, 0.3, 0.2], thumb: [0.15, 0.1], w: 0 };
      g.wrist.set(c.seat[0] + fx * 0.47 + rx * 0.16, TABLE_Y + 0.035, c.seat[1] + fz * 0.47 + rz * 0.16);
      g.fingers.set(fx - rx * 0.35, 0, fz - rz * 0.35).normalize();
      g.pole.set(rx * 0.8 - fx * 0.3, -0.5, rz * 0.8 - fz * 0.3).normalize();
      g.w = w;
      return g;
    };
    // a hand on top of a shoulder, the elbow out behind
    const onShoulder = (p, side, who, arm, w, tap = 0) => {
      const g = (p._shoulderGrip ||= {})[side] ||= { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: down.clone(), pole: new THREE.Vector3(), curl: [0.35, 0.35, 0.25], thumb: [0.2, 0.1], w: 0 };
      P[who].at(arm, g.wrist, 0.075 + tap);
      const fwd = this._v3.set(-Math.sin(P[who].yaw), 0, -Math.cos(P[who].yaw));
      g.wrist.addScaledVector(fwd, -0.04);
      g.fingers.copy(fwd).multiplyScalar(0.8).add(this._v2.set(0, -0.6, 0)).normalize();
      g.pole.copy(fwd).multiplyScalar(-1).add(this._v2.set(0, -0.4, 0)).normalize();
      g.w = w;
      return g;
    };
    const taps = (t0) => 0.025 * Math.max(0, Math.sin((t - t0) * 14)) * (t > t0 && t < t0 + 0.9 ? 1 : 0);

    for (const name of ['voss', 'lindqvist', 'kessler', 'navarro', 'park']) {
      const p = P[name], plan = p.plan;
      const seated = 1 - seg(t, plan.stand - 0.2, plan.stand + 0.25);
      p.grips.R = onTable(p, 'R', seated);
      p.grips.L = onTable(p, 'L', seated);
    }
    // the nudge: Lindqvist's hand to Voss's forearm, twice, and back
    const nudge = seg(t, T.nudge - 0.3, T.nudge + 0.15) * (1 - seg(t, T.nudge + 0.95, T.nudge + 1.5));
    if (nudge > 0) {
      const g = P.lindqvist.grips.R;
      const v = P.voss.ik.L;
      v.fore.getWorldPosition(this._v);
      v.hand.getWorldPosition(this._v2);
      const target = this._v.lerp(this._v2, 0.45);
      target.y += 0.05 + 0.03 * Math.max(0, Math.sin((t - T.nudge) * 13)) * (t > T.nudge && t < T.nudge + 0.6 ? 1 : 0);
      g.wrist.lerp(target, nudge);
      g.fingers.set(0.3, -0.5, 0.8).normalize();
      g.w = Math.max(g.w, nudge);
    }
    // a jolt in Voss's arm as she nudges it
    const jolt = Math.max(0, Math.sin((t - T.nudge) * 13)) * (t > T.nudge && t < T.nudge + 0.6 ? 1 : 0);
    P.voss.grips.L.wrist.x -= 0.015 * jolt;
    // the room reacts: Lindqvist claps him on the shoulder
    const clap = seg(t, T.b1 + 0.75, T.b1 + 1.0) * (1 - seg(t, T.b1 + 1.75, T.b1 + 2.1));
    if (clap > 0) P.lindqvist.grips.R = onShoulder(P.lindqvist, 'R', 'voss', 'lArm', clap, taps(T.b1 + 1.0));

    // the photo: each left arm round the left-hand neighbour (as they face the camera), the hand
    // on the far shoulder; Voss's right arm round Lindqvist, and hers round him (her hand on his near
    // shoulder: the photograph's tear runs through her shoulder, so her arm goes with him).
    const hug = (who, delay) => seg(t, T.flash - 2.5 + delay, T.flash - 1.7 + delay);
    const pairs = [['navarro', 'lindqvist', 0.1], ['kessler', 'navarro', 0.0], ['park', 'kessler', 0.2]];
    for (const [who, round, delay] of pairs) {
      const w = hug(who, delay);
      if (w > 0) P[who].grips.L = onShoulder(P[who], 'L', round, 'lArm', w);
    }
    const lw = hug('lindqvist', 0.25);
    if (lw > 0) P.lindqvist.grips.L = onShoulder(P.lindqvist, 'L', 'voss', 'rArm', lw);
    const vw = hug('voss', 0.45);
    if (vw > 0) P.voss.grips.R = onShoulder(P.voss, 'R', 'lindqvist', 'rArm', vw);

    // the speaker: a hand toward the screen as he turns to it (palm up, presenting), both hands
    // open toward them for "all of you", then the camera up to his eye
    const sp = P.speaker;
    sp.grips.R = null;
    sp.grips.L = null;
    const present = seg(t, T.a0 + 0.3, T.a0 + 1.1) * (1 - seg(t, T.a0 + 3.2, T.a0 + 4.0));
    if (present > 0) {
      const g = (sp._present ||= { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: up.clone(), pole: v3(0, -1, 0), curl: [0.1, 0.15, 0.1], thumb: [0.05, 0.05], w: 0 });
      sp.at('lArm', g.wrist, -0.12);
      const d = this._v.subVectors(this.screenCentre, g.wrist).setY(0).normalize();
      g.wrist.addScaledVector(d, 0.48);
      g.fingers.copy(d);
      g.w = present;
      sp.grips.L = g;
    }
    const open = seg(t, T.b1 - 2.4, T.b1 - 1.8) * (1 - seg(t, T.b1 - 0.6, T.b1 + 0.1));
    if (open > 0) {
      const fwd = this._v3.set(-Math.sin(sp.yaw), 0, -Math.cos(sp.yaw));
      for (const side of ['R', 'L']) {
        const g = ((sp._open ||= {})[side] ||= { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: up.clone(), pole: v3(0, -1, 0), curl: [0.1, 0.12, 0.1], thumb: [0.05, 0.05], w: 0 });
        sp.at(side === 'R' ? 'rArm' : 'lArm', g.wrist, -0.2).addScaledVector(fwd, 0.36);
        g.fingers.copy(fwd);
        g.w = open;
        sp.grips[side] = g;
      }
    }
    // the camera comes up out of his jacket and to his eye
    const lift = seg(t, T.flash - 2.6, T.flash - 1.8);
    this.cameraProp.visible = lift > 0.01;
    if (lift > 0.01) {
      const fwd = this._v3.set(-Math.sin(sp.yaw), 0, -Math.cos(sp.yaw));
      sp.at('head', this._v, 0.03);
      const low = this._v2.copy(this._v).addScaledVector(fwd, 0.38);
      low.y -= 0.55;
      this._v.addScaledVector(fwd, 0.13);
      this.cameraProp.position.copy(low).lerp(this._v, lift);
      this.cameraProp.rotation.set(0, sp.yaw, 0);
      const right = this._v2.set(Math.cos(sp.yaw), 0, -Math.sin(sp.yaw));
      for (const [side, s] of [['R', 1], ['L', -1]]) {
        const g = ((sp._cam ||= {})[side] ||= { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(), pole: v3(0, -1, 0), curl: [0.6, 0.6, 0.5], thumb: [0.4, 0.3], w: 0 });
        g.wrist.copy(this.cameraProp.position).addScaledVector(right, s * 0.1).y -= 0.03;
        g.wrist.addScaledVector(fwd, -0.03);
        g.fingers.copy(fwd).multiplyScalar(0.3).add(this._v.set(0, 1, 0)).normalize();
        g.palm.copy(right).multiplyScalar(-s);
        g.w = 1;
        sp.grips[side] = g;
      }
    }
  }

  // Voss's eyes: wherever his head is (his own clip moves it: breathing, the bob of his walk),
  // looking where his attention goes, with a spring's ease on every turn (firstPersonRig's Eyes)
  _camera(t, dt) {
    let get = this.attention[0][1];
    for (const [at, fn] of this.attention) if (t >= at) get = fn;
    this.eyes ||= new Eyes(this.camera, this.people.voss, this.eyeLocal);
    this.eyes.update(t, dt, get(this._v2));
  }

  // ------------------------------------------------------------------ sound
  _sfxOut() {
    if (!this._sfx) {
      this._sfx = this.ac.createGain();
      this._sfx.gain.value = settings.get('effects');
      this._sfx.connect(this.ac.destination);
    }
    return this._sfx;
  }

  _startSound() {
    const ac = this.ac;
    if (!ac) return;
    ac.resume?.().catch(() => {});
    const T = this.T, at = ac.currentTime + 0.05;
    this._t0 = at;
    this._sources = [];
    this._voice = ac.createGain();
    this._voice.gain.value = settings.get('voice');
    this._voice.connect(ac.destination);
    // the room, underwater: a low rumble that comes up out of the white
    const rumble = ac.createBufferSource();
    rumble.buffer = brownNoise(ac, 3);
    rumble.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const rg = ac.createGain();
    rg.gain.setValueAtTime(0, at);
    rg.gain.linearRampToValueAtTime(0.22, at + 1.2);
    rumble.connect(lp).connect(rg).connect(this._sfxOut());
    rumble.start(at);
    this._sources.push(rumble);
    this._rumble = rg;

    // the speaker and the room. clear: [when it opens, when it closes] (s into the clip's own time)
    const play = (clip, when, { from = 0, stopAt = Infinity, gain = 1, clear = null, wobble = false } = {}) => {
      const buffer = this.buffers?.get(clip);
      if (!buffer) return;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 0.8;
      const g = ac.createGain();
      const start = at + when;
      f.frequency.setValueAtTime(MUFFLED_HZ, start);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain * 0.55, start + 0.25);
      if (clear) {
        // the filter opens (and he is louder: nearer, clearer), then closes again
        f.frequency.setTargetAtTime(CLEAR_HZ, start + clear[0], 0.18);
        g.gain.setTargetAtTime(gain, start + clear[0], 0.18);
        f.frequency.setTargetAtTime(MUFFLED_HZ, start + clear[1], 0.25);
        g.gain.setTargetAtTime(gain * 0.55, start + clear[1], 0.25);
      }
      if (wobble) {
        // shaky: a slight, uneven waver of pitch and loudness
        for (const [hz, cents] of [[5.3, 16], [0.9, 9]]) {
          const o = ac.createOscillator();
          o.frequency.value = hz;
          const og = ac.createGain();
          og.gain.value = cents;
          o.connect(og).connect(src.detune);
          o.start(start);
          o.stop(start + buffer.duration - from + 0.1);
          this._sources.push(o);
        }
        const trem = ac.createOscillator();
        trem.frequency.value = 6.7;
        const tg = ac.createGain();
        tg.gain.value = 0.07;
        trem.connect(tg).connect(g.gain);
        trem.start(start);
        trem.stop(start + buffer.duration - from + 0.1);
        this._sources.push(trem);
      }
      src.connect(f).connect(g).connect(this._voice);
      src.start(start, from);
      if (Number.isFinite(stopAt)) {
        g.gain.setTargetAtTime(0, at + stopAt - 0.3, 0.12);
        src.stop(at + stopAt + 0.4);
      }
      this._sources.push(src);
    };
    play('fb1-speaker-1', T.spk1, { from: 0.35, stopAt: T.a0 + 0.35 });
    play('fb1-speaker-a', T.a0, { clear: [0.0, T.a1 - T.a0 - 0.25], wobble: true });
    play('fb1-speaker-2', T.spk2, { from: T.spk2From });
    play('fb1-speaker-b', T.b0, { clear: [0.0, T.b1 - T.b0 - 0.25], wobble: true });
    play('fb1-room-cheer', T.cheer, { gain: 0.9, stopAt: T.flash + 0.3 });
    play('fb1-speaker-3', T.spk3, { from: T.spk3From, stopAt: T.photoVoice + 0.2, gain: 0.8 });
    play('fb1-speaker-photo', T.photoVoice, { from: T.photoFrom });
    play('fb1-room-photo', T.halcyon, { gain: 0.9 });
  }

  _stopSound(fade = 0.08) {
    const ac = this.ac;
    if (!ac || !this._sources) return;
    const now = ac.currentTime;
    this._voice?.gain.setTargetAtTime(0, now, fade);
    this._rumble?.gain.setTargetAtTime(0, now, fade);
    for (const s of this._sources) {
      try { s.stop(now + fade * 5); } catch { /* (already stopped) */ }
    }
    this._sources = [];
  }

  // ------------------------------------------------------------------ the end
  // The flash and the photograph (unless skipped), then the fade back to the lift
  async _finish(skipped) {
    if (!this.running) return;
    this.running = false;
    this.hint.style.opacity = 0;
    this.sub.classList.remove('on');
    const resolve = this._resolve;
    this._resolve = null;
    if (skipped) {
      this._stopSound(0.15);
      this.photoEl.style.transition = 'none';
      this.photoEl.style.opacity = 1;
      this.photoEl.style.background = '#000';
      if (this.photoImg) this.photoImg.style.visibility = 'hidden';
    } else {
      // the shutter and the flash: the picture itself, out of the white
      if (this.ac) shutter(this.ac, this._sfxOut());
      this._rumble?.gain.setTargetAtTime(0, this.ac?.currentTime ?? 0, 0.6);
      this.white.style.transition = 'none';
      this.white.style.opacity = 1;
      this.photoEl.style.transition = 'none';
      this.photoEl.style.opacity = 1;
      void this.photoEl.offsetWidth;
      this.photoEl.classList.add('on');
      this.white.style.transition = 'opacity 0.7s ease-out';
      this.white.style.opacity = 0;
      await wait(PHOTO_HOLD * 1000);
      this._stopSound(0.3);
    }
    document.body.classList.remove('fb1');
    this.photoEl.style.transition = `opacity ${PHOTO_FADE}s ease-in-out`;
    this.photoEl.style.opacity = 0;
    await wait(PHOTO_FADE * 1000);
    resolve?.({ skipped });
  }

  // ------------------------------------------------------------------ the photograph (scripts/flashback1-photo)
  // Everyone where they stand at the flash, Voss and the speaker out of the picture; returns the
  // photographer's camera (where the speaker holds his) and where each face and Voss are
  posePhoto(aspect = 1.5) {
    const T = this.T;
    for (let t = 0; t <= T.flash - 0.12; t += 1 / 30) {
      this.t = t;
      this._animate(t, 1 / 30);
    }
    this.people.voss.group.visible = false;
    this.people.speaker.group.visible = false;
    this.cameraProp.visible = false;
    const cam = new THREE.PerspectiveCamera(30, aspect, 0.1, 20);
    cam.position.copy(this.cameraProp.position);
    cam.lookAt(-0.2, 1.2, 2.55);
    cam.updateMatrixWorld();
    this.flashLight.position.copy(cam.position);
    this.flashLight.intensity = 9;
    // (world points: faces, where Voss stood, Lindqvist's hand on his shoulder and her own shoulder)
    const faces = ['lindqvist', 'navarro', 'kessler', 'park'].map((n) => this.people[n].at('head', new THREE.Vector3(), 0.09));
    const voss = this.people.voss.at('head', new THREE.Vector3(), 0);
    const hand = this.people.lindqvist.ik.L.hand.getWorldPosition(new THREE.Vector3());
    const shoulder = this.people.lindqvist.at('lArm', new THREE.Vector3(), 0);   // (the arm round him)
    return { camera: cam, faces, voss, hand, shoulder };
  }

  dispose() {
    this.running = false;
    window.removeEventListener('keydown', this._onKey, true);
    this._stopSound(0.05);
    if (this.eyePass) {
      this._composer?.removePass(this.eyePass);
      this.eyePass.dispose?.();
      this.eyePass = null;
    }
    if (this.scene) {
      this.scene.traverse((o) => {
        if (o.isSkinnedMesh) o.skeleton.dispose();
        else if (o.isMesh) o.geometry.dispose();
      });
      for (const p of Object.values(this.people)) {
        p.mixer.stopAllAction();
        p.mixer.uncacheRoot(p.model);
      }
      // (with their toon ramps: Kessler's copy uses the one her loader made)
      for (const m of this._mats) {
        m.gradientMap?.dispose();
        m.dispose();
      }
      for (const tex of this._textures) tex.dispose();
      this.target.dispose();
      this.post.geometry.dispose();
      this.post.material.dispose();
      this.ramp.dispose();
      this.scene.clear();
      this.scene = null;
      this.people = null;
    }
    this.ac?.close?.().catch(() => {});
    this.ac = null;
    this.buffers = null;
    this.overlay?.remove();
    this.style?.remove();
    document.body.classList.remove('fb1');
    this.overlay = null;
    this.ready = false;
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function brownNoise(ac, seconds) {
  const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return b;
}

function noiseBurst(ac, out, at, length, type, freq, gain) {
  const src = ac.createBufferSource();
  const b = ac.createBuffer(1, Math.ceil(ac.sampleRate * length), ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  src.buffer = b;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + length);
  src.connect(f).connect(g).connect(out);
  src.start(at);
}

// A camera's shutter: the mirror up and the curtain, two dry clicks
function shutter(ac, out) {
  const t = ac.currentTime + 0.01;
  noiseBurst(ac, out, t, 0.025, 'highpass', 2200, 0.8);
  noiseBurst(ac, out, t + 0.012, 0.05, 'bandpass', 900, 0.3);
  noiseBurst(ac, out, t + 0.07, 0.03, 'highpass', 1700, 0.55);
}

// One heartbeat, felt more than heard: lub, then dub (Flashback 3's way in uses it too)
export function heartbeat(ac, out, at) {
  for (const [dt, gain] of [[0, 0.9], [0.2, 0.55]]) {
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(62, at + dt);
    o.frequency.exponentialRampToValueAtTime(38, at + dt + 0.16);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at + dt);
    g.gain.exponentialRampToValueAtTime(gain, at + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dt + 0.22);
    o.connect(g).connect(out);
    o.start(at + dt);
    o.stop(at + dt + 0.25);
  }
}
