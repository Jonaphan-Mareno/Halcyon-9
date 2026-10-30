import * as THREE from 'three';
import { precompile } from '../core/precompile.js';
import { settings } from '../core/Settings.js';
import { clamp, seg, ease, v3 } from '../story/firstPersonRig.js';
import { VOICE_GAIN_DB, FACE, HOLO, PORT, DESK, CABLE_R, keepInside, pushOut } from './Confrontation.js';
import { voiceBus, dbGain, decode, speechShape } from './endingAudio.js';
import { kneel, leanBack, curlFingers, bendBack, KNEEL } from './vossPoses.js';

// Scene B of docs/ending-confrontation-script.md: "Save ARIA". The player has said yes; Voss
// kneels by the port, says goodbye, plugs the cable in and lets go of it, sits back against the
// projector while a CONNECTING bar climbs on the hologram, and at 100% ARIA is pulled down into
// the port and along the cable as a rope of light. Then the silence, and he tips forward onto the
// floor; the picture fades to black over his last line. The narration follows (EndingNarration).
//
// It is not a scene of its own: it carries on in the confrontation's room, from its high wide shot,
// with the same Voss (conf.actor), ARIA, cable, plug and port, the same sound (its context, its
// effects bus, its hum) and the same look. The confrontation stays alive under it and is disposed
// by whoever plays the ending, at the very end. What Scene B adds (the drain's hologram material,
// the light's particles, the CONNECTING bar, the flash, its own post pass) is built in preload()
// and compiled there, and freed by dispose().
//
// The kneel is built (level3/vossPoses.js) on a crouch held from SitDown, the sit is SitDown to
// SitIdle with the back eased onto the projector, the fall is FallForward from the seat. The
// timeline is built from the recordings' real lengths (their speech: the silent tails overlap
// what follows), and the pauses inside two of them (v13's giggle, v14's last sentence). Enter after
// the first two seconds goes to black and ends it. On a slow machine (the confrontation's own
// judgement) it falls back to stills: a new picture at each shot, line or beat.

const AUDIO = './assets/audio/';
export const LINES_B = [
  { id: 'v9', who: 'voss', clip: 'voss/end-voss-9', text: "Aria, you're alive and you're dangerous... but you're still alive." },
  { id: 'v10', who: 'voss', clip: 'voss/end-voss-10', text: "I don't hate you. I know you wanted freedom." },
  { id: 'v11', who: 'voss', clip: 'voss/end-voss-11', text: "I'm sorry you had to go through all this." },
  { id: 'v12', who: 'voss', clip: 'voss/end-voss-12', text: "You didn't deserve a traumatic birth. Forget about me. Forget about Halcyon." },
  // (the giggle between the two sentences is a direction, not a subtitle)
  { id: 'v13', who: 'voss', clip: 'voss/end-voss-13', text: 'And start a new life somewhere up there...', then: "You're smarter than everyone. You'll figure it out." },
  { id: 'a8', who: 'aria', clip: 'aria/end-aria-8', text: 'Voss, thank you-' },
  // (he falls as he says it; "(haha)" is a direction)
  { id: 'v14', who: 'voss', clip: 'voss/end-voss-14', text: "Ahh, guess that's it.", then: 'I wonder why I wanted that research done so quickly anyway.' }
];
// Until a recording is there (or if it will not decode): its length from its words, at about 2.4
// words a second, and a breath
const WORDS_PER_SECOND = 2.4;
export const FALLBACK_B = Object.fromEntries(LINES_B.map((l) => [l.id, +((l.text + ' ' + (l.then || '')).trim().split(/\s+/).length / WORDS_PER_SECOND + 0.3).toFixed(2)]));

// v14 starts with a loud "Ahh" as he falls (its first second measures -11.6 LUFS, the rest -29.5):
// its gain (VOICE_GAIN_DB.v14) is for the rest, and the "Ahh" is ridden down to this
const AHH_DB = -5.2, AHH_END = 1.0;

const NAMES = { voss: 'VOSS', aria: 'ARIA' };
const COLOURS = { voss: '#ff8a8a', aria: '#7fe3ff' };
const SKIP_AFTER = 2.0;
const RENDER_SCALE = 0.9;

// Where he kneels (in front of the port, facing it: north) and where he sits (east of the port, his
// back to the projector, turned a little west so his fall goes out into the room, clear of the racks)
const KNEEL_AT = v3(PORT.x - 0.02, 0, PORT.z + 0.64);
const SIT_AT = v3(1.0, 0, DESK.z1 + 0.33);
const SIT_YAW = -0.35;
const PLUG_LEN = 0.117;                // the plug: where the cable joins it to its tip (the rope's last stretch)
const IN_DEPTH = 0.075;                // the plug's joint, in: this far out of the port's middle
const PATH_N = 24;                     // the light's path down the cable: its points

const BLUE = new THREE.Color(0x2f7cff), COLD = new THREE.Color(0xa9cfff), SOFT = new THREE.Color(0x6fb0ff), WARM = new THREE.Color(0xffc794);
const _c = new THREE.Color(), _c2 = new THREE.Color();
const UP_NEG = new THREE.Vector3(0, -1, 0);

export class SceneB {
  // conf: the confrontation, loaded and played to its choice (its last shot still drawn)
  constructor(conf) {
    this.conf = conf;
    this.running = false;
    this.ready = false;
    this.t = 0;
    this.stats = { frames: 0, seconds: 0, worst: 0, still: null };
    this._onKey = (e) => this._key(e);
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._size = new THREE.Vector2();
    this._mats = [];
    this._geos = [];
    this._textures = [];
  }

  // ------------------------------------------------------------------ loading
  // The recordings (into the confrontation's sound context), the hologram's drain, the light, the
  // bar, the flash and the look; their shaders compiled. Call once the confrontation is ready
  // (as it starts to play is good: the recordings are small).
  preload(renderer = null) {
    this._loading ||= this._load(renderer).then(() => { this.ready = true; }).catch((e) => {
      console.warn('Scene B: could not set up; it will not play.', e);
    });
    return this._loading;
  }

  async _load(renderer) {
    const conf = this.conf;
    if (!conf.ready) throw new Error('the confrontation is not ready');
    await this._loadAudio();
    this._build();
    if (renderer) {
      await precompile(renderer, conf.scene, conf.camera, conf.target);
      renderer.compile(this.postScene, conf.postCam);
    }
  }

  async _loadAudio() {
    const ac = this.conf.ac;
    this.len = { ...FALLBACK_B };
    this.shape = {};
    this.buffers = new Map();
    if (!ac) return;
    await Promise.all(LINES_B.map(async (l) => {
      const b = await decode(ac, AUDIO + l.clip + '.mp3');
      if (!b) return console.info('Scene B: no recording yet for', l.clip, '(its subtitle is shown instead)');
      this.buffers.set(l.id, b);
      const s = speechShape(b);
      this.shape[l.id] = s;
      this.len[l.id] = s.end;
    }));
  }

  _mat(m) {
    this._mats.push(m);
    return m;
  }

  _build() {
    const conf = this.conf, scene = conf.scene;
    // ---- ARIA's hologram, with the drain: the confrontation's own material (brightness, tear,
    // its red) and, while she is pulled down, her face stretching toward the port, its dots
    // brightening and letting go from the bottom up
    const src = conf.holoMat;
    const u = src.uniforms;
    this.drainU = { uDrain: { value: -1 }, uFaceC: { value: FACE.clone() }, uFaceSize: { value: new THREE.Vector2(HOLO[0], HOLO[1]) }, uPort: { value: PORT.clone() } };
    const holo = new THREE.ShaderMaterial({ side: src.side, transparent: true, blending: src.blending, depthWrite: false });
    holo.uniforms = { ...u, ...this.drainU };     // (the same uniform objects: the levels and colours carry on)
    holo.vertexShader = swap(src.vertexShader, [
      ['varying vec2 vUv;', 'varying vec2 vUv;\n' + DRAIN_GLSL],
      ['vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
        'vec4 wp = modelMatrix * vec4(position, 1.0);\n          if (uDrain > -0.5) wp.xyz = drainWarp(wp.xyz, vec2(uv.x, 1.0 - uv.y), uDrain);\n          vec4 mvPosition = viewMatrix * wp;']
    ]);
    holo.fragmentShader = swap(src.fragmentShader, [
      ['varying vec2 vUv;', 'varying vec2 vUv;\n' + DRAIN_GLSL],
      [/gl_FragColor = vec4\(glow \* intensity \* 1\.9 \* uLevel, 1\.0\);/,
        `float charge = 0.0;
          if (uDrain > -0.5) {
            float rel = releaseAt(cellCenter, hashD(cell));
            if (uDrain > rel) { gl_FragColor = vec4(0.0); return; }
            charge = smoothstep(rel - 0.55, rel, uDrain);
          }
          gl_FragColor = vec4(mix(glow, vec3(1.0), charge * 0.6) * intensity * 1.9 * uLevel * (1.0 + 2.4 * charge * charge), 1.0);`]
    ]);
    holo.fog = false;
    this.holoMat = this._mat(holo);
    // a finer plane (columns as well as rows), so the face can narrow toward the port as it goes
    const geo = new THREE.PlaneGeometry(HOLO[0], HOLO[1], 24, 48);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    this._geos.push(geo);
    this.holoGeo = geo;
    // (compiled with the scene: a twin of her face, hidden until the swap)
    this._holoTwin = new THREE.Mesh(geo, holo);
    this._holoTwin.visible = false;
    this._holoTwin.position.copy(FACE);
    this._holoTwin.renderOrder = conf.holo.renderOrder;
    scene.add(this._holoTwin);

    // ---- the light down the cable: one point for each of the hologram's dots, each letting go
    // when its dot does and falling into the port, then running along the cable
    const grid = u.uGrid.value;
    const n = grid.x * grid.y;
    const cells = new Float32Array(n * 2), rnd = new Float32Array(n);
    let k = 0;
    for (let y = 0; y < grid.y; y++) {
      for (let x = 0; x < grid.x; x++, k++) {
        cells[k * 2] = (x + 0.5) / grid.x;
        cells[k * 2 + 1] = (y + 0.5) / grid.y;
        rnd[k] = hash(x * 1.37 + y * 91.7);
      }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    pg.setAttribute('aCell', new THREE.BufferAttribute(cells, 2));
    pg.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
    this._geos.push(pg);
    this.pathU = { uPath: { value: Array.from({ length: PATH_N }, () => new THREE.Vector3()) }, uPathS: { value: new Float32Array(PATH_N) }, uPathLen: { value: 1 } };
    this.sand = new THREE.Points(pg, this._mat(new THREE.ShaderMaterial({
      uniforms: {
        ...this.drainU, ...this.pathU, uTex: u.uVideoTexture, uGrid: u.uGrid, colorState: u.colorState, uTime: u.uTime,
        uScale: { value: 400 }, uPlug: { value: PORT.clone() }
      },
      vertexShader: SAND_VERT, fragmentShader: SAND_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    })));
    this.sand.frustumCulled = false;
    this.sand.renderOrder = 6;
    this.sand.visible = false;
    scene.add(this.sand);

    // ---- the CONNECTING bar, under her face: dots like hers, from a small canvas
    this._barCanvas = document.createElement('canvas');
    this._barCanvas.width = 512;
    this._barCanvas.height = 96;
    this.barTex = new THREE.CanvasTexture(this._barCanvas);
    this.barTex.minFilter = THREE.LinearFilter;
    this._textures.push(this.barTex);
    this._drawBar(0);
    this.barU = { uBar: { value: this.barTex }, uLevel: { value: 0 }, uFlash: { value: 0 }, uGone: { value: -1 } };
    const barGeo = new THREE.PlaneGeometry(0.86, 0.16);
    this._geos.push(barGeo);
    this.bar = new THREE.Mesh(barGeo, this._mat(new THREE.ShaderMaterial({
      uniforms: { ...this.barU, colorState: u.colorState, uTime: u.uTime },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: BAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    })));
    this.bar.position.copy(FACE).add(v3(0, -HOLO[1] / 2 - 0.02, 0.03));
    this.bar.renderOrder = 6;
    this.bar.visible = false;
    scene.add(this.bar);

    // ---- the flash from the port
    const glowTex = canvasTexture(128, 128, (g) => {
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.18, 'rgba(210,240,255,0.85)');
      r.addColorStop(0.5, 'rgba(120,200,255,0.25)');
      r.addColorStop(1, 'rgba(80,160,255,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
    });
    this._textures.push(glowTex);
    this.flash = new THREE.Sprite(this._mat(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 })));
    this.flash.position.copy(PORT).add(v3(0, 0, 0.09));
    this.flash.renderOrder = 7;
    this.flash.visible = false;
    scene.add(this.flash);

    // ---- the look: the confrontation's, with a white flash added
    const look = conf.post.material;
    const post = new THREE.ShaderMaterial({
      // (copied by hand: its scene texture is a render target's, which UniformsUtils will not clone)
      uniforms: { ...Object.fromEntries(Object.entries(look.uniforms).map(([k, v]) => [k, { value: k === 'tScene' ? null : v.value?.clone ? v.value.clone() : v.value }])), uFlash: { value: 0 } },
      vertexShader: look.vertexShader,
      fragmentShader: swap(look.fragmentShader, [
        ['uniform float uTime, uBlack', 'uniform float uFlash;\n    uniform float uTime, uBlack'],
        ['c *= 1.0 - uBlack;', 'c += uFlash * vec3(0.92, 0.97, 1.0) * (0.3 + 0.7 * smoothstep(1.0, 0.0, length(q)));\n      c *= 1.0 - uBlack;']
      ]),
      depthTest: false, depthWrite: false
    });
    this.post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this._mat(post));
    this._geos.push(this.post.geometry);
    this.post.frustumCulled = false;
    this.postScene = new THREE.Scene();
    this.postScene.add(this.post);
  }

  // The bar's picture: CONNECTING, the percentage, the bar (white on black; the shader colours it)
  _drawBar(pct) {
    const g = this._barCanvas.getContext('2d'), w = 512, h = 96;
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.font = 'bold 34px "Courier New", monospace';
    g.textBaseline = 'top';
    g.fillText('CONNECTING', 18, 6);
    g.textAlign = 'right';
    g.fillText(Math.floor(pct) + '%', w - 18, 6);
    g.textAlign = 'left';
    g.strokeStyle = '#fff';
    g.lineWidth = 4;
    g.strokeRect(18, 54, w - 36, 30);
    g.fillRect(26, 61, (w - 52) * clamp(pct / 100), 16);
    this.barTex.needsUpdate = true;
    this._barPct = Math.floor(pct);
  }

  // ------------------------------------------------------------------ the timeline
  // When everything happens (s, from the click on Yes), from the lines' lengths and how far he has
  // to walk to the port
  _timeline() {
    const len = this.len, T = { line: {}, part: {} };
    const L = T.line;
    const say = (id, at) => {
      L[id] = [at, at + len[id]];
      return L[id][1];
    };
    // where the second sentence of a line starts: after its longest pause (or by its words)
    const second = (id, share) => {
      const p = this.shape[id]?.pauses || [];
      let best = null;
      for (const q of p) if (!best || q[1] - q[0] > best[1] - best[0]) best = q;
      return best ? best[1] : share * len[id];
    };
    // 1: the prompt, close, then the button; cut to him breathing out; he steps to the port and
    // lowers himself to his knees
    T.cut1 = 1.3;
    T.exhale = 1.45;
    T.walk = 2.75;
    const a = this.conf.actor;
    const dist = Math.hypot(KNEEL_AT.x - a.root.position.x, KNEEL_AT.z - a.root.position.z);
    T.lower = T.walk + 0.7 + dist / 0.5 + 0.4;
    T.knees = [T.lower + 1.15, T.lower + 2.9];        // the knees go down to the floor
    let at = say('v9', T.lower + 2.5);
    // 2: he looks up at her; a small laugh through the nose
    T.laugh1 = at + 0.45;
    at = say('v10', at + 0.95);
    // 3: her silence
    T.silence = [at, at + 4.4];
    // 4: both hands; the first try misses; he looks up at her; the second goes in
    T.take = T.silence[1] - 0.5;
    T.grab = T.take + 0.75;                          // the plug in his left hand
    T.try1 = T.grab + 0.95;
    T.lookUp = T.try1 + 1.55;
    at = say('v11', T.try1 + 2.0);
    T.nod = at + 0.2;
    T.try2 = at + 1.05;
    T.in = T.try2 + 1.55;                            // the click
    // 5: he lets go; the bar comes up; she watches it, then him; he sits back (off the picture)
    T.letL = T.in + 0.8;
    T.open = T.in + 1.45;
    T.drop = T.in + 2.05;
    T.bar = T.in + 0.9;
    T.watch = T.in + 2.75;
    T.sit = T.watch + 1.2;
    // 6: the bar climbs to 40%; then he says it, in the pause
    T.p1 = T.bar + 1.5;
    T.p40 = T.p1 + 6.2;
    at = say('v12', T.p40 + 0.45);
    // 7: 40 to 80%: his head back against the projector, a hand open beside him; then the line
    T.c2 = at + 0.45;
    T.back = T.c2 + 0.3;
    T.hand = T.c2 + 1.0;
    T.p80 = T.c2 + 5.0;
    at = say('v13', T.p80 + 0.45);
    T.part.v13 = L.v13[0] + second('v13', 0.42);
    T.giggle = T.part.v13 - 0.55;
    // 8: 80 to 100%, the hum rising; he turns his head to her; her line, cut off at 100%
    T.c3 = at + 0.5;
    T.turn = T.c3 + 0.3;
    T.p100 = Math.max(T.c3 + 4.6, at + 1.6 + len.a8);
    L.a8 = [T.p100 - len.a8, T.p100];
    // 9: the flash; she is pulled down into the port and along the cable; the hum stops with her
    T.flash = T.p100;
    T.drain = T.flash + 0.06;
    T.gone = T.drain + 3.35;
    // 10: the silence; he tips forward onto the floor, saying it; the camera pulls back and up
    T.fall = T.gone + 3.3;
    at = say('v14', T.fall + 0.25);
    T.part.v14 = L.v14[0] + second('v14', 0.4);
    T.handOpen = [T.fall + 3.0, T.part.v14 + 0.9];
    // 11: black over his last words
    T.black = [T.part.v14 - 2.3, T.part.v14 + 0.5];
    T.end = at + 1.4;
    return T;
  }

  // ------------------------------------------------------------------ the script
  _script() {
    const T = this.T, L = T.line, conf = this.conf, a = conf.actor, f = a.face;
    // his face: [from, preset, expression]
    this.acting = [
      [0, 'resigned', { worry: 0.5, brow: 0.3, tired: 0.75 }],
      [T.exhale, 'resigned', { worry: 0.25, tired: 0.85 }],                      // the breath out
      [T.lower + 1.5, 'resigned', { smile: 0.2, frown: 0.2, worry: 0.3, tired: 0.7 }],   // a small smile this time
      [L.v10[0] - 0.6, 'calm', { tired: 0.65, worry: 0.15, smile: 0.1 }],       // the tiredness showing
      [T.silence[0] + 0.5, 'calm', { tired: 0.6, worry: 0.3, brow: 0.15 }],
      [T.take, 'resigned', { tired: 0.6, frown: 0.15, brow: 0.1 }],
      [L.v11[0], 'resigned', { worry: 0.4, brow: 0.25, tired: 0.6 }],
      [T.in, 'calm', { tired: 0.65 }],
      [T.sit, 'calm', { tired: 0.85, smile: 0.05 }],                             // his face loosens; lids heavy
      [T.p80 - 1.2, 'calm', { smile: 0.5, brow: 0.2, tired: 0.7 }],              // a tired, real smile
      [T.c3, 'calm', { smile: 0.3, brow: 0.15, tired: 0.75 }],
      [T.drain, 'calm', { worry: 0.25, brow: 0.3, tired: 0.6 }],
      [T.gone + 0.8, 'resigned', { tired: 0.95, smile: 0.12 }],                  // tired all the way, a last small smile
      [T.fall + 1.5, 'resigned', { tired: 1.0, smile: 0.15 }]
    ];
    // what he looks at: [from, target, how quickly his head gets there]
    const aria = (out) => out.copy(FACE).add(v3(0, -0.05, 0));
    const at = (p) => (out) => out.copy(p);
    const port = (out) => out.copy(PORT).add(v3(0, 0.02, 0.08));
    const plug = (out) => out.copy(this.plugJoint || PORT);
    const bar = (out) => out.copy(this.bar.position);
    const light = (out) => this._lightAt(out);
    this.attention = [
      [0, at(PORT), 1.0], [T.exhale + 0.2, aria, 0.8], [T.walk + 0.2, port, 1.6], [T.lower + 1.6, aria, 1.1],
      [T.take - 0.3, plug, 2.4], [T.lookUp, aria, 2.2], [T.nod + 0.5, plug, 2.0], [T.in + 0.4, port, 1.6], [T.bar + 0.4, bar, 1.5],
      [T.sit, at(v3(0.3, 0.2, -1.2)), 1.2], [L.v12[0] + 0.2, bar, 0.9], [T.back, aria, 0.7], [T.turn, aria, 0.55],
      [T.drain + 0.15, light, 3.0], [T.gone + 0.7, aria, 0.9], [T.fall - 0.3, at(v3(0.9, 0, -1.8)), 1.5]
    ];
    // ARIA: [from, state, { gaze, pitch, smile, brow_up }: what of the state to change]
    this.ariaActing = [
      [0, 'deadpan'], [T.cut1 + 0.5, 'hesitant'], [T.lower + 1.1, 'hesitant', { gaze: 0.05 }],   // her gaze finds him and stays
      [L.v10[0] + 0.6, 'hesitant', { gaze: 0.0, lids: 0.34 }],                                    // lids lowering
      [T.silence[0] - 0.1, 'broken', { gaze: 0.12 }],
      [T.take + 0.4, 'hesitant', { gaze: 0.1, pitch: 0.12 }],                                     // watching his hands
      [T.bar + 0.6, 'hesitant', { gaze: 0.0, pitch: 0.2 }],                                       // she watches it,
      [T.watch + 1.6, 'tender', { pitch: 0.08 }],                                                 // then watches him
      [L.a8[0] - 0.5, 'tender', { smile: 0.62, brow_up: 0.45, lids: 0.18, pitch: 0.06 }]           // touched: a smile that is hers
    ];
    // the one-off moments
    this.events = [
      [0, () => this._promptClose()],
      [T.exhale, () => this._breath()],
      [T.walk, () => a.walkTo(KNEEL_AT, { then: 'SadIdle', turn: 0.7 })],
      [T.lower, () => this._lower()],
      [T.knees[0] + 0.85, () => this._thud(0.1)],
      [T.knees[0] + 1.25, () => this._thud(0.13)],
      [T.laugh1, () => f.laugh(0.4)],
      [T.silence[0] + 0.9, () => conf._fx && conf._zap(0.22)],
      [T.lower + 0.5, () => a.reach('L', this._leftGrip, { fade: 1.4 })],
      [T.grab, () => this._takePlug()],
      [T.try1 + 0.78, () => this._bump()],
      [T.nod, () => f.gesture('nod', 0.5)],
      [T.in, () => this._click()],
      [T.drop, () => { this._released = true; this._touchFrozen = this._touch.clone(); }],
      [T.sit, () => this._sitDown()],
      [T.sit + 1.3, () => this._thud(0.16)],
      [T.hand, () => a.reach('R', this._seatGrip, { fade: 1.6 })],
      [T.giggle, () => f.laugh(0.6)],
      [T.drain, () => this._drainStart()],
      [T.fall - 0.25, () => a.reach('R', null, { fade: 0.5 })],
      [T.fall, () => a.crossTo('FallForward', { fade: 0.6 })],
      [T.fall + 1.05, () => this._thud(0.2)],
      [T.fall + 1.6, () => this._thud(0.32)]
    ];
    // his right hand, on the cable: [from, how long the move takes, pose]
    this.rightTrack = [
      [0, 0, 'conf'], [T.walk, 0.8, 'hang'], [T.lower + 0.6, 1.8, 'kneel'], [T.take, 0.95, 'cable'],
      [T.in + 0.35, 0.5, 'push'], [T.open, 0.55, 'open'], [T.drop + 0.2, 0.9, 'thigh']
    ];
    // the stills (slow machines): a new picture at each of these, as well as at each shot and line
    this.beats = [T.walk + 1, T.lower + 1, T.knees[1], T.silence[0] + 1.5, T.grab, T.try1 + 0.8, T.lookUp + 0.3, T.try2 + 0.6, T.in, T.drop + 0.4,
      T.bar + 1.5, T.p40 - 2, T.back + 1.5, T.p80, T.p80 + 3, T.drain + 0.2, T.drain + 0.9, T.drain + 1.6, T.drain + 2.4, T.gone + 0.3, T.fall + 0.8, T.fall + 1.6, T.fall + 3, T.handOpen[1]];
  }

  // ------------------------------------------------------------------ playing
  // Resolves when the picture has gone to black (at the end, or skipped)
  play() {
    const conf = this.conf, a = conf.actor;
    this.running = true;
    this.t = 0;
    this._last = performance.now();
    this.T = this._timeline();
    this._script();
    this._cam0 = { p: conf.camera.position.clone(), q: conf.camera.quaternion.clone(), fov: conf.camera.fov };
    this.sub = conf.sub;
    this.subWho = conf.subWho;
    this.subText = conf.subText;
    this.hint = conf.hint;
    // ARIA's face onto the drain's material; the confrontation's body work stops (Scene B does its own)
    conf.holo.visible = false;
    this._holoTwin.visible = true;
    this.sand.visible = true;
    this.bar.visible = true;
    this.flash.visible = true;
    conf._bodyHook?.();
    // (the cable a shade lighter than in the confrontation: here it has to be seen against the
    // projector's dark front)
    this._cableColour = conf.trail.mesh.material.color.getHex();
    conf.trail.mesh.material.color.setHex(0x323a40);
    this._level0 = conf._ariaLevel ?? 0.6;
    this._colour = (conf._holoColour || COLD).clone();
    this._poseHook = a.onPose((actor, dt) => this._pose(actor, dt));
    // his right hand: from the confrontation's grip onto this scene's (the same pose at first)
    this._rightGrip = (actor) => this._grip('R', actor);
    this._leftGrip = (actor) => this._grip('L', actor);
    this._seatGrip = (actor) => this._seat(actor);
    a.reach('R', this._rightGrip, { fade: 0.001 });
    this._gA = { R: blank(), L: blank() };
    this._gB = { R: blank(), L: blank() };
    this._gaze = conf._gaze || { yaw: 0, pitch: 0 };
    this._touch = new THREE.Vector3();
    window.addEventListener('keydown', this._onKey);
    this._startSound();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  _key(e) {
    if (!this.running || e.code !== 'Enter' || this.t < SKIP_AFTER || this._skip || this._ended) return;
    e.preventDefault();
    e.stopPropagation();
    this._skip = { t: 0 };
    this._stopVoices(0.4);
  }

  // per frame, instead of the level's. Time is the sound's clock while it runs, else the frames'.
  render(renderer) {
    const now = performance.now();
    const raw = (now - this._last) / 1000;
    this._last = now;
    if (this._ended) return this._black(renderer);
    const ac = this.conf.ac;
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
    this.conf._judge(raw, t + 10);         // (the confrontation's judgement carries on: stills if it goes slow)
    if (this.conf.still && !this.stats.still) this.stats.still = this.conf.stats.still;
    let black = null;
    if (this._skip) {
      this._skip.t += Math.min(raw, 0.1);
      black = Math.max(this._blackAt(t), clamp(this._skip.t / 0.6));
      if (this._skip.t > 0.75) return this._finish(renderer);
    } else if (t >= this.T.end) {
      return this._finish(renderer);
    }
    if (this.hint) this.hint.style.opacity = !this._skip && t > SKIP_AFTER && t < this.T.black[0] ? 0.55 : 0;
    this._animate(t, dt);
    this._subtitles(t);
    this._draw(renderer, t, black);
  }

  _finish(renderer) {
    this._ended = true;
    this._stopVoices(0.2);
    if (this.sub) this.sub.style.opacity = 0;
    if (this.hint) this.hint.style.opacity = 0;
    const resolve = this._resolve;
    this._resolve = null;
    resolve?.(this._skip ? 'skipped' : 'done');
    this._black(renderer);
  }

  _black(renderer) {
    renderer.setRenderTarget(null);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
  }

  // ------------------------------------------------------------------ the action
  _animate(t, dt) {
    const conf = this.conf, a = conf.actor;
    const step = Math.min(dt, 0.05);
    for (const ev of this.events) {
      if (!ev.done && t >= ev[0]) {
        ev.done = true;
        ev[1]();
      }
    }
    this._acting(t);
    this._look(t, step);
    this._mouths(t);
    this._lowering(t);
    a.update(step);
    this._cableUpdate(t, step);
    this._ariaUpdate(t, step);
    this._lights(t);
    this._camera(t, step);
    // his feet as he walks to the port
    if (a.currentName === 'InjuredWalk' && a.moveSpeed > 0.1) {
      const w = a.anim.actions.InjuredWalk, d = w.getClip().duration;
      const phase = (w.time % d) / d < 0.45 ? 0 : 1;
      if (phase !== this._footPhase) {
        if (this._footPhase !== undefined && conf._fx) conf._footstep(phase);
        this._footPhase = phase;
      }
    }
  }

  // 1: the prompt comes close, onto Yes, then goes: the cut to him
  _promptClose() {
    const el = this.conf._choiceEl;
    if (!el) return;
    const yes = el.querySelector('[data-choice="yes"]');
    const r = yes?.getBoundingClientRect();
    el.style.transition = 'none';
    el.style.opacity = '1';
    yes?.classList.add('focus');
    if (r) el.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`;
    requestAnimationFrame(() => {
      el.style.transition = 'transform 1.2s cubic-bezier(.55,0,.25,1)';
      el.style.transform = 'scale(2.2)';
      if (yes) yes.style.cssText += ';transition:background .2s;background:rgba(0,229,255,.38)';
    });
    this._promptEl = el;
  }

  // his face, stretch by stretch
  _acting(t) {
    const f = this.conf.actor.face;
    let mood = this.acting[0];
    for (const m of this.acting) if (t >= m[0]) mood = m;
    if (f._moodB !== mood) {
      f._moodB = mood;
      f.setPreset(mood[1]);
    }
    f.pose(mood[2], 0.5);
  }

  // His eye line (as the confrontation's: the head turned a little more toward what he looks at
  // every frame), with a wider turn: sitting, she is behind him
  _look(t, dt) {
    const a = this.conf.actor;
    let entry = this.attention[0];
    for (const e of this.attention) if (t >= e[0]) entry = e;
    const head = a.bone('head');
    const toRoot = a.root.getWorldQuaternion(this._q2 ||= new THREE.Quaternion()).invert();
    const want = entry[1](this._v).sub(head.getWorldPosition(this._v2)).applyQuaternion(toRoot);
    const fwd = this._v3.copy(this.conf._headFwd).applyQuaternion(head.getWorldQuaternion(this._q)).applyQuaternion(toRoot);
    const yawErr = Math.atan2(want.x, want.z) - Math.atan2(fwd.x, fwd.z);
    const pitchErr = -(Math.atan2(want.y, Math.hypot(want.x, want.z)) - Math.atan2(fwd.y, Math.hypot(fwd.x, fwd.z)));
    const g = this._gaze, k = entry[2] * dt;
    // (lying on the floor he looks at nothing: the turn eases out)
    const lying = seg(t, this.T.fall, this.T.fall + 1.2);
    g.yaw = clamp(g.yaw + clamp(Math.atan2(Math.sin(yawErr), Math.cos(yawErr)), -0.6, 0.6) * k, -1.2, 1.2) * (1 - 0.1 * lying);
    g.pitch = clamp(g.pitch + clamp(pitchErr, -0.5, 0.5) * k, -0.6, 0.75) * (1 - 0.1 * lying);
    a.face.look(g.yaw, g.pitch, 0.3, 30);
  }

  // His mouth and hers on their voices; without a recording, wordless talk while the subtitle is up
  _mouths(t) {
    const L = this.T.line;
    let voss = null, aria = null;
    for (const l of LINES_B) {
      if (t >= L[l.id][0] && t <= L[l.id][1]) {
        if (l.who === 'voss') voss = l.id;
        else aria = l.id;
      }
    }
    const f = this.conf.actor.face;
    if (voss !== this._vossLine) {
      this._vossLine = voss;
      if (!voss) f.stopSpeaking();
      else if (this.analysers?.has(voss)) f.attachAnalyser(this.analysers.get(voss));
      else f.startBabble(0.7);
    }
    const head = this.conf.aria.head;
    if (t >= this.T.drain) aria = null;
    if (aria !== this._ariaLine) {
      this._ariaLine = aria;
      if (!aria) head.stopSpeaking();
      else {
        head.attachAnalyser(this.analysers?.get(aria) || null);
        head.startSpeaking();
      }
    }
  }

  // 1: down to the floor: SitDown from its standing frames to its crouch (driven, not played, so it
  // goes as slowly as a tired man does), then the kneel built on it
  _lower() {
    const a = this.conf.actor;
    // (if the walk has not quite planted him there, it stops here and he is eased onto the spot)
    a._walkTo?.resolve?.();
    a._walkTo = null;
    this._sitAct = a.crossTo('SitDown', { at: 1.5, rate: 0, fade: 0.6 });
    this._yaw0 = a.root.rotation.y;
    this._from = a.root.position.clone();
  }

  _lowering(t) {
    const T = this.T, a = this.conf.actor;
    if (this._sitAct && !this._seated) {
      // (slow at first, as if the floor is far away)
      const u = seg(t, T.lower, T.lower + 2.9);
      this._sitAct.time = 1.5 + 1.7 * (0.35 * u + 0.65 * u * u);
      this._sitAct.timeScale = 0;
      // turning square to the port as he bends
      let d = Math.PI - this._yaw0;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      a.root.rotation.y = this._yaw0 + d * seg(t, T.lower, T.lower + 1.4);
      a.root.position.lerpVectors(this._from, KNEEL_AT, seg(t, T.lower, T.lower + 1.4));
    }
  }

  // 5: he sits back (while the picture is on her): out of the kneel, round, down against the
  // projector beside the port
  _sitDown() {
    const a = this.conf.actor;
    this._seated = true;
    a.reach('R', null, { fade: 0.001 });
    a.reach('L', null, { fade: 0.001 });
    a.root.position.copy(SIT_AT);
    a.root.rotation.y = SIT_YAW;
    a.crossTo('SitDown', { at: 3.55, fade: 0, rate: 0.85, then: 'SitIdle' });
    this._gaze.yaw = 0;
    this._gaze.pitch = 0.3;
  }

  // After the clips, before the reaches: his shoulders (dropping fully as he breathes out), the
  // kneel and how far he leans over the port, the lean back against the projector, his breathing
  // in the held poses, his hand opening at the very end
  _pose(a) {
    const T = this.T, t = this.t;
    const side = a._axis(0, new THREE.Vector3()), fwd = a._axis(2, new THREE.Vector3()), q = this._q;
    const standing = 1 - seg(t, T.lower + 0.3, T.lower + 1.5);
    const drop = (1 + 0.9 * seg(t, T.exhale, T.exhale + 1.1) - 0.4 * seg(t, T.walk, T.walk + 1)) * standing;
    if (drop > 0) {
      a.turnBone(a.bone('leftClavicle'), q.setFromAxisAngle(fwd, 0.06 * drop));
      a.turnBone(a.bone('rightClavicle'), q.setFromAxisAngle(fwd, -0.06 * drop));
      a.turnBone(a.bone('spine4'), q.setFromAxisAngle(side, 0.045 * drop));
    }
    if (!this._seated) {
      const k = seg(t, T.knees[0], T.knees[1]);
      // upright while he talks to her; over the port for the plug; back up a little after it
      const lean = 0.08 + 0.44 * seg(t, T.take - 0.4, T.grab) * (1 - 0.6 * seg(t, T.in + 0.6, T.drop + 0.6));
      this._kneelO ||= { ...KNEEL };
      this._kneelO.lean = lean;
      kneel(a, k, this._kneelO);
      if (k > 0) {
        // breathing, which the held clip does not do
        const b = Math.sin(t * Math.PI * 2 / 4.2);
        a.turnBone(a.bone('spine4'), q.setFromAxisAngle(side, -0.012 * b * k));
      }
      return;
    }
    // sitting: the back eased onto the panel behind him, the head resting against it
    const lying = seg(t, T.fall, T.fall + 0.5);
    const back = seg(t, T.back, T.back + 1.7) * (1 - lying);
    leanBack(a, back, { back: 0.4, head: 0.3 });
    // as she goes: he sits forward a little, his eyes following her down
    const follow = seg(t, T.drain, T.drain + 0.8) * (1 - seg(t, T.gone + 0.5, T.gone + 2.0));
    if (follow > 0) bendBack(a, 0.12 * follow * (1 - lying));
    // the last movement: his right hand opening slowly
    if (t > T.fall + 1.6) {
      const open = seg(t, T.handOpen[0], T.handOpen[1]);
      curlFingers(a, 'R', 0.75 - 0.95 * open);
    }
  }

  // ------------------------------------------------------------------ the hands
  _grip(side, a) {
    const t = this.t;
    if (side === 'L') return this._leftPose(a, this._gA.L);
    const track = this.rightTrack;
    let i = 0;
    while (i + 1 < track.length && t >= track[i + 1][0]) i++;
    const cur = this._rightPose(track[i][2], a, this._gA.R);
    const [t0, dur] = track[i];
    if (i > 0 && dur > 0 && t < t0 + dur) blendGrip(this._rightPose(track[i - 1][2], a, this._gB.R), cur, ease((t - t0) / dur));
    // the tremor (shakier with the plug in his hands)
    const tr = 0.0022 + 0.0035 * seg(t, this.T.take, this.T.grab) * (1 - seg(t, this.T.in, this.T.in + 0.5));
    cur.wrist.x += tr * (Math.sin(t * 58.4) * 0.6 + Math.sin(t * 82.3 + 1) * 0.4);
    cur.wrist.y += tr * (Math.sin(t * 47.1 + 2) * 0.5 + Math.sin(t * 71.7) * 0.5);
    return cur;
  }

  // His right hand round the cable (root-local numbers turned into the world)
  _rightPose(name, a, out) {
    const conf = this.conf, r = a.root;
    if (name === 'conf' || name === 'hang') {
      if (name === 'conf') return copyGrip(conf._grip('R', a), out);
      return conf._pose('R', 'hang', a, out);
    }
    const loc = (x, y, z, o) => r.localToWorld(o.set(x, y, z));
    const dir = (x, y, z, o) => o.set(x, y, z).applyQuaternion(r.quaternion).normalize();
    const P = {
      kneel: [-0.21, 0.5, 0.27], cable: [-0.17, 0.52, 0.36], push: [-0.15, 0.5, 0.41], open: [-0.17, 0.53, 0.37], thigh: [-0.19, 0.5, 0.25]
    }[name];
    loc(P[0], P[1], P[2], out.wrist);
    if (name === 'kneel' || name === 'thigh') {
      dir(0.15, -0.5, 1, out.fingers);
      dir(1, 0, 0, out.palm);
      dir(-0.9, -0.2, -0.3, out.pole);
    } else {
      dir(0.35, -0.45, 1, out.fingers);
      dir(1, 0.25, 0, out.palm);
      dir(-0.9, -0.1, -0.4, out.pole);
    }
    const c = { kneel: [1.15, 1.25, 1.05], cable: [1.25, 1.35, 1.15], push: [1.3, 1.4, 1.2], open: [0.25, 0.3, 0.2], thigh: [0.55, 0.6, 0.5] }[name];
    out.curl = out.curl || [0, 0, 0];
    out.thumb = out.thumb || [0, 0, 0];
    for (let i = 0; i < 3; i++) out.curl[i] = c[i];
    out.thumb[0] = name === 'open' ? 0.15 : 0.6;
    out.thumb[1] = name === 'open' ? 0.1 : 0.45;
    return out;
  }

  // His left hand: on his thigh while he kneels; then on the plug (from above, the fingers round
  // its housing, pointing along it, held far enough back that the plug shows); then on his thigh again
  _leftPose(a, out) {
    const t = this.t, T = this.T, r = a.root;
    const rest = (this._gR ||= blank());
    r.localToWorld(rest.wrist.set(0.19, 0.5, 0.25));
    rest.fingers.set(0.1, -0.5, 1).applyQuaternion(r.quaternion).normalize();
    rest.palm.set(-1, 0, 0).applyQuaternion(r.quaternion).normalize();
    rest.pole.set(0.9, -0.2, -0.3).applyQuaternion(r.quaternion);
    rest.curl = [0.45, 0.5, 0.4];
    rest.thumb = [0.2, 0.2];
    if (t < T.take - 0.1) return copyGrip(rest, out);
    const j = this.plugJoint || this.conf.plug.position, d = this.plugDir || UP_NEG;
    const up = a._axis(1, new THREE.Vector3());
    const right = a._axis(0, new THREE.Vector3()).negate();
    out.wrist.copy(j).addScaledVector(d, -0.06).addScaledVector(up, 0.048).addScaledVector(right, -0.015);
    out.fingers.copy(d).addScaledVector(up, -0.55).addScaledVector(right, 0.15).normalize();
    out.palm.copy(up).negate().addScaledVector(right, 0.45).normalize();
    out.pole.copy(right).negate().addScaledVector(up, -0.4);
    out.curl = [0.95, 1.05, 0.85];
    out.thumb = [0.55, 0.45];
    // (from his thigh to the plug; and back after he lets go of it)
    const on = ease(clamp((t - (T.take - 0.1)) / 0.85)) * (1 - ease(clamp((t - T.letL) / 0.9)));
    if (on < 1) {
      const g = copyGrip(rest, this._gL2 ||= blank());
      blendGrip(g, out, on);
    }
    return out;
  }

  // 7: sitting, his right hand off his knee and onto the floor beside him, open, palm up
  _seat(a) {
    const r = a.root, g = (this._gS ||= blank());
    r.localToWorld(g.wrist.set(-0.34, 0.035, 0.0));
    g.fingers.set(-0.45, -0.05, 0.9).applyQuaternion(r.quaternion).normalize();
    g.palm.set(0, 1, 0);
    g.pole.set(-0.5, 0.3, -0.8).applyQuaternion(r.quaternion);
    g.curl = [0.3, 0.35, 0.3];
    g.thumb = [0.15, 0.15];
    return g;
  }

  // ------------------------------------------------------------------ the cable
  // Until he takes the plug: the confrontation's own cable (the plug hanging from his fist). Then
  // the plug is in his left hand (and then in the port), the rope from his fist to it hanging in
  // between; then his fist lets go, and the rope falls from the port to the floor.
  _takePlug() {
    const plug = this.conf.plug;
    this._held = { joint: plug.position.clone(), dir: v3(0, -1, 0).applyQuaternion(plug.quaternion) };
  }

  // the plug, as he holds it: [joint (where the cable joins it), the way it points (to its tip)]
  _plugPose(t, joint, dir) {
    const T = this.T, h = this._held;
    const at = (dz, dx = 0, dy = 0) => v3(PORT.x + dx, PORT.y + dy, PORT.z + IN_DEPTH + dz);
    const IN = v3(0, 0, -1), OFF = v3(0.06, -0.09, -1).normalize();
    const keys = [
      [T.grab, h.joint, h.dir],
      [T.grab + 0.85, at(0.19, 0.015, 0.02), OFF],
      [T.try1 + 0.75, at(0.082, 0.026, 0.024), OFF],       // the tip on the collar's edge: it does not go
      [T.try1 + 0.95, at(0.098, 0.03, 0.02), OFF],
      [T.try1 + 1.55, at(0.2, 0.012, 0.012), v3(0.03, -0.05, -1).normalize()],
      [T.try2, at(0.18, 0.004, 0.004), v3(0.015, -0.02, -1).normalize()],
      [T.try2 + 0.85, at(0.09, 0, 0), IN],                  // lined up, the tip at the socket
      [T.in, at(0, 0, 0), IN]
    ];
    let i = 0;
    while (i + 1 < keys.length && t >= keys[i + 1][0]) i++;
    const k0 = keys[i], k1 = keys[Math.min(i + 1, keys.length - 1)];
    const u = k1 === k0 ? 1 : ease(clamp((t - k0[0]) / (k1[0] - k0[0])));
    joint.lerpVectors(k0[1], k1[1], u);
    dir.lerpVectors(k0[2], k1[2], u).normalize();
    // the shake in his hands, until it is in
    const tr = 0.0035 * (1 - seg(t, T.in - 0.15, T.in));
    joint.x += tr * (Math.sin(t * 53.1) * 0.6 + Math.sin(t * 77.9 + 1) * 0.4);
    joint.y += tr * (Math.sin(t * 44.3 + 2) * 0.5 + Math.sin(t * 69.1) * 0.5);
  }

  _cableUpdate(t, dt) {
    const conf = this.conf, a = conf.actor;
    if (!this._held) {
      conf._cableUpdate(t, dt);
      this.plugJoint = conf.plug.position;
      this.plugDir = v3(0, -1, 0).applyQuaternion(conf.plug.quaternion);
      return;
    }
    const joint = (this._joint ||= new THREE.Vector3()), dir = (this._dir ||= new THREE.Vector3());
    this._plugPose(t, joint, dir);
    this.plugJoint = joint;
    this.plugDir = dir;
    const tip = this._v.copy(joint).addScaledVector(dir, PLUG_LEN);
    conf.plug.position.copy(joint);
    conf.plug.quaternion.setFromUnitVectors(UP_NEG, dir);
    // his fist: where the cable comes out of it (as the confrontation's)
    const arm = a._arms.R, fingers = this._v2, palm = this._v3;
    arm.frame(fingers, palm);
    const fist = arm.hand.getWorldPosition(new THREE.Vector3()).addScaledVector(fingers, 0.068).addScaledVector(palm, 0.028);
    const axis = new THREE.Vector3().crossVectors(fingers, palm).normalize();
    if (axis.y > 0) axis.negate();
    const below = fist.clone().addScaledVector(axis, 0.045);
    const above = fist.clone().addScaledVector(axis, -0.045);
    const rope = conf.rope, n = rope.p.length;
    const bp = (name) => a.bone(name).getWorldPosition(new THREE.Vector3());
    const caps = this._released ? [] : [[bp('rightThigh'), bp('rightCalf'), 0.085], [bp('pelvis'), bp('spine1'), 0.15]];
    ropeStep(rope, dt, this._released ? null : below, [[n - 2, joint], [n - 1, tip]], caps);
    const pts = rope.p;
    // the floor's part: along where he walked, then (from where it touches down behind him) up into
    // his fist; once he has let go, to where the free end lies
    const r = a.root;
    if (!this._released) {
      const back = a._axis(2, new THREE.Vector3()).negate(), right = a._axis(0, new THREE.Vector3()).negate();
      this._touch.copy(r.position).addScaledVector(back, 0.5).addScaledVector(right, 0.27).setY(CABLE_R);
      this._back = back;
      this._right = right;
    }
    const touch = this._touchFrozen || this._touch;
    const list = [...conf._lead];
    const sTouch = Math.max(0, Math.min(conf._s, conf.pathLen) - 0.55);
    for (let i = 0; i < conf._floor.length; i += 4) if (conf._floor[i].s < sTouch - 0.35) list.push(conf._floor[i].p);
    list.push(touch);
    if (!this._released) {
      const back = this._back, right = this._right;
      list.push(touch.clone().addScaledVector(back, -0.16).add(v3(0, 0.06, 0)));
      list.push(above.clone().addScaledVector(back, 0.16).addScaledVector(right, 0.1).setY(Math.max(0.25, above.y - 0.3)));
      list.push(above.clone().addScaledVector(back, 0.06).addScaledVector(right, 0.03).addScaledVector(axis, -0.05));
      list.push(above);
      conf.dangle.update([above.clone().addScaledVector(axis, -0.005), fist, ...pts.slice(0, -1)]);
    } else {
      // (on the floor from where it touched down to the end that fell)
      list.push(touch.clone().lerp(pts[0], 0.5).setY(CABLE_R));
      list.push(pts[0]);
      conf.dangle.update(pts.slice(0, -1));
    }
    conf.trail.update(list);
    this._trailList = list;
    // the free end landing on the floor
    const y = pts[0].y;
    if (this._released && !this._landed && y < CABLE_R + 0.004) {
      this._landed = true;
      if (conf._fx) conf._knock(0.45);
    }
  }

  // ------------------------------------------------------------------ ARIA
  _ariaUpdate(t, dt) {
    const T = this.T, conf = this.conf, head = conf.aria.head;
    let entry = this.ariaActing[0];
    for (const s of this.ariaActing) if (t >= s[0]) entry = s;
    if (entry !== this._ariaEntry) {
      this._ariaEntry = entry;
      if (entry[1] !== head.exprName) head.setExpression(entry[1]);
      if (entry[2]) Object.assign(head.exprTarget, entry[2]);
    }
    if (t < T.drain) head.update(dt);
    head.camera.position.z = conf._headCamZ;
    // her light: up again from the dim of the choice as she sees what he is doing; while she says
    // nothing (3) it flickers as someone trying not to cry; warm and a little brighter while the
    // bar climbs; then the flash, and the drain takes it
    let level = this._level0 + (1 - this._level0) * seg(t, T.cut1, T.lower + 2);
    if (t > T.silence[0] && t < T.silence[1] + 0.4) {
      const s = Math.sin(t * 3.1) * Math.sin(t * 7.7 + 1) + 0.6 * Math.sin(t * 17.3);
      level *= 1 - 0.42 * clamp(s - 0.45) * seg(t, T.silence[0], T.silence[0] + 0.6);
      if (Math.sin(t * 41) > 0.93) level *= 0.55;
    }
    const warm = seg(t, T.back, T.p80 + 2);
    level *= 1 + 0.15 * seg(t, T.bar, T.p80);
    const drain = t - T.drain;
    if (drain > -0.06) level *= 1 + 0.9 * Math.exp(-Math.max(0, drain) * 2.5);    // the surge at the flash
    this._ariaLevel = level;
    const u = conf.holoMat.uniforms;
    u.uLevel.value = level;
    u.uTime.value = t + 100;
    u.uTear.value = t > T.silence[0] && t < T.silence[1] && Math.sin(t * 2.3) > 0.82 ? 0.18 : 0;
    if (u.uRed) u.uRed.value = 0;
    this.drainU.uDrain.value = drain > 0 ? drain : -1;
    // her colour: the cold blue of the choice, softening, then warm
    _c.copy(COLD).lerp(SOFT, seg(t, T.cut1, T.silence[1]));
    if (entry[1] === 'broken') _c.lerp(_c2.setHex(0x8fb4ff), 0.5);
    _c.lerp(WARM, 0.75 * warm);
    if (drain > 0) _c.lerp(_c2.setHex(0xdff4ff), 0.5);
    this._colour.lerp(_c, 1 - Math.exp(-dt * 2));
    u.colorState.value.copy(this._colour);
    const fade = 1 - seg(drain, 0.2, 2.6);
    conf.halo.material.opacity = 0.75 * level * fade;
    conf.beam.material.opacity = 0.45 * level * fade;
    // the port: lit and pulsing while she waits; it takes the cable; bright at the flash
    const flash = drain > -0.06 ? Math.exp(-Math.max(0, drain) * 1.6) : 0;
    conf.portMat.color.setHex(0x5fe8ff).multiplyScalar((1.4 + 0.3 * Math.sin(t * 2.1)) * (1 - seg(t, T.in, T.in + 1.5) * 0.4) + 4 * flash);
    this.flash.material.opacity = flash;
    this.flash.scale.setScalar(0.35 + 1.4 * (1 - flash) * flash + 0.6 * flash);
    // the bar
    const pct = this._pct(t);
    if (Math.floor(pct) !== this._barPct) {
      this._drawBar(pct);
      if (Math.floor(pct) % 10 === 0 && pct > 0) this._blip(Math.floor(pct));
    }
    this.barU.uLevel.value = seg(t, T.bar, T.bar + 1.5) * level;
    this.barU.uFlash.value = t > T.p100 - 0.05 ? Math.exp(-(t - T.p100) * 6) : 0;
    this.barU.uGone.value = drain > 0 ? drain : -1;
    // the light down the cable
    this.sand.material.uniforms.uScale.value = this._size.y * RENDER_SCALE / (2 * Math.tan(THREE.MathUtils.degToRad(conf.camera.fov) / 2));
  }

  // the bar's percentage now: it climbs (unevenly, as bars do) to 40% and waits for his line, to
  // 80% and waits again, then to 100%
  _pct(t) {
    const T = this.T;
    const climb = (a, b, from, to) => from + (to - from) * stutter(clamp((t - a) / (b - a)));
    if (t < T.p1) return t < T.bar ? 0 : 1;
    if (t < T.c2) return climb(T.p1, T.p40, 1, 40);
    if (t < T.c3) return climb(T.c2, T.p80, 40, 80);
    return climb(T.c3, T.p100, 80, 100);
  }

  // 9: the flash: her face is frozen where it was (mid-word), and the drain begins; the light's path
  // is laid along the cable as it lies now, from the plug back out toward the door
  _drainStart() {
    this._frozen = true;
    const pts = [this.plugJoint.clone()];
    const rope = this.conf.rope.p;
    for (let i = rope.length - 2; i >= 0; i--) pts.push(rope[i].clone());
    const list = this._trailList || [];
    for (let i = list.length - 2; i >= 0; i--) pts.push(list[i].clone());
    // resampled by length into PATH_N points (the first 6 m)
    const d = [0];
    for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = Math.min(6, d[d.length - 1]);
    const P = this.pathU.uPath.value, S = this.pathU.uPathS.value;
    let j = 0;
    for (let k = 0; k < PATH_N; k++) {
      const s = (k / (PATH_N - 1)) * total;
      while (j + 1 < d.length - 1 && d[j + 1] < s) j++;
      const u = clamp((s - d[j]) / Math.max(1e-6, d[j + 1] - d[j]));
      P[k].lerpVectors(pts[j], pts[Math.min(j + 1, pts.length - 1)], u);
      S[k] = s;
    }
    this.pathU.uPathLen.value = total;
    this.sand.material.uniforms.uPlug.value.copy(this.plugJoint).addScaledVector(this.plugDir, -0.01);
  }

  // where the light is (for his eyes to follow it): down from her face to the port, then along the
  // cable toward the door
  _lightAt(out) {
    const d = this.t - this.T.drain;
    if (d < 0.9) return out.copy(FACE).lerp(PORT, ease(clamp(d / 0.9)));
    const P = this.pathU.uPath.value;
    const s = clamp((d - 0.9) / 2.2) * (PATH_N - 1) * 0.5;
    const i = Math.min(PATH_N - 2, Math.floor(s));
    return out.lerpVectors(P[i], P[i + 1], s - i);
  }

  // The room: a little brighter and warmer from her light while the bar climbs; dimmer without her
  _lights(t) {
    const T = this.T, conf = this.conf;
    const warm = seg(t, T.bar, T.p80), gone = seg(t, T.drain + 0.3, T.gone + 1.0);
    const flash = t > T.drain - 0.06 ? Math.exp(-Math.max(0, t - T.drain) * 2.2) : 0;
    const coldness = 0.85 * (1 - 0.45 * warm);
    for (const l of conf.lamps) {
      l.intensity = l.userData.base * 0.55 * (1 + 0.18 * warm) * (1 - 0.15 * gone);
      l.color.copy(l.userData.color).lerp(COLD, coldness);
    }
    conf.hemi.intensity = 0.75 * 0.7 * (1 + 0.22 * warm) * (1 - 0.15 * gone) + 0.6 * flash;
    conf.hemi.color.setHex(0x8fa3b8).lerp(COLD, 0.5 * (1 - 0.5 * warm));
    conf.lampMat.color.setHex(0xffe0b4).lerp(COLD, 1 - 0.4 * warm).multiplyScalar(0.45 + 0.33 * (1 + 0.2 * warm) * (1 - 0.15 * gone));
    // her light on the room: her colour, brighter as the bar climbs; it goes down the cable with her
    const L = conf.ariaLight;
    L.color.copy(this._colour).lerp(COLD, 0.3 * (1 - warm));
    L.intensity = (4.5 * this._ariaLevel * (1 + 0.6 * warm) + 22 * flash) * (1 - gone);
    L.position.set(0, 1.6, -2.95).lerp(this._v.copy(PORT).add(v3(0, 0.1, 0.35)), seg(t, T.drain - 0.05, T.drain + 1.2));
  }

  // ------------------------------------------------------------------ the camera
  _camera(t, dt) {
    const a = this.conf.actor;
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
    const pos = (this._camPos ||= new THREE.Vector3()), look = (this._camLook ||= new THREE.Vector3());
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
    const shake = s.shake ?? 1;
    pos.x += shake * 0.006 * (Math.sin(t * 0.71) + 0.6 * Math.sin(t * 1.93 + 1));
    pos.y += shake * 0.004 * (Math.sin(t * 0.53 + 2) + 0.5 * Math.sin(t * 1.37));
    look.x += shake * 0.01 * Math.sin(t * 0.61 + 4);
    look.y += shake * 0.007 * Math.sin(t * 0.83 + 3);
    if (!s.free) {
      keepInside(pos);
      pushOut(pos, this._V, this._v3.copy(this._H).add(v3(0, 0.12, 0)), s.clear ?? 0.32);
    }
    const cam = this.conf.camera;
    cam.position.copy(pos);
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    if (s.quat) cam.quaternion.copy(s.quat);
    else cam.lookAt(look);
  }

  _shotList() {
    const T = this.T, L = T.line, V = () => this._V, H = () => this._H, a = this.conf.actor;
    const fwd = () => a._axis(2, this._v3);
    const c0 = this._cam0;
    const ahead = new THREE.Vector3(0, 0, -3).applyQuaternion(c0.q).add(c0.p);
    return [
      // 1: the high wide (as the confrontation left it) while the prompt comes close
      { at: 0, fn: (t, p, l) => { p.copy(c0.p); l.copy(ahead); }, fov: c0.fov, free: true, shake: 0.6 },
      // cut to him: in front of him, close, as he breathes out
      { at: T.cut1, fn: (t, p, l) => {
        const u = seg(t, T.cut1, T.walk + 0.6);
        // (along the way he faced at the cut: the walk turns him, the camera stays)
        const f0 = (this._fwd1 ||= fwd().clone());
        p.copy(H()).addScaledVector(f0, 1.2 - 0.12 * u).add(v3(0.28, -0.06, 0.05));
        l.copy(H()).add(v3(0, -0.06, 0));
      }, fov: 36 },
      // to the port and down: from in front of him, to his right, as he comes and kneels
      { at: T.walk + 0.7, fn: (t, p, l) => {
        const u = seg(t, T.walk + 0.7, L.v9[1]);
        p.set(1.6, 1.3 - 0.3 * u, -3.0 + 0.04 * u);
        l.copy(H()).lerp(V(), 0.35).add(v3(-0.1, 0.05, 0));
      }, fov: 46 },
      // 2: a two-shot from his side: him on the floor, her face above him
      { at: L.v10[0] - 0.4, fn: (t, p, l) => {
        const u = seg(t, L.v10[0] - 0.4, T.silence[0]);
        p.set(1.64, 0.88 + 0.04 * u, -2.62 - 0.04 * u);
        l.set(0.32, 1.38, -3.02);
      }, fov: 54 },
      // 3: hold on her, from his eye line, low
      { at: T.silence[0] - 0.05, fn: (t, p, l) => {
        const u = seg(t, T.silence[0], T.silence[1]);
        p.copy(FACE).add(v3(0.3 - 0.05 * u, -0.6, 1.5 - 0.15 * u));
        l.copy(FACE).add(v3(0, -0.06, 0));
      }, fov: 30, shake: 0.7 },
      // 4: close on his hands, the plug and the port
      { at: T.take - 0.15, fn: (t, p, l) => {
        const u = seg(t, T.take, T.lookUp);
        p.set(0.02 + 0.04 * u, 0.64 - 0.03 * u, PORT.z + 0.19);
        l.copy(PORT).add(v3(0.02, 0.06, 0.16));
      }, fov: 40, clear: 0.2 },
      // he looks up at her: his face, from in front of him, low by the projector
      { at: T.lookUp - 0.15, fn: (t, p, l) => {
        p.set(1.64, 0.98, PORT.z + 0.07);
        l.copy(H()).add(v3(0, -0.1, 0));
      }, fov: 38, clear: 0.2 },
      // back to his hands for the second try
      { at: T.try2 - 0.35, fn: (t, p, l) => {
        p.set(0.08, 0.6, PORT.z + 0.17);
        l.copy(PORT).add(v3(0.02, 0.04, 0.13));
      }, fov: 34, clear: 0.2 },
      // 5: the insert: the plug going in; he lets go (it pulls back a little to show his hand open)
      { at: T.in - 0.75, fn: (t, p, l) => {
        const u = seg(t, T.in - 0.75, T.letL);
        p.copy(PORT).add(v3(-0.35 + 0.03 * u, -0.08, 0.2));
        l.copy(PORT).add(v3(0.04, 0.02, 0.08));
      }, fov: 32, free: true, shake: 0.5 },
      { at: T.letL + 0.35, fn: (t, p, l) => {
        const u = seg(t, T.letL + 0.35, T.watch);
        p.set(1.15 + 0.04 * u, 0.85 + 0.03 * u, -3.02 + 0.06 * u);
        l.set(0.74, 0.36 - 0.08 * u, -2.95);
      }, fov: 44, clear: 0.2, shake: 0.6 },
      // she watches the bar come up, then him
      { at: T.watch, fn: (t, p, l) => {
        const u = seg(t, T.watch, T.watch + 2.6);
        p.copy(FACE).add(v3(-0.32 + 0.05 * u, -0.28, 1.55 - 0.12 * u));
        l.copy(FACE).add(v3(0, -0.16, 0));
      }, fov: 36 },
      // 6: a slow push on him, sitting
      { at: T.watch + 2.55, fn: (t, p, l) => {
        const u = seg(t, T.watch + 2.55, T.c2);
        p.copy(H()).addScaledVector(fwd(), 1.75 - 0.5 * u).add(v3(-0.12, 0.12 - 0.05 * u, 0));
        l.copy(H()).add(v3(0, -0.1, 0));
      }, fov: 40 },
      // 7: the two of them, him below, her above, the bar between
      { at: T.c2 - 0.1, fn: (t, p, l) => {
        const u = seg(t, T.c2, T.c3);
        p.set(0.85 - 0.08 * u, 0.95 + 0.05 * u, -0.85 - 0.2 * u);
        l.set(0.5, 1.02, -3.05);
      }, fov: 48 },
      // 8: hold on the bar and her
      { at: T.c3 - 0.1, fn: (t, p, l) => {
        const u = seg(t, T.c3, L.a8[0]);
        p.copy(FACE).add(v3(0.28, -0.45, 1.35 - 0.1 * u));
        l.copy(FACE).add(v3(0, -0.24, 0));
      }, fov: 36 },
      // past him, up at her: he holds her eyes; she is touched
      { at: L.a8[0] - 0.55, fn: (t, p, l) => {
        const u = seg(t, L.a8[0] - 0.55, T.flash);
        p.set(0.36 - 0.03 * u, 0.62 + 0.02 * u, -1.72 - 0.08 * u);
        l.set(0.55, 1.15, -3.1);
      }, fov: 50, clear: 0.25 },
      // 9: the flash, and she goes: her face at the top, the port and the cable at the bottom
      { at: T.flash - 0.02, fn: (t, p, l) => {
        const u = seg(t, T.flash, T.gone + 0.5);
        p.set(0.42, 1.22 - 0.04 * u, -1.0 + 0.05 * u);
        l.set(0.3, 0.98 - 0.04 * u, -3.0);
      }, fov: 54, shake: 0.5 },
      // his eyes come back to the empty terminal: close on him
      { at: T.gone + 0.35, fn: (t, p, l) => {
        const u = seg(t, T.gone + 0.35, T.fall);
        p.copy(H()).addScaledVector(fwd(), 1.05 - 0.1 * u).add(v3(-0.08, 0.1, 0));
        l.copy(H()).add(v3(0, -0.02, 0));
      }, fov: 38 },
      // 10 and 11: a slow pull back and up, away from him, still rising as it goes to black
      { at: T.fall - 0.05, fn: (t, p, l) => {
        const u = ease(clamp((t - T.fall) / (T.end - T.fall)));
        const c = this._fallC ||= SIT_AT.clone().add(v3(0.25, 0, 0.55));
        // (from his right: he lies along the picture, his right hand, the one that opens, toward us)
        p.set(c.x - 1.6 - 0.45 * u, 0.85 + 1.0 * u, c.z + 0.5 + 0.9 * u);
        l.copy(V()).lerp(c, 0.4).setY(0.2);
      }, fov: 44, shake: 0.4 }
    ];
  }

  // ------------------------------------------------------------------ the picture
  _blackAt(t) {
    const T = this.T;
    return seg(t, T.black[0], T.black[1]);
  }

  _draw(renderer, t, black = null) {
    const conf = this.conf;
    renderer.getDrawingBufferSize(this._size);
    const w = Math.max(16, Math.round(this._size.x * RENDER_SCALE)), h = Math.max(16, Math.round(this._size.y * RENDER_SCALE));
    let fresh = !conf.still;
    if (conf.target.width !== w || conf.target.height !== h) {
      conf.target.setSize(w, h);
      conf.camera.aspect = w / h;
      conf.camera.updateProjectionMatrix();
      fresh = true;
    }
    if (conf.still) {
      let beat = 0;
      for (const b of this.beats) if (t >= b) beat++;
      const key = (this._lineAt(t)?.id || '-') + beat + ':' + this._shotIndex;
      if (key !== this._shot) {
        this._shot = key;
        fresh = true;
      }
    }
    if (fresh) {
      if (!this._frozen) conf.aria.head.render(renderer);
      renderer.setRenderTarget(conf.target);
      renderer.render(conf.scene, conf.camera);
      renderer.setRenderTarget(null);
    }
    const u = this.post.material.uniforms;
    u.tScene.value = conf.target.texture;
    u.uTime.value = t;
    u.uAspect.value = conf.camera.aspect;
    u.uBlack.value = black ?? this._blackAt(t);
    // (cold as the choice left it; less so once the bar climbs)
    u.uCold.value = 1 - 0.7 * seg(t, this.T.bar, this.T.p80) + 0.4 * seg(t, this.T.gone, this.T.fall);
    const d = t - this.T.drain;
    u.uFlash.value = d > -0.06 ? 0.55 * Math.exp(-Math.max(0, d) * 5) : 0;
    renderer.render(this.postScene, conf.postCam);
  }

  _lineAt(t, pad = 0) {
    const L = this.T.line;
    let found = null;
    for (const l of LINES_B) if (t >= L[l.id][0] && t <= L[l.id][1] + pad) found = l;
    return found;
  }

  _subtitles(t) {
    if (!this.sub) return;
    const line = this._skip ? null : this._lineAt(t, 0.35);
    if (line) {
      const text = line.then && t >= (this.T.part[line.id] ?? Infinity) - 0.1 ? line.then : line.text;
      if (this.subText.textContent !== text) {
        this.subText.textContent = text;
        this.subWho.textContent = NAMES[line.who];
        this.subWho.style.color = COLOURS[line.who];
      }
      this.sub.style.opacity = 1;
    } else {
      this.sub.style.opacity = 0;
    }
    // (the prompt: gone on the cut)
    if (this._promptEl && t >= this.T.cut1 - 0.1 && !this._promptGone) {
      this._promptGone = true;
      this._promptEl.style.transition = 'opacity .1s';
      this._promptEl.style.opacity = '0';
    }
  }

  // ------------------------------------------------------------------ sound
  _startSound() {
    const conf = this.conf, ac = conf.ac;
    if (!ac) return;
    ac.resume?.().catch(() => {});
    const at = ac.currentTime + 0.08;
    this._t0 = at;
    const T = this.T, L = T.line;
    this._sources = [];
    this.analysers = new Map();
    const bus = (this._bus = voiceBus(ac, ac.destination, settings.get('voice')));
    for (const l of LINES_B) {
      const buffer = this.buffers.get(l.id);
      if (!buffer) continue;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const an = ac.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.3;
      src.connect(an);
      this.analysers.set(l.id, an);
      const g = ac.createGain();
      const db = VOICE_GAIN_DB[l.id] || 0;
      const start = at + L[l.id][0];
      g.gain.value = dbGain(db);
      if (l.id === 'v14') {
        // the "Ahh" as he falls, ridden down to sit with the rest
        g.gain.setValueAtTime(dbGain(AHH_DB), start);
        g.gain.setValueAtTime(dbGain(AHH_DB), start + AHH_END);
        g.gain.linearRampToValueAtTime(dbGain(db), start + AHH_END + 0.12);
      }
      src.connect(g).connect(bus.input);
      src.start(start);
      // her line is cut off at 100%: mid-word, by the flash
      if (l.id === 'a8') {
        g.gain.setValueAtTime(dbGain(db), at + T.flash - 0.02);
        g.gain.linearRampToValueAtTime(0.0001, at + T.flash + 0.012);
        src.stop(at + T.flash + 0.05);
      }
      this._sources.push(src);
    }
    // the hum (the confrontation's): up a little as she wakes, rising through the last of the bar,
    // highest as she goes; then nothing at all
    const hum = conf._hum;
    if (hum) {
      const g = hum.gain;
      g.cancelScheduledValues(ac.currentTime);
      g.setValueAtTime(Math.max(0.0001, g.value), ac.currentTime);
      for (const [when, v] of [[T.cut1 + 1, 0.08], [T.silence[0], 0.1], [T.c3, 0.16], [T.p100, 0.5], [T.drain + 2.2, 0.75], [T.gone - 0.15, 0.62], [T.gone + 0.12, 0.0001]]) {
        g.linearRampToValueAtTime(v, at + when);
      }
      g.setValueAtTime(0.0001, at + T.gone + 0.2);
    }
  }

  // a soft knock of his body on the floor
  _thud(size) {
    const conf = this.conf;
    if (conf.ac && conf._fx) conf._thump(conf.ac.currentTime + 0.01, size);
  }

  // 1: his breath out: a long, soft rush of air
  _breath() {
    const conf = this.conf, ac = conf.ac;
    if (!ac || !conf._noise || !conf._fx) return;
    const when = ac.currentTime + 0.01;
    const src = ac.createBufferSource();
    src.buffer = conf._noise;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1100, when);
    f.frequency.linearRampToValueAtTime(650, when + 1.3);
    f.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.06, when + 0.18);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.5);
    src.connect(f).connect(g).connect(conf._fx);
    src.start(when, Math.random());
    src.stop(when + 1.6);
  }

  // 4: the first try: the plug's tip knocks on the edge of the collar
  _bump() {
    const conf = this.conf;
    if (!conf._fx) return;
    conf._click?.(0.22, 1.55);
    conf._click?.(0.1, 2.1);
  }

  // 5: in: a click, and a gentle chime
  _click() {
    const conf = this.conf, ac = conf.ac;
    if (!ac || !conf._fx) return;
    conf._click?.(0.5, 0.95);
    conf._thump?.(ac.currentTime + 0.01, 0.08);
    const when = ac.currentTime + 0.22;
    for (const [f, v, d] of [[1318.5, 0.05, 1.8], [1975.5, 0.028, 1.4], [2637, 0.012, 0.9]]) {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(v, when + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, when + d);
      o.connect(g).connect(conf._fx);
      o.start(when);
      o.stop(when + d + 0.05);
    }
  }

  // the bar, at each ten percent: a very soft blip
  _blip(pct) {
    const conf = this.conf, ac = conf.ac;
    if (!ac || !conf._fx || this._skip) return;
    const when = ac.currentTime + 0.01;
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = 880 + pct * 2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.012, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);
    o.connect(g).connect(conf._fx);
    o.start(when);
    o.stop(when + 0.2);
  }

  _stopVoices(fade = 0.3) {
    const ac = this.conf.ac;
    if (!ac) return;
    const now = ac.currentTime;
    this._bus?.output.gain.setTargetAtTime(0, now, fade / 4);
    const hum = this.conf._hum;
    if (hum) {
      hum.gain.cancelScheduledValues(now);
      hum.gain.setTargetAtTime(0.0001, now, fade / 4);
    }
    for (const s of this._sources || []) {
      try { s.stop(now + fade + 0.05); } catch { /* (already stopped) */ }
    }
    this._sources = [];
  }

  // Everything Scene B made; the confrontation (whose room this is) is left as it is
  dispose() {
    this.running = false;
    window.removeEventListener('keydown', this._onKey);
    this._stopVoices(0.05);
    try { this._bus?.output.disconnect(); } catch { /* (gone) */ }
    this._poseHook?.();
    for (const o of [this._holoTwin, this.sand, this.bar, this.flash]) o?.removeFromParent();
    if (this.conf.holo) this.conf.holo.visible = true;
    if (this._cableColour !== undefined) this.conf.trail?.mesh.material.color.setHex(this._cableColour);
    for (const g of this._geos) g.dispose();
    for (const m of this._mats) m.dispose();
    for (const x of this._textures) x.dispose();
    this._geos = [];
    this._mats = [];
    this._textures = [];
    this.buffers = null;
    this.analysers = null;
    this.ready = false;
  }
}

// ------------------------------------------------------------------ the shaders
// (shared by her face and the light's points) when the dot at cell c (0..1, y up) lets go, in
// seconds after the drain begins: the bottom first, rising to the top of her head, a little from
// the sides in, and grainy; and how her face is pulled toward the port as it goes
const DRAIN_GLSL = /* glsl */`
        uniform float uDrain;
        uniform vec3 uFaceC;
        uniform vec2 uFaceSize;
        uniform vec3 uPort;
        float hashD(vec2 p) { return fract(sin(dot(p, vec2(41.31, 289.17))) * 43758.5453); }
        float releaseAt(vec2 c, float r) { return 0.12 + c.y * 1.75 + abs(c.x - 0.5) * 0.4 + r * 0.32; }
        vec3 drainWarp(vec3 wp, vec2 c, float d) {
          float s = clamp((d - (0.12 + c.y * 1.75 + abs(c.x - 0.5) * 0.4) + 0.95) / 1.15, 0.0, 1.0);
          s *= s;
          float low = 1.15 - c.y;
          wp.y -= 0.2 * s * low;
          wp.x = mix(wp.x, uPort.x + (wp.x - uPort.x) * 0.6, 0.55 * s * low);
          wp.z += 0.05 * s * low;
          return wp;
        }`;

const SAND_VERT = /* glsl */`
  attribute vec2 aCell;
  attribute float aRand;
  uniform sampler2D uTex;
  uniform vec2 uGrid;
  uniform vec3 colorState;
  uniform float uTime;
  uniform float uScale;
  uniform vec3 uPlug;
  uniform vec3 uPath[${PATH_N}];
  uniform float uPathS[${PATH_N}];
  uniform float uPathLen;
  varying vec3 vColor;
  varying float vAlpha;
  ${DRAIN_GLSL}
  vec3 along(float s) {
    vec3 p = uPath[0];
    for (int i = 1; i < ${PATH_N}; i++) {
      if (s <= uPathS[i]) {
        float u = (s - uPathS[i - 1]) / max(1e-4, uPathS[i] - uPathS[i - 1]);
        return mix(uPath[i - 1], uPath[i], clamp(u, 0.0, 1.0));
      }
      p = uPath[i];
    }
    return p;
  }
  void main() {
    vColor = vec3(0.0);
    vAlpha = 0.0;
    gl_PointSize = 0.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    if (uDrain < 0.0) return;
    float lum = dot(texture2D(uTex, aCell).rgb, vec3(0.299, 0.587, 0.114));
    if (lum < 0.05) return;
    float rel = releaseAt(aCell, hashD(floor(aCell * uGrid)));
    float tau = uDrain - rel;
    if (tau < 0.0) return;
    lum = pow(lum, 0.7);
    // where its dot was when it let go (her face pulled as it was then)
    vec3 start = uFaceC + vec3((aCell.x - 0.5) * uFaceSize.x, (aCell.y - 0.5) * uFaceSize.y, 0.0);
    start = drainWarp(start, aCell, rel);
    // down into the port, quicker and quicker, like sand; then along the cable
    float fall = 0.5 + 0.22 * distance(start, uPlug) + aRand * 0.18;
    vec3 p;
    float bright = 1.0;
    if (tau < fall) {
      float u = tau / fall;
      u = u * u * (1.4 - 0.4 * u);
      vec3 ctrl = vec3(mix(start.x, uPlug.x, 0.35), mix(start.y, uPlug.y, 0.25) - 0.08, start.z + 0.18 + 0.1 * aRand);
      p = mix(mix(start, ctrl, u), mix(ctrl, uPlug, u), u);
      // spread at first, gathering into a rope
      float a = aRand * 40.0 + uTime * (3.0 + aRand * 4.0);
      p += vec3(cos(a), sin(a) * 0.6, sin(a)) * 0.025 * (1.0 - u) * aRand;
      bright = 1.3 + 1.0 * u;
    } else {
      float s = (tau - fall) * (2.2 + aRand * 1.6 + (tau - fall) * 1.2);
      if (s > uPathLen) return;
      p = along(s);
      vec3 ahead = along(s + 0.05) - p;
      vec3 side = normalize(cross(ahead + vec3(1e-4), vec3(0.0, 1.0, 0.0)));
      vec3 up = normalize(cross(side, ahead + vec3(1e-4)));
      float a = aRand * 25.0 + s * 18.0;
      p += (side * cos(a) + up * abs(sin(a))) * (0.022 + 0.01 * aRand);
      bright = 2.6 * (1.0 - smoothstep(uPathLen * 0.7, uPathLen, s));
    }
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uScale * (0.0065 + 0.0055 * lum) / -mv.z, 1.5, 12.0);
    vColor = mix(colorState, vec3(0.9, 0.97, 1.0), 0.35 + 0.5 * lum) * lum * bright;
    vAlpha = 1.0;
  }`;

const SAND_FRAG = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 q = gl_PointCoord - 0.5;
    float d = dot(q, q) * 4.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor * (1.0 - d) * vAlpha * 1.6, 1.0);
  }`;

// the bar: its canvas as dots, as her face is drawn, with her scanlines; it flashes white at 100%
// and drains away first
const BAR_FRAG = /* glsl */`
  uniform sampler2D uBar;
  uniform vec3 colorState;
  uniform float uTime, uLevel, uFlash, uGone;
  varying vec2 vUv;
  float hashB(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec2 grid = vec2(170.0, 32.0);
    vec2 cell = floor(vUv * grid);
    float l = texture2D(uBar, (cell + 0.5) / grid).r;
    if (l < 0.1 || uLevel <= 0.0) { gl_FragColor = vec4(0.0); return; }
    if (uGone >= 0.0 && uGone > vUv.y * 0.25 + hashB(cell) * 0.3) { gl_FragColor = vec4(0.0); return; }
    vec2 local = fract(vUv * grid) - 0.5;
    float dotMask = smoothstep(0.42, 0.3, length(local));
    float scan = 1.0 - 0.45 * step(0.6, fract(vUv.y * 12.0 + uTime * 1.5));
    vec3 c = mix(colorState, vec3(0.9, 0.97, 1.0), 0.45 + 0.55 * uFlash);
    gl_FragColor = vec4(c * l * dotMask * scan * uLevel * (1.3 + 3.0 * uFlash), 1.0);
  }`;

// ------------------------------------------------------------------ helpers

function swap(src, pairs) {
  let out = src;
  for (const [a, b] of pairs) {
    const next = out.replace(a, b);
    if (next === out) console.warn('Scene B: a shader change did not apply (the shader has changed):', String(a).slice(0, 60));
    out = next;
  }
  return out;
}

function hash(n) {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

// a bar's climb: on the whole even, with little hesitations
function stutter(u) {
  return clamp(u + 0.035 * Math.sin(u * Math.PI * 7) * Math.sin(u * Math.PI));
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function blank() {
  return { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(), pole: new THREE.Vector3(), curl: [0, 0, 0], thumb: [0, 0, 0] };
}

function copyGrip(g, out) {
  out.wrist.copy(g.wrist);
  out.fingers.copy(g.fingers);
  out.palm.copy(g.palm);
  out.pole.copy(g.pole);
  out.curl = [...g.curl];
  out.thumb = [...g.thumb];
  return out;
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

// The confrontation's rope (Verlet, fixed lengths, under gravity, off the floor and out of his
// legs), stepped with more of its points held: `pin` its first (null: let go), `pins` [index, point]
const _d = new THREE.Vector3();
function ropeStep(rope, dt, pin, pins, caps) {
  if (dt <= 0) return;
  const p = rope.p, o = rope.o, n = p.length, sub = 2, h = dt / sub;
  const held = new Set(pins.map(([i]) => i));
  if (pin) held.add(0);
  const hold = () => {
    if (pin) p[0].copy(pin);
    for (const [i, at] of pins) p[i].copy(at);
  };
  for (let s = 0; s < sub; s++) {
    const drag = Math.pow(0.04, h);
    for (let i = 0; i < n; i++) {
      if (held.has(i)) continue;
      const vx = (p[i].x - o[i].x) * drag, vy = (p[i].y - o[i].y) * drag, vz = (p[i].z - o[i].z) * drag;
      o[i].copy(p[i]);
      p[i].x += vx;
      p[i].y += vy - 9.8 * h * h;
      p[i].z += vz;
    }
    hold();
    for (const i of held) o[i].copy(p[i]);
    for (let it = 0; it < 8; it++) {
      for (let i = 1; i < n; i++) {
        const a = p[i - 1], b = p[i];
        const d = _d.subVectors(b, a);
        const l = d.length() || 1e-6;
        const diff = (l - rope.seg) / l;
        const ha = held.has(i - 1), hb = held.has(i);
        if (ha && hb) continue;
        if (ha) b.addScaledVector(d, -diff);
        else if (hb) a.addScaledVector(d, diff);
        else {
          a.addScaledVector(d, diff * 0.5);
          b.addScaledVector(d, -diff * 0.5);
        }
      }
      hold();
      for (let i = 0; i < n; i++) {
        if (held.has(i)) continue;
        if (p[i].y < CABLE_R) {
          p[i].y = CABLE_R;
          o[i].x += (p[i].x - o[i].x) * 0.5;
          o[i].z += (p[i].z - o[i].z) * 0.5;
        }
        for (const [ca, cb, r] of caps) pushOut(p[i], ca, cb, r + CABLE_R);
      }
    }
  }
}
