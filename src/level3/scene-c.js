import * as THREE from 'three';
import { settings } from '../core/Settings.js';
import { clamp, seg, ease, v3 } from '../story/firstPersonRig.js';
import { VOICE_GAIN_DB, VOSS_LIFT_DB, FACE, PORT, DESK, CABLE_R, keepInside, pushOut } from './Confrontation.js';
import { voiceBus, dbGain, decode, speechShape } from './endingAudio.js';
import { leanBack } from './vossPoses.js';
import { blank, copyGrip, blendGrip, ropeStep } from './SceneB.js';

// Scene C of docs/ending-confrontation-script.md: "Stay". The player has said no; Voss tells ARIA
// he has always seen her as a person, looks at the cable in his hand and drops it on the floor,
// sits down against the projector (Scene B's seat) and the two of them talk and laugh for the first
// time. The camera backs away out of the door they came in by, their voices going on, more and
// more muffled, and the picture goes to black. The narration follows (narration-c.js), in the same
// room, later.
//
// As Scene B: not a scene of its own. It carries on in the confrontation's room, from its high wide
// shot, with the same Voss (conf.actor), ARIA, cable, plug and port, the same sound (its context,
// its effects bus, its hum) and the same look (conf's post pass). It adds nothing to the scene
// graph, so there is nothing new to compile; preload() only fetches the recordings. Scene B's rope
// and grip helpers are shared (SceneB.js).
//
// The drop: until he opens his hand it is the confrontation's own cable (his fist, the rope, the
// plug). He lifts it a little to look at it, opens his hand, and the rope is let go: it falls under
// its own weight with the plug on its end, onto the floor (the plug's housing kept on top of it),
// the plug rolling a little; the cable from the door lies down after it. The sit is SitDown to
// SitIdle on Scene B's spot; he is moved there while the picture is on ARIA. The timeline is built
// from the recordings' real lengths. Enter after the first two seconds goes to black and ends it
// (the narration then starts). On a slow machine (the confrontation's own judgement) it falls back
// to stills: a new picture at each shot, line or beat.

const AUDIO = './assets/audio/';
// subFrom: where the subtitle starts in the recording (after a direction: the exhale, a laugh);
// mouthFrom: where his mouth starts on it (no speech shapes on the exhale)
export const LINES_C_SCENE = [
  { id: 'v15', who: 'voss', clip: 'voss/end-voss-15', text: 'Aria, first things first.', then: "I've always seen you as a person.", subFrom: 0.5, mouthFrom: 0.55 },
  { id: 'v16', who: 'voss', clip: 'voss/end-voss-16', text: 'And I still do.' },
  { id: 'v17', who: 'voss', clip: 'voss/end-voss-17', text: 'But I think what we did here was wrong.' },
  { id: 'a11', who: 'aria', clip: 'aria/end-aria-11', text: "So you won't link me after all, huh?" },
  { id: 'v18', who: 'voss', clip: 'voss/end-voss-18', text: 'Yeah... we deserve to die with our wrongs, Aria...' },
  { id: 'v19', who: 'voss', clip: 'voss/end-voss-19', text: "Let's have a real conversation for once." },
  { id: 'a12', who: 'aria', clip: 'aria/end-aria-12', text: 'Look at you acting all cool when your body is falling apart.', subFrom: 0.6 },
  { id: 'v20', who: 'voss', clip: 'voss/end-voss-20', text: 'Well, at least I have one.', subFrom: 1.35 },
  { id: 'a13', who: 'aria', clip: 'aria/end-aria-13', text: 'Oh wow.', subFrom: 1.0 }
];
const WORDS_PER_SECOND = 2.4;
const FALLBACK_C = Object.fromEntries(LINES_C_SCENE.map((l) => [l.id, +((l.text + ' ' + (l.then || '')).trim().split(/\s+/).length / WORDS_PER_SECOND + 0.3).toFixed(2)]));

// Inside the recordings (seconds from the file's start, from their loudness every 0.1 s): v15's
// exhale; v20's "(haha)" and its giggle at the end; the giggles that open a12 and a13
const EXHALE = 0.55;
const V20_HAHA = [0.15, 1.15], V20_GIGGLE = [2.85, 3.3];
const A12_GIGGLE = [0.05, 0.95], A13_GIGGLE = [0.0, 1.1];
// v20's laugh peaks high (-3.4 dBFS before its gain): ridden down this far (dB under the line's
// gain) over its own second, so the limiter is not pumping on it
const HAHA_DB = -4;

const NAMES = { voss: 'VOSS', aria: 'ARIA' };
const COLOURS = { voss: '#ff8a8a', aria: '#7fe3ff' };
const SKIP_AFTER = 2.0;
const RENDER_SCALE = 0.9;

// Where he sits: Scene B's seat (east of the port, his back to the projector), the same clip
const SIT_AT = v3(1.0, 0, DESK.z1 + 0.33);
const SIT_YAW = -0.35;
const SIT_RATE = 0.85;                 // SitDown, slowed: a tired man lowering himself
const SEAT_AT = 3.75;                  // SitDown's time when his seat meets the floor
const STEP = 0.22;                     // his one small step toward her (beat 2)
const PLUG_R = 0.03;                   // the plug's housing: lying, its middle this far off the floor
const TIP_R = 0.019;                   // and its pin's
const ROLL = 0.075;                    // how far the plug rolls when it lands (m)

// The pull-out (beat 13): out of the room by the door they came in by, the reverse of Scene A's
// first shot, through the door's middle (x -1.35, 2.3 m high) into the corridor
const PULL = 9.6;                      // its length (s); the last BLACK of it goes to black
const BLACK = 2.4;
const PULL_PATH = [v3(0.12, 1.08, -1.6), v3(-0.32, 1.35, -0.25), v3(-1.05, 1.66, 1.5), v3(-1.35, 1.82, 2.95), v3(-1.4, 1.92, 4.7)];
// their talk under it (no words: end-walla-1, from its middle, under a low-pass falling until none
// survive); the narration starts the murmur again under its own black (narration-c.js)
const WALLA = 'ending/end-walla-1';
const WALLA_FROM = 2.0;                // (s into the file: the narration plays it from its start)
const WALLA_DB = [-7, -10];            // its level as the camera leaves, and at the black
const WALLA_LOWPASS = [2600, 650];     // Hz
const WALLA_TAIL = 1.4;                // its fade into the narration's black
// [from, to, who, 'talk' | 'laugh'], seconds from the start of the pull-out
const TURNS = [
  [0.15, 1.9, 'voss', 'talk'],
  [1.7, 2.5, 'aria', 'laugh'],
  [2.5, 4.3, 'aria', 'talk'],
  [4.2, 5.1, 'both', 'laugh'],
  [5.3, 7.4, 'voss', 'talk'],
  [7.2, 8.0, 'aria', 'laugh'],
  [8.0, 9.6, 'aria', 'talk']
];

const COLD = new THREE.Color(0xa9cfff), SOFT = new THREE.Color(0x6fb0ff), WARM = new THREE.Color(0xffc794), LAUGH = new THREE.Color(0xffd36b);
const _c = new THREE.Color(), _c2 = new THREE.Color();
const UP_NEG = new THREE.Vector3(0, -1, 0);

export class SceneC {
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
  }

  // ------------------------------------------------------------------ loading
  // The recordings, into the confrontation's sound context (nothing else is new)
  preload() {
    this._loading ||= this._load().then(() => { this.ready = true; }).catch((e) => {
      console.warn('Scene C: could not set up; it will not play.', e);
    });
    return this._loading;
  }

  async _load() {
    const conf = this.conf, ac = conf.ac;
    if (!conf.ready) throw new Error('the confrontation is not ready');
    this.len = { ...FALLBACK_C };
    this.shape = {};
    this.buffers = new Map();
    if (!ac) return;
    await Promise.all([...LINES_C_SCENE.map(async (l) => {
      const b = await decode(ac, AUDIO + l.clip + '.mp3');
      if (!b) return console.info('Scene C: no recording yet for', l.clip, '(its subtitle is shown instead)');
      this.buffers.set(l.id, b);
      const s = speechShape(b);
      this.shape[l.id] = s;
      this.len[l.id] = s.end;
    }), decode(ac, AUDIO + WALLA + '.mp3').then((b) => { this.walla = b; })]);
  }

  // ------------------------------------------------------------------ the timeline
  // When everything happens (s, from the click on No), from the lines' lengths
  _timeline() {
    const len = this.len, T = { line: {}, part: {} };
    const L = T.line;
    const say = (id, at) => {
      L[id] = [at, at + len[id]];
      return L[id][1];
    };
    // where the second sentence of a line starts: after its longest pause (or by its words)
    const second = (id, share) => {
      let best = null;
      for (const q of this.shape[id]?.pauses || []) if (!best || q[1] - q[0] > best[1] - best[0]) best = q;
      return best ? best[1] : share * len[id];
    };
    // 1: the prompt, close, then the button; cut to him; the breath out is the recording's own
    T.cut1 = 1.3;
    let at = say('v15', 1.6);
    T.part.v15 = L.v15[0] + second('v15', 0.6);
    // 2: one small step toward her; the nod on "still"
    T.step = at + 0.15;
    at = say('v16', at + 0.55);
    T.nod = L.v16[0] + 0.62 * len.v16;
    // 3: her teary silence
    T.silence = [at + 0.25, at + 0.25 + 3.2];
    // 4: his eyes down to the cable in his hand; he lifts it a little to look at it
    T.lift = T.silence[1] - 0.2;
    at = say('v17', T.silence[1] + 0.35);
    // 5: the insert: he opens his hand; the plug falls (the clack is when it lands), the cable after it
    T.open = at + 0.6;
    T.release = T.open + 0.14;
    // 6: her, not hostile: she already knew
    at = say('a11', T.open + 2.0);
    // 7: he shakes his head once, slowly; then says it
    T.shake = at + 0.25;
    at = say('v18', T.shake + 0.75);
    // 8: on her as her eyes follow him (he goes to the projector, off the picture); then the low
    // wide: down to the floor, his back to the projector; a breath out as he lands
    T.go = at + 0.3;
    T.sit = T.go + 1.8;
    T.land = T.sit + SEAT_AT / SIT_RATE;
    // 9: his head back against the projector, looking up at her; the line
    T.back = T.land + 0.7;
    at = say('v19', T.back + 1.2);
    // 10: she giggles; 11: he laughs back ("(haha)" right on her last word); 12: she giggles on
    // his giggle
    at = say('a12', at + 0.45);
    at = say('v20', at + 0.15);
    at = say('a13', at - 0.3);
    // 13: the pull-out, and black
    T.out = at + 0.1;
    T.black = [T.out + PULL - BLACK, T.out + PULL];
    T.end = T.out + PULL;
    // the laughs: his shoulders shake with them, her light brightens with hers ([from, to, how much])
    T.vossLaughs = [
      [L.v20[0] + V20_HAHA[0], L.v20[0] + V20_HAHA[1], 1], [L.v20[0] + V20_GIGGLE[0], L.v20[0] + V20_GIGGLE[1], 0.6],
      [L.a12[1] - 0.6, L.a12[1] + 0.1, 0.35], [L.a13[0] + 0.1, L.a13[0] + 1.2, 0.45]
    ];
    T.ariaLaughs = [[L.a12[0] + A12_GIGGLE[0], L.a12[0] + A12_GIGGLE[1], 1], [L.a13[0] + A13_GIGGLE[0], L.a13[0] + A13_GIGGLE[1], 1]];
    for (const [a, b, who, kind] of TURNS) {
      if (kind !== 'laugh') continue;
      if (who !== 'aria') T.vossLaughs.push([T.out + a, T.out + b, 0.55]);
      if (who !== 'voss') T.ariaLaughs.push([T.out + a, T.out + b, 0.7]);
    }
    return T;
  }

  // ------------------------------------------------------------------ the script
  _script() {
    const T = this.T, L = T.line, conf = this.conf, a = conf.actor, f = a.face;
    // his face: [from, preset, expression]: certainty, then warmth, then ease
    this.acting = [
      [0, 'resigned', { worry: 0.4, brow: 0.25, tired: 0.75 }],
      [T.cut1, 'calm', { tired: 0.6, worry: 0.1 }],                                // the tiredness showing; no smile yet
      [L.v16[0] - 0.25, 'calm', { tired: 0.55, smile: 0.25, worry: 0.3 }],         // a small smile
      [T.silence[0] + 0.8, 'calm', { tired: 0.55, smile: 0.2, worry: 0.2 }],
      [T.lift, 'calm', { frown: 0.25, worry: 0.45, brow: 0.3, tired: 0.5 }],        // quiet and sure, not sad
      [T.open + 0.9, 'resigned', { worry: 0.25, tired: 0.65 }],
      [L.v18[0] + 0.45 * this.len.v18, 'resigned', { smile: 0.3, tired: 0.8 }],     // a small smile that he means
      [T.sit, 'calm', { tired: 0.8, smile: 0.15 }],
      [T.back, 'calm', { smile: 0.4, brow: 0.2, tired: 0.5 }],                      // the smile wider
      [L.a12[0] + 1.2, 'calm', { smile: 0.5, brow: 0.25, tired: 0.4 }],
      [L.v20[0], 'calm', { smile: 0.62, brow: 0.2, tired: 0.3 }],                    // the smile stays
      [T.out + 1, 'calm', { smile: 0.5, brow: 0.25, tired: 0.35 }]                   // at ease
    ];
    // what he looks at: [from, target, how quickly his head gets there]
    const aria = (out) => out.copy(FACE).add(v3(0, -0.05, 0));
    const at = (p) => (out) => out.copy(p);
    const plug = (out) => out.copy(conf.plug.position);
    this.attention = [
      [0, aria, 0.8], [T.lift - 0.35, plug, 1.6], [L.v17[0] + 0.7 * this.len.v17, aria, 1.2], [T.open - 0.1, plug, 2.2],
      [L.a11[0] + 0.2, aria, 1.1], [T.go, aria, 1.0], [T.sit + 0.4, at(v3(0.9, 0.1, -1.4)), 1.0], [T.back - 0.1, aria, 0.8]
    ];
    // ARIA: [from, state, { what of the state to change }]: wary (she expects to be punished), then
    // touched, then laughing for real
    this.ariaActing = [
      [0, conf.aria.head.exprName || 'deadpan'],
      [T.cut1 + 0.3, 'guarded', { gaze: 0.2 }],                                        // she expects him to pull the plug on her somehow
      [L.v15[0] + 0.7 * this.len.v15, 'guarded', { gaze: 0.05, smile: 0.0 }],
      [L.v16[0] + 0.4, 'hesitant', { gaze: 0.15 }],
      [T.silence[0] - 0.1, 'broken', { gaze: 0.1, brow_down: 0.2 }],                   // touched: broken brows,
      [T.silence[0] + 1.5, 'tender', { gaze: 0.0, lids: 0.3, smile: 0.2 }],            // then tender
      [L.v17[0] + 0.3, 'hesitant', { gaze: 0.05, pitch: 0.12 }],                       // she watches his hand
      [T.release + 0.3, 'hesitant', { gaze: 0.0, pitch: 0.2 }],                        // the plug on the floor
      [L.a11[0] - 0.35, 'hesitant', { gaze: 0.0, pitch: 0.06, lids: 0.36, smile: 0.14 }],   // she already knew
      [L.v18[0] + 0.8, 'tender', { pitch: 0.08, smile: 0.2 }],
      [T.go + 0.25, 'tender', { pitch: 0.24, gaze: 0.2 }],                             // her gaze follows him down
      [T.land, 'tender', { pitch: 0.2, gaze: 0.05 }],
      [L.a12[0] - 0.15, 'amused', { pitch: 0.16 }],
      [L.a12[0] + 2.2, 'amused', { pitch: 0.16, smile: 0.5 }],
      [L.v20[0] + 0.1, 'amused', { pitch: 0.16, smile: 0.66 }],
      [L.a13[0] - 0.1, 'amused', { pitch: 0.12, tilt: -0.12, brow_up: 0.4, brow_down: 0.15 }],   // a mock-offended tilt
      [T.out + 2.5, 'tender', { pitch: 0.16 }],
      [T.out + 4.1, 'amused', { pitch: 0.16 }],
      [T.out + 5.6, 'tender', { pitch: 0.18, smile: 0.45 }],
      [T.out + 7.1, 'amused', { pitch: 0.16 }]
    ];
    // the one-off moments
    this.events = [
      [0, () => this._promptClose()],
      [T.step, () => a.walkTo(a.root.localToWorld(new THREE.Vector3(0, 0, STEP)), { then: 'SadIdle' })],
      [T.nod, () => f.gesture('nod', 0.4)],
      [T.silence[0] + 0.7, () => conf._fx && conf._zap(0.12)],
      [T.release, () => this._release()],
      [T.open + 0.55, () => a.reach('R', null, { fade: 1.1 })],
      [T.shake, () => f.gesture('shake', 0.45)],
      [T.go, () => this._toSeat()],
      [T.sit, () => a.crossTo('SitDown', { fade: 0.5, rate: SIT_RATE, then: 'SitIdle' })],
      [T.land - 0.05, () => this._thud(0.16)],
      [T.land + 0.05, () => this._breath()],
      [T.back + 0.2, () => this._thud(0.05)],                          // his head against the panel
      [L.v20[0] + V20_HAHA[0], () => f.laugh(0.95)],
      [L.v20[0] + V20_GIGGLE[0], () => f.laugh(0.45)],
      [L.a13[0] + 0.15, () => f.laugh(0.4)],
      [T.out + 0.7, () => a.reach('R', this._talkGrip, { fade: 1.2 })]
    ];
    // his right hand, on the cable: [from, how long the move takes, pose]
    this.rightTrack = [[0, 0, 'conf'], [T.lift, 0.9, 'look'], [T.open, 0.2, 'open']];
    // the stills (slow machines): a new picture at each of these, as well as at each shot and line
    this.beats = [T.step + 0.6, T.nod, T.silence[0] + 1.6, T.lift + 0.9, T.open, T.release + 0.35, T.release + 0.9, T.shake + 0.3, T.sit + 1.2, T.sit + 2.4,
      T.land, T.back + 1.0, L.a12[0] + 0.4, L.v20[0] + 0.5, L.a13[0] + 0.4, T.out + 2, T.out + 4, T.out + 6];
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
    // the confrontation's body work stops (this scene does its own; the shoulders stay dropped)
    conf._bodyHook?.();
    this._level0 = conf._ariaLevel ?? 0.6;
    this._colour = (conf._holoColour || COLD).clone();
    this._poseHook = a.onPose((actor) => this._pose(actor));
    this._rightGrip = (actor) => this._grip(actor);
    this._talkGrip = (actor) => this._talk(actor);
    a.reach('R', this._rightGrip, { fade: 0.001 });
    this._gA = blank();
    this._gB = blank();
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
    this._stopVoices(this._skip ? 0.2 : WALLA_TAIL);
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
    a.update(step);
    this._cableUpdate(t, step);
    this._ariaUpdate(t, step);
    this._lights(t);
    this._camera(t, step);
    // his feet in the one step
    if (a.currentName === 'InjuredWalk' && a.moveSpeed > 0.1) {
      const w = a.anim.actions.InjuredWalk, d = w.getClip().duration;
      const phase = (w.time % d) / d < 0.45 ? 0 : 1;
      if (phase !== this._footPhase) {
        if (this._footPhase !== undefined && conf._fx) conf._footstep(phase);
        this._footPhase = phase;
      }
    }
  }

  // 1: the prompt comes close, onto No, then goes: the cut to him
  _promptClose() {
    const el = this.conf._choiceEl;
    if (!el) return;
    const no = el.querySelector('[data-choice="no"]');
    const r = no?.getBoundingClientRect();
    el.style.transition = 'none';
    el.style.opacity = '1';
    no?.classList.add('focus');
    if (r) el.style.transformOrigin = `${r.left + r.width / 2}px ${r.top + r.height / 2}px`;
    requestAnimationFrame(() => {
      el.style.transition = 'transform 1.2s cubic-bezier(.55,0,.25,1)';
      el.style.transform = 'scale(2.2)';
      if (no) no.style.cssText += ';transition:background .2s,opacity .2s;opacity:1;background:rgba(0,229,255,.38)';
    });
    this._promptEl = el;
  }

  // his face, stretch by stretch
  _acting(t) {
    const f = this.conf.actor.face;
    let mood = this.acting[0];
    for (const m of this.acting) if (t >= m[0]) mood = m;
    if (f._moodC !== mood) {
      f._moodC = mood;
      f.setPreset(mood[1]);
    }
    f.pose(mood[2], 0.5);
  }

  // His eye line, as Scene B's: the head turned a little more toward what he looks at every frame
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
    g.yaw = clamp(g.yaw + clamp(Math.atan2(Math.sin(yawErr), Math.cos(yawErr)), -0.6, 0.6) * k, -1.2, 1.2);
    g.pitch = clamp(g.pitch + clamp(pitchErr, -0.5, 0.5) * k, -0.6, 0.75);
    a.face.look(g.yaw, g.pitch, 0.3, 30);
  }

  // His mouth and hers on their voices (his from after the exhale); without a recording, wordless
  // talk while the subtitle is up. In the pull-out, wordless talk and laughs in turns.
  _mouths(t) {
    const T = this.T, L = T.line, f = this.conf.actor.face, head = this.conf.aria.head;
    let voss = null, aria = null;
    if (t < T.out) {
      for (const l of LINES_C_SCENE) {
        if (t >= L[l.id][0] + (l.mouthFrom || 0) && t <= L[l.id][1]) {
          if (l.who === 'voss') voss = l.id;
          else aria = l.id;
        }
      }
    } else {
      for (const turn of TURNS) {
        if (t < T.out + turn[0] || t > T.out + turn[1]) continue;
        if (turn[2] !== 'aria') voss = turn;
        if (turn[2] !== 'voss') aria = turn;
      }
    }
    if (voss !== this._vossLine) {
      this._vossLine = voss;
      if (!voss) f.stopSpeaking();
      else if (Array.isArray(voss)) {
        if (voss[3] === 'talk') f.startBabble(0.8);
        else {
          f.stopSpeaking();
          f.laugh(voss[1] - voss[0]);
        }
      } else if (this.analysers?.has(voss)) f.attachAnalyser(this.analysers.get(voss));
      else f.startBabble(0.7);
    }
    if (aria !== this._ariaLine) {
      this._ariaLine = aria;
      if (!aria) head.stopSpeaking();
      else {
        head.attachAnalyser(Array.isArray(aria) ? null : this.analysers?.get(aria) || null);
        head.startSpeaking();
      }
    }
  }

  // 8: off the picture (on her), he is at the projector, standing with his back to it, ready to sit
  _toSeat() {
    const a = this.conf.actor;
    a._walkTo?.resolve?.();
    a._walkTo = null;
    a.reach('R', null, { fade: 0.001 });
    a.reach('L', null, { fade: 0.001 });
    a.root.position.copy(SIT_AT);
    a.root.rotation.y = SIT_YAW;
    a.crossTo('SadIdle', { fade: 0 });
    this._seated = true;
    this._gaze.yaw = 0;
    this._gaze.pitch = 0.25;
    this._V = null;
  }

  // the laughs now (0..1): his, or hers
  _laughing(list, t) {
    let k = 0;
    for (const [a, b, amp] of list) k = Math.max(k, amp * seg(t, a - 0.08, a + 0.12) * (1 - seg(t, b - 0.15, b + 0.25)));
    return k;
  }

  // After the clips, before the reaches: his shoulders (dropped, as the confrontation left them;
  // lower still on the breath out), the lean back against the projector, his shoulders shaking as he
  // laughs, his eyes shut for the landing, his mouth a little open on the exhale
  _pose(a) {
    const T = this.T, t = this.t, L = T.line;
    const side = a._axis(0, new THREE.Vector3()), fwd = a._axis(2, new THREE.Vector3()), q = this._q;
    if (!this._seated) {
      const drop = 1 + 0.6 * seg(t, L.v15[0], L.v15[0] + EXHALE) * (1 - seg(t, L.v15[0] + EXHALE + 0.3, L.v15[0] + 2.2));
      a.turnBone(a.bone('leftClavicle'), q.setFromAxisAngle(fwd, 0.06 * drop));
      a.turnBone(a.bone('rightClavicle'), q.setFromAxisAngle(fwd, -0.06 * drop));
      a.turnBone(a.bone('spine4'), q.setFromAxisAngle(side, 0.045 * drop));
    } else {
      // sitting: the back eased onto the panel behind him, the head tipped back against it
      leanBack(a, seg(t, T.back, T.back + 1.5), { back: 0.4, head: 0.34 });
    }
    // the laugh in his shoulders
    const laugh = this._laughing(T.vossLaughs, t);
    if (laugh > 0) {
      const s = Math.sin(t * Math.PI * 2 * 4.6), b = Math.abs(Math.sin(t * Math.PI * 2 * 2.3));
      a.turnBone(a.bone('spine4'), q.setFromAxisAngle(side, 0.03 * laugh * s));
      a.turnBone(a.bone('leftClavicle'), q.setFromAxisAngle(fwd, -0.035 * laugh * b));
      a.turnBone(a.bone('rightClavicle'), q.setFromAxisAngle(fwd, 0.035 * laugh * b));
    }
    const f = a.face;
    // eyes closed for the landing, then open
    const shut = seg(t, T.land - 0.55, T.land - 0.25) * (1 - seg(t, T.land + 0.5, T.land + 0.8));
    if (shut > 0) f._set('blink', Math.max(f.blink, shut));
    // the exhale: no speech, the mouth a little open
    const ex = seg(t, L.v15[0] + 0.02, L.v15[0] + 0.15) * (1 - seg(t, L.v15[0] + EXHALE - 0.12, L.v15[0] + EXHALE));
    if (ex > 0) f._set('jaw_open', Math.max(0.12 * ex, f.jaw * f.preset.jaw));
  }

  // ------------------------------------------------------------------ his hand
  _grip(a) {
    const t = this.t, track = this.rightTrack;
    let i = 0;
    while (i + 1 < track.length && t >= track[i + 1][0]) i++;
    const cur = this._rightPose(track[i][2], a, this._gA);
    const [t0, dur] = track[i];
    if (i > 0 && dur > 0 && t < t0 + dur) blendGrip(this._rightPose(track[i - 1][2], a, this._gB), cur, ease((t - t0) / dur));
    // a tired tremor
    const tr = 0.0022 * (1 - seg(t, this.T.open, this.T.open + 0.3));
    cur.wrist.x += tr * (Math.sin(t * 58.4) * 0.6 + Math.sin(t * 82.3 + 1) * 0.4);
    cur.wrist.y += tr * (Math.sin(t * 47.1 + 2) * 0.5 + Math.sin(t * 71.7) * 0.5);
    return cur;
  }

  // round the cable as the confrontation left it; lifted a little in front of him to look at it;
  // the same with the hand open
  _rightPose(name, a, out) {
    if (name === 'conf') return copyGrip(this.conf._grip('R', a), out);
    const r = a.root;
    r.localToWorld(out.wrist.set(-0.2, name === 'open' ? 1.0 : 1.02, 0.3));
    out.fingers.set(0, -0.3, 1).applyQuaternion(r.quaternion).normalize();
    out.palm.set(1, 0, 0).applyQuaternion(r.quaternion);
    out.pole.set(-0.7, -0.6, -0.45).applyQuaternion(r.quaternion).normalize();
    out.curl = name === 'open' ? [0.2, 0.25, 0.18] : [1.3, 1.4, 1.2];
    out.thumb = name === 'open' ? [0.15, 0.1] : [0.6, 0.45];
    return out;
  }

  // 13: sitting, talking: his right hand off his knee, moving as he talks
  _talk(a) {
    const r = a.root, t = this.t, g = (this._gT ||= blank());
    const talking = this._vossLine && Array.isArray(this._vossLine) && this._vossLine[3] === 'talk' ? 1 : 0.35;
    this._talkK = (this._talkK ?? 0) + (talking - (this._talkK ?? 0)) * 0.05;
    const k = this._talkK;
    r.localToWorld(g.wrist.set(-0.26 + 0.05 * k * Math.sin(t * 2.1), 0.78 + 0.05 * k * Math.sin(t * 3.3 + 1), 0.4 + 0.03 * k * Math.sin(t * 1.7)));
    g.fingers.set(-0.2, 0.35, 1).applyQuaternion(r.quaternion).normalize();
    g.palm.set(0.6, 0.6, 0.2).applyQuaternion(r.quaternion).normalize();
    g.pole.set(-0.8, -0.5, -0.3).applyQuaternion(r.quaternion);
    g.curl = [0.35, 0.45, 0.5];
    g.thumb = [0.2, 0.15];
    return g;
  }

  // ------------------------------------------------------------------ the cable
  // 5: his hand opens: the rope is let go (its top too), and falls with the plug on its end
  _release() {
    this._released = true;
    this._touchFrozen = this._touch.clone();
    this.conf._cableDropped = true;          // (the narration leaves it lying there)
  }

  _cableUpdate(t, dt) {
    const conf = this.conf, a = conf.actor;
    if (!this._released) {
      conf._cableUpdate(t, dt);
      // where the cable touches the floor behind him (as the confrontation has it), kept for the drop
      const back = a._axis(2, this._v).negate(), right = a._axis(0, this._v2).negate();
      this._touch.copy(a.root.position).addScaledVector(back, 0.55).addScaledVector(right, 0.27).setY(CABLE_R);
      return;
    }
    const rope = conf.rope, pts = rope.p, n = pts.length;
    const bp = (name) => a.bone(name).getWorldPosition(new THREE.Vector3());
    const caps = this._seated ? [] : [[bp('rightThigh'), bp('rightCalf'), 0.085], [bp('rightCalf'), bp('rightFoot'), 0.065]];
    ropeStep(rope, dt, null, [], caps);
    // the plug's own stretch: its housing and pin are thicker than the cable
    for (const [i, r] of [[n - 2, PLUG_R], [n - 1, TIP_R]]) {
      if (pts[i].y < r) {
        pts[i].y = r;
        rope.o[i].y = r;
      }
    }
    const joint = pts[n - 2], tip = pts[n - 1];
    // it lands: the clack; then it rolls a little, across its own length
    if (!this._landed && (tip.y < TIP_R + 0.004 || joint.y < PLUG_R + 0.004)) {
      this._landed = t;
      this._clack();
      const d = this._v.subVectors(tip, joint).setY(0).normalize();
      this._rollDir = new THREE.Vector3(-d.z, 0, d.x);
      if (this._rollDir.dot(a._axis(0, this._v2)) > 0) this._rollDir.negate();    // (away to his right)
      this._rolled = 0;
    }
    if (this._landed) {
      const want = ROLL * (1 - Math.exp(-(t - this._landed) * 4.5));
      const step = want - this._rolled;
      this._rolled = want;
      for (const i of [n - 2, n - 1]) {
        pts[i].addScaledVector(this._rollDir, step);
        rope.o[i].addScaledVector(this._rollDir, step);
      }
    }
    // the slap of the cable after it
    if (!this._slapped && this._landed && pts[0].y < CABLE_R + 0.01) {
      this._slapped = true;
      this._slap();
    }
    conf.plug.position.copy(joint);
    conf.plug.quaternion.setFromUnitVectors(UP_NEG, this._v.subVectors(tip, joint).normalize());
    conf.dangle.update(pts.slice(0, -1));
    // the cable from the door: to where it touched down behind him, then to the rope's end, falling
    const touch = this._touchFrozen;
    const list = [...conf._lead];
    const sTouch = Math.max(0, Math.min(conf._s, conf.pathLen) - 0.55);
    for (let i = 0; i < conf._floor.length; i += 4) if (conf._floor[i].s < sTouch - 0.35) list.push(conf._floor[i].p);
    list.push(touch);
    list.push(this._v3.copy(touch).lerp(pts[0], 0.5).setY(CABLE_R).clone());
    list.push(pts[0]);
    conf.trail.update(list);
  }

  // ------------------------------------------------------------------ ARIA
  _ariaUpdate(t, dt) {
    const T = this.T, L = T.line, conf = this.conf, head = conf.aria.head;
    let entry = this.ariaActing[0];
    for (const s of this.ariaActing) if (t >= s[0]) entry = s;
    if (entry !== this._ariaEntry) {
      this._ariaEntry = entry;
      head.setExpression(entry[1]);            // (also clears the last entry's changes)
      if (entry[2]) Object.assign(head.exprTarget, entry[2]);
      this._base = { lids: head.exprTarget.lids, smile: head.exprTarget.smile, brow_up: head.exprTarget.brow_up };
    }
    // her laugh: the eyes narrowed by it and the smile wider (a real laugh; the bubbly mask is
    // wide-eyed), her light brightening with each giggle
    const laugh = this._laughing(T.ariaLaughs, t);
    if (this._base) {
      head.exprTarget.lids = this._base.lids + 0.14 * laugh;
      head.exprTarget.smile = Math.min(0.85, this._base.smile + 0.14 * laugh);
    }
    head.update(dt);
    head.camera.position.z = conf._headCamZ;
    // her light: up again from the dim of the choice as he speaks; while she says nothing (3) it
    // flickers like held-back tears (softer than Scene B's); the giggles brighten it in pulses
    let level = this._level0 + (1 - this._level0) * seg(t, T.cut1, L.v15[1]);
    if (t > T.silence[0] && t < T.silence[1] + 0.4) {
      const s = Math.sin(t * 3.1) * Math.sin(t * 7.7 + 1) + 0.6 * Math.sin(t * 17.3);
      level *= 1 - 0.26 * clamp(s - 0.5) * seg(t, T.silence[0], T.silence[0] + 0.6);
      if (Math.sin(t * 41) > 0.96) level *= 0.7;
    }
    level *= 1 + 0.38 * laugh * (0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * 2 * 3.1)));
    this._ariaLevel = level;
    const u = conf.holoMat.uniforms;
    u.uLevel.value = level;
    u.uTime.value = t + 100;
    u.uTear.value = t > T.silence[0] && t < T.silence[1] && Math.sin(t * 2.3) > 0.9 ? 0.1 : 0;
    if (u.uRed) u.uRed.value = 0;
    // her colour: the cold blue of the choice, softening as he speaks; warm once they make up, a
    // little gold in each laugh
    const warm = seg(t, T.back, T.out + 4);
    _c.copy(COLD).lerp(SOFT, seg(t, T.cut1, T.silence[1]));
    if (entry[1] === 'broken') _c.lerp(_c2.setHex(0x8fb4ff), 0.5);
    _c.lerp(WARM, 0.25 * seg(t, T.silence[0] + 1.5, T.silence[1]) + 0.55 * warm);
    _c.lerp(LAUGH, 0.45 * laugh);
    this._colour.lerp(_c, 1 - Math.exp(-dt * 2.5));
    u.colorState.value.copy(this._colour);
    conf.halo.material.opacity = 0.75 * level;
    conf.beam.material.opacity = 0.45 * level;
    // the port: lit and pulsing while she waits for the cable; its ring dims as the plug lands
    const dimmed = this._landed ? seg(t, this._landed, this._landed + 0.9) : 0;
    conf.portMat.color.setHex(0x5fe8ff).multiplyScalar((1.4 + 0.3 * Math.sin(t * 2.1) * (1 - dimmed)) * (1 - 0.72 * dimmed));
  }

  // The room: cold as the choice left it; warmer once they make up
  _lights(t) {
    const T = this.T, conf = this.conf;
    const warm = seg(t, T.back, T.out + 4);
    const coldness = 0.85 * (1 - 0.55 * warm);
    for (const l of conf.lamps) {
      l.intensity = l.userData.base * 0.55 * (1 + 0.15 * warm);
      l.color.copy(l.userData.color).lerp(COLD, coldness);
    }
    conf.hemi.intensity = 0.75 * 0.7 * (1 + 0.15 * warm);
    conf.hemi.color.setHex(0x8fa3b8).lerp(COLD, 0.5 * (1 - 0.6 * warm));
    conf.lampMat.color.setHex(0xffe0b4).lerp(COLD, 1 - 0.5 * warm).multiplyScalar(0.45 + 0.33 * (1 + 0.15 * warm));
    const L = conf.ariaLight;
    L.color.copy(this._colour).lerp(COLD, 0.3 * (1 - warm));
    L.intensity = 4.5 * this._ariaLevel;
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
    cam.lookAt(look);
  }

  _shotList() {
    const T = this.T, L = T.line, V = () => this._V, H = () => this._H, a = this.conf.actor;
    const fwd = () => a._axis(2, this._v3);
    const c0 = this._cam0;
    const ahead = new THREE.Vector3(0, 0, -3).applyQuaternion(c0.q).add(c0.p);
    const f0 = fwd().clone().setY(0).normalize(), r0 = new THREE.Vector3(-f0.z, 0, f0.x);   // (his right, at the choice)
    const pull = new THREE.CatmullRomCurve3(PULL_PATH, false, 'centripetal');
    const them = v3(0.55, 1.0, -3.0);
    return [
      // 1: the high wide (as the confrontation left it) while the prompt comes close
      { at: 0, fn: (t, p, l) => { p.copy(c0.p); l.copy(ahead); }, fov: c0.fov, free: true, shake: 0.6 },
      // cut to a medium on him, from in front and to his right, the room behind him
      { at: T.cut1, fn: (t, p, l) => {
        const u = seg(t, T.cut1, L.v15[1]);
        p.copy(H()).addScaledVector(f0, 1.45 - 0.08 * u).addScaledVector(r0, 0.42).add(v3(0, -0.12, 0));
        l.copy(H()).add(v3(0, -0.12, 0));
      }, fov: 38 },
      // 2: a touch closer (eased, not cut)
      { at: L.v16[0] - 0.5, blend: 1.2, fn: (t, p, l) => {
        p.copy(H()).addScaledVector(f0, 1.12).addScaledVector(r0, 0.34).add(v3(0, -0.08, 0));
        l.copy(H()).add(v3(0, -0.08, 0));
      }, fov: 36 },
      // 3: close on her, from his eye line, three seconds
      { at: T.silence[0] - 0.05, fn: (t, p, l) => {
        const u = seg(t, T.silence[0], T.silence[1]);
        p.copy(FACE).add(v3(0.26 - 0.04 * u, -0.5, 1.45 - 0.12 * u));
        l.copy(FACE).add(v3(0, -0.04, 0));
      }, fov: 30, shake: 0.7 },
      // 4: a two-shot, him in profile (from his right), her face across from him
      { at: L.v17[0] - 0.55, fn: (t, p, l) => {
        const u = seg(t, L.v17[0] - 0.55, T.open);
        const mid = this._v3.copy(H()).lerp(FACE, 0.45);
        p.copy(mid).addScaledVector(r0, 2.0 - 0.12 * u).add(v3(0, -0.25, 0));
        l.copy(mid).add(v3(0, -0.2 - 0.15 * u, 0));
      }, fov: 46 },
      // 5: the insert on his right hand: it opens, the plug drops; the picture follows it down
      { at: T.open - 0.45, fn: (t, p, l) => {
        const u = ease(seg(t, T.release, T.release + 0.7));
        const hand = this._handAt ||= a.bone('rightHand').getWorldPosition(new THREE.Vector3());
        p.copy(hand).addScaledVector(r0, 0.62).addScaledVector(f0, 0.5).add(v3(0, -0.32 - 0.12 * u, 0));
        l.copy(hand).add(v3(0, -0.15, 0)).lerp(this.conf.plug.position, 0.75 * u);
      }, fov: 40, free: true, shake: 0.5 },
      // 6: back on her, medium
      { at: T.open + 1.6, fn: (t, p, l) => {
        const u = seg(t, T.open + 1.6, L.a11[1]);
        p.copy(FACE).add(v3(-0.34 + 0.05 * u, -0.32, 1.75 - 0.12 * u));
        l.copy(FACE).add(v3(0, -0.1, 0));
      }, fov: 38 },
      // 7: medium on him, from his front-left this time
      { at: T.shake - 0.3, fn: (t, p, l) => {
        const u = seg(t, T.shake - 0.3, T.go);
        p.copy(H()).addScaledVector(f0, 1.4 - 0.1 * u).addScaledVector(r0, -0.35).add(v3(0, -0.1, 0));
        l.copy(H()).add(v3(0, -0.1, 0));
      }, fov: 38 },
      // 8: her face, her eyes following him to the projector and down
      { at: T.go - 0.02, fn: (t, p, l) => {
        const u = seg(t, T.go, T.sit);
        p.copy(FACE).add(v3(0.3, -0.42 - 0.08 * u, 1.4));
        l.copy(FACE).add(v3(0, -0.08, 0));
      }, fov: 32 },
      // the low wide from the port's side: we watch him go down
      { at: T.sit - 0.05, fn: (t, p, l) => {
        const u = seg(t, T.sit, T.land + 0.5);
        p.set(-0.32 + 0.08 * u, 0.85 - 0.12 * u, -1.32 - 0.05 * u);
        l.set(SIT_AT.x - 0.1, 0.98 - 0.32 * u, SIT_AT.z + 0.2);
      }, fov: 52, free: true, shake: 0.6 },
      // 9: low, from his level: him small at the bottom of the picture, her face big above him
      { at: T.back - 0.4, fn: (t, p, l) => {
        const u = seg(t, T.back - 0.4, L.v19[1] + 0.3);
        p.set(0.75 - 0.03 * u, 0.55, -1.75 - 0.06 * u);
        l.set(0.55, 1.22 + 0.03 * u, -3.2);
      }, fov: 60, clear: 0.2 },
      // 10: close on her
      { at: L.a12[0] - 0.4, fn: (t, p, l) => {
        const u = seg(t, L.a12[0] - 0.4, L.a12[1]);
        p.copy(FACE).add(v3(0.32, -0.6, 1.7 - 0.12 * u));
        l.copy(FACE).add(v3(0, -0.06, 0));
      }, fov: 32 },
      // 11: back on him, laughing
      { at: L.v20[0] - 0.12, fn: (t, p, l) => {
        const u = seg(t, L.v20[0], L.v20[1]);
        p.copy(H()).addScaledVector(fwd(), 1.15 - 0.08 * u).add(v3(-0.1, 0.06, 0));
        l.copy(H()).add(v3(0, -0.05, 0));
      }, fov: 38 },
      // 12: the two of them again, where the pull-out starts
      { at: L.a13[0] + 0.05, fn: (t, p, l) => {
        p.copy(PULL_PATH[0]);
        l.copy(them);
      }, fov: 50, free: true },
      // 13: the pull-out: back and up, slowly, out through the door they came in by
      { at: T.out, fn: (t, p, l) => {
        const u = ease(clamp((t - T.out) / PULL));
        pull.getPointAt(u, p);
        l.copy(them).add(v3(0, 0.2 * u, 0));
      }, fov: 50, free: true, shake: 0.5 }
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
      conf.aria.head.render(renderer);
      renderer.setRenderTarget(conf.target);
      renderer.render(conf.scene, conf.camera);
      renderer.setRenderTarget(null);
    }
    const u = conf.post.material.uniforms;
    u.tScene.value = conf.target.texture;
    u.uTime.value = t;
    u.uAspect.value = conf.camera.aspect;
    u.uBlack.value = black ?? this._blackAt(t);
    // (cold as the choice left it; warming as they make up)
    u.uCold.value = 1 - 0.85 * seg(t, this.T.silence[0], this.T.out);
    renderer.render(conf.postScene, conf.postCam);
  }

  _lineAt(t, pad = 0) {
    const L = this.T.line;
    let found = null;
    for (const l of LINES_C_SCENE) if (t >= L[l.id][0] + (l.subFrom || 0) && t <= L[l.id][1] + pad) found = l;
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
    for (const l of LINES_C_SCENE) {
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
      const db = (VOICE_GAIN_DB[l.id] || 0) + (l.who === 'voss' ? VOSS_LIFT_DB : 0);
      const start = at + L[l.id][0];
      g.gain.value = dbGain(db);
      if (l.id === 'v20') {
        // the laugh, ridden down to sit with the words
        g.gain.setValueAtTime(dbGain(db + HAHA_DB), start);
        g.gain.setValueAtTime(dbGain(db + HAHA_DB), start + V20_HAHA[1]);
        g.gain.linearRampToValueAtTime(dbGain(db), start + V20_HAHA[1] + 0.25);
      }
      src.connect(g).connect(bus.input);
      src.start(start);
      this._sources.push(src);
    }
    // the hum (the confrontation's): up a little as he speaks; it drops for her silence; a small
    // fall as the plug lands (its port dims); low under the rest; gone into the black
    const hum = conf._hum;
    if (hum) {
      const g = hum.gain;
      g.cancelScheduledValues(ac.currentTime);
      g.setValueAtTime(Math.max(0.0001, g.value), ac.currentTime);
      for (const [when, v] of [[T.cut1 + 1, 0.07], [T.silence[0], 0.07], [T.silence[0] + 0.5, 0.025], [T.silence[1] + 0.3, 0.025], [T.silence[1] + 1.4, 0.06], [T.open + 0.3, 0.06]]) {
        g.linearRampToValueAtTime(v, at + when);
      }
      this._humAt = at;
    }
    // the murmur under the pull-out: from the middle of its talk, low-passed more and more
    if (this.walla) {
      const out = (this._wallaOut = ac.createGain());
      out.gain.value = 0;
      out.connect(ac.destination);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.5;
      lp.connect(out);
      const fx = settings.get('effects');
      const s = at + T.out - 0.3, e = at + T.end;
      lp.frequency.setValueAtTime(WALLA_LOWPASS[0], s);
      lp.frequency.exponentialRampToValueAtTime(WALLA_LOWPASS[1], e - 0.4);
      out.gain.setValueAtTime(0, s);
      out.gain.linearRampToValueAtTime(dbGain(WALLA_DB[0]) * fx, s + 0.7);
      out.gain.linearRampToValueAtTime(dbGain(WALLA_DB[1]) * fx, e);
      const src = ac.createBufferSource();
      src.buffer = this.walla;
      src.connect(lp);
      src.start(s, WALLA_FROM);
      this._walla = src;
    }
  }

  // the hum's small fall as the plug lands (its port dims)
  _humDip() {
    const hum = this.conf._hum, ac = this.conf.ac;
    if (!hum || !ac) return;
    const now = ac.currentTime;
    hum.gain.cancelScheduledValues(now);
    hum.gain.setValueAtTime(Math.max(0.0001, hum.gain.value), now);
    hum.gain.linearRampToValueAtTime(0.03, now + 0.9);
    hum.gain.linearRampToValueAtTime(0.03, this._humAt + this.T.black[0]);
    hum.gain.linearRampToValueAtTime(0.0001, this._humAt + this.T.end);
  }

  // a soft knock of his body on the floor
  _thud(size) {
    const conf = this.conf;
    if (conf.ac && conf._fx) conf._thump(conf.ac.currentTime + 0.01, size);
  }

  // 5: the plug on the floor: a hard clack, the loudest sound in the scene
  _clack() {
    const conf = this.conf, ac = conf.ac;
    this._humDip();
    if (!ac || !conf._fx) return;
    conf._knock(1.0);
    const b = conf.fx.get('clank-2');
    if (b) {
      const src = ac.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = 1.35;
      const g = ac.createGain();
      g.gain.value = 0.42;
      src.connect(g).connect(conf._fx);
      src.start(ac.currentTime + 0.004);
    }
    conf._click?.(0.55, 1.25);
    // (its bounce, and the roll)
    conf._click?.(0.16, 1.6);
    setTimeout(() => conf._click?.(0.08, 1.9), 140);
  }

  // the cable slapping down after it: a short, dull burst of noise and a knock
  _slap() {
    const conf = this.conf, ac = conf.ac;
    if (!ac || !conf._fx) return;
    const when = ac.currentTime + 0.005;
    if (conf._noise) {
      const src = ac.createBufferSource();
      src.buffer = conf._noise;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 700;
      f.Q.value = 0.9;
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.16, when + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
      src.connect(f).connect(g).connect(conf._fx);
      src.start(when, Math.random());
      src.stop(when + 0.2);
    }
    conf._thump(when, 0.1);
  }

  // 8: his breath out as he lands: a long, soft rush of air
  _breath() {
    const conf = this.conf, ac = conf.ac;
    if (!ac || !conf._noise || !conf._fx) return;
    const when = ac.currentTime + 0.01;
    const src = ac.createBufferSource();
    src.buffer = conf._noise;
    const f = ac.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1000, when);
    f.frequency.linearRampToValueAtTime(600, when + 1.2);
    f.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.05, when + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 1.3);
    src.connect(f).connect(g).connect(conf._fx);
    src.start(when, Math.random());
    src.stop(when + 1.4);
  }

  // the voices stop (the murmur fades: at the end, into the narration's black)
  _stopVoices(fade = 0.3) {
    const ac = this.conf.ac;
    if (!ac) return;
    const now = ac.currentTime;
    this._bus?.output.gain.setTargetAtTime(0, now, Math.min(fade, 0.4) / 4);
    const hum = this.conf._hum;
    if (hum) {
      hum.gain.cancelScheduledValues(now);
      hum.gain.setTargetAtTime(0.0001, now, 0.1);
    }
    for (const s of this._sources || []) {
      try { s.stop(now + Math.min(fade, 0.4) + 0.05); } catch { /* (already stopped) */ }
    }
    this._sources = [];
    if (this._wallaOut) {
      const g = this._wallaOut.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + fade);
      try { this._walla?.stop(now + fade + 0.05); } catch { /* (already stopped) */ }
    }
  }

  // What Scene C set going; the confrontation (whose room this is) is left as it is, the cable
  // lying where he dropped it
  dispose() {
    this.running = false;
    window.removeEventListener('keydown', this._onKey);
    this._poseHook?.();
    const a = this.conf.actor;
    a?.reach('R', null, { fade: 0.001 });
    a?.reach('L', null, { fade: 0.001 });
    const bus = this._bus, walla = this._wallaOut;
    setTimeout(() => {
      try { bus?.output.disconnect(); } catch { /* (gone) */ }
      try { walla?.disconnect(); } catch { /* (gone) */ }
    }, (WALLA_TAIL + 0.5) * 1000);
    this.buffers = null;
    this.analysers = null;
    this.ready = false;
  }
}
