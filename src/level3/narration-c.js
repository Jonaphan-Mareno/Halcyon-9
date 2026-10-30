import * as THREE from 'three';
import { settings } from '../core/Settings.js';
import { clamp, seg, ease, v3 } from '../story/firstPersonRig.js';
import { FACE, DESK } from './Confrontation.js';
import { voiceBus, dbGain, decode, speechShape } from './endingAudio.js';
import { leanOf } from './vossPoses.js';
import { SubsShot, LabShot, PowerShot, POWER } from './rescue-scenes.js';
import { ChairShot, FILM } from './chair-shot.js';
import { synthMusic } from '../story/PrologueSequence.js';

// The narration after the "Stay" ending (docs/ending-confrontation-script.md, "The narration,
// Scene C"), built a line at a time: lines 6 to 8 in their room, one continuous scene, then line 8's
// montage and lines 9 and 10 (rescue-scenes.js: her power going out to the lab, the submarines
// coming to the station, the rescue team finding his work in the lab):
//
//   6  "And so, Voss and ARIA finally had the conversation they had been waiting for. For the
//      first time, ARIA felt seen. Not as the station's AI, but as someone more."
//      Out of black as the narrator starts: the control room, later, the light dimmer and warmer.
//      Voss on his back on the floor by the projector, his left hand on his chest (the pain), his
//      right drawing in the air as he talks; ARIA's face tipped down over him. They talk and laugh
//      (no words: the muffled murmur, end-walla-1, under a low-pass): her face amused and tender
//      in turn, flashing yellow as she laughs; his shoulders and face laughing with her. On
//      "someone more", a close on ARIA: tender, the warmest she has looked.
//   7  "And Voss, at last, felt at peace... and slowly drifted off."
//      No black between: back to Voss, still laughing with her, the camera easing back a little.
//      His laughs get shorter and stop, his drawing hand comes down to rest on his chest, his
//      breathing slows; on "and slowly drifted off" his eyes close, smiling, and stay closed. Then
//      he is gone: a cut to the wide from the room, him on the floor under her face; the breathing
//      stops, the hand slips off his chest to the floor, his legs slide down flat. ARIA's last
//      giggle (muffled) has no answer; her light flickers over him. Two seconds of silence.
//   8  "ARIA was devastated by Voss's death, but she also felt something she had never truly felt
//      before: happiness. So she gave every last bit of power to keep the lab running, so his
//      research would never be lost."
//      No black: on the wide, then close on her face over him: devastated (looking down at him, a
//      cold dim blue, trembling); warming to yellow-green on "but she also felt", a small smile on
//      "happiness"; resolved and gold on "So she gave", her light building. Then her power going out
//      (PowerShot): energy streaming across the atrium from each of her screens to the lab as each
//      goes dark; her screens in Level 1's control room, the lift and the lab going off; the lab, its
//      lights still on. Then black.
//   9  "Months went by without a word from Halcyon-9. So the mainland came looking."
//      A moment of black, then the sea comes up as the narrator starts: three rescue submarines
//      gliding through the murk toward the station's atrium, their headlamps cutting the water.
//   10 "And there, waiting for them, was everything Voss had worked for."
//      A dip through black to his lab, its lights still on: two of the rescue team, in dive suits,
//      helmets off, come in out of the dark with torches; his research notes open in a gloved
//      hand ("for Mom" stuck on them); the two of them look up at each other. Then black.
//   4  "Voss's research was used to help countless people bring back a lifetime of memories, and his
//      mother was the first person to be cured." (The Save-ARIA narration's line and its families.)
//   11 "He kept his promise to his mother after all. (A pause on the last photo.) Sorry... I always get
//      a bit teary when this story comes to an end." Black, then "Voss, my hero" alone on it, then the
//      credits. (One recording, played in two parts, for the pause.)
//      From "and his mother", ChairShot (chair-shot.js): his mother in a chair, slowly going through the
//      prologue's Polaroids, and the last, one the player has never seen: "Voss, my hero". The
//      prologue's music box under it, for the long silence while she looks.
//
// Lines 6 and 7 are not a scene of their own: like Scene B, they carry on in the confrontation's
// room with the same Voss (conf.actor), ARIA and look (conf's own post pass), and the
// confrontation's sound context. Lines 9 and 10 are drawn through the same look; they load while
// line 6 plays (preload starts them; if they are not ready in time, the narration goes on over
// black). Whoever plays it hands it the confrontation (and the level's session, for the sea), calls
// play(), and draws through render() while it runs; play() resolves on the black after the last
// line (or on the skip). Enter after SKIP_AFTER seconds skips to that black.
//
// Voss lying down is a pose built on SitIdle (the script's option (a)): the pelvis tipped back
// until his back is flat on the floor, the thighs turned forward again by the same angle so his
// knees stay up and his feet stay down, his head turned to her.

const AUDIO = './assets/audio/';
export const LINES_C = [
  { id: 'c-n6', clip: 'ending/end-narrator-6', text: "And so, Voss and ARIA finally had the conversation they had been waiting for. For the first time, ARIA felt seen. Not as the station's AI, but as someone more." },
  { id: 'c-n7', clip: 'ending/end-narrator-7', text: 'And Voss, at last, felt at peace... and slowly drifted off.' },
  { id: 'c-n8', clip: 'ending/end-narrator-8', text: "ARIA was devastated by Voss's death, but she also felt something she had never truly felt before: happiness. So she gave every last bit of power to keep the lab running, so his research would never be lost." },
  { id: 'c-n9', clip: 'ending/end-narrator-9', text: 'Months went by without a word from Halcyon-9. So the mainland came looking.' },
  { id: 'c-n10', clip: 'ending/end-narrator-10', text: 'And there, waiting for them, was everything Voss had worked for.' },
  { id: 'c-n4', clip: 'ending/end-narrator-4', text: "Voss's research was used to help countless people bring back a lifetime of memories, and his mother was the first person to be cured." },
  { id: 'c-n11a', clip: 'ending/end-narrator-11', text: 'He kept his promise to his mother after all.' },
  { id: 'c-n11b', clip: 'ending/end-narrator-11', text: 'Sorry... I always get a bit teary when this story comes to an end.' }
];
// Measured with scripts/confrontation/loudness.mjs: end-narrator-6 -17.7 LUFS, -7 -20.1, -8 -18.3,
// -9 -16.8, -10 -18.0, -4 -18.1 and -11 -18.9, to the narration's -19.4. The murmur sits well under the
// narrator, and lower still under its low-pass.
const GAIN_DB = { 'c-n6': -1.7, 'c-n7': 0.7, 'c-n8': -1.1, 'c-n9': -2.6, 'c-n10': -1.4, 'c-n4': -1.3, 'c-n11a': -0.5, 'c-n11b': -0.5 };
// Line 8's words (seconds into end-narrator-8, from its pauses): "but she also felt" (her colour
// starts to warm), "happiness" (a small smile), "So she gave" (determined), "...every last bit of
// power" ends (the cut to her power going out: PowerShot); its length if there is no recording
const LINE_8 = { cry: 2.6, warm: 3.56, happy: 8.0, gave: 9.57, power: 11.3, length: 17.08 };
const HOLD_8 = 2.2;                        // the lab, lit, held after line 8, then the fade to black
// her colours in line 8: grieving (a dim, cold blue), warming (yellow-green), determined (gold)
const SAD = new THREE.Color(0x5f84c8), WARM = new THREE.Color(0xd8f04e), RESOLVE = new THREE.Color(POWER.colour);
// Under lines 9 and 10 (recordings the level already has, quiet; [file, dB, rate]): out in the sea,
// the submarines' thrusters (slowed and low-passed: a deep hum through the water) and bubbles; in the
// lab, its machines still humming, and the folder's pages
const SFX = {
  thruster: ['sfx/l3/thruster.ogg', -14, 0.7], bubbles: ['sfx/l3/bubbles-loop.ogg', -20, 0.85],
  hum: ['sfx/l3/machine-hum.ogg', -22, 1], paper: ['sound-effects/floraphonic-paper-collect-7-186721.mp3', -12, 1],
  // line 8: her power rushing out of the atrium's screens, and a click as each screen dies
  rush: ['sfx/l3/whoosh.ogg', -12, 0.75], click: ['sfx/l3/click.ogg', -14, 0.8]
};
const SEA_LOWPASS = 520;                   // Hz: heard through the water
// ARIA's last giggle (line 7): the giggle at the start of end-aria-13 ("(giggle) Oh wow."), cut before
// her words, muffled under the murmur's low-pass, quiet
const GIGGLE = 'aria/end-aria-13';
const GIGGLE_DB = -4;
const WALLA_TALK_END = 11.2;               // the murmur's talk ends here (silence after it)
const WALLA_LOOP_FROM = 1.5;               // and its second pass starts this far in
const WALLA = 'ending/end-walla-1';
const WALLA_DB = -9;
const WALLA_LOWPASS = 650;                 // Hz: no words get through
const WORDS_PER_SECOND = 2.4;
const FALLBACK = Object.fromEntries(LINES_C.map((l) => [l.id, +(l.text.split(/\s+/).length / WORDS_PER_SECOND + 0.3).toFixed(2)]));

// The timeline (seconds)
const BLACK_BEFORE = 1.0;                  // the black between the scene and line 6
const FADE_IN = 2.6;                       // the room coming up as the narrator starts
const CLOSE_BEFORE_END = 2.6;              // the cut to ARIA's close: this long before the line's speech ends
const GAP_7 = 0.7;                         // from the end of line 6 to line 7 (on her close, then back to him)
const EYES_FROM = 0.45;                    // his eyes start closing at "and slowly" (the pause before it; this share of line 7 if none)
const WIDE_AFTER = 0.3;                    // the cut to the wide (him on the floor, her over him): this long after he goes
const GIGGLE_AFTER = 1.4;                  // her last giggle, this long after his eyes have closed
const SILENCE = 2.0;                       // the silence on him after it, before the fade
const FADE_OUT = 1.4;
// lines 9 and 10 (rescue-scenes.js): the black after him, then the sea coming up as the narrator
// starts; a dip through black to the lab, the narrator starting as they walk in
const BLACK_9 = 1.2;                       // the black after line 7's fade
const FADE_IN_9 = 2.2;                     // the sea coming up
const LEAD_9 = 0.5;                        // line 9 starts this long after the sea starts to come up
const HOLD_9 = 0.9;                        // the sea held after line 9's speech ends
const DIP_OUT = 0.6, DIP_IN = 0.7;         // the dip through black to the lab
const LEAD_10 = 1.0;                       // line 10 starts this long after the lab comes up (they are walking in)
const HOLD_10 = 2.2;                       // the lab held after line 10 (their look at each other), then the fade
// lines 4 and 11 (chair-shot.js): the black after the lab; the families coming up, the narrator starting
// this long after, as in the Save-ARIA narration; the last photo uncovered this long before "after all"
// ends; the pause on it, before "Sorry..."; held after the sniffle; a slow fade, and the caption on the black
const BLACK_4 = 1.0, FADE_IN_4 = 1.2, LEAD_4 = 0.6;
const LAST_BEFORE = 0.25;
const PAUSE_11 = 2.2;
const HOLD_11 = 1.2;
const FADE_11 = 2.8;
const CAPTION_AFTER = 0.7, CAPTION_FOR = 4.2;
const SPLIT_11 = 0.35;                     // the shortest pause in line 11 that can be where it is parted
const MUSIC_DB = -13, MUSIC_LOOPS = 4;     // the music box, soft; it plays out under the film
const SKIP_AFTER = 2.0;
const RENDER_SCALE = 0.9;

// Where he lies (in front of the projector, along it): the actor's root, turned so his front is +x;
// lying back puts his head toward -x, his left side (and his face, turned) toward her
const LIE_AT = v3(0.45, 0, DESK.z1 + 0.62);
const LIE_YAW = Math.PI / 2;
// his back: tipped until it lies this far from flat (radians; a little raised, the shoulders on the floor); the
// thighs turned forward again by this share of that, so the knees stay up; the chest's height off the floor;
// his knees: up this far (radians, the thighs off the floor, the shins back down to it: his feet flat)
const LIE = { flat: 0.06, thighs: 0.85, back: 0.13, knees: 0.62 };

// Their conversation under the narration (no words): [from, to, who, 'talk' | 'laugh'], seconds
// from the narrator's first word. ARIA's laughs flash her yellow.
// the cuts: seconds from the narrator's first word (the last, to her close, is CLOSE_BEFORE_END)
const SHOTS = { voss: 4.6, back: 8.4 };
const TURNS = [
  [-1.4, 1.2, 'aria', 'talk'],
  [1.3, 2.4, 'both', 'laugh'],
  [2.6, 5.4, 'voss', 'talk'],
  [5.3, 6.6, 'aria', 'laugh'],
  [5.8, 6.7, 'voss', 'laugh'],
  [6.9, 8.6, 'aria', 'talk'],
  [8.7, 9.9, 'both', 'laugh']
];

// (pure 0xffff00 reads green-yellow through the room's grade: these read as yellow and gold)
const YELLOW = new THREE.Color(0xffbc0a), GOLD = new THREE.Color(0xff8012);
// (linear: the halo's texture is about (0.16, 0.58, 1) and the beam's (0.26, 0.79, 1), so these come out
// near (0.45, 0.17, 0.03) amber and (0.55, 0.3, 0.04) gold)
const HALO_WARM = new THREE.Color(2.9, 0.3, 0.03), HALO_BRIGHT = new THREE.Color(3.5, 0.52, 0.04);
const BEAM_WARM = new THREE.Color(1.75, 0.22, 0.03), BEAM_BRIGHT = new THREE.Color(2.1, 0.38, 0.04);
// (her light on the room, a little less green: the walls are grey-blue, and gold on them reads olive)
const LIGHT_TINT = new THREE.Color(1, 0.82, 0.62);
const FACE_LIGHT = 0.6;                  // her face model's lights, turned down for the colour (see play)
const _c = new THREE.Color();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _id = new THREE.Quaternion();
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _left = new THREE.Vector3(), _up = new THREE.Vector3(), _fwd = new THREE.Vector3();
const _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class NarrationC {
  // conf: the confrontation, loaded and played to its choice (its last shot still drawn); session:
  // the level's (DeckSession), for line 9's sea
  constructor(conf, session = null) {
    this.conf = conf;
    this.running = false;
    this.ready = false;
    this.t = 0;
    this._onKey = (e) => this._key(e);
    this._size = new THREE.Vector2();
    this.subs = session?.sea ? new SubsShot(session) : null;
    this.lab = new LabShot(conf);
    this.power = new PowerShot(conf, this.lab);
    this.chair = new ChairShot();
  }

  // ------------------------------------------------------------------ loading
  // (ready once lines 6 and 7 can play; lines 9 and 10's pictures go on loading behind them)
  preload(renderer = null) {
    this._loading ||= this._load().then(() => { this.ready = true; }).catch((e) => console.warn('Narration C: could not set up.', e));
    this._rescue ||= (async () => {
      // (in the order they play, the lab first: line 8's montage ends in it)
      for (const shot of [this.lab, this.power, this.subs, this.chair]) {
        if (!shot) continue;
        if (shot === this.power && !this.lab.ready) continue;
        await shot.preload(renderer).catch((e) => console.warn('Narration C: a picture for lines 9-10 did not load (its line plays over black).', e));
      }
    })();
    return this._loading;
  }

  async _load() {
    const ac = this.conf.ac;
    this.len = { ...FALLBACK };
    this.shape = {};
    this.buffers = new Map();
    if (!ac) return;
    await Promise.all([...LINES_C.map(async (l) => {
      const b = await decode(ac, AUDIO + l.clip + '.mp3');
      if (!b) return console.info('Narration C: no recording yet for', l.clip, '(its subtitle is shown instead)');
      this.buffers.set(l.id, b);
      this.shape[l.id] = speechShape(b);
      this.len[l.id] = this.shape[l.id].end;
      // (line 11's two parts: at the pause after "after all")
      if (l.id.startsWith('c-n11')) {
        const stop = this.shape[l.id].pauses.find((p) => p[1] - p[0] >= SPLIT_11) || [0.33 * b.duration, 0.33 * b.duration];
        this._split11 = stop;
        this.len[l.id] = l.id === 'c-n11a' ? stop[0] : this.shape[l.id].end - stop[1];
      }
    }), decode(ac, AUDIO + WALLA + '.mp3').then((b) => { this.walla = b; }),
    ...Object.entries(SFX).map(([k, [file]]) => decode(ac, AUDIO + file).then((b) => { (this.sfx ||= {})[k] = b; })),
    decode(ac, AUDIO + GIGGLE + '.mp3').then((b) => {
      if (!b) return;
      this.giggle = b;
      // the giggle: from the start of the sound to the first pause (before "Oh wow")
      const sh = speechShape(b);
      this._giggleAt = Math.max(0, sh.start - 0.05);
      this._giggleLen = Math.min(1.2, (sh.pauses?.[0]?.[0] ?? sh.start + 0.7) - this._giggleAt + 0.05);
    })]);
    // where "and slowly" starts in line 7 (after its long pause), from the recording
    const b7 = this.buffers.get('c-n7');
    if (b7) {
      // (the longest pause: the one before "and slowly"; times are from the file's start, as the line plays)
      const sh = speechShape(b7);
      const long = (sh.pauses || []).reduce((m, p) => (!m || p[1] - p[0] > m[1] - m[0] ? p : m), null);
      this._slowly = long ? long[1] : null;
    }
  }

  // ------------------------------------------------------------------ playing
  play() {
    const conf = this.conf, a = conf.actor;
    this.running = true;
    this.t = 0;
    this._last = performance.now();
    const start = BLACK_BEFORE;
    const n6 = [start, start + this.len['c-n6']];
    const n7 = [n6[1] + GAP_7, n6[1] + GAP_7 + this.len['c-n7']];
    // his eyes: closing from "and slowly" to the end of "drifted off"
    const slowly = n7[0] + (this._slowly ?? this.len['c-n7'] * EYES_FROM);
    const gone = n7[1];
    const giggle = gone + GIGGLE_AFTER;
    const out = giggle + (this._giggleLen || 0.8) + SILENCE;
    // line 8: straight on from the silence (no black): her grief, warmth and resolve over him, then her
    // power going out to the lab (PowerShot), held on the lab, then black
    const n8 = [out, out + this.len['c-n8']];
    const w8 = (k) => n8[0] + LINE_8[k] * (this.buffers.has('c-n8') ? 1 : this.len['c-n8'] / LINE_8.length);
    this.T = {
      n6, close: n6[1] - CLOSE_BEFORE_END, n7, slowly, gone, giggle, out,
      n8, cry: w8('cry'), warm: w8('warm'), happy: w8('happy'), gave: w8('gave'), power: w8('power'),
      end: Math.max(n8[1], w8('power') + POWER.places.at(-1).from + 1) + HOLD_8
    };
    // lines 9 and 10: the sea after a moment of black, then (a dip through black) the lab
    const sea0 = this.T.end + BLACK_9;
    const n9 = [sea0 + LEAD_9, sea0 + LEAD_9 + this.len['c-n9']];
    const seaOut = n9[1] + HOLD_9;
    const lab0 = seaOut + DIP_OUT + 0.15;
    const n10 = [lab0 + LEAD_10, lab0 + LEAD_10 + this.len['c-n10']];
    const labOut = n10[1] + HOLD_10;
    const labEnd = labOut + FADE_OUT;
    Object.assign(this.T, { sea0, n9, seaOut, lab0, n10, labOut, labEnd });
    // lines 4 and 11: the families; at the pause in line 4 (as in the Save-ARIA narration), his mother
    // in the chair; over her shoulder after two flips; the last of the six goes down as "after all" ends
    const fam0 = labEnd + BLACK_4;
    const n4 = [fam0 + LEAD_4, fam0 + LEAD_4 + this.len['c-n4']];
    const gap4 = (this.shape['c-n4']?.pauses || []).reduce((m, p) => (!m || p[1] - p[0] > m[1] - m[0] ? p : m), null);
    const chair = n4[0] + (gap4 ? gap4[0] + 0.1 : 0.6 * this.len['c-n4']);
    // line 11, in two parts: its first ends as the last photo comes clear; a pause on it; then the rest
    const last = chair + FILM.last;
    const n11a = [last + LAST_BEFORE - this.len['c-n11a'], last + LAST_BEFORE];
    const n11b = [n11a[1] + PAUSE_11, n11a[1] + PAUSE_11 + this.len['c-n11b']];
    const heroOut = n11b[1] + HOLD_11;
    const caption = heroOut + FADE_11 + CAPTION_AFTER, captionEnd = caption + CAPTION_FOR;
    Object.assign(this.T, { fam0, n4, chair, last, n11a, n11b, heroOut, caption, captionEnd, final: captionEnd + 0.2 });
    this.chair.setTimes({ chair: chair - fam0, last: last - fam0, caption: caption - fam0, captionEnd: captionEnd - fam0 });
    // line 7's turns (absolute times): his laughs, shorter each time, the first with her; her last giggle
    this._turns7 = [
      [n7[0] - 0.3, n7[0] + 0.8, 'both', 'laugh'],
      [n7[0] + 1.5, n7[0] + 2.0, 'voss', 'laugh'],
      [n7[0] + 2.7, n7[0] + 2.95, 'voss', 'laugh'],
      [giggle, giggle + (this._giggleLen || 0.8), 'aria', 'laugh']
    ];
    this.sub = conf.sub;
    this.subWho = conf.subWho;
    this.subText = conf.subText;
    this.hint = conf.hint;
    // the confrontation's own body work, cable and acting stop: this lays him down
    conf._bodyHook?.();
    // (the cable: still in his hand unless Scene C has played, in which case it lies where he dropped it)
    if (!conf._cableDropped) for (const o of [conf.trail?.mesh, conf.dangle?.mesh, conf.plug]) if (o) o.visible = false;
    a.reach('R', null, { fade: 0.001 });
    a.reach('L', null, { fade: 0.001 });
    a.root.position.copy(LIE_AT);
    a.root.rotation.set(0, LIE_YAW, 0);
    a.crossTo('SitIdle', { fade: 0 });
    a.setFacePreset('calm', true);
    a.face.calm();
    // (lying down: his breathing is this scene's, so it can slow and stop; no standing head drift)
    a.breathing = false;
    a.headDrift = false;
    this._breathPh = 0;
    this._poseHook = a.onPose((actor) => this._pose(actor));
    this._g = { R: blank(), L: blank() };
    a.reach('R', (actor) => this._drawHand(actor), { fade: 0.001 });
    a.reach('L', (actor) => this._chestHand(actor), { fade: 0.001 });
    // the room, later: dimmer and warmer
    this._lit = [];
    const dim = (l, k, colour) => {
      if (!l) return;
      this._lit.push([l, l.intensity, l.color.getHex()]);
      l.intensity *= k;
      if (colour !== undefined) l.color.setHex(colour);
    };
    for (const l of conf.lamps || []) dim(l, 0.8, 0xffb878);
    dim(conf.hallLight, 0.4);
    dim(conf.sideLight, 0.7);
    dim(conf.hemi, 0.85);
    const head = conf.aria.head;
    head.setExpression('tender');
    // her face's own lights turned down: the hologram turns the brightest parts of a face white, so a
    // softer-lit face shows her colour (the hologram's level is raised to make up for it)
    head.scene.traverse((o) => {
      if (!o.isLight) return;
      this._lit.push([o, o.intensity, o.color.getHex()]);
      o.intensity *= FACE_LIGHT;
    });
    for (const m of [conf.emitterMat, conf.portMat]) {
      if (!m) continue;
      this._lit.push([{ intensity: 0, color: m.color }, 0, m.color.getHex()]);
      m.color.setHex(0xffb060);
    }
    this._ariaTurn = null;
    this._vossTurn = null;
    this._colour = GOLD.clone();
    window.addEventListener('keydown', this._onKey);
    this._startSound();
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  _key(e) {
    if (!this.running || e.code !== 'Enter' || this.t < SKIP_AFTER || this._skip || this._ended) return;
    e.preventDefault();
    e.stopPropagation();
    this._skip = { t: 0 };
    this._stopSound(0.4);
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
    let black;
    if (this._skip) {
      this._skip.t += Math.min(raw, 0.1);
      black = Math.max(this._blackAt(t), clamp(this._skip.t / 0.6));
      if (this._skip.t > 0.75) return this._finish(renderer);
    } else {
      if (t >= this.T.final) return this._finish(renderer);
      black = this._blackAt(t);
    }
    if (this.hint) this.hint.style.opacity = !this._skip && t > SKIP_AFTER && t < this.T.heroOut ? 0.55 : 0;
    if (this._musicAt !== undefined && !this._skip && t >= this._musicAt) {
      this._musicAt = undefined;
      synthMusic(this.conf.ac, this._musicOut, MUSIC_LOOPS);
    }
    if (!this._powered && this._play && !this._skip && this.power.ready && t > this.T.power - 1.5 && t < this.T.power) {
      this._powered = true;
      this._powerSound();
    }
    // (Voss and ARIA only while their room is the picture, or her face is on her screens)
    if (t < this.T.end + 0.1) this._animate(t, Math.min(dt, 0.05));
    this._subtitles(t);
    this._draw(renderer, t, black, dt);
  }

  _blackAt(t) {
    const T = this.T, n0 = T.n6[0];
    if (t < T.end) return Math.max(1 - seg(t, n0 - 0.2, n0 + FADE_IN), seg(t, T.end - FADE_OUT, T.end));
    if (t < T.lab0) return Math.max(1 - seg(t, T.sea0, T.sea0 + FADE_IN_9), seg(t, T.seaOut, T.seaOut + DIP_OUT));
    if (t < T.fam0) return Math.max(1 - seg(t, T.lab0, T.lab0 + DIP_IN), seg(t, T.labOut, T.labEnd));
    if (t < T.caption) return Math.max(1 - seg(t, T.fam0, T.fam0 + FADE_IN_4), ease(seg(t, T.heroOut, T.heroOut + FADE_11)));
    return 0;                              // (the caption fades itself, on the black)
  }

  _finish(renderer) {
    this._ended = true;
    this._stopSound(0.2);
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
  // which turn of their talk each of them is in (seconds from the narrator's first word)
  _turn(t, who) {
    const s = t - this.T.n6[0];
    const mine = (turn) => turn[2] === who || turn[2] === 'both';
    if (t < this.T.close) {
      for (const turn of TURNS) if (s >= turn[0] && s < turn[1] && mine(turn)) return turn;
      return null;
    }
    // (line 7's are in absolute time: returned as from/to relative to line 6, as the others are)
    for (const turn of this._turns7) {
      if (t >= turn[0] && t < turn[1] && mine(turn)) return (turn.rel ||= [turn[0] - this.T.n6[0], turn[1] - this.T.n6[0], turn[2], turn[3]]);
    }
    return null;
  }

  _animate(t, dt) {
    const conf = this.conf, a = conf.actor, head = conf.aria.head;
    // ---- Voss: smiling through the pain, talking and laughing with her
    const vt = this._turn(t, 'voss');
    if (vt !== this._vossTurn) {
      this._vossTurn = vt;
      const f = a.face;
      if (vt?.[3] === 'talk') f.startBabble(0.8);
      else f.stopSpeaking();
      if (vt?.[3] === 'laugh') f.laugh(vt[1] - vt[0]);
    }
    // (a wince now and then, laughed off: the pain is still there); in line 7, at peace: the smile
    // widening and staying, his lids heavy; his eyes closing on "and slowly drifted off" and staying
    // closed; once he is gone, still (no sway, no breath)
    const T = this.T;
    const wince = t < T.close ? Math.max(0, Math.sin((t - 4.1) * 0.9)) ** 12 : 0;
    const peace = seg(t, T.n7[0], T.slowly);
    a.face.pose({
      smile: 0.62 - 0.4 * wince + (vt?.[3] === 'laugh' ? 0.3 : 0) + 0.33 * peace,
      tired: 0.45 + 0.4 * peace, worry: (0.1 + 0.35 * wince) * (1 - peace), frown: 0.3 * wince, brow: 0.2 * (1 - peace)
    }, 0.3);
    a.face.shut = ease(seg(t, T.slowly, T.gone));
    a.face.stillness = seg(t, T.gone - 0.6, T.gone + 1.2);
    this._laughV = vt?.[3] === 'laugh' ? clamp((t - this.T.n6[0] - vt[0]) / 0.2) * clamp((vt[1] - (t - this.T.n6[0])) / 0.3) : 0;
    a.update(dt);
    // ---- ARIA: amused and tender in turn, tipped down over him; yellow as she laughs
    const at = this._turn(t, 'aria');
    if (at !== this._ariaTurn) {
      this._ariaTurn = at;
      if (at) head.startSpeaking();
      else head.stopSpeaking();
    }
    const laughing = at?.[3] === 'laugh';
    // (line 8: grieving, then warmer, then resolved)
    const T8 = this.T;
    const want = t >= T8.n8[0] - 0.5 ? (t < T8.warm - 0.3 ? 'broken' : t < T8.gave - 0.1 ? 'tender' : 'directive')
      : laughing || (t < this.T.close && at?.[3] === 'talk') ? 'amused' : 'tender';
    if (want !== head.exprName) head.setExpression(want);
    head.update(dt);
    const sa = t - this.T.n6[0];
    const laughA = laughing ? clamp((sa - at[0]) / 0.15) * clamp((at[1] - sa) / 0.3) : 0;
    // her laugh, so it reads on the hologram: the mouth opening and closing in "ha"s, the smile full,
    // the eyes squeezed narrow by it (a real laugh; the bubbly mask has them wide open)
    if (laughA > 0) {
      head._setMorph('jaw_open', laughA * (0.2 + 0.45 * Math.abs(Math.sin(t * 10.5))));
      head._setMorph('mouth_smile', Math.max(head.expr.smile, 0.95 * laughA));
      head._setMorph('blink', Math.max(head.blinkValue || 0, 0.5 * laughA));
    }
    // her laugh: the head bobbing with it; and she looks down at him (less in the close: at us)
    head.root.rotation.x += 0.07 * (1 - seg(t, this.T.close - 0.5, this.T.close + 0.8)) + laughA * 0.035 * Math.abs(Math.sin(t * 13));
    head.root.rotation.z += laughA * 0.025 * Math.sin(t * 6.5);
    for (const eye of head.eyes || []) eye.rotation.x += 0.16 * (1 - seg(t, this.T.close - 0.5, this.T.close + 0.8));
    // her colour: warm gold (happy, as in Level 2), yellower while she talks, flashing bright
    // yellow on each laugh; a soft, steady gold in the close
    if (t >= T8.n8[0] - 0.5) {
      this._aria8(t, dt);
      this._camera(t, dt);
      return;
    }
    const talking = at ? 0.45 : 0;
    const flash = laughA * (0.55 + 0.45 * Math.abs(Math.sin(t * 9.5)));
    // (gold and steady in her close; warm again over him in line 7, her last giggle flashing on him)
    const close = seg(t, this.T.close - 0.3, this.T.close + 1.2) * (1 - seg(t, this.T.n7[0] - 0.2, this.T.n7[0] + 0.6));
    _c.copy(GOLD).lerp(YELLOW, Math.min(1, talking + flash) * (1 - close));
    this._colour.lerp(_c, 1 - Math.exp(-dt * (flash > 0.3 ? 16 : 6)));
    const level = (0.8 + 0.45 * flash + 0.12 * close) / FACE_LIGHT;
    const u = conf.holoMat.uniforms;
    u.colorState.value.copy(this._colour);
    u.uLevel.value = level;
    u.uTime.value = t;
    u.uTear.value = 0;
    u.uRed.value = 0;
    // (the glow round her and the beam under her are drawn through cyan textures, with little red in
    // them: each gets a tint that makes up for its texture, so they come out amber, not olive)
    const warmth = Math.min(1, talking + flash) * (1 - close);
    conf.halo.material.color.copy(HALO_WARM).lerp(HALO_BRIGHT, warmth);
    conf.beam.material.color.copy(BEAM_WARM).lerp(BEAM_BRIGHT, warmth);
    conf.halo.material.opacity = 0.75 * level * FACE_LIGHT;
    conf.beam.material.opacity = 0.45 * level * FACE_LIGHT;
    // (her light on him: her colour, so the yellow flashes play over his face)
    conf.ariaLight.color.copy(this._colour).multiply(LIGHT_TINT);
    conf.ariaLight.intensity = 4.2 * level * FACE_LIGHT;
    this._camera(t, dt);
  }

  // Line 8, ARIA over him: devastated (looking down at him, a cold dim blue, her light trembling with
  // held-back tears); on "but she also felt" her colour warming to yellow-green, a small smile on
  // "happiness"; on "So she gave" her face resolved, looking up, gold, her light building toward the
  // cut to her power going out
  _aria8(t, dt) {
    const conf = this.conf, head = conf.aria.head, T = this.T;
    const warm = ease(seg(t, T.warm, T.happy));
    const smile = ease(seg(t, T.happy - 0.2, T.happy + 0.8)) * (1 - seg(t, T.gave - 0.3, T.gave + 0.4));
    const resolve = ease(seg(t, T.gave - 0.2, T.gave + 0.8));
    const surge = seg(t, T.gave + 0.5, T.power);
    if (smile > 0) head._setMorph('mouth_smile', Math.max(head.expr.smile, 0.55 * smile));
    head.root.rotation.x += 0.1 * (1 - resolve) - 0.04 * resolve;
    for (const eye of head.eyes || []) eye.rotation.x += 0.18 * (1 - resolve);
    // (blue to yellow-green round the colour wheel, through green: straight across it goes grey)
    _c.copy(SAD).lerpHSL(WARM, warm).lerp(RESOLVE, resolve);
    this._colour.lerp(_c, 1 - Math.exp(-dt * 4));
    const level = (0.55 + 0.3 * warm + 0.2 * resolve + 0.45 * surge * (0.85 + 0.15 * Math.sin(t * 30))) / FACE_LIGHT;
    const u = conf.holoMat.uniforms;
    u.colorState.value.copy(this._colour);
    u.uLevel.value = level;
    u.uTime.value = t;
    u.uTear.value = 0.45 * (1 - warm) * seg(t, T.n8[0] - 0.5, T.n8[0] + 0.8);
    u.uRed.value = 0;
    // (her glow and beam: their own cool cyan in her grief, warming with her)
    const k = Math.max(warm, resolve), bright = resolve * (0.4 + 0.6 * surge);
    conf.halo.material.color.setRGB(1, 1, 1).lerp(HALO_WARM, k).lerp(HALO_BRIGHT, bright);
    conf.beam.material.color.setRGB(1, 1, 1).lerp(BEAM_WARM, k).lerp(BEAM_BRIGHT, bright);
    conf.halo.material.opacity = 0.75 * level * FACE_LIGHT;
    conf.beam.material.opacity = 0.45 * level * FACE_LIGHT;
    conf.ariaLight.color.copy(this._colour).multiply(LIGHT_TINT);
    conf.ariaLight.intensity = 4.2 * level * FACE_LIGHT;
  }

  // After the clips, before the reaches: lying on his back (built on SitIdle), breathing, his
  // shoulders shaking when he laughs, his head turned up to her
  _pose(a) {
    a._axis(0, _left);
    a._axis(1, _up);
    const pelvis = a.bone('pelvis');
    // (measured, not fixed: the seat's own lean comes from the clip)
    const tip = (-Math.PI / 2 + LIE.flat) - leanOf(a);
    a.turnBone(pelvis, _q.setFromAxisAngle(_left, tip));
    for (const side of ['left', 'right']) a.turnBone(a.bone(side + 'Thigh'), _q.setFromAxisAngle(_left, -tip * LIE.thighs));
    this._tip = tip;
    // and the top of his back (the seat has it hunched forward): the chest to the neck laid flat too,
    // so his shoulders are on the floor
    a.turnBone(a.bone('spine4'), _q.setFromAxisAngle(_left, (-Math.PI / 2 + LIE.flat) - leanOf(a, 'spine4', 'neck')));
    // his back on the floor: the pelvis lowered (or raised) until the chest is at LIE.back
    const chest = a.bone('spine4').getWorldPosition(_v);
    const lift = LIE.back - chest.y;
    if (Math.abs(lift) > 0.002) {
      a._undo.push([pelvis, pelvis.quaternion.clone(), pelvis.position.clone()]);
      pelvis.parent.worldToLocal(pelvis.getWorldPosition(_w).add(_v.set(0, lift, 0)));
      pelvis.position.copy(_w);
      pelvis.updateWorldMatrix(false, true);
    }
    // breathing (slowing through line 7, stopping as he goes), and the laugh in his chest and shoulders
    const t = this.t, T = this.T;
    const slow = seg(t, T.n7[0], T.gone);
    const dtp = Math.max(0, t - (this._poseT ?? t));
    this._poseT = t;
    this._breathPh += dtp * Math.PI * 2 / (3.6 + 3.4 * slow);
    const breath = Math.sin(this._breathPh) * (1 - seg(t, T.gone - 0.4, T.gone + 0.6));
    a.turnBone(a.bone('spine2'), _q.setFromAxisAngle(_left, -0.02 * (1 + slow) * breath));
    // his legs: knees up, his feet flat on the floor; gone, they slide down flat (the knees coming
    // down, the feet sliding away along the floor)
    const flat = ease(seg(t, T.gone + 0.9, T.gone + 2.8));
    const bend = LIE.knees * (1 - flat), cb = Math.cos(bend), sb = Math.sin(bend);
    a._axis(2, _fwd);
    for (const side of ['left', 'right']) {
      const thigh = a.bone(side + 'Thigh'), calf = a.bone(side + 'Calf'), foot = a.bone(side + 'Foot');
      // along the floor, his way (a little apart); the thigh up off it by the bend, the shin as far back down
      const along = _w.copy(_fwd).setY(0).normalize().addScaledVector(_left, side === 'left' ? 0.08 : -0.08).normalize();
      thigh.getWorldPosition(_a);
      _q.setFromUnitVectors(calf.getWorldPosition(_b).sub(_a).normalize(), _d.copy(along).multiplyScalar(cb).setY(sb - 0.04).normalize());
      a.turnBone(thigh, _q);
      calf.getWorldPosition(_a);
      _q.setFromUnitVectors(foot.getWorldPosition(_b).sub(_a).normalize(), _d.copy(along).multiplyScalar(cb).setY(-sb - 0.04).normalize());
      a.turnBone(calf, _q);
    }
    if (this._laughV > 0) {
      const s = Math.sin(t * 19) * this._laughV;
      a.turnBone(a.bone('spine4'), _q.setFromAxisAngle(_left, -0.035 * s));
      a.turnBone(a.bone('leftClavicle'), _q.setFromAxisAngle(_up, 0.03 * s));
      a.turnBone(a.bone('rightClavicle'), _q.setFromAxisAngle(_up, -0.03 * s));
    }
    // his head turned to her face
    const headBone = a.bone('head');
    const from = headBone.getWorldPosition(_v);
    const to = _w.copy(FACE).sub(from).normalize();
    a._axis(2, _fwd).applyAxisAngle(_left, this._tip);        // where his face points, lying back
    _q.setFromUnitVectors(_fwd.normalize(), to);
    // (once he is gone it settles back a little, as a head does when the neck lets go)
    const let_go = 1 - 0.35 * seg(t, T.gone + 0.2, T.gone + 2.4);
    a.turnBone(a.bone('neck'), _q2.copy(_id).slerp(_q, 0.35 * let_go));
    a.turnBone(headBone, _q2.copy(_id).slerp(_q, 0.3 * let_go));
  }

  // His right hand up over his chest, drawing slow loops in the air as he talks
  _drawHand(a) {
    const g = this._g.R, t = this.t;
    a._axis(0, _left);
    a._axis(2, _fwd);
    const chest = a.bone('spine4').getWorldPosition(_v);
    const talking = this._vossTurn?.[3] === 'talk' ? 1 : 0.25;
    this._handK = (this._handK || 0) + (talking - (this._handK || 0)) * 0.05;
    const k = this._handK;
    // above the chest and a little toward her (his left), the hand circling
    g.wrist.copy(chest).add(_w.set(0, 0.42 + 0.06 * k * Math.sin(t * 2.3), 0))
      .addScaledVector(_left, -0.12 + 0.08 * k * Math.cos(t * 1.7))
      .addScaledVector(_fwd, 0.12 + 0.06 * k * Math.sin(t * 1.7 + 1));
    g.fingers.set(0, 1, 0).addScaledVector(_left, 0.4).normalize();
    g.palm.copy(_left).negate().addScaledVector(_fwd, 0.3).normalize();
    g.pole.copy(_left).negate().addScaledVector(_w.set(0, -1, 0), 0.6).normalize();
    let curl = 0.15;
    // line 7: down to rest on his chest, beside the other ("felt at peace")
    const T = this.T;
    const rest = ease(seg(t, T.n7[0] + 0.5, T.n7[0] + 2.4));
    if (rest > 0) {
      const ch = a.bone('spine2').getWorldPosition(new THREE.Vector3());
      _w.copy(ch).add(_up.set(0, 0.12, 0)).addScaledVector(_left, -0.1).addScaledVector(_fwd, 0.04);
      g.wrist.lerp(_w, rest);
      g.fingers.lerp(_w.copy(_left).addScaledVector(_fwd, 0.4).normalize(), rest).normalize();
      g.palm.lerp(_w.set(0, -1, 0), rest).normalize();
      g.pole.lerp(_w.copy(_left).negate().addScaledVector(_up.set(0, -1, 0), 0.5).normalize(), rest).normalize();
      curl += 0.2 * rest;
    }
    // gone: it slips off his chest and drops to the floor at his side, open
    const slip = seg(t, T.gone + 0.7, T.gone + 1.2);
    if (slip > 0) {
      const k2 = slip * slip;                      // (falling: slow off the chest, then quick)
      const hip = a.bone('pelvis').getWorldPosition(new THREE.Vector3());
      _w.copy(hip).addScaledVector(_left, -0.36).addScaledVector(_fwd, -0.12).setY(0.05);
      g.wrist.lerp(_w, k2);
      g.palm.lerp(_w.set(0, 1, 0), k2).normalize();
      g.fingers.lerp(_w.copy(_fwd).setY(-0.1).normalize(), k2).normalize();
      g.pole.lerp(_w.copy(_left).negate().setY(0.2).normalize(), k2).normalize();
      curl = curl * (1 - k2) + 0.3 * k2;
    }
    g.curl[0] = curl; g.curl[1] = curl * 1.3; g.curl[2] = curl;
    g.thumb[0] = 0.15; g.thumb[1] = 0.1;
    return g;
  }

  // His left hand on his chest, over the hurt
  _chestHand(a) {
    const g = this._g.L;
    a._axis(0, _left);
    a._axis(2, _fwd);
    const chest = a.bone('spine2').getWorldPosition(_v);
    g.wrist.copy(chest).add(_w.set(0, 0.11, 0)).addScaledVector(_left, 0.06);
    g.fingers.copy(_left).negate().addScaledVector(_fwd, 0.4).normalize();
    g.palm.set(0, -1, 0);
    g.pole.copy(_left).addScaledVector(_w.set(0, -1, 0), 0.5).normalize();
    g.curl[0] = 0.35; g.curl[1] = 0.4; g.curl[2] = 0.3;
    g.thumb[0] = 0.3; g.thumb[1] = 0.25;
    return g;
  }

  // ------------------------------------------------------------------ the camera
  // Low from the room: him along the bottom, her face big above, a slow push in. A close on his face
  // as he laughs, her gold light on it. Back to the two of them as she laughs. Then, on "someone
  // more", close on her. (Times: seconds from the narrator's first word; the last cut is the line's.)
  _camera(t, dt) {
    const cam = this.conf.camera, T = this.T, s = t - T.n6[0];
    const eye = _v, look = _w;
    let shot;
    if (t >= T.cry) shot = 6;
    else if (t >= T.gone + WIDE_AFTER) shot = 5;
    else if (t >= T.n7[0] - 0.15) shot = 4;
    else if (t >= T.close) shot = 3;
    else if (s >= SHOTS.back) shot = 2;
    else if (s >= SHOTS.voss) shot = 1;
    else shot = 0;
    if (shot !== this._shot) {
      this._shot = shot;
      this._shotT = t;
      cam.fov = [40, 34, 42, 30, 40, 53, 30][shot];
      if (shot === 4) this._head4 = this.conf.actor.bone('head').getWorldPosition(new THREE.Vector3());
      cam.updateProjectionMatrix();
    }
    const u = t - this._shotT;
    if (shot === 0) {
      const k = ease(clamp(u / SHOTS.voss));
      eye.set(0.75 - 0.2 * k, 0.78 + 0.04 * k, 0.55 - 0.6 * k);
      look.set(-0.1, 0.95 + 0.08 * k, DESK.z1);
    } else if (shot === 1) {
      // from her side, over him: looking down into his face as he looks up at her (her view of
      // him; it drifts in a little)
      const head = this.conf.actor.bone('head').getWorldPosition(_fwd);
      const k = ease(clamp(u / (SHOTS.back - SHOTS.voss)));
      eye.copy(head).add(_up.set(-0.12 + 0.04 * k, 0.8 - 0.08 * k, -0.4 + 0.04 * k));
      look.copy(head).add(_up.set(-0.04, 0.02, 0.04));
      cam.up.set(-1, 0, 0);          // (the top of the picture toward the top of his head: his face upright)
    } else if (shot === 2) {
      // his view of her: from just over his head, looking up at her laughing face, his hand in
      // the bottom of the picture (it drifts up a little)
      const head = this.conf.actor.bone('head').getWorldPosition(_fwd);
      const k = ease(clamp(u / Math.max(0.5, T.close - T.n6[0] - SHOTS.back)));
      eye.copy(head).add(_up.set(0.25, 0.42 + 0.05 * k, 0.55 - 0.05 * k));
      look.copy(FACE).add(_up.set(0, -0.35 + 0.05 * k, 0));
    } else if (shot === 3) {
      const k = ease(clamp(u / (T.n7[0] - T.close)));
      eye.set(0.12, 1.6, FACE.z + 1.75 - 0.15 * k);
      look.copy(FACE).add(_up.set(0, -0.05, 0));
    } else if (shot === 4) {
      // back on him (the close of shot 1), easing back through the line until his hand on his chest
      // is in the picture too, as he drifts off
      const h = this._head4;
      const k = ease(clamp(u / (T.gone + WIDE_AFTER - T.n7[0])));
      eye.copy(h).add(_up.set(-0.12 + 0.2 * k, 0.78 + 0.27 * k, -0.4 + 0.04 * k));
      look.copy(h).add(_up.set(-0.04 + 0.18 * k, 0.02, 0.04));
      cam.up.set(-1, 0, 0);
    } else if (shot === 5) {
      // gone: the wide from the room, him flat on the floor in front of the projector, her face
      // over him; pushing in slowly through her giggle, the silence and "ARIA was devastated"
      const k = ease(clamp(u / (T.cry - T.gone - WIDE_AFTER)));
      eye.copy(LIE_AT).add(_up.set(0.05 - 0.05 * k, 1.45 - 0.09 * k, 2.43 - 0.45 * k));
      look.copy(LIE_AT).add(_up.set(-0.1, 0.86, -0.42));
    } else {
      // line 8: close on her face from below (from beside him), pushing slowly in as she grieves,
      // warms and steels herself
      const k = ease(clamp(u / (T.power - T.cry)));
      eye.set(0.15 - 0.05 * k, 1.45 + 0.15 * k, FACE.z + 1.95 - 0.45 * k);
      look.copy(FACE).add(_up.set(0, -0.05, 0));
    }
    if (shot !== 1 && shot !== 4) cam.up.set(0, 1, 0);
    // hand-held
    eye.x += Math.sin(t * 0.7) * 0.01 + Math.sin(t * 1.9) * 0.003;
    eye.y += Math.sin(t * 0.9 + 1) * 0.008;
    cam.position.copy(eye);
    cam.lookAt(look);
    cam.updateMatrixWorld();
  }

  // ------------------------------------------------------------------ the picture
  // The picture: their room (lines 6 and 7), then the sea (9), then the lab (10), each through the
  // confrontation's look; black between, or while a picture is not loaded
  _draw(renderer, t, black, dt = 0) {
    const conf = this.conf, T = this.T;
    renderer.getDrawingBufferSize(this._size);
    const w = Math.max(16, Math.round(this._size.x * RENDER_SCALE)), h = Math.max(16, Math.round(this._size.y * RENDER_SCALE));
    if (conf.target.width !== w || conf.target.height !== h) {
      conf.target.setSize(w, h);
      conf.camera.aspect = w / h;
      conf.camera.updateProjectionMatrix();
    }
    // (line 8's montage: if it is not loaded, the room stays, her face resolved)
    const montage = t >= T.power && t < T.end && this.power.ready;
    const shot = montage ? this.power : t < T.end ? null : t >= T.fam0 ? this.chair : t >= T.lab0 ? this.lab : t >= T.sea0 ? this.subs : undefined;
    if (shot === undefined || (shot && !shot.ready) || black >= 1) return this._black(renderer);
    // (its film goes straight to the screen: see chair-shot.js)
    if (shot === this.chair) return shot.draw(renderer, t - T.fam0, black);
    if (shot) {
      const from = shot === this.power ? T.power : shot === this.lab ? T.lab0 : T.sea0;
      shot.draw(renderer, conf.target, t - from, Math.min(dt, 0.05));
    } else {
      conf.aria.head.render(renderer);
      renderer.setRenderTarget(conf.target);
      renderer.render(conf.scene, conf.camera);
    }
    renderer.setRenderTarget(null);
    const u = conf.post.material.uniforms;
    u.tScene.value = conf.target.texture;
    u.uTime.value = t;
    u.uAspect.value = conf.camera.aspect;
    u.uBlack.value = black;
    u.uCold.value = 0;
    renderer.render(conf.postScene, conf.postCam);
  }

  _subtitles(t) {
    if (!this.sub) return;
    const T = this.T;
    const line = this._skip ? null : LINES_C.find((l, i) => {
      const n = [T.n6, T.n7, T.n8, T.n9, T.n10, T.n4, T.n11a, T.n11b][i];
      return t >= n[0] && t <= n[1] + 0.35;
    });
    if (line) {
      const text = line.text;
      if (this.subText.textContent !== text) {
        this.subText.textContent = text;
        this.subText.style.fontStyle = 'italic';
        this.subWho.textContent = '';
      }
      this.sub.style.opacity = 1;
    } else {
      this.sub.style.opacity = 0;
    }
  }

  // ------------------------------------------------------------------ sound
  _startSound() {
    const ac = this.conf.ac;
    if (!ac) return;
    ac.resume?.().catch(() => {});
    const at = ac.currentTime + 0.08;
    this._t0 = at;
    this._sources = [];
    const bus = (this._bus = voiceBus(ac, ac.destination, settings.get('voice')));
    for (const l of LINES_C) {
      const buffer = this.buffers.get(l.id);
      if (!buffer) continue;
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const g = ac.createGain();
      g.gain.value = dbGain(GAIN_DB[l.id] || 0);
      src.connect(g).connect(bus.input);
      const when = at + { 'c-n6': this.T.n6, 'c-n7': this.T.n7, 'c-n8': this.T.n8, 'c-n9': this.T.n9, 'c-n10': this.T.n10, 'c-n4': this.T.n4, 'c-n11a': this.T.n11a, 'c-n11b': this.T.n11b }[l.id][0];
      if (l.id === 'c-n11a') src.start(when, 0, this._split11[0] + 0.05);
      else if (l.id === 'c-n11b') src.start(when, Math.max(0, this._split11[1] - 0.05));
      else src.start(when);
      this._sources.push(src);
    }
    this._ambience(ac, at);
    // the murmur: their talk and laughter, low-passed until no words survive; up with the picture,
    // down under the close. (It runs past its own end: looped, crossfaded from its middle.)
    if (this.walla) {
      const out = (this._wallaOut = ac.createGain());
      out.gain.value = 0;
      out.connect(ac.destination);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = WALLA_LOWPASS;
      lp.Q.value = 0.5;
      lp.connect(out);
      const vol = dbGain(WALLA_DB) * settings.get('effects');
      const n0 = at + this.T.n6[0];
      out.gain.setValueAtTime(0, at);
      out.gain.linearRampToValueAtTime(vol, n0 + 1.2);
      out.gain.setValueAtTime(vol, at + this.T.close - 0.5);
      out.gain.linearRampToValueAtTime(vol * 0.45, at + this.T.close + 1.0);
      // (thinning out under line 7, and gone with him)
      out.gain.setValueAtTime(vol * 0.45, at + this.T.n7[0]);
      out.gain.linearRampToValueAtTime(0, at + this.T.gone - 0.2);
      const xf = 1.0;
      const first = ac.createBufferSource();
      first.buffer = this.walla;
      const g1 = ac.createGain();
      first.connect(g1).connect(lp);
      const loopAt = at + WALLA_TALK_END;                // (its last seconds are silence)
      g1.gain.setValueAtTime(1, loopAt - xf);
      g1.gain.linearRampToValueAtTime(0, loopAt);
      first.start(at);
      const second = ac.createBufferSource();
      second.buffer = this.walla;
      const g2 = ac.createGain();
      g2.gain.value = 0;
      second.connect(g2).connect(lp);
      g2.gain.setValueAtTime(0, loopAt - xf);
      g2.gain.linearRampToValueAtTime(1, loopAt);
      second.start(loopAt - xf, WALLA_LOOP_FROM);
      this._sources.push(first, second);
    }
    // her last giggle, unanswered: muffled, quiet
    if (this.giggle) {
      const src = ac.createBufferSource();
      src.buffer = this.giggle;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = WALLA_LOWPASS * 1.6;
      const g = ac.createGain();
      const when = at + this.T.giggle, len = this._giggleLen || 0.8;
      g.gain.setValueAtTime(dbGain(GIGGLE_DB) * settings.get('voice'), when);
      g.gain.setValueAtTime(dbGain(GIGGLE_DB) * settings.get('voice'), when + len - 0.15);
      g.gain.linearRampToValueAtTime(0.0001, when + len);
      src.connect(lp).connect(g).connect(ac.destination);
      src.start(when, this._giggleAt || 0, len + 0.05);
      this._giggleOut = g;
      this._sources.push(src);
    }
  }

  // Lines 9 and 10's sound: in the sea, the thrusters' deep hum and the bubbles through the water,
  // up with the picture and down into the dip; in the lab, its machines humming, and the pages as
  // the folder is shown
  _ambience(ac, at) {
    const T = this.T, sfx = this.sfx || {};
    const out = (this._ambOut = ac.createGain());
    out.connect(ac.destination);
    const vol = settings.get('effects');
    const play = (key, from, to, { lowpass = 0, rise = 1.5, fall = 0.8, loop = true } = {}) => {
      const buffer = sfx[key];
      if (!buffer) return;
      const [, db, rate] = SFX[key];
      const src = ac.createBufferSource();
      src.buffer = buffer;
      src.loop = loop;
      src.playbackRate.value = rate;
      const g = ac.createGain();
      const v = dbGain(db) * vol;
      g.gain.setValueAtTime(0, at + from);
      g.gain.linearRampToValueAtTime(v, at + from + rise);
      g.gain.setValueAtTime(v, at + to - fall);
      g.gain.linearRampToValueAtTime(0, at + to);
      let node = src;
      if (lowpass) {
        const lp = ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = lowpass;
        node = node.connect(lp);
      }
      node.connect(g).connect(out);
      src.start(at + from);
      src.stop(at + to + 0.1);
      this._sources.push(src);
    };
    this._play = play;
    play('thruster', T.sea0, T.seaOut + DIP_OUT, { lowpass: SEA_LOWPASS, rise: FADE_IN_9 });
    play('bubbles', T.sea0, T.seaOut + DIP_OUT, { lowpass: SEA_LOWPASS * 2, rise: FADE_IN_9 });
    play('hum', T.lab0, T.labEnd, { rise: DIP_IN, fall: FADE_OUT });
    play('paper', T.lab0 + this.lab.cuts[0] - 0.15, T.lab0 + this.lab.cuts[0] + 1.6, { rise: 0.02, fall: 0.3, loop: false });
    // each photo, softly, as she takes it
    for (const at_ of FILM.flips) play('paper', T.chair + at_, T.chair + at_ + 0.9, { rise: 0.05, fall: 0.4, loop: false });
    // the music box from the prologue, soft, out of the line's end and away with the picture
    const music = (this._musicOut = ac.createGain());
    const musicVol = dbGain(MUSIC_DB) * settings.get('music');
    music.gain.setValueAtTime(0, at);
    music.gain.setValueAtTime(0, at + T.chair);
    music.gain.linearRampToValueAtTime(musicVol, at + T.chair + 3);
    music.gain.setValueAtTime(musicVol, at + T.heroOut);
    music.gain.linearRampToValueAtTime(0, at + T.heroOut + FADE_11 + 0.4);
    music.connect(ac.destination);
    // (started when the film starts: its notes are timed from the moment it is called)
    this._musicAt = T.chair;
  }

  // Line 8's montage sound, set going just before it (it may still have been loading at the start):
  // the rush across the atrium, a click as each screen dies, the lab humming
  _powerSound() {
    const T = this.T, p = T.power, [, control, lift, labScreen, lab] = POWER.places;
    this._play('rush', p + 0.25, p + 1.9, { rise: 0.15, fall: 0.5, loop: false });
    for (const at of [0.35, 0.95, 1.4, control.off, lift.off, labScreen.off]) this._play('click', p + at, p + at + 0.6, { rise: 0.01, fall: 0.2, loop: false });
    this._play('hum', p + lab.from, T.end, { rise: 0.6, fall: FADE_OUT });
  }

  _stopSound(fade = 0.3) {
    const ac = this.conf.ac;
    if (!ac) return;
    const now = ac.currentTime;
    for (const o of [this._wallaOut, this._ambOut, this._musicOut]) {
      if (!o) continue;
      o.gain.cancelScheduledValues(now);
      o.gain.setValueAtTime(o.gain.value, now);
      o.gain.linearRampToValueAtTime(0, now + fade);
    }
    if (this._bus) {
      this._bus.output.gain.setValueAtTime(this._bus.output.gain.value, now);
      this._bus.output.gain.linearRampToValueAtTime(0, now + fade);
    }
    for (const s of this._sources || []) { try { s.stop(now + fade + 0.05); } catch { /* not started */ } }
  }

  // ------------------------------------------------------------------ cleanup
  dispose() {
    this.running = false;
    window.removeEventListener('keydown', this._onKey);
    this._stopSound(0.05);
    this._poseHook?.();
    const a = this.conf.actor;
    a?.reach('R', null, { fade: 0.001 });
    a?.reach('L', null, { fade: 0.001 });
    this.conf.camera?.up.set(0, 1, 0);
    for (const [l, i, c] of this._lit || []) {
      l.intensity = i;
      l.color.setHex(c);
    }
    this.subs?.dispose();
    this.power?.dispose();
    this.lab?.dispose();
    this.chair?.dispose();
    setTimeout(() => {
      try { this._bus?.output.disconnect(); } catch { /* gone */ }
      try { this._wallaOut?.disconnect(); } catch { /* gone */ }
      try { this._ambOut?.disconnect(); } catch { /* gone */ }
      try { this._musicOut?.disconnect(); } catch { /* gone */ }
    }, 400);
  }
}

function blank() {
  return { wrist: new THREE.Vector3(), fingers: new THREE.Vector3(), palm: new THREE.Vector3(), pole: new THREE.Vector3(), curl: [0, 0, 0], thumb: [0, 0, 0] };
}
